-- =====================================================
-- 2026-05-01: Performance indexes + idempotency key
-- =====================================================
-- 1) Índices para acelerar queries do dashboard / listagens admin que
--    filtram por payment_method, origin e (customer_id, status).
-- 2) Coluna idempotency_key em orders para impedir duplicação por retry
--    de rede no checkout (BE recebe mesmo Idempotency-Key → devolve o
--    pedido existente).
-- Idempotente: usa IF NOT EXISTS / DO blocks.

CREATE INDEX IF NOT EXISTS idx_orders_payment_method ON orders(payment_method);
CREATE INDEX IF NOT EXISTS idx_orders_origin ON orders(origin);
CREATE INDEX IF NOT EXISTS idx_orders_customer_status ON orders(customer_id, status);

-- Idempotency-Key por canal (manual vs stripe podem usar a mesma key sem colidir).
-- NULLs não contam para o UNIQUE — só pedidos com key explícita são protegidos.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'idempotency_key'
  ) THEN
    ALTER TABLE orders ADD COLUMN idempotency_key VARCHAR(80);
  END IF;
END$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_idempotency_key
  ON orders(idempotency_key)
  WHERE idempotency_key IS NOT NULL;
