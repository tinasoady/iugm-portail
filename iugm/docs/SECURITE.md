# Sécurité

Public visé : l'administrateur du portail et toute personne qui relit ou fait
évoluer le code. Ce document dit ce qui est protégé, comment, et surtout **ce
qui ne l'est pas**.

## 1. Mesures en place

### Comptes et sessions

| Mesure | Détail | Code |
|---|---|---|
| Session vérifiée en base à chaque requête | Un compte désactivé, supprimé, ou dont le rôle a changé perd son accès **immédiatement**, plus au bout de 8 h. Le rôle est lu en base, pas dans le cookie | `lib/auth.ts` (`resolveSession`) |
| **Une seule session par compte** | Se connecter sur un second appareil **ferme aussitôt** la session de l'autre (identifiant de session unique en base, `User.currentSessionId`, porté par le cookie). L'appareil fermé le sait dans la minute — ou dès qu'on y revient — et affiche le motif sur la page de connexion. Deux connexions simultanées : une seule survit. Vaut aussi pour les étudiants. Un cookie volé cesse donc de servir dès que la personne se reconnecte | `lib/login.ts`, `lib/auth.ts`, `app/ui/session-watcher.tsx` |
| Fermeture des autres sessions | Changer ou réinitialiser un mot de passe (ou réinitialiser la 2FA) invalide toutes les sessions antérieures (`User.sessionsValidAfter`) | `app/changer-mot-de-passe`, `lib/password-reset.ts` |
| Changement de mot de passe obligatoire appliqué partout | Un compte au mot de passe temporaire ne peut rien faire d'autre que le changer : bloqué par le proxy (pages et Server Actions) **et** par `getSession()` | `proxy.ts`, `lib/auth.ts` |
| Pas d'énumération de comptes | Même message et même durée (comparaison bcrypt factice) pour un e-mail inconnu et un mauvais mot de passe ; « compte désactivé » n'est révélé qu'avec le bon mot de passe ; « mot de passe oublié » répond pareil dans tous les cas | `lib/login.ts` |
| Anti-bruteforce | 5 échecs / 15 min par e-mail, 20 par IP ; compte aussi pour les codes 2FA | `lib/rate-limit.ts` |
| Double authentification (TOTP, RFC 6238) | Pour superadmin et agents. Codes à usage unique (anti-rejeu), 8 codes de secours hachés, secret chiffré (AES-256-GCM). Validée par les vecteurs de test officiels des RFC 4226/6238 | `lib/totp.ts`, `lib/two-factor.ts` |
| Politique de mot de passe | 8 à 72 octets (limite bcrypt), au moins une lettre et un chiffre, ni liste de mots courants, ni identifiant, ni matricule | `lib/password-policy.ts` |
| Mot de passe oublié | Jeton de 256 bits, **stocké haché**, valable 60 min, usage unique, 3 demandes/h/compte ; le lien est construit depuis `APP_URL`, jamais depuis l'en-tête `Host` ; ne désactive pas la 2FA | `lib/password-reset.ts` |
| Identifiants et adresse e-mail vérifiée | On se connecte avec un **nom d'utilisateur** (personnel : choisi par le superadmin, 3 à 32 caractères `a-z 0-9 . - _`, immuable ; étudiant : `prenom.nom` généré à l'inscription), jamais avec une adresse e-mail. Chaque compte a une adresse e-mail **vérifiée** (`User.recoveryEmail`) : celle de l'invitation pour le personnel (prouvée à l'activation), celle que l'étudiant ajoute lui-même dans Mon compte. Le lien « mot de passe oublié » ne part **que** vers cette adresse (plus de repli sur une adresse non vérifiée). Un changement d'adresse n'est enregistré qu'après ouverture d'un lien envoyé à la NOUVELLE adresse (la confirmation est un bouton, jamais un simple chargement de page, pour résister aux antivirus de messagerie) ; demande protégée par le mot de passe actuel ; l'ancienne adresse est prévenue de tout remplacement ou retrait ; adresses masquées dans le journal | `lib/identifiers.ts`, `lib/recovery-email.ts` |
| Création de compte du personnel par invitation | Le superadmin ne choisit **aucun mot de passe** : il saisit nom d'utilisateur, nom, rôle et une adresse e-mail obligatoire. Le compte est créé « en attente » (`pendingActivation`, mot de passe aléatoire inconnu de tous, connexion impossible, réponse identique à un identifiant inconnu : pas d'énumération des invitations). Le lien d'activation (jeton de 256 bits **haché** en base, 72 h, usage unique, renvoi limité à 5/h, le renvoi annule le précédent) mène à une page où la personne choisit elle-même son mot de passe : l'adresse devient alors vérifiée. Création refusée tant que l'envoi d'e-mails n'est pas configuré ; si le message ne part pas, le compte n'est pas créé | `lib/invitations.ts`, `app/activer-compte/` |
| Anciens identifiants étudiants | Les comptes étudiants existants gardent leur ancien identifiant (`…@student.iugm.edu`) comme alias (`User.legacyLogin`) : les reçus déjà imprimés restent valables. Script de rattrapage idempotent : `scripts/backfill-student-logins.ts` | `lib/student-login-backfill.ts` |
| Jetons dans les liens d'e-mail | Les pages `/reinitialiser-mot-de-passe`, `/confirmer-adresse` et `/activer-compte` retirent le jeton de la barre d'adresse dès l'affichage (ni capture d'écran, ni historique), ne sont ni mises en cache, ni indexées, et n'envoient aucun référent | `app/ui/strip-url-query.tsx`, `next.config.ts` |
| Cookies | `HttpOnly`, `SameSite=Lax`, `Secure` en production ; cookie 2FA limité au chemin `/login` et à 5 min | `lib/auth.ts` |
| Déconnexion automatique | 20 min d'inactivité (avertissement à 19) ; efface au passage le cache hors ligne lisible du poste | `app/ui/idle-logout.tsx`, `lib/offline/clear.ts` |

