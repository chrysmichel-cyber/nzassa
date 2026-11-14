#!/usr/bin/env node
/* Vérification RÉELLE contre un projet Supabase de TEST (jamais la production). Aucune de ces vérifications n'est faite par la suite automatique, qui simule Supabase.
   Prépare un projet de test : « Confirm email » désactivé, scripts supabase/01, 03, 04 exécutés (et 02 pour le nettoyage).
   Usage :
     NZASSA_TEST_SUPABASE_URL=https://xxxx.supabase.co NZASSA_TEST_SUPABASE_KEY=sb_publishable_... \
       node scripts/verify-supabase-live.mjs --confirm-test-project
   Options : --dry-run (affiche le plan, aucun appel réseau). Code de sortie 0 si tout passe, 1 sinon.
   Crée 2 comptes jetables (adresses « nzassa-test-…@<domaine> », domaine = NZASSA_TEST_EMAIL_DOMAIN, défaut example.com), puis tente de les supprimer
   (fonction delete_my_account). S'ils ne peuvent pas l'être, leurs adresses sont listées pour suppression manuelle dans le Dashboard. */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { createSupabaseVerifier, keyIsSecret } = require('../server/identity.cjs');
const { createNameGuard } = require('../server/nameguard.cjs');

export async function run({ env = process.env, fetch: fx = globalThis.fetch, argv = process.argv.slice(2), log = console.log, rand = () => Math.random().toString(36).slice(2, 8) } = {}) {
  const url = String(env.NZASSA_TEST_SUPABASE_URL || '').replace(/\/+$/, ''), key = String(env.NZASSA_TEST_SUPABASE_KEY || ''), domain = env.NZASSA_TEST_EMAIL_DOMAIN || 'example.com';
  const dry = argv.includes('--dry-run'), results = [];
  const check = (ok, msg) => { results.push({ ok, msg }); log((ok ? 'OK  ' : 'KO  ') + msg); return ok; };
  const plan = ['configuration (URL Supabase, clé publique, pas de clé secrète)', 'inscription de deux comptes jetables A et B', 'pseudo en double refusé PAR LA BASE (même casse, casse différente)',
    'RPC nzassa_name_taken_by_other : invité, propriétaire, autre compte, nom libre', 'vérification réelle du jeton par le serveur (createSupabaseVerifier)', 'RLS : A ne lit pas la ligne de B, anon ne lit rien', 'nettoyage des comptes jetables'];
  if (dry) { log('Plan (rien n’est envoyé) :'); plan.forEach((p, i) => log(' ' + (i + 1) + '. ' + p)); return { ok: true, results, dry: true }; }
  if (!argv.includes('--confirm-test-project')) { log('Refus : ajoute --confirm-test-project pour confirmer que NZASSA_TEST_SUPABASE_URL est un projet de TEST.'); return { ok: false, results, refused: true }; }
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/i.test(url) || !key) { check(false, 'configuration : NZASSA_TEST_SUPABASE_URL (https://….supabase.co) et NZASSA_TEST_SUPABASE_KEY requis'); return { ok: false, results }; }
  if (keyIsSecret(key)) { check(false, 'configuration : clé SECRÈTE refusée — n’utilise que la clé publique (publishable/anon)'); return { ok: false, results }; }
  check(true, 'configuration : projet ' + url.replace(/^https:\/\//, '').split('.')[0].slice(0, 4) + '… (clé publique)');
  const H = (tok, extra) => ({ apikey: key, 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}), ...(extra || {}) });
  const post = async (path, body, tok) => { const r = await fx(url + path, { method: 'POST', headers: H(tok), body: JSON.stringify(body) }); let j = null; try { j = await r.json(); } catch { } return { status: r.status, ok: r.ok, j }; };
  const get = async (path, tok) => { const r = await fx(url + path, { headers: H(tok) }); let j = null; try { j = await r.json(); } catch { } return { status: r.status, ok: r.ok, j }; };
  const id = rand(), mk = n => ({ pseudo: 'T_' + id + n, email: 'nzassa-test-' + id + n + '@' + domain, password: 'Test-' + rand() + rand() + '1' });
  const A = mk('a'), B = mk('b'), toClean = [];
  const signup = async u => { const r = await post('/auth/v1/signup', { email: u.email, password: u.password, data: { username: u.pseudo, display_name: u.pseudo } }); const s = r.j && (r.j.session || (r.j.access_token ? r.j : null)); return { ...r, token: s && s.access_token, uid: (r.j && (r.j.user && r.j.user.id)) || (r.j && r.j.id) }; };
  try {
    const sa = await signup(A), sb = await signup(B);
    check(sa.ok && !!sa.token, 'inscription A : session reçue (si KO : « Confirm email » doit être désactivé sur le projet de test) — HTTP ' + sa.status);
    check(sb.ok && !!sb.token, 'inscription B : session reçue — HTTP ' + sb.status);
    toClean.push([A, sa.token], [B, sb.token]);
    if (!sa.token || !sb.token) return { ok: false, results };
    const dup1 = await signup({ ...mk('x'), pseudo: A.pseudo }), dup2 = await signup({ ...mk('y'), pseudo: A.pseudo.toLowerCase() });
    if (dup1.token) toClean.push([A, dup1.token]); if (dup2.token) toClean.push([A, dup2.token]);
    check(!dup1.ok && !dup1.token, 'pseudo identique refusé par la base — HTTP ' + dup1.status);
    check(!dup2.ok && !dup2.token, 'pseudo identique en minuscules refusé par la base (unicité insensible à la casse) — HTTP ' + dup2.status + (dup2.ok ? ' ⇒ appliquer supabase/04_unicite_pseudo.sql' : ''));
    const rpc = (name, tok) => post('/rest/v1/rpc/nzassa_name_taken_by_other', { p_name: name }, tok);
    const r0 = await rpc(A.pseudo, null);
    if (r0.status === 404) check(false, 'RPC nzassa_name_taken_by_other absente ⇒ exécuter supabase/03_nom_reserve.sql');
    else {
      check(r0.j === true, 'invité : le pseudo de A est vu comme pris (réponse ' + JSON.stringify(r0.j) + ') — si false : fonction non SECURITY DEFINER ou propriétaire soumis à la RLS');
      check((await rpc(A.pseudo.toUpperCase(), null)).j === true, 'invité : casse différente aussi vue comme prise');
      check((await rpc(A.pseudo, sa.token)).j === false, 'A : son propre pseudo n’est pas « pris par un autre »');
      check((await rpc(B.pseudo, sa.token)).j === true, 'A : le pseudo de B est pris par un autre compte');
      check((await rpc('Libre_' + rand() + rand(), null)).j === false, 'nom libre : false');
      check(typeof r0.j === 'boolean', 'la réponse est un simple booléen (aucune donnée personnelle)');
    }
    const verify = createSupabaseVerifier({ url, key, fetch: fx }), vi = await verify(sa.token);
    check(!!vi && typeof vi.sub === 'string' && (!sa.uid || vi.sub === String(sa.uid).toLowerCase()), 'le serveur valide le VRAI jeton de A auprès de Supabase et retrouve son identifiant');
    check((await verify(sa.token.slice(0, -3) + 'abc')) === null, 'un jeton altéré est refusé');
    const guard = createNameGuard({ url, key, fetch: fx });
    check((await guard.check(B.pseudo, null)) === true && (await guard.check(A.pseudo, sa.token)) === false, 'createNameGuard (celui du serveur) : mêmes réponses que la RPC directe');
    const own = await get('/rest/v1/profiles?select=*', sa.token);
    const rows = Array.isArray(own.j) ? own.j : [];
    check(own.ok && rows.length <= 1 && rows.every(r => !r.id || r.id === vi.sub), 'RLS : A ne voit que sa propre ligne de profil (' + rows.length + ' ligne)');
    log('INFO  contrôle manuel : vérifier dans le Dashboard que profiles ne contient aucune adresse e-mail lisible par d’autres comptes.');
    const an = await get('/rest/v1/profiles?select=*', null);
    check(!an.ok || (Array.isArray(an.j) && an.j.length === 0), 'RLS : un anonyme ne lit aucun profil (HTTP ' + an.status + ')');
  } catch (e) { check(false, 'erreur inattendue : ' + String(e && e.message || e).slice(0, 160)); }
  const left = [];
  for (const [u, tok] of toClean) { if (!tok) continue; const d = await post('/rest/v1/rpc/delete_my_account', {}, tok); if (!d.ok) left.push(u.email); }
  if (left.length) log('À SUPPRIMER MANUELLEMENT (Dashboard > Authentication > Users) : ' + [...new Set(left)].join(', ') + (left.length ? ' — (exécuter supabase/02_suppression_compte.sql pour automatiser)' : ''));
  else log('Comptes jetables supprimés.');
  return { ok: results.every(r => r.ok), results, left };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) run().then(r => { if (r.dry || r.refused) process.exit(r.refused ? 2 : 0); console.log(r.ok ? '\nVÉRIFICATION RÉELLE : tout passe.' : '\nVÉRIFICATION RÉELLE : des points échouent.'); process.exit(r.ok ? 0 : 1); });
