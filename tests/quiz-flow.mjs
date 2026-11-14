// Quiz du village dans des navigateurs Chromium RÉELS (processus distincts) face à un VRAI serveur HTTP + WebSocket (127.0.0.1).
// Simulé : seulement Supabase (tests/fake-supabase.mjs). Barème raccourci pour la durée du test (compte à rebours, révélation, grâce de déconnexion).
// Lancer : node tests/quiz-flow.mjs
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
const verifyToken = async tok => { try { const p = JSON.parse(Buffer.from(String(tok).split('.')[1], 'base64url').toString()); return p.sub && String(tok).endsWith('.sig') && p.exp * 1000 > Date.now() ? { sub: p.sub, exp: p.exp } : null; } catch { return null; } };
const game = createServer({ legacy: false, cors: ORIGIN, verifyToken, nameGuard: { strict: false, check: async () => false }, realtime: { tickMs: 50 }, quiz: { config: { countdownMs: 700, revealMs: 500, timeMs: 8000, disconnectGraceMs: 3000 } } });
await new Promise(r => game.listen(0, '127.0.0.1', r));
const API = 'http://127.0.0.1:' + game.address().port;
const results = [];
const check = (ok, msg) => { const l = (ok ? 'OK  ' : 'KO  ') + msg; results.push(l); console.log(l); if (!ok) process.exitCode = 1; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (f, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await f()) return true; } catch { } await sleep(100); } return false; };
const retry = async f => { for (let i = 0; ; i++) { try { return await f(); } catch (e) { if (i >= 8 || !/context was destroyed|navigation/i.test(String(e))) throw e; await sleep(400); } } };
const ARGS = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const fake = fakeSupabase();
async function openPage(browser, { net = null, ls = null } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 }, serviceWorkers: 'block', locale: 'fr-FR' });
  const p = await ctx.newPage(), errs = [];
  p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  if (net) p.on('websocket', ws => net.ws.push(ws.url()));
  await p.route('**/fonts.g*/**', r => r.abort());
  await p.route('**/*.supabase.co/**', fake.handler);
  await p.addInitScript(api => { window.LCA = window.LCA || {}; window.LCA.config = { apiBase: api }; }, API);
  if (ls) await p.addInitScript(o => { for (const k in o) if (localStorage.getItem(k) === null) localStorage.setItem(k, o[k]); }, ls);
  await p.goto(PAGE); await p.waitForSelector('#welcomeCard', { state: 'attached' }); await p.waitForTimeout(900);
  return { p, errs, ctx };
}
const click = (p, sel) => retry(() => p.evaluate(s => { const e = document.querySelector(s); if (e && !e.disabled) e.click(); return !!e; }, sel));
const badge = p => retry(() => p.evaluate(() => { const b = document.querySelector('#netBadge'); return { k: b.dataset.k, text: b.textContent }; }));
const onl = p => retry(() => p.evaluate(() => window.LCA.onlineState()));
const walk = async (p, mode = '2d') => { for (let i = 0; i < 3; i++) { await click(p, '[data-setup="next"]'); await p.waitForTimeout(150); if (i === 1) await click(p, '[data-rmode="' + mode + '"]'); } };
const closeMenu = async p => { await click(p, '#menuBtn'); await p.waitForTimeout(500); if (await retry(() => p.evaluate(() => !document.querySelector('#welcome').hidden))) { await click(p, '[data-m="new"]'); await p.waitForTimeout(900); } };
const goOnline = async p => { await click(p, '[data-play="online"]'); await p.waitForTimeout(250); await retry(() => p.check('#onlConsent')); await p.waitForTimeout(250); await closeMenu(p); };
const enterWorld = async p => { await click(p, '[data-m="new"]'); await p.waitForTimeout(700); await click(p, '[data-pick="wolof"]'); await p.waitForTimeout(500); await click(p, '[data-go2="start"]'); await p.waitForTimeout(2500); };
const openMenu = async p => { await click(p, '#menuBtn'); await p.waitForTimeout(400); };
const reloaded = async p => { await p.waitForTimeout(2600); await p.waitForLoadState('load'); await p.waitForTimeout(900); };
const guest = async (br, mode = '2d') => { const c = await openPage(br); await walk(c.p, mode); await click(c.p, '[data-setup="guest"]'); await c.p.waitForTimeout(1500); await enterWorld(c.p); await openMenu(c.p); await goOnline(c.p); return c; };
const account = async (br, pseudo, mail) => { const c = await openPage(br); await walk(c.p); await click(c.p, '[data-setup="register"]');
  await c.p.fill('#accPseudo', pseudo); await c.p.fill('#accEmail', mail); await c.p.fill('#accPw', 'motdepasse8'); await c.p.fill('#accPw2', 'motdepasse8'); await c.p.check('#accConsent');
  await click(c.p, '[data-acc="register"]'); await reloaded(c.p); await enterWorld(c.p); await openMenu(c.p); await goOnline(c.p); return c; };
