// Monde ouvert dans DEUX navigateurs Chromium réels (deux processus distincts) face à un VRAI serveur temps réel (HTTP + WebSocket, 127.0.0.1).
// Seul Supabase est SIMULÉ (tests/fake-supabase.mjs) : le serveur valide le jeton avec un vérificateur local qui accepte les faux jetons.
// Lancer : node tests/online-flow.mjs   (nécessite playwright, comme tests/e2e.mjs)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { fakeSupabase } from './fake-supabase.mjs';

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = require('playwright');
const { createServer } = require('../server/server.cjs');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };

const web = http.createServer((q, r) => {
  let f = path.join(root, decodeURIComponent(q.url.split('?')[0]));
  if (f.endsWith(path.sep) || f === root) f = path.join(f, 'index.html');
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(b); });
});
await new Promise(r => web.listen(0, '127.0.0.1', r));
const ORIGIN = 'http://127.0.0.1:' + web.address().port, PAGE = ORIGIN + '/index.html';

/* Serveur temps réel réel. Le vérificateur remplace l'appel à Supabase (jetons simulés « h.p.sig ») ; « refuse » simule un jeton révoqué. */
let refuse = false, verifyCalls = 0;
const verifyToken = async tok => {
  verifyCalls++;
  if (refuse) return null;
  try { const p = JSON.parse(Buffer.from(String(tok).split('.')[1], 'base64url').toString()); return p.sub && String(tok).endsWith('.sig') && p.exp * 1000 > Date.now() ? { sub: p.sub, exp: p.exp } : null; } catch { return null; }
};
/* noms réservés simulés : « Reservee » est le pseudo d'un compte (la vraie fonction SQL n'est pas exécutée) */
const nameGuard = { strict: false, check: async n => String(n).replace(/\s+/g, ' ').trim().toLowerCase() === 'reservee' };
const game = createServer({ legacy: false, cors: ORIGIN, verifyToken, nameGuard, realtime: { tickMs: 50 } });
await new Promise(r => game.listen(0, '127.0.0.1', r));
const API = 'http://127.0.0.1:' + game.address().port;
const players = () => game.world.stats().players;

const results = [];
const check = (ok, msg) => { const l = (ok ? 'OK  ' : 'KO  ') + msg; results.push(l); console.log(l); if (!ok) process.exitCode = 1; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (f, ms = 6000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await f()) return true; } catch { } await sleep(120); } return false; };
const retry = async f => { for (let i = 0; ; i++) { try { return await f(); } catch (e) { if (i >= 8 || !/context was destroyed|navigation/i.test(String(e))) throw e; await sleep(400); } } };
const ARGS = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const fake = fakeSupabase();

async function openPage(browser, { net = null, ls = null } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 }, serviceWorkers: 'block', locale: 'fr-FR' });
  const p = await ctx.newPage(), errs = [];
  p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  if (net) { p.on('websocket', ws => net.ws.push(ws.url())); p.on('request', q => { if (q.url().startsWith(API)) net.http.push(q.url()); }); }
  await p.route('**/fonts.g*/**', r => r.abort());
  await p.route('**/*.supabase.co/**', fake.handler);
  await p.addInitScript(api => { window.LCA = window.LCA || {}; window.LCA.config = { apiBase: api }; }, API);
  if (ls) await p.addInitScript(o => { for (const k in o) if (localStorage.getItem(k) === null) localStorage.setItem(k, o[k]); }, ls);
  await p.goto(PAGE); await p.waitForSelector('#welcomeCard', { state: 'attached' }); await p.waitForTimeout(900);
  return { p, errs, ctx };
}
const click = (p, sel) => retry(() => p.evaluate(s => { const e = document.querySelector(s); if (e) e.click(); return !!e; }, sel));
const onl = p => retry(() => p.evaluate(() => window.LCA.onlineState()));
const badge = p => retry(() => p.evaluate(() => { const b = document.querySelector('#netBadge'); return { k: b.dataset.k, kind: b.dataset.kind, text: b.textContent, hidden: b.hidden }; }));
const walk = async p => { for (let i = 0; i < 3; i++) { await click(p, '[data-setup="next"]'); await p.waitForTimeout(150); if (i === 1) await click(p, '[data-rmode="2d"]'); } };
const goOnline = async p => { /* chemin de l'interface : accueil > Monde ouvert, consentement, continuer */
  await click(p, '[data-play="online"]'); await p.waitForTimeout(250);
  await retry(() => p.check('#onlConsent')); await p.waitForTimeout(250);
  await closeMenu(p); };
