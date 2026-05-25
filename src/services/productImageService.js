const db = require('../config/db');
const fs = require('fs');
const path = require('path');
const { UPLOAD_DIR, toPublicUrl } = require('../config/upload');

const MAX_IMAGES_PER_ENTITY = 12;

function safeDeleteFile(publicUrl) {
  try {
    if (!publicUrl || typeof publicUrl !== 'string') return;
    if (publicUrl.endsWith('/placeholder.svg') || publicUrl.endsWith('/placeholder.png')) return;
    const filename = path.basename(publicUrl);
    const fullPath = path.join(UPLOAD_DIR, filename);
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
  } catch (e) {
    console.warn(`⚠️  Falha ao apagar imagem ${publicUrl}:`, e.message);
  }
}

async function isUrlStillReferenced(publicUrl) {
  const { rowCount } = await db.query(
    `
    SELECT 1
      FROM product_images WHERE url = $1
     UNION ALL
    SELECT 1 FROM variant_images WHERE url = $1
     UNION ALL
    SELECT 1 FROM products WHERE image_placeholder_url = $1
     UNION ALL
    SELECT 1 FROM product_variants WHERE image_url = $1
     LIMIT 1`,
    [publicUrl],
  );
  return rowCount > 0;
}

async function safeDeleteIfUnused(publicUrl) {
  if (!publicUrl) return;
  const used = await isUrlStillReferenced(publicUrl);
  if (!used) safeDeleteFile(publicUrl);
}

async function syncProductPrimary(productId) {
  const id = parseInt(productId, 10);
  const { rows } = await db.query(
    `SELECT url FROM product_images
      WHERE product_id = $1
      ORDER BY sort_order ASC, id ASC
      LIMIT 1`,
    [id],
  );
  const primary = rows[0]?.url || null;
  await db.query(
    `UPDATE products SET image_placeholder_url = $1 WHERE id = $2`,
    [primary, id],
  );
  return primary;
}

async function syncVariantPrimary(variantId) {
  const id = parseInt(variantId, 10);
  const { rows } = await db.query(
    `SELECT url FROM variant_images
      WHERE variant_id = $1
      ORDER BY sort_order ASC, id ASC
      LIMIT 1`,
    [id],
  );
  const primary = rows[0]?.url || null;
  await db.query(
    `UPDATE product_variants SET image_url = $1 WHERE id = $2`,
    [primary, id],
  );
  return primary;
}

async function listProductImages(productId) {
  const id = parseInt(productId, 10);
  const { rows } = await db.query(
    `SELECT id, product_id, url, sort_order, created_at
       FROM product_images
      WHERE product_id = $1
      ORDER BY sort_order ASC, id ASC`,
    [id],
  );
  return rows;
}

async function listVariantImages(variantId) {
  const id = parseInt(variantId, 10);
  const { rows } = await db.query(
    `SELECT id, variant_id, url, sort_order, created_at
       FROM variant_images
      WHERE variant_id = $1
      ORDER BY sort_order ASC, id ASC`,
    [id],
  );
  return rows;
}

