#!/usr/bin/env node
/* Banc de charge WebSocket N'Zassa : N clients virtuels (invités en ligne) dans un VRAI processus serveur, via de VRAIES connexions WebSocket.
   Ce sont des clients simulés (pas des navigateurs) : ils mesurent le serveur, pas le rendu 3D.
   Usage :
     node scripts/loadtest.mjs --n 50 --duration 30            (lance le serveur local lui-même, mesure CPU/RAM par /proc)
     node scripts/loadtest.mjs --url wss://mon-service.onrender.com --n 50   (cible distante ; CPU/RAM via /health?detail=1 si NZASSA_METRICS_TOKEN est fourni)
   Options : --n --duration(s) --rooms(1) --spread(60, côté de la zone de marche) --restart (redémarrage du serveur en cours de test, mode local) --out fichier.json
     --tables K : les K premiers clients s'assoient aux 8 tables de la place des jeux (2 par table, cartes = bataille) et jouent des coups légaux tirés au hasard,
                  puis redemandent une revanche ; mesure le délai coup → état reçu et compte les parties finies.
     --robots   : avec --tables, chaque joueur de table est SEUL à sa table (8 au plus) et lance la partie contre un robot du serveur
                  (l'IA tourne alors dans le processus serveur : c'est le cas le plus coûteux pour la boucle d'événements). */
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const WebSocket = require('ws');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); if (i < 0) return d; const v = process.argv[i + 1]; return v === undefined || v.startsWith('--') ? true : v; };
const TABLE_SPOTS = [['awale1', 12, 34], ['awale2', 18, 34], ['dames1', 24, 34], ['dames2', 30, 34], ['echecs1', 12, 40], ['echecs2', 18, 40], ['cartes1', 24, 40], ['cartes2', 30, 40]];
const ROBOTS = !!arg('robots', false), N = +arg('n', 10), TBL = Math.min(+arg('tables', 0) || 0, ROBOTS ? 8 : 16, +arg('n', 10)), DUR = +arg('duration', 30), ROOMS = +arg('rooms', 1), SPREAD = +arg('spread', 60), RESTART = !!arg('restart', false), OUT = arg('out', '');
let URLB = arg('url', ''), child = null, port = 0;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pct = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return +s[Math.min(s.length - 1, Math.floor(p / 100 * s.length))].toFixed(1); };
const stat = a => ({ n: a.length, p50: pct(a, 50), p95: pct(a, 95), p99: pct(a, 99), max: a.length ? +Math.max(...a).toFixed(1) : null });

