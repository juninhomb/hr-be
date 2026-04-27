#!/bin/bash

# =====================================================
# HR STORE — Migration Runner
# Executa migrations de forma segura contra qualquer banco de dados
# =====================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}   HR STORE MIGRATION RUNNER${NC}"
echo -e "${BLUE}========================================${NC}\n"

# Parâmetros
MIGRATION_FILE="${1:-database/migrations/2026-04-27_add-address-and-order-items.sql}"
DATABASE_URL="${2:-$DATABASE_URL}"

# Validações
if [ -z "$DATABASE_URL" ]; then
    echo -e "${RED}❌ DATABASE_URL não configurada${NC}"
    echo ""
    echo "Opções de uso:"
    echo "  1. Passar como argumento:"
    echo "     bash database/run-migration.sh <migration-file> <database-url>"
    echo ""
    echo "  2. Ou configurar variável de ambiente:"
    echo "     export DATABASE_URL='postgresql://user:pass@host:port/db'"
    echo "     bash database/run-migration.sh"
    echo ""
    exit 1
fi

if [ ! -f "$MIGRATION_FILE" ]; then
    echo -e "${RED}❌ Arquivo de migração não encontrado: $MIGRATION_FILE${NC}"
    exit 1
fi

# Extrair informações de conexão
DB_NAME=$(echo $DATABASE_URL | sed -n 's/.*\/\(.*\)$/\1/p')
DB_HOST=$(echo $DATABASE_URL | sed -n 's/.*@\([^:]*\).*/\1/p')
DB_PORT=$(echo $DATABASE_URL | sed -n 's/.*:\([0-9]*\)\/.*$/\1/p')
DB_USER=$(echo $DATABASE_URL | sed -n 's/.*:\/\/\([^:]*\).*/\1/p')

echo -e "${BLUE}Detalhes da Conexão:${NC}"
echo "  Host: $DB_HOST"
echo "  Porta: $DB_PORT"
echo "  Database: $DB_NAME"
echo "  Usuário: $DB_USER"
echo "  Migration: $MIGRATION_FILE"
echo ""

# Verificar conexão
echo -e "${YELLOW}🔄 Testando conexão...${NC}"
if ! PGPASSWORD="${DATABASE_URL#*://}" psql "$DATABASE_URL" -c "SELECT version();" > /dev/null 2>&1; then
    echo -e "${RED}❌ Falha ao conectar ao banco de dados${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Conexão OK${NC}\n"

# Confirmar execução
echo -e "${YELLOW}⚠️  Esta ação vai executar a migração no banco de dados!${NC}"
read -p "Deseja continuar? (s/n): " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Ss]$ ]]; then
    echo -e "${YELLOW}Operação cancelada${NC}"
    exit 0
fi

# Executar migração
echo -e "${YELLOW}🔄 Executando migração...${NC}"
psql "$DATABASE_URL" -f "$MIGRATION_FILE" 2>&1

if [ $? -eq 0 ]; then
    echo -e "\n${GREEN}✅ Migração executada com sucesso!${NC}"
else
    echo -e "\n${RED}❌ Erro ao executar migração${NC}"
    exit 1
fi
