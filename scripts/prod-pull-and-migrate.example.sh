#!/usr/bin/env bash
# Exemplo de fluxo em servidor (SSH) — copiar para o host, ajustar caminhos e NUNCA
# commitar credenciais. Em produção usa-se DATABASE_URL do ambiente (PM2/systemd),
# não um ficheiro .env na máquina se evitares ficheiros no disco.
#
#   export DATABASE_URL='postgresql://USER:PASS@127.0.0.1:5432/evolution_db'
#   bash prod-pull-and-migrate.example.sh
#
set -euo pipefail
# APP_DIR=/var/www/hrstore-backend   # ajustar
# cd "$APP_DIR"

# git pull origin main
# npm ci --omit=dev

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "Define DATABASE_URL (produção) antes de correr migrações."
  exit 1
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/schema.sql

shopt -s nullglob
files=(database/migrations/*.sql)
IFS=$'\n' sorted=($(printf '%s\n' "${files[@]}" | sort))
for f in "${sorted[@]}"; do
  echo "→ $f"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"
done

# pm2 restart hrstore-api   # ou o nome do processo

echo "Migrações aplicadas; reinicia o processo Node conforme o teu setup."
