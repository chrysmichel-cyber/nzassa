-- N'ZASSA · Unicité des pseudos GARANTIE PAR LA BASE (insensible à la casse), pas seulement par l'application.
-- Statut : PROPOSÉ, NON EXÉCUTÉ. Non destructif : ne supprime ni ne modifie aucune ligne ; échoue proprement s'il existe déjà des doublons.
-- Pré-requis : username_key est la colonne GÉNÉRÉE (ne jamais l'écrire). Vérifier avec 00_... (requêtes 1, 2, 7) puis 05_...
-- Pourquoi : deux inscriptions simultanées avec le même pseudo passent toutes deux une vérification applicative ; seul un index UNIQUE tranche.
-- Effet côté jeu : la seconde inscription échoue dans le déclencheur de création de profil (Supabase renvoie « Database error saving new user »),
-- que le jeu traduit en « pseudo déjà pris » ; aucun compte à moitié créé n'est conservé.
do $$
begin
  if exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'profiles'
             and indexdef ilike '%unique%' and indexdef ilike '%username_key%') then
    raise notice 'Index unique sur username_key déjà présent : rien à faire.';
  elsif exists (select 1 from public.profiles group by username_key having count(*) > 1) then
    raise exception 'Doublons de username_key existants : corrige-les à la main (requête 7 de 00_...) avant de créer l''index.';
  else
    create unique index profiles_username_key_uidx on public.profiles (username_key);
    raise notice 'Index unique profiles_username_key_uidx créé.';
  end if;
end $$;
