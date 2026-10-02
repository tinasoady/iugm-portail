# Guide du superadministrateur

Le superadmin gère les comptes, les permissions, les paramètres de
l'établissement, les tarifs, le catalogue de matières et la surveillance du
portail. Les procédures d'exploitation (déploiement, sauvegarde, supervision,
sécurité) sont dans [`../`](../) : `DEPLOIEMENT.md`, `SAUVEGARDE.md`,
`SUPERVISION.md`, `SECURITE.md`.

## 1. Protéger son compte (à faire en premier)

Un compte superadmin ouvre tous les accès. Dès la première connexion :

1. changez le mot de passe provisoire (imposé) ;
2. **activez la double authentification** : **Mon compte** → *Double authentification* → *Activer*. Scannez le QR code avec une application d'authentification, saisissez le code à 6 chiffres, puis **conservez les 8 codes de secours** (affichés une seule fois, usage unique, à ranger loin du mot de passe). Un bandeau sur le tableau de bord vous le rappelle tant que ce n'est pas fait ;
3. gardez au moins **deux** superadmins actifs : le portail refuse de désactiver ou supprimer le dernier.

## 2. Tableau de bord

- Quatre cartes (une par type de compte). **Cliquer sur une carte** filtre la liste des utilisateurs en dessous ; *Voir tous les utilisateurs* retire le filtre.
- Le graphique montre l'évolution des inscriptions (dossiers enregistrés, reçus vérifiés, inscriptions finalisées) pour l'année et le niveau choisis dans la barre du haut.
- La liste des utilisateurs affiche **20 lignes**, **Voir plus** en ajoute 20.
- **Créer un utilisateur** : nom, e-mail, rôle, mot de passe provisoire (8 caractères minimum avec une lettre et un chiffre). La personne **devra le changer** à sa première connexion. Un nouvel agent reçoit toutes les tâches de son rôle ; vous pouvez ensuite les restreindre.

## 3. Permissions

Menu **Permissions**. Pour chaque agent :

- **Rôle**, **fonction** (poste), **formation** affectée (vide = toutes) et **tâches autorisées** (cases à cocher). Une tâche non cochée est refusée par le serveur, même par appel direct.
- **Désactiver / Réactiver** : coupe l'accès **immédiatement**, y compris les sessions déjà ouvertes.
- **Réinit. mdp** : génère un mot de passe provisoire affiché **une seule fois**, impose son changement, ferme les sessions ouvertes.
- **Réinit. 2FA** (visible si l'agent a la double authentification) : à utiliser s'il a perdu son téléphone **et** ses codes de secours. Ses sessions sont fermées.
- **Supprimer** un compte (impossible pour le dernier superadmin, ni pour un compte lié à un dossier étudiant : supprimez alors le dossier).

La section **Comptes étudiants** liste les comptes (recherche par nom, identifiant ou matricule ; **Voir plus**). Pour un étudiant : *Réinit. mdp* génère de nouveau un mot de passe provisoire du type matricule + suffixe.

## 4. Paramètres de l'établissement

Menu **Paramètres** :

- nom, sigle, adresse, ville, téléphone, e-mail, site, slogan ;
- **logo** (PNG, JPEG, WebP ou SVG sans script, 1 Mo) ;
- **tarifs par niveau (L1 à M2)** : droit d'inscription, assurance, polo, frais de formation annuels et premier versement, en tarif **local** et **étranger**. Ces montants pilotent le minimum exigé à l'inscription, le calcul du reste à payer et les **états récapitulatifs**. Vérifiez-les en début d'année.

## 5. Catalogue des matières

Menu **Matières (catalogue)** : ajoutez les matières (nom, filière, niveau). Seul le superadmin alimente ce catalogue ; le caractère obligatoire ou facultatif est ensuite décidé par le secrétaire de formation ou l'agent pédagogique.

## 6. Base de données (import de présélection)

Menu **Base de données** : import en lot de fichiers Excel — candidats présélectionnés (nouveaux L1) ou étudiants déjà présents. Ces fiches servent à **pré-remplir** l'inscription par recherche de nom ; elles ne créent jamais de dossier d'elles-mêmes. Un nouvel import pour la même année et la même catégorie **remplace** le lot précédent.

## 7. États récapitulatifs

Menu **États récapitulatifs** : effectifs, encaissé, attendu et reste dû par filière et niveau (année et niveau pris dans la barre du haut ; filière au choix). **Version imprimable** et **Exporter (Excel)** (feuilles *Synthèse* et *Reste dû*).

## 8. Journaux d'activité

Menu **Journaux d'activité** : toutes les actions sensibles, 50 par page, avec filtres par **texte** (e-mail de l'auteur, détails), par **type d'action** et par **période** (du… au…). Les événements d'alerte sont en rouge : connexion échouée ou bloquée, export bloqué, double authentification désactivée ou réinitialisée, notification non envoyée.

À regarder chaque semaine : pics de « Connexion échouée »/« Connexion bloquée » (tentative d'intrusion).

## 9. E-mails

La section **Paramètres → Envoi d'e-mails** montre l'état de la configuration et permet d'**envoyer un e-mail de test** (avec, en cas d'échec, la cause probable). La mise en place pas à pas est dans [`../DEPLOIEMENT.md`](../DEPLOIEMENT.md) § 2.

Si le serveur d'envoi est configuré, le portail envoie : le lien « mot de passe oublié » (aux agents à leur e-mail, aux étudiants à l'adresse personnelle de leur dossier) et les notifications aux étudiants. Un envoi qui échoue apparaît dans les journaux (« Notification e-mail non envoyée »). Sans configuration, rien ne part et le portail fonctionne normalement.

## 10. Que faire si…

| Situation | Action |
|---|---|
| Un agent est parti | **Désactiver** puis, après vérification, supprimer son compte |
| Compte suspect | Désactiver → Réinit. mdp (+ Réinit. 2FA) → journaux sur la période → réactiver |
| Un agent a perdu son téléphone | Réinit. 2FA, il la reconfigure depuis Mon compte |
| Un étudiant n'a plus son mot de passe provisoire | Comptes étudiants → Réinit. mdp |
| Page « Une erreur est survenue » signalée | Demander la **référence** affichée ; elle retrouve l'erreur dans les journaux serveur |
| Le portail semble hors service | `https://<domaine>/api/health` ; voir [`../SUPERVISION.md`](../SUPERVISION.md) |
