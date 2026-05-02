-- Quando o cliente levanta na loja (marcação manual no backoffice).
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pickup_collected_at TIMESTAMPTZ NULL;
COMMENT ON COLUMN orders.pickup_collected_at IS 'Preenchido quando o staff confirma que o pedido (site, levantamento na loja) foi entregue ao cliente; status passa a entregue.';
