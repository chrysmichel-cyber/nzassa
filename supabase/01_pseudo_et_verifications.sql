-- N'ZASSA · Règles du pseudo côté PostgreSQL + vérification de disponibilité.
-- Statut : PROPOSÉ, NON EXÉCUTÉ. Non destructif : aucune ligne n'est supprimée ni modifiée.
-- Exécuter d'abord 00_verifications_lecture_seule.sql. Reprend EXACTEMENT les règles de js/account/pseudo.js :
--   2 à 40 caractères ; ni contrôle, ni caractères invisibles ou de direction, ni < > & " \ / @ ;
--   pas d'espace au début ni à la fin ; pas deux espaces de suite ; seul l'espace simple est permis.
-- Le déclencheur on_auth_user_created_nzassa et la fonction handle_new_nzassa_user() ne sont PAS touchés ici.

-- A. Contrainte de format. NOT VALID : appliquée aux nouveaux pseudos et aux modifications, sans contrôler (ni bloquer) les lignes existantes.
alter table public.profiles
  add constraint profiles_username_format check (
    char_length(username) between 2 and 40
    and username !~ '[\u0001-\u001F\u007F-\u009F­​-‏ -‮⁠-⁤﻿<>&"\\/@]'
    and username !~ '^\s|\s$'
    and username !~ '  '
    and username !~ '[\t\n\r\f\v   -     　]'
  ) not valid;
-- Après avoir corrigé à la main les éventuelles lignes listées par la requête 6 de 00_... :
--   alter table public.profiles validate constraint profiles_username_format;

-- B. Unicité insensible à la casse : username_key (colonne générée) doit porter un index UNIQUE.
-- Vérifie avec la requête 2 de 00_... Si AUCUN index unique n'existe sur username_key, décommente :
--   create unique index profiles_username_key_uidx on public.profiles (username_key);
-- (échouera s'il existe déjà des doublons : la requête 7 de 00_... les liste.)

-- C. Disponibilité d'un pseudo, appelable avant l'inscription (le jeu l'utilise s'il existe ; sinon la base reste juge à l'inscription).
-- Adapter la comparaison à la définition réelle de username_key (requête 1 de 00_...) : ici lower(username).
create or replace function public.nzassa_username_available(p_username text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (select 1 from public.profiles where lower(username) = lower(p_username));
$$;
revoke all on function public.nzassa_username_available(text) from public;
grant execute on function public.nzassa_username_available(text) to anon, authenticated;
-- Contrepartie assumée : la fonction permet de savoir si un pseudo existe (le pseudo est public de toute façon).
