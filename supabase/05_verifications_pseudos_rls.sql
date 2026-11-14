-- N'ZASSA · Vérifications LECTURE SEULE de la réservation des pseudos et de la RLS. À lancer dans le SQL Editor d'un projet de TEST d'abord.
-- Aucune écriture. Les requêtes 6 et 7 utilisent une transaction annulée (rollback).

-- 1. RLS active et non forcée sur profiles (relforcerowsecurity = false : le propriétaire n'est pas soumis à la RLS).
select c.relname, c.relrowsecurity as rls_active, c.relforcerowsecurity as rls_forcee, pg_get_userbyid(c.relowner) as proprietaire
from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'profiles';

-- 2. Politiques sur profiles : AUCUNE ne doit permettre à anon/authenticated de lire les autres lignes ou la colonne email.
select policyname, roles, cmd, qual, with_check from pg_policies where schemaname = 'public' and tablename = 'profiles';

-- 3. La fonction est-elle SECURITY DEFINER, avec un search_path vide, et quel est son propriétaire ?
select p.proname, p.prosecdef as security_definer, p.proconfig as config, pg_get_userbyid(p.proowner) as proprietaire
from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'nzassa_name_taken_by_other';

-- 4. Le propriétaire contourne-t-il la RLS ? (rolbypassrls doit être true, sinon la recherche est INCOMPLÈTE)
select r.rolname, r.rolbypassrls from pg_roles r
where r.oid = (select p.proowner from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'nzassa_name_taken_by_other');

-- 5. Unicité par la base : un index UNIQUE doit porter sur username_key ; aucun doublon ne doit exister.
select indexname, indexdef from pg_indexes where schemaname = 'public' and tablename = 'profiles' and indexdef ilike '%username_key%';
select username_key, count(*) from public.profiles group by username_key having count(*) > 1;

-- 6. EXHAUSTIVITÉ en tant qu'invité : tous les pseudos doivent être vus comme « pris ». Attendu : manquants = 0 (et testes = nombre de profils).
--    La liste des pseudos est copiée par le rôle propriétaire dans une table temporaire (annulée par le rollback), puis testée avec le rôle anon.
begin;
  create temp table _pseudos_test as select username from public.profiles;
  grant select on _pseudos_test to anon;
  set local role anon;
  select count(*) filter (where not public.nzassa_name_taken_by_other(username)) as manquants, count(*) as testes from _pseudos_test;
rollback;

-- 7. Aucune donnée personnelle dans la réponse : la fonction ne renvoie qu'un booléen.
select pg_get_function_result('public.nzassa_name_taken_by_other(text)'::regprocedure) as type_retourne;
