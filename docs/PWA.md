# N'Zassa en application installable (PWA)

État v0.22.0 : en place et testée dans Chromium (unitaires + `tests/pwa-flow.mjs`). Pas testée sur un vrai téléphone ni sur Safari iOS.

## Pièces
| Fichier | Rôle |
|---|---|
| `manifest.webmanifest` | Nom, icônes (dont « maskable »), couleurs, `start_url=./index.html?source=pwa`, affichage `standalone`. |
| `sw.js` | Service worker. `BUILD` et `PRECACHE` sont écrits par `npm run build`. En développement : cache à l'usage seulement. |
| `js/pwa/policy.js` | Règle de cache pure (testée dans `tests/pwa.test.cjs`) : uniquement des fichiers statiques du site, en GET, même origine, sans en-tête d'autorisation ni paramètre sensible. Jamais `/v1`, `/auth`, `/rest`, `/realtime`, `/health`, `/api`. |
| `js/pwa/pwa.js` | Enregistrement, bouton « Installer N'Zassa » (aide pas à pas sur iPhone/iPad), bandeau hors connexion, bandeau « nouvelle version ». |
| `scripts/build.mjs` | Copie `index.html`, `manifest.webmanifest`, `css`, `js`, `img`, `vendor` dans `dist/`, calcule la liste de précache et la version `<package.json>-<empreinte>`. |

## Comportement
- **Hors connexion** : le jeu solo, la progression locale et les jeux de société contre l'IA restent disponibles. Le monde ouvert, les comptes, le quiz en ligne et les tables en ligne reviennent avec le réseau.
- **Pages** : réseau d'abord (4 s), cache de secours. **Fichiers** : cache d'abord ; ceux qui ne sont pas préchargés sont rafraîchis en arrière-plan. Cache d'exécution limité à 80 entrées.
- **Mise à jour** : la nouvelle version s'installe en arrière-plan et ne s'active que quand le joueur touche « Actualiser ». Pas de rechargement surprise pendant une partie.
- **Précache** : tout `dist/` sauf les masques du musée (`img/masks/`) et `img/hero.jpg`, chargés à l'usage. Les nouveaux fichiers des jeux de société (`js/games/**`, `css/games-*.css`) sont pris automatiquement : le build copie les dossiers entiers.
- **Sécurité** : aucun jeton, aucune réponse d'API ou de compte en cache. Les jetons Supabase restent dans le stockage du navigateur.

## Publier une nouvelle version
1. Changer `version` dans `package.json` (actuellement 0.22.0).
2. `npm run build` : la console affiche `PWA : version 0.22.0-<empreinte>, N fichiers préchargés`.
3. Déployer `dist/` sur Netlify. Les joueurs voient le bandeau « Une nouvelle version de N'Zassa est prête ».

## Limites
- Installation testée par simulation dans Chromium (événement `beforeinstallprompt` et affichage iOS simulés), pas sur un appareil réel.
- Vider les données du site efface la progression locale, comme avant.
