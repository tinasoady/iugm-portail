#!/usr/bin/env bash
# Sauvegarde la base PostgreSQL du portail (conteneur Docker du docker-compose.yml)
# dans un fichier .dump (format custom de pg_dump : compressé, restaurable table
# par table), vérifié avant d'être conservé.
#
# Usage :   bash scripts/db-backup.sh
# Variables (toutes optionnelles) :
#   IUGM_DB_CONTAINER  nom du conteneur            (défaut : iugm_postgres_db)
#   POSTGRES_USER / POSTGRES_DB                    (lus dans .env.local sinon)
#   BACKUP_DIR         dossier de destination      (défaut : ./backups)
#   BACKUP_KEEP_DAYS   ancienneté max conservée    (défaut : 14 ; 0 = ne rien supprimer)
#   BACKUP_PASSPHRASE  si définie, le fichier est chiffré (AES-256) en .dump.enc
#
# Les sauvegardes contiennent des données personnelles d'étudiants : ne jamais
# les committer (le dossier backups/ est ignoré par git) ni les laisser sur le
# même disque que la base comme seule copie.
set -euo pipefail

cd "$(dirname "$0")/.."

if [ -f .env.local ]; then
  # Lecture ciblée : on ne source pas tout le fichier (il contient des secrets)
  : "${POSTGRES_USER:=$(grep -E '^POSTGRES_USER=' .env.local | head -1 | cut -d= -f2- | tr -d '"\r')}"
  : "${POSTGRES_DB:=$(grep -E '^POSTGRES_DB=' .env.local | head -1 | cut -d= -f2- | tr -d '"\r')}"
fi
CONTAINER="${IUGM_DB_CONTAINER:-iugm_postgres_db}"
DB_USER="${POSTGRES_USER:-iugm_admin}"
DB_NAME="${POSTGRES_DB:-iugm_scolarite_db}"
OUT_DIR="${BACKUP_DIR:-./backups}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"

mkdir -p "$OUT_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FINAL="$OUT_DIR/iugm-$STAMP.dump"
PARTIAL="$FINAL.partial"
trap 'rm -f "$PARTIAL"' EXIT

echo "→ Sauvegarde de $DB_NAME ($CONTAINER) ..."
docker exec "$CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" \
  --format=custom --no-owner --no-privileges > "$PARTIAL"

# Un fichier vide ou tronqué ne doit jamais passer pour une sauvegarde valide :
# pg_restore --list lit tout le sommaire, ce qui échoue sur un dump corrompu.
if [ ! -s "$PARTIAL" ]; then
  echo "✗ Le fichier de sauvegarde est vide." >&2
  exit 1
fi
if ! docker exec -i "$CONTAINER" pg_restore --list < "$PARTIAL" > /dev/null; then
  echo "✗ Le fichier de sauvegarde est illisible (pg_restore --list a échoué)." >&2
  exit 1
fi
mv "$PARTIAL" "$FINAL"

if [ -n "${BACKUP_PASSPHRASE:-}" ]; then
  openssl enc -aes-256-cbc -pbkdf2 -iter 600000 -salt \
    -in "$FINAL" -out "$FINAL.enc" -pass env:BACKUP_PASSPHRASE
  rm -f "$FINAL"
  FINAL="$FINAL.enc"
fi

echo "✓ Sauvegarde créée : $FINAL ($(du -h "$FINAL" | cut -f1))"

if [ "$KEEP_DAYS" -gt 0 ]; then
  find "$OUT_DIR" -maxdepth 1 -name 'iugm-*.dump*' -type f -mtime "+$KEEP_DAYS" -print -delete \
    | sed 's/^/  ancienne sauvegarde supprimée : /'
fi
