#!/usr/bin/env bash
# Cria role + base dedicadas ao DEV local no teu PostgreSQL já instalado.
# Não usa Docker.
#
# Liga como superuser ao DB de manutenção `postgres` (ajusta se o teu cluster usar outro nome).
# Exemplos:
#   export PGADMIN_URL='postgresql://postgres@127.0.0.1:5432/postgres'
#   export PGADMIN_URL='postgresql://postgres:senha@127.0.0.1:5432/postgres'
#   # Homebrew em macOS (muitas vezes o teu utilizador OS tem superuser local):
#   export PGADMIN_URL="postgresql://$(whoami)@127.0.0.1:5432/postgres"
#
# Opcional (nomes/senha — alinha com DATABASE_URL no .env):
#   HRSTORE_DEV_DB_USER=hrstore_dev HRSTORE_DEV_DB_NAME=hrstore_dev HRSTORE_DEV_DB_PASSWORD=...
#
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

DB_USER="${HRSTORE_DEV_DB_USER:-hrstore_dev}"
DB_NAME="${HRSTORE_DEV_DB_NAME:-hrstore_dev}"
DB_PASS="${HRSTORE_DEV_DB_PASSWORD:-dev_local_change_me}"

if [[ ! "$DB_USER" =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ ]] || [[ ! "$DB_NAME" =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ ]]; then
  echo "HRSTORE_DEV_DB_USER / HRSTORE_DEV_DB_NAME: só letras, números e underscore; primeiro char letra ou _."
  exit 1
fi
case "$DB_PASS" in *\'*) echo "HRSTORE_DEV_DB_PASSWORD não pode conter apóstrofo (')."; exit 1;; esac

if [[ -z "${PGADMIN_URL:-}" ]]; then
  PGADMIN_URL="postgresql://$(whoami)@127.0.0.1:5432/postgres"
  echo "PGADMIN_URL não definido — a usar: ${PGADMIN_URL}"
  echo "(Define PGADMIN_URL se precisares de outro utilizador/senha/host.)"
fi

psql "$PGADMIN_URL" -v ON_ERROR_STOP=1 <<EOSQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${DB_USER}') THEN
    EXECUTE format('CREATE ROLE %I LOGIN PASSWORD %L', '${DB_USER}', '${DB_PASS}');
  END IF;
END
\$\$;
EOSQL

if ! psql "$PGADMIN_URL" -Atqc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1; then
  psql "$PGADMIN_URL" -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"${DB_NAME}\" OWNER \"${DB_USER}\";"
  echo "Base \"${DB_NAME}\" criada."
else
  echo "Base \"${DB_NAME}\" já existia — nada a fazer."
fi

echo "DATABASE_URL sugerida (copiar para .env):"
echo "postgresql://${DB_USER}:${DB_PASS}@127.0.0.1:5432/${DB_NAME}"
echo "Seguinte passo: npm run db:bootstrap"
