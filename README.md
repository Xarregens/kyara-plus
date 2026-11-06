# Kyara Plus — fork Xarregens

Userscript pour [kyara.games](https://kyara.games) (Tampermonkey / Violentmonkey). Il reprend et poursuit
**Kyara Plus** de Myuki (<https://github.com/Mxyuki/Kyara-Script>), avec son accord, après l'arrêt du script d'origine.
Licence MIT (voir `LICENSE`) : libre d'utilisation et de modification, en conservant les crédits.

## Installation

1. Installer l'extension Tampermonkey (Chrome, Edge, Brave, Firefox).
2. Désinstaller le Kyara Plus d'origine s'il est présent (les deux ne doivent pas tourner en même temps).
3. Cliquer ici : **[Installer kyaraPlus.user.js](https://raw.githubusercontent.com/xarregens/kyara-plus/main/kyaraPlus.user.js)** —
   Tampermonkey ouvre sa fenêtre d'installation.
4. Recharger kyara.games.

Les mises à jour sont automatiques : Tampermonkey vérifie régulièrement ce dépôt et installe toute version plus récente
(menu Tampermonkey → *Vérifier les mises à jour* pour forcer).

## Ce que le fork ajoute au script d'origine

**Tableau des échanges (`/marche?onglet=offres`)**
- Sous chaque carte à donner, une pastille indique ce que l'échange entame sur les barres de fair-play : gris « 0 » (sans coût),
  bleu (Écart), orange (Dons), rouge (refusé, avec le montant manquant). Les limites entre deux joueurs (3 000 ◆ de dons,
  5 000 ◆ dans le même sens sur 48 h, déduites des messages de refus du site) sont prises en compte.
- Jauge Dons / Écart dans le panneau de droite, avec la légende des pastilles ; lue dès la première page d'offres.
- Filtres de perte en un seul bouton à deux côtés : « Symbios la tepu » (cartes données à perte contre une rareté différente, dans les deux sens) ou « Sans aucune perte » (toute perte, même rareté comprise) ; un seul côté actif à la fois. Les offres bangers à perte sont écartées.
- Panneau de droite : une seule liste « Offres rentables » (bangers inclus, badge *banger*), cartes compactes, lignes
  alignées comme le tableau, curseur de taille, gain minimum sur la ligne des onglets, choix recommandé = la meilleure
  carte que le fair-play devrait accepter (bouton jaune), tuiles de largeur fixe.
- Chargement plus rapide (requêtes en parallèle, rendus regroupés) et lectures de fair-play périmées ignorées.

**Auto-accept**
- Une ligne par rareté donnée, pastilles des raretés acceptées en retour, dont la même rareté (⇄) ; gain minimum par ligne
  (`gain ≥`) ; règle globale « Ou si gain ≥ » ; « Seulement mes doublons » ; raccourcis tout / rien.
- Liste « Acceptés » avec le gain estimé de chaque échange et le total depuis l'activation (détail par rareté au survol),
  mémorisé au rechargement.

**Collection et séries**
- Badge « déjà réclamée » / « à réclamer » sur chaque série (données `/api/me/progress` du site), bouton
  « Masquer les déjà réclamées », chargement automatique et discret des paquets de séries quand des filtres sont actifs.

**Proposer un échange (profil d'un joueur)**
- Sous la bande du site, une phrase dit si le site devrait accepter et ce que l'échange retire aux barres Dons / Écart
  du joueur qui y gagne ; « Détails » déplie les pastilles (barres de chacun, limite entre vous deux, avant → après).
  Mis à jour à chaque carte ou chakra ajouté, avant l'envoi.

**Mon activité**
- Deux onglets, Échanges (Reçus, Envoyés, Tableau) et Transactions (Ventes, Achats, Ordres), sous-catégories sous
  l'onglet actif ; « Achats » = cartes achetées et enchères gagnées (les perdues sont masquées).
- Historique chargé par sous-catégorie, à l'ouverture, 30 derniers jours d'abord (« Charger tout l'historique » pour le reste),
  pages lues en parallèle ; ouverture de la page deux fois plus rapide ; lignes réutilisées entre deux rendus.
- Chakra bloqué affiché dans l'en-tête du site, à côté du solde (badge « +N »).

## Commandes console (F12 → Console)

| Commande | Effet |
| --- | --- |
| `kyaraPlusReleve.download()` | Relevé des échanges du compte avec les jauges avant / après chacun (vérification du modèle de fair-play). |
| `kyaraPlusSeries.download()` | Relevé des pages Missions et Collection (réponses API, HTML des séries). |
| `kyaraPlusPerf()` | Temps de construction et d'affichage des derniers rendus de Mon activité. |
| `kyaraPlusFairLog.download()` | Journal brut du fair-play (script d'origine). |

## Réglages

Tout en haut du fichier, l'objet `config_default` : délais entre requêtes (`api`), nombre d'offres et rendus (`offers`),
limites par partenaire supposées (`fairPlay.pairGiftCap`, `fairPlay.pairFlowCap`), profondeur d'historique
(`activity.historyDays`, `historyFirstPages`), taille des pages (`historyPageSize`).

## Historique des versions

Voir `CHANGELOG.md`.
