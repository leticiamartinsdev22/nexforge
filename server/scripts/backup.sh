#!/bin/sh
set -eu

script_dir=$(CDPATH= cd "$(dirname "$0")" && pwd)
app_dir=${NEXFORGE_APP_DIR:-/app}
if [ ! -d "$app_dir" ]; then
  app_dir=$(CDPATH= cd "$script_dir/.." && pwd)
fi
backup_dir=${NEXFORGE_BACKUP_DIR:-/backups/nexforge}
if [ -z "${NEXFORGE_BACKUP_DIR:-}" ] && [ ! -d /app ]; then
  backup_dir="$app_dir/../backups/nexforge"
fi
stamp=$(date -u +%Y%m%dT%H%M%SZ)
archive="$backup_dir/nexforge-$stamp.tar.gz"
temporary="$archive.tmp"
stage=$(mktemp -d)
retention_days=${BACKUP_RETENTION_DAYS:-30}

trap 'rm -f "$temporary"; rm -rf "$stage"' EXIT HUP INT TERM
case "$retention_days" in ''|*[!0-9]*) echo "BACKUP_RETENTION_DAYS precisa ser um número de dias" >&2; exit 2 ;; esac
if [ "$retention_days" -lt 1 ]; then echo "BACKUP_RETENTION_DAYS precisa ser >= 1" >&2; exit 2; fi
mkdir -p "$backup_dir"
tar -cf "$stage/agent-state.tar" -C "$app_dir" config.json data
if [ -n "${DATABASE_URL:-}" ]; then
  pg_dump --format=custom --no-owner --no-privileges --file="$stage/nexforge.dump" "$DATABASE_URL"
  tar -czf "$temporary" -C "$stage" agent-state.tar nexforge.dump
else
  tar -czf "$temporary" -C "$stage" agent-state.tar
fi
tar -tzf "$temporary" >/dev/null
mv "$temporary" "$archive"
if [ -n "${RESTIC_REPOSITORY:-}" ]; then
  if [ -z "${RESTIC_PASSWORD:-}${RESTIC_PASSWORD_FILE:-}" ]; then echo "RESTIC_PASSWORD ou RESTIC_PASSWORD_FILE é obrigatória com RESTIC_REPOSITORY" >&2; exit 2; fi
  if ! restic snapshots >/dev/null 2>&1; then restic init; fi
  restic backup "$archive" --tag nexforge
  restic forget --tag nexforge \
    --keep-daily "${RESTIC_KEEP_DAILY:-30}" \
    --keep-weekly "${RESTIC_KEEP_WEEKLY:-8}" \
    --keep-monthly "${RESTIC_KEEP_MONTHLY:-12}" --prune
  printf 'OFFSITE_BACKUP_OK=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
fi
find "$backup_dir" -maxdepth 1 -type f -name 'nexforge-*.tar.gz' -mtime "+$retention_days" -delete
rm -rf "$stage"
trap - EXIT HUP INT TERM
printf 'Backup validado: %s\n' "$archive"
