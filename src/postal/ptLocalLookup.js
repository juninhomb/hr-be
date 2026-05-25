/**
 * Lookup de códigos postais Portugal a partir do ficheiro estático gerado pelo script
 * `npm run build:postal-data` (dados CC-BY derivados dos ficheiros CTT via Central de Dados).
 * Sem quotas HTTP nem chave de API — ideal para checkout em produção.
 */

const fs = require('fs');
const path = require('path');

const UNLOADED = Symbol('unload');

/** @type {Record<string,{city:string|null,district:string|null,municipality:string|null,parish:string|null,streets:string[]}>|null|symbol} */
let localIndex = UNLOADED;
let warnedMissing = false;

function indexCandidates() {
  const root = path.join(__dirname, '../..');
  const out = [];
  const envPath = process.env.PT_POSTAL_LOOKUP_PATH?.trim();
  if (envPath) out.push(envPath);
  out.push(path.join(root, 'data', 'pt-postal-lookup.json'));
  return out;
}

function ensureLoaded() {
  if (localIndex !== UNLOADED) return;

  localIndex = null;
  const candidates = indexCandidates();

  for (const p of candidates) {
    try {
      if (!fs.existsSync(p)) continue;
      const raw = fs.readFileSync(p, 'utf8');
      const data = JSON.parse(raw);
      if (data && typeof data === 'object' && Object.keys(data).length > 0) {
        localIndex = data;
        // eslint-disable-next-line no-console
        console.info(
          `[pt-local] Índice de CP carregado: ${Object.keys(data).length.toLocaleString()} códigos (${p})`
        );
        return;
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(`[pt-local] Falhou ler ${p}:`, e.message);
    }
  }

  if (!warnedMissing) {
    warnedMissing = true;
    // eslint-disable-next-line no-console
    console.warn(
      '[pt-local] Sem `data/pt-postal-lookup.json`. Corre `npm run build:postal-data` no backend (ver .env.example).'
    );
  }
}

/**
 * Devolve entrada normalizada para o formato do checkout/admin ou `null`.
 * Se o índice local não existe (ficheiro ausente): `undefined` (tratado pelo caller como “sem dados locais”).
 * Se índice existe mas CP não consta: `null` (“CP não encontrado”).
 *
 * @param {string} cp Formato XXXX-XXX
 */
function lookupPtPostalRecord(cp) {
  ensureLoaded();

  const key = normalizePtCpKey(cp);
  if (!key) return undefined;

  if (localIndex == null) {
    return undefined;
  }

  return localIndex[key] ?? null;
}

function normalizePtCpKey(cp) {
  const digits = String(cp || '').replace(/\D/g, '');
  if (digits.length !== 7) return null;
  return `${digits.slice(0, 4)}-${digits.slice(4)}`;
}

function isLocalIndexInstalled() {
  ensureLoaded();
  return localIndex != null && typeof localIndex === 'object' && Object.keys(localIndex).length > 0;
}

/**
 * Transforma entrada do índice no payload público já usado pelo storefront.
 *
 * @param {string} cp
 * @param {{city:string|null,district:string|null,municipality:string|null,parish:string|null,streets:string[]}} row
 */
function toPublicPostalPayload(cp, row) {
  const streets = Array.isArray(row.streets) ? [...new Set(row.streets.map((s) => String(s || '').trim()).filter(Boolean))] : [];
  return {
    postal_code: cp,
    city: row.city || null,
    district: row.district || null,
    municipality: row.municipality || null,
    parish: row.parish || null,
    country: 'PT',
    street_suggestion: streets[0] || null,
    street_candidates: streets.slice(0, 20),
  };
}

module.exports = {
  lookupPtPostalRecord,
  isLocalIndexInstalled,
  toPublicPostalPayload,
};
