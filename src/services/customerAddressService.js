const crypto = require('crypto');

function computeAddressKey(row) {
  const segs = [
    row.street_name,
    row.street_number,
    row.apartment,
    row.address_obs,
    row.postal_code,
    row.city,
    row.district,
    row.country,
  ].map((s) =>
    String(s ?? '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim(),
  );
  return crypto.createHash('sha256').update(segs.join('|'), 'utf8').digest('hex').slice(0, 32);
}

/**
 * Grava/atualiza morada na agenda do cliente (dedupe por fingerprint).
 *
 * @param {{ query: (...args:any[])=>Promise<{rows:any[]}> }} client Pool ou PoolClient pg
 */
async function upsertCustomerAddress(client, customerId, row) {
  const label = row.label?.trim()?.slice(0, 80) || null;
  const street_name = String(row.street_name || '').trim().slice(0, 512);
  if (street_name.length < 2) return null;

  const street_number = String(row.street_number || '').trim().slice(0, 48);
  const apartment = row.apartment?.trim()?.slice(0, 600) || null;
  const address_obs = row.address_obs?.trim()?.slice(0, 600) || null;
  const postal_code = row.postal_code?.trim()?.slice(0, 24) || null;
  const city = row.city?.trim()?.slice(0, 150) || null;
  const district = row.district?.trim()?.slice(0, 120) || null;
  const country = (row.country || 'PT').trim().toUpperCase().slice(0, 2) || 'PT';

  const address_key = computeAddressKey({
    street_name,
    street_number,
    apartment,
    address_obs,
    postal_code,
    city,
    district,
    country,
  });

  const insert = await client.query(
    `
    INSERT INTO customer_addresses
      (customer_id, label, street_name, street_number, apartment, address_obs,
       postal_code, city, district, country, address_key)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    ON CONFLICT (customer_id, address_key)
    DO UPDATE SET
      label       = COALESCE(EXCLUDED.label, customer_addresses.label),
      street_name = EXCLUDED.street_name,
      street_number = EXCLUDED.street_number,
      apartment   = EXCLUDED.apartment,
      address_obs = EXCLUDED.address_obs,
      postal_code = EXCLUDED.postal_code,
      city        = EXCLUDED.city,
      district    = EXCLUDED.district,
      country     = EXCLUDED.country,
      updated_at  = CURRENT_TIMESTAMP
    RETURNING id
    `,
    [
      customerId,
      label,
      street_name,
      street_number,
      apartment,
      address_obs,
      postal_code,
      city,
      district,
      country,
      address_key,
    ],
  );
  return insert.rows[0]?.id ?? null;
}

module.exports = {
  computeAddressKey,
  upsertCustomerAddress,
};
