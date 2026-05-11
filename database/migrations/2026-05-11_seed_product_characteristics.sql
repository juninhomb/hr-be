-- Textos iniciais de «características» (ficha pública). Idempotente por nome.

BEGIN;

UPDATE products SET characteristics = 'Modelo bicolor com boa sustentação; forro interior confortável.' WHERE name = 'Biquíni Bicolor';
UPDATE products SET characteristics = 'Biquíni clássico em tecido de praia leve e confortável.' WHERE name = 'Biquíni Buzios';
UPDATE products SET characteristics = 'Padrão inspirado no olho grego; cortes e tamanhos regulares.' WHERE name = 'Biquíni Olho Grego';
UPDATE products SET characteristics = 'Blazer estruturado com gola alta e forro interior leve.' WHERE name = 'Blazer Gola Alta';
UPDATE products SET characteristics = 'Blusa em tecido fluido com detalhe em renda; fácil de combinar.' WHERE name = 'Blusa Básica Renda';
UPDATE products SET characteristics = 'Polo em malha tricotada; toque macio e caimento regular.' WHERE name = 'Blusa Polo Tricot';
UPDATE products SET characteristics = 'Blusa térmica para meia estação; ideal por baixo de casacos.' WHERE name = 'Blusa Térmica';
UPDATE products SET characteristics = 'Body ajustado com fecho e fivela decorativa.' WHERE name = 'Body com Fivela';
UPDATE products SET characteristics = 'Calça de linha clássica de alfaiataria; caimento elegante.' WHERE name = 'Calça Alfaiataria';
UPDATE products SET characteristics = 'Modelo com cinto; silhueta limpa e versátil.' WHERE name = 'Calça Alfaiataria com Cinto';
UPDATE products SET characteristics = 'Calça com pregas frontais; perna com volume controlado.' WHERE name = 'Calça Alfaiataria Pregas';
UPDATE products SET characteristics = 'Tecido em algodão; confortável para o dia a dia.' WHERE name = 'Calça Algodão';
UPDATE products SET characteristics = 'Denim resistente; corte clássico e numeração por tamanho.' WHERE name = 'Calça Jeans';
UPDATE products SET characteristics = 'Jeans com motivo floral; modelo com elasticidade moderada.' WHERE name = 'Calça Jeans Flor';
UPDATE products SET characteristics = 'Estampado de riscas; visual leve para office ou lazer.' WHERE name = 'Calça Listra';
UPDATE products SET characteristics = 'Estampado animal print; tecido com boa elasticidade.' WHERE name = 'Calça Onça';
UPDATE products SET characteristics = 'Sarja leve; alternativa elegante ao denim.' WHERE name = 'Calça Sarja';
UPDATE products SET characteristics = 'Camisa com riscas; abotoamento frontal clássico.' WHERE name = 'Camisa Listrada';
UPDATE products SET characteristics = 'Colete ajustado ao corpo; combina com camisas e blusas.' WHERE name = 'Colete';
UPDATE products SET characteristics = 'Conjunto em duas peças coordenadas; look completo e prático.' WHERE name = 'Conjunto Ayla';
UPDATE products SET characteristics = 'Conjunto em tecido fluido; linha Cleo versão 2.0.' WHERE name = 'Conjunto Cleo 2.0';
UPDATE products SET characteristics = 'Conjunto coordenado linha Ibiza 1.0; cortes clássicos.' WHERE name = 'Conjunto Ibiza 1.0';
UPDATE products SET characteristics = 'Conjunto coordenado linha Ibiza 2.0; detalhes e acabamentos actualizados.' WHERE name = 'Conjunto Ibiza 2.0';
UPDATE products SET characteristics = 'Conjunto estruturado em tecido premium; silhueta marcada.' WHERE name = 'Conjunto Ísis';
UPDATE products SET characteristics = 'Duas peças coordenadas modelo Lara; conforto e estilo.' WHERE name = 'Conjunto Lara';
UPDATE products SET characteristics = 'Conjunto leve em tecido arejado; ideal para temperaturas altas.' WHERE name = 'Conjunto Lia';
UPDATE products SET characteristics = 'Conjunto modelo Liz com acabamento cuidado e caimento regular.' WHERE name = 'Conjunto Liz';
UPDATE products SET characteristics = 'Conjunto coordenado Mari; versátil para várias ocasiões.' WHERE name = 'Conjunto Mari';
UPDATE products SET characteristics = 'Conjunto em malha tricotada; inspiração linha Siena.' WHERE name = 'Conjunto Trico Siena';
UPDATE products SET characteristics = 'Lenço estampado tipo foulard; leve e fácil de amarrar.' WHERE name = 'Lenço Floresta';
UPDATE products SET characteristics = 'Macacão com linhas inspiradas em alfaiataria; uma peça só.' WHERE name = 'Macacão Alfaiataria';
UPDATE products SET characteristics = 'Macacão fluido modelo Jade; aviamentos e acabamentos cuidados.' WHERE name = 'Macacão Jade';
UPDATE products SET characteristics = 'Maiô de uma peça; boa cobertura para praia ou piscina.' WHERE name = 'Maio';
UPDATE products SET characteristics = 'Short com construção minimalista; conforto em movimento.' WHERE name = 'Short Sem Costura';
UPDATE products SET characteristics = 'Vestido com corte marcado e tecido com excelente queda.' WHERE name = 'Vestido Atena';
UPDATE products SET characteristics = 'Modelo Bia; silhueta feminina e uso versátil.' WHERE name = 'Vestido Bia';
UPDATE products SET characteristics = 'Vestido leve Mavie; ideal para tardes e eventos descontraídos.' WHERE name = 'Vestido Mavie';
UPDATE products SET characteristics = 'Vestido modelo Tali; linhas limpas e modernas.' WHERE name = 'Vestido Tali';
UPDATE products SET characteristics = 'Vestido em malha com riscas; toque suave e elasticidade.' WHERE name = 'Vestido Trico Listrado';

COMMIT;
