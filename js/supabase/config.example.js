/* Modèle de configuration Supabase. En local : copie ce fichier en config.js (ignoré par Git) et renseigne ta clé.
   En production (Netlify) : ne rien commiter ; le build écrit dist/js/supabase/config.js depuis les variables d'environnement
   NZASSA_SUPABASE_URL et NZASSA_SUPABASE_KEY. Seule la clé PUBLISHABLE (ou anon) est permise, jamais service_role / sb_secret_. */
window.NZASSA_SUPABASE_URL = 'https://VOTRE-PROJET.supabase.co';
window.NZASSA_SUPABASE_KEY = 'sb_publishable_REMPLACER_PAR_VOTRE_CLE';
