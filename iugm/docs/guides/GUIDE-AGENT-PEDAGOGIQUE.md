# Guide de l'agent pédagogique

Ce guide couvre la validation pédagogique, les résultats, les notes par
matière, la conduite et les communiqués.

> **Vos tâches dépendent de vos permissions** (validation pédagogique,
> notes et résultats, conduite, communiqués, matières). Si vous êtes affecté à
> une **formation**, vous ne voyez que les dossiers de cette formation.
> Activez la **double authentification** depuis **Mon compte**.
> Votre compte est créé par invitation : ouvrez le lien reçu par e-mail pour choisir votre mot de passe, puis connectez-vous avec votre **nom d'utilisateur**. L'adresse qui a reçu l'invitation est vérifiée et recevra le lien « mot de passe oublié » (modifiable dans **Mon compte** → *Adresse e-mail*).

## 1. Valider une inscription pédagogique

Menu **Pédagogie** → section **Inscriptions à valider** : dossiers dont
l'agent d'administration a déjà validé l'inscription.

1. Cliquez **Valider l'inscription pédagogique** sur la ligne du dossier.
2. Le portail **crée le compte de l'étudiant** et affiche, **une seule fois**, son **identifiant** (de la forme `prenom.nom`) et son **mot de passe provisoire**.
3. **Notez-les immédiatement** (ou imprimez le **reçu d'inscription**, qui les contient) pour les remettre à l'étudiant en main propre. Le mot de passe provisoire n'est jamais envoyé par e-mail.
4. Quand c'est fait, cliquez **J'ai noté les identifiants — actualiser la liste** : la ligne quitte alors la liste à valider.

L'étudiant devra choisir son propre mot de passe dès sa première connexion. Si vous avez perdu le mot de passe provisoire avant remise, le superadmin peut le réinitialiser (**Permissions** → *Réinit. mdp*).

Pour une **réinscription**, le compte existe déjà : le portail l'indique et l'étudiant garde son identifiant et son mot de passe.

## 2. Reçu d'inscription

Dans **Étudiants inscrits**, le bouton **Reçu** ouvre la version imprimable du reçu. L'impression est journalisée.

## 3. Résultats académiques (moyenne générale)

Les résultats ne se saisissent plus : la moyenne de chaque semestre est **calculée automatiquement** à partir des notes par matière (voir section 4), selon les paramètres fixés dans le catalogue des matières (coefficients, bonus, contrôle continu, note éliminatoire). Elle apparaît dans la colonne *Résultats* de **Étudiants inscrits** dès que toutes les matières obligatoires du semestre sont notées. La **mention** en découle :

| Moyenne | Mention |
|---|---|
| moins de 10 | Échec |
| 10 à moins de 12 | Passable |
| 12 à moins de 14 | Assez bien |
| 14 à moins de 16 | Bien |
| 16 et plus | Très bien |

Quand S1 et S2 d'une même année sont enregistrés, un **avis d'admission** est envoyé automatiquement à l'étudiant (une seule fois par année).

L'étudiant reçoit en plus un e-mail l'invitant à consulter ses nouveaux résultats (s'il a une adresse personnelle dans son dossier).

## 4. Notes par matière

Menu **Notes par matière** : cherchez un étudiant inscrit, choisissez l'année et le semestre, puis saisissez une note (0 à 20) pour chaque matière du catalogue de sa filière, de son niveau et de ce semestre. Pour une matière qui combine **contrôle continu et examen**, saisissez les deux notes : la note de la matière est calculée selon la part du CC indiquée. Un champ laissé vide **n'écrase pas** une note déjà enregistrée ; ré-enregistrer une note la remplace.

Sous le tableau s'affiche la **moyenne du semestre** calculée (avec sa mention), ou la liste des matières obligatoires qui manquent encore. Corriger une note recalcule la moyenne. Une note sous la **note éliminatoire** d'une matière obligatoire fait échouer le semestre, quelle que soit la moyenne.

## 5. Catalogue des matières

Le catalogue (nom, filière, niveau) est alimenté par le superadmin, ou par vous si la tâche **« Gérer le catalogue des matières »** vous est accordée (menu **Matières (catalogue)**, limité à votre formation si vous en avez une). Chaque matière a son semestre, son coefficient, sa part de contrôle continu, et est obligatoire (avec une note éliminatoire éventuelle) ou facultative. Une matière facultative ne compte qu'en **bonus** : seuls les points au-delà du seuil (10 par défaut) s'ajoutent. Le caractère et le coefficient sont rappelés à côté de chaque matière dans **Notes par matière**.

## 6. Appréciation de conduite

Sur la **fiche d'un étudiant** (menu **Liste étudiants** → son nom), rédigez l'appréciation de conduite (2 000 caractères maximum) si la tâche vous est attribuée.

## 7. Communiquer

Menu **Communiquer** : même fonctionnement que pour les agents d'administration (titre, message, filière et niveau ciblés ; envoi aussi par e-mail aux étudiants qui ont une adresse personnelle).

## 8. Listes

Les listes affichent 20 lignes ; **Voir plus** en ajoute 20 (chaque liste de la page — à valider, inscrits, dossiers en cours — se déploie séparément et vos filtres sont conservés). La section *Étudiants inscrits* se filtre par filière, département et mention.

## 9. En cas de problème

| Situation | Que faire |
|---|---|
| « Vous n'avez pas la permission… » | Tâche non attribuée : demander au superadmin |
| Dossier d'une autre formation | Hors périmètre : renvoyer l'étudiant vers le secrétaire de sa formation |
| Mot de passe provisoire de l'étudiant perdu avant remise | Superadmin → Permissions → *Réinit. mdp* |
| Téléphone perdu (double authentification) | Code de secours, ou superadmin → *Réinit. 2FA* |
| « Votre compte vient de se connecter sur un autre appareil » | Un compte n'est connecté qu'à un appareil à la fois (ordinateur **ou** téléphone) : se connecter ailleurs ferme l'autre. Si ce n'était pas vous, changez votre mot de passe |
| Page « Une erreur est survenue » | Noter la **référence** et la transmettre à l'administrateur |
