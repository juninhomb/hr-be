-- =====================================================
-- HR STORE USEFUL QUERIES
-- =====================================================
-- Collection of common queries for business operations
-- Updated: 2026-04-26
-- =====================================================

-- =====================================================
-- 📊 DASHBOARD QUERIES
-- =====================================================

-- 1. Today's Order Summary
SELECT 
  COUNT(*) as total_orders,
  SUM(total_amount) as total_revenue,
  COUNT(DISTINCT customer_id) as unique_customers,
  COUNT(CASE WHEN status = 'aguardando_pagamento' THEN 1 END) as pending_payment,
  COUNT(CASE WHEN status = 'pago' THEN 1 END) as paid,
  COUNT(CASE WHEN status = 'enviado' THEN 1 END) as shipped
FROM orders
WHERE DATE(created_at) = CURRENT_DATE;

-- 2. Weekly Revenue Trend
SELECT 
  DATE_TRUNC('day', created_at)::DATE as day,
  COUNT(*) as orders,
  SUM(total_amount) as revenue,
  AVG(total_amount) as avg_order_value
FROM orders
WHERE created_at > CURRENT_DATE - INTERVAL '7 days'
GROUP BY DATE_TRUNC('day', created_at)
ORDER BY day DESC;

-- 3. Top Customers (This Month)
SELECT 
  c.id,
  c.full_name,
  c.whatsapp_number,
  COUNT(o.id) as orders_this_month,
  SUM(o.total_amount) as spent_this_month,
  MAX(o.created_at) as last_purchase
FROM customers c
LEFT JOIN orders o ON c.id = o.customer_id 
  AND o.created_at > DATE_TRUNC('month', CURRENT_DATE)
GROUP BY c.id
HAVING COUNT(o.id) > 0
ORDER BY spent_this_month DESC
LIMIT 10;

-- =====================================================
-- 🛍️ INVENTORY MANAGEMENT
-- =====================================================

-- 4. Low Stock Alert (< 5 units)
SELECT 
  p.id,
  p.name,
  pv.sku,
  pv.color,
  pv.size,
  pv.stock_quantity,
  CASE 
    WHEN pv.stock_quantity = 0 THEN '🔴 OUT OF STOCK'
    WHEN pv.stock_quantity < 3 THEN '🟠 CRITICAL'
    ELSE '🟡 LOW'
  END as status
FROM product_variants pv
JOIN products p ON pv.product_id = p.id
WHERE pv.stock_quantity < 5
ORDER BY pv.stock_quantity ASC;

-- 5. Stock Count by Product
SELECT 
  p.id,
  p.name,
  COUNT(pv.id) as variants,
  COALESCE(SUM(pv.stock_quantity), 0) as total_stock,
  COUNT(CASE WHEN pv.stock_quantity = 0 THEN 1 END) as out_of_stock_variants
FROM products p
LEFT JOIN product_variants pv ON p.id = pv.product_id
WHERE p.is_active = true
GROUP BY p.id
ORDER BY total_stock ASC;

-- 6. Stock by Color & Size
SELECT 
  p.name,
  pv.color,
  pv.size,
  pv.sku,
  pv.stock_quantity,
  p.base_price * pv.stock_quantity as inventory_value
FROM product_variants pv
JOIN products p ON pv.product_id = p.id
WHERE p.is_active = true
ORDER BY p.name, pv.color, pv.size;

-- 7. Total Inventory Value
SELECT 
  SUM(pv.stock_quantity * p.base_price) as total_inventory_value,
  COUNT(DISTINCT p.id) as total_products,
  COUNT(DISTINCT pv.id) as total_variants,
  SUM(pv.stock_quantity) as total_units
FROM product_variants pv
JOIN products p ON pv.product_id = p.id
WHERE p.is_active = true;

-- =====================================================
-- 💳 ORDER MANAGEMENT
-- =====================================================

-- 8. Pending Payment Orders (Most Urgent)
SELECT 
  o.id as order_id,
  c.full_name as customer,
  c.whatsapp_number,
  o.total_amount,
  o.origin,
  EXTRACT(HOUR FROM NOW() - o.created_at) as hours_pending,
  o.stripe_link_id,
  o.created_at
FROM orders o
LEFT JOIN customers c ON o.customer_id = c.id
WHERE o.status = 'aguardando_pagamento'
ORDER BY o.created_at ASC;

-- 9. Recent Orders (Last 24h)
SELECT 
  o.id as order_id,
  c.full_name as customer,
  c.whatsapp_number,
  o.total_amount,
  o.status,
  o.origin,
  o.payment_method,
  o.created_at
