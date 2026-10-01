# Supervision

Public visé : l'administrateur du portail. Objectif : être **prévenu avant les
utilisateurs** quand quelque chose ne va pas, et savoir où regarder.

## 1. Sonde de santé

`GET /api/health` (publique, sans session) :

```json
{ "status": "ok", "database": "ok", "version": "1.0.0", "timestamp": "2026-10-01T10:00:00.000Z" }
```

- **200** : l'application répond et la base aussi (requête `SELECT 1`, délai maximal 3 s).
- **503** : la base ne répond pas (`"status": "degraded"`).
- La réponse ne contient aucun détail interne (pas de message d'erreur, d'hôte ni de variable).

### À brancher (10 minutes, gratuit)

Créer un moniteur sur un service de surveillance (UptimeRobot, Better Stack, Uptime Kuma...) :

| Réglage | Valeur |
|---|---|
| URL | `https://<domaine>/api/health` |
| Fréquence | 1 à 5 minutes |
| Succès | code HTTP 200 (et, si possible, le mot `"ok"` dans la réponse) |
| Alerte | e-mail + SMS/Telegram de l'administrateur, après 2 échecs consécutifs |

Surveiller aussi la page `https://<domaine>/login` (code 200) : elle détecte une panne que la sonde de santé ne voit pas (erreur de rendu).

## 2. Journaux d'erreurs

Chaque erreur serveur (rendu d'une page, route API, Server Action) est écrite en **une ligne JSON** sur la sortie d'erreur :

```json
{"level":"error","event":"request_error","timestamp":"2026-10-01T10:00:00.000Z",
 "message":"...","digest":"1234567890","stack":"...","method":"POST",
 "path":"/agent-admin","routeType":"action","routePath":"/agent-admin"}
```

- `path` est **sans paramètres d'URL** (ils peuvent contenir un jeton de réinitialisation ou une recherche nominative) ; ni cookies ni en-têtes ne sont journalisés.
- `digest` : la page d'erreur affichée à l'utilisateur lui montre cette **référence**. Chercher cette valeur dans les journaux retrouve l'erreur exacte.
- Sur Vercel : projet → *Logs* (filtrer sur `request_error`) ; auto-hébergé : sortie standard du processus Node.

Pour recevoir une alerte à chaque erreur, brancher un service (Sentry, Better Stack...) dans `instrumentation.ts` (fonction `onRequestError`) : c'est le point d'entrée unique, prévu pour cela. Cela demande un compte chez le service choisi et sa clé ; ce n'est pas fait par défaut.

## 3. Journal d'activité (métier)

Superadmin → **Journaux d'activité** : toutes les actions sensibles (connexions, échecs, blocages, 2FA, réinitialisations, exports, paiements, validations...) avec filtre par texte, par type d'action et **par période**. Les événements d'alerte (échecs de connexion, blocages, désactivation de la 2FA, notifications non envoyées) sont en rouge.

À consulter chaque semaine : pics de « Connexion échouée » ou « Connexion bloquée » (tentative d'intrusion), « Notification e-mail non envoyée » (SMTP en panne ou adresses invalides).

## 4. Ce qu'il faut vérifier régulièrement

| Fréquence | Quoi |
|---|---|
| Chaque jour | E-mail d'échec du workflow de sauvegarde (aucun message = bon signe, mais vérifier qu'il tourne : onglet Actions) |
| Chaque semaine | Journal d'activité (pics d'échecs), alertes de la sonde |
| Chaque mois | Restauration d'essai ([`SAUVEGARDE.md`](SAUVEGARDE.md) § 4.1), `npm audit --omit=dev` |
| À chaque version | CI verte, migrations appliquées **avant** le code ([`DEPLOIEMENT.md`](DEPLOIEMENT.md) § 4) |
