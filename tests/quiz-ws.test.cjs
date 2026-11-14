'use strict';
/* Tests RÉELS du quiz : vrai serveur HTTP + vraies connexions WebSocket (127.0.0.1), horloge réelle.
   Seule la vérification Supabase est simulée (jetons de test). Les bonnes réponses sont lues dans le moteur du serveur (privilège de test) :
   un vrai client ne les reçoit jamais. */
const test=require('node:test'),assert=require('node:assert');
const WebSocket=require('ws');
const {createServer}=require('../server/server.cjs'),S=require('../js/quiz/scoring.js');
const T=S.TEACHER,TOK={'tok.a.a':'11111111-1111-4111-8111-111111111111','tok.b.b':'22222222-2222-4222-8222-222222222222','tok.c.c':'33333333-3333-4333-8333-333333333333'};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function open(over){const srv=createServer({secret:'t',legacy:false,verifyToken:async t=>TOK[t]?{sub:TOK[t],exp:0}:null,realtime:{tickMs:25,joinTimeoutMs:1500},quiz:{config:Object.assign({countdownMs:300,revealMs:50,questions:10,timeMs:3000,disconnectGraceMs:2000},over||{})}});
 await new Promise(r=>srv.listen(0,'127.0.0.1',r));return {srv,port:srv.address().port,close:()=>new Promise(r=>{srv.close(r);srv.closeAllConnections&&srv.closeAllConnections()})}}
function client(port){const ws=new WebSocket('ws://127.0.0.1:'+port+'/v1/ws'),c={ws,msgs:[],closed:null,waiters:[]};
 ws.on('message',d=>{const m=JSON.parse(d);c.msgs.push(m);if(m.t==='qzp')ws.send(JSON.stringify({t:'qzp',n:m.n}));c.waiters=c.waiters.filter(w=>!w(m))});
 ws.on('close',code=>{c.closed=code;c.waiters=c.waiters.filter(w=>!w(null))});c.opened=new Promise((ok,ko)=>{ws.on('open',ok);ws.on('error',ko)});c.send=m=>ws.send(JSON.stringify(m));
 c.qz=ev=>c.msgs.filter(m=>m.t==='qz'&&m.ev===ev);
 c.wait=(f,ms)=>new Promise((ok,ko)=>{const h=c.msgs.find(f);if(h)return ok(h);const to=setTimeout(()=>ko(new Error('délai dépassé')),ms||5000);c.waiters.push(m=>{if(m&&f(m)){clearTimeout(to);ok(m);return true}if(!m){clearTimeout(to);ko(new Error('fermé'));return true}return false})});
 c.ev=(ev,ms)=>c.wait(m=>m.t==='qz'&&m.ev===ev,ms);return c}
async function join(port,o){o=o||{};const c=client(port);await c.opened;c.send({t:'join',name:o.name||'Joueur',room:o.room||'wolof',consent:true,x:o.x==null?T.x:o.x,z:o.z==null?T.z:o.z,token:o.token});const w=await c.wait(m=>m.t==='welcome');c.id=w.id;c.kind=w.kind;return c}
const matchOf=(s,c)=>[...s.srv.quiz._matches.values()].find(m=>m.players.some(p=>p.pub===c.id));
/* joue le match en répondant (bien ou mal) dès que chaque question arrive */
async function playAll(s,cs,pick){for(let i=0;i<10;i++){await Promise.all(cs.map(async(c)=>{const q=await c.wait(m=>m.t==='qz'&&m.ev==='q'&&m.q.i===i,6000);const mt=matchOf(s,c);const ans=mt.questions[i].answer;const mine=pick(c,i,ans);if(mine)c.send({t:'qz',op:'ans',m:mt.id,i,c:mine})}));await Promise.all(cs.map(c=>c.wait(m=>m.t==='qz'&&(m.ev==='r'&&m.i===i),6000)))}}
const other=a=>['a','b','c','d'].find(x=>x!==a);

