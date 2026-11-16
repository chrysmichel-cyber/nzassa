# Modération et messages privés (v0.22.1)

## Messages privés (1 à 1)
- Chat → « Joueurs » → **Écrire** à côté d'un joueur (ou toucher un message privé reçu pour répondre). Le bouton de portée affiche « Privé · Nom » ; le toucher revient au village.
- Serveur : message `{t:'pm',to,text}`. Livré **uniquement** à l'expéditeur (écho) et au destinataire, **même village** seulement, jamais dans l'historique public. Mêmes limites que le chat (débit, doublons, invités plus restreints, silence après signalements).
- Disponible en ligne (invité en ligne et compte). Hors ligne : aucun message n'est envoyé. « Masquer » cache aussi les messages privés de ce joueur ; « Signaler » reste disponible.

## Filtre de mots (`server/wordfilter.cjs`)
Catégories : insultes, haine/discrimination (racisme, tribalisme, xénophobie, homophobie…), menaces, harcèlement/incitation à se faire du mal, propos sexuels, échange de coordonnées. Appliqué au chat du village, au chat de proximité, aux messages privés et aux pseudos.
- Normalise accents, leetspeak (c0nn@rd), lettres espacées ou répétées ; correspondance par mots entiers (pas de faux positifs type « pique-nique »).
- Message refusé (code `blocked`, texte en français) ; **3 refus en 10 minutes → silence 10 minutes**.
- Limites : une liste ne détecte pas tout (langues locales, sous-entendus). Les signalements restent nécessaires ; la liste est à enrichir avec des locuteurs de chaque langue.
- Tests : `tests/moderation-pm.test.cjs`.
