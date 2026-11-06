# Changelog

Base : Kyara Plus 2.34.3 (Myuki). Les versions de travail étaient numérotées `2.34.3-barres.N` ; depuis la publication
sur ce dépôt, la numérotation reprend normalement (2.35.0, 2.35.1…), toujours supérieure à celle du script d'origine
pour que Tampermonkey ne revienne jamais en arrière.

## 2.35.27
- Mon activité : une adresse gardant `discussion=1` (ancien bouton « Discuter ») basculait la page sur la vue du site
  au chargement. Elle ouvre maintenant l'échange et sa discussion dans la vue Kyara Plus.

## 2.35.26
- Mon activité, échanges directs : la discussion est dans la ligne, sans quitter la vue Kyara Plus. « Discuter (N) »
  déplie les messages (ceux du site, lus à `/trades/<id>/messages`, plus le message de la proposition), une case pour
  écrire et « Envoyer » (Entrée aussi). Les messages se rafraîchissent avec la page, toutes les minutes.

## 2.35.25
- Relevé `kyaraPlusSeries.download()` sur la page Marché : enregistre aussi tous les appels d'échanges directs du site
  (lecture et envoi de messages), avec la méthode et le contenu envoyé, pour construire la discussion dans la vue
  Kyara Plus.

## 2.35.24
- Mon activité, échanges directs : bouton « Discuter » sur chaque échange à traiter ou envoyé, à côté d'Accepter /
  Refuser / Annuler, qui ouvre la vue du site sur cet échange (la boîte de messages est celle du site). Le lien
  « Ouvrir » du détail faisait auparavant défiler la vue Kyara Plus sans rien montrer.

## 2.35.23
- Auto-accept : parmi les cartes qui respectent les règles, il choisit la plus rentable **que le fair-play devrait
  accepter** (barres et limites connues), comme le bouton jaune du panneau, au lieu de la plus rentable tout court.
  Une offre dont aucune carte ne passe n'est plus tentée. Si le site refuse quand même (compteurs périmés), l'offre
  est retentée une fois avec la carte suivante au lieu d'être abandonnée.

## 2.35.22
- Mon activité : la page ne remonte plus toute seule quand on a fait défiler une longue liste (Tableau avec les offres
  mémorisées, par exemple). À chaque rafraîchissement, toutes les lignes étaient reconstruites et replacées, et le
  navigateur oubliait la hauteur de celles hors écran : la page raccourcissait d'un coup. Les lignes inchangées sont
  maintenant gardées telles quelles (plus rapide aussi), et la ligne visible en haut reste à sa place.

## 2.35.21
- Auto-accept : case « Seulement les cartes qu'il me manque » : une offre dont la carte reçue est déjà dans ma
  collection n'est jamais acceptée. Mémorisée, figée pendant la marche comme les autres règles.

## 2.35.20
- Mon activité, Échanges → Tableau : le site ne renvoie que les 30 dernières offres acceptées, sans suite possible
  (sondage du 06/11/2026 : dix façons de demander la suite renvoient les mêmes 30). Le script mémorise désormais chaque
  offre du tableau qu'il voit passer (14 jours, 2 000 au plus) et les ajoute sous les 30 du site ; « Voir plus » les
  déroule. Seules les offres vues pendant que le site était ouvert avec le script sont connues.

## 2.35.19
- Commande console `kyaraPlusDiag.probe()` : demande au site, en lecture seule, les offres du tableau avec quelques
  paramètres de pagination et enregistre les réponses, pour savoir si les offres plus anciennes que les 30 dernières
  sont accessibles.

## 2.35.18
- Relevé `kyaraPlusSeries.download()` : fonctionne aussi sur la page Marché et y enregistre les réponses dont Mon activité
  est construit (historique, offres du tableau, échanges directs, marché), pour comprendre la limite des offres du
  tableau affichées.

