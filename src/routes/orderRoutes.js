const express = require('express');
const router = express.Router();

// Importação de todos os Controllers
const OrderController = require('../controllers/orderController');
const AuthController = require('../controllers/authController');
const ProductController = require('../controllers/productController');
const CustomerController = require('../controllers/customerController');
const DashboardController = require('../controllers/dashboardController');

const authMiddleware = require('../config/authMiddleware');

// --- ROTAS PÚBLICAS ---
router.post('/login', AuthController.login);

// --- ROTAS PROTEGIDAS (Requerem Token) ---
router.use(authMiddleware);

// Dashboard & Analytics
router.get('/dashboard/stats', DashboardController.getStats);

// Vendas / Pedidos
router.get('/pending', OrderController.listPending);
router.get('/history', OrderController.listHistory);
router.post('/confirm', OrderController.confirm);
router.post('/create', OrderController.create);

// Inventário (Produtos)
router.get('/products', ProductController.list);
router.put('/products/:sku', ProductController.update);
router.post('/products/:sku/add', ProductController.addStock); // A que testamos agora!

// CRM (Clientes)
router.get('/customers', CustomerController.list);
router.get('/customers/:whatsapp', CustomerController.show);
router.post('/customers', CustomerController.store);

module.exports = router;