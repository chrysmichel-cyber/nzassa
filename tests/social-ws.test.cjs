'use strict';
/* Phase 4 (social) : vrai serveur HTTP + vrais WebSocket (127.0.0.1). Chat de proximité, emotes, danse collective, déconnexion pendant une emote. */
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
const near=c=>c.msgs.filter(m=>m.t==='nc');

test('S1 chat de proximité : reçu par les joueurs proches (et l’expéditeur), pas par les éloignés ni un autre village ; hors historique',async()=>{
 const s=await open();const a=await join(s,'Ama',0,0),b=await join(s,'Bo',5,5),far=await join(s,'Loin',60,0),other=await join(s,'Autre',1,1,'lingala');
 a.send({t:'chat',text:'Salut à côté',near:true});await b.wait(m=>m.t==='nc');await a.wait(m=>m.t==='nc');await sleep(150);
 assert.equal(near(b)[0].m.text,'Salut à côté');assert.equal(near(b)[0].m.name,'Ama');assert.equal(near(far).length,0,'joueur éloigné : rien');assert.equal(near(other).length,0,'autre village : rien');
 assert.ok(!s.srv.world.room('wolof').chat.some(m=>m.text==='Salut à côté'),'le message de proximité n’entre pas dans l’historique du village');
 /* mêmes règles que le chat : nettoyage des liens, débit */
 await sleep(3100);a.send({t:'chat',text:'va sur www.exemple.com',near:true});const m2=await b.wait(m=>m.t==='nc'&&m.m.text!=='Salut à côté');assert.ok(!/exemple/.test(m2.m.text));
 a.send({t:'chat',text:'trop vite',near:true});const e=await a.wait(m=>m.t==='err');assert.equal(e.code,'slow_down');await s.close()});

test('S2 emotes : liste fermée, débit limité, diffusées aux voisins et aux nouveaux arrivants ; « assis » s’arrête au déplacement',async()=>{
 const s=await open();const a=await join(s,'Ama',0,0),b=await join(s,'Bo',3,0);await sleep(150);
 a.send({t:'emote',id:'pirouette'});assert.equal((await a.wait(m=>m.t==='err')).code,'bad_emote');
 a.send({t:'emote',id:'salut'});const d=await b.wait(m=>m.t==='s'&&m.mv&&m.mv.some(x=>x[0]===a.id&&x[5]==='salut'));assert.ok(d);
 a.send({t:'emote',id:'bravo'});assert.equal((await a.wait(m=>m.t==='err'&&m.code==='slow_down')).code,'slow_down','débit des emotes');
 await sleep(1300);a.send({t:'emote',id:'assis'});await b.wait(m=>m.t==='s'&&m.mv&&m.mv.some(x=>x[0]===a.id&&x[5]==='assis'));
 /* un nouvel arrivant voit l'emote en cours */
 const c=await join(s,'Cy',2,2);const add=await c.wait(m=>m.t==='s'&&m.add&&m.add.some(p=>p.id===a.id)||m.t==='welcome'&&m.state.players.some(p=>p.id===a.id));assert.ok(add);
 const ad=c.msgs.find(m=>m.t==='s'&&m.add&&m.add.some(p=>p.id===a.id));if(ad)assert.equal(ad.add.find(p=>p.id===a.id).e,'assis');
 const n0=b.msgs.length;a.send({t:'pos',x:4,z:0,h:0,a:1});await b.wait((m,i)=>m.t==='s'&&m.mv&&m.mv.some(x=>x[0]===a.id&&x.length===5&&x[1]===4));
 assert.equal(s.srv.world.emoteOf([...s.srv.world.sessions.values()].find(x=>x.name==='Ama')),0,'se lever en marchant');await s.close()});

test('S3 activité collective : deux joueurs proches dansent → « danse du village » annoncée au salon, une fois par délai',async()=>{
 const s=await open({danceCooldownMs:5000});const a=await join(s,'Ama',0,0),b=await join(s,'Bo',4,0),w=await join(s,'Witness',50,0),far=await join(s,'Loin',40,40);
 a.send({t:'emote',id:'danse'});await sleep(200);assert.equal(a.msgs.filter(m=>m.t==='act').length,0,'seul : pas d’activité collective');
 far.send({t:'emote',id:'danse'});await sleep(200);assert.equal(a.msgs.filter(m=>m.t==='act').length,0,'danseur trop loin : rien');
 b.send({t:'emote',id:'danse'});const act=await w.wait(m=>m.t==='act');assert.equal(act.id,'danse');assert.deepEqual(act.names.sort(),['Ama','Bo']);
 await sleep(1300);b.send({t:'emote',id:'danse'});await sleep(200);assert.equal(w.msgs.filter(m=>m.t==='act').length,1,'délai entre deux annonces');
 assert.equal(s.srv.realtime.metrics.dances,1);await s.close()});

test('S4 déconnexion pendant une emote : le joueur disparaît proprement chez les autres, sans erreur',async()=>{
 const s=await open();const a=await join(s,'Ama',0,0),b=await join(s,'Bo',3,0);await sleep(150);
 a.send({t:'emote',id:'danse'});await b.wait(m=>m.t==='s'&&m.mv&&m.mv.some(x=>x[5]==='danse'));a.ws.terminate();
 await b.wait(m=>m.t==='s'&&m.rm&&m.rm.includes(a.id));assert.equal(s.srv.world.sessions.size,1);await s.close()});
