/* Menteur — 2 à 4 joueurs, 52 cartes N'Zassa distribuées entièrement. Règles PURES (aucun DOM, aucun réseau).
   Règles retenues :
   - les joueurs posent à tour de rôle 1 à 4 cartes FACE CACHÉE sur la pile en annonçant le rang demandé ; le rang
     annoncé est imposé par la séquence 2, 3, … 10, V, D, R, A puis on reboucle (la séquence avance à chaque pose) ;
   - le joueur suivant peut « Menteur ! » ({t:'call'}) ou continuer à poser ; seule la DERNIÈRE pose peut être accusée ;
   - accusation : on retourne les cartes de la dernière pose. Toutes du rang annoncé : l'accusateur ramasse TOUTE la
     pile ; sinon c'est le menteur qui la ramasse. Celui qui ramasse recommence (la séquence continue) ;
   - gagne le premier qui n'a plus de cartes, mais seulement si sa dernière pose n'est pas un mensonge : quand un joueur
     vient de vider sa main, le joueur suivant DOIT accuser (seul coup légal) ; honnête → victoire ; menteur → il ramasse ;
   - partie à durée bornée : 400 coups → victoire de celui qui a le moins de cartes (reason 'plafond', nulle si égalité).
   Coups : {t:'play',cards:[...]} (champ optionnel rank accepté seulement s'il égale le rang imposé) ; {t:'call'}.
   Information : les cartes posées restent cachées (vue : leur nombre et le rang annoncé) ; seule la dernière
   révélation (view.reveal) est publique. legalMoves renvoie les cartes dans l'ordre canonique (famille puis rang). */
