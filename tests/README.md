# Tests (navigateur simulé)

Chaque script lance un Chromium sans écran (Playwright), sert une fausse page kyara.games avec une fausse API (`page.route`),
injecte le userscript et vérifie ce qui s'affiche. Aucun test ne touche au vrai site.

Prérequis : Node 18+, puis `npm install playwright` et `npx playwright install chromium` (une fois).

Lancer un test depuis ce dossier : `node <test>.cjs ../kyaraPlus.user.js`

| Script | Page | Ce qu'il vérifie |
| --- | --- | --- |
| `cardsview.cjs` | Collection, vue Cartes | Aucun clic automatique sur le « Afficher plus » des cartes, menu du profil qui reste ouvert, bouton non grisé. |
| `diag.cjs` | Toutes pages | Commandes `kyaraPlusDiag` : enregistrement des événements, masquage des e-mails, téléchargement, désactivation d'une fonction mémorisée au rechargement, oubliée par une nouvelle version, signalée par un message ; enregistrement de la fenêtre ouverte (`dialog()`). |
| `navigate.cjs` | Accueil → Collection | Navigation interne du site (pushState natif, hors de portée du script) : barre de filtres des albums montée, retirée en partant, remontée au retour. |
| `lossfilter.cjs` | Tableau des offres | Bouton partagé « Symbios la tepu » / « Sans aucune perte » : cartes cachées selon le côté, exclusivité des côtés. |
| `smoke.cjs` | Tableau des offres | Temps d'apparition du tableau, de la jauge, des pastilles ; nombre de rendus ; requêtes. |
| `interact.cjs` | Tableau des offres | Masquer / réafficher, « Voir plus », filtres, recherche, « Donner » (état occupé + refus serveur). |
| `widths.cjs` | Panneau de droite | Tuiles de même largeur, aucun bouton tronqué. |
| `sublatency.cjs` | Mon activité (Échanges) | Délai clic → affichage des sous-catégories, pendant et après le chargement. Args : latence ms, pages. |
| `activity3.cjs` | Mon activité | Onglets Échanges / Transactions, sous-catégories par défaut, historique chargé par sous-catégorie. |
| `loadtime_run.cjs` | Mon activité | Temps jusqu'au premier affichage et aux premières lignes, chronologie des requêtes. |
| `tree.cjs` | Mon activité | Onglets centrés, cadre des sous-catégories et sa pointe. |
| `held.cjs` | En-tête du site | Badge « +N » du chakra bloqué, mise à jour par les réponses bootstrap, réattachement. |
| `autopanel.cjs` | Auto-accept | Lignes par rareté, pastilles, tout / rien, gain global, doublons, seuil par ligne. |
| `autolog.cjs` | Auto-accept | Gain estimé sur chaque ligne « Acceptés », total depuis l'activation (détail par rareté en infobulle), mémorisé au rechargement, remis à zéro par « Activer ». |
| `claims2.cjs` | Collection (albums) | Badges « déjà réclamée » / « à réclamer », bouton « Masquer les déjà réclamées ». |
| `autoexpand3.cjs` | Collection (albums) | Chargement automatique des paquets quand des filtres sont actifs, sans clignotement. |
| `survey.cjs` | Mon activité | Commande console `kyaraPlusReleve` (relevé fair-play). |
| `series.cjs` | Missions / Collection | Commande console `kyaraPlusSeries` (relevé séries), masquage des e-mails. |

Les formes des réponses API simulées (offres, collection, fair-play, historique, progress) sont dans chaque script :
elles ont été déduites des vraies réponses observées (relevés `kyaraPlusReleve` / `kyaraPlusSeries`).
