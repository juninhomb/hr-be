-- =====================================================
-- HR STORE — Migration 2026-06-23
-- Produtos em SALDO (campo products.is_saldo)
-- =====================================================
-- CONTEXTO:
--   A admin marca produtos-base como "saldo" para secção
--   dedicada no site público (implementação futura no frontend).
--   O flag vive ao nível do produto (não da variante).
--
-- IDEMPOTENTE: pode ser executada múltiplas vezes em segurança.
-- =====================================================

BEGIN;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'is_saldo'
  ) THEN
    ALTER TABLE products ADD COLUMN is_saldo BOOLEAN NOT NULL DEFAULT false;
    RAISE NOTICE '✓ products.is_saldo criado';
  ELSE
    RAISE NOTICE '✓ products.is_saldo já existia (no-op)';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_products_is_saldo
  ON products (is_saldo)
  WHERE is_saldo = true;

COMMIT;
