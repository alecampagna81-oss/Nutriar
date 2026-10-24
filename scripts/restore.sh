#!/usr/bin/env bash
# Restaura un respaldo creado con backup.sh en una base VACÍA y una carpeta de archivos vacía.
# Uso: DATABASE_URL=... STORAGE_DIR=./storage scripts/restore.sh backups/nutriar-AAAAMMDD-HHMMSS.tar.gz
set -euo pipefail
: "${DATABASE_URL:?Definí DATABASE_URL (base vacía)}"
FILE="${1:?Indicá el archivo de respaldo}"
STORAGE_DIR="${STORAGE_DIR:-./storage}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
tar -xzf "$FILE" -C "$WORK"
if [ -d "$STORAGE_DIR" ] && [ -n "$(ls -A "$STORAGE_DIR" 2>/dev/null)" ]; then
  echo "La carpeta $STORAGE_DIR no está vacía. Movela o vaciala antes de restaurar." >&2
  exit 1
fi
pg_restore --no-owner --exit-on-error --dbname="$DATABASE_URL" "$WORK/db.dump"
mkdir -p "$STORAGE_DIR"
cp -a "$WORK/storage/." "$STORAGE_DIR/"
chmod -R go-rwx "$STORAGE_DIR"
echo "Restauración completa. Verificá con: curl \$APP_URL/api/health"
