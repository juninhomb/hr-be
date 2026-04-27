# 🚀 Executar Migração em Produção

## Resumo das Mudanças (2026-04-27)

- ✅ Adicionada coluna `address` em `customers`
- ✅ Criada tabela `order_items` com rastreamento de itens
- ✅ Criados índices para performance
- ✅ **Script é idempotente** — seguro rodar múltiplas vezes

---

## 📝 Passo 1: Preparar a String de Conexão

Você precisa da string de conexão de **produção**. Exemplo:

```bash
postgresql://usuario:senha@host-producao.com:5432/evolution_db_prod
```

---

## 🎯 Passo 2: Executar a Migração

### Opção A: Usando o script helper (Recomendado)

```bash
# Navigate ao diretório do projeto
cd /root/hrstore-backend

# Executar com a string de conexão
bash database/run-migration.sh \
  database/migrations/2026-04-27_add-address-and-order-items.sql \
  "postgresql://usuario:senha@host:5432/evolution_db_prod"
```

### Opção B: Executar direto com psql

```bash
psql "postgresql://usuario:senha@host:5432/evolution_db_prod" \
  -f database/migrations/2026-04-27_add-address-and-order-items.sql
```

### Opção C: Com variável de ambiente

```bash
export DATABASE_URL="postgresql://usuario:senha@host:5432/evolution_db_prod"
bash database/run-migration.sh
```

---

## ✅ Validar Execução

Após a migração, execute:

```bash
psql "postgresql://usuario:senha@host:5432/evolution_db_prod" -c "
  SELECT
    (SELECT COUNT(*) FROM information_schema.columns
      WHERE table_name='customers' AND column_name='address') AS address_ok,
    (SELECT COUNT(*) FROM information_schema.tables
      WHERE table_name='order_items') AS order_items_ok,
    (SELECT COUNT(*) FROM information_schema.statistics
      WHERE tablename='order_items') AS indexes_ok;
"
```

**Resultado esperado**: `1 | 1 | 2` ✅

---

## 🔄 Rollback (Se necessário)

Como o script usa `DO $$` block e `CREATE TABLE IF NOT EXISTS`, é seguro rodar novamente.

Se precisar reverter:

```sql
ALTER TABLE customers DROP COLUMN address;
DROP TABLE IF EXISTS order_items CASCADE;
```

---

## 📋 Checklist

- [ ] String de conexão de produção confirmada
- [ ] Backup do banco de dados feito
- [ ] Script de migração revisto
- [ ] Migração executada
- [ ] Validação confirmada ✅
- [ ] Código push'd com sucesso
