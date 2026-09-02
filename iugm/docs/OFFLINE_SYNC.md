# Mode hors ligne, synchronisation automatique et app shell installable

Le portail est majoritairement un site classique server-first (App Router,
Server Actions, aucune donnée en base côté client) : sans réseau, il ne
fonctionne pas. Sur le terrain — un agent d'administration qui inscrit des
étudiants ou enregistre un versement d'écolage dans une zone où la connexion
est intermittente — c'est un vrai problème. Ce document explique le
mécanisme ajouté pour que ces saisies restent possibles hors ligne, avec
synchronisation automatique dès que le réseau revient, ainsi que l'app shell
qui permet désormais d'ouvrir l'application elle-même sans réseau.

## Ce qui est couvert, et ce qui ne l'est pas

**Couvert** :
- Le formulaire d'inscription (`app/agent-admin/inscription/wizard.tsx`) et
  la recherche de candidats qui le précède (`search-entry.tsx`). Si le
  navigateur est hors ligne, le dossier est stocké localement (IndexedDB) au
  lieu d'échouer, et envoyé automatiquement au serveur dès que la connexion
  revient. La recherche par nom fonctionne aussi hors ligne, sur un cache
  local des fiches de présélection tenu à jour pendant que l'agent est en
  ligne (voir § Recherche hors ligne ci-dessous).
- Le versement de la 2e tranche d'écolage
  (`app/agent-admin/ecolage/tranche2-form.tsx`), même principe.
- **L'ouverture de l'application hors ligne** (app shell), mais uniquement
  pour les pages `/agent-admin`, `/agent-admin/inscription` et
  `/agent-admin/ecolage` — voir § App shell ci-dessous pour la raison de ce
  périmètre restreint.

**Non couvert, par choix, pour l'instant** :
- **Les autres écrans d'écriture** (réinscription, vérification de paiement à
  l'inscription, validation pédagogique...). Le mécanisme est générique et
  s'étend facilement (voir plus bas), mais seuls les deux cas d'usage les
  plus probables sur le terrain — inscription et 2e tranche d'écolage — ont
  été câblés.
- **Le chargement hors ligne du reste de l'application** (dossiers
  étudiants, admin...). Ces pages affichent des données personnelles
  d'étudiants ; les mettre en cache navigateur soulèverait un vrai risque
  (données visibles hors ligne sur un poste partagé, cache qui devient
  obsolète) pour un bénéfice bien moindre que les écrans de saisie sur le
  terrain. Le service worker ne les intercepte donc jamais : elles se
  comportent exactement comme avant (indisponibles sans réseau).
