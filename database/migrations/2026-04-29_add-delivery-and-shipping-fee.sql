-- =====================================================
-- HR STORE — Migration 2026-04-29
-- Adiciona suporte a entrega e taxa de envio
-- Idempotente: pode ser corrida múltiplas vezes em segurança
-- =====================================================
-- DESCR: Adiciona colunas is_delivery e shipping_fee à tabela orders
--        para rastreamento de pedidos com entrega e taxa associada.
-- =====================================================

BEGIN;

-- 1) Adicionar coluna is_delivery (boolean, default false)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'is_delivery'
  ) THEN
    ALTER TABLE orders ADD COLUMN is_delivery BOOLEAN DEFAULT false;
    RAISE NOTICE 'orders.is_delivery adicionada com sucesso';
  ELSE
    RAISE NOTICE 'orders.is_delivery já existe — skip';
  END IF;
END $$;

-- 2) Adicionar coluna shipping_fee (numeric, default 0)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'shipping_fee'
  ) THEN
    ALTER TABLE orders ADD COLUMN shipping_fee NUMERIC(12, 2) DEFAULT 0;
    RAISE NOTICE 'orders.shipping_fee adicionada com sucesso';
  ELSE
    RAISE NOTICE 'orders.shipping_fee já existe — skip';
  END IF;
END $$;

-- 3) Sanity check — mostra estado das tabelas críticas
SELECT
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_name='orders' AND column_name='is_delivery') AS orders_is_delivery_ok,
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_name='orders' AND column_name='shipping_fee') AS orders_shipping_fee_ok;

COMMIT;