/* ferme l'accueil : le bouton menu, ou « Nouvelle aventure » quand aucune partie n'a encore commencé */
const closeMenu = async p => { await click(p, '#menuBtn'); await p.waitForTimeout(500); if (await retry(() => p.evaluate(() => !document.querySelector('#welcome').hidden))) { await click(p, '[data-m="new"]'); await p.waitForTimeout(900); } };
/* accueil > Nouvelle aventure > choisir le village wolof : le monde démarre */
const enterWorld = async p => { await click(p, '[data-m="new"]'); await p.waitForTimeout(700); await click(p, '[data-pick="wolof"]'); await p.waitForTimeout(500); await click(p, '[data-go2="start"]'); await p.waitForTimeout(2500); };
const openMenu = async p => { await click(p, '#menuBtn'); await p.waitForTimeout(400); };
const reloaded = async p => { await p.waitForTimeout(2600); await p.waitForLoadState('load'); await p.waitForTimeout(900); };
const chatText = p => retry(() => p.evaluate(() => document.querySelector('#chatLog').innerText));
const say = async (p, m) => { await retry(() => p.fill('#chatIn', m)); await retry(() => p.press('#chatIn', 'Enter')); };

const A = await chromium.launch({ args: ARGS }), B = await chromium.launch({ args: ARGS }), C = await chromium.launch({ args: ARGS });

/* 1. guest_local : aucune connexion multijoueur */
const netC = { ws: [], http: [] };
{
  const c = await openPage(C, { net: netC });
  await walk(c.p); await click(c.p, '[data-setup="guest"]'); await c.p.waitForTimeout(1500); await enterWorld(c.p);
  const b = await badge(c.p);
  check(b.k === 'off' && /hors ligne/i.test(b.text) && b.kind === 'guest_local', '1a · guest_local : badge « Hors ligne » (' + b.text + ')');
  check(netC.ws.length === 0 && netC.http.length === 0, '1b · guest_local : AUCUNE connexion WebSocket ni requête vers le serveur multijoueur (ws ' + netC.ws.length + ', http ' + netC.http.length + ')');
  check(players() === 0, '1c · le serveur ne voit aucun joueur');
  check(c.errs.length === 0, '1d · aucune erreur de page ' + c.errs.join('|'));
  /* consentement absent : choisir « Monde ouvert » sans cocher la case ne connecte pas */
  await openMenu(c.p); await click(c.p, '[data-play="online"]'); await c.p.waitForTimeout(800);
  check(netC.ws.length === 0 && players() === 0, '1e · « Monde ouvert » sans consentement : toujours aucune connexion');
  await click(c.p, '[data-play="solo"]'); await c.p.waitForTimeout(300);
  await c.ctx.close();
}

/* 2. guest_online (navigateur A) et authenticated (navigateur B) dans le même village */
const a = await openPage(A), b = await openPage(B);
await walk(a.p); await click(a.p, '[data-setup="guest"]'); await a.p.waitForTimeout(1500); await enterWorld(a.p);
await openMenu(a.p); await goOnline(a.p);
check(await until(async () => (await badge(a.p)).k === 'guest'), '2a · A (invité) : badge « Invité en ligne » → ' + JSON.stringify(await badge(a.p)));
check(players() === 1 && verifyCalls === 0, '2b · le serveur voit 1 joueur ; aucune vérification de compte pour un invité (appels : ' + verifyCalls + ')');

await walk(b.p); await click(b.p, '[data-setup="register"]');
await b.p.fill('#accPseudo', 'Kofi_B'); await b.p.fill('#accEmail', 'kofi@exemple.org'); await b.p.fill('#accPw', 'motdepasse8'); await b.p.fill('#accPw2', 'motdepasse8'); await b.p.check('#accConsent');
await click(b.p, '[data-acc="register"]'); await reloaded(b.p); await enterWorld(b.p);
await openMenu(b.p); await goOnline(b.p);
check(await until(async () => (await badge(b.p)).k === 'acc'), '2c · B (compte) : badge « Compte · pseudo » → ' + JSON.stringify(await badge(b.p)));
check(verifyCalls >= 1 && players() === 2, '2d · le serveur a vérifié le jeton de B (appels ' + verifyCalls + ') ; 2 joueurs en ligne');
const sa = await onl(a.p), sb = await onl(b.p);
check(sa.room === sb.room, '2e · même village : ' + sa.room);
check(await until(async () => (await onl(a.p)).players.length === 1 && (await onl(b.p)).players.length === 1), '2f · présence réciproque');
const pa = (await onl(a.p)).players[0], pb = (await onl(b.p)).players[0];
check(pa.k === 'a' && pb.k === 'g', '2g · statut serveur affiché : A voit un compte (k=' + pa.k + '), B voit un invité (k=' + pb.k + ')');

