const express = require('express');
const cors = require('cors');
const path = require('path');
const orderRoutes = require('./routes/orderRoutes');
const publicRoutes = require('./routes/publicRoutes');
const errorHandler = require('./config/errorHandler');
require('dotenv').config();

const app = express();

// Atrás de Nginx/Caddy no Hetzner: confiar no proxy para HTTPS / IP real
app.set('trust proxy', 1);

// ==========================================
// 1. CORS — domínios fixos (produção + dev)
// ==========================================
// Origens permitidas: front em produção e dev local.
// n8n roda no mesmo servidor (chamadas server-to-server),
// portanto NÃO precisa estar nesta lista (CORS só afeta browsers).
const ALLOWED_ORIGINS = [
  // Admin / dashboard
  'https://app.hrstorept.com',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://168.119.230.7:3000',
  // Site público (hrstore-site)
  'https://hrstorept.com',
  'https://www.hrstorept.com',
  'https://loja.hrstorept.com',
  'http://localhost:3002',
  'http://127.0.0.1:3002',
  'http://168.119.230.7:3002',
];

const corsOptions = {
  origin(origin, callback) {
    // Permite ferramentas sem Origin (curl, n8n, health checks)
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    return callback(new Error(`CORS bloqueado para origem: ${origin}`));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false, // JWT vai no header Authorization, sem cookies
  maxAge: 86400,      // cache do preflight por 24h
};

app.use(cors(corsOptions));

// ==========================================
// 2. MIDDLEWARES GLOBAIS
// ==========================================
app.use(express.json());

// Servir imagens de produtos como ficheiros estáticos.
// URLs públicas: /uploads/products/<filename>
// (ler `src/config/upload.js` para ver como o multer grava aqui)
app.use(
  '/uploads',
  express.static(path.resolve(process.cwd(), 'uploads'), {
    maxAge: '7d',
    fallthrough: true,
    index: false,
  })
);

// ==========================================
// 3. DEFINIÇÃO DE ROTAS
// ==========================================

// Rotas PÚBLICAS do site de vendas (hrstore-site) — sem JWT.
// Catálogo + criação de pedidos vindos do storefront.
app.use('/api/public', publicRoutes);

// O roteador centraliza as rotas. A proteção JWT acontece
// dentro do ficheiro orderRoutes.js através do middleware.
app.use('/api/orders', orderRoutes);

// Rota de saúde para monitorização (Pública, sem auth)
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'online',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development',
  });
});

// Middleware de erro deve ser sempre o ÚLTIMO antes do listen
app.use(errorHandler);

// ==========================================
// 3. INICIALIZAÇÃO DO SERVIDOR
// ==========================================
const PORT = process.env.PORT || 3001;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`
  ==============================================
  🚀 HR STORE BACKEND - MODO JWT ATIVO
  📡 Porta: ${PORT}
  🔑 Admin User: ${process.env.ADMIN_USER}
  🔗 Endpoints admin (JWT): /api/orders/*
  🌐 Endpoints públicos:    /api/public/*
  ==============================================
  `);
});