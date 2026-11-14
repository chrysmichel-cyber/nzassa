// Phase 4 (social) dans des navigateurs Chromium RÉELS face à un VRAI serveur HTTP + WebSocket : chat de proximité, gestes, danse collective, déconnexion pendant un geste.
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

const B1 = await chromium.launch({ args: ARGS }), B2 = await chromium.launch({ args: ARGS }), B3 = await chromium.launch({ args: ARGS });
const pos = (p, x, z) => retry(() => p.evaluate(([x, z]) => { window.__lca.P.x = x; window.__lca.P.z = z; }, [x, z]));
const log = p => retry(() => p.evaluate(() => [...document.querySelectorAll('#chatLog p')].map(e => e.className + '|' + e.textContent)));
{
  const a = await guestOnline(B1), b = await guestOnline(B2, '3d'), far = await guestOnline(B3);
  await pos(a.p, 0, 10); await pos(b.p, 3, 10); await pos(far.p, 40, -40); await sleep(1500);
  await click(a.p, '#chatBtn'); await a.p.waitForTimeout(300);
  check(await retry(() => a.p.evaluate(() => !document.querySelector('#chatScope').hidden && !document.querySelector('#emoteBar').hidden)), 'D1 discussion : choix « Village / À proximité » et gestes proposés en ligne');
  await click(a.p, '#chatScope'); check((await retry(() => a.p.evaluate(() => document.querySelector('#chatScope').textContent))) === 'À proximité', 'D1 portée basculée sur « À proximité »');
  await a.p.fill('#chatIn', 'Coucou les voisins'); await a.p.press('#chatIn', 'Enter');
  check(await until(async () => (await log(b.p)).some(l => /near/.test(l) && /Coucou les voisins/.test(l)), 5000), 'D2 message de proximité reçu par le joueur proche (marqué « proche »)');
  await sleep(800);
  check(!(await log(far.p)).some(l => /Coucou les voisins/.test(l)), 'D2 le joueur éloigné ne le reçoit pas');
  check(await until(async () => (await log(a.p)).some(l => /near/.test(l) && /Coucou/.test(l)), 3000), 'D2 l’expéditeur voit son propre message');
  await click(a.p, '#emoteBar [data-em="salut"]');
  check(await until(() => b.p.evaluate(() => window.__lca.onl.players.some(q => q.e === 'salut')), 4000), 'D3 geste « saluer » vu par le voisin (3D)');
  check(await retry(() => b.p.evaluate(() => { const g = [...window.__lca.R.scene.children].find(o => o.userData && o.userData.armR && Math.abs(o.userData.armR.rotation.x + 2.7) < .01); return !!g; })), 'D3 3D : le bras de l’avatar distant est levé');
  await sleep(1300);
  await click(a.p, '#emoteBar [data-em="danse"]'); await click(b.p, '#chatBtn'); await b.p.waitForTimeout(200); await click(b.p, '#emoteBar [data-em="danse"]');
  check(await until(async () => (await log(far.p)).some(l => /act/.test(l) && /Danse du village/.test(l)), 5000), 'D4 danse collective annoncée à tout le village');
  const so = await retry(() => a.p.evaluate(() => JSON.parse(localStorage.getItem('lca-v2')).social));
  check(so && so.dances === 1 && so.emotes >= 2, 'D4 participation enregistrée dans la sauvegarde : ' + JSON.stringify(so));
  /* déconnexion pendant un geste : le joueur disparaît chez les autres */
  await click(a.p, '#emoteBar [data-em="assis"]').catch(() => { }); await sleep(1400); await click(a.p, '#emoteBar [data-em="assis"]');
  await until(() => b.p.evaluate(() => window.__lca.onl.players.some(q => q.e === 'assis')), 4000);
  await a.ctx.close();
  check(await until(() => b.p.evaluate(() => window.__lca.onl.players.length === 1), 6000), 'D5 déconnexion pendant un geste : le joueur disparaît proprement');
  for (const x of [b, far]) check(x.errs.length === 0, 'D aucune erreur de page : ' + x.errs.slice(0, 3).join(' | '));
}
await B1.close(); await B2.close(); await B3.close();
console.log(fails ? fails + ' échec(s)' : 'Tous les contrôles passent.');
web.close(); game.close(); process.exit(fails ? 1 : 0);