/* 3. déplacements : A marche, le serveur et B le voient */
{
  const before = [...game.world.sessions.values()].find(s => s.kind === 'guest_online');
  const x0 = before.x, z0 = before.z;
  await a.p.mouse.click(500, 350); await a.p.keyboard.down('ArrowRight'); await a.p.keyboard.down('ArrowUp'); await a.p.waitForTimeout(1800); await a.p.keyboard.up('ArrowRight'); await a.p.keyboard.up('ArrowUp');
  const after = [...game.world.sessions.values()].find(s => s.kind === 'guest_online');
  check(Math.hypot(after.x - x0, after.z - z0) > 0.5, '3a · le déplacement de A arrive au serveur (' + x0.toFixed(1) + ',' + z0.toFixed(1) + ' → ' + after.x.toFixed(1) + ',' + after.z.toFixed(1) + ')');
  check(await until(async () => { const q = (await onl(b.p)).players[0]; return q && Math.hypot(q.x - after.x, q.z - after.z) < 1.5; }), '3b · B voit A à sa nouvelle position');
}

/* 4. chat compte ↔ invité */
await click(a.p, '#chatBtn'); await click(b.p, '#chatBtn'); await a.p.waitForTimeout(400);
await say(b.p, 'Bonjour depuis un compte');
check(await until(async () => (await chatText(a.p)).includes('Bonjour depuis un compte')), '4a · le message du compte arrive chez l’invité');
await sleep(3300); await say(a.p, 'Salut de la part d’un invité');
check(await until(async () => (await chatText(b.p)).includes('Salut de la part d’un invité')), '4b · le message de l’invité arrive chez le compte');
const listA = await retry(() => a.p.evaluate(() => document.querySelector('#chatPl').textContent)), listB = await retry(() => b.p.evaluate(() => document.querySelector('#chatPl').textContent));
check(!/\(invité\)/.test(listA) && /\(invité\)/.test(listB), '4c · la liste marque l’invité « (invité) » chez B, et le compte n’est pas marqué chez A · A voit [' + listA.replace(/\s+/g, ' ') + '] · B voit [' + listB.replace(/\s+/g, ' ') + ']');
await say(a.p, 'trop vite'); await a.p.waitForTimeout(500);
check(/doucement|secondes/i.test(await retry(() => a.p.evaluate(() => document.querySelector('#chatSt').innerText + document.querySelector('#chatLog').innerText))), '4d · limite de cadence (invité) signalée à l’utilisateur');

/* 5. coupure réseau : reconnexion automatique */
game.realtime.terminateAll();
console.log('INFO · badge de B pendant la coupure : ' + JSON.stringify(await badge(b.p)));
check(await until(async () => players() === 2 && (await badge(a.p)).k === 'guest' && (await badge(b.p)).k === 'acc', 15000), '5b · après la coupure, A et B se reconnectent seuls avec le même statut (joueurs : ' + players() + ')');
check(await until(async () => (await onl(a.p)).players.length === 1 && (await onl(b.p)).players.length === 1, 8000), '5c · présence rétablie des deux côtés');
await sleep(3300); await say(a.p, 'Message après reconnexion');
check(await until(async () => (await chatText(b.p)).includes('Message après reconnexion'), 8000), '5d · le chat fonctionne après reconnexion');

/* 6. guest_online → guest_local sans perdre la sauvegarde */
{
  const lsBefore = await retry(() => a.p.evaluate(() => localStorage.getItem('lca-v2')));
  await openMenu(a.p); await click(a.p, '[data-play="solo"]'); await a.p.waitForTimeout(300); await closeMenu(a.p);
  check(await until(async () => (await badge(a.p)).k === 'off' && players() === 1), '6a · A quitte le multijoueur : badge « Hors ligne », le serveur ne voit plus que B');
  const lsAfter = await retry(() => a.p.evaluate(() => localStorage.getItem('lca-v2')));
  check(!!lsBefore && !!lsAfter && JSON.parse(lsAfter).settings.mode === JSON.parse(lsBefore).settings.mode, '6b · la sauvegarde locale de l’invité est conservée');
  check(await until(async () => (await onl(b.p)).players.length === 0), '6c · B ne voit plus A');
  await openMenu(a.p); await goOnline(a.p);
  check(await until(async () => (await badge(a.p)).k === 'guest' && players() === 2), '6d · guest_local → guest_online : A revient en ligne avec la même sauvegarde');
}

