# Matrice de conformité — phases 3 à 5 (monde ouvert, jeux de société, social, 50 joueurs)

État au 13/11/2026, version 0.22.0. Remplace la matrice du 10/11.
Légende : ✅ implémenté ET testé · 🟡 partiel (précisé) · ❌ absent.
« Réel » = vrai serveur Node + vraies connexions WebSocket/HTTP sur 127.0.0.1, ou vrais navigateurs Chromium. « Simulé » = Supabase remplacé par un faux serveur, ou clients de charge non-navigateurs.
**Jamais testé** : vrai projet Supabase, déploiement Render, vrais téléphones, Firefox/Safari.

## 1. Trois statuts

| Exigence | État | Fichiers | Preuve |
|---|---|---|---|
| `authenticated` : jeton Supabase vérifié par le serveur, jamais cru sur parole | ✅ | `server/identity.cjs`, `server/realtime.cjs`, `js/online/socket.js` | `identity.test.cjs` I1–I5 (Supabase simulé) ; `ws-world.test.cjs` W3, W4 ; `online-flow.mjs` 2c–2d, 9g, 9j |
| Un seul personnage par compte, identité privée | ✅ | `server/world.cjs` | W4 ; `online-flow.mjs` 9h, 9k |
| `guest_local` : aucune connexion réseau | ✅ | `js/main.js` | `online-flow.mjs` 1a–1e ; `games-flow.mjs` A2 (« aucune connexion réseau en invité local ») |
| `guest_online` : identité temporaire, chat restreint, aucun compte créé | ✅ | `server/world.cjs` | W2, W6 ; `online-flow.mjs` 2a–2b, 4d |
| Un invité ne peut pas se faire passer pour un compte, ni prendre son pseudo | ✅ | `server/realtime.cjs`, `server/nameguard.cjs` | W3 (4401), W16, W17 ; `online-flow.mjs` 10a–10d |
| Indicateur de statut dans l'interface | ✅ | `js/main.js` | `online-flow.mjs` 1a, 2a, 2c, 7c |

## 2. Transitions

| Transition | État | Preuve |
|---|---|---|
| guest_local → guest_online | ✅ | `online-flow.mjs` 6d (même sauvegarde) |
| guest_online → guest_local | ✅ | `online-flow.mjs` 6a–6c |
| guest_online → authenticated (avec transfert de progression proposé) | ✅ | `online-flow.mjs` 9a–9l |
| guest_local → authenticated (transfert) | ✅ | `accounts.test.cjs` M1–M3, `accounts-flow.mjs` |
| Jeton refusé : pas de repli silencieux en invité | ✅ | `online-flow.mjs` 7a–7d |
| Pas d'écrasement silencieux | ✅ | `online-flow.mjs` 11a–11e ; M2/M3 |

## 3. Multijoueur et social (phase 4)

