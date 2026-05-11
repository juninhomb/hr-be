const Stripe = require('stripe');
const db = require('../config/db');
const emailService = require('./emailService');

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
 * Mensagem útil para o operador / cliente quando sessions.create falha.
 * @param {unknown} stripeErr
 */
function mapStripeCheckoutSessionError(stripeErr) {
  const msg = String(stripeErr?.message || stripeErr || '');
  const lower = msg.toLowerCase();
  if (lower.includes('klarna')) {
    return (
      'Klarna não está disponível nesta conta Stripe. '
      + 'Remove STRIPE_ENABLE_KLARNA do servidor ou activa Klarna no Dashboard Stripe.'
    );
  }
  if (lower.includes('mb_way') || lower.includes('mbway')) {
    return (
      'MB Way no Checkout Stripe falhou. '
      + 'Remove STRIPE_ENABLE_MBWAY_IN_CHECKOUT ou activa MB Way na conta Stripe.'
    );
  }
  if (lower.includes('payment_method_types')) {
    return `Stripe recusou os métodos de pagamento: ${msg}`;
  }
  return msg ? `Stripe: ${msg}` : 'Stripe recusou criar a sessão de pagamento.';
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

  let orderRows;
  try {
    ({ rows: orderRows } = await db.query(
      `SELECT shipping_fee, is_delivery,
              COALESCE(discount_amount, 0) AS discount_amount,
              coupon_code
         FROM orders WHERE id = $1`,
      [orderId],
    ));
  } catch (e) {
    const msg = String(e?.message || '');
    if (e?.code === '42703' && /discount_amount|coupon_code/i.test(msg)) {
      ({ rows: orderRows } = await db.query(
        `SELECT shipping_fee, is_delivery FROM orders WHERE id = $1`,
        [orderId],
      ));
      if (orderRows[0]) {
        orderRows = [{ ...orderRows[0], discount_amount: 0, coupon_code: null }];
      }
    } else {
      throw e;
    }
  }
  if (!orderRows[0]) {
    const err = new Error('Pedido não encontrado.');
    err.status = 404;
    throw err;
  }
  const shippingFee = Number(orderRows[0].shipping_fee || 0);
  const discountAmount = Number(orderRows[0].discount_amount || 0);
  const orderCouponCode = orderRows[0].coupon_code
    ? String(orderRows[0].coupon_code).trim()
    : '';

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

  const itemsSum = lines.reduce(
    (s, row) => s + Number(row.unit_price) * Number(row.quantity),
    0,
  );

  /** @type {import('stripe').Stripe.Checkout.SessionCreateParams.LineItem[]} */
  let line_items;
  if (discountAmount >= 0.005) {
    const netCents = Math.round((itemsSum - discountAmount) * 100);
    if (netCents < 1) {
      const err = new Error('Total após desconto inválido para Stripe.');
      err.status = 500;
      throw err;
    }
    const coupLabel = orderCouponCode ? ` (cupão ${orderCouponCode})` : '';
    line_items = [
      {
        quantity: 1,
        price_data: {
          currency: 'eur',
          unit_amount: netCents,
          product_data: {
            name: `Artigos da encomenda #${orderId}${coupLabel}`.slice(0, 120),
          },
        },
      },
    ];
  } else {
    line_items = lines.map((row) => {
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
  }

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

  let session;
  try {
    session = await stripe.checkout.sessions.create({
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
  } catch (e) {
    const err = new Error(mapStripeCheckoutSessionError(e));
    err.status = 502;
    throw err;
  }

  await db.query(`UPDATE orders SET stripe_link_id = $1 WHERE id = $2`, [
    session.id,
    orderId,
  ]);

  return session;
}

/**
 * Incrementa total_orders do cliente quando o pedido passa a pago (webhook Stripe).
 * Idempotente com o UPDATE ... WHERE status = 'aguardando_pagamento' (só corre após sucesso).
 */
async function bumpCustomerTotalOrdersForOrder(orderId) {
  const oid = parseInt(orderId, 10);
  if (!Number.isFinite(oid)) return;
  const { rows } = await db.query(
    `SELECT customer_id FROM orders WHERE id = $1`,
    [oid],
  );
  const cid = rows[0]?.customer_id;
  if (cid) {
    await db.query(
      `UPDATE customers SET total_orders = total_orders + 1 WHERE id = $1`,
      [cid],
    );
  }
}

/**
 * Actualiza estado do pedido a partir do objecto `checkout.session` nos webhooks
 * (`checkout.session.completed`, `checkout.session.async_payment_succeeded`).
 * Não voltamos a chamar a API Stripe.
 *
 * @param {object} session
 * @param {{ trustPaymentComplete?: boolean }} [options]
 *   `trustPaymentComplete` — para `async_payment_succeeded`, onde o evento já implica sucesso.
 */
async function applyCheckoutSessionCompleted(session, options = {}) {
  const trustPaymentComplete = Boolean(options.trustPaymentComplete);
  if (!session?.id) {
    return { updated: false, reason: 'no_session_id' };
  }

  const ps = session.payment_status;
  const paymentOk =
    trustPaymentComplete ||
    ps === 'paid' ||
    ps === 'no_payment_required';

  if (!paymentOk) {
    return {
      updated: false,
      reason: 'not_paid',
      payment_status: ps,
    };
  }

  const sessionId = String(session.id).trim();

  let orderId =
    parseInt(session.metadata?.order_id || session.client_reference_id || '', 10) || null;

  // Sessões criadas pela API gravam `stripe_link_id` no pedido. Eventos reenviados ou
  // respostas sem metadata (ex.: alguns fluxos de Payment Link / Dashboard) ainda têm
  // `session.id` — recuperamos o pedido por esse id.
  if (!orderId) {
    const { rows: bySession } = await db.query(
      `
      SELECT id
        FROM orders
       WHERE TRIM(COALESCE(stripe_link_id, '')) = $1
         AND status = 'aguardando_pagamento'
       LIMIT 1
      `,
      [sessionId],
    );
    if (bySession[0]) orderId = bySession[0].id;
  }

  if (!orderId) return { updated: false, reason: 'no_order_id' };

  /**
   * Pedidos WhatsApp criam-se com `mb_way_ou_transferencia` (cliente escolhe MB Way, IBAN ou link
   * Stripe depois). O webhook só fazia fallback com `payment_method = 'stripe'`, pelo que o
   * pagamento via Payment Link nunca actualizava o pedido. Aceitamos ambos; após pagamento na
   * Stripe gravamos `payment_method = 'stripe'`.
   */
  const pendingForStripeWebhookCond =
    "LOWER(TRIM(COALESCE(payment_method, ''))) IN ('stripe', 'mb_way_ou_transferencia')";

  let res = await db.query(
    `
    UPDATE orders
       SET status = 'pago',
           payment_method = 'stripe'
     WHERE id = $1
       AND TRIM(COALESCE(stripe_link_id, '')) = $2
       AND status = 'aguardando_pagamento'
     RETURNING id
    `,
    [orderId, sessionId],
  );

  if (res.rowCount > 0) {
    await bumpCustomerTotalOrdersForOrder(orderId);
    emailService.scheduleNotifyOrderPaymentConfirmed(orderId);
    return { updated: true, order_id: orderId, path: 'stripe_link_match' };
  }

  // Fallback: metadata/client_reference já ligam o pagamento ao pedido (assinatura Stripe validada).
  // Ex.: dessincronização de stripe_link_id, sessão antiga paga, ou race improvável na gravação do id.
  const { rows: pending } = await db.query(
    `
    SELECT total_amount
      FROM orders
     WHERE id = $1
       AND status = 'aguardando_pagamento'
       AND ${pendingForStripeWebhookCond}
    `,
    [orderId],
  );
  if (!pending[0]) {
    console.warn('[stripe webhook] marcar pago: sem pedido pendente (stripe / whatsapp opções)', {
      order_id: orderId,
      session_id: sessionId,
    });
    return { updated: false, reason: 'no_pending_stripe_order', order_id: orderId };
  }

  const expectedCents = Math.round(Number(pending[0].total_amount) * 100);
  const sessionCents =
    session.amount_total != null && session.amount_total !== ''
      ? Number(session.amount_total)
      : null;

  const centsDelta =
    sessionCents != null && Number.isFinite(sessionCents)
      ? Math.abs(sessionCents - expectedCents)
      : 0;
  // Stripe e PostgreSQL podem diferir 1 cêntimo em arredondamentos de linhas.
  if (sessionCents != null && Number.isFinite(sessionCents) && centsDelta > 2) {
    console.error('[stripe webhook] marcar pago: valor não coincide com pedido (fallback abortado)', {
      order_id: orderId,
      session_id: sessionId,
      expectedCents,
      sessionCents,
    });
    return {
      updated: false,
      reason: 'amount_mismatch',
      order_id: orderId,
      expectedCents,
      sessionCents,
    };
  }

  res = await db.query(
    `
    UPDATE orders
       SET status = 'pago',
           payment_method = 'stripe',
           stripe_link_id = $2
     WHERE id = $1
       AND status = 'aguardando_pagamento'
       AND ${pendingForStripeWebhookCond}
     RETURNING id
    `,
    [orderId, sessionId],
  );

  if (res.rowCount > 0) {
    console.warn('[stripe webhook] pedido marcado pago via fallback (sem match de stripe_link_id)', {
      order_id: orderId,
      session_id: sessionId,
    });
    await bumpCustomerTotalOrdersForOrder(orderId);
    emailService.scheduleNotifyOrderPaymentConfirmed(orderId);
  }

  return {
    updated: res.rowCount > 0,
    order_id: orderId,
    path: res.rowCount > 0 ? 'metadata_amount_fallback' : 'fallback_no_row',
  };
}

/**
 * Backup ao webhook: página de sucesso pede à API para ir buscar a sessão à Stripe
 * e aplicar a mesma lógica de marcar pago (útil se o webhook falhar ou URL errada).
 */
async function verifyCheckoutSessionAndMarkPaid(sessionId) {
  const stripe = getStripeOrThrow();
  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(String(sessionId).trim());
  } catch (e) {
    const err = new Error(
      e?.message ? `Stripe: ${e.message}` : 'Sessão Stripe não encontrada.',
    );
    err.status = 502;
    throw err;
  }
  return applyCheckoutSessionCompleted(session);
}

module.exports = {
  getStripe,
  getStripeOrThrow,
  createSessionForOrder,
  cleanupFailedCheckoutOrder,
  applyCheckoutSessionCompleted,
  verifyCheckoutSessionAndMarkPaid,
};