### Autorisation

- Chaque Server Action et route API revérifie session, rôle, **tâche** (permissions individuelles) et **périmètre de formation** côté serveur ; l'interface n'est jamais la seule barrière. Revue du 1ᵉʳ octobre 2026 de toutes les Server Actions (21 fichiers) et routes API : chacune débute par un contrôle de session et de rôle, puis de tâche et de périmètre quand il y a lieu ; deux défauts réels ont été corrigés à cette occasion (sessions non révoquées, rejeu simultané de la synchronisation hors ligne).
- Le proxy (`proxy.ts`) est un filet de sécurité « optimiste » (signature + expiration du cookie, sans base) ; il ne remplace aucun contrôle fin.

### Données

| Mesure | Détail |
|---|---|
| Mots de passe | `bcrypt` (coût 10) |
| Mots de passe initiaux imprimés | Chiffrés en base (AES-256-GCM), effacés au premier changement |
| Carte étudiante | Jeton opaque non devinable dans le QR code, régénérable |
| Exports | Réservés par rôle/tâche, limités en débit, journalisés |
| Synchronisation hors ligne | Une mutation = au plus une application, même en cas de rejeu simultané (réservation atomique de l'identifiant) |
| Journal d'audit | Toutes les actions sensibles, y compris les événements de sécurité (2FA, réinitialisations, blocages), consultable avec filtres et période |
| Journal d'erreurs | JSON structuré, **sans** paramètres d'URL ni en-têtes (ils peuvent contenir jetons et cookies) |
| En-têtes HTTP | CSP, `X-Frame-Options: DENY`, `nosniff`, HSTS, `Referrer-Policy`, `Permissions-Policy` |

### Chaîne logicielle

- Next.js 16.3.8 : corrige les failles publiées sur la série 16.2 (exécution de code à distance non authentifiée, contournement du proxy, déni de service des Server Actions, divulgation de points d'entrée internes).
- CI : types, lint, 300+ tests contre une vraie base, build, tests de bout en bout dans un vrai navigateur, contrôle d'accessibilité automatique.
- Sauvegardes quotidiennes chiffrées avec preuve de restauration ([`SAUVEGARDE.md`](SAUVEGARDE.md)).

## 2. Limites connues (à connaître, pas à cacher)

1. **Limiteur de débit des exports et de la synchronisation en mémoire.** Sur un hébergement serverless (Vercel), chaque instance a son compteur : la limite est donc approximative. Le blocage des **connexions** n'est pas concerné : il est stocké en base.
2. **Blocage par IP dépendant de `X-Forwarded-For`.** Fiable sur Vercel ; sur un serveur auto-hébergé, le reverse proxy doit écraser cet en-tête (voir [`DEPLOIEMENT.md`](DEPLOIEMENT.md) § 6).
3. **`'unsafe-inline'` dans la CSP** (scripts et styles), nécessaire au script d'amorçage du thème et à l'hydratation sans nonce. Compensé par l'absence totale de HTML brut issu de saisies (React échappe tout ; les e-mails échappent aussi le contenu des communiqués).
4. **La 2FA n'est pas obligatoire.** Elle est proposée au personnel, et un rappel s'affiche au superadmin tant qu'il ne l'a pas activée. L'imposer est possible mais bloquerait un agent qui n'a pas de téléphone adapté ; décision laissée à l'établissement.
5. **Un seul appareil à la fois, pour tous.** Choix voulu : un agent qui utilise son ordinateur ET son téléphone est déconnecté de l'un quand il ouvre l'autre. Conséquence à connaître : quelqu'un qui connaît un mot de passe peut, en se connectant, déconnecter le propriétaire ; celui-ci le voit (« votre compte vient de se connecter sur un autre appareil ») et doit alors changer son mot de passe. Le blocage anti-bruteforce et la 2FA limitent ce scénario.
6. **Pas de récupération sans adresse vérifiée.** Un compte sans adresse e-mail vérifiée ne peut pas se réinitialiser seul : un superadmin le fait depuis Permissions (d'où l'intérêt d'avoir au moins deux superadmins). Le personnel en a toujours une (celle de l'invitation) ; un étudiant doit l'ajouter lui-même dans Mon compte (un bandeau le lui rappelle à chaque page tant que c'est à faire).
7. **Pas de SMS.** Les notifications partent par e-mail, à l'adresse personnelle du dossier ; un étudiant sans adresse n'est pas notifié. « Mot de passe oublié » n'utilise que l'adresse vérifiée du compte, pas celle du dossier.
8. **Données hors ligne.** Les saisies en attente de synchronisation restent dans le navigateur (volontairement : les supprimer à la déconnexion ferait perdre des dossiers). Sur un poste partagé, synchroniser avant de partir.
9. **Fichiers de l'utilisateur** : le contenu réel de chaque image (photo, logo) est vérifié par sa signature (PNG, JPEG, WebP), pas sur le type déclaré par le navigateur ; un logo SVG contenant un script, un gestionnaire d'événement ou une référence externe est refusé. Il n'y a pas d'analyse antivirus.
10. **Dépendances** : voir [`DEPLOIEMENT.md`](DEPLOIEMENT.md) § 7 pour les alertes `npm audit` restantes.
11. **Aucun test d'intrusion externe** n'a été réalisé. Ce document décrit des contrôles vérifiés par tests automatisés, pas une certification.

## 3. Procédures

### Un agent a perdu son téléphone (2FA)
Superadmin → **Permissions** → ligne de l'agent → **Réinit. 2FA**. Ses sessions sont fermées ; il se reconnecte avec son mot de passe et reconfigure la 2FA depuis **Mon compte**. S'il a encore ses codes de secours, il peut s'en servir à la connexion (usage unique).

### Un compte est peut-être compromis
1. **Permissions** → **Désactiver** : l'accès est coupé immédiatement, même sessions ouvertes.
2. **Réinit. mdp** (et **Réinit. 2FA** si elle était activée).
3. Consulter **Journaux d'activité**, filtrer par e-mail de l'auteur, sur la période suspecte.
4. Réactiver quand le propriétaire a repris la main.

### Un superadmin est le dernier compte et a perdu l'accès
Le portail refuse de désactiver ou supprimer le dernier superadmin actif. En cas de perte totale d'accès : créer un nouveau superadmin avec `npm run seed` contre la base (mot de passe affiché une fois, changement imposé), puis réinitialiser l'ancien compte.

### `AUTH_SECRET` ou un secret de sauvegarde a fuité
`AUTH_SECRET` : [`DEPLOIEMENT.md`](DEPLOIEMENT.md) § 5. `BACKUP_PASSPHRASE` : la changer, puis les anciennes sauvegardes restent lisibles avec l'ancienne phrase (à conserver) ; considérer qu'un attaquant connaissant l'adresse d'un fichier peut le lire (le magasin Blob est public : voir SAUVEGARDE.md).

## 4. Vérifier soi-même

```bash
npm test                 # 300+ tests, dont sessions, 2FA, réinitialisation, anti-rejeu
npm run test:e2e         # navigateur réel : connexion, 2FA, parcours d'inscription, accessibilité
npm audit --omit=dev     # état des dépendances
```
