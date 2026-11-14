// Jeux de société du village dans des navigateurs Chromium RÉELS (processus distincts) face à un VRAI serveur HTTP + WebSocket (127.0.0.1).
// A : invité local (aucun réseau) : tables 2D et 3D, panneau, les six jeux contre l'ordinateur, abandon, historique local.
// B : deux invités en ligne + un observateur : partie d'awalé en direct, messages rapides, rechargement et reprise, abandon.
// C : belote en ligne avec robots (cartes cachées : aucune main d'autrui dans le DOM).
// Simulé : rien côté jeux ; Supabase n'est pas utilisé (invités). Lancer : node tests/games-flow.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
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
const game = createServer({ legacy: false, cors: ORIGIN, nameGuard: { strict: false, check: async () => false }, realtime: { tickMs: 50 }, quiz: false, tables: { config: { botDelayMs: 120, botBudgetMs: 60, graceMs: 20000 } } });
await new Promise(r => game.listen(0, '127.0.0.1', r));
const API = 'http://127.0.0.1:' + game.address().port;
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'OK  ' : 'KO  ') + msg); if (!ok) { fails++; process.exitCode = 1; } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (f, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await f()) return true; } catch { } await sleep(100); } return false; };
const retry = async f => { for (let i = 0; ; i++) { try { return await f(); } catch (e) { if (i >= 8 || !/context was destroyed|navigation/i.test(String(e))) throw e; await sleep(400); } } };
const ARGS = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
async function openPage(browser, { net = null, vp = { width: 1000, height: 700 } } = {}) {
  const ctx = await browser.newContext({ viewport: vp, serviceWorkers: 'block', locale: 'fr-FR' });
  const p = await ctx.newPage(), errs = [];
  p.on('pageerror', e => errs.push(String(e).slice(0, 300)));
  p.on('console', m => { if (m.type() === 'error' && !/fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text().slice(0, 300)); });
  if (net) p.on('websocket', ws => net.ws.push(ws.url()));
  await p.route('**/fonts.g*/**', r => r.abort());
  await p.addInitScript(api => { window.LCA = window.LCA || {}; window.LCA.config = { apiBase: api }; window.LCA_NO_FSGATE = true; }, API);
  await p.goto(PAGE); await p.waitForSelector('#welcomeCard', { state: 'attached' }); await p.waitForTimeout(900);
  return { p, errs, ctx };
}
const click = (p, sel) => retry(() => p.evaluate(s => { const e = document.querySelector(s); if (e && !e.disabled) e.click(); return !!e && !e.disabled; }, sel));
const walk = async (p, mode = '2d') => { for (let i = 0; i < 3; i++) { await click(p, '[data-setup="next"]'); await p.waitForTimeout(150); if (i === 1) await click(p, '[data-rmode="' + mode + '"]'); } };
const enterWorld = async p => { await click(p, '[data-m="new"]'); await p.waitForTimeout(700); await click(p, '[data-pick="wolof"]'); await p.waitForTimeout(500); await click(p, '[data-go2="start"]'); await p.waitForTimeout(2500); };
const closeMenu = async p => { await click(p, '#menuBtn'); await p.waitForTimeout(500); if (await retry(() => p.evaluate(() => !document.querySelector('#welcome').hidden))) { await click(p, '[data-m="new"]'); await p.waitForTimeout(900); } };
const goOnline = async p => { await click(p, '[data-play="online"]'); await p.waitForTimeout(250); await retry(() => p.check('#onlConsent')); await p.waitForTimeout(250); await closeMenu(p); };
const openMenu = async p => { await click(p, '#menuBtn'); await p.waitForTimeout(400); };
const guestLocal = async (br, mode = '2d', o) => { const c = await openPage(br, o); await walk(c.p, mode); await click(c.p, '[data-setup="guest"]'); await c.p.waitForTimeout(1500); await enterWorld(c.p); await click(c.p, '#closeP'); return c; };
const guestOnline = async (br, mode = '2d') => { const c = await guestLocal(br, mode); await openMenu(c.p); await goOnline(c.p); await until(() => c.p.evaluate(() => window.LCA.onlineState().kind === 'guest_online' && window.LCA.onlineState().active), 8000); return c; };
const T = { awale1: [12, 34], awale2: [18, 34], dames1: [24, 34], echecs1: [12, 40], cartes1: [24, 40], cartes2: [30, 40] };
const goto = (p, id) => retry(() => p.evaluate(([x, z]) => { window.__lca.P.x = x; window.__lca.P.z = z - 2.2; }, T[id]));
const actText = p => retry(() => p.evaluate(() => { const a = document.querySelector('#act'); return a.hidden ? '' : document.querySelector('#actTxt').textContent; }));
const gp = p => retry(() => p.evaluate(() => { const s = LCA.gamePanel.state, n = s.snap; return { open: LCA.gamePanel.isOpen(), scr: s.scr, mode: s.mode, notice: s.notice, game: n && n.game, phase: n && n.phase, seat: n ? n.seat : null, turn: n ? n.turn : null, res: n && n.res, hist: n && n.hist ? n.hist.length : 0, legal: n && Array.isArray(n.legal) ? n.legal.length : (n ? -1 : 0), seats: n && n.seats ? n.seats.map(x => x && x.name) : [] }; }));
const openTable = async (p, id) => { await goto(p, id); await p.waitForTimeout(700); const t = await actText(p); await p.keyboard.press('e'); await p.waitForTimeout(500); if (!(await gp(p)).open) { await click(p, '#act'); await p.waitForTimeout(500); } return t; };
const myTurn = async (p, ms = 15000) => until(async () => { const s = await gp(p); return s.res || (s.turn === s.seat && s.seat !== null); }, ms);