async function addProductImages(productId, filenames) {
  const id = parseInt(productId, 10);
  if (!Number.isFinite(id)) return null;
  const files = (filenames || []).filter(Boolean);
  if (!files.length) return null;

  // Pré-validação (rápida, fora da transação)
  const exists = await db.query(`SELECT id FROM products WHERE id = $1`, [id]);
  if (!exists.rows[0]) {
    // Produto não existe → ficheiros multer já em disco viram lixo. Limpa.
    files.forEach((f) => safeDeleteFile(toPublicUrl(f)));
    return null;
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const { rows: countRows } = await client.query(
      `SELECT COUNT(*)::int AS n FROM product_images WHERE product_id = $1`,
      [id],
    );
    let sort = countRows[0]?.n || 0;
    if (sort + files.length > MAX_IMAGES_PER_ENTITY) {
      const err = new Error(`Máximo de ${MAX_IMAGES_PER_ENTITY} imagens por produto.`);
      err.statusCode = 400;
      throw err;
    }

    const inserted = [];
    for (const filename of files) {
      const url = toPublicUrl(filename);
      const { rows } = await client.query(
        `INSERT INTO product_images (product_id, url, sort_order)
         VALUES ($1, $2, $3)
         RETURNING id, product_id, url, sort_order, created_at`,
        [id, url, sort++],
      );
      inserted.push(rows[0]);
    }

    await client.query('COMMIT');

    // syncProductPrimary fora da transação — só lê + UPDATE com snapshot já consistente.
    const primary = await syncProductPrimary(id);
    return { product_id: id, images: inserted, image_placeholder_url: primary };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    // Limpa ficheiros que o multer deixou em disco — DB não os reconhece após ROLLBACK.
    files.forEach((f) => safeDeleteFile(toPublicUrl(f)));
    throw err;
  } finally {
    client.release();
  }
}

async function addVariantImages(variantId, filenames, { applyToColor = false } = {}) {
  const id = parseInt(variantId, 10);
  if (!Number.isFinite(id)) return null;
  const files = (filenames || []).filter(Boolean);
  if (!files.length) return null;

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const vRes = await client.query(
      `SELECT id, product_id, color FROM product_variants WHERE id = $1`,
      [id],
    );
    if (!vRes.rows[0]) {
      await client.query('ROLLBACK');
      // Variante não existe → ficheiros do multer são lixo. Limpa.
      files.forEach((f) => safeDeleteFile(toPublicUrl(f)));
      return null;
    }
    const { product_id: productId, color } = vRes.rows[0];

    let targetVariantIds = [id];
    if (applyToColor && color) {
      const sib = await client.query(
        `SELECT id FROM product_variants WHERE product_id = $1 AND color = $2`,
        [productId, color],
      );
      targetVariantIds = sib.rows.map((r) => r.id);
    }

    const allInserted = [];
    const urlsAdded = files.map((f) => toPublicUrl(f));

    for (const vid of targetVariantIds) {
      const { rows: countRows } = await client.query(
        `SELECT COUNT(*)::int AS n FROM variant_images WHERE variant_id = $1`,
        [vid],
      );
      let sort = countRows[0]?.n || 0;
      if (sort + urlsAdded.length > MAX_IMAGES_PER_ENTITY) {
        const err = new Error(`Máximo de ${MAX_IMAGES_PER_ENTITY} imagens por variante.`);
        err.statusCode = 400;
        throw err;
      }

      for (const url of urlsAdded) {
        const { rows } = await client.query(
          `INSERT INTO variant_images (variant_id, url, sort_order)
           VALUES ($1, $2, $3)
           RETURNING id, variant_id, url, sort_order, created_at`,
          [vid, url, sort++],
        );
        if (vid === id) allInserted.push(rows[0]);
      }
      await client.query(
        `UPDATE product_variants SET image_url = (
           SELECT url FROM variant_images WHERE variant_id = $1
           ORDER BY sort_order ASC, id ASC LIMIT 1
         ) WHERE id = $1`,
        [vid],
      );
    }

    await client.query('COMMIT');

    return {
      variant_id: id,
      images: allInserted,
      applied_to_color: Boolean(applyToColor && color),
      affected_variant_ids: targetVariantIds,
    };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    // Limpa ficheiros que o multer deixou em disco — DB não os reconhece após ROLLBACK.
    files.forEach((f) => safeDeleteFile(toPublicUrl(f)));
    throw e;
  } finally {
    client.release();
  }
}

async function removeProductImage(imageId) {
  const imgId = parseInt(imageId, 10);
  const { rows } = await db.query(
    `DELETE FROM product_images WHERE id = $1 RETURNING id, product_id, url`,
    [imgId],
  );
  if (!rows[0]) return null;
  const { product_id: productId, url } = rows[0];
  await syncProductPrimary(productId);
  await safeDeleteIfUnused(url);
  return { deleted_id: imgId, product_id: productId };
}

