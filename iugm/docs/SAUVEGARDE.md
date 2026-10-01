# Sauvegarde et restauration

Public visé : l'administrateur du portail. Une sauvegarde qui n'a jamais été
restaurée est une hypothèse ; ce document met donc la **vérification de
restauration** au même niveau que la sauvegarde.

## Objectifs

| | Valeur | Comment |
|---|---|---|
| Perte de données maximale (RPO) | 24 h | sauvegarde quotidienne (+ restauration à un instant donné si votre hébergeur PostgreSQL la propose — à activer en plus) |
| Délai de remise en service (RTO) | moins de 2 h | restauration depuis le stockage externe, procédure § 4 |
| Conservation | 35 jours | règle de cycle de vie du bucket, § 3 |

## 1. Ce qui est sauvegardé

- **La base PostgreSQL** : dossiers, comptes, paiements, notes, journal d'audit, paramètres. C'est l'essentiel.
- **Pas** les fichiers de `public/uploads/` (logo, photos, si le stockage local est utilisé) ni les blobs Vercel : peu critiques, à copier séparément si vous y tenez.
- **Pas** `AUTH_SECRET` : le conserver dans un coffre-fort à part. Sans elle, une base restaurée garde ses données mais perd les mots de passe initiaux imprimés et les secrets 2FA (voir [`DEPLOIEMENT.md`](DEPLOIEMENT.md) § 5).

## 2. Sauvegarde automatique (production)

Le workflow `.github/workflows/backup.yml` tourne **chaque nuit à 02h17 UTC** (et à la demande : onglet Actions → « Sauvegarde quotidienne de la base » → *Run workflow*). Il :

1. compte les lignes des tables principales ;
2. fait un `pg_dump` (format custom) de la base de production ;
3. **restaure ce dump dans une base jetable et compare les comptes** — si la restauration échoue ou si les chiffres ne concordent pas, le job échoue ;
4. chiffre le fichier (AES-256, PBKDF2) ;
5. l'envoie dans votre stockage S3 et relit sa taille.

Si quelque chose échoue (y compris un secret manquant), GitHub envoie un e-mail
au propriétaire du dépôt. **Ne jamais ignorer cet e-mail.**

> ⚠️ Le dépôt est **public**. Le dump n'est donc jamais publié comme « artefact »
> GitHub (téléchargeable par tout compte GitHub) : il n'existe que dans le
> runner pendant le job, puis chiffré dans votre bucket privé.

### Mise en place (une fois)

1. Créer un **bucket privé** chez un fournisseur compatible S3 (Cloudflare R2, Backblaze B2, AWS S3, Wasabi...). Pas d'accès public.
2. Créer une clé d'accès limitée à ce bucket (lecture/écriture, pas d'autres droits).
3. Dans GitHub : Settings → Secrets and variables → Actions → **Secrets** :

| Secret | Contenu |
|---|---|
| `BACKUP_DATABASE_URL` | URL PostgreSQL de **production** — idéalement d'un compte en lecture seule |
| `BACKUP_PASSPHRASE` | Phrase de chiffrement, **20 caractères minimum**. Conservez-la dans un coffre-fort **et** sur papier : sans elle les sauvegardes sont inutilisables |
| `BACKUP_S3_BUCKET` | Nom du bucket |
| `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY` | Clé d'accès |
| `BACKUP_S3_ENDPOINT` | Adresse du service si ce n'est pas AWS (ex. `https://<compte>.r2.cloudflarestorage.com`) |
| `BACKUP_S3_REGION` | Région (laisser vide pour R2 ; sinon celle du bucket) |

   Optionnel, onglet **Variables** : `PG_MAJOR` = version majeure de PostgreSQL de production (défaut `16`). `pg_dump` doit être de la même version ou plus récente que le serveur.

4. Lancer le workflow à la main une première fois et vérifier qu'il est vert.

## 3. Conservation

Les sauvegardes sont rangées sous `iugm/AAAA/MM/iugm-<horodatage>.dump.enc`. Le workflow ne supprime rien : configurez une **règle de cycle de vie** du bucket qui supprime les objets de plus de 35 jours (R2/B2/S3 : « Lifecycle rules »). Gardez en plus une copie mensuelle hors du bucket si les données le justifient.

## 4. Restaurer

### 4.1 Vérification mensuelle (recommandée, 10 minutes)

Chaque mois, prouver qu'on sait restaurer **depuis le vrai stockage**, pas seulement depuis le job :

```bash
aws s3 cp s3://<bucket>/iugm/2026/10/<fichier>.dump.enc . --endpoint-url <endpoint>
BACKUP_PASSPHRASE='<phrase>' bash scripts/db-restore.sh <fichier>.dump.enc
```

Le script restaure dans une base **de contrôle** (`<base>_restore_check`), affiche le nombre de lignes des tables principales, et ne touche jamais la base réelle. Comparez avec la production.

### 4.2 Sinistre : remplacer la base de production

1. Mettre le portail en maintenance (ou couper le déploiement) pour éviter les écritures pendant la restauration.
2. Télécharger la dernière sauvegarde saine (§ 4.1).
3. Restaurer dans une base **neuve** de l'hébergeur : `pg_restore --no-owner --no-privileges -d "<nouvelle url>" fichier.dump` (après déchiffrement : `openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -in fichier.dump.enc -out fichier.dump -pass env:BACKUP_PASSPHRASE`).
4. Vérifier les comptes (`SELECT count(*) FROM "Student"`...), puis pointer `DATABASE_URL` vers la nouvelle base et redéployer.
5. Les données saisies depuis la sauvegarde (jusqu'à 24 h) sont à ressaisir ; le journal d'audit de l'ancienne base, s'il est encore lisible, dit quoi.

### 4.3 Développement (Docker local)

```bash
bash scripts/db-backup.sh                       # ./backups/iugm-<horodatage>.dump (BACKUP_PASSPHRASE défini : chiffré)
bash scripts/db-restore.sh backups/<fichier>    # base de contrôle
bash scripts/db-restore.sh backups/<fichier> --into-live   # remplace la base locale (retaper son nom pour confirmer)
```

Le dossier `backups/` est ignoré par git.

## 5. Ce qui a été vérifié

Les scripts `db-backup.sh` / `db-restore.sh` ont été exécutés de bout en bout
sur la base Docker du projet (sauvegarde chiffrée, restauration, comptes
identiques à la source, échec attendu avec une mauvaise phrase ou sans phrase).
Le workflow GitHub n'a **pas** pu être exécuté depuis le poste de
développement : il dépend de vos secrets. Sa syntaxe et chacune de ses étapes
shell ont été validées, mais son premier lancement manuel (§ 2, étape 4) est
l'étape qui prouve qu'il fonctionne chez vous.
