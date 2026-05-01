-- Opcional: já correu 2026-05-01 antes destes UPDATE serem adicionados ao ficheiro.
-- Idempotente — pode correr várias vezes.

UPDATE products SET is_active = true WHERE is_active IS NOT TRUE;
UPDATE product_variants SET is_active = true WHERE is_active IS NOT TRUE;
