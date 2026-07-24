# iugm-portail (FR/EN)

## FR — Gestion des Inscriptions Universitaires (IUGM)

**iugm-portail** est une application web **Next.js + Prisma + PostgreSQL** pour moderniser la gestion des inscriptions et de la scolarité à l’IUGM.

### Fonctionnalités clés
- **Authentification par rôles** (cookie HTTP-only signé) :
  - `SUPERADMIN` → `/admin`
  - `AGENT_ADMINISTRATION` → `/agent-admin`
  - `AGENT_PEDAGOGIQUE` → `/agent-pedagogique`
  - `ETUDIANT` → `/mon-profil`
- **Base de données Prisma** : `User`, `Student`, `AcademicResult`, `Setting`, `Tariff`, `AuditLog`
- **Seed Prisma** : création d’un compte `SUPERADMIN` pour démarrer rapidement.

### Prérequis
- **Node.js** (version compatible avec le projet)
- **PostgreSQL** (local ou via Docker)

### Configuration (variables d’environnement)
Copier/mettre en place un fichier **`.env.local`** à la racine du projet (même niveau que `package.json`).

Au minimum :
```bash
# Base de données
DATABASE_URL="postgresql://POSTGRES_USER:POSTGRES_PASSWORD@localhost:5432/postgres?schema=public"

# Clé de signature des cookies de session
AUTH_SECRET="change-me-to-a-long-random-string"
```

> Remarque : le projet lit `.env.local` via `iugm/prisma/load-env.ts`.

### Démarrage local
Dans le dossier `iugm/` :
```bash
npm install
npm run dev
```
Puis ouvrir : http://localhost:3000

### Prisma (migrations / generate)
```bash
cd iugm
npx prisma generate
npx prisma migrate dev
```

### Seed (création du SUPERADMIN)
```bash
cd iugm
npm run seed
```
Le seed crée un compte :
- Email : `admin@iugm.edu`
- Mot de passe : `admin123`

### Docker (Postgres)
Le projet inclut un `docker-compose.yml` pour lancer PostgreSQL.

1) Démarrer la base :
```bash
docker compose up -d
```
2) Assurez-vous que votre `DATABASE_URL` pointe vers le conteneur Postgres (généralement via `localhost:5432` car le port est publié).

### Tests
La suite (Vitest) couvre deux niveaux :
- **Tests unitaires** (`tests/unit/`) : logique pure, sans base de données (barème des mentions, construction des requêtes de liste, classement/groupement, catalogue des permissions).
- **Tests d'intégration** (`tests/integration/`) : contre une **vraie base Postgres de test**, séparée de la base de développement — workflow d'inscription complet, réinscription (archivage de l'historique), anti-bruteforce de connexion, périmètre par formation, évolution du tableau de bord.

Mise en place (une seule fois) :
```bash
cd iugm
docker exec iugm_postgres_db createdb -U iugm_admin iugm_scolarite_test_db
cp .env.test.example .env.test   # ajuster le mot de passe si besoin
DATABASE_URL="<url de .env.test>" npx prisma migrate deploy
```

Lancer les tests :
```bash
cd iugm
npm test              # une passe, sortie CI
npm run test:watch    # mode interactif
npm run test:coverage # rapport de couverture (iugm/coverage/index.html)
```

La CI GitHub Actions (`.github/workflows/ci.yml`) démarre son propre service Postgres éphémère et exécute la suite complète à chaque push/PR — voir le badge de statut sur le dépôt.

### Notes de sécurité
- Les sessions sont stockées dans un **cookie HTTP-only** signé (voir `iugm/lib/auth.ts`).
- En production, le cookie est marqué `secure`.

---

## EN — University Enrollment Management (IUGM)

iugm-portail is a **Next.js + Prisma + PostgreSQL** web application to modernize university enrollment and academic management at IUGM.

### Key features
- **Role-based authentication** using a signed **HTTP-only cookie**:
  - `SUPERADMIN` → `/admin`
  - `AGENT_ADMINISTRATION` → `/agent-admin`
  - `AGENT_PEDAGOGIQUE` → `/agent-pedagogique`
  - `ETUDIANT` → `/mon-profil`
- **Prisma database models**: `User`, `Student`, `AcademicResult`, `Setting`, `Tariff`, `AuditLog`
- **Prisma seed** to create a `SUPERADMIN` account for quick start.

### Prerequisites
- **Node.js** (compatible with this project)
- **PostgreSQL** (local or via Docker)

### Environment variables
Create a **`.env.local`** file at the project root (same level as `package.json`).

Minimum:
```bash
DATABASE_URL="postgresql://POSTGRES_USER:POSTGRES_PASSWORD@localhost:5432/postgres?schema=public"
AUTH_SECRET="change-me-to-a-long-random-string"
```

> Note: the project loads `.env.local` through `iugm/prisma/load-env.ts`.

### Local development
From the `iugm/` folder:
```bash
npm install
npm run dev
```
Open: http://localhost:3000

### Prisma (migrations / generate)
```bash
cd iugm
npx prisma generate
npx prisma migrate dev
```

### Seed (SUPERADMIN creation)
```bash
cd iugm
npm run seed
```
Seed creates:
- Email: `admin@iugm.edu`
- Password: `admin123`

### Docker (Postgres)
A `docker-compose.yml` is provided to run PostgreSQL.

```bash
docker compose up -d
```
Then ensure your `DATABASE_URL` points to the Postgres instance (typically `localhost:5432` since the port is exposed).

### Tests
The suite (Vitest) has two layers:
- **Unit tests** (`tests/unit/`): pure logic, no database (mention grading, list-query building, grouping, permission catalog).
- **Integration tests** (`tests/integration/`): against a **real Postgres test database**, separate from the dev one — full enrollment workflow, re-enrollment (history archiving), login rate limiting, per-formation scoping, dashboard trend.

One-time setup:
```bash
cd iugm
docker exec iugm_postgres_db createdb -U iugm_admin iugm_scolarite_test_db
cp .env.test.example .env.test   # adjust the password if needed
DATABASE_URL="<url from .env.test>" npx prisma migrate deploy
```

Running the tests:
```bash
cd iugm
npm test              # single run, CI-style output
npm run test:watch    # interactive mode
npm run test:coverage # coverage report (iugm/coverage/index.html)
```

CI (`.github/workflows/ci.yml`) spins up its own ephemeral Postgres service and runs the full suite on every push/PR.

### Security notes
- Sessions are stored in a signed **HTTP-only cookie** (see `iugm/lib/auth.ts`).
- In production, the cookie is marked `secure`.

