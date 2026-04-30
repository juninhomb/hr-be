-- =====================================================
-- HR STORE — Migration 2026-04-30
-- Recategorização de produtos
-- =====================================================
-- CONTEXTO:
--   O catálogo tinha vários produtos atribuídos à categoria
--   errada (ex.: biquinis em "Acessórios", conjuntos em
--   "Shorts", macacão em "Conjuntos", lenços em "Macacões").
--   Esta migration corrige todas estas atribuições e limpa
--   categorias órfãs (sem produtos, redundantes ou nunca
--   usadas: Banho, Jeans, Tricot).
--
-- IDEMPOTENTE:
--   Pode ser corrida múltiplas vezes em segurança.
-- =====================================================

BEGIN;

-- =====================================================
-- 1) GARANTIR QUE EXISTEM AS CATEGORIAS CANÓNICAS
-- =====================================================
-- Adiciona categorias que possam ainda faltar.
-- NOTA: a tabela `categories` em produção pode não ter UNIQUE
-- na coluna `name`, então usamos WHERE NOT EXISTS em vez de
-- ON CONFLICT para manter compatibilidade.
INSERT INTO categories (name)
SELECT v.name
FROM (VALUES
  ('Vestidos'),
  ('Conjuntos'),
  ('Calças'),
  ('Biquinis'),
  ('Bodies'),
  ('Shorts'),
  ('Macacões'),
  ('Blusas'),
  ('Acessórios')
) AS v(name)
WHERE NOT EXISTS (
  SELECT 1 FROM categories c WHERE c.name = v.name
);

-- =====================================================
-- 2) RECATEGORIZAR PRODUTOS POR PATTERN MATCHING DO NOME
-- =====================================================
-- Forçamos a categoria correta com base no prefixo do nome,
-- sobrescrevendo qualquer atribuição errada anterior.
--
-- IMPORTANTE: usamos `translate()` para normalizar acentos
-- (á→a, í→i, ç→c, ã→a, ê→e, ô→o, ...) porque ILIKE é
-- case-insensitive mas NÃO ignora acentos. Sem isto, nomes
-- como "Biquíni" não dão match com "BIQUIN%".
--
-- Ordem importa: do mais específico ao mais genérico para
-- evitar que "Conjunto Trico Siena" caia em "Tricot" ou
-- "Macacão" caia em "Conjuntos".

-- Helper: cria uma função local de normalização (sem acentos, lowercase).
-- Usamos uma CTE/subquery via translate() inline em vez de criar função
-- permanente para manter a migração auto-contida.
-- 
-- Padrão: lower(translate(name, 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
--                                'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'))

-- Vestidos (vestido ...)
UPDATE products SET category_id = (SELECT id FROM categories WHERE name = 'Vestidos')
 WHERE lower(translate(name,
       'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
       'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')) LIKE 'vestido%';

-- Conjuntos (conjunto ... — INCLUI "Conjunto Trico Siena")
UPDATE products SET category_id = (SELECT id FROM categories WHERE name = 'Conjuntos')
 WHERE lower(translate(name,
       'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
       'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')) LIKE 'conjunto%';

-- Macacões (macacao / macacão ...)
UPDATE products SET category_id = (SELECT id FROM categories WHERE name = 'Macacões')
 WHERE lower(translate(name,
       'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
       'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')) LIKE 'macac%';

-- Biquinis e maiôs (biquini..., biquíni..., maio, maiô)
UPDATE products SET category_id = (SELECT id FROM categories WHERE name = 'Biquinis')
 WHERE lower(translate(name,
       'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
       'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')) ~ '^(biquini|maio)';

-- Bodies (body ...)
UPDATE products SET category_id = (SELECT id FROM categories WHERE name = 'Bodies')
 WHERE lower(translate(name,
       'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
       'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')) LIKE 'body%';

-- Calças (calca / calça / bermuda ...)
UPDATE products SET category_id = (SELECT id FROM categories WHERE name = 'Calças')
 WHERE lower(translate(name,
       'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
       'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')) ~ '^(calca|bermuda)';

-- Shorts (short ...)
UPDATE products SET category_id = (SELECT id FROM categories WHERE name = 'Shorts')
 WHERE lower(translate(name,
       'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
       'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')) LIKE 'short%';

-- Blusas (blusa ...)
UPDATE products SET category_id = (SELECT id FROM categories WHERE name = 'Blusas')
 WHERE lower(translate(name,
       'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
       'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')) LIKE 'blusa%';

-- Acessórios (lenco / lenço ...)
UPDATE products SET category_id = (SELECT id FROM categories WHERE name = 'Acessórios')
 WHERE lower(translate(name,
       'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
       'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')) LIKE 'lenco%';

-- =====================================================
-- 3) REMOVER CATEGORIAS ÓRFÃS / REDUNDANTES
-- =====================================================
-- Apaga categorias que: (a) não têm produtos atribuídos
-- E (b) são redundantes ou nunca foram usadas no negócio.
-- Só apagamos se ficarem mesmo vazias após o passo 2.
DELETE FROM categories
 WHERE name IN ('Banho', 'Jeans', 'Tricot')
   AND id NOT IN (SELECT DISTINCT category_id FROM products WHERE category_id IS NOT NULL);

-- =====================================================
-- 4) RELATÓRIO PÓS-MIGRAÇÃO
-- =====================================================
DO $$
DECLARE
  total_products INT;
  uncategorized  INT;
  total_cats     INT;
  empty_cats     INT;
BEGIN
  SELECT COUNT(*) INTO total_products FROM products WHERE is_active = true;
  SELECT COUNT(*) INTO uncategorized  FROM products WHERE is_active = true AND category_id IS NULL;
  SELECT COUNT(*) INTO total_cats     FROM categories;
  SELECT COUNT(*) INTO empty_cats     FROM categories c
    WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.category_id = c.id AND p.is_active = true);

  RAISE NOTICE '════════════════════════════════════════════════';
  RAISE NOTICE 'Total de produtos ativos:       %', total_products;
  RAISE NOTICE 'Produtos sem categoria (revê!): %', uncategorized;
  RAISE NOTICE 'Categorias totais:              %', total_cats;
  RAISE NOTICE 'Categorias sem produtos:        %', empty_cats;
  RAISE NOTICE '════════════════════════════════════════════════';
END $$;

COMMIT;

-- =====================================================
-- 5) RESUMO FINAL POR CATEGORIA (executa fora da TX)
-- =====================================================
SELECT
  c.name                                AS categoria,
  COUNT(DISTINCT p.id)                  AS produtos,
  COUNT(v.id)                           AS variantes,
  COALESCE(SUM(v.stock_quantity), 0)    AS stock_total
FROM categories c
LEFT JOIN products p        ON p.category_id = c.id AND p.is_active = true
LEFT JOIN product_variants v ON v.product_id = p.id
GROUP BY c.id, c.name
ORDER BY produtos DESC, c.name;
