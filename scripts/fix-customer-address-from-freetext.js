#!/usr/bin/env node
/**
 * Corrige clientes onde a morada completa ficou apenas em `address` (Ship2u / texto livre)
 * mas o formato é típico PT: «rua..., XXXX-XXX Localidade (Portugal)».
 *
 * - Separa `address` (linha da rua) de `postal_code` e `city`.
 * - Preenche `district` via `data/pt-postal-lookup.json` (npm run build:postal-data) quando há CP válido PT.
 *
 * Uso:
 *   cd hrstore-backend && node scripts/fix-customer-address-from-freetext.js           # só lista alterações (dry-run)
 *   node scripts/fix-customer-address-from-freetext.js --apply                         # ALTERA na BD (DATABASE_URL)
 *
 * Opcional:
 *   --min-length N   comprimento mínimo de address para tentar divisão (default 28)
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Client } = require('pg');
const {
  lookupPtPostalRecord,
  toPublicPostalPayload,
} = require('../src/postal/ptLocalLookup');

function parsePtFreeTextAddress(full) {
  const s = String(full || '').trim();
  if (!s) return null;

  const PT_CP = /\b(\d{4}-\d{3})\b/g;
  let last = null;
  let m;
  while ((m = PT_CP.exec(s)) !== null) {
    last = {
      cp: m[1],
      index: m.index,
      endIndex: m.index + m[0].length,
    };
  }
  if (!last) return null;

  let street = s.slice(0, last.index).replace(/[,\s]+$/g, '').trim();
  let tail = s
    .slice(last.endIndex)
    .trim()
    .replace(/^,\s*/, '')
    .trim();
  let city = tail.replace(/\s*\([^)]*portugal[^)]*\)\s*$/i, '').trim();
  city = city.replace(/\s*\(PT\)\s*$/i, '').trim();
  city = city.replace(/,\s*$/, '').trim();

  if (!street) return null;

  return {
    postal_code: last.cp,
    address: street,
    locality_from_text: city || null,
  };
}

function norm(v) {
  const t = v == null ? '' : String(v).trim();
  return t || null;
}

function postalInAddress(addrStr, postal) {
  const p = norm(postal);
  if (!p || !addrStr) return false;
  return addrStr.includes(p);
}

function shouldRepairRow(addr, postal_code, city, minLen) {
  if (!addr || typeof addr !== 'string') return false;
  const trimmed = addr.trim();
  if (!/\d{4}-\d{3}/.test(trimmed)) return false;

  const pc = norm(postal_code);
  const cy = norm(city);
  const parsed = parsePtFreeTextAddress(trimmed);
  if (!parsed || !parsed.address) return false;

  const longEnough = trimmed.length >= minLen;
  const missingStructured = !pc || !cy;
  const wrongPostal = pc && !postalInAddress(trimmed, pc);

  return longEnough || missingStructured || wrongPostal;
}

async function main() {
  const apply = process.argv.includes('--apply');
  let minLen = 28;
  const mi = process.argv.indexOf('--min-length');
  if (mi !== -1 && process.argv[mi + 1]) {
    minLen = Math.max(0, parseInt(process.argv[mi + 1], 10) || 28);
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL em falta');
    process.exit(1);
  }

  const client = new Client({ connectionString: url });
  await client.connect();
  let updates = 0;

  try {
    const q = `
      SELECT id, address, postal_code, city, district, country
      FROM customers
      WHERE address IS NOT NULL AND address ~ '[0-9]{4}-[0-9]{3}'
      ORDER BY id`;

    const { rows } = await client.query(q);

    for (const row of rows) {
      if (!shouldRepairRow(row.address, row.postal_code, row.city, minLen)) continue;

      const parsed = parsePtFreeTextAddress(row.address);
      if (!parsed || !parsed.address) continue;

      const lookupRaw = lookupPtPostalRecord(parsed.postal_code);

      let newCity = norm(parsed.locality_from_text || row.city);
      let newDistrict = norm(row.district);

      if (lookupRaw) {
        const pub = toPublicPostalPayload(parsed.postal_code, lookupRaw);
        if (!newCity) newCity = pub.city;
        newDistrict = norm(pub.district) || newDistrict;
      }

      const newAddr = norm(parsed.address);
      const newPostal = parsed.postal_code;

      let newCountry = norm(row.country) || 'PT';
      const looksPtTail = /\([^)]*portugal[^)]*\)|\(PT\)/i.test(row.address);
      const cpKnownPt = Boolean(lookupRaw);
      if (looksPtTail || cpKnownPt) newCountry = 'PT';

      const same =
        row.address?.trim() === newAddr &&
        norm(row.postal_code) === newPostal &&
        norm(row.city) === newCity &&
        norm(row.district) === newDistrict &&
        norm(row.country || 'PT') === newCountry;

      if (same) continue;

      const line = JSON.stringify({
        id: row.id,
        antes: {
          address: row.address,
          postal_code: row.postal_code,
          city: row.city,
          district: row.district,
        },
        depois: {
          address: newAddr,
          postal_code: newPostal,
          city: newCity,
          district: newDistrict,
          country: newCountry,
        },
      });
      console.log(line);
      updates++;

      if (apply) {
        await client.query(
          `UPDATE customers SET
            address = $1,
            postal_code = $2,
            city = $3,
            district = $4,
            country = $5
          WHERE id = $6`,
          [newAddr, newPostal, newCity, newDistrict, newCountry, row.id]
        );
      }
    }

    console.error(
      `[fix-customer-address] ${apply ? 'Atualizados' : 'A atualizar (--apply)'}: ${updates} (min-address-length≈${minLen})`
    );
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
