'use strict';
/* Tables de jeux : vrai serveur HTTP + vrais WebSocket (127.0.0.1), vraies règles (awalé, échecs, belote). Supabase simulé (jetons de test).
   Les attentes lisent aussi les messages DÉJÀ reçus depuis la dernière action du client (curseur), pour éviter les courses entre clients :
   un message arrivé pendant qu'on attendait un autre client n'est jamais perdu, et chaque message n'est consommé qu'une fois. */
const test=require('node:test'),assert=require('node:assert'),WebSocket=require('ws');
const {createServer}=require('../server/server.cjs');
const TOK={'tok.a.a':'11111111-1111-4111-8111-111111111111','tok.b.b':'22222222-2222-4222-8222-222222222222','tok.c.c':'33333333-3333-4333-8333-333333333333'};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const AW={x:12,z:34},AW2={x:18,z:34},EC={x:12,z:40},CA={x:24,z:40};
const opened=new Set();
test.after(async()=>{for(const s of opened)await s.close()});
async function open(cfg){const srv=createServer({secret:'t',legacy:false,verifyToken:async t=>TOK[t]?{sub:TOK[t],exp:0}:null,realtime:{tickMs:25,joinTimeoutMs:1500},quiz:false,tables:{config:Object.assign({botDelayMs:30,botBudgetMs:30},cfg)}});
 await new Promise(r=>srv.listen(0,'127.0.0.1',r));const clients=new Set();
 const s={srv,port:srv.address().port,clients,close:async()=>{if(!opened.has(s))return;opened.delete(s);for(const c of clients)try{c.ws.terminate()}catch(e){}await new Promise(r=>{srv.close(r);srv.closeAllConnections&&srv.closeAllConnections()})}};
 opened.add(s);return s}
function client(s){const ws=new WebSocket('ws://127.0.0.1:'+s.port+'/v1/ws'),c={ws,msgs:[],used:new Set(),mark:0,waiters:[]};s.clients.add(c);
 ws.on('message',d=>{const m=JSON.parse(d),i=c.msgs.length;c.msgs.push(m);for(const w of c.waiters.slice())if(w(m,i))break});
 c.opened=new Promise((ok,ko)=>{ws.on('open',ok);ws.on('error',ko)});
 c.send=m=>{c.mark=c.msgs.length;ws.send(JSON.stringify(m))};c.tbl=(op,x)=>c.send(Object.assign({t:'tbl',op},x||{}));
 /* attend un message vérifiant f : d'abord parmi ceux reçus depuis la dernière action et pas encore consommés, sinon le prochain */
 c.wait=(f,ms)=>new Promise((ok,ko)=>{
  for(let i=c.mark;i<c.msgs.length;i++)if(!c.used.has(i)&&f(c.msgs[i])){c.used.add(i);return ok(c.msgs[i])}
  const to=setTimeout(()=>{c.waiters=c.waiters.filter(x=>x!==w);ko(new Error('délai dépassé'))},ms||4000);
  const w=(m,i)=>{if(!f(m))return false;c.used.add(i);clearTimeout(to);c.waiters=c.waiters.filter(x=>x!==w);ok(m);return true};c.waiters.push(w)});
 c.ev=(e,ms)=>c.wait(m=>m.t==='tbl'&&m.ev===e,ms);c.err=(code,ms)=>c.wait(m=>m.t==='tbl'&&m.ev==='err'&&(!code||m.code===code),ms);
 return c}
async function join(s,o){o=o||{};const c=client(s);await c.opened;c.send({t:'join',name:o.name||'Joueur',room:o.room||'wolof',consent:true,x:o.x==null?AW.x:o.x,z:o.z==null?AW.z:o.z,token:o.token});
 const w=await c.wait(m=>m.t==='welcome');c.id=w.id;c.kind=w.kind;return c}
const state=(c,pred,ms)=>c.wait(m=>m.t==='tbl'&&m.ev==='state'&&(!pred||pred(m)),ms);

test('TW1 awalé : deux joueurs s’assoient, la partie démarre, coups légaux appliqués, coups illégaux et hors tour refusés',async()=>{
 const s=await open();const a=await join(s,{name:'Ama'}),b=await join(s,{name:'Bo'});
 a.tbl('sit',{table:'awale1'});await a.ev('resume');b.tbl('sit',{table:'awale1'});
 const sb=await state(b,m=>m.phase==='play'),sa=await state(a,m=>m.phase==='play');
 assert.equal(sa.seat,0);assert.equal(sb.seat,1);assert.equal(sa.turn,0);assert.ok(sa.legal.length>0);assert.deepEqual(sb.legal,[]);
 b.tbl('move',{table:'awale1',move:sa.legal[0]});assert.equal((await b.err()).code,'hors_tour');
 a.tbl('move',{table:'awale1',move:{pit:99}});assert.equal((await a.err()).code.length>0,true);
 a.tbl('move',{table:'awale1',move:'pas un objet'});await a.err();
 a.tbl('move',{table:'awale1',move:sa.legal[0]});const s2=await state(b,m=>m.turn===1&&m.last);assert.equal(s2.last.seat,0);assert.equal(s2.hist.length,1);assert.ok(s2.legal.length>0);
 assert.equal(s.srv.tables._tables.size,1);assert.equal(s.srv.tables.metrics.moves,1);await s.close()});