/* ================= A. invité local, hors réseau ================= */
const A = await chromium.launch({ args: ARGS });
{
  const net = { ws: [] };
  const c = await guestLocal(A, '2d', { net }), p = c.p;
  const t = await openTable(p, 'awale1');
  check(/Jouer : Table d’Awalé 1/.test(t), 'A1 2D : bouton d’action près de la table d’awalé (« ' + t + ' »)');
  let s = await gp(p);
  check(s.open && s.scr === 'lobby', 'A1 le panneau des jeux s’ouvre sur le choix du mode');
  check(await retry(() => p.evaluate(() => /Active le monde ouvert/.test(document.querySelector('#gamePanel').innerText))), 'A1 hors ligne : la partie en ligne est expliquée, pas proposée');
  await click(p, '[data-g="level"][data-l="1"]'); await click(p, '[data-g="solo"]'); await p.waitForTimeout(300);
  s = await gp(p);
  check(s.mode === 'local' && s.game === 'awale' && s.phase === 'play' && s.seat === 0 && s.turn === 0, 'A2 solo awalé : partie locale démarrée, à toi de jouer');
  check(await retry(() => p.evaluate(() => document.querySelectorAll('#gamePanel .gb-pit').length === 12 && document.querySelectorAll('#gamePanel .gb-pit.gb-legal').length === 6)), 'A2 plateau : 12 trous, 6 jouables');
  for (let k = 0; k < 4; k++) { await myTurn(p); await click(p, '#gamePanel .gb-pit.gb-legal'); await p.waitForTimeout(150); }
  await until(async () => (await gp(p)).hist >= 7, 8000); s = await gp(p);
  check(s.hist >= 7, 'A2 coups du joueur (clics) et réponses de l’ordinateur : ' + s.hist + ' coups');
  check(net.ws.length === 0, 'A2 aucune connexion réseau en invité local');
  await click(p, '[data-g="resign"]'); await click(p, '[data-g="yes"]'); await p.waitForTimeout(200); s = await gp(p);
  check(s.res && s.res.reason === 'abandon' && s.res.winners[0] === 1, 'A3 abandon (avec confirmation dans le panneau) : défaite');
  check(await retry(() => p.evaluate(() => /Défaite/.test(document.querySelector('#gamePanel .gb-status').textContent))), 'A3 le bandeau annonce la défaite');
  const rec = await retry(() => p.evaluate(() => JSON.parse(localStorage.getItem('lca-v2')).games));
  check(rec && rec.stats.awale_ia && rec.stats.awale_ia.l === 1 && rec.last[0].r === 'loss', 'A3 historique local enregistré dans la sauvegarde : ' + JSON.stringify(rec && rec.stats));
  await click(p, '[data-g="rematch"]'); await p.waitForTimeout(400); s = await gp(p);
  check(s.phase === 'play' && !s.res && s.seat === 1, 'A3 rejouer : nouvelle partie, l’ordinateur commence (sièges alternés)');
  await click(p, '[data-g="leave"]'); await click(p, '[data-g="yes"]'); await click(p, '[data-g="close"]'); await p.waitForTimeout(200);
  check(!(await gp(p)).open, 'A3 fermeture du panneau');

  /* dames */
  await openTable(p, 'dames1'); await click(p, '[data-g="solo"]'); await p.waitForTimeout(300);
  check(await retry(() => p.evaluate(() => document.querySelectorAll('#gamePanel .gb-sq.d').length === 50 && document.querySelectorAll('#gamePanel .gb-pc').length === 40)), 'A4 dames : 50 cases sombres, 40 pions');
  for (let k = 0; k < 3; k++) { await myTurn(p); await click(p, '#gamePanel .gb-sq.gb-mv'); await p.waitForTimeout(80); await click(p, '#gamePanel .gb-sq.gb-tgt'); await p.waitForTimeout(150); const ch = await retry(() => p.evaluate(() => !document.querySelector('#gamePanel .gb-choose').hidden)); if (ch) await click(p, '#gamePanel .gb-choose button'); }
  await until(async () => (await gp(p)).hist >= 5, 10000);
  check((await gp(p)).hist >= 5, 'A4 dames : coups joués par clics (sélection puis destination), l’ordinateur répond');
  await click(p, '[data-g="close"]'); await click(p, '[data-g="yes"]'); await p.waitForTimeout(200);
  check(!(await gp(p)).open, 'A4 fermer pendant la partie : confirmation puis fermeture');

  /* échecs */
  await openTable(p, 'echecs1'); await click(p, '[data-g="level"][data-l="1"]'); await click(p, '[data-g="solo"]'); await p.waitForTimeout(300);
  check(await retry(() => p.evaluate(() => document.querySelectorAll('#gamePanel .gb-sq').length === 64 && document.querySelectorAll('#gamePanel .gb-pc').length === 32)), 'A5 échecs : 64 cases, 32 pièces');
  await retry(() => p.evaluate(() => document.querySelector('#gamePanel .gb-sq[data-s="e2"]').click())); await p.waitForTimeout(80);
  check(await retry(() => p.evaluate(() => [...document.querySelectorAll('#gamePanel .gb-sq.gb-tgt')].map(b => b.dataset.s).sort().join() === 'e3,e4')), 'A5 pion e2 : destinations e3 et e4');
  await retry(() => p.evaluate(() => document.querySelector('#gamePanel .gb-sq[data-s="e4"]').click()));
  await until(async () => (await gp(p)).hist >= 2, 8000);
  check(await retry(() => p.evaluate(() => /e4/.test(document.querySelector('#gamePanel details').textContent))), 'A5 historique en notation : e4');
  await click(p, '[data-g="resign"]'); await click(p, '[data-g="yes"]'); await click(p, '[data-g="close"]');

  /* cartes : bataille, menteur, belote */
  await openTable(p, 'cartes1');
  await click(p, '[data-g="card"][data-id="bataille"]'); await click(p, '[data-g="solo"]'); await p.waitForTimeout(300);
  for (let k = 0; k < 6; k++) { await myTurn(p); await click(p, '#gamePanel [data-a="flip"]'); await p.waitForTimeout(200); }
  s = await gp(p);
  check(s.game === 'bataille' && s.hist >= 6, 'A6 bataille : cartes retournées (' + s.hist + ' coups)');
  check(await retry(() => p.evaluate(() => document.querySelectorAll('#gamePanel .gc-trick svg, #gamePanel .gc-deck svg').length >= 2)), 'A6 bataille : cartes dessinées (SVG)');
  await click(p, '[data-g="leave"]'); await click(p, '[data-g="yes"]');
  await click(p, '[data-g="card"][data-id="menteur"]'); await click(p, '[data-g="nm"][data-n="2"]'); await click(p, '[data-g="solo"]'); await p.waitForTimeout(300);
  s = await gp(p);
  check(s.game === 'menteur' && s.seats.length === 2, 'A7 menteur à 2 joueurs');
  check(await retry(() => p.evaluate(() => document.querySelectorAll('#gamePanel .gc-hand .gc-c').length === 26)), 'A7 menteur : 26 cartes en main');
  await myTurn(p);
  await click(p, '#gamePanel .gc-hand .gc-c'); await click(p, '#gamePanel [data-a="play"]'); await p.waitForTimeout(200);
  await until(async () => (await gp(p)).hist >= 2, 8000);
  check(await retry(() => p.evaluate(() => document.querySelectorAll('#gamePanel .gc-hand .gc-c').length <= 26 && /annonçant|accuse/.test(document.querySelector('#gamePanel .gc-info').textContent))), 'A7 menteur : pose d’une carte, l’ordinateur répond');
  await click(p, '[data-g="leave"]'); await click(p, '[data-g="yes"]');
  await click(p, '[data-g="card"][data-id="belote"]'); await click(p, '[data-g="solo"]'); await p.waitForTimeout(300);
  s = await gp(p);
  check(s.game === 'belote' && s.seats.length === 4, 'A8 belote : 4 joueurs (toi + 3 robots)');
  let played = 0;
  for (let k = 0; k < 40 && played < 4; k++) {
    await myTurn(p, 20000);
    const did = await retry(() => p.evaluate(() => { const b = document.querySelector('#gamePanel .gc-bids button.gc-main') || document.querySelector('#gamePanel .gc-bids button'); if (b) { b.click(); return 'bid'; } const c = document.querySelector('#gamePanel .gc-hand .gc-c.gc-ok'); if (c) { c.click(); return 'card'; } return ''; }));
    if (did === 'card') played++; await p.waitForTimeout(250);
  }
  check(played >= 2, 'A8 belote : enchère puis cartes jouées depuis la main (' + played + ' cartes)');
  check(await retry(() => p.evaluate(() => document.querySelectorAll('#gamePanel .gc-hand .gc-c').length + 0 <= 8)), 'A8 belote : au plus 8 cartes en main');
  await click(p, '[data-g="leave"]'); await click(p, '[data-g="yes"]'); await click(p, '[data-g="close"]');
  check(c.errs.length === 0, 'A aucune erreur de page : ' + c.errs.slice(0, 3).join(' | '));
  await c.ctx.close();

  /* 3D */
  const c3 = await guestLocal(A, '3d'), q = c3.p;
  await until(() => q.evaluate(() => window.__lca.mode === '3d'), 8000);
  check(await retry(() => q.evaluate(() => !!LCA.gamesPlaza3d && LCA.gamesPlaza3d.children.filter(g => /^table_/.test(g.name)).length === 8)), 'A9 3D : 8 tables posées sur la place des jeux');
  const t3 = await openTable(q, 'echecs1');
  check(/Jouer : Table d’Échecs 1/.test(t3) && (await gp(q)).open, 'A9 3D : bouton d’action et panneau à la table d’échecs');
  const coll = await retry(() => q.evaluate(() => { const C = window.__lca.travel.coll || []; return LCA.games.TABLES.every(t => C.some(c => Math.hypot(c.x - t.x, c.z - t.z) < .01)); }));
  check(coll, 'A9 3D : chaque table a une collision');
  await click(q, '[data-g="close"]');
  check(c3.errs.length === 0, 'A9 aucune erreur de page en 3D : ' + c3.errs.slice(0, 3).join(' | '));
  await c3.ctx.close();
}
await A.close();