| Exigence | État | Fichiers | Preuve |
|---|---|---|---|
| Présence, déplacements (deltas 10 Hz, zone d'intérêt) | ✅ | `server/realtime.cjs`, `js/online/socket.js` | W5 ; `online-flow.mjs` 2f, 3a–3b |
| Chat du village | ✅ | `server/world.cjs` | W6 ; `online-flow.mjs` 4a–4c |
| Chat de proximité (14 m, hors historique, mêmes filtres et débit) | ✅ | `server/world.cjs`, `server/realtime.cjs`, `js/online/world.js`, `js/main.js` | `social-ws.test.cjs` S1 ; `social-flow.mjs` D1–D2 |
| Emotes (saluer, danser, bravo, s'asseoir), liste fermée, débit limité, visibles en 2D et 3D | ✅ | `server/world.cjs`, `js/main.js`, `js/world2d.js` | S2 ; D3 (bras levé en 3D) |
| Activité collective (danse du village à 2+ joueurs proches, annoncée au village) | ✅ | `server/realtime.cjs` | S3 ; D4 (participation enregistrée) |
| Invitations entre joueurs (à une table) | ✅ serveur ; 🟡 navigateur | `server/tables.cjs`, `js/games/panel.js` | TW4 (invitation → acceptation, vrais WebSocket). Pas de scénario navigateur pour la carte d'invitation `#gameInv`. |
| Déconnexion pendant une activité | ✅ | `server/realtime.cjs`, `server/tables.cjs` | S4, D5 (pendant une emote) ; TW5 et `games-flow.mjs` B5 (pendant une partie) |
| Reconnexion après coupure | ✅ | `js/online/socket.js` | W13 ; `online-flow.mjs` 5b–5d |

## 4. Sécurité serveur

| Exigence | État | Preuve |
|---|---|---|
| Messages validés (JSON, binaire, taille, coups malformés) | ✅ | W8, TW8 |
| Débit et anti-spam (chat, emotes, tables) | ✅ | W6, W7, S1, S2, TW8 |
| Sessions expirées | ✅ | W11 |
| Limites de connexions (total, par IP, origine, capacité 50) | ✅ | W9, W10 |
| IP réelle derrière proxy approuvé seulement | ✅ testé localement | W14, W15, W15b, W15c. Pas vérifié derrière le vrai proxy de Render. |
| Distance aux tables vérifiée par le serveur | ✅ | TW2 |
| Information cachée des cartes (aucune main adverse dans les vues) | ✅ | TW3 ; `games-flow.mjs` C2 |
| Coup hors tour, mauvais siège, partie finie refusés | ✅ | `games-*.test.cjs`, TW1, TW8 |

## 5. Jeux de société

| Exigence | État | Fichiers | Preuve |
|---|---|---|---|
| Règles + IA : Awalé, Dames 10×10, Échecs FIDE, Belote, Bataille, Menteur | ✅ | `js/games/rules/`, `js/games/ai.js` | 103 tests unitaires (perft officiels pour les échecs) |
| Paquet original N'Zassa 52 cartes, dessin SVG | ✅ | `js/games/rules/deck.js`, `js/games/ui/cards.js` | `games-cards-ui.test.cjs` (9) ; `games-flow.mjs` A6 |
| Interfaces des 6 jeux, panneau commun | ✅ | `js/games/ui/*.js`, `js/games/panel.js` | `games-flow.mjs` A2–A8 |
| Solo contre l'IA (3 niveaux), abandon, revanche, historique local | ✅ | `js/games/session.js` | A2–A3 |
| Tables physiques en 2D et 3D, voyants d'état, collisions | ✅ | `js/games/world.js`, `js/main.js`, `js/world2d.js` | A1, A9 ; B1 (« en attente » vu par les autres) |
| Parties en ligne validées par le serveur, à plusieurs navigateurs | ✅ | `server/tables.cjs` | TW1 ; B0–B6 |
| Observation | ✅ | | TW3, TW9 ; B3 |
| Chronomètre (120 s), abandon après 60 s de grâce, reprise par jeton | ✅ | | TW5, TW6 ; B5 (rechargement de page) |
| Robots du serveur pour compléter une table | ✅ | | TW3 ; C1–C3 |
| Tables privées (comptes seulement) | ✅ serveur | | TW4. Pas de scénario navigateur. |
| Classement | 🟡 | | TW7 : en mémoire, par session de serveur, comptes seulement. Perdu au redémarrage. |
| Tournois | ❌ | — | Non implémentés. |
| Annonces de belote (tierce, cinquante, cent) | ❌ | — | Documenté dans `docs/JEUX_PLAN.md`. |

## 6. 50 joueurs et Render (phase 5)

| Exigence | État | Preuve | Manque |
|---|---|---|---|
| Capacité 50, refus propre au-delà | ✅ | W10 ; charge à 50 | — |
| `PORT`, `0.0.0.0`, `/health` | ✅ | W1 | Démarrage sur Render non testé |
| Arrêt et redémarrage propres | ✅ | W12 ; charge `--restart` | Une partie en cours est perdue au redémarrage |
| Secrets en variables d'environnement, rien dans le site | ✅ | `render.yaml`, `supabase-config.test.cjs` | — |
| Charge 10/25/50 avec joueurs aux tables | ✅ simulé | `reports/charge-tables-*.json`, `docs/CAPACITE.md` | Clients Node, pas de navigateurs ; générateur et serveur sur la même machine |
| `docs/RENDER.md`, rapport de capacité | ✅ | `docs/RENDER.md`, `docs/CAPACITE.md` | — |

## 7. Validation globale du 13/11/2026

| Contrôle | Résultat | Commande |
|---|---|---|
| Lint | 225 fichiers, 0 problème | `npm run lint` |
| Données des langues | 0 erreur (avertissements de contenu non sourcé) | `npm run validate` |
| Unitaires (42 fichiers) | 411/411 | `npm test` |
| Build PWA | 0.22.0, 153 fichiers préchargés | `npm run build` |
| Bout en bout 2D/3D | 306/306 | `node tests/e2e.mjs` |
| Mobile tactile 3D | 6/6 | `node tests/mobile.mjs` |
| Chevauchement de l'interface | aucun | `node tests/hud-overlap.mjs` |
| PWA | 45/45 | `node tests/pwa-flow.mjs` |
| Quiz du village (2 à 5 navigateurs) | tous les scénarios | `node tests/quiz-flow.mjs` |
| Comptes (Supabase simulé) | tous les scénarios | `node tests/accounts-flow.mjs` |
| Monde ouvert, 3 statuts, transitions | tous les scénarios | `node tests/online-flow.mjs` |
| Jeux de société (solo, 3 navigateurs en ligne) | tous les contrôles | `node tests/games-flow.mjs` |
| Social (proximité, gestes, danse) | tous les contrôles | `node tests/social-flow.mjs` |
| Charge 10/25/50 + robots | 50/50 connexions tenues | `scripts/loadtest.mjs` |

Toutes les suites ont été lancées à la suite sur le code final (Chromium avec rendu logiciel). Les deux échecs 3D d'e2e et les deux échecs joystick du test mobile, signalés comme anciens, sont réglés : le premier était un vrai défaut (bras du joueur remis à zéro à chaque image par l'animation de cuisine), le second venait du test mobile qui ne suivait plus le parcours d'accueil. online-flow est passé sans échec sur les deux dernières séries complètes ; son instabilité passée sous forte charge n'est pas prouvée disparue.
