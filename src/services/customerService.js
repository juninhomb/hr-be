const db = require('../config/db');
const { canonicalWhatsappNumber, assertValidWhatsappOrThrow } = require('../utils/whatsappNormalize');
const { upsertCustomerAddress } = require('./customerAddressService');

function cleanOpt(val, maxLen) {
  const s = String(val ?? '').trim();
  if (!s) return null;
  return s.slice(0, maxLen);
}

class CustomerService {
  async getAllCustomers(search = '') {
    const term = String(search ?? '').trim();
    // Lista completa: sem WHERE ILIKE (mais claro, mais rápido, evita ambiguidades com %%).
    // Com termo: filtra em nome, WhatsApp, e-mail, morada.
    const params = term ? [`%${term}%`] : [];

    const fullListQuery = `
      SELECT c.id, c.full_name, c.whatsapp_number, c.email, c.address, c.created_at,
             c.postal_code, c.city, c.district, c.country, c.phone,
             COALESCE((
               SELECT COUNT(*)::int FROM orders o
                WHERE o.customer_id = c.id
                  AND o.status IN ('pago','enviado','entregue')
             ), 0) AS total_orders,
             (SELECT COUNT(*)::int FROM customer_addresses a WHERE a.customer_id = c.id) AS address_count
      FROM customers c
      ORDER BY c.full_name ASC NULLS LAST, c.created_at DESC
    `;
    const fullSearchQuery = `
      SELECT c.id, c.full_name, c.whatsapp_number, c.email, c.address, c.created_at,
             c.postal_code, c.city, c.district, c.country, c.phone,
             COALESCE((
               SELECT COUNT(*)::int FROM orders o
                WHERE o.customer_id = c.id
                  AND o.status IN ('pago','enviado','entregue')
             ), 0) AS total_orders,
             (SELECT COUNT(*)::int FROM customer_addresses a WHERE a.customer_id = c.id) AS address_count
      FROM customers c
      WHERE c.full_name ILIKE $1 OR c.whatsapp_number ILIKE $1
               OR COALESCE(c.email, '') ILIKE $1 OR COALESCE(c.city, '') ILIKE $1
               OR COALESCE(c.postal_code, '') ILIKE $1 OR COALESCE(c.address, '') ILIKE $1
      ORDER BY c.full_name ASC NULLS LAST, c.created_at DESC
    `;

    const legacyListQuery = `
      SELECT c.id, c.full_name, c.whatsapp_number, c.email, c.address, c.created_at,
             COALESCE((
               SELECT COUNT(*)::int FROM orders o
                WHERE o.customer_id = c.id
                  AND o.status IN ('pago','enviado','entregue')
             ), 0) AS total_orders,
             0::int AS address_count
      FROM customers c
      ORDER BY c.full_name ASC NULLS LAST, c.created_at DESC
    `;
    const legacySearchQuery = `
      SELECT c.id, c.full_name, c.whatsapp_number, c.email, c.address, c.created_at,
             COALESCE((
               SELECT COUNT(*)::int FROM orders o
                WHERE o.customer_id = c.id
                  AND o.status IN ('pago','enviado','entregue')
             ), 0) AS total_orders,
             0::int AS address_count
      FROM customers c
      WHERE c.full_name ILIKE $1 OR c.whatsapp_number ILIKE $1
               OR COALESCE(c.email, '') ILIKE $1 OR COALESCE(c.address, '') ILIKE $1
      ORDER BY c.full_name ASC NULLS LAST, c.created_at DESC
    `;
    try {
      const { rows } = await db.query(term ? fullSearchQuery : fullListQuery, params);
      return rows;
    } catch (err) {
      const code = err?.code;
      const msg = String(err?.message || '');
      const schemaMismatch =
        code === '42P01'
        || code === '42703'
        || msg.includes('customer_addresses')
        || msg.includes('postal_code')
        || msg.includes('district');
      if (schemaMismatch) {
        const { rows } = await db.query(term ? legacySearchQuery : legacyListQuery, params);
        return rows.map((r) => ({
          ...r,
          postal_code: r.postal_code ?? null,
          city: r.city ?? null,
          district: r.district ?? null,
          country: r.country ?? null,
          phone: r.phone ?? null,
        }));
      }
      throw err;
    }
  }

  /** Detalhe + moradas guardadas (backoffice). */
  async getCustomerByPhone(rawWhatsapp) {
    const wa = canonicalWhatsappNumber(rawWhatsapp);
    if (!wa) return null;

    const { rows } = await db.query(
      `SELECT c.*,
              COALESCE((
                SELECT COUNT(*)::int FROM orders o
                 WHERE o.customer_id = c.id
                   AND o.status IN ('pago','enviado','entregue')
              ), 0) AS total_orders
         FROM customers c
        WHERE c.whatsapp_number = $1`,
      [wa],
    );
    const customer = rows[0];
    if (!customer) return null;

    try {
      const { rows: addresses } = await db.query(
      `
      SELECT id, label, street_name, street_number, apartment, address_obs,
             postal_code, city, district, country, updated_at
        FROM customer_addresses
       WHERE customer_id = $1
       ORDER BY updated_at DESC
      `,
        [customer.id],
      );

      return { ...customer, addresses };
    } catch (err) {
      if (err?.code === '42P01' || String(err?.message || '').includes('customer_addresses')) {
        return { ...customer, addresses: [] };
      }
      throw err;
    }
  }

