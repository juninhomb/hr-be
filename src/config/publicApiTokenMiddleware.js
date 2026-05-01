const crypto = require('crypto');

/** Token opcional para filtrar chamadas triviais a `/api/public` — partilhado com o browser (NEXT_PUBLIC_*). */
function normalizedTokenFromEnv() {
  const raw = process.env.PUBLIC_API_TOKEN;
  if (typeof raw !== 'string') return '';
  return raw.trim();
}

const EXPECTED = normalizedTokenFromEnv();

function parseBearer(authHeader) {
  if (!authHeader || typeof authHeader !== 'string') return '';
  const m = /^Bearer\s+(\S+)/i.exec(authHeader.trim());
  return m ? m[1] : '';
}

function timingSafeEq(a, b) {
  try {
    const ba = Buffer.from(a, 'utf8');
    const bb = Buffer.from(b, 'utf8');
    if (ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

module.exports = function publicApiTokenMiddleware(req, res, next) {
  if (EXPECTED.length === 0) return next();
  if (req.method === 'OPTIONS') return next();

  const xh = req.get('x-public-token');
  const fromHeader = xh && typeof xh === 'string' ? xh.trim() : '';
  const sent = fromHeader || parseBearer(req.get('authorization') || '');

  if (!timingSafeEq(sent, EXPECTED)) {
    return res.status(403).json({
      error: 'Acesso não autorizado à API pública.',
    });
  }

  next();
};
