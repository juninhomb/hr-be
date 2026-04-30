const db = require('../config/db');
const PtLocal = require('../postal/ptLocalLookup');

/**
 * Lookup + cálculo de tarifas de envio.
 *
 * Centraliza:
 *  - CRUD da tabela `shipping_zones` (admin).
 *  - Resolver a zona aplicável dado um {country, postal_code}.
 *  - Calcular o valor final do frete (com `free_above_eur`).
 *  - Lookup de código postal Portugal:
 *       1) ficheiro local `data/pt-postal-lookup.json` gerado pelo script oficial
 *          (Central de Dados → dados derivados dos CTT, sem quotas HTTP nem subscrições);
 *       2) opcionalmente json.geoapi.pt se GEOAPI_PT_API_KEY estiver definida;
 *       3) resposta degradada manual se não houver ficheiro nem chave GeoAPI.
 *    Cache em RAM para todas as variantes acima.
 *
 * Toda a chamada feita pelo storefront ao calcular frete passa por aqui;
 * o publicService NUNCA usa valores enviados pelo cliente.
 */
class ShippingService {
  // -------------------------------------------------------------
  // Listagens
  // -------------------------------------------------------------

  async listAll({ activeOnly = false } = {}) {
    const where = activeOnly ? 'WHERE is_active = true' : '';
    const { rows } = await db.query(`
      SELECT id, country_code, region, label, fee_eur::float AS fee_eur,
             free_above_eur::float AS free_above_eur, postal_code_prefix,
             sort_order, is_active, requires_whatsapp_checkout, updated_at
        FROM shipping_zones
        ${where}
        ORDER BY sort_order ASC, country_code ASC, id ASC
    `);
    return rows;
  }

  async getById(id) {
    const { rows } = await db.query(
      `SELECT id, country_code, region, label, fee_eur::float AS fee_eur,
              free_above_eur::float AS free_above_eur, postal_code_prefix,
              sort_order, is_active, requires_whatsapp_checkout, updated_at
         FROM shipping_zones WHERE id = $1`,
      [parseInt(id, 10)]
    );
    return rows[0] || null;
  }

  // -------------------------------------------------------------
  // Resolver zona / calcular frete
  // -------------------------------------------------------------

  /**
   * Devolve a zona ATIVA mais específica que cobre `country + postal_code`.
   * Estratégia:
   *   1) match exato pelo país (case-insensitive)
   *   2) entre essas, escolhe a que tem o `postal_code_prefix` mais longo
   *      que ainda é prefixo do CP fornecido
   *   3) se nenhum prefix der match, usa a zona com prefix vazio (catch-all
   *      do país, ex.: PT continental).
   *
   * Devolve `null` se não houver nenhuma zona ativa para o país.
   */
  async resolveZone({ country, postal_code }) {
    if (!country) return null;
    const cc = String(country).trim().toUpperCase();
    const cp = (postal_code || '').replace(/\s+/g, '');

    // Carrega todas as zonas ativas do país, ordenadas pelo prefix
    // mais específico primeiro (mais longo), e depois sort_order.
    const { rows } = await db.query(
      `SELECT id, country_code, region, label, fee_eur::float AS fee_eur,
              free_above_eur::float AS free_above_eur, postal_code_prefix,
              sort_order, requires_whatsapp_checkout
         FROM shipping_zones
        WHERE is_active = true AND upper(country_code) = $1
        ORDER BY length(coalesce(postal_code_prefix, '')) DESC,
                 sort_order ASC, id ASC`,
      [cc]
    );
    if (!rows.length) return null;

    for (const z of rows) {
      const prefix = (z.postal_code_prefix || '').trim();
      if (!prefix) return z; // catch-all do país (após esgotar prefixos)
      if (cp && cp.startsWith(prefix)) return z;
    }
    // Não havia catch-all e nenhum prefix deu match
    return rows[rows.length - 1] || null;
  }

