-- Cupão aplicado no checkout do site: código + valor descontado (sobre artigos, antes dos portes).
BEGIN;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_code VARCHAR(64);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN orders.coupon_code IS 'Código do cupão (env HRSTORE_DISCOUNT_COUPONS), checkout website';
COMMENT ON COLUMN orders.discount_amount IS 'Desconto em EUR sobre subtotal de artigos';

COMMIT;
