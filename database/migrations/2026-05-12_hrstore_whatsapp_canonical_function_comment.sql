-- Documentação: a função SQL mantém a normalização legada (PT 9→351, strip 00).
-- A loja e o backoffice usam libphonenumber-js em Node.js com `default_country`;
-- esta função continua útil para n8n / imports que só têm o caminho SQL.

COMMENT ON FUNCTION hrstore_whatsapp_canonical(TEXT) IS
  'Legacy SQL normalizer (PT 9→351, strip 00). Prefer app-layer libphonenumber-js + default_country; kept for n8n/SQL imports.';