(function(root,f){if(typeof module==='object'&&module.exports){module.exports=f(require('../core.js'),require('./deck.js'))}else{root.LCA.games.register(f(root.LCA.games,root.LCA.games.deck))}})(typeof self!=='undefined'?self:this,function(core,deck){
 const {RuleError}=core,SEQ=deck.RANKS,MAX_COUPS=400,MAX_CARDS=4;
 const nPlayers=p=>Array.isArray(p)?p.length:p;
 function init({players,rng}){
  const n=nPlayers(players);
  if(!Number.isInteger(n)||n<2||n>4)throw new RuleError('joueurs','Le menteur se joue de 2 à 4 joueurs');
  const d=deck.shuffled(core,rng),hands=Array.from({length:n},()=>[]);
  d.forEach((c,i)=>hands[i%n].push(c));hands.forEach(h=>h.sort(deck.cmp));
  return {id:'menteur',n,hands,pile:[],last:null,reveal:null,cur:0,next:0,coups:0,res:null}}
 const turn=st=>st.res?-1:st.cur;
 const count=(st,i)=>st.hands&&st.hands[i]?st.hands[i].length:st.counts[i];
 const handOf=(st,seat)=>(st.hands&&Array.isArray(st.hands[seat]))?st.hands[seat]:null;
 const pileSize=st=>st.pile?st.pile.length:st.pileN;
 /* Obligation d'accuser : le dernier poseur n'a plus de cartes. */
 const mustCall=st=>!!st.last&&count(st,st.last.seat)===0;
 function combos(arr,k){const out=[];(function rec(start,cur){if(cur.length===k){out.push(cur.slice());return}for(let i=start;i<arr.length;i++){cur.push(arr[i]);rec(i+1,cur);cur.pop()}})(0,[]);return out}
 function legalMoves(st,seat){
  if(st.res||seat!==st.cur)return [];
  const h=handOf(st,seat);if(!h)return [];
  const out=[];
  if(!mustCall(st)){const hs=h.slice().sort(deck.cmp);for(let k=1;k<=Math.min(MAX_CARDS,hs.length);k++)for(const c of combos(hs,k))out.push({t:'play',cards:c})}
  if(st.last)out.push({t:'call'});
  return out}
 function result(st){return st.res?core.clone(st.res):null}
 function scores(st){const o={};for(let i=0;i<st.n;i++)o[i]=count(st,i);return o}
 function apply(state,move,seat){
  if(state.res)throw new RuleError('partie_finie','La partie est terminée');
  if(!Number.isInteger(seat)||seat<0||seat>=state.n)throw new RuleError('siege_invalide','Siège invalide');
  if(seat!==state.cur)throw new RuleError('hors_tour','Ce n’est pas votre tour');
  if(move===null||typeof move!=='object'||Array.isArray(move)||typeof move.t!=='string')throw new RuleError('coup_mal_forme','Coup mal formé');
  const s=core.clone(state);
  if(move.t==='call'){
   if(Object.keys(move).length!==1)throw new RuleError('coup_mal_forme','Coup mal formé');
   if(!s.last)throw new RuleError('pas_de_coup','Rien à accuser : aucune pose précédente');
   const owner=s.last.seat,cards=s.last.cards,rank=s.last.rank,pileN=s.pile.length;
   const liar=!cards.every(c=>deck.rankOf(c)===rank),taker=liar?owner:seat;
   s.hands[taker]=s.hands[taker].concat(s.pile).sort(deck.cmp);
   s.reveal={caller:seat,owner,cards:cards.slice(),rank,liar,taker,pileN};
   s.pile=[];s.last=null;s.cur=taker;s.coups++;
   if(!s.hands[owner].length)s.res={winners:[owner],draw:false,reason:'cartes',scores:scores(s)};
  }else if(move.t==='play'){
   for(const k of Object.keys(move))if(k!=='t'&&k!=='cards'&&k!=='rank')throw new RuleError('coup_mal_forme','Champ inconnu : '+k);
   if(!Array.isArray(move.cards))throw new RuleError('coup_mal_forme','cards doit être une liste');
   if(mustCall(s))throw new RuleError('accusation_obligatoire','Le joueur précédent a vidé sa main : il faut l’accuser');
   const cards=move.cards;
   if(cards.length<1||cards.length>MAX_CARDS)throw new RuleError('coup_illegal','Il faut poser de 1 à '+MAX_CARDS+' cartes');
   for(const c of cards)if(!deck.isCard(c))throw new RuleError('carte_inexistante','Carte inexistante');
   if(new Set(cards).size!==cards.length)throw new RuleError('carte_en_double','Carte en double');
   const want=SEQ[s.next];
   if(move.rank!==undefined&&move.rank!==want)throw new RuleError('mauvais_rang','Le rang annoncé doit être '+want);
   for(const c of cards)if(!s.hands[seat].includes(c))throw new RuleError('carte_absente','Vous n’avez pas cette carte');
   const cs=cards.slice().sort(deck.cmp);
   s.hands[seat]=s.hands[seat].filter(c=>!cs.includes(c));
   s.pile.push(...cs);s.last={seat,cards:cs,rank:want,n:cs.length};s.reveal=null;
   s.next=(s.next+1)%SEQ.length;s.cur=(seat+1)%s.n;s.coups++;
  }else throw new RuleError('coup_illegal','Coup inconnu');
  if(!s.res&&s.coups>=MAX_COUPS){
   const c=scores(s),min=Math.min(...Object.values(c)),w=Object.keys(c).filter(i=>c[i]===min).map(Number);
   s.res={winners:w.length===1?w:[],draw:w.length!==1,reason:'plafond',scores:c}}
  return s}
 /* Vue : sa propre main seulement ; adversaires et pile réduits à des nombres ; cartes posées jamais visibles. */
 function view(st,seat){
  const me=Number.isInteger(seat)&&seat>=0&&seat<st.n?seat:null,n=st.n,counts=[];
  for(let i=0;i<n;i++)counts.push(count(st,i));
  const h=me===null?null:handOf(st,me);
  return {id:st.id,n,seat:me,hands:Array.from({length:n},(_,i)=>i===me&&h?h.slice():null),counts,pileN:pileSize(st),
   last:st.last?{seat:st.last.seat,n:st.last.n,rank:st.last.rank}:null,reveal:st.reveal?core.clone(st.reveal):null,
   cur:st.cur,next:st.next,want:SEQ[st.next],coups:st.coups,res:st.res?core.clone(st.res):null}}
 /* ---- Robot : ne lit QUE la vue ---- */
 const C=(n,k)=>{if(k<0||k>n)return 0;let r=1;for(let i=1;i<=k;i++)r=r*(n-k+i)/i;return r};
 /* P(au moins m cartes du rang parmi h tirées d'une population de U dont k du rang). */
 function atLeast(U,k,h,m){let p=0;for(let x=m;x<=Math.min(k,h);x++)p+=C(k,x)*C(U-k,h-x)/C(U,h);return Math.min(1,Math.max(0,p))}
 /* Probabilité estimée que la dernière pose soit sincère, vue depuis MA main. */
 function truthProb(v,seat,hand){
  const l=v.last,mine=hand.filter(c=>deck.rankOf(c)===l.rank).length,k=4-mine;
  if(l.n>k)return 0;
  const U=52-hand.length,h=Math.min(U,v.counts[l.seat]+l.n),q=atLeast(U,k,h,l.n),honest=0.85;
  return q*honest/(q*honest+(1-q))}
 function chooseMove(view,seat,opt){
  opt=opt||{};const level=Math.max(1,Math.min(3,opt.level|0||1)),rng=opt.rng||Math.random;
  const hand=(view.hands&&view.hands[seat])||[];
  if(view.res||view.cur!==seat||!hand.length&&!view.last)return null;
  const forced=!!view.last&&view.counts[view.last.seat]===0;
  if(forced)return {t:'call'};
  if(view.last){
   const p=truthProb(view,seat,hand);let thr=[0,0.3,0.4,0.46][level];
   /* un adversaire proche de vider sa main : l'accuser devient presque toujours rentable */
   const ls=view.last.seat,lc=view.counts[ls];
   
   
   if(p<thr)return {t:'call'}}
  const want=view.want,good=hand.filter(c=>deck.rankOf(c)===want).sort(deck.cmp);
  const pickN=a=>a[Math.floor(rng()*a.length)];
  if(good.length){
   if(level===1)return {t:'play',cards:good.slice(0,1+Math.floor(rng()*good.length))};
   return {t:'play',cards:good}}
  /* pas le rang demandé : mensonge forcé */
  const sorted=hand.slice().sort(deck.cmp);
  if(level===1){const k=1+Math.floor(rng()*Math.min(2,sorted.length)),pool=sorted.slice(),cs=[];while(cs.length<k)cs.push(pool.splice(Math.floor(rng()*pool.length),1)[0]);return {t:'play',cards:cs.sort(deck.cmp)}}
  const byRank={};for(const c of sorted)(byRank[deck.rankOf(c)]=byRank[deck.rankOf(c)]||[]).push(c);
  let ranks=Object.keys(byRank);
  if(level===3){const singles=ranks.filter(r=>byRank[r].length===1);if(singles.length)ranks=singles}
  return {t:'play',cards:[byRank[pickN(ranks)][0]]}}
 function notation(st,move,seat){return move.t==='call'?'Joueur '+(seat+1)+' : Menteur !':'Joueur '+(seat+1)+' pose '+move.cards.length+' carte(s) : '+SEQ[st.next]}
 return {id:'menteur',name:'Menteur',minPlayers:2,maxPlayers:4,init,turn,legalMoves,apply,result,view,chooseMove,notation}});