FROM orders o
LEFT JOIN customers c ON o.customer_id = c.id
WHERE o.created_at > NOW() - INTERVAL '24 hours'
ORDER BY o.created_at DESC;

-- 10. Orders by Payment Status
SELECT 
  status,
  COUNT(*) as count,
  SUM(total_amount) as total_amount,
  ROUND(AVG(total_amount), 2) as avg_amount,
  MIN(created_at) as oldest_order,
  MAX(created_at) as newest_order
FROM orders
WHERE created_at > CURRENT_DATE - INTERVAL '30 days'
GROUP BY status
ORDER BY count DESC;

-- 11. Unpaid Orders (> 7 days)
SELECT 
  o.id as order_id,
  c.full_name,
  c.whatsapp_number,
  o.total_amount,
  EXTRACT(DAY FROM NOW() - o.created_at) as days_pending,
  o.stripe_link_id,
  o.created_at
FROM orders o
LEFT JOIN customers c ON o.customer_id = c.id
WHERE o.status = 'aguardando_pagamento'
  AND o.created_at < NOW() - INTERVAL '7 days'
ORDER BY days_pending DESC;

-- =====================================================
-- 👥 CUSTOMER MANAGEMENT
-- =====================================================

-- 12. Customer 360 View
SELECT 
  c.id,
  c.full_name,
  c.whatsapp_number,
  c.email,
  COUNT(o.id) as total_orders,
  SUM(o.total_amount) as lifetime_value,
  ROUND(AVG(o.total_amount), 2) as avg_order_value,
  MAX(o.created_at) as last_purchase,
  c.created_at as customer_since,
  EXTRACT(DAY FROM NOW() - c.created_at) as days_as_customer
FROM customers c
LEFT JOIN orders o ON c.id = o.customer_id
GROUP BY c.id
ORDER BY lifetime_value DESC;

-- 13. New Customers (Last 7 days)
SELECT 
  c.id,
  c.full_name,
  c.whatsapp_number,
  c.email,
  COUNT(o.id) as orders_placed,
  COALESCE(SUM(o.total_amount), 0) as total_spent,
  c.created_at,
  EXTRACT(DAY FROM NOW() - c.created_at) as days_since_signup
FROM customers c
LEFT JOIN orders o ON c.id = o.customer_id
WHERE c.created_at > CURRENT_DATE - INTERVAL '7 days'
GROUP BY c.id
ORDER BY c.created_at DESC;

-- 14. Inactive Customers (No purchase in 30 days)
SELECT 
  c.id,
  c.full_name,
  c.whatsapp_number,
  COUNT(o.id) as total_all_time_orders,
  MAX(o.created_at) as last_purchase,
  EXTRACT(DAY FROM NOW() - MAX(o.created_at)) as days_since_last_purchase
FROM customers c
LEFT JOIN orders o ON c.id = o.customer_id
GROUP BY c.id
HAVING MAX(o.created_at) < NOW() - INTERVAL '30 days'
   OR MAX(o.created_at) IS NULL
ORDER BY last_purchase ASC NULLS FIRST;

-- 15. Duplicate WhatsApp Check
SELECT 
  whatsapp_number,
  COUNT(*) as duplicate_count,
  STRING_AGG(full_name, ', ') as names,
  STRING_AGG(id::TEXT, ', ') as ids
FROM customers
GROUP BY whatsapp_number
HAVING COUNT(*) > 1;

-- =====================================================
-- 📝 AUDIT & COMPLIANCE
-- =====================================================

-- 16. Admin Activity Log (Last 7 days)
SELECT 
  DATE(created_at) as date,
  admin_user,
  action,
  COUNT(*) as action_count
FROM audit_logs
WHERE created_at > CURRENT_DATE - INTERVAL '7 days'
GROUP BY DATE(created_at), admin_user, action
ORDER BY created_at DESC;

-- 17. Recent Admin Actions
SELECT 
  admin_user,
  action,
  details,
  created_at
FROM audit_logs
WHERE created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC
LIMIT 50;

-- 18. Price Change History
SELECT 
  details->>'product_id' as product_id,
  details->>'old_price' as old_price,
  details->>'new_price' as new_price,
  admin_user,
  created_at
FROM audit_logs
WHERE action = 'UPDATE_PRICE'
ORDER BY created_at DESC
LIMIT 20;

-- 19. Stock Adjustments Log
SELECT 
  details->>'sku' as sku,
  details->>'quantity_removed' as quantity_removed,
  details->>'new_stock' as new_stock,
  admin_user,
  created_at
