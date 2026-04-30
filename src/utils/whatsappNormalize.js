/**
 * Chave canónica na base de dados: **apenas dígitos**, 10–15 caracteres (inclui
 * código de país sem o '+' — ex.: 351964333772). Evita duplicados +351… vs 351….
 */

function canonicalWhatsappNumber(raw) {
  if (raw == null) return null;
  const digits = String(raw).replace(/\D/g, '');
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
