/* Belote classique à prise — 4 joueurs, 2 équipes (sièges 0&2 contre 1&3), paquet N'Zassa de 32 cartes. Règles PURES.
   Le « Valet » (V) est le valet de la belote ; « Dame + Roi » d'atout = belote-rebelote. Objectif : 501 points.
   Donne : 3 cartes puis 2 à chacun (à partir du siège après le donneur), une carte est retournée (la « retourne »), le reste
   forme le talon (11 cartes, masqué). Enchères : tour 1 = prendre la retourne comme atout ({t:'take'}) ou passer ;
   tour 2 = choisir une autre famille ({t:'suit',suit}) ou passer. Personne ne prend : on redonne (le donneur change).
   Le preneur reçoit la retourne + 2 cartes du talon, les trois autres joueurs 3 cartes (8 cartes chacun).
   Valeurs — atout : V 20, 9 14, A 11, 10 10, R 4, D 3, 8 0, 7 0 ; hors atout : A 11, 10 10, R 4, D 3, V 2, 9/8/7 0.
   Total 152 + dix de der (10) = 162. Belote-rebelote +20 (à l'équipe du joueur qui joue Dame ET Roi d'atout).
   Jeu : fournir à la couleur ; à l'atout, monter si possible ; sans la couleur, couper (et sur-couper si on le peut, sinon
   sous-couper), SAUF si le partenaire est maître du pli (aucune obligation de couper).
   Contrat : le preneur doit faire au moins 82 points de cartes (belote exclue). Sinon « dedans » : l'équipe adverse marque 162,
   le preneur 0 ; la belote reste à l'équipe qui la détient. Règle simple : pas de « litige » à 81-81 (81 = dedans).
   Capot (une équipe fait les 8 plis) : 252 points à cette équipe (l'autre 0). Points comptés exacts (pas d'arrondi à la dizaine).
   NON IMPLÉMENTÉ dans cette version : annonces (tierce, cinquante, cent, carré : volontairement absentes), litige 81-81, coinche/surcoinche.
   Fin : une équipe a ≥ 501 points à la fin d'une donne et plus que l'autre (égalité : on rejoue une donne).
   Coups : {t:'take'} | {t:'pass'} | {t:'suit',suit} | {t:'play',card}.
   Le hasard des redonnes est dérivé d'une graine stockée dans l'état (apply reste pur) ; view() ne la montre jamais. */
