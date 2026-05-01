-- Notas opcionais do cliente no checkout (site público).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'orders'
      AND column_name = 'customer_notes'
  ) THEN
    ALTER TABLE orders ADD COLUMN customer_notes TEXT;
    RAISE NOTICE 'orders.customer_notes adicionada';
  ELSE
    RAISE NOTICE 'orders.customer_notes já existe — skip';
  END IF;
END $$;
