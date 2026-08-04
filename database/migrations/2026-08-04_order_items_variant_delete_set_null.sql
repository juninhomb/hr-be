-- =====================================================
-- Permite apagar variantes/produtos mesmo com pedidos antigos
-- (admin: DELETE de produto ficava bloqueado; order_items.variant_id → NULL).
-- A DB tinha FK sem ON DELETE (NO ACTION), o que bloqueava o DELETE em
-- product_variants com erro 23503 "order_items_variant_id_fkey".
-- O histórico do pedido (nome, sku, preço) já fica guardado em snapshot
-- nas próprias colunas de order_items, por isso perder o link para a
-- variante apagada não perde informação do pedido.
-- =====================================================

BEGIN;

ALTER TABLE order_items DROP CONSTRAINT IF EXISTS order_items_variant_id_fkey;

ALTER TABLE order_items
  ADD CONSTRAINT order_items_variant_id_fkey
  FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE SET NULL;

COMMIT;
