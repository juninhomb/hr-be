-- Múltiplas imagens por produto e variante (galeria).
-- Mantém image_placeholder_url / image_url como imagem principal (1.ª da galeria).

BEGIN;

CREATE TABLE IF NOT EXISTS product_images (
  id          SERIAL PRIMARY KEY,
  product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url         VARCHAR(500) NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_images_product
  ON product_images (product_id, sort_order, id);

CREATE TABLE IF NOT EXISTS variant_images (
  id          SERIAL PRIMARY KEY,
  variant_id  INTEGER NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  url         VARCHAR(500) NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_variant_images_variant
  ON variant_images (variant_id, sort_order, id);

-- Migrar imagens já existentes (uma linha por URL legada).
INSERT INTO product_images (product_id, url, sort_order)
SELECT p.id, trim(p.image_placeholder_url), 0
  FROM products p
 WHERE p.image_placeholder_url IS NOT NULL
   AND trim(p.image_placeholder_url) <> ''
   AND NOT EXISTS (
     SELECT 1 FROM product_images pi
      WHERE pi.product_id = p.id AND pi.url = trim(p.image_placeholder_url)
   );

INSERT INTO variant_images (variant_id, url, sort_order)
SELECT v.id, trim(v.image_url), 0
  FROM product_variants v
 WHERE v.image_url IS NOT NULL
   AND trim(v.image_url) <> ''
   AND NOT EXISTS (
     SELECT 1 FROM variant_images vi
      WHERE vi.variant_id = v.id AND vi.url = trim(v.image_url)
   );

COMMENT ON TABLE product_images IS 'Galeria do produto-base; image_placeholder_url espelha a 1.ª imagem.';
COMMENT ON TABLE variant_images IS 'Galeria da variante; image_url espelha a 1.ª imagem.';

COMMIT;
