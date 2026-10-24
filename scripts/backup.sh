#!/usr/bin/env bash
# Respaldo completo de NutriAR: base de datos + archivos privados.
# Uso: DATABASE_URL=... STORAGE_DIR=./storage BACKUP_DIR=./backups scripts/backup.sh
# Genera BACKUP_DIR/nutriar-AAAAMMDD-HHMMSS.tar.gz con db.dump (formato pg_dump custom) y storage/.
# IMPORTANTE: el respaldo contiene datos de salud. Guardalo cifrado y fuera del servidor.
set -euo pipefail
: "${DATABASE_URL:?Definí DATABASE_URL}"
STORAGE_DIR="${STORAGE_DIR:-./storage}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
STAMP="$(date +%Y%m%d-%H%M%S)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$BACKUP_DIR"
pg_dump --format=custom --no-owner --file="$WORK/db.dump" "$DATABASE_URL"
mkdir -p "$WORK/storage"
if [ -d "$STORAGE_DIR" ]; then cp -a "$STORAGE_DIR/." "$WORK/storage/"; fi
umask 077
tar -czf "$BACKUP_DIR/nutriar-$STAMP.tar.gz" -C "$WORK" db.dump storage
echo "Respaldo creado: $BACKUP_DIR/nutriar-$STAMP.tar.gz"
# Cifrado opcional (recomendado): gpg --symmetric --cipher-algo AES256 "$BACKUP_DIR/nutriar-$STAMP.tar.gz"
