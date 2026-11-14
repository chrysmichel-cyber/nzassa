# N'Zassa — état au 13/11/2026 (v0.22.0) et reste à faire
Statut : **phases 3, 4 et 5 terminées côté code et tests locaux.** Rien n'est poussé sur GitHub, rien n'est déployé, aucun SQL Supabase exécuté.

## Fait et testé
| Module | Preuve |
|---|---|
| Tables multijoueur (`server/tables.cjs`) : sièges, distance, observation, robots, chronomètre, reprise, invitations, tables privées, revanche, classement de session | `tests/tables-ws.test.cjs` 10/10 (vrais WebSocket) |
| Règles + IA des 6 jeux, paquet N'Zassa 52 cartes et son dessin SVG | 103 tests de règles + `games-cards-ui.test.cjs` 9/9 |
| Interfaces des 6 jeux, panneau, sessions solo et en ligne, tables en 2D et 3D | `tests/games-flow.mjs` (A : solo dans les 6 jeux, 2D et 3D ; B : 3 navigateurs en ligne, observation, reprise après rechargement, abandon ; C : belote en ligne avec robots, mains cachées) |
| Social : chat de proximité, gestes, danse du village, déconnexion pendant un geste | `tests/social-ws.test.cjs` 4/4 ; `tests/social-flow.mjs` D1–D5 |
| Charge 10/25/50 avec joueurs aux tables, et avec robots | `reports/charge-tables-*.json`, `reports/charge-robots-50.json`, `docs/CAPACITE.md` |
| 3D : bras du joueur figés (course, saut, gestes) corrigé ; cour de cuisine replacée ; place des jeux décorée | e2e « pose de saut », « village vivant » |
| Documentation | `docs/RENDER.md`, `docs/CAPACITE.md`, `docs/CONFORMITE_PHASE3.md`, `docs/PWA.md`, EN_LIGNE, COMPTES, JEUX_PLAN, README |

Résultats complets de la validation : `docs/CONFORMITE_PHASE3.md`, section 7.

## Reste à faire
1. Déployer (Render pour le serveur, Netlify pour le site) en suivant `docs/RENDER.md` ; vérifier le proxy avec `/health?detail=1`.
2. Exécuter les scripts SQL de `supabase/` (proposés, jamais exécutés) et tester avec un vrai projet Supabase (`scripts/verify-supabase-live.mjs`).
3. Tester sur de vrais téléphones et sur Safari/Firefox.
4. Si les robots du serveur gênent en production : budget d'IA plus court ou `worker_thread` (voir `docs/CAPACITE.md`).
5. Jeux : tournois, annonces de belote, classement persistant (aujourd'hui en mémoire).
6. Quiz : le panneau `#quizPanel` n'a pas de feuille de style dédiée (constat, non corrigé).
7. Contenus de langues et noms des familles de cartes à faire valider par des locuteurs.
8. Troisième livrable final : jamais précisé, à définir.

## Limites connues
Supabase toujours simulé ; Render gratuit déconseillé (mise en veille, coupure des WebSocket) ; Chromium seul ; classement des tables et parties en cours perdus au redémarrage du serveur ; le classement JSON du quiz est effacé à chaque redéploiement sans disque persistant.
