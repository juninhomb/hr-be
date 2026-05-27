const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const {
  canonicalWhatsappNumber,
  nationalNumberDigitsForIntlE164,
} = require('../utils/whatsappNormalize');

const BACKEND_ROOT = path.resolve(__dirname, '..', '..');
const CY_PROJECT_DIR = path.join(BACKEND_ROOT, 'cy-ship2u');
/**
 * Specs disponíveis (relativos à raiz do projecto Cypress `cy-ship2u`).
 * `default`     → fluxo Ship2U normal (com recolha agendada).
 * `sem_retirada` → fluxo sem recolha (cliente leva à transportadora).
 */
const SHIP2U_SPECS = {
  default: 'cypress/e2e/ship2u.cy.js',
  sem_retirada: 'cypress/e2e/ship2uSemRetirada.cy.js',
};

const MAX_LOG_CAPTURE = 512 * 1024;
const DEFAULT_TIMEOUT_MS = 600000;
const TAIL_BYTES = 16000;

function tailFromChunks(bufChunks) {
  const buf = Buffer.concat(bufChunks);
  const s = buf.toString('utf8');
  return s.length > TAIL_BYTES ? s.slice(-TAIL_BYTES) : s;
}

/** Últimos ~N bytes do ficheiro (para não ler logs gigantes inteiros para memória). */
function readTailFromFile(filePath, maxLen = TAIL_BYTES) {
  let fd;
  try {
    const stat = fs.statSync(filePath);
    const size = stat.size;
    if (size === 0) return '';
    const readLen = Math.min(maxLen, size);
    const pos = size - readLen;
    fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(readLen);
    fs.readSync(fd, buf, 0, readLen, pos);
    return buf.toString('utf8');
  } catch {
    return '';
  } finally {
    if (fd != null) {
      try {
        fs.closeSync(fd);
      } catch (_) {
        /* noop */
      }
    }
  }
}

function logsDir() {
  const raw = process.env.SHIP2U_CYPRESS_LOG_DIR;
  if (raw != null && String(raw).trim() !== '') {
    return path.resolve(String(raw).trim());
  }
  return path.join(BACKEND_ROOT, 'logs', 'ship2u-cypress');
}

/**
 * Telefone para Ship2U (só pedidos PT neste fluxo): dígitos nacionais, sem 351.
 * Alinhado com `OrderService.getShip2uRecipientForOrder` + fallback legado.
 */
function ship2uRecipientPhoneDigitsPt(raw) {
  const d = String(raw ?? '').replace(/\D/g, '');
  if (!d) return '';
  const intl = canonicalWhatsappNumber(String(raw ?? ''), 'PT');
  if (intl && /^[0-9]{10,15}$/.test(intl)) {
    return nationalNumberDigitsForIntlE164(intl);
  }
  let x = d;
  while (x.startsWith('351') && x.length > 9) {
    x = x.slice(3);
  }
  return x;
}

/**
 * Executa `npx cypress run` e aguarda o fim do processo (sucesso = código 0).
 * Grava stdout+stderr num `.log` consultável no servidor (SSH).
 * @returns {Promise<{ exitCode: number, logFile: string, logFileRelative: string, logTail: string }>}
 */