  /**
   * Calcula o frete a aplicar dado um país, código postal e subtotal.
   * Devolve `{ fee, zone, free_shipping_applied }`.
   *
   * Se `subtotal >= zone.free_above_eur`, fee = 0.
   * Se não houver zona aplicável, devolve null fee (caller decide o erro).
   */
  async computeFee({ country, postal_code, subtotal = 0 }) {
    const zone = await this.resolveZone({ country, postal_code });
    if (!zone) {
      return { fee: null, zone: null, free_shipping_applied: false };
    }
    let fee = Number(zone.fee_eur) || 0;
    let freeApplied = false;
    if (zone.free_above_eur != null && Number(subtotal) >= Number(zone.free_above_eur)) {
      fee = 0;
      freeApplied = true;
    }
    return { fee, zone, free_shipping_applied: freeApplied };
  }

  // -------------------------------------------------------------
  // CRUD admin
  // -------------------------------------------------------------

  async create(data) {
    const z = sanitizeZoneInput(data);
    const { rows } = await db.query(
      `INSERT INTO shipping_zones
        (country_code, region, label, fee_eur, free_above_eur,
         postal_code_prefix, sort_order, is_active, requires_whatsapp_checkout)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id`,
      [z.country_code, z.region, z.label, z.fee_eur, z.free_above_eur,
       z.postal_code_prefix, z.sort_order, z.is_active,
       z.requires_whatsapp_checkout ?? false]
    );
    return this.getById(rows[0].id);
  }

  async update(id, data) {
    const z = sanitizeZoneInput(data, { partial: true });
    const updates = [];
    const params = [];
    let idx = 1;
    for (const [col, val] of Object.entries(z)) {
      updates.push(`${col} = $${idx++}`);
      params.push(val);
    }
    if (!updates.length) return this.getById(id);
    params.push(parseInt(id, 10));
    const { rowCount } = await db.query(
      `UPDATE shipping_zones SET ${updates.join(', ')} WHERE id = $${idx}`,
      params
    );
    if (!rowCount) return null;
    return this.getById(id);
  }

  async destroy(id) {
    const { rowCount } = await db.query(
      `DELETE FROM shipping_zones WHERE id = $1`,
      [parseInt(id, 10)]
    );
    return rowCount > 0;
  }

  // -------------------------------------------------------------
  // Lookup código postal Portugal (dataset local OU GeoAPI opcional)
  // -------------------------------------------------------------

  async lookupPortugalPostalCode(rawCp) {
    const cp = normalizePtCp(rawCp);
    if (!cp) {
      const err = new Error('Código postal inválido. Usa o formato XXXX-XXX.');
      err.status = 400;
      throw err;
    }

    const cached = cpCache.get(cp);
    if (cached && Date.now() < cached.freshUntil) {
      return { ...cached.value, lookup_stale: false, lookup_degraded: false };
    }

    const inflightKey = cp;
    if (cpInflight.has(inflightKey)) {
      return cpInflight.get(inflightKey);
    }

    const promise = this._resolvePostalLookup(cp, cached?.value || null);
    cpInflight.set(inflightKey, promise);
    try {
      return await promise;
    } finally {
      cpInflight.delete(inflightKey);
    }
  }

  /**
   * 1º índice local (Open Data Portugal). Opcional geoapi com chave. Degradado se nada existe.
   */
  async _resolvePostalLookup(cp, staleFallback) {
    const loc = PtLocal.lookupPtPostalRecord(cp);
    const hasLocal = PtLocal.isLocalIndexInstalled();

    if (loc) {
      const normalized = PtLocal.toPublicPostalPayload(cp, loc);
      cpCache.set(cp, {
        value: stripLookupFlags(normalized),
        freshUntil: Date.now() + CP_CACHE_FRESH_MS_OK,
      });
      if (cpCache.size > CP_CACHE_MAX) trimCache();
      return { ...normalized, lookup_stale: false, lookup_degraded: false };
    }

    if (hasLocal && loc === null) {
      const err = new Error('Código postal não encontrado.');
      err.status = 404;
      throw err;
    }

    const useGeoApi = Boolean((process.env.GEOAPI_PT_API_KEY || '').trim());
    if (useGeoApi) {
      return this._lookupPostalViaGeoApi(cp, staleFallback);
    }

    const fallback = buildDegradedCpResponse(cp);
    cpCache.set(cp, {
      value: stripLookupFlags(fallback),
      freshUntil: Date.now() + CP_CACHE_FRESH_MS_FAIL,
    });
    if (cpCache.size > CP_CACHE_MAX) trimCache();
    return { ...fallback, lookup_stale: false, lookup_degraded: true };
  }