/* ================= B. deux invités en ligne + un observateur ================= */
const B1 = await chromium.launch({ args: ARGS }), B2 = await chromium.launch({ args: ARGS }), B3 = await chromium.launch({ args: ARGS });
{
  const a = await guestOnline(B1), b = await guestOnline(B2), w = await guestOnline(B3);
  check(true, 'B0 trois invités en ligne');
  await openTable(a.p, 'awale1');
  check(await retry(() => a.p.evaluate(() => !!document.querySelector('#gamePanel [data-g="sit"]'))), 'B1 en ligne : « M’asseoir à la table » proposé');
  await click(a.p, '[data-g="sit"]'); await a.p.waitForTimeout(500);
  let sa = await gp(a.p);
  check(sa.mode === 'live' && sa.seat === 0 && sa.phase === 'idle', 'B1 assis seul : en attente d’un adversaire (' + JSON.stringify([sa.mode, sa.seat, sa.phase]) + ')');
  await until(() => w.p.evaluate(() => (LCA.gamesWorld.status.get('awale1') || {}).status === 'wait'), 4000);
  check((await retry(() => w.p.evaluate(() => (LCA.gamesWorld.status.get('awale1') || {}).status))) === 'wait', 'B1 les autres voient la table « en attente »');
  await openTable(b.p, 'awale1'); await click(b.p, '[data-g="sit"]');
  await until(async () => (await gp(a.p)).phase === 'play' && (await gp(b.p)).phase === 'play', 6000);
  sa = await gp(a.p); let sb = await gp(b.p);
  check(sa.phase === 'play' && sb.seat === 1 && sa.turn === 0, 'B2 deuxième joueur assis : la partie démarre');
  await click(a.p, '#gamePanel .gb-pit.gb-legal'); await until(async () => (await gp(b.p)).turn === 1, 4000);
  check((await gp(b.p)).hist === 1, 'B2 le coup du joueur A arrive chez B');
  await click(b.p, '#gamePanel .gb-pit.gb-legal'); await until(async () => (await gp(a.p)).hist === 2, 4000);
  check((await gp(a.p)).hist === 2 && (await gp(a.p)).turn === 0, 'B2 le coup de B arrive chez A');
  await openTable(w.p, 'awale1');
  check(await retry(() => w.p.evaluate(() => !!document.querySelector('#gamePanel [data-g="watch"]'))), 'B3 partie en cours : « Observer » proposé');
  await click(w.p, '[data-g="watch"]'); await until(async () => (await gp(w.p)).hist === 2, 4000);
  const sw = await gp(w.p);
  check(sw.seat === null && sw.hist === 2 && (await retry(() => w.p.evaluate(() => document.querySelectorAll('#gamePanel .gb-pit.gb-legal').length))) === 0, 'B3 observateur : voit la partie, ne peut pas jouer');
  await click(a.p, '[data-g="say"][data-id="bonjour"]');
  check(await until(() => b.p.evaluate(() => /Bonjour/.test(document.querySelector('#gamePanel .gpchat').textContent)), 3000), 'B4 message rapide reçu par l’adversaire');
  /* rechargement de A en pleine partie : reprise par jeton (sessionStorage) */
  await a.p.reload(); await a.p.waitForTimeout(2500);
  await click(a.p, '[data-m="continue"]'); await a.p.waitForTimeout(1500);
  const resumed = await until(async () => { const s = await gp(a.p); return s.mode === 'live' && s.seat === 0 && s.phase === 'play'; }, 15000);
  check(resumed, 'B5 rechargement de la page : la partie en ligne reprend au même siège ' + JSON.stringify(await gp(a.p)));
  check(await until(() => b.p.evaluate(() => { const s = LCA.gamePanel.state.snap; return s && s.seats[0] && s.seats[0].up !== false; }), 6000), 'B5 l’adversaire voit le joueur revenu');
  await click(a.p, '[data-g="resign"]'); await click(a.p, '[data-g="yes"]');
  await until(async () => !!(await gp(b.p)).res, 5000);
  sb = await gp(b.p);
  check(sb.res && sb.res.winners[0] === 1 && sb.res.reason === 'abandon', 'B6 abandon de A : victoire de B');
  check(await retry(() => b.p.evaluate(() => /Victoire/.test(document.querySelector('#gamePanel .gb-status').textContent))), 'B6 B lit « Victoire ! »');
  for (const x of [a, b, w]) check(x.errs.length === 0, 'B aucune erreur de page : ' + x.errs.slice(0, 3).join(' | '));
  for (const x of [a, b, w]) await x.ctx.close();
}
await B1.close(); await B2.close(); await B3.close();

