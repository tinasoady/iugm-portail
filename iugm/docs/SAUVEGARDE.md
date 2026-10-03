# Sauvegarde et restauration

Public visé : l'administrateur du portail. Une sauvegarde qui n'a jamais été
restaurée est une hypothèse ; ce document met donc la **vérification de
restauration** au même niveau que la sauvegarde.

## Objectifs

| | Valeur | Comment |
|---|---|---|
| Perte de données maximale (RPO) | 24 h | sauvegarde quotidienne (+ restauration à un instant donné si votre hébergeur PostgreSQL la propose — à activer en plus) |
| Délai de remise en service (RTO) | moins de 2 h | restauration depuis Vercel Blob, procédure § 4 |
| Conservation | 35 jours, 7 sauvegardes au minimum | purge automatique par le script |

## 1. Ce qui est sauvegardé

- **La base PostgreSQL** (Neon) : dossiers, comptes, paiements, notes, journal d'audit, paramètres. C'est l'essentiel.
- **Pas** les fichiers de `public/uploads/` (logo, photos, si le stockage local est utilisé) ni les blobs Vercel existants : peu critiques, à copier séparément si vous y tenez.
- **Pas** `AUTH_SECRET` : le conserver dans un coffre-fort à part. Sans elle, une base restaurée garde ses données mais perd les mots de passe initiaux imprimés et les secrets 2FA (voir [`DEPLOIEMENT.md`](DEPLOIEMENT.md) § 5).

## 2. Sauvegarde automatique (production)

Le workflow `.github/workflows/backup.yml` tourne **chaque nuit à 02h17 UTC** (05h17 à Mahajanga) et à la demande (onglet Actions → « Sauvegarde quotidienne de la base » → *Run workflow*). Il :

1. compte les lignes des tables principales ;
2. fait un `pg_dump` (format custom) de la base de production ;
3. **restaure ce dump dans une base jetable de même version et compare les comptes** — si la restauration échoue ou si les chiffres ne concordent pas, le job échoue ;
4. chiffre le fichier (AES-256, PBKDF2 600 000 itérations) ;
5. le dépose dans **Vercel Blob** (`backups/iugm/AAAA/MM/`), relit sa taille, puis supprime les sauvegardes de plus de 35 jours (en gardant toujours au moins 7).

Si quelque chose échoue (y compris un secret manquant), GitHub envoie un e-mail
au propriétaire du dépôt. **Ne jamais ignorer cet e-mail.**

> ⚠ **Limite à connaître.** Le dépôt et le magasin Blob du projet sont **publics**.
> Le dump n'est donc jamais publié comme « artefact » GitHub, et n'est déposé dans
> Blob que **chiffré** (phrase aléatoire de 48 caractères), sous un nom à suffixe
> aléatoire dont l'adresse n'est jamais écrite dans les journaux. Sa
> confidentialité repose donc entièrement sur la phrase de chiffrement : si elle
> fuite ET que l'adresse d'un fichier est connue, ce fichier est lisible. Pour
> supprimer ce risque, voir « Passer à un magasin privé » ci-dessous.

### Configuration en place

| Élément | Valeur |
|---|---|
| Secret `BACKUP_DATABASE_URL` | URL PostgreSQL de production (Neon, connexion directe) |
| Secret `BACKUP_PASSPHRASE` | Phrase de chiffrement de 48 caractères |
| Secret `BACKUP_BLOB_TOKEN` | Jeton du magasin Vercel Blob |
| Variable `PG_MAJOR` | `18` (version de PostgreSQL de la production ; `pg_dump` doit être de la même version ou plus récente) |

Premier essai réussi le 3 octobre 2026 sur la base de production : 699 comptes et 1 188 dossiers sauvegardés, restauration de contrôle concordante, fichier chiffré de 0,66 Mo déposé, téléchargé, déchiffré et relu.

### ⚠ La phrase de chiffrement : à conserver HORS de GitHub

GitHub ne permet **pas** de relire un secret. La phrase a été générée aléatoirement
et enregistrée à deux endroits : dans le secret GitHub, et dans un fichier local
**hors dépôt** : `C:\Users\<vous>\iugm-backup-passphrase.txt`.

1. Copiez son contenu dans un **gestionnaire de mots de passe** (Bitwarden, KeePass...) et, idéalement, notez-le sur papier rangé en lieu sûr.
2. Puis supprimez le fichier local, ou gardez-le sur un support que vous maîtrisez.
3. **Sans cette phrase, les sauvegardes sont inutilisables.** La perdre équivaut à ne pas avoir de sauvegarde.

