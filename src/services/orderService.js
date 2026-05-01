const db = require('../config/db');
const LogService = require('./logService');

/** Frete por defeito (€) em criação manual com entrega. `.env`: DEFAULT_SHIPPING_FEE_EUR */
function defaultShippingFeeEur() {
  const raw = process.env.DEFAULT_SHIPPING_FEE_EUR;
  if (raw == null || String(raw).trim() === '') return 5;
  const n = Number(String(raw).trim().replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return 5;
  return n;
}

/** Lista pedidos com JOIN a clientes (morada combinada migrações antigas ↔ snapshot em `orders`). */
async function queryOrdersJoinedCustomer(whereSql, params = []) {
  const head = `
      SELECT o.id, o.customer_id, o.total_amount, o.status, o.origin, o.payment_method, o.created_at,
             o.is_delivery, o.shipping_fee, o.customer_notes,
             c.full_name, c.whatsapp_number, c.email,
  `;
  const tail = `
        FROM orders o
        LEFT JOIN customers c ON o.customer_id = c.id
       ${whereSql}`;
  const headNoCustomerNotes = `
      SELECT o.id, o.customer_id, o.total_amount, o.status, o.origin, o.payment_method, o.created_at,
             o.is_delivery, o.shipping_fee, NULL::text AS customer_notes,
             c.full_name, c.whatsapp_number, c.email,
  `;
  try {
    const { rows } = await db.query(
      `${head} COALESCE(o.delivery_address, c.address) AS address ${tail}`,
      params,
    );
    return rows;
  } catch (err) {
    const msg = String(err?.message || '');
    if (err?.code === '42703' && msg.includes('customer_notes')) {
      try {
        const { rows } = await db.query(
          `${headNoCustomerNotes} COALESCE(o.delivery_address, c.address) AS address ${tail}`,
          params,
        );
        return rows;
      } catch (err2) {
        const msg2 = String(err2?.message || '');
        if (err2?.code === '42703' && msg2.includes('delivery_address')) {
          const { rows } = await db.query(
            `${headNoCustomerNotes} c.address AS address ${tail}`,
            params,
          );
          return rows;
        }
        throw err2;
      }
    }
    if (err?.code === '42703' && msg.includes('delivery_address')) {
      try {
        const { rows } = await db.query(
          `${head} c.address AS address ${tail}`,
          params,
        );
        return rows;
      } catch (err2) {
        const msg2 = String(err2?.message || '');
        if (err2?.code === '42703' && msg2.includes('customer_notes')) {
          const { rows } = await db.query(
            `${headNoCustomerNotes} c.address AS address ${tail}`,
            params,
          );
          return rows;
        }
        throw err2;
      }
    }
    throw err;
  }
}

class OrderService {
  // -------------------------------------------------------------
  // Helper: anexa items[] aos pedidos já consultados
  // -------------------------------------------------------------
  async _attachItems(rows) {
    if (!rows.length) return rows;
    const ids = rows.map(r => r.id);
    const { rows: items } = await db.query(
      `SELECT oi.order_id, oi.id, oi.variant_id, oi.sku, oi.quantity, oi.unit_price,
              p.name AS product_name, v.color, v.size, v.stock_quantity
         FROM order_items oi
         LEFT JOIN product_variants v ON v.id = oi.variant_id OR v.sku = oi.sku
         LEFT JOIN products p ON p.id = v.product_id
        WHERE oi.order_id = ANY($1::int[])
        ORDER BY oi.id ASC`,
      [ids]
    );
    const grouped = items.reduce((acc, it) => {
      (acc[it.order_id] = acc[it.order_id] || []).push(it);
      return acc;
    }, {});
    return rows.map(r => ({ ...r, items: grouped[r.id] || [] }));
  }

  // -------------------------------------------------------------
  // Pedidos pendentes (origem WhatsApp / IA)
  // -------------------------------------------------------------
  async getPendingOrders() {
    const rows = await queryOrdersJoinedCustomer(
      `WHERE o.status = 'aguardando_pagamento'
       ORDER BY o.created_at DESC`,
    );
    return this._attachItems(rows);
  }

  // -------------------------------------------------------------
  // Histórico Geral (últimos 200)
  // -------------------------------------------------------------
  async getOrderHistory() {
    const rows = await queryOrdersJoinedCustomer(
      `ORDER BY o.created_at DESC
       LIMIT 200`,
    );
    return this._attachItems(rows);
  }

  // -------------------------------------------------------------
  // Detalhe de um pedido
  // -------------------------------------------------------------
  async getOrderById(id) {
    let rows;
    try {
      ({ rows } = await db.query(`
      SELECT o.*, c.full_name, c.whatsapp_number, c.email,
             COALESCE(o.delivery_address, c.address) AS address
        FROM orders o
        LEFT JOIN customers c ON o.customer_id = c.id
       WHERE o.id = $1
    `, [id]));
    } catch (err) {
      const msg = String(err?.message || '');
      if (err?.code === '42703' && msg.includes('delivery_address')) {
        ({ rows } = await db.query(`
      SELECT o.*, c.full_name, c.whatsapp_number, c.email,
             c.address AS address
        FROM orders o
        LEFT JOIN customers c ON o.customer_id = c.id
       WHERE o.id = $1
    `, [id]));
      } else {
        throw err;
      }
    }
    if (!rows[0]) return null;
    const [withItems] = await this._attachItems(rows);
    return withItems;
  }

  // -------------------------------------------------------------
  // PDV / Loja Física: criar pedido
  //   ⚠ NOVA REGRA (Opção B): stock é SEMPRE deduzido na criação,
  //   independentemente do status (pago / aguardando_pagamento).
  //   Isto evita oversell quando o PDV vende o último item enquanto
  //   há pedido pendente do bot a aguardar confirmação.
  //   - Cancelar / Eliminar devolvem stock.
  //   - Confirmar pagamento APENAS muda o status (não toca stock).
  // -------------------------------------------------------------
  async createManualOrder(data) {
    const {
      customer_id = null,
      items = [],
      total_amount,
      payment_method = 'dinheiro',
      status = 'pago',
      origin = 'loja_fisica',
      is_delivery = false,
      shipping_fee = defaultShippingFeeEur(),
    } = data;

    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('Pedido precisa de pelo menos um item.');
    }
    if (!['pago', 'aguardando_pagamento'].includes(status)) {
      throw new Error('Status inicial inválido (use pago ou aguardando_pagamento).');
    }


    // Define shipping_fee conforme regra
    const rawShippingFee = String(shipping_fee).replace(',', '.');
    const parsedShippingFee = Number(rawShippingFee);
    const finalShippingFee = is_delivery
      ? (Number.isFinite(parsedShippingFee) ? parsedShippingFee : defaultShippingFeeEur())
      : 0;

    console.log(`[orderService] createManualOrder → status=${status} | items=${items.length} | customer_id=${customer_id ?? '∅'} | stock SEMPRE deduzido | is_delivery=${is_delivery} | shipping_fee=${finalShippingFee}`);

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      let computedTotal = Number(total_amount);
      if (!computedTotal || Number.isNaN(computedTotal)) {
        computedTotal = items.reduce(
          (acc, i) => acc + Number(i.unit_price || 0) * Number(i.quantity || 0),
          0
        );
      }

      const orderRes = await client.query(
        `INSERT INTO orders (customer_id, total_amount, status, origin, payment_method, is_delivery, shipping_fee)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [customer_id, computedTotal, status, origin, payment_method, is_delivery, finalShippingFee]
      );
      const orderId = orderRes.rows[0].id;

      for (const item of items) {
        const qty = parseInt(item.quantity, 10);
        if (!qty || qty <= 0) throw new Error(`Quantidade inválida para SKU ${item.sku}`);

        // Sempre deduz — bloqueia oversell de imediato
        const stockUpdate = await client.query(
          `UPDATE product_variants
              SET stock_quantity = stock_quantity - $1
            WHERE sku = $2 AND stock_quantity >= $1
            RETURNING id`,
          [qty, item.sku]
        );
        if (stockUpdate.rowCount === 0) {
          throw new Error(`Stock insuficiente para SKU: ${item.sku}`);
        }
        const variantId = stockUpdate.rows[0].id;

        await client.query(
          `INSERT INTO order_items (order_id, variant_id, sku, quantity, unit_price)
           VALUES ($1, $2, $3, $4, $5)`,
          [orderId, variantId, item.sku, qty, item.unit_price ?? null]
        );
      }

      // total_orders só conta quando o pedido se torna efectivamente pago
      if (status === 'pago' && customer_id) {
        await client.query(
          `UPDATE customers SET total_orders = total_orders + 1 WHERE id = $1`,
          [customer_id]
        );
      }

      await client.query('COMMIT');
      await LogService.register('system', 'order_created', {
        orderId, customer_id, total: computedTotal, origin, status,
        items: items.length, stock_deducted: true,
      });
      return { success: true, orderId, total_amount: computedTotal, status, is_delivery, shipping_fee: finalShippingFee };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // -------------------------------------------------------------
  // Confirmar pagamento de pedido pendente (WhatsApp/IA)
  //   ⚠ NOVA REGRA (Opção B): stock NÃO é deduzido aqui — já foi na
  //   criação. Esta operação só muda o status para 'pago'.
  //   - Excepção: se vier overrideItems (n8n não gravou items), esses
  //     items são novos e PRECISAM de deduzir stock agora.
  // -------------------------------------------------------------
  async confirmPayment(orderId, overrideItems = null, shippingFee = null) {
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const orderRes = await client.query(
        `SELECT id, customer_id, status, is_delivery, shipping_fee FROM orders WHERE id = $1 FOR UPDATE`,
        [orderId]
      );
      if (!orderRes.rows[0]) throw new Error('Pedido não encontrado.');
      const order = orderRes.rows[0];
      if (order.status === 'pago') throw new Error('Pedido já está pago.');
      if (order.status === 'cancelado') throw new Error('Pedido cancelado não pode ser confirmado.');

      const finalShippingFee = order.is_delivery
        ? (() => {
            if (shippingFee !== null && shippingFee !== undefined) {
              const raw = String(shippingFee).replace(',', '.');
              const parsed = Number(raw);
              return Number.isFinite(parsed) ? parsed : Number(order.shipping_fee || 0);
            }
            return Number(order.shipping_fee || 0);
          })()
        : 0;

      const isOverride = Array.isArray(overrideItems) && overrideItems.length > 0;

      if (isOverride) {
        // Items NOVOS (n8n não inseriu) — DEDUZ stock destes
        await client.query(`DELETE FROM order_items WHERE order_id = $1`, [orderId]);
        let recomputedTotal = 0;
        for (const it of overrideItems) {
          const qty = parseInt(it.quantity, 10);
          if (!qty || qty <= 0) throw new Error(`Quantidade inválida para SKU ${it.sku}`);
          const upd = await client.query(
            `UPDATE product_variants
                SET stock_quantity = stock_quantity - $1
              WHERE sku = $2 AND stock_quantity >= $1
              RETURNING id`,
            [qty, it.sku]
          );
          if (upd.rowCount === 0) throw new Error(`Stock insuficiente para SKU: ${it.sku}`);
          await client.query(
            `INSERT INTO order_items (order_id, variant_id, sku, quantity, unit_price)
             VALUES ($1, $2, $3, $4, $5)`,
            [orderId, upd.rows[0].id, it.sku, qty, it.unit_price ?? null]
          );
          recomputedTotal += Number(it.unit_price || 0) * qty;
        }
        const finalTotal = recomputedTotal + finalShippingFee;
        await client.query(
          `UPDATE orders SET total_amount = $1, shipping_fee = $2 WHERE id = $3`,
          [finalTotal, finalShippingFee, orderId]
        );
        console.log(`[orderService] confirmPayment#${orderId} → override: ${overrideItems.length} items NOVOS, stock deduzido, total_amount recalculado = ${finalTotal.toFixed(2)}, shipping_fee = ${finalShippingFee.toFixed(2)}`);
      } else {
        const { rows: items } = await client.query(
          `SELECT quantity, unit_price FROM order_items WHERE order_id = $1`,
          [orderId]
        );
        if (items.length === 0) {
          throw new Error('Pedido sem itens. Use "Adicionar Itens" antes de confirmar.');
        }

        const itemsTotal = items.reduce(
          (acc, it) => acc + Number(it.unit_price || 0) * Number(it.quantity || 0),
          0
        );
        const finalTotal = itemsTotal + finalShippingFee;
        await client.query(
          `UPDATE orders SET total_amount = $1, shipping_fee = $2 WHERE id = $3`,
          [finalTotal, finalShippingFee, orderId]
        );
        console.log(`[orderService] confirmPayment#${orderId} → status → pago (stock JÁ tinha sido deduzido na criação) | total_amount = ${finalTotal.toFixed(2)}, shipping_fee = ${finalShippingFee.toFixed(2)}`);
      }

      await client.query(`UPDATE orders SET status = 'pago' WHERE id = $1`, [orderId]);

      if (order.customer_id) {
        await client.query(
          `UPDATE customers SET total_orders = total_orders + 1 WHERE id = $1`,
          [order.customer_id]
        );
      }

      await client.query('COMMIT');
      await LogService.register('system', 'payment_confirmed', { orderId, override: isOverride, shipping_fee: finalShippingFee });
      return { success: true, orderId };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // -------------------------------------------------------------
  // Guardar frete em pedido pendente (sem confirmar pagamento)
  // -------------------------------------------------------------
  async updatePendingShippingFee(orderId, shippingFee) {
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const orderRes = await client.query(
        `SELECT id, status, origin, is_delivery FROM orders WHERE id = $1 FOR UPDATE`,
        [orderId]
      );
      if (!orderRes.rows[0]) throw new Error('Pedido não encontrado.');
      const order = orderRes.rows[0];
      if (order.status !== 'aguardando_pagamento') {
        throw new Error('Só pedidos pendentes permitem alterar o frete.');
      }

      const raw = String(shippingFee).replace(',', '.');
      const fee = Number(raw);
      if (!Number.isFinite(fee) || fee < 0) throw new Error('Valor de frete inválido.');

      const { rows: items } = await client.query(
        `SELECT quantity, unit_price FROM order_items WHERE order_id = $1`,
        [orderId]
      );
      if (items.length === 0) throw new Error('Pedido sem itens.');

      const itemsTotal = items.reduce(
        (acc, it) => acc + Number(it.unit_price || 0) * Number(it.quantity || 0),
        0
      );
      const finalTotal = itemsTotal + fee;

      // Pedidos WhatsApp podem chegar sem is_delivery — ao gravar frete, marca como entrega.
      const shouldFlagDelivery = !order.is_delivery && fee > 0;

      await client.query(
        shouldFlagDelivery
          ? `UPDATE orders SET total_amount = $1, shipping_fee = $2, is_delivery = TRUE WHERE id = $3`
          : `UPDATE orders SET total_amount = $1, shipping_fee = $2 WHERE id = $3`,
        [finalTotal, fee, orderId]
      );

      await client.query('COMMIT');
      await LogService.register('system', 'shipping_fee_updated', {
        orderId, shipping_fee: fee, total_amount: finalTotal, flagged_delivery: shouldFlagDelivery,
      });
      return { success: true, orderId, shipping_fee: fee, total_amount: finalTotal };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // -------------------------------------------------------------
  // Cancelar pedido pendente
  //   ⚠ NOVA REGRA (Opção B): devolve stock (porque foi deduzido na criação).
  // -------------------------------------------------------------
  async cancelOrder(orderId) {
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const orderRes = await client.query(
        `SELECT id, status FROM orders WHERE id = $1 FOR UPDATE`,
        [orderId]
      );
      if (!orderRes.rows[0]) throw new Error('Pedido não encontrado.');
      if (orderRes.rows[0].status !== 'aguardando_pagamento') {
        throw new Error('Pedido não está pendente.');
      }

      const { rows: items } = await client.query(
        `SELECT sku, quantity FROM order_items WHERE order_id = $1`,
        [orderId]
      );
      for (const it of items) {
        await client.query(
          `UPDATE product_variants
              SET stock_quantity = stock_quantity + $1
            WHERE sku = $2`,
          [it.quantity, it.sku]
        );
      }

      await client.query(
        `UPDATE orders SET status = 'cancelado' WHERE id = $1`,
        [orderId]
      );

      await client.query('COMMIT');
      await LogService.register('system', 'order_cancelled', { orderId, stockRestored: items.length });
      console.log(`[orderService] cancelOrder#${orderId} → stock devolvido para ${items.length} items`);
      return { success: true, orderId, stockRestored: items.length };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // -------------------------------------------------------------
  // Marcar pedido como ENVIADO (placeholder CTT)
  //   Apenas pedidos 'pago' podem ser enviados.
  // -------------------------------------------------------------
  async markAsShipped(orderId, trackingCode = null) {
    const { rows } = await db.query(
      `UPDATE orders SET status = 'enviado'
        WHERE id = $1 AND status = 'pago'
        RETURNING id`,
      [orderId]
    );
    if (!rows[0]) throw new Error('Apenas pedidos pagos podem ser enviados.');
    await LogService.register('system', 'order_shipped_ctt', { orderId, trackingCode });
    return { success: true, orderId, trackingCode };
  }

  // -------------------------------------------------------------
  // Eliminar pedido (com rollback de stock)
  //   ⚠ NOVA REGRA (Opção B): qualquer status excepto 'cancelado'
  //   teve stock deduzido — todos devolvem.
  //   ('cancelado' já devolveu stock no cancelOrder.)
  // -------------------------------------------------------------
  async deleteOrder(orderId) {
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const orderRes = await client.query(
        `SELECT id, customer_id, status FROM orders WHERE id = $1 FOR UPDATE`,
        [orderId]
      );
      if (!orderRes.rows[0]) {
        await client.query('ROLLBACK');
        throw new Error('Pedido não encontrado.');
      }
      const order = orderRes.rows[0];
      const stockWasDeducted = order.status !== 'cancelado';
      const wasPaid = ['pago', 'enviado', 'entregue'].includes(order.status);

      if (stockWasDeducted) {
        const { rows: items } = await client.query(
          `SELECT sku, quantity FROM order_items WHERE order_id = $1`,
          [orderId]
        );
        for (const it of items) {
          await client.query(
            `UPDATE product_variants
                SET stock_quantity = stock_quantity + $1
              WHERE sku = $2`,
            [it.quantity, it.sku]
          );
        }
        // Reverte contador do cliente apenas se efectivamente foi contabilizado
        if (wasPaid && order.customer_id) {
          await client.query(
            `UPDATE customers SET total_orders = GREATEST(total_orders - 1, 0) WHERE id = $1`,
            [order.customer_id]
          );
        }
      }

      await client.query(`DELETE FROM orders WHERE id = $1`, [orderId]);
      await client.query('COMMIT');
      await LogService.register('system', 'order_deleted', {
        orderId, previousStatus: order.status, stockRestored: stockWasDeducted,
      });
      return { success: true, orderId, stockRestored: stockWasDeducted };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = new OrderService();
