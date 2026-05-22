-- HR Store — sincronizar estoque com planilha 2026-05-22
-- docker exec -i db_evolution psql -U evolution -d evolution_db -v ON_ERROR_STOP=1 < import_estoque_planilha_2026-05-22.sql

BEGIN;

-- 1) Produtos: atualizar preço/ativo ou criar
CREATE TEMP TABLE _planilha_produtos (name text, base_price numeric) ON COMMIT DROP;
INSERT INTO _planilha_produtos (name, base_price) VALUES
  ('Biquíni Bicolor', 30.00),
  ('Biquíni Buzios', 30.00),
  ('Biquíni Olho Grego', 30.00),
  ('Blazer Gola Alta', 23.00),
  ('Blusa Básica Renda', 12.00),
  ('Blusa Gola Alta POA', 17.00),
  ('Blusa Polo Tricot', 13.00),
  ('Blusa Térmica', 7.00),
  ('Body com Fivela', 13.00),
  ('Calça Alfaiataria', 21.00),
  ('Calça Jeans', 22.00),
  ('Calça Jeans Flor', 29.00),
  ('Calça Listra', 22.00),
  ('Calça Onça', 29.00),
  ('Calça Sarja', 23.00),
  ('Camisa Listrada', 24.00),
  ('Colete', 14.00),
  ('Conjunto Ayla', 23.00),
  ('Conjunto Cleo', 27.00),
  ('Conjunto Cleo 2.0', 27.00),
  ('Conjunto Ibiza 1.0', 27.00),
  ('Conjunto Ibiza 2.0', 27.00),
  ('Conjunto Lara', 20.00),
  ('Conjunto Liz', 38.00),
  ('Conjunto Mari', 29.00),
  ('Lenço Floresta', 4.00),
  ('Macacão Alfaiataria', 24.00),
  ('Macacão Jade', 28.00),
  ('Maio', 30.00),
  ('Short Sem Costura', 5.00),
  ('Vestido Atena', 39.00),
  ('Vestido Bia', 23.00),
  ('Vestido Gola Alta POA', 30.00),
  ('Vestido Santorine', 24.00),
  ('Vestido Tali', 37.00),
  ('Vestido Trico Listrado', 24.00);

UPDATE products p SET base_price = h.base_price, is_active = true
FROM _planilha_produtos h
WHERE upper(trim(p.name)) = upper(trim(h.name));

INSERT INTO products (name, base_price, is_active)
SELECT h.name, h.base_price, true FROM _planilha_produtos h
WHERE NOT EXISTS (
  SELECT 1 FROM products p WHERE upper(trim(p.name)) = upper(trim(h.name))
);

