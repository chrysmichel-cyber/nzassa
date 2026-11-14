# Comptes, invités et parcours d'entrée

## Modèle
- **Invité** : jouer sans compte. Identifiant local unique (index `lca-acc` v2), sauvegarde `lca-v2`. Aucun compte Supabase n'est jamais créé pour un invité.
- **Compte** : Supabase Auth (`signUp`, `signInWithPassword`). Session persistante et jetons rafraîchis par supabase-js ; restaurée au démarrage (`getSession`). États : `guest | local | pending | ok | expired | offline`. Sauvegarde du compte : `lca-u-<uuid>`.
- **Anciens profils locaux** (version précédente) : migrés, copie `.v1.bak`, utilisables via « Ancien profil ».
- **Migration invité → compte** : copie uniquement. Si le compte a déjà des données, l'utilisateur choisit `garder` ou `remplacer` (sauvegarde `.pre-import` conservée). Jamais d'écrasement silencieux.

## Règles
- Inscription : pseudo, e-mail réel obligatoire, mot de passe (8 caractères min, 72 octets max), confirmation, consentement.
- Connexion : e-mail + mot de passe uniquement.
- Pseudo : 2 à 40 caractères, valeur conservée telle quelle ; refusé (jamais nettoyé) s'il contient contrôles/invisibles ou `< > & " \ / @`, des espaces en bord ou doublés. Unicité insensible à la casse via la colonne générée `username_key`. Mêmes règles dans `js/account/pseudo.js` et `supabase/01_pseudo_et_verifications.sql`.

## Netlify
Variables d'environnement : `NZASSA_SUPABASE_URL` et `NZASSA_SUPABASE_KEY` (clé publique `sb_publishable_…` ou anon). Le build génère `dist/js/supabase/config.js` ; il refuse toute clé `sb_secret_` ou JWT `service_role`. Sans ces variables, le build Netlify échoue. Aucune clé privée côté client.

## Réglages Supabase Dashboard (à faire par vous)
- Authentication > Providers > Email : décider de « Confirm email » (si désactivé, les adresses ne sont pas vérifiées).
- Authentication > URL Configuration : Site URL et Redirect URLs = domaine Netlify.
- Mot de passe minimal du Dashboard ≥ 8 pour rester cohérent avec le jeu.
- Vérifier le déclencheur `on_auth_user_created_nzassa` → `public.handle_new_nzassa_user()`, RLS actif, index unique sur `username_key`.

## Scripts SQL (`supabase/`) — PROPOSÉS, NON EXÉCUTÉS
- `00_verifications_lecture_seule.sql` : contrôles sans modification.
- `01_pseudo_et_verifications.sql` : contrainte `profiles_username_format` (NOT VALID) et `nzassa_username_available`.
- `02_suppression_compte.sql` : `delete_my_account()`. Sans elle, la suppression de compte répond « indisponible ».

## Les trois statuts en jeu
| Statut | Quand | Réseau | Ce qui est permis |
|---|---|---|---|
| `guest_local` | Monde ouvert désactivé ou consentement refusé, ou session de compte expirée | Aucune connexion au serveur temps réel | Jeu solo, quiz solo, jeux de société contre l'IA. |
| `guest_online` | Monde ouvert activé sans compte | WebSocket, identité temporaire donnée par le serveur | Monde partagé, chat (débit plus strict), emotes, quiz, tables publiques. Pas de table privée. |
| `authenticated` | Monde ouvert activé avec un compte connecté | WebSocket + jeton Supabase vérifié par le serveur | Tout, y compris tables privées et invitations sur table privée. Un seul personnage par compte. |

Le serveur décide du statut ; le navigateur ne peut pas se déclarer `authenticated` sans jeton valide (fermeture 4401). Si le statut voulu change (connexion ou déconnexion du compte), le client quitte et rejoint le village avec le nouveau statut. Si la session de compte expire, le client ne se fait pas passer pour un invité : il repasse en `guest_local` et demande de se reconnecter.

Côté serveur, les comptes se configurent avec `NZASSA_SUPABASE_URL` et `NZASSA_SUPABASE_KEY` (clé publique). Liste complète des variables : `docs/RENDER.md`.

## Bibliothèque supabase-js
Fournie dans `vendor/` (2.109.0, plus de CDN). Mise à jour : `npm run vendor:supabase`.

## Limites connues
Progression stockée localement (pas de synchronisation entre appareils) ; non testé contre un vrai Supabase (tests avec réseau simulé) ; textes EN/PT du nouveau parcours non traduits (repli en français).
