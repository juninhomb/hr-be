-- Características do produto (texto livre, visível na ficha pública).

BEGIN;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS characteristics TEXT;

COMMENT ON COLUMN products.characteristics IS
  'Detalhes técnicos / destaques do produto; mostrado no site entre CTAs e info de envio.';

COMMIT;
