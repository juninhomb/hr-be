const rateLimit = require('express-rate-limit');

function intEnv(key, fallback) {
  const raw = process.env[key];
  if (raw === undefined || raw === '') return fallback;
  const n = Number.parseInt(String(raw), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function noopLimiter() {
  return (req, res, next) => next();
}

if (process.env.PUBLIC_API_RATELIMIT_DISABLED === '1') {
  module.exports.generalPublicLimiter = noopLimiter();
  module.exports.strictPublicPostLimiter = noopLimiter();
} else {
  /** Limite global para todas as rotas sob /api/public (GET predominante no catálogo). */
  module.exports.generalPublicLimiter = rateLimit({
    windowMs: intEnv('PUBLIC_API_RATELIMIT_WINDOW_MS', 15 * 60 * 1000),
    limit: intEnv('PUBLIC_API_RATELIMIT_MAX', 320),
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: (req) => req.method === 'OPTIONS',
    message: { error: 'Demasiados pedidos. Tenta novamente dentro de alguns minutos.' },
    handler(req, res) {
      res.status(429).json({
        error: 'Demasiados pedidos. Tenta novamente dentro de alguns minutos.',
      });
    },
  });

  /** Limite mais apertado só para escritas públicas sensíveis (checkout). Em série com o general. */
  module.exports.strictPublicPostLimiter = rateLimit({
    windowMs: intEnv(
      'PUBLIC_API_RATELIMIT_STRICT_WINDOW_MS',
      15 * 60 * 1000,
    ),
    limit: intEnv('PUBLIC_API_RATELIMIT_STRICT_MAX', 48),
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Demasiadas tentativas nesta operação. Aguarda e tenta de novo.' },
    handler(req, res) {
      res.status(429).json({
        error: 'Demasiadas tentativas nesta operação. Aguarda e tenta de novo.',
      });
    },
  });
}

// Limitador específico para o endpoint /login (admin) — protege contra
// brute-force de credenciais. 10 tentativas por janela de 15 min por IP.
// Independente das flags de rate-limit público.
module.exports.loginLimiter = rateLimit({
  windowMs: intEnv('LOGIN_RATELIMIT_WINDOW_MS', 15 * 60 * 1000),
  limit: intEnv('LOGIN_RATELIMIT_MAX', 10),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // Não conta tentativas com sucesso — só penaliza falhas.
  skipSuccessfulRequests: true,
  message: { error: 'Demasiadas tentativas de login. Tenta novamente em 15 minutos.' },
  handler(req, res) {
    res.status(429).json({
      error: 'Demasiadas tentativas de login. Tenta novamente em 15 minutos.',
    });
  },
});
