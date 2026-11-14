# Plan technique — jeux de société dans le village (étape 3)

## 1. Audit de l'existant (ce qui est réutilisé, rien n'est remplacé)

| Élément | Constat | Décision |
|---|---|---|
| Rendus | Deux moteurs : 3D (three.js, `main.js`) et 2D (`world2d.js`, sprites `art2d.js`). Les points d'interaction passent par `NPC_DATA.concat(SPOTS, lifeActive())` (distance `r`), le bouton `#act` et `useNear()`. | Les tables sont de nouveaux « spots » (`LCA.games.TABLES`), dessinés dans les deux moteurs ; interaction par le même bouton `#act`. |
| Temps réel | `server/realtime.cjs` (WebSocket, 10 Hz, jetons de débit, statut `guest_online`/`authenticated` vérifié serveur), `world.cjs` (position, salon). | Nouveau module `server/tables.cjs` branché sur le même socket (messages `tbl`), mêmes limites de débit, positions lues dans `world`. Pas de second serveur. |
| Transport client | `js/online/socket.js` (WS) ; HTTP en repli sans temps réel. | Les parties en ligne exigent le WebSocket ; le HTTP ne les propose pas (message clair). |
| Statuts | `guest_local` (aucun réseau), `guest_online`, `authenticated`. | Voir §5. |
| Sauvegardes | Slot invité / slot compte sur l'appareil. Cloud : **hors périmètre** (consigne). | Historique et scores gardés dans la sauvegarde locale du joueur. |
| Persistance serveur | Aucune (Render sans disque ; Supabase non touché). | Classement en mémoire par session de serveur ; limite documentée. |
| Style | Variables CSS `--ink --fg --accent --sky --leaf --glass`, cartes `.glass`. | Panneau de jeu `#gamePanel` dans le même style. |

## 2. Architecture modulaire

```
js/games/core.js            registre LCA.games, RuleError, rng, utilitaires, définition des tables (TABLES)
js/games/rules/<id>.js      règles PURES (aucun DOM, aucun réseau) — utilisables dans le navigateur ET sur le serveur
js/games/ui/<id>.js         rendu du plateau (DOM/SVG) ; ne contient AUCUNE règle
js/games/panel.js           panneau commun : en-tête, joueurs, historique, boutons, chat rapide, invitations
js/games/session.js         session locale (solo contre IA) et distante (WebSocket) derrière la même interface
js/games/world.js           tables physiques (spots 2D/3D), occupation, invitations
server/tables.cjs           gestionnaire de tables (validation, sièges, observateurs, chronomètres, déconnexions)
```
Ajouter un jeu = un fichier `rules/<id>.js`, un `ui/<id>.js`, une ligne dans `TABLES`. Aucun autre fichier à modifier.

## 3. Contrat des règles (`js/games/rules/<id>.js`, UMD : `module.exports` en Node, `LCA.games.register` dans le navigateur)

```
def = {
  id, name (fr), minPlayers, maxPlayers, teams? (ex. [[0,2],[1,3]]),
  init({players, rng}) -> state            // état JSON-sérialisable ; rng() ∈ [0,1) fourni par l'appelant
  turn(state) -> siège qui doit jouer | -1 si terminé
  legalMoves(state, seat) -> [move]        // doit aussi fonctionner sur view(state, seat) (cartes : infos cachées masquées)
  apply(state, move, seat) -> nouvel état  // PURE ; jette RuleError(code,msg) si coup illégal, mauvais siège, partie finie, coup mal formé
  result(state) -> null | {winners:[sièges], draw:bool, reason:string, scores:{…}}
  view(state, seat|null) -> état masqué pour ce siège (observateur : seat=null). Jeux à information parfaite : copie de l'état.
  chooseMove(view, seat, {level:1|2|3, budgetMs, rng}) -> move   // IA. Reçoit UNIQUEMENT la vue (pas de triche possible)
  notation?(state, move) -> string         // historique lisible
}
```
Les coups sont des objets JSON simples. `apply` ne fait jamais confiance à `move` : il le valide contre `legalMoves`.

## 4. Contrat des rendus (`js/games/ui/<id>.js`)
`LCA.gameUI.register(id, {mount(el, api) -> {update(view, info), destroy()}})` avec
`api = {seat, onMove(move), legal() -> [move], t(texte)}` et `info = {turn, mySeat, result, last, names}`.
Le rendu n'applique jamais un coup lui-même : il appelle `api.onMove`, la session décide.

## 5. Statuts et restrictions

