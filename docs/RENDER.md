# Déployer le serveur temps réel sur Render

**État : préparé, jamais déployé.** Rien de ce document n'a été exécuté sur Render. Les étapes s'appuient sur `render.yaml` et sur le code de `server/server.cjs`. Les mesures de capacité viennent de tests locaux (voir `docs/CAPACITE.md`).

## 1. Ce qui tourne où

| Pièce | Hébergement | Rôle |
|---|---|---|
| Site du jeu (HTML, JS, CSS, PWA) | Netlify (`npm run build` → `dist/`) | Jeu solo, rendu 2D/3D, interface. Fonctionne sans serveur. |
| Comptes | Supabase Auth | Inscription, connexion, jetons. Voir `docs/COMPTES.md`. |
| Monde ouvert, chat, emotes, quiz du village, tables de jeux | **Render** (`node server/server.cjs`) | Un seul processus Node, un seul port, HTTP + WebSocket (`/v1/ws`). |

Le serveur ne stocke rien d'important sur disque. Le classement des tables vit en mémoire et repart à zéro à chaque redémarrage. Le classement du quiz est écrit en JSON dans `NZASSA_DATA_DIR`, que le disque éphémère de Render efface au redéploiement (sauf disque persistant payant).

## 2. Étapes

1. Pousser le dépôt sur GitHub (pas encore fait).
2. Dans Render : **New > Blueprint**, choisir le dépôt. Render lit `render.yaml` et propose le service `nzassa-realtime`.
3. Remplir les variables marquées `sync: false` (tableau ci-dessous). `NZASSA_METRICS_TOKEN` est généré par Render.
4. Lancer le premier déploiement à la main (`autoDeploy: false`).
5. Vérifier :
   - `https://<service>.onrender.com/health` répond `{"ok":true,...}` ;
   - `curl -H "x-nzassa-metrics: <jeton>" "https://<service>.onrender.com/health?detail=1"` affiche `proxy.peer`, `proxy.peerIsApproved: true` et `proxy.resolvedClientIp` égal à **ta** IP publique. Si `peerIsApproved` vaut `false`, corriger `NZASSA_TRUSTED_PROXIES` : sinon toutes les limites par IP s'appliquent à l'IP du proxy de Render.
6. Sur Netlify, pointer le jeu vers le serveur : `apiBase` dans `js/online/config.js` (adresse `https://<service>.onrender.com`). Le client passe tout seul en `wss://`.
7. Dans le jeu : Paramètres > Monde ouvert, accepter, vérifier qu'un deuxième navigateur voit le premier, puis s'asseoir à une table de la place des jeux.

## 3. Variables d'environnement

| Variable | Défaut | Rôle |
|---|---|---|
| `PORT` | 8787 (Render le fournit) | Port d'écoute. |
| `HOST` | `0.0.0.0` si `PORT` ou `NODE_ENV=production` est défini, sinon `127.0.0.1` | Interface d’écoute. |
| `NODE_ENV` | — | `production` désactive le module hérité SQLite et avertit si `NZASSA_CORS` manque. |
| `NZASSA_CORS` | aucune | **Obligatoire.** Adresse(s) exacte(s) du site Netlify, séparées par des virgules. Sans elle, les navigateurs sont refusés. |
| `NZASSA_SUPABASE_URL`, `NZASSA_SUPABASE_KEY` | aucune | URL du projet et clé **publique** (`sb_publishable_…`). Le serveur vérifie les jetons de compte auprès de Supabase. Sans elles, tout le monde est invité en ligne. |
| `NZASSA_TRUSTED_PROXIES` | aucun | Proxys approuvés (CIDR, `private`, `loopback`). `X-Forwarded-For` n'est lu que s'il vient d'eux. |
| `NZASSA_PROXY_HOPS` | 1 | Nombre de proxys de confiance devant le serveur. |
| `NZASSA_MAX_PLAYERS` | 50 | Joueurs au total sur le serveur. |
| `NZASSA_ROOM_MAX` | 50 | Joueurs par village (salon). |
| `NZASSA_MAX_CONNECTIONS` | 60 | Connexions WebSocket simultanées. |
| `NZASSA_WS_PER_IP` | 10 | Connexions WebSocket par adresse IP. |
| `NZASSA_METRICS_TOKEN` | aucun | Jeton exigé pour `/health?detail=1` hors machine locale. |
| `NZASSA_NAME_GUARD` | souple | `strict` refuse les pseudos signalés par le filtre au lieu de les compter. |
| `NZASSA_QUIZ` | actif | `off` désactive le quiz du village. |
| `NZASSA_DATA_DIR` | aucun | Dossier du classement JSON du quiz. |
| `NZASSA_QUIZ_CONFIG` | — | Réglages du quiz en JSON (tests, événements). |
| `NZASSA_LEGACY_API` | `0` en production | `1` réactive l'ancienne API SQLite (comptes maison, récits). Ne pas l'activer sur Render. |
| `NZASSA_SECRET`, `NZASSA_DB` | — | Seulement pour l'API héritée. |

Côté Netlify (build du site) : `NZASSA_SUPABASE_URL`, `NZASSA_SUPABASE_KEY`, et `NZASSA_ALLOW_NO_ACCOUNTS=1` si l'on veut publier sans comptes. Le build refuse les clés `sb_secret_` et `service_role`.

## 4. Choix du plan

- **Gratuit : à éviter.** Le service s'endort après inactivité, ce qui coupe toutes les WebSocket, et le réveil prend plusieurs dizaines de secondes.
- **Starter** (celui de `render.yaml`) : suffisant d'après les mesures locales. À 50 joueurs avec 16 joueurs aux tables, le serveur consommait environ 5 % d'un cœur et 80 Mo de RAM (voir `docs/CAPACITE.md`). Ces chiffres sont locaux ; la machine Render est plus lente et le réseau ajoute sa latence.
- Un seul processus : pas de mise à l'échelle horizontale. Deux instances ne partageraient ni les joueurs ni les tables.

## 5. Redémarrage et déploiement

- `SIGTERM` : le serveur prévient les clients (`{t:"bye"}`) puis ferme les connexions (code 1012). Les clients se reconnectent avec une attente progressive.
- Une partie en cours est **perdue** au redémarrage (état en mémoire). Le jeton de reprise ne survit pas au processus.
- Pendant un déploiement Render, prévoir une coupure de quelques secondes. Mesure locale : voir `docs/CAPACITE.md`, section redémarrage.

## 6. Ce qui n'a pas été vérifié

- Aucun déploiement Render réel : ni TLS, ni proxy, ni latence réseau réelle, ni comportement de la mise en veille.
- Aucun vrai Supabase : la vérification des jetons est testée avec un Supabase simulé.
- Pas de test avec de vrais téléphones sur un réseau mobile.
