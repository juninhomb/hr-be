-- Lembrete quando o cliente pode levantar na loja (site + sem entrega ao domicílio).
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pickup_ready_notified_at TIMESTAMPTZ NULL;
COMMENT ON COLUMN orders.pickup_ready_notified_at IS 'Definido quando o staff envia email "pedido disponível para levantamento"; evita envios repetidos desde o mesmo botão admin.';
