'use strict';
/* Client WebSocket du navigateur (js/online/socket.js + js/online/world.js) contre le VRAI serveur, via de vraies connexions WebSocket (module « ws » côté Node). */
const test=require('node:test'),assert=require('node:assert');
const WebSocket=require('ws');
const {createServer}=require('../server/server.cjs');
const S=require('../js/online/socket.js'),W=require('../js/online/world.js');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const UID='66666666-6666-4666-8666-666666666666';
const start=async(port,o)=>{const srv=createServer(Object.assign({legacy:false,realtime:{tickMs:20},verifyToken:async t=>t==='good.t.k'?{sub:UID,exp:0}:null},o||{}));
 await new Promise(r=>srv.listen(port||0,'127.0.0.1',r));return srv};
const url=srv=>'ws://127.0.0.1:'+srv.address().port+'/v1/ws';
const mkClient=(srv,extra,me)=>{const api=S.create(Object.assign({url:url(srv),WebSocket,backoffMs:250,joinTimeoutMs:2000},extra||{}));
 const w=W.create({api,me:me||(()=>({x:0,z:0,h:0,moving:false}))});return {api,w}};
const until=async(f,ms)=>{const t=Date.now();while(Date.now()-t<(ms||2000)){if(f())return true;await sleep(15)}return false};

test('C1 invité et compte se voient, bavardent, se déplacent (client réel ↔ serveur réel)',async()=>{
 const srv=await start();let pos={x:0,z:0,h:0,moving:false};
 const g=mkClient(srv,null,()=>pos),a=mkClient(srv,{getToken:async()=>'good.t.k'});
 const jg=await g.w.join({name:'Invite',room:'wolof',consent:true,x:0,z:0});const ja=await a.w.join({name:'Kofi',room:'wolof',consent:true,x:3,z:0,requireToken:true});
 assert.equal(jg.kind,'guest_online');assert.equal(ja.kind,'authenticated');
 g.w.start(30);a.w.start(30);
 assert.ok(await until(()=>g.w.players.size===1&&a.w.players.size===1),'présence réciproque');
 assert.equal([...g.w.players.values()][0].k,'a');assert.equal([...a.w.players.values()][0].k,'g');
 pos={x:12,z:5,h:1,moving:true};assert.ok(await until(()=>[...a.w.players.values()][0].tx===12),'déplacement reçu');
 a.w.say('Bonjour le village');assert.ok(await until(()=>g.w.chat.some(m=>m.text==='Bonjour le village'&&m.name==='Kofi')),'chat reçu');
 await g.w.leave();await a.w.leave();await sleep(60);assert.equal(srv.world.stats().players,0);await new Promise(r=>srv.close(r))});
test('C2 compte sans jeton : refus immédiat côté client, AUCUNE connexion ouverte',async()=>{
 const srv=await start();const c=mkClient(srv,{getToken:async()=>null});
 await assert.rejects(()=>c.w.join({name:'Kofi',room:'wolof',consent:true,requireToken:true}),e=>e.code==='bad_token'&&e.fatal===true);
 assert.equal(srv.realtime.size(),0);await new Promise(r=>srv.close(r))});
test('C3 jeton refusé par le serveur : erreur fatale, aucune connexion conservée',async()=>{
 const srv=await start();const c=mkClient(srv,{getToken:async()=>'bad.t.k'});
 await assert.rejects(()=>c.w.join({name:'Kofi',room:'wolof',consent:true,requireToken:true}),e=>e.code==='bad_token');
 assert.equal(srv.world.stats().players,0);await new Promise(r=>srv.close(r))});
test('C4 coupure réseau : reconnexion automatique, présence restaurée, messages après redémarrage du serveur',async()=>{
 let srv=await start();const port=srv.address().port;
 const a=mkClient(srv),b=mkClient(srv);await a.w.join({name:'Awa',room:'wolof',consent:true,x:0,z:0});await b.w.join({name:'Bo',room:'wolof',consent:true,x:1,z:1});a.w.start(30);b.w.start(30);
 assert.ok(await until(()=>a.w.players.size===1));
 a.w.say('avant');assert.ok(await until(()=>b.w.chat.some(m=>m.text==='avant')));
 srv.realtime.terminateAll();assert.ok(await until(()=>a.w.status==='reconnecting',1500),'statut « reconnexion »');
 assert.ok(await until(()=>a.w.status==='online'&&a.w.players.size===1,4000),'reconnecté et présence restaurée');
 /* redémarrage complet du serveur : la numérotation des messages repart de zéro, le client doit quand même recevoir les nouveaux messages */
 await new Promise(r=>srv.close(r));srv=await start(port);
 assert.ok(await until(()=>a.w.status==='online'&&b.w.status==='online'&&a.w.players.size===1,6000),'reconnexion après redémarrage');
 await sleep(700);a.w.say('apres');assert.ok(await until(()=>b.w.chat.some(m=>m.text==='apres'),3000),'chat reçu après redémarrage du serveur');
 await a.w.leave();await b.w.leave();await new Promise(r=>srv.close(r))});
test('C5 jeton refusé pendant une reconnexion : arrêt définitif signalé (onFatal), pas de boucle',async()=>{
 let good=true,fatal=null;const srv=await start(0,{verifyToken:async t=>good&&t==='good.t.k'?{sub:UID,exp:0}:null});
 const a=mkClient(srv,{getToken:async()=>'good.t.k',onFatal:e=>{fatal=e}});await a.w.join({name:'Kofi',room:'wolof',consent:true,requireToken:true});a.w.start(30);
 good=false;srv.realtime.terminateAll();assert.ok(await until(()=>!!fatal,4000),'onFatal appelé');assert.equal(fatal.code,'bad_token');
 const n=srv.realtime.metrics.accepted;await sleep(400);assert.equal(srv.realtime.metrics.accepted,n,'plus aucune tentative');await a.w.leave();await new Promise(r=>srv.close(r))});
test('C6 leave() : plus aucune reconnexion',async()=>{
 const srv=await start();const a=mkClient(srv);await a.w.join({name:'Awa',room:'wolof',consent:true});a.w.start(30);await a.w.leave();const n=srv.realtime.metrics.accepted;
 await sleep(400);assert.equal(srv.realtime.metrics.accepted,n);assert.equal(srv.world.stats().players,0);await new Promise(r=>srv.close(r))});
test('C7 erreur de chat (cadence) remontée au client, connexion conservée',async()=>{
 const srv=await start();const a=mkClient(srv);const errs=[];a.w.onChat=null;
 const c=S.create({url:url(srv),WebSocket});const w=W.create({api:c,onChat:m=>{if(m.err)errs.push(m)}});await w.join({name:'Awa',room:'wolof',consent:true});w.start(30);
 w.say('un');await sleep(60);w.say('deux');assert.ok(await until(()=>errs.length>0,1500));assert.equal(w.status,'online');await w.leave();await new Promise(r=>srv.close(r))});