test('TW2 distance vérifiée par le serveur (s’asseoir et observer)',async()=>{
 const s=await open();const far=await join(s,{name:'Loin',x:0,z:0});
 far.tbl('sit',{table:'awale1'});assert.equal((await far.err()).code,'trop_loin');
 far.tbl('watch',{table:'awale1'});assert.equal((await far.err()).code,'trop_loin');await s.close()});

test('TW3 observation et belote avec robots : aucune main cachée dans les vues ; les robots jouent seuls',async()=>{
 const s=await open();const a=await join(s,{name:'Ama',x:CA.x,z:CA.z}),w=await join(s,{name:'Spectateur',x:CA.x+1,z:CA.z});
 a.tbl('sit',{table:'cartes1',game:'belote'});await a.ev('resume');a.tbl('start',{table:'cartes1'});
 const sa=await state(a,m=>m.phase==='play');assert.equal(sa.game,'belote');assert.equal(sa.seats.filter(x=>x&&x.bot).length,3);
 assert.equal(sa.view.hands.filter(h=>h!==null).length,1,'un seul siège voit sa main');assert.ok(Array.isArray(sa.view.hands[sa.seat]));
 w.tbl('watch',{table:'cartes1'});const sw=await state(w);assert.equal(sw.seat,null);assert.ok(sw.view.hands.every(h=>h===null),'observateur sans aucune main');
 /* les robots jouent leurs tours seuls (ils ne lisent que leur vue) : la partie avance sans le joueur humain tant que ce n'est pas son tour */
 const t0=Date.now();while(Date.now()-t0<3000&&s.srv.tables.metrics.botMoves===0)await sleep(50);
 const t=s.srv.tables._tables.get('wolof|cartes1');assert.ok(s.srv.tables.metrics.botMoves>0||t.def.turn(t.state)===0,'un robot a joué, ou c’est au joueur humain');
 await s.close()});

test('TW4 statuts : invité sans table privée ; compte crée ; invitation → acceptation → siège ; privée fermée aux autres et aux invités',async()=>{
 const s=await open();const g=await join(s,{name:'Invite',x:EC.x,z:EC.z}),a=await join(s,{name:'Ama',token:'tok.a.a',x:EC.x,z:EC.z}),b=await join(s,{name:'Bo',token:'tok.b.b',x:EC.x,z:EC.z});
 assert.equal(g.kind,'guest_online');assert.equal(a.kind,'authenticated');
 g.tbl('sit',{table:'echecs1',priv:true});assert.equal((await g.err()).code,'statut');
 a.tbl('sit',{table:'echecs1',priv:true});await a.ev('resume');
 g.tbl('sit',{table:'echecs1'});assert.equal((await g.err()).code,'privee');
 g.tbl('watch',{table:'echecs1'});assert.equal((await g.err()).code,'privee');
 a.tbl('invite',{table:'echecs1',to:g.id});assert.equal((await a.err()).code,'statut','un invité en ligne ne peut pas être invité à une table privée');
 a.tbl('invite',{table:'echecs1',to:b.id});const iv=await b.ev('inv');assert.equal(iv.priv,true);assert.equal(iv.from.name,'Ama');
 b.tbl('accept',{inv:iv.inv});await b.ev('invOk');b.tbl('sit',{table:'echecs1'});
 const sb=await state(b,m=>m.phase==='play');assert.equal(sb.seat,1);assert.equal(sb.game,'echecs');assert.equal(sb.priv,true);
 b.tbl('accept',{inv:iv.inv});assert.equal((await b.err()).code,'invitation','une invitation ne sert qu’une fois');await s.close()});

test('TW5 déconnexion : reprise avec jeton dans le délai ; sinon abandon et victoire de l’adversaire',async()=>{
 const s=await open({graceMs:600});const a=await join(s,{name:'Ama'}),b=await join(s,{name:'Bo'});
 a.tbl('sit',{table:'awale1'});const r=await a.ev('resume');b.tbl('sit',{table:'awale1'});await state(a,m=>m.phase==='play');await state(b,m=>m.phase==='play');
 a.ws.close();const st=await state(b,m=>m.seats[0]&&m.seats[0].up===false);assert.equal(st.phase,'play');
 const a2=await join(s,{name:'Ama'});a2.tbl('resume',{table:'awale1',token:'faux'});assert.equal((await a2.err()).code,'jeton');
 a2.tbl('resume',{table:'awale1',token:r.token});const back=await state(a2,m=>m.seat===0);assert.equal(back.phase,'play');assert.ok(back.legal.length>0,'le joueur repris peut jouer');
 await state(b,m=>m.seats[0]&&m.seats[0].up===true);
 a2.tbl('move',{table:'awale1',move:back.legal[0]});await state(b,m=>m.turn===1);
 /* au-delà du délai de grâce : abandon */
 b.ws.close();const fin=await state(a2,m=>m.phase==='done',3000);assert.deepEqual(fin.res.winners,[0]);assert.equal(fin.res.reason,'abandon');await s.close()});

