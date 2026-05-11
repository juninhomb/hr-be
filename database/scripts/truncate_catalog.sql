-- Remove todo o catálogo (produtos + variantes / stock).
-- Pedidos: order_items.variant_id passa a NULL (ON DELETE SET NULL); linhas de pedido mantêm o SKU gravado.
-- Categorias, clientes, pedidos e cupões não são alterados.

BEGIN;

DELETE FROM products;

COMMIT;

-- Verificação esperada: 0 linhas em products e product_variants
-- SELECT (SELECT COUNT(*) FROM products) AS products, (SELECT COUNT(*) FROM product_variants) AS variants;
