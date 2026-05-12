const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const BACKEND_ROOT = path.resolve(__dirname, '..', '..');
const CY_PROJECT_DIR = path.join(BACKEND_ROOT, 'cy');

const MAX_LOG_CAPTURE = 512 * 1024;
const DEFAULT_TIMEOUT_MS = 600000;

function tailLog(bufChunks) {
  const buf = Buffer.concat(bufChunks);
  const s = buf.toString('utf8');
  return s.length > 12000 ? s.slice(-12000) : s;
}

/**
 * Executa `npx cypress run` e aguarda o fim do processo (sucesso = código 0).
 * @returns {Promise<{ exitCode: number, logTail: string }>}
 */
function runAndWait(orderId, recipientPayload) {
  const tmp = path.join('/tmp', `ship2u-recipient-${orderId}-${Date.now()}.json`);
  fs.writeFileSync(tmp, JSON.stringify(recipientPayload), { encoding: 'utf8', mode: 0o600 });

  const args = [
    'cypress',
    'run',
    '--spec',
    'cypress/e2e/ship2U.cy.js',
    '--env',
    `RECIPIENT_FILE=${tmp}`,
  ];

  const timeoutRaw = process.env.SHIP2U_CYPRESS_TIMEOUT_MS;
  const parsedTimeout = timeoutRaw != null ? Number(String(timeoutRaw).trim()) : NaN;
  const timeoutMs = Number.isFinite(parsedTimeout)
    ? Math.min(Math.max(parsedTimeout, 30000), 1800000)
    : DEFAULT_TIMEOUT_MS;

  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalLen = 0;
    let settled = false;
    let timer = null;

    const finish = () => {
      if (timer != null) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const settle = (fn) => {
      if (settled) return;
      settled = true;
      finish();
      fn();
    };

    const child = spawn('npx', args, {
      cwd: CY_PROJECT_DIR,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    const pushChunk = (d) => {
      chunks.push(d);
      totalLen += d.length;
      while (totalLen > MAX_LOG_CAPTURE && chunks.length > 1) {
        const first = chunks.shift();
        totalLen -= first.length;
      }
    };

    child.stdout?.on('data', pushChunk);
    child.stderr?.on('data', pushChunk);

    timer = setTimeout(() => {
      try {
        child.kill('SIGTERM');
      } catch (_) {
        /* ignore */
      }
      const err = new Error(
        `Cypress ultrapassou o tempo limite (${Math.round(timeoutMs / 1000)}s).`,
      );
      err.logTail = tailLog(chunks);
      err.timedOut = true;
      settle(() => reject(err));
    }, timeoutMs);

    child.on('error', (err) => {
      settle(() => {
        err.logTail = tailLog(chunks);
        reject(err);
      });
    });

    child.on('close', (code, signal) => {
      const logTail = tailLog(chunks);
      if (code === 0) {
        settle(() => resolve({ exitCode: 0, logTail }));
        return;
      }
      const msg =
        code != null
          ? `Cypress terminou com código ${code}.`
          : `Cypress terminou com sinal ${signal || '?'}.`;
      const err = new Error(msg);
      err.exitCode = code;
      err.signal = signal;
      err.logTail = logTail;
      settle(() => reject(err));
    });
  });
}

module.exports = { runAndWait, BACKEND_ROOT, CY_PROJECT_DIR };
