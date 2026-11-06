# Kyara Plus — notes pour Claude Code

Ce dépôt contient **un seul programme** : `kyaraPlus.user.js`, un userscript Tampermonkey pour le jeu de cartes
kyara.games. Le propriétaire (Xarregens) n'est pas développeur : parler simplement, livrer des versions complètes, tester
avant d'envoyer, ne jamais toucher au vrai site autrement qu'en lecture.

## Le fichier

- C'est un **bundle esbuild** d'un ancien projet `src/` dont on n'a plus la source : les modules sont délimités par des
  commentaires `// src/features/....js`, `// src/data/....js`, etc. On modifie le bundle directement.
- Tout est dans une IIFE ; les `function` sont hissées, les `var` aussi, les `const`/`let` de module sont initialisés
  avant que les features ne montent (`onNavigate(syncFeatures)` à la fin), donc l'ordre des modules importe peu, sauf
  pour du code exécuté au chargement.
- `config_default` en tête du fichier regroupe les réglages (délais API, offres, fair-play, activité…).
- Les styles sont dans deux endroits : `var styles_default` (gros template literal, **contient des séquences `\r`
  littérales en fin de ligne** : ne pas les confondre avec des retours chariot) et un second `injectStyles(\`...\`)` près
  de la fin (`// Styles for the fair-play gauge…`), où vont les styles ajoutés depuis la reprise.
- Fins de ligne : le fichier du dépôt est en LF. Le propriétaire l'installe via Tampermonkey depuis l'URL Raw.
- Version : `// @version` (2.35.x) **et** `var SURVEY_VERSION` à incrémenter à chaque publication. Garder les URL
  `@updateURL` / `@downloadURL` vers ce dépôt, sinon Tampermonkey irait chercher le script d'origine de Myuki.
- Publier = commit sur `main` ; Tampermonkey met à jour les utilisateurs automatiquement.

## Vérifier

`node --check kyaraPlus.user.js` puis les tests de `tests/` (voir `tests/README.md`). Ils simulent le site ; ils ne
prouvent pas la forme exacte des vraies réponses, qui vient des relevés (commandes console `kyaraPlusReleve.download()`,
`kyaraPlusSeries.download()`, `kyaraPlusPerf()`) que le propriétaire peut fournir. Pour isoler un conflit avec le site :
`kyaraPlusDiag.off("<id ou préfixe>")` désactive des fonctions (réglage `disabledFeatures`), `kyaraPlusDiag.menu()` +
`download()` enregistre événements et mutations de l'en-tête.

## Ce que le site fait (observé dans les relevés, nov. 2026)

- `/api/fair-play/with/<joueur>` renvoie aussi (relevé du 06/11/2026) `theirReceivedLeft` / `theirFreeLeft` (barres du
  partenaire), `giveLeft` / `getLeft` (dons encore possibles vers lui / de lui, 3 000 max) et `giveBalanceLeft` /
  `getBalanceLeft` (écart encore permis dans chaque sens, 5 000 max) ; `maxMargin` et `minPrice` sont des objets par
  rareté. La fenêtre « Proposer un échange » du site affiche elle-même le don et le reste « entre vous ».
- Fair-play : deux compteurs sur 48 h glissantes, `myReceivedLeft` (« Dons ») et `myFreeLeft` (« Écart »), lus par
  `/api/fair-play/with/<joueur>`. Un échange à mon avantage consomme `gift = max(0, reçu − freeRatio × donné)` sur Dons et
  `gap − gift` sur Écart (`freeRatio` 2, `ignoreBelow` 100) ; tout revient 48 h plus tard à la minute. Ventes, achats,
  ordres d'achat et échanges directs comptent aussi. Vérifié sur 378 échanges : exact.
- Limites **par paire de joueurs** (hypothèse tirée des messages de refus) : 3 000 ◆ de dons et 5 000 ◆ dans le même sens
  sur 48 h (`config_default.fairPlay.pairGiftCap` / `pairFlowCap`). Le site renvoie parfois des compteurs périmés pour un
  joueur donné (lectures A → B → A) : garde-fou `acceptReadGraceMs`.
- `/api/me/progress` → `series` : séries dont la récompense a été réclamée (`claimed`, `completedAt`), récompense
  seulement pour les séries d'au moins 5 cartes. `/api/me/bootstrap` → `me.chakra`, `me.chakraHeld` (chakra bloqué).
- File d'attente des requêtes : rafale de 4 puis une toutes les 250 ms × `x-kyara-rush` ; limite générale du site
  300/min, limite marché 20/min pour les acceptations.

## Pièges connus

- Un `.click()` synthétique sur un bouton du site est vu par le site comme un vrai clic : il ferme tout menu ouvert
  (profil…). Ne cliquer que la cible voulue et seulement quand elle existe (`albumShowMore()` dans collection-albums :
  la vue Cartes a son propre « Afficher plus », avec le même sélecteur `main .more button`).
- Fenêtre « Proposer un échange » (`[role=dialog]`, enregistrement du 06/11/2026) : `form .trays section.tray` (la
  mienne a la classe `mine`), `header .total` = « ≈ 423 ◆ » cartes + chakra aux prix fair-play, `.slots li img` =
  `/cards/sm/<id>.webp`, `label.ch input` = chakra, puis `.verdict` (bande du site), puis `.shelf` (grille). Le bloc
  `kp-verdict` du script s'insère après `.verdict`. `kyaraPlusDiag.dialog()` enregistre la fenêtre ouverte.
- `/collection` sert les deux vues (Cartes et Albums) sur la même URL : une feature « albums » tourne aussi en vue Cartes.

## Goûts du propriétaire

Interface sobre : peu de texte, infobulles plutôt que paragraphes, onglets centrés, couleurs fixes (bleu nuit `#161b26`
pour les cartes d'offre, tuiles `#1e2534`, bouton jaune pour le choix recommandé), pastilles « couleur + chiffre ».
Toujours expliquer en français, sans jargon, et livrer le fichier complet.