-- 2) Variantes + stock (UPSERT por SKU)
INSERT INTO product_variants (product_id, sku, color, size, stock_quantity, is_active) VALUES
  ((SELECT id FROM products WHERE name = 'Biquíni Bicolor' LIMIT 1), 'BIQ-BIC-PRE-P', 'PRETO', 'P', 1, true),
  ((SELECT id FROM products WHERE name = 'Biquíni Buzios' LIMIT 1), 'BIQ-BUZ-CAS-P', 'CASTANHO', 'P', 1, true),
  ((SELECT id FROM products WHERE name = 'Biquíni Buzios' LIMIT 1), 'BIQ-BUZ-OFF-P', 'OFF WHITE', 'P', 1, true),
  ((SELECT id FROM products WHERE name = 'Biquíni Buzios' LIMIT 1), 'BIQ-BUZ-VER-P', 'VERDE', 'P', 1, true),
  ((SELECT id FROM products WHERE name = 'Biquíni Olho Grego' LIMIT 1), 'BIQ-OLH-AMA-G', 'AMARELO', 'G', 1, true),
  ((SELECT id FROM products WHERE name = 'Blazer Gola Alta' LIMIT 1), 'BLA-GOL-ARE-U', 'AREIA', 'U', 1, true),
  ((SELECT id FROM products WHERE name = 'Blazer Gola Alta' LIMIT 1), 'BLA-GOL-CAS-U', 'CASTANHO', 'U', 0, true),
  ((SELECT id FROM products WHERE name = 'Blazer Gola Alta' LIMIT 1), 'BLA-GOL-PRE-U', 'PRETO', 'U', 0, true),
  ((SELECT id FROM products WHERE name = 'Blusa Básica Renda' LIMIT 1), 'BLU-BAS-BRA-U', 'BRANCA', 'U', 5, true),
  ((SELECT id FROM products WHERE name = 'Blusa Básica Renda' LIMIT 1), 'BLU-BAS-CAS-U', 'CASTANHO', 'U', 0, true),
  ((SELECT id FROM products WHERE name = 'Blusa Básica Renda' LIMIT 1), 'BLU-BAS-PRE-U', 'PRETA', 'U', 0, true),
  ((SELECT id FROM products WHERE name = 'Blusa Gola Alta POA' LIMIT 1), 'BLU-GOL-BRA-L', 'BRANCA', 'L', 2, true),
  ((SELECT id FROM products WHERE name = 'Blusa Gola Alta POA' LIMIT 1), 'BLU-GOL-BRA-M', 'BRANCA', 'M', 0, true),
  ((SELECT id FROM products WHERE name = 'Blusa Gola Alta POA' LIMIT 1), 'BLU-GOL-BRA-S', 'BRANCA', 'S', 4, true),
  ((SELECT id FROM products WHERE name = 'Blusa Gola Alta POA' LIMIT 1), 'BLU-GOL-CAS-L', 'CASTANHO', 'L', 1, true),
  ((SELECT id FROM products WHERE name = 'Blusa Gola Alta POA' LIMIT 1), 'BLU-GOL-CAS-M', 'CASTANHO', 'M', 1, true),
  ((SELECT id FROM products WHERE name = 'Blusa Gola Alta POA' LIMIT 1), 'BLU-GOL-CAS-S', 'CASTANHO', 'S', 2, true),
  ((SELECT id FROM products WHERE name = 'Blusa Polo Tricot' LIMIT 1), 'BLU-POL-BOR-U', 'BORDO', 'U', 3, true),
  ((SELECT id FROM products WHERE name = 'Blusa Polo Tricot' LIMIT 1), 'BLU-POL-BRA-U', 'BRANCA', 'U', 1, true),
  ((SELECT id FROM products WHERE name = 'Blusa Térmica' LIMIT 1), 'BLU-TER-PRE-M', 'PRETA', 'M', 2, true),
  ((SELECT id FROM products WHERE name = 'Body com Fivela' LIMIT 1), 'BD-FIV-BEG-U', 'BEGE', 'U', 6, true),
  ((SELECT id FROM products WHERE name = 'Body com Fivela' LIMIT 1), 'BD-FIV-BRA-U', 'BRANCO', 'U', 1, true),
  ((SELECT id FROM products WHERE name = 'Body com Fivela' LIMIT 1), 'BD-FIV-CAF-U', 'CAFE', 'U', 10, true),
  ((SELECT id FROM products WHERE name = 'Body com Fivela' LIMIT 1), 'BD-FIV-PRE-U', 'PRETO', 'U', 9, true),
  ((SELECT id FROM products WHERE name = 'Calça Alfaiataria' LIMIT 1), 'CAL-ALF-BOR-L', 'BORDO', 'L', 1, true),
  ((SELECT id FROM products WHERE name = 'Calça Alfaiataria' LIMIT 1), 'CAL-ALF-BOR-M', 'BORDO', 'M', 1, true),
  ((SELECT id FROM products WHERE name = 'Calça Alfaiataria' LIMIT 1), 'CAL-ALF-BOR-S', 'BORDO', 'S', 1, true),
  ((SELECT id FROM products WHERE name = 'Calça Alfaiataria' LIMIT 1), 'CAL-ALF-BOR-XL', 'BORDO', 'XL', 1, true),
  ((SELECT id FROM products WHERE name = 'Calça Alfaiataria' LIMIT 1), 'CAL-ALF-CAS-L', 'CASTANHO', 'L', 0, true),
  ((SELECT id FROM products WHERE name = 'Calça Alfaiataria' LIMIT 1), 'CAL-ALF-CAS-M', 'CASTANHO', 'M', 0, true),
  ((SELECT id FROM products WHERE name = 'Calça Alfaiataria' LIMIT 1), 'CAL-ALF-CAS-S', 'CASTANHO', 'S', 2, true),
  ((SELECT id FROM products WHERE name = 'Calça Alfaiataria' LIMIT 1), 'CAL-ALF-PRE-L', 'PRETA', 'L', 1, true),
  ((SELECT id FROM products WHERE name = 'Calça Alfaiataria' LIMIT 1), 'CAL-ALF-PRE-M', 'PRETA', 'M', 0, true),
  ((SELECT id FROM products WHERE name = 'Calça Alfaiataria' LIMIT 1), 'CAL-ALF-PRE-S', 'PRETA', 'S', 0, true),
  ((SELECT id FROM products WHERE name = 'Calça Jeans' LIMIT 1), 'CAL-JEA-38', NULL, '38', 1, true),
  ((SELECT id FROM products WHERE name = 'Calça Jeans' LIMIT 1), 'CAL-JEA-40', NULL, '40', 0, true),
  ((SELECT id FROM products WHERE name = 'Calça Jeans' LIMIT 1), 'CAL-JEA-42', NULL, '42', 1, true),
  ((SELECT id FROM products WHERE name = 'Calça Jeans' LIMIT 1), 'CAL-JEA-44', NULL, '44', 0, true),
  ((SELECT id FROM products WHERE name = 'Calça Jeans' LIMIT 1), 'CAL-JEA-46', NULL, '46', 1, true),
  ((SELECT id FROM products WHERE name = 'Calça Jeans Flor' LIMIT 1), 'CAL-JFL-L', NULL, 'L', 1, true),
  ((SELECT id FROM products WHERE name = 'Calça Jeans Flor' LIMIT 1), 'CAL-JFL-M', NULL, 'M', 1, true),
  ((SELECT id FROM products WHERE name = 'Calça Jeans Flor' LIMIT 1), 'CAL-JFL-S', NULL, 'S', 1, true),
  ((SELECT id FROM products WHERE name = 'Calça Jeans Flor' LIMIT 1), 'CAL-JFL-XL', NULL, 'XL', 1, true),
  ((SELECT id FROM products WHERE name = 'Calça Listra' LIMIT 1), 'CAL-LIS-AMA-ML', 'AMARELA', 'M/L', 1, true),
  ((SELECT id FROM products WHERE name = 'Calça Listra' LIMIT 1), 'CAL-LIS-AMA-SM', 'AMARELA', 'S/M', 1, true),
  ((SELECT id FROM products WHERE name = 'Calça Onça' LIMIT 1), 'CAL-ONC-L', NULL, 'L', 1, true),
  ((SELECT id FROM products WHERE name = 'Calça Onça' LIMIT 1), 'CAL-ONC-M', NULL, 'M', 1, true),
  ((SELECT id FROM products WHERE name = 'Calça Onça' LIMIT 1), 'CAL-ONC-S', NULL, 'S', 1, true),
  ((SELECT id FROM products WHERE name = 'Calça Onça' LIMIT 1), 'CAL-ONC-XL', NULL, 'XL', 1, true),
  ((SELECT id FROM products WHERE name = 'Calça Onça' LIMIT 1), 'CAL-ONC-XS', NULL, 'XS', 0, true),
  ((SELECT id FROM products WHERE name = 'Calça Sarja' LIMIT 1), 'CAL-SAR-L', NULL, 'L', 2, true),
  ((SELECT id FROM products WHERE name = 'Calça Sarja' LIMIT 1), 'CAL-SAR-M-38', NULL, 'M - 38', 0, true),
  ((SELECT id FROM products WHERE name = 'Calça Sarja' LIMIT 1), 'CAL-SAR-S-36', NULL, 'S - 36', 0, true),
  ((SELECT id FROM products WHERE name = 'Calça Sarja' LIMIT 1), 'CAL-SAR-XL-44', NULL, 'XL - 44', 1, true),
  ((SELECT id FROM products WHERE name = 'Calça Sarja' LIMIT 1), 'CAL-SAR-XS-34', NULL, 'XS - 34', 3, true),
  ((SELECT id FROM products WHERE name = 'Camisa Listrada' LIMIT 1), 'CAM-LIS-AZU-ML', 'AZUL', 'M/L', 0, true),
  ((SELECT id FROM products WHERE name = 'Camisa Listrada' LIMIT 1), 'CAM-LIS-OFF-ML', 'OFF WHITE', 'M/L', 0, true),
  ((SELECT id FROM products WHERE name = 'Camisa Listrada' LIMIT 1), 'CAM-LIS-OFF-SM', 'OFF WHITE', 'S/M', 0, true),
  ((SELECT id FROM products WHERE name = 'Camisa Listrada' LIMIT 1), 'CAM-LIS-ROS-ML', 'ROSA', 'M/L', 0, true),
  ((SELECT id FROM products WHERE name = 'Camisa Listrada' LIMIT 1), 'CAM-LIS-ROS-SM', 'ROSA', 'S/M', 0, true),
  ((SELECT id FROM products WHERE name = 'Colete' LIMIT 1), 'COL-AMA-U', 'AMARELO', 'U', 2, true),
  ((SELECT id FROM products WHERE name = 'Colete' LIMIT 1), 'COL-CAS-U', 'CASTANHO', 'U', 2, true),
  ((SELECT id FROM products WHERE name = 'Colete' LIMIT 1), 'COL-ROS-U', 'ROSA', 'U', 1, true),
  ((SELECT id FROM products WHERE name = 'Conjunto Ayla' LIMIT 1), 'CON-AYL-BRA-U', 'BRANCO', 'U', 2, true),
  ((SELECT id FROM products WHERE name = 'Conjunto Cleo' LIMIT 1), 'CON-CLE-OFF-U', 'OFF WHITE', 'U', 2, true),
  ((SELECT id FROM products WHERE name = 'Conjunto Cleo 2.0' LIMIT 1), 'CON-CLE-BRA-U', 'BRANCO', 'U', 1, true),
  ((SELECT id FROM products WHERE name = 'Conjunto Ibiza 1.0' LIMIT 1), 'CON-IB1-ACL-U', 'AZUL CLARO', 'U', 1, true),
  ((SELECT id FROM products WHERE name = 'Conjunto Ibiza 1.0' LIMIT 1), 'CON-IB1-MAR-U', 'AZUL MARINHO', 'U', 1, true),
  ((SELECT id FROM products WHERE name = 'Conjunto Ibiza 1.0' LIMIT 1), 'CON-IB1-PRE-U', 'PRETO', 'U', 2, true),
  ((SELECT id FROM products WHERE name = 'Conjunto Ibiza 1.0' LIMIT 1), 'CON-IB1-VER-U', 'VERDE', 'U', 3, true),
  ((SELECT id FROM products WHERE name = 'Conjunto Ibiza 2.0' LIMIT 1), 'CON-IB2-BEG-U', 'BEGE', 'U', 0, true),
  ((SELECT id FROM products WHERE name = 'Conjunto Ibiza 2.0' LIMIT 1), 'CON-IB2-CAS-U', 'CASTANHO', 'U', 5, true),
  ((SELECT id FROM products WHERE name = 'Conjunto Ibiza 2.0' LIMIT 1), 'CON-IB2-MAR-U', 'AZUL MARINHO', 'U', 12, true),
  ((SELECT id FROM products WHERE name = 'Conjunto Ibiza 2.0' LIMIT 1), 'CON-IB2-PRE-U', 'PRETO', 'U', 3, true),
  ((SELECT id FROM products WHERE name = 'Conjunto Ibiza 2.0' LIMIT 1), 'CON-IB2-ROS-U', 'ROSA', 'U', 5, true),
  ((SELECT id FROM products WHERE name = 'Conjunto Lara' LIMIT 1), 'CON-LAR-AZU-U', 'AZUL', 'U', 0, true),
  ((SELECT id FROM products WHERE name = 'Conjunto Liz' LIMIT 1), 'CON-LIZ-TER-M', 'TERRACOTA', 'M', 1, true),
  ((SELECT id FROM products WHERE name = 'Conjunto Mari' LIMIT 1), 'CON-MAR-BRA-U', 'BRANCO', 'U', 3, true),
  ((SELECT id FROM products WHERE name = 'Conjunto Mari' LIMIT 1), 'CON-MAR-CAS-U', 'CASTANHO', 'U', 1, true),
  ((SELECT id FROM products WHERE name = 'Conjunto Mari' LIMIT 1), 'CON-MAR-MAR-U', 'MARINHO', 'U', 3, true),
  ((SELECT id FROM products WHERE name = 'Lenço Floresta' LIMIT 1), 'LEN-FLO-AZU-U', 'AZUL', 'U', 4, true),
  ((SELECT id FROM products WHERE name = 'Lenço Floresta' LIMIT 1), 'LEN-FLO-BEG-U', 'BEGE', 'U', 3, true),
  ((SELECT id FROM products WHERE name = 'Lenço Floresta' LIMIT 1), 'LEN-FLO-CIN-U', 'CINZA', 'U', 10, true),
  ((SELECT id FROM products WHERE name = 'Lenço Floresta' LIMIT 1), 'LEN-FLO-PRE-U', 'PRETO', 'U', 10, true),
  ((SELECT id FROM products WHERE name = 'Lenço Floresta' LIMIT 1), 'LEN-FLO-ROS-U', 'ROSA', 'U', 7, true),
  ((SELECT id FROM products WHERE name = 'Macacão Alfaiataria' LIMIT 1), 'MAC-ALF-CAS-U', 'CASTANHO', 'U', 0, true),
  ((SELECT id FROM products WHERE name = 'Macacão Jade' LIMIT 1), 'MAC-JAD-CAS-SM', 'CASTANHO', 'S/M', 1, true),
  ((SELECT id FROM products WHERE name = 'Macacão Jade' LIMIT 1), 'MAC-JAD-OFF-LXL', 'OFF WHITE', 'L/XL', 1, true),
  ((SELECT id FROM products WHERE name = 'Maio' LIMIT 1), 'MAI-CER-G', 'CEREJA', 'G', 1, true),
  ((SELECT id FROM products WHERE name = 'Maio' LIMIT 1), 'MAI-PRE-G', 'PRETO', 'G', 1, true),
  ((SELECT id FROM products WHERE name = 'Short Sem Costura' LIMIT 1), 'SHO-SEM-BEG-LXL', 'BEGE', 'L/XL', 3, true),
  ((SELECT id FROM products WHERE name = 'Short Sem Costura' LIMIT 1), 'SHO-SEM-BEG-SM', 'BEGE', 'S/M', 1, true),
  ((SELECT id FROM products WHERE name = 'Short Sem Costura' LIMIT 1), 'SHO-SEM-MRF-LXL', 'MARFIM', 'L/XL', 3, true),
  ((SELECT id FROM products WHERE name = 'Short Sem Costura' LIMIT 1), 'SHO-SEM-MRF-SM', 'Marfim', 'S/M', 2, true),
  ((SELECT id FROM products WHERE name = 'Short Sem Costura' LIMIT 1), 'SHO-SEM-PRE-LXL', 'PRETO', 'L/XL', 5, true),
  ((SELECT id FROM products WHERE name = 'Short Sem Costura' LIMIT 1), 'SHO-SEM-PRE-SM', 'PRETO', 'S/M', 5, true),
  ((SELECT id FROM products WHERE name = 'Vestido Atena' LIMIT 1), 'VST-ATE-CAS-M', 'CASTANHO', 'M', 1, true),
  ((SELECT id FROM products WHERE name = 'Vestido Atena' LIMIT 1), 'VST-ATE-OFF-S', 'OFF WHITE', 'S', 1, true),
  ((SELECT id FROM products WHERE name = 'Vestido Atena' LIMIT 1), 'VST-ATE-PRE-L', 'PRETO', 'L', 1, true),
  ((SELECT id FROM products WHERE name = 'Vestido Bia' LIMIT 1), 'VST-BIA-AMA-U', 'AMARELO', 'U', 4, true),
  ((SELECT id FROM products WHERE name = 'Vestido Bia' LIMIT 1), 'VST-BIA-MAR-U', 'AZUL MARINHO', 'U', 0, true),
  ((SELECT id FROM products WHERE name = 'Vestido Bia' LIMIT 1), 'VST-BIA-OLI-U', 'OLIVA', 'U', 3, true),
  ((SELECT id FROM products WHERE name = 'Vestido Bia' LIMIT 1), 'VST-BIA-ROS-U', 'ROSA', 'U', 3, true),
  ((SELECT id FROM products WHERE name = 'Vestido Gola Alta POA' LIMIT 1), 'VST-GOL-CAS-L', 'CASTANHO', 'L', 1, true),
  ((SELECT id FROM products WHERE name = 'Vestido Gola Alta POA' LIMIT 1), 'VST-GOL-CAS-M', 'CASTANHO', 'M', 1, true),
  ((SELECT id FROM products WHERE name = 'Vestido Gola Alta POA' LIMIT 1), 'VST-GOL-CAS-S', 'CASTANHO', 'S', 1, true),
  ((SELECT id FROM products WHERE name = 'Vestido Santorine' LIMIT 1), 'VST-SAN-BOR-U', 'BORDO', 'U', 1, true),
  ((SELECT id FROM products WHERE name = 'Vestido Santorine' LIMIT 1), 'VST-SAN-CAS-U', 'CASTANHO', 'U', 1, true),
  ((SELECT id FROM products WHERE name = 'Vestido Santorine' LIMIT 1), 'VST-SAN-MAR-U', 'MARINHO', 'U', 1, true),
  ((SELECT id FROM products WHERE name = 'Vestido Santorine' LIMIT 1), 'VST-SAN-PIN-U', 'PINK', 'U', 1, true),
  ((SELECT id FROM products WHERE name = 'Vestido Santorine' LIMIT 1), 'VST-SAN-PRE-U', 'PRETO', 'U', 1, true),
  ((SELECT id FROM products WHERE name = 'Vestido Santorine' LIMIT 1), 'VST-SAN-VER-U', 'VERDE', 'U', 1, true),
  ((SELECT id FROM products WHERE name = 'Vestido Tali' LIMIT 1), 'VST-TAL-AMA-U', 'AMARELO', 'U', 1, true),
  ((SELECT id FROM products WHERE name = 'Vestido Tali' LIMIT 1), 'VST-TAL-PRE-U', 'PRETO', 'U', 2, true),
  ((SELECT id FROM products WHERE name = 'Vestido Tali' LIMIT 1), 'VST-TAL-ROS-U', 'ROSA', 'U', 1, true),
  ((SELECT id FROM products WHERE name = 'Vestido Trico Listrado' LIMIT 1), 'VST-TRI-ARE-ML', 'AREIA', 'M/L', 1, true)
