const db = require('../config/db');

class ProductService {
  async getAllProducts(search = '') {
    try {
      // Agora usamos 'base_price' e damos o apelido (alias) de 'price'
      const query = `
        SELECT 
          v.id,
          p.name,
          p.base_price as price, 
          v.sku,
          v.color,
          v.size,
          v.stock_quantity as stock
        FROM product_variants v
        INNER JOIN products p ON v.product_id = p.id
        WHERE v.sku ILIKE $1 
           OR p.name ILIKE $1
        ORDER BY p.name ASC, v.sku ASC
      `;
      
      const { rows } = await db.query(query, [`%${search}%`]);
      console.log(`✅ ${rows.length} variações carregadas com sucesso.`);
      return rows;

    } catch (error) {
      console.error("❌ Erro ao listar produtos:", error.message);
      // Fallback para evitar tela branca no front
      const fallback = await db.query(`SELECT *, stock_quantity as stock FROM product_variants LIMIT 50`);
      return fallback.rows;
    }
  }

  async updateProduct(sku, data) {
    const { stock_quantity, color, size, name, base_price } = data;
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

      if (name !== undefined || base_price !== undefined) {
        await client.query(
          `UPDATE products
           SET name = COALESCE($1, name),
               base_price = COALESCE($2, base_price)
           WHERE id = $3`,
          [name ?? null, base_price ?? null, variantRes.rows[0].product_id]
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
    const { name, base_price, sku, color, size, stock_quantity = 0 } = data;

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const productRes = await client.query(
        `INSERT INTO products (name, base_price) VALUES ($1, $2) RETURNING id`,
        [name, base_price]
      );
      const productId = productRes.rows[0].id;

      const variantRes = await client.query(
        `INSERT INTO product_variants (product_id, sku, color, size, stock_quantity)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [productId, sku, color, size, stock_quantity]
      );

      await client.query('COMMIT');

      return { ...variantRes.rows[0], name, price: base_price };
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

      const variantRes = await client.query(
        `DELETE FROM product_variants WHERE sku = $1 RETURNING product_id`,
        [sku]
      );

      if (!variantRes.rows[0]) {
        await client.query('ROLLBACK');
        return false;
      }

      const productId = variantRes.rows[0].product_id;
      const countRes = await client.query(
        `SELECT COUNT(*) FROM product_variants WHERE product_id = $1`,
        [productId]
      );

      if (parseInt(countRes.rows[0].count) === 0) {
        await client.query(`DELETE FROM products WHERE id = $1`, [productId]);
      }

      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = new ProductService(); 