test('QW1 solo complet avec un vrai serveur : questions sans réponse, 10 résultats, classement du compte, Top 10 poussé au village',async()=>{
 const s=await open();const a=await join(s.port,{name:'Ama',token:'tok.a.a'}),spy=await join(s.port,{name:'Voisin',x:0,z:0}),autre=await join(s.port,{name:'Ailleurs',room:'bambara'});
 a.send({t:'qz',op:'start'});const st=await a.ev('start');assert.equal(st.mode,'solo');assert.equal(st.n,10);assert.equal(st.ranked,true);
 await playAll(s,[a],(c,i,ans)=>ans);const end=await a.ev('end');
 assert.ok(a.qz('q').every(m=>!('answer' in m.q)&&!('explanation' in m.q)),'jamais de bonne réponse avant la révélation');
 assert.equal(end.rank.ranked,true);assert.equal(end.rank.rank,1);assert.ok(end.you.score>=1000&&end.you.score<=1500);assert.equal(end.you.answers.length,10);
 const top=await spy.wait(m=>m.t==='qz'&&m.ev==='top');assert.equal(top.village,'wolof');assert.equal(top.top.length,1);assert.equal(top.top[0].name,'Ama');
 await sleep(200);assert.equal(autre.qz('top').length,0,'un autre village ne reçoit pas le classement');
 assert.equal(JSON.stringify(top).includes(TOK['tok.a.a']),false,'aucun identifiant de compte diffusé');
 await s.close()});
test('QW2 duel : mêmes questions pour les deux joueurs, vainqueur par score, résultat identique des deux côtés',async()=>{
 const s=await open();const a=await join(s.port,{name:'Ama',token:'tok.a.a'}),b=await join(s.port,{name:'Bo',token:'tok.b.b'});
 a.send({t:'qz',op:'challenge',to:b.id});const iv=await b.ev('inv');assert.equal(iv.from.name,'Ama');await a.ev('invSent');
 b.send({t:'qz',op:'accept',inv:iv.inv});await a.ev('start');await b.ev('start');
 await playAll(s,[a,b],(c,i,ans)=>c===a?ans:(i%2?ans:other(ans)));
 const ea=await a.ev('end'),eb=await b.ev('end');
 assert.deepEqual(a.qz('q').map(m=>m.q),b.qz('q').map(m=>m.q),'questions strictement identiques, même ordre, mêmes propositions');
 assert.equal(a.qz('q').length,10);assert.equal(ea.outcome,'win');assert.equal(eb.outcome,'loss');assert.equal(ea.you.score,eb.opp.score);assert.equal(eb.you.score,ea.opp.score);assert.ok(ea.you.score>eb.you.score);
 assert.equal(ea.rank.ranked,true);assert.equal(eb.rank.ranked,true);
 await s.close()});
test('QW3 invité en ligne : peut jouer et défier, jamais classé ; aucun classement poussé',async()=>{
 const s=await open();const g=await join(s.port,{name:'Invite'}),a=await join(s.port,{name:'Ama',token:'tok.a.a'});assert.equal(g.kind,'guest_online');
 g.send({t:'qz',op:'challenge',to:a.id});const iv=await a.ev('inv');a.send({t:'qz',op:'accept',inv:iv.inv});await g.ev('start');
 await playAll(s,[g,a],(c,i,ans)=>c===g?ans:other(ans));const eg=await g.ev('end'),ea=await a.ev('end');
 assert.equal(eg.outcome,'win');assert.equal(eg.rank.ranked,false);assert.equal(eg.rank.reason,'invité');assert.equal(ea.rank.ranked,true,'le compte, lui, est classé même s’il perd');
 g.send({t:'qz',op:'top'});const tp=await g.wait(m=>m.t==='qz'&&m.ev==='top'&&m.top.length>0);assert.ok(tp.top.every(x=>x.name!=='Invite'));await s.close()});
test('QW4 validation serveur : champs forgés, temps/score envoyés par le client, doublons, mauvais match, hors tour',async()=>{
 const s=await open();const a=await join(s.port,{name:'Ama',token:'tok.a.a'});a.send({t:'qz',op:'start'});await a.ev('start');const q=await a.wait(m=>m.t==='qz'&&m.ev==='q');
 const mt=matchOf(s,a);
 a.send({t:'qz',op:'ans',m:mt.id,i:q.q.i,c:'zzz'});await a.wait(m=>m.t==='qz'&&m.ev==='err'&&m.code==='bad_choice');
 a.send({t:'qz',op:'ans',m:mt.id,i:q.q.i,c:mt.questions[0].answer,ms:1,rtt:0,score:99999,points:99999,time:0});await a.ev('r');
 const r=a.qz('r')[0];assert.ok(r.you.pts<=150,'points calculés par le serveur : '+r.you.pts);assert.ok(r.you.ms>=0);
 a.send({t:'qz',op:'ans',m:mt.id,i:0,c:'a'});a.send({t:'qz',op:'ans',m:'faux',i:1,c:'a'});a.send({t:'qz',op:'ans',m:mt.id,i:7,c:'a'});
 await sleep(300);const codes=a.qz('err').map(m=>m.code);assert.ok(codes.includes('stale')||codes.includes('duplicate'));assert.ok(codes.includes('no_match'));
 assert.ok(mt.players[0].score<=150);await s.close()});
