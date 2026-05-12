const db = require('../config/db');
const LogService = require('./logService');
const emailService = require('./emailService');
const { resolveCoupon } = require('../utils/discountCoupons');
const { buildAdminPdvStripeCheckoutUrls } = require('../utils/stripeCheckoutRedirects');
const stripeCheckoutService = require('./stripeCheckoutService');
const {
  canonicalWhatsappNumber,
  nationalNumberDigitsForIntlE164,
} = require('../utils/whatsappNormalize');

function itemsPlusShippingMinusDiscount(itemsTotal, discountAmount, shippingFee) {
  const disc = Math.round(Number(discountAmount || 0) * 100) / 100;
  const itemsNet = Math.round((Number(itemsTotal) - disc) * 100) / 100;
  const ship = Number(shippingFee || 0);
  const finalTotal = Math.round((itemsNet + ship) * 100) / 100;
  return { itemsNet, finalTotal, discountRounded: disc };
}

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
             o.is_delivery, o.shipping_fee, o.customer_notes, o.pickup_ready_notified_at, o.pickup_collected_at,
             c.full_name, c.whatsapp_number, c.email,
  `;
  const tail = `
        FROM orders o
        LEFT JOIN customers c ON o.customer_id = c.id
       ${whereSql}`;
  const headNoCustomerNotes = `
      SELECT o.id, o.customer_id, o.total_amount, o.status, o.origin, o.payment_method, o.created_at,
             o.is_delivery, o.shipping_fee, NULL::text AS customer_notes, o.pickup_ready_notified_at, o.pickup_collected_at,
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

/** Garante JSON/API com `customer_notes` explícito (evita omitir undefined no admin). */
function normalizeCustomerNotesOnOrder(row) {
  if (!row || typeof row !== 'object') return row;
  const v = row.customer_notes;
  const s = v == null ? '' : String(v).trim();
  return { ...row, customer_notes: s === '' ? null : s };
}

