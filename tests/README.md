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
| `lossconfirm.cjs` | Tableau des offres | Fenêtre « Échange à perte » avant un « Donner » à gain négatif : Annuler / Échap sans rien envoyer, « Donner quand même » accepte ; gain positif direct ; puce « Confirmer les pertes » qui coupe la fenêtre, mémorisée. |
| `smoke.cjs` | Tableau des offres | Temps d'apparition du tableau, de la jauge, des pastilles ; nombre de rendus ; requêtes. |
| `propose.cjs` | Tableau des offres | « Proposer une carte » : bouton du site connu, renommé / déplacé ; fenêtre du site en `role=dialog`, en `<dialog>` ou simple bloc, seule visible au-dessus du tableau Kyara Plus ; fenêtre fermée par un clic extérieur ; fermeture rapide sans bascule ; sans effet → tableau du site + bouton de retour ; `kyaraPlusDiag.board()`. |
| `interact.cjs` | Tableau des offres | Masquer / réafficher, « Voir plus », filtres, recherche, « Donner » (état occupé + refus serveur). |
| `verdict.cjs` | Proposer un échange | Bloc Fair-play sous la bande du site : phrase de verdict, « Détails » mémorisé, barres du joueur concerné et limite entre les deux ; mise à jour quand les totaux changent ; retrait à la fermeture. |
| `widths.cjs` | Panneau de droite | Tuiles de même largeur, aucun bouton tronqué. |
| `sublatency.cjs` | Mon activité (Échanges) | Délai clic → affichage des sous-catégories, pendant et après le chargement. Args : latence ms, pages. |
| `scrollkeep.cjs` | Mon activité (Tableau, 210 lignes) | Position de défilement et ligne du haut inchangées après le rafraîchissement d'une minute (lignes réutilisées, pas de remontée de page). Dure 70 s. |
| `boardmemory.cjs` | Mon activité (Tableau) | Offres du tableau mémorisées entre deux visites quand le site ne les renvoie plus ; offres ouvertes non mémorisées ; « Voir plus ». |
| `discuss.cjs` | Mon activité (Échanges) | Discussion dans la ligne : « Discuter (N) », messages lus, envoi (Entrée), compteur mis à jour, fermeture. |
| `wake.cjs` | Mon activité | Rafraîchissement immédiat quand le site relit ses échanges ou redessine son panneau ; pas de boucle sur les propres requêtes du script. |
| `dialogchips.cjs` | Proposer un échange | Filtres du script dans leur rangée (jamais en double), « Il me manque » immédiat, « Ses doubles » dès les exemplaires connus, demandés en priorité ; changement d'onglet. |
| `addmissing.cjs` | Proposer un échange | Bouton « + Ce qui me manque » : compteur, filtres respectés, cartes déjà dans le plateau sautées, une fois chacune, 20 cartes différentes au plus de son côté (exemplaires en double comptés une fois), dans l'ordre affiché, arrêt si le site refuse ; caché sur l'onglet « Mes cartes ». |
| `subkeep.cjs` | Mon activité | Sous-catégorie rouverte après rechargement (mémorisée), adresse du site suivie sans mémoire. |
| `activity3.cjs` | Mon activité | Onglets Échanges / Transactions, sous-catégories par défaut, historique chargé par sous-catégorie. |
| `loadtime_run.cjs` | Mon activité | Temps jusqu'au premier affichage et aux premières lignes, chronologie des requêtes. |
| `tree.cjs` | Mon activité | Onglets centrés, cadre des sous-catégories et sa pointe. |
| `held.cjs` | En-tête du site | Badge « +N » du chakra bloqué, mise à jour par les réponses bootstrap, réattachement. |
| `autopanel.cjs` | Auto-accept | Lignes par rareté, pastilles, tout / rien, gain global, doublons, seuil par ligne. |
| `autofair.cjs` | Auto-accept | Carte la plus rentable qui passe le fair-play (pas la plus rentable tout court), retentative avec la carte suivante après un refus du site, offre impossible jamais tentée ; « Ou si gain ≥ » prend le dernier exemplaire et une carte déjà possédée. |
| `autolog.cjs` | Auto-accept | Gain estimé sur chaque ligne « Acceptés », total depuis l'activation (détail par rareté en infobulle), mémorisé au rechargement, remis à zéro par « Activer ». |
| `autoloss.cjs` | Auto-accept | « Ou si elle me manque, perte ≤ X en donnant : (C)…(M) » : décochée par défaut, aucune perte acceptée (même par une règle de rareté sans seuil) ; cochée, petite perte prise pour une carte manquante, une seule fois par carte, jamais une carte possédée, une perte au-delà de X ni un dernier exemplaire (même case doublons décochée) ; L et M éteintes par défaut ; seuils des lignes ignorés. |
| `claims2.cjs` | Collection (albums) | Badges « déjà réclamée » / « à réclamer », bouton « Masquer les déjà réclamées ». |
| `autoexpand3.cjs` | Collection (albums) | Chargement automatique des paquets quand des filtres sont actifs, sans clignotement. |
| `survey.cjs` | Mon activité | Commande console `kyaraPlusReleve` (relevé fair-play). |
| `series.cjs` | Missions / Collection | Commande console `kyaraPlusSeries` (relevé séries), masquage des e-mails. |

Les formes des réponses API simulées (offres, collection, fair-play, historique, progress) sont dans chaque script :
elles ont été déduites des vraies réponses observées (relevés `kyaraPlusReleve` / `kyaraPlusSeries`).
