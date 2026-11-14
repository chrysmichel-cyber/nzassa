'use strict';
/* Tests RÉELS du serveur temps réel : vrai serveur HTTP + vraies connexions WebSocket sur 127.0.0.1 (pas de simulation du réseau). */
const test=require('node:test'),assert=require('node:assert');
const WebSocket=require('ws');
const {createServer}=require('../server/server.cjs');
let clock=Date.now();
const open=async(o)=>{o=o||{};const srv=createServer(Object.assign({secret:'t',legacy:false,now:()=>clock,realtime:Object.assign({tickMs:20,joinTimeoutMs:400},o.realtime||{}),verifyToken:undefined},o.srv||{}));
 await new Promise(r=>srv.listen(0,'127.0.0.1',r));return {srv,port:srv.address().port,close:()=>new Promise(r=>{srv.close(r);srv.closeAllConnections&&srv.closeAllConnections()})}};
function client(port,o){o=o||{};const ws=new WebSocket('ws://127.0.0.1:'+port+(o.path||'/v1/ws'),{headers:o.headers||{}});
 const c={ws,msgs:[],closed:null,waiters:[]};
 ws.on('message',d=>{const m=JSON.parse(d);c.msgs.push(m);c.waiters=c.waiters.filter(w=>!w(m))});
 ws.on('close',(code,reason)=>{c.closed={code,reason:String(reason)};c.waiters=c.waiters.filter(w=>!w(null))});
 c.opened=new Promise((ok,ko)=>{ws.on('open',ok);ws.on('error',ko);ws.on('unexpected-response',(rq,rs)=>ko(Object.assign(new Error('HTTP '+rs.statusCode),{status:rs.statusCode})))});
 c.send=m=>ws.send(JSON.stringify(m));
 c.wait=(f,ms)=>new Promise((ok,ko)=>{const hit=c.msgs.find(f);if(hit)return ok(hit);if(c.closed)return ko(new Error('fermé '+c.closed.code));const to=setTimeout(()=>ko(new Error('délai dépassé')),ms||2000);
  c.waiters.push(m=>{if(m&&f(m)){clearTimeout(to);ok(m);return true}if(!m){clearTimeout(to);ko(new Error('fermé'));return true}return false})});
 c.closedP=()=>new Promise(ok=>{if(c.closed)return ok(c.closed);ws.on('close',(code)=>ok({code}))});
 return c}
const J=(extra)=>Object.assign({t:'join',name:'Awa',room:'wolof',consent:true,x:0,z:0},extra||{});
const join=async(port,extra,copt)=>{const c=client(port,copt);await c.opened;c.send(J(extra));return c};

test('W1 /health répond sans authentification, avec capacité',async()=>{const s=await open();
 const r=await fetch('http://127.0.0.1:'+s.port+'/health');const j=await r.json();assert.equal(r.status,200);assert.equal(j.ok,true);assert.equal(j.capacity,50);assert.equal(j.players,0);await s.close()});
test('W2 invité en ligne : identité attribuée par le serveur, statut guest_online, aucune vérification de compte',async()=>{
 let calls=0;const s=await open({srv:{verifyToken:async()=>{calls++;return null}}});
 const a=await join(s.port,{kind:'authenticated_pretend',role:'admin',uid:'x'});const w=await a.wait(m=>m.t==='welcome');
 assert.equal(w.kind,'guest_online');assert.ok(/^[0-9a-f]{10}$/.test(w.id));assert.equal(calls,0,'aucune vérification Supabase pour un invité');
 assert.equal(w.limits.chatMax,120);a.ws.close();await s.close()});
test('W3 usurpation : « authenticated » sans jeton valide est refusé ; jeton invalide refusé ; non configuré refusé',async()=>{
 const s=await open({srv:{verifyToken:async t=>t==='a.b.c'?{sub:'11111111-1111-4111-8111-111111111111',exp:0}:null}});
 let c=await join(s.port,{kind:'authenticated'});assert.equal((await c.wait(m=>m.t==='err')).code,'bad_token');assert.equal((await c.closedP()).code,4401);
 c=await join(s.port,{token:'x.y.z'});assert.equal((await c.wait(m=>m.t==='err')).code,'bad_token');assert.equal((await c.closedP()).code,4401);
 await s.close();
 const s2=await open();c=await join(s2.port,{token:'a.b.c'});assert.equal((await c.wait(m=>m.t==='err')).code,'auth_unavailable');await s2.close()});
