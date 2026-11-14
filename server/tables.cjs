/* Tables de jeux de société du village. SERVEUR AUTORITAIRE : l'état de la partie n'existe qu'ici ; chaque participant reçoit def.view(état, siège)
   (observateurs : siège null). Aucune règle de jeu dans ce fichier : tout passe par les définitions injectées (contrat js/games, JEUX_PLAN §3).
   Protocole client→serveur : {t:'tbl',op:'list'|'sit'|'stand'|'start'|'move'|'resign'|'watch'|'unwatch'|'invite'|'accept'|'decline'|'say'|'resume'|'rematch'|'rank',table?,...}
   Serveur→client : {t:'tbl',ev:'list'|'state'|'inv'|'say'|'left'|'err'|'rank'|'resume'}. */
'use strict';
const crypto=require('node:crypto');
const CORE=require('../js/games/core.js');
const SAYS=['bonjour','bien_joue','belle_partie','a_toi','merci','revanche','patience','bravo'];
const DEFAULTS={moveMs:120000,graceMs:60000,botDelayMs:700,inviteTtlMs:30000,rate:8,reach:1.5,botBudgetMs:150};
const MAX_LEGAL=300;
const cryptoRng=()=>crypto.randomInt(0,0x100000000)/0x100000000;
function createTables(o){
 const world=o.world,games=o.games||{},cfg=Object.assign({},DEFAULTS,o.config),now=o.now||Date.now,rng=o.rng||cryptoRng,send=o.send||(()=>{}),broad=o.broadcastRoom||(()=>{}),log=o.log||(()=>{});
 const tables=new Map(),bySid=new Map(),invites=new Map(),rank=new Map(),rate=new Map();
 const metrics={started:0,finished:0,abandoned:0,rejected:0,moves:0,botMoves:0};
 const key=(room,id)=>room+'|'+id,ev=(sid,e,x)=>send(sid,Object.assign({t:'tbl',ev:e},x||{}));
 const me=sid=>world.sessions.get(sid)||null,tok=()=>crypto.randomBytes(16).toString('base64url');
 const spec=id=>CORE.tableById(id);
 function get(room,id){const sp=spec(id);if(!sp)return null;const k=key(room,id);let t=tables.get(k);
  if(!t){t={k,room,id,sp,game:sp.game==='cartes'?null:sp.game,def:null,state:null,seats:[],watchers:new Set(),priv:false,owner:null,invited:new Set(),phase:'idle',turnAt:0,over:null,last:null,hist:[],rematch:new Set(),botAt:0,gen:0};tables.set(k,t)}return t}
 const bad=(sid,code,error)=>{metrics.rejected++;ev(sid,'err',{code,error});return false};
 const near=(s,t)=>Math.hypot(s.x-t.sp.x,s.z-t.sp.z)<=t.sp.r+cfg.reach;
 const humans=t=>t.seats.filter(s=>s&&!s.bot),seatOf=(t,sid)=>t.seats.findIndex(s=>s&&!s.bot&&s.sid===sid);
 const need=t=>t.def?t.def.maxPlayers===t.def.minPlayers?t.def.minPlayers:(t.game==='belote'?4:t.def.minPlayers):2;
 const pubSeat=s=>s?{name:s.name,k:s.bot?'b':s.kind==='authenticated'?'a':'g',bot:!!s.bot,up:s.bot||s.connected,pub:s.bot?null:s.pub}:null;
 function status(t){return t.phase==='play'?'play':t.seats.some(Boolean)?'wait':'free'}
 function summary(t){return {id:t.id,game:t.game||t.sp.game,card:t.sp.game==='cartes',name:t.sp.name,x:t.sp.x,z:t.sp.z,status:status(t),n:t.seats.filter(Boolean).length,max:t.def?t.def.maxPlayers:null,priv:t.priv,watchers:t.watchers.size}}
 /* la liste ne crée aucune table en mémoire : une table n'existe que lorsqu'un joueur s'y assoit */
 const blank=(room,sp)=>({id:sp.id,sp,game:sp.game==='cartes'?null:sp.game,def:null,seats:[],watchers:new Set(),priv:false,phase:'idle'});
 const roomList=room=>CORE.TABLES.map(sp=>summary(tables.get(key(room,sp.id))||blank(room,sp)));
 const pushList=room=>broad(room,{t:'tbl',ev:'list',tables:roomList(room)});
 function viewFor(t,seat){return t.state?t.def.view(t.state,seat):null}
 function resOf(t){return t.over||(t.state?t.def.result(t.state):null)}
 function pushState(t,to){
  const res=resOf(t),turn=t.state&&!res?t.def.turn(t.state):-1;
  const base={table:t.id,game:t.game,phase:t.phase,seats:t.seats.map(pubSeat),turn,res,last:t.last,hist:t.hist.slice(-60),deadline:t.phase==='play'&&!res&&turn>=0?t.turnAt+cfg.moveMs:0,priv:t.priv,owner:t.owner,watchers:t.watchers.size,rematch:t.rematch.size,mode:'live',now:now()};
  const targets=to?[to]:[...t.seats.filter(s=>s&&!s.bot&&s.connected).map(s=>s.sid),...t.watchers];
  for(const sid of targets){const sn=seatOf(t,sid),seat=sn>=0?sn:null;let legal=seat!==null&&t.state&&!res&&turn===seat?t.def.legalMoves(t.state,seat):[];
   /* menteur : jusqu'à ~18 000 combinaisons de cartes ; au-delà de MAX_LEGAL la liste n'est pas envoyée (le client la recalcule sur sa vue, le serveur valide toujours) */
   if(legal.length>MAX_LEGAL)legal=null;
   ev(sid,'state',Object.assign({seat,view:viewFor(t,seat),legal},base))}}
 function drop(t){for(const w of t.watchers){bySid.delete(w);ev(w,'left',{table:t.id})}t.watchers.clear();tables.delete(t.k)}
 function leaveAll(sid){const a=bySid.get(sid);if(!a)return;const t=tables.get(a.k);bySid.delete(sid);if(!t)return;t.watchers.delete(sid)}
 /* ---- cycle de partie ---- */
 function startGame(t){
  const n=t.seats.length,players=t.seats.map(s=>s.name);
  t.state=t.def.init({players,rng});t.phase='play';t.over=null;t.last=null;t.hist=[];t.turnAt=now();t.rematch.clear();t.gen++;metrics.started++;scheduleBot(t);pushState(t);pushList(t.room)}
 function scheduleBot(t){const turn=t.state&&!resOf(t)?t.def.turn(t.state):-1;t.botAt=turn>=0&&t.seats[turn]&&t.seats[turn].bot?now()+cfg.botDelayMs:0}
 function finish(t,over){
  if(over)t.over=over;const r=resOf(t);if(!r||t.phase==='done')return;t.phase='done';metrics.finished++;t.botAt=0;
  /* classement de session : comptes authentifiés uniquement, tables publiques, vrais adversaires humains */
  const hs=humans(t);
  if(!t.priv&&hs.length>=2){for(let i=0;i<t.seats.length;i++){const s=t.seats[i];if(!s||s.bot||s.kind!=='authenticated'||!s.uid)continue;
   const e=rank.get(s.uid)||{name:s.name,w:0,l:0,d:0,pts:0};e.name=s.name;
   const win=(r.winners||[]).includes(i);if(r.draw||!(r.winners||[]).length){e.d++;e.pts+=1}else if(win){e.w++;e.pts+=3}else e.l++;rank.set(s.uid,e)}}
  pushState(t);pushList(t.room)}
 function apply(t,seat,move,isBot){
  const was=t.state;let ns;
  try{ns=t.def.apply(t.state,move,seat)}catch(e){return {err:e&&e.code||'coup_illegal',msg:e&&e.message}}
  let note='';try{if(t.def.notation)note=t.def.notation(was,move,seat)||''}catch(e){}
  t.state=ns;t.turnAt=now();t.last={seat,move};t.hist.push({seat,note:String(note).slice(0,60)});metrics[isBot?'botMoves':'moves']++;
  if(t.def.result(ns))finish(t);else{scheduleBot(t);pushState(t)}return {ok:true}}
 /* ---- opérations ---- */
 function opList(sid,s){ev(sid,'list',{tables:roomList(s.room)})}
 function canSit(t,s,sid){
  if(t.priv&&!t.invited.has(s.pub)&&t.owner!==s.pub)return 'Table privée : sur invitation seulement.';
  return null}
 function opSit(sid,s,m){
  const t=get(s.room,m.table);if(!t)return bad(sid,'table_inconnue','Table inconnue.');
  if(bySid.has(sid)&&bySid.get(sid).k!==t.k&&bySid.get(sid).seat)return bad(sid,'deja_assis','Tu es déjà assis à une autre table.');
  if(m.priv&&s.kind!=='authenticated')return bad(sid,'statut','Seuls les comptes connectés créent une table privée.');
  if(!near(s,t))return bad(sid,'trop_loin','Rapproche-toi de la table.');
  if(seatOf(t,sid)>=0)return bad(sid,'deja_assis','Tu es déjà assis ici.');
  if(t.phase==='play')return bad(sid,'partie_en_cours','Une partie est en cours : tu peux l’observer.');
  const why=canSit(t,s,sid);if(why)return bad(sid,'privee',why);
  if(t.phase==='done'){/* nouvelle donne sur la même table : on repart propre */t.phase='idle';t.state=null;t.over=null;t.seats=t.seats.filter(x=>x&&!x.bot&&x.connected);if(!t.seats.length)t.game=t.sp.game==='cartes'?null:t.game}
  if(!t.def){const g=t.sp.game==='cartes'?m.game:t.sp.game;if(!CORE.CARD_GAMES.includes(g)&&t.sp.game==='cartes')return bad(sid,'jeu_inconnu','Choisis un jeu de cartes : '+CORE.CARD_GAMES.join(', ')+'.');
   const def=games[g];if(!def)return bad(sid,'jeu_indisponible','Jeu indisponible.');t.game=g;t.def=def}
  if(m.priv){if(s.kind!=='authenticated')return bad(sid,'statut','Seuls les comptes connectés créent une table privée.');if(!humans(t).length){t.priv=true;t.owner=s.pub}}
  if(t.seats.filter(Boolean).length>=t.def.maxPlayers)return bad(sid,'table_pleine','Table pleine.');
  const seat={sid,pub:s.pub,uid:s.uid||null,name:s.name,kind:s.kind,token:tok(),connected:true,discAt:0};
  let idx=t.seats.findIndex(x=>!x);if(idx<0)idx=t.seats.length;t.seats[idx]=seat;if(!t.owner||!humans(t).slice(0,-1).length)t.owner=t.owner||s.pub;
  const was=bySid.get(sid);if(was&&!was.seat){const o=tables.get(was.k);if(o)o.watchers.delete(sid)}t.watchers.delete(sid);
  bySid.set(sid,{k:t.k,seat:true});ev(sid,'resume',{table:t.id,token:seat.token});
  if(t.seats.filter(Boolean).length>=need(t)&&t.def.minPlayers===t.def.maxPlayers&&t.game!=='belote'||t.seats.filter(Boolean).length>=t.def.maxPlayers)startGame(t);else{pushState(t);pushList(t.room)}}
 function opStart(sid,s,m){
  const t=tables.get(key(s.room,m.table));if(!t||!t.def)return bad(sid,'table_inconnue','Table inconnue.');
  if(seatOf(t,sid)<0)return bad(sid,'pas_assis','Assieds-toi d’abord.');if(t.phase==='play')return bad(sid,'partie_en_cours','Déjà en cours.');
  const target=m.bots===false?humans(t).length:Math.max(t.def.minPlayers,t.game==='belote'?4:Math.min(t.def.maxPlayers,Math.max(2,humans(t).length)));
  /* seul l'organisateur lance ; les sièges vides sont complétés par des robots (information cachée : ils n'utilisent que la vue) */
  if(t.owner!==s.pub)return bad(sid,'organisateur','Seul l’organisateur lance la partie.');
  let k=0;while(t.seats.filter(Boolean).length<target&&k++<8){let idx=t.seats.findIndex(x=>!x);if(idx<0)idx=t.seats.length;t.seats[idx]={bot:true,name:'Robot '+(idx+1),connected:true}}
  if(t.seats.filter(Boolean).length<t.def.minPlayers)return bad(sid,'pas_assez','Pas assez de joueurs.');
  t.seats=t.seats.map(x=>x||{bot:true,name:'Robot',connected:true});startGame(t)}
 function opStand(sid,s,m,why){
  const a=bySid.get(sid);const t=a&&tables.get(a.k);if(!t||seatOf(t,sid)<0){return}
  const i=seatOf(t,sid);
  if(t.phase==='play'&&!resOf(t)){finish(t,{winners:t.seats.map((_,j)=>j).filter(j=>j!==i),draw:false,reason:why||'abandon',loser:i});metrics.abandoned++}
  t.seats[i]=null;while(t.seats.length&&!t.seats[t.seats.length-1])t.seats.pop();bySid.delete(sid);ev(sid,'left',{table:t.id});
  if(!humans(t).length){drop(t)}else{if(t.owner===s.pub)t.owner=humans(t)[0].pub;if(t.phase!=='play'){if(t.phase==='done')t.phase='done';pushState(t)}}pushList(t.room)}
 function opMove(sid,s,m){
  const a=bySid.get(sid),t=a&&tables.get(a.k);if(!t||t.phase!=='play')return bad(sid,'pas_en_jeu','Aucune partie en cours.');
  const i=seatOf(t,sid);if(i<0)return bad(sid,'pas_assis','Tu ne joues pas ici.');if(resOf(t))return bad(sid,'partie_finie','Partie terminée.');
  if(t.def.turn(t.state)!==i)return bad(sid,'hors_tour','Ce n’est pas ton tour.');
  const r=apply(t,i,m.move,false);if(r.err)return bad(sid,r.err,r.msg||'Coup illégal.')}
 function opWatch(sid,s,m){
  if(!spec(m.table))return bad(sid,'table_inconnue','Table inconnue.');const t=tables.get(key(s.room,m.table))||Object.assign(blank(s.room,spec(m.table)),{k:key(s.room,m.table),state:null});if(!near(s,t))return bad(sid,'trop_loin','Rapproche-toi de la table.');
  const old=bySid.get(sid);if(old&&old.seat&&old.k!==t.k)return bad(sid,'deja_assis','Lève-toi d’abord de ta table pour en observer une autre.');
  if(t.priv&&!t.invited.has(s.pub)&&t.owner!==s.pub)return bad(sid,'privee','Table privée.');if(seatOf(t,sid)>=0)return;
  if(!t.state)return bad(sid,'pas_en_jeu','Rien à observer pour l’instant.');
  if(old&&old.k!==t.k){const o=tables.get(old.k);if(o)o.watchers.delete(sid)}
  t.watchers.add(sid);bySid.set(sid,{k:t.k,seat:false});pushState(t,sid);pushList(s.room)}
 function opUnwatch(sid,s){const a=bySid.get(sid);if(!a||a.seat)return;const t=tables.get(a.k);if(t)t.watchers.delete(sid);bySid.delete(sid);pushList(s.room)}
 function opInvite(sid,s,m){
  const a=bySid.get(sid),t=a&&tables.get(a.k);if(!t||seatOf(t,sid)<0)return bad(sid,'pas_assis','Assieds-toi d’abord.');
  if(t.phase==='play')return bad(sid,'partie_en_cours','Partie en cours.');
  const tgt=[...world.sessions.values()].find(x=>x.pub===m.to&&x.room===s.room);if(!tgt||tgt.sid===sid)return bad(sid,'introuvable','Joueur introuvable dans ce village.');
  if(t.priv&&(s.kind!=='authenticated'||tgt.kind!=='authenticated'))return bad(sid,'statut','Les tables privées sont réservées aux comptes connectés.');
  const last=invites.get(sid)||0;if(now()-last<1500)return bad(sid,'trop_vite','Doucement avec les invitations.');invites.set(sid,now());
  const id=tok();invites.set(id,{from:sid,to:tgt.sid,k:t.k,pub:tgt.pub,until:now()+cfg.inviteTtlMs});
  ev(tgt.sid,'inv',{inv:id,from:{name:s.name},table:t.id,game:t.game,name:t.sp.name,priv:t.priv,ttlMs:cfg.inviteTtlMs});ev(sid,'invSent',{to:tgt.name})}
 function opAnswer(sid,s,m,yes){
  const v=invites.get(m.inv);if(!v||v.to!==sid)return bad(sid,'invitation','Invitation inconnue.');invites.delete(m.inv);
  if(now()>v.until)return bad(sid,'invitation_expiree','Invitation expirée.');
  const t=tables.get(v.k);if(!yes||!t){if(v.from)ev(v.from,'invDeclined',{});return}
  t.invited.add(s.pub);ev(sid,'invOk',{table:t.id,game:t.game})}
 function opSay(sid,s,m){const a=bySid.get(sid),t=a&&tables.get(a.k);if(!t)return;if(!SAYS.includes(m.id))return bad(sid,'message','Message inconnu.');
  const last=invites.get('say'+sid)||0;if(now()-last<800)return;invites.set('say'+sid,now());
  const out={table:t.id,from:s.name,id:m.id};for(const x of [...humans(t).map(q=>q.sid),...t.watchers])ev(x,'say',out)}
 function opResume(sid,s,m){
  const t=tables.get(key(s.room,m.table));if(!t)return bad(sid,'table_inconnue','Table inconnue.');
  const i=t.seats.findIndex(x=>x&&!x.bot&&x.token===m.token);if(i<0)return bad(sid,'jeton','Reprise impossible.');
  const q=t.seats[i];if(q.kind==='authenticated'&&q.uid&&q.uid!==s.uid)return bad(sid,'compte','Reprise impossible.');
  bySid.delete(q.sid);q.sid=sid;q.connected=true;q.discAt=0;bySid.set(sid,{k:t.k,seat:true});ev(sid,'resume',{table:t.id,token:q.token});pushState(t,sid);pushState(t)}
 function opRematch(sid,s,m){
  const a=bySid.get(sid),t=a&&tables.get(a.k);if(!t||t.phase!=='done')return bad(sid,'pas_fini','La partie n’est pas terminée.');
  const i=seatOf(t,sid);if(i<0)return;
  if(t.seats.some(x=>!x)||t.seats.length<t.def.minPlayers)return bad(sid,'pas_assez','Ton adversaire a quitté la table : attends un nouveau joueur.');
  t.rematch.add(i);
  const hs=t.seats.map((x,j)=>x&&!x.bot?j:-1).filter(j=>j>=0);
  if(hs.every(j=>t.rematch.has(j))){if(t.seats.length===2)t.seats.reverse();startGame(t)}else pushState(t)}
 function opRank(sid){ev(sid,'rank',{top:[...rank.values()].sort((a,b)=>b.pts-a.pts||b.w-a.w).slice(0,10).map((e,i)=>({rank:i+1,name:e.name,w:e.w,l:e.l,d:e.d,pts:e.pts})),scope:'session'})}
 function handle(sid,m){const r=handle_(sid,m);const s=me(sid);
  if(s&&m&&typeof m.table==='string'){const t=tables.get(key(s.room,m.table));if(t&&!t.seats.some(Boolean)&&!t.watchers.size)tables.delete(t.k)}return r}
 function handle_(sid,m){
  const s=me(sid);if(!s)return;
  const r=rate.get(sid)||{t:now(),n:0};if(now()-r.t>1000){r.t=now();r.n=0}if(++r.n>cfg.rate){rate.set(sid,r);return bad(sid,'debit','Trop de messages.')}rate.set(sid,r);
  if(!m||typeof m.op!=='string')return bad(sid,'format','Message invalide.');
  if(m.table!==undefined&&typeof m.table!=='string')return bad(sid,'format','Message invalide.');
  switch(m.op){case 'list':return opList(sid,s);case 'sit':return opSit(sid,s,m);case 'start':return opStart(sid,s,m);case 'stand':return opStand(sid,s,m);case 'move':return opMove(sid,s,m);
   case 'resign':return opStand(sid,s,m,'abandon')||0;case 'watch':return opWatch(sid,s,m);case 'unwatch':return opUnwatch(sid,s);case 'invite':return opInvite(sid,s,m);
   case 'accept':return opAnswer(sid,s,m,true);case 'decline':return opAnswer(sid,s,m,false);case 'say':return opSay(sid,s,m);case 'resume':return opResume(sid,s,m);
   case 'rematch':return opRematch(sid,s,m);case 'rank':return opRank(sid);default:return bad(sid,'op_inconnue','Action inconnue.')}}
 function onLeave(sid){
  const a=bySid.get(sid);rate.delete(sid);invites.delete(sid);invites.delete('say'+sid);if(!a)return;const t=tables.get(a.k);if(!t)return;
  if(!a.seat){t.watchers.delete(sid);bySid.delete(sid);return}
  const i=seatOf(t,sid);if(i<0)return;
  if(t.phase==='play'&&!resOf(t)){t.seats[i].connected=false;t.seats[i].discAt=now();pushState(t)}
  else{t.seats[i]=null;while(t.seats.length&&!t.seats[t.seats.length-1])t.seats.pop();bySid.delete(sid);if(!humans(t).length)drop(t);else pushState(t);pushList(t.room)}}
 function tick(){
  const n=now();
  for(const t of [...tables.values()]){
   if(t.phase!=='play'||resOf(t))continue;
   for(let i=0;i<t.seats.length;i++){const q=t.seats[i];if(q&&!q.bot&&!q.connected&&n-q.discAt>=cfg.graceMs){metrics.abandoned++;finish(t,{winners:t.seats.map((_,j)=>j).filter(j=>j!==i),draw:false,reason:'abandon',loser:i});break}}
   if(t.phase!=='play'||resOf(t))continue;
   const turn=t.def.turn(t.state);
   if(turn>=0&&t.seats[turn]&&t.seats[turn].bot){if(t.botAt&&n>=t.botAt){const seat=turn,v=t.def.view(t.state,seat);let mv=null;
     try{mv=t.def.chooseMove(v,seat,{level:2,budgetMs:cfg.botBudgetMs,rng})}catch(e){log('robot: '+e.message)}
     if(!mv||apply(t,seat,mv,true).err){/* secours : premier coup légal */const lm=t.def.legalMoves(t.state,seat);if(lm.length)apply(t,seat,lm[0],true);else finish(t,{winners:[],draw:true,reason:'blocage'})}}}
   else if(n-t.turnAt>=cfg.moveMs){metrics.abandoned++;finish(t,{winners:t.seats.map((_,j)=>j).filter(j=>j!==turn),draw:false,reason:'temps',loser:turn})}}
  for(const [k,v] of invites)if(v&&typeof v==='object'&&v.until&&n>v.until)invites.delete(k)}
 return {handle,onLeave,tick,metrics,config:cfg,_tables:tables,_rank:rank,summary:roomList}}
module.exports={createTables,SAYS,DEFAULTS};
