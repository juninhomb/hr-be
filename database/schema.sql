-- =====================================================
-- HR STORE DATABASE SCHEMA (baseline alinhado ao backend)
-- =====================================================
-- Instalação recomendada: na raiz do backend
--   npm run db:create-local   # opcional — role + base
--   npm run db:bootstrap      # este ficheiro + database/migrations/*.sql
--
-- `CREATE TABLE IF NOT EXISTS` não altera tabelas já existentes com menos
-- colunas — bases antigas devem continuar a usar as migrações em
-- database/migrations/. Para validar: npm run db:verify
-- =====================================================

-- =====================================================
-- 1. CATEGORIES
-- =====================================================
CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  image_url VARCHAR(500),
  sort_order INTEGER NOT NULL DEFAULT 100,
  -- Preenchido e tornado NOT NULL por database/migrations/2026-05-11_categories_slug.sql
  slug VARCHAR(200),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT categories_name_key UNIQUE (name)
);

CREATE INDEX IF NOT EXISTS idx_categories_sort_order ON categories (sort_order, name);

-- =====================================================
-- 2. CATALOG_COLORS (antes de product_variants.color_id)
-- =====================================================
CREATE TABLE IF NOT EXISTS catalog_colors (
  id SERIAL PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS catalog_colors_name_norm_key
  ON catalog_colors (upper(trim(name)));
CREATE INDEX IF NOT EXISTS idx_catalog_colors_sort ON catalog_colors (sort_order, name);

-- =====================================================
-- 3. PRODUCTS
-- =====================================================
CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  category_id INTEGER,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  characteristics TEXT,
  base_price NUMERIC(12, 2) NOT NULL,
  image_placeholder_url VARCHAR(500),
  is_active BOOLEAN DEFAULT true,
  is_featured BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
);

CREATE INDEX idx_products_category_id ON products(category_id);
CREATE INDEX idx_products_is_active ON products(is_active);
CREATE INDEX IF NOT EXISTS idx_products_is_featured
  ON products (is_featured)
  WHERE is_featured = true;

-- =====================================================
-- 4. PRODUCT_VARIANTS
-- =====================================================
CREATE TABLE IF NOT EXISTS product_variants (
  id SERIAL PRIMARY KEY,
  product_id INTEGER,
  sku VARCHAR(100) NOT NULL UNIQUE,
  color VARCHAR(50),
  size VARCHAR(20),
  stock_quantity INTEGER DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  image_url VARCHAR(500),
  color_id INTEGER REFERENCES catalog_colors(id) ON DELETE RESTRICT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE INDEX idx_product_variants_product_id ON product_variants(product_id);
CREATE INDEX idx_product_variants_sku ON product_variants(sku);
CREATE INDEX idx_product_variants_is_active ON product_variants(is_active);
CREATE INDEX idx_product_variants_color_size ON product_variants(color, size);
CREATE INDEX IF NOT EXISTS idx_product_variants_color_id ON product_variants (color_id);

-- =====================================================
-- 5. CUSTOMERS
-- =====================================================
CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY,
  full_name VARCHAR(255),
  whatsapp_number VARCHAR(20) NOT NULL UNIQUE,
  email VARCHAR(255),
  address TEXT,
  postal_code VARCHAR(20),
  city VARCHAR(150),
  district VARCHAR(120),
  country VARCHAR(2) DEFAULT 'PT',
  phone VARCHAR(20),
  total_orders INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CHECK (whatsapp_number ~ '^[0-9]{10,15}$')
);

CREATE INDEX idx_customers_whatsapp_number ON customers(whatsapp_number);
CREATE INDEX idx_customers_created_at ON customers(created_at);

-- =====================================================
-- 6. CUSTOMER_ADDRESSES
-- =====================================================
CREATE TABLE IF NOT EXISTS customer_addresses (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  label VARCHAR(80),
  street_name VARCHAR(512) NOT NULL,
  street_number VARCHAR(48) NOT NULL DEFAULT '',
  apartment TEXT,
  address_obs TEXT,
  postal_code VARCHAR(24),
  city VARCHAR(150),
  district VARCHAR(120),
  country VARCHAR(2) NOT NULL DEFAULT 'PT',
  address_key CHAR(32) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(customer_id, address_key)
);

