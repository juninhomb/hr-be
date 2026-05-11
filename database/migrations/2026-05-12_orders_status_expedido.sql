-- =====================================================
-- HR STORE — Estado intermédio orders.status = 'expedido'
-- (pago → expedido após «Expedir» impressão → enviado via CTT)
-- =====================================================

BEGIN;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'orders'
      AND t.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) LIKE '%aguardando_pagamento%'
      AND pg_get_constraintdef(c.oid) LIKE '%cancelado%'
  LOOP
    EXECUTE format('ALTER TABLE orders DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE orders
  ADD CONSTRAINT orders_status_check
  CHECK (status IN (
    'aguardando_pagamento',
    'pago',
    'expedido',
    'enviado',
    'entregue',
    'cancelado'
  ));

COMMIT;
