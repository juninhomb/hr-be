#!/usr/bin/env node
/**
 * Smoke tests locais: health, API pública (PostgreSQL), login JWT, dashboard (PostgreSQL).
 * Uso: npm run smoke
 *
 * Requer servidor a correr (npm run dev). Opcional no .env: PUBLIC_API_TOKEN, ADMIN_USER/ADMIN_PASS.
 */
require('../src/config/env');
const http = require('http');

const port = Number(process.env.PORT) || 3001;
const host = '127.0.0.1';

function request(method, path, { headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const merged = { ...headers };
    let payload = null;
    if (body != null) {
      payload = typeof body === 'string' ? body : JSON.stringify(body);
      if (!merged['Content-Type']) merged['Content-Type'] = 'application/json';
      merged['Content-Length'] = String(Buffer.byteLength(payload));
    }
    const opts = { hostname: host, port, path, method, headers: merged };
    const req = http.request(opts, (res) => {
      let b = '';
      res.on('data', (c) => { b += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: b }));
    });
    req.on('error', reject);
    if (payload != null) req.write(payload);
    req.end();
  });
}

function get(path, headers = {}) {
  return request('GET', path, { headers });
}

async function main() {
  const tok = String(process.env.PUBLIC_API_TOKEN || '').trim();
  const pub = tok ? { 'X-Public-Token': tok } : {};

  let health;
  try {
    health = await get('/health');
  } catch (e) {
    if (e.code === 'ECONNREFUSED') {
      console.error('Servidor não responde em', host + ':' + port, '— corre noutro terminal: npm run dev');
      process.exit(1);
    }
    throw e;
  }

  if (health.status !== 200) {
    console.error('FAIL /health', health.status, health.body);
    process.exit(1);
  }
  let healthJson = {};
  try {
    healthJson = JSON.parse(health.body);
  } catch { /* ignore */ }
  const envReported = healthJson.env || '';
  console.log('OK /health env=' + JSON.stringify(envReported));
  if (envReported && envReported !== 'development') {
    console.warn('⚠️  Esperado NODE_ENV=development no .env para desenvolvimento local.');
  }

  const needPub = (path) => {
    if (!tok) {
      console.error('FAIL ' + path + ' — PUBLIC_API_TOKEN em falta no .env (403 na API pública).');
      process.exit(1);
    }
  };

  needPub('/api/public/categories');
  const cat = await get('/api/public/categories', pub);
  if (cat.status !== 200) {
    console.error('FAIL /api/public/categories', cat.status, cat.body.slice(0, 200));
    process.exit(1);
  }
  let nCat = 0;
  try {
    const j = JSON.parse(cat.body);
    nCat = Array.isArray(j) ? j.length : 0;
  } catch { /* ignore */ }
  console.log(`OK /api/public/categories — ${nCat} categorias (PostgreSQL)`);

  const zones = await get('/api/public/shipping-zones', pub);
  if (zones.status !== 200) {
    console.error('FAIL /api/public/shipping-zones', zones.status, zones.body.slice(0, 200));
    process.exit(1);
  }
  let nZ = 0;
  try {
    const j = JSON.parse(zones.body);
    nZ = Array.isArray(j) ? j.length : 0;
  } catch { /* ignore */ }
  console.log(`OK /api/public/shipping-zones — ${nZ} zonas (PostgreSQL)`);

  const products = await get('/api/public/products', pub);
  if (products.status !== 200) {
    console.error('FAIL /api/public/products', products.status, products.body.slice(0, 200));
    process.exit(1);
  }
  try {
    JSON.parse(products.body);
  } catch {
    console.error('FAIL /api/public/products — resposta não é JSON');
    process.exit(1);
  }
  console.log('OK /api/public/products (PostgreSQL)');

  const quote = await get(
    '/api/public/shipping-quote?country=PT&postal_code=1000-001&subtotal=50',
    pub,
  );
  if (quote.status !== 200) {
    console.error('FAIL /api/public/shipping-quote', quote.status, quote.body.slice(0, 200));
    process.exit(1);
  }
  console.log('OK /api/public/shipping-quote (zonas + cálculo)');

  const cp = await get('/api/public/postal-code/1000-001', pub);
  if (cp.status !== 200 && cp.status !== 404) {
    console.error('FAIL /api/public/postal-code', cp.status, cp.body.slice(0, 200));
    process.exit(1);
  }
  console.log(`OK /api/public/postal-code/1000-001 — HTTP ${cp.status}`);

  const user = String(process.env.ADMIN_USER || '').trim();
  const pass = String(process.env.ADMIN_PASS || '').trim();
  if (!user || !pass) {
    console.warn('SKIP login + dashboard — ADMIN_USER/ADMIN_PASS em falta no .env');
    console.log('Smoke concluído (público).');
    return;
  }

  const login = await request('POST', '/api/orders/login', {
    body: { username: user, password: pass },
  });
  if (login.status !== 200) {
    console.error('FAIL POST /api/orders/login', login.status, login.body.slice(0, 200));
    process.exit(1);
  }
  let token = '';
  try {
    token = JSON.parse(login.body).token || '';
  } catch { /* ignore */ }
  if (!token) {
    console.error('FAIL login — token JWT em falta na resposta');
    process.exit(1);
  }
  console.log('OK POST /api/orders/login (JWT emitido)');

  const dash = await get('/api/orders/dashboard/stats', {
    Authorization: 'Bearer ' + token,
  });
  if (dash.status !== 200) {
    console.error('FAIL GET /api/orders/dashboard/stats', dash.status, dash.body.slice(0, 200));
    process.exit(1);
  }
  console.log('OK GET /api/orders/dashboard/stats (PostgreSQL + JWT)');

  console.log('Smoke concluído — backend e base de dados OK.');
}

main().catch((e) => {
  console.error('Erro:', e.message);
  process.exit(1);
});
