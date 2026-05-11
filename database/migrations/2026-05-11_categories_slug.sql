-- =====================================================
-- HR STORE — Migration 2026-05-11
-- categories.slug (NOT NULL) + backfill idempotente
-- =====================================================
-- Produção pode ter coluna `slug` obrigatória enquanto o
-- dashboard fazia INSERT só de name/description/sort_order.
-- =====================================================

BEGIN;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'categories'
      AND column_name = 'slug'
  ) THEN
    ALTER TABLE categories ADD COLUMN slug VARCHAR(200);
    RAISE NOTICE '✓ categories.slug criado';
  ELSE
    RAISE NOTICE '✓ categories.slug já existia (no-op)';
  END IF;
END $$;

UPDATE categories
SET slug = COALESCE(
  NULLIF(
    trim(both '-' from regexp_replace(
      regexp_replace(
        lower(translate(
          trim(name),
          'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
          'aaaaaeeeeiiiiooooouuuucnaaaaaeeeeiiiiooooouuuucn'
        )),
        '[^a-z0-9]+',
        '-',
        'g'
      ),
      '(^-|-$)',
      '',
      'g'
    )),
    ''
  ),
  'categoria-' || id::text
)
WHERE slug IS NULL OR btrim(COALESCE(slug, '')) = '';

WITH ranked AS (
  SELECT
    id,
    slug AS base_slug,
    row_number() OVER (PARTITION BY slug ORDER BY id) AS rn
  FROM categories
)
UPDATE categories c
SET slug = r.base_slug || '-' || r.rn::text
FROM ranked r
WHERE c.id = r.id
  AND r.rn > 1;

ALTER TABLE categories ALTER COLUMN slug SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS categories_slug_key ON categories (slug);

COMMIT;
