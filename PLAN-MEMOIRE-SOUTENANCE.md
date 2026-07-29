# Plan de rédaction — Mémoire de soutenance de stage (IUGM Portail)

> Objectif : ≥ 70 pages utiles. Le découpage ci-dessous, rempli honnêtement (captures d'écran, diagrammes, extraits de code commentés, tableaux de tests), tombe naturellement autour de 80-90 pages sans remplissage artificiel — tu as de la marge.

---

## 0. Ce qui rend ce mémoire crédible (à garder en tête tout du long)

Ton projet a un vrai contenu technique et fonctionnel, donc le mémoire ne doit pas rester générique. Les éléments qui donnent du poids et de la crédibilité :

- Un **workflow métier réel en 4 étapes** : `ENREGISTRE → PAIEMENT_VERIFIE → ADMIN_VALIDEE → INSCRIT` (enum `StudentStatus`), avec des horodatages dédiés (`receiptVerifiedAt`, `pedagoValidatedAt`) plutôt qu'un simple journal — un vrai choix de conception que tu peux justifier.
- **4 rôles avec périmètres différents** : `SUPERADMIN`, `AGENT_ADMINISTRATION`, `AGENT_PEDAGOGIQUE`, `ETUDIANT`, chacun redirigé vers son propre espace (`/admin`, `/agent-admin`, `/agent-pedagogique`, `/mon-profil`), avec en plus un **système de permissions granulaires par tâche** (tableau `permissions: String[]` sur `User`) et un **périmètre par filière** (`formation`) pour les agents.
- Une **logique métier non triviale sur l'écolage** : tarif annuel par filière, paiement en deux tranches semestrielles OU en totalité (mutuellement exclusifs), avec une contrainte d'unicité `[studentId, academicYear, type]`.
- Une **réinscription qui archive l'historique** (`EnrollmentHistory`) sans perdre les événements passés pour le graphique du tableau de bord — un vrai problème d'ingénierie que tu as résolu.
- Une **carte étudiante numérique par QR code**, avec un jeton opaque dédié (`qrToken`), pas le matricule ni l'ID — un choix de sécurité que tu peux expliquer et justifier.
- De la **sécurité concrète** : cookie de session signé HTTP-only, hachage bcrypt, anti-bruteforce (`LoginAttempt`), journal d'audit (`AuditLog`).
- Une **vraie stratégie de tests** : unitaires (Vitest, logique pure) + intégration sur une vraie base Postgres de test (workflow complet, anti-bruteforce, périmètre par formation), + CI GitHub Actions.

Utilise ces points comme fil rouge : ils justifient chaque page technique et évitent l'effet "copié-collé de cours".

---

## 1. Pages liminaires (~6-8 pages)

- Page de garde
- Dédicace (optionnelle, 1 page si tu veux)
- Remerciements (1 page — nomme réellement ton maître de stage, ton tuteur pédagogique, l'équipe de l'IUGM)
- Sommaire
- Liste des abréviations et sigles (CIN, IUGM, ORM, CI/CD, MCD, UML, QR, etc.)
- Liste des figures et tableaux (à remplir en dernier)
- Avant-propos (optionnel, si tu veux situer ton parcours avant le stage)

**Point essentiel :** ces pages sont courtes mais comptent dans la pagination totale — ne les bâcle pas, un jury les regarde en premier.

---

## 2. Introduction générale (2-3 pages)

Points à couvrir :
- Contexte général : la gestion des inscriptions universitaires, souvent encore manuelle/papier, ses limites (erreurs de saisie, perte de dossiers, difficulté de suivi des paiements d'écolage, absence de traçabilité).
- Présentation en une phrase de l'IUGM et du service d'accueil.
- Problématique : comment moderniser et sécuriser tout le cycle inscription → validation → suivi de scolarité → paiement, pour plusieurs profils d'utilisateurs avec des droits différents ?
- Objectifs du stage et du projet (ce que le portail doit résoudre concrètement).
- Annonce du plan (les 4 parties).

---

## 3. PARTIE I — Cadre général du stage (12-14 pages)

### Chapitre 1 — Présentation de l'organisme d'accueil (6 pages)
- Historique et missions de l'IUGM
- Organisation administrative et pédagogique (organigramme)
- Présentation du service où tu as été affecté·e
- Déroulement du stage : dates, durée, planning des missions confiées, méthode de travail avec ton maître de stage
- Outils déjà en place avant ton arrivée (registres papier, Excel, etc. — sers-toi de ce que tu as vraiment observé)

### Chapitre 2 — Cadrage et analyse des besoins (8 pages)
- Étude de l'existant : comment se faisait l'inscription avant le portail, ses limites concrètes (celles que tu as constatées sur le terrain, pas des généralités)
- Objectifs fonctionnels du projet
- Recensement des acteurs et de leurs besoins :
  - **Superadmin** : gestion des utilisateurs, des tarifs, des paramètres de l'établissement, des permissions
  - **Agent d'administration** : inscription, réinscription, vérification des paiements, suivi de l'écolage
  - **Agent pédagogique** : validation pédagogique, saisie des résultats/mentions, appréciation de conduite, communiqués
  - **Étudiant** : consultation du profil, carte étudiante numérique, communiqués, changement de mot de passe
- Besoins non fonctionnels : sécurité, traçabilité (audit), performance de recherche, disponibilité
- Cahier des charges synthétique (tableau des exigences)

---

## 4. PARTIE II — Analyse et conception (16-18 pages)

### Chapitre 3 — Méthodologie et spécification (6 pages)
- Démarche adoptée (itérative, fonctionnalité par fonctionnalité — décris ce que tu as réellement fait)
- Diagrammes de cas d'utilisation, un par rôle (4 diagrammes)
- Description textuelle des cas d'utilisation principaux (inscription, réinscription, validation pédagogique, paiement d'écolage)

### Chapitre 4 — Conception détaillée (12 pages)
- **Modèle de données** : présente et commente le schéma (`User`, `Student`, `EnrollmentHistory`, `AcademicResult`, `Announcement`/`AnnouncementRead`, `Setting`, `Tariff`, `EcolagePayment`, `AuditLog`, `LoginAttempt`) — un MCD/MLD ou le diagramme Prisma annoté
- **Diagrammes de séquence** : le plus payant est celui du workflow d'inscription complet (les 4 statuts) et celui du paiement d'écolage (calcul de tranche depuis le tarif de la filière)
- **Architecture logicielle** : Next.js App Router + Server Actions (pas d'API REST classique pour les mutations), Prisma comme couche d'accès aux données, PostgreSQL, séparation `app/` (routes + UI) et `lib/` (logique métier)
- **Choix technologiques justifiés** : pourquoi Next.js 16 / React 19 / Prisma 7 avec `@prisma/adapter-pg`, pourquoi Tailwind 4, pourquoi `bcryptjs`, pourquoi `qrcode`, pourquoi `puppeteer-core` (génération d'impressions/reçus)
- **Conception de la sécurité** : cookie de session signé HTTP-only (`lib/auth.ts`), `secure` en production, hachage des mots de passe, `mustChangePassword` pour les comptes créés avec le matricule comme mot de passe initial, anti-bruteforce par email/IP, permissions par tâche plutôt que par rôle figé

---

## 5. PARTIE III — Réalisation et mise en œuvre (30-34 pages, le cœur du mémoire)

### Chapitre 5 — Environnement et organisation du projet (5 pages)
- Environnement de développement (Node.js, PostgreSQL, Docker Compose pour la base locale)
- Structure du dépôt (`app/`, `lib/`, `prisma/`) et logique de découpage par rôle (`admin/`, `agent-admin/`, `agent-pedagogique/`)
- Gestion des migrations Prisma (liste chronologique de tes migrations = un excellent indicateur de l'évolution réelle du projet, à exploiter dans le texte : ajout de l'audit log, des tarifs, des permissions par tâche, du périmètre par filière, de la recherche trigram, des paiements d'écolage, du QR code étudiant...)
- Variables d'environnement et configuration (`.env.local`, `.env.test`)

### Chapitre 6 — Implémentation des fonctionnalités clés (18-20 pages, une sous-section par fonctionnalité avec captures d'écran)
1. Authentification par rôle et redirection selon le rôle
2. Gestion des utilisateurs et des permissions granulaires (page Permissions, périmètre par formation)
3. Processus d'inscription administrative (formulaire multi-étapes / wizard, pièces du dossier : certificat de résidence, CIN, photos, bordereau de versement...)
4. Réinscription et archivage de l'historique de scolarité
5. Validation pédagogique, saisie des résultats académiques et calcul automatique de la mention (barème /20)
6. Gestion des tarifs et suivi de l'écolage (tranches semestrielles vs paiement total, reçu, agent qui a vérifié)
7. Carte étudiante numérique et QR code (génération, sécurité du jeton, page publique de vérification)
8. Communiqués ciblés par filière/niveau et suivi de lecture
9. Tableau de bord et statistiques (graphique d'évolution des inscriptions, cartes de synthèse)
10. Journal d'audit des actions sensibles

**Point essentiel de rédaction :** pour chaque fonctionnalité, structure toujours en 3 temps — *le besoin*, *comment c'est implémenté* (avec un court extrait de code commenté, pas un pavé entier), *une capture d'écran de l'interface réelle*. C'est ce triptyque qui remplit les pages avec du contenu utile plutôt que du texte de remplissage.

### Chapitre 7 — Tests, qualité et déploiement (7 pages)
- Stratégie de test à deux niveaux : unitaire (barème des mentions, construction des requêtes, permissions) et intégration (vraie base Postgres de test)
- Scénarios d'intégration les plus parlants : workflow d'inscription complet, réinscription avec archivage, anti-bruteforce de connexion, périmètre par formation, évolution du tableau de bord
- Intégration continue (GitHub Actions, service Postgres éphémère à chaque push/PR)
- Déploiement et configuration (Docker, Prisma migrate deploy)
- Difficultés techniques rencontrées et solutions concrètes (raconte de vraies galères : ex. la contrainte d'unicité sur les paiements d'écolage, la nécessité de copier les horodatages avant réinscription pour ne pas casser le graphique, etc.)

---

## 6. PARTIE IV — Bilan et perspectives (6-7 pages)

### Chapitre 8 — Bilan du stage (5 pages)
- Apports techniques (ce que tu as réellement appris : Next.js App Router, Server Actions, Prisma, tests d'intégration...)
- Apports méthodologiques et humains (travail avec une équipe, gestion du temps, communication avec le maître de stage)
- Difficultés rencontrées, pas seulement techniques (organisationnelles, de recueil des besoins, etc.)
- Perspectives d'évolution du portail (ce qui reste à faire — appuie-toi sur ton `TODO.md` et sur ce que tu vois manquer : notifications, exports/statistiques avancées, application mobile, etc.)

### Conclusion générale (2 pages)
- Synthèse du travail accompli, réponse à la problématique posée en introduction, ouverture

---

## 7. Annexes (8-12 pages)

- Diagramme de classes / modèle de données complet en pleine page
- Diagrammes de cas d'utilisation et de séquence complets
- Extraits significatifs du schéma Prisma ou du code
- Captures d'écran supplémentaires (toutes les interfaces principales, une par rôle)
- Glossaire des termes métier (écolage, matricule, mention, tranche, etc.)
- Table des matières détaillée

## Bibliographie / Webographie (1 page)

Documentation officielle Next.js, Prisma, PostgreSQL, éventuels articles/cours suivis.

---

## Estimation des pages

| Section | Pages |
|---|---|
| Pages liminaires | 6-8 |
| Introduction générale | 2-3 |
| Partie I | 12-14 |
| Partie II | 16-18 |
| Partie III | 30-34 |
| Partie IV | 6-7 |
| Annexes | 8-12 |
| Bibliographie | 1 |
| **Total** | **~80-95** |

Tu as donc naturellement de la marge au-dessus des 70 pages, à condition de vraiment illustrer (captures d'écran, diagrammes, tableaux) plutôt que de délayer le texte.

---

## Pour que la rédaction sonne comme toi (et pas comme un texte généré)

- Écris à partir de **ce que tu as vécu** : dates réelles, nom de ton maître de stage, anecdotes précises ("au début je confondais Server Action et route API, jusqu'à ce que...", "la contrainte d'unicité sur les paiements m'a fait découvrir tel bug..."). Le vécu concret est ce qu'un détecteur — et un jury — reconnaît le moins comme générique, parce que ça ne peut littéralement venir que de toi.
- Varie la longueur des phrases. Un texte généré a tendance à avoir un rythme très régulier ; alterne des phrases courtes et longues comme à l'oral.
- Évite les tics de rédaction "IA" : "il convient de noter que", "en outre", "il est important de souligner que", les listes à puces systématiques pour tout. Remplace par des transitions plus naturelles ("ce choix pose un problème : ...", "concrètement, cela veut dire que...").
- Justifie tes choix techniques avec tes propres mots et tes propres arbitrages, pas des définitions de cours recopiées (ex : n'explique pas ce qu'est Prisma en général, explique *pourquoi tu l'as choisi ici* et *ce que ça t'a évité*).
- Relis à voix haute — les formulations trop lisses ou trop symétriques s'entendent immédiatement et c'est là qu'il faut réécrire dans tes mots.
- Fais relire par ton maître de stage ou un collègue : ses corrections orales, si tu les intègres, ancrent le texte dans une vraie conversation plutôt que dans un monologue plat.



Le plan est enregistré dans [PLAN-MEMOIRE-SOUTENANCE.md](PLAN-MEMOIRE-SOUTENANCE.md) à la racine du dépôt — tu peux le éditer directement au fur et à mesure que tu rédiges.
