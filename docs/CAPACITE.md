# Rapport de capacité du serveur temps réel

Mesures du 13/11/2026 (v0.22.0) et du 10/11/2026 (v0.21, avant les tables). Outil : `scripts/loadtest.mjs`. Rapports bruts : `reports/*.json`.

## Comment c'est mesuré (à lire avant les chiffres)
- **Clients simulés** : des programmes Node qui ouvrent de vraies connexions WebSocket vers un vrai processus `node server/server.cjs`. Ce ne sont **pas** des navigateurs : on mesure le serveur, pas le rendu 3D ni le réseau mobile.
- **Même machine** : générateur de charge et serveur partagent une machine de 4 cœurs. Les latences sont donc des latences locales, sans Internet.
- **Scénario** : montée progressive, chaque client marche (10 messages de position par seconde), pingue chaque seconde, parle environ 5 fois par minute ; à mi-parcours, **20 % des clients sont coupés brutalement** et se reconnectent avec attente progressive.
- **Tables (`--tables 16`)** : 16 clients s'assoient à 2 par table sur les 8 tables (cartes = bataille), jouent des coups légaux tirés au hasard (150–600 ms de réflexion), demandent une revanche en fin de partie, et **reprennent leur siège avec leur jeton** après la coupure.
- **Boucle d'événements** : mesurée avec une résolution de 10 ms. Une valeur médiane de 10,1 ms signifie « pas de retard mesurable », pas 10 ms de retard.

## Résultats avec tables (13/11/2026, 30 s)

| Clients | Connexions maintenues | Ping p95 | Chat livré | Chat p95 | Déplacement p95 | Reconnexion p95 | Coup → état p95 | CPU moyen | RAM pic | Reçu par client |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 (10 aux tables) | 10/10 | 2,9 ms | 99,0 % | 92 ms | — | 652 ms | 1,6 ms | 2,1 % | 70 Mo | 4,8 Ko/s |
| 25 (16 aux tables) | 25/25 | 3,8 ms | 99,4 % | 99 ms | 94,5 ms | 708 ms | 2,9 ms | 2,9 % | 72 Mo | 4,9 Ko/s |
| 50 (16 aux tables) | 50/50 | 6,7 ms | 99,5 % | 98 ms | 95,5 ms | 705 ms | 2,6 ms | 4,8 % | 78 Mo | 7,6 Ko/s |

Détails tables à 50 clients : 16 places prises, 4 reprises de siège après coupure, 505 coups joués, 0 erreur hors une seule (`pas_en_jeu` : un coup envoyé juste après la fin d'une partie). Aucune liste de coups tronquée. Aucune erreur serveur.

Lecture :
- Le **déplacement p95 ≈ 95 ms** vient du pas de diffusion du serveur (10 Hz = 100 ms) : c'est le délai voulu, pas une saturation.
- Le **chat p95 ≈ 100 ms** a la même cause.
- La **reconnexion ≈ 0,7 s** est l'attente progressive du client (volontaire, évite qu'un redémarrage provoque une avalanche).
- Le **chat livré à 99 %** : les messages manquants sont ceux envoyés pendant qu'un client est en cours de reconnexion.
- Le serveur reste à **moins de 5 % d'un cœur et moins de 80 Mo** à 50 joueurs.

## Résultats sans tables (10/11/2026, v0.21)

| Clients | Ping p95 | Chat livré | Déplacement p95 | CPU moyen | RAM pic |
|---|---|---|---|---|---|
| 10 | 2,0 ms | 99,5 % | 1 459 ms (très peu d’échantillons, non significatif) | 1,8 % | 72 Mo |
| 25 | 3,2 ms | 99,6 % | 94,8 ms | 2,4 % | 75 Mo |
| 50 | 4,6 ms | 100 % | 99,9 ms | 4,4 % | 86 Mo |
| 50, zone 200 m | 5,3 ms | 98,7 % | 98,1 ms | 3,5 % | 78 Mo |
| 50 + redémarrage | 4,2 ms | 99,5 % | 92,3 ms | — | 88 Mo |

Redémarrage (SIGTERM puis relance sur le même port) : arrêt en 62 ms, **50/50 clients reconnectés en moins de 9 s**.

## Robots du serveur

Rapport : `reports/charge-robots-50.json` (50 clients, 8 d'entre eux jouent seuls contre un robot du serveur, un par table).
**Attention : cette mesure a été faite pendant que deux suites de tests navigateur tournaient sur la même machine** ; les chiffres sont donc pessimistes, mais l'effet est net.

| Mesure | Sans robots (16 humains simulés) | Avec 8 robots |
|---|---|---|
| Ping p95 | 6,7 ms | 96,6 ms |
| Boucle d'événements p99 / max | 13,8 / 24,5 ms | 63,9 / 233 ms |
| Coup → état p95 / max | 2,6 / 6,1 ms | 53,6 / 224 ms |
| CPU moyen / pic | 4,8 % / 10 % | 10,5 % / 20,9 % |
| RAM pic | 78 Mo | 132 Mo |

217 coups de robots, 4 parties terminées, 0 erreur. **Le robot calcule dans le processus serveur** (budget 150 ms par coup, `botBudgetMs` dans `server/tables.cjs`) : pendant ce calcul, tout le village attend. Avec 8 robots aux échecs ou aux dames en même temps, des à-coups de 100 à 200 ms sont possibles.
Pistes si cela gêne en production : baisser `botBudgetMs` (ex. 50 ms), limiter le nombre de tables avec robots, ou déplacer l'IA dans un `worker_thread`. Rien de cela n'est fait.

## Conclusion
- **50 joueurs tiennent** sur un seul processus, avec une large marge CPU et mémoire sur la machine de test. Le plan Starter de Render devrait suffire ; à confirmer après déploiement avec `/health?detail=1` (champs `loopMs`, `rssMB`, `cpuMs`, `rt`, `tables`).
- Le plafond est **volontaire** : `NZASSA_MAX_PLAYERS=50`. Le 51e joueur reçoit `server_full` (test W10).
- Points de vigilance : latence réseau réelle (Render + mobiles), machine Render plus lente, IA des robots qui calcule dans le processus serveur (voir section robots).

## Ce qui n'a pas été mesuré
- Vrais navigateurs en nombre (les tests navigateur vont jusqu'à 5 Chromium).
- Réseau réel, pertes de paquets, téléphones.
- Durées longues (les mesures font 30 à 60 s).

## Refaire les mesures
```
node scripts/loadtest.mjs --n 50 --duration 30 --tables 16 --out reports/charge-tables-50.json
node scripts/loadtest.mjs --n 50 --duration 30 --tables 8 --robots --out reports/charge-robots-50.json
node scripts/loadtest.mjs --n 50 --restart --out reports/charge-50-restart.json
node scripts/loadtest.mjs --url wss://<service>.onrender.com --n 50      # cible distante (NZASSA_METRICS_TOKEN pour le détail)
```
