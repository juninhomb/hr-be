-- Cupões de desconto geridos no backoffice (Configurações).
BEGIN;

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

COMMENT ON TABLE discount_coupons IS 'Cupões aplicáveis no checkout do site (código → percent ou valor fixo em EUR sobre artigos)';

COMMIT;