ON CONFLICT (sku) DO UPDATE SET stock_quantity = EXCLUDED.stock_quantity, color = EXCLUDED.color, size = EXCLUDED.size, is_active = EXCLUDED.is_active;

-- 3) Cores em catalog_colors + color_id
INSERT INTO catalog_colors (name, sort_order)
SELECT dedup.canon, 100
FROM (
  SELECT upper(trim(v.color)) AS u, min(trim(v.color)) AS canon
  FROM product_variants v
  WHERE v.color IS NOT NULL AND trim(v.color) <> ''
  GROUP BY upper(trim(v.color))
) dedup
WHERE NOT EXISTS (
  SELECT 1 FROM catalog_colors c WHERE upper(trim(c.name)) = dedup.u
);

UPDATE product_variants v
SET color_id = c.id
FROM catalog_colors c
WHERE v.color IS NOT NULL AND trim(v.color) <> ''
  AND upper(trim(v.color)) = upper(trim(c.name))
  AND (v.color_id IS NULL OR v.color_id <> c.id);

-- 4) Desativar produtos removidos do inventário
UPDATE products SET is_active = false
WHERE name IN ('Calça Alfaiataria com Cinto',
  'Calça Alfaiataria Pregas',
  'Calça Algodão',
  'Conjunto Ísis',
  'Conjunto Lia',
  'Conjunto Trico Siena',
  'Vestido Mavie');

