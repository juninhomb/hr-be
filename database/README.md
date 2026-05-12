# 📁 Database Directory

Esta pasta contém toda a documentação, scripts SQL e referências para o banco de dados do HR Store.

## 📂 Arquivos

### 1. **schema.sql** 
Script completo de criação do banco de dados.

**Conteúdo**:
- ✅ Todas as 5 tabelas principais (products, product_variants, customers, orders, audit_logs)
- ✅ Índices otimizados
- ✅ Foreign keys com integridade referencial
- ✅ Views úteis para queries comuns
- ✅ Constraints (UNIQUE, CHECK, NOT NULL)

**Como usar**:

```bash
# Criar o banco completo do zero
psql evolution_db < database/schema.sql

# Ou aplicar o schema a um banco existente
psql -U evolution -d evolution_db -f database/schema.sql
```

---

### 2. **DATABASE.md**
Documentação completa e detalhada do banco de dados.

**Conteúdo**:
- 📖 Descrição de cada tabela e coluna
- 🔗 Relacionamentos (ERD - Entity Relationship Diagram)
- 📊 Índices e estratégia de performance
- 🔐 Constraints e integridade de dados
- 📈 Views para análises
- 💾 Backup e recovery procedures
- 🔍 Queries comuns e exemplos
- ⚡ Troubleshooting

**Leia este arquivo para entender**:
- A estrutura completa do banco
- Como as tabelas se relacionam
- Quais colunas existem e por quê
- Padrões de dados

---

### 3. **queries.sql**
Coleção de 32 queries SQL prontas para usar.

**Categorias**:
- 📊 Dashboard & Analytics (3 queries)
- 🛍️ Inventory Management (5 queries)
- 💳 Order Management (4 queries)
- 👥 Customer Management (4 queries)
- 📝 Audit & Compliance (4 queries)
- 🎯 Analytics & Reporting (4 queries)
- 🔧 Maintenance (4 queries)

**Como usar**:

```bash
# Executar uma query específica
psql evolution_db -c "
SELECT 
  COUNT(*) as total_orders,
  SUM(total_amount) as total_revenue
FROM orders
WHERE DATE(created_at) = CURRENT_DATE;
"

# Ou via arquivo
psql evolution_db -f database/queries.sql
```

---

## 🚀 Quick Start

### 0. **PostgreSQL local (DEV) — instância nova no servidor que já tens**
Na raiz do backend (`hr-be`), com `psql` no PATH e permissões de superuser no cluster local:

```bash
export PGADMIN_URL='postgresql://postgres@127.0.0.1:5432/postgres'   # ou o teu admin
npm run db:create-local    # cria role + base hrstore_dev (configurável por env)
npm run db:bootstrap       # schema.sql + database/migrations/*.sql
npm run db:verify          # confirma tabelas/colunas que o backend usa
```

Detalhes: `scripts/db-create-local-dev.sh`. A `DATABASE_URL` de exemplo está em `.env.example`.

### 1. **Criar o banco do zero**
```bash
cd /root/hrstore-backend
psql evolution_db < database/schema.sql
```

### 2. **Verificar as tabelas criadas**
```bash
psql evolution_db -c "\dt"
```

### 3. **Ver o schema de uma tabela**
```bash
psql evolution_db -c "\d customers"
```

### 4. **Executar uma query de exemplo**
```bash
psql evolution_db -c "SELECT COUNT(*) FROM customers;"
```

---

## 🗂️ Estrutura Lógica

```
HR STORE DATABASE (evolution_db)
│
├── PRODUCTS CATALOG
│   ├── products (base products)
│   ├── product_variants (colors × sizes)
│   └── categories (organization)
│
├── CUSTOMER MANAGEMENT (CRM)
│   └── customers (WhatsApp-based CRM)
│
├── ORDER PROCESSING
│   └── orders (purchases & payments)
│
└── COMPLIANCE
    └── audit_logs (action tracking)
```

---

## 📊 Tabelas Principais

| Tabela | Linhas | Propósito |
|--------|--------|----------|
| `products` | ~20 | Produtos base (camisetas, calças, etc) |
| `product_variants` | ~78 | Combinações (cor × tamanho × SKU) |
| `customers` | ~100-1000 | CRM de clientes WhatsApp |
| `orders` | ~500-5000 | Histórico de pedidos |
| `audit_logs` | ~10000+ | Rastreamento de ações admin |

