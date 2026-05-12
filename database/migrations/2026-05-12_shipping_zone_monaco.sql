-- Zona de envio para Mónaco (ISO MC), alinhada com a tarifa UE quando existir.
-- Idempotente: não duplica se já houver linha MC.

BEGIN;

DO $$
DECLARE
  fee NUMERIC(10, 2);
BEGIN
  IF EXISTS (SELECT 1 FROM shipping_zones WHERE UPPER(country_code) = 'MC' LIMIT 1) THEN
    RETURN;
  END IF;

  SELECT z.fee_eur INTO fee
    FROM shipping_zones z
   WHERE UPPER(z.country_code) = 'EU' AND z.is_active = true
   ORDER BY z.sort_order ASC, z.id ASC
   LIMIT 1;

  IF fee IS NULL THEN
    SELECT z.fee_eur INTO fee
      FROM shipping_zones z
     WHERE UPPER(z.country_code) = 'ES' AND z.is_active = true
     ORDER BY z.sort_order ASC, z.id ASC
     LIMIT 1;
  END IF;

  IF fee IS NULL THEN
    fee := 20.00;
  END IF;

  INSERT INTO shipping_zones
    (country_code, region, label, fee_eur, free_above_eur,
     postal_code_prefix, sort_order, is_active, requires_whatsapp_checkout)
  VALUES
    ('MC', NULL, 'Mónaco', fee, NULL, '', 45, true, false);
END $$;

COMMIT;
