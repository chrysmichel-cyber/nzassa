// Parcours d'entrée et comptes dans un vrai navigateur (Playwright), avec un Supabase SIMULÉ : aucune requête ne part vers le vrai service,
// aucun vrai compte n'est créé. Lancer : node tests/accounts-flow.mjs   (nécessite playwright, comme tests/e2e.mjs)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = createRequire(import.meta.url)('playwright');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json' };
const srv = http.createServer((q, r) => {
  let f = path.join(root, decodeURIComponent(q.url.split('?')[0]));
  if (f.endsWith(path.sep) || f === root) f = path.join(f, 'index.html');
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(b); });
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const PAGE = 'http://127.0.0.1:' + srv.address().port + '/index.html';
import { fakeSupabase, b64u, UID } from './fake-supabase.mjs';

const results = [];
const check = (ok, msg) => { const l = (ok ? 'OK  ' : 'KO  ') + msg; results.push(l); console.log(l); if (!ok) process.exitCode = 1; };
/* Une page qui se recharge détruit le contexte d'exécution : on réessaie quelques fois. */
const retry = async f => { for (let i = 0; ; i++) { try { return await f(); } catch (e) { if (i >= 8 || !/context was destroyed|navigation/i.test(String(e))) throw e; await new Promise(r => setTimeout(r, 400)); } } };
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

