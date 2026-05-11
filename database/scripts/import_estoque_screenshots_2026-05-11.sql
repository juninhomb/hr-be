BEGIN;

-- Gerado por pdf_to_catalog_sql.py — rever SKUs duplicados se o PDF tiver leituras estranhas.

INSERT INTO products (name, base_price, is_active) VALUES ('Biquíni Bicolor', 30.00, true);
INSERT INTO products (name, base_price, is_active) VALUES ('Biquíni Buzios', 30.00, true);
INSERT INTO products (name, base_price, is_active) VALUES ('Biquíni Olho Grego', 30.00, true);
INSERT INTO products (name, base_price, is_active) VALUES ('Blazer Gola Alta', 23.00, true);
INSERT INTO products (name, base_price, is_active) VALUES ('Blusa Básica Renda', 12.00, true);
INSERT INTO products (name, base_price, is_active) VALUES ('Blusa Polo Tricot', 13.00, true);
INSERT INTO products (name, base_price, is_active) VALUES ('Blusa Térmica', 7.00, true);
INSERT INTO products (name, base_price, is_active) VALUES ('Body com Fivela', 13.00, true);
INSERT INTO products (name, base_price, is_active) VALUES ('Calça Alfaiataria', 21.00, true);
INSERT INTO products (name, base_price, is_active) VALUES ('Calça Alfaiataria com Cinto', 19.00, true);
INSERT INTO products (name, base_price, is_active) VALUES ('Calça Alfaiataria Pregas', 17.00, true);
INSERT INTO products (name, base_price, is_active) VALUES ('Calça Algodão', 14.00, true);
INSERT INTO products (name, base_price, is_active) VALUES ('Calça Jeans', 22.00, true);
INSERT INTO products (name, base_price, is_active) VALUES ('Calça Jeans Flor', 29.00, true);
INSERT INTO products (name, base_price, is_active) VALUES ('Calça Listra', 22.00, true);
INSERT INTO products (name, base_price, is_active) VALUES ('Calça Onça', 29.00, true);
INSERT INTO products (name, base_price, is_active) VALUES ('Calça Sarja', 23.00, true);
INSERT INTO products (name, base_price, is_active) VALUES ('Camisa Listrada', 24.00, true);
INSERT INTO products (name, base_price, is_active) VALUES ('Colete', 14.00, true);
INSERT INTO products (name, base_price, is_active) VALUES ('Conjunto Ayla', 23.00, true);
INSERT INTO products (name, base_price, is_active) VALUES ('Conjunto Cleo 2.0', 27.00, true);
INSERT INTO products (name, base_price, is_active) VALUES ('Conjunto Ibiza 1.0', 27.00, true);
INSERT INTO products (name, base_price, is_active) VALUES ('Conjunto Ibiza 2.0', 27.00, true);
INSERT INTO products (name, base_price, is_active) VALUES ('Conjunto Lara', 20.00, true);
INSERT INTO products (name, base_price, is_active) VALUES ('Conjunto Lia', 25.00, true);
INSERT INTO products (name, base_price, is_active) VALUES ('Conjunto Liz', 38.00, true);
INSERT INTO products (name, base_price, is_active) VALUES ('Conjunto Mari', 29.00, true);
INSERT INTO products (name, base_price, is_active) VALUES ('Conjunto Trico Siena', 24.00, true);
INSERT INTO products (name, base_price, is_active) VALUES ('Conjunto Ísis', 55.00, true);
INSERT INTO products (name, base_price, is_active) VALUES ('Lenço Floresta', 4.00, true);
INSERT INTO products (name, base_price, is_active) VALUES ('Macacão Alfaiataria', 24.00, true);
INSERT INTO products (name, base_price, is_active) VALUES ('Macacão Jade', 28.00, true);
INSERT INTO products (name, base_price, is_active) VALUES ('Maio', 30.00, true);
INSERT INTO products (name, base_price, is_active) VALUES ('Short Sem Costura', 5.00, true);
INSERT INTO products (name, base_price, is_active) VALUES ('Vestido Atena', 39.00, true);
INSERT INTO products (name, base_price, is_active) VALUES ('Vestido Bia', 23.00, true);
INSERT INTO products (name, base_price, is_active) VALUES ('Vestido Mavie', 18.00, true);
INSERT INTO products (name, base_price, is_active) VALUES ('Vestido Tali', 37.00, true);
INSERT INTO products (name, base_price, is_active) VALUES ('Vestido Trico Listrado', 24.00, true);

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
  ((SELECT id FROM products WHERE name = 'Blusa Polo Tricot' LIMIT 1), 'BLU-POL-BOR-U', 'BORDO', 'U', 3, true),
  ((SELECT id FROM products WHERE name = 'Blusa Polo Tricot' LIMIT 1), 'BLU-POL-BRA-U', 'BRANCA', 'U', 1, true),
  ((SELECT id FROM products WHERE name = 'Blusa Térmica' LIMIT 1), 'BLU-TER-AZU-M', 'AZUL', 'M', 2, true),
  ((SELECT id FROM products WHERE name = 'Blusa Térmica' LIMIT 1), 'BLU-TER-PRE-M', 'PRETA', 'M', 3, true),
  ((SELECT id FROM products WHERE name = 'Body com Fivela' LIMIT 1), 'BD-FIV-BEG-U', 'BEGE', 'U', 0, true),
  ((SELECT id FROM products WHERE name = 'Body com Fivela' LIMIT 1), 'BD-FIV-BRA-U', 'BRANCO', 'U', 0, true),
  ((SELECT id FROM products WHERE name = 'Body com Fivela' LIMIT 1), 'BD-FIV-CAF-U', 'CAFE', 'U', 0, true),
  ((SELECT id FROM products WHERE name = 'Body com Fivela' LIMIT 1), 'BD-FIV-PRE-U', 'PRETO', 'U', 0, true),
  ((SELECT id FROM products WHERE name = 'Calça Alfaiataria' LIMIT 1), 'CAL-ALF-CAS-M', 'CASTANHO', 'M', 0, true),
  ((SELECT id FROM products WHERE name = 'Calça Alfaiataria' LIMIT 1), 'CAL-ALF-CAS-S', 'CASTANHO', 'S', 2, true),
  ((SELECT id FROM products WHERE name = 'Calça Alfaiataria' LIMIT 1), 'CAL-ALF-PRE-L', 'PRETA', 'L', 1, true),
  ((SELECT id FROM products WHERE name = 'Calça Alfaiataria' LIMIT 1), 'CAL-ALF-PRE-M', 'PRETA', 'M', 0, true),
  ((SELECT id FROM products WHERE name = 'Calça Alfaiataria' LIMIT 1), 'CAL-ALF-PRE-S', 'PRETA', 'S', 0, true),
  ((SELECT id FROM products WHERE name = 'Calça Alfaiataria com Cinto' LIMIT 1), 'CAL-CIN-OFF-U', 'OFF WHITE', 'U', 1, true),
  ((SELECT id FROM products WHERE name = 'Calça Alfaiataria Pregas' LIMIT 1), 'CAL-PRE-BOR-L', 'BORDO', 'L', 1, true),
  ((SELECT id FROM products WHERE name = 'Calça Algodão' LIMIT 1), 'CAL-ALG-ARE-U', 'AREIA', 'U', 2, true),
  ((SELECT id FROM products WHERE name = 'Calça Jeans' LIMIT 1), 'CAL-JEA-38', NULL, '38', 1, true),
  ((SELECT id FROM products WHERE name = 'Calça Jeans' LIMIT 1), 'CAL-JEA-40', NULL, '40', 0, true),
  ((SELECT id FROM products WHERE name = 'Calça Jeans' LIMIT 1), 'CAL-JEA-42', NULL, '42', 2, true),
  ((SELECT id FROM products WHERE name = 'Calça Jeans' LIMIT 1), 'CAL-JEA-44', NULL, '44', 0, true),
  ((SELECT id FROM products WHERE name = 'Calça Jeans' LIMIT 1), 'CAL-JEA-46', NULL, '46', 2, true),
  ((SELECT id FROM products WHERE name = 'Calça Jeans Flor' LIMIT 1), 'CAL-JFL-L', NULL, 'L', 1, true),
  ((SELECT id FROM products WHERE name = 'Calça Jeans Flor' LIMIT 1), 'CAL-JFL-M', NULL, 'M', 1, true),
  ((SELECT id FROM products WHERE name = 'Calça Jeans Flor' LIMIT 1), 'CAL-JFL-S', NULL, 'S', 1, true),
  ((SELECT id FROM products WHERE name = 'Calça Jeans Flor' LIMIT 1), 'CAL-JFL-XL', NULL, 'XL', 1, true),
  ((SELECT id FROM products WHERE name = 'Calça Listra' LIMIT 1), 'CAL-LIS-AMA-ML', 'AMARELA', 'M/L', 1, true),
  ((SELECT id FROM products WHERE name = 'Calça Listra' LIMIT 1), 'CAL-LIS-AMA-SM', 'AMARELA', 'S/M', 1, true),
  ((SELECT id FROM products WHERE name = 'Calça Onça' LIMIT 1), 'CAL-ONC-L', NULL, 'L', 0, true),
  ((SELECT id FROM products WHERE name = 'Calça Onça' LIMIT 1), 'CAL-ONC-M', NULL, 'M', 0, true),
  ((SELECT id FROM products WHERE name = 'Calça Onça' LIMIT 1), 'CAL-ONC-S', NULL, 'S', 0, true),
  ((SELECT id FROM products WHERE name = 'Calça Onça' LIMIT 1), 'CAL-ONC-XL', NULL, 'XL', 1, true),
  ((SELECT id FROM products WHERE name = 'Calça Onça' LIMIT 1), 'CAL-ONC-XS', NULL, 'XS', 0, true),
  ((SELECT id FROM products WHERE name = 'Calça Sarja' LIMIT 1), 'CAL-SAR-L', NULL, 'L', 1, true),
  ((SELECT id FROM products WHERE name = 'Calça Sarja' LIMIT 1), 'CAL-SAR-M-38', NULL, 'M - 38', 0, true),
  ((SELECT id FROM products WHERE name = 'Calça Sarja' LIMIT 1), 'CAL-SAR-S-36', NULL, 'S - 36', 0, true),
  ((SELECT id FROM products WHERE name = 'Calça Sarja' LIMIT 1), 'CAL-SAR-XL-44', NULL, 'XL - 44', 1, true),
  ((SELECT id FROM products WHERE name = 'Calça Sarja' LIMIT 1), 'CAL-SAR-XS-34', NULL, 'XS - 34', 1, true),
  ((SELECT id FROM products WHERE name = 'Camisa Listrada' LIMIT 1), 'CAM-LIS-AZU-ML', 'AZUL', 'M/L', 0, true),
  ((SELECT id FROM products WHERE name = 'Camisa Listrada' LIMIT 1), 'CAM-LIS-OFF-ML', 'OFF WHITE', 'M/L', 0, true),
  ((SELECT id FROM products WHERE name = 'Camisa Listrada' LIMIT 1), 'CAM-LIS-OFF-SM', 'OFF WHITE', 'S/M', 0, true),
  ((SELECT id FROM products WHERE name = 'Camisa Listrada' LIMIT 1), 'CAM-LIS-ROS-ML', 'ROSA', 'M/L', 0, true),
  ((SELECT id FROM products WHERE name = 'Camisa Listrada' LIMIT 1), 'CAM-LIS-ROS-SM', 'ROSA', 'S/M', 0, true),
  ((SELECT id FROM products WHERE name = 'Colete' LIMIT 1), 'COL-AMA-U', 'AMARELO', 'U', 2, true),
  ((SELECT id FROM products WHERE name = 'Colete' LIMIT 1), 'COL-CAS-U', 'CASTANHO', 'U', 2, true),
  ((SELECT id FROM products WHERE name = 'Colete' LIMIT 1), 'COL-ROS-U', 'ROSA', 'U', 2, true),
  ((SELECT id FROM products WHERE name = 'Conjunto Ayla' LIMIT 1), 'CON-AYL-BRA-U', 'BRANCO', 'U', 2, true),
  ((SELECT id FROM products WHERE name = 'Conjunto Cleo 2.0' LIMIT 1), 'CON-CLE-BRA-U', 'BRANCO', 'U', 1, true),
  ((SELECT id FROM products WHERE name = 'Conjunto Ibiza 1.0' LIMIT 1), 'CON-IB1-ACL-U', 'AZUL CLARO', 'U', 3, true),
  ((SELECT id FROM products WHERE name = 'Conjunto Ibiza 1.0' LIMIT 1), 'CON-IB1-PRE-U', 'PRETO', 'U', 1, true),
  ((SELECT id FROM products WHERE name = 'Conjunto Ibiza 1.0' LIMIT 1), 'CON-IB1-VER-U', 'VERDE', 'U', 7, true),
  ((SELECT id FROM products WHERE name = 'Conjunto Ibiza 2.0' LIMIT 1), 'CON-IB2-AZU-U', 'AZUL', 'U', 0, true),
  ((SELECT id FROM products WHERE name = 'Conjunto Ibiza 2.0' LIMIT 1), 'CON-IB2-BEG-U', 'BEGE', 'U', 0, true),
  ((SELECT id FROM products WHERE name = 'Conjunto Ibiza 2.0' LIMIT 1), 'CON-IB2-CAS-U', 'CASTANHO', 'U', 0, true),
  ((SELECT id FROM products WHERE name = 'Conjunto Ibiza 2.0' LIMIT 1), 'CON-IB2-PRE-U', 'PRETO', 'U', 0, true),
  ((SELECT id FROM products WHERE name = 'Conjunto Ibiza 2.0' LIMIT 1), 'CON-IB2-ROS-U', 'ROSA', 'U', 0, true),
  ((SELECT id FROM products WHERE name = 'Conjunto Lara' LIMIT 1), 'CON-LAR-AZU-U', 'AZUL', 'U', 1, true),
  ((SELECT id FROM products WHERE name = 'Conjunto Lara' LIMIT 1), 'CON-LAR-PRE-U', 'PRETO', 'U', 2, true),
  ((SELECT id FROM products WHERE name = 'Conjunto Lia' LIMIT 1), 'CON-LIA-ARE-LXL', 'AREIA', 'L/XL', 2, true),
  ((SELECT id FROM products WHERE name = 'Conjunto Lia' LIMIT 1), 'CON-LIA-ARE-SM', 'AREIA', 'S/M', 1, true),
  ((SELECT id FROM products WHERE name = 'Conjunto Lia' LIMIT 1), 'CON-LIA-OLI-LXL', 'OLIVA', 'L/XL', 1, true),
  ((SELECT id FROM products WHERE name = 'Conjunto Liz' LIMIT 1), 'CON-LIZ-TER-M', 'TERRACOTA', 'M', 1, true),
  ((SELECT id FROM products WHERE name = 'Conjunto Mari' LIMIT 1), 'CON-MAR-BRA-U', 'BRANCO', 'U', 3, true),
  ((SELECT id FROM products WHERE name = 'Conjunto Mari' LIMIT 1), 'CON-MAR-CAS-U', 'CASTANHO', 'U', 3, true),
  ((SELECT id FROM products WHERE name = 'Conjunto Mari' LIMIT 1), 'CON-MAR-MAR-U', 'MARINHO', 'U', 3, true),
  ((SELECT id FROM products WHERE name = 'Conjunto Trico Siena' LIMIT 1), 'CON-SIE-PRE-U', 'PRETO', 'U', 1, true),
  ((SELECT id FROM products WHERE name = 'Conjunto Ísis' LIMIT 1), 'CON-ISI-CAS-ML', 'CASTANHO', 'M/L', 0, true),
  ((SELECT id FROM products WHERE name = 'Conjunto Ísis' LIMIT 1), 'CON-ISI-CAS-SM', 'CASTANHO', 'S/M', 0, true),
  ((SELECT id FROM products WHERE name = 'Lenço Floresta' LIMIT 1), 'LEN-FLO-AZU-U', 'AZUL', 'U', 3, true),
  ((SELECT id FROM products WHERE name = 'Lenço Floresta' LIMIT 1), 'LEN-FLO-BEG-U', 'BEGE', 'U', 3, true),
  ((SELECT id FROM products WHERE name = 'Lenço Floresta' LIMIT 1), 'LEN-FLO-CIN-U', 'CINZA', 'U', 7, true),
  ((SELECT id FROM products WHERE name = 'Lenço Floresta' LIMIT 1), 'LEN-FLO-PRE-U', 'PRETO', 'U', 6, true),
  ((SELECT id FROM products WHERE name = 'Lenço Floresta' LIMIT 1), 'LEN-FLO-ROS-U', 'ROSA', 'U', 4, true),
  ((SELECT id FROM products WHERE name = 'Macacão Alfaiataria' LIMIT 1), 'MAC-ALF-CAS-U', 'CASTANHO', 'U', 0, true),
  ((SELECT id FROM products WHERE name = 'Macacão Jade' LIMIT 1), 'MAC-JAD-CAS-SM', 'CASTANHO', 'S/M', 1, true),
  ((SELECT id FROM products WHERE name = 'Macacão Jade' LIMIT 1), 'MAC-JAD-OFF-LXL', 'OFF WHITE', 'L/XL', 1, true),
  ((SELECT id FROM products WHERE name = 'Maio' LIMIT 1), 'MAI-CER-G', 'CEREJA', 'G', 1, true),
  ((SELECT id FROM products WHERE name = 'Maio' LIMIT 1), 'MAI-PRE-G', 'PRETO', 'G', 1, true),
  ((SELECT id FROM products WHERE name = 'Short Sem Costura' LIMIT 1), 'SHO-SEM-BEG-LXL', 'BEGE', 'L/XL', 4, true),
  ((SELECT id FROM products WHERE name = 'Short Sem Costura' LIMIT 1), 'SHO-SEM-BEG-SM', 'BEGE', 'S/M', 1, true),
  ((SELECT id FROM products WHERE name = 'Short Sem Costura' LIMIT 1), 'SHO-SEM-MRF-LXL', 'MARFIM', 'L/XL', 4, true),
  ((SELECT id FROM products WHERE name = 'Short Sem Costura' LIMIT 1), 'SHO-SEM-MRF-SM', 'Marfim', 'S/M', 4, true),
  ((SELECT id FROM products WHERE name = 'Short Sem Costura' LIMIT 1), 'SHO-SEM-PRE-LXL', 'PRETO', 'L/XL', 5, true),
  ((SELECT id FROM products WHERE name = 'Short Sem Costura' LIMIT 1), 'SHO-SEM-PRE-SM', 'PRETO', 'S/M', 6, true),
  ((SELECT id FROM products WHERE name = 'Vestido Atena' LIMIT 1), 'VST-ATE-CAS-M', 'CASTANHO', 'M', 1, true),
  ((SELECT id FROM products WHERE name = 'Vestido Atena' LIMIT 1), 'VST-ATE-OFF-S', 'OFF WHITE', 'S', 1, true),
  ((SELECT id FROM products WHERE name = 'Vestido Atena' LIMIT 1), 'VST-ATE-PRE-L', 'PRETO', 'L', 1, true),
  ((SELECT id FROM products WHERE name = 'Vestido Bia' LIMIT 1), 'VST-BIA-AMA-U', 'AMARELO', 'U', 0, true),
  ((SELECT id FROM products WHERE name = 'Vestido Bia' LIMIT 1), 'VST-BIA-MAR-U', 'AZUL MARINHO', 'U', 0, true),
  ((SELECT id FROM products WHERE name = 'Vestido Bia' LIMIT 1), 'VST-BIA-OLI-U', 'OLIVA', 'U', 2, true),
  ((SELECT id FROM products WHERE name = 'Vestido Bia' LIMIT 1), 'VST-BIA-ROS-U', 'ROSA', 'U', 0, true),
  ((SELECT id FROM products WHERE name = 'Vestido Mavie' LIMIT 1), 'VST-MAV-ARE-U', 'AREIA', 'U', 1, true),
  ((SELECT id FROM products WHERE name = 'Vestido Tali' LIMIT 1), 'VST-TAL-AMA-U', 'AMARELO', 'U', 1, true),
  ((SELECT id FROM products WHERE name = 'Vestido Tali' LIMIT 1), 'VST-TAL-PRE-U', 'PRETO', 'U', 2, true),
  ((SELECT id FROM products WHERE name = 'Vestido Tali' LIMIT 1), 'VST-TAL-ROS-U', 'ROSA', 'U', 1, true),
  ((SELECT id FROM products WHERE name = 'Vestido Trico Listrado' LIMIT 1), 'VST-TRI-ARE-ML', 'AREIA', 'M/L', 1, true),
  ((SELECT id FROM products WHERE name = 'Vestido Trico Listrado' LIMIT 1), 'VST-TRI-BRA-ML', 'BRANCO', 'M/L', 1, true)
ON CONFLICT (sku) DO UPDATE SET stock_quantity = EXCLUDED.stock_quantity, color = EXCLUDED.color, size = EXCLUDED.size, is_active = EXCLUDED.is_active;

COMMIT;
