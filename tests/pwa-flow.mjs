// PWA dans un VRAI Chromium (processus réel) : service worker, hors connexion, mises à jour, invite d'installation, sessions, cache sans données sensibles.
// Le site testé est le résultat RÉEL de « node scripts/build.mjs » (dist/), servi par un serveur HTTP local (127.0.0.1 = contexte sécurisé).
// Limites : seul Chromium est disponible ici. L'invite d'installation (beforeinstallprompt) et le comportement iOS sont SIMULÉS (évènement synthétique / user-agent) ;
// l'installation réelle sur Android, iOS et ordinateur n'a pas pu être exécutée dans ce bac à sable.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = require('playwright');

let n = 0, fail = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok  ' + m); else { fail++; console.log('  FAIL ' + m); } };

/* build réel, puis deux « versions » du site : A (build) et B (même site, version suivante) */
execFileSync('node', [path.join(root, 'scripts/build.mjs')], { cwd: root, stdio: 'pipe' });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nzpwa-'));
const A = path.join(tmp, 'A'), B = path.join(tmp, 'B');
fs.cpSync(path.join(root, 'dist'), A, { recursive: true });
fs.cpSync(A, B, { recursive: true });
const swA = fs.readFileSync(path.join(A, 'sw.js'), 'utf8');
const buildA = /const BUILD="([^"]+)"/.exec(swA)[1];
const buildB = buildA + '-b';
fs.writeFileSync(path.join(B, 'sw.js'), swA.replace('const BUILD="' + buildA + '"', 'const BUILD="' + buildB + '"'));
fs.appendFileSync(path.join(B, 'index.html'), '\n<!-- version B -->');

let cur = A;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' };
const hits = [];
const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]); hits.push(u);
  if (u === '/v1/secret') { r.writeHead(200, { 'content-type': 'application/json' }); r.end('{"token":"SECRET-TOKEN-XYZ"}'); return; }
  let f = path.join(cur, u === '/' ? 'index.html' : u);
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'cache-control': u === '/sw.js' ? 'no-cache' : 'max-age=0' }); r.end(b); });
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const URL0 = 'http://127.0.0.1:' + srv.address().port + '/index.html';
const origin = 'http://127.0.0.1:' + srv.address().port;

const FAKE_TOKEN = 'eyJhbGciOi.FAKE-ACCESS-TOKEN-123456.sig';
const SAVE = JSON.stringify({ v: 5, name: 'Ama', started: 1, lang: 'wolof', settings: { mode: '2d', setupDone: 1, uiLang: 'fr', play: 'solo' }, d: { learned: { 0: 1, 1: 1 }, xp: 42 } });
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const seed = (extra) => `try{if(!localStorage.getItem('lca-v2')){localStorage.setItem('lca-v2',${JSON.stringify(SAVE)});localStorage.setItem('sb-test-auth-token',${JSON.stringify(JSON.stringify({ access_token: FAKE_TOKEN, refresh_token: 'REFRESH-FAKE' }))})}}catch(e){};${extra || ''}`;
async function open(ctxOpts, extra) {
  const ctx = await browser.newContext(Object.assign({ viewport: { width: 1000, height: 640 }, locale: 'fr-FR' }, ctxOpts || {}));
  await ctx.addInitScript(seed(extra));
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e)));
  return { ctx, p, errs };
}
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch (e) {} await new Promise(r => setTimeout(r, 150)); } return false; };
const cachesDump = p => p.evaluate(async () => { const out = {}; for (const k of await caches.keys()) { const c = await caches.open(k); out[k] = (await c.keys()).map(r => ({ url: r.url, auth: r.headers.has('authorization') })); } return out; });

console.log('\n== 0. Accès Web classique inchangé (sans service worker) ==');
{
  const { ctx, p, errs } = await open();
  await p.goto(URL0); await p.waitForTimeout(3000);
  ok(await p.evaluate(() => LCA.pwa.state.swState) === 'disabled', 'sous pilotage automatique le service worker n’est PAS enregistré (les autres tests ne sont pas perturbés)');
  ok((await p.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)) === 0, 'aucune inscription de service worker : le site se comporte comme un site Web ordinaire');
  ok(await p.title() === 'N’Zassa', 'le site s’ouvre normalement');
  ok(errs.length === 0, 'aucune erreur JavaScript');
  await ctx.close();
}

