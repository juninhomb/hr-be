require('./env');
const { Pool } = require('pg');

function intEnv(key, fallback) {
  const raw = process.env[key];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// Configuração do Pool de conexões.
// Limites explícitos evitam connection leak / pool exhaustion sob carga e
// asseguram que queries lentas não bloqueiam um worker indefinidamente.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: intEnv('PG_POOL_MAX', 20),
  idleTimeoutMillis: intEnv('PG_POOL_IDLE_MS', 30_000),
  connectionTimeoutMillis: intEnv('PG_POOL_CONNECT_TIMEOUT_MS', 10_000),
  // Statement timeout aplicado a cada client ao conectar (ms).
  // Evita queries presas a consumir slot do pool. 0 = sem limite.
  statement_timeout: intEnv('PG_STATEMENT_TIMEOUT_MS', 15_000),
  query_timeout: intEnv('PG_QUERY_TIMEOUT_MS', 20_000),
});

// Log para confirmar a conexão no arranque
pool.on('connect', () => {
  console.log('Conexão com o PostgreSQL estabelecida com sucesso! 🐘');
});

pool.on('error', (err) => {
  console.error('Erro inesperado no cliente PostgreSQL:', err);
  process.exit(-1);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  connect: () => pool.connect(),
};