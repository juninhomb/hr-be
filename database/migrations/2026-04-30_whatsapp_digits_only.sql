-- =====================================================
-- WhatsApp / telemóvel: armazenar só dígitos (10–15), sem '+'
-- Funde clientes duplicados (+351… vs 351…) e reforça CHECK.
-- Idempotente em bases já normalizadas.
-- =====================================================

BEGIN;

CREATE TEMP TABLE _wa_losers AS
WITH norm AS (
  SELECT id, regexp_replace(COALESCE(whatsapp_number, ''), '\D', '', 'g') AS wa
    FROM customers
),
keepers AS (
  SELECT wa, MIN(id) AS keeper_id
    FROM norm
   WHERE LENGTH(wa) BETWEEN 10 AND 15
   GROUP BY wa
)
SELECT n.id AS loser_id, k.keeper_id
  FROM norm n
  JOIN keepers k ON k.wa = n.wa
 WHERE n.id <> k.keeper_id;

UPDATE orders o
   SET customer_id = l.keeper_id
  FROM _wa_losers l
 WHERE o.customer_id = l.loser_id;

DELETE FROM customers c
 USING _wa_losers l
 WHERE c.id = l.loser_id;

DROP TABLE _wa_losers;

UPDATE customers
   SET whatsapp_number = regexp_replace(COALESCE(whatsapp_number, ''), '\D', '', 'g')
 WHERE whatsapp_number ~ '[^0-9]';

ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_whatsapp_number_check;
ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_whatsapp_number_digits_check;

ALTER TABLE customers
  ADD CONSTRAINT customers_whatsapp_number_digits_check
  CHECK (whatsapp_number ~ '^[0-9]{10,15}$');

COMMIT;
