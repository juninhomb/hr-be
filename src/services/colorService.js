const db = require('../config/db');

/**
 * Resolve cor para escrita em product_variants: obriga catálogo quando há ID ou texto.
 * @param {import('pg').PoolClient} client
 * @param {{ color_id?: unknown, color?: unknown }} opts
 * @returns {Promise<{ color_id: number | null, color: string | null }>}
 */
async function resolveVariantColorForWrite(client, opts) {
  const { color_id: rawId, color: rawColor } = opts || {};
  const pid = parseInt(rawId, 10);
  if (Number.isFinite(pid) && pid > 0) {
    const r = await client.query('SELECT id, name FROM catalog_colors WHERE id = $1', [pid]);
    if (!r.rows[0]) {
      const e = new Error('Cor inválida.');
      e.status = 400;
      throw e;
    }
    return { color_id: r.rows[0].id, color: r.rows[0].name };
  }

  const c = rawColor != null && rawColor !== '' ? String(rawColor).trim() : '';
  if (c) {
    const r = await client.query(
      `SELECT id, name FROM catalog_colors
        WHERE upper(trim(name)) = upper(trim($1))
        LIMIT 1`,
      [c],
    );
    if (!r.rows[0]) {
      const e = new Error(
        'Cor não encontrada no catálogo. Cria-a em Configurações → Cores ou escolhe uma da lista.',
      );
      e.status = 400;
      throw e;
    }
    return { color_id: r.rows[0].id, color: r.rows[0].name };
  }

  return { color_id: null, color: null };
}

class ColorService {
  async list() {
    const { rows } = await db.query(
      `SELECT c.id, c.name, c.sort_order, c.created_at,
              (SELECT COUNT(*)::int FROM product_variants v WHERE v.color_id = c.id) AS variant_count
         FROM catalog_colors c
         ORDER BY c.sort_order ASC, c.name ASC`,
    );
    return rows;
  }

  async create({ name, sort_order }) {
    const n = String(name || '').trim();
    if (!n) {
      const e = new Error('Nome da cor é obrigatório.');
      e.status = 400;
      throw e;
    }
    const so = Number(sort_order);
    try {
      const { rows } = await db.query(
        `INSERT INTO catalog_colors (name, sort_order) VALUES ($1, $2) RETURNING *`,
        [n, Number.isFinite(so) ? so : 100],
      );
      return rows[0];
    } catch (err) {
      if (err.code === '23505') {
        const e = new Error('Já existe uma cor com este nome.');
        e.status = 409;
        throw e;
      }
      throw err;
    }
  }

  async update(id, { name, sort_order }) {
    const cid = parseInt(id, 10);
    if (!Number.isFinite(cid)) return null;
    const cur = await db.query('SELECT id FROM catalog_colors WHERE id = $1', [cid]);
    if (!cur.rows[0]) return null;

    const updates = [];
    const vals = [];
    let i = 1;
    if (name !== undefined) {
      const n = String(name).trim();
      if (!n) {
        const e = new Error('Nome inválido.');
        e.status = 400;
        throw e;
      }
      updates.push(`name = $${i++}`);
      vals.push(n);
    }
    if (sort_order !== undefined) {
      const so = Number(sort_order);
      updates.push(`sort_order = $${i++}`);
      vals.push(Number.isFinite(so) ? so : 100);
    }
    if (!updates.length) {
      const { rows } = await db.query('SELECT * FROM catalog_colors WHERE id = $1', [cid]);
      return rows[0];
    }
    vals.push(cid);
    let rows;
    try {
      const res = await db.query(
        `UPDATE catalog_colors SET ${updates.join(', ')} WHERE id = $${i} RETURNING *`,
        vals,
      );
      rows = res.rows;
    } catch (err) {
      if (err.code === '23505') {
        const e = new Error('Já existe uma cor com este nome.');
        e.status = 409;
        throw e;
      }
      throw err;
    }
    const updated = rows[0];
    if (name !== undefined) {
      await db.query(
        `UPDATE product_variants SET color = $1 WHERE color_id = $2`,
        [updated.name, cid],
      );
    }
    return updated;
  }

  async destroy(id) {
    const cid = parseInt(id, 10);
    if (!Number.isFinite(cid)) return false;
    try {
      const { rowCount } = await db.query('DELETE FROM catalog_colors WHERE id = $1', [cid]);
      return rowCount > 0;
    } catch (err) {
      if (err.code === '23503') {
        const e = new Error(
          'Não é possível apagar: existem variantes ligadas a esta cor. Reatribui-as primeiro.',
        );
        e.status = 409;
        throw e;
      }
      throw err;
    }
  }
}

module.exports = {
  ColorService: new ColorService(),
  resolveVariantColorForWrite,
};