UPDATE product_variants pv
SET is_active = false, stock_quantity = 0
FROM products p
WHERE pv.product_id = p.id AND p.is_active = false;

-- 5) Variantes antigas (SKU fora da planilha) — stock 0, inativo
UPDATE product_variants SET is_active = false, stock_quantity = 0
WHERE sku NOT IN ('BD-FIV-BEG-U',
  'BD-FIV-BRA-U',
  'BD-FIV-CAF-U',
  'BD-FIV-PRE-U',
  'BIQ-BIC-PRE-P',
  'BIQ-BUZ-CAS-P',
  'BIQ-BUZ-OFF-P',
  'BIQ-BUZ-VER-P',
  'BIQ-OLH-AMA-G',
  'BLA-GOL-ARE-U',
  'BLA-GOL-CAS-U',
  'BLA-GOL-PRE-U',
  'BLU-BAS-BRA-U',
  'BLU-BAS-CAS-U',
  'BLU-BAS-PRE-U',
  'BLU-GOL-BRA-L',
  'BLU-GOL-BRA-M',
  'BLU-GOL-BRA-S',
  'BLU-GOL-CAS-L',
  'BLU-GOL-CAS-M',
  'BLU-GOL-CAS-S',
  'BLU-POL-BOR-U',
  'BLU-POL-BRA-U',
  'BLU-TER-PRE-M',
  'CAL-ALF-BOR-L',
  'CAL-ALF-BOR-M',
  'CAL-ALF-BOR-S',
  'CAL-ALF-BOR-XL',
  'CAL-ALF-CAS-L',
  'CAL-ALF-CAS-M',
  'CAL-ALF-CAS-S',
  'CAL-ALF-PRE-L',
  'CAL-ALF-PRE-M',
  'CAL-ALF-PRE-S',
  'CAL-JEA-38',
  'CAL-JEA-40',
  'CAL-JEA-42',
  'CAL-JEA-44',
  'CAL-JEA-46',
  'CAL-JFL-L',
  'CAL-JFL-M',
  'CAL-JFL-S',
  'CAL-JFL-XL',
  'CAL-LIS-AMA-ML',
  'CAL-LIS-AMA-SM',
  'CAL-ONC-L',
  'CAL-ONC-M',
  'CAL-ONC-S',
  'CAL-ONC-XL',
  'CAL-ONC-XS',
  'CAL-SAR-L',
  'CAL-SAR-M-38',
  'CAL-SAR-S-36',
  'CAL-SAR-XL-44',
  'CAL-SAR-XS-34',
  'CAM-LIS-AZU-ML',
  'CAM-LIS-OFF-ML',
  'CAM-LIS-OFF-SM',
  'CAM-LIS-ROS-ML',
  'CAM-LIS-ROS-SM',
  'COL-AMA-U',
  'COL-CAS-U',
  'COL-ROS-U',
  'CON-AYL-BRA-U',
  'CON-CLE-BRA-U',
  'CON-CLE-OFF-U',
  'CON-IB1-ACL-U',
  'CON-IB1-MAR-U',
  'CON-IB1-PRE-U',
  'CON-IB1-VER-U',
  'CON-IB2-BEG-U',
  'CON-IB2-CAS-U',
  'CON-IB2-MAR-U',
  'CON-IB2-PRE-U',
  'CON-IB2-ROS-U',
  'CON-LAR-AZU-U',
  'CON-LIZ-TER-M',
  'CON-MAR-BRA-U',
  'CON-MAR-CAS-U',
  'CON-MAR-MAR-U',
  'LEN-FLO-AZU-U',
  'LEN-FLO-BEG-U',
  'LEN-FLO-CIN-U',
  'LEN-FLO-PRE-U',
  'LEN-FLO-ROS-U',
  'MAC-ALF-CAS-U',
  'MAC-JAD-CAS-SM',
  'MAC-JAD-OFF-LXL',
  'MAI-CER-G',
  'MAI-PRE-G',
  'SHO-SEM-BEG-LXL',
  'SHO-SEM-BEG-SM',
  'SHO-SEM-MRF-LXL',
  'SHO-SEM-MRF-SM',
  'SHO-SEM-PRE-LXL',
  'SHO-SEM-PRE-SM',
  'VST-ATE-CAS-M',
  'VST-ATE-OFF-S',
  'VST-ATE-PRE-L',
  'VST-BIA-AMA-U',
  'VST-BIA-MAR-U',
  'VST-BIA-OLI-U',
  'VST-BIA-ROS-U',
  'VST-GOL-CAS-L',
  'VST-GOL-CAS-M',
  'VST-GOL-CAS-S',
  'VST-SAN-BOR-U',
  'VST-SAN-CAS-U',
  'VST-SAN-MAR-U',
  'VST-SAN-PIN-U',
  'VST-SAN-PRE-U',
  'VST-SAN-VER-U',
  'VST-TAL-AMA-U',
  'VST-TAL-PRE-U',
  'VST-TAL-ROS-U',
  'VST-TRI-ARE-ML');

