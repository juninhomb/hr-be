const db = require('../config/db');
const fs = require('fs');
const path = require('path');
const { UPLOAD_DIR, toPublicUrl } = require('../config/upload');

class ProductService {
  async getAllProducts(search = '') {
    try {
      // Devolve linha-por-variante (formato esperado pelo dashboard admin).
      // Inclui:
      //  - image_url      → da VARIANTE (override específico, pode ser null)
      //  - product_image  → do PRODUTO-base (fallback partilhado entre variantes)
      // O frontend usa: variant_image_url ?? product_image ?? <CSS placeholder>
      const query = `
        SELECT 
          v.id,
          p.id                    AS product_id,
          p.name,
          p.base_price            AS price,
          p.category_id,
          c.name                  AS category_name,
          p.image_placeholder_url AS product_image,
          p.is_featured,
          v.image_url             AS variant_image,
          v.sku,
          v.color,
          v.size,
          v.stock_quantity        AS stock
        FROM product_variants v
        INNER JOIN products p ON v.product_id = p.id
        LEFT JOIN categories c ON c.id = p.category_id
        WHERE v.sku ILIKE $1 
           OR p.name ILIKE $1
        ORDER BY p.is_featured DESC, p.name ASC, v.sku ASC
      `;
      
      const { rows } = await db.query(query, [`%${search}%`]);
      console.log(`✅ ${rows.length} variações carregadas com sucesso.`);
      // Compat: também devolvemos `image_url` (= variant ?? product) para
      // simplificar o frontend antigo enquanto migra.
      return rows.map((r) => ({
        ...r,
        image_url: r.variant_image || r.product_image || null,
      }));

    } catch (error) {
      console.error("❌ Erro ao listar produtos:", error.message);
      const fallback = await db.query(`SELECT *, stock_quantity as stock FROM product_variants LIMIT 50`);
      return fallback.rows;
    }
  }

  // Lista de produtos-base (sem variantes) — usada pelo modal
  // "Adicionar variante a produto existente".
  async getBaseProducts() {
    const { rows } = await db.query(`
      SELECT p.id, p.name, p.base_price,
             p.category_id,
             p.image_placeholder_url AS image_url,
             COUNT(v.id)::int AS variant_count
        FROM products p
        LEFT JOIN product_variants v ON v.product_id = p.id
       GROUP BY p.id
       ORDER BY p.name ASC
    `);
    return rows;
  }

  // Lista de categorias para o select do formulário de produto.
  async listCategories() {
    const { rows } = await db.query(`SELECT id, name FROM categories ORDER BY name ASC`);
    return rows;
  }

  /**
   * Marca/desmarca um produto como DESTAQUE. Recebe productId (id da
   * tabela `products`, não SKU) porque o destaque vive no produto-base
   * e não na variante.
   */
  async setFeatured(productId, isFeatured) {
    const id = parseInt(productId, 10);
    if (!Number.isFinite(id)) return null;
    const { rows } = await db.query(
      `UPDATE products SET is_featured = $1 WHERE id = $2 RETURNING id, name, is_featured`,
      [Boolean(isFeatured), id]
    );
    return rows[0] || null;
  }

