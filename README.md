# Claude Pet

Un petit compagnon en pixel art (un axolotl qui évolue en dragon), aux couleurs de Claude, qui reste sur ton bureau Windows, au-dessus de tes fenêtres.
Il respire, cligne des yeux, te suit du regard, s'endort quand tu t'absentes, réagit
quand tu joues avec lui, **tu peux lui parler : il répond avec Claude**, et il
**remarque ce que tu fais** sur l'ordi. Viendra ensuite le lancement de musique ou de logiciels.

## Installer sous Windows

1. Installe [Node.js](https://nodejs.org) (version LTS), si ce n'est pas déjà fait.
2. Décompresse le zip et place le dossier `claude-pet` où il restera (par exemple dans
   `Documents`) : les raccourcis pointent vers lui, ne le déplace plus ensuite.
3. Dans ce dossier, **double-clique sur `Installer.cmd`**. Il installe ce qu'il faut,
   crée un raccourci **Claude Pet** sur le Bureau et dans le menu Démarrer, puis lance
   le compagnon.

Ensuite, plus besoin de terminal : il **démarre tout seul avec Windows** (décochable par
clic droit, **Lancer au démarrage de Windows**), et le raccourci du Bureau le relance
si tu l'as quitté. Aucune fenêtre de commande ne reste ouverte.

Pour les développeurs, `npm start` dans le dossier marche toujours.

Le compagnon apparaît en bas à droite de l'écran. Pour le fermer : clic droit sur lui,
puis **Quitter** (ou via sa petite icône près de l'horloge).

## Ce qu'il sait faire

| Geste | Réaction |
| --- | --- |
| Un clic | Il s'active : une petite ligne apparaît pour lui parler (re-clic ou Échap pour la fermer) |
| Double clic | Yeux en cœur, pirouette |
| Cinq clics rapides | Il a le tournis |
| Aller-retour de la souris au-dessus de lui (sans cliquer) | Tu le caresses, il ronronne |
| Cliquer-glisser | Il marche (axolotl) ou vole (dragons) dans le sens où tu le déplaces, et pend comme une peluche quand tu t'arrêtes ; sa place est retenue |
| Clic droit | Menu : sieste, premier plan, lancement au démarrage de Windows, remettre dans le coin, quitter |
| 3 minutes sans toucher l'ordi | Il s'endort ; il se réveille quand tu reviens |

## Parler avec Claude

Pas de fenêtre : un clic sur le compagnon l'active, une petite ligne apparaît au-dessus
de lui, tu écris et tu appuies sur **Entrée**. Il réfléchit, puis répond dans sa propre
bulle, qui disparaît toute seule une fois le temps de la lire passé (elle reste tant que
la souris est dessus ; un double clic dessus la ferme tout de suite). Pour une longue
réponse, la bulle grandit vers le haut, puis tout reprend sa taille.

### Par ton abonnement Claude (par défaut, sans frais en plus)

Le compagnon passe par **Claude Code**, connecté à ton compte Claude (Pro ou Max) : ses
réponses comptent dans le quota de ton abonnement, comme une conversation sur claude.ai,
et **rien n'est facturé à l'usage**. Claude Code n'a ici que des outils de **lecture**
(chercher et lire), limités à la mémoire du compagnon et à tes sessions Claude Code : il
ne peut rien modifier, rien lancer, rien télécharger. À installer une seule fois :

1. Dans PowerShell : `irm https://claude.ai/install.ps1 | iex`
   (ou, si tu préfères npm : `npm install -g @anthropic-ai/claude-code`).
2. Tape `claude`, puis `/login`, et connecte-toi avec **ton compte Claude** (pas la Console API).
3. Relance le compagnon. Clic droit, **Claude passe par** : la ligne doit dire « Claude Code : prêt ».

Bonus : à chaque réponse, Claude Code donne l'état de ton quota, et le compagnon s'en
sert pour sa fatigue (voir plus bas), même sans brancher la barre d'état.

### Par une clé API (facultatif, facturée à l'usage)

Dans clic droit, **Claude passe par**, tu peux choisir **Ta clé API** à la place, ou
ajouter une clé et cocher **Abonnement à bout : passer par la clé API** pour qu'elle ne
serve qu'en secours. Sans cette case cochée, la clé n'est jamais utilisée tant que tu es
sur l'abonnement. La clé se crée sur
[console.anthropic.com](https://console.anthropic.com/settings/keys) ; elle est vérifiée
puis gardée chiffrée avec ton compte Windows.

Il se souvient de la conversation en cours ; elle repart de zéro après 30 minutes sans
parler, ou avec clic droit, **Nouvelle conversation**. Pendant que Claude réfléchit, il
prend un air songeur, puis l'humeur que Claude a choisie pour sa réponse. Chaque
discussion lui donne aussi de l'expérience.

Par l'abonnement, le modèle est celui choisi par défaut dans ton Claude Code. Par la clé
API, c'est Claude Opus 5 (`MODEL` en haut de `src/main/destinations/chat.js`).

## La bulle de discussion

À côté de lui, une petite bulle « ... ». Un clic l'agrandit en fil de discussion : vos
derniers échanges et une ligne pour écrire. « – » la réduit. Elle reste comme tu l'as
laissée, même après un redémarrage, et se range quand tu cliques ailleurs ou que tu le
déplaces. Quand elle est réduite, un clic sur lui ouvre toujours
la petite ligne rapide, et ses points s'animent quand il t'a répondu.

## Lui parler au micro

Dans la bulle agrandie, le bouton micro à côté de la ligne pour écrire : appuie, parle, il
s'arrête tout seul quand tu te tais (ou rappuie). Ta voix est comprise **sur ton PC** par
whisper.cpp, puis il te répond **à voix haute** avec Piper et la voix française « Siwis ».
Il ne parle à voix haute que quand tu lui as parlé au micro ; à l'écrit, il reste muet. À l'oral, il répond
plus court, comme dans une vraie discussion. Après t'avoir répondu, il t'écoute encore (le
point rouge s'allume à côté de lui) : réponds-lui simplement. La discussion s'arrête quand
tu te tais quelques secondes, ou quand tu lui écris. Quand il te pose une question, il
attend ta réponse avant d'agir.

La première fois, il te demande l'accord de télécharger ces outils gratuits (≈ 290 Mo), en
te montrant chaque élément, sa taille et son adresse. Ils vont dans
`%APPDATA%\claude-pet\voix\` et marchent ensuite sans internet. Clic droit, **Voix** pour
ouvrir ce dossier ou tout supprimer.

**L'appeler sans cliquer** : clic droit, **Voix**, **M'appeler « hey Axo »**. Dis « hey Axo »
(il t'écoute) ou « dis Axo, quelle heure est-il ? » (il répond directement). Le micro reste
alors ouvert, mais seules tes phrases courtes sont vérifiées, sur ton PC, pour y chercher son
nom ; rien n'est gardé ni envoyé. Un petit point orange clignote à côté de lui tant que
l'écoute est active ; décoche l'option pour la couper. Elle télécharge un petit modèle de
plus (≈ 57 Mo), après ton accord.

## Il peut installer et télécharger pour toi

« Installe VLC », « télécharge ce fichier : https://... » :

- **logiciels** : il cherche avec winget (le gestionnaire officiel de Windows), te montre
  les résultats (nom, identifiant, version, source) et tu choisis lequel installer, ou rien ;
- **fichiers** : il te montre l'adresse et la destination (ton dossier Téléchargements) et
  attend ton clic ; si c'est un installeur (.exe, .msi), il te redemande avant de le lancer.

Rien n'est téléchargé ni installé sans ton clic.

## Il ouvre tes logiciels et tes sites

« Ouvre Spotify », « lance Discord », « mets Netflix » : il cherche le logiciel dans la
liste de ton menu Démarrer (logiciels classiques et applis du Microsoft Store) et l'ouvre,
ou il ouvre le site dans ton navigateur par défaut. Ouvrir ne modifie rien, donc il le fait
directement ; clic droit, **Me demander avant d'ouvrir un logiciel ou un site** si tu
préfères qu'il demande d'abord.

## Il peut se modifier lui-même

Demande-lui simplement (« ajoute "Miaou ?" à tes phrases », « parle moins souvent »...). Il
copie son code dans un atelier (`%APPDATA%\claude-pet\atelier\`), Claude Code modifie
cette copie (lire et écrire des fichiers, seulement là ; aucune commande), il vérifie que
le code est valide, puis **te montre ce qu'il a changé et te demande ton accord**. Si tu
acceptes, il garde une copie de sa version actuelle et redémarre.

- Clic droit, **Annuler ma dernière modification** pour revenir en arrière ;
- s'il ne redémarre plus : double-clique `tools\restaurer.cmd` ;
- ces modifications restent sur ton PC : la prochaine mise à jour les remplace (elle te
  prévient). Pour les garder pour de bon, demande-les aussi à Claude dans le projet.

## Sa mémoire : un mini Claude qui se souvient

Le compagnon garde **tout ce que tu lui demandes**, même après un redémarrage, et le
**range par projet**, comme tu le ferais avec Claude : il choisit lui-même le projet
(un existant, ou un nouveau pour un vrai nouveau sujet ; le bavardage va dans
« Discussions »). Quand le sujet change, la bulle indique discrètement où il a rangé ta
demande. Tous les 6 échanges, il remet à jour le résumé du projet.

Il **retient** aussi ce que tu lui dis de durable sur toi (« retiens que je bosse le soir »).

Pour savoir **ce que vous avez fait avant**, il relit, en lecture seule :

- ses propres échanges avec toi, projet par projet ;
- **tes sessions Claude Code** sur ce PC (`C:\Users\<toi>\.claude\projects\`) : titre,
  dossier, date, et le détail quand tu lui en parles (« on avait décidé quoi pour le site ? ») ;
- **tes discussions claude.ai**, si tu importes ton export (voir plus bas).

Quand il doit fouiller, la bulle affiche « Je fouille dans nos souvenirs… » (quelques secondes).

Clic droit, **Mémoire** :

- **Ranger mes demandes tout seul**, ou tout ranger dans un projet précis pour un moment ;
- **Relire mes sessions Claude Code** (coché par défaut) ;
- **Importer mon historique claude.ai...** : claude.ai n'offre aucun accès direct à tes
  discussions pour une application. Sur claude.ai : Paramètres → Confidentialité →
  « Exporter les données » ; tu reçois un .zip par e-mail, dézippe-le, puis choisis
  `conversations.json`. Il en garde une copie dans sa mémoire ; ton fichier n'est pas modifié.
  Refais-le de temps en temps pour qu'il connaisse tes nouvelles discussions ;
- **Ouvrir ma mémoire** : un fichier lisible par projet (`Projets\<Nom>.md`) ;
- **Tout oublier...** (avec confirmation).

Tout reste sur ton PC, dans `%APPDATA%\claude-pet\memoire\`. **Nouvelle conversation**
(clic droit) repart d'une page blanche sans rien effacer de sa mémoire.

Ce qu'il ne peut pas lire : les projets et discussions de l'app Claude (dont celui où on
fabrique ce compagnon) n'ont pas d'accès pour une application ; il connaît seulement le
résumé du projet « Claude Pet » qu'il a en naissant, et ton export claude.ai si tu l'importes.

## Fatigue selon ton quota Claude

Si tu as un abonnement Claude Pro ou Max et que tu utilises Claude Code, le compagnon
peut suivre ton quota (sur 5 heures et sur la semaine) :

| Quota utilisé | Le compagnon |
| --- | --- |
| moins de 60 % | en pleine forme |
| 60 à 80 % | respire plus lentement, baille de temps en temps |
| 80 à 95 % | s'assoit, jambes tendues, bras ballants, l'air épuisé |
| 95 % et plus | KO : il tombe à la renverse, étalé sur le dos, pattes en l'air, tête de profil avec un œil en croix et la langue qui pend ; il te dit quand il ressuscite |

Quand le quota se recharge, il se relève en forme. Il s'affale pour de bon (il vacille, s'écrase, pique du nez), bascule simplement sur le dos quand il est KO (ventre qui respire, pattes qui gigotent) et gigote pour se retourner avant de se relever en titubant. Aperçus : `assets/apercu-fatigue.png` et `assets/apercu-anime.gif`. Chaque pour-cent de quota que tu
utilises lui donne aussi de l'expérience : plus tu utilises Claude, plus il évolue.

Pour l'activer : clic droit, **Fatigue selon mon quota Claude**. Il te demande ton
accord, puis ajoute une barre d'état à Claude Code dans `%USERPROFILE%\.claude\settings.json`
(une copie de l'ancien fichier est gardée à côté). Cette barre lance
`tools/claude-pet-statusline.js`, qui affiche ton quota en bas de Claude Code et le
recopie dans `claude-pet-usage.json` pour le compagnon. Si tu as déjà ta propre barre
d'état, il n'y touche pas. Re-cliquer sur la même ligne du menu la retire.

Limite : Claude Code ne donne ces chiffres que pendant que tu l'utilises, et Anthropic
ne propose pas d'autre moyen de lire le quota de l'abonnement. Entre deux sessions, le
compagnon garde la dernière valeur connue et sait quand le quota se recharge.

## Humeurs et évolution

Il évolue comme une espèce vivante, en trois formes : **axolotl** (branchies, petites
pattes), **dragon** (ailes, cornes) et **dragon céleste**, sa forme finale (immenses
ailes, couronne de cornes, ventre écaillé, griffes, étoile flottante et lueurs autour).
Il gagne de l'expérience quand tu joues avec lui, quand tu le caresses, pour chaque jour
passé ensemble et pendant que tu utilises l'ordi. Le clic droit montre sa forme, ses
points d'expérience, et permet de voir un aperçu de chaque forme.

Selon son humeur, une partie de son corps change de forme (branchies ou ailes) : dressées quand il est content, tombantes quand il a sommeil, écartées
quand il est surpris. Aperçu : `assets/apercu-evolution.png`.

Tout seul, il fait aussi des petits gestes de temps en temps (sauts, étirements,
réflexion) et baille quand il est tard. Les zones transparentes autour de lui laissent
passer les clics : il ne gêne pas ce qu'il y a derrière.

## Ce qu'il remarque de ton activité

Il sait sur quel logiciel tu es, depuis combien de temps, si tu es là et quelle heure il
est. Il réagit surtout sans parler :

| Ce que tu fais | Sa réaction |
| --- | --- |
| Tu codes depuis 10 min | Il met ses lunettes (enlevées quand tu passes à autre chose) |
| Spotify joue un morceau, ou tu es sur une appli de musique (Deezer, YouTube Music...) | Il met son casque et se balance ; quelques notes à chaque nouveau morceau |
| Un jeu ou un film en plein écran | Il reste affiché au premier plan mais se tait |
| 1 h 30 d'affilée sur le même genre d'activité | Il propose une pause (au plus une fois par heure) |
| Tu reviens d'une longue partie | « Alors, cette partie ? » |
| Tu es encore là après minuit | Il le remarque, une fois par nuit |

Les remarques sont **rares** par défaut : une par heure au maximum, jamais en plein écran,
jamais pendant que tu lui parles ni quand tu t'absentes. Clic droit, ligne **Ce que tu
fais** : ton temps de la journée par activité, et les réglages (suivre ou non, remarques
rares, de temps en temps ou jamais).

Il reste **toujours épinglé au premier plan**, même au-dessus d'un jeu ou d'une vidéo en
plein écran, et ne disparaît que si tu le lui demandes (clic droit, **Cacher**, ou un clic
sur sa petite icône près de l'horloge pour le faire revenir).

**Tout reste sur ton PC.** Rien n'est envoyé à Claude ni ailleurs, et il ne fait que lire :
un petit PowerShell caché regarde la fenêtre active toutes les 1,5 seconde. Seules les
minutes par activité du jour sont enregistrées, jamais les titres de fenêtres.

Les activités reconnues (code, musique, jeu, vidéo, discussion, travail, création,
navigation) sont listées dans `src/main/activity/categories.js` : il suffit d'y ajouter
le nom d'un logiciel qu'il ne reconnaît pas. Les jeux Steam, Epic, Riot et Xbox sont
reconnus à leur dossier d'installation.

## Mises à jour en un clic

Au démarrage, puis toutes les 6 heures, le compagnon regarde si une nouvelle version est
publiée sur son dépôt GitHub (`WqlkyHub/claude-pet`). S'il y en a une, il te le dit et te
montre les nouveautés ; un clic sur **Mettre à jour** suffit : il télécharge, garde une copie
de la version actuelle, se met à jour et redémarre. **Plus tard** le fait patienter un jour.
Tes réglages et sa mémoire ne sont jamais touchés. Tu peux aussi vérifier toi-même :
clic droit, **Rechercher une mise à jour**.

Par le même chemin, Claude (dans l'app, projet « Claude Pet ») lui envoie régulièrement
`historique.json` : le résumé à jour de ce que vous avez fait ensemble. Le compagnon le lit
toutes les 6 heures et le range dans sa mémoire, sans installation ni redémarrage.

## Organisation du code

```
src/
  main/
    main.js          fenêtre transparente, déplacement, menu, icône
    settings.js      réglages enregistrés (position, premier plan)
    secrets.js       clé API gardée chiffrée
    router.js        aiguilleur : choisit où envoyer chaque demande
    destinations/
      abonnement.js  discussion par ton abonnement, via Claude Code (par défaut)
      chat.js        discussion par la clé API (facultatif)
    tools.js         outils (chercher, diagnostiquer, lancer) avec demande d'accord
    update.js        mises à jour depuis GitHub
    memory/
      store.js       mémoire durable : projets, échanges, souvenirs
      context.js     ce qu'il se rappelle avant de répondre (recherche locale)
      claude-code.js sommaire de tes sessions Claude Code (lecture seule)
      claude-ai.js   import de ton export claude.ai
    activity/
      watcher.js     lit la fenêtre active sous Windows (PowerShell caché, lecture seule)
      categories.js  range chaque logiciel dans une activité (code, musique, jeu...)
    modules/
      index.js       liste des modules et description de l'API du compagnon
      greeting.js    bonjour selon l'heure
      presence.js    s'endort quand l'ordi est inactif
      evolution.js   expérience et formes d'évolution
      memoire.js     mémoire, rangement par projet, menu Mémoire
      mise-a-jour.js propose les mises à jour et les installe après ton accord
      atelier.js     il modifie son propre code, après ton accord
      chat.js        discussion avec Claude, reliée à l'aiguilleur et aux humeurs
      quota.js       fatigue et évolution selon ton quota Claude
      activity.js    réactions à ce que tu fais (lunettes, casque, pause, plein écran)
      voix.js        micro (whisper.cpp) et voix (Piper), en local, après ton accord
      installations.js installe (winget) ou télécharge pour toi, après ton accord
      ouvrir.js      ouvre tes logiciels et des sites dans ton navigateur
  preload.js         pont sécurisé entre la fenêtre et le processus principal
  renderer/
    index.html       dessin en pixel art (généré par tools-dev/dessin-axolotl.py)
    style.css        animations et expressions
    pet.js           humeurs, bulle, réactions à la souris, ligne pour parler
tools/
  claude-pet-statusline.js  relais de Claude Code (ton quota) vers le compagnon
```

Les prochaines étapes s'ajoutent comme des modules dans `src/main/modules/`, sans toucher
au reste. Un module reçoit l'objet `pet` et peut le faire parler (`pet.say`), changer son
humeur (`pet.setMood`), jouer une animation (`pet.play`) ou écouter ce que tu fais avec
lui (`pet.bus.on('clicked', ...)`). Le détail est en haut de `src/main/modules/index.js`.

Les actions sur ton ordinateur passent par `src/main/tools.js` : un outil qui ne fait que
lire (chercher un fichier, diagnostiquer) s'exécute directement, et un outil qui modifie
quelque chose affiche toujours une fenêtre pour te demander ton accord avant.

Prévu ensuite :

- **Aiguillage** : chaque demande passe déjà par `src/main/router.js`, qui n'a pour
  l'instant qu'une destination (`chat`). Claude Code et Cowork s'y ajouteront comme
  destinations, et l'aiguilleur choisira la bonne selon la demande.
- **Recherche et diagnostic** : il cherche des fichiers sur ton PC et t'aide à comprendre un problème quand tu le lui demandes.

Réglages enregistrés dans `%APPDATA%\claude-pet\settings.json`.
