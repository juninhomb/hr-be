const db = require('../config/db');

class DashboardService {
  async getStats() {
    const query = `
      SELECT 
        (SELECT COUNT(*)::text FROM orders WHERE created_at >= CURRENT_DATE) as sales_today,
        (SELECT COALESCE(SUM(total_amount), 0)::text FROM orders WHERE status = 'pago' AND created_at >= CURRENT_DATE) as revenue_today,
        (SELECT COUNT(*)::text FROM product_variants WHERE stock_quantity <= 3) as low_stock_count,
        (SELECT COUNT(*)::text FROM customers) as total_customers
    `;
    const { rows } = await db.query(query);
    return rows[0];
  }
}

module.exports = new DashboardService();