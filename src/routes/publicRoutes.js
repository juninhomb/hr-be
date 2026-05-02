/**
 * Rotas PÚBLICAS para o site de vendas (hrstore-site).
 *
 * Sem autenticação JWT — pensadas para o storefront, browsing e checkout.
 * Todas as escritas (POST /orders) revalidam preços e stock no servidor.
 */
const express = require('express');
const router = express.Router();

const PublicController = require('../controllers/publicController');
const ShippingController = require('../controllers/shippingController');
const { strictPublicPostLimiter } = require('../config/publicRateLimit');

// Catálogo
router.get('/products', PublicController.listProducts);
router.get('/products/:id', PublicController.getProduct);
router.get('/categories', PublicController.listCategories);

// Envios — leitura pública para o storefront mostrar tarifas dinâmicas
router.get('/shipping-zones', ShippingController.listPublic);
router.get('/shipping-quote', ShippingController.quote);
router.get('/postal-code/:cp', ShippingController.lookupCp);

// Checkout (limite próprio mais apertado, em série com o da montagem em main.js)
router.post('/customer-hints', strictPublicPostLimiter, PublicController.customerHints);
router.post('/orders', strictPublicPostLimiter, PublicController.createOrder);
router.post('/orders/stripe-checkout', strictPublicPostLimiter, PublicController.createStripeCheckout);
router.post(
  '/orders/stripe-session-verify',
  strictPublicPostLimiter,
  PublicController.verifyStripeCheckoutSession,
);

module.exports = router;
