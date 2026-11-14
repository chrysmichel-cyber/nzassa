/* Bataille — 2 joueurs, 52 cartes N'Zassa (26 chacun). Règles PURES (aucun DOM, aucun réseau).
   Règles retenues :
   - chaque joueur « retourne » la carte du dessus de son paquet ({t:'flip'}), le siège 0 puis le siège 1 ;
   - la plus forte gagne le pli : A > R > D > V > 10 > 9 > … > 3 > 2 (les familles ne comptent pas) ;
   - égalité = bataille : chaque joueur pose une carte face cachée puis retourne la suivante, et ainsi de suite ;
     un joueur qui n'a pas au moins 2 cartes à ce moment perd (si les deux sont à court : nulle) ;
   - les cartes gagnées passent sous le paquet du gagnant dans un ordre mélangé par un germe secret de l'état (sinon les parties bouclent) ;
   - fin : un joueur n'a plus de cartes ; plafond de 1000 plis → victoire à celui qui a le plus de cartes (reason 'plafond').
   Information : l'ordre des paquets est secret pour tout le monde ; view() ne montre que les nombres de cartes. */
(function(root,f){if(typeof module==='object'&&module.exports){module.exports=f(require('../core.js'),require('./deck.js'))}else{root.LCA.games.register(f(root.LCA.games,root.LCA.games.deck))}})(typeof self!=='undefined'?self:this,function(core,deck){
 const {RuleError}=core,MAX_PLIS=1000;
 const nPlayers=p=>Array.isArray(p)?p.length:p;
 const FLIP={t:'flip'};
 function init({players,rng}){
  if(nPlayers(players)!==2)throw new RuleError('joueurs','La bataille se joue à 2 joueurs');
  const d=deck.shuffled(core,rng);
  return {id:'bataille',n:2,hands:[d.slice(0,26),d.slice(26)],cur:[null,null],table:[],battles:0,plis:0,last:null,res:null,rs:Math.floor(rng()*4294967296)}}
 const turn=st=>st.res?-1:(st.cur[0]===null?0:1);
 const legalMoves=(st,seat)=>(st.res||seat!==turn(st))?[]:[{t:'flip'}];
 const result=st=>st.res?core.clone(st.res):null;
 const count=(st,i)=>st.hands?st.hands[i].length:st.counts[i];
 function apply(state,move,seat){
  if(state.res)throw new RuleError('partie_finie','La partie est terminée');
  if(!Number.isInteger(seat)||seat<0||seat>1)throw new RuleError('siege_invalide','Siège invalide');
  if(seat!==turn(state))throw new RuleError('hors_tour','Ce n’est pas votre tour');
  if(move===null||typeof move!=='object'||Array.isArray(move)||typeof move.t!=='string')throw new RuleError('coup_mal_forme','Coup mal formé');
  if(!core.pick(legalMoves(state,seat),move))throw new RuleError('coup_illegal','Coup illégal');
  const s=core.clone(state),card=s.hands[seat].shift();
  s.cur[seat]=card;s.table.push({seat,card,up:true});
  if(s.cur[0]===null||s.cur[1]===null)return s;
  const a=deck.rankIndex(s.cur[0]),b=deck.rankIndex(s.cur[1]);
  if(a===b){
   /* bataille : chacun doit pouvoir poser une carte cachée ET en retourner une autre */
   const short=[0,1].filter(i=>s.hands[i].length<2);
   if(short.length===2)s.res={winners:[],draw:true,reason:'bataille',scores:{0:s.hands[0].length,1:s.hands[1].length}};
   else if(short.length===1)s.res={winners:[1-short[0]],draw:false,reason:'bataille',scores:{0:s.hands[0].length,1:s.hands[1].length}};
   else{for(const i of [0,1])s.table.push({seat:i,card:s.hands[i].shift(),up:false});s.battles++;s.cur=[null,null]}
   if(s.res)s.last={winner:null,battle:true,up:s.table.filter(x=>x.up).map(x=>x.card)};
   return s}
  const w=a>b?0:1,got=s.table.map(x=>x.card);
  s.last={winner:w,battle:s.table.length>2,up:s.table.filter(x=>x.up).map(x=>x.card),n:got.length};
  /* l'ordre de remise sous le paquet est mélangé par un germe d'état (secret, avancé à chaque pli) : évite les parties qui bouclent à l'infini */
  s.rs=(s.rs+0x9E3779B9)>>>0;s.hands[w].push(...core.shuffle(got,core.mulberry32(s.rs)));s.table=[];s.cur=[null,null];s.plis++;
  const sc={0:s.hands[0].length,1:s.hands[1].length};
  if(!s.hands[0].length||!s.hands[1].length)s.res={winners:[s.hands[0].length?0:1],draw:false,reason:'cartes',scores:sc};
  else if(s.plis>=MAX_PLIS)s.res=sc[0]===sc[1]?{winners:[],draw:true,reason:'plafond',scores:sc}:{winners:[sc[0]>sc[1]?0:1],draw:false,reason:'plafond',scores:sc};
  return s}
 /* Vue : aucune carte des paquets (ni les siens : l'ordre du paquet est secret), seulement les nombres. Les cartes
    retournées sont publiques ; les cartes posées face cachée (bataille) apparaissent sans valeur. */
 function view(st,seat){
  const v={id:st.id,n:2,counts:[count(st,0),count(st,1)],cur:st.cur.slice(),table:st.table.map(x=>({seat:x.seat,card:x.up?x.card:null,up:x.up})),
   battles:st.battles,plis:st.plis,last:st.last?core.clone(st.last):null,res:st.res?core.clone(st.res):null};
  v.seat=Number.isInteger(seat)?seat:null;return v}
 function chooseMove(){return {t:'flip'}}
 function notation(st,move,seat){return 'Siège '+(seat+1)+' retourne'}
 return {id:'bataille',name:'Bataille',minPlayers:2,maxPlayers:2,init,turn,legalMoves,apply,result,view,chooseMove,notation}});
