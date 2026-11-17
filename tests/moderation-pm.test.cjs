'use strict';
/* Modération (filtre de mots) + messages privés 1-à-1 : unité du filtre + vrai serveur WebSocket. */
const test=require('node:test'),assert=require('node:assert'),WebSocket=require('ws');
const {createServer}=require('../server/server.cjs');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const opened=new Set();test.after(async()=>{for(const s of opened)await s.close()});
async function open(rt){const srv=createServer({secret:'t',legacy:false,quiz:false,realtime:Object.assign({tickMs:25,joinTimeoutMs:1500},rt||{})});await new Promise(r=>srv.listen(0,'127.0.0.1',r));
 const s={srv,port:srv.address().port,cl:[],close:async()=>{if(!opened.has(s))return;opened.delete(s);for(const c of s.cl)try{c.ws.terminate()}catch(e){}await new Promise(r=>{srv.close(r);srv.closeAllConnections&&srv.closeAllConnections()})}};opened.add(s);return s}
async function join(s,name,x,z,room){const ws=new WebSocket('ws://127.0.0.1:'+s.port+'/v1/ws'),c={ws,msgs:[]};s.cl.push(c);ws.on('message',d=>c.msgs.push(JSON.parse(d)));
 await new Promise((ok,ko)=>{ws.on('open',ok);ws.on('error',ko)});c.send=m=>ws.send(JSON.stringify(m));c.send({t:'join',name,room:room||'wolof',consent:true,x,z});
 c.wait=async(f,ms)=>{const t=Date.now();while(Date.now()-t<(ms||3000)){const h=c.msgs.find(f);if(h)return h;await sleep(15)}throw new Error('délai dépassé')};
 const w=await c.wait(m=>m.t==='welcome');c.id=w.id;return c}
const {screen}=require('../server/wordfilter.cjs');

test('M1 filtre : bloque insultes, haine, menaces, harcèlement, contournements ; laisse passer le français ordinaire',()=>{
 for(const [txt,cat] of [['tu es un connard','insulte'],['c0nn@rd','insulte'],['c o n n a r d','insulte'],['conaaard','insulte'],['sale noir','haine'],['sale Peul','haine'],['tous les étrangers','haine'],['je vais te tuer','menace'],['suicide-toi','harcelement'],['kill yourself','harcelement'],['donne ton numéro','coordonnees'],['ajoute-moi sur snap','coordonnees']])
  assert.equal((screen(txt)||{}).cat,cat,txt);
 for(const ok of ['Salut, bonjour !','on fait un pique-nique','je suis en retard','un baiser','mon ami est Peul','Les Wolofs sont gentils','Awalé : je prends 4 graines','classe de CM2','Scunthorpe assassin','Bienvenue au village','merci beaucoup'])
  assert.equal(screen(ok),null,ok)});

test('M2 chat du village : message refusé (code blocked), non publié ; 3 refus → silence 10 min',async()=>{
 const s=await open();const a=await join(s,'Ama',0,0),b=await join(s,'Bo',2,0);
 a.send({t:'chat',text:'espèce de connard'});const e=await a.wait(m=>m.t==='err');assert.equal(e.code,'blocked');assert.match(e.error,/refusé/);
 await sleep(100);assert.ok(!s.srv.world.room('wolof').chat.some(m=>/connard/.test(m.text)),'rien publié');
 a.msgs.length=0;a.send({t:'chat',text:'sale noir',near:true});assert.equal((await a.wait(m=>m.t==='err')).code,'blocked');
 a.msgs.length=0;a.send({t:'pm',to:b.id,text:'je vais te tuer'});assert.equal((await a.wait(m=>m.t==='err')).code,'muted','3e refus en 10 min : silence');
 await sleep(50);a.msgs.length=0;a.send({t:'chat',text:'bonjour tout le monde'});assert.equal((await a.wait(m=>m.t==='err')).code,'muted','même un message correct est bloqué pendant le silence');
 assert.equal(b.msgs.filter(m=>m.t==='pm'||m.t==='nc').length,0,'le destinataire ne reçoit rien');await s.close()});

test('M3 pseudo irrespectueux refusé à l’entrée',async()=>{
 const s=await open();const ws=new WebSocket('ws://127.0.0.1:'+s.port+'/v1/ws'),msgs=[];ws.on('message',d=>msgs.push(JSON.parse(d)));await new Promise(r=>ws.on('open',r));
 ws.send(JSON.stringify({t:'join',name:'Connard',room:'wolof',consent:true}));const t=Date.now();while(!msgs.some(m=>m.t==='err')&&Date.now()-t<2000)await sleep(20);
 assert.equal(msgs.find(m=>m.t==='err').code,'bad_name');ws.terminate();await s.close()});

test('P1 message privé : seul le destinataire (et l’expéditeur en écho) le reçoit ; pas d’historique, pas d’autre village ; cible absente refusée',async()=>{
 const s=await open();const a=await join(s,'Ama',0,0),b=await join(s,'Bo',90,90),c=await join(s,'Cy',1,1),o=await join(s,'Autre',0,0,'lingala');
 a.send({t:'pm',to:b.id,text:'Salut Bo, tu viens jouer à l’awalé ?'});const got=await b.wait(m=>m.t==='pm');await sleep(150);
 assert.equal(got.m.text,'Salut Bo, tu viens jouer à l’awalé ?');assert.equal(got.m.name,'Ama');assert.equal(got.m.id,a.id);assert.ok(!got.m.mine);
 const echo=await a.wait(m=>m.t==='pm');assert.equal(echo.m.mine,true);assert.equal(echo.m.toName,'Bo');
 assert.equal(c.msgs.filter(m=>m.t==='pm').length,0,'un tiers du même village ne lit rien');assert.equal(o.msgs.filter(m=>m.t==='pm').length,0,'autre village : rien');
 assert.ok(!s.srv.world.room('wolof').chat.some(m=>/awalé/.test(m.text)),'hors historique public');
 a.msgs.length=0;a.send({t:'pm',to:o.id,text:'coucou'});assert.equal((await a.wait(m=>m.t==='err')).code,'not_found','joueur d’un autre village');
 await sleep(1600);a.msgs.length=0;a.send({t:'pm',to:'zzzz',text:'coucou'});assert.equal((await a.wait(m=>m.t==='err')).code,'not_found');
 await sleep(1600);a.msgs.length=0;a.send({t:'pm',to:a.id,text:'moi-même'});assert.equal((await a.wait(m=>m.t==='err')).code,'not_found','pas à soi-même');await s.close()});

test('P2 message privé : mêmes limites de débit que le chat, liens masqués',async()=>{
 const s=await open();const a=await join(s,'Ama',0,0),b=await join(s,'Bo',2,0);
 a.send({t:'pm',to:b.id,text:'regarde www.exemple.com'});const g=await b.wait(m=>m.t==='pm');assert.ok(!/exemple/.test(g.m.text));
 a.msgs.length=0;a.send({t:'pm',to:b.id,text:'encore'});assert.equal((await a.wait(m=>m.t==='err')).code,'slow_down');await s.close()});