CREATE INDEX IF NOT EXISTS idx_customer_addresses_customer_id
  ON customer_addresses(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_addresses_updated_at
  ON customer_addresses(customer_id, updated_at DESC);

-- =====================================================
-- 7. SHIPPING_ZONES (antes de orders.shipping_zone_id)
-- =====================================================
CREATE TABLE IF NOT EXISTS shipping_zones (
  id SERIAL PRIMARY KEY,
  country_code VARCHAR(2) NOT NULL,
  region VARCHAR(100),
  label VARCHAR(150) NOT NULL,
  fee_eur NUMERIC(10, 2) NOT NULL CHECK (fee_eur >= 0),
  free_above_eur NUMERIC(10, 2),
  postal_code_prefix VARCHAR(10) DEFAULT '',
  sort_order INTEGER DEFAULT 100,
  is_active BOOLEAN DEFAULT true,
  requires_whatsapp_checkout BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_shipping_zones_country ON shipping_zones(country_code);
CREATE INDEX IF NOT EXISTS idx_shipping_zones_active ON shipping_zones(is_active);

CREATE OR REPLACE FUNCTION shipping_zones_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_shipping_zones_updated_at ON shipping_zones;
CREATE TRIGGER trg_shipping_zones_updated_at
  BEFORE UPDATE ON shipping_zones
  FOR EACH ROW
  EXECUTE FUNCTION shipping_zones_set_updated_at();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM shipping_zones LIMIT 1) THEN
    INSERT INTO shipping_zones
      (country_code, region, label, fee_eur, free_above_eur, postal_code_prefix, sort_order)
    VALUES
      ('PT', 'Continental', 'Portugal Continental', 5.00, NULL, '', 10),
      ('PT', 'Madeira/Açores', 'Madeira e Açores', 8.00, NULL, '9', 20),
      ('ES', NULL, 'Espanha', 15.00, NULL, '', 30),
      ('EU', NULL, 'União Europeia (resto)', 20.00, NULL, '', 40);
  END IF;
END $$;

-- =====================================================
-- 8. ORDERS
-- =====================================================
CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER,
  total_amount NUMERIC(12, 2) NOT NULL,
  payment_method VARCHAR(50),
  status VARCHAR(50) DEFAULT 'aguardando_pagamento',
  origin VARCHAR(50),
  stripe_link_id VARCHAR(500),
  customer_notes TEXT,
  coupon_code VARCHAR(64),
  discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  is_delivery BOOLEAN DEFAULT false,
  shipping_fee NUMERIC(12, 2) DEFAULT 0,
  shipping_zone_id INTEGER,
  delivery_address TEXT,
  idempotency_key VARCHAR(80),
  pickup_ready_notified_at TIMESTAMPTZ,
  pickup_collected_at TIMESTAMPTZ,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
  FOREIGN KEY (shipping_zone_id) REFERENCES shipping_zones(id) ON DELETE SET NULL,
  CONSTRAINT orders_status_check CHECK (status IN (
    'aguardando_pagamento',
    'pago',
    'expedido',
    'enviado',
    'entregue',
    'cancelado'
  ))
);

CREATE INDEX idx_orders_customer_id ON orders(customer_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created_at ON orders(created_at);
CREATE INDEX idx_orders_stripe_link_id ON orders(stripe_link_id);
CREATE INDEX IF NOT EXISTS idx_orders_payment_method ON orders(payment_method);
CREATE INDEX IF NOT EXISTS idx_orders_origin ON orders(origin);
CREATE INDEX IF NOT EXISTS idx_orders_customer_status ON orders(customer_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_idempotency_key
  ON orders(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- =====================================================
-- 9. ORDER_ITEMS
-- =====================================================
CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL,
  variant_id INTEGER,
  sku VARCHAR(100) NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(12, 2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE SET NULL
);

CREATE INDEX idx_order_items_order_id ON order_items(order_id);
CREATE INDEX idx_order_items_sku ON order_items(sku);

-- =====================================================
-- 10. AUDIT_LOGS
-- =====================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  admin_user VARCHAR(255),
  action VARCHAR(255),
  details JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_logs_admin_user ON audit_logs(admin_user);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX idx_audit_logs_details ON audit_logs USING GIN(details);

-- =====================================================
-- 11. DISCOUNT_COUPONS
-- =====================================================
CREATE TABLE IF NOT EXISTS discount_coupons (
  id SERIAL PRIMARY KEY,
  code VARCHAR(48) NOT NULL,
  kind VARCHAR(16) NOT NULL CHECK (kind IN ('percent', 'fixed')),
  value NUMERIC(12, 2) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT discount_coupons_value_ok CHECK (
    (kind = 'percent' AND value > 0 AND value <= 100)
    OR (kind = 'fixed' AND value > 0)
  ),
  CONSTRAINT discount_coupons_code_unique UNIQUE (code)
);

CREATE INDEX IF NOT EXISTS idx_discount_coupons_active
  ON discount_coupons (is_active)
  WHERE is_active = true;



-- =====================================================
-- SAMPLE DATA (Optional)
-- =====================================================
-- Uncomment to populate with initial data

-- INSERT INTO categories (name, description) VALUES
--   ('Camisetas', 'Camisetas e tops'),
--   ('Calças', 'Calças e leggings'),
--   ('Acessórios', 'Acessórios e jóias');

-- =====================================================
-- VIEWS (Useful Queries)
-- =====================================================

-- Customer Order Summary
CREATE OR REPLACE VIEW customer_order_summary AS
SELECT 
  c.id,
  c.full_name,
  c.whatsapp_number,
  c.email,
  COUNT(o.id) as total_orders_placed,
  COALESCE(SUM(o.total_amount), 0) as lifetime_value,
  MAX(o.created_at) as last_order_date,
  c.created_at as customer_since
FROM customers c
LEFT JOIN orders o ON c.id = o.customer_id
GROUP BY c.id, c.full_name, c.whatsapp_number, c.email, c.created_at;

-- Product Stock Status
CREATE OR REPLACE VIEW product_stock_status AS
SELECT 
  p.id,
  p.name,
  pv.sku,
  pv.color,
  pv.size,
  pv.stock_quantity,
  CASE 
    WHEN pv.stock_quantity = 0 THEN 'out_of_stock'
    WHEN pv.stock_quantity < 5 THEN 'low_stock'
    ELSE 'in_stock'
  END as stock_status
FROM products p
LEFT JOIN product_variants pv ON p.id = pv.product_id
WHERE p.is_active = true;

-- Recent Orders with Customer Info
CREATE OR REPLACE VIEW recent_orders_with_customers AS
SELECT 
  o.id as order_id,
  o.id as order_number,
  c.full_name as customer_name,
  c.whatsapp_number,
  o.total_amount,
  o.status,
  o.origin,
  o.payment_method,
  o.created_at
FROM orders o
LEFT JOIN customers c ON o.customer_id = c.id
ORDER BY o.created_at DESC;
