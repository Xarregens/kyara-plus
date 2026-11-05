# Changelog

Base : Kyara Plus 2.34.3 (Myuki). Les versions de travail étaient numérotées `2.34.3-barres.N` ; depuis la publication
sur ce dépôt, la numérotation reprend normalement (2.35.0, 2.35.1…), toujours supérieure à celle du script d'origine
pour que Tampermonkey ne revienne jamais en arrière.

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
