const Stripe = require('stripe');
const db = require('../config/db');

/**
 * Stripe Checkout PT (EUR): apenas cartão por defeito; Klarna só com STRIPE_ENABLE_KLARNA=1.
 *
 * MB Way no próprio Stripe está desactivado por defeito — no site público combinamo‑lo
 * pelo WhatsApp (junto com transferência). Para voltar a oferecer MB Way na página Stripe:
 * STRIPE_ENABLE_MBWAY_IN_CHECKOUT=1 (é preciso activar MB WAY na Dashboard).
 *
 * `@deprecated` legacy — STRIPE_DISABLE_MBWAY passa a ser ignorado em favor da opt‑in acima.
 */
function stripeCheckoutPaymentMethodTypes() {
  const enableMbWayInStripe =
    process.env.STRIPE_ENABLE_MBWAY_IN_CHECKOUT === '1'
    || /^true$/i.test(String(process.env.STRIPE_ENABLE_MBWAY_IN_CHECKOUT || '').trim());
  /** @type {string[]} */
  const types = ['card'];
  if (enableMbWayInStripe) types.push('mb_way');
  const klarna =
    process.env.STRIPE_ENABLE_KLARNA === '1'
    || /^true$/i.test(String(process.env.STRIPE_ENABLE_KLARNA || '').trim());
  if (klarna) types.push('klarna');
  return types;
}

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) return null;
  return new Stripe(key);
}

function getStripeOrThrow() {
  const s = getStripe();
  if (!s) {
    const err = new Error('Stripe não está configurado (STRIPE_SECRET_KEY).');
    err.status = 503;
    throw err;
  }
  return s;
}

/**
 * Restaura stock e apaga pedido após falha ao criar sessão Stripe (evita pedidos órfãos).
 */
async function cleanupFailedCheckoutOrder(orderId) {
  const id = parseInt(orderId, 10);
  if (!Number.isFinite(id)) return;
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows: lines } = await client.query(
      `SELECT sku, quantity FROM order_items WHERE order_id = $1`,
      [id],
    );
    for (const row of lines) {
      await client.query(
        `UPDATE product_variants SET stock_quantity = stock_quantity + $1 WHERE sku = $2`,
        [row.quantity, row.sku],
      );
    }
    await client.query(`DELETE FROM order_items WHERE order_id = $1`, [id]);
    await client.query(`DELETE FROM orders WHERE id = $1`, [id]);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('[stripe] cleanupFailedCheckoutOrder', id, e);
  } finally {
    client.release();
  }
}

/**
 * @param {object} opts
 * @param {number} opts.orderId
 * @param {string} [opts.customerEmail]
 * @param {string} opts.successUrl - deve incluir {CHECKOUT_SESSION_ID}
 * @param {string} opts.cancelUrl
 */
async function createSessionForOrder({ orderId, customerEmail, successUrl, cancelUrl }) {
  const stripe = getStripeOrThrow();

  const { rows: orderRows } = await db.query(
    `SELECT shipping_fee, is_delivery FROM orders WHERE id = $1`,
    [orderId],
  );
  if (!orderRows[0]) {
    const err = new Error('Pedido não encontrado.');
    err.status = 404;
    throw err;
  }
  const shippingFee = Number(orderRows[0].shipping_fee || 0);

  const { rows: lines } = await db.query(
    `
    SELECT oi.sku, oi.quantity, oi.unit_price, COALESCE(p.name, oi.sku) AS product_name
      FROM order_items oi
      LEFT JOIN product_variants v ON v.id = oi.variant_id
      LEFT JOIN products p ON p.id = v.product_id
     WHERE oi.order_id = $1
     ORDER BY oi.id ASC
    `,
    [orderId],
  );

  /** @type {import('stripe').Stripe.Checkout.SessionCreateParams.LineItem[]} */
  const line_items = lines.map((row) => {
    const unit = Number(row.unit_price);
    const cents = Math.round(unit * 100);
    const label = String(row.product_name || row.sku).slice(0, 120);
    return {
      quantity: row.quantity,
      price_data: {
        currency: 'eur',
        unit_amount: cents,
        product_data: {
          name: `${label} (${row.sku})`,
          metadata: { sku: row.sku },
        },
      },
    };
  });

  if (shippingFee > 0.009) {
    line_items.push({
      quantity: 1,
      price_data: {
        currency: 'eur',
        unit_amount: Math.round(shippingFee * 100),
        product_data: {
          name: 'Portes de envio',
        },
      },
    });
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    locale: process.env.STRIPE_CHECKOUT_LOCALE || 'pt',
    client_reference_id: String(orderId),
    metadata: { order_id: String(orderId) },
    customer_email: customerEmail?.trim() || undefined,
    success_url: successUrl,
    cancel_url: cancelUrl,
    line_items,
    payment_method_types: stripeCheckoutPaymentMethodTypes(),
  });

  await db.query(`UPDATE orders SET stripe_link_id = $1 WHERE id = $2`, [
    session.id,
    orderId,
  ]);

  return session;
}

/**
 * Actualiza estado do pedido a partir do objecto `checkout.session` do webhook
 * (`checkout.session.completed`) — não voltamos a chamar a API Stripe.
 */
async function applyCheckoutSessionCompleted(session) {
  if (!session?.id || session.payment_status !== 'paid') {
    return { updated: false, reason: 'not_paid' };
  }
  const orderId =
    parseInt(session.metadata?.order_id || session.client_reference_id || '', 10) || null;
  if (!orderId) return { updated: false, reason: 'no_order_id' };

  const res = await db.query(
    `
    UPDATE orders
       SET status = 'pago'
     WHERE id = $1
       AND COALESCE(stripe_link_id, '') = $2
       AND status = 'aguardando_pagamento'
     RETURNING id
    `,
    [orderId, session.id],
  );
  return { updated: res.rowCount > 0, order_id: orderId };
}

module.exports = {
  getStripe,
  getStripeOrThrow,
  createSessionForOrder,
  cleanupFailedCheckoutOrder,
  applyCheckoutSessionCompleted,
};
