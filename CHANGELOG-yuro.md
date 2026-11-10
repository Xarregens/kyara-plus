# Changelog — Yuro Plus (yurocollection.fr)

Script compagnon pour yurocollection.fr, hébergé dans ce dépôt à côté de Kyara Plus. Objectif : relancer le
« replay auto » du mode farm quand un combat ne repart pas tout seul. Installation :
<https://raw.githubusercontent.com/xarregens/kyara-plus/main/yuroPlus.user.js>.

## 0.1.0
- Première version : pas encore de relance, uniquement les outils pour la construire. Le script note en permanence
  les derniers échanges avec le serveur (e-mails et clés sensibles masqués) et la connexion continue du jeu.
  Commandes console : `yuroDiag.page()` photographie la page et ces échanges à l'instant même (à lancer pendant un
  blocage), `yuroDiag.menu(60)` enregistre en plus les clics et changements de page pendant 60 s, `yuroDiag.download()`
  sauvegarde le tout.