/* 7. session de compte révoquée : arrêt net, pas de rétrogradation silencieuse en invité */
{
  refuse = true; game.realtime.terminateAll();
  check(await until(async () => players() <= 1 && (await badge(b.p)).k !== 'acc', 15000), '7a · jeton refusé : B n’est plus « Compte » (badge ' + JSON.stringify(await badge(b.p)) + ')');
  check(await until(async () => (await badge(b.p)).k === 'off', 8000), '7c · après l’échec, B est clairement « Hors ligne » (badge ' + JSON.stringify(await badge(b.p)) + ')');
  check(/session de compte/i.test(await retry(() => b.p.evaluate(() => document.querySelector('#toast') ? document.querySelector('#toast').innerText : document.body.innerText))), '7d · message explicite : reconnecte-toi pour rejouer avec ton compte');
  await sleep(1000);
  const guests = [...game.world.sessions.values()].filter(s => s.kind === 'authenticated').length;
  check(guests === 0 && players() <= 1, '7b · B n’est PAS reconnecté en douce comme invité (joueurs ' + players() + ')');
  refuse = false;
}

const ls = (p, k) => retry(() => p.evaluate(k => localStorage.getItem(k), k));
const guestSave = name => JSON.stringify({ v: 5, name, started: 1, lang: 'wolof', settings: { mode: '2d', setupDone: 1, uiLang: 'fr', play: 'online', onlineConsent: true }, d: {} });
/* Clique « Continuer » jusqu'à ce que l'écran d'accueil se ferme (le clic juste après un rechargement peut tomber avant que le bouton soit câblé). */
const enter = async p => { for (let i = 0; i < 6; i++) { await click(p, '[data-m="continue"]'); await p.waitForTimeout(700); if (await retry(() => p.evaluate(() => { const w = document.querySelector('#welcome'); return !w || w.hidden; }))) break; } await p.waitForTimeout(1800); };
const watchToasts = p => retry(() => p.evaluate(() => { window.__toasts = []; const el = document.querySelector('#toast'); new MutationObserver(() => { if (el.textContent) window.__toasts.push(el.textContent); }).observe(el, { childList: true, characterData: true, subtree: true, attributes: true }); }));
const toasts = p => retry(() => p.evaluate(() => (window.__toasts || []).join(' || ')));
const authSessions = () => [...game.world.sessions.values()].filter(s => s.kind === 'authenticated');
const toastText = p => retry(() => p.evaluate(() => document.querySelector('#toast').textContent));

