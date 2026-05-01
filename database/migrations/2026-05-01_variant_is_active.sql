-- Variante pode ficar inativa (não comercializada) sem apagar o SKU.
-- Stock e histórico mantêm-se; o site público só lista variantes ativas.

ALTER TABLE product_variants
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_product_variants_is_active
  ON product_variants(is_active);

-- Garantir que todo o catálogo legado fica ativo até o admin decidir o contrário.
UPDATE products SET is_active = true WHERE is_active IS NOT TRUE;
UPDATE product_variants SET is_active = true WHERE is_active IS NOT TRUE;