console.log('\n== 1. Manifeste et icônes (fichiers servis par le build) ==');
{
  const m = JSON.parse(fs.readFileSync(path.join(A, 'manifest.webmanifest'), 'utf8'));
  ok(m.display === 'standalone' && m.name === 'N’Zassa' && m.short_name === 'N’Zassa' && m.lang === 'fr', 'nom, langue et mode autonome (standalone)');
  ok(m.scope === './' && /index\.html/.test(m.start_url) && m.id, 'portée, id et page de démarrage');
  ok(m.background_color === '#2a130c' && m.theme_color === '#2a130c', 'couleurs de l’identité graphique');
  const need = [['192x192', 'any'], ['512x512', 'any'], ['192x192', 'maskable'], ['512x512', 'maskable']];
  ok(need.every(([s, pu]) => m.icons.some(i => i.sizes === s && i.purpose === pu)), 'icônes 192 et 512, « any » et « maskable »');
  const sizeOk = m.icons.every(i => { const b = fs.readFileSync(path.join(A, i.src)); const w = b.readUInt32BE(16), h = b.readUInt32BE(20); return i.sizes === w + 'x' + h; });
  ok(sizeOk, 'les fichiers d’icônes existent et ont exactement la taille annoncée');
  ok(fs.existsSync(path.join(A, 'img/apple-touch-icon.png')) && /apple-touch-icon\.png/.test(fs.readFileSync(path.join(A, 'index.html'), 'utf8')), 'icône Apple (iOS) référencée');
}

console.log('\n== 2. Installation du service worker, précache, version ==');
let page1, ctx1;
{
  const o = await open({}, 'window.LCA_FORCE_SW=true;'); ctx1 = o.ctx; page1 = o.p;
  await page1.goto(URL0);
  ok(await until(() => page1.evaluate(() => navigator.serviceWorker.controller !== null || LCA.pwa.state.swState === 'active'), 20000), 'le service worker s’active');
  await page1.reload(); await page1.waitForTimeout(1500);
  ok(await page1.evaluate(() => !!navigator.serviceWorker.controller), 'la page est contrôlée par le service worker après rechargement');
  const v = await page1.evaluate(() => LCA.pwa.version());
  ok(v && v.build === buildA, 'version active = version du build (' + buildA + ')');
  const dump = await cachesDump(page1);
  const keys = Object.keys(dump);
  ok(keys.includes('nzassa-static-' + buildA), 'cache statique nommé selon la version du build');
  const urls = (dump['nzassa-static-' + buildA] || []).map(x => new URL(x.url).pathname);
  const pre = JSON.parse(/PRECACHE=(\[.*?\]),CACHE/.exec(swA)[1]);
  ok(pre.length > 100 && pre.every(f => urls.includes('/' + f)), 'les ' + pre.length + ' fichiers essentiels du build sont dans le cache');
  ok(urls.includes('/index.html') && urls.includes('/js/main.js') && urls.includes('/css/styles.css'), 'page, script principal et styles préchargés');
}

console.log('\n== 3. Aucun jeton ni donnée sensible dans les caches ==');
{
  await page1.evaluate(async () => { await fetch('/v1/secret').catch(() => {}); await fetch('/js/main.js?access_token=abc').catch(() => {}); await fetch('/js/main.js', { headers: { authorization: 'Bearer ZZZ' } }).catch(() => {}); await fetch('/auth/v1/user').catch(() => {}); });
  await page1.waitForTimeout(600);
  const dump = await cachesDump(page1);
  const all = Object.values(dump).flat();
  ok(!all.some(x => /\/v1\/|\/auth\/|access_token|supabase\.co/.test(x.url)), 'aucune réponse d’API, d’authentification ni URL à jeton dans les caches');
  ok(!all.some(x => x.auth), 'aucune requête avec en-tête d’autorisation en cache');
  const leak = await page1.evaluate(async tok => { for (const k of await caches.keys()) { const c = await caches.open(k); for (const r of await c.keys()) { const res = await c.match(r); const t = res.headers.get('content-type') || ''; if (/text|javascript|json/.test(t)) { const s = await res.text(); if (s.includes(tok) || s.includes('SECRET-TOKEN-XYZ')) return r.url; } } } return null; }, FAKE_TOKEN);
  ok(leak === null, 'le jeton de session de l’utilisateur n’apparaît dans aucun fichier en cache' + (leak ? ' : ' + leak : ''));
  ok(await page1.evaluate(tok => (localStorage.getItem('sb-test-auth-token') || '').includes(tok), FAKE_TOKEN), 'la session reste dans le stockage du navigateur (non touchée par le service worker)');
}