/* 9. guest_online → authenticated : création de compte depuis le monde ouvert, sans perdre la progression locale */
const D = await chromium.launch({ args: ARGS });
{
  const callsBefore = verifyCalls, d = await openPage(D, { ls: { 'lca-v2': guestSave('Ama') } });
  await click(d.p, '[data-m="continue"]'); await d.p.waitForTimeout(2500);
  check(await until(async () => (await badge(d.p)).k === 'guest'), '9a · invité avec progression : en ligne comme invité (' + JSON.stringify(await badge(d.p)) + ')');
  const before = await ls(d.p, 'lca-v2'), nBefore = players();
  await openMenu(d.p); await click(d.p, '[data-m="account"]'); await d.p.waitForTimeout(300); await click(d.p, '[data-acc="tab:register"]'); await d.p.waitForTimeout(250);
  check((await retry(() => d.p.evaluate(() => document.querySelector('#accImport') && document.querySelector('#accImport').checked))) === true, '9b · le transfert de progression est proposé (coché par défaut)');
  await retry(() => d.p.fill('#accPseudo', 'Ama_Compte')); await retry(() => d.p.fill('#accEmail', 'ama@exemple.org')); await retry(() => d.p.fill('#accPw', 'motdepasse8')); await retry(() => d.p.fill('#accPw2', 'motdepasse8')); await retry(() => d.p.check('#accConsent'));
  await click(d.p, '[data-acc="register"]'); await reloaded(d.p);
  const idx = JSON.parse(await ls(d.p, 'lca-acc'));
  check(idx.current.kind === 'account', '9c · compte créé et actif');
  check(await ls(d.p, 'lca-v2') === before, '9d · la sauvegarde d’invité est INTACTE (identique octet pour octet)');
  const slot = JSON.parse(await ls(d.p, 'lca-u-' + idx.current.id));
  check(slot.name === 'Ama' && slot.settings.play === 'online' && slot.settings.onlineConsent === true, '9e · la progression est copiée dans le compte, avec le choix « monde ouvert » (' + slot.name + ')');
  await enter(d.p);
  check(await until(async () => (await badge(d.p)).k === 'acc'), '9f · l’invité devient « Compte » sans manipulation supplémentaire (' + JSON.stringify(await badge(d.p)) + ')');
  check(verifyCalls > callsBefore && [...game.world.sessions.values()].filter(s => s.kind === 'authenticated').length >= 1, '9g · le serveur a validé le jeton du nouveau compte');
  check(players() <= nBefore + 1 && [...game.world.sessions.values()].filter(s => s.kind === 'guest_online').length === 1, '9h · l’ancienne session invitée a disparu (pas de doublon) ; le seul invité restant est A');
  const amaId = fake.users['ama@exemple.org'].id, authSess = () => [...game.world.sessions.values()].filter(s => s.kind === 'authenticated');
  check(authSess().some(s => s.uid === amaId), '9j · l’identité vue par le serveur est exactement l’identifiant Supabase du compte créé');
  await d.p.reload(); await reloaded(d.p); await click(d.p, '[data-m="continue"]'); await d.p.waitForTimeout(2500);
  check(await until(async () => (await badge(d.p)).k === 'acc') && authSess().filter(s => s.uid === amaId).length === 1, '9k · reconnexion après la migration (rechargement) : toujours « Compte », UNE seule session pour cette identité (pas de doublon)');
  check(JSON.parse(await ls(d.p, 'lca-u-' + amaId)).name === 'Ama' && (await ls(d.p, 'lca-v2')) === before, '9l · progression du compte et sauvegarde d’invité toujours intactes après reconnexion');
  check(d.errs.length === 0, '9i · aucune erreur de page ' + d.errs.join('|'));
  await d.ctx.close();
}

/* 10. noms réservés : un invité ne peut pas porter le pseudo d'un compte */
{
  const e = await openPage(D, { ls: { 'lca-v2': guestSave('Reservee') } }), before = players();
  await watchToasts(e.p);
  await click(e.p, '[data-m="continue"]'); await e.p.waitForTimeout(1500);
  await until(async () => (await badge(e.p)).k === 'off' && /nom est celui d’un compte/i.test(await toasts(e.p)));
  const bd = await badge(e.p);
  check(bd.k === 'off' && players() === before, '10a · nom réservé : refusé, « Hors ligne », aucun joueur ajouté (' + JSON.stringify(bd) + ')');
  check(/nom est celui d’un compte/i.test(await toasts(e.p)), '10b · message clair : ' + (await toasts(e.p)).slice(0, 110));
  await openMenu(e.p); await click(e.p, '[data-m="account"]'); await e.p.waitForTimeout(300);
  await retry(() => e.p.fill('#accName', 'Libre')); await click(e.p, '[data-acc="name"]'); await e.p.waitForTimeout(500); await closeMenu(e.p);
  check(await until(async () => (await badge(e.p)).k === 'guest' && [...game.world.sessions.values()].some(s => s.name === 'Libre')), '10c · après avoir changé de nom, le joueur rejoint le monde (' + JSON.stringify(await badge(e.p)) + ')');
  check(e.errs.length === 0, '10d · aucune erreur de page ' + e.errs.join('|'));
  await e.ctx.close();
}

