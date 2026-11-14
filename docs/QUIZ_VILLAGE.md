# Quiz du village

## Fonctionnement
- L'**enseignant** de chaque village (PNJ « Ibou », école en (30 ; −26)) propose « Quiz du village » : **Quiz seul** (10 questions, toutes catégories ou une seule) ou **Défier un ami** (joueur connecté dans le même village), plus le **Mur des champions**.
- Duel : invitation → accepter/refuser (30 s) → mêmes 10 questions pour les deux → réponses chronométrées → comparaison finale. Vainqueur : score, puis temps total, sinon égalité.
- **Mur des champions** : panneau physique en (38,5 ; −22,5), visible en 3D (groupe + texture) et en 2D (sprite). Il n'affiche que le **Top 10** du village (rang, pseudo, score, temps total) et se redessine quand le serveur annonce un nouveau Top 10.
- Village = salon de langue (1 langue = 1 village, 58 villages). Le thème visuel (5 régions) n'a aucun effet sur le classement.

## Statuts
| Statut | Quiz seul | Duel | Classement officiel |
|---|---|---|---|
| `guest_local` | oui, 100 % local (aucun réseau) | non | non — seul le meilleur score local est gardé sur l'appareil |
| `guest_online` | oui (serveur) | oui | non (consulte le mur) |
| `authenticated` | oui | oui | oui |

## Barème (modifiable : `NZASSA_QUIZ_CONFIG`, JSON, bornes validées)
`questions 10 · timeMs 15000 · base 100 · bonusMax 50 · bonusWindowMs 8000 · revealMs 2500 · countdownMs 3000 · rttCapMs 300 · minRttSamples 3 · rttWindow 5 · graceMs 250 · disconnectGraceMs 20000 · inviteTtlMs 30000 · teacherRadius 10`.
- Temps utile `u = max(0, brut − compensation)` ; hors délai (`u > timeMs`) → 0 point.
- Points d'une bonne réponse = `base + round(bonusMax × clamp(1 − u/bonusWindowMs, 0, 1))` ; mauvaise ou absente : 0. Maximum = `10 × 150 = 1500`.
- Temps total = somme des `u` (sans réponse : `timeMs`).
- **Compensation de latence** : `min(300 ms, médiane des ≤ 5 derniers RTT mesurés par le SERVEUR)` (ping/pong initié par le serveur ; 0 tant que < 3 mesures). Jamais une valeur annoncée par le client.

## Classement
Meilleur match unique de 10 questions par joueur (toutes catégories), remplacé seulement s'il est meilleur ; tri score décroissant, temps croissant, puis ancienneté. Seuls les comptes `authenticated` entrent. Pas de doublon (identifiant `match.slot` mémorisé), pas de rejeu, forfait = non classé.

## Protocole (WebSocket `/v1/ws`)
Client → serveur : `{t:'qz',op:'start'|'challenge'|'accept'|'decline'|'cancel'|'ans'|'abandon'|'resume'|'top', …}` ; réponse à la sonde `{t:'qzp',n}`. Le client n'envoie que `{op:'ans',m,i,c}` : **aucun temps, aucun score**. Serveur → client : `start, q, a, r, end, inv, invSent, invDeclined, invExpired, invCancelled, oppLeft, oppDown, oppBack, left, resume, top, err`. Le serveur vérifie : distance à l'enseignant, village valide, question courante, choix valide, une seule réponse, un seul quiz par joueur, cadence des défis.
Déconnexion : 20 s de grâce avec jeton de reprise (même compte exigé pour un compte), puis forfait ; la question n'est jamais gelée ni accélérée.

## Ajouter une catégorie
Copier un fichier de `js/data/quiz/cats/` (id, name, questions `{id, prompt, right, wrong[3], explanation, difficulty}`), l'ajouter à `index.html`. Aucune modification du moteur. La catégorie « Langues africaines » vient du moteur de leçons.

## Stockage
`server/quizstore.cjs` : interface `store` (mémoire ou fichier JSON : écriture atomique, copie `.bak`, somme SHA-256, récupération). Dossier : `NZASSA_DATA_DIR`. Désactiver le quiz : `NZASSA_QUIZ=off`. Pas de Supabase.

## Limites connues (à lire)
1. **Render gratuit : disque éphémère** — le JSON disparaît au redéploiement/redémarrage ; sans `NZASSA_DATA_DIR` sur disque persistant, le Top 10 est perdu. Migration future vers une base prévue par l'interface `store`.
2. Compensation de latence plafonnée à 300 ms : un joueur peut retarder ses pongs pour gagner ≤ 300 ms (triche résiduelle bornée, non empêchée).
3. Collusion / farming entre comptes complices non détectés.
4. Les questions des catégories autres que « Langues » sont des **brouillons** (source « à faire relire ») : à valider avant publication.
5. Classement uniquement pour le mélange par défaut de 10 questions ; le mode HTTP de repli n'a pas de quiz.
6. Tests : unitaires + serveur WebSocket réels + navigateurs Chromium réels. Pas de Firefox/WebKit, pas d'appareil mobile réel. Supabase simulé.
