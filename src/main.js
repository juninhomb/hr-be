require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const orderRoutes = require('./routes/orderRoutes');
const publicRoutes = require('./routes/publicRoutes');
const errorHandler = require('./config/errorHandler');
const { generalPublicLimiter } = require('./config/publicRateLimit');
const publicApiTokenMiddleware = require('./config/publicApiTokenMiddleware');
const stripeWebhookController = require('./controllers/stripeWebhookController');

const app = express();

// Atrás de Nginx/Caddy no Hetzner: confiar no proxy para HTTPS / IP real
app.set('trust proxy', 1);

// ==========================================
// 1. CORS — domínios fixos (produção + dev) + extra via env
// ==========================================
// Origens permitidas: front em produção e dev local.
// n8n roda no mesmo servidor (chamadas server-to-server),
// portanto NÃO precisa estar nesta lista (CORS só afeta browsers).
// CORS_ALLOWED_ORIGINS=comma,separated opcional acrescenta origens sem editar código.
function parseCsvOrigins(raw) {
  if (!raw || typeof raw !== 'string') return [];
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

const STATIC_ALLOWED_ORIGINS = [
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
  // Site em PM2 com outra porta local (next start -p 3005, etc.)
  'http://localhost:3005',
  'http://127.0.0.1:3005',
  'http://168.119.230.7:3005',
  // Testes directos à API pelo IP (Swagger/navegador no servidor)
  'http://168.119.230.7:3001',
];

const ALLOWED_ORIGINS = [...new Set([
  ...STATIC_ALLOWED_ORIGINS,
  ...parseCsvOrigins(process.env.CORS_ALLOWED_ORIGINS),
])];

/** Site + subdomínios hrstorept.com em HTTPS (evita falhas se faltar uma entrada na lista estática). */
function isTrustedHrstoreHttpsOrigin(origin) {
  try {
    const u = new URL(origin);
    if (u.protocol !== 'https:') return false;
    const h = u.hostname.toLowerCase();
    return h === 'hrstorept.com' || h.endsWith('.hrstorept.com');
  } catch {
    return false;
  }
}

const corsOptions = {
  origin(origin, callback) {
    // Permite ferramentas sem Origin (curl, n8n, health checks)
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    if (isTrustedHrstoreHttpsOrigin(origin)) return callback(null, true);
    // Nunca callback(Error): o cors repassa a next(err) e o errorHandler responde sem
    // Access-Control-Allow-Origin — o browser mostra preflight falhado em vez de "negado" claro.
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.warn(`[CORS] Origem não permitida: ${origin}`);
    }
    return callback(null, false);
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Public-Token', 'idempotency-key'],
  credentials: false, // JWT vai no header Authorization, sem cookies
  maxAge: 86400,      // cache do preflight por 24h
};

app.use(cors(corsOptions));

// ==========================================
// 2. WEBHOOK STRIPE (corpo bruto — antes de json())
// ==========================================
app.post(
  '/api/public/stripe-webhook',
  express.raw({ type: 'application/json' }),
  (req, res, next) => {
    stripeWebhookController.handle(req, res).catch(next);
  },
);

// ==========================================
// 3. MIDDLEWARES GLOBAIS
// ==========================================
app.use(express.json({ limit: '2mb' }));

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
// 4. DEFINIÇÃO DE ROTAS
// ==========================================

// Rotas PÚBLICAS do site de vendas (hrstore-site) — sem JWT.
// Catálogo + criação de pedidos vindos do storefront.
// Rate-limit global (/api/public; POST têm segundo limite no router).
// TOKEN opcional (PUBLIC_API_TOKEN) depois do limiter para contabilizar pings sem header.
// Nota: /api/public/stripe-webhook acima não passa aqui — registo próprio antes do router.
app.use('/api/public', generalPublicLimiter, publicApiTokenMiddleware, publicRoutes);

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
// 5. INICIALIZAÇÃO DO SERVIDOR
// ==========================================
const PORT = process.env.PORT || 3001;

// Validação fail-fast de variáveis críticas. Sem JWT_SECRET o login emite
// tokens com `undefined` como segredo (jsonwebtoken faz throw runtime no
// primeiro pedido) — preferimos parar aqui e dar mensagem clara.
// Em produção exigimos pelo menos 32 chars (recomendação OWASP); em dev
// aceitamos qualquer valor não-vazio mas avisamos se for curto.
const JWT_SECRET = process.env.JWT_SECRET || '';
const IS_PROD = process.env.NODE_ENV === 'production';
if (!JWT_SECRET) {
  console.error('🛑 JWT_SECRET em falta. Aborta.');
  process.exit(1);
}
if (IS_PROD && JWT_SECRET.length < 32) {
  console.error(`🛑 JWT_SECRET demasiado curto em produção (${JWT_SECRET.length} < 32). Aborta.`);
  process.exit(1);
}
if (!IS_PROD && JWT_SECRET.length < 16) {
  console.warn(`⚠️  JWT_SECRET com apenas ${JWT_SECRET.length} chars — OK em dev, mas em produção use ≥ 32 chars.`);
}
if (!process.env.ADMIN_USER || !process.env.ADMIN_PASS) {
  console.error('🛑 ADMIN_USER/ADMIN_PASS em falta. Aborta.');
  process.exit(1);
}

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