/* 11. guest_online → authenticated avec CONFLIT : le compte a déjà une progression sur cet appareil. Aucun écrasement silencieux, le joueur reste invité tant qu'il n'a pas choisi */
{
  const owner = Object.values(fake.users).find(u => u.email === 'ama@exemple.org');
  check(!!owner, '11a · (préparation) le compte d’Ama existe côté faux Supabase');
  const ownerSave = guestSave('Ama_du_compte');
  const k = await openPage(D, { ls: { 'lca-v2': guestSave('Ama2'), ['lca-u-' + owner.id]: ownerSave } });
  await click(k.p, '[data-m="continue"]'); await k.p.waitForTimeout(2500);
  check(await until(async () => (await badge(k.p)).k === 'guest'), '11b · invité en ligne avec sa progression locale (Ama2)');
  const guestBefore = await ls(k.p, 'lca-v2');
  await openMenu(k.p); await click(k.p, '[data-m="account"]'); await k.p.waitForTimeout(300);
  await retry(() => k.p.fill('#accEmail', 'ama@exemple.org')); await retry(() => k.p.fill('#accPw', 'motdepasse8'));
  await click(k.p, '[data-acc="login"]'); await k.p.waitForTimeout(1500);
  check(/Une progression existe déjà/.test(await retry(() => k.p.evaluate(() => document.body.innerText))), '11c · conflit annoncé explicitement (aucun écrasement silencieux)');
  const idx = JSON.parse(await ls(k.p, 'lca-acc'));
  check((await badge(k.p)).k !== 'acc' && (await ls(k.p, 'lca-u-' + owner.id)) === ownerSave && (await ls(k.p, 'lca-v2')) === guestBefore, '11d · en attente du choix : rien n’a bougé (sauvegardes inchangées, pas encore « Compte »)');
  await click(k.p, '[data-acc="conf:keep"]'); await reloaded(k.p);
  check((await ls(k.p, 'lca-u-' + owner.id)) === ownerSave && (await ls(k.p, 'lca-v2')) === guestBefore, '11e · « garder » : progression du compte ET sauvegarde d’invité intactes');
  await enter(k.p);
  check(await until(async () => (await badge(k.p)).k === 'acc'), '11f · après le choix, le joueur est en ligne avec son compte (' + JSON.stringify(await badge(k.p)) + ')');
  check(k.errs.length === 0, '11g · aucune erreur de page ' + k.errs.join('|'));
  await k.ctx.close();
}

/* 12. guest_online → authenticated qui ÉCHOUE (pseudo refusé par la base) : le joueur reste invité en ligne, sans perte ni session fantôme */
{
  const f = await openPage(D, { ls: { 'lca-v2': guestSave('Ama3') } });
  await click(f.p, '[data-m="continue"]'); await f.p.waitForTimeout(2500);
  check(await until(async () => (await badge(f.p)).k === 'guest'), '12a · invité en ligne');
  const guestBefore = await ls(f.p, 'lca-v2'), authIds = () => authSessions().map(s => s.uid).sort().join(',');
  await f.p.waitForTimeout(500); const authBefore = authIds();
  await openMenu(f.p); await click(f.p, '[data-m="account"]'); await f.p.waitForTimeout(300); await click(f.p, '[data-acc="tab:register"]'); await f.p.waitForTimeout(250);
  await retry(() => f.p.fill('#accPseudo', 'Pris')); await retry(() => f.p.fill('#accEmail', 'pris@exemple.org')); await retry(() => f.p.fill('#accPw', 'motdepasse8')); await retry(() => f.p.fill('#accPw2', 'motdepasse8')); await retry(() => f.p.check('#accConsent'));
  await click(f.p, '[data-acc="register"]'); await f.p.waitForTimeout(1800);
  const msg = await retry(() => f.p.evaluate(() => (document.querySelector('#accMsg') || {}).textContent || ''));
  check(msg.length > 5, '12b · message d’erreur lisible affiché : « ' + msg.slice(0, 90) + ' »');
  check((await ls(f.p, 'lca-v2')) === guestBefore && !(await retry(() => f.p.evaluate(() => Object.keys(localStorage).some(k => k.startsWith('lca-u-'))))), '12c · progression d’invité intacte, aucun emplacement de compte créé');
  await closeMenu(f.p); await until(async () => (await badge(f.p)).k === 'guest'); await f.p.waitForTimeout(500);/* le menu ferme le monde ouvert tant qu'il est ouvert ; on revient au jeu */
  check((await badge(f.p)).k === 'guest' && authIds() === authBefore && !fake.users['pris@exemple.org'] && [...game.world.sessions.values()].filter(s => s.name === 'Ama3' && s.kind === 'guest_online').length === 1, '12d · toujours « Invité en ligne » (sa session invitée « Ama3 », une seule) : aucune nouvelle identité authentifiée côté serveur');
  check(f.errs.length === 0, '12e · aucune erreur de page ' + f.errs.join('|'));
  await f.ctx.close();
}