-- 6) Recategorizar (migration inline)
-- =====================================================
-- 1) GARANTIR QUE EXISTEM AS CATEGORIAS CANÓNICAS
-- =====================================================
-- Adiciona categorias que possam ainda faltar.
-- NOTA: a tabela `categories` em produção pode não ter UNIQUE
-- na coluna `name`, então usamos WHERE NOT EXISTS em vez de
-- ON CONFLICT para manter compatibilidade.
INSERT INTO categories (name)
SELECT v.name
FROM (VALUES
  ('Vestidos'),
  ('Conjuntos'),
  ('Calças'),
  ('Biquinis'),
  ('Bodies'),
  ('Shorts'),
  ('Macacões'),
  ('Blusas'),
  ('Acessórios')
) AS v(name)
WHERE NOT EXISTS (
  SELECT 1 FROM categories c WHERE c.name = v.name
);

-- =====================================================
-- 2) RECATEGORIZAR PRODUTOS POR PATTERN MATCHING DO NOME
-- =====================================================
-- Forçamos a categoria correta com base no prefixo do nome,
-- sobrescrevendo qualquer atribuição errada anterior.
--
-- IMPORTANTE: usamos `translate()` para normalizar acentos
-- (á→a, í→i, ç→c, ã→a, ê→e, ô→o, ...) porque ILIKE é
-- case-insensitive mas NÃO ignora acentos. Sem isto, nomes
-- como "Biquíni" não dão match com "BIQUIN%".
--
-- Ordem importa: do mais específico ao mais genérico para
-- evitar que "Conjunto Trico Siena" caia em "Tricot" ou
-- "Macacão" caia em "Conjuntos".