FROM audit_logs
WHERE action = 'STOCK_DEDUCTION'
ORDER BY created_at DESC
LIMIT 30;

-- =====================================================
-- 🎯 ANALYTICS & REPORTING
-- =====================================================

-- 20. Revenue by Payment Origin
SELECT 
  origin,
  COUNT(*) as orders,
  SUM(total_amount) as revenue,
  ROUND(AVG(total_amount), 2) as avg_order,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) as pct_of_orders
FROM orders
WHERE created_at > CURRENT_DATE - INTERVAL '30 days'
GROUP BY origin
ORDER BY revenue DESC;

-- 21. Monthly Revenue Forecast
SELECT 
  DATE_TRUNC('month', created_at)::DATE as month,
  COUNT(*) as orders,
  SUM(total_amount) as revenue,
  ROUND(AVG(total_amount), 2) as avg_order_value,
  COUNT(DISTINCT customer_id) as unique_customers
FROM orders
GROUP BY DATE_TRUNC('month', created_at)
ORDER BY month DESC;

-- 22. Customer Cohort Analysis
SELECT 
  DATE_TRUNC('month', c.created_at)::DATE as signup_month,
  COUNT(DISTINCT c.id) as new_customers,
  COUNT(DISTINCT o.id) as orders_by_cohort,
  SUM(o.total_amount) as revenue_by_cohort,
  ROUND(100.0 * COUNT(DISTINCT o.id) / COUNT(DISTINCT c.id), 2) as purchase_rate_pct
FROM customers c
LEFT JOIN orders o ON c.id = o.customer_id
GROUP BY DATE_TRUNC('month', c.created_at)
ORDER BY signup_month DESC;

-- 23. Product Performance
SELECT 
  p.id,
  p.name,
  COUNT(DISTINCT o.id) as times_ordered,
  SUM(o.total_amount) as total_revenue,
  ROUND(AVG(o.total_amount), 2) as avg_order_value,
  COUNT(DISTINCT o.customer_id) as unique_customers
FROM products p
LEFT JOIN product_variants pv ON p.id = pv.product_id
LEFT JOIN orders o ON pv.id = o.id
WHERE p.is_active = true
GROUP BY p.id, p.name
ORDER BY total_revenue DESC;

-- =====================================================
-- 🔧 MAINTENANCE QUERIES
-- =====================================================

-- 24. Database Size
SELECT 
  pg_size_pretty(pg_database_size('evolution_db')) as database_size;

-- 25. Table Sizes
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_catalog.pg_tables
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- 26. Index Usage
SELECT 
  schemaname,
  tablename,
  indexname,
  idx_scan as scan_count,
  idx_tup_read as tuples_read,
  idx_tup_fetch as tuples_fetched
FROM pg_catalog.pg_stat_user_indexes
ORDER BY idx_scan DESC;

-- 27. Slow Queries (Most used tables)
SELECT 
  schemaname,
  tablename,
  seq_scan,
  seq_tup_read,
  idx_scan,
  idx_tup_fetch
FROM pg_catalog.pg_stat_user_tables
ORDER BY seq_scan DESC;

-- 28. Connections
SELECT 
  datname,
  count(*) as connection_count
FROM pg_stat_activity
GROUP BY datname;

-- =====================================================
-- ⚡ PERFORMANCE TUNING
-- =====================================================

-- 29. Analyze Table Statistics
ANALYZE;

-- 30. Vacuum and Analyze (Maintenance)
-- WARNING: Run during off-peak hours
-- VACUUM ANALYZE;

-- =====================================================
-- 🗂️ BACKUP VERIFICATION
-- =====================================================

-- 31. Data Consistency Check
SELECT 
  'products' as table_name,
  COUNT(*) as row_count
FROM products
UNION ALL
SELECT 'product_variants', COUNT(*) FROM product_variants
UNION ALL
SELECT 'customers', COUNT(*) FROM customers
UNION ALL
SELECT 'orders', COUNT(*) FROM orders
UNION ALL
SELECT 'audit_logs', COUNT(*) FROM audit_logs;

-- 32. Orphaned Records Check
-- Orders without customers
SELECT 
  o.id as order_id,
  o.customer_id,
  o.total_amount,
  o.created_at
FROM orders o
LEFT JOIN customers c ON o.customer_id = c.id
WHERE c.id IS NULL;

-- Product variants without products
SELECT 
  pv.id as variant_id,
  pv.product_id,
  pv.sku
FROM product_variants pv
LEFT JOIN products p ON pv.product_id = p.id
WHERE p.id IS NULL;
