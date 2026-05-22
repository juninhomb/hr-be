-- Trocas (devoluções com substituição): novo pedido com origin='troca' ligado
-- ao pedido original via parent_order_id. `returned_items` é o snapshot JSONB
-- dos artigos devolvidos no formato:
--   [{ "sku": "BLU-AZL-M", "quantity": 1, "unit_price": 30.00, "source_order_item_id": 12 }]
-- O total_amount do pedido-troca representa apenas a DIFERENÇA que o cliente
-- pagou (max(0, novos − devolvidos)). Stock dos devolvidos é restaurado e dos
-- novos deduzido atomicamente na transação que cria a troca.

BEGIN;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS parent_order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS returned_items JSONB;

CREATE INDEX IF NOT EXISTS idx_orders_parent_order
  ON orders (parent_order_id)
  WHERE parent_order_id IS NOT NULL;

COMMENT ON COLUMN orders.parent_order_id IS 'Pedido original quando esta linha é uma troca (origin=troca).';
COMMENT ON COLUMN orders.returned_items   IS 'Snapshot JSONB dos artigos devolvidos numa troca.';

COMMIT;
