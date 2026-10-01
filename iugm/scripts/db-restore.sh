#!/usr/bin/env bash
# Restaure une sauvegarde (voir db-backup.sh) dans une base de CONTRÔLE, puis
# affiche le nombre de lignes des tables principales. C'est ce test, répété
# régulièrement, qui prouve qu'une sauvegarde est réellement exploitable :
# une sauvegarde jamais restaurée n'est qu'une hypothèse.
#
# Usage :   bash scripts/db-restore.sh backups/iugm-20261001T020000Z.dump[.enc]
#           bash scripts/db-restore.sh <fichier> --into-live      (remplace la base réelle)
#
# Par défaut la restauration va dans une base jetable "<base>_restore_check" :
# la base réelle n'est jamais touchée. --into-live exige de retaper le nom de
# la base, et à ne faire qu'en cas de sinistre.
#
# Variables : IUGM_DB_CONTAINER, POSTGRES_USER, POSTGRES_DB (voir db-backup.sh),
#             BACKUP_PASSPHRASE (obligatoire pour un fichier .enc).
set -euo pipefail

cd "$(dirname "$0")/.."

FILE="${1:-}"
MODE="${2:-}"
if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
  echo "Usage : bash scripts/db-restore.sh <fichier.dump|fichier.dump.enc> [--into-live]" >&2
  exit 2
fi

if [ -f .env.local ]; then
  : "${POSTGRES_USER:=$(grep -E '^POSTGRES_USER=' .env.local | head -1 | cut -d= -f2- | tr -d '"\r')}"
  : "${POSTGRES_DB:=$(grep -E '^POSTGRES_DB=' .env.local | head -1 | cut -d= -f2- | tr -d '"\r')}"
fi
CONTAINER="${IUGM_DB_CONTAINER:-iugm_postgres_db}"
DB_USER="${POSTGRES_USER:-iugm_admin}"
LIVE_DB="${POSTGRES_DB:-iugm_scolarite_db}"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
DUMP="$FILE"
if [[ "$FILE" == *.enc ]]; then
  if [ -z "${BACKUP_PASSPHRASE:-}" ]; then
    echo "✗ Fichier chiffré : définissez BACKUP_PASSPHRASE." >&2
    exit 2
  fi
  DUMP="$WORK/restore.dump"
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 \
    -in "$FILE" -out "$DUMP" -pass env:BACKUP_PASSPHRASE
fi

if [ "$MODE" = "--into-live" ]; then
  TARGET="$LIVE_DB"
  echo "⚠ Vous allez REMPLACER la base réelle « $LIVE_DB » par cette sauvegarde."
  echo "  Toutes les données saisies depuis la sauvegarde seront perdues."
  read -r -p "  Retapez le nom de la base pour confirmer : " CONFIRM
  if [ "$CONFIRM" != "$LIVE_DB" ]; then
    echo "Annulé." >&2
    exit 1
  fi
  CLEAN_FLAGS=(--clean --if-exists)
else
  TARGET="${LIVE_DB}_restore_check"
  docker exec "$CONTAINER" psql -U "$DB_USER" -d postgres -v ON_ERROR_STOP=1 \
    -c "DROP DATABASE IF EXISTS \"$TARGET\"" -c "CREATE DATABASE \"$TARGET\"" > /dev/null
  CLEAN_FLAGS=()
fi

echo "→ Restauration dans « $TARGET » ..."
docker exec -i "$CONTAINER" pg_restore -U "$DB_USER" -d "$TARGET" \
  --no-owner --no-privileges --exit-on-error "${CLEAN_FLAGS[@]}" < "$DUMP"

echo "✓ Restauration terminée. Lignes par table :"
for TABLE in User Student EcolagePayment AuditLog Announcement _prisma_migrations; do
  COUNT="$(docker exec "$CONTAINER" psql -U "$DB_USER" -d "$TARGET" -tAc "SELECT count(*) FROM \"$TABLE\"")"
  printf '  %-20s %s\n' "$TABLE" "$COUNT"
done

if [ "$MODE" != "--into-live" ]; then
  echo "La base de contrôle « $TARGET » peut être supprimée :"
  echo "  docker exec $CONTAINER psql -U $DB_USER -d postgres -c 'DROP DATABASE \"$TARGET\"'"
fi
