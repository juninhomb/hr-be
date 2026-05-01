/**
 * Serviço admin para gerir categorias (`categories`).
 *
 * O catálogo público já usa `publicService.listCategories()` para a home /
 * sidebar de produtos. Aqui ficam as operações administrativas (CRUD +
 * gestão da imagem) usadas pelo dashboard.
 *
 * NOTAS:
 *  - Manter `name` UNIQUE (constraint `categories_name_key`).
 *  - Apagar categoria SOL DESLIGA a referência dos produtos (FK
 *    `ON DELETE SET NULL`), mas avisamos quem chama com a contagem
 *    para o admin confirmar.
 *  - Imagem: ficheiro guardado em `uploads/categories/`. Quando trocada
 *    ou removida, o anterior é apagado do disco (best-effort).
 */
const fs = require('fs');
const path = require('path');
const db = require('../config/db');
const { CATEGORIES_DIR, toCategoryPublicUrl } = require('../config/upload');

class CategoryService {
  async list() {
    const { rows } = await db.query(`
      SELECT
        c.id,
        c.name,
        c.description,
        c.image_url,
        c.sort_order,
        COUNT(p.id) FILTER (WHERE
          EXISTS (
            SELECT 1 FROM product_variants pv
            WHERE pv.product_id = p.id AND COALESCE(pv.is_active, true)
          )
        )::int AS product_count,
        c.created_at
      FROM categories c
      LEFT JOIN products p ON p.category_id = c.id
      GROUP BY c.id
      ORDER BY c.sort_order ASC, c.name ASC
    `);
    return rows;
  }

  async create({ name, description, sort_order }) {
    const cleanName = String(name || '').trim();
    if (!cleanName) {
      throw httpError(400, 'O nome da categoria é obrigatório.');
    }
    const cleanSort = Number.isFinite(Number(sort_order)) ? Number(sort_order) : 100;
    try {
      const { rows } = await db.query(
        `INSERT INTO categories (name, description, sort_order)
         VALUES ($1, $2, $3)
         RETURNING id, name, description, image_url, sort_order, 0::int AS product_count`,
        [cleanName, description?.trim() || null, cleanSort]
      );
      return rows[0];
    } catch (e) {
      if (e.code === '23505') throw httpError(409, 'Já existe uma categoria com esse nome.');
      throw e;
    }
  }

  async update(id, payload) {
    const categoryId = parseInt(id, 10);
    if (!Number.isFinite(categoryId)) return null;

    const fields = [];
    const params = [];

    if (payload.name !== undefined) {
      const cleanName = String(payload.name).trim();
      if (!cleanName) throw httpError(400, 'O nome da categoria não pode ficar vazio.');
      params.push(cleanName);
      fields.push(`name = $${params.length}`);
    }
    if (payload.description !== undefined) {
      params.push(payload.description?.trim() || null);
      fields.push(`description = $${params.length}`);
    }
    if (payload.sort_order !== undefined) {
      const so = Number(payload.sort_order);
      if (!Number.isFinite(so)) throw httpError(400, 'sort_order inválido.');
      params.push(so);
      fields.push(`sort_order = $${params.length}`);
    }

    if (!fields.length) {
      // Sem alterações reais — devolve o estado actual.
      const cur = await db.query(
        `SELECT id, name, description, image_url, sort_order FROM categories WHERE id = $1`,
        [categoryId]
      );
      return cur.rows[0] || null;
    }

    params.push(categoryId);
    try {
      const { rows } = await db.query(
        `UPDATE categories SET ${fields.join(', ')} WHERE id = $${params.length}
         RETURNING id, name, description, image_url, sort_order`,
        params
      );
      return rows[0] || null;
    } catch (e) {
      if (e.code === '23505') throw httpError(409, 'Já existe uma categoria com esse nome.');
      throw e;
    }
  }

  async destroy(id) {
    const categoryId = parseInt(id, 10);
    if (!Number.isFinite(categoryId)) return false;

    // Captura imagem antes do DELETE para limpar o disco.
    const before = await db.query(
      `SELECT image_url FROM categories WHERE id = $1`,
      [categoryId]
    );
    if (!before.rows[0]) return false;
    const oldImage = before.rows[0].image_url;

    await db.query(`DELETE FROM categories WHERE id = $1`, [categoryId]);
    // FK ON DELETE SET NULL em products.category_id — nada a fazer manualmente.
    if (oldImage) safeDeleteCategoryImage(oldImage);
    return true;
  }

  // -------------------------------------------------------------
  // Imagem
  // -------------------------------------------------------------

  async setImage(id, filename) {
    const categoryId = parseInt(id, 10);
    if (!Number.isFinite(categoryId)) return null;
    const publicUrl = toCategoryPublicUrl(filename);

    const before = await db.query(
      `SELECT image_url FROM categories WHERE id = $1`,
      [categoryId]
    );
    if (!before.rows[0]) return null;
    const oldImage = before.rows[0].image_url;

    const { rows } = await db.query(
      `UPDATE categories SET image_url = $1 WHERE id = $2
       RETURNING id, name, image_url`,
      [publicUrl, categoryId]
    );
    if (oldImage && oldImage !== publicUrl) safeDeleteCategoryImage(oldImage);
    return rows[0];
  }

  async removeImage(id) {
    const categoryId = parseInt(id, 10);
    if (!Number.isFinite(categoryId)) return null;
    const before = await db.query(
      `SELECT image_url FROM categories WHERE id = $1`,
      [categoryId]
    );
    if (!before.rows[0]) return null;
    const oldImage = before.rows[0].image_url;
    await db.query(
      `UPDATE categories SET image_url = NULL WHERE id = $1`,
      [categoryId]
    );
    if (oldImage) safeDeleteCategoryImage(oldImage);
    return { id: categoryId, image_url: null };
  }
}

// -------------------------------------------------------------
// Helpers privados
// -------------------------------------------------------------

function safeDeleteCategoryImage(publicUrl) {
  try {
    if (!publicUrl || typeof publicUrl !== 'string') return;
    if (/^https?:\/\//i.test(publicUrl)) return; // URL externa — não é nossa.
    // Nunca apagar o placeholder partilhado (mesma defesa que productService).
    if (publicUrl.endsWith('/placeholder.svg') || publicUrl.endsWith('/placeholder.png')) return;
    const filename = path.basename(publicUrl);
    const fullPath = path.join(CATEGORIES_DIR, filename);
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
  } catch (e) {
    console.warn(`⚠️  Falha ao apagar imagem de categoria ${publicUrl}:`, e.message);
  }
}

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

module.exports = new CategoryService();