const near = (p, x = 30, z = -19) => retry(() => p.evaluate(([x, z]) => { window.__lca.P.x = x; window.__lca.P.z = z; }, [x, z]));
const qs = p => retry(() => p.evaluate(() => { const s = LCA.quizUI.state; return { screen: s.screen, qid: s.q && s.q.id, qi: s.qi, answered: !!s.answered, prompt: s.q && s.q.prompt, notice: s.notice || '' }; }));
const wallState = p => retry(() => p.evaluate(() => ({ v: LCA.quizWall.state.version, top: LCA.quizWall.state.top, hash: LCA.quizWall.state.hash, px: LCA.quizWall.pixelHash(), name: LCA.quizWall.state.villageName })));
const panelText = p => retry(() => p.evaluate(() => document.querySelector('#quizPanel').innerText));
const curMatch = () => [...game.quiz._matches.values()].find(m => m.state === 'running');
/* joue un match : policy(nom, indexQuestion, bonneRéponse) -> lettre ; renvoie les identifiants de questions vus par chaque joueur */
async function playMatch(players, policy, { max = 60000 } = {}) {
  const seen = players.map(() => ({})), t0 = Date.now();
  while (Date.now() - t0 < max) {
    const st = await Promise.all(players.map(x => qs(x.p)));
    if (st.every(s => s.screen === 'end')) return seen;
    const m = curMatch();
    for (let i = 0; i < players.length; i++) {
      const s = st[i];
      if (s.screen === 'ask') { seen[i][s.qi] = s.qid; if (!s.answered && m) { const right = m.questions[m.qi].answer, c = policy(players[i].name, s.qi, right); if (c) await click(players[i].p, '[data-qz="ans"][data-c="' + c + '"]'); } }
    }
    await sleep(80);
  }
  return seen;
}
const nameOfMail = m => { const id = fake.users[m].id; const s = [...game.world.sessions.values()].find(x => x.uid === id); return s && s.name; };
const wrong = r => (r === 'a' ? 'b' : 'a');
const A = await chromium.launch({ args: ARGS }), B = await chromium.launch({ args: ARGS }), E = await chromium.launch({ args: ARGS }), F = await chromium.launch({ args: ARGS }), C = await chromium.launch({ args: ARGS });