test('TW6 chronomètre de coup : défaite au temps (horloge raccourcie)',async()=>{
 const s=await open({moveMs:400});const a=await join(s,{name:'Ama'}),b=await join(s,{name:'Bo'});
 a.tbl('sit',{table:'awale1'});b.tbl('sit',{table:'awale1'});await state(a,m=>m.phase==='play');
 const fin=await state(b,m=>m.phase==='done',3000);assert.equal(fin.res.reason,'temps');assert.deepEqual(fin.res.winners,[1]);await s.close()});

test('TW7 classement de session (comptes seulement) ; revanche ; messages rapides prédéfinis seulement',async()=>{
 const s=await open();const a=await join(s,{name:'Ama',token:'tok.a.a'}),b=await join(s,{name:'Bo',token:'tok.b.b'}),g=await join(s,{name:'Invite'});
 a.tbl('sit',{table:'awale1'});await a.ev('resume');b.tbl('sit',{table:'awale1'});await state(a,m=>m.phase==='play');await state(b,m=>m.phase==='play');
 a.tbl('say',{table:'awale1',id:'bonjour'});assert.equal((await b.ev('say')).id,'bonjour');
 await sleep(850);a.tbl('say',{id:'texte libre'});assert.equal((await a.err()).code,'message');
 a.tbl('resign',{table:'awale1'});const fin=await state(b,m=>m.phase==='done');assert.deepEqual(fin.res.winners,[1]);
 b.tbl('rank');const rk=await b.ev('rank');assert.equal(rk.scope,'session');
 const bo=rk.top.find(e=>e.name==='Bo'),ama=rk.top.find(e=>e.name==='Ama');assert.equal(bo.w,1);assert.equal(bo.rank,1);assert.equal(ama.l,1);assert.equal(rk.top.length,2);
 /* revanche : les deux humains d'une partie finie doivent accepter ; ici a a quitté la table en abandonnant, b reste seul → refus de lancer sans adversaire */
 b.tbl('rematch');assert.equal((await b.err()).code,'pas_assez');
 g.tbl('rank');assert.equal((await g.ev('rank')).scope,'session');await s.close()});

test('TW7b revanche acceptée par les deux joueurs : nouvelle partie, couleurs inversées',async()=>{
 const s=await open({moveMs:300});const a=await join(s,{name:'Ama'}),b=await join(s,{name:'Bo'});
 a.tbl('sit',{table:'awale1'});await a.ev('resume');b.tbl('sit',{table:'awale1'});await state(a,m=>m.phase==='play');
 await state(b,m=>m.phase==='done',3000);/* Ama perd au temps */
 a.tbl('rematch');await state(b,m=>m.rematch===1);b.tbl('rematch');
 const nb=await state(b,m=>m.phase==='play');assert.equal(nb.seat,0,'Bo commence la revanche');assert.equal(nb.seats[1].name,'Ama');await s.close()});

test('TW8 mauvais messages : JSON de coup malformé ne plante pas le serveur ; débit limité',async()=>{
 const s=await open();const a=await join(s,{name:'Ama'});
 a.mark=a.msgs.length;for(const m of [{op:5},{op:'move',table:{}},{op:'inconnu'},{op:'sit',table:'nexistepas'}])a.ws.send(JSON.stringify({t:'tbl',...m}));
 await sleep(200);assert.ok(a.msgs.filter(m=>m.ev==='err').length>=3);
 for(let i=0;i<20;i++)a.tbl('list');a.mark=0;await a.err('debit');
 await sleep(1100);a.tbl('list');const l=await a.ev('list');assert.equal(l.tables.length,8,'le serveur répond encore');await s.close()});

test('TW9 cohérence : pas d’observation ailleurs quand on est assis ; observateurs prévenus quand la table se vide',async()=>{
 const s=await open();const a=await join(s,{name:'Ama'}),b=await join(s,{name:'Bo'}),w=await join(s,{name:'Wa',x:15,z:34});
 a.tbl('sit',{table:'awale1'});await a.ev('resume');b.tbl('sit',{table:'awale1'});await state(a,m=>m.phase==='play');
 w.tbl('watch',{table:'awale1'});await state(w);
 a.send({t:'pos',x:AW2.x-2,z:AW2.z});await sleep(80);a.tbl('watch',{table:'awale2'});assert.equal((await a.err()).code,'deja_assis');
 a.tbl('stand');await a.ev('left');b.tbl('stand');await b.ev('left');
 await w.ev('left');assert.equal(s.srv.tables._tables.size,0);await s.close()});
