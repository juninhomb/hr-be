const db = require('../config/db');

class DashboardService {
  async getStats() {
    // Estatísticas agregadas (cards principais)
    const aggregate = `
      SELECT
        (SELECT COUNT(*)::int FROM orders
          WHERE created_at >= CURRENT_DATE
            AND status IN ('pago','enviado','entregue')) AS orders_paid_today,
        (SELECT COUNT(*)::int FROM orders WHERE created_at >= CURRENT_DATE) AS orders_placed_today,
        (SELECT COALESCE(SUM(total_amount), 0)::float
           FROM orders
          WHERE status = 'pago' AND created_at >= CURRENT_DATE) AS revenue_today,
        (SELECT COALESCE(SUM(total_amount), 0)::float
           FROM orders
          WHERE status IN ('pago','enviado','entregue')
            AND created_at >= CURRENT_DATE - INTERVAL '7 days') AS revenue_7d,
        (SELECT COALESCE(SUM(total_amount), 0)::float
           FROM orders
          WHERE status IN ('pago','enviado','entregue')
            AND created_at >= CURRENT_DATE - INTERVAL '30 days') AS revenue_30d,
        (SELECT COUNT(*)::int FROM product_variants
          WHERE stock_quantity BETWEEN 1 AND 5) AS low_stock_count,
        (SELECT COUNT(*)::int FROM product_variants WHERE stock_quantity = 0) AS out_of_stock_count,
        (SELECT COUNT(*)::int FROM customers) AS total_customers,
        (SELECT COUNT(*)::int FROM orders WHERE status = 'aguardando_pagamento') AS pending_count,
        (SELECT COUNT(*)::int FROM orders
          WHERE status = 'pago' AND origin = 'whatsapp') AS to_ship_count,
        (SELECT COALESCE(SUM(total_amount), 0)::float FROM orders
          WHERE status = 'pago' AND origin = 'whatsapp') AS to_ship_value,
        (SELECT COALESCE(SUM(total_amount), 0)::float
           FROM orders WHERE status = 'aguardando_pagamento') AS pending_value,
        (SELECT COALESCE(SUM(stock_quantity), 0)::int FROM product_variants) AS total_stock,
        (SELECT COUNT(*)::int FROM products) AS total_products,
        (SELECT COUNT(*)::int FROM product_variants) AS total_variants,
        (SELECT COALESCE(SUM(v.stock_quantity * p.base_price), 0)::float
           FROM product_variants v
           INNER JOIN products p ON p.id = v.product_id) AS stock_value_eur,
        (SELECT COUNT(*)::int FROM products WHERE is_featured = true) AS featured_products_count,
        (SELECT COUNT(*)::int FROM product_variants WHERE is_active = false) AS hidden_variants_count
    `;

    // Receita diária últimos 14 dias
    const revenueSeries = `
      WITH dias AS (
        SELECT generate_series(
          CURRENT_DATE - INTERVAL '13 days',
          CURRENT_DATE,
          INTERVAL '1 day'
        )::date AS dia
      )
      SELECT
        d.dia,
        COALESCE(SUM(o.total_amount), 0)::float AS revenue,
        COUNT(o.id)::int AS orders_count
      FROM dias d
      LEFT JOIN orders o
        ON o.created_at::date = d.dia
       AND o.status IN ('pago', 'enviado', 'entregue')
      GROUP BY d.dia
      ORDER BY d.dia ASC
    `;

    // Top 5 produtos (por quantidade vendida em pedidos pagos)
    const topProducts = `
      SELECT
        p.name,
        COALESCE(SUM(oi.quantity), 0)::int AS qty_sold,
        COALESCE(SUM(oi.quantity * oi.unit_price), 0)::float AS revenue
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id AND o.status IN ('pago','enviado','entregue')
      LEFT JOIN product_variants v ON v.id = oi.variant_id OR v.sku = oi.sku
      LEFT JOIN products p ON p.id = v.product_id
      WHERE p.name IS NOT NULL
      GROUP BY p.name
      ORDER BY qty_sold DESC
      LIMIT 5
    `;

    // Distribuição de vendas por origem
    const salesByOrigin = `
      SELECT
        COALESCE(origin, 'sem_origem') AS origin,
        COUNT(*)::int AS count,
        COALESCE(SUM(total_amount), 0)::float AS revenue
      FROM orders
      WHERE status IN ('pago','enviado','entregue')
      GROUP BY origin
      ORDER BY revenue DESC
    `;

    // Stock crítico (esgotado + baixo 1–5, alinhado ao filtro do inventário) — top 8
    const lowStock = `
      SELECT v.sku, v.color, v.size, v.stock_quantity, p.name
      FROM product_variants v
      LEFT JOIN products p ON p.id = v.product_id
      WHERE v.stock_quantity <= 5
      ORDER BY v.stock_quantity ASC, p.name ASC
      LIMIT 8
    `;

    // Pedidos pendentes recentes (top 5)
    const recentPending = `
      SELECT o.id, o.total_amount, o.origin, o.created_at,
             COALESCE(o.is_delivery, false) AS is_delivery,
             c.full_name, c.whatsapp_number
        FROM orders o
        LEFT JOIN customers c ON c.id = o.customer_id
       WHERE o.status = 'aguardando_pagamento'
       ORDER BY o.created_at DESC
       LIMIT 5
    `;

    // Top 5 clientes (por receita)
    const topCustomers = `
      SELECT c.id, c.full_name, c.whatsapp_number,
             COUNT(o.id)::int AS orders_count,
             COALESCE(SUM(o.total_amount), 0)::float AS total_spent
      FROM customers c
      JOIN orders o ON o.customer_id = c.id
        AND o.status IN ('pago','enviado','entregue')
      GROUP BY c.id, c.full_name, c.whatsapp_number
      ORDER BY total_spent DESC
      LIMIT 5
    `;

    const [
      aggRes, seriesRes, topProdRes, originRes, lowStockRes, pendingRes, topCustRes,
    ] = await Promise.all([
      db.query(aggregate),
      db.query(revenueSeries),
      db.query(topProducts),
      db.query(salesByOrigin),
      db.query(lowStock),
      db.query(recentPending),
      db.query(topCustomers),
    ]);

    return {
      ...aggRes.rows[0],
      revenue_series: seriesRes.rows,
      top_products: topProdRes.rows,
      sales_by_origin: originRes.rows,
      low_stock: lowStockRes.rows,
      recent_pending: pendingRes.rows,
      top_customers: topCustRes.rows,
    };
  }
}

module.exports = new DashboardService();