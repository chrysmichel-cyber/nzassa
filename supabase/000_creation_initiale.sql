-- N'ZASSA · Création initiale pour un projet Supabase NEUF (à exécuter AVANT 01 à 05).
-- Crée public.profiles, sa RLS et l'unique déclencheur on_auth_user_created_nzassa -> public.handle_new_nzassa_user().
-- Reprend ce qu'attend js/supabase/auth.js : métadonnées username, display_name, recovery_email ; le client n'écrit jamais
-- dans profiles à l'inscription et ne peut modifier que display_name sur sa propre ligne.
-- Ne pas exécuter sur un projet qui a déjà une table profiles : utiliser 00_verifications_lecture_seule.sql.

-- 1. Table des profils. username_key (générée) porte l'unicité insensible à la casse ; ne jamais l'écrire.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  username_key text generated always as (lower(username)) stored,
  display_name text,
  recovery_email text,
  created_at timestamptz not null default now()
);
create unique index profiles_username_key_uidx on public.profiles (username_key);

-- 2. RLS : chacun ne lit que sa ligne et ne modifie que son display_name. Aucune insertion ni suppression côté client.
alter table public.profiles enable row level security;
create policy profiles_select_own on public.profiles for select to authenticated using (id = auth.uid());
create policy profiles_update_own on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;

-- 3. Création du profil à l'inscription. Un pseudo déjà pris fait échouer l'index unique :
--    Supabase renvoie « Database error saving new user », que le jeu traduit en « pseudo déjà pris ».
create or replace function public.handle_new_nzassa_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, username, display_name, recovery_email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'username', ''),
    coalesce(new.raw_user_meta_data ->> 'display_name', new.raw_user_meta_data ->> 'username'),
    nullif(new.raw_user_meta_data ->> 'recovery_email', '')
  );
  return new;
end;
$$;
revoke all on function public.handle_new_nzassa_user() from public, anon, authenticated;

create trigger on_auth_user_created_nzassa
  after insert on auth.users
  for each row execute function public.handle_new_nzassa_user();
