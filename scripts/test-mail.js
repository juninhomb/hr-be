/**
 * Envio de e-mail de diagnóstico (OAuth2 Gmail).
 * Variáveis: ver `.env.example` (`GMAIL_USER`, `MAIL_FROM`, `GMAIL_APP_PASSWORD`, …).
 *
 * Uso:
 *   cd hrstore-backend && MAIL_TEST_TO=teu@gmail.com npm run mail:test
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });

const emailService = require('../src/services/emailService');

async function main() {
  console.log('[mail:test] configurado?', emailService.isMailConfigured());
  if (!emailService.isMailConfigured()) {
    console.error('[mail:test] Faltam:', emailService.missingMailEnvKeys().join(', ') || '(ver .env.example)');
    process.exit(2);
    return;
  }
  if (!emailService.mailSendingEnabled()) {
    console.error('[mail:test] MAIL_SENDING_ENABLED desactivado.');
    process.exit(2);
    return;
  }
  const { to } = await emailService.sendTestMail(process.argv[2]);
  console.log('[mail:test] enviado para', to);
}

main().catch((e) => {
  console.error('[mail:test] erro:', e?.message || e);
  process.exit(1);
});
