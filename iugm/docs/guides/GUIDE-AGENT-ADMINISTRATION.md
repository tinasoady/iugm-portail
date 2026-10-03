# Guide de l'agent d'administration

Ce guide couvre le quotidien d'un agent d'administration : inscrire, vérifier
les paiements, réinscrire, suivre l'écolage, éditer des états, communiquer.

> **Vos tâches dépendent de vos permissions.** Le superadmin choisit, pour
> chaque agent, les tâches autorisées (inscription, réinscription, vérification
> des paiements, écolage, export CSV, suppression, modification de dossier,
> communiqués...). Un menu absent signifie que la tâche ne vous est pas
> attribuée. Si vous êtes **secrétaire d'une formation**, vous ne voyez et ne
> manipulez que les dossiers de cette formation.

## 1. Se connecter en sécurité

- Connexion par e-mail et mot de passe. Un compte nouvellement créé vous impose de changer le mot de passe provisoire dès la première connexion.
- **Activez la double authentification** (menu **Mon compte** → *Double authentification*) : vous aurez besoin d'une application d'authentification sur votre téléphone (Google Authenticator, Microsoft Authenticator, Authy...). Scannez le QR code, saisissez le code à 6 chiffres, puis **notez vos codes de secours** (ils ne s'affichent qu'une fois).
- Déconnexion automatique après 20 minutes d'inactivité.
- **Renseignez votre adresse de récupération** (menu **Mon compte** → *Adresse de récupération*) : une vraie boîte mail, car votre identifiant de connexion n'en est peut-être pas une. Sans elle, si vous oubliez votre mot de passe, le lien de réinitialisation ne vous parviendrait pas. Le portail envoie d'abord un message de confirmation à cette adresse ; elle ne devient active qu'après avoir cliqué sur le lien reçu.

## 2. Le parcours d'un dossier

```
Enregistré → Paiement vérifié → Inscription administrative validée → Inscrit
 (vous)        (vous)              (vous)                          (agent pédagogique)
```

Le menu **Dossiers étudiants** liste les dossiers avec leur statut et l'action à faire. La recherche accepte nom, matricule, n° de reçu, filière. Les listes affichent 20 dossiers ; **Voir plus** en ajoute 20.

## 3. Inscrire un étudiant

Menu **Inscription** → formulaire en 6 étapes : *Étudiant*, *Baccalauréat*, *Parents*, *Inscription* (choix de la formation), *Pièces*, *Récapitulatif*.

- Commencez par chercher le candidat par son nom : s'il figure dans une liste de présélection ou d'étudiants déjà importée, le formulaire se **pré-remplit**.
- Cochez à l'étape *Pièces* les documents réellement reçus.
- Le **matricule** (`FI<année>-<n>`) est attribué automatiquement.
- **Sans réseau**, la saisie est conservée dans le navigateur et envoyée automatiquement au retour de la connexion (le matricule est alors attribué). Ne vous déconnectez pas d'un poste partagé avant que la synchronisation soit faite.

## 4. Vérifier le paiement à l'inscription

Sur un dossier **Enregistré**, saisissez le **numéro du reçu** et le **montant réellement versé**, puis **Vérifier le paiement**. Le montant minimum requis pour le niveau (droit d'inscription + assurance + polo + premier versement) est affiché sous les champs.

- Montant insuffisant : le dossier n'est pas débloqué et le message indique ce qu'il manque. Vos saisies restent à l'écran pour être corrigées.
- Montant suffisant : l'écran indique le **reste à payer** pour solder l'écolage de l'année, à annoncer à la famille.

Puis cliquez **Valider l'inscription** (inscription administrative). Le dossier passe à l'agent pédagogique.

L'étudiant reçoit un e-mail (s'il a une adresse personnelle dans son dossier) à chaque étape : paiement enregistré, inscription administrative validée.

## 5. Gestion d'écolage

Menu **Gestion d'écolage** : répartition des dossiers (payé / partiel / non payé), évolution des encaissements, et la liste **Écolage non soldé** pour les relances (téléphones de l'étudiant et du responsable). Pour une **2ᵉ tranche**, saisissez le n° de reçu et le montant directement dans la liste.

## 6. Réinscription

Menu **Réinscription** : liste des étudiants inscrits dont l'année est terminée. Pour chacun, choisissez l'année, confirmez le niveau (le niveau suivant, ou le redoublement) et cochez les pièces reçues (relevé de notes certifié, papier chemise bleu). Le portail conserve le matricule et le compte, archive l'année écoulée et refait partir le dossier au début du circuit.

La progression est stricte : pas de saut de niveau. Un passage non éligible (moyenne insuffisante) ne peut être forcé que par le superadmin, avec un motif.

## 7. États récapitulatifs (nouveau)

Menu **États récapitulatifs** : effectifs, **encaissé**, **attendu** et **reste dû** par filière et par niveau, pour l'année et le niveau choisis dans la barre du haut.

- **Version imprimable** : une page propre pour impression ou PDF.
- **Exporter (Excel)** : deux feuilles, *Synthèse* et *Reste dû* (liste de relance complète avec téléphones).
- Règle de calcul : le reste dû d'un dossier est le tarif annuel du niveau moins le total déjà versé pour l'année du dossier ; un dossier sans niveau est compté dans l'effectif mais pas dans les montants (signalé sous le tableau).

## 8. Liste étudiants, exports

Menu **Liste étudiants** : recherche, filtres (année, filière, niveau), tri, classement par blocs, **export Excel** de la liste affichée et **version imprimable**. L'export CSV complet (sauvegarde de secours) est sur la page *Dossiers étudiants* et nécessite la tâche « CSV ». Les exports sont journalisés et limités en nombre.

## 9. Communiquer avec les étudiants

Menu **Communiquer** : titre, message, filière et niveau ciblés (vides = tous). Le communiqué apparaît dans les notifications des étudiants concernés et est **aussi envoyé par e-mail** à ceux qui ont une adresse personnelle. Un secrétaire de formation ne peut cibler que sa formation. Vous pouvez supprimer vos propres communiqués.

## 10. En cas de problème

| Situation | Que faire |
|---|---|
| « Vous n'avez pas la permission… » | La tâche ne vous est pas attribuée : demandez au superadmin |
| « Ce dossier relève d'une autre formation » | Dossier hors de votre périmètre : l'étudiant doit voir le secrétaire de sa formation |
| Compte bloqué (5 échecs) | Attendre 15 minutes, ou demander une réinitialisation au superadmin |
| Téléphone perdu (double authentification) | Utiliser un code de secours, ou demander au superadmin « Réinit. 2FA » |
| « Votre compte vient de se connecter sur un autre appareil » | Un compte n'est connecté qu'à un appareil à la fois (ordinateur **ou** téléphone) : se connecter ailleurs ferme l'autre. Si ce n'était pas vous, changez votre mot de passe |
| Mot de passe oublié | **Mot de passe oublié ?** sur la page de connexion (e-mail), ou demander au superadmin |
| Une page affiche « Une erreur est survenue » | Noter la **référence** affichée et la transmettre à l'administrateur |
