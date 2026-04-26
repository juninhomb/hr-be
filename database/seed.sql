-- =====================================================
-- HR STORE - SEED DE ESTOQUE INICIAL
-- =====================================================
-- 32 produtos | 77 variantes
-- Gerado em: 2026-04-26
-- =====================================================

BEGIN;

-- =====================================================
-- PRODUTOS (base)
-- =====================================================
INSERT INTO products (name, base_price, is_active) VALUES
  ('BODY MANGA LONGA',            8.00,  true),
  ('BLUSA TERMICA',               7.00,  true),
  ('SHORT POA',                  20.00,  true),
  ('CONJUNTO RENDA MAIA SHORT',  39.00,  true),
  ('VESTIDO ATENA',              35.00,  true),
  ('BERMUDA JEANS',              19.00,  true),
  ('BODY GOLA ALTA',              7.00,  true),
  ('VESTIDO ANA',                25.00,  true),
  ('CALCA ALFAIATARIA COM CINTO',19.00,  true),
  ('CALCA ALFAIATARIA',          21.00,  true),
  ('MACACAO JADE',               28.00,  true),
  ('CONJUNTO LIA',               25.00,  true),
  ('CONJUNTO CLEO 2.0',          27.00,  true),
  ('VESTIDO RENDA COSTAS',       49.00,  true),
  ('CONJUNTO LIZ',               38.00,  true),
  ('LENCO FLORESTA',              4.00,  true),
  ('LENCO ONCA',                  4.00,  true),
  ('CALCA ALFAIATARIA PREGAS',   17.00,  true),
  ('VESTIDO POA',                22.00,  true),
  ('VESTIDO MAVIE',              18.00,  true),
  ('CONJUNTO NANDA',             22.00,  true),
  ('BIQUINI OLHO GREGO',         30.00,  true),
  ('BIQUINI BUZIOS',             30.00,  true),
  ('MAIO',                       30.00,  true),
  ('CALCA ALFAIATARIA PARIS',    17.00,  true),
  ('CALCA JEANS',                22.00,  true),
  ('CONJUNTO AYLA',              23.00,  true),
  ('CONJUNTO TRICO SIENA',       24.00,  true),
  ('VESTIDO TALI',               37.00,  true),
  ('CONJUNTO IBIZA 2.0',         37.00,  true),
  ('BODY COM FIVELA',            13.00,  true),
  ('SHORT SEM COSTURA',           5.00,  true);