/* 13. ÉCHEC RÉSEAU pendant la migration, puis réessai : aucune perte, puis identité correcte */
{
  const n = await openPage(D, { ls: { 'lca-v2': guestSave('Ama4') } });
  await click(n.p, '[data-m="continue"]'); await n.p.waitForTimeout(2500);
  check(await until(async () => (await badge(n.p)).k === 'guest'), '13a · invité en ligne avec progression');
  const before = await ls(n.p, 'lca-v2'), authIds = () => authSessions().map(s => s.uid).sort().join(',');
  await n.p.waitForTimeout(500); const authBefore = authIds();
  await n.p.route('**/auth/v1/signup', r => r.abort('failed'));/* coupure réseau : la requête n'aboutit pas */
  const fill = async (p, pseudo, email) => { await openMenu(p); await click(p, '[data-m="account"]'); await p.waitForTimeout(300); await click(p, '[data-acc="tab:register"]'); await p.waitForTimeout(250);
    await retry(() => p.fill('#accPseudo', pseudo)); await retry(() => p.fill('#accEmail', email)); await retry(() => p.fill('#accPw', 'motdepasse8')); await retry(() => p.fill('#accPw2', 'motdepasse8')); await retry(() => p.check('#accConsent')); };
  await fill(n.p, 'Ama_Reseau', 'ama4@exemple.org'); await click(n.p, '[data-acc="register"]'); await n.p.waitForTimeout(2000);
  const msg = await retry(() => n.p.evaluate(() => (document.querySelector('#accMsg') || {}).textContent || ''));
  check(/réseau|connexion/i.test(msg), '13b · échec réseau annoncé clairement : « ' + msg.slice(0, 90) + ' »');
  check((await ls(n.p, 'lca-v2')) === before && !(await retry(() => n.p.evaluate(() => Object.keys(localStorage).some(k => k.startsWith('lca-u-'))))) && !fake.users['ama4@exemple.org'], '13c · aucune perte : sauvegarde intacte, aucun emplacement de compte, aucun compte créé');
  await closeMenu(n.p); await until(async () => (await badge(n.p)).k === 'guest'); await n.p.waitForTimeout(500);
  check((await badge(n.p)).k === 'guest' && authIds() === authBefore && [...game.world.sessions.values()].filter(s => s.name === 'Ama4' && s.kind === 'guest_online').length === 1, '13d · toujours invité en ligne, aucune session authentifiée fictive');
  await n.p.unroute('**/auth/v1/signup');/* le réseau revient : on réessaie le même formulaire */
  await fill(n.p, 'Ama_Reseau', 'ama4@exemple.org'); await click(n.p, '[data-acc="register"]'); await reloaded(n.p);
  const user = fake.users['ama4@exemple.org'], idx = JSON.parse(await ls(n.p, 'lca-acc'));
  check(!!user && idx.current.kind === 'account' && idx.current.id === user.id, '13e · réessai : compte créé, identité locale = identifiant Supabase');
  check(JSON.parse(await ls(n.p, 'lca-u-' + user.id)).name === 'Ama4' && (await ls(n.p, 'lca-v2')) === before, '13f · progression transférée une seule fois, sauvegarde d’invité intacte');
  await enter(n.p);
  check(await until(async () => (await badge(n.p)).k === 'acc' && [...game.world.sessions.values()].some(s => s.uid === user.id)), '13g · le serveur voit la bonne identité authentifiée après le réessai');
  check(n.errs.length === 0, '13h · aucune erreur de page ' + n.errs.join('|'));
  await n.ctx.close();
}

