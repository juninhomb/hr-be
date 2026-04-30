/**
 * Gera `data/pt-postal-lookup.json` a partir do dataset aberto Central de Dados /
 * dados CTT (CC-BY 4.0) — não requer chave nem serviços pagos.
 *
 * Fonte: https://github.com/centraldedados/codigos_postais
 *
 * Utilização:
 *    node scripts/build-pt-postal-lookup.js
 *
 * Produz ~vários MB JSON; faz commit em deploy artefacto OU carrega como volume.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const { parse } = require('csv-parse/sync');
const { parse: parseStream } = require('csv-parse');

const URLS = {
  cp:
    'https://raw.githubusercontent.com/centraldedados/codigos_postais/master/data/codigos_postais.csv',
  dist:
    'https://raw.githubusercontent.com/centraldedados/codigos_postais/master/data/distritos.csv',
  conc:
    'https://raw.githubusercontent.com/centraldedados/codigos_postais/master/data/concelhos.csv',
};

const OUT_DIR = path.join(__dirname, '..', 'data');
const OUT_FILE = path.join(OUT_DIR, 'pt-postal-lookup.json');

function downloadBuffer(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { timeout: 120_000 }, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} ao obter ${url}`));
          return;
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('error', reject);
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      })
      .on('error', reject);
  });
}

function padDistrict(cod) {
  const s = String(cod ?? '').trim();
  if (!s) return '';
  return s.length === 1 ? `0${s}` : s;
}

/** Chave distrito + concelho (CSV usa 01,06 etc.) */
function concKey(d, c) {
  return `${padDistrict(d)}-${padConcelho(c)}`;
}

function padConcelho(c) {
  const s = String(c ?? '').trim();
  if (!s) return '';
  if (s.length === 1) return `0${s}`;
  return s;
}

function normalizeCp(num, ext) {
  const n = String(num ?? '').replace(/\D/g, '');
  let e = String(ext ?? '').replace(/\D/g, '');
  if (n.length !== 4 || e.length < 1) return null;
  e = e.padStart(3, '0').slice(-3);
  return `${n}-${e}`;
}

function buildStreet(row) {
  const tipo = String(row.tipo_arteria || '').trim();
  const parts = [
    row.prep1,
    row.titulo_arteria,
    row.prep2,
    row.nome_arteria,
    row.local_arteria,
  ]
    .map((x) => String(x ?? '').trim())
    .filter(Boolean);
  let line = tipo ? `${tipo} ${parts.join(' ')}`.trim() : parts.join(' ');
  line = line.replace(/\s+/g, ' ').trim();
  const troco = String(row.troco || '').trim();
  if (line && troco) line = `${line} (${troco})`;
  line = line.replace(/\s+/g, ' ').trim();
  if (line.length < 4) return '';
  return line;
}

/** @typedef {{ city:string, district:string, municipality:string, parish:string, streets:Set<string> }} Agg */

async function main() {
  // eslint-disable-next-line no-console
  console.log('A descarregar índices distritos/concelhos…');
  const [dCsv, cCsv] = await Promise.all([downloadBuffer(URLS.dist), downloadBuffer(URLS.conc)]);

  const distritoNome = {};
  for (const r of parse(dCsv, { columns: true, skip_empty_lines: true, bom: true })) {
    const k = String(r.cod_distrito).trim();
    const nome = String(r.nome_distrito || '').trim();
    if (!k || !nome) continue;
    distritoNome[k] = nome;
    distritoNome[padDistrict(k)] = nome;
  }

  const concNome = {};
  for (const r of parse(cCsv, { columns: true, skip_empty_lines: true, bom: true })) {
    const k = concKey(r.cod_distrito, r.cod_concelho);
    const nome = String(r.nome_concelho || '').trim();
    if (!k || !nome) continue;
    concNome[k] = nome;
  }

  // eslint-disable-next-line no-console
  console.log('A processar codigos_postais.csv (stream, ~26MB)…');

  /** @type {Map<string, Agg>} */
  const byCp = new Map();

  await new Promise((resolve, reject) => {
    const parser = parseStream({
      columns: true,
      relax_column_count: true,
      bom: true,
      trim: true,
    });

    parser.on('readable', () => {
      let row;
      while ((row = parser.read())) {
        try {
          const cp = normalizeCp(row.num_cod_postal, row.ext_cod_postal);
          if (!cp) continue;

          const city = String(row.nome_localidade || '').trim();
          const parish = String(row.desig_postal || '').trim();
          const dkPad = `${padDistrict(row.cod_distrito)}-${padConcelho(row.cod_concelho)}`;
          const distrito =
            distritoNome[row.cod_distrito] ||
            distritoNome[padDistrict(row.cod_distrito)] ||
            '';
          const municipality = concNome[dkPad] || '';

          const streetLine = buildStreet(row);

          let agg = byCp.get(cp);
          if (!agg) {
            agg = {
              city,
              district: distrito || '',
              municipality: municipality || '',
              parish: parish || '',
              streets: new Set(),
            };
            byCp.set(cp, agg);
          } else {
            if (city && !agg.city) agg.city = city;
            if (distrito && !agg.district) agg.district = distrito;
            if (municipality && !agg.municipality) agg.municipality = municipality;
            if (parish && !agg.parish) agg.parish = parish;
          }
          if (streetLine && agg.streets.size < 42) agg.streets.add(streetLine);
        } catch {
          /* ignora linha problemática */
        }
      }
    });

    parser.on('error', reject);
    parser.on('end', resolve);

    https
      .get(URLS.cp, { timeout: 120_000 }, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} CSV principal`));
          return;
        }
        res.pipe(parser);
      })
      .on('error', reject);
  });

  const outObj = {};
  for (const [cp, agg] of byCp) {
    const streetsList = [...agg.streets].slice(0, 40).sort((a, b) => a.localeCompare(b, 'pt-PT'));
    outObj[cp] = {
      city: agg.city || null,
      district: agg.district || null,
      municipality: agg.municipality || null,
      parish: agg.parish || null,
      streets: streetsList,
    };
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(outObj), 'utf8');
  const stat = fs.statSync(OUT_FILE);
  // eslint-disable-next-line no-console
  console.log(`Concluído: ${OUT_FILE}`);
  // eslint-disable-next-line no-console
  console.log(
    `${Object.keys(outObj).length.toLocaleString()} códigos únicos (${(stat.size / 1024 / 1024).toFixed(2)} MB)`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