function runAndWait(orderId, recipientPayload, opts = {}) {
  const variant = opts.variant === 'sem_retirada' ? 'sem_retirada' : 'default';
  const specPath = SHIP2U_SPECS[variant];
  const tmp = path.join('/tmp', `ship2u-recipient-${orderId}-${Date.now()}.json`);
  const payloadForCypress = {
    ...recipientPayload,
    phone: ship2uRecipientPhoneDigitsPt(recipientPayload.phone),
  };
  fs.writeFileSync(tmp, JSON.stringify(payloadForCypress), { encoding: 'utf8', mode: 0o600 });

  const dir = logsDir();
  fs.mkdirSync(dir, { recursive: true });
  const logSuffix = variant === 'default' ? '' : `-${variant}`;
  const logPath = path.join(dir, `order-${orderId}${logSuffix}-${Date.now()}.log`);
  const logStream = fs.createWriteStream(logPath, { flags: 'w', mode: 0o600 });

  const args = [
    'cypress',
    'run',
    '--spec',
    specPath,
    '--env',
    `RECIPIENT_FILE=${tmp}`,
  ];

  const timeoutRaw = process.env.SHIP2U_CYPRESS_TIMEOUT_MS;
  const parsedTimeout = timeoutRaw != null ? Number(String(timeoutRaw).trim()) : NaN;
  const timeoutMs = Number.isFinite(parsedTimeout)
    ? Math.min(Math.max(parsedTimeout, 30000), 1800000)
    : DEFAULT_TIMEOUT_MS;

  const header = `[ship2u-cypress] orderId=${orderId} variant=${variant} spec=${specPath} started=${new Date().toISOString()}\nrecipient_file=${tmp}\nlog_file=${logPath}\n---\n`;
  logStream.write(header);

  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalLen = 0;
    let settled = false;
    let timer = null;

    const finishTimer = () => {
      if (timer != null) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const settle = (fn) => {
      if (settled) return;
      settled = true;
      finishTimer();
      fn();
    };

    const pushChunk = (d) => {
      try {
        logStream.write(d);
      } catch (_) {
        /* noop */
      }
      chunks.push(d);
      totalLen += d.length;
      while (totalLen > MAX_LOG_CAPTURE && chunks.length > 1) {
        const first = chunks.shift();
        totalLen -= first.length;
      }
    };

    const finalizeWith = (cb) => {
      logStream.write(`\n---\n[ship2u-cypress] ended=${new Date().toISOString()}\n`);
      logStream.end(() => {
        const fromFile = readTailFromFile(logPath);
        const fallbackTail = tailFromChunks(chunks);
        const logTail = fromFile || fallbackTail;
        const logFileRelative = path.relative(BACKEND_ROOT, logPath);
        cb(logTail, logFileRelative);
      });
    };

    const child = spawn('npx', args, {
      cwd: CY_PROJECT_DIR,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    child.stdout?.on('data', pushChunk);
    child.stderr?.on('data', pushChunk);

    timer = setTimeout(() => {
      try {
        child.kill('SIGTERM');
      } catch (_) {
        /* noop */
      }
      const err = new Error(
        `Cypress ultrapassou o tempo limite (${Math.round(timeoutMs / 1000)}s).`,
      );
      err.timedOut = true;
      settle(() =>
        finalizeWith((logTail) => {
          err.logTail = logTail;
          err.logFile = logPath;
          err.logFileRelative = path.relative(BACKEND_ROOT, logPath);
          reject(err);
        }),
      );
    }, timeoutMs);

    child.on('error', (err) => {
      settle(() =>
        finalizeWith((logTail) => {
          err.logTail = logTail;
          err.logFile = logPath;
          err.logFileRelative = path.relative(BACKEND_ROOT, logPath);
          reject(err);
        }),
      );
    });

    child.on('close', (code, signal) => {
      const msg =
        code != null
          ? `Cypress terminou com código ${code}.`
          : `Cypress terminou com sinal ${signal || '?'}.`;
      settle(() =>
        finalizeWith((logTail, logFileRelative) => {
          if (code === 0) {
            resolve({
              exitCode: 0,
              logFile: logPath,
              logFileRelative,
              logTail,
            });
            return;
          }
          const err = new Error(msg);
          err.exitCode = code;
          err.signal = signal;
          err.logTail = logTail;
          err.logFile = logPath;
          err.logFileRelative = logFileRelative;
          reject(err);
        }),
      );
    });
  });
}

module.exports = { runAndWait, BACKEND_ROOT, CY_PROJECT_DIR, SHIP2U_SPECS };
