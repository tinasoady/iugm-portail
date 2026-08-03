# IUGM — Portail de Gestion de Scolarité

[![CI](https://github.com/tinasoady/iugm-portail/actions/workflows/ci.yml/badge.svg)](https://github.com/tinasoady/iugm-portail/actions/workflows/ci.yml)
![Next.js](https://img.shields.io/badge/Next.js-16-black)
![React](https://img.shields.io/badge/React-19-61DAFB)
![Prisma](https://img.shields.io/badge/Prisma-7-2D3748)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6)

Application web **Next.js + Prisma + PostgreSQL** pour la gestion des inscriptions et de la scolarité de l'**IUGM** (Institut Universitaire) : de la présélection des candidats jusqu'à la délivrance de la carte étudiante numérique, en passant par le paiement de l'écolage et les résultats académiques.

🇫🇷 Français ci-dessous · 🇬🇧 [English version further down](#en--university-enrollment--academic-management-iugm)

---

## Sommaire

- [Fonctionnalités](#fonctionnalités)
- [Rôles et accès](#rôles-et-accès)
- [Stack technique](#stack-technique)
- [Structure du projet](#structure-du-projet)
- [Démarrage rapide](#démarrage-rapide)
- [Variables d'environnement](#variables-denvironnement)
- [Base de données (Prisma)](#base-de-données-prisma)
- [Tests](#tests)
- [Intégration continue](#intégration-continue)
- [Scripts npm](#scripts-npm)
- [Sécurité](#sécurité)

---

## Fonctionnalités

### Cycle de vie d'un dossier étudiant
Le workflow d'inscription est modélisé explicitement (`Student.status`) et chaque étape est horodatée pour alimenter le tableau de bord :

```
ENREGISTRE → PAIEMENT_VERIFIE → ADMIN_VALIDEE → INSCRIT
  (agent          (reçu bancaire      (dossier admin      (validation
   admin)          vérifié)            complet)            pédagogique,
                                                             compte étudiant créé)
```

- **Présélection** : import en lot (Excel) des candidats déjà présélectionnés par l'université de rattachement ou des étudiants déjà sur place, pour pré-remplir l'inscription par recherche de nom.
- **Inscription / réinscription** : saisie assistée (wizard), pièces du dossier cochées à la réception, historisation complète des années universitaires précédentes à chaque réinscription.
- **Écolage** : tarifs configurables par filière, versement en une ou deux tranches, calcul automatique des montants, historique de tous les versements par année.
- **Résultats académiques** : moyenne sur 20 par semestre, mention calculée automatiquement (Échec → Très Bien), appréciations de conduite.
- **Carte étudiante numérique** : QR code à jeton opaque (non devinable, régénérable par l'étudiant), consultable sans connexion sur une page publique dédiée.
- **Communiqués ciblés** : envoi par filière et/ou niveau, avec suivi de lecture par étudiant.
- **Permissions granulaires par tâche** : au sein d'un même rôle, chaque agent ne voit que les tâches et — si affecté à une filière — que les dossiers qui lui sont attribués.
- **Journal d'audit** et **anti-bruteforce** sur les connexions (par e-mail et par IP).
- **Base de données** : import/export Excel des dossiers, export CSV filtré, paramètres de l'établissement (nom, logo).
- **Thème clair / sombre**, persistant, sans flash au chargement.

## Rôles et accès

Authentification par cookie de session **HTTP-only signé** ; chaque rôle est redirigé vers son propre espace :

| Rôle | Espace | Peut notamment |
|---|---|---|
| `SUPERADMIN` | `/admin` | Tout, y compris permissions, paramètres, tarifs, import de la base |
| `AGENT_ADMINISTRATION` | `/agent-admin` | Inscription, réinscription, vérification des paiements, écolage, export |
| `AGENT_PEDAGOGIQUE` | `/agent-pedagogique` | Validation pédagogique, résultats, conduite, reçus |
| `ETUDIANT` | `/mon-profil` | Profil, résultats, communiqués, carte étudiante |

Deux agents du même rôle peuvent avoir des permissions différentes (`app/admin/permissions`) et être cantonnés à une filière donnée (`Management`, `Finance-Comptabilité`, `Commerce International`, `PGI`, `Économie générale`, `GRH`, `Marketing et Communication` — voir `lib/formations.ts`).

## Stack technique

| Domaine | Choix |
|---|---|
| Framework | [Next.js 16](https://nextjs.org) (App Router, Server Actions) |
| UI | React 19, Tailwind CSS 4, `react-icons` |
| Base de données | PostgreSQL 16 + [Prisma 7](https://www.prisma.io) (`@prisma/adapter-pg`) |
| Auth | Cookie de session signé maison (`lib/auth.ts`) + `bcryptjs` |
| Fichiers | `exceljs` (import/export Excel), `qrcode` (carte étudiante) |
| Tests | [Vitest](https://vitest.dev) (unitaires + intégration sur vraie base Postgres) |
| Qualité | TypeScript strict, ESLint (`eslint-config-next`) |
| CI | GitHub Actions (types, lint, migrations, tests, build) |

> ⚠️ Ce projet utilise **Next.js 16**, dont certaines API diffèrent des versions antérieures — voir `iugm/AGENTS.md` avant toute modification substantielle.

## Structure du projet

```
iugm-portail/
├── .github/workflows/ci.yml   # Pipeline CI (lint, types, tests, build)
└── iugm/                      # Application Next.js (racine du code)
    ├── app/                   # App Router : une route par dossier
    │   ├── admin/             # Espace SUPERADMIN (permissions, paramètres, tarifs, base de données)
    │   ├── agent-admin/       # Espace agent d'administration (inscription, réinscription, écolage)
    │   ├── agent-pedagogique/ # Espace agent pédagogique (validation, résultats, reçus)
    │   ├── etudiants/         # Fiches et listing des dossiers étudiants
    │   ├── mon-profil/        # Espace étudiant (profil, carte QR)
    │   ├── carte-etudiant/    # Page publique de vérification de la carte (par jeton QR)
    │   ├── communiquer/       # Rédaction de communiqués (agents)
    │   ├── login/              # Authentification
    │   └── api/               # Endpoints (export Excel/CSV...)
    ├── lib/                   # Logique métier partagée (auth, permissions, students, ecolage...)
    ├── prisma/                # Schéma, migrations, script de seed
    ├── tests/
    │   ├── unit/              # Logique pure, sans base de données
    │   └── integration/       # Contre une vraie base Postgres de test
    ├── docker-compose.yml     # PostgreSQL local
    └── package.json
```

## Démarrage rapide

### Prérequis
- **Node.js 22** (version utilisée en CI)
- **Docker** (recommandé pour PostgreSQL) ou une instance PostgreSQL 16 locale

### Installation

```bash
git clone https://github.com/tinasoady/iugm-portail.git
cd iugm-portail/iugm
npm install
```

### 1. Configurer l'environnement

Créer un fichier **`iugm/.env.local`** (jamais commité) :

```bash
# Lu par Docker pour initialiser le conteneur PostgreSQL
POSTGRES_USER=iugm_admin
POSTGRES_PASSWORD=<mot_de_passe_fort>
POSTGRES_DB=iugm_scolarite_db

# URL de connexion utilisée par Prisma (écrite en clair : pas d'interpolation ${...})
DATABASE_URL="postgresql://iugm_admin:<mot_de_passe_fort>@localhost:5432/iugm_scolarite_db?schema=public"

# Clé de signature des cookies de session — générer une valeur aléatoire longue,
# par ex. avec : openssl rand -hex 32
AUTH_SECRET="<valeur_aléatoire_longue>"
```

### 2. Démarrer PostgreSQL

```bash
docker compose up -d
```

### 3. Appliquer les migrations et générer le client Prisma

```bash
npx prisma generate
npx prisma migrate dev
```

### 4. Peupler la base (compte superadmin)

```bash
npm run seed
```

Crée le compte `admin@iugm.edu` / `admin123` — **à changer immédiatement en production**.

### 5. Lancer le serveur de développement

```bash
npm run dev
```

Ouvrir [http://localhost:3000](http://localhost:3000).

## Variables d'environnement

| Variable | Requise | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | Chaîne de connexion PostgreSQL, lue par Prisma via `prisma/load-env.ts` |
| `AUTH_SECRET` | ✅ | Clé de signature des cookies de session (JWT) — longue et aléatoire, différente en production |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Docker uniquement | Initialisation du conteneur `docker-compose.yml` |

## Base de données (Prisma)

Modèles principaux (`prisma/schema.prisma`) : `User`, `Student`, `EnrollmentHistory`, `PreselectionCandidate`, `AcademicResult`, `Announcement` / `AnnouncementRead`, `Setting`, `Tariff`, `EcolagePayment`, `AuditLog`, `LoginAttempt`.

Commandes utiles :

```bash
npx prisma studio          # Explorer la base dans un navigateur
npx prisma migrate dev     # Nouvelle migration en développement
npx prisma migrate deploy  # Appliquer les migrations existantes (CI / prod)
```

## Tests

La suite [Vitest](https://vitest.dev) couvre deux niveaux :

- **Unitaires** (`tests/unit/`) : logique pure sans base de données (barème des mentions, requêtes de liste, regroupement, catalogue des permissions, présélection).
- **Intégration** (`tests/integration/`) : contre une **vraie base Postgres de test**, distincte de la base de développement — workflow d'inscription complet, réinscription (archivage), anti-bruteforce, périmètre par filière, écolage, carte QR, tendance du tableau de bord.

Mise en place (une seule fois) :

```bash
docker exec iugm_postgres_db createdb -U iugm_admin iugm_scolarite_test_db
cp .env.test.example .env.test   # ajuster le mot de passe si besoin
DATABASE_URL="<url de .env.test>" npx prisma migrate deploy
```

Lancer les tests :

```bash
npm test              # une passe, sortie CI
npm run test:watch    # mode interactif
npm run test:coverage # rapport de couverture (iugm/coverage/index.html)
```

## Intégration continue

`.github/workflows/ci.yml` s'exécute à chaque push/PR sur `main` : démarre un service PostgreSQL éphémère, puis vérifie les types (`tsc --noEmit`), le lint (ESLint), applique les migrations, lance la suite de tests complète et vérifie la compilation (`next build`).

## Scripts npm

| Commande | Effet |
|---|---|
| `npm run dev` | Serveur de développement (`next dev`) |
| `npm run build` | Build de production |
| `npm run start` | Sert le build de production |
| `npm run lint` | ESLint |
| `npm test` | Suite Vitest complète (une passe) |
| `npm run test:watch` | Vitest en mode interactif |
| `npm run test:coverage` | Rapport de couverture |
| `npm run seed` | Peuple la base (compte superadmin) |

## Sécurité

- Sessions stockées dans un **cookie HTTP-only signé** (`lib/auth.ts`), marqué `secure` en production.
- Mots de passe hachés avec `bcryptjs`.
- Anti-bruteforce sur les tentatives de connexion, par e-mail et par IP (`lib/rate-limit.ts`, `LoginAttempt`).
- Journal d'audit des actions sensibles (`AuditLog`).
- Fichiers uploadés par les utilisateurs (logo, photos) exclus de git (`public/uploads/`) — à sauvegarder séparément en production.
- Carte étudiante accessible via un **jeton QR opaque**, jamais le matricule ni l'identifiant interne.

---

## EN — University Enrollment & Academic Management (IUGM)

**iugm-portail** is a **Next.js + Prisma + PostgreSQL** web application that manages the full student lifecycle at IUGM: from preselected-candidate import to digital student ID cards, tuition payments, and academic results.

### Key features
- Explicit enrollment workflow: `ENREGISTRE → PAIEMENT_VERIFIE → ADMIN_VALIDEE → INSCRIT`, each step timestamped for dashboard reporting.
- Bulk **preselection import** (Excel) to prefill registration by name search.
- **Registration / re-enrollment** wizard with full history archiving on each re-enrollment.
- **Tuition (écolage)**: per-program configurable rates, one or two installments, automatic amount calculation, full payment history.
- **Academic results**: grade average out of 20 per semester with automatic mention/grading, conduct notes.
- **Digital student ID**: opaque, regenerable QR token, verifiable on a public page without login.
- **Targeted announcements** by program and/or level, with per-student read tracking.
- **Fine-grained, per-task permissions** and per-program scoping for staff accounts.
- **Audit log** and **login rate limiting** (by email and IP).
- **Database tools**: Excel import/export, filtered CSV export, institution settings.
- Persistent **light/dark theme**, no flash on load.

### Roles

| Role | Area | Can do |
|---|---|---|
| `SUPERADMIN` | `/admin` | Everything, incl. permissions, settings, tariffs, database import |
| `AGENT_ADMINISTRATION` | `/agent-admin` | Registration, re-enrollment, payment verification, tuition, exports |
| `AGENT_PEDAGOGIQUE` | `/agent-pedagogique` | Academic validation, results, conduct, receipts |
| `ETUDIANT` | `/mon-profil` | Profile, results, announcements, student card |

### Tech stack
Next.js 16 (App Router) · React 19 · Tailwind CSS 4 · PostgreSQL 16 + Prisma 7 · `bcryptjs` · `exceljs` · `qrcode` · Vitest · TypeScript · GitHub Actions CI.

> ⚠️ This project pins **Next.js 16**, whose API can differ from older versions — see `iugm/AGENTS.md` before making substantial changes.

### Quick start

```bash
git clone https://github.com/tinasoady/iugm-portail.git
cd iugm-portail/iugm
npm install
```

Create `iugm/.env.local`:

```bash
DATABASE_URL="postgresql://POSTGRES_USER:POSTGRES_PASSWORD@localhost:5432/iugm_scolarite_db?schema=public"
AUTH_SECRET="<long random string>"
```

```bash
docker compose up -d          # start PostgreSQL
npx prisma generate
npx prisma migrate dev
npm run seed                  # creates admin@iugm.edu / admin123
npm run dev                   # http://localhost:3000
```

### Tests

```bash
docker exec iugm_postgres_db createdb -U iugm_admin iugm_scolarite_test_db
cp .env.test.example .env.test
DATABASE_URL="<url from .env.test>" npx prisma migrate deploy

npm test              # single run, CI-style output
npm run test:watch    # interactive
npm run test:coverage # coverage report (iugm/coverage/index.html)
```

Unit tests (`tests/unit/`) run without a database; integration tests (`tests/integration/`) run against a real, separate Postgres test database. CI (`.github/workflows/ci.yml`) spins up its own ephemeral Postgres and runs the full suite (types, lint, migrations, tests, build) on every push/PR.

### Security
- Sessions stored in a signed **HTTP-only cookie**, `secure` in production.
- Passwords hashed with `bcryptjs`; login attempts rate-limited by email and IP.
- Sensitive actions recorded in an audit log.
- Student ID cards resolved through an opaque QR token — never the student ID or matricule.
