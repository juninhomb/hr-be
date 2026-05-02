-- ============================================================================
-- WhatsApp canónico + fusão de clientes duplicados (mesmo contacto, chaves
-- diferentes: 920526071 vs 351920526071, 00351… vs 351…, etc.)
--
-- Comportamento esperado no site (já implementado em publicService):
-- - Um único registo em `customers` por whatsapp_number (upsert ON CONFLICT).
-- - Cada encomenda com morada nova grava uma linha em `customer_addresses`
--   (dedupe por address_key), todas com o mesmo customer_id — NÃO cria cliente
--   novo só por ter endereço diferente.
-- Esta migração só corrige dados legados: funde linhas duplicadas em `customers`
-- e move todas as moradas para o id mantido (MIN(id)).
--
-- 1) Normaliza customers.whatsapp_number
-- 2) Reaponta moradas e pedidos para o registo mais antigo (MIN(id))
-- 3) Remove duplicados
-- 4) Garante UNIQUE em whatsapp_number (bases legadas sem constraint)
-- Idempotente quando já não há duplicados.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION _hrstore_normalize_whatsapp(raw TEXT) RETURNS TEXT AS $$
DECLARE d TEXT;
BEGIN
  IF raw IS NULL THEN RETURN NULL; END IF;
  d := regexp_replace(COALESCE(raw, ''), '\D', '', 'g');
  IF d = '' OR d IS NULL THEN RETURN NULL; END IF;
  WHILE d ~ '^00' AND length(d) > 10 LOOP
    d := substring(d FROM 3);
  END LOOP;
  IF length(d) = 9 AND d ~ '^9[0-9]{8}$' THEN
    d := '351' || d;
  END IF;
  IF length(d) < 10 OR length(d) > 15 THEN RETURN NULL; END IF;
  RETURN d;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

UPDATE customers c
   SET whatsapp_number = _hrstore_normalize_whatsapp(c.whatsapp_number)
 WHERE c.whatsapp_number IS NOT NULL
   AND _hrstore_normalize_whatsapp(c.whatsapp_number) IS NOT NULL
   AND c.whatsapp_number IS DISTINCT FROM _hrstore_normalize_whatsapp(c.whatsapp_number);

CREATE TEMP TABLE _wa_dupes AS
WITH norm AS (
  SELECT id, whatsapp_number AS wa
    FROM customers
   WHERE whatsapp_number IS NOT NULL
),
keepers AS (
  SELECT wa, MIN(id) AS keeper_id
    FROM norm
   WHERE wa IS NOT NULL
   GROUP BY wa
)
SELECT n.id AS loser_id, k.keeper_id
  FROM norm n
  JOIN keepers k ON k.wa = n.wa
 WHERE n.id <> k.keeper_id;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'customer_addresses'
  ) THEN
    DELETE FROM customer_addresses a
     USING _wa_dupes d, customer_addresses b
     WHERE a.customer_id = d.loser_id
       AND b.customer_id = d.keeper_id
       AND b.address_key = a.address_key;

    UPDATE customer_addresses ca
       SET customer_id = d.keeper_id
      FROM _wa_dupes d
     WHERE ca.customer_id = d.loser_id;
  END IF;
END $$;

UPDATE orders o
   SET customer_id = d.keeper_id
  FROM _wa_dupes d
 WHERE o.customer_id = d.loser_id;

DELETE FROM customers c
 USING _wa_dupes d
 WHERE c.id = d.loser_id;

DROP TABLE IF EXISTS _wa_dupes;

DROP FUNCTION IF EXISTS _hrstore_normalize_whatsapp(TEXT);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
     WHERE t.relname = 'customers'
       AND c.contype = 'u'
       AND pg_get_constraintdef(c.oid) ILIKE '%whatsapp_number%'
  ) THEN
    ALTER TABLE customers ADD CONSTRAINT customers_whatsapp_number_key UNIQUE (whatsapp_number);
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMIT;
