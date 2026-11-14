/* Sessions de jeu : même interface pour une partie LOCALE (solo contre l'IA, aucun réseau) et une partie EN LIGNE (serveur autoritaire, server/tables.cjs).
   Les deux produisent le même « instantané » que le panneau affiche, calqué sur le message serveur {t:'tbl',ev:'state'} :
     {mode:'local'|'live', table, game, phase:'play'|'done', seat, view, legal, turn, seats:[{name,bot,up,k}], res, last, hist:[{seat,note}], deadline, watchers, rematch, priv, owner}
   Aucune règle ici : tout passe par la définition du jeu (LCA.games.get(id)). En local, les robots ne reçoivent que def.view(état, leur siège). */
(function(root){
 const LCA=root.LCA=root.LCA||{};
 const G=()=>LCA.games;
 const LEVELS={1:{budgetMs:200},2:{budgetMs:450},3:{budgetMs:900}};
 /* ---------- partie locale ---------- */
 function local(o){
  const def=G().get(o.game);if(!def)throw new Error('jeu inconnu : '+o.game);
  const n=o.players||(o.game==='belote'?4:def.minPlayers),level=LEVELS[o.level]?o.level:2;
  let me=Number.isInteger(o.seat)&&o.seat>=0&&o.seat<n?o.seat:0;const names=o.names||[],seats=[];for(let i=0;i<n;i++)seats.push(i===me?{name:o.name||'Toi',bot:false,up:true,k:'g'}:{name:names[i]||('Robot '+(i+1)),bot:true,up:true,k:'b'});
  const rng=o.rng||Math.random,botDelay=o.botDelayMs==null?650:o.botDelayMs,setT=o.setTimeout||setTimeout,clearT=o.clearTimeout||clearTimeout;
  let st=null,hist=[],last=null,timer=null,listeners=[],stopped=false,res=null,startAt=0;
  function snapshot(){
   const r=res||(st?def.result(st):null),turn=st&&!r?def.turn(st):-1;
   return {mode:'local',table:null,game:o.game,phase:r?'done':'play',seat:me,view:st?def.view(st,me):null,legal:!r&&turn===me?def.legalMoves(st,me):[],turn,
    seats:seats.map(s=>Object.assign({},s)),res:r,last,hist:hist.slice(-60),deadline:0,watchers:0,rematch:0,priv:false,owner:null,level}}
  const emit=()=>{const s=snapshot();listeners.forEach(f=>{try{f(s)}catch(e){if(root.console)console.error(e)}})};
  function play(seat,move){
   const was=st;let ns;try{ns=def.apply(st,move,seat)}catch(e){return {err:e.code||'coup_illegal',error:e.message}}
   let note='';try{if(def.notation)note=def.notation(was,move,seat)||''}catch(e){}
   st=ns;last={seat,move};hist.push({seat,note:String(note).slice(0,60)});schedule();emit();return {ok:true}}
  function schedule(){
   clearT(timer);timer=null;if(stopped||res)return;const r=def.result(st);if(r)return;const t=def.turn(st);if(t<0||!seats[t].bot)return;
   timer=setT(()=>{timer=null;if(stopped)return;let mv=null;
    try{mv=def.chooseMove(def.view(st,t),t,Object.assign({level,rng},LEVELS[level]))}catch(e){if(root.console)console.warn('robot',e)}
    if(!mv||play(t,mv).err){const lm=def.legalMoves(st,t);if(lm.length)play(t,lm[0])}},botDelay)}
  function start(){res=null;st=def.init({players:seats.map(s=>s.name),rng});hist=[];last=null;startAt=Date.now();schedule();emit()}
  return {
   mode:'local',game:o.game,
   on(f){listeners.push(f);return ()=>{listeners=listeners.filter(x=>x!==f)}},
   start,
   move(m){if(!st||res)return {err:'pas_en_jeu'};if(def.turn(st)!==me)return {err:'hors_tour',error:'Ce n’est pas ton tour.'};const r=play(me,m);if(r.err)emit();return r},
   resign(){if(!st||res||def.result(st))return;res={winners:seats.map((_,i)=>i).filter(i=>i!==me&&(o.game!=='belote'||i%2!==me%2)),draw:false,reason:'abandon',loser:me};clearT(timer);emit()},
   rematch(){if(n===2){/* on alterne qui commence */seats.reverse();me=seats.findIndex(s=>!s.bot)}start()},
   get seat(){return seats.findIndex(s=>!s.bot)},
   stop(){stopped=true;clearT(timer);listeners=[]},
   snapshot,elapsed:()=>Date.now()-startAt,
   _state:()=>st}}
 /* ---------- partie en ligne ---------- */
 /* host : {send(obj)->bool, onTables(fn)->unsub, onReopen(fn)->unsub} ; le serveur décide de tout */
 function live(o){
  const host=o.host,table=o.table;let listeners=[],errL=[],evL=[],snap=null,token=o.token||null,unsub=[],stopped=false;
  const emit=s=>listeners.forEach(f=>{try{f(s)}catch(e){if(root.console)console.error(e)}});
  const send=(op,x)=>host.send(Object.assign({t:'tbl',op,table},x||{}));
  unsub.push(host.onTables(m=>{
   if(stopped||!m||m.t!=='tbl')return;
   if(m.ev==='state'&&m.table===table){snap=Object.assign({},m,{mode:'live'});emit(snap);return}
   if(m.ev==='resume'&&m.table===table){token=m.token;if(o.onToken)o.onToken(table,token);return}
   if(m.ev==='err'){errL.forEach(f=>f(m));return}
   evL.forEach(f=>f(m))}));
  if(host.onReopen)unsub.push(host.onReopen(()=>{if(!stopped&&token)send('resume',{token})}));
  return {
   mode:'live',table,
   on(f){listeners.push(f);if(snap)f(snap);return ()=>{listeners=listeners.filter(x=>x!==f)}},
   onError(f){errL.push(f)},onEvent(f){evL.push(f)},
   sit(x){return send('sit',x)},start(bots){return send('start',bots===false?{bots:false}:{})},watch(){return send('watch')},
   move(m){return send('move',{move:m})},resign(){return send('resign')},stand(){return send('stand')},unwatch(){return send('unwatch')},
   rematch(){return send('rematch')},say(id){return send('say',{id})},invite(to){return send('invite',{to})},
   resume(tk){token=tk||token;return token?send('resume',{token}):false},
   get token(){return token},snapshot:()=>snap,
   stop(){stopped=true;unsub.forEach(f=>{try{f()}catch(e){}});listeners=[];errL=[];evL=[]}}}
 LCA.gameSession={local,live,LEVELS};
 if(typeof module==='object'&&module.exports)module.exports=LCA.gameSession;
})(typeof self!=='undefined'?self:this);
