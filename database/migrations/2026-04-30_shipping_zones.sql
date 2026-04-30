-- =====================================================
-- Shipping zones + extensão de customers (morada estruturada)
-- =====================================================
-- Substitui o cálculo de frete via env por uma tabela editável no admin,
-- e prepara o suporte a múltiplos países/regiões.
--
-- Idempotente: pode ser corrida várias vezes sem efeito secundário.
-- =====================================================

BEGIN;

-- 1) Tabela shipping_zones --------------------------------------------------
CREATE TABLE IF NOT EXISTS shipping_zones (
  id SERIAL PRIMARY KEY,
  country_code     VARCHAR(2)   NOT NULL,
  region           VARCHAR(100),
  label            VARCHAR(150) NOT NULL,
  fee_eur          NUMERIC(10, 2) NOT NULL CHECK (fee_eur >= 0),
  free_above_eur   NUMERIC(10, 2),
  -- prefixo do código postal (LIKE 'prefix%'). Vazio = catch-all do país.
  postal_code_prefix VARCHAR(10) DEFAULT '',
  sort_order       INTEGER DEFAULT 100,
  is_active        BOOLEAN DEFAULT true,
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_shipping_zones_country
  ON shipping_zones(country_code);
CREATE INDEX IF NOT EXISTS idx_shipping_zones_active
  ON shipping_zones(is_active);

-- 2) Seed: zonas iniciais ---------------------------------------------------
-- Apenas insere se a tabela estiver vazia (não sobrescreve dados manuais
-- já configurados pelo admin).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM shipping_zones LIMIT 1) THEN
    INSERT INTO shipping_zones
      (country_code, region,            label,                 fee_eur, free_above_eur, postal_code_prefix, sort_order)
    VALUES
      ('PT', 'Continental',     'Portugal Continental',         5.00,  NULL, '',  10),
      ('PT', 'Madeira/Açores',  'Madeira e Açores',             8.00,  NULL, '9', 20),
      ('ES', NULL,              'Espanha',                      15.00, NULL, '',  30),
      ('EU', NULL,              'União Europeia (resto)',       20.00, NULL, '',  40);

    RAISE NOTICE '✓ shipping_zones populado com 4 zonas iniciais.';
  ELSE
    RAISE NOTICE '✓ shipping_zones já tem dados — seed ignorado.';
  END IF;
END $$;

-- 3) Trigger updated_at -----------------------------------------------------
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

-- 4) Customers: campos estruturados de morada -------------------------------
-- Mantemos `address` como TEXT free-form (compatibilidade com pedidos do
-- WhatsApp), mas adicionamos colunas para o site público.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS postal_code VARCHAR(20);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS city        VARCHAR(150);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS country     VARCHAR(2) DEFAULT 'PT';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS phone       VARCHAR(20);

-- 5) Snapshot da zona usada no pedido (útil para histórico/auditoria) -------
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_zone_id INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_shipping_zone_id_fkey'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_shipping_zone_id_fkey
      FOREIGN KEY (shipping_zone_id) REFERENCES shipping_zones(id) ON DELETE SET NULL;
  END IF;
END $$;

COMMIT;