/* ---------- 1. invité local : aucun réseau, quiz solo local, meilleur score local ---------- */
const netC = { ws: [] };
{
  const c = await openPage(C, { net: netC });
  await walk(c.p); await click(c.p, '[data-setup="guest"]'); await c.p.waitForTimeout(1500); await enterWorld(c.p);
  await click(c.p, '#closeP'); await near(c.p, 30, -19); await c.p.waitForTimeout(1000);
  const dbg0 = await retry(() => c.p.evaluate(() => ({ open: [...document.querySelectorAll('.ui:not([hidden]),#welcome:not([hidden])')].map(e=>e.id).join(','), act: document.querySelector('#act').hidden, txt: document.querySelector('#actTxt').textContent, P: [window.__lca.P.x, window.__lca.P.z], mode: window.__lca.mode })));
  await c.p.keyboard.press('e'); await c.p.waitForTimeout(600); console.log('INFO 1a', JSON.stringify(dbg0));
  const vis = await retry(() => c.p.evaluate(() => { const b = document.querySelector('#dlgQuiz'); return b && !b.hidden && !document.querySelector('#dialog').hidden; }));
  check(vis, '1a · enseignant : dialogue avec le bouton « Quiz du village »');
  await click(c.p, '#dlgQuiz'); await c.p.waitForTimeout(400);
  let txt = await panelText(c.p);
  check(/Mode hors ligne/.test(txt) && /Défier un ami \(en ligne\)/.test(txt), '1b · invité local : menu quiz hors ligne, duel proposé seulement en ligne');
  await click(c.p, '[data-qz="solo"][data-cat=""]');
  check(await until(async () => (await qs(c.p)).screen === 'ask', 8000), '1c · le quiz solo local démarre');
  let n = 0;
  for (let i = 0; i < 10; i++) { if (!await until(async () => { const s = await qs(c.p); return s.screen === 'ask' && s.qi === i; }, 9000)) break; await click(c.p, '[data-qz="ans"][data-c="a"]'); n++; await until(async () => (await qs(c.p)).screen === 'reveal', 4000); }
  check(n === 10, '1d · 10 questions posées et répondues (' + n + ')');
  check(await until(async () => (await qs(c.p)).screen === 'end', 8000), '1e · écran de fin');
  txt = await panelText(c.p);
  check(/aucun classement hors ligne/.test(txt) && /Score|pts|\//.test(txt), '1f · résultat local, pas de classement : ' + txt.replace(/\s+/g, ' ').slice(0, 160));
  const best = await retry(() => c.p.evaluate(() => JSON.parse(localStorage.getItem('nzassa.quiz.local.v1') || '{}')));
  check(best.best_wolof && typeof best.best_wolof.score === 'number', '1g · meilleur score gardé localement seulement : ' + JSON.stringify(best));
  check(netC.ws.length === 0, '1h · AUCUNE connexion WebSocket pendant tout le quiz local (' + netC.ws.length + ')');
  check(c.errs.length === 0, '1i · aucune erreur de page ' + c.errs.join('|'));
  await c.ctx.close();
}

/* ---------- 2. trois joueurs en ligne : A invité, B et E comptes ---------- */
const a = await guest(A); a.name = 'A';
const b = await account(B, 'Kofi_B', 'kofi@exemple.org'); b.name = 'B';
const e = await account(E, 'Awa_E', 'awa@exemple.org'); e.name = 'E';
check(await until(async () => (await badge(a.p)).k === 'guest' && (await badge(b.p)).k === 'acc' && (await badge(e.p)).k === 'acc'), '2a · A invité en ligne, B et E comptes · ' + JSON.stringify([await badge(a.p), await badge(b.p), await badge(e.p)]));
check(await until(async () => (await onl(a.p)).players.length === 2 && (await onl(b.p)).players.length === 2), '2b · présence mutuelle des 3 joueurs');
const f = await guest(F, '3d'); f.name = 'F';
await sleep(1500);
check((await onl(f.p)).players.length === 3, '2c · F (3D, invité observateur) voit les 3 autres joueurs');
for (const x of [a, b, e, f]) await near(x.p, 30, -19);
await sleep(600);
const idOf = async (p, kind) => (await onl(p)).players.find(q => q.k === kind).id;
const w0 = { a: await wallState(a.p), f: await wallState(f.p) };
check(w0.a.top.length === 0 && w0.f.top.length === 0, '2d · mur vide au départ (2D et 3D)');
const wall3d = await retry(() => f.p.evaluate(() => { const g = window.LCA.quizWall3d; return !!g && !!g.userData.face && g.position.x === 38.5 && g.position.z === -22.5; }));
check(wall3d, '2e · le mur 3D existe dans la scène (groupe + face texturée) en (38,5 ; -22,5)');
const wall2d = await retry(() => a.p.evaluate(() => !!LCA.quizWall.sprite2d() && window.__lca.R.is2d));
check(wall2d, '2f · le mur 2D existe (sprite) dans le rendu 2D');

/* ---------- 3. duel invité (A) contre compte (B) : questions identiques, classement réservé au compte ---------- */
await retry(() => a.p.evaluate(() => LCA.quizUI.open())); await click(a.p, '[data-qz="pick"]'); await a.p.waitForTimeout(300);
const bId = await idOf(a.p, 'a');
await click(a.p, '[data-qz="chal"][data-id="' + bId + '"]');
check(await until(async () => retry(() => b.p.evaluate(() => { const d = document.querySelector('#qzInv'); return d && !d.hidden && /te défie/.test(d.innerText); })), 5000), '3a · B reçoit l’invitation de A (fenêtre « te défie »)');
check((await qs(a.p)).screen === 'wait', '3b · A attend la réponse');
await click(b.p, '[data-qzi="yes"]');
check(await until(async () => { const s = await Promise.all([qs(a.p), qs(b.p)]); return s.every(x => x.screen === 'count' || x.screen === 'ask'); }, 6000), '3c · le duel démarre chez les deux navigateurs');
const seen = await playMatch([a, b], (nm, qi, right) => (nm === 'A' ? right : (qi % 3 === 0 ? wrong(right) : right)));
const ids = Object.keys(seen[0]).map(k => seen[0][k] === seen[1][k]);
check(ids.length === 10 && ids.every(Boolean), '3d · les 10 questions sont IDENTIQUES pour A et B (' + ids.filter(Boolean).length + '/' + ids.length + ')');
const ta = await panelText(a.p), tb = await panelText(b.p);
check(/Victoire/.test(ta) && /Défaite/.test(tb), '3e · A (tout juste) gagne, B perd : ' + (ta.match(/Victoire|Défaite/)||[''])[0] + ' / ' + (tb.match(/Victoire|Défaite/)||[''])[0]);
check(/Non classé : connecte-toi/.test(ta), '3f · A (invité) : « non classé, connecte-toi avec un compte »');
check(/Match classé|meilleur score|Nouveau meilleur/i.test(tb), '3g · B (compte) : match classé · ' + (tb.match(/(Nouveau[^.]*\.|Match classé[^.]*\.)/) || [''])[0]);
const topV = game.quizStore.top('wolof', 10);
check(topV.length === 1 && topV[0].name === nameOfMail('kofi@exemple.org') && topV[0].score > 0, '3h · Top 10 serveur : B seul (l’invité A n’y figure pas) · ' + JSON.stringify(topV));
check(!/uid|sub/.test(JSON.stringify(topV)), '3i · le Top 10 public ne contient aucun identifiant de compte');
const ok = await until(async () => { const x = await Promise.all([wallState(a.p), wallState(b.p), wallState(f.p), wallState(e.p)]); return x.every(s => s.top.length === 1 && s.top[0].name === nameOfMail('kofi@exemple.org')); }, 6000);
check(ok, '3j · le mur de TOUS les joueurs du village (2D : A, B, E ; 3D : F) affiche le nouveau Top 10');
const w1 = { a: await wallState(a.p), f: await wallState(f.p) };
check(w1.a.hash !== w0.a.hash && w1.a.v > w0.a.v && w1.a.px !== w0.a.px, '3k · mur 2D redessiné (version ' + w0.a.v + '→' + w1.a.v + ', pixels modifiés)');
check(w1.f.hash !== w0.f.hash && w1.f.px !== w0.f.px && await retry(() => f.p.evaluate(() => LCA.quizWall.texture3d && LCA.quizWall.texture3d.version > 0)), '3l · texture du mur 3D mise à jour (pixels modifiés, texture marquée à recharger)');
const rows = await retry(() => f.p.evaluate(() => LCA.quizWall.state.top.length));
check(rows <= 10, '3m · le mur n’affiche jamais plus de 10 lignes (' + rows + ')');

/* ---------- 4. duel entre deux comptes : classement, tri, remplacement seulement si meilleur ---------- */
await retry(() => b.p.evaluate(() => LCA.quizUI.reset())); await retry(() => e.p.evaluate(() => LCA.quizUI.reset()));
await retry(() => b.p.evaluate(() => LCA.quizUI.open())); await click(b.p, '[data-qz="pick"]'); await b.p.waitForTimeout(300);
await click(b.p, '[data-qz="chal"][data-id="' + await idOf(b.p, 'a') + '"]');
check(await until(async () => retry(() => e.p.evaluate(() => { const d = document.querySelector('#qzInv'); return d && !d.hidden; })), 5000), '4a · E reçoit le défi de B');
await click(e.p, '[data-qzi="yes"]');
await playMatch([b, e], (nm, qi, right) => (nm === 'E' ? right : (qi < 5 ? right : wrong(right))));
const top2 = game.quizStore.top('wolof', 10);
check(top2.length === 2 && top2[0].name === nameOfMail('awa@exemple.org') && top2[1].name === nameOfMail('kofi@exemple.org') && top2[0].rank === 1, '4b · Top 10 : 2 comptes triés par score décroissant · ' + top2.map(x => x.rank + '.' + x.name + ' ' + x.score).join(' | '));
const bScoreBefore = topV[0].score;
check(top2[1].score >= bScoreBefore, '4c · B garde son meilleur résultat (' + top2[1].score + ' ≥ ' + bScoreBefore + ')');
check(await until(async () => { const x = await Promise.all([wallState(a.p), wallState(f.p)]); return x.every(s => s.top.length === 2 && s.top[0].name === nameOfMail('awa@exemple.org')); }, 6000), '4d · le mur 2D (A) et le mur 3D (F) montrent les 2 champions dans l’ordre');
const lines = await retry(() => a.p.evaluate(() => { LCA.quizUI.openWall(); return document.querySelector('#quizPanel').innerText; }));
check(lines.includes(nameOfMail('awa@exemple.org')) && lines.includes(nameOfMail('kofi@exemple.org')), '4e · l’écran « Mur des champions » liste rang, pseudo, score, temps');
await retry(() => a.p.evaluate(() => LCA.quizUI.close()));

/* ---------- 5. déconnexion : forfait après la grâce ---------- */
await retry(() => b.p.evaluate(() => LCA.quizUI.reset())); await retry(() => e.p.evaluate(() => LCA.quizUI.reset()));
await retry(() => b.p.evaluate(() => LCA.quizUI.open())); await click(b.p, '[data-qz="pick"]'); await b.p.waitForTimeout(300);
await click(b.p, '[data-qz="chal"][data-id="' + await idOf(b.p, 'a') + '"]');
await until(async () => retry(() => e.p.evaluate(() => { const d = document.querySelector('#qzInv'); return d && !d.hidden; })), 5000); await click(e.p, '[data-qzi="yes"]');
check(await until(async () => (await qs(b.p)).screen === 'ask' && (await qs(e.p)).screen === 'ask', 8000), '5a · nouveau duel B contre E en cours');
await e.ctx.close();
check(await until(async () => /déconnecté/.test(await panelText(b.p)), 6000), '5b · B est prévenu que l’adversaire est déconnecté');
check(await until(async () => (await qs(b.p)).screen === 'ask' || (await qs(b.p)).screen === 'reveal' || (await qs(b.p)).screen === 'end', 3000), '5c · le quiz de B continue');
await playMatch([b], (nm, qi, right) => right, { max: 40000 });
const tb2 = await panelText(b.p);
check(/Victoire/.test(tb2) && /forfait/.test(tb2), '5d · après la grâce, B gagne par forfait : ' + (tb2.match(/Victoire[^\n]*/)||[''])[0]);

/* ---------- 6. coupure réseau : reprise du quiz ---------- */
await retry(() => b.p.evaluate(() => LCA.quizUI.reset()));
await retry(() => b.p.evaluate(() => LCA.quizUI.open())); await click(b.p, '[data-qz="solo"][data-cat=""]');
check(await until(async () => (await qs(b.p)).screen === 'ask', 8000), '6a · B lance un quiz solo en ligne');
const mid = curMatch().id;
game.realtime.terminateAll();
check(await until(async () => { const m = game.quiz._matches.get(mid); return m && m.players[0].connected; }, 15000), '6b · le socket revient et le serveur rattache B au même match (reprise par jeton)');
await playMatch([b], (nm, qi, right) => right, { max: 40000 });
check(/Quiz terminé/.test(await panelText(b.p)), '6c · le quiz repris va jusqu’au bout');
const errs = [a, b, f].map(x => x.errs.length).reduce((s, v) => s + v, 0);
check(errs === 0, '6d · aucune erreur de page ' + [a, b, f].flatMap(x => x.errs).join('|'));

await A.close(); await B.close(); await E.close(); await F.close(); await C.close();
await new Promise(r => game.close(r)); web.close();
console.log(process.exitCode ? '\nDES SCÉNARIOS ÉCHOUENT.' : '\nTous les scénarios passent.');
process.exit(process.exitCode || 0);
