# Architecture des fonctionnalités en ligne (comptes, récits, transcription, traduction)

**État réel (v0.22.0, 13/11/2026) : branchée en développement local, préparée pour Render, non déployée.** `npm run dev` démarre le jeu avec l’API du monde partagé et du chat sur `127.0.0.1:8787`. Cette API est indépendante des comptes du jeu (gérés par Supabase Auth, voir `docs/COMPTES.md`) ; son ancien module de comptes SQLite est conservé en héritage mais n’est plus utilisé par l’interface.

## Serveur temps réel (monde ouvert, chat, quiz, tables de jeux)
Un seul processus `node server/server.cjs`, HTTP + WebSocket sur `/v1/ws`. Le navigateur utilise le WebSocket (`js/online/socket.js`) et retombe sur le sondage HTTP seulement si le WebSocket est indisponible (sans quiz ni tables dans ce cas).

| Module serveur | Rôle |
|---|---|
| `server/world.cjs` | Joueurs, salons (un par langue), positions, chat du village, chat de proximité, emotes, statuts. |
| `server/realtime.cjs` | Connexions WebSocket, débit, deltas à 10 Hz, zone d'intérêt, danse collective, arrêt propre. |
| `server/identity.cjs` | Vérification du jeton Supabase (statut `authenticated`). |
| `server/quiz.cjs`, `server/quizbank.cjs`, `server/quizstore.cjs` | Quiz du village (voir `docs/QUIZ_VILLAGE.md`). |
| `server/tables.cjs` | Tables de jeux : sièges, observateurs, robots, chronomètre, reprise, invitations, classement de session (voir `docs/JEUX_PLAN.md`). |
| `server/nameguard.cjs` | Filtre des pseudos. |

Messages client → serveur : `join`, `pos`, `chat` (`near:true` pour la proximité), `emote`, `ping`, `quiz`, `tbl` (`op` : `list`, `sit`, `start`, `move`, `stand`, `resign`, `watch`, `unwatch`, `invite`, `accept`, `decline`, `say`, `resume`, `rematch`, `rank`).
Messages serveur → client : `welcome`, `s` (deltas), `nc` (chat de proximité), `act` (activité collective), `pong`, `err`, `bye`, `quiz`, `tbl`.

Toutes les variables `NZASSA_*`, leurs valeurs par défaut et la procédure de déploiement sont dans `docs/RENDER.md`. Capacité mesurée : `docs/CAPACITE.md`.

## Pièces (API HTTP héritée)
- `js/online/client.js` : client sans dépendance (`auth`, `stories`, `transcribe`, `translate`), isolé de l'interface.
- `js/online/config.js` : `apiBase` pointe automatiquement vers l’API locale sur `localhost` et `127.0.0.1`; ailleurs il reste vide jusqu’à configuration d’une API HTTPS.
- `scripts/dev.mjs` : démarre et arrête ensemble Vite et l’API, en autorisant l’origine locale du jeu.
- `server/server.cjs` : serveur de **référence** (Node ≥ 18) qui fixe le contrat. Lancer : `node server/server.cjs` (port 8787, local uniquement par défaut). Variables : `NZASSA_SECRET`, `NZASSA_DB`, `PORT`, `HOST`.
- `server/db.sqlite` : base SQLite créée automatiquement par le serveur. Elle contient notamment les comptes utilisateurs, récits, signalements et les données de configuration de l’application (`app_data`). Elle utilise le module `sqlite3` standard de Python, sans dépendance npm ni installation de paquet Node. Une ancienne base JSON indiquée par `NZASSA_DB` est migrée automatiquement vers SQLite et conservée en `.json.bak`.
- `js/ambient/realtime.js` : météo réelle optionnelle, directement entre le navigateur et Open-Meteo. La position reste côté navigateur ; les mesures de plus d’une heure sont rejetées.
- `tests/online.test.cjs` : 8 tests (démarrent le vrai serveur).

## Sécurité mise en œuvre (et testée)
Mots de passe hachés scrypt + sel ; jetons signés HMAC-SHA256 avec expiration (7 j), comparaison à temps constant ; limitation de débit (plus stricte sur l'authentification) ; limite de corps 6 Mo ; validation des noms/titres ; consentement explicite (compte, récit) ; aucun récit public avant validation (`pending` → `approved`) ; un signalement remet un récit en modération ; export et suppression des données du compte (RGPD) ; réponses `no-store`.

## Transcription et traduction automatiques
Les routes existent mais répondent **501 `no_provider`** tant qu'aucun fournisseur n'est branché : le serveur n'invente jamais de transcription ni de traduction. Tout résultat futur devra rester étiqueté « brouillon » et passer par le système de relecture par des locuteurs natifs (`docs/VALIDATION.md`).

## Limites connues — à faire avant une mise en production
Pas de TLS (proxy HTTPS obligatoire), pas d'e-mail/récupération de mot de passe, pas d'outil de modération (le statut se change en base), pas de stockage objet pour l'audio, pas d'audit de sécurité externe. La progression du joueur reste stockée localement et n’est pas synchronisée avec son compte.