class OrderService {
  /**
   * Pré-visualização de cupão no PDV (subtotal = Σ unit_price × qty das linhas enviadas).
   * POST `/api/orders/coupon-quote`
   */
  async couponQuoteForPdv({ code, items }) {
    const trimmed = String(code ?? '').trim();
    if (!trimmed) {
      throw new Error('Indica o código do cupão.');
    }
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('O carrinho está vazio.');
    }
    let itemsSubtotal = 0;
    for (const it of items) {
      const sku = String(it.sku ?? '').trim();
      const qty = parseInt(it.quantity, 10);
      const unit = Number(it.unit_price);
      if (!sku || !qty || qty <= 0 || !Number.isFinite(unit) || unit < 0) {
        throw new Error('Itens inválidos.');
      }
      itemsSubtotal += unit * qty;
    }
    itemsSubtotal = Math.round(itemsSubtotal * 100) / 100;
    const resolved = await resolveCoupon(db, trimmed, itemsSubtotal);
    if (!resolved) {
      throw new Error('Cupão inválido ou indisponível.');
    }
    return {
      ok: true,
      items_subtotal: itemsSubtotal,
      discount_amount: resolved.discountAmount,
      coupon_code: resolved.code,
    };
  }

  /**
   * PDV: gera sessão Stripe Checkout para pedido loja física pendente com payment_method = stripe.
   * POST `/api/orders/:id/stripe-checkout-session`
   */
  async createPdvStripeCheckoutSession(orderId) {
    const id = parseInt(orderId, 10);
    if (!Number.isFinite(id) || id < 1) {
      throw new Error('ID do pedido inválido.');
    }
    stripeCheckoutService.getStripeOrThrow();
    const order = await this.getOrderById(id);
    if (!order) {
      throw new Error('Pedido não encontrado.');
    }
    const origin = String(order.origin || '').trim().toLowerCase();
    if (origin !== 'loja_fisica') {
      throw new Error('Só pedidos da loja física (PDV) podem usar este link Stripe.');
    }
    if (String(order.status) !== 'aguardando_pagamento') {
      throw new Error('O pedido tem de estar pendente de pagamento para gerar o link Stripe.');
    }
    const pm = String(order.payment_method || '').trim().toLowerCase();
    if (pm !== 'stripe') {
      throw new Error('Este pedido não está registado com forma de pagamento Stripe.');
    }
    const { successUrl, cancelUrl } = buildAdminPdvStripeCheckoutUrls();
    const customerEmail = order.email !== null && order.email !== undefined
      ? String(order.email).trim()
      : undefined;
    const session = await stripeCheckoutService.createSessionForOrder({
      orderId: id,
      customerEmail: customerEmail || undefined,
      successUrl,
      cancelUrl,
    });
    if (!session?.url) {
      const err = new Error('Stripe não devolveu URL de checkout.');
      err.status = 502;
      throw err;
    }
    return {
      checkout_url: session.url,
      stripe_session_id: session.id,
      order_id: id,
    };
  }

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
    return rows.map(r => normalizeCustomerNotesOnOrder({ ...r, items: grouped[r.id] || [] }));
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
      total_amount: _clientTotalIgnored,
      payment_method = 'dinheiro',
      status = 'pago',
      origin = 'loja_fisica',
      is_delivery = false,
      shipping_fee = defaultShippingFeeEur(),
      coupon_code: rawCoupon = null,
    } = data;

    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('Pedido precisa de pelo menos um item.');
    }
    if (!['pago', 'aguardando_pagamento'].includes(status)) {
      throw new Error('Status inicial inválido (use pago ou aguardando_pagamento).');
    }

    const paymentNorm = String(payment_method || '').trim().toLowerCase();
    if (paymentNorm === 'stripe' && status !== 'aguardando_pagamento') {
      throw new Error(
        'Com pagamento Stripe, o pedido fica pendente até o cliente pagar online (não uses estado «pago» na criação).',
      );
    }

    // Define shipping_fee conforme regra
    const rawShippingFee = String(shipping_fee).replace(',', '.');
    const parsedShippingFee = Number(rawShippingFee);
    const finalShippingFee = is_delivery
      ? (Number.isFinite(parsedShippingFee) ? parsedShippingFee : defaultShippingFeeEur())
      : 0;

    const couponTrim = String(rawCoupon ?? '').trim();

    console.log(`[orderService] createManualOrder → status=${status} | items=${items.length} | customer_id=${customer_id ?? '∅'} | stock SEMPRE deduzido | is_delivery=${is_delivery} | shipping_fee=${finalShippingFee}${couponTrim ? ` | coupon=${couponTrim}` : ''}`);

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const orderRes = await client.query(
        `INSERT INTO orders (customer_id, total_amount, status, origin, payment_method, is_delivery, shipping_fee)
         VALUES ($1, 0, $2, $3, $4, $5, $6) RETURNING id`,
        [customer_id, status, origin, payment_method, is_delivery, finalShippingFee]
      );
      const orderId = orderRes.rows[0].id;

      let itemsTotal = 0;
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

        const lineUnit = Number(item.unit_price ?? 0);
        await client.query(
          `INSERT INTO order_items (order_id, variant_id, sku, quantity, unit_price)
           VALUES ($1, $2, $3, $4, $5)`,
          [orderId, variantId, item.sku, qty, item.unit_price ?? null]
        );
        itemsTotal += lineUnit * qty;
      }
      itemsTotal = Math.round(itemsTotal * 100) / 100;

      let discountAmount = 0;
      let couponStored = null;
      if (couponTrim) {
        const resolved = await resolveCoupon(client, couponTrim, itemsTotal);
        if (!resolved) {
          throw new Error('Cupão inválido ou indisponível.');
        }
        discountAmount = resolved.discountAmount;
        couponStored = resolved.code;
      }

      const { itemsNet, finalTotal, discountRounded } = itemsPlusShippingMinusDiscount(
        itemsTotal,
        discountAmount,
        finalShippingFee,
      );
      if (itemsNet < 0.01) {
        throw new Error('O desconto não pode anular o valor dos artigos.');
      }

      try {
        await client.query(
          `UPDATE orders
              SET total_amount = $1,
                  coupon_code = $2,
                  discount_amount = $3
            WHERE id = $4`,
          [finalTotal, couponStored, discountRounded, orderId],
        );
      } catch (updErr) {
        const msg = String(updErr?.message || '');
        if (updErr?.code === '42703' && /coupon_code|discount_amount/i.test(msg)) {
          if (discountAmount > 0) {
            throw new Error(
              'Cupões não estão activos na base de dados. Corre a migração '
              + '`database/migrations/2026-05-02_orders_discount_coupon.sql`.',
            );
          }
          await client.query(
            `UPDATE orders SET total_amount = $1 WHERE id = $2`,
            [finalTotal, orderId],
          );
        } else {
          throw updErr;
        }
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
        orderId, customer_id, total: finalTotal, origin, status,
        items: items.length, stock_deducted: true,
        coupon_code: couponStored,
        discount_amount: discountRounded,
      });
      return {
        success: true,
        orderId,
        total_amount: finalTotal,
        status,
        is_delivery,
        shipping_fee: finalShippingFee,
        coupon_code: couponStored,
        discount_amount: discountRounded,
      };
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

      let orderRes;
      try {
        orderRes = await client.query(
          `SELECT id, customer_id, status, is_delivery, shipping_fee,
                  COALESCE(discount_amount, 0) AS discount_amount
             FROM orders WHERE id = $1 FOR UPDATE`,
          [orderId]
        );
      } catch (selErr) {
        const smsg = String(selErr?.message || '');
        if (selErr?.code === '42703' && /discount_amount/i.test(smsg)) {
          orderRes = await client.query(
            `SELECT id, customer_id, status, is_delivery, shipping_fee FROM orders WHERE id = $1 FOR UPDATE`,
            [orderId]
          );
          if (orderRes.rows[0]) orderRes.rows[0].discount_amount = 0;
        } else {
          throw selErr;
        }
      }
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
        try {
          await client.query(
            `UPDATE orders
                SET total_amount = $1,
                    shipping_fee = $2,
                    discount_amount = 0,
                    coupon_code = NULL
              WHERE id = $3`,
            [finalTotal, finalShippingFee, orderId],
          );
        } catch (updErr) {
          const msg = String(updErr?.message || '');
          if (updErr?.code === '42703' && /coupon_code|discount_amount/i.test(msg)) {
            await client.query(
              `UPDATE orders SET total_amount = $1, shipping_fee = $2 WHERE id = $3`,
              [finalTotal, finalShippingFee, orderId],
            );
          } else {
            throw updErr;
          }
        }
        console.log(`[orderService] confirmPayment#${orderId} → override: ${overrideItems.length} items NOVOS, stock deduzido, total_amount recalculado = ${finalTotal.toFixed(2)}, shipping_fee = ${finalShippingFee.toFixed(2)} (cupão limpo)`);
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
        const orderDisc = Number(order.discount_amount || 0);
        const { itemsNet, finalTotal } = itemsPlusShippingMinusDiscount(
          itemsTotal,
          orderDisc,
          finalShippingFee,
        );
        if (itemsNet < 0.01) {
          throw new Error('Total de artigos inválido após desconto.');
        }
        await client.query(
          `UPDATE orders SET total_amount = $1, shipping_fee = $2 WHERE id = $3`,
          [finalTotal, finalShippingFee, orderId]
        );
        console.log(`[orderService] confirmPayment#${orderId} → status → pago (stock JÁ tinha sido deduzido na criação) | total_amount = ${finalTotal.toFixed(2)}, shipping_fee = ${finalShippingFee.toFixed(2)}, desconto = ${orderDisc.toFixed(2)}`);
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
      emailService.scheduleNotifyOrderPaymentConfirmed(orderId);
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

      let orderRes;
      try {
        orderRes = await client.query(
          `SELECT id, status, origin, is_delivery,
                  COALESCE(discount_amount, 0) AS discount_amount
             FROM orders WHERE id = $1 FOR UPDATE`,
          [orderId]
        );
      } catch (selErr) {
        const smsg = String(selErr?.message || '');
        if (selErr?.code === '42703' && /discount_amount/i.test(smsg)) {
          orderRes = await client.query(
            `SELECT id, status, origin, is_delivery FROM orders WHERE id = $1 FOR UPDATE`,
            [orderId]
          );
          if (orderRes.rows[0]) orderRes.rows[0].discount_amount = 0;
        } else {
          throw selErr;
        }
      }
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
      const orderDisc = Number(order.discount_amount || 0);
      const { finalTotal } = itemsPlusShippingMinusDiscount(itemsTotal, orderDisc, fee);
      if (Math.round((itemsTotal - orderDisc) * 100) / 100 < 0.01) {
        throw new Error('Total de artigos inválido após desconto.');
      }

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
  // Expedição: impressão / recibo — pago + entrega → expedido
  // Idempotente se já estiver em expedido.
  // -------------------------------------------------------------
  async markAsExpedited(orderId) {
    const id = parseInt(orderId, 10);
    if (!Number.isFinite(id)) throw new Error('ID inválido.');

    const { rows: up } = await db.query(
      `
      UPDATE orders
         SET status = 'expedido'
       WHERE id = $1
         AND COALESCE(is_delivery, false) = true
         AND status = 'pago'
       RETURNING id`,
      [id],
    );
    if (up[0]) {
      await LogService.register('system', 'order_marked_expedited', { orderId: id });
      return { success: true, orderId: id, status: 'expedido', already: false };
    }

    const { rows: cur } = await db.query(
      `SELECT id, status, COALESCE(is_delivery, false) AS is_delivery FROM orders WHERE id = $1`,
      [id],
    );
    if (!cur[0]) throw new Error('Pedido não encontrado.');
    if (!cur[0].is_delivery) {
      throw new Error('Só pedidos com entrega ao domicílio podem ser marcados como expedidos.');
    }
    if (String(cur[0].status) === 'expedido') {
      return { success: true, orderId: id, status: 'expedido', already: true };
    }
    if (String(cur[0].status) === 'enviado' || String(cur[0].status) === 'entregue') {
      throw new Error('Este pedido já foi enviado ou entregue.');
    }
    throw new Error(
      'Só pedidos pagos podem ser expedidos (imprimir). O estado actual não permite esta acção.',
    );
  }

  // -------------------------------------------------------------
  // Marcar como ENVIADO (CTT) — apenas após expedido.
  // -------------------------------------------------------------
  async markAsShipped(orderId, trackingCode = null) {
    const { rows } = await db.query(
      `UPDATE orders SET status = 'enviado'
        WHERE id = $1
          AND status = 'expedido'
          AND COALESCE(is_delivery, false) = true
        RETURNING id`,
      [orderId],
    );
    if (!rows[0]) {
      throw new Error(
        'Marca primeiro «Expedir pedido» (estado Expedido). Só depois podes registar o envio via CTT.',
      );
    }
    await LogService.register('system', 'order_shipped_ctt', { orderId, trackingCode });
    emailService.scheduleNotifyOrderShipped(orderId);
    return { success: true, orderId, trackingCode };
  }

  // -------------------------------------------------------------
  // Liberar pedido para levantamento na loja (site + sem entrega)
  // -------------------------------------------------------------
  async notifyPickupReadyForWebsiteStore(orderId, adminUser = 'admin') {
    const id = parseInt(orderId, 10);
    if (!Number.isFinite(id)) throw new Error('ID inválido.');

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `
        SELECT id, status,
               COALESCE(origin, '') AS origin_raw,
               COALESCE(is_delivery, false) AS is_delivery,
               pickup_ready_notified_at
          FROM orders
         WHERE id = $1
         FOR UPDATE`,
        [id],
      );
      if (!rows[0]) {
        await client.query('ROLLBACK');
        throw new Error('Pedido não encontrado.');
      }
      const row = rows[0];
      if (String(row.origin_raw || '').trim().toLowerCase() !== 'website') {
        await client.query('ROLLBACK');
        throw new Error('Apenas pedidos criados no site podem ser liberados neste fluxo.');
      }
      if (row.is_delivery) {
        await client.query('ROLLBACK');
        throw new Error('Este pedido tem entrega ao domicílio — não se aplica levantamento na loja.');
      }
      if (row.status !== 'pago') {
        await client.query('ROLLBACK');
        throw new Error('Este pedido ainda não está como pago. Confirma o pagamento antes de libertar para levantamento.');
      }
      if (row.pickup_ready_notified_at != null) {
        await client.query('ROLLBACK');
        throw new Error('Já foi enviado o email de disponibilidade para levantamento para este pedido.');
      }

      await client.query(
        `UPDATE orders SET pickup_ready_notified_at = NOW() WHERE id = $1`,
        [id],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }

    try {
      await emailService.notifyOrderPickupReadyById(id);
    } catch (err) {
      await db.query('UPDATE orders SET pickup_ready_notified_at = NULL WHERE id = $1', [id]).catch(() => {});
      throw new Error(
        `Envio por email falhou (${err.message || String(err)}). Podes repetir o envio.`,
      );
    }

    await LogService.register(adminUser || 'system', 'pickup_ready_emailed', { orderId: id });
    const { rows: tout } = await db.query(
      `SELECT pickup_ready_notified_at FROM orders WHERE id = $1`,
      [id],
    );
    return { success: true, orderId: id, pickup_ready_notified_at: tout[0]?.pickup_ready_notified_at ?? null };
  }

  // -------------------------------------------------------------
  // Cliente levantou na loja — encerra o fluxo (status → entregue)
  // -------------------------------------------------------------
  async markPickupCollectedForWebsiteStore(orderId, adminUser = 'admin') {
    const id = parseInt(orderId, 10);
    if (!Number.isFinite(id)) throw new Error('ID inválido.');

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `
        SELECT id, status,
               COALESCE(origin, '') AS origin_raw,
               COALESCE(is_delivery, false) AS is_delivery
          FROM orders
         WHERE id = $1
         FOR UPDATE`,
        [id],
      );
      if (!rows[0]) {
        await client.query('ROLLBACK');
        throw new Error('Pedido não encontrado.');
      }
      const row = rows[0];
      if (String(row.origin_raw || '').trim().toLowerCase() !== 'website') {
        await client.query('ROLLBACK');
        throw new Error('Apenas pedidos do site neste fluxo de levantamento na loja.');
      }
      if (row.is_delivery) {
        await client.query('ROLLBACK');
        throw new Error('Este pedido tem envio ao domicílio — usa o fluxo de envio/embalagem.');
      }
      if (row.status !== 'pago') {
        await client.query('ROLLBACK');
        if (row.status === 'entregue') {
          throw new Error('Este pedido já está marcado como concluído (levantado / entregue).');
        }
        throw new Error('Só é possível confirmar levantamento quando o pedido está pago.');
      }

      const { rows: out } = await client.query(
        `
        UPDATE orders
           SET status = 'entregue',
               pickup_collected_at = NOW()
         WHERE id = $1
         RETURNING pickup_collected_at`,
        [id],
      );
      await client.query('COMMIT');
      await LogService.register(adminUser || 'system', 'pickup_collected', { orderId: id });
      return {
        success: true,
        orderId: id,
        status: 'entregue',
        pickup_collected_at: out[0]?.pickup_collected_at ?? null,
      };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
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
      const wasPaid = ['pago', 'expedido', 'enviado', 'entregue'].includes(order.status);

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

  /**
   * Dados do destinatário para automação Ship2U (morada + contactos do cliente).
   * Usa morada da encomenda quando existe snapshot (`delivery_address`), senão a do cliente.
   */
  async getShip2uRecipientForOrder(orderId) {
    const id = parseInt(orderId, 10);
    if (!Number.isFinite(id)) throw new Error('ID inválido.');

    const pick = (row) => {
      const full_name = String(row.full_name || '').trim();
      const email = String(row.email || '').trim();
      const address = String(row.address || '').trim();
      const postal_code = String(row.postal_code || '').trim();
      const rawPhone = row.phone != null ? String(row.phone).trim() : '';
      const defaultCountry =
        String(row.customer_country || 'PT')
          .trim()
          .toUpperCase()
          .slice(0, 2) || 'PT';
      let phone = '';
      if (rawPhone) {
        const intl = canonicalWhatsappNumber(rawPhone, defaultCountry);
        phone =
          intl && /^[0-9]{10,15}$/.test(intl)
            ? nationalNumberDigitsForIntlE164(intl)
            : rawPhone.replace(/\D/g, '');
      }
      // Ship2U / expedição via integração: só Portugal; o formulário espera dígitos nacionais sem 351.
      if (defaultCountry === 'PT' && phone) {
        while (phone.startsWith('351') && phone.length > 9) {
          phone = phone.slice(3);
        }
      }
      return { full_name, email, address, postal_code, phone };
    };

    let rows;
    try {
      ({ rows } = await db.query(
        `
        SELECT COALESCE(o.is_delivery, false) AS is_delivery,
               c.full_name AS full_name,
               c.email AS email,
               COALESCE(o.delivery_address, c.address) AS address,
               c.postal_code AS postal_code,
               COALESCE(NULLIF(TRIM(c.phone), ''), NULLIF(TRIM(c.whatsapp_number), '')) AS phone,
               COALESCE(NULLIF(UPPER(TRIM(c.country)), ''), 'PT') AS customer_country
          FROM orders o
          LEFT JOIN customers c ON o.customer_id = c.id
         WHERE o.id = $1`,
        [id],
      ));
    } catch (err) {
      const msg = String(err?.message || '');
      if (err?.code === '42703' && msg.includes('delivery_address')) {
        ({ rows } = await db.query(
          `
          SELECT COALESCE(o.is_delivery, false) AS is_delivery,
                 c.full_name AS full_name,
                 c.email AS email,
                 c.address AS address,
                 c.postal_code AS postal_code,
                 COALESCE(NULLIF(TRIM(c.phone), ''), NULLIF(TRIM(c.whatsapp_number), '')) AS phone,
                 COALESCE(NULLIF(UPPER(TRIM(c.country)), ''), 'PT') AS customer_country
            FROM orders o
            LEFT JOIN customers c ON o.customer_id = c.id
           WHERE o.id = $1`,
          [id],
        ));
      } else {
        throw err;
      }
    }

    if (!rows[0]) throw new Error('Pedido não encontrado.');
    if (!rows[0].is_delivery) {
      throw new Error('Ship2U só se aplica a pedidos com entrega ao domicílio.');
    }

    const out = pick(rows[0]);
    if (!out.full_name) throw new Error('Nome do cliente em falta — actualiza o cliente no backoffice.');
    if (!out.email) throw new Error('Email do cliente em falta — actualiza o cliente no backoffice.');
    if (!out.address) throw new Error('Morada de entrega em falta.');
    if (!out.postal_code) throw new Error('Código postal em falta — actualiza o cliente no backoffice.');
    if (!out.phone) throw new Error('Telemóvel/WhatsApp em falta — actualiza o cliente no backoffice.');

    return out;
  }
}

module.exports = new OrderService();
