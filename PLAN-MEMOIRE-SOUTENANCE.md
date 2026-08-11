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

**Chiffres réels du projet, à citer tels quels (comptés dans le code, pas estimés) :**
- **34 jours** de développement (premier commit 2026-07-07, dernier 2026-08-10), **44 commits** répartis sur 19 jours d'activité distincts, organisés en **7 phases** identifiables (bootstrap → permissions → CI/CD → stabilisation → base de données/déploiement → corrections post-lancement → durcissement sécurité) — voir section J du journal technique pour le détail jour par jour, très utile pour le Chapitre 5 (organisation du projet) et pour montrer une vraie démarche itérative plutôt qu'un développement linéaire.
- **28 migrations Prisma**, du schéma initial (`User` seul) au schéma final à 13 modèles — voir section I, excellent support pour raconter l'évolution du modèle de données au Chapitre 5.
- **119 tests automatisés** (38 unitaires + 81 d'intégration) répartis sur 15 fichiers, exécutés sur une vraie base PostgreSQL de test — voir section K pour le détail fichier par fichier.
- **13 modèles Prisma** et **6 enums** dans le schéma final — voir section F pour le détail complet, à réutiliser pour le Chapitre 4.
- **22 pages, 14 fichiers de Server Actions, 3 routes API** — voir section G pour l'arborescence complète, à réutiliser pour le Chapitre 6 (une sous-section par fonctionnalité correspond presque toujours à un groupe de fichiers précis dans cette liste).

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
- **Modèle de données** : présente et commente le schéma complet à 13 modèles (`User`, `Student`, `EnrollmentHistory`, `PreselectionCandidate`, `AcademicResult`, `Announcement`/`AnnouncementRead`, `Setting`, `LevelFinancialInfo`, `EcolagePayment`, `AuditLog`, `LoginAttempt`) et 6 enums (`Role`, `StudentStatus`, `PreselectionCategory`, `Mention`, `AnnouncementKind`, `EcolagePaymentType`) — détail champ par champ en section F du journal technique. Un MCD/MLD ou le diagramme Prisma annoté. Note : le modèle `Tariff` a existé (migration du 15/07) puis a été entièrement remplacé par `LevelFinancialInfo` (migrations du 05/08) — une évolution de conception réelle et racontable plutôt qu'un détail à cacher.
- **Diagrammes de séquence** : le plus payant est celui du workflow d'inscription complet (les 4 statuts) et celui du paiement d'écolage (calcul de tranche depuis le tarif de la filière)
- **Architecture logicielle** : Next.js App Router + Server Actions (pas d'API REST classique pour les mutations), Prisma comme couche d'accès aux données, PostgreSQL, séparation `app/` (routes + UI) et `lib/` (logique métier)
- **Choix technologiques justifiés** : pourquoi Next.js 16 / React 19 / Prisma 7 avec `@prisma/adapter-pg`, pourquoi Tailwind 4, pourquoi `bcryptjs`, pourquoi `qrcode`, pourquoi `puppeteer-core` (génération d'impressions/reçus)
- **Conception de la sécurité** : cookie de session signé HTTP-only (`lib/auth.ts`), `secure` en production, hachage des mots de passe, `mustChangePassword` pour les comptes créés avec le matricule (ou générés) comme mot de passe initial, anti-bruteforce par email/IP, permissions par tâche plutôt que par rôle figé, défense en profondeur avec un contrôle par page/action complété d'un filet de sécurité global (`proxy.ts`, voir section A du journal technique)

---

## 5. PARTIE III — Réalisation et mise en œuvre (30-34 pages, le cœur du mémoire)

### Chapitre 5 — Environnement et organisation du projet (5 pages)
- Environnement de développement (Node.js 22, PostgreSQL 16 via Docker Compose pour la base locale — voir section M pour le fichier complet)
- Structure du dépôt (`app/`, `lib/`, `prisma/`) et logique de découpage par rôle (`admin/`, `agent-admin/`, `agent-pedagogique/`) — voir section G pour l'arborescence complète des 22 pages/14 actions/3 routes API, et section H pour l'inventaire des 20 fichiers `lib/`
- Gestion des migrations Prisma : les **28 migrations** (section I) sont un excellent indicateur de l'évolution réelle du projet, à exploiter dans le texte — ajout de l'audit log (2e migration du projet), des tarifs puis leur remplacement par `LevelFinancialInfo`, des permissions par tâche, du périmètre par filière, de la recherche trigram (puis son remplacement), des paiements d'écolage, du QR code étudiant, du système de présélection...
- Chronologie réelle du développement en 7 phases sur 34 jours (section J) — bien plus parlant qu'une simple liste de fonctionnalités, montre une vraie démarche itérative avec ses allers-retours (ex. la journée du 24/07 avec 9 commits pour stabiliser la CI)
- Variables d'environnement et configuration (`.env.local`, `.env.test`, voir aussi la fuite corrigée en section A)

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

**Point essentiel de rédaction :** pour chaque fonctionnalité, structure toujours en 3 temps — *le besoin*, *comment c'est implémenté* (avec un court extrait de code commenté, pas un pavé entier), *une capture d'écran de l'interface réelle*. C'est ce triptyque qui remplit les pages avec du contenu utile plutôt que du texte de remplissage. Pour retrouver rapidement les fichiers exacts de chaque fonctionnalité (page, Server Action, fonctions `lib/` associées), pars de la section G (arborescence des routes) et H (inventaire `lib/`) du journal technique plutôt que de rouvrir le code à chaque fois.

### Chapitre 7 — Tests, qualité et déploiement (7 pages)
- Stratégie de test à deux niveaux : unitaire (barème des mentions, construction des requêtes, permissions) et intégration (vraie base Postgres de test) — **119 tests au total (38 unitaires + 81 d'intégration) sur 15 fichiers**, détail fichier par fichier en section K
- Scénarios d'intégration les plus parlants : workflow d'inscription complet (`registration-workflow.test.ts`, 12 cas), réinscription avec archivage (`reenrollment.test.ts`, 11 cas), anti-bruteforce de connexion (`rate-limit.test.ts`), périmètre par formation (`permissions.test.ts`), évolution du tableau de bord (`dashboard.test.ts`), paiements d'écolage (`ecolage-payments.test.ts`), communiqués (`announcements.test.ts`)
- Intégration continue : pipeline GitHub Actions en 9 étapes exactes sur un service Postgres éphémère (`postgres:16-alpine`) à chaque push/PR sur `main` — détail complet en section L
- Déploiement et configuration : Vercel (build command `prisma migrate deploy && npm run build`, confirmé par le commit `4db556b`), Neon (Postgres managé), Vercel Blob (stockage fichiers) — détail en section M
- Difficultés techniques rencontrées et solutions concrètes : la section B liste 6 bugs réels avec leur vraie histoire de découverte (le bug `"[object Object]"` sur 1722 fiches en production est le plus riche à raconter), et la section J.2 liste les 5 commits `fix:` exacts avec leurs dates si tu veux les citer précisément

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

## Journal technique détaillé — matière brute à ne pas perdre

> Ce qui suit n'est pas rédigé pour être copié tel quel : c'est la mémoire brute et précise de ce qui a été fait, avec les noms de fichiers/fonctions et les chiffres réels, pour que tu puisses écrire tes propres phrases (voir la section "Pour que la rédaction sonne comme toi") sans avoir à retrouver ces détails de mémoire six mois plus tard. Classé par destination probable dans le plan.

### A. Pour le Chapitre 4 (Conception de la sécurité) — durcissement du portail après un audit

Un audit de sécurité complet a été mené sur le portail après sa mise en ligne, avec correction immédiate de chaque point :

- **En-têtes de sécurité HTTP** (`next.config.ts`) : Content-Security-Policy, `X-Frame-Options: DENY`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security`. Choix justifié : CSP *sans nonce* plutôt que via un `proxy.ts` — l'approche par nonce force le rendu dynamique sur toutes les pages, ce qui contredit le choix d'architecture déjà fait (pas de middleware, chaque page se protège elle-même). Un bon exemple de compromis technique à expliquer dans le mémoire.
- **Rate-limiting sur les exports** (`lib/rate-limit.ts`, fonction `checkActionRateLimit`) : au-delà du login, les routes `/api/students/export` et `/api/students/export-filtered` sont maintenant limitées (5 et 20 requêtes/5 min) pour freiner un compte compromis qui aspirerait toute la base.
- **Chiffrement du mot de passe initial en base** (`lib/secret-crypto.ts`) : `Student.initialPassword` était stocké en clair (imprimé sur le reçu, effacé au premier changement de mot de passe). Chiffré maintenant en AES-256-GCM, clé dérivée d'`AUTH_SECRET` via scrypt. Un script de migration (`scripts/encrypt-legacy-initial-passwords.ts`) a rattrapé les mots de passe déjà en clair pour les dossiers existants.
- **Fuite de secret sur GitHub** : le fichier modèle `.env.test.example` (volontairement suivi par git) contenait par erreur le vrai mot de passe du Postgres local au lieu d'un placeholder — corrigé, et le mot de passe rotate côté local (bon exemple pour la section "pourquoi ne jamais committer un `.env`").
- **Audit systématique des Server Actions** : chaque route/action revérifie son propre rôle et ses permissions (`getSession()` dans `lib/auth.ts`), audité fichier par fichier (14 fichiers `actions.ts`, toutes les pages `admin/agent-admin/agent-pedagogique`) pour vérifier qu'aucune n'a été oubliée — un seul fichier, `login/actions.ts`, n'a pas ce contrôle, normal puisque c'est la page de connexion elle-même.
- **Mot de passe admin en dur dans `prisma/seed.ts`** : le script de seed créait le compte `SUPERADMIN` avec un mot de passe fixe (`admin123`) écrit en clair dans le code source — donc visible par quiconque consultait le dépôt public sur GitHub, et potentiellement le vrai mot de passe de production si ce script avait servi à créer le compte réel. Corrigé : le script génère désormais un mot de passe aléatoire à usage unique (`generatePassword()`, déjà utilisée pour les comptes étudiants), affiché une seule fois en console, avec `mustChangePassword: true` pour forcer sa redéfinition à la première connexion — même mécanisme que les comptes étudiants créés avec le matricule comme mot de passe initial. Bon exemple pour la section "pourquoi ne jamais committer un identifiant réel, même dans un script d'outillage interne".
- **Ajout d'un filet de sécurité global (`proxy.ts`)** : l'architecture reposait entièrement sur le contrôle par page/action ci-dessus — solide tant qu'aucune n'est oubliée, mais rien ne le garantissait pour une future route. Ajout d'un `proxy.ts` à la racine (dans Next.js 16, `middleware.ts` a été renommé `proxy.ts` — même mécanisme, autre nom) qui bloque, en amont de toute page, l'accès à tout ce qui n'est pas explicitement public (`/login`, `/api/auth/login`, `/carte-etudiant/*`) si le cookie de session n'est pas valide. Contrôle volontairement "optimiste" (signature + expiration du cookie, sans requête base de données, conforme à la doc officielle Next.js sur l'authentification) : les vérifications fines de rôle et de permission restent dans chaque page/action, seules à avoir accès à la base pour les faire correctement. Un bon exemple à développer au Chapitre 4 : la défense en profondeur (*defense in depth*) plutôt qu'un unique point de contrôle, et une architecture de sécurité qui évolue avec la réflexion plutôt qu'un choix figé dès le départ.

### B. Pour le Chapitre 7 (Difficultés techniques rencontrées) — bugs réels, avec la vraie histoire de leur découverte

Ce sont les meilleures anecdotes pour ce chapitre, parce qu'elles montrent une vraie démarche de debug, pas juste "j'ai codé la fonctionnalité" :

1. **Le bug `"[object Object]"` dans l'import Excel** — le plus gros. La page « Base de données » affichait un message d'erreur alarmant après un import pourtant globalement réussi. En creusant (requêtes directes sur la base de production), il s'est avéré que `toText()` (`lib/preselection.ts`), la fonction qui convertit une cellule Excel en texte, avait un filet de sécurité incomplet : une forme de cellule non reconnue (ex. cellule fusionnée) faisait `String(cellule)`, donnant littéralement `"[object Object]"` comme donnée. **1722 fiches corrompues** ont été trouvées en base de production (968 « Dossiers existants » + 754 « Présélection »), dont 2 vrais dossiers étudiants avec un nom illisible. Corrigé, testé (nouveau test unitaire qui appelle `toText()` directement avec une valeur mal formée), avec un bouton de nettoyage ajouté pour purger les fiches corrompues non utilisées sans toucher aux dossiers déjà créés.
2. **Le bug de comptage qui mentait** : dans la même fonction d'import, le nombre de fiches "reliées avec succès" était incrémenté *avant* que l'écriture en base ait réellement réussi — un import pouvait donc afficher "968 relié(s)" alors qu'en réalité l'écriture avait échoué (contrainte d'unicité). Corrigé en déplaçant l'incrément après l'écriture.
3. **Le bug de contrainte unique sur le ré-import** (celui qui faisait échouer le CI) : `PreselectionCandidate.usedByStudentId` est unique en base (une fiche = un dossier). Mais un ré-import corrigé de la même personne essayait de relier une *deuxième* fiche au même dossier déjà créé — violation de contrainte. Pas une vraie erreur métier (le dossier existe déjà, c'est le but), donc traité comme un cas normal plutôt qu'une exception.
4. **Le montant dû à l'écolage figé à une moitié** : `listStudentsWithBalanceDue` calculait le reste dû comme `tarif_annuel / 2`, une valeur fixe, au lieu de `tarif_annuel - déjà_versé`. Un étudiant qui payait plus que le minimum requis à l'inscription se voyait quand même proposer de payer une "moitié" qui ne correspondait à rien de réel. Bon exemple pour illustrer une règle métier mal traduite en code.
5. **Le communiqué de bienvenue, mauvais point de déclenchement** : implémenté une première fois à la validation pédagogique de l'inscription, puis corrigé après clarification — un dossier peut être validé plusieurs jours avant que l'étudiant se connecte pour la première fois, donc le message n'a de sens qu'au premier login réel. Nouveau champ `User.firstLoginAt`, posé de façon atomique (`updateMany` conditionnel) pour garantir qu'un seul communiqué est jamais envoyé même en cas de connexions simultanées.
6. **Le déploiement Vercel n'appliquait pas les migrations Prisma automatiquement** : découvert en comparant l'état des migrations en local vs sur la base de production (Neon) via `prisma migrate status` — deux migrations restaient systématiquement en attente après chaque déploiement. Corrigé en configurant la commande de build Vercel (`npx prisma migrate deploy && npm run build`), un point à mentionner dans la partie déploiement/CI-CD.

### C. Pour le Chapitre 6 (Implémentation des fonctionnalités clés) — ajouts concrets

- **Accès rapide cliquable sur le tableau de bord superadmin** : les 4 cartes statistiques (Superadmin, Agents administration, Agents pédagogiques, Étudiants) filtrent maintenant la liste des utilisateurs par rôle au clic (`?role=X` en paramètre d'URL, ancre vers la section), avec mise en évidence visuelle de la carte active.
- **Solde d'écolage réellement calculé** et affiché après vérification du paiement d'inscription ("il reste X Ar à payer"), avec un formulaire de solde de tranche qui accepte maintenant un montant explicite (pré-rempli avec le vrai reste dû) au lieu d'un montant figé.
- **Bouton de nettoyage des fiches d'import non utilisées** (Base de données → Lots importés), scindé volontairement des fiches déjà liées à un dossier réel (jamais supprimées) pour rester une action sûre malgré son caractère destructeur.

### D. Pour le Chapitre 6/7 (Responsive et UX mobile)

- Testé sur téléphone réel par le maître de stage / toi-même : cartes statistiques trop hautes (empilées une par une sur petit écran), bouton de déconnexion difficile à trouver.
- Cause réelle du problème de déconnexion : pas un mauvais emplacement, mais une barre du haut surchargée sur mobile (sélecteurs année + niveau + thème + avatar tous entassés), qui noyait le petit avatar donnant accès au menu de déconnexion. Corrigé en masquant les sélecteurs sous le seuil `sm` (~640px) plutôt qu'en redessinant tout le header — un bon exemple de "corriger la vraie cause, pas le symptôme".
- Cartes passées à 2 colonnes dès le mobile (`grid-cols-2` au lieu de `sm:grid-cols-2`) sur les 4 tableaux de bord (Superadmin, Dossiers étudiants, Écolage, Pédagogie).

### E. Chiffres et éléments concrets à réutiliser tels quels

- **119 tests automatisés** (38 unitaires + 81 d'intégration, 15 fichiers), exécutés sur une vraie base PostgreSQL de test — chiffre exact recompté dans le code, détail en section K.
- CI GitHub Actions (`.github/workflows/ci.yml`) : 9 étapes (checkout, Node 22, install, `prisma generate`, `tsc --noEmit`, `eslint`, `prisma migrate deploy`, `vitest run`, `next build`), sur un service Postgres éphémère à chaque push — détail complet en section L.
- Déploiement : Vercel (hébergement + CD automatique au push sur `main`, build command `prisma migrate deploy && npm run build`) + Neon (PostgreSQL managé, déduit du commentaire dans le bug de migrations manquantes en section B.6) + Vercel Blob (stockage des fichiers uploadés — logo, photos de profil), migré depuis un stockage disque local (`public/uploads`) devenu impossible en environnement serverless.
- **34 jours de développement, 44 commits, 28 migrations Prisma, 13 modèles de données, 22 pages** — la panoplie de chiffres à citer en introduction du Chapitre 5 ou en conclusion pour donner une mesure concrète du travail accompli.

### F. Pour le Chapitre 4 (Modèle de données) — schéma complet, champ par champ

> Base-toi sur ce tableau pour rédiger la section "Modèle de données" sans avoir à rouvrir `prisma/schema.prisma`. Les enums d'abord, puis chaque modèle avec ses champs importants, ses relations et le commentaire métier qui justifie son existence.

**Enums**
- `Role` : `SUPERADMIN`, `AGENT_ADMINISTRATION`, `AGENT_PEDAGOGIQUE`, `ETUDIANT`.
- `StudentStatus` : `ENREGISTRE` (dossier créé) → `PAIEMENT_VERIFIE` (reçu bancaire vérifié) → `ADMIN_VALIDEE` (inscription administrative validée) → `INSCRIT` (validation pédagogique, compte créé) — le workflow central du portail.
- `PreselectionCategory` : `PRESELECTION` (nouveaux candidats L1 présélectionnés par l'université) / `EXISTING` (dossiers déjà existants, tout niveau) — distingue deux origines d'import pour qu'un ré-import de l'une n'écrase pas l'autre.
- `Mention` : `ECHEC` (<10), `PASSABLE` (10-<12), `ASSEZ_BIEN` (12-<14), `BIEN` (14-<16), `TRES_BIEN` (≥16).
- `AnnouncementKind` : `MANUAL`, `ADMISSION_NOTICE`, `WELCOME`.
- `EcolagePaymentType` : `TRANCHE_S1`, `TRANCHE_S2`, `TOTALITE` (mutuellement exclusifs pour une même année).

**Modèles**

| Modèle | Rôle métier | Champs/points clés |
|---|---|---|
| `User` | Authentification et profils de tous les rôles | `email` (unique), `passwordHash`, `mustChangePassword`, `active`, `firstLoginAt` (verrou du communiqué de bienvenue), `permissions: String[]` (tâches individuelles), `formation` (périmètre secrétaire), `role`, relations vers `auditLogs`, `studentFile`, `announcements` |
| `Student` | Dossier étudiant géré par les agents (distinct du compte `User`) | `matricule` (unique, format `FI{année}-{n}`), identité complète, CIN, bacc, contact, parents, garant, 10 champs Boolean de pièces du dossier, `status` (StudentStatus), `receiptVerifiedAt`/`pedagoValidatedAt` (horodatages dédiés pour le graphique), `account` (User? unique), `initialPassword` (chiffré), `qrToken` (unique) ; index trigram GIN sur 7 champs pour la recherche |
| `EnrollmentHistory` | Archive d'une année universitaire passée à la réinscription | Copie de `track`, `status`, `receiptNumber`, `receiptVerifiedAt`, `pedagoValidatedAt`, `docTranscript`, `docBlueFolder` — évite de perdre les événements passés du graphique quand le dossier `Student` est remis à zéro |
| `PreselectionCandidate` | Fiche importée en lot depuis un fichier Excel | `category`, `academicYear` (lot remplacé à chaque ré-import), champs miroir du formulaire d'inscription, `usedByStudent` (unique — une fiche = un dossier) |
| `AcademicResult` | Résultat académique assigné par l'agent pédagogique | `average` (Float/20), `mention` (calculée), `@@unique([studentId, academicYear, semester])` |
| `Announcement` / `AnnouncementRead` | Communiqués ciblés et suivi de lecture | `formation`/`level` (ciblage groupé) ou `studentId` (personnel, mutuellement exclusif), `kind`, `sourceAcademicYear` (dédoublonnage des avis auto), `@@unique([studentId, sourceAcademicYear, kind])` ; `AnnouncementRead` avec `@@unique([announcementId, userId])` |
| `Setting` | Paramètres établissement (clé/valeur) | `key` (@id), `value` (nom, adresse, logo en data URL...) |
| `LevelFinancialInfo` | Renseignements financiers par niveau (remplace l'ancien modèle `Tariff`) | `level` (unique, L1-M2), montants séparés national/étranger : inscription, assurance, polo, écolage annuel, premier versement |
| `EcolagePayment` | Versement d'écolage pour une année donnée | `type` (EcolagePaymentType), `amount`, `verifiedBy` ; `@@unique([studentId, academicYear, type])` — indépendant des horodatages `Student` qui ne retiennent que le tout premier versement |
| `AuditLog` | Journal des actions sensibles | `action` (ex. `LOGIN_SUCCESS`), `actor` (optionnel — un `LOGIN_FAILED` n'a pas d'acteur identifié) |
| `LoginAttempt` | Tentatives de connexion pour l'anti-bruteforce | `email`, `ip`, `success` ; index `[email, createdAt]` et `[ip, createdAt]` |

### G. Pour le Chapitre 6 (Implémentation) — arborescence complète des routes

**Pages (`app/**/page.tsx`, 22 au total)**

| Chemin | Fonction |
|---|---|
| `app/page.tsx` | Racine : redirige vers l'espace du rôle de session (ou `/login`) |
| `app/login/page.tsx` | Connexion publique |
| `app/changer-mot-de-passe/page.tsx` | Changement de mot de passe obligatoire |
| `app/profil/page.tsx` | « Mon compte » agents |
| `app/mon-profil/page.tsx` | Profil étudiant (dossier, carte, solde) |
| `app/mes-communiques/page.tsx` | Communiqués reçus par l'étudiant |
| `app/carte-etudiant/[token]/page.tsx` | Page publique de vérification QR code |
| `app/etudiants/page.tsx` | Liste paginée des dossiers (filtres, tri, export) |
| `app/etudiants/[studentId]/page.tsx` | Fiche détaillée d'un dossier |
| `app/etudiants/[studentId]/modifier/page.tsx` | Modification d'un dossier existant |
| `app/etudiants/imprimer/page.tsx` | Vue imprimable de la liste |
| `app/agent-admin/page.tsx` | Tableau de bord agent d'administration |
| `app/agent-admin/inscription/page.tsx` | Formulaire d'inscription (wizard) |
| `app/agent-admin/reinscription/page.tsx` | Formulaire de réinscription |
| `app/agent-admin/ecolage/page.tsx` | Suivi de l'écolage |
| `app/agent-pedagogique/page.tsx` | Tableau de bord agent pédagogique |
| `app/agent-pedagogique/recu/[studentId]/page.tsx` | Reçu d'inscription imprimable |
| `app/communiquer/page.tsx` | Rédaction des communiqués |
| `app/admin/page.tsx` | Tableau de bord superadmin |
| `app/admin/journal/page.tsx` | Journal d'audit |
| `app/admin/permissions/page.tsx` | Gestion rôles/permissions/formation |
| `app/admin/parametres/page.tsx` | Paramètres établissement |
| `app/admin/base-donnees/page.tsx` | Import Excel en lot |

**Server Actions (`app/**/actions.ts`, 14 fichiers)** : `login/actions.ts` (loginAction), `changer-mot-de-passe/actions.ts`, `profil/actions.ts` (update + upload photo), `admin/actions.ts` (createUser), `admin/permissions/actions.ts` (rôles/permissions/formation/reset password/suppression avec garde-fou dernier superadmin), `admin/parametres/actions.ts` (institution/logo/tarifs), `admin/base-donnees/actions.ts` (import/suppression de lot), `etudiants/actions.ts` (suppression, conduite), `etudiants/[studentId]/modifier/actions.ts`, `agent-admin/actions.ts` (paiement écolage, vérification paiement, validation admin, import CSV), `agent-admin/inscription/actions.ts` (recherche présélection, enregistrement), `agent-admin/reinscription/actions.ts`, `agent-pedagogique/actions.ts` (validation pédago, résultats), `communiquer/actions.ts`.

**Routes API (`app/api/**/route.ts`, 3 fichiers)** : `api/auth/login/route.ts` (POST, alternative HTTP à la Server Action de login), `api/students/export/route.ts` (GET, export CSV complet, rate-limité 5/5min, réservé tâche `csv`), `api/students/export-filtered/route.ts` (GET, export Excel de la liste filtrée, rate-limité 20/5min).

### H. Pour le Chapitre 4/6 — inventaire complet de `lib/` (20 fichiers)

| Fichier | Rôle |
|---|---|
| `auth.ts` | Session signée HMAC (cookie `iugm_session`, 8h), sans lib JWT externe |
| `prisma.ts` | Instance Prisma singleton avec adaptateur `@prisma/adapter-pg` |
| `settings.ts` | Paramètres établissement clé/valeur avec défauts |
| `formations.ts` | Catalogue des 7 filières (MGT, FC, CI, PGI, ECO, GRH, MC) |
| `academic-year-shared.ts` / `academic-year.ts` | Logique de l'année universitaire sélectionnée (pure + lecture cookie serveur) |
| `url.ts` | Déduction de l'origine absolue du site (pour le QR code) |
| `permissions.ts` | Catalogue de permissions par tâche + périmètre par formation |
| `level.ts` / `level-shared.ts` | Progression stricte L1→L2→L3→M1→M2 |
| `finance.ts` | Renseignements financiers par niveau, calcul du minimum d'inscription et de l'écolage annuel |
| `phone.ts` | Validation des numéros mobiles malgaches (10 chiffres, préfixes 032/033/034/037/038) |
| `dashboard.ts` | Agrégats mensuels (inscriptions, encaissement écolage) pour les graphiques |
| `rate-limit.ts` | Anti-bruteforce login (DB) + limiteur générique en mémoire pour actions sensibles |
| `secret-crypto.ts` | Chiffrement AES-256-GCM du mot de passe initial étudiant |
| `storage.ts` | Stockage de fichiers sur Vercel Blob |
| `audit.ts` | Écriture dans le journal d'audit, jamais bloquant |
| `preselection.ts` | Parsing/import Excel des fiches de présélection |
| `students.ts` | **Fichier le plus volumineux (1690 lignes)** : tout le cœur métier — inscription, réinscription, écolage, résultats, CSV, QR code |
| `announcements.ts` | Communiqués groupés/personnels, verrou du message de bienvenue |
| `login.ts` | `authenticateUser` : orchestration complète de la connexion |

### I. Pour le Chapitre 5 — historique complet des 28 migrations Prisma

| Date | Migration | Contenu |
|---|---|---|
| 14/07 | `init` | `Role`, table `User` |
| 14/07 | `add_audit_log` | Table `AuditLog` |
| 14/07 | `add_student_model` | `StudentStatus`, table `Student` |
| 14/07 | `add_academic_results` | `Mention`, table `AcademicResult`, `Student.department` |
| 14/07 | `full_student_registration` | Ajout massif des champs Student (identité, CIN, bacc, contact, parents) |
| 15/07 | `settings_and_tariffs` | Tables `Setting` et `Tariff` (Tariff sera supprimé plus tard) |
| 15/07 | `add_conduct` | `Student.conduct` |
| 15/07 | `inscription_administrative_fields` | Champs pièces du dossier et infos complémentaires |
| 15/07 | `initial_password` | `Student.initialPassword` |
| 15/07 | `must_change_password` | `User.mustChangePassword` |
| 15/07 | `user_active` | `User.active` |
| 17/07 | `enrollment_history` | Table `EnrollmentHistory` |
| 18/07 | `user_task_permissions` | `User.jobTitle`, `User.permissions` |
| 18/07 | `user_photo` | `User.photo` |
| 19/07 | `user_formation_scope` | `User.formation` |
| 19/07 | `announcements` | Tables `Announcement`, `AnnouncementRead` |
| 21/07 | `login_attempts` | Table `LoginAttempt` |
| 21/07 | `student_search_trgm_index` | Extension `pg_trgm` + 7 index GIN trigram sur `Student` |
| 24/07 | `student_step_timestamps` | Suppression des index trigram (remplacés plus loin) ; `receiptVerifiedAt`/`pedagoValidatedAt` |
| 24/07 | `enrollment_history_timestamps` | Mêmes horodatages sur `EnrollmentHistory` |
| 24/07 | `ecolage_payments` | `EcolagePaymentType`, table `EcolagePayment`, `Tariff.formation` |
| 28/07 | `student_qr_token` | `Student.qrToken` (unique) |
| 31/07 | `preselection_candidates` | Table `PreselectionCandidate` |
| 01/08 | `preselection_category` | `PreselectionCategory`, colonne `category` |
| 05/08 | `level_financial_info` | Table `LevelFinancialInfo` (remplace le concept de Tariff) |
| 05/08 | `drop_tariff` | Suppression définitive de `Tariff` |
| 05/08 | `reinscription_level_rules` | `AnnouncementKind` (MANUAL/ADMISSION_NOTICE), `kind`/`sourceAcademicYear`/`studentId` sur Announcement, `docTranscript`/`docBlueFolder` |
| 07/08 | `add_welcome_announcement_kind` | Valeur `WELCOME` ajoutée à `AnnouncementKind` |
| 07/08 | `add_user_first_login_at` | `User.firstLoginAt` |

### J. Pour le Chapitre 5 — historique git complet (44 commits, 34 jours, 7 phases)

1. **Bootstrap et template UI (07-07 → 07-16, 6 commits)** : commit initial, intégration d'un template UI/UX, premiers ajustements de menu et de l'espace admin.
2. **Fonctionnalités et permissions (07-18 → 07-22, 4 commits)** : introduction du système de permissions/rôles, première "version 1.0" fonctionnelle.
3. **Mise en place CI/CD (24/07, 9 commits en une seule journée)** : plusieurs itérations pour stabiliser le workflow GitHub Actions ("change with action", "version 2", "change file ci.yml"), correction d'un bug de génération Prisma en CI et d'un bug du graphique d'évolution, puis ajout de la suite Vitest câblée en CI — journée dense, bon exemple de "faire fonctionner un pipeline CI par itérations successives" pour le Chapitre 5 ou 7.
4. **Stabilisation et ajustements (07-25 → 08-03, 6 commits)** : retouches de graphiques, ajustements généraux, début de la rédaction du plan de mémoire, une itération explicite après un point d'encadrement.
5. **Structuration base de données et préparation déploiement (05-08 → 06-08, 6 commits)** : restructuration du schéma, revue de code, premières versions "vercel v1.0".
6. **Corrections post-déploiement (07/08, 8 commits en une journée)** : correction de la fuite du mot de passe local, ajout du communiqué de bienvenue (avec sa propre correction de point de déclenchement le jour même), correctifs responsive mobile et bug CI de ré-import.
7. **Durcissement sécurité (10/08, 3 commits, phase la plus récente)** : ajout du filet de sécurité global `proxy.ts` et mise à jour du plan mémoire.

**Les 5 commits `fix:` exacts, avec dates :**
1. 24/07 `584c966` — corrige le graphique d'évolution et la génération Prisma en CI
2. 24/07 `f943e8d` — force le rendu dynamique de `/login` pour le build CI
3. 07/08 `c3a30ec` — retire le vrai mot de passe local du fichier modèle `.env.test.example`
4. 07/08 `da55e08` — bug CI ré-import + communiqué de bienvenue + responsive mobile
5. 07/08 `f19f33a` — déclenche le communiqué de bienvenue à la première connexion, pas à l'inscription

### K. Pour le Chapitre 7 — inventaire détaillé des 119 tests

**Unitaires — `tests/unit/` (5 fichiers, 38 cas)** : `students.test.ts` (9), `permissions.test.ts` (4), `group-students.test.ts` (6), `phone.test.ts` (6), `preselection.test.ts` (13).

**Intégration — `tests/integration/` (10 fichiers, 81 cas)** : `update-student.test.ts` (3), `preselection.test.ts` (11), `student-qr.test.ts` (4), `dashboard.test.ts` (9), `permissions.test.ts` (7), `registration-workflow.test.ts` (12), `announcements.test.ts` (9), `reenrollment.test.ts` (11), `ecolage-payments.test.ts` (10), `rate-limit.test.ts` (5).

Support (pas des suites de tests) : `tests/setup/db.ts`, `tests/setup/load-test-env.ts`, `tests/setup/factories.ts`.

### L. Pour le Chapitre 7 — pipeline CI complet (`.github/workflows/ci.yml`)

Nom : `CI - Verification & Build`, déclenché sur `push`/`pull_request` vers `main`/`master`, job unique `build-and-check` sur `ubuntu-latest`, avec un service `postgres:16-alpine` éphémère (utilisateur/mot de passe/base `iugm_test`, healthcheck `pg_isready`). Étapes exactes dans l'ordre :
1. Récupérer le code source (`actions/checkout@v4`)
2. Configurer Node.js 22 (`actions/setup-node@v4`)
3. `npm install`
4. `npx prisma generate`
5. `npx tsc --noEmit`
6. `npm run lint` (ESLint)
7. `npx prisma migrate deploy` (sur la base de test éphémère)
8. `npm run test` (`vitest run`)
9. `npm run build` (`next build`)

### M. Pour le Chapitre 4/7 — configuration de sécurité et déploiement

**`next.config.ts`** (en-têtes appliqués à toutes les routes) : Content-Security-Policy sans nonce (choix justifié en commentaire dans le fichier : un nonce exigerait un rendu dynamique forcé partout, ce qui contredit la stratégie de contrôle par page/action), avec `'unsafe-inline'` nécessaire pour le script d'init du thème et les styles inline d'un composant de graphique, `img-src` autorisant explicitement `https://*.public.blob.vercel-storage.com`, `frame-ancestors 'none'` + `X-Frame-Options: DENY` (double anti-clickjacking), `Permissions-Policy` désactivant caméra/micro/géolocalisation/paiement, `Strict-Transport-Security` (2 ans, sous-domaines inclus), et `bodySizeLimit: "10mb"` sur les Server Actions pour les uploads de fichiers.

> **À corriger dans le code, pas seulement dans le mémoire** : le commentaire de `next.config.ts` dit encore "pas de middleware, chaque page/action se protège elle-même" — une phrase qui datait d'avant l'ajout de `proxy.ts` (voir section A) et n'est plus exacte. Pense à la mettre à jour, ou demande-moi de le faire, pour éviter une incohérence si le jury compare le commentaire et le code réel.

**Déploiement** : Vercel (pas de `vercel.json`, configuration par défaut détectée automatiquement), build command confirmée par le commit `4db556b` : `prisma migrate deploy && npm run build`. Base de données : Neon (Postgres managé). Stockage fichiers : Vercel Blob.

**`docker-compose.yml`** (développement local uniquement) : un unique service `db` (`postgres:16-alpine`), nommé `iugm_postgres_db`, configuré via `.env.local` (volontairement sans bloc `environment:` explicite — un commentaire dans le fichier explique pourquoi : éviter que Compose interpole depuis un `.env` inexistant et écrase les valeurs), port `5432` exposé, volume nommé persistant `iugm_db_data`.

---

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