  async upsertCustomer(data) {
    const whatsapp_number = assertValidWhatsappOrThrow(data.whatsapp_number);
    const full_name = cleanOpt(data.name ?? data.full_name, 255);
    const email = cleanOpt(data.email, 255);
    const address = cleanOpt(data.address, 8000);
    const postal_code = cleanOpt(data.postal_code, 24);
    const city = cleanOpt(data.city, 150);
    const district = cleanOpt(data.district, 120);
    const country = (cleanOpt(data.country, 2) || 'PT').toUpperCase();
    let phone = cleanOpt(data.phone, 20)?.replace(/\s/g, '') || null;
    if (phone && !/^\+?[0-9]{7,15}$/.test(phone)) {
      const err = new Error('Telefone / contacto auxiliar inválido.');
      err.status = 400;
      throw err;
    }

    const insertSql = `
      INSERT INTO customers
        (full_name, whatsapp_number, email, address, postal_code, city, district, country, phone)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (whatsapp_number)
      DO UPDATE SET
        full_name   = COALESCE(NULLIF(TRIM(EXCLUDED.full_name), ''),   customers.full_name),
        email       = COALESCE(NULLIF(TRIM(EXCLUDED.email), ''),       customers.email),
        address     = COALESCE(NULLIF(TRIM(EXCLUDED.address), ''),     customers.address),
        postal_code = COALESCE(NULLIF(TRIM(EXCLUDED.postal_code), ''), customers.postal_code),
        city        = COALESCE(NULLIF(TRIM(EXCLUDED.city), ''),         customers.city),
        district    = COALESCE(NULLIF(TRIM(EXCLUDED.district), ''),     customers.district),
        country     = COALESCE(NULLIF(TRIM(EXCLUDED.country), ''),     customers.country),
        phone       = COALESCE(NULLIF(TRIM(EXCLUDED.phone), ''),       customers.phone)
      RETURNING *`;
    const { rows } = await db.query(insertSql, [
      full_name,
      whatsapp_number,
      email,
      address,
      postal_code,
      city,
      district,
      country,
      phone,
    ]);

    const c = rows[0];
    const { rows: addresses } = await db.query(
      `SELECT id, label, street_name, street_number, apartment, address_obs,
              postal_code, city, district, country, updated_at
         FROM customer_addresses WHERE customer_id = $1 ORDER BY updated_at DESC`,
      [c.id],
    );
    return { ...c, addresses };
  }

  async deleteSavedAddress(rawWhatsapp, addressId) {
    const wa = canonicalWhatsappNumber(rawWhatsapp);
    const id = parseInt(addressId, 10);
    if (!wa || !Number.isFinite(id)) {
      const err = new Error('Parâmetros inválidos.');
      err.status = 400;
      throw err;
    }

    const { rowCount } = await db.query(
      `
      DELETE FROM customer_addresses a
       USING customers c
       WHERE a.customer_id = c.id AND c.whatsapp_number = $1 AND a.id = $2
      `,
      [wa, id],
    );

    return rowCount > 0;
  }

  /** Morada estruturada sugerida na loja (dedupe pela chave interna). */
  async addSavedAddress(rawWhatsapp, body) {
    const wa = canonicalWhatsappNumber(rawWhatsapp);
    if (!wa) {
      const err = new Error('Número inválido.');
      err.status = 400;
      throw err;
    }

    const { rows } = await db.query(`SELECT id FROM customers WHERE whatsapp_number = $1`, [wa]);
    const customerId = rows[0]?.id;
    if (!customerId) {
      const err = new Error('Cliente não encontrado.');
      err.status = 404;
      throw err;
    }

    const postal_code = cleanOpt(body.postal_code, 24);
    if (!postal_code) {
      const err = new Error('Código postal é obrigatório para uma morada na agenda.');
      err.status = 400;
      throw err;
    }

    const street_name = String(body.street_name || '').trim();
    if (street_name.length < 2) {
      const err = new Error('Nome da via (rua) é obrigatório.');
      err.status = 400;
      throw err;
    }

    const addrId = await upsertCustomerAddress(db, customerId, {
      label: cleanOpt(body.label, 80),
      street_name,
      street_number: String(body.street_number ?? '').trim(),
      apartment: cleanOpt(body.apartment, 600),
      address_obs: cleanOpt(body.address_obs, 600),
      postal_code,
      city: cleanOpt(body.city, 150),
      district: cleanOpt(body.district, 120),
      country: cleanOpt(body.country, 2)?.toUpperCase() || 'PT',
    });

    if (!addrId) {
      const err = new Error('Não foi possível criar a morada.');
      err.status = 400;
      throw err;
    }

    return this.getCustomerByPhone(wa);
  }

  async deleteCustomer(rawWhatsapp) {
    const wa = canonicalWhatsappNumber(rawWhatsapp);
    if (!wa) return null;
    const { rows } = await db.query(
      `DELETE FROM customers WHERE whatsapp_number = $1 RETURNING id`,
      [wa],
    );
    return rows[0] || null;
  }
}

module.exports = new CustomerService();
