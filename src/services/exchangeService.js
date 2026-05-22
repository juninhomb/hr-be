const db = require('../config/db');
const LogService = require('./logService');

const ELIGIBLE_PARENT_STATUSES = new Set(['pago', 'expedido', 'enviado', 'entregue']);
const ALLOWED_PAYMENT_METHODS = new Set(['dinheiro', 'stripe', 'a_definir']);

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

/**
 * Soma quantidades já devolvidas em trocas anteriores deste pedido original,
 * agrupadas por SKU. Lê do JSONB `returned_items` das ordens com
 * `parent_order_id = parentId`.
 */
async function alreadyReturnedBySku(client, parentId) {
  const { rows } = await client.query(
    `SELECT (item->>'sku')::text AS sku,
            COALESCE(SUM((item->>'quantity')::int), 0) AS qty
       FROM orders o,
            LATERAL jsonb_array_elements(COALESCE(o.returned_items, '[]'::jsonb)) AS item
      WHERE o.parent_order_id = $1
        AND o.status <> 'cancelado'
      GROUP BY (item->>'sku')::text`,
    [parentId],
  );
  const m = new Map();
  for (const r of rows) m.set(r.sku, Number(r.qty) || 0);
  return m;
}

/**
 * Cria uma TROCA (origin='troca') ligada a um pedido original.
 *
 * Lógica atómica (transação):
 *  1. Lock FOR UPDATE no pedido original
 *  2. Valida status do original ∈ {pago, expedido, enviado, entregue}
 *  3. Recusa se original.origin === 'troca' (sem trocas de trocas)
 *  4. Para cada SKU devolvido: valida `qty <= comprada − já_devolvida`
 *     e usa o snapshot do `order_items.unit_price` original
 *  5. Para cada SKU novo: deduz stock atomicamente, lê preço da variante
 *  6. Calcula diff = sum(novos) - sum(devolvidos)
 *     - diff < 0 → rejeita (Phase 1)
 *  7. Restaura stock dos devolvidos
 *  8. Insere nova `orders` com origin='troca', parent_order_id, returned_items
 *     - status:
 *         dinheiro / a_definir + diff > 0  → 'aguardando_pagamento'
 *         dinheiro            + diff = 0  → 'pago' (swap directo)
 *         stripe              + diff > 0  → 'aguardando_pagamento'
 *         stripe              + diff = 0  → 'pago'
 *  9. Insere `order_items` com os novos artigos
 * 10. Log audit `troca_created`
 *
 * Retorna `{ orderId, total_amount, diff, status, ... }`.
 */