## 2.35.17
- Auto-accept : les règles (raretés, seuils de gain, « Ou si gain ≥ », « Seulement mes doublons », tout / rien) sont
  figées tant qu'il tourne ; il faut l'arrêter pour les modifier, puis le relancer. Avant, chaque changement prenait
  effet aussitôt, et un seuil en cours de saisie (« 500 » → vide → « 200 ») laissait passer n'importe quoi un instant.

## 2.35.16
- Bloc Fair-play de « Proposer un échange » simplifié : une seule phrase par défaut (« Devrait passer. Elregenator y
  gagne : sa barre Dons passe de 10 000 à 9 570 », ou « Le site refusera : il manque … », ou « Sans effet sur les
  barres »), et un bouton « Détails » qui déplie les pastilles, mémorisé. Le détail ne montre plus que le joueur dont
  les barres bougent, puis « Limite entre vous deux ».

## 2.35.15
- Bloc Fair-play de l'échange : pastilles, chiffres et libellés plus grands (13 px au lieu de 10).

## 2.35.14
- Bloc Fair-play de l'échange : la flèche « avant → après » des pastilles devient une vraie flèche, lisible (elle
  ressemblait à un signe moins).

## 2.35.13
- Bloc Fair-play de « Proposer un échange » : chaque pastille montre ce qui reste sur la barre avant puis après
  l'échange (« Dons 10 000 → 9 570 »), pour les barres de chaque joueur comme pour la limite entre vous deux
  (« Dons 3 000 → 2 570 », la même valeur que la phrase du site). Infobulle avec le maximum de chaque barre.

