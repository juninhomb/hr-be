const { parsePhoneNumberFromString } = require('libphonenumber-js/max');

const DEFAULT_COUNTRY = 'PT';

function digitsOnly(s) {
  return String(s ?? '').replace(/\D/g, '');
}

/** Ordem: internacional explícito → E.164 só dígitos (ex.: 351… sem +) → número nacional com país do formulário. */
function parseFirstValidNumber(trimmed, defaultCountry) {
  let p = parsePhoneNumberFromString(trimmed);
  if (p && p.isValid()) return p;
  const d = digitsOnly(trimmed);
  if (d.length >= 10 && d.length <= 15) {
    p = parsePhoneNumberFromString(`+${d}`);
    if (p && p.isValid()) return p;
  }
  p = parsePhoneNumberFromString(trimmed, defaultCountry);
  if (p && p.isValid()) return p;
  return undefined;
}

/**
 * Canonical WhatsApp / phone for API + DB: digits only, no "+", E.164 without plus (10–15 digits).
 * Uses libphonenumber-js; falls back to legacy PT heuristic (9 digits starting with 9 → 351).
 *
 * @param {string} raw
 * @param {string} [defaultCountry] ISO 3166-1 alpha-2 (e.g. PT, ES, BR)
 * @returns {string}
 */
function canonicalWhatsappNumber(raw, defaultCountry = DEFAULT_COUNTRY) {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return '';

  const dc = String(defaultCountry || DEFAULT_COUNTRY).trim().toUpperCase().slice(0, 2) || DEFAULT_COUNTRY;
  const parsed = parseFirstValidNumber(trimmed, dc);
  if (parsed) {
    return String(parsed.number.replace('+', '')).replace(/\D/g, '');
  }

  let d = digitsOnly(trimmed);
  while (d.startsWith('00') && d.length > 2) d = d.slice(2);

  if (dc === 'PT' && /^9\d{8}$/.test(d)) {
    d = `351${d}`;
  }

  return d;
}

/**
 * @param {string} raw
 * @param {string} [messagePrefix]
 * @param {string} [defaultCountry]
 */
function assertValidWhatsappOrThrow(raw, messagePrefix = 'WhatsApp inválido', defaultCountry = DEFAULT_COUNTRY) {
  const c = canonicalWhatsappNumber(raw, defaultCountry);
  if (!/^[0-9]{10,15}$/.test(c)) {
    const err = new Error(`${messagePrefix}: use o indicativo do país (ex.: +351… ou +34…) ou um número válido.`);
    err.status = 400;
    err.statusCode = 400;
    throw err;
  }
  return c;
}

/**
 * National significant number digits from stored international digits (no "+").
 * For Ship2u / forms that expect national format.
 *
 * @param {string} intlDigits
 * @returns {string}
 */
function nationalNumberDigitsForIntlE164(intlDigits) {
  const d = digitsOnly(intlDigits);
  if (!d) return '';
  const p = parsePhoneNumberFromString(`+${d}`);
  if (p && p.isValid()) return String(p.nationalNumber || '').replace(/\D/g, '');
  return d;
}

module.exports = {
  canonicalWhatsappNumber,
  assertValidWhatsappOrThrow,
  nationalNumberDigitsForIntlE164,
};