test('QW5 permissions : trop loin de l’enseignant, hors village, défi à soi-même, à un absent',async()=>{
 const s=await open();const far=await join(s.port,{name:'Loin',x:0,z:0}),a=await join(s.port,{name:'Ama',token:'tok.a.a'}),prive=await join(s.port,{name:'Prive',room:'salon-prive'});
 far.send({t:'qz',op:'start'});assert.equal((await far.ev('err')).code,'too_far');
 prive.send({t:'qz',op:'start'});assert.equal((await prive.ev('err')).code,'no_village');
 a.send({t:'qz',op:'challenge',to:a.id});assert.equal((await a.ev('err')).code,'self');await sleep(2100);
 a.send({t:'qz',op:'challenge',to:'inconnu'});assert.ok((await a.wait(m=>m.t==='qz'&&m.ev==='err'&&m.code==='not_found')));
 await s.close()});
test('QW6 déconnexion et reprise en solo avec un vrai socket coupé ; jeton de reprise',async()=>{
 const s=await open();let a=await join(s.port,{name:'Ama',token:'tok.a.a'});a.send({t:'qz',op:'start'});const st=await a.ev('start');await a.wait(m=>m.t==='qz'&&m.ev==='q');
 a.ws.terminate();await sleep(300);
 const a2=await join(s.port,{name:'Ama',token:'tok.a.a'});a2.send({t:'qz',op:'resume',m:st.m,token:st.resume});const rs=await a2.ev('resume');assert.equal(rs.phase,'ask');assert.equal(rs.you,0);assert.ok(rs.q);assert.ok(!('answer' in rs.q));
 const x=await join(s.port,{name:'Pirate',token:'tok.b.b'});x.send({t:'qz',op:'resume',m:st.m,token:st.resume});assert.ok(['bad_identity','busy','no_match'].includes((await x.ev('err')).code),'un autre compte ne peut pas reprendre');
 await s.close()});
test('QW7 déconnexion en duel : l’adversaire est prévenu, puis forfait ; le survivant termine et gagne',async()=>{
 const s=await open({disconnectGraceMs:2000,timeMs:2000});const a=await join(s.port,{name:'Ama',token:'tok.a.a'}),b=await join(s.port,{name:'Bo',token:'tok.b.b'});
 a.send({t:'qz',op:'challenge',to:b.id});b.send({t:'qz',op:'accept',inv:(await b.ev('inv')).inv});await a.ev('start');await b.ev('start');await a.wait(m=>m.t==='qz'&&m.ev==='q');
 b.ws.terminate();assert.ok(await a.ev('oppDown'));assert.ok(await a.ev('oppLeft',6000),'forfait après la grâce');
 await playAll(s,[a],(c,i,ans)=>ans);const e=await a.ev('end',8000);assert.equal(e.outcome,'win');assert.equal(e.reason,'forfait');await s.close()});
test('QW8 abandon volontaire : l’adversaire gagne, rien n’est classé pour celui qui part',async()=>{
 const s=await open();const a=await join(s.port,{name:'Ama',token:'tok.a.a'}),b=await join(s.port,{name:'Bo',token:'tok.b.b'});
 a.send({t:'qz',op:'challenge',to:b.id});b.send({t:'qz',op:'accept',inv:(await b.ev('inv')).inv});await a.ev('start');await a.wait(m=>m.t==='qz'&&m.ev==='q');
 a.send({t:'qz',op:'abandon'});await a.ev('left');await b.ev('oppLeft');await playAll(s,[b],(c,i,ans)=>ans);const e=await b.ev('end');assert.equal(e.outcome,'win');
 b.send({t:'qz',op:'top'});const tp=await b.wait(m=>m.t==='qz'&&m.ev==='top'&&m.top.length===1);assert.equal(tp.top[0].name,'Bo');await s.close()});
test('QW9 débit : une rafale de messages quiz est limitée par la connexion',async()=>{
 const s=await open();const a=await join(s.port,{name:'Ama',token:'tok.a.a'});for(let i=0;i<200;i++)a.send({t:'qz',op:'ans',m:'x',i:0,c:'a'});await sleep(600);
 assert.ok(a.qz('err').length<200,'limite de débit appliquée');await s.close()});
test('QW10 quiz désactivé (quiz:false) : message refusé proprement, serveur intact',async()=>{
 const srv=createServer({secret:'t',legacy:false,quiz:false});await new Promise(r=>srv.listen(0,'127.0.0.1',r));const c=await join(srv.address().port,{name:'Xy'});c.send({t:'qz',op:'start'});
 assert.equal((await c.wait(m=>m.t==='err')).code,'quiz_unavailable');await new Promise(r=>{srv.close(r);srv.closeAllConnections()})});