async function removeVariantImage(imageId) {
  const imgId = parseInt(imageId, 10);
  const { rows } = await db.query(
    `DELETE FROM variant_images WHERE id = $1 RETURNING id, variant_id, url`,
    [imgId],
  );
  if (!rows[0]) return null;
  const { variant_id: variantId, url } = rows[0];
  await syncVariantPrimary(variantId);
  await safeDeleteIfUnused(url);
  return { deleted_id: imgId, variant_id: variantId };
}

/** Remove todas as imagens do produto (compat DELETE legado). */
async function clearProductImages(productId) {
  const id = parseInt(productId, 10);
  const { rows } = await db.query(
    `DELETE FROM product_images WHERE product_id = $1 RETURNING url`,
    [id],
  );
  await syncProductPrimary(id);
  for (const r of rows) await safeDeleteIfUnused(r.url);
  return { product_id: id, cleared: rows.length };
}

/** Remove todas as imagens da variante (compat DELETE legado). */
async function clearVariantImages(variantId) {
  const id = parseInt(variantId, 10);
  const { rows } = await db.query(
    `DELETE FROM variant_images WHERE variant_id = $1 RETURNING url`,
    [id],
  );
  await syncVariantPrimary(id);
  for (const r of rows) await safeDeleteIfUnused(r.url);
  return { variant_id: id, cleared: rows.length };
}

async function enrichProductsWithImages(products) {
  if (!Array.isArray(products) || !products.length) return products;

  const productIds = products.map((p) => p.id);
  const variantIds = products.flatMap((p) => (p.variants || []).map((v) => v.id)).filter(Boolean);

  const [pRes, vRes] = await Promise.all([
    db.query(
      `SELECT id, product_id, url, sort_order
         FROM product_images
        WHERE product_id = ANY($1::int[])
        ORDER BY product_id, sort_order ASC, id ASC`,
      [productIds],
    ),
    variantIds.length
      ? db.query(
          `SELECT id, variant_id, url, sort_order
             FROM variant_images
            WHERE variant_id = ANY($1::int[])
            ORDER BY variant_id, sort_order ASC, id ASC`,
          [variantIds],
        )
      : Promise.resolve({ rows: [] }),
  ]);

  const byProduct = new Map();
  for (const row of pRes.rows) {
    if (!byProduct.has(row.product_id)) byProduct.set(row.product_id, []);
    byProduct.get(row.product_id).push({ id: row.id, url: row.url, sort_order: row.sort_order });
  }

  const byVariant = new Map();
  for (const row of vRes.rows) {
    if (!byVariant.has(row.variant_id)) byVariant.set(row.variant_id, []);
    byVariant.get(row.variant_id).push({ id: row.id, url: row.url, sort_order: row.sort_order });
  }

  return products.map((p) => {
    const pImages = byProduct.get(p.id) || [];
    const primaryProduct = pImages[0]?.url ?? p.image_placeholder_url ?? null;
    return {
      ...p,
      images: pImages,
      image_placeholder_url: primaryProduct,
      variants: (p.variants || []).map((v) => {
        const vImages = byVariant.get(v.id) || [];
        const primaryVariant = vImages[0]?.url ?? v.image_url ?? null;
        return {
          ...v,
          images: vImages,
          image_url: primaryVariant,
        };
      }),
    };
  });
}

module.exports = {
  MAX_IMAGES_PER_ENTITY,
  listProductImages,
  listVariantImages,
  addProductImages,
  addVariantImages,
  removeProductImage,
  removeVariantImage,
  clearProductImages,
  clearVariantImages,
  syncProductPrimary,
  syncVariantPrimary,
  enrichProductsWithImages,
  safeDeleteIfUnused,
};
