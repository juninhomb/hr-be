const stripeCheckoutService = require('../services/stripeCheckoutService');

/**
 * Stripe envia POST com assinatura HMAC sobre o body em bruto.
 * Esta rota tem de ficar registada antes de `express.json()` em `main.js`.
 *
 * Modo teste (sk_test_ / cs_test_): funciona como live desde que
 * STRIPE_WEBHOOK_SECRET seja o signing secret do endpoint de webhook em **Test mode**
 * (Dashboard com "Test mode" ligado, ou `stripe listen` → usar o whsec que o CLI imprime).
 */
function logCheckoutSessionOutcome(eventType, session, result) {
  const sid = session?.id;
  if (!result.updated) {
    console.warn(`[stripe webhook] ${eventType} não atualizou pedido`, {
      session_id: sid,
      payment_status: session?.payment_status,
      metadata: session?.metadata,
      client_reference_id: session?.client_reference_id,
      amount_total: session?.amount_total,
      ...result,
    });
    if (result.reason === 'no_order_id') {
      console.warn(
        '[stripe webhook] Dica: eventos de teste gerados no Dashboard ("Send test event") '
        + 'muitas vezes não trazem metadata.order_id — faz um pagamento real de teste no checkout.',
      );
    }
  } else if (process.env.NODE_ENV !== 'production') {
    console.log(`[stripe webhook] ${eventType}`, sid, result);
  }
}

async function handle(req, res) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  const stripe = stripeCheckoutService.getStripe();

  if (!secret || !stripe) {
    return res.status(503).send('Webhook não configurado');
  }

  const sig = req.headers['stripe-signature'];
  if (!sig) {
    return res.status(400).send('Falta stripe-signature');
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, secret);
  } catch (err) {
    console.error('[stripe webhook] Assinatura inválida:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const result = await stripeCheckoutService.applyCheckoutSessionCompleted(session);
      logCheckoutSessionOutcome('checkout.session.completed', session, result);
    } else if (event.type === 'checkout.session.async_payment_succeeded') {
      // Klarna / outros métodos diferidos: `completed` pode vir com payment_status ≠ paid
      const session = event.data.object;
      const result = await stripeCheckoutService.applyCheckoutSessionCompleted(session, {
        trustPaymentComplete: true,
      });
      logCheckoutSessionOutcome('checkout.session.async_payment_succeeded', session, result);
    }
    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('[stripe webhook] handler:', err);
    return res.status(500).json({ error: err.message });
  }
}

module.exports = { handle };
