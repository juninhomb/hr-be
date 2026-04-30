-- =====================================================
-- HR STORE — Migration 2026-04-30
-- Produtos em DESTAQUE + imagens/ordenação para categorias
-- =====================================================
-- CONTEXTO:
--   Para suportar a nova homepage do site público:
--     1. A admin marca produtos como "destaque" (campo
--        `products.is_featured`) — esses aparecem primeiro no
--        carrossel "Destaques".
--     2. A grelha de Categorias passa a usar imagens reais
--        atribuídas via dashboard (`categories.image_url`).
--     3. Adicionamos `sort_order` para o admin escolher a
--        ordem em que as categorias aparecem na home/produtos.
--     4. `description` (já no schema.sql ideal) é finalmente
--        materializada na DB de produção — algumas instalações
--        antigas não a tinham.
--
-- IDEMPOTENTE: pode ser executada múltiplas vezes em segurança.
-- =====================================================

BEGIN;

-- -----------------------------------------------------
-- 1) products.is_featured
-- -----------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'is_featured'
  ) THEN
    ALTER TABLE products ADD COLUMN is_featured BOOLEAN NOT NULL DEFAULT false;
    RAISE NOTICE '✓ products.is_featured criado';
  ELSE
    RAISE NOTICE '✓ products.is_featured já existia (no-op)';
  END IF;
END $$;

-- Índice parcial: só faz sentido indexar os destaques (poucos)
CREATE INDEX IF NOT EXISTS idx_products_is_featured
  ON products (is_featured)
  WHERE is_featured = true;

-- -----------------------------------------------------
-- 2) categories.description
-- -----------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'categories' AND column_name = 'description'
  ) THEN
    ALTER TABLE categories ADD COLUMN description TEXT;
    RAISE NOTICE '✓ categories.description criado';
  ELSE
    RAISE NOTICE '✓ categories.description já existia (no-op)';
  END IF;
END $$;

-- -----------------------------------------------------
-- 3) categories.image_url
-- -----------------------------------------------------
-- Caminho público da imagem servida pelo backend
-- (ex.: /uploads/categories/category-3-1714.jpg) ou URL absoluta.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'categories' AND column_name = 'image_url'
  ) THEN
    ALTER TABLE categories ADD COLUMN image_url VARCHAR(500);
    RAISE NOTICE '✓ categories.image_url criado';
  ELSE
    RAISE NOTICE '✓ categories.image_url já existia (no-op)';
  END IF;
END $$;

-- -----------------------------------------------------
-- 4) categories.sort_order
-- -----------------------------------------------------
-- Mais baixo = aparece primeiro. Default 100 deixa espaço para
-- promover ou demover categorias sem renumerar tudo.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'categories' AND column_name = 'sort_order'
  ) THEN
    ALTER TABLE categories ADD COLUMN sort_order INT NOT NULL DEFAULT 100;
    RAISE NOTICE '✓ categories.sort_order criado';
  ELSE
    RAISE NOTICE '✓ categories.sort_order já existia (no-op)';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_categories_sort_order
  ON categories (sort_order, name);

COMMIT;

-- =====================================================
-- RELATÓRIO
-- =====================================================
SELECT
  COUNT(*) FILTER (WHERE is_featured = true) AS produtos_em_destaque,
  COUNT(*) AS produtos_total
FROM products
WHERE is_active = true;

SELECT id, name, image_url, sort_order
FROM categories
ORDER BY sort_order, name;