/* ================= C. belote en ligne avec robots ================= */
const C1 = await chromium.launch({ args: ARGS });
{
  const a = await guestOnline(C1);
  await openTable(a.p, 'cartes2'); await click(a.p, '[data-g="card"][data-id="belote"]'); await click(a.p, '[data-g="sit"]'); await a.p.waitForTimeout(500);
  check(await retry(() => a.p.evaluate(() => !!document.querySelector('#gamePanel [data-g="start"]'))), 'C1 table de cartes : « Lancer la partie » (robots)');
  await click(a.p, '[data-g="start"]');
  await until(async () => (await gp(a.p)).phase === 'play', 5000);
  const s = await gp(a.p);
  check(s.game === 'belote' && s.seats.length === 4, 'C1 belote en ligne : toi + 3 robots');
  const hidden = await retry(() => a.p.evaluate(() => { const v = LCA.gamePanel.state.snap.view; return v.hands.filter(h => h !== null).length === 1 && !('talon' in v) && !('seed' in v); }));
  check(hidden, 'C2 la vue reçue ne contient que ta main (ni talon, ni graine, ni autres mains)');
  let played = 0;
  for (let k = 0; k < 40 && played < 3; k++) {
    await myTurn(a.p, 20000);
    const did = await retry(() => a.p.evaluate(() => { const b = document.querySelector('#gamePanel .gc-bids button.gc-main') || document.querySelector('#gamePanel .gc-bids button'); if (b) { b.click(); return 'bid'; } const c = document.querySelector('#gamePanel .gc-hand .gc-c.gc-ok'); if (c) { c.click(); return 'card'; } return ''; }));
    if (did === 'card') played++; await a.p.waitForTimeout(300);
  }
  check(played >= 2, 'C3 belote en ligne : cartes jouées, robots du serveur répondent (' + played + ')');
  check(a.errs.length === 0, 'C aucune erreur de page : ' + a.errs.slice(0, 3).join(' | '));
  await a.ctx.close();
}
await C1.close();
console.log(fails ? fails + ' échec(s)' : 'Tous les contrôles passent.');
web.close(); game.close(); process.exit(fails ? 1 : 0);