/* 14. migration INTERROMPUE (le compte est créé côté Supabase mais la réponse n'arrive jamais), puis relancée : ni doublon ni corruption */
{
  const q = await openPage(D, { ls: { 'lca-v2': guestSave('Ama5') } });
  await click(q.p, '[data-m="continue"]'); await q.p.waitForTimeout(2500);
  const before = await ls(q.p, 'lca-v2');
  await q.p.unroute('**/*.supabase.co/**');
  await q.p.route('**/*.supabase.co/**', async route => {
    if (!route.request().url().includes('/auth/v1/signup')) return fake.handler(route);
    const swallow = Object.create(route); swallow.fulfill = async () => { };/* le serveur crée le compte… */
    await fake.handler(swallow); await route.abort('failed');/* …mais le navigateur ne reçoit jamais la réponse (onglet coupé, réseau perdu) */
  });
  await openMenu(q.p); await click(q.p, '[data-m="account"]'); await q.p.waitForTimeout(300); await click(q.p, '[data-acc="tab:register"]'); await q.p.waitForTimeout(250);
  await retry(() => q.p.fill('#accPseudo', 'Ama_Coupee')); await retry(() => q.p.fill('#accEmail', 'ama5@exemple.org')); await retry(() => q.p.fill('#accPw', 'motdepasse8')); await retry(() => q.p.fill('#accPw2', 'motdepasse8')); await retry(() => q.p.check('#accConsent'));
  await click(q.p, '[data-acc="register"]'); await q.p.waitForTimeout(2000);
  check(!!fake.users['ama5@exemple.org'] && (await ls(q.p, 'lca-v2')) === before && !(await retry(() => q.p.evaluate(() => Object.keys(localStorage).some(k => k.startsWith('lca-u-'))))), '14a · interruption : le compte existe côté Supabase, mais RIEN n’a été écrit localement et la progression d’invité est intacte');
  await q.p.reload(); await q.p.waitForLoadState('load'); await q.p.waitForTimeout(1500);/* l'application est relancée */
  await q.p.unroute('**/*.supabase.co/**'); await q.p.route('**/*.supabase.co/**', fake.handler);
  await openMenu(q.p); await click(q.p, '[data-m="account"]'); await q.p.waitForTimeout(300); await click(q.p, '[data-acc="tab:register"]'); await q.p.waitForTimeout(250);
  await retry(() => q.p.fill('#accPseudo', 'Ama_Coupee')); await retry(() => q.p.fill('#accEmail', 'ama5@exemple.org')); await retry(() => q.p.fill('#accPw', 'motdepasse8')); await retry(() => q.p.fill('#accPw2', 'motdepasse8')); await retry(() => q.p.check('#accConsent'));
  await click(q.p, '[data-acc="register"]'); await q.p.waitForTimeout(1500);
  check(/déjà|connecte/i.test(await retry(() => q.p.evaluate(() => (document.querySelector('#accMsg') || {}).textContent || ''))) && Object.keys(fake.users).filter(e => e === 'ama5@exemple.org').length === 1, '14b · relance de l’inscription : « adresse déjà utilisée », aucun second compte créé');
  await click(q.p, '[data-acc="tab:login"]'); await q.p.waitForTimeout(250);
  await retry(() => q.p.fill('#accEmail', 'ama5@exemple.org')); await retry(() => q.p.fill('#accPw', 'motdepasse8'));
  check((await retry(() => q.p.evaluate(() => document.querySelector('#accImport') && document.querySelector('#accImport').checked))) === true, '14c · le transfert reste proposé à la reprise');
  await click(q.p, '[data-acc="login"]'); await reloaded(q.p);
  const user = fake.users['ama5@exemple.org'], idx = JSON.parse(await ls(q.p, 'lca-acc'));
  const keys = await retry(() => q.p.evaluate(() => Object.keys(localStorage)));
  check(idx.current.id === user.id && keys.filter(k => k.startsWith('lca-u-') && !k.endsWith('.pre-import')).length === 1 && !keys.some(k => k.endsWith('.pre-import')), '14d · reprise : un seul emplacement de compte, aucune sauvegarde parasite, identité correcte');
  check((await ls(q.p, 'lca-u-' + user.id)) === before && (await ls(q.p, 'lca-v2')) === before, '14e · progression transférée octet pour octet (aucune corruption) ; sauvegarde d’invité intacte');
  await click(q.p, '[data-m="continue"]'); await q.p.waitForTimeout(2500);
  check(await until(async () => (await badge(q.p)).k === 'acc' && [...game.world.sessions.values()].filter(s => s.uid === user.id).length === 1), '14f · en ligne avec la bonne identité, une seule session');
  check(q.errs.length === 0, '14g · aucune erreur de page ' + q.errs.join('|'));
  await q.ctx.close();
}

/* 8. déconnexion propre */
await a.ctx.close(); await sleep(800);
check(players() === 0, '8a · fermeture du navigateur de A : place libérée (joueurs ' + players() + ')');
check(a.errs.length === 0 && b.errs.length === 0, '8b · aucune erreur de page ' + a.errs.concat(b.errs).join('|'));

await A.close(); await B.close(); await C.close(); await D.close(); await new Promise(r => game.close(r)); web.close();
console.log(process.exitCode ? '\nDES SCÉNARIOS ÉCHOUENT.' : '\nTous les scénarios passent.');
process.exit(process.exitCode || 0);