test('W4 compte vérifié : statut authenticated, identité Supabase non transmise aux autres, un seul personnage par compte',async()=>{
 const UID='22222222-2222-4222-8222-222222222222',s=await open({srv:{verifyToken:async t=>t==='ok.ok.ok'?{sub:UID,exp:0}:null}});
 const g=await join(s.port,{name:'Invite'});await g.wait(m=>m.t==='welcome');
 const a=await join(s.port,{name:'Kofi',token:'ok.ok.ok'});const w=await a.wait(m=>m.t==='welcome');assert.equal(w.kind,'authenticated');assert.equal(w.limits.chatMax,200);
 const seen=await g.wait(m=>m.t==='s'&&m.add&&m.add.length);assert.equal(seen.add[0].k,'a');assert.equal(JSON.stringify(seen).includes(UID),false,'l’identifiant Supabase reste privé');
 const a2=await join(s.port,{name:'Kofi',token:'ok.ok.ok'});await a2.wait(m=>m.t==='welcome');
 assert.ok((await a.closedP()).code>=1000,'l’ancienne session est fermée'||0);
 await s.close()});
test('W5 présence, déplacements en deltas, départ ; zone d’intérêt',async()=>{const s=await open();
 const a=await join(s.port,{name:'Awa',x:0,z:0}),b=await join(s.port,{name:'Bo',x:5,z:0}),far=await join(s.port,{name:'Loin',x:150,z:0});
 await Promise.all([a,b,far].map(c=>c.wait(m=>m.t==='welcome')));
 const add=await a.wait(m=>m.t==='s'&&m.add&&m.add.some(p=>p.name==='Bo'));assert.ok(add);
 assert.ok(!a.msgs.some(m=>m.add&&m.add.some(p=>p.name==='Loin')),'un joueur hors zone n’est pas diffusé');
 b.send({t:'pos',x:9,z:3,h:1,a:1});const mv=await a.wait(m=>m.mv&&m.mv.length);assert.equal(mv.mv[0][1],9);
 b.ws.close();const rm=await a.wait(m=>m.rm&&m.rm.length);assert.equal(rm.rm.length,1);
 const welcomeFar=far.msgs.find(m=>m.t==='welcome');assert.equal(welcomeFar.state.players.length,0);
 await s.close()});
test('W6 chat invité ↔ compte, filtrage des liens, limite de débit',async()=>{
 const s=await open({srv:{verifyToken:async t=>t==='ok.ok.ok'?{sub:'33333333-3333-4333-8333-333333333333',exp:0}:null}});
 const a=await join(s.port,{name:'Kofi',token:'ok.ok.ok'}),g=await join(s.port,{name:'Invite'});await a.wait(m=>m.t==='welcome');await g.wait(m=>m.t==='welcome');
 a.send({t:'chat',text:'Bonjour tout le monde'});const m1=await g.wait(m=>m.chat&&m.chat.some(x=>x.text==='Bonjour tout le monde'));assert.ok(m1);
 g.send({t:'chat',text:'va sur https://evil.com'});const m2=await a.wait(m=>m.chat&&m.chat.some(x=>x.text==='va sur ***'));assert.ok(m2);
 g.send({t:'chat',text:'trop vite'});assert.equal((await g.wait(m=>m.t==='err')).code,'slow_down');
 await s.close()});
test('W7 anti-spam : inondation de messages → connexion fermée (4429)',async()=>{const s=await open();
 const a=await join(s.port);await a.wait(m=>m.t==='welcome');for(let i=0;i<400;i++)a.send({t:'pos',x:i%10,z:0});
 assert.equal((await a.closedP()).code,4429);await s.close()});
