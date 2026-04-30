-- =====================================================
-- HR STORE — Migration 2026-04-30
-- UNIQUE constraint em categories.name
-- =====================================================
-- POR QUÊ:
--   Originalmente o `schema.sql` declara `name VARCHAR(100) NOT NULL UNIQUE`
--   mas a DB de produção foi criada antes desta restrição existir, ficando
--   sem o índice único. Sem ele, é impossível usar `ON CONFLICT (name)` em
--   migrations futuras — daí esta correção.
--
-- IDEMPOTENTE:
--   - Verifica se já existe um índice unique em categories.name antes de
--     criar. Pode ser corrida múltiplas vezes em segurança.
-- =====================================================

BEGIN;

-- Sanity check: NÃO podemos adicionar UNIQUE se houver duplicados.
-- Aborta a migration com erro claro caso o estado da DB seja inválido.
DO $$
DECLARE
  dup_count INT;
BEGIN
  SELECT COUNT(*) INTO dup_count FROM (
    SELECT name FROM categories GROUP BY name HAVING COUNT(*) > 1
  ) AS d;
  IF dup_count > 0 THEN
    RAISE EXCEPTION
      'Não é possível adicionar UNIQUE em categories.name: existem % nomes duplicados. Corrige antes de re-executar.', dup_count;
  END IF;
END $$;

-- Adiciona o constraint apenas se ainda não existir.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
     WHERE t.relname = 'categories'
       AND c.contype = 'u'
       AND c.conname = 'categories_name_key'
  ) THEN
    ALTER TABLE categories
      ADD CONSTRAINT categories_name_key UNIQUE (name);
    RAISE NOTICE '✓ UNIQUE constraint adicionado a categories.name';
  ELSE
    RAISE NOTICE '✓ UNIQUE constraint já existia em categories.name (no-op)';
  END IF;
END $$;

COMMIT;
