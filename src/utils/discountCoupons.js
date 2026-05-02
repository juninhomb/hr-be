/**
 * Resolução de cupões para o checkout público.
 *
 * 1) Tabela `discount_coupons` (cupões activos) — geridos em Configurações no admin.
 * 2) Se não houver nenhum cupão activo na BD: fallback opcional `HRSTORE_DISCOUNT_COUPONS`
 *    (mesmo formato que antes: CODE:p:10|CODE:f:5).
 */

function parseOneEnvSegment(segment) {
  const parts = String(segment)
    .trim()
    .split(':')
    .map((s) => s.trim());
  if (parts.length !== 3) return null;
  const [codeRaw, typeRaw, valStr] = parts;
  const code = codeRaw.toUpperCase();
  if (!code || code.length > 48) return null;
  const val = Number.parseFloat(String(valStr).replace(',', '.'));
  if (!Number.isFinite(val) || val <= 0) return null;
  const t = typeRaw.toLowerCase();
  if (t === 'p' || t === 'percent') {
    if (val > 100) return null;
    return { code, kind: 'percent', value: val };
  }
  if (t === 'f' || t === 'fixed') {
    return { code, kind: 'fixed', value: val };
  }
  return null;
}

function rulesFromEnv() {
  const raw = process.env.HRSTORE_DISCOUNT_COUPONS?.trim();
  if (!raw) return [];
  return raw
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean)
    .map(parseOneEnvSegment)
    .filter(Boolean);
}

/**
 * @param {import('pg').PoolClient | import('pg').Pool} dbOrClient
 * @returns {Promise<{ code: string, kind: 'percent'|'fixed', value: number }[]>}
 */
async function fetchActiveRulesFromDb(dbOrClient) {
  try {
    const { rows } = await dbOrClient.query(
      `SELECT UPPER(TRIM(code)) AS code, kind, value::float8 AS value
         FROM discount_coupons
        WHERE is_active = true`,
    );
    return rows
      .filter((r) => r.code && (r.kind === 'percent' || r.kind === 'fixed'))
      .map((r) => ({
        code: String(r.code),
        kind: r.kind,
        value: Number(r.value),
      }))
      .filter((r) => Number.isFinite(r.value) && r.value > 0);
  } catch (e) {
    if (e.code === '42P01') return [];
    throw e;
  }
}

async function getRulesForResolve(dbOrClient) {
  const fromDb = await fetchActiveRulesFromDb(dbOrClient);
  if (fromDb.length) return fromDb;
  return rulesFromEnv();
}

/**
 * @param {{ code: string, kind: 'percent'|'fixed', value: number }[]} rules
 * @param {string} rawCode
 * @param {number} itemsSubtotalEur
 * @returns {null | { code: string, discountAmount: number }}
 */
function resolveCouponWithRules(rules, rawCode, itemsSubtotalEur) {
  if (!rules.length) return null;
  const needle = String(rawCode || '').trim().toUpperCase();
  if (!needle) return null;
  const rule = rules.find((r) => r.code === needle);
  if (!rule) return null;
  const sub = Number(itemsSubtotalEur);
  if (!Number.isFinite(sub) || sub <= 0) return null;

  let discount =
    rule.kind === 'percent'
      ? sub * (rule.value / 100)
      : Math.min(rule.value, sub - 0.01);

  if (rule.kind === 'percent') {
    discount = Math.min(discount, Math.max(0, sub - 0.01));
  }

  discount = Math.round(discount * 100) / 100;
  if (discount < 0.005) return null;
  return { code: rule.code, discountAmount: discount };
}

/**
 * @param {import('pg').PoolClient | import('pg').Pool} dbOrClient
 */
async function resolveCoupon(dbOrClient, rawCode, itemsSubtotalEur) {
  const rules = await getRulesForResolve(dbOrClient);
  return resolveCouponWithRules(rules, rawCode, itemsSubtotalEur);
}

module.exports = {
  resolveCoupon,
  resolveCouponWithRules,
  /** @internal */
  _getRulesForResolve: getRulesForResolve,
};