| Statut | Solo (IA) | Table publique | Table privée / invitations | Classement |
|---|---|---|---|---|
| `guest_local` | oui, 100 % local, zéro réseau | non (pas de réseau) | non | historique local seulement |
| `guest_online` | oui | oui (sièges et observation) | peut observer / être invité à une table publique ; ne crée pas de table privée | non (parties « amicales ») |
| `authenticated` | oui | oui | crée et accepte | classement de session serveur + historique local du compte |

## 6. Serveur (`server/tables.cjs`)
- Tables fixes par salon (village) : positions partagées client/serveur ; **le serveur refuse un siège ou une observation si le joueur est trop loin de la table** (anti-triche).
- Protocole `{t:'tbl', op:…}` : `list`, `sit` (avec `priv:true` pour une table privée, `game` pour une table de cartes), `start`, `stand`, `move`, `resign`, `watch`, `unwatch`, `invite`, `accept`, `decline`, `say` (messages rapides prédéfinis uniquement), `resume`, `rematch`, `rank`.
- L'état n'existe que sur le serveur ; chaque participant reçoit `view(state, siège)`.
- Chronomètre de coup (120 s) → défaite au temps ; déconnexion → 60 s de grâce avec jeton de reprise, puis abandon.
- Tables de cartes : sièges vides complétables par des robots (IA).
- Limites : une table par joueur à la fois, débit global par connexion inchangé, messages de table plafonnés.

## 7. IA
Jeux à information parfaite : alpha-bêta avec budget de temps (3 niveaux). Cartes : robots heuristiques qui ne lisent que `view`.

## 8. Variantes retenues
- **Awalé** : 2×6 trous, 4 graines, captures de 2-3 en chaîne, pas de rafle totale, obligation de nourrir, fin à 25 graines ; boucle infinie → chacun garde les graines de son côté.
- **Dames** : internationales 10×10 (prise obligatoire, prise majoritaire, dames volantes, prise arrière).
- **Échecs** : règles FIDE complètes (roque, prise en passant, promotion, pat, répétition ×3, 50 coups, matériel insuffisant).
- **Cartes** (choix de l'utilisateur) : Belote (classique à prise, 4 joueurs en 2 équipes, 501 points), Bataille, Menteur ; jeu **original N’Zassa de 52 cartes** (4 familles illustrées : Terre, Eau, Soleil, Étoile ; belote avec les 32 cartes 7→As). Les noms et symboles des familles sont à valider culturellement.

## 9. Tests prévus
Unitaires des règles (perft pour les échecs, scénarios pour dames/awalé), coups illégaux et triche (mauvais siège, coup hors-tour, partie finie, JSON malformé), IA (légalité, budget de temps, supériorité sur un joueur aléatoire, robots de cartes sans accès aux mains cachées), serveur avec vrais WebSocket (sièges, distance, observation, invitations, déconnexion/reprise, abandon, chronomètre), navigateurs réels (plusieurs joueurs, reconnexion), intégration monde (interaction `#act`, 2D et 3D), performances (charge multi-tables).

## 10. État de réalisation (v0.22.0, 13/11/2026)

| Pièce | Fichiers | Tests |
|---|---|---|
| Règles + IA des 6 jeux | `js/games/rules/*.js`, `js/games/ai.js` | Awalé 21, Dames 13, Échecs 28 (perft officiels), Cartes 41 (`tests/games-*.test.cjs`) |
| Dessin des cartes | `js/games/ui/cards.js`, `css/games-cards.css` | `tests/games-cards-ui.test.cjs` (9) |
| Rendus des 6 jeux | `js/games/ui/{awale,dames,echecs,belote,bataille,menteur}.js`, `js/games/ui/kit.js`, `css/games-boards.css` | `tests/games-flow.mjs` partie A (une partie contre l'IA par jeu, dans Chromium) |
| Panneau commun | `js/games/panel.js`, `css/games-panel.css` | `tests/games-flow.mjs` parties A–C |
| Sessions locale et en ligne | `js/games/session.js` | idem |
| Tables dans le monde 2D et 3D | `js/games/world.js`, `js/main.js`, `js/world2d.js` | `tests/games-flow.mjs` (bouton « Jouer », voyants d'état en 3D) |
| Serveur des tables | `server/tables.cjs` | `tests/tables-ws.test.cjs` (10 tests, vrais WebSocket) ; partie B de `games-flow.mjs` (plusieurs navigateurs, reprise après rechargement) |
| Charge | `scripts/loadtest.mjs --tables 16` / `--robots` | `reports/charge-tables-*.json`, voir `docs/CAPACITE.md` |

Limites restantes : classement en mémoire (perdu au redémarrage du serveur) ; Menteur borné à 400 coups ; annonces de belote non gérées ; une partie en cours est perdue si le serveur redémarre ; noms et symboles des familles de cartes à valider culturellement.
