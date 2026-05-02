/**
 * Chave canónica na base de dados: **apenas dígitos**, 10–15 caracteres (inclui
 * código de país sem o '+' — ex.: 351964333772).
 *
 * Normalizações extra (evita clientes duplicados no CRM):
 * - Remove prefixo internacional repetido `00` enquanto fizer sentido.
 * - Telemóvel PT nacional (9 dígitos começados por 9) → prefixa `351`.
 */

function canonicalWhatsappNumber(raw) {
  if (raw == null) return null;
  let digits = String(raw).replace(/\D/g, '');
  if (!digits) return null;

  while (digits.startsWith('00') && digits.length > 10) {
    digits = digits.slice(2);
  }

  if (digits.length === 9 && /^9[0-9]{8}$/.test(digits)) {
    digits = `351${digits}`;
  }

  if (digits.length < 10 || digits.length > 15) return null;
  return digits;
}

function assertValidWhatsappOrThrow(raw, messagePrefix = 'WhatsApp inválido') {
  const c = canonicalWhatsappNumber(raw);
  if (!c) {
    const err = new Error(`${messagePrefix} — indica 10–15 dígitos com país (ex.: 351964333772).`);
    err.status = 400;
    throw err;
  }
  return c;
}

module.exports = {
  canonicalWhatsappNumber,
  assertValidWhatsappOrThrow,
};
