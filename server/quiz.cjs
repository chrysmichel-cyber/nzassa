/* Moteur du « Quiz du village » : l'enseignant propose un quiz seul ou un duel entre deux joueurs connectés du même village.
   LE SERVEUR FAIT AUTORITÉ sur tout : tirage des questions, chronomètre, correction, points, résultat, classement.
   Le client n'envoie QUE un choix de réponse (a-d) ; il ne fournit jamais un temps, un score ou un RTT.
   Temps utile d'une réponse = (réception − envoi de la question, horloge du serveur) − compensation de latence (voir js/quiz/scoring.js).
   Contenu : server/quizbank.cjs. Classement : server/quizstore.cjs (interface « store »). Transport : server/realtime.cjs (messages t:'qz'). */
'use strict';
const crypto=require('node:crypto');
const S=require('../js/quiz/scoring.js');

const ID=()=>crypto.randomBytes(9).toString('base64url');
const cryptoRng=()=>crypto.randomInt(0,0x100000000)/0x100000000;
const CHOICES=new Set(['a','b','c','d']);

function createQuiz(o){
 const world=o.world,bank=o.bank,store=o.store,cfg=o.config||S.config(),now=o.now||Date.now,rng=o.rng||cryptoRng,log=o.log||(()=>{});
 const send=o.send||(()=>{}),broadcastRoom=o.broadcastRoom||(()=>{}),onTop=o.onTop||(()=>{});
 const matches=new Map(),byPlayer=new Map(),invites=new Map(),lastChallenge=new Map();let probeN=0;
 const metrics={started:0,finished:0,abandoned:0,ranked:0,duplicates:0,rejected:0};
 const ev=(sid,e,x)=>send(sid,Object.assign({t:'qz',ev:e},x||{}));
 const bad=(sid,code,error)=>{metrics.rejected++;ev(sid,'err',{code,error});return false};
 const me=sid=>world.sessions.get(sid)||null;
 const near=(s,p,r)=>Math.hypot(s.x-p.x,s.z-p.z)<=r;
 const kindShort=s=>s.kind==='authenticated'?'a':'g';
 const strOk=(v,max)=>typeof v==='string'&&v.length>0&&v.length<=(max||64);

 /* ---------- cycle d'un match ---------- */
 function newPlayer(s,slot){return {slot,sid:s.sid,pub:s.pub,uid:s.uid||null,name:s.name,kind:s.kind,token:crypto.randomBytes(16).toString('base64url'),connected:true,discAt:0,forfeited:false,answers:[],score:0,timeMs:0,rtt:[],probe:null,lastProbe:0,cur:null}}
 function create(village,mode,cat,sessions){
  const qs=bank.pick({village,count:cfg.questions,rng,cat});
  const m={id:ID(),village,mode,cat:cat||null,mix:!cat,cfg,questions:qs,players:sessions.map((s,i)=>newPlayer(s,i)),qi:-1,phase:'countdown',until:now()+cfg.countdownMs,sentAt:0,deadline:0,state:'running',created:now(),doneAt:0,ended:null};
  matches.set(m.id,m);m.players.forEach(p=>byPlayer.set(p.sid,m));metrics.started++;
  m.players.forEach(p=>{ev(p.sid,'start',{m:m.id,mode,village,n:qs.length,timeMs:cfg.timeMs,countdownMs:cfg.countdownMs,cat:cat?bank.categoryName(cat):null,resume:p.token,you:p.slot,players:m.players.map(q=>({slot:q.slot,name:q.name,k:kindShort(q)})),scoring:{base:cfg.base,bonusMax:cfg.bonusMax,bonusWindowMs:cfg.bonusWindowMs},ranked:rankedFor(m,p)});probe(p,true)});
  return m}
 const rankedFor=(m,p)=>m.mix&&m.questions.length===S.RANKED_QUESTIONS&&p.kind==='authenticated'&&!!p.uid;
 function probe(p,force){const t=now();if(!p.connected)return;if(!force&&t-p.lastProbe<(p.rtt.length<cfg.minRttSamples?400:1500))return;p.lastProbe=t;p.probe={n:++probeN,at:t};send(p.sid,{t:'qzp',n:p.probe.n})}
 function onRtt(sid,n){const m=byPlayer.get(sid);if(!m)return;const p=m.players.find(x=>x.sid===sid);if(!p||!p.probe||p.probe.n!==n)return;
  const d=now()-p.probe.at;p.probe=null;if(d>=0&&d<=2000){p.rtt.push(d);while(p.rtt.length>cfg.rttWindow*2)p.rtt.shift()}}

 function ask(m){
  m.qi++;m.phase='ask';m.sentAt=now();m.deadline=m.sentAt+cfg.timeMs+cfg.rttCapMs+cfg.graceMs;m.players.forEach(p=>{p.cur=null});
  const q=bank.forClient(m.questions[m.qi],m.qi);
  m.players.forEach(p=>{if(p.connected&&!p.forfeited)ev(p.sid,'q',{m:m.id,q,total:m.questions.length,timeMs:cfg.timeMs})})}
 function record(m,p,res,choice){
  p.cur={c:choice,res};p.answers.push({i:m.qi,c:choice,ok:res.ok,points:res.points,ms:res.ms,late:!!res.late,none:!!res.none});p.score+=res.points;p.timeMs+=res.ms}
 function closeQuestion(m){
  const q=m.questions[m.qi];
  m.players.forEach(p=>{if(!p.cur)record(m,p,S.judge(cfg,{correct:false,rawMs:null}),null)});
  m.phase='reveal';m.until=now()+cfg.revealMs;
  m.players.forEach(p=>{if(!p.connected||p.forfeited)return;const o=m.players.find(x=>x!==p),pc=p.cur;
   ev(p.sid,'r',{m:m.id,i:m.qi,correct:q.answer,explanation:q.explanation,you:{c:pc.c,ok:pc.res.ok,pts:pc.res.points,ms:pc.res.ms,bonus:pc.res.bonus||0,none:!!pc.res.none},opp:o?{c:o.cur.c,ok:o.cur.res.ok,pts:o.cur.res.points,ms:o.cur.res.ms,none:!!o.cur.res.none}:null,scores:{you:p.score,opp:o?o.score:null},times:{you:p.timeMs,opp:o?o.timeMs:null},revealMs:cfg.revealMs,last:m.qi===m.questions.length-1})})}
 /* La question se ferme dès que tous les joueurs CONNECTÉS ont répondu. Si personne n'est connecté, on attend l'échéance normale (jamais d'avance rapide, jamais de temps gelé :
    se déconnecter ne donne ni temps supplémentaire ni moyen de chercher la réponse). */
 function allAnswered(m){const act=m.players.filter(p=>p.connected&&!p.forfeited);return act.length>0&&act.every(p=>p.cur)}
 function finish(m){
  if(m.state==='done')return;/* idempotent : un match n'est finalisé qu'une fois */
  m.state='done';m.doneAt=now();metrics.finished++;
  const live=m.players.filter(p=>!p.forfeited);
  let winner=null,reason='score';
  if(m.players.length===2){const [a,b]=m.players;
   if(a.forfeited&&!b.forfeited){winner=1;reason='forfait'}else if(b.forfeited&&!a.forfeited){winner=0;reason='forfait'}
   else if(a.forfeited&&b.forfeited){winner=null;reason='abandon'}
   else{const r=S.duel(a,b);winner=r==='a'?0:r==='b'?1:null;reason=r==='draw'?'égalité':(a.score===b.score?'temps':'score')}}
  m.players.forEach(p=>{
   const rk={ranked:false,reason:null};
   if(p.forfeited)rk.reason='abandon';
   else if(!rankedFor(m,p))rk.reason=p.kind!=='authenticated'?'invité':!m.mix?'catégorie':'format';
   else{const r=store.submit(m.village,{uid:p.uid,name:p.name,score:p.score,timeMs:p.timeMs,matchId:m.id+'.'+p.slot,at:now()});
    rk.ranked=true;rk.improved=r.improved;rk.rank=r.rank;rk.duplicate=r.duplicate;if(r.duplicate)metrics.duplicates++;else metrics.ranked++;
    if(r.improved)onTop(m.village,r.top)}
   p.rk=rk});
  m.players.forEach(p=>{const o=m.players.find(x=>x!==p),res={m:m.id,mode:m.mode,village:m.village,you:{score:p.score,timeMs:p.timeMs,answers:p.answers},opp:o?{name:o.name,score:o.score,timeMs:o.timeMs,answers:o.answers,forfeited:o.forfeited}:null,
    outcome:m.players.length===2?(winner===null?'draw':winner===p.slot?'win':'loss'):'solo',reason,max:S.maxPoints(Object.assign({},cfg,{questions:m.questions.length})),rank:p.rk};
   p.final=res;if(p.connected&&!p.forfeited)ev(p.sid,'end',res)});
  m.players.forEach(p=>byPlayer.delete(p.sid));m.ended=true}
 function abandon(m,why){m.state='done';m.doneAt=now();m.abandoned=why;metrics.abandoned++;m.players.forEach(p=>{byPlayer.delete(p.sid)})}

 function forfeit(m,p,why){
  if(p.forfeited||m.state!=='running')return;
  p.forfeited=true;p.why=why;
  const others=m.players.filter(x=>x!==p&&!x.forfeited);
  if(!others.length||m.players.length===1){abandon(m,why);return}
  others.forEach(x=>{if(x.connected)ev(x.sid,'oppLeft',{m:m.id,why})})
  if(m.phase==='ask'&&allAnswered(m))closeQuestion(m)}

 /* ---------- invitations ---------- */
 function dropInvites(sid,why){for(const [id,iv] of invites)if(iv.from===sid||iv.to===sid){invites.delete(id);const other=iv.from===sid?iv.to:iv.from;if(me(other))ev(other,why||'invCancelled',{inv:id})}}
 function challenge(sid,m){
  const s=me(sid);if(!s)return false;
  if(byPlayer.has(sid))return bad(sid,'busy','Tu es déjà en quiz.');
  if(!bank.hasVillage(s.room))return bad(sid,'no_village','Ce salon n’est pas un village.');
  if(!near(s,S.TEACHER,cfg.teacherRadius))return bad(sid,'too_far','Approche-toi de l’enseignant pour lancer un défi.');
  if(!strOk(m.to,40))return bad(sid,'bad_target','Joueur invalide.');
  const t=now();if(t-(lastChallenge.get(sid)||0)<2000)return bad(sid,'slow_down','Doucement : un défi toutes les 2 secondes.');lastChallenge.set(sid,t);
  const r=world.room(s.room);const tgt=r&&[...r.players.values()].find(p=>p.pub===m.to);
  if(!tgt)return bad(sid,'not_found','Ce joueur n’est plus connecté dans ce village.');
  if(tgt.sid===sid)return bad(sid,'self','Tu ne peux pas te défier toi-même.');
  if(byPlayer.has(tgt.sid))return bad(sid,'target_busy','Ce joueur est déjà en quiz.');
  for(const iv of invites.values()){if(iv.from===sid)return bad(sid,'pending','Tu as déjà un défi en attente.')}
  let n=0;for(const iv of invites.values())if(iv.to===tgt.sid)n++;if(n>=3)return bad(sid,'target_busy','Ce joueur reçoit déjà plusieurs défis.');
  const iv={id:ID(),from:sid,to:tgt.sid,village:s.room,exp:t+cfg.inviteTtlMs};invites.set(iv.id,iv);
  ev(tgt.sid,'inv',{inv:iv.id,from:{id:s.pub,name:s.name,k:kindShort(s)},village:s.room,ttlMs:cfg.inviteTtlMs});
  ev(sid,'invSent',{inv:iv.id,to:{id:tgt.pub,name:tgt.name},ttlMs:cfg.inviteTtlMs});return true}
 function accept(sid,m){
  const iv=invites.get(m.inv);if(!strOk(m.inv)||!iv||iv.to!==sid)return bad(sid,'no_invite','Cette invitation n’existe plus.');
  invites.delete(iv.id);
  const a=me(iv.from),b=me(sid);
  if(!a||!b||a.room!==b.room){ev(sid,'invExpired',{inv:iv.id});return false}
  if(byPlayer.has(iv.from)||byPlayer.has(sid)){ev(sid,'invExpired',{inv:iv.id});ev(iv.from,'invDeclined',{inv:iv.id,why:'busy'});return false}
  if(now()>iv.exp){ev(sid,'invExpired',{inv:iv.id});ev(iv.from,'invExpired',{inv:iv.id});return false}
  dropInvites(iv.from,'invCancelled');dropInvites(sid,'invCancelled');
  try{create(iv.village,'duel',null,[a,b])}catch(e){log('quiz : '+e.message);ev(sid,'err',{code:'no_questions',error:'Impossible de préparer les questions.'});ev(iv.from,'err',{code:'no_questions',error:'Impossible de préparer les questions.'})}
  return true}
 function decline(sid,m){const iv=invites.get(m.inv);if(!strOk(m.inv)||!iv||iv.to!==sid)return false;invites.delete(iv.id);ev(iv.from,'invDeclined',{inv:iv.id,why:'declined'});return true}
 function cancel(sid){for(const [id,iv] of invites)if(iv.from===sid){invites.delete(id);ev(iv.to,'invCancelled',{inv:id});ev(sid,'invCancelled',{inv:id})}return true}

 /* ---------- messages du client ---------- */
 function handle(sid,m){
  if(!m||typeof m!=='object'||typeof m.op!=='string')return bad(sid,'bad_message','Message invalide.');
  const s=me(sid);if(!s)return false;
  switch(m.op){
   case 'start':{
    if(byPlayer.has(sid))return bad(sid,'busy','Tu es déjà en quiz.');
    if(!bank.hasVillage(s.room))return bad(sid,'no_village','Ce salon n’est pas un village.');
    if(!near(s,S.TEACHER,cfg.teacherRadius))return bad(sid,'too_far','Approche-toi de l’enseignant pour lancer un quiz.');
    let cat=null;if(m.cat!=null){if(typeof m.cat!=='string'||!bank.categoryIds().includes(m.cat))return bad(sid,'bad_cat','Catégorie inconnue.');cat=m.cat}
    dropInvites(sid,'invCancelled');
    try{create(s.room,'solo',cat,[s])}catch(e){return bad(sid,'no_questions','Pas assez de questions pour ce village et cette catégorie.')}
    return true}
   case 'challenge':return challenge(sid,m);
   case 'accept':return accept(sid,m);
   case 'decline':return decline(sid,m);
   case 'cancel':return cancel(sid);
   case 'ans':{
    const mt=byPlayer.get(sid);if(!mt||mt.id!==m.m)return bad(sid,'no_match','Aucun quiz en cours.');
    const p=mt.players.find(x=>x.sid===sid);
    if(mt.state!=='running'||mt.phase!=='ask'||m.i!==mt.qi)return bad(sid,'stale','Cette question est terminée.');
    if(typeof m.c!=='string'||!CHOICES.has(m.c))return bad(sid,'bad_choice','Réponse invalide.');
    if(p.cur)return bad(sid,'duplicate','Réponse déjà enregistrée.');
    const raw=now()-mt.sentAt,comp=S.compensation(cfg,p.rtt),q=mt.questions[mt.qi];
    record(mt,p,S.judge(cfg,{correct:m.c===q.answer,rawMs:raw,compMs:comp}),m.c);
    ev(sid,'a',{m:mt.id,i:mt.qi});
    if(allAnswered(mt))closeQuestion(mt);
    return true}
   case 'abandon':{const mt=byPlayer.get(sid);if(!mt)return bad(sid,'no_match','Aucun quiz en cours.');
    const p=mt.players.find(x=>x.sid===sid);forfeit(mt,p,'abandon');if(mt.state==='running'&&mt.players.length>0){byPlayer.delete(sid);ev(sid,'left',{m:mt.id})}else ev(sid,'left',{m:mt.id});
    /* si l'abandon était le dernier joueur actif d'un duel déjà fini ailleurs, rien de plus */
    return true}
   case 'resume':{
    if(!strOk(m.m,40)||!strOk(m.token,40))return bad(sid,'bad_message','Reprise invalide.');
    const mt=matches.get(m.m);const p=mt&&mt.players.find(x=>x.token===m.token);
    if(!mt||!p)return bad(sid,'no_match','Ce quiz n’existe plus.');
    if(p.forfeited)return bad(sid,'forfeited','Tu as quitté ce quiz.');
    if(byPlayer.has(sid)&&byPlayer.get(sid)!==mt)return bad(sid,'busy','Tu es déjà dans un autre quiz.');
    const same=p.kind==='authenticated'?(p.uid&&p.uid===s.uid):true;/* un compte ne peut reprendre qu'avec le même compte */
    if(!same)return bad(sid,'bad_identity','Ce quiz appartient à un autre compte.');
    byPlayer.delete(p.sid);p.sid=sid;p.connected=true;p.discAt=0;p.rtt=[];byPlayer.set(sid,mt);
    if(mt.state==='done'){ev(sid,'end',p.final||{});byPlayer.delete(sid);return true}
    resumeState(mt,p);const o=mt.players.find(x=>x!==p);if(o&&o.connected)ev(o.sid,'oppBack',{m:mt.id});probe(p,true);return true}
   case 'top':{ev(sid,'top',{village:s.room,top:bank.hasVillage(s.room)?store.top(s.room,10):[],best:s.kind==='authenticated'&&s.uid?store.best(s.room,s.uid):null});return true}
   default:return bad(sid,'bad_op','Opération inconnue.')}}
 function resumeState(m,p){
  const o=m.players.find(x=>x!==p);
  ev(p.sid,'resume',{m:m.id,mode:m.mode,village:m.village,n:m.questions.length,timeMs:cfg.timeMs,you:p.slot,phase:m.phase,qi:m.qi,scores:{you:p.score,opp:o?o.score:null},answered:!!p.cur,oppLeft:!!(o&&o.forfeited),
   q:m.phase==='ask'&&!p.cur?Object.assign(bank.forClient(m.questions[m.qi],m.qi),{remainMs:Math.max(0,m.sentAt+cfg.timeMs-now())}):null})}

 /* ---------- déconnexion ---------- */
 function onLeave(sid){
  dropInvites(sid,'invCancelled');lastChallenge.delete(sid);
  const m=byPlayer.get(sid);if(!m||m.state!=='running')return;
  const p=m.players.find(x=>x.sid===sid);if(!p)return;
  p.connected=false;p.discAt=now();
  const o=m.players.find(x=>x!==p);if(o&&o.connected)ev(o.sid,'oppDown',{m:m.id,graceMs:cfg.disconnectGraceMs});
  if(m.phase==='ask'&&allAnswered(m))closeQuestion(m)}

 /* ---------- horloge ---------- */
 function tick(){
  const t=now();
  for(const [id,iv] of invites)if(t>iv.exp){invites.delete(id);if(me(iv.from))ev(iv.from,'invExpired',{inv:id});if(me(iv.to))ev(iv.to,'invExpired',{inv:id})}
  for(const m of matches.values()){
   if(m.state==='done'){if(t-m.doneAt>120000){matches.delete(m.id)}continue}
   m.players.forEach(p=>{if(p.connected&&!p.forfeited)probe(p,false);if(!p.connected&&!p.forfeited&&t-p.discAt>cfg.disconnectGraceMs)forfeit(m,p,'déconnexion')});
   if(m.state==='done')continue;
   if(m.phase==='countdown'){if(t>=m.until)ask(m)}
   else if(m.phase==='ask'){if(t>=m.deadline||allAnswered(m))closeQuestion(m)}
   else if(m.phase==='reveal'&&t>=m.until){if(m.qi>=m.questions.length-1)finish(m);else ask(m)}}}
 const sweep=()=>{for(const [k,t] of lastChallenge)if(now()-t>60000)lastChallenge.delete(k)};

 return {handle,onLeave,onRtt,tick:()=>{tick();sweep()},metrics,config:cfg,_matches:matches,_invites:invites,top:v=>store.top(v,10)}}
module.exports={createQuiz};
