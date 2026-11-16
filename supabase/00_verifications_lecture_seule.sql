-- N'ZASSA · Vérifications en LECTURE SEULE (rien n'est modifié).
-- À exécuter dans Supabase Dashboard > SQL Editor AVANT les scripts 01 et 02, puis à relire.
-- Statut : PROPOSÉ. Je n'ai exécuté aucune requête sur ton projet.

-- 1. Colonnes de profiles (vérifie que username_key est bien générée et comment).
select column_name, data_type, is_generated, generation_expression
from information_schema.columns
where table_schema = 'public' and table_name = 'profiles'
order by ordinal_position;

-- 2. Contraintes et index existants (unicité de username_key ? clé étrangère vers auth.users ? ON DELETE CASCADE ?).
select conname, contype, pg_get_constraintdef(oid) as definition
from pg_constraint where conrelid = 'public.profiles'::regclass;
select indexname, indexdef from pg_indexes where schemaname = 'public' and tablename = 'profiles';

-- 3. Déclencheurs sur auth.users : on_auth_user_created_nzassa doit exister, on_auth_user_created_profile ne doit plus exister.
select tgname, pg_get_triggerdef(oid) as definition
from pg_trigger where tgrelid = 'auth.users'::regclass and not tgisinternal;

-- 4. Définition actuelle de la fonction appelée par le déclencheur.
select pg_get_functiondef('public.handle_new_nzassa_user()'::regprocedure);

-- 5. Politiques RLS de profiles (RLS doit être activé : rowsecurity = true).
select relrowsecurity from pg_class where oid = 'public.profiles'::regclass;
select policyname, cmd, roles, qual, with_check from pg_policies where schemaname = 'public' and tablename = 'profiles';

-- 6. Pseudos existants qui ne respecteraient pas les règles de 01 (à corriger À LA MAIN avant VALIDATE CONSTRAINT).
select id, username
from public.profiles
where char_length(username) not between 2 and 40
   or username ~ '[\u0001-\u001F\u007F-\u009F\u00AD\u200B-\u200F\u2028-\u202E\u2060-\u2064\uFEFF<>&"\\/@]'
   or username ~ '^\s|\s$' or username ~ '  ' or username ~ '[\t\n\r\f\v\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]';

-- 7. Doublons insensibles à la casse déjà présents (devrait renvoyer 0 ligne si username_key est unique).
select lower(username) as k, count(*) from public.profiles group by 1 having count(*) > 1;

-- 8. Réglages Auth à contrôler dans le Dashboard (pas en SQL) : voir docs/COMPTES.md, section « Réglages Dashboard ».
