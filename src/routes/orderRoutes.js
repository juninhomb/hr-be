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

const authMiddleware = require('../config/authMiddleware');
const { upload } = require('../config/upload');
const { loginLimiter } = require('../config/publicRateLimit');

// --- ROTAS PÚBLICAS ---
router.post('/login', loginLimiter, AuthController.login);

// --- ROTAS PROTEGIDAS (Requerem Token) ---
router.use(authMiddleware);

// Dashboard & Analytics
router.get('/dashboard/stats', DashboardController.getStats);

// Vendas / Pedidos
router.get('/pending', OrderController.listPending);
router.get('/history', OrderController.listHistory);
router.post('/confirm', OrderController.confirm);
router.post('/mail/test', MailController.test);
router.post('/create', OrderController.create);

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

// Upload / remover imagem do produto-base (fallback partilhado)
// (multipart/form-data, field "image")
router.post(
  '/products/:productId/image',
  upload.single('image'),
  ProductController.uploadImage
);
router.delete('/products/:productId/image', ProductController.removeImage);

// Upload / remover imagem específica de uma variante
// Body opcional: applyToColor=true → propaga para todas as variantes da
// mesma cor.
router.post(
  '/variants/:variantId/image',
  upload.single('image'),
  ProductController.uploadVariantImage
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
router.get('/:id', OrderController.show);
router.post('/:id/cancel', OrderController.cancel);
router.post('/:id/pickup-ready', OrderController.notifyPickupReady);
router.post('/:id/pickup-collected', OrderController.markPickupCollected);
router.post('/:id/ship', OrderController.ship);
router.patch('/:id/shipping-fee', OrderController.updateShippingFee);
router.delete('/:id', OrderController.destroy);

module.exports = router;