  async addVariantToProduct(productId, { sku, color, size, stock_quantity = 0 }) {
    const productRes = await db.query(`SELECT id, name, base_price FROM products WHERE id = $1`, [productId]);
    if (!productRes.rows[0]) return null;
    const { rows } = await db.query(
      `INSERT INTO product_variants (product_id, sku, color, size, stock_quantity)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [productId, sku, color || null, size || null, stock_quantity || 0]
    );
    return { ...rows[0], name: productRes.rows[0].name, price: productRes.rows[0].base_price };
  }

  async updateProduct(sku, data) {
    const { stock_quantity, color, size, name, base_price, category_id } = data;
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const variantRes = await client.query(
        `UPDATE product_variants
         SET stock_quantity = COALESCE($1, stock_quantity),
             color = COALESCE($2, color),
             size = COALESCE($3, size)
         WHERE sku = $4
         RETURNING product_id`,
        [stock_quantity ?? null, color ?? null, size ?? null, sku]
      );

      if (!variantRes.rows[0]) {
        await client.query('ROLLBACK');
        return null;
      }

      // Atualiza campos do produto-base se algum deles foi enviado.
      // category_id é tratado à parte para permitir limpar (NULL explícito).
      if (
        name !== undefined ||
        base_price !== undefined ||
        category_id !== undefined
      ) {
        await client.query(
          `UPDATE products
           SET name        = COALESCE($1, name),
               base_price  = COALESCE($2, base_price),
               category_id = CASE
                                WHEN $4::boolean THEN $3::int
                                ELSE category_id
                             END
           WHERE id = $5`,
          [
            name ?? null,
            base_price ?? null,
            category_id === '' || category_id === null ? null : category_id ?? null,
            category_id !== undefined,                 // só altera se vier no payload
            variantRes.rows[0].product_id,
          ]
        );
      }

      await client.query('COMMIT');
      return variantRes.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async addStock(sku, quantity) {
    const query = `
      UPDATE product_variants 
      SET stock_quantity = stock_quantity + $1 
      WHERE sku = $2 
      RETURNING *;
    `;
    const { rows } = await db.query(query, [quantity, sku]);
    return rows[0];
  }

  async createProduct(data) {
    const {
      name, base_price, sku, color, size, stock_quantity = 0, category_id,
    } = data;

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      // category_id é opcional. Vazio ou null → NULL na DB.
      const cleanCategoryId =
        category_id === '' || category_id === null || category_id === undefined
          ? null
          : Number(category_id);

      const productRes = await client.query(
        `INSERT INTO products (name, base_price, category_id) VALUES ($1, $2, $3) RETURNING id`,
        [name, base_price, cleanCategoryId]
      );
      const productId = productRes.rows[0].id;

      const variantRes = await client.query(
        `INSERT INTO product_variants (product_id, sku, color, size, stock_quantity)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [productId, sku, color, size, stock_quantity]
      );

      await client.query('COMMIT');

      return {
        ...variantRes.rows[0],
        product_id: productId,
        name,
        price: base_price,
        category_id: cleanCategoryId,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async deleteProduct(sku) {
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      // Captura imagem da VARIANTE antes do delete para limpar o disco.
      const beforeRes = await client.query(
        `SELECT product_id, image_url FROM product_variants WHERE sku = $1`,
        [sku]
      );
      if (!beforeRes.rows[0]) {
        await client.query('ROLLBACK');
        return false;
      }
      const { product_id: productId, image_url: variantImg } = beforeRes.rows[0];

      await client.query(`DELETE FROM product_variants WHERE sku = $1`, [sku]);

      const countRes = await client.query(
        `SELECT COUNT(*) FROM product_variants WHERE product_id = $1`,
        [productId]
      );

      let productImg = null;
      if (parseInt(countRes.rows[0].count) === 0) {
        // Era a última variante — apaga produto-base também e captura imagem.
        const imgRes = await client.query(
          `SELECT image_placeholder_url FROM products WHERE id = $1`,
          [productId]
        );
        await client.query(`DELETE FROM products WHERE id = $1`, [productId]);
        productImg = imgRes.rows[0]?.image_placeholder_url || null;
      }

      await client.query('COMMIT');

      // Limpeza best-effort fora da transação (placeholder.svg fica protegido).
      if (variantImg) safeDeleteImage(variantImg);
      if (productImg) safeDeleteImage(productImg);

      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // -------------------------------------------------------------
  // Imagens de produtos
  // -------------------------------------------------------------

  /**
   * Associa uma imagem a um produto. Se já houver uma anterior, apaga-a do disco.
   * Recebe o filename gravado pelo multer (NÃO um caminho completo).
   */
  async setProductImage(productId, filename) {
    const id = parseInt(productId, 10);
    if (!Number.isFinite(id)) return null;

    const publicUrl = toPublicUrl(filename);

    // Primeiro descobre se há imagem anterior, para não a deixar órfã.
    const oldRes = await db.query(
      `SELECT image_placeholder_url FROM products WHERE id = $1`,
      [id]
    );
    if (!oldRes.rows[0]) return null;

    const oldUrl = oldRes.rows[0].image_placeholder_url;

    const { rows } = await db.query(
      `UPDATE products
          SET image_placeholder_url = $1
        WHERE id = $2
        RETURNING id, name, image_placeholder_url`,
      [publicUrl, id]
    );

    // Só agora apaga a antiga (depois do UPDATE com sucesso).
    if (oldUrl && oldUrl !== publicUrl) safeDeleteImage(oldUrl);

    return rows[0];
  }

  /**
   * Remove a referência da imagem do produto e apaga o ficheiro do disco.
   */
  async removeProductImage(productId) {
    const id = parseInt(productId, 10);
    if (!Number.isFinite(id)) return null;

    const oldRes = await db.query(
      `SELECT image_placeholder_url FROM products WHERE id = $1`,
      [id]
    );
    if (!oldRes.rows[0]) return null;

    const oldUrl = oldRes.rows[0].image_placeholder_url;
    await db.query(
      `UPDATE products SET image_placeholder_url = NULL WHERE id = $1`,
      [id]
    );
    if (oldUrl) safeDeleteImage(oldUrl);
    return { id, image_placeholder_url: null };
  }

  // -------------------------------------------------------------
  // Imagens de variantes (override por cor/tamanho)
  // -------------------------------------------------------------

  /**
   * Define imagem específica para uma variante. Se já houver uma anterior,
   * apaga-a do disco. NÃO mexe na imagem do produto-base.
   *
   * Opcionalmente, `applyToColor=true` propaga a mesma URL para todas as
   * variantes do mesmo produto que partilhem a mesma cor — útil porque
   * tipicamente a foto varia por cor (não por tamanho).
   */
  async setVariantImage(variantId, filename, { applyToColor = false } = {}) {
    const id = parseInt(variantId, 10);
    if (!Number.isFinite(id)) return null;

    const publicUrl = toPublicUrl(filename);

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      // Snapshot anterior (para apagar do disco e descobrir cor/produto)
      const oldRes = await client.query(
        `SELECT id, product_id, color, image_url FROM product_variants WHERE id = $1`,
        [id]
      );
      if (!oldRes.rows[0]) {
        await client.query('ROLLBACK');
        return null;
      }
      const { product_id: productId, color, image_url: oldUrl } = oldRes.rows[0];

      // Lista de URLs antigas a tentar apagar do disco depois do COMMIT.
      const urlsToDelete = new Set();
      if (oldUrl && oldUrl !== publicUrl) urlsToDelete.add(oldUrl);

      let affected;
      if (applyToColor && color) {
        const propRes = await client.query(
          `SELECT image_url FROM product_variants
            WHERE product_id = $1 AND color = $2 AND id <> $3 AND image_url IS NOT NULL`,
          [productId, color, id]
        );
        for (const r of propRes.rows) {
          if (r.image_url && r.image_url !== publicUrl) urlsToDelete.add(r.image_url);
        }
        const upd = await client.query(
          `UPDATE product_variants
              SET image_url = $1
            WHERE product_id = $2 AND color = $3
            RETURNING id, sku, color, size, image_url`,
          [publicUrl, productId, color]
        );
        affected = upd.rows;
      } else {
        const upd = await client.query(
          `UPDATE product_variants
              SET image_url = $1
            WHERE id = $2
            RETURNING id, sku, color, size, image_url`,
          [publicUrl, id]
        );
        affected = upd.rows;
      }

      await client.query('COMMIT');

      // Cleanup best-effort fora da transação
      for (const u of urlsToDelete) safeDeleteImage(u);

      return {
        updated: affected,
        applied_to_color: Boolean(applyToColor && color),
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Remove a imagem de uma variante (volta a herdar do produto-base).
   * Apaga o ficheiro do disco se não estiver a ser usado por outra variante.
   */
  async removeVariantImage(variantId) {
    const id = parseInt(variantId, 10);
    if (!Number.isFinite(id)) return null;

    const oldRes = await db.query(
      `SELECT image_url FROM product_variants WHERE id = $1`,
      [id]
    );
    if (!oldRes.rows[0]) return null;

    const oldUrl = oldRes.rows[0].image_url;
    await db.query(
      `UPDATE product_variants SET image_url = NULL WHERE id = $1`,
      [id]
    );

    // Só apaga do disco se NENHUMA outra variante ainda apontar ao mesmo URL
    // (caso tenha sido propagado por cor anteriormente).
    if (oldUrl) {
      const stillUsed = await db.query(
        `SELECT 1 FROM product_variants WHERE image_url = $1 LIMIT 1`,
        [oldUrl]
      );
      if (stillUsed.rowCount === 0) safeDeleteImage(oldUrl);
    }

    return { id, image_url: null };
  }
}

// -------------------------------------------------------------
// Helpers privados
// -------------------------------------------------------------

/**
 * Apaga um ficheiro de imagem do disco, dado o seu URL público
 * (ex.: `/uploads/products/product-3-1714.jpg`). Best-effort:
 * se o ficheiro não existir ou for o placeholder, ignora silenciosamente.
 */
function safeDeleteImage(publicUrl) {
  try {
    if (!publicUrl || typeof publicUrl !== 'string') return;
    // Não apagar o placeholder partilhado.
    if (publicUrl.endsWith('/placeholder.svg') || publicUrl.endsWith('/placeholder.png')) return;
    // Só toca em ficheiros DENTRO de uploads/products (evita path traversal).
    const filename = path.basename(publicUrl);
    const fullPath = path.join(UPLOAD_DIR, filename);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  } catch (e) {
    // best-effort — log e segue
    console.warn(`⚠️  Falha ao apagar imagem ${publicUrl}:`, e.message);
  }
}

module.exports = new ProductService();
