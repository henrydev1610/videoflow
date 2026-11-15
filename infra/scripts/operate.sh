#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
case "${1:-status}" in
  up) docker compose up -d --build ;;
  stop) docker compose stop ;;
  status) docker compose ps -a ;;
  logs) docker compose logs --tail 100 ;;
  quality|e2e) docker compose -f compose.yaml -f compose.test.yaml run --rm "$1" ;;
  cleanup) docker compose exec -T videoflow-worker node workers/media-worker/dist/cleanup-main.js ;;
  backup)
    mkdir -p backups
    backup_name="videoflow-$(date -u +%Y%m%d-%H%M%S)-$$.dump"
    docker compose exec -T videoflow-postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f "/tmp/$1"' sh "$backup_name"
    docker compose exec -T videoflow-postgres cat "/tmp/$backup_name" > "backups/$backup_name"
    printf 'Backup: backups/%s (banco; artefatos exigem cópia coordenada)\n' "$backup_name"
    ;;
  *) printf 'Operação desconhecida\n' >&2; exit 2 ;;
esac