console.log('\n== 4. Hors connexion : jeu solo, progression locale, signalement ==');
{
  await ctx1.setOffline(true);
  ok(await until(() => page1.evaluate(() => LCA.pwa.state.online === false)), 'le navigateur passe hors ligne');
  ok(await page1.evaluate(() => { const b = document.querySelector('#pwaBar'); return b && !b.hidden && /Hors connexion/.test(b.textContent) && b.dataset.k === 'offline'; }), 'bandeau clair « Hors connexion » (solo disponible, en ligne indisponible)');
  await page1.reload(); await page1.waitForTimeout(3500);
  ok(await page1.title() === 'N’Zassa', 'la page se recharge sans réseau (servie par le cache)');
  ok(await page1.evaluate(() => { const b = document.querySelector('#boot'); return !b || b.hidden || getComputedStyle(b).display === 'none' || getComputedStyle(b).opacity === '0'; }), 'l’écran de chargement a disparu : le jeu a démarré hors ligne');
  const prog = await page1.evaluate(() => JSON.parse(localStorage.getItem('lca-v2') || '{}'));
  ok(prog.d && prog.d.xp === 42 && prog.name === 'Ama', 'la progression locale est intacte hors ligne (xp 42, nom Ama)');
  const cont = await page1.$('[data-m="continue"]');
  if (cont) { await cont.click(); await page1.waitForTimeout(2500); }
  ok(await until(() => page1.evaluate(() => typeof __lca !== 'undefined' && ['2d', '3d'].includes(__lca.mode) && document.querySelector('#welcome').hidden && /m2d|m3d/.test(document.body.className)), 10000), 'le monde solo se lance hors ligne (accueil fermé, rendu 2D/3D actif)');
  ok(await page1.evaluate(() => /Hors connexion/.test((document.querySelector('#pwaBar') || {}).textContent || '')), 'le bandeau reste affiché pendant la partie');
  await ctx1.setOffline(false);
  ok(await until(() => page1.evaluate(() => LCA.pwa.state.online === true && document.querySelector('#pwaBar').hidden)), 'retour du réseau : bandeau masqué');
}

console.log('\n== 5. Mise à jour : prévenue, à la demande, sans perte de session ni de progression ==');
{
  cur = B;
  await page1.evaluate(() => LCA.pwa.registration.update());
  ok(await until(() => page1.evaluate(() => { const b = document.querySelector('#pwaBar'); return b && !b.hidden && b.dataset.k === 'update'; }), 20000), 'la nouvelle version est détectée et proposée (bandeau « Actualiser »)');
  const vOld = await page1.evaluate(() => LCA.pwa.version());
  ok(vOld && vOld.build === buildA, 'tant que le joueur n’a pas accepté, la version A reste active (pas de rechargement surprise)');
  ok((await cachesDump(page1))['nzassa-static-' + buildB] !== undefined, 'la version B est préchargée en arrière-plan');
  await Promise.all([page1.waitForNavigation({ timeout: 20000 }).catch(() => null), page1.click('[data-pwa=update]')]);
  await page1.waitForTimeout(2500);
  const v2 = await page1.evaluate(() => LCA.pwa.version());
  ok(v2 && v2.build === buildB, 'après « Actualiser » : version B active');
  const dump = await cachesDump(page1);
  ok(Object.keys(dump).filter(k => k.startsWith('nzassa-static-')).join() === 'nzassa-static-' + buildB, 'l’ancien cache est supprimé, seul celui de la version B reste');
  const st = await page1.evaluate(() => ({ save: JSON.parse(localStorage.getItem('lca-v2')), tok: localStorage.getItem('sb-test-auth-token') }));
  ok(st.save.d.xp === 42 && st.tok.includes(FAKE_TOKEN), 'progression et session conservées après la mise à jour');
  ok(/version B/.test(await page1.evaluate(() => fetch('/index.html', { cache: 'no-store' }).then(r => r.text()))), 'le serveur sert bien la version B');
  await ctx1.close();
}

