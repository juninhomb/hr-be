--
-- PostgreSQL database dump
--

\restrict HIafmh0o40dimd4i18y0pB37kESPYvaXAnnzAH07Qc5GQt9dONKbZcfhnuK4HY5

-- Dumped from database version 15.17 (Debian 15.17-1.pgdg13+1)
-- Dumped by pg_dump version 15.17 (Debian 15.17-1.pgdg13+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: products; Type: TABLE DATA; Schema: public; Owner: evolution
--

COPY public.products (id, category_id, name, description, base_price, image_placeholder_url, is_active, created_at, is_featured) FROM stdin;
5	5	Vestido Ana	Leveza e frescura num design minimalista.	25.00	/uploads/products/placeholder.svg	t	2026-04-27 17:26:26.883583	f
11	5	Vestido Renda Costas	Detalhes românticos para momentos especiais.	49.00	/uploads/products/placeholder.svg	t	2026-04-27 17:26:26.883583	f
16	5	Vestido Poa	O charme eterno das bolinhas.	22.00	/uploads/products/placeholder.svg	t	2026-04-27 17:26:26.883583	f
17	5	Vestido Mavie	Estilo navy moderno e sofisticado.	18.00	/uploads/products/placeholder.svg	t	2026-04-27 17:26:26.883583	f
26	5	Vestido Tali	Cores vibrantes num corte estiloso.	37.00	/uploads/products/placeholder.svg	t	2026-04-27 17:26:26.883583	f
31	5	Vestido Bia	Cores da estação num design versátil.	23.00	/uploads/products/placeholder.svg	t	2026-04-27 17:26:26.883583	f
9	4	Conjunto Lia	Conjunto coordenado para um visual moderno.	25.00	/uploads/products/placeholder.svg	t	2026-04-27 17:26:26.883583	f
10	4	Conjunto Cleo 2.0	Renovação do clássico com detalhes atuais.	27.00	/uploads/products/placeholder.svg	t	2026-04-27 17:26:26.883583	f
12	4	Conjunto Liz	Textura e cor em sintonia marcante.	38.00	/uploads/products/placeholder.svg	t	2026-04-27 17:26:26.883583	f
24	4	Conjunto Ayla	Leveza e cor num conjunto vibrante.	23.00	/uploads/products/placeholder.svg	t	2026-04-27 17:26:26.883583	f
25	4	Conjunto Trico Siena	Textura acolhedora em tricot de alta qualidade.	24.00	/uploads/products/placeholder.svg	t	2026-04-27 17:26:26.883583	f
27	4	Conjunto Ibiza 2.0	A essência do verão num conjunto fresco.	37.00	/uploads/products/placeholder.svg	t	2026-04-27 17:26:26.883583	f
8	7	Macacão Jade	Peça única que une estilo e praticidade.	28.00	/uploads/products/placeholder.svg	t	2026-04-27 17:26:26.883583	f
18	9	Biquíni Olho Grego	Estilo para os teus dias de sol.	30.00	/uploads/products/placeholder.svg	t	2026-04-27 17:26:26.883583	f
20	9	Maio	Elegância à beira-mar que valoriza a silhueta.	30.00	/uploads/products/placeholder.svg	t	2026-04-27 17:26:26.883583	f
1	1	Body Manga Longa	Essencial e elegante, perfeito para dias frescos.	8.00	/uploads/products/placeholder.svg	t	2026-04-27 17:26:26.883583	f
4	1	Body Gola Alta	Sofisticação clássica para looks de inverno.	7.00	/uploads/products/placeholder.svg	t	2026-04-27 17:26:26.883583	f
28	1	Body com Fivela	Design moderno com detalhe marcante.	13.00	/uploads/products/placeholder.svg	t	2026-04-27 17:26:26.883583	f
6	3	Calça Alfaiataria com Cinto	Corte clássico com detalhe de cinto incluído.	19.00	/uploads/products/placeholder.svg	t	2026-04-27 17:26:26.883583	f
7	3	Calça Alfaiataria	Peça versátil para um guarda-roupa inteligente.	21.00	/uploads/products/placeholder.svg	t	2026-04-27 17:26:26.883583	f
30	4	Conjunto Lara	Sofisticação e conforto diário.	10.00	/uploads/products/placeholder.svg	t	2026-04-27 17:26:26.883583	f
3	5	Vestido Atena	Corte impecável e fluido, digno de uma deusa.	35.00	/uploads/products/placeholder.svg	t	2026-04-27 17:26:26.883583	f
21	9	Biquíni Bicolor	Contraste moderno para o verão.	30.00	/uploads/products/placeholder.svg	f	2026-04-27 17:26:26.883583	t
19	9	Biquíni Búzios	Inspirado na praia, perfeito para o verão.	30.00	/uploads/products/placeholder.svg	t	2026-04-27 17:26:26.883583	f
15	3	Calça Alfaiataria Pregas	Detalhe de pregas que alonga a silhueta.	17.00	/uploads/products/placeholder.svg	t	2026-04-27 17:26:26.883583	f
22	3	Calça Alfaiataria Paris	Corte europeu sofisticado.	17.00	/uploads/products/placeholder.svg	t	2026-04-27 17:26:26.883583	f
23	3	Calça Jeans	O básico indispensável com ajuste perfeito.	22.00	/uploads/products/placeholder.svg	t	2026-04-27 17:26:26.883583	f
32	3	Calça Sarja	Conforto e resistência para o dia a dia.	23.00	/uploads/products/placeholder.svg	t	2026-04-27 17:26:26.883583	f
29	6	Short Sem Costura	Liberdade de movimentos com acabamento invisível.	5.00	/uploads/products/placeholder.svg	t	2026-04-27 17:26:26.883583	f
2	2	Blusa Térmica	Conforto térmico com ajuste perfeito ao corpo.	7.00	/uploads/products/placeholder.svg	t	2026-04-27 17:26:26.883583	f
13	8	Lenço Floresta	Acessório versátil com estampa de natureza.	4.00	/uploads/products/placeholder.svg	t	2026-04-27 17:26:26.883583	f
14	8	Lenço Onça	Toque animal print para dar personalidade.	4.00	/uploads/products/placeholder.svg	t	2026-04-27 17:26:26.883583	f
\.


--
-- Data for Name: product_variants; Type: TABLE DATA; Schema: public; Owner: evolution
--

COPY public.product_variants (id, product_id, sku, color, size, stock_quantity, created_at, image_url, is_active) FROM stdin;
7	4	BD-GOL-ROS-U	ROSA	U	1	2026-04-27 17:26:45.408583	\N	t
8	5	VST-ANA-CAS-S	CASTANHO	S	1	2026-04-27 17:26:45.408583	\N	t
10	6	CAL-CIN-OFF-U	OFF WHITE	U	2	2026-04-27 17:26:45.408583	\N	t
11	7	CAL-ALF-CAS-S	CASTANHO	S	2	2026-04-27 17:26:45.408583	\N	t
12	7	CAL-ALF-CAS-M	CASTANHO	M	1	2026-04-27 17:26:45.408583	\N	t
13	8	MAC-JAD-OFF-LXL	OFF WHITE	L/XL	1	2026-04-27 17:26:45.408583	\N	t
14	8	MAC-JAD-CAS-SM	CASTANHO	S/M	1	2026-04-27 17:26:45.408583	\N	t
15	9	CON-LIA-ARE-SM	AREIA	S/M	1	2026-04-27 17:26:45.408583	\N	t
16	9	CON-LIA-ARE-LXL	AREIA	L/XL	1	2026-04-27 17:26:45.408583	\N	t
17	10	CON-CLE-BRA-U	BRANCO	U	1	2026-04-27 17:26:45.408583	\N	t
18	10	CON-CLE-CAS-U	CASTANHO	U	1	2026-04-27 17:26:45.408583	\N	t
19	11	VST-REN-BRA-U	BRANCO	U	1	2026-04-27 17:26:45.408583	\N	t
20	12	CON-LIZ-TER-S	TERRACOTA	S	1	2026-04-27 17:26:45.408583	\N	t
21	12	CON-LIZ-TER-M	TERRACOTA	M	1	2026-04-27 17:26:45.408583	\N	t
23	13	LEN-FLO-AZU-U	AZUL	-	2	2026-04-27 17:26:45.408583	\N	t
24	13	LEN-FLO-BEG-U	BEGE	-	1	2026-04-27 17:26:45.408583	\N	t
25	13	LEN-FLO-CIN-U	CINZA	-	4	2026-04-27 17:26:45.408583	\N	t
26	13	LEN-FLO-ROS-U	ROSA	-	4	2026-04-27 17:26:45.408583	\N	t
27	14	LEN-ONC-BEG-U	BEGE	-	2	2026-04-27 17:26:45.408583	\N	t
28	15	CAL-PRE-BOR-L	BORDO	L	1	2026-04-27 17:26:45.408583	\N	t
30	17	VST-MAV-ARE-U	AREIA	U	1	2026-04-27 17:26:45.408583	\N	t
37	20	MAI-CER-G	CEREJA	G	1	2026-04-27 17:26:45.408583	\N	t
38	20	MAI-PRE-G	PRETO	G	1	2026-04-27 17:26:45.408583	\N	t
45	23	CAL-JEA-44	JEANS	44	2	2026-04-27 17:26:45.408583	\N	t
46	23	CAL-JEA-46	JEANS	46	1	2026-04-27 17:26:45.408583	\N	t
48	24	CON-AYL-ROS-U	ROSA	U	1	2026-04-27 17:26:45.408583	\N	t
49	24	CON-AYL-AMA-U	AMARELO	U	2	2026-04-27 17:26:45.408583	\N	t
50	24	CON-AYL-CAF-U	CAFE	U	1	2026-04-27 17:26:45.408583	\N	t
52	25	CON-SIE-PRE-U	PRETO	U	1	2026-04-27 17:26:45.408583	\N	t
54	26	VST-TAL-ROS-U	ROSA	U	1	2026-04-27 17:26:45.408583	\N	t
55	26	VST-TAL-AMA-U	AMARELO	U	2	2026-04-27 17:26:45.408583	\N	t
56	26	VST-TAL-PRE-U	PRETO	U	2	2026-04-27 17:26:45.408583	\N	t
68	29	SHO-SEM-MAR-LXL	MARFIM	L/XL	5	2026-04-27 17:26:45.408583	\N	t
69	29	SHO-SEM-BEG-SM	BEGE	S/M	2	2026-04-27 17:26:45.408583	\N	t
70	29	SHO-SEM-BEG-LXL	BEGE	L/XL	6	2026-04-27 17:26:45.408583	\N	t
72	29	SHO-SEM-PRE-LXL	PRETO	L/XL	5	2026-04-27 17:26:45.408583	\N	t
75	30	CON-LAR-PRE-U	PRETO	U	2	2026-04-27 17:26:45.408583	\N	t
79	31	VST-BIA-CAS-U	CASTANHO	U	3	2026-04-27 17:26:45.408583	\N	t
85	32	CAL-SAR-46	SARJA	46	1	2026-04-27 17:26:45.408583	\N	t
31	17	VST-MAV-MAR-U	MARINHO	U	1	2026-04-27 17:26:45.408583	\N	t
77	31	VST-BIA-ROS-U	ROSA	U	2	2026-04-27 17:26:45.408583	\N	t
2	2	BLU-TER-AZU-M	AZUL	M	2	2026-04-27 17:26:45.408583	\N	t
65	28	BD-FIV-PRE-U	PRETO	U	3	2026-04-27 17:26:45.408583	\N	t
9	5	VST-ANA-CAS-L	CASTANHO	L	1	2026-04-27 17:26:45.408583	\N	t
76	31	VST-BIA-MAR-U	AZUL MARINHO	U	2	2026-04-27 17:26:45.408583	\N	t
32	18	BIQ-OLH-AMA-M	AMARELO	M	1	2026-04-27 17:26:45.408583	\N	t
42	23	CAL-JEA-38	JEANS	38	2	2026-04-27 17:26:45.408583	\N	t
1	1	BD-MAN-CIN-SM	CINZA	S/M	1	2026-04-27 17:26:45.408583	\N	t
84	32	CAL-SAR-44	SARJA	44	1	2026-04-27 17:26:45.408583	\N	t
71	29	SHO-SEM-PRE-SM	PRETO	S/M	4	2026-04-27 17:26:45.408583	\N	t
51	25	CON-SIE-AZU-U	AZUL	U	2	2026-04-27 17:26:45.408583	\N	t
62	27	CON-IBI-MAR-U	AZUL marinho	U	0	2026-04-27 17:26:45.408583	\N	f
22	13	LEN-FLO-PRE-U	PRETO	-	5	2026-04-27 17:26:45.408583	\N	t
82	32	CAL-SAR-40	SARJA	40	1	2026-04-27 17:26:45.408583	\N	t
43	23	CAL-JEA-40	JEANS	40	2	2026-04-27 17:26:45.408583	\N	t
53	26	VST-TAL-CAF-U	CAFE	U	3	2026-04-27 17:26:45.408583	\N	t
61	27	CON-IBI-PRE-U	PRETO	U	0	2026-04-27 17:26:45.408583	\N	f
44	23	CAL-JEA-42	JEANS	42	1	2026-04-27 17:26:45.408583	\N	t
57	27	CON-IBI-ROS-U	ROSA	U	0	2026-04-27 17:26:45.408583	\N	f
64	28	BD-FIV-CAF-U	CAFE	U	1	2026-04-27 17:26:45.408583	\N	t
3	2	BLU-TER-PRE-M	PRETA	M	3	2026-04-27 17:26:45.408583	\N	t
34	19	BIQ-BUZ-OFF-P	OFF WHITE	P	5	2026-04-27 17:26:45.408583	\N	t
81	32	CAL-SAR-38	SARJA	38	1	2026-04-27 17:26:45.408583	\N	t
47	24	CON-AYL-BRA-U	BRANCO	U	2	2026-04-27 17:26:45.408583	\N	t
87	31	VES-BIA-AMA-U	AMARELO	U	8	2026-05-11 12:49:45.781337	\N	t
6	3	VST-ATE-CAS-M	CASTANHO	M	10	2026-04-27 17:26:45.408583	\N	t
39	21	BIQ-BIC-PRE-P	PRETO	P	1	2026-04-27 17:26:45.408583	\N	t
74	30	CON-LAR-BRA-U	BRANCO	U	1	2026-04-27 17:26:45.408583	\N	t
63	28	BD-FIV-BEG-U	BEGE	U	0	2026-04-27 17:26:45.408583	\N	f
73	30	CON-LAR-AZU-U	AZUL	U	1	2026-04-27 17:26:45.408583	\N	t
5	3	VST-ATE-OFF-S	OFF WHITE	S	10	2026-04-27 17:26:45.408583	\N	t
58	27	CON-IBI-AZU-U	AZUL	U	2	2026-04-27 17:26:45.408583	\N	t
40	21	BIQ-BIC-CAS-M	CASTANHO	M	1	2026-04-27 17:26:45.408583	\N	t
78	31	VST-BIA-OLI-U	OLIVA	U	2	2026-04-27 17:26:45.408583	\N	t
59	27	CON-IBI-ARE-U	AREIA	U	0	2026-04-27 17:26:45.408583	\N	f
33	18	BIQ-OLH-AMA-G	AMARELO	G	1	2026-04-27 17:26:45.408583	\N	t
60	27	CON-IBI-CAS-U	CASTANHO	U	0	2026-04-27 17:26:45.408583	\N	f
4	3	VST-ATE-PRE-L	PRETO	L	10	2026-04-27 17:26:45.408583	\N	t
29	16	VST-POA-BRA-U	BRANCO	U	2	2026-04-27 17:26:45.408583	\N	t
41	22	CAL-PAR-CAS-S	CASTANHO	S	1	2026-04-27 17:26:45.408583	\N	t
83	32	CAL-SAR-42	SARJA	42	1	2026-04-27 17:26:45.408583	\N	t
36	19	BIQ-BUZ-VER-P	VERDE	P	1	2026-04-27 17:26:45.408583	\N	t
67	29	SHO-SEM-MAR-SM	MARFIM	S/M	2	2026-04-27 17:26:45.408583	\N	t
80	32	CAL-SAR-34	SARJA	34	1	2026-04-27 17:26:45.408583	\N	t
35	19	BIQ-BUZ-CAS-P	CASTANHO	P	1	2026-04-27 17:26:45.408583	\N	f
66	28	BD-FIV-BRA-U	BRANCO	U	3	2026-04-27 17:26:45.408583	\N	t
\.


--
-- Name: product_variants_id_seq; Type: SEQUENCE SET; Schema: public; Owner: evolution
--

SELECT pg_catalog.setval('public.product_variants_id_seq', 87, true);


--
-- Name: products_id_seq; Type: SEQUENCE SET; Schema: public; Owner: evolution
--

SELECT pg_catalog.setval('public.products_id_seq', 2, true);


--
-- PostgreSQL database dump complete
--

\unrestrict HIafmh0o40dimd4i18y0pB37kESPYvaXAnnzAH07Qc5GQt9dONKbZcfhnuK4HY5