-- =====================================================
-- VARIANTES (77 linhas)
-- =====================================================
INSERT INTO product_variants (product_id, sku, color, size, stock_quantity) VALUES

  -- BODY MANGA LONGA
  ((SELECT id FROM products WHERE name='BODY MANGA LONGA'),            'BML-CINZA-SM',          'CINZA',       'S/M',  1),

  -- BLUSA TERMICA
  ((SELECT id FROM products WHERE name='BLUSA TERMICA'),               'BT-AZUL-M',             'AZUL',        'M',    1),
  ((SELECT id FROM products WHERE name='BLUSA TERMICA'),               'BT-PRETA-M',            'PRETA',       'M',    3),

  -- SHORT POA
  ((SELECT id FROM products WHERE name='SHORT POA'),                   'SPOA-M',                NULL,          'M',    1),

  -- CONJUNTO RENDA MAIA SHORT
  ((SELECT id FROM products WHERE name='CONJUNTO RENDA MAIA SHORT'),   'CRMS-ROSA-ML',          'ROSA',        'M/L',  1),

  -- VESTIDO ATENA
  ((SELECT id FROM products WHERE name='VESTIDO ATENA'),               'VATENA-PRETO-L',        'PRETO',       'L',    1),
  ((SELECT id FROM products WHERE name='VESTIDO ATENA'),               'VATENA-OFFWHITE-S',     'OFF WHITE',   'S',    1),
  ((SELECT id FROM products WHERE name='VESTIDO ATENA'),               'VATENA-CASTANHO-M',     'CASTANHO',    'M',    1),

  -- BERMUDA JEANS
  ((SELECT id FROM products WHERE name='BERMUDA JEANS'),               'BJEANS-JEANS-L40',      'JEANS',       'L 40', 1),

  -- BODY GOLA ALTA
  ((SELECT id FROM products WHERE name='BODY GOLA ALTA'),              'BGA-ROSA-U',            'ROSA',        'U',    1),

  -- VESTIDO ANA
  ((SELECT id FROM products WHERE name='VESTIDO ANA'),                 'VANA-CASTANHO-S',       'CASTANHO',    'S',    2),
  ((SELECT id FROM products WHERE name='VESTIDO ANA'),                 'VANA-CASTANHO-L',       'CASTANHO',    'L',    1),

  -- CALCA ALFAIATARIA COM CINTO
  ((SELECT id FROM products WHERE name='CALCA ALFAIATARIA COM CINTO'), 'CACC-OFFWHITE-U',       'OFF WHITE',   'U',    3),

  -- CALCA ALFAIATARIA
  ((SELECT id FROM products WHERE name='CALCA ALFAIATARIA'),           'CALF-CASTANHO-S',       'CASTANHO',    'S',    2),
  ((SELECT id FROM products WHERE name='CALCA ALFAIATARIA'),           'CALF-CASTANHO-M',       'CASTANHO',    'M',    1),

  -- MACACAO JADE
  ((SELECT id FROM products WHERE name='MACACAO JADE'),                'MJADE-OFFWHITE-LXL',    'OFF WHITE',   'L/XL', 1),
  ((SELECT id FROM products WHERE name='MACACAO JADE'),                'MJADE-AMARELO-LXL',     'AMARELO',     'L/XL', 1),
  ((SELECT id FROM products WHERE name='MACACAO JADE'),                'MJADE-CASTANHO-SM',     'CASTANHO',    'S/M',  1),

  -- CONJUNTO LIA
  ((SELECT id FROM products WHERE name='CONJUNTO LIA'),                'CLIA-AREIA-SM',         'AREIA',       'S/M',  3),
  ((SELECT id FROM products WHERE name='CONJUNTO LIA'),                'CLIA-AREIA-LXL',        'AREIA',       'L/XL', 2),

  -- CONJUNTO CLEO 2.0
  ((SELECT id FROM products WHERE name='CONJUNTO CLEO 2.0'),           'CCLEO-BRANCO-U',        'BRANCO',      'U',    1),

  -- VESTIDO RENDA COSTAS
  ((SELECT id FROM products WHERE name='VESTIDO RENDA COSTAS'),        'VRC-BRANCO-U',          'BRANCO',      'U',    1),

  -- CONJUNTO LIZ
  ((SELECT id FROM products WHERE name='CONJUNTO LIZ'),                'CLIZ-MARINHO-S',        'MARINHO',     'S',    0),
  ((SELECT id FROM products WHERE name='CONJUNTO LIZ'),                'CLIZ-TERRACOTA-S',      'TERRACOTA',   'S',    1),
  ((SELECT id FROM products WHERE name='CONJUNTO LIZ'),                'CLIZ-TERRACOTA-M',      'TERRACOTA',   'M',    1),

  -- LENCO FLORESTA
  ((SELECT id FROM products WHERE name='LENCO FLORESTA'),              'LF-PRETO',              'PRETO',       NULL,   3),
  ((SELECT id FROM products WHERE name='LENCO FLORESTA'),              'LF-AZUL',               'AZUL',        NULL,   1),
  ((SELECT id FROM products WHERE name='LENCO FLORESTA'),              'LF-BEGE',               'BEGE',        NULL,   1),
  ((SELECT id FROM products WHERE name='LENCO FLORESTA'),              'LF-CINZA',              'CINZA',       NULL,   1),
  ((SELECT id FROM products WHERE name='LENCO FLORESTA'),              'LF-ROSA',               'ROSA',        NULL,   1),

  -- LENCO ONCA
  ((SELECT id FROM products WHERE name='LENCO ONCA'),                  'LON-CINZA',             'CINZA',       NULL,   0),
  ((SELECT id FROM products WHERE name='LENCO ONCA'),                  'LON-BEGE',              'BEGE',        NULL,   1),

  -- CALCA ALFAIATARIA PREGAS
  ((SELECT id FROM products WHERE name='CALCA ALFAIATARIA PREGAS'),    'CALFP-BORDO-M',         'BORDO',       'M',    0),

  -- VESTIDO POA
  ((SELECT id FROM products WHERE name='VESTIDO POA'),                 'VPOA-PRETO-U',          'PRETO',       'U',    2),
  ((SELECT id FROM products WHERE name='VESTIDO POA'),                 'VPOA-BRANCO-U',         'BRANCO',      'U',    2),

  -- VESTIDO MAVIE
  ((SELECT id FROM products WHERE name='VESTIDO MAVIE'),               'VMAV-AREIA-U',          'AREIA',       'U',    1),
  ((SELECT id FROM products WHERE name='VESTIDO MAVIE'),               'VMAV-MARINHO-U',        'MARINHO',     'U',    1),

  -- CONJUNTO NANDA
  ((SELECT id FROM products WHERE name='CONJUNTO NANDA'),              'CNANDA-BORDO-U',        'BORDO',       'U',    2),

  -- BIQUINI OLHO GREGO
  ((SELECT id FROM products WHERE name='BIQUINI OLHO GREGO'),          'BOG-AMARELO-M',         'AMARELO',     'M',    1),
  ((SELECT id FROM products WHERE name='BIQUINI OLHO GREGO'),          'BOG-AMARELO-G',         'AMARELO',     'G',    1),

  -- BIQUINI BUZIOS
  ((SELECT id FROM products WHERE name='BIQUINI BUZIOS'),              'BBUZ-OFFWHITE-P',       'OFF WHITE',   'P',    1),
  ((SELECT id FROM products WHERE name='BIQUINI BUZIOS'),              'BBUZ-CASTANHO-P',       'CASTANHO',    'P',    1),
  ((SELECT id FROM products WHERE name='BIQUINI BUZIOS'),              'BBUZ-VERDE-P',          'VERDE',       'P',    1),

  -- MAIO
  ((SELECT id FROM products WHERE name='MAIO'),                        'MAIO-CEREJA-M',         'CEREJA',      'M',    2),
  ((SELECT id FROM products WHERE name='MAIO'),                        'MAIO-PRETO-M',          'PRETO',       'M',    1),
  ((SELECT id FROM products WHERE name='MAIO'),                        'MAIO-PRETO-G',          'PRETO',       'G',    1),

  -- CALCA ALFAIATARIA PARIS
  ((SELECT id FROM products WHERE name='CALCA ALFAIATARIA PARIS'),     'CPARIS-CASTANHO-S',     'CASTANHO',    'S',    1),

  -- CALCA JEANS
  ((SELECT id FROM products WHERE name='CALCA JEANS'),                 'CJN-38',                NULL,          '38',   2),
  ((SELECT id FROM products WHERE name='CALCA JEANS'),                 'CJN-40',                NULL,          '40',   0),
  ((SELECT id FROM products WHERE name='CALCA JEANS'),                 'CJN-42',                NULL,          '42',   1),
  ((SELECT id FROM products WHERE name='CALCA JEANS'),                 'CJN-44',                NULL,          '44',   1),
  ((SELECT id FROM products WHERE name='CALCA JEANS'),                 'CJN-46',                NULL,          '46',   1),

  -- CONJUNTO AYLA
  ((SELECT id FROM products WHERE name='CONJUNTO AYLA'),               'CAYLA-BRANCO-U',        'BRANCO',      'U',    2),
  ((SELECT id FROM products WHERE name='CONJUNTO AYLA'),               'CAYLA-ROSA-U',          'ROSA',        'U',    2),
  ((SELECT id FROM products WHERE name='CONJUNTO AYLA'),               'CAYLA-AMARELO-U',       'AMARELO',     'U',    2),
  ((SELECT id FROM products WHERE name='CONJUNTO AYLA'),               'CAYLA-CAFE-U',          'CAFE',        'U',    2),

  -- CONJUNTO TRICO SIENA
  ((SELECT id FROM products WHERE name='CONJUNTO TRICO SIENA'),        'CTS-AZUL-U',            'AZUL',        'U',    2),
  ((SELECT id FROM products WHERE name='CONJUNTO TRICO SIENA'),        'CTS-PRETO-U',           'PRETO',       'U',    1),
  ((SELECT id FROM products WHERE name='CONJUNTO TRICO SIENA'),        'CTS-BORDO-U',           'BORDO',       'U',    1),

  -- VESTIDO TALI
  ((SELECT id FROM products WHERE name='VESTIDO TALI'),                'VTALI-CAFE-U',          'CAFE',        'U',    0),
  ((SELECT id FROM products WHERE name='VESTIDO TALI'),                'VTALI-ROSA-U',          'ROSA',        'U',    1),
  ((SELECT id FROM products WHERE name='VESTIDO TALI'),                'VTALI-AMARELO-U',       'AMARELO',     'U',    2),

  -- CONJUNTO IBIZA 2.0
  ((SELECT id FROM products WHERE name='CONJUNTO IBIZA 2.0'),          'CIBIZA-ROSA-U',         'ROSA',        'U',    2),
  ((SELECT id FROM products WHERE name='CONJUNTO IBIZA 2.0'),          'CIBIZA-AZUL-U',         'AZUL',        'U',    2),
  ((SELECT id FROM products WHERE name='CONJUNTO IBIZA 2.0'),          'CIBIZA-AREIA-U',        'AREIA',       'U',    2),
  ((SELECT id FROM products WHERE name='CONJUNTO IBIZA 2.0'),          'CIBIZA-CASTANHO-U',     'CASTANHO',    'U',    0),
  ((SELECT id FROM products WHERE name='CONJUNTO IBIZA 2.0'),          'CIBIZA-PRETO-U',        'PRETO',       'U',    2),
  ((SELECT id FROM products WHERE name='CONJUNTO IBIZA 2.0'),          'CIBIZA-AZULMARINHO-U',  'AZUL MARINHO','U',    0),

  -- BODY COM FIVELA
  ((SELECT id FROM products WHERE name='BODY COM FIVELA'),             'BCF-BEGE-U',            'BEGE',        'U',    0),
  ((SELECT id FROM products WHERE name='BODY COM FIVELA'),             'BCF-CAFE-U',            'CAFE',        'U',    1),
  ((SELECT id FROM products WHERE name='BODY COM FIVELA'),             'BCF-PRETO-U',           'PRETO',       'U',    1),

  -- SHORT SEM COSTURA
  ((SELECT id FROM products WHERE name='SHORT SEM COSTURA'),           'SSC-MARFIM-SM',         'MARFIM',      'S/M',  2),
  ((SELECT id FROM products WHERE name='SHORT SEM COSTURA'),           'SSC-MARFIM-LXL',        'MARFIM',      'L/XL', 2),
  ((SELECT id FROM products WHERE name='SHORT SEM COSTURA'),           'SSC-BEGE-SM',           'BEGE',        'S/M',  2),
  ((SELECT id FROM products WHERE name='SHORT SEM COSTURA'),           'SSC-BEGE-LXL',          'BEGE',        'L/XL', 2),
  ((SELECT id FROM products WHERE name='SHORT SEM COSTURA'),           'SSC-PRETO-SM',          'PRETO',       'S/M',  2),
  ((SELECT id FROM products WHERE name='SHORT SEM COSTURA'),           'SSC-PRETO-LXL',         'PRETO',       'L/XL', 2)

ON CONFLICT (sku) DO UPDATE SET stock_quantity = EXCLUDED.stock_quantity;

COMMIT;