(function(root,f){if(typeof module==='object'&&module.exports){module.exports=f(require('../core.js'),require('./deck.js'))}else{root.LCA.games.register(f(root.LCA.games,root.LCA.games.deck))}})(typeof self!=='undefined'?self:this,function(core,deck){
 const {RuleError}=core,TARGET=501,SUITS=deck.SUITS;
 const TRUMP_PTS={V:20,'9':14,A:11,'10':10,R:4,D:3,'8':0,'7':0},PLAIN_PTS={A:11,'10':10,R:4,D:3,V:2,'9':0,'8':0,'7':0};
 const TRUMP_ORDER=['7','8','D','R','10','A','9','V'],PLAIN_ORDER=['7','8','9','V','D','R','10','A'];
 const nPlayers=p=>Array.isArray(p)?p.length:p;
 const pts=(c,trump)=>(deck.suitOf(c)===trump?TRUMP_PTS:PLAIN_PTS)[deck.rankOf(c)];
 /* force d'une carte pour le gagnant d'un pli : les atouts dominent la couleur demandée */
 function strength(c,trump,led){
  const s=deck.suitOf(c),r=deck.rankOf(c);
  if(s===trump)return 100+TRUMP_ORDER.indexOf(r);
  if(s===led)return PLAIN_ORDER.indexOf(r);
  return -1}
 function trickWinner(cards,trump){
  const led=deck.suitOf(cards[0].card);let best=cards[0],bs=strength(best.card,trump,led);
  for(const x of cards.slice(1)){const v=strength(x.card,trump,led);if(v>bs){best=x;bs=v}}
  return best.seat}
 const teamOf=seat=>seat%2;
 /* donne déterministe depuis la graine */
 function deal(st){
  const d=deck.shuffled32(core,core.mulberry32((st.seed+st.deals*7919)>>>0)),hands=[[],[],[],[]];
  let k=0;
  for(const n of [3,2])for(let i=0;i<4;i++){const s=(st.dealer+1+i)%4;for(let j=0;j<n;j++)hands[s].push(d[k++])}
  st.up=d[k++];st.talon=d.slice(k);st.hands=hands;
  st.phase='bid1';st.bidder=(st.dealer+1)%4;st.bidN=0;st.contract=null;
  st.trick={lead:(st.dealer+1)%4,cards:[]};st.done=[];st.cur=(st.dealer+1)%4;st.pts=[0,0];st.won=[0,0]}
 function init({players,rng}){
  if(nPlayers(players)!==4)throw new RuleError('joueurs','La belote se joue à 4 joueurs');
  const st={id:'belote',n:4,seed:Math.floor(rng()*4294967296),deals:0,dealer:Math.floor(rng()*4),score:[0,0],hist:[],res:null,target:TARGET};
  deal(st);return st}
 const turn=st=>st.res?-1:(st.phase==='bid1'||st.phase==='bid2'?st.bidder:(st.phase==='play'?st.cur:-1));
 const handOf=(st,seat)=>(st.hands&&Array.isArray(st.hands[seat]))?st.hands[seat]:null;
 /* cartes jouables (obligations de fournir / couper / monter) */
 function playable(st,seat){
  const hand=handOf(st,seat),tr=st.contract.suit,cs=st.trick.cards;
  if(!hand)return [];
  if(!cs.length)return hand.slice();
  const led=deck.suitOf(cs[0].card),same=hand.filter(c=>deck.suitOf(c)===led);
  const maxTrump=cs.reduce((m,x)=>deck.suitOf(x.card)===tr?Math.max(m,strength(x.card,tr,led)):m,-1);
  if(led===tr){
   if(!same.length)return hand.slice();
   const up=same.filter(c=>strength(c,tr,led)>maxTrump);return up.length?up:same}
  if(same.length)return same;
  const trumps=hand.filter(c=>deck.suitOf(c)===tr);
  if(!trumps.length)return hand.slice();
  if(teamOf(trickWinner(cs,tr))===teamOf(seat))return hand.slice();
  const over=trumps.filter(c=>strength(c,tr,led)>maxTrump);return over.length?over:trumps}
 function legalMoves(st,seat){
  if(st.res||!Number.isInteger(seat)||seat!==turn(st))return [];
  if(st.phase==='bid1')return [{t:'take'},{t:'pass'}];
  if(st.phase==='bid2'){const o=[];for(const s of SUITS)if(s!==deck.suitOf(st.up))o.push({t:'suit',suit:s});o.push({t:'pass'});return o}
  return playable(st,seat).sort(deck.cmp).map(c=>({t:'play',card:c}))}
 /* Score d'une donne (fonction pure, exposée pour les tests).
    takerTeam 0|1 ; cardPts [a,b] points de cartes dix de der compris (somme 162) ; won [w0,w1] plis ; belote équipe|-1. */
 function scoreDeal({takerTeam,cardPts,won,belote}){
  const o=1-takerTeam;let gain=[cardPts[0],cardPts[1]],capot=-1,dedans=false;
  if(won[0]===8||won[1]===8){capot=won[0]===8?0:1;gain=[0,0];gain[capot]=252;dedans=capot!==takerTeam}
  else if(cardPts[takerTeam]<82){dedans=true;gain=[0,0];gain[o]=162}
  if(belote===0||belote===1)gain[belote]+=20;
  return {gain,dedans,capot}}
 function endDeal(s,lastWinner){
  s.pts[teamOf(lastWinner)]+=10;
  let belote=-1;
  const tr=s.contract.suit,by={};
  for(const t of s.done)for(const x of t.cards){if(x.card==='D'+tr||x.card==='R'+tr)(by[x.seat]=by[x.seat]||[]).push(x.card)}
  for(const k of Object.keys(by))if(by[k].length===2)belote=teamOf(+k);
  const r=scoreDeal({takerTeam:teamOf(s.contract.seat),cardPts:s.pts,won:s.won,belote});
  s.score=[s.score[0]+r.gain[0],s.score[1]+r.gain[1]];
  s.hist.push({dealer:s.dealer,taker:s.contract.seat,suit:tr,cardPts:s.pts.slice(),won:s.won.slice(),belote,capot:r.capot,dedans:r.dedans,gain:r.gain,score:s.score.slice()});
  const [a,b]=s.score;
  if(Math.max(a,b)>=TARGET&&a!==b){
   const w=a>b?0:1;
   s.phase='over';s.res={winners:[w,w+2],draw:false,reason:'points',scores:{0:a,1:b,2:a,3:b},teams:[a,b]};s.cur=-1;s.bidder=-1;s.trick={lead:-1,cards:[]}}
  else{s.deals++;s.dealer=(s.dealer+1)%4;deal(s)}}
 function apply(state,move,seat){
  if(state.res)throw new RuleError('partie_finie','La partie est terminée');
  if(!Number.isInteger(seat)||seat<0||seat>3)throw new RuleError('siege_invalide','Siège invalide');
  if(seat!==turn(state))throw new RuleError('hors_tour','Ce n’est pas votre tour');
  if(move===null||typeof move!=='object'||Array.isArray(move)||typeof move.t!=='string')throw new RuleError('coup_mal_forme','Coup mal formé');
  if(move.t==='play'&&state.phase==='play'){
   if(!deck.isCard(move.card))throw new RuleError('carte_inexistante','Carte inexistante');
   if(!handOf(state,seat).includes(move.card))throw new RuleError('carte_absente','Vous n’avez pas cette carte')}
  const m=core.pick(legalMoves(state,seat),move);
  if(!m)throw new RuleError('coup_illegal','Coup illégal');
  const s=core.clone(state);
  if(s.phase==='bid1'||s.phase==='bid2'){
   if(m.t==='pass'){
    s.bidN++;
    if(s.bidN<4)s.bidder=(seat+1)%4;
    else if(s.phase==='bid1'){s.phase='bid2';s.bidN=0;s.bidder=(s.dealer+1)%4}
    else{s.deals++;s.dealer=(s.dealer+1)%4;deal(s)}
    return s}
   const suit=m.t==='take'?deck.suitOf(s.up):m.suit;
   s.contract={seat,suit,round:s.phase==='bid1'?1:2};
   for(let i=0;i<4;i++){const p=(s.dealer+1+i)%4;const k=p===seat?2:3;s.hands[p].push(...s.talon.splice(0,k))}
   s.hands[seat].push(s.up);s.hands.forEach(h=>h.sort(deck.cmp));
   s.talon=[];s.phase='play';s.cur=(s.dealer+1)%4;s.trick={lead:s.cur,cards:[]};return s}
  s.hands[seat]=s.hands[seat].filter(c=>c!==m.card);
  s.trick.cards.push({seat,card:m.card});
  if(s.trick.cards.length<4){s.cur=(seat+1)%4;return s}
  const w=trickWinner(s.trick.cards,s.contract.suit),tp=s.trick.cards.reduce((a,x)=>a+pts(x.card,s.contract.suit),0);
  s.pts[teamOf(w)]+=tp;s.won[teamOf(w)]++;
  s.done.push({lead:s.trick.lead,cards:s.trick.cards,winner:w});
  s.trick={lead:w,cards:[]};s.cur=w;
  if(s.done.length===8)endDeal(s,w);
  return s}
 const result=st=>st.res?core.clone(st.res):null;
 /* Vue : sa main seulement ; ni talon ni graine ; plis joués, retourne et atout publics. Observateur : aucune main. */
 function view(st,seat){
  const me=Number.isInteger(seat)&&seat>=0&&seat<4?seat:null,h=me===null?null:handOf(st,me);
  const counts=[0,1,2,3].map(i=>st.hands&&st.hands[i]?st.hands[i].length:st.counts[i]);
  return {id:st.id,n:4,seat:me,phase:st.phase,dealer:st.dealer,bidder:st.bidder,bidN:st.bidN,up:st.up,
   hands:[0,1,2,3].map(i=>i===me&&h?h.slice():null),counts,talonN:st.talon?st.talon.length:st.talonN,
   contract:st.contract?core.clone(st.contract):null,trick:core.clone(st.trick),done:core.clone(st.done),cur:st.cur,
   pts:st.pts.slice(),won:st.won.slice(),score:st.score.slice(),hist:core.clone(st.hist),res:st.res?core.clone(st.res):null,target:st.target}}
 /* ---- Robot : ne lit QUE la vue (jamais les mains des autres, ni talon, ni graine) ---- */
 function handValue(hand,suit){
  let v=0,n=0,hasD=false,hasR=false;
  for(const c of hand){const s=deck.suitOf(c),r=deck.rankOf(c);
   if(s===suit){n++;v+=TRUMP_PTS[r];if(r==='D')hasD=true;if(r==='R')hasR=true}else if(r==='A')v+=6}
  if(n>=3)v+=5*(n-2);if(hasD&&hasR)v+=8;return v}
 function bidMove(v,seat,hand,level,rng){
  const th=[0,58,50,46][level],last=v.bidN===3;
  if(v.phase==='bid1'){
   const sc=handValue(hand.concat([v.up]),deck.suitOf(v.up));
   if(sc>=th&&(level>1||rng()<0.7))return {t:'take'};
   return {t:'pass'}}
  let best=null,bs=-1;
  for(const s of SUITS){if(s===deck.suitOf(v.up))continue;const sc=handValue(hand,s);if(sc>bs){bs=sc;best=s}}
  if(bs>=th-6||(last&&bs>=(level===1?40:30)))return {t:'suit',suit:best};
  return {t:'pass'}}
 function chooseMove(view,seat,opt){
  opt=opt||{};const level=Math.max(1,Math.min(3,opt.level|0||2)),rng=opt.rng||Math.random;
  if(view.res||view.cur===undefined)return null;
  const legal=legalMoves(view,seat);if(!legal.length)return null;
  const hand=(view.hands&&view.hands[seat])||[];
  if(view.phase==='bid1'||view.phase==='bid2'){
   const m=bidMove(view,seat,hand,level,rng);
   return core.pick(legal,m)||legal[legal.length-1]}
  const tr=view.contract.suit,cards=legal.map(m=>m.card),cs=view.trick.cards;
  const rnd=a=>a[Math.floor(rng()*a.length)];
  if(level===1&&rng()<0.6)return {t:'play',card:rnd(cards)};
  const val=c=>pts(c,tr)+(deck.suitOf(c)===tr?0.5:0);
  const byLow=a=>a.slice().sort((x,y)=>val(x)-val(y)||strength(x,tr,deck.suitOf(x))-strength(y,tr,deck.suitOf(y)));
  let pick;
  if(!cs.length){
   const mine=view.contract.seat%2===seat%2,trumps=cards.filter(c=>deck.suitOf(c)===tr);
   const played=view.done.reduce((a,t)=>a+t.cards.filter(x=>deck.suitOf(x.card)===tr).length,0)+hand.filter(c=>deck.suitOf(c)===tr).length;
   if(mine&&trumps.length&&(trumps.some(c=>deck.rankOf(c)==='V')||(trumps.some(c=>deck.rankOf(c)==='9')&&played>=7)||(level>1&&trumps.length>=3)))
    pick=trumps.slice().sort((a,b)=>strength(b,tr,tr)-strength(a,tr,tr))[0];
   else{
    const aces=cards.filter(c=>deck.rankOf(c)==='A'&&deck.suitOf(c)!==tr);
    const plain=cards.filter(c=>deck.suitOf(c)!==tr);
    pick=aces.length?aces[0]:byLow(plain.length&&(level>1||!mine)?plain:cards)[0]}}
  else{
   const led=deck.suitOf(cs[0].card),w=trickWinner(cs,tr),partner=w%2===seat%2;
   if(partner)pick=byLow(cards).reverse()[0];
   else{
    const bestS=Math.max(...cs.map(x=>strength(x.card,tr,led)));
    const win=cards.filter(c=>strength(c,tr,led)>bestS);
    pick=win.length?win.sort((a,b)=>strength(a,tr,led)-strength(b,tr,led))[0]:byLow(cards)[0]}}
  return {t:'play',card:pick}}
 function notation(st,move,seat){
  const j='Joueur '+(seat+1);
  if(move.t==='pass')return j+' passe';
  if(move.t==='take')return j+' prend à '+deck.SUIT_NAMES[deck.suitOf(st.up)];
  if(move.t==='suit')return j+' prend à '+deck.SUIT_NAMES[move.suit];
  return j+' joue '+deck.name(move.card)}
 return {id:'belote',name:'Belote',minPlayers:4,maxPlayers:4,teams:[[0,2],[1,3]],init,turn,legalMoves,apply,result,view,chooseMove,notation,scoreDeal,trickWinner,TARGET}});