async function open(fake, { ls = {}, noConfig = false, ctx } = {}) {
  ctx = ctx || await browser.newContext({ viewport: { width: 1000, height: 700 }, serviceWorkers: 'block', locale: 'fr-FR' });
  const p = await ctx.newPage(), errs = [];
  p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await p.route('**/fonts.g*/**', r => r.abort());
  await p.route('**/*.supabase.co/**', fake.handler);
  if (noConfig) await p.route('**/js/supabase/config.js', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  if (Object.keys(ls).length) await p.addInitScript(o => { if (!sessionStorage.getItem('__seeded')) { Object.keys(o).forEach(k => localStorage.setItem(k, o[k])); sessionStorage.setItem('__seeded', '1'); } }, ls);
  await p.goto(PAGE);
  await p.waitForSelector('#welcomeCard', { state: 'attached' });
  await p.waitForTimeout(900);
  return { p, errs, ctx };
}
const txt = p => retry(() => p.evaluate(() => document.querySelector('#welcomeCard').innerText.replace(/\s+/g, ' ').trim()));
const click = (p, sel) => retry(() => p.evaluate(s => { const e = document.querySelector(s); if (e) e.click(); return !!e; }, sel));
const ls = (p, k) => retry(() => p.evaluate(k => localStorage.getItem(k), k));
const reloaded = async p => { await p.waitForTimeout(2200); await p.waitForLoadState('load'); await p.waitForTimeout(800); };
const walk = async p => { for (let i = 0; i < 3; i++) { await click(p, '[data-setup="next"]'); await p.waitForTimeout(150); if (i === 1) { await click(p, '[data-rmode="2d"]'); await p.waitForTimeout(100); } } };
const fillSignup = async (p, f) => { await p.fill('#accPseudo', f.pseudo); await p.fill('#accEmail', f.email); await p.fill('#accPw', f.pw); await p.fill('#accPw2', f.pw2 || f.pw); if (f.consent !== false) await p.check('#accConsent'); };

/* 1. Premier lancement : 4 étapes, puis invité : aucun appel Supabase, identifiant local créé */
{
  const fake = fakeSupabase(), { p, errs } = await open(fake);
  check((await txt(p)).includes('Bienvenue dans N’Zassa') && (await txt(p)).includes('Commencer'), '1a · étape accueil');
  await click(p, '[data-setup="next"]'); check((await txt(p)).includes('Langue du jeu') && (await txt(p)).includes('Étape 1 sur 4'), '1b · étape langue');
  await click(p, '[data-setup="next"]'); check(/qualité graphique/i.test(await txt(p)) && (await txt(p)).includes('Rendu 2D'), '1c · étape affichage (rendu + qualité) : ' + (await txt(p)).slice(0, 160));
  await click(p, '[data-rmode="2d"]');
  await click(p, '[data-setup="next"]'); const t3 = await txt(p);
  check(t3.includes('Se connecter') && t3.includes('Créer un compte') && t3.includes('Jouer en invité'), '1d · étape accès : connexion, inscription, invité');
  await click(p, '[data-setup="guest"]'); await p.waitForTimeout(1200);
  check(await p.evaluate(() => document.body.classList.contains('m2d')), '1e · le monde démarre en 2D après le choix invité');
  const idx = JSON.parse(await ls(p, 'lca-acc'));
  check(idx.v === 2 && /^[0-9a-f-]{36}$/.test(idx.guest.id) && idx.current.kind === 'guest', '1f · identifiant local d’invité créé et conservé');
  check(fake.reqs.length === 0, '1g · AUCUNE requête Supabase pour un invité (jamais de faux compte) : ' + fake.reqs.length);
  check(errs.length === 0, '1h · aucune erreur de page ' + errs.join('|'));
  await p.context().close();
}
/* 2. Inscription depuis le parcours : validations, pseudo exact, session persistante, réglages conservés */
{
  const fake = fakeSupabase(), { p, errs, ctx } = await open(fake);
  await walk(p); await click(p, '[data-setup="register"]');
  await fillSignup(p, { pseudo: 'A', email: 'a@b.co', pw: 'motdepasse8' }); await click(p, '[data-acc="register"]'); await p.waitForTimeout(200);
  check((await txt(p)).includes('Pseudo trop court') && fake.reqs.length === 0, '2a · pseudo trop court refusé avant tout appel réseau');
  await fillSignup(p, { pseudo: 'Aïssa_Test', email: 'a@b.co', pw: 'motdepasse8', pw2: 'autrechose' }); await click(p, '[data-acc="register"]'); await p.waitForTimeout(200);
  check((await txt(p)).includes('pas identiques') && fake.reqs.length === 0, '2b · confirmation différente refusée');
  await p.uncheck('#accConsent'); await p.fill('#accPw2', 'motdepasse8'); await click(p, '[data-acc="register"]'); await p.waitForTimeout(200);
  check((await txt(p)).includes('consentement') && fake.reqs.length === 0, '2c · consentement obligatoire');
  await p.check('#accConsent'); await p.fill('#accEmail', '  Aïssa@Exemple.COM '); await click(p, '[data-acc="register"]');
  await reloaded(p);
  const sg = fake.reqs.find(r => r.path.startsWith('/auth/v1/signup'));
  check(!!sg && sg.body.email === 'aïssa@exemple.com' || (!!sg && /@exemple\.com$/.test(sg.body.email)), '2d · e-mail réel envoyé (normalisé), sans pseudo transformé en adresse : ' + (sg && sg.body.email));
  check(sg && sg.body.data.username === 'Aïssa_Test' && sg.body.data.display_name === 'Aïssa_Test' && !JSON.stringify(sg.body).includes('username_key') && !JSON.stringify(sg.body).includes('accounts.nzassa'), '2e · pseudo conservé EXACTEMENT (casse, accent, _) dans les métadonnées, pas de username_key');
  const idx = JSON.parse(await ls(p, 'lca-acc'));
  check(idx.current.kind === 'account' && idx.current.pseudo === 'Aïssa_Test', '2f · compte actif avec le pseudo exact');
  const slot = JSON.parse(await ls(p, 'lca-u-' + idx.current.id));
  check(slot.settings && slot.settings.setupDone === 1 && slot.settings.mode === '2d', '2g · ' + JSON.stringify(slot.settings) + ' · réglages du parcours emportés dans le compte (pas de second parcours)');
  check(!(await txt(p)).includes('Étape'), '2h · après inscription : accueil du jeu, pas de retour au parcours');
  check(await p.evaluate(() => Object.keys(localStorage).some(k => /^sb-.*-auth-token$/.test(k))), '2i · session Supabase persistée par la bibliothèque');
  check(!JSON.stringify(Object.fromEntries(await p.evaluate(() => Object.entries(localStorage)))).includes('motdepasse8'), '2j · le mot de passe n’est stocké nulle part');
  /* rechargement : session restaurée */
  await p.reload(); await p.waitForTimeout(1500);
  const who = await p.evaluate(() => document.querySelector('#who') && document.querySelector('#who').textContent.replace(/\s+/g, ' '));
  check(/Compte/.test(who || ''), '2k · après rechargement, le compte est restauré (' + who + ')');
  await click(p, '[data-m="account"]'); await p.waitForTimeout(300);
  check((await txt(p)).includes('connecté'), '2l · session vérifiée : « connecté »');
  check(errs.length === 0, '2m · aucune erreur de page ' + errs.join('|'));
  await ctx.close();
}
/* 3. Pseudo pris / e-mail déjà inscrit / mauvais mot de passe : messages précis */
{
  const fake = fakeSupabase(); fake.users['deja@ex.com'] = { id: UID(900), email: 'deja@ex.com', pw: 'motdepasse8', meta: { username: 'Pris2' } };
  const { p, ctx } = await open(fake);
  await walk(p); await click(p, '[data-setup="register"]');
  await fillSignup(p, { pseudo: 'Pris2', email: 'neuf@ex.com', pw: 'motdepasse8' }); await click(p, '[data-acc="register"]'); await p.waitForTimeout(600);
  check((await txt(p)).includes('déjà pris'), '3a · pseudo déjà pris (insensible à la casse : « Pris2 » existe) signalé via la fonction de disponibilité');
  await fillSignup(p, { pseudo: 'Libre', email: 'deja@ex.com', pw: 'motdepasse8' }); await click(p, '[data-acc="register"]'); await p.waitForTimeout(600);
  check((await txt(p)).includes('a déjà un compte'), '3b · e-mail déjà inscrit signalé');
  await fillSignup(p, { pseudo: 'Pris', email: 'x@ex.com', pw: 'motdepasse8' }); await click(p, '[data-acc="register"]'); await p.waitForTimeout(600);
  check((await txt(p)).includes('déjà pris'), '3c · échec du profil côté base : message « pseudo peut-être pris », pas « hors ligne »');
  await click(p, '[data-acc="tab:login"]'); await p.fill('#accEmail', 'deja@ex.com'); await p.fill('#accPw', 'faux'); await click(p, '[data-acc="login"]'); await p.waitForTimeout(600);
  check((await txt(p)).includes('E-mail ou mot de passe incorrect'), '3d · mauvais mot de passe : message clair');
  const lg = fake.reqs.filter(r => r.path.startsWith('/auth/v1/token')).pop();
  check(lg && lg.body.email === 'deja@ex.com' && lg.body.password === 'faux' && !('username' in lg.body), '3e · la connexion n’envoie que e-mail + mot de passe');
  await p.fill('#accEmail', 'Pseudo_Sans_Arobase'); await p.fill('#accPw', 'motdepasse8'); const n0 = fake.reqs.length; await click(p, '[data-acc="login"]'); await p.waitForTimeout(300);
  check(fake.reqs.length === n0, '3f · un pseudo n’est jamais accepté comme identifiant (aucun appel réseau)');
  await ctx.close();
}
/* 4. Invité avec progression : transfert vers un compte neuf (copie), puis conflit sur un compte déjà rempli */
{
  const fake = fakeSupabase();
  const mine = JSON.stringify({ v: 5, name: 'Kofi', settings: { mode: '2d', setupDone: 1, uiLang: 'fr' }, d: {} });
  const { p, ctx } = await open(fake, { ls: { 'lca-v2': mine } });
  check(!(await txt(p)).includes('Étape'), '4a · invité avec progression : pas de parcours, accueil direct');
  await click(p, '[data-m="account"]'); await p.waitForTimeout(250); await click(p, '[data-acc="tab:register"]'); await p.waitForTimeout(200);
  check((await txt(p)).includes('Reprendre ma progression (invité)'), '4b · proposition de reprendre la progression d’invité');
  await fillSignup(p, { pseudo: 'Kofi', email: 'kofi@ex.com', pw: 'motdepasse8' }); await click(p, '[data-acc="register"]');
  await reloaded(p);
  const idx = JSON.parse(await ls(p, 'lca-acc'));
  check(JSON.parse(await ls(p, 'lca-u-' + idx.current.id)).name === 'Kofi' && JSON.parse(await ls(p, 'lca-v2')).name === 'Kofi', '4c · progression COPIÉE dans le compte, sauvegarde d’invité intacte');
  /* déconnexion → retour à l’invité */
  await click(p, '[data-m="account"]'); await p.waitForTimeout(250); await click(p, '[data-acc="logout"]'); await reloaded(p);
  check(JSON.parse(await ls(p, 'lca-acc')).current.kind === 'guest', '4d · déconnexion : retour à l’invité');
  check(JSON.parse(await ls(p, 'lca-u-' + idx.current.id)).name === 'Kofi', '4e · progression du compte conservée sur l’appareil');
  /* un AUTRE invité avec une progression différente se connecte au même compte, qui a déjà sa progression */
  await p.evaluate(() => { const g = JSON.parse(localStorage.getItem('lca-v2')); g.name = 'Invite2'; localStorage.setItem('lca-v2', JSON.stringify(g)); });
  await p.reload(); await p.waitForTimeout(1200);
  await click(p, '[data-m="account"]'); await p.waitForTimeout(250); await p.fill('#accEmail', 'kofi@ex.com'); await p.fill('#accPw', 'motdepasse8'); await click(p, '[data-acc="login"]'); await p.waitForTimeout(900);
  check((await txt(p)).includes('Une progression existe déjà'), '4f · conflit détecté : aucun écrasement silencieux');
  check(JSON.parse(await ls(p, 'lca-u-' + idx.current.id)).name === 'Kofi', '4g · la progression du compte n’a pas bougé en attendant le choix');
  await click(p, '[data-acc="conf:replace"]'); await reloaded(p);
  check(JSON.parse(await ls(p, 'lca-u-' + idx.current.id)).name === 'Invite2' && JSON.parse(await ls(p, 'lca-u-' + idx.current.id + '.pre-import')).name === 'Kofi', '4h · « remplacer » : l’ancienne progression du compte est conservée à côté');
  await ctx.close();
}
/* 5. Session expirée au démarrage : le jeu reste jouable sur la progression locale, avec message */
{
  const fake = fakeSupabase(), { p, ctx } = await open(fake);
  await walk(p); await click(p, '[data-setup="register"]'); await fillSignup(p, { pseudo: 'Expire', email: 'e@ex.com', pw: 'motdepasse8' }); await click(p, '[data-acc="register"]');
  await reloaded(p);
  await p.evaluate(() => Object.keys(localStorage).filter(k => /^sb-/.test(k)).forEach(k => localStorage.removeItem(k)));
  await ctx.addInitScript(() => { window.__expiredToast = false; setInterval(() => { const t = document.querySelector('#toast'); if (t && !t.hidden && t.textContent.includes('session a expiré') && t.getBoundingClientRect().width > 0) window.__expiredToast = true; }, 25); });
  await p.reload();
  let seen = false; for (let i = 0; i < 80 && !seen; i++) { await p.waitForTimeout(150); seen = await retry(() => p.evaluate(() => window.__expiredToast === true)); }
  check(seen, '5a · session perdue : message « reconnecte-toi » VISIBLE à l’écran (affiché au moins une fois, largeur > 0)');
  check(await p.evaluate(() => document.body.classList.contains('m2d')), '5b · le monde reste jouable (progression locale du compte)');
  await click(p, '[data-m="account"]'); await p.waitForTimeout(300);
  const t = await txt(p); check(t.includes('Ta session a expiré') && t.includes('Se connecter'), '5c · l’écran Profil propose de se reconnecter');
  await ctx.close();
}
/* 6. Sans configuration Supabase : jeu complet en invité, comptes désactivés proprement */
{
  const fake = fakeSupabase(), { p, errs, ctx } = await open(fake, { noConfig: true });
  await walk(p); const t = await txt(p);
  check(t.includes('pas disponibles'), '6a · comptes indisponibles annoncés clairement');
  check(await p.evaluate(() => document.querySelector('[data-setup="login"]').disabled && document.querySelector('[data-setup="register"]').disabled), '6b · connexion et inscription désactivées');
  await click(p, '[data-setup="guest"]'); await p.waitForTimeout(1200);
  check(await p.evaluate(() => document.body.classList.contains('m2d')) && errs.length === 0 && fake.reqs.length === 0, '6c · le jeu démarre en invité, sans erreur ni requête : erreurs=' + errs.join('|') + ' requêtes=' + fake.reqs.length);
  await ctx.close();
}
/* 7. Ancien profil local (avant Supabase) : conservé, jouable, transférable */
{
  const fake = fakeSupabase();
  const old = { v: 1, current: 'ab12cd34', accounts: [{ id: 'ab12cd34', key: 'kofi', pseudo: 'KofiLocal', created: 5 }], fails: {} };
  const { p, ctx } = await open(fake, { ls: { 'lca-acc': JSON.stringify(old), 'lca-u-ab12cd34': JSON.stringify({ v: 5, name: 'Ancien', settings: { mode: '2d', setupDone: 1, uiLang: 'fr' }, d: {} }) } });
  check(!(await txt(p)).includes('Étape'), '7a · la mise à jour ne renvoie pas un ancien joueur au parcours de démarrage');
  const who = await p.evaluate(() => document.querySelector('#who').textContent.replace(/\s+/g, ' '));
  check(/Ancien/.test(who), '7b · le profil local actif reste actif (' + who + ')');
  check(!!(await ls(p, 'lca-acc.v1.bak')), '7c · copie de l’ancien index conservée');
  await click(p, '[data-m="account"]'); await p.waitForTimeout(250);
  check((await txt(p)).includes('Ancien profil local') , '7d · écran Profil : ancien profil identifié, transfert possible');
  await ctx.close();
}
await browser.close(); srv.close();
console.log(process.exitCode ? '\nÉCHEC' : '\nTous les scénarios passent.');
