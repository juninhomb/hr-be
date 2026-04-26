#!/bin/bash

# =====================================================
# HR STORE DATABASE SETUP SCRIPT
# =====================================================
# Automates database creation and initialization
# Usage: bash database/setup.sh
# =====================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}   HR STORE DATABASE SETUP SCRIPT${NC}"
echo -e "${BLUE}========================================${NC}\n"

# Check if PostgreSQL is installed
if ! command -v psql &> /dev/null; then
    echo -e "${RED}❌ PostgreSQL is not installed${NC}"
    echo "Install with: apt-get install postgresql-client"
    exit 1
fi

# Load environment variables
if [ -f .env ]; then
    source .env
    echo -e "${GREEN}✅ Loaded .env file${NC}"
else
    echo -e "${RED}❌ .env file not found${NC}"
    exit 1
fi

# Extract connection details
DATABASE_URL=${DATABASE_URL:-"postgresql://evolution:suasenha_segura@localhost:5432/evolution_db"}
DB_HOST=$(echo $DATABASE_URL | sed -n 's/.*@\([^:]*\).*/\1/p')
DB_PORT=$(echo $DATABASE_URL | sed -n 's/.*:\([0-9]*\)\/.*$/\1/p')
DB_NAME=$(echo $DATABASE_URL | sed -n 's/.*\/\(.*\)$/\1/p')
DB_USER=$(echo $DATABASE_URL | sed -n 's/.*:\/\/\([^:]*\).*/\1/p')

echo -e "${BLUE}Database Configuration:${NC}"
echo "  Host: $DB_HOST"
echo "  Port: $DB_PORT"
echo "  Database: $DB_NAME"
echo "  User: $DB_USER\n"

# Check database connection
echo -e "${YELLOW}🔄 Checking database connection...${NC}"
if psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "SELECT 1" > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Connected to database${NC}\n"
else
    echo -e "${RED}❌ Cannot connect to database${NC}"
    exit 1
fi

# Menu
echo -e "${BLUE}Select an option:${NC}"
echo "1) Create schema (initialize all tables)"
echo "2) Backup database"
echo "3) Restore database"
echo "4) Drop all tables (CAREFUL!)"
echo "5) Show database stats"
echo "6) Exit"
echo ""
read -p "Enter choice [1-6]: " choice

case $choice in
    1)
        echo -e "${YELLOW}🔄 Creating schema...${NC}"
        if [ -f database/schema.sql ]; then
            psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f database/schema.sql
            echo -e "${GREEN}✅ Schema created successfully${NC}"
        else
            echo -e "${RED}❌ schema.sql not found${NC}"
            exit 1
        fi
        ;;
    2)
        echo -e "${YELLOW}🔄 Creating backup...${NC}"
        BACKUP_FILE="backup_$(date +%Y%m%d_%H%M%S).sql"
        pg_dump -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME > $BACKUP_FILE
        echo -e "${GREEN}✅ Backup created: $BACKUP_FILE${NC}"
        ;;
    3)
        echo -e "${YELLOW}🔄 Restore from backup${NC}"
        read -p "Enter backup file path: " backup_file
        if [ -f "$backup_file" ]; then
            echo -e "${RED}⚠️  This will overwrite the current database!${NC}"
            read -p "Continue? (yes/no): " confirm
            if [ "$confirm" = "yes" ]; then
                psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME < "$backup_file"
                echo -e "${GREEN}✅ Backup restored${NC}"
            else
                echo -e "${YELLOW}Cancelled${NC}"
            fi
        else
            echo -e "${RED}❌ File not found: $backup_file${NC}"
            exit 1
        fi
        ;;
    4)
        echo -e "${RED}⚠️  WARNING: This will drop all tables!${NC}"
        read -p "Are you sure? Type 'YES' to confirm: " confirm
        if [ "$confirm" = "YES" ]; then
            echo -e "${YELLOW}🔄 Dropping all tables...${NC}"
            psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME << EOF
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS product_variants CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS categories CASCADE;
EOF
            echo -e "${GREEN}✅ All tables dropped${NC}"
        else
            echo -e "${YELLOW}Cancelled${NC}"
        fi
        ;;
    5)
        echo -e "${YELLOW}📊 Database Statistics:${NC}\n"
        
        # Table counts
        echo "📋 Table Row Counts:"
        psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME << EOF
SELECT 'products' as table_name, COUNT(*) as rows FROM products
UNION ALL
SELECT 'product_variants', COUNT(*) FROM product_variants
UNION ALL
SELECT 'customers', COUNT(*) FROM customers
UNION ALL
SELECT 'orders', COUNT(*) FROM orders
UNION ALL
SELECT 'audit_logs', COUNT(*) FROM audit_logs;
EOF
        
        echo -e "\n📦 Database Size:"
        psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "SELECT pg_size_pretty(pg_database_size('$DB_NAME'));"
        
        echo -e "\n📊 Table Sizes:"
        psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME << EOF
SELECT 
  tablename,
  pg_size_pretty(pg_total_relation_size('public.' || tablename)) as size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size('public.' || tablename) DESC;
EOF
        ;;
    6)
        echo -e "${GREEN}✅ Goodbye!${NC}"
        exit 0
        ;;
    *)
        echo -e "${RED}❌ Invalid choice${NC}"
        exit 1
        ;;
esac

echo ""
echo -e "${GREEN}Done!${NC}"
