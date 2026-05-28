const express = require('express');
const router = express.Router();

// Importação de todos os Controllers
const OrderController = require('../controllers/orderController');
const AuthController = require('../controllers/authController');
const ProductController = require('../controllers/productController');
const CategoryController = require('../controllers/categoryController');
const CustomerController = require('../controllers/customerController');
const DashboardController = require('../controllers/dashboardController');
const ShippingController = require('../controllers/shippingController');
const MailController = require('../controllers/mailController');
const DiscountCouponController = require('../controllers/discountCouponController');
const ColorController = require('../controllers/colorController');

const authMiddleware = require('../config/authMiddleware');
const { upload, uploadGallery } = require('../config/upload');
const { loginLimiter } = require('../config/publicRateLimit');

// --- ROTAS PÚBLICAS ---
router.post('/login', loginLimiter, AuthController.login);

// --- ROTAS PROTEGIDAS (Requerem Token) ---
router.use(authMiddleware);

// Antes de rotas `/:id` — diagnóstico Stripe (live vs test)
router.get('/diagnostics/stripe-env', OrderController.stripeEnvDiagnostics);

// Dashboard & Analytics
router.get('/dashboard/stats', DashboardController.getStats);

// Vendas / Pedidos
router.get('/pending', OrderController.listPending);
router.get('/history', OrderController.listHistory);
router.post('/confirm', OrderController.confirm);
router.post('/mail/test', MailController.test);
router.post('/coupon-quote', OrderController.couponQuote);
router.post('/create', OrderController.create);

// Trocas (TROCA): novo pedido (origin='troca') ligado ao original.
router.post('/troca', OrderController.createTroca);
router.get('/troca/:id/returned-summary', OrderController.getTrocaReturnedSummary);

// Inventário (Produtos)
router.get('/products', ProductController.list);
router.get('/products/base', ProductController.listBase);
router.post('/products', ProductController.create);
router.post('/products/import', ProductController.importInventory);
router.post('/products/:productId/variants', ProductController.addVariant);
router.put('/products/:sku', ProductController.update);
router.delete('/products/:sku', ProductController.destroy);
router.post('/products/:sku/add', ProductController.addStock);

// Marca/desmarca produto como DESTAQUE (mostrado primeiro na home pública)
router.patch('/products/:productId/featured', ProductController.setFeatured);

// Categorias — CRUD admin (a admin gere lista + imagem na grelha da home)
router.get('/categories', CategoryController.list);
router.post('/categories', CategoryController.create);
router.put('/categories/:id', CategoryController.update);
router.delete('/categories/:id', CategoryController.destroy);
router.post(
  '/categories/:categoryId/image',
  upload.single('image'),
  CategoryController.uploadImage
);
router.delete('/categories/:categoryId/image', CategoryController.removeImage);

// Cores canónicas (catálogo — inventário / site)
router.get('/colors', ColorController.list);
router.post('/colors', ColorController.create);
router.put('/colors/:id', ColorController.update);
router.delete('/colors/:id', ColorController.destroy);

// Galeria de imagens do produto-base (múltiplas)
router.get('/products/:productId/images', ProductController.listProductImages);
router.post(
  '/products/:productId/images',
  uploadGallery,
  ProductController.uploadProductImages,
);
router.delete('/products/:productId/images/:imageId', ProductController.deleteProductImage);

// Compat: um ficheiro no campo "image" (acrescenta à galeria)
router.post(
  '/products/:productId/image',
  upload.single('image'),
  ProductController.uploadImage,
);
router.delete('/products/:productId/image', ProductController.removeImage);

// Galeria de imagens da variante
router.get('/variants/:variantId/images', ProductController.listVariantImages);
router.post(
  '/variants/:variantId/images',
  uploadGallery,
  ProductController.uploadVariantImages,
);
router.delete('/variants/:variantId/images/:imageId', ProductController.deleteVariantImage);

router.post(
  '/variants/:variantId/image',
  upload.single('image'),
  ProductController.uploadVariantImage,
);
router.delete('/variants/:variantId/image', ProductController.removeVariantImage);

// Configurações: tarifas de envio (CRUD admin)
router.get('/shipping-zones', ShippingController.listAdmin);
router.post('/shipping-zones', ShippingController.createAdmin);
router.put('/shipping-zones/:id', ShippingController.updateAdmin);
router.delete('/shipping-zones/:id', ShippingController.destroyAdmin);

// Cupões de desconto (checkout site)
router.get('/discount-coupons', DiscountCouponController.list);
router.post('/discount-coupons', DiscountCouponController.store);
router.put('/discount-coupons/:id', DiscountCouponController.update);
router.delete('/discount-coupons/:id', DiscountCouponController.destroy);

// Clientes (backoffice) — rotas mais específicas primeiro
router.get('/customers', CustomerController.list);
router.post('/customers', CustomerController.store);
router.delete('/customers/:whatsapp/addresses/:addressId', CustomerController.destroySavedAddress);
router.post('/customers/:whatsapp/addresses', CustomerController.storeSavedAddress);
router.get('/customers/:whatsapp', CustomerController.show);
router.delete('/customers/:whatsapp', CustomerController.destroy);

// Detalhe / cancelamento de pedidos por ID — declarados POR ÚLTIMO
// para não capturar /products, /customers, /pending, etc.
router.post('/:id/stripe-checkout-session', OrderController.createPdvStripeCheckoutSession);
router.get('/:id/receipt.pdf', OrderController.receiptPdf);
router.get('/:id', OrderController.show);
router.post('/:id/cancel', OrderController.cancel);
router.post('/:id/pickup-ready', OrderController.notifyPickupReady);
router.post('/:id/pickup-collected', OrderController.markPickupCollected);
router.post('/:id/mark-expedido', OrderController.markExpedited);
router.post('/:id/ship2u-cypress', OrderController.runShip2uCypress);
router.post('/:id/ship', OrderController.ship);
router.patch('/:id/shipping-fee', OrderController.updateShippingFee);
router.delete('/:id', OrderController.destroy);

module.exports = router;