-- N'ZASSA · Avis des visiteurs (formulaire « Donner mon avis ») et lecture réservée aux administrateurs (page avis.html, export PDF).
-- À exécuter après 000_creation_initiale.sql. Non destructif : crée deux tables, une fonction et leurs règles RLS.
-- Qui peut quoi :
--   - tout visiteur (invité ou connecté) peut ENVOYER un avis ; personne ne peut relire, modifier ni supprimer les avis des autres ;
--   - seuls les comptes listés dans public.nzassa_admins peuvent LIRE les avis (page avis.html).

-- 1. Administrateurs. RLS active sans aucune politique : la table n'est ni lisible ni modifiable par l'API, seulement par le SQL Editor.
create table public.nzassa_admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);
alter table public.nzassa_admins enable row level security;
revoke all on public.nzassa_admins from anon, authenticated;

create or replace function public.nzassa_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.nzassa_admins where user_id = auth.uid());
$$;
revoke all on function public.nzassa_is_admin() from public;
grant execute on function public.nzassa_is_admin() to authenticated;

-- 2. Avis. Mêmes limites que js/feedback/feedback.js.
create table public.avis_visiteurs (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  note smallint not null check (note between 1 and 5),
  aime text check (char_length(aime) <= 1000),
  ameliorer text check (char_length(ameliorer) <= 1000),
  nom text check (char_length(nom) <= 60),
  email text check (char_length(email) <= 120),
  langue_jeu text check (char_length(langue_jeu) <= 40),
  user_id uuid default auth.uid() references auth.users (id) on delete set null
);
alter table public.avis_visiteurs enable row level security;
create policy avis_insert_tous on public.avis_visiteurs for insert to anon, authenticated
  with check (user_id is null or user_id = auth.uid());
create policy avis_select_admins on public.avis_visiteurs for select to authenticated
  using (public.nzassa_is_admin());
revoke all on public.avis_visiteurs from anon, authenticated;
grant insert (note, aime, ameliorer, nom, email, langue_jeu) on public.avis_visiteurs to anon, authenticated;
grant select on public.avis_visiteurs to authenticated;

-- 3. Donner le rôle d'administrateur à un compte DÉJÀ inscrit (remplacer l'adresse, puis exécuter cette ligne seule) :
--   insert into public.nzassa_admins (user_id) select id from auth.users where email = 'votre.adresse@exemple.com';