  /**
   * Pedido HTTP + normalização. Usa cache stale e resposta "degradada" quando
   * json.geoapi.pt limita pedidos (429) — apenas se GEOAPI_PT_API_KEY estiver definido.
   */
  async _lookupPostalViaGeoApi(cp, staleFallback) {
    let payload;
    let res;
    try {
      res = await fetchGeoCpJson(cp);
      if (res.status === 429) {
        await sleep(2200);
        res = await fetchGeoCpJson(cp);
      }
      if (res.status === 404) {
        const err = new Error('Código postal não encontrado.');
        err.status = 404;
        throw err;
      }
      if (!res.ok) {
        const fallback = staleFallback || buildDegradedCpResponse(cp);
        if (staleFallback) {
          cpCache.set(cp, {
            value: staleFallback,
            freshUntil: Date.now() + CP_CACHE_FRESH_MS_STALE,
          });
          return { ...staleFallback, lookup_stale: true, lookup_degraded: false };
        }
        cpCache.set(cp, {
          value: fallback,
          freshUntil: Date.now() + CP_CACHE_FRESH_MS_FAIL,
        });
        if (cpCache.size > CP_CACHE_MAX) trimCache();
        return { ...fallback, lookup_stale: false, lookup_degraded: true };
      }
      payload = await res.json();
    } catch (e) {
      if (e.status) throw e;
      const fallback = staleFallback || buildDegradedCpResponse(cp);
      if (staleFallback) {
        cpCache.set(cp, {
          value: staleFallback,
          freshUntil: Date.now() + CP_CACHE_FRESH_MS_STALE,
        });
        return { ...staleFallback, lookup_stale: true, lookup_degraded: false };
      }
      cpCache.set(cp, {
        value: fallback,
        freshUntil: Date.now() + CP_CACHE_FRESH_MS_FAIL,
      });
      if (cpCache.size > CP_CACHE_MAX) trimCache();
      return { ...fallback, lookup_stale: false, lookup_degraded: true };
    }

    const streetData = extractStreetDataFromCpPayload(payload);

    const normalized = {
      postal_code: cp,
      city: pickFirst(payload?.Localidade) || pickFirst(payload?.localidade) || null,
      district: pickFirst(payload?.Distrito) || pickFirst(payload?.distrito) || null,
      municipality:
        pickFirst(payload?.Município) ||
        pickFirst(payload?.municipio) ||
        pickFirst(payload?.['Município']) || null,
      parish: pickFirst(payload?.Freguesia) || pickFirst(payload?.freguesia) || null,
      country: 'PT',
      street_suggestion: streetData.street_suggestion,
      street_candidates: streetData.street_candidates,
    };

    cpCache.set(cp, {
      value: stripLookupFlags(normalized),
      freshUntil: Date.now() + CP_CACHE_FRESH_MS_OK,
    });
    if (cpCache.size > CP_CACHE_MAX) trimCache();
    return { ...normalized, lookup_stale: false, lookup_degraded: false };
  }
}

// =============================================================
// Helpers
// =============================================================

function sanitizeZoneInput(data, { partial = false } = {}) {
  const out = {};
  if (data.country_code !== undefined || !partial) {
    if (!data.country_code) throwField('country_code');
    out.country_code = String(data.country_code).trim().toUpperCase().slice(0, 2);
  }
  if (data.region !== undefined) {
    out.region = data.region ? String(data.region).trim().slice(0, 100) : null;
  }
  if (data.label !== undefined || !partial) {
    if (!data.label) throwField('label');
    out.label = String(data.label).trim().slice(0, 150);
  }
  if (data.fee_eur !== undefined || !partial) {
    const fee = Number(String(data.fee_eur ?? '').replace(',', '.'));
    if (!Number.isFinite(fee) || fee < 0) throwField('fee_eur');
    out.fee_eur = fee;
  }
  if (data.free_above_eur !== undefined) {
    if (data.free_above_eur === null || data.free_above_eur === '') {
      out.free_above_eur = null;
    } else {
      const v = Number(String(data.free_above_eur).replace(',', '.'));
      if (!Number.isFinite(v) || v < 0) throwField('free_above_eur');
      out.free_above_eur = v;
    }
  }
  if (data.postal_code_prefix !== undefined) {
    out.postal_code_prefix = data.postal_code_prefix
      ? String(data.postal_code_prefix).trim().slice(0, 10)
      : '';
  }
  if (data.sort_order !== undefined) {
    const n = parseInt(data.sort_order, 10);
    out.sort_order = Number.isFinite(n) ? n : 100;
  }
  if (data.is_active !== undefined) {
    out.is_active = Boolean(data.is_active);
  }
  if (data.requires_whatsapp_checkout !== undefined) {
    out.requires_whatsapp_checkout = Boolean(data.requires_whatsapp_checkout);
  }
  return out;
}