async function startServer() {
  port = 20000 + Math.floor(Math.random() * 20000);
  const env = { ...process.env, PORT: String(port), HOST: '127.0.0.1', NODE_ENV: 'production', NZASSA_LEGACY_API: '0', NZASSA_CORS: '*', NZASSA_MAX_CONNECTIONS: '200', NZASSA_WS_PER_IP: '500', NZASSA_MAX_PLAYERS: '50', NZASSA_ROOM_MAX: '50' };
  child = spawn(process.execPath, ['server/server.cjs'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', () => {}); child.stderr.on('data', d => process.stderr.write('[serveur] ' + d));
  for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://127.0.0.1:${port}/health`); if (r.ok) return; } catch { } await sleep(100); }
  throw new Error('le serveur local ne démarre pas');
}
const httpBase = () => URLB.replace(/^ws/, 'http').replace(/\/+$/, '');
const wsUrl = () => (URLB.replace(/\/+$/, '') + '/v1/ws');

/* CPU / RAM du processus serveur local, lus dans /proc (Linux) */
const TICKS = 100; // CLK_TCK usuel
function procSample(pid) {
  try {
    const st = readFileSync(`/proc/${pid}/stat`, 'utf8'), f = st.slice(st.lastIndexOf(')') + 2).split(' ');
    const cpu = (+f[11] + +f[12]) / TICKS; // utime + stime en secondes
    const rss = +readFileSync(`/proc/${pid}/statm`, 'utf8').split(' ')[1] * 4096 / 1048576;
    return { cpu, rss };
  } catch { return null; }
}

const M = { chatSent: 0, open: 0, connectFail: 0, unexpectedClose: 0, errors: 0, sent: 0, recv: 0, bytesIn: 0, bytesOut: 0, welcome: 0, errMsgs: {}, closeCodes: {} };
const L = { rtt: [], chat: [], move: [], reconnect: [], tblMove: [] };
const TM = { sits: 0, resumed: 0, moves: 0, games: 0, rematch: 0, errs: {}, legalNull: 0 };
const pending = new Map(); // sauts de position en attente (mesure du délai de bout en bout)
const clients = [];
let stopping = false, phase = 'montée';

function mk(i) {
  const sp = i < TBL ? TABLE_SPOTS[(ROBOTS ? i : Math.floor(i / 2)) % 8] : null;
  const c = { i, sp, tPend: 0, tHist: -1, tPhase: '', ws: null, id: null, up: false, kill: false, tries: 0, pos: sp ? { x: sp[1] + (i % 2 ? 1.6 : -1.6), z: sp[2] } : { x: 20 + Math.random() * SPREAD, z: 20 + Math.random() * SPREAD }, dir: Math.random() * 6.28, walking: true, lastChat: 0, chatSeq: 0, tDown: 0, seenMoves: 0 };
  c.sendJ = o => { if (c.ws && c.ws.readyState === 1) { const d = JSON.stringify(o); M.sent++; M.bytesOut += d.length; c.ws.send(d); } };
  c.connect = () => new Promise(res => {
    const t0 = performance.now(); let done = false;
    const ws = new WebSocket(wsUrl(), { headers: { origin: 'https://charge.test' } }); c.ws = ws;
    const fin = ok => { if (!done) { done = true; res(ok); } };
    ws.on('open', () => c.sendJ({ t: 'join', name: 'Bot' + i, room: 'room' + (i % ROOMS), consent: true, x: c.pos.x, z: c.pos.z }));
    ws.on('message', d => {
      const s = d.toString(); M.recv++; M.bytesIn += s.length; let m; try { m = JSON.parse(s); } catch { return; }
      const now = performance.now();
      if (m.t === 'welcome') { c.id = m.id; c.up = true; M.welcome++; if (c.tDown) { L.reconnect.push(now - c.tDown); c.tDown = 0; } c.tries = 0; fin(true); if (c.sp) setTimeout(() => c.sendJ(c.tok ? { t: 'tbl', op: 'resume', table: c.sp[0], token: c.tok } : { t: 'tbl', op: 'sit', table: c.sp[0], game: 'bataille' }), 300 + Math.random() * 500); }
      else if (m.t === 'tbl') onTbl(c, m, now);
      else if (m.t === 'pong') L.rtt.push(now - m.c);
      else if (m.t === 'err') { M.errMsgs[m.code] = (M.errMsgs[m.code] || 0) + 1; }
      else if (m.t === 's') {
        (m.mv || []).forEach(e => { c.seenMoves++; const t = pending.get(e[0] + ':' + e[1].toFixed(2)); if (t && now - t < 3000) L.move.push(now - t); });
        (m.chat || []).forEach(x => { if (x.sys || typeof x.text !== 'string') return; const mm = /^t([a-j]+)$/.exec(x.text); if (mm) { const ts = +[...mm[1]].map(ch => 'abcdefghij'.indexOf(ch)).join(''); L.chat.push(Date.now() - ts); } });
      }
    });
    ws.on('close', code => { c.up = false; M.closeCodes[code] = (M.closeCodes[code] || 0) + 1; fin(false); if (!stopping && !c.kill) { M.unexpectedClose++; c.tDown = c.tDown || performance.now(); retry(c); } });
    ws.on('error', () => { M.errors++; });
    setTimeout(() => { if (!done) { M.connectFail++; fin(false); try { ws.terminate(); } catch { } } }, 8000);
  });
  return c;
}
/* joueur de table : coup légal au hasard après un court temps de réflexion, revanche en fin de partie */
function onTbl(c, m, now) {
  if (m.ev === 'err') { TM.errs[m.code] = (TM.errs[m.code] || 0) + 1; if (process.env.LT_DEBUG) console.error('err', c.i, c.sp[0], m.code, c.pos); return; }
  if (m.ev === 'resume') { if (c.tok) TM.resumed++; else { TM.sits++; if (ROBOTS) setTimeout(() => c.sendJ({ t: 'tbl', op: 'start', table: c.sp[0] }), 200); } c.tok = m.token; return; }
  if (m.ev === 'left') { c.tok = null; return; }
  if (m.ev !== 'state' || m.table !== c.sp[0]) return;
  const hl = (m.hist || []).length + (m.res ? 1000 : 0);
  if (c.tPend && hl !== c.tHist) { L.tblMove.push(now - c.tPend); c.tPend = 0; }
  c.tHist = hl;
  if (m.phase === 'done' && c.tPhase !== 'done') { if (m.seat === 0) TM.games++; setTimeout(() => { TM.rematch++; c.sendJ({ t: 'tbl', op: 'rematch' }); }, 800 + Math.random() * 800); }
  c.tPhase = m.phase;
  if (m.phase === 'play' && !m.res && m.turn === m.seat && !c.tPend && !c.tSched) {
    if (m.legal === null) { TM.legalNull++; return; }
    if (!m.legal || !m.legal.length) return;
    const mv = m.legal[Math.floor(Math.random() * m.legal.length)];
    c.tSched = true; setTimeout(() => { c.tSched = false; if (!c.up) return; c.tPend = performance.now(); TM.moves++; c.sendJ({ t: 'tbl', op: 'move', move: mv }); }, 150 + Math.random() * 450);
  }
}
/* reconnexion avec attente progressive et variation aléatoire, comme le client du jeu */
async function retry(c) { if (stopping) return; c.tries++; await sleep(Math.min(4000, 250 * 2 ** Math.min(c.tries, 5)) * (0.5 + Math.random())); if (!stopping) { const ok = await c.connect(); if (!ok && !stopping) { c.tDown = c.tDown || performance.now(); } } }

function step(c, dt) {
  if (!c.up || c.sp) return;
  if (Math.random() < 0.02) c.walking = !c.walking; if (Math.random() < 0.05) c.dir += (Math.random() - .5) * 2;
  if (c.walking) { c.pos.x += Math.sin(c.dir) * 2.2 * dt; c.pos.z += Math.cos(c.dir) * 2.2 * dt; if (c.pos.x < 5 || c.pos.x > 5 + SPREAD) { c.dir = -c.dir; c.pos.x = Math.min(5 + SPREAD, Math.max(5, c.pos.x)); } if (c.pos.z < 5 || c.pos.z > 5 + SPREAD) { c.dir = Math.PI - c.dir; c.pos.z = Math.min(5 + SPREAD, Math.max(5, c.pos.z)); } c.sendJ({ t: 'pos', x: +c.pos.x.toFixed(2), z: +c.pos.z.toFixed(2), h: +c.dir.toFixed(2), a: 1 }); }
}

async function health(detail) { try { const r = await fetch(httpBase() + '/health' + (detail ? '?detail=1' : ''), { headers: process.env.NZASSA_METRICS_TOKEN ? { 'x-nzassa-metrics': process.env.NZASSA_METRICS_TOKEN } : {} }); return await r.json(); } catch { return null; } }

async function main() {
  if (!URLB) { await startServer(); URLB = `ws://127.0.0.1:${port}`; }
  console.log(`Cible ${URLB} · ${N} clients · ${DUR}s · ${ROOMS} salon(s) · zone ${SPREAD}`);
  const h0 = await health(true), p0 = child ? procSample(child.pid) : null; let peakRss = 0, peakCpuPct = 0, lastP = p0, lastT = performance.now();
  const sampler = setInterval(() => { if (child) { const p = procSample(child.pid), t = performance.now(); if (p && lastP) { peakCpuPct = Math.max(peakCpuPct, (p.cpu - lastP.cpu) / ((t - lastT) / 1000) * 100); peakRss = Math.max(peakRss, p.rss); lastP = p; lastT = t; } } }, 1000);

  // montée en charge progressive (étalée sur ~2 s)
  for (let i = 0; i < N; i++) { const c = mk(i); clients.push(c); c.connect(); await sleep(Math.max(5, 2000 / N)); }
  await sleep(1500);
  const tHold0 = performance.now(), cpu0 = child ? procSample(child.pid) : null;
  phase = 'régime établi';
  const walker = setInterval(() => clients.forEach(c => step(c, .1)), 100);
  const pinger = setInterval(() => clients.forEach(c => c.sendJ({ t: 'ping', c: performance.now() })), 1000);
  /* instants aléatoires (et non une horloge fixe) : sinon la phase par rapport au pas de 100 ms du serveur fausserait la latence mesurée */
  let loopOn = true; const randLoop = (fn, min, max) => { const go = () => { if (!loopOn) return; fn(); setTimeout(go, min + Math.random() * (max - min)); }; setTimeout(go, Math.random() * min); };
  randLoop(() => { const c = clients[Math.floor(Math.random() * clients.length)]; if (c && c.up && Date.now() - c.lastChat > 4000) { c.lastChat = Date.now(); M.chatSent++; c.sendJ({ t: 'chat', text: 't' + [...String(Date.now())].map(d => 'abcdefghij'[+d]).join('') }); } }, 60 * 1000 / (N * 5) / 2, 60 * 1000 / (N * 5) * 1.5);
  randLoop(() => { const c = clients[Math.floor(Math.random() * clients.length)]; if (c && c.up && c.id && !c.sp) { const x = +(10 + Math.random() * SPREAD).toFixed(2); pending.set(c.id + ':' + x.toFixed(2), performance.now()); c.pos.x = x; c.sendJ({ t: 'pos', x, z: +c.pos.z.toFixed(2), h: 0, a: 1 }); setTimeout(() => pending.delete(c.id + ':' + x.toFixed(2)), 3000); } }, 60, 260);

  const half = DUR * 1000 / 2; await sleep(half);
  const held = clients.filter(c => c.up).length, hmid = await health(true);
  /* coupures brutales : 20 % des clients perdent leur connexion sans prévenir, puis se reconnectent */
  phase = 'coupures'; const cut = clients.filter((c, i) => i % 5 === 0); cut.forEach(c => { c.tDown = performance.now(); try { c.ws.terminate(); } catch { } });
  await sleep(half);
  const afterCut = clients.filter(c => c.up).length;
  let restartInfo = null;
  if (RESTART && child) {
    phase = 'redémarrage'; const before = M.unexpectedClose, t0 = performance.now(); child.kill('SIGTERM'); await new Promise(r => child.once('exit', r));
    const down = performance.now() - t0; child = null; const port0 = port; await startServerOnPort(port0);
    await sleep(9000); const back = clients.filter(c => c.up).length;
    restartInfo = { clientsAvantArret: afterCut, clientsReconnectesApres9s: back, arretMs: Math.round(down), deconnexionsProvoquees: M.unexpectedClose - before };
  }
  const tEnd = performance.now(), cpu1 = child ? procSample(child.pid) : null, hend = await health(true);
  stopping = true; clearInterval(walker); clearInterval(pinger); loopOn = false; clearInterval(sampler);
  const avgCpu = cpu0 && cpu1 && !RESTART ? (cpu1.cpu - cpu0.cpu) / ((tEnd - tHold0) / 1000) * 100 : null;
  clients.forEach(c => { c.kill = true; try { c.ws.close(1000); } catch { } });
  await sleep(500); const hfinal = await health(false);

  const rep = {
    date: new Date().toISOString(), type: 'SIMULÉ : clients WebSocket Node (pas de navigateurs)', cible: child ? 'serveur local lancé par le test' : URLB, clients: N, duree_s: DUR, salons: ROOMS, zone: SPREAD,
    connexions: { demandees: N, maintenuesAuMilieu: held, maintenuesApresCoupures: afterCut, echecsDeConnexion: M.connectFail, fermeturesInattendues: M.unexpectedClose, codesDeFermeture: M.closeCodes, erreursSocket: M.errors, erreursServeur: M.errMsgs },
    latence_ms: { aller_retour_ping: stat(L.rtt), chat_bout_en_bout: stat(L.chat), deplacement_bout_en_bout: stat(L.move), reconnexion_apres_coupure: stat(L.reconnect) },
    livraison_chat: { envoyes: M.chatSent, receptionsAttendues: M.chatSent * N, receptionsReelles: L.chat.length, pct: M.chatSent ? +(L.chat.length / (M.chatSent * N) * 100).toFixed(1) : null, note: 'l’émetteur reçoit aussi son message ; écart attendu : clients en cours de reconnexion ou hors zone d’intérêt (zone > 80)' },
    debit: { messagesEnvoyes: M.sent, messagesRecus: M.recv, octetsRecus: M.bytesIn, octetsEnvoyes: M.bytesOut, recu_par_client_par_s_ko: +(M.bytesIn / N / (DUR + 4) / 1024).toFixed(1) },
    serveur: { cpu_moyen_pct_regime_etabli: avgCpu === null ? null : +avgCpu.toFixed(1), cpu_pic_pct: child || peakRss ? +peakCpuPct.toFixed(1) : null, ram_pic_mo: peakRss ? +peakRss.toFixed(0) : null, health_milieu: hmid, health_fin: hend, boucle_evenements_ms: hend && hend.loopMs },
    tables: TBL ? { mode: ROBOTS ? 'un joueur contre un robot du serveur par table' : 'deux joueurs simulés par table', joueursAuxTables: TBL, placesPrises: TM.sits, reprisesApresCoupure: TM.resumed, coupsEnvoyes: TM.moves, partiesTerminees: TM.games, revanchesDemandees: TM.rematch, erreurs: TM.errs, listesLegalesTropLongues: TM.legalNull, coup_vers_etat_ms: stat(L.tblMove), metriques_serveur: hend && hend.tables || null } : null,
    redemarrage: restartInfo, joueursRestantsApresFermeture: hfinal && hfinal.players
  };
  console.log(JSON.stringify(rep, null, 1));
  if (OUT) { mkdirSync(dirname(join(root, OUT)), { recursive: true }); writeFileSync(join(root, OUT), JSON.stringify(rep, null, 1)); console.log('Rapport écrit dans ' + OUT); }
  if (child) { child.kill('SIGTERM'); await new Promise(r => { child.once('exit', r); setTimeout(r, 3000); }); }
  process.exit(0);
}
async function startServerOnPort(p) {
  const env = { ...process.env, PORT: String(p), HOST: '127.0.0.1', NODE_ENV: 'production', NZASSA_LEGACY_API: '0', NZASSA_CORS: '*', NZASSA_MAX_CONNECTIONS: '200', NZASSA_WS_PER_IP: '500' };
  child = spawn(process.execPath, ['server/server.cjs'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] }); child.stdout.on('data', () => {}); child.stderr.on('data', () => {});
  for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://127.0.0.1:${p}/health`); if (r.ok) return; } catch { } await sleep(100); }
}
main().catch(e => { console.error(e); if (child) child.kill(); process.exit(1); });
