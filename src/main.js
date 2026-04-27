const express = require('express');
const cors = require('cors');
const orderRoutes = require('./routes/orderRoutes');
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
  'https://app.hrstorept.com',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
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
app.options('*', cors(corsOptions)); // responder preflight em todas as rotas

// ==========================================
// 2. MIDDLEWARES GLOBAIS
// ==========================================
app.use(express.json());

// ==========================================
// 3. DEFINIÇÃO DE ROTAS
// ==========================================

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
  🔗 Endpoints protegidos em: /api/orders/*
  ==============================================
  `);
});