-- Helper: cria uma função local de normalização (sem acentos, lowercase).
-- Usamos uma CTE/subquery via translate() inline em vez de criar função
-- permanente para manter a migração auto-contida.
-- 
-- Padrão: lower(translate(name, 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
--                                'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'))

-- Vestidos (vestido ...)
UPDATE products SET category_id = (SELECT id FROM categories WHERE name = 'Vestidos')
 WHERE lower(translate(name,
       'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
       'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')) LIKE 'vestido%';

-- Conjuntos (conjunto ... — INCLUI "Conjunto Trico Siena")
UPDATE products SET category_id = (SELECT id FROM categories WHERE name = 'Conjuntos')
 WHERE lower(translate(name,
       'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
       'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')) LIKE 'conjunto%';

-- Macacões (macacao / macacão ...)
UPDATE products SET category_id = (SELECT id FROM categories WHERE name = 'Macacões')
 WHERE lower(translate(name,
       'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
       'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')) LIKE 'macac%';

-- Biquinis e maiôs (biquini..., biquíni..., maio, maiô)
UPDATE products SET category_id = (SELECT id FROM categories WHERE name = 'Biquinis')
 WHERE lower(translate(name,
       'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
       'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')) ~ '^(biquini|maio)';

-- Bodies (body ...)
UPDATE products SET category_id = (SELECT id FROM categories WHERE name = 'Bodies')
 WHERE lower(translate(name,
       'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
       'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')) LIKE 'body%';

-- Calças (calca / calça / bermuda ...)
UPDATE products SET category_id = (SELECT id FROM categories WHERE name = 'Calças')
 WHERE lower(translate(name,
       'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
       'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')) ~ '^(calca|bermuda)';

-- Shorts (short ...)
UPDATE products SET category_id = (SELECT id FROM categories WHERE name = 'Shorts')
 WHERE lower(translate(name,
       'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
       'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')) LIKE 'short%';

-- Blusas (blusa ...)
UPDATE products SET category_id = (SELECT id FROM categories WHERE name = 'Blusas')
 WHERE lower(translate(name,
       'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
       'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')) LIKE 'blusa%';

-- Acessórios (lenco / lenço ...)
UPDATE products SET category_id = (SELECT id FROM categories WHERE name = 'Acessórios')
 WHERE lower(translate(name,
       'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
       'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')) LIKE 'lenco%';

-- =====================================================
-- 3) REMOVER CATEGORIAS ÓRFÃS / REDUNDANTES
-- =====================================================
-- Apaga categorias que: (a) não têm produtos atribuídos
-- E (b) são redundantes ou nunca foram usadas no negócio.
-- Só apagamos se ficarem mesmo vazias após o passo 2.
DELETE FROM categories
 WHERE name IN ('Banho', 'Jeans', 'Tricot')
   AND id NOT IN (SELECT DISTINCT category_id FROM products WHERE category_id IS NOT NULL);

-- =====================================================
-- 4) RELATÓRIO PÓS-MIGRAÇÃO
-- =====================================================
DO $$
DECLARE
  total_products INT;
  uncategorized  INT;
  total_cats     INT;
  empty_cats     INT;
BEGIN
  SELECT COUNT(*) INTO total_products FROM products WHERE is_active = true;
  SELECT COUNT(*) INTO uncategorized  FROM products WHERE is_active = true AND category_id IS NULL;
  SELECT COUNT(*) INTO total_cats     FROM categories;
  SELECT COUNT(*) INTO empty_cats     FROM categories c
    WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.category_id = c.id AND p.is_active = true);

  RAISE NOTICE '════════════════════════════════════════════════';
  RAISE NOTICE 'Total de produtos ativos:       %', total_products;
  RAISE NOTICE 'Produtos sem categoria (revê!): %', uncategorized;
  RAISE NOTICE 'Categorias totais:              %', total_cats;
  RAISE NOTICE 'Categorias sem produtos:        %', empty_cats;
  RAISE NOTICE '════════════════════════════════════════════════';
END $$;

COMMIT;