test('W8 messages invalides : JSON, binaire, gros message',async()=>{const s=await open();
 const a=await join(s.port);await a.wait(m=>m.t==='welcome');a.ws.send('pas du json');a.ws.send(Buffer.from([1,2,3]));a.send({t:'inconnu'});
 a.ws.send('x'.repeat(9000));assert.ok([1009,1006].includes((await a.closedP()).code));await s.close()});
test('W9 limites : connexions totales, par IP, origine, chemin, délai de join',async()=>{
 let s=await open({realtime:{maxConnections:2}});const a=client(s.port),b=client(s.port);await a.opened;await b.opened;
 await assert.rejects(()=>client(s.port).opened,e=>e.status===503);a.ws.close();b.ws.close();await s.close();
 s=await open({realtime:{perIp:1}});const c=client(s.port);await c.opened;await assert.rejects(()=>client(s.port).opened,e=>e.status===429);c.ws.close();await s.close();
 s=await open({srv:{cors:'https://nzassa.example'}});await assert.rejects(()=>client(s.port,{headers:{origin:'https://evil.example'}}).opened,e=>e.status===403);
 const ok=client(s.port,{headers:{origin:'https://nzassa.example'}});await ok.opened;ok.ws.close();
 await assert.rejects(()=>client(s.port,{path:'/autre'}).opened,e=>e.status===404);
 const idle=client(s.port);await idle.opened;assert.equal((await idle.closedP()).code,4408);await s.close()});
test('W10 capacité : le 51e joueur est refusé proprement (server_full), les autres restent',async()=>{
 const s=await open({srv:{limits:{maxTotal:3,maxPlayers:3}},realtime:{maxConnections:10,perIp:10}});
 const cs=[];for(let i=0;i<3;i++){const c=await join(s.port,{name:'J'+i});await c.wait(m=>m.t==='welcome');cs.push(c)}
 const x=await join(s.port,{name:'Trop'});assert.equal((await x.wait(m=>m.t==='err')).code,'server_full');assert.equal((await x.closedP()).code,4503);
 assert.equal(s.srv.world.stats().players,3);cs.forEach(c=>c.ws.close());await s.close()});
test('W11 session expirée : avertissement puis fermeture 4401',async()=>{
 const s=await open({srv:{verifyToken:async()=>({sub:'44444444-4444-4444-8444-444444444444',exp:Math.floor(clock/1000)+60})}});
 const a=await join(s.port,{token:'e.e.e'});await a.wait(m=>m.t==='welcome');clock+=61000;s.srv.realtime.tick();
 await a.wait(m=>m.t==='expired');assert.equal((await a.closedP()).code,4401);clock-=61000;await s.close()});
test('W12 arrêt propre : les clients reçoivent « bye » et un code de redémarrage 1012',async()=>{
 const s=await open();const a=await join(s.port);await a.wait(m=>m.t==='welcome');
 const done=s.srv.realtime.close();await a.wait(m=>m.t==='bye');assert.equal((await a.closedP()).code,1012);await done;s.srv.close()});
test('W13 reconnexion après coupure : nouvelle session, pas de doublon fantôme',async()=>{const s=await open();
 const a=await join(s.port,{name:'Awa'});await a.wait(m=>m.t==='welcome');a.ws.terminate();await new Promise(r=>setTimeout(r,100));
 assert.equal(s.srv.world.stats().players,0,'la coupure libère la place');
 const a2=await join(s.port,{name:'Awa'});const w=await a2.wait(m=>m.t==='welcome');assert.equal(w.name,'Awa');a2.ws.close();await s.close()});

/* ---- Étape 2 : proxy et noms réservés (vrai serveur, vraies connexions) ---- */
test('W14 proxy non fiable : un client ne peut pas contourner la limite par IP en falsifiant X-Forwarded-For',async()=>{
 const s=await open({realtime:{perIp:1,maxConnections:10}});const a=client(s.port,{headers:{'x-forwarded-for':'1.1.1.1'}});await a.opened;
 await assert.rejects(()=>client(s.port,{headers:{'x-forwarded-for':'2.2.2.2'}}).opened,e=>e.status===429);a.ws.close();await s.close()});
