-- ============================================================================
-- IMPORTANTE: correr na MESMA instância PostgreSQL que o backend (DATABASE_URL).
-- Ex.: `docker exec -i db_evolution psql -U evolution -d evolution_db < este_ficheiro`
--      (ajustar user/DB ao teu .env).
-- ============================================================================
-- Importação manual: Registo de Leads (formulário) — 22 linhas (+ Magda em comentário, a confirmar)
-- Nome + e-mail + WhatsApp (351 + 9 dígitos nacionais)
-- E-mails truncados no ecrã foram completados para .com / hotmail.com
-- Idempotente: ON CONFLICT (whatsapp_number) actualiza nome/e-mail se já existir
-- ============================================================================
-- Antes de correr em produção: rever e-mails com @gm ambíguo (todos como gmail.com)
-- ============================================================================

BEGIN;

INSERT INTO customers (full_name, whatsapp_number, email, address)
VALUES
  ('Vanessa Vinuto', '351911760176', 'vanevimes@gmail.com', NULL),
  ('Priscila Guimaraes', '351910779757', 'pricila.araujop@gmail.com', NULL),
  ('Monica Marassatto', '351912070391', 'mmarassatto@gmail.com', NULL),
  ('Karla Fernandes', '351916652142', 'empreendedorakah@gmail.com', NULL),
  ('Laíde Torres', '351920331496', 'laidetorres@gmail.com', NULL),
  ('Débora Frias', '351969648487', 'tacielly@hotmail.com', NULL),
  ('Mariana Queiroz', '351913043767', 'mmqueiroz.2021@gmail.com', NULL),
  ('Carla Pereira', '351913208045', 'ccpereira2010@gmail.com', NULL),
  ('Adriana Pereira Campos', '351934485002', 'adrianapclima1987@gmail.com', NULL),
  ('Yara Castro', '351910165100', 'eng.yaracastro@gmail.com', NULL),
  ('Josimeire Soares', '351913798337', 'meirenicoeric@gmail.com', NULL),
  ('Jessica Magalhães', '351913610767', 'jessi.rueda@gmail.com', NULL),
  ('Tais Ferreira', '351932167866', 'taisryka0829@gmail.com', NULL),
  ('Gabriella Kolling', '351938236976', 'gk.kolling@gmail.com', NULL),
  ('Nati', '351911515805', 'nmendes@gmail.com', NULL),
  ('Alessandra Lima', '351910606883', 'alelimacontabilista@gmail.com', NULL),
  ('Natalia Beserra', '351932287549', 'beserra.natalia@gmail.com', NULL),
  ('Mayara Henriques', '351935746565', 'maayaramooura@gmail.com', NULL),
  ('Bianca Matos', '351911874309', 'biiancabraga@gmail.com', NULL),
  ('Liliana Oliveira', '351928031788', 'lilianappoliveira1994@gmail.com', NULL),
  ('Tatiana Almeida', '351939726953', 'tati_almeida04@hotmail.com', NULL),
  ('Geovanna Artioli', '351915636387', 'giiartioli@gmail.com', NULL)
ON CONFLICT (whatsapp_number) DO UPDATE SET
  full_name = COALESCE(NULLIF(TRIM(EXCLUDED.full_name), ''), customers.full_name),
  email     = COALESCE(NULLIF(TRIM(EXCLUDED.email),     ''), customers.email);

-- Magda Mendonça — confirmar e-mail (screenshot truncado) antes de importar:
-- INSERT INTO customers (full_name, whatsapp_number, email, address)
-- VALUES ('Magda Mendonça', '351910425252', 'omendonca.magda@gmail.com', NULL)
-- ON CONFLICT (whatsapp_number) DO UPDATE SET
--   full_name = COALESCE(NULLIF(TRIM(EXCLUDED.full_name), ''), customers.full_name),
--   email     = COALESCE(NULLIF(TRIM(EXCLUDED.email),     ''), customers.email);

COMMIT;
