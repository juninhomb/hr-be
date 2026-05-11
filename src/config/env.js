/**
 * Carrega sempre o .env na raiz do pacote backend (hrstore-backend/.env),
 * independentemente do process.cwd() (PM2, systemd, etc.).
 *
 * Sem isto, `dotenv.config()` no CWD errado ou um segundo load pode ler
 * outro ficheiro e manter STRIPE_SECRET_KEY em sk_test_ em produção.
 */
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

const ENV_PATH = path.join(__dirname, '..', '..', '.env');

if (!global.__HRSTORE_BACKEND_ENV_LOADED__) {
  global.__HRSTORE_BACKEND_ENV_LOADED__ = true;
  if (fs.existsSync(ENV_PATH)) {
    // Por omissão o dotenv NÃO substitui variáveis já definidas no ambiente do processo.
    // Em produção é comum o host injectar STRIPE_SECRET_KEY=sk_test_ e ficar preso a test
    // mesmo com sk_live_ no .env. `override: true` faz o ficheiro do projecto prevalecer.
    // Para desactivar: DOTENV_NO_OVERRIDE=1 no ambiente (só variáveis do sistema).
    const noOverride = String(process.env.DOTENV_NO_OVERRIDE || '').trim() === '1';
    dotenv.config({ path: ENV_PATH, override: !noOverride });
  } else {
    dotenv.config();
    console.warn(`[env] .env não encontrado em ${ENV_PATH} — fallback ao CWD.`);
  }
}

module.exports = { ENV_PATH };