console.log('\n== 6. Bouton « Installer N’Zassa » ==');
{
  /* Chrome / Android / ordinateur : évènement beforeinstallprompt SIMULÉ */
  const { ctx, p } = await open({}, 'window.LCA_FORCE_SW=true;');
  await p.goto(URL0); await p.waitForTimeout(2500);
  ok(await p.evaluate(() => { const b = document.querySelector('[data-pwa=install]'); return !b || b.hidden; }), 'pas de bouton tant que l’installation n’est pas possible');
  await p.evaluate(() => { window.__prompted = 0; const e = new Event('beforeinstallprompt', { cancelable: true }); e.prompt = async () => { window.__prompted++; }; e.userChoice = Promise.resolve({ outcome: 'accepted' }); window.dispatchEvent(e); });
  ok(await until(() => p.evaluate(() => { const b = document.querySelector('[data-pwa=install]'); return b && !b.hidden && /Installer N’Zassa/.test(b.textContent); })), 'le bouton « Installer N’Zassa » apparaît quand le navigateur propose l’installation (évènement simulé)');
  await p.click('[data-pwa=install]'); await p.waitForTimeout(400);
  ok(await p.evaluate(() => window.__prompted) === 1, 'un clic déclenche l’invite d’installation du navigateur');
  ok(await p.evaluate(() => document.querySelector('[data-pwa=install]').hidden), 'le bouton disparaît après usage');
  await p.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
  ok(await p.evaluate(() => LCA.pwa.state.installed === true), 'évènement « appinstalled » pris en compte');
  await ctx.close();
}
{
  /* déjà installée (mode autonome) : pas de bouton */
  const { ctx, p } = await open({}, "const mm=window.matchMedia.bind(window);window.matchMedia=q=>/display-mode: standalone/.test(q)?{matches:true,media:q,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}:mm(q);");
  await p.goto(URL0); await p.waitForTimeout(2500);
  await p.evaluate(() => { const e = new Event('beforeinstallprompt', { cancelable: true }); e.prompt = async () => {}; e.userChoice = Promise.resolve({}); window.dispatchEvent(e); });
  await p.waitForTimeout(400);
  ok(await p.evaluate(() => LCA.pwa.state.installed === true && (!document.querySelector('[data-pwa=install]') || document.querySelector('[data-pwa=install]').hidden)), 'application déjà ouverte en mode autonome : pas de bouton d’installation');
  await ctx.close();
}
{
  /* iOS Safari : pas d'invite native, consignes pas à pas (user-agent SIMULÉ) */
  const { ctx, p } = await open({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1', viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true }, 'window.LCA_FORCE_SW=true;window.LCA_NO_FSGATE=true;');
  await p.goto(URL0); await p.waitForTimeout(2500);
  ok(await p.evaluate(() => LCA.pwa.state.ios === true), 'iOS reconnu');
  ok(await until(() => p.evaluate(() => { const b = document.querySelector('[data-pwa=install]'); return b && !b.hidden; })), 'bouton « Installer N’Zassa » visible sur iOS');
  await p.click('[data-pwa=install]'); await p.waitForTimeout(300);
  ok(await p.evaluate(() => { const d = document.querySelector('#pwaIos'); return d && !d.hidden && /Sur l’écran d’accueil/.test(d.textContent); }), 'consignes « Partager > Sur l’écran d’accueil » affichées');
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'pas de défilement horizontal à 390 px');
  await ctx.close();
}

await browser.close(); srv.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log('\n' + n + ' vérifications, ' + fail + ' échec(s)');
process.exit(fail ? 1 : 0);
