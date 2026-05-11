-- =============================================================================
-- N8N Bot 2.0 — SQL de referência (HR Store · evolution_db)
-- =============================================================================
-- Uso: colar cada bloco num nó "Execute a SQL query" (PostgreSQL) dentro de
--      sub-workflows chamados pela AI Agent (Tool → Execute Workflow).
--
-- SEGURANÇA: sempre filtrar pedidos também por whatsapp_number do remetente
-- da conversa (vem do Webhook Evolution), não confiar só no #id que o texto
-- do cliente menciona — evita leakage de estado de outros clientes.
--
-- Placeholders compatíveis com expressões n8n (ajusta nomes aos teus inputs):
--   {{ $json.whatsapp_digits }}  — só dígitos, ex.: 351913709730
--   {{ $json.whatsapp_number }}  — mesmo uso (Evolution / Agent às vezes usa este nome)
--   {{ $json.order_id }}         — opcional — ex.: 102 (campo inteiro OU vazio)
--
-- Vários pedidos para o mesmo WhatsApp:
--   • TOOL B (por order_id + whatsapp): uma linha só — não há ambiguidade (#110 vs #111).
--   • TOOL C / UNIFICADO sem id: devolve o mais recente (ORDER BY created_at DESC LIMIT 1);
--     se o cliente citou um # específico, usa TOOL B ou UNIFICADO com order_id preenchido.
--
-- Erro no Agent tipo "workflow did not return a response": o sub-workflow tem de terminar
-- com os dados ligados à saída do trigger (Execute Workflow Trigger → último nó → output),
-- senão a tool não recebe JSON mesmo com SQL correcto.
--
-- Não alterar back/front/site: estsultaas queries assumem colunas já existentes
-- (confirmado contra Docker: orders.is_delivery/shipping_fee/..., pv.is_active).
-- =============================================================================


-- ---------------------------------------------------------------------------
-- TOOL A — CLIENTE por WhatsApp (lookup inicial)
-- Sub-workflow: ex. Tool_ClientePorWhatsApp
-- Output: uma linha ou zero (agente diz se é retorno ou cliente novo).
-- ---------------------------------------------------------------------------
SELECT
  c.id AS customer_id,
  c.full_name,
  c.email,
  c.address,
  c.postal_code,
  c.city,
  c.district,
  c.country,
  c.phone,
  c.whatsapp_number,
  c.total_orders AS total_orders_customer,
  TO_CHAR(c.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS cliente_desde
FROM customers c
WHERE c.whatsapp_number = '{{ $json.whatsapp_digits || $json.whatsapp_number }}'
LIMIT 1;

-- Se 0 linhas ⇒ cliente ainda não existe na CRM (workflow pode acrescentar
-- `found: false` num nó "Edit Fields" / IF).


-- ---------------------------------------------------------------------------
-- TOOL B — STATUS do pedido (por ID + obrigatório: WhatsApp do remetente)
-- Sub-workflow: ex. Tool_StatusPedido_PorId — só disparar quando a IA já
-- extraiu número do pedido (ex.: texto "Novo pedido pelo site #102").
--
-- Dois pedidos no mesmo número não afectam esta query: o filtro o.id = X escolhe um só;
-- o JOIN com whatsapp garante que esse pedido pertence ao remetente (não vê dados de outros).
-- No WhatsApp usa o mesmo formato que a BD (só dígitos, ex. 351920526071).
-- ---------------------------------------------------------------------------
SELECT
  o.id AS order_id,
  o.status,
  o.origin,
  o.payment_method,
  o.total_amount,
  COALESCE(o.shipping_fee, 0) AS shipping_fee,
  COALESCE(o.is_delivery, FALSE) AS is_delivery,
  o.delivery_address,
  o.customer_notes,
  o.stripe_link_id,
  TO_CHAR(o.created_at AT TIME ZONE 'Europe/Lisbon', 'YYYY-MM-DD HH24:MI') AS criado_em_lisboa,
  c.full_name AS cliente_nome,
  c.whatsapp_number AS cliente_whatsapp,
  (
    SELECT STRING_AGG(
      oi.quantity::text || ' × ' || COALESCE(oi.sku, '') || ' — €' || ROUND(oi.unit_price::numeric, 2)::text,
      E'\n'
      ORDER BY oi.id
    )
    FROM order_items oi
    WHERE oi.order_id = o.id
  ) AS itens_resumo
FROM orders o
JOIN customers c ON c.id = o.customer_id
WHERE o.id = {{ $json.order_id }}::integer
  AND c.whatsapp_number = '{{ $json.whatsapp_number || $json.whatsapp_digits }}';


-- ---------------------------------------------------------------------------
-- TOOL C — ÚLTIMO pedido por WhatsApp (fallback quando cliente não citou #)
-- Sub-workflow: ex. Tool_UltimoPedidoCliente — mesmo formato de SELECT que TOOL B
-- ---------------------------------------------------------------------------
SELECT
  o.id AS order_id,
  o.status,
  o.origin,
  o.payment_method,
  o.total_amount,
  COALESCE(o.shipping_fee, 0) AS shipping_fee,
  COALESCE(o.is_delivery, FALSE) AS is_delivery,
  o.delivery_address,
  o.customer_notes,
  o.stripe_link_id,
  TO_CHAR(o.created_at AT TIME ZONE 'Europe/Lisbon', 'YYYY-MM-DD HH24:MI') AS criado_em_lisboa,
  c.full_name AS cliente_nome,
  c.whatsapp_number AS cliente_whatsapp,
  (
    SELECT STRING_AGG(
      oi.quantity::text || ' × ' || COALESCE(oi.sku, '') || ' — €' || ROUND(oi.unit_price::numeric, 2)::text,
      E'\n'
      ORDER BY oi.id
    )
    FROM order_items oi
    WHERE oi.order_id = o.id
  ) AS itens_resumo
FROM orders o
JOIN customers c ON c.id = o.customer_id
WHERE c.whatsapp_number = '{{ $json.whatsapp_number || $json.whatsapp_digits }}'
ORDER BY o.created_at DESC
LIMIT 1;


-- ---------------------------------------------------------------------------
-- TOOL B+C — UNIFICADO: pedido por ID (se existir) OU último pedido do WhatsApp
-- Mesmo SELECT que TOOL B/C. Use quando quiseres um único nó em vez de IF no n8n.
--
-- `order_id`: string vazia / ausente no JSON ⇒ ignora filtro por id (último pedido).
-- Com ID definido ⇒ filtra esse pedido MAS mantém validação por whatsapp (segurança).
--
-- Nota: usar o mesmo campo WhatsApp que nos outros tools (`whatsapp_digits` ou
-- `whatsapp_number`), conforme o workflow normaliza o Evolution.
-- ---------------------------------------------------------------------------
SELECT
  o.id AS order_id,
  o.status,
  o.origin,
  o.payment_method,
  o.total_amount,
  COALESCE(o.shipping_fee, 0) AS shipping_fee,
  COALESCE(o.is_delivery, FALSE) AS is_delivery,
  o.delivery_address,
  o.customer_notes,
  o.stripe_link_id,
  TO_CHAR(o.created_at AT TIME ZONE 'Europe/Lisbon', 'YYYY-MM-DD HH24:MI') AS criado_em_lisboa,
  c.full_name AS cliente_nome,
  c.whatsapp_number AS cliente_whatsapp,
  (
    SELECT STRING_AGG(
      oi.quantity::text || ' × ' || COALESCE(oi.sku, '') || ' — €' || ROUND(oi.unit_price::numeric, 2)::text,
      E'\n'
      ORDER BY oi.id
    )
    FROM order_items oi
    WHERE oi.order_id = o.id
  ) AS itens_resumo
FROM orders o
JOIN customers c ON c.id = o.customer_id
WHERE c.whatsapp_number = '{{ $json.whatsapp_number || $json.whatsapp_digits }}'
  AND (
    CASE
      WHEN trim(coalesce('{{ $json.order_id }}', '')) = '' THEN TRUE
      ELSE o.id = trim('{{ $json.order_id }}')::integer
    END
  )
ORDER BY o.created_at DESC
LIMIT 1;


-- ---------------------------------------------------------------------------
-- TOOL D — CONSULTA DE STOQUE (somente variantes ativas como na loja)
-- Ferramenta: Ferramenta_Consulta_Postgres — substituir SELECT antigo inteiro.
-- ---------------------------------------------------------------------------
SELECT
  p.name AS nome_produto,
  pv.sku,
  p.base_price AS preco,
  pv.color AS cor,
  pv.size AS tamanho,
  pv.stock_quantity AS stock,
  c.name AS categoria
FROM products p
JOIN product_variants pv ON p.id = pv.product_id AND COALESCE(pv.is_active, TRUE)
JOIN categories c ON c.id = p.category_id
WHERE pv.stock_quantity > 0
ORDER BY c.name ASC, p.name ASC, pv.sku ASC;


-- ---------------------------------------------------------------------------
-- TOOL E — REGISTAR PEDIDO pelo WhatsApp (transacção única recomendada)
-- Sub-workflow: Registrar_Pedido_IA
--
-- WhatsApp sem duplicados por formato: aplica migração
-- `migrations/2026-05-07_hrstore_whatsapp_canonical_function.sql` e usa sempre
-- `hrstore_whatsapp_canonical(...)` no INSERT. Unifica +351, espaços, 00,
-- e móvel PT a 9 dígitos (9xxxxxxxx → 3519xxxxxxxx). Erros de digitação no
-- meio do número (ex.: 562 vs 526) continuam a ser dois clientes distintos.
--
-- Correcções face à query antiga:
--   • payment_method = 'mb_way_ou_transferencia' (igual ao site; ver nota abaixo).
--   • orders.total_amount = valor_total_pecas + shipping_fee (alinhado ao site;
--     antes só ia o subtotal das peças mesmo com portes no cabeçalho).
--   • Reserva de stock ANTES de criar o pedido (evita corrida / oversell).
--   • Só vende variante com COALESCE(is_active, TRUE).
--   • UPSERT cliente com merge seguro (não sobrescreve com strings vazias).
--   • unit_price = subtotal mercadoria / quantidade (NÃO incluir portes na linha).
--   • order_items.unit_price é NOT NULL na BD — ROUND explícito.
--
-- Inputs esperados (JSON do Agent / Execute Workflow):
--   whatsapp_number   — só dígitos (ex.: 351913709730)
--   nome_cliente, email, morada, codigo_postal, cidade
--   sku_selecionado   — SKU exacto
--   quantidade        — inteiro ≥ 1
--   valor_total_pecas — numeric, total MERCADORIA desta linha (sem portes)
--   shipping_fee      — numeric, ex.: 5.00 se entrega; 0 se levantamento / sem portes
--   is_delivery       — literal true ou false (n8n preenche a partir do $json)
--
-- Exemplo entrega habitual: valor_total_pecas=23, shipping_fee=5, is_delivery=true
--           ⇒ total_amount no pedido = 28 e shipping_fee guardado = 5.
--
-- payment_method — idêntico ao checkout manual hrstore-site (POST /orders):
--       'mb_way_ou_transferencia'  ·  Stripe: 'stripe'
--
-- Pagamento via Payment Link (n8n → Stripe): ao criar o link, incluir metadata com a chave
-- `order_id` igual ao `id` do pedido (ex.: metadata[order_id]=152). Essa metadata é copiada
-- para o Checkout.Session; o webhook `checkout.session.completed` usa-a para marcar o pedido
-- como `pago` e `payment_method = 'stripe'`.
-- ---------------------------------------------------------------------------
BEGIN;

INSERT INTO customers (
  whatsapp_number, full_name, email, address, postal_code, city, country
)
VALUES (
  hrstore_whatsapp_canonical('{{ $json.whatsapp_digits || $json.whatsapp_number }}'),
  NULLIF(TRIM('{{ $json.nome_cliente }}'), ''),
  NULLIF(TRIM('{{ $json.email }}'), ''),
  NULLIF(TRIM('{{ $json.morada }}'), ''),
  NULLIF(TRIM('{{ $json.codigo_postal }}'), ''),
  NULLIF(TRIM('{{ $json.cidade }}'), ''),
  'PT'
)
ON CONFLICT (whatsapp_number) DO UPDATE
  SET full_name   = COALESCE(NULLIF(TRIM(EXCLUDED.full_name), ''),   customers.full_name),
      email       = COALESCE(NULLIF(TRIM(EXCLUDED.email), ''),       customers.email),
      address     = COALESCE(NULLIF(TRIM(EXCLUDED.address), ''),     customers.address),
      postal_code = COALESCE(NULLIF(TRIM(EXCLUDED.postal_code), ''), customers.postal_code),
      city        = COALESCE(NULLIF(TRIM(EXCLUDED.city), ''),        customers.city),
      country     = COALESCE(NULLIF(TRIM(EXCLUDED.country), ''),     customers.country);

WITH stock_reservado AS (
  UPDATE product_variants pv
     SET stock_quantity = stock_quantity - {{ $json.quantidade }}::integer
   WHERE pv.sku = '{{ $json.sku_selecionado }}'
     AND COALESCE(pv.is_active, TRUE)
     AND pv.stock_quantity >= {{ $json.quantidade }}::integer
   RETURNING pv.id AS variant_id
),
novo_pedido AS (
  INSERT INTO orders (
    customer_id, total_amount, payment_method, status, origin,
    is_delivery, shipping_fee
  )
  SELECT
    c.id,
    {{ $json.valor_total_pecas }}::numeric + COALESCE({{ $json.shipping_fee }}::numeric, 0),
    'mb_way_ou_transferencia',
    'aguardando_pagamento',
    'whatsapp',
    {{ $json.is_delivery }},
    COALESCE({{ $json.shipping_fee }}::numeric, 0)
  FROM customers c
  WHERE c.whatsapp_number = hrstore_whatsapp_canonical('{{ $json.whatsapp_digits || $json.whatsapp_number }}')
    AND EXISTS (SELECT 1 FROM stock_reservado)
  RETURNING id
)
INSERT INTO order_items (order_id, variant_id, sku, quantity, unit_price)
SELECT
  np.id,
  sr.variant_id,
  '{{ $json.sku_selecionado }}',
  {{ $json.quantidade }}::integer,
  ROUND(
    {{ $json.valor_total_pecas }}::numeric / NULLIF({{ $json.quantidade }}::integer, 0),
    2
  )
FROM novo_pedido np
CROSS JOIN stock_reservado sr
RETURNING order_id;

COMMIT;

-- Se INSERT INTO order_items devolver 0 linhas ⇒ stock esgotou a meio OU erro;
-- pedido não fica criado sem reserva prévia. Cliente já foi gravado/atualizado
-- pelo UPSERT (comportamento semelhante ao fluxo servidor após refactor).


-- -----------------------------------------------------------------------------
-- VARIANTE opcional — portes fixos 5 € e sempre entrega (se não queres expor
-- is_delivery/shipping_fee ao modelo; só preencheste valor_total_pecas antes)
-- -----------------------------------------------------------------------------
-- Substituir o CTE novo_pedido + totais assim:
--
-- ..., {{ $json.valor_total_pecas }}::numeric + 5,
--    'mb_way_ou_transferencia', 'aguardando_pagamento', 'whatsapp', true, 5
--
-- Mantém igual o unit_price apenas com valor_total_pecas / quantidade.

-- -----------------------------------------------------------------------------
-- VARIANTE CTE — mesmo fluxo com upsert_customer materializado (sub-workflows)
-- Requer função hrstore_whatsapp_canonical (migração 2026-05-07).
-- -----------------------------------------------------------------------------
-- WITH upsert_customer AS (
--   INSERT INTO customers (
--     whatsapp_number, full_name, email, address, postal_code, city, country
--   )
--   VALUES (
--     hrstore_whatsapp_canonical('{{ $json.whatsapp_digits || $json.whatsapp_number }}'),
--     NULLIF(TRIM('{{ $json.nome_cliente }}'), ''),
--     NULLIF(TRIM('{{ $json.email }}'), ''),
--     NULLIF(TRIM('{{ $json.morada }}'), ''),
--     NULLIF(TRIM('{{ $json.codigo_postal }}'), ''),
--     NULLIF(TRIM('{{ $json.cidade }}'), ''),
--     'PT'
--   )
--   ON CONFLICT (whatsapp_number) DO UPDATE
--     SET full_name   = COALESCE(NULLIF(TRIM(EXCLUDED.full_name), ''),   customers.full_name),
--         email       = COALESCE(NULLIF(TRIM(EXCLUDED.email), ''),       customers.email),
--         address     = COALESCE(NULLIF(TRIM(EXCLUDED.address), ''),     customers.address),
--         postal_code = COALESCE(NULLIF(TRIM(EXCLUDED.postal_code), ''), customers.postal_code),
--         city        = COALESCE(NULLIF(TRIM(EXCLUDED.city), ''),        customers.city),
--         country     = COALESCE(NULLIF(TRIM(EXCLUDED.country), ''),     customers.country)
--   RETURNING id
-- ),
-- stock_reservado AS ( ... ),
-- novo_pedido AS (
--   INSERT INTO orders (...)
--   SELECT c.id, ... FROM upsert_customer c
--   WHERE EXISTS (SELECT 1 FROM stock_reservado)
--   RETURNING id
-- ),
-- inserir_itens AS ( ... )
-- SELECT order_id FROM inserir_itens
-- UNION ALL
-- SELECT NULL::integer AS order_id WHERE NOT EXISTS (SELECT 1 FROM inserir_itens);

-- ============================================================================