async function createExchange({
  original_order_id,
  returned = [],
  new_items = [],
  payment_method = 'dinheiro',
  notes = null,
  admin_user = 'system',
}) {
  if (!original_order_id || !Number.isInteger(Number(original_order_id))) {
    throw new Error('original_order_id é obrigatório.');
  }
  if (!Array.isArray(returned) || returned.length === 0) {
    throw new Error('Indica pelo menos um artigo devolvido.');
  }
  if (!Array.isArray(new_items) || new_items.length === 0) {
    throw new Error('Indica pelo menos um artigo novo para a troca.');
  }
  const paymentNorm = String(payment_method || '').trim().toLowerCase();
  if (!ALLOWED_PAYMENT_METHODS.has(paymentNorm)) {
    throw new Error(`Método de pagamento inválido para troca: ${payment_method}`);
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // 1) Lock no pedido original
    const origRes = await client.query(
      `SELECT id, customer_id, status, origin, is_delivery
         FROM orders
        WHERE id = $1
        FOR UPDATE`,
      [original_order_id],
    );
    const original = origRes.rows[0];
    if (!original) throw new Error('Pedido original não encontrado.');
    if (!ELIGIBLE_PARENT_STATUSES.has(original.status)) {
      throw new Error(
        `Pedido #${original_order_id} está «${original.status}» — só é possível trocar pedidos pagos, expedidos, enviados ou entregues.`,
      );
    }
    if (String(original.origin || '').toLowerCase() === 'troca') {
      throw new Error('Não é possível criar troca de uma troca.');
    }

    // 2) Snapshot dos preços originais (uma linha por SKU/quantity vendida)
    const origItemsRes = await client.query(
      `SELECT id, sku, quantity, unit_price
         FROM order_items
        WHERE order_id = $1`,
      [original_order_id],
    );
    const origBySku = new Map();
    for (const it of origItemsRes.rows) {
      origBySku.set(it.sku, {
        order_item_id: it.id,
        quantity: Number(it.quantity),
        unit_price: Number(it.unit_price),
      });
    }

    // 3) Já devolvido em trocas anteriores
    const prevReturned = await alreadyReturnedBySku(client, original_order_id);

    // 4) Valida cada item devolvido e constrói snapshot
    const returnedSnapshot = [];
    let returnedTotal = 0;
    for (const r of returned) {
      const sku = String(r.sku || '').trim();
      const qty = parseInt(r.quantity, 10);
      if (!sku) throw new Error('SKU devolvido inválido.');
      if (!qty || qty <= 0) throw new Error(`Quantidade inválida para devolução do SKU ${sku}.`);

      const orig = origBySku.get(sku);
      if (!orig) {
        throw new Error(`SKU ${sku} não pertence ao pedido #${original_order_id}.`);
      }
      const alreadyQty = prevReturned.get(sku) || 0;
      const available = orig.quantity - alreadyQty;
      if (qty > available) {
        throw new Error(
          `SKU ${sku}: tentas devolver ${qty} unid., mas só restam ${available} (já devolvidas: ${alreadyQty}).`,
        );
      }

      returnedSnapshot.push({
        sku,
        quantity: qty,
        unit_price: round2(orig.unit_price),
        source_order_item_id: orig.order_item_id,
      });
      returnedTotal += orig.unit_price * qty;
    }
    returnedTotal = round2(returnedTotal);

    // 5) Restaura stock dos devolvidos
    for (const r of returnedSnapshot) {
      await client.query(
        `UPDATE product_variants
            SET stock_quantity = stock_quantity + $1
          WHERE sku = $2`,
        [r.quantity, r.sku],
      );
    }

    // 6) Deduz stock dos novos + calcula total
    const newItemsResolved = [];
    let newItemsTotal = 0;
    for (const it of new_items) {
      const sku = String(it.sku || '').trim();
      const qty = parseInt(it.quantity, 10);
      if (!sku) throw new Error('SKU novo inválido.');
      if (!qty || qty <= 0) throw new Error(`Quantidade inválida para novo SKU ${sku}.`);

      // Atómico: deduz e devolve id + preço actual da variante
      const stockUpdate = await client.query(
        `UPDATE product_variants v
            SET stock_quantity = v.stock_quantity - $1
          WHERE v.sku = $2 AND v.stock_quantity >= $1
          RETURNING v.id, v.product_id`,
        [qty, sku],
      );
      if (stockUpdate.rowCount === 0) {
        throw new Error(`Stock insuficiente para SKU novo: ${sku}`);
      }
      const { id: variantId, product_id: productId } = stockUpdate.rows[0];

      // Preço-base do produto (consistente com criação normal)
      const priceRes = await client.query(
        `SELECT base_price FROM products WHERE id = $1`,
        [productId],
      );
      const unit = Number(priceRes.rows[0]?.base_price || 0);
      newItemsResolved.push({ sku, quantity: qty, unit_price: round2(unit), variant_id: variantId });
      newItemsTotal += unit * qty;
    }
    newItemsTotal = round2(newItemsTotal);

    // 7) Diferença
    const diff = round2(newItemsTotal - returnedTotal);
    if (diff < 0) {
      throw new Error(
        `Diferença negativa (€${Math.abs(diff).toFixed(2)}) — reembolso não suportado, gerir manualmente.`,
      );
    }

    // 8) Determina status inicial
    //    diff = 0 → pago directo (swap)
    //    diff > 0 + dinheiro → pago (cliente paga em dinheiro no momento)
    //    diff > 0 + stripe   → aguardando_pagamento (gera sessão depois)
    //    diff > 0 + a_definir → aguardando_pagamento
    let status;
    if (diff === 0) status = 'pago';
    else if (paymentNorm === 'dinheiro') status = 'pago';
    else status = 'aguardando_pagamento';

    // 9) Cria pedido-troca
    const trocaRes = await client.query(
      `INSERT INTO orders (
          customer_id, total_amount, status, origin, payment_method,
          is_delivery, shipping_fee, parent_order_id, returned_items
        )
        VALUES ($1, $2, $3, 'troca', $4, false, 0, $5, $6::jsonb)
        RETURNING id`,
      [
        original.customer_id,
        diff,
        status,
        paymentNorm,
        original_order_id,
        JSON.stringify(returnedSnapshot),
      ],
    );
    const trocaId = trocaRes.rows[0].id;

    // 10) Insere order_items dos novos artigos
    for (const ni of newItemsResolved) {
      await client.query(
        `INSERT INTO order_items (order_id, variant_id, sku, quantity, unit_price)
         VALUES ($1, $2, $3, $4, $5)`,
        [trocaId, ni.variant_id, ni.sku, ni.quantity, ni.unit_price],
      );
    }

    // 11) Conta para o cliente apenas quando fica pago de imediato
    if (status === 'pago' && original.customer_id) {
      await client.query(
        `UPDATE customers SET total_orders = total_orders + 1 WHERE id = $1`,
        [original.customer_id],
      );
    }

    await client.query('COMMIT');

    await LogService.register(admin_user || 'system', 'troca_created', {
      trocaOrderId: trocaId,
      originalOrderId: original_order_id,
      diff,
      returnedTotal,
      newItemsTotal,
      returnedItems: returnedSnapshot.length,
      newItems: newItemsResolved.length,
      payment_method: paymentNorm,
      status,
      notes: notes ? String(notes).slice(0, 500) : null,
    });

    return {
      success: true,
      orderId: trocaId,
      parent_order_id: original_order_id,
      total_amount: diff,
      diff,
      returned_total: returnedTotal,
      new_items_total: newItemsTotal,
      status,
      payment_method: paymentNorm,
      returned_items: returnedSnapshot,
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Devolve o resumo cumulativo de SKUs já devolvidos para um pedido — útil ao FE. */
async function getReturnedSummary(parentId) {
  const client = await db.connect();
  try {
    const m = await alreadyReturnedBySku(client, parentId);
    const out = {};
    for (const [sku, qty] of m.entries()) out[sku] = qty;
    return out;
  } finally {
    client.release();
  }
}

module.exports = {
  createExchange,
  getReturnedSummary,
};
