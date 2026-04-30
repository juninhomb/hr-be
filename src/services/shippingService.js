const db = require('../config/db');

/**
 * Lookup + cálculo de tarifas de envio.
 *
 * Centraliza:
 *  - CRUD da tabela `shipping_zones` (admin).
 *  - Resolver a zona aplicável dado um {country, postal_code}.
 *  - Calcular o valor final do frete (com `free_above_eur`).
 *  - Lookup de código postal Português via json.geoapi.pt
 *    (open-source, sem chave) com cache em memória.
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
  // Lookup de código postal (json.geoapi.pt) com cache TTL
  // -------------------------------------------------------------

  async lookupPortugalPostalCode(rawCp) {
    const cp = normalizePtCp(rawCp);
    if (!cp) {
      const err = new Error('Código postal inválido. Usa o formato XXXX-XXX.');
      err.status = 400;
      throw err;
    }

    const cached = cpCache.get(cp);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    let payload;
    try {
      const res = await fetch(`https://json.geoapi.pt/cp/${cp}`, {
        // Timeout simples: AbortController em 5s
        signal: AbortSignal.timeout(5000),
        headers: { 'Accept': 'application/json' },
      });
      if (res.status === 404) {
        const err = new Error('Código postal não encontrado.');
        err.status = 404;
        throw err;
      }
      if (!res.ok) {
        const err = new Error(`GeoAPI devolveu ${res.status}`);
        err.status = 502;
        throw err;
      }
      payload = await res.json();
    } catch (e) {
      if (e.status) throw e;
      const err = new Error('Não foi possível verificar o código postal agora.');
      err.status = 503;
      throw err;
    }

    const normalized = {
      postal_code: cp,
      // A API por vezes devolve arrays quando o CP cobre várias zonas.
      city: pickFirst(payload?.Localidade) || pickFirst(payload?.localidade) || null,
      district: pickFirst(payload?.Distrito) || pickFirst(payload?.distrito) || null,
      municipality:
        pickFirst(payload?.Município) ||
        pickFirst(payload?.municipio) ||
        pickFirst(payload?.['Município']) || null,
      parish: pickFirst(payload?.Freguesia) || pickFirst(payload?.freguesia) || null,
      country: 'PT',
    };

    cpCache.set(cp, { value: normalized, expiresAt: Date.now() + CP_CACHE_TTL_MS });
    if (cpCache.size > CP_CACHE_MAX) trimCache();
    return normalized;
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

// Cache simples com expiração; suficiente para o tráfego esperado.
const CP_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const CP_CACHE_MAX = 1000;
const cpCache = new Map();

function trimCache() {
  // Remove os 100 mais antigos quando estouramos o limite.
  const sorted = [...cpCache.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt);
  for (let i = 0; i < 100 && sorted[i]; i++) cpCache.delete(sorted[i][0]);
}

module.exports = new ShippingService();
