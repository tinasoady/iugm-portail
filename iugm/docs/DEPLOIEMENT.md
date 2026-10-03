# Déploiement et exploitation

Public visé : la personne qui installe, met à jour et fait tourner le portail
(administrateur système ou développeur). Les guides destinés aux utilisateurs
sont dans [`guides/`](guides/).

## 1. Architecture

| Élément | Rôle | Où |
|---|---|---|
| Application Next.js 16 | Pages, Server Actions, API | Vercel (actuel) ou n'importe quel hôte Node 22 (`npm run build && npm start`) |
| PostgreSQL 16 | Toutes les données | Service managé en production, conteneur Docker en développement |
| Vercel Blob | Logo, photos de profil, fichiers d'import volumineux | `BLOB_READ_WRITE_TOKEN` |
| Serveur SMTP (optionnel) | E-mails : mot de passe oublié, notifications aux étudiants | `SMTP_*` |
| Vercel Blob (dossier `backups/`) | Sauvegardes quotidiennes chiffrées | voir [`SAUVEGARDE.md`](SAUVEGARDE.md) |

## 2. Variables d'environnement

| Variable | Obligatoire | Rôle |
|---|---|---|
| `DATABASE_URL` | oui | Chaîne de connexion PostgreSQL |
| `AUTH_SECRET` | oui | Signe les sessions **et** dérive la clé de chiffrement (mots de passe initiaux imprimés, secrets 2FA). Longue, aléatoire (`openssl rand -hex 32`), propre à chaque environnement. **Ne jamais la changer à la légère** : voir § 5 |
| `BLOB_READ_WRITE_TOKEN` | oui | Accès au stockage Vercel Blob |
| `APP_URL` | recommandé | Adresse publique du portail, ex. `https://portail.iugm.mg`, sans `/` final. Sert à écrire les liens des e-mails. Sans elle (et sans domaine de production Vercel détecté), **aucun lien n'est écrit** dans les e-mails : c'est voulu, l'en-tête `Host` d'une requête peut être falsifié |
| `SMTP_HOST` | pour les e-mails | Serveur SMTP |
| `SMTP_PORT` | non | `587` (défaut, STARTTLS) ou `465` |
| `SMTP_SECURE` | non | `true` pour le TLS direct (port 465) |
| `SMTP_USER`, `SMTP_PASS` | selon le serveur | Identifiants SMTP |
| `MAIL_FROM` | pour les e-mails | Expéditeur, ex. `Portail IUGM <no-reply@iugm.mg>` |
| `MAIL_DRIVER` | non | `log` : n'envoie rien, écrit les messages dans la console (développement, tests) |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | Docker seulement | Initialisation du conteneur local |

Sans `SMTP_HOST` + `MAIL_FROM`, le portail fonctionne normalement : les
notifications ne partent pas et la page « Mot de passe oublié » indique que
la réinitialisation par e-mail n'est pas activée (le superadmin réinitialise
alors les mots de passe depuis **Permissions**).

### Mettre en place l'envoi d'e-mails (pas à pas)

Tant que `SMTP_HOST` et `MAIL_FROM` manquent, la page « Mot de passe oublié » affiche
« La réinitialisation par e-mail n'est pas activée ». Deux fournisseurs gratuits qui conviennent sans nom de domaine :

**Option A — Gmail** (le plus rapide ; environ 500 e-mails par jour, l'expéditeur affiché est l'adresse Gmail elle-même)

1. Compte Google → Sécurité → activer la **validation en 2 étapes**.
2. Ouvrir <https://myaccount.google.com/apppasswords>, créer un mot de passe d'application nommé « Portail IUGM » : Google affiche 16 caractères. C'est ce mot de passe-là, **pas** celui du compte.
3. Variables Vercel :

| Variable | Valeur |
|---|---|
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `465` |
| `SMTP_SECURE` | `true` |
| `SMTP_USER` | l'adresse Gmail complète |
| `SMTP_PASS` | les 16 caractères, sans espaces |
| `MAIL_FROM` | `Portail IUGM <la même adresse Gmail>` |

**Option B — Brevo** (environ 300 e-mails par jour, expéditeur à vérifier chez eux)

1. Créer un compte sur brevo.com, puis *SMTP & API* → générer une **clé SMTP** et noter le « login SMTP ».
2. *Expéditeurs* → ajouter et **vérifier** l'adresse qui enverra les messages.
3. Variables Vercel : `SMTP_HOST=smtp-relay.brevo.com`, `SMTP_PORT=587`, `SMTP_USER=<login SMTP>`, `SMTP_PASS=<clé SMTP>`, `MAIL_FROM=Portail IUGM <adresse vérifiée>`.

**Dans Vercel** : projet → Settings → Environment Variables → ajouter chaque variable pour l'environnement *Production* (cocher « Sensitive » pour `SMTP_PASS`), puis **redéployer** (Deployments → ⋯ → Redeploy). Les variables ne sont lues qu'au démarrage d'un déploiement.

**Vérifier** : connectez-vous en superadmin → **Paramètres** → section *Envoi d'e-mails*. Elle affiche l'état de la configuration (variables manquantes, serveur, expéditeur) et un bouton **Envoyer le test** ; en cas d'échec, le message indique la cause probable (identifiants refusés, serveur injoignable, expéditeur non autorisé...).

