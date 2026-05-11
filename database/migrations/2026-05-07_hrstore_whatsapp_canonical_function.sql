-- ============================================================================
-- Função permanente: WhatsApp canónico para UPSERT / n8n / imports.
--
-- Replica a lógica de _hrstore_normalize_whatsapp da migração 2026-05-02, mas
-- **não** é removida ao fim — para usar em INSERT com ON CONFLICT (whatsapp_number).
--
-- - Só dígitos
-- - Remove prefixos 00 internacionais enquanto length > 10
-- - Móvel PT 9 dígitos (começados por 9) ⇒ prefixo 351
-- - Exige 10–15 dígitos (CHECK alinhado com customers)
--
-- Nota: dois números que diferem por typo (ex.: ...562... vs ...526...) continuam
--       chaves diferentes — não há fusão automática.
-- ============================================================================

CREATE OR REPLACE FUNCTION hrstore_whatsapp_canonical(raw TEXT) RETURNS TEXT AS $$
DECLARE
  d TEXT;
BEGIN
  IF raw IS NULL THEN
    RETURN NULL;
  END IF;
  d := regexp_replace(COALESCE(raw, ''), '\D', '', 'g');
  IF d = '' OR d IS NULL THEN
    RETURN NULL;
  END IF;
  WHILE d ~ '^00' AND length(d) > 10 LOOP
    d := substring(d FROM 3);
  END LOOP;
  IF length(d) = 9 AND d ~ '^9[0-9]{8}$' THEN
    d := '351' || d;
  END IF;
  IF length(d) < 10 OR length(d) > 15 THEN
    RETURN NULL;
  END IF;
  RETURN d;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION hrstore_whatsapp_canonical(TEXT) IS
  'Normaliza WhatsApp para UNIQUE customers.whatsapp_number (n8n / upsert).';
