const nodemailer = require('nodemailer');
const { OAuth2Client } = require('google-auth-library');
const db = require('../config/db');
const orderPaymentConfirmed = require('../templates/email/orderPaymentConfirmed');
const orderPickupReady = require('../templates/email/orderPickupReady');

/** Token OAuth para SMTP Gmail / Google Workspace — cache em memória (processo). */
let cachedAccess = { token: null, expiryMs: 0 };

/** Senhas de app vêm como 4×4 caracteres — Gmail aceita sem espaços. */
function normalizeAppPassword(raw) {
  if (raw == null || raw === '') return '';
  return String(raw).replace(/\s+/g, '').trim();
}

/** Remetente: MAIL_FROM ou, em falta, o mesmo utilizador SMTP. */
function getMailFrom() {
  const user = process.env.GMAIL_USER?.trim();
  return process.env.MAIL_FROM?.trim() || user || '';
}

/** Modo SMTP com senha de app (Google Conta → Segurança → Senhas de app). */
function isAppPasswordConfigured() {
  const user = process.env.GMAIL_USER?.trim();
  const pass = normalizeAppPassword(process.env.GMAIL_APP_PASSWORD);
  const from = getMailFrom();
  return Boolean(user && pass && from);
}

function mailSendingEnabled() {
  const raw = process.env.MAIL_SENDING_ENABLED;
  if (raw == null || String(raw).trim() === '') return true;
  const v = String(raw).trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

function getGmailOAuthConfig() {
  const user = process.env.GMAIL_USER?.trim();
  const clientId = process.env.GMAIL_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GMAIL_OAUTH_CLIENT_SECRET?.trim();
  const refreshToken = process.env.GMAIL_OAUTH_REFRESH_TOKEN?.trim();
  return { user, clientId, clientSecret, refreshToken };
}

function isOAuthConfigured() {
  const c = getGmailOAuthConfig();
  const from = getMailFrom();
  return Boolean(
    c.user &&
    from &&
    c.clientId &&
    c.clientSecret &&
    c.refreshToken,
  );
}

function isMailConfigured() {
  return isAppPasswordConfigured() || isOAuthConfigured();
}

/**
 * Lista variáveis em falta (para mensagens de teste/diagnóstico).
 */
function missingMailEnvKeys() {
  if (isMailConfigured()) return [];

  const user = process.env.GMAIL_USER?.trim();
  const from = getMailFrom();
  const appPw = normalizeAppPassword(process.env.GMAIL_APP_PASSWORD);
  const c = getGmailOAuthConfig();

  /** @type {string[]} */
  const miss = [];
  if (!user) miss.push('GMAIL_USER');
  if (!from) miss.push('MAIL_FROM (ou apenas GMAIL_USER como remetente)');

  const oauthTriple = !!(c.clientId && c.clientSecret && c.refreshToken);
  if (!appPw && !oauthTriple) {
    miss.push(
      'GMAIL_APP_PASSWORD (senha de app Gmail) OU '
        + '(GMAIL_OAUTH_CLIENT_ID + GMAIL_OAUTH_CLIENT_SECRET + GMAIL_OAUTH_REFRESH_TOKEN)',
    );
  } else if (!appPw && (c.clientId || c.clientSecret || c.refreshToken) && !oauthTriple) {
    if (!c.clientId) miss.push('GMAIL_OAUTH_CLIENT_ID');
    if (!c.clientSecret) miss.push('GMAIL_OAUTH_CLIENT_SECRET');
    if (!c.refreshToken) miss.push('GMAIL_OAUTH_REFRESH_TOKEN');
  }

  return [...new Set(miss)];
}

async function getOAuthAccessToken() {
  const { clientId, clientSecret, refreshToken, user } = getGmailOAuthConfig();
  if (!clientId || !clientSecret || !refreshToken || !user) {
    throw new Error('Gmail OAuth: variáveis em falta (ver .env.example).');
  }

  const now = Date.now();
  if (cachedAccess.token && cachedAccess.expiryMs - 120_000 > now) {
    return cachedAccess.token;
  }

  const oauth2 = new OAuth2Client(clientId, clientSecret);
  oauth2.setCredentials({ refresh_token: refreshToken });
  const { credentials } = await oauth2.refreshAccessToken();

  const token = credentials.access_token;
  if (!token) {
    throw new Error('Gmail OAuth: não foi obtido access_token (ver refresh token / scopes).');
  }
  const exp = credentials.expiry_date ? Number(credentials.expiry_date) : now + 3_600_000;
  cachedAccess = { token, expiryMs: exp };
  return token;
}

/** Evita ficar pendente indefinidamente se a rede/firewall bloquear SMTP. */
const SMTP_TRANSPORT_OPTIONS = {
  connectionTimeout: Number(process.env.MAIL_SMTP_CONNECTION_TIMEOUT_MS) || 20_000,
  greetingTimeout: Number(process.env.MAIL_SMTP_GREETING_TIMEOUT_MS) || 20_000,
  socketTimeout: Number(process.env.MAIL_SMTP_SOCKET_TIMEOUT_MS) || 35_000,
};

/**
 * `service: 'gmail'` no Nodemailer usa porta 465 (TLS directo).
 * Em muitos servidores a 465 está bloqueada e a 587 (STARTTLS) funciona — por defeito usamos 587.
 */
function gmailSmtpConnectionOpts() {
  const host = process.env.MAIL_SMTP_HOST?.trim() || 'smtp.gmail.com';
  const rawPort = process.env.MAIL_SMTP_PORT?.trim();
  let port = rawPort !== undefined && rawPort !== ''
    ? parseInt(rawPort, 10)
    : 587;
  if (!Number.isFinite(port) || port < 1) port = 587;

  /** @type {boolean} */
  let secure;
  if (process.env.MAIL_SMTP_SECURE != null && String(process.env.MAIL_SMTP_SECURE).trim() !== '') {
    secure = /^1|true|yes$/i.test(String(process.env.MAIL_SMTP_SECURE).trim());
  } else {
    secure = port === 465;
  }

  return {
    host,
    port,
    secure,
    ...(secure ? {} : { requireTLS: true }),
  };
}

async function createTransport() {
  const user = process.env.GMAIL_USER?.trim();
  const appPw = normalizeAppPassword(process.env.GMAIL_APP_PASSWORD);
  if (appPw) {
    if (!user) {
      throw new Error('GMAIL_USER é obrigatório com senha de app.');
    }
    return nodemailer.createTransport({
      ...gmailSmtpConnectionOpts(),
      ...SMTP_TRANSPORT_OPTIONS,
      auth: {
        user,
        pass: appPw,
      },
    });
  }

  const { clientId, clientSecret, refreshToken } = getGmailOAuthConfig();
  const accessToken = await getOAuthAccessToken();
  return nodemailer.createTransport({
    ...gmailSmtpConnectionOpts(),
    ...SMTP_TRANSPORT_OPTIONS,
    auth: {
      type: 'OAuth2',
      user,
      clientId,
      clientSecret,
      refreshToken,
      accessToken,
    },
  });
}

function parseAddresses(raw) {
  if (!raw || typeof raw !== 'string') return undefined;
  const s = raw.trim();
  if (!s) return undefined;
  return s.split(',').map((p) => p.trim()).filter(Boolean);
}

/**
 * @param {{ to: string | string[], subject: string, text: string, html?: string, replyTo?: string }} opts
 */
async function sendMail(opts) {
  if (!mailSendingEnabled()) {
    throw new Error('Envio de e-mail desactivado (MAIL_SENDING_ENABLED=0).');
  }
  if (!isMailConfigured()) {
    throw new Error(`Configure e-mail (${missingMailEnvKeys().join(', ') || 'variáveis'}).`);
  }

  const mailFrom = getMailFrom();
  const transport = await createTransport();
  const replyTo = opts.replyTo || process.env.MAIL_REPLY_TO?.trim();

  await transport.sendMail({
    from: mailFrom,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
    ...(replyTo ? { replyTo: parseAddresses(replyTo) } : {}),
  });
}

/**
 * Pedido para o corpo do e-mail (JOIN mínimo, sem ciclo em orderService).
 */
async function fetchOrderForPaymentEmail(orderId) {
  const id = parseInt(orderId, 10);
  if (!Number.isFinite(id)) return null;

  const { rows: orows } = await db.query(
    `
    SELECT o.id, o.total_amount, o.status, o.is_delivery, o.payment_method,
           o.shipping_fee,
           c.full_name, c.email
      FROM orders o
      LEFT JOIN customers c ON c.id = o.customer_id
     WHERE o.id = $1
    `,
    [id],
  );
  if (!orows[0]) return null;

  const { rows: irows } = await db.query(
    `
    SELECT oi.sku, oi.quantity, oi.unit_price,
           COALESCE(p.name, oi.sku)::text AS product_name,
           v.color, v.size
      FROM order_items oi
      LEFT JOIN product_variants v ON v.id = oi.variant_id OR v.sku = oi.sku
      LEFT JOIN products p ON p.id = v.product_id
     WHERE oi.order_id = $1
     ORDER BY oi.id ASC
    `,
    [id],
  );

  const row = orows[0];
  const to = row.email?.trim();
  if (!to) return { ...row, items: irows, _skipReason: 'no_customer_email' };

  return {
    orderId: row.id,
    full_name: row.full_name,
    email: to,
    total_amount: row.total_amount,
    shipping_fee: row.shipping_fee,
    is_delivery: row.is_delivery,
    payment_method: row.payment_method,
    items: irows,
  };
}

function pickupStoreLines() {
  return {
    address: process.env.STORE_PICKUP_ADDRESS?.trim() || '',
    notes: process.env.STORE_PICKUP_NOTES?.trim() || '',
  };
}

async function notifyOrderPickupReadyById(orderId) {
  if (!mailSendingEnabled() || !isMailConfigured()) {
    const reason = mailSendingEnabled() ? 'not_configured' : 'disabled';
    throw new Error(
      reason === 'disabled'
        ? 'Envio desactivado (MAIL_SENDING_ENABLED).'
        : `E-mail não configurado (${missingMailEnvKeys().join(', ') || 'ver .env'}).`,
    );
  }

  const data = await fetchOrderForPaymentEmail(orderId);
  if (!data) throw new Error('Pedido não encontrado.');
  if (data._skipReason === 'no_customer_email') {
    console.warn('[email] pickup_ready: pedido sem email de cliente → abortado', { orderId });
    throw new Error('Cliente sem email no pedido.');
  }

  const { subject, text, html } = orderPickupReady.build({
    orderId: data.orderId,
    customerName: data.full_name,
    items: data.items,
    store: pickupStoreLines(),
  });

  await sendMail({ to: data.email, subject, text, html });
  console.log('[email] pickup_ready enviado', { orderId: data.orderId, to: data.email });
  return { sent: true, orderId: data.orderId };
}

async function notifyOrderPaymentConfirmedById(orderId) {
  if (!mailSendingEnabled() || !isMailConfigured()) {
    return { sent: false, reason: mailSendingEnabled() ? 'not_configured' : 'disabled' };
  }

  try {
    const data = await fetchOrderForPaymentEmail(orderId);
    if (!data) return { sent: false, reason: 'order_not_found' };
    if (data._skipReason === 'no_customer_email') {
      console.warn('[email] pedido sem email de cliente → omitido', { orderId });
      return { sent: false, reason: 'no_customer_email' };
    }

    const { subject, text, html } = orderPaymentConfirmed.build({
      orderId: data.orderId,
      customerName: data.full_name,
      totalAmount: data.total_amount,
      shippingFee: data.shipping_fee,
      isDelivery: data.is_delivery,
      items: data.items,
    });

    await sendMail({ to: data.email, subject, text, html });
    console.log('[email] payment_confirmed enviado', { orderId: data.orderId, to: data.email });
    return { sent: true, orderId: data.orderId };
  } catch (err) {
    console.error('[email] payment_confirmed falhou', orderId, err?.message || err);
    throw err;
  }
}

/**
 * Chamadas após transacções DB bem-sucedidas: não deve bloquear a resposta nem falhar o fluxo.
 */
function scheduleNotifyOrderPaymentConfirmed(orderId) {
  const id = parseInt(orderId, 10);
  if (!Number.isFinite(id)) return;
  if (!mailSendingEnabled() || !isMailConfigured()) return;

  setImmediate(() => {
    notifyOrderPaymentConfirmedById(id).catch(() => {});
  });
}

async function sendTestMail(toRaw) {
  const to =
    String(toRaw || process.env.MAIL_TEST_TO || '')
      .trim()
      || getGmailOAuthConfig().user;
  if (!to) throw new Error('Destinatário em falta: body `{ "to": "..." }` ou MAIL_TEST_TO/GMAIL_USER.');

  await sendMail({
    to,
    subject: '[HR Store] Teste de e-mail (Gmail)',
    text: 'Este é um e-mail de teste enviado pelo backend HR Store (Gmail SMTP: senha de app ou OAuth2).\n',
    html:
      '<p>Este é um e-mail de <strong>teste</strong> enviado pelo backend HR Store '
      + '(Gmail: senha de app ou OAuth).</p>',
  });
  return { to };
}

module.exports = {
  isMailConfigured,
  missingMailEnvKeys,
  mailSendingEnabled,
  sendMail,
  notifyOrderPaymentConfirmedById,
  notifyOrderPickupReadyById,
  scheduleNotifyOrderPaymentConfirmed,
  sendTestMail,
};
