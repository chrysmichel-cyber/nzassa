-- N'ZASSA · Noms de personnage réservés dans le monde ouvert.
-- Statut : PROPOSÉ, NON EXÉCUTÉ. Non destructif : crée une fonction, ne modifie aucune donnée.
-- Rôle : le serveur temps réel demande « ce nom est-il le pseudo d'un AUTRE compte ? ». Réponse booléenne uniquement : aucun identifiant, e-mail ou autre
-- donnée personnelle n'est divulgué.
--   - appel anonyme (invité) : true si un compte porte ce pseudo ;
--   - appel avec le jeton d'un compte : true seulement si le pseudo appartient à un compte DIFFÉRENT (on peut utiliser son propre pseudo).
--
-- RLS ET EXHAUSTIVITÉ — point critique :
--   public.profiles est protégée par RLS (un utilisateur ne lit que sa propre ligne). Si cette fonction s'exécutait avec les droits de l'APPELANT
--   (security invoker), un invité ne verrait AUCUNE ligne et la recherche serait toujours « libre » : réservation inopérante.
--   Elle est donc SECURITY DEFINER : elle s'exécute avec les droits de son PROPRIÉTAIRE et voit toutes les lignes. Cela n'est vrai que si ce propriétaire
--   n'est pas soumis à la RLS : propriétaire de la table sans « force row level security », ou rôle avec BYPASSRLS (postgres l'a). Vérifier avec
--   05_verifications_pseudos_rls.sql (requêtes 3 et 4) AVANT de compter sur cette fonction.
-- Adapter la comparaison à la définition réelle de username_key (requête 1 de 00_...) : ici lower(username).
create or replace function public.nzassa_name_taken_by_other(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.username_key = lower(btrim(p_name))
      and p.id is distinct from auth.uid()
  );
$$;
-- Propriétaire : doit être un rôle qui contourne la RLS (par défaut sur Supabase : postgres). À contrôler, ne pas changer à l'aveugle.
-- alter function public.nzassa_name_taken_by_other(text) owner to postgres;
revoke all on function public.nzassa_name_taken_by_other(text) from public;
grant execute on function public.nzassa_name_taken_by_other(text) to anon, authenticated;
-- Contrepartie assumée : la fonction est appelable par n'importe qui (clé publique) et sert d'oracle « ce pseudo existe-t-il ? ». Les pseudos sont publics
-- par conception (affichés en jeu) ; les adresses e-mail ne le sont pas et ne sont jamais exposées ici. Limiter les abus côté API (rate limiting Supabase).
