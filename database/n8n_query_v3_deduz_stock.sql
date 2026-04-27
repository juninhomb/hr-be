-- =============================================================================
-- N8N QUERY v3 — Cria pedido pendente E reserva stock atomicamente
-- =============================================================================
-- Substitui a versão anterior. Agora deduz stock à criação (Opção B).
-- Cancelar/excluir o pedido devolve o stock automaticamente via backend.
--
-- Variáveis esperadas (do agente IA):
--   {{ whatsapp_number }}   ex: '351912345678'
--   {{ nome_cliente }}      ex: 'Maria Silva'
--   {{ email }}             ex: 'maria@exemplo.pt'
--   {{ morada }}            ex: 'Rua X, 123, 4000-000 Porto'
--   {{ sku_selecionado }}   ex: 'BD-FIV-BEGE-U'
--   {{ quantidade }}        ex: 1
--   {{ valor_total }}       ex: 29.90
-- =============================================================================

BEGIN;

-- 1) Upsert de cliente (preserva campos preenchidos previamente)
INSERT INTO customers (whatsapp_number, full_name, email, address)
VALUES (
  '{{ whatsapp_number }}',
  '{{ nome_cliente }}',
  '{{ email }}',
  '{{ morada }}'
)
ON CONFLICT (whatsapp_number) DO UPDATE
  SET full_name = COALESCE(NULLIF(EXCLUDED.full_name, ''), customers.full_name),
      email     = COALESCE(NULLIF(EXCLUDED.email, ''),     customers.email),
      address   = COALESCE(NULLIF(EXCLUDED.address, ''),   customers.address);

-- 2) Reservar stock ATOMICAMENTE — falha aqui se não houver disponível
WITH stock_reservado AS (
  UPDATE product_variants
     SET stock_quantity = stock_quantity - {{ quantidade }}
   WHERE sku = '{{ sku_selecionado }}'
     AND stock_quantity >= {{ quantidade }}
   RETURNING id AS variant_id
),
novo_pedido AS (
  INSERT INTO orders (customer_id, total_amount, payment_method, status, origin)
  SELECT
    (SELECT id FROM customers WHERE whatsapp_number = '{{ whatsapp_number }}'),
    {{ valor_total }},
    'MBWAY/DINHEIRO',
    'aguardando_pagamento',
    'whatsapp'
  WHERE EXISTS (SELECT 1 FROM stock_reservado)  -- só cria pedido se reserva ok
  RETURNING id
)
INSERT INTO order_items (order_id, variant_id, sku, quantity, unit_price)
SELECT
  np.id,
  sr.variant_id,
  '{{ sku_selecionado }}',
  {{ quantidade }},
  {{ valor_total }} / {{ quantidade }}
FROM novo_pedido np
CROSS JOIN stock_reservado sr
RETURNING order_id;

COMMIT;

-- ⚠ Se a query devolver 0 linhas → stock insuficiente.
--   O agente IA deve responder ao cliente: "Esse produto acabou de esgotar."
