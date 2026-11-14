/* Awalé (Abapa / Oware) — 2 joueurs. Règles PURES (aucun DOM, aucun réseau).
   Règles retenues :
   - 2×6 trous, 4 graines par trou ; chaque siège possède 6 trous. Positions absolues 0..11 : siège 0 = 0..5, siège 1 = 6..11 ;
     le semis se fait dans le sens des indices croissants (sens anti-horaire pour les deux joueurs assis face à face) ;
   - un coup {pit:0..5} désigne un trou du joueur (relatif au siège) ; le trou de départ est sauté lors d'un tour de 12 graines ou plus ;
   - capture : si la dernière graine tombe chez l'adversaire dans un trou qui contient alors 2 ou 3 graines, elles sont prises,
     puis le trou précédent (chez l'adversaire) est examiné de la même façon, en chaîne rétrograde ;
   - rafle totale interdite : un coup qui prendrait toutes les graines de l'adversaire est joué sans aucune capture ;
   - obligation de nourrir : si l'adversaire n'a plus de graines, il faut jouer un coup qui lui en donne ; si aucun coup ne le permet,
     la partie s'arrête et chaque joueur garde les graines de son côté ;
   - victoire dès 25 graines capturées (> 24) ; 200 coups consécutifs sans capture : chaque joueur garde les graines de son côté ;
   - 24-24 : égalité. Information parfaite : view() est une copie de l'état. */
(function(root,f){if(typeof module==='object'&&module.exports){module.exports=f(require('../core.js'),require('../ai.js'))}else{root.LCA.games.register(f(root.LCA.games,root.LCA.gameAI))}})(typeof self!=='undefined'?self:this,function(core,AI){
 'use strict';
 const {RuleError}=core,WIN_SEEDS=25,MAX_SANS_PRISE=200;
 const nPlayers=p=>Array.isArray(p)?p.length:p;
 const own=(pos,seat)=>pos>=seat*6&&pos<seat*6+6;
 const side=(pits,seat)=>{let t=0;for(let i=seat*6;i<seat*6+6;i++)t+=pits[i];return t};

 /* Semis + capture sur un tableau de 12 trous (copié). Renvoie {pits,cap,last}. */
 function sow(pits,seat,pit){
  const p=pits.slice(),start=seat*6+pit;let n=p[start],pos=start;p[start]=0;
  while(n>0){pos=(pos+1)%12;if(pos===start)continue;p[pos]++;n--}
  let cap=0;
  if(!own(pos,seat)){
   const lo=(1-seat)*6,taken=[];let q=pos;
   while(q>=lo&&q<lo+6&&(p[q]===2||p[q]===3)){taken.push(q);q--}
   if(taken.length){
    let rest=side(p,1-seat);for(const t of taken)rest-=p[t];
    if(rest>0)for(const t of taken){cap+=p[t];p[t]=0}}}   /* rest===0 : rafle totale, pas de capture */
  return {pits:p,cap,last:pos}}

 function movesOf(st,seat){
  const out=[],needFeed=side(st.pits,1-seat)===0;
  for(let i=0;i<6;i++){
   if(st.pits[seat*6+i]<=0)continue;
   if(needFeed&&side(sow(st.pits,seat,i).pits,1-seat)===0)continue;
   out.push({pit:i})}
  return out}

 function init({players}){
  if(nPlayers(players)!==2)throw new RuleError('joueurs','L’awalé se joue à 2 joueurs');
  return {id:'awale',pits:[4,4,4,4,4,4,4,4,4,4,4,4],store:[0,0],cur:0,noCap:0,plies:0,last:null,res:null}}
 const turn=st=>st.res?-1:st.cur;
 const legalMoves=(st,seat)=>(st.res||seat!==st.cur)?[]:movesOf(st,seat);
 const result=st=>st.res?core.clone(st.res):null;

 /* Application sans validation (utilisée par apply après contrôle et par l'IA). */
 function raw(s,m,seat){
  const r=sow(s.pits,seat,m.pit),n={id:'awale',pits:r.pits,store:s.store.slice(),cur:1-seat,noCap:r.cap?0:s.noCap+1,plies:s.plies+1,
   last:{seat,pit:m.pit,captured:r.cap,end:r.last},res:null};
  n.store[seat]+=r.cap;
  let reason=null;
  if(n.store[seat]>=WIN_SEEDS)reason='captures';
  else if(n.noCap>=MAX_SANS_PRISE)reason='boucle';
  else if(!movesOf(n,n.cur).length)reason='plus_de_coups';
  if(reason){
   if(reason!=='captures')for(const i of [0,1]){n.store[i]+=side(n.pits,i)}
   if(reason!=='captures')n.pits=n.pits.map(()=>0);
   const a=n.store[0],b=n.store[1];
   n.res={winners:a>24?[0]:b>24?[1]:[],draw:a<=24&&b<=24,reason,scores:{0:a,1:b}};
   n.cur=-1}
  return n}

 function apply(state,move,seat){
  if(!state||state.res)throw new RuleError('partie_finie','La partie est terminée');
  if(!Number.isInteger(seat)||seat<0||seat>1)throw new RuleError('siege_invalide','Siège invalide');
  if(seat!==state.cur)throw new RuleError('hors_tour','Ce n’est pas votre tour');
  if(move===null||typeof move!=='object'||Array.isArray(move))throw new RuleError('coup_mal_forme','Coup mal formé');
  const keys=Object.keys(move);
  if(keys.length!==1||keys[0]!=='pit'||!Number.isInteger(move.pit)||move.pit<0||move.pit>5)throw new RuleError('coup_mal_forme','Coup mal formé');
  const m=core.pick(movesOf(state,seat),{pit:move.pit});
  if(!m)throw new RuleError('coup_illegal','Coup illégal');
  return raw(state,m,seat)}

 const view=(st,seat)=>core.clone(st);

 /* IA : différence de graines capturées (poids 10) + mobilité (trous jouables) + graines de son côté. */
 function evaluate(s,seat){
  const o=1-seat;let mob=0;
  for(let i=0;i<6;i++){if(s.pits[seat*6+i]>0)mob++;if(s.pits[o*6+i]>0)mob--}
  return 10*(s.store[seat]-s.store[o])+2*mob+Math.round((side(s.pits,seat)-side(s.pits,o))/2)}
 const aiGame={turn:s=>s.res?-1:s.cur,legalMoves:(s,seat)=>s.res||seat!==s.cur?[]:movesOf(s,seat),apply:raw,result:s=>s.res};
 function chooseMove(v,seat,opts){
  const p=AI.levelParams(opts),moves=legalMoves(v,seat);
  if(!moves.length)return null;
  if(p.blunder&&p.rng()<p.blunder)return moves[Math.floor(p.rng()*moves.length)];
  const r=AI.alphabeta(aiGame,v,seat,{depth:p.depth,budgetMs:p.budgetMs,rng:p.rng,evaluate});
  return r.move?core.clone(r.move):moves[0]}

 function notation(st,move){
  const seat=st.cur;if(!move||!Number.isInteger(move.pit)||move.pit<0||move.pit>5||!(seat===0||seat===1))return '?';
  const r=sow(st.pits,seat,move.pit);return (move.pit+1)+(r.cap?'x'+r.cap:'')}

 return {id:'awale',name:'Awalé',minPlayers:2,maxPlayers:2,init,turn,legalMoves,apply,result,view,chooseMove,notation}});
