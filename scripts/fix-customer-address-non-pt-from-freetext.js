#!/usr/bin/env node
/**
 * Moradas internacionais (ES, MC) coladas em `address` sem XXXX-XXX PT.
 * Usa o último bloco de 5 dígitos `\\d{5}` como código postal (ES / Mónaco)
 * e separa rua vs localidade. Não altera linhas com `address` NULL/vazio.
 *
 * Uso:
 *   node scripts/fix-customer-address-non-pt-from-freetext.js
 *   node scripts/fix-customer-address-non-pt-from-freetext.js --apply
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Client } = require('pg');

const PARTICLES = new Set(['de', 'da', 'das', 'do', 'dos', 'del', 'la', 'y', 'los', 'las']);

function titleCity(s) {
  if (!s || !String(s).trim()) return null;
  return String(s)
    .trim()
    .split(/\s+/)
    .map((w, i) => {
      const low = w.toLowerCase();
      if (i > 0 && PARTICLES.has(low)) return low;
      if (low === 'd\'iregua' || low === "d'iregua") return "d'Iregua";
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(' ');
}

/**
 * @param {string} full
 * @returns {{ postal_code: string, address: string, city: string, country: string } | null}
 */
function parseNonPtFiveDigitAddress(full) {
  const s = String(full || '').trim();
  if (!s) return null;
  if (/\b\d{4}-\d{3}\b/.test(s)) return null;

  const re = /\b(\d{5})\b/g;
  let last = null;
  let m;
  while ((m = re.exec(s)) !== null) {
    last = { cp: m[1], index: m.index, end: m.index + m[0].length };
  }
  if (!last) return null;

  let street = s.slice(0, last.index).replace(/[,\s]+$/g, '').trim();
  let tail = s
    .slice(last.end)
    .trim()
    .replace(/^,\s*/, '')
    .trim();
  tail = tail.replace(/\s*\([^)]*portugal[^)]*\)\s*$/i, '').trim();
  tail = tail.replace(/\s*\(PT\)\s*$/i, '').trim();
  tail = tail.replace(/,\s*$/g, '').trim();
  const cityRaw = tail;
  if (!street || !cityRaw) return null;

  const cityLow = cityRaw.toLowerCase();
  let country = 'ES';
  if (cityLow.includes('monaco') || last.cp === '98000') country = 'MC';

  return {
    postal_code: last.cp,
    address: street,
    city: titleCity(cityRaw) || cityRaw,
    country,
  };
}

function norm(v) {
  const t = v == null ? '' : String(v).trim();
  return t || null;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL em falta');
    process.exit(1);
  }

  const client = new Client({ connectionString: url });
  await client.connect();
  let updates = 0;

  try {
    const { rows } = await client.query(`
      SELECT id, address, postal_code, city, district, country
      FROM customers
      WHERE address IS NOT NULL
        AND trim(address) <> ''
        AND (postal_code IS NULL OR trim(postal_code::text) = '')
        AND address !~ '[0-9]{4}-[0-9]{3}'
      ORDER BY id`);

    for (const row of rows) {
      const parsed = parseNonPtFiveDigitAddress(row.address);
      if (!parsed) continue;

      const newAddr = norm(parsed.address);
      const newPc = parsed.postal_code;
      const newCity = norm(parsed.city);
      const newCountry = parsed.country;
      const newDistrict = null;

      const same =
        row.address?.trim() === newAddr &&
        norm(row.postal_code) === newPc &&
        norm(row.city) === newCity &&
        norm(row.country || 'PT') === newCountry &&
        norm(row.district) == null;

      if (same) continue;

      console.log(
        JSON.stringify({
          id: row.id,
          antes: {
            address: row.address,
            postal_code: row.postal_code,
            city: row.city,
            country: row.country,
          },
          depois: {
            address: newAddr,
            postal_code: newPc,
            city: newCity,
            district: newDistrict,
            country: newCountry,
          },
        }),
      );
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
          [newAddr, newPc, newCity, newDistrict, newCountry, row.id],
        );
      }
    }

    console.error(
      `[fix-customer-address-non-pt] ${apply ? 'Atualizados' : 'A atualizar (--apply)'}: ${updates}`,
    );
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
