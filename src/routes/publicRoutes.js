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

// Catálogo
router.get('/products', PublicController.listProducts);
router.get('/products/:id', PublicController.getProduct);
router.get('/categories', PublicController.listCategories);

// Envios — leitura pública para o storefront mostrar tarifas dinâmicas
router.get('/shipping-zones', ShippingController.listPublic);
router.get('/shipping-quote', ShippingController.quote);
router.get('/postal-code/:cp', ShippingController.lookupCp);

// Checkout
router.post('/customer-hints', PublicController.customerHints);
router.post('/orders', PublicController.createOrder);
router.post('/orders/stripe-checkout', PublicController.createStripeCheckout);

module.exports = router;