## 2.35.12
- Fenêtre « Proposer un échange » : sous la bande du site, un bloc Fair-play indique, avant l'envoi et à chaque carte ou
  chakra ajouté, ce que l'échange retirerait aux barres Dons / Écart de chacun des deux joueurs (pastilles orange / bleue,
  grises quand rien n'est entamé, rouges avec le montant manquant), ce qu'il prend sur les limites entre vous deux
  (dons et écart dans le sens de l'échange, sur ce que le site autorise encore), et un verdict : « devrait passer »,
  « le site refusera » ou « sans effet sur les barres ». Infobulles avec le reste de chaque barre.

## 2.35.11
- Commande console `kyaraPlusDiag.dialog()` : enregistre la fenêtre ouverte du site (proposition d'échange) avec la
  réponse fair-play du profil affiché, pour préparer l'aide au choix des cartes. Le script lit maintenant aussi, dans la
  réponse fair-play du site, les barres du partenaire et ce qui reste entre les deux joueurs (dons et écart dans chaque
  sens), confirmés par le relevé du 06/11/2026 : 3 000 ◆ de dons et 5 000 ◆ d'écart par sens sur 48 h.

## 2.35.10
- Auto-accept : le total depuis l'activation devient une pastille colorée (verte / rouge) plus grande, à droite de la
  ligne « Acceptés », au-dessus de la colonne des gains ; le nombre d'échanges et l'heure restent en gris.

## 2.35.9
- Auto-accept : chaque échange de la liste « Acceptés » affiche à droite son gain estimé (prix moyen de la carte reçue
  moins celui de la carte donnée, détail au survol). Sur la ligne « Acceptés », le total depuis l'activation :
  « 8 échanges · +1 240 ◆ · depuis 01:43 », avec le détail par rareté donnée en infobulle. Mémorisé au rechargement de
  la page, remis à zéro par « Activer » ; la phrase d'état compte désormais tous les échanges, plus seulement les 8
  derniers affichés. Le message de confirmation indique aussi le gain.

## 2.35.8
- Collection : la barre de filtres des albums (Min. / Max. persos, « Il ne manque que », « Masquer les déjà réclamées »)
  et les cartes manquantes d'un album pouvaient manquer quand on arrivait sur la page par un lien du site (sans
  rechargement) : le script ne voyait pas toujours ces changements de page. Il les détecte maintenant dans tous les cas,
  pour toutes les pages (Marché, Mon activité, Collection…).
- Les interrupteurs `kyaraPlusDiag.off(...)` s'effacent à l'installation d'une nouvelle version, et un message signale
  les fonctions encore éteintes sur la page où elles devraient tourner.

## 2.35.7
- Collection, vue Cartes : le menu du profil se refermait aussitôt ouvert. Les filtres d'albums mémorisés faisaient
  cliquer en boucle le « Afficher plus » des cartes (pris pour celui des albums), et chaque clic fermait le menu comme
  un clic à côté. Le chargement automatique ne touche plus qu'au bouton de la liste des albums.

## 2.35.6
- Commandes console de diagnostic `kyaraPlusDiag` : `off("collection")` / `on("collection")` désactivent ou réactivent
  les fonctions d'une page (mémorisé), `features()` les liste, `menu()` puis `download()` enregistrent les événements et
  les changements de l'en-tête pendant 15 s (e-mails masqués) pour comprendre un menu du site qui se referme.

## 2.35.5
- Tableau des offres : le côté « Sans perte ≠ rareté » de la pilule s'appelle « Symbios la tepu » (même effet) ;
  le bouton à part de la 2.35.4 est retiré.

## 2.35.4
- Tableau des offres : bouton indépendant « Symbios la tepu », qui cache les cartes d'une rareté supérieure à celle
  reçue quel que soit le gain ; se combine avec les autres filtres.

## 2.35.3
- Bouton partagé des filtres de perte : le contour du côté actif suit la forme arrondie de la pilule.

## 2.35.2
- Tableau des offres : le filtre « Sans perte » devient un bouton partagé à deux côtés, « Sans perte ≠ rareté »
  (cache les cartes données à perte contre une rareté différente, dans les deux sens) et « Sans aucune perte »
  (cache toute perte, même rareté comprise). Un seul côté actif à la fois ; l'ancien réglage est repris sur le premier.

## 2.35.1
- Tableau des offres : le filtre « Sans déclassement à perte » s'appelle « Sans perte » (même effet, explication au survol).

## 2.35.0 — publication sur GitHub
- Même contenu que 2.34.3-barres.61 ; en-tête du script pointant vers ce dépôt (mises à jour automatiques).

## 2.34.3-barres.49 → .61 — Mon activité, auto-accept, finitions
- Mon activité : onglets Échanges / Transactions avec sous-catégories, Achats sans les enchères perdues, historique par
  sous-catégorie chargé à l'ouverture (30 jours d'abord), requêtes initiales en parallèle, lignes réutilisées entre rendus,
  clics instantanés pendant le chargement, barre d'onglets centrée, phrase d'état masquée quand rien n'attend.
- Chakra bloqué dans l'en-tête du site ; pastilles « Chakra engagé » et « Cartes bloquées » retirées.
- Auto-accept : règle « même rareté » conditionnée au gain minimum de la ligne.
- Panneau des offres : tuiles de largeur fixe.

## 2.34.3-barres.42 → .48 — Séries
- Relevé « séries », badge « déjà réclamée » / « à réclamer » sur les albums, filtre « Masquer les déjà réclamées »,
  chargement automatique et sans clignotement des paquets d'albums quand des filtres sont actifs ; bouton cassé de la page
  Missions retiré (le site plie désormais lui-même sa liste).

## 2.34.3-barres.13 → .41 — Panneau des offres et auto-accept
- Auto-accept : panneau réécrit en phrases, gain minimum par ligne, tout / rien.
- Panneau de droite : liste unique Offres rentables + bangers, cartes dans le sens du tableau, curseur de taille,
  code couleur des exemplaires, palette revue, recommandation = meilleure carte acceptée par le fair-play,
  limites par partenaire, lectures périmées ignorées, relevé des échanges (commande console).

## 2.34.3-barres.1 → .12 — Fair-play
- Pastilles Dons / Écart / Refusé sous chaque carte, jauge avec barres et légende, lecture des barres dès la première
  page, chargement des offres optimisé (pages pré-chargées, rendus regroupés), relevé du fair-play.
