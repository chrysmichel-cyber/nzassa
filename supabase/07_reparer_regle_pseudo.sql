-- N'ZASSA · Réparation de la contrainte profiles_username_format quand elle a été abîmée au copier-coller
-- (erreur à l'inscription : « invalid regular expression: invalid character range », vue par le jeu comme « Database error saving new user »).
-- Non destructif : remplace seulement la contrainte, avec des échappements \uXXXX en ASCII pur, puis vérifie qu'elle se comporte comme js/account/pseudo.js.
alter table public.profiles drop constraint if exists profiles_username_format;
alter table public.profiles
  add constraint profiles_username_format check (
    char_length(username) between 2 and 40
    and username !~ '[\u0001-\u001F\u007F-\u009F\u00AD\u200B-\u200F\u2028-\u202E\u2060-\u2064\uFEFF<>&"\\/@]'
    and username !~ '^\s|\s$'
    and username !~ '  '
    and username !~ '[\t\n\r\f\v\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]'
  ) not valid;

-- Vérification : s'arrête avec une erreur si un pseudo valide est refusé ou si un pseudo interdit passe.
do $$
declare
  ok text[] := array['Diagnostic', 'Awa Diop', 'Kouamé_2', 'N''Zassa'];
  ko text[] := array['a', 'x<y', 'a@b', ' Awa', 'Awa  Diop', 'Awa' || chr(8203) || 'Diop', 'Awa' || chr(160) || 'Diop', 'x' || chr(92) || 'y'];
  u text;
  bad text := '[\u0001-\u001F\u007F-\u009F\u00AD\u200B-\u200F\u2028-\u202E\u2060-\u2064\uFEFF<>&"\\/@]';
  sp text := '[\t\n\r\f\v\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]';
begin
  foreach u in array ok loop
    if not (char_length(u) between 2 and 40 and u !~ bad and u !~ '^\s|\s$' and u !~ '  ' and u !~ sp) then
      raise exception 'Pseudo valide refusé : %', u;
    end if;
  end loop;
  foreach u in array ko loop
    if (char_length(u) between 2 and 40 and u !~ bad and u !~ '^\s|\s$' and u !~ '  ' and u !~ sp) then
      raise exception 'Pseudo interdit accepté : %', u;
    end if;
  end loop;
  raise notice 'Règle du pseudo réparée et vérifiée.';
end $$;
