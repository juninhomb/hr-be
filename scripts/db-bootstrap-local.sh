#!/usr/bin/env bash
# Aplica database/schema.sql e todos os ficheiros em database/migrations/*.sql por ordem.
# Requer `psql` no PATH (brew install libpq / Postgres.app / cliente do Docker).
#
# Usa DATABASE_URL se estiver definida; senão o default alinha com scripts/db-create-local-dev.sh
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

URL="${DATABASE_URL:-postgresql://hrstore_dev:dev_local_change_me@127.0.0.1:5432/hrstore_dev}"

echo "→ schema.sql"
psql "$URL" -v ON_ERROR_STOP=1 -f database/schema.sql

shopt -s nullglob
files=(database/migrations/*.sql)
IFS=$'\n' sorted=($(printf '%s\n' "${files[@]}" | sort))
for f in "${sorted[@]}"; do
  echo "→ $f"
  psql "$URL" -v ON_ERROR_STOP=1 -f "$f"
done

echo "OK — base local actualizada."
echo "Opcional: psql \"\$DATABASE_URL\" -f database/seed.sql"
