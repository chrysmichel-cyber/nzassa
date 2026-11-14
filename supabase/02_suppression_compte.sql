-- N'ZASSA · Suppression de son propre compte (droit à l'effacement).
-- Statut : PROPOSÉ, NON EXÉCUTÉ, À VALIDER. DESTRUCTIF PAR NATURE : la fonction supprime définitivement le compte de l'utilisateur connecté
-- (et lui seul : auth.uid()). Elle ne touche aucun autre compte et n'est pas exécutée par ce script, seulement créée.
-- Sans cette fonction, le jeu répond « suppression non activée » et ne supprime rien.
-- Vérifie avec la requête 2 de 00_... si la clé étrangère profiles.id -> auth.users(id) a ON DELETE CASCADE : sinon la ligne profiles est supprimée ci-dessous.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  delete from public.profiles where id = auth.uid();
  delete from auth.users where id = auth.uid();
end;
$$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