- **Résolution de conflits multi-agents.** Si deux agents créaient le même
  dossier hors ligne en même temps (cas très improbable : un agent = un poste
  = une session), le second à synchroniser recevrait une erreur métier
  normale (ex. conflit sur une contrainte d'unicité) plutôt qu'une fusion
  automatique. Volontairement simple : le coût d'une vraie résolution de
  conflit (CRDT, vector clocks) n'est pas justifié pour ce volume d'usage.

## Comment ça marche (file de mutations)

```
┌───────────────────────┐        hors ligne        ┌──────────────────────┐
│ Formulaire             │ ───────────────────────▶ │ File locale (Dexie/  │
│ (wizard.tsx,           │   queueMutation()         │ IndexedDB)            │
│  tranche2-form.tsx)    │                           │ lib/offline/db.ts     │
└───────────────────────┘                           └──────────┬───────────┘
                                                                 │ retour réseau
                                                                 │ (événement "online")
                                                                 ▼
                                                      ┌──────────────────────┐
                                                      │ syncPendingMutations  │
                                                      │ lib/offline/sync.ts   │
                                                      └──────────┬───────────┘
                                                                 │ POST JSON, un par un,
                                                                 │ dans l'ordre de saisie
                                                                 ▼
                                                      ┌──────────────────────┐
                                                      │ /api/sync/mutations   │
                                                      │ (idempotent, dédup    │
                                                      │  via SyncedMutation)  │
                                                      └──────────┬───────────┘
                                                                 ▼
                                                    submitInscription() /
                                                    submitEcolagePayment()
                                                    (mêmes fonctions que la
                                                     soumission en ligne)
```

### 1. Détection et mise en file (`lib/offline/db.ts`, `lib/offline/sync.ts`)

Une base IndexedDB locale (via [Dexie](https://dexie.org)) contient un store
`mutations` (générique, un type par écran couvert — voir `MutationType`) et
un store `candidates` (cache de recherche, voir plus bas). Chaque mutation a
un `id` : un UUID généré **côté client** au moment de la saisie — c'est la
clé qui garantit plus tard qu'elle n'est jamais appliquée deux fois.

Dans `wizard.tsx` et `tranche2-form.tsx`, le `<form>` garde son
fonctionnement normal (`action={formAction}`) mais gagne un `onSubmit` qui
vérifie `navigator.onLine` : si hors ligne, il annule la soumission
(`preventDefault()`) et appelle `queueMutation(type, values)` à la place.
L'agent voit un écran de confirmation propre à ce cas, **sans matricule**
pour une inscription : contrairement au flux en ligne, le matricule n'est
pas encore attribué à ce stade (voir § matricule ci-dessous).

### 2. Retour du réseau (`startOfflineSync`)

`app/ui/offline-sync-status.tsx` est monté une fois dans `AppShell`, donc
actif sur tout l'espace connecté. Il :
- affiche un bandeau (ambre hors ligne, indigo pendant la synchronisation) ;
- appelle `startOfflineSync()` une seule fois, qui écoute l'événement
  navigateur `online` et déclenche `syncPendingMutations()`.

`syncPendingMutations()` rejoue la file **dans l'ordre de saisie**
(important pour l'inscription : voir § matricule) et un item à la fois —
jamais en parallèle.

### 3. Le serveur (`app/api/sync/mutations/route.ts`)

Une route API (pas une Server Action : plus simple à appeler depuis un
`fetch` déclenché par un événement navigateur plutôt que par une vraie
soumission de formulaire) qui :
1. revérifie la session (`getSession()`) — si elle a expiré pendant que
   l'agent était hors ligne, la synchronisation échoue proprement et la
   mutation reste en file avec un message d'erreur, à réessayer après
   reconnexion ;
2. vérifie l'idempotence : le `id` envoyé existe-t-il déjà dans la table
   `SyncedMutation` ? Si oui, renvoie un succès sans rien refaire ;
3. délègue le vrai travail à `MUTATION_HANDLERS[type]`, qui appelle la même
   fonction métier que la soumission en ligne équivalente
   (`submitInscription`, `submitEcolagePayment`) — pour que les deux chemins
   appliquent exactement les mêmes règles ;
4. enregistre la mutation dans `SyncedMutation` et trace l'événement dans le
   journal d'audit (`OFFLINE_MUTATION_SYNCED`).

### Pourquoi le matricule n'est jamais généré côté client

Le matricule (`FI{année}-{n}`) est numéroté séquentiellement
(`createWithGeneratedMatricule`, `lib/students.ts`). Le générer côté client
pendant la saisie hors ligne créerait un vrai risque de collision : deux
agents hors ligne au même moment pourraient produire le même numéro. Le choix
retenu est plus simple et plus sûr : **le matricule n'existe pas tant que le
dossier n'est pas synchronisé**, il est attribué par le serveur au moment de
la synchronisation, dans l'ordre d'arrivée réel.

### Gestion des erreurs

- **Erreur réseau pendant la synchronisation elle-même** (la connexion
  retombe entre deux mutations de la file) : la mutation en cours repasse en
  statut `pending`, la boucle s'arrête, `startOfflineSync` la relancera au
  prochain événement `online`. Rien n'est perdu.
- **Erreur métier** (ex. champ obligatoire manquant détecté côté serveur,
  périmètre de formation invalide) : la mutation passe en statut `error` avec
  le message renvoyé par le serveur, reste visible dans le bandeau (compteur
  « en attente »), et n'est plus retentée automatiquement — il n'y a pas de
  correction automatique possible, seul l'agent peut trancher.

## Recherche hors ligne (`lib/offline/candidates.ts`)

Sans réseau, le formulaire d'inscription ne sert à rien si l'agent ne peut
pas d'abord retrouver le candidat dans la présélection. `search-entry.tsx`
recharge donc un cache local complet (`getPreselectionCacheAction`, store
`candidates` d'IndexedDB) au montage de la page et à chaque retour réseau —
jamais hors ligne. Tant que `navigator.onLine` est vrai, la recherche et le
pré-remplissage passent par le serveur comme avant (données toujours à
jour) ; hors ligne, ils basculent sur ce cache local
(`searchCachedCandidates`, `getCachedCandidate`).

Limite assumée : un candidat importé *pendant* que l'agent est hors ligne
n'apparaîtra dans sa recherche qu'après reconnexion (le cache n'est
rafraîchi qu'en ligne). Sans incidence pratique : un import se fait depuis
`/admin/base-donnees`, par le superadmin, pas sur le terrain.

## App shell hors ligne (service worker)

`public/sw.js` (enregistré par `app/ui/service-worker-registration.tsx`,
monté dans `app/layout.tsx`) permet d'ouvrir l'application sans réseau, pas
seulement de continuer à l'utiliser si l'onglet était déjà ouvert. Portée
**volontairement restreinte** à `PAGE_SCOPE` dans `sw.js`
(`/agent-admin`, `/agent-admin/inscription`, `/agent-admin/ecolage`) : ce
sont les seules pages qu'un agent doit pouvoir ouvrir à froid, sans réseau,
pour rester productif sur le terrain. Le reste de l'application (dossiers
étudiants, écrans d'administration...) n'est jamais intercepté ni mis en
cache — ces pages affichent des données personnelles d'étudiants, et un
cache navigateur obsolète ou consultable sur un poste partagé serait un vrai
risque de sécurité, pas justifié pour ces écrans-là.

Deux caches :
- `iugm-static-v1` (cache-first) : JS/CSS/polices, tous fingerprintés par
  Next (nom de fichier différent à chaque build) — jamais périmés, jamais
  besoin d'invalidation explicite.
- `iugm-pages-v1` (network-first) : HTML des pages de `PAGE_SCOPE`
  uniquement, toujours la version réseau quand elle répond ; la version en
  cache ne sert que si le réseau échoue.

Les routes `/api/*` ne sont jamais interceptées : un `fetch` qui échoue
naturellement (pas de réseau) est exactement ce qu'attend la logique hors
ligne décrite plus haut.

`public/manifest.json` rend l'app installable (icône, lancement en plein
écran) — un critère noté explicitement par l'audit PWA de Lighthouse.

## Étendre à un autre écran

Pour ajouter un nouveau type de mutation hors ligne (déjà fait une fois pour
l'écolage, à réutiliser comme modèle) :
1. extraire la logique métier de la Server Action existante dans une
   fonction partagée qui prend des valeurs déjà « à plat »
   (`Record<string, string>`) plutôt que directement un `FormData` — voir
   `submitInscription` ou `submitEcolagePayment` comme modèle ;
2. ajouter le type dans `MutationType` (`lib/offline/db.ts`) ;
3. enregistrer un gestionnaire dans `MUTATION_HANDLERS`
   (`app/api/sync/mutations/route.ts`), qui appelle cette fonction et
   renvoie `{ error }` ou `{ studentId, label }` ;
4. câbler l'écran concerné comme `tranche2-form.tsx` : `onSubmit` qui teste
   `navigator.onLine`, sinon `queueMutation(type, values)` ;
5. si l'écran doit rester ouvrable hors ligne à froid (pas seulement
   soumissible), ajouter son chemin à `PAGE_SCOPE` dans `public/sw.js` — en
   vérifiant d'abord qu'il n'affiche pas de données personnelles d'étudiants
   qu'on ne veut pas voir persister en cache navigateur.

Le reste (file locale, bandeau, rejeu, idempotence) est déjà générique et n'a
rien à changer.

## Fichiers concernés

| Fichier | Rôle |
|---|---|
| `lib/offline/db.ts` | Base IndexedDB locale (Dexie) : store `mutations`, store `candidates` |
| `lib/offline/sync.ts` | Mise en file, rejeu séquentiel, écoute de l'événement `online` |
| `lib/offline/candidates.ts` | Cache local de recherche (présélection) pour un fonctionnement hors ligne |
| `app/ui/offline-sync-status.tsx` | Bandeau global (hors ligne / synchronisation en cours), monté dans `AppShell` |
| `app/agent-admin/inscription/wizard.tsx` | Interception de la soumission hors ligne (inscription) |
| `app/agent-admin/inscription/search-entry.tsx` | Recherche + pré-remplissage, en ligne ou depuis le cache local |
| `app/agent-admin/inscription/actions.ts` | `submitInscription()`, `getPreselectionCacheAction()` |
| `app/agent-admin/ecolage/tranche2-form.tsx` | Interception de la soumission hors ligne (2e tranche d'écolage) |
| `app/agent-admin/actions.ts` | `submitEcolagePayment()`, logique métier partagée |
| `app/api/sync/mutations/route.ts` | Point d'entrée serveur du rejeu, idempotent, un gestionnaire par type |
| `prisma/schema.prisma` (`SyncedMutation`) | Trace des mutations déjà appliquées, clé d'idempotence |
| `public/sw.js` | Service worker : cache statique + cache de pages scopé (`PAGE_SCOPE`) |
| `public/manifest.json` | Manifeste PWA (nom, icônes, installabilité) |
| `app/ui/service-worker-registration.tsx` | Enregistrement du service worker, monté dans `app/layout.tsx` |
