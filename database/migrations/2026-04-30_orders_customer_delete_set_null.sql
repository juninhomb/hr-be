-- =====================================================
-- Pedidos mantêm histórico ao apagar ficha de cliente
-- (admin: cliente some da lista CRM; customer_id em orders → NULL).
-- A DB antiga tinha FK sem ON DELETE, o que bloqueava DELETE.
-- =====================================================

BEGIN;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_customer_id_fkey;

ALTER TABLE orders
  ADD CONSTRAINT orders_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;

COMMIT;
