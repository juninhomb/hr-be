const { Pool } = require('pg');
require('dotenv').config();

// Configuração do Pool de conexões
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
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