---

## 🔑 Chaves Importantes

### Primary Keys (IDs)
- Todas as tabelas têm `id SERIAL PRIMARY KEY`
- Auto-incrementado ao inserir

### Unique Identifiers (para negócio)
- **Produtos**: `sku` (e.g., `TEE-BLACK-M`)
- **Clientes**: `whatsapp_number` (e.g., `+351912345678`)
- **Categorias**: `name`

### Foreign Keys (Relacionamentos)
```
products ← category_id → categories
product_variants ← product_id → products
orders ← customer_id → customers
```

---

## 🎯 Queries Mais Úteis

### 📊 Dashboard Hoje
```sql
SELECT 
  COUNT(*) as total_orders,
  SUM(total_amount) as revenue
FROM orders
WHERE DATE(created_at) = CURRENT_DATE;
```

### 🔴 Produtos Sem Stock
```sql
SELECT p.name, pv.sku, pv.stock_quantity
FROM product_variants pv
JOIN products p ON pv.product_id = p.id
WHERE pv.stock_quantity = 0;
```

### 💰 Top 10 Clientes
```sql
SELECT c.full_name, c.whatsapp_number, SUM(o.total_amount)
FROM customers c
LEFT JOIN orders o ON c.id = o.customer_id
GROUP BY c.id
ORDER BY SUM(o.total_amount) DESC
LIMIT 10;
```

### ⏳ Pedidos Pendentes
```sql
SELECT o.id, c.whatsapp_number, o.total_amount, o.created_at
FROM orders o
LEFT JOIN customers c ON o.customer_id = c.id
WHERE o.status = 'aguardando_pagamento'
ORDER BY o.created_at ASC;
```

---

## 📋 Checklist de Manutenção

- [ ] Backup diário: `pg_dump evolution_db > backup.sql`
- [ ] Verificar espaço em disco: `du -sh /var/lib/postgresql`
- [ ] Analisar índices: `ANALYZE;`
- [ ] Limpar registros antigos: `VACUUM;`
- [ ] Monitorar conexões: `psql evolution_db -c "SELECT count(*) FROM pg_stat_activity;"`

---

## 🔐 Backup & Recovery

### Backup Rápido
```bash
pg_dump evolution_db > backup_$(date +%Y%m%d).sql
```

### Restore Rápido
```bash
psql evolution_db < backup_20260426.sql
```

### Backup Específico (apenas tabela de pedidos)
```bash
pg_dump evolution_db -t orders > orders_backup.sql
```

---

## 📞 Connections & Access

**Connection String**: 
```
postgresql://evolution:suasenha_segura@localhost:5432/evolution_db
```

**Via CLI**:
```bash
psql evolution_db
psql -U evolution -d evolution_db -h localhost
```

---

## ✅ Validação

Após criar o schema, verificar:

```sql
-- Verificar tabelas criadas
SELECT tablename FROM pg_catalog.pg_tables 
WHERE schemaname = 'public';

-- Verificar índices
SELECT indexname FROM pg_indexes 
WHERE schemaname = 'public';

-- Verificar views
SELECT viewname FROM pg_views 
WHERE schemaname = 'public';
```

---

## 🐛 Troubleshooting

### Erro: "table already exists"
```bash
# Dropar e recriar
psql evolution_db -c "DROP TABLE IF EXISTS customers CASCADE;"
psql evolution_db < database/schema.sql
```

### Erro: "column does not exist"
```bash
# Verificar schema
psql evolution_db -c "\d customers"
```

### Performance Lento?
```bash
# Analisar tabelas
ANALYZE;

-- Ver índices não usados
SELECT * FROM pg_stat_user_indexes 
WHERE idx_scan = 0;
```

---

## 📚 Recursos

- [PostgreSQL Docs](https://www.postgresql.org/docs/)
- [SQL Cheat Sheet](https://www.postgresql.org/docs/current/sql-syntax.html)
- Database.md - Documentação completa
- queries.sql - Exemplos prontos

---

**Última atualização**: 26 de abril de 2026  
**Versão**: 1.0  
**Status**: Production Ready
