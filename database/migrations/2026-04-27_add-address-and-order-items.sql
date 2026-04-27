-- =====================================================
-- HR STORE — Migration 2026-04-27
-- Sales flow refactor (PDV + WhatsApp pending orders)
-- Idempotente: pode ser corrida múltiplas vezes em segurança
-- =====================================================
-- DESCR: Adiciona suporte a endereços de entrega e rastreamento
--        detalhado de itens em pedidos.
-- =====================================================

BEGIN;

-- 1) Garantir coluna `address` em customers (CTT)
-- Permite armazenar endereço de entrega padrão do cliente
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'customers' AND column_name = 'address'
  ) THEN
    ALTER TABLE customers ADD COLUMN address TEXT;
    RAISE NOTICE 'customers.address adicionada com sucesso';
  ELSE
    RAISE NOTICE 'customers.address já existe — skip';
  END IF;
END $$;

-- 2) Garantir tabela order_items (caso DB seja anterior à versão que a introduziu)
-- Armazena os itens individuais de cada pedido com detalhes (SKU, quantidade, preço unitário)
CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL,
  variant_id INTEGER,
  sku VARCHAR(100) NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(12, 2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE SET NULL
);

-- Índices para performance em queries comuns
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_sku       ON order_items(sku);

-- 3) Sanity check — mostra estado das tabelas críticas
SELECT
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_name='customers' AND column_name='address') AS customers_address_ok,
  (SELECT COUNT(*) FROM information_schema.tables
    WHERE table_name='order_items') AS order_items_ok;

COMMIT;
