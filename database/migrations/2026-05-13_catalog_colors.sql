-- Catálogo central de cores (admin) + FK em variantes.
-- Evita duplicados "BEGE" vs "Bege" e alinha site + backoffice.

CREATE TABLE IF NOT EXISTS catalog_colors (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(80) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS catalog_colors_name_norm_key
  ON catalog_colors (upper(trim(name)));

CREATE INDEX IF NOT EXISTS idx_catalog_colors_sort ON catalog_colors (sort_order, name);

-- Popular a partir das cores já usadas nas variantes (uma linha por valor normalizado).
INSERT INTO catalog_colors (name, sort_order)
SELECT dedup.canon, 100
FROM (
  SELECT upper(trim(v.color)) AS u, min(trim(v.color)) AS canon
  FROM product_variants v
  WHERE v.color IS NOT NULL AND trim(v.color) <> ''
  GROUP BY upper(trim(v.color))
) dedup
WHERE NOT EXISTS (
  SELECT 1 FROM catalog_colors c WHERE upper(trim(c.name)) = dedup.u
);

ALTER TABLE product_variants
  ADD COLUMN IF NOT EXISTS color_id INTEGER REFERENCES catalog_colors (id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_product_variants_color_id ON product_variants (color_id);

UPDATE product_variants v
SET color_id = c.id
FROM catalog_colors c
WHERE v.color_id IS NULL
  AND v.color IS NOT NULL
  AND trim(v.color) <> ''
  AND upper(trim(v.color)) = upper(trim(c.name));

COMMENT ON TABLE catalog_colors IS 'Cores canónicas — inventário escolhe por ID; product_variants.color espelha o nome.';
COMMENT ON COLUMN product_variants.color_id IS 'FK para catalog_colors; label em product_variants.color mantida para compatibilidade.';