test('W15 proxy approuvé : la limite s’applique à l’IP vue par NOTRE proxy (entrée de droite), pas à l’IP écrite par le client',async()=>{
 const s=await open({srv:{trustedProxies:['loopback'],proxyHops:1},realtime:{perIp:1,maxConnections:10}});
 const a=client(s.port,{headers:{'x-forwarded-for':'evil, 5.5.5.5'}});await a.opened;
 await assert.rejects(()=>client(s.port,{headers:{'x-forwarded-for':'autre-mensonge, 5.5.5.5'}}).opened,e=>e.status===429,'même IP réelle → refus malgré un en-tête différent à gauche');
 const b=client(s.port,{headers:{'x-forwarded-for':'x, 6.6.6.6'}});await b.opened;a.ws.close();b.ws.close();await s.close()});
test('W15b proxy NON approuvé (la connexion vient de 127.0.0.1, seul 10.0.0.0/8 est approuvé) : X-Forwarded-For n’a aucun effet',async()=>{
 const s=await open({srv:{trustedProxies:['10.0.0.0/8']},realtime:{perIp:1,maxConnections:10}});
 const a=client(s.port,{headers:{'x-forwarded-for':'5.5.5.5'}});await a.opened;
 await assert.rejects(()=>client(s.port,{headers:{'x-forwarded-for':'6.6.6.6'}}).opened,e=>e.status===429,'les deux viennent de 127.0.0.1 : la limite les compte ensemble');a.ws.close();await s.close()});
test('W15c /health?detail=1 aide à vérifier la configuration du proxy (pair, en-tête, IP retenue) — jamais en public',async()=>{
 const s=await open({srv:{trustedProxies:['loopback'],metricsToken:'jeton-secret-123'}});
 const pub=await (await fetch('http://127.0.0.1:'+s.port+'/health?detail=1',{headers:{'x-forwarded-for':'7.7.7.7'}})).json();assert.equal(pub.proxy,undefined,'sans jeton : aucun détail');
 const det=await (await fetch('http://127.0.0.1:'+s.port+'/health?detail=1',{headers:{'x-nzassa-metrics':'jeton-secret-123','x-forwarded-for':'x, 7.7.7.7'}})).json();
 assert.equal(det.proxy.peerIsApproved,true);assert.equal(det.proxy.resolvedClientIp,'7.7.7.7');await s.close()});
test('W16 noms réservés : un invité ne peut pas prendre le pseudo d’un compte ; le propriétaire le peut ; un autre compte non',async()=>{
 const OWNER='77777777-7777-4777-8777-777777777777',OTHER='88888888-8888-4888-8888-888888888888';
 const guard={strict:false,check:async(name,token)=>{if(name.toLowerCase()!=='kofi_b')return false;return token!=='owner.t.k'}};
 const s=await open({srv:{nameGuard:guard,verifyToken:async t=>t==='owner.t.k'?{sub:OWNER,exp:0}:t==='other.t.k'?{sub:OTHER,exp:0}:null}});
 let c=await join(s.port,{name:'Kofi_B'});assert.equal((await c.wait(m=>m.t==='err')).code,'name_reserved');assert.equal((await c.closedP()).code,4409);
 c=await join(s.port,{name:'kofi_b',token:'other.t.k'});assert.equal((await c.wait(m=>m.t==='err')).code,'name_reserved');
 c=await join(s.port,{name:'Kofi_B',token:'owner.t.k'});assert.equal((await c.wait(m=>m.t==='welcome')).kind,'authenticated');
 c=await join(s.port,{name:'Autre'});assert.equal((await c.wait(m=>m.t==='welcome')).name,'Autre');await s.close()});
test('W17 noms réservés : réponse inconnue → on laisse jouer (par défaut) ; mode strict → refus',async()=>{
 let s=await open({srv:{nameGuard:{strict:false,check:async()=>null}}});let c=await join(s.port,{name:'Awa'});await c.wait(m=>m.t==='welcome');await s.close();
 s=await open({srv:{nameGuard:{strict:true,check:async()=>null}}});c=await join(s.port,{name:'Awa'});assert.equal((await c.wait(m=>m.t==='err')).code,'name_reserved');await s.close()});
