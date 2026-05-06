/**
 * Origens e validação de redirects Stripe Checkout (site público + PDV).
 */

function configError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

function throwConfigError(status, message) {
  throw configError(status, message);
}

function parseAllowedOriginEntry(entry) {
  const t = String(entry).trim();
  if (!t) return null;
  try {
    const u = t.includes('://') ? t : `https://${t}`;
    return new URL(u).origin;
  } catch {
    throwConfigError(
      500,
      `Origem Stripe inválida na configuração: "${t}". Usa URL completa (ex.: https://hrstorept.com).`,
    );
  }
}

/**
 * Origens permitidas nos redirects do Stripe Checkout (anti open-redirect).
 *
 * - STRIPE_CHECKOUT_ALLOWED_ORIGINS — vírgulas; cada entrada vira `origin`.
 * - STRIPE_PUBLIC_SITE_ORIGIN — URL base do site (opcional).
 * - STRIPE_ADMIN_PUBLIC_ORIGIN — URL base do backoffice (opcional; merge na lista).
 *
 * Em produção é obrigatório pelo menos uma das duas primeiras. Em não‑produção, sem config
 * aceita-se localhost:3002 (site) e localhost:3000 (admin Next por defeito).
 */
function getStripeCheckoutAllowedOrigins() {
  /** @type {string[]} */
  const out = [];
  const raw = process.env.STRIPE_CHECKOUT_ALLOWED_ORIGINS?.trim();
  if (raw) {
    for (const part of raw.split(',')) {
      const o = parseAllowedOriginEntry(part);
      if (o) out.push(o);
    }
  }
  const single = process.env.STRIPE_PUBLIC_SITE_ORIGIN?.trim();
  if (single) {
    const o = parseAllowedOriginEntry(single);
    if (o) out.push(o);
  }
  const adminSingle = process.env.STRIPE_ADMIN_PUBLIC_ORIGIN?.trim();
  if (adminSingle) {
    const o = parseAllowedOriginEntry(adminSingle);
    if (o) out.push(o);
  }
  let dedup = [...new Set(out)];
  if (dedup.length > 0) return dedup;
  if (process.env.NODE_ENV === 'production') {
    return [];
  }
  return [
    'http://localhost:3002',
    'http://127.0.0.1:3002',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ];
}

/**
 * @param {string} successUrl
 * @param {string} cancelUrl
 */
function assertStripeCheckoutRedirects(successUrl, cancelUrl) {
  if (!successUrl || !cancelUrl) {
    throwConfigError(400, 'success_url e cancel_url são obrigatórios.');
  }
  if (!String(successUrl).includes('{CHECKOUT_SESSION_ID}')) {
    throwConfigError(
      400,
      'success_url deve incluir o placeholder {CHECKOUT_SESSION_ID} (exigência Stripe).',
    );
  }

  const allowed = getStripeCheckoutAllowedOrigins();
  if (allowed.length === 0) {
    throwConfigError(
      500,
      'Stripe activo: define STRIPE_CHECKOUT_ALLOWED_ORIGINS (lista separada por vírgulas) '
        + 'e/ou STRIPE_PUBLIC_SITE_ORIGIN com a mesma origem que o browser usa ao abrir o checkout '
        + '(ex.: https://hrstorept.com e https://www.hrstorept.com se usares os dois).',
    );
  }

  for (const [name, rawVal] of [['success_url', successUrl], ['cancel_url', cancelUrl]]) {
    const u = String(rawVal);
    const safe = u.includes('{CHECKOUT_SESSION_ID}')
      ? u.split('{CHECKOUT_SESSION_ID}').join('cs_placeholder_123')
      : u;
    let origin;
    try {
      origin = new URL(safe).origin;
    } catch {
      throwConfigError(400, `${name} inválido.`);
    }
    if (!allowed.includes(origin)) {
      throwConfigError(
        400,
        `${name}: origem "${origin}" não autorizada. Origens aceites neste servidor: ${allowed.join(', ')}.`,
      );
    }
  }
}

/**
 * URLs por defeito do site público (sucesso / cancelar) para Checkout Stripe.
 * Usado pelo PDV quando o operador gera link sem passar URLs no body.
 *
 * @returns {{ successUrl: string, cancelUrl: string }}
 */
function buildDefaultSiteStripeCheckoutUrls() {
  const allowed = getStripeCheckoutAllowedOrigins();
  if (allowed.length === 0) {
    throwConfigError(
      500,
      'Define STRIPE_CHECKOUT_ALLOWED_ORIGINS e/ou STRIPE_PUBLIC_SITE_ORIGIN para gerar links Stripe.',
    );
  }
  let origin = allowed[0];
  const single = process.env.STRIPE_PUBLIC_SITE_ORIGIN?.trim();
  if (single) {
    try {
      const o = new URL(single.includes('://') ? single : `https://${single}`).origin;
      if (allowed.includes(o)) {
        origin = o;
      }
    } catch {
      /* ignore */
    }
  }
  const successUrl = `${origin}/checkout/sucesso?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${origin}/checkout`;
  assertStripeCheckoutRedirects(successUrl, cancelUrl);
  return { successUrl, cancelUrl };
}

/**
 * URLs de regresso ao backoffice após Checkout Stripe iniciado no PDV.
 * Requer STRIPE_ADMIN_PUBLIC_ORIGIN (ex.: https://admin.loja.pt) em produção;
 * em desenvolvimento usa http://localhost:3000 se a variável estiver vazia.
 */
function buildAdminPdvStripeCheckoutUrls() {
  let origin = null;
  const raw = process.env.STRIPE_ADMIN_PUBLIC_ORIGIN?.trim();
  if (raw) {
    try {
      origin = new URL(raw.includes('://') ? raw : `https://${raw}`).origin;
    } catch {
      throwConfigError(
        500,
        `STRIPE_ADMIN_PUBLIC_ORIGIN inválido: "${raw}". Usa URL completa (ex.: https://admin.hrstorept.com).`,
      );
    }
  } else if (process.env.NODE_ENV !== 'production') {
    origin = 'http://localhost:3000';
  } else {
    throwConfigError(
      500,
      'Define STRIPE_ADMIN_PUBLIC_ORIGIN com a origem pública do backoffice (ex.: https://admin.hrstorept.com) '
        + 'para o Stripe redireccionar para a página de confirmação do PDV.',
    );
  }

  const allowed = getStripeCheckoutAllowedOrigins();
  if (!allowed.includes(origin)) {
    throwConfigError(
      500,
      `A origem do admin (${origin}) tem de constar em STRIPE_CHECKOUT_ALLOWED_ORIGINS. `
        + 'Adiciona-a à lista (vírgulas) junto com o site público.',
    );
  }

  const successUrl = `${origin}/dashboard/pdv-stripe-return?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${origin}/dashboard/pdv-stripe-return?canceled=1`;
  assertStripeCheckoutRedirects(successUrl, cancelUrl);
  return { successUrl, cancelUrl };
}

module.exports = {
  getStripeCheckoutAllowedOrigins,
  assertStripeCheckoutRedirects,
  buildDefaultSiteStripeCheckoutUrls,
  buildAdminPdvStripeCheckoutUrls,
};
