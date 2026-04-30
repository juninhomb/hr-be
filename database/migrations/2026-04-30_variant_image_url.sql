-- =====================================================
-- HR STORE — Migration 2026-04-30
-- Adicionar image_url a product_variants
-- =====================================================
-- POR QUÊ:
--   Cada variante (combinação cor/tamanho) pode precisar
--   da sua própria foto — tipicamente fotos variam por COR.
--   Quando NULL, a variante herda a imagem do produto-base
--   (`products.image_placeholder_url`). Quando NULL em ambas,
--   o frontend mostra o placeholder CSS (iniciais).
--
-- IDEMPOTENTE:
--   `ADD COLUMN IF NOT EXISTS` é seguro para múltiplas execuções.
-- =====================================================

BEGIN;

ALTER TABLE product_variants
  ADD COLUMN IF NOT EXISTS image_url VARCHAR(500);

DO $$
DECLARE
  total INT;
BEGIN
  SELECT COUNT(*) INTO total FROM product_variants;
  RAISE NOTICE '✓ Coluna image_url disponível. Total de variantes: %', total;
END $$;

COMMIT;