Pour la changer : générez-en une nouvelle (`openssl rand -base64 36 | tr -d '\r\n'`), mettez-la à jour dans Settings → Secrets → `BACKUP_PASSPHRASE`. Les anciennes sauvegardes restent lisibles **avec l'ancienne** phrase : conservez-la tant qu'elles existent (35 jours).

### Passer à un magasin privé (recommandé à terme)

Dans Vercel → Storage → *Create* → Blob → choisir l'accès **Private**, puis remplacer le secret `BACKUP_BLOB_TOKEN` par le jeton de ce nouveau magasin. Le script `scripts/backup-blob.mjs` envoie aujourd'hui en accès public (le magasin actuel refuse le mode privé) : il faudra le faire passer en `access: "private"` et adapter le téléchargement — dites-le moi, je le ferai et le testerai.

Alternative : un bucket S3 privé chez un autre fournisseur (Cloudflare R2, Backblaze B2) : meilleure indépendance vis-à-vis de Vercel.

## 3. Conservation

Le script supprime les sauvegardes de plus de 35 jours (`BACKUP_KEEP_DAYS`), sans jamais descendre sous 7 exemplaires, même si les dates étaient incohérentes. Pour garder une copie plus longue (une par mois, par exemple), téléchargez-la (§ 4.1) et rangez-la hors Vercel.

## 4. Restaurer

Le script `scripts/backup-blob.mjs` liste, télécharge ; `scripts/db-restore.sh` restaure.

```bash
# Jeton du magasin (Vercel → Storage → Blob → .env.local), puis :
export BACKUP_BLOB_TOKEN="<jeton>"
node scripts/backup-blob.mjs list                       # dates et tailles des sauvegardes
node scripts/backup-blob.mjs download ./backups/latest.dump.enc   # la plus récente
```

### 4.1 Vérification mensuelle (recommandée, 10 minutes)

Chaque mois, prouver qu'on sait restaurer **depuis le vrai stockage**, avec **la phrase conservée hors GitHub**, pas seulement depuis le job :

```bash
export PASS="<la phrase du gestionnaire de mots de passe>"
openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -in backups/latest.dump.enc -out backups/latest.dump -pass env:PASS
docker run --rm -i postgres:18-alpine pg_restore --list < backups/latest.dump   # doit lister User, Student, EcolagePayment...
```

Une restauration complète d'essai (`scripts/db-restore.sh`) exige un PostgreSQL de **même version que la production** : le conteneur Docker local du projet est en version 16 et ne peut pas relire un dump de la version 18 ; utilisez dans ce cas une base de contrôle sur Neon (une *branche* du projet, supprimable ensuite) ou un conteneur `postgres:18`.

### 4.2 Sinistre : remplacer la base de production

1. Mettre le portail en maintenance (ou couper le déploiement) pour éviter les écritures pendant la restauration.
2. Télécharger la dernière sauvegarde saine et la déchiffrer (§ 4).
3. Restaurer dans une base **neuve** (une nouvelle branche ou un nouveau projet Neon) : `pg_restore --no-owner --no-privileges -d "<nouvelle url>" backups/latest.dump`.
4. Vérifier les comptes (`SELECT count(*) FROM "Student"`...), puis pointer `DATABASE_URL` vers la nouvelle base dans Vercel et redéployer.
5. Les données saisies depuis la sauvegarde (jusqu'à 24 h) sont à ressaisir ; le journal d'audit de l'ancienne base, s'il est encore lisible, dit quoi.

### 4.3 Développement (Docker local)

```bash
bash scripts/db-backup.sh                       # ./backups/iugm-<horodatage>.dump (BACKUP_PASSPHRASE défini : chiffré)
bash scripts/db-restore.sh backups/<fichier>    # base de contrôle
bash scripts/db-restore.sh backups/<fichier> --into-live   # remplace la base locale (retaper son nom pour confirmer)
```

Le dossier `backups/` est ignoré par git.

## 5. Ce qui a été vérifié

- Le workflow a été exécuté **sur la base de production réelle** : sauvegarde, restauration de contrôle dans un PostgreSQL 18 jetable (comptes concordants), chiffrement, dépôt dans Blob avec vérification de taille.
- Le fichier déposé a ensuite été **téléchargé, déchiffré avec la phrase du fichier local, et son contenu lu** avec `pg_restore --list` (tables User, Student, EcolagePayment, AuditLog présentes) ; une mauvaise phrase échoue (« bad decrypt »).
- La purge a été testée avec des fichiers factices : elle supprime les anciennes sauvegardes et s'arrête à 7 exemplaires.
- Les scripts `db-backup.sh` / `db-restore.sh` ont été exécutés de bout en bout sur la base Docker locale.
- **Pas encore vérifiée** : une restauration *complète* d'une sauvegarde de production dans une base Neon de contrôle, hors du job (voir § 4.1) — à faire une première fois.
