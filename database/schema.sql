-- =====================================================
-- HR STORE DATABASE SCHEMA
-- =====================================================
-- Created: 2026-04-26
-- Database: evolution_db
-- Purpose: Complete schema for HR Store business logic
-- =====================================================

-- =====================================================
-- 1. CATEGORIES TABLE
-- =====================================================
-- For product categorization (must exist before products FK)
CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- 2. PRODUCTS TABLE
-- =====================================================
-- Stores the base product information (without variants)
CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  category_id INTEGER,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  characteristics TEXT,
  base_price NUMERIC(12, 2) NOT NULL,
  image_placeholder_url VARCHAR(500),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
);

CREATE INDEX idx_products_category_id ON products(category_id);
CREATE INDEX idx_products_is_active ON products(is_active);

-- =====================================================
-- 3. PRODUCT_VARIANTS TABLE
-- =====================================================
-- Stores product variations (colors × sizes combinations)
-- Manages individual SKU stock levels
CREATE TABLE IF NOT EXISTS product_variants (
  id SERIAL PRIMARY KEY,
  product_id INTEGER,
  sku VARCHAR(100) NOT NULL UNIQUE,
  color VARCHAR(50),
  size VARCHAR(20),
  stock_quantity INTEGER DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE INDEX idx_product_variants_product_id ON product_variants(product_id);
CREATE INDEX idx_product_variants_sku ON product_variants(sku);
CREATE INDEX idx_product_variants_is_active ON product_variants(is_active);
CREATE INDEX idx_product_variants_color_size ON product_variants(color, size);

-- =====================================================
-- 4. CUSTOMERS TABLE
-- =====================================================
-- CRM data for WhatsApp customers
-- WhatsApp number is the unique identifier
CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY,
  full_name VARCHAR(255),
  whatsapp_number VARCHAR(20) NOT NULL UNIQUE,
  email VARCHAR(255),
  address TEXT,
  total_orders INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  CHECK (whatsapp_number ~ '^[0-9]{10,15}$')
);

-- Migration: add address column if it doesn't exist yet (safe to run on existing DBs)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'customers' AND column_name = 'address'
  ) THEN
    ALTER TABLE customers ADD COLUMN address TEXT;
  END IF;
END $$;

CREATE INDEX idx_customers_whatsapp_number ON customers(whatsapp_number);
CREATE INDEX idx_customers_created_at ON customers(created_at);

-- =====================================================
-- 5. ORDERS TABLE
-- =====================================================
-- Main orders table for tracking customer purchases
-- Tracks payment status, origin (WhatsApp/Web), and Stripe integration
CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER,
  total_amount NUMERIC(12, 2) NOT NULL,
  payment_method VARCHAR(50),
  status VARCHAR(50) DEFAULT 'aguardando_pagamento',
  origin VARCHAR(50),
  stripe_link_id VARCHAR(500),
  -- Observações livres do cliente no checkout (site)
  customer_notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
  
  CHECK (status IN ('aguardando_pagamento', 'pago', 'enviado', 'entregue', 'cancelado'))
);

CREATE INDEX idx_orders_customer_id ON orders(customer_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created_at ON orders(created_at);
CREATE INDEX idx_orders_stripe_link_id ON orders(stripe_link_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'orders'
      AND column_name = 'customer_notes'
  ) THEN
    ALTER TABLE orders ADD COLUMN customer_notes TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'orders'
      AND column_name = 'coupon_code'
  ) THEN
    ALTER TABLE orders ADD COLUMN coupon_code VARCHAR(64);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'orders'
      AND column_name = 'discount_amount'
  ) THEN
    ALTER TABLE orders ADD COLUMN discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0;
  END IF;
END $$;

-- =====================================================
-- 6. ORDER_ITEMS TABLE
-- =====================================================
-- Line items for each order (which products/variants were purchased)
-- Required to persist the content of every order
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
-- 7. AUDIT_LOGS TABLE
-- =====================================================
-- Compliance & auditing table
-- Tracks all admin actions for compliance
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
-- 8. DISCOUNT_COUPONS (checkout site — gerido no admin)
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