Les liens des e-mails utilisent le domaine de production détecté automatiquement par Vercel ; définissez `APP_URL` seulement si vous avez un domaine personnalisé.

Les adresses des **comptes du personnel** doivent être de vraies boîtes mail pour recevoir un lien « mot de passe oublié » ; celles des étudiants viennent de l'adresse personnelle de leur dossier.

## 3. Première mise en production

1. Créer la base PostgreSQL et récupérer `DATABASE_URL`.
2. Renseigner les variables du § 2 dans Vercel (Settings → Environment Variables, environnement *Production*).
3. Appliquer les migrations : `DATABASE_URL="<prod>" npx prisma migrate deploy`.
4. Créer le premier compte superadmin : `DATABASE_URL="<prod>" npm run seed`. Le mot de passe initial s'affiche **une seule fois** dans le terminal ; le changement est imposé à la première connexion.
5. Déployer : `vercel --prod` depuis `iugm/` (le déploiement automatique du workflow CI est en pause, voir `.github/workflows/ci.yml`).
6. Se connecter, **activer la double authentification** (Mon compte), puis renseigner l'établissement et les tarifs (Paramètres).
7. Configurer la sauvegarde nocturne ([`SAUVEGARDE.md`](SAUVEGARDE.md)) et une sonde de supervision ([`SUPERVISION.md`](SUPERVISION.md)).

## 4. Mettre à jour (déployer une nouvelle version)

**Ordre impératif : migrations d'abord, code ensuite.** Le code de session lit
désormais des colonnes ajoutées par la migration `20261001090000_auth_hardening`
(`sessionsValidAfter`, champs 2FA). Déployer le code sans cette migration fait
échouer toutes les pages authentifiées.

```bash
# 1. Sauvegarde manuelle de précaution (ou vérifier que celle de la nuit a réussi)
# 2. Migrations sur la base de production
DATABASE_URL="<prod>" npx prisma migrate deploy
# 3. Déploiement du code
vercel --prod
# 4. Vérification
curl -s https://<domaine>/api/health      # {"status":"ok","database":"ok",...}
```

Avant tout déploiement, la CI doit être verte (types, lint, 300+ tests, build,
tests de bout en bout). En local : `npm test` puis `npm run test:e2e`.

Migration `20261003100000_recovery_email` (adresse de récupération) : une colonne nullable et une table, rien de destructif. Elle s'applique comme les autres ; la construction Vercel exécute `prisma migrate deploy`.

Migration `20261003120000_single_session` (session unique par compte) : une colonne nullable. **Effet au déploiement** : les sessions déjà ouvertes restent valables jusqu'à la prochaine connexion de chaque compte ; dès qu'un compte se reconnecte, son identifiant de session est enregistré et seule cette session reste valable.

Les migrations sont écrites pour s'appliquer sur une base en service : colonnes
ajoutées avec une valeur par défaut, aucune suppression de données.

## 5. `AUTH_SECRET` : ce qui dépend d'elle

| Donnée | Effet d'un changement de `AUTH_SECRET` |
|---|---|
| Sessions ouvertes | Toutes invalidées (tout le monde doit se reconnecter) — sans gravité |
| Mots de passe initiaux imprimés (`Student.initialPassword`) | Illisibles ; concerne seulement les étudiants qui ne se sont pas encore connectés. Le superadmin réinitialise leur mot de passe (Permissions → Réinit. mdp) |
| Secrets 2FA | Illisibles : les comptes concernés ne peuvent plus valider de code. Le superadmin réinitialise leur 2FA (Permissions → Réinit. 2FA), ils la reconfigurent |
| Codes de secours 2FA | Non concernés (empreintes SHA-256) |

Si `AUTH_SECRET` a fuité : la changer, redéployer, puis appliquer le tableau ci-dessus. Conserver l'ancienne valeur dans un coffre-fort pendant la transition permet de relire ce qui l'a été avec elle.

## 6. Hors Vercel (serveur à soi)

- `npm ci && npx prisma migrate deploy && npm run build && npm start` (port 3000).
- Placer un reverse proxy HTTPS devant (Nginx, Caddy) qui **écrase** l'en-tête `X-Forwarded-For` avec l'adresse réelle du client : le blocage anti-bruteforce par IP s'appuie dessus. Un proxy qui le transmet tel quel permettrait à un attaquant de contourner la limite en changeant d'« adresse » à chaque essai.
- Utiliser `/api/health` comme sonde de santé du proxy / de l'orchestrateur.
- Les fichiers de `public/uploads/` (si le stockage local est utilisé) ne sont pas dans git : les sauvegarder séparément.

## 7. Dépendances et vulnérabilités

`npm audit --omit=dev` doit être consulté à chaque mise à jour. État au
1ᵉʳ octobre 2026 : Next.js 16.3.8 (correctifs de sécurité de la série 16.2),
Prisma 7.10. Restent signalés, sans correctif non cassant : des paquets de
l'outillage en ligne de commande de Prisma (`deepmerge-ts`, `mysql2`) — utilisés
au développement et pour les migrations, jamais sur le chemin d'une requête
web — et `uuid` via `exceljs` (limite de tampon, sans effet dans l'usage qu'en
fait le portail).
