#!/usr/bin/env bash
# Aplica migrações pendentes na evolution_db (container db_evolution).
# Uso: bash scripts/apply-migrations-docker.sh
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

CONTAINER="${DB_CONTAINER:-db_evolution}"
DB_USER="${DB_USER:-evolution}"
DB_NAME="${DB_NAME:-evolution_db}"

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "Container PostgreSQL não encontrado: $CONTAINER"
  exit 1
fi

shopt -s nullglob
files=(database/migrations/*.sql)
IFS=$'\n' sorted=($(printf '%s\n' "${files[@]}" | sort))

for f in "${sorted[@]}"; do
  echo "→ $(basename "$f")"
  docker exec -i "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 < "$f"
done

echo ""
echo "Verificação rápida:"
docker exec "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -c "
SELECT
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'product_images') AS product_images,
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'variant_images') AS variant_images,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'parent_order_id') AS orders_troca;
"

echo "OK — migrações aplicadas em $CONTAINER/$DB_NAME"
