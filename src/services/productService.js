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
    // Se fores atualizar o preço base, lembra-te que ele está na tabela 'products'
    // Mas para este update de variante, mantemos a estrutura atual
    const { stock_quantity, color, size } = data;
    const query = `
      UPDATE product_variants 
      SET stock_quantity = COALESCE($1, stock_quantity),
          color = COALESCE($2, color),
          size = COALESCE($3, size)
      WHERE sku = $4 
      RETURNING *;
    `;
    const { rows } = await db.query(query, [stock_quantity, color, size, sku]);
    return rows[0];
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
}

module.exports = new ProductService(); 