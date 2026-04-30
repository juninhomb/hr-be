const stripeCheckoutService = require('../services/stripeCheckoutService');

/**
 * Stripe envia POST com assinatura HMAC sobre o body em bruto.
 * Esta rota tem de ficar registada antes de `express.json()` em `main.js`.
 */
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
      if (process.env.NODE_ENV !== 'production') {
        console.log('[stripe webhook] checkout.session.completed', session.id, result);
      }
    }
    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('[stripe webhook] handler:', err);
    return res.status(500).json({ error: err.message });
  }
}

module.exports = { handle };
