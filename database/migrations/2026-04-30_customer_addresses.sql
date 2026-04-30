-- =====================================================
-- Moradas guardadas por cliente + snapshot de entrega no pedido
-- Identificação de cliente: whatsapp_number (UNIQUE existente).
-- =====================================================

BEGIN;

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

-- Morada efectiva quando o cliente fez ESTE pedido (evita JOIN só com morada actual).
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_address TEXT;

-- Espelhar distrito na ficha rápida do cliente (última sincronização com checkout).
ALTER TABLE customers ADD COLUMN IF NOT EXISTS district VARCHAR(120);

COMMIT;