function throwField(name) {
  const err = new Error(`Campo "${name}" é obrigatório/ inválido.`);
  err.status = 400;
  throw err;
}

function normalizePtCp(input) {
  if (!input) return null;
  const digits = String(input).replace(/\D/g, '');
  if (digits.length !== 7) return null;
  return `${digits.slice(0, 4)}-${digits.slice(4)}`;
}

function pickFirst(v) {
  if (v == null) return null;
  if (Array.isArray(v)) return v[0] || null;
  return String(v);
}

/**
 * Extrai nomes de via a partir da resposta típica do /cp/{XXXX-XXX}
 * (partes[].Artéria, ruas[], pontos[].rua…).
 */
function extractStreetDataFromCpPayload(payload) {
  const collected = new Map();

  const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const add = (raw) => {
    const t = norm(raw);
    if (t.length < 3) return;
    const key = t.toLocaleLowerCase('pt-PT');
    if (!collected.has(key)) collected.set(key, t);
  };

  const partes = payload?.partes;
  if (Array.isArray(partes)) {
    for (const p of partes) {
      if (!p || typeof p !== 'object') continue;
      const artery =
        pickFirst(p.Artéria) ||
        pickFirst(p.arteria) ||
        pickFirst(p.Arruamento) ||
        pickFirst(p.arruamento);
      const troco = pickFirst(p.Troço) || pickFirst(p['Troço']) || pickFirst(p.troco);
      if (artery) {
        add(artery);
        if (troco) add(`${artery} (${troco})`);
      }
    }
  }

  const ruas = payload?.ruas;
  if (Array.isArray(ruas)) ruas.forEach((r) => add(r));

  const pontos = payload?.pontos;
  if (Array.isArray(pontos)) {
    for (const pt of pontos) {
      if (pt && typeof pt === 'object') add(pt.rua);
    }
  }

  add(pickFirst(payload?.Artéria) || pickFirst(payload?.artéria));

  const street_candidates = [...collected.values()].slice(0, 20);
  const street_suggestion = street_candidates[0] || null;
  return { street_candidates, street_suggestion };
}

function buildDegradedCpResponse(cp) {
  return {
    postal_code: cp,
    city: null,
    district: null,
    municipality: null,
    parish: null,
    country: 'PT',
    street_suggestion: null,
    street_candidates: [],
  };
}

function stripLookupFlags(obj) {
  const { lookup_stale: _a, lookup_degraded: _b, ...rest } = obj;
  return rest;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchGeoCpJson(cp) {
  const key = (process.env.GEOAPI_PT_API_KEY || '').trim();
  const url = `https://json.geoapi.pt/cp/${encodeURIComponent(cp)}`;
  const headers = { Accept: 'application/json' };
  let finalUrl = url;
  if (key) {
    headers['X-API-Key'] = key;
    const u = new URL(url);
    u.searchParams.set('api_key', key);
    finalUrl = u.toString();
  }
  return fetch(finalUrl, {
    signal: AbortSignal.timeout(8500),
    headers,
  });
}

// Cache por CP: resposta normalizada (sem flags efémeras lookup_*)
const CP_CACHE_FRESH_MS_OK = 24 * 60 * 60 * 1000;
const CP_CACHE_FRESH_MS_STALE = 2 * 60 * 60 * 1000;
const CP_CACHE_FRESH_MS_FAIL = 5 * 60 * 1000;
const CP_CACHE_MAX = 2500;
const cpCache = new Map();
const cpInflight = new Map();

function trimCache() {
  const sorted = [...cpCache.entries()].sort((a, b) => a[1].freshUntil - b[1].freshUntil);
  for (let i = 0; i < 150 && sorted[i]; i++) cpCache.delete(sorted[i][0]);
}

module.exports = new ShippingService();
