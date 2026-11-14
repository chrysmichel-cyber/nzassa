/* Tests des jeux de cartes : bataille, menteur, belote (règles pures + robots). node --test tests/games-cartes.test.cjs */
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const core=require('../js/games/core.js'),deck=require('../js/games/rules/deck.js');
const bataille=require('../js/games/rules/bataille.js'),menteur=require('../js/games/rules/menteur.js'),belote=require('../js/games/rules/belote.js');
const {RuleError}=core,rngOf=s=>core.mulberry32(s);
const ALL=deck.full().slice().sort(),ALL32=deck.belote32().slice().sort();
const sorted=a=>a.slice().sort();
const throwsCode=(f,code)=>assert.throws(f,e=>e instanceof RuleError&&e.code===code,'attendu '+code);
const throwsRule=f=>assert.throws(f,e=>e instanceof RuleError,'RuleError attendu');
const J=JSON.stringify;
const GAMES=200;

test('deck : 52 cartes, 32 pour la belote, familles T E S X', ()=>{
 assert.equal(ALL.length,52);assert.equal(new Set(ALL).size,52);assert.equal(ALL32.length,32);
 assert.deepEqual(deck.SUITS,['T','E','S','X']);assert.ok(ALL.every(deck.isCard));assert.ok(!deck.isCard('7B'))});

/* ================= BATAILLE ================= */
test('bataille : donne 26/26, 52 cartes conservées', ()=>{
 const s=bataille.init({players:2,rng:rngOf(1)});
 assert.equal(s.hands[0].length,26);assert.equal(s.hands[1].length,26);
 assert.deepEqual(sorted(s.hands[0].concat(s.hands[1])),ALL);
 throwsCode(()=>bataille.init({players:3,rng:rngOf(1)}),'joueurs');
 assert.doesNotThrow(()=>core.register(bataille))});
test('bataille : un pli simple, la plus forte gagne, apply pure', ()=>{
 const s=bataille.init({players:2,rng:rngOf(1)});s.hands[0]=['AS','7E'];s.hands[1]=['RT','2X'];
 const snap=J(s);
 const a=bataille.apply(s,{t:'flip'},0);assert.equal(J(s),snap);assert.equal(bataille.turn(a),1);
 const b=bataille.apply(a,{t:'flip'},1);
 assert.equal(b.hands[0].length,3);assert.equal(b.hands[1].length,1);assert.equal(b.last.winner,0);assert.equal(bataille.turn(b),0)});
test('bataille : ordre des rangs 2<…<10<V<D<R<A, familles sans effet', ()=>{
 const win=(x,y)=>{const s=bataille.init({players:2,rng:rngOf(1)});s.hands[0]=[x,'3T','4T'];s.hands[1]=[y,'3E','4E'];
  return bataille.apply(bataille.apply(s,{t:'flip'},0),{t:'flip'},1).last.winner};
 assert.equal(win('3T','2X'),0);assert.equal(win('10T','9X'),0);assert.equal(win('VT','10X'),0);assert.equal(win('DE','VX'),0);
 assert.equal(win('RT','DX'),0);assert.equal(win('AT','RX'),0);assert.equal(win('2T','3X'),1);assert.equal(win('AX','2T'),0)});
test('bataille : bataille (égalité) puis résolution', ()=>{
 let s=bataille.init({players:2,rng:rngOf(1)});
 s.hands[0]=['AS','7E','8E','9E'];s.hands[1]=['AT','7T','RX','9X'];
 s=bataille.apply(bataille.apply(s,{t:'flip'},0),{t:'flip'},1);
 assert.equal(s.battles,1);assert.equal(s.table.length,4);assert.equal(s.table.filter(x=>!x.up).length,2);
 s=bataille.apply(bataille.apply(s,{t:'flip'},0),{t:'flip'},1); /* 8E contre RX */
 assert.equal(s.last.winner,1);assert.equal(s.last.battle,true);
 assert.equal(s.hands[1].length,1+6);assert.equal(s.hands[0].length,1)});
test('bataille : bataille sans assez de cartes = défaite ; deux à court = nulle', ()=>{
 let s=bataille.init({players:2,rng:rngOf(1)});s.hands[0]=['AS'];s.hands[1]=['AT','7T','8T'];
 s=bataille.apply(bataille.apply(s,{t:'flip'},0),{t:'flip'},1);
 assert.deepEqual(bataille.result(s).winners,[1]);assert.equal(bataille.result(s).reason,'bataille');
 s=bataille.init({players:2,rng:rngOf(1)});s.hands[0]=['AS'];s.hands[1]=['AT'];
 s=bataille.apply(bataille.apply(s,{t:'flip'},0),{t:'flip'},1);
 assert.equal(bataille.result(s).draw,true)});
test('bataille : coups illégaux et triche', ()=>{
 const s=bataille.init({players:2,rng:rngOf(2)});
 throwsCode(()=>bataille.apply(s,{t:'flip'},1),'hors_tour');
 for(const bad of [2,-1,null,undefined,'0',1.5,NaN])throwsCode(()=>bataille.apply(s,{t:'flip'},bad),'siege_invalide');
 for(const bad of [null,'flip',[],42,undefined,{},{t:5}])throwsCode(()=>bataille.apply(s,bad,0),'coup_mal_forme');
 throwsCode(()=>bataille.apply(s,{t:'flip',card:'AS'},0),'coup_illegal');
 throwsCode(()=>bataille.apply(s,{t:'jouer'},0),'coup_illegal');
 for(const txt of ['{"t":"flip","x":[1]}','{"__proto__":{"a":1},"t":"flip"}','{"t":["flip"]}','"flip"','7','[]','null'])throwsRule(()=>bataille.apply(s,JSON.parse(txt),0));
 assert.deepEqual(bataille.legalMoves(s,1),[]);assert.deepEqual(bataille.legalMoves(s,0),[{t:'flip'}])});
test('bataille : view ne montre aucun paquet', ()=>{
 let s=bataille.init({players:2,rng:rngOf(3)});s=bataille.apply(s,{t:'flip'},0);
 for(const seat of [0,1,null]){const v=bataille.view(s,seat),j=J(v);assert.equal(v.hands,undefined);
  for(const c of s.hands[0].concat(s.hands[1]))assert.ok(!j.includes('"'+c+'"'),'fuite '+c);
  assert.deepEqual(v.counts,[s.hands[0].length,s.hands[1].length])}
 const v=bataille.view(s,1);assert.deepEqual(bataille.legalMoves(v,1),[{t:'flip'}]);assert.equal(bataille.chooseMove(v,1,{level:2}).t,'flip')});
test('bataille : '+GAMES+' parties robot contre robot, 52 cartes conservées, finie refuse tout', ()=>{
 let plafond=0;
 for(let seed=1;seed<=GAMES;seed++){
  let s=bataille.init({players:2,rng:rngOf(seed)}),n=0;
  while(bataille.turn(s)>=0){
   const t=bataille.turn(s),v=bataille.view(s,t),m=bataille.chooseMove(v,t,{level:1+seed%3});
   assert.ok(core.pick(bataille.legalMoves(v,t),m),'robot illégal');
   s=bataille.apply(s,m,t);n++;
   assert.equal(s.hands[0].length+s.hands[1].length+s.table.length,52);
   if(n>10000)assert.fail('trop long')}
  const r=bataille.result(s);assert.ok(r);if(r.reason==='plafond')plafond++;
  assert.ok(r.reason!=='cartes'||r.scores[0]+r.scores[1]===52);
  throwsCode(()=>bataille.apply(s,{t:'flip'},0),'partie_finie');throwsCode(()=>bataille.apply(s,{t:'flip'},1),'partie_finie');
  assert.deepEqual(bataille.legalMoves(s,0),[]);assert.equal(bataille.turn(s),-1)}
 assert.ok(plafond<GAMES/2,'trop de parties plafonnées : '+plafond)});

/* ================= MENTEUR ================= */
const total=st=>st.hands.reduce((a,h)=>a+h.length,0)+st.pile.length;
/* le rang demandé au premier coup est '7' (index 5) pour garder des mains lisibles */
function mk(hands,next=5){const s=menteur.init({players:hands.length,rng:rngOf(1)});s.hands=hands.map(h=>h.slice());s.next=next;return s}
test('menteur : donne pour 2, 3 et 4 joueurs, 52 cartes', ()=>{
 for(const n of [2,3,4]){const s=menteur.init({players:n,rng:rngOf(n)});
  assert.equal(s.hands.length,n);assert.deepEqual(sorted([].concat(...s.hands)),ALL);
  assert.ok(Math.max(...s.hands.map(h=>h.length))-Math.min(...s.hands.map(h=>h.length))<=1)}
 for(const n of [1,5,0,'2',null])throwsCode(()=>menteur.init({players:n,rng:rngOf(1)}),'joueurs');
 assert.doesNotThrow(()=>core.register(menteur))});
test('menteur : pose sincère puis accusation à tort -> l\'accusateur ramasse tout', ()=>{
 let s=mk([['7S','7E','9T'],['AS','RT','DX'],['10S','VS','8X']]);
 s=menteur.apply(s,{t:'play',cards:['7E','7S']},0);
 assert.deepEqual(s.last.cards,['7E','7S'].sort(deck.cmp));assert.equal(s.cur,1);
 s=menteur.apply(s,{t:'call'},1);
 assert.equal(s.reveal.liar,false);assert.equal(s.reveal.taker,1);assert.equal(s.hands[1].length,5);assert.equal(s.pile.length,0);
 assert.equal(s.cur,1);assert.equal(s.next,6)});
test('menteur : mensonge pris -> le menteur ramasse', ()=>{
 let s=mk([['7S','9E','9T'],['AS','RT','DX'],['10S','VS','8X']]);
 s=menteur.apply(s,{t:'play',cards:['9E']},0);
 s=menteur.apply(s,{t:'call'},1);
 assert.equal(s.reveal.liar,true);assert.equal(s.reveal.taker,0);assert.equal(s.hands[0].length,3);assert.equal(s.cur,0)});
test('menteur : séquence 2..A, champ rank', ()=>{
 let s=mk([['7S','8E'],['8S','9E','AT'],['10S','VS','8X']]);
 throwsCode(()=>menteur.apply(s,{t:'play',cards:['7S'],rank:'8'},0),'mauvais_rang');
 s=menteur.apply(s,{t:'play',cards:['7S'],rank:'7'},0);assert.equal(menteur.view(s,1).want,'8');
 const w=menteur.init({players:2,rng:rngOf(1)});assert.equal(menteur.view(w,0).want,'2');
 const e=mk([['AS','2E'],['3S']],12);const e2=menteur.apply(e,{t:'play',cards:['AS']},0);assert.equal(menteur.view(e2,1).want,'2')});
test('menteur : vider sa main exige l\'accusation, honnête = victoire, menteur = ramasse', ()=>{
 let s=mk([['7S'],['AS','RT'],['10S','VS']]);
 let a=menteur.apply(s,{t:'play',cards:['7S']},0);
 assert.deepEqual(menteur.legalMoves(a,1),[{t:'call'}]);
 throwsCode(()=>menteur.apply(a,{t:'play',cards:['AS']},1),'accusation_obligatoire');
 a=menteur.apply(a,{t:'call'},1);assert.deepEqual(menteur.result(a).winners,[0]);
 throwsCode(()=>menteur.apply(a,{t:'call'},0),'partie_finie');
 s=mk([['9S'],['AS','RT'],['10S','VS']]);
 let b=menteur.apply(s,{t:'play',cards:['9S']},0);b=menteur.apply(b,{t:'call'},1);
 assert.equal(menteur.result(b),null);assert.equal(b.hands[0].length,1);assert.equal(b.cur,0)});
test('menteur : coups illégaux et triche', ()=>{
 const s=mk([['7S','8E'],['8S','9E','AT'],['10S','VS','8X']]);
 throwsCode(()=>menteur.apply(s,{t:'call'},0),'pas_de_coup');
 throwsCode(()=>menteur.apply(s,{t:'play',cards:['7S']},1),'hors_tour');
 for(const bad of [9,-1,null,'0',1.5])throwsCode(()=>menteur.apply(s,{t:'play',cards:['7S']},bad),'siege_invalide');
 throwsCode(()=>menteur.apply(s,{t:'play',cards:['8S']},0),'carte_absente');
 throwsCode(()=>menteur.apply(s,{t:'play',cards:['ZZ']},0),'carte_inexistante');
 throwsCode(()=>menteur.apply(s,{t:'play',cards:['7B']},0),'carte_inexistante');
 throwsCode(()=>menteur.apply(s,{t:'play',cards:[5]},0),'carte_inexistante');
 throwsCode(()=>menteur.apply(s,{t:'play',cards:['7S','7S']},0),'carte_en_double');
 throwsCode(()=>menteur.apply(s,{t:'play',cards:[]},0),'coup_illegal');
 throwsCode(()=>menteur.apply(s,{t:'play',cards:['2T','3T','4T','5T','6T']},0),'coup_illegal');
 throwsCode(()=>menteur.apply(s,{t:'play',cards:'7S'},0),'coup_mal_forme');
 throwsCode(()=>menteur.apply(s,{t:'play',cards:['7S'],evil:1},0),'coup_mal_forme');
 for(const bad of [null,[],'call',3,undefined,{},{t:1}])throwsCode(()=>menteur.apply(s,bad,0),'coup_mal_forme');
 throwsCode(()=>menteur.apply(s,{t:'triche'},0),'coup_illegal');
 for(const txt of ['{"t":"play","cards":[["7S"]]}','{"t":"play","cards":{"0":"7S"}}','{"t":"play"}','{"__proto__":{"x":1},"t":"call"}'])throwsRule(()=>menteur.apply(s,JSON.parse(txt),0));
 const p=menteur.apply(s,{t:'play',cards:['7S']},0);
 throwsCode(()=>menteur.apply(p,{t:'call',x:1},1),'coup_mal_forme');
 assert.equal(s.hands[0].length,2,'état d\'origine intact')});
test('menteur : legalMoves cohérent avec apply (petites mains)', ()=>{
 const s=mk([['7S','8E','AT'],['8S','9E'],['10S']]);
 const L=menteur.legalMoves(s,0);assert.equal(L.length,7);for(const m of L)menteur.apply(s,m,0);
 assert.deepEqual(menteur.legalMoves(s,1),[])});
test('menteur : view ne fuit rien (mains, pile, cartes posées)', ()=>{
 let s=menteur.init({players:3,rng:rngOf(5)});s=menteur.apply(s,{t:'play',cards:[s.hands[0][0]]},0);
 for(const seat of [0,1,2,null]){const v=menteur.view(s,seat),j=J(v);
  assert.equal(v.pile,undefined);assert.equal(v.last.cards,undefined);
  for(let i=0;i<3;i++)i===seat?assert.deepEqual(v.hands[i],s.hands[i]):assert.equal(v.hands[i],null);
  for(let i=0;i<3;i++)if(i!==seat)for(const c of s.hands[i])assert.ok(!j.includes('"'+c+'"'));
  for(const c of s.pile)assert.ok(!j.includes('"'+c+'"'),'pile fuit');
  assert.equal(v.pileN,1)}
 const v=menteur.view(s,1);assert.ok(menteur.legalMoves(v,1).length>0);assert.deepEqual(menteur.legalMoves(v,0),[])});
test('menteur : le robot ne lit que la vue', ()=>{
 const s=menteur.init({players:3,rng:rngOf(9)}),v=menteur.view(s,0),seen=[];
 const spy=new Proxy(v,{get(o,k){seen.push(String(k));return o[k]}});
 assert.ok(menteur.chooseMove(spy,0,{level:3,rng:rngOf(1)}));
 assert.ok(!seen.includes('pile')&&!seen.includes('pileCards'));
 /* deux états ne différant que par les mains cachées donnent la même décision */
 const t=core.clone(s);[t.hands[1],t.hands[2]]=[t.hands[2],t.hands[1]];
 assert.equal(J(menteur.view(s,0)),J(menteur.view(t,0)));
 assert.equal(J(menteur.chooseMove(menteur.view(s,0),0,{level:2,rng:rngOf(3)})),J(menteur.chooseMove(menteur.view(t,0),0,{level:2,rng:rngOf(3)})));
 assert.equal(menteur.chooseMove(menteur.view(s,1),1,{level:2}),null,'pas son tour')});
test('menteur : robots 3 niveaux, '+GAMES+' parties 2-4 joueurs, 52 cartes conservées, jamais illégal', ()=>{
 let plafond=0;
 for(let seed=1;seed<=GAMES;seed++){
  const n=2+seed%3,rng=rngOf(seed*7);let s=menteur.init({players:n,rng:rng}),k=0;
  while(menteur.turn(s)>=0){
   const t=menteur.turn(s),v=menteur.view(s,t),m=menteur.chooseMove(v,t,{level:1+(seed+t)%3,rng});
   assert.ok(m,'robot sans coup');
   if(s.hands[t].length<=6)assert.ok(core.pick(menteur.legalMoves(v,t),m),'illégal selon legalMoves');
   const before=J(s);s=menteur.apply(s,m,t);assert.notEqual(J(s),before);assert.equal(total(s),52);
   if(++k>3000)assert.fail('trop long')}
  const r=menteur.result(s);assert.ok(r);if(r.reason==='plafond')plafond++;
  else assert.equal(s.hands[r.winners[0]].length,0);
  throwsCode(()=>menteur.apply(s,{t:'call'},0),'partie_finie');assert.deepEqual(menteur.legalMoves(s,0),[])}
 /* partie à durée bornée (400 coups) : les robots n'ont pas d'incitation à finir vite ; le plafond désigne celui qui a le moins de cartes */
 assert.ok(plafond<=GAMES)});

/* ================= BELOTE ================= */
const bel=seed=>belote.init({players:4,rng:rngOf(seed)});
const SUITS=deck.SUITS;
/* état de jeu forgé : atout S par défaut, preneur seat 0, mains données */
function forge(hands,{lead=0,trump='S',taker=0}={}){
 const s=bel(1);s.phase='play';s.contract={seat:taker,suit:trump,round:1};s.hands=hands.map(h=>h.slice());s.talon=[];
 s.trick={lead,cards:[]};s.cur=lead;s.done=[];s.pts=[0,0];s.won=[0,0];s.score=[0,0];s.hist=[];s.bidder=-1;return s}
const cardsOf=(s,seat)=>belote.legalMoves(s,seat).map(m=>m.card).sort();
const play=(s,seat,card)=>belote.apply(s,{t:'play',card},seat);
const pad=(a,n=8)=>a.concat(['7X','8X','9X','10X','VX','DX','RX','AX']).slice(0,n);   /* remplissage sans importance */

test('belote : contrat (équipes, id, enregistrement)', ()=>{
 assert.deepEqual(belote.teams,[[0,2],[1,3]]);assert.equal(belote.minPlayers,4);assert.equal(belote.maxPlayers,4);
 assert.doesNotThrow(()=>core.register(belote));
 for(const n of [2,3,5,'4',null])throwsCode(()=>belote.init({players:n,rng:rngOf(1)}),'joueurs');
 assert.ok(belote.init({players:['a','b','c','d'],rng:rngOf(1)}))});
test('belote : distribution 3+2 puis le reste, 8 cartes chacun, 32 conservées', ()=>{
 for(let seed=1;seed<=20;seed++){
  const s=bel(seed);
  for(const h of s.hands)assert.equal(h.length,5);
  assert.equal(s.talon.length,11);assert.equal(s.phase,'bid1');
  assert.deepEqual(sorted([].concat(...s.hands,[s.up],s.talon)),ALL32);
  assert.ok(s.hands.every(h=>h.every(c=>deck.BELOTE_RANKS.includes(deck.rankOf(c)))));
  const t=belote.apply(s,{t:'take'},belote.turn(s));
  assert.equal(t.phase,'play');for(const h of t.hands)assert.equal(h.length,8);
  assert.deepEqual(sorted([].concat(...t.hands)),ALL32);assert.equal(t.talon.length,0);
  assert.ok(t.hands[t.contract.seat].includes(s.up));assert.equal(t.contract.suit,deck.suitOf(s.up));
  assert.equal(belote.turn(t),(s.dealer+1)%4)}});
test('belote : enchères — tour 1, tour 2, redonne', ()=>{
 let s=bel(5);const d=s.dealer,up=deck.suitOf(s.up);
 assert.equal(belote.turn(s),(d+1)%4);
 assert.deepEqual(belote.legalMoves(s,(d+1)%4),[{t:'take'},{t:'pass'}]);
 assert.deepEqual(belote.legalMoves(s,(d+2)%4),[]);
 throwsCode(()=>belote.apply(s,{t:'suit',suit:'S'},(d+1)%4),'coup_illegal');
 throwsCode(()=>belote.apply(s,{t:'play',card:s.hands[(d+1)%4][0]},(d+1)%4),'coup_illegal');
 for(let i=0;i<4;i++)s=belote.apply(s,{t:'pass'},belote.turn(s));
 assert.equal(s.phase,'bid2');assert.equal(belote.turn(s),(d+1)%4);
 const L=belote.legalMoves(s,belote.turn(s));
 assert.equal(L.length,4);assert.ok(!L.some(m=>m.t==='suit'&&m.suit===up));assert.ok(!L.some(m=>m.t==='take'));
 throwsCode(()=>belote.apply(s,{t:'suit',suit:up},belote.turn(s)),'coup_illegal');
 throwsCode(()=>belote.apply(s,{t:'take'},belote.turn(s)),'coup_illegal');
 const before=J(s.hands);
 for(let i=0;i<4;i++)s=belote.apply(s,{t:'pass'},belote.turn(s));
 assert.equal(s.phase,'bid1');assert.equal(s.dealer,(d+1)%4);assert.equal(s.deals,1);assert.notEqual(J(s.hands),before);
 for(const h of s.hands)assert.equal(h.length,5);
 assert.deepEqual(sorted([].concat(...s.hands,[s.up],s.talon)),ALL32);
 /* prise au tour 2 : le 3e joueur à parler prend une autre famille */
 let u=bel(5);for(let i=0;i<4;i++)u=belote.apply(u,{t:'pass'},belote.turn(u));
 u=belote.apply(u,{t:'pass'},belote.turn(u));const who=belote.turn(u),other=SUITS.find(x=>x!==up);
 u=belote.apply(u,{t:'suit',suit:other},who);
 assert.equal(u.contract.suit,other);assert.equal(u.contract.seat,who);assert.equal(u.contract.round,2);
 for(const h of u.hands)assert.equal(h.length,8);assert.deepEqual(sorted([].concat(...u.hands)),ALL32);
 /* prise au tour 1 par le 2e joueur */
 let w=bel(6);w=belote.apply(w,{t:'pass'},belote.turn(w));const w2=belote.turn(w);w=belote.apply(w,{t:'take'},w2);
 assert.equal(w.contract.seat,w2);assert.equal(w.contract.round,1)});
test('belote : fournir à la couleur', ()=>{
 const s=forge([['7E','VT','AS','8X','9X','10X','DX','RX'],['AE','8E','7T','7X','8S','9S','10S','DS'],['9E','10E','DT','RT','AT','7S','RS','VS'],['VE','RE','DE','8T','9T','10T','VX','AX']]);
 let t=play(s,0,'7E');
 assert.deepEqual(cardsOf(t,1),['8E','AE']);
 t=play(t,1,'8E');assert.deepEqual(cardsOf(t,2),['10E','9E']);
 throwsCode(()=>play(t,2,'7S'),'coup_illegal');
 throwsCode(()=>play(t,2,'AT'),'coup_illegal')});
test('belote : couper obligatoire face à un adversaire maître', ()=>{
 let s=forge([['7E','9T','AX','8X','9X','10X','DX','RX'],['7T','8T','DS','8S','10T','VX','7X','AT'],pad([]),pad([])]);
 s=play(s,0,'7E');assert.deepEqual(cardsOf(s,1),['8S','DS'],'doit couper')});
test('belote : sur-couper, sinon sous-couper', ()=>{
 const mkS=h2=>{let s=forge([['7E','9T','AX','8X','9X','10X','DX','RX'],['7T','8T','DS','8S','10T','VX','7X','AT'],h2,['VE','RE','DE','8T','9T','10T','VX','AX']]);
  s=play(s,0,'7E');return play(s,1,'DS')};
 /* siège 1 coupe de DS ; siège 2 sans E : VS monte (V est le plus fort atout) ; 7S et 8S sont plus faibles que DS ? D>8>7 en atout */
 assert.deepEqual(cardsOf(mkS(['VS','7S','AT','8T','9T','10T','RT','DT']),2),['VS'],'doit sur-couper');
 assert.deepEqual(cardsOf(mkS(['7S','8S','AT','8T','9T','10T','RT','DT']),2),['7S','8S'],'sous-coupe permise faute de mieux');
 assert.deepEqual(cardsOf(mkS(['AT','8T','9T','10T','RT','DT','7T','RX']),2),['10T','7T','8T','9T','AT','DT','RT','RX'].sort(),'sans atout : défausse libre');
 /* le 9 d'atout bat l'As, le Roi ne bat pas le Dix */
 let s=forge([['7E','9T','AX','8X','9X','10X','DX','RX'],['7T','8T','AS','8S','10T','VX','7X','AT'],['9S','RS','10S','7T','8T','9T','10T','VT'],['VE','RE','DE','8T','9T','10T','VX','AX']]);
 s=play(play(s,0,'7E'),1,'AS');assert.deepEqual(cardsOf(s,2),['9S'],'9 d\'atout bat l\'As')});
test('belote : pas de coupe obligatoire si le partenaire est maître', ()=>{
 let s=forge([['AE','9T','AX','8X','9X','10X','DX','RX'],['7E','8T','DS','8S','10T','VX','7X','AT'],['7S','VS','8T','9T','10T','RT','DT','7T'],pad([])]);
 s=play(s,0,'AE');s=play(s,1,'7E');
 assert.equal(cardsOf(s,2).length,8,'partenaire maître avec AE : tout est jouable (2 est sans E)');
 /* si l'adversaire a coupé, le partenaire n'est plus maître : couper (et sur-couper) redevient obligatoire */
 let t=forge([['AE','9T','AX','8X','9X','10X','DX','RX'],['VT','8T','DS','8S','10T','VX','7X','AT'],['7S','VS','8T','9T','10T','RT','DT','7T'],pad([])]);
 t=play(t,0,'AE');t=play(t,1,'DS');
 assert.deepEqual(cardsOf(t,2),['VS'],'adversaire maître en coupant : sur-couper');
 /* partenaire maître par un atout : pas d'obligation de surcouper non plus */
 let u=forge([['7E','9T','AX','8X','9X','10X','DX','RX'],['AE','8T','DS','8S','10T','VX','7X','AT'],['9E','VT','8T','9T','10T','RT','DT','7T'],['VS','RE','DE','8T','9T','10T','VX','AX']]);
 u=play(play(u,0,'7E'),1,'AE');u=play(u,2,'9E');
 assert.equal(cardsOf(u,3).length,2,'siège 3 a de l\'E : doit fournir (VE absent donc RE,DE)'.length&&cardsOf(u,3).length);
 let v=forge([['7E','9T','AX','8X','9X','10X','DX','RX'],['7T','8T','AS','8S','10T','VX','7X','AT'],['9E','VT','8T','9T','10T','RT','DT','7T'],['VS','7S','DX','8T','9T','10T','VX','AX']]);
 v=play(v,0,'7E');v=play(v,1,'AS');v=play(v,2,'9E');
 assert.equal(cardsOf(v,3).length,8,'siège 3 sans E : son partenaire (siège 1) est maître avec AS coupé : rien n\'est obligatoire');
});
test('belote : atout demandé, monter à l\'atout si possible', ()=>{
 let s=forge([['RS','9T','AX','8X','9X','10X','DX','RX'],['10S','7S','VX','8T','9T','10T','7X','AT'],['7S','8S','9T','7T','8T','10T','DT','RT'],['VX','DX','8X','9X','10X','7X','AX','RX']]);
 s=play(s,0,'RS');assert.deepEqual(cardsOf(s,1),['10S'],'monter : 10 bat le Roi');
 let t=forge([['RS','9T','AX','8X','9X','10X','DX','RX'],['DS','7S','VX','8T','9T','10T','7X','AT'],['7S','8S','9T','7T','8T','10T','DT','RT'],pad([])]);
 t=play(t,0,'RS');assert.deepEqual(cardsOf(t,1),['7S','DS'],'rien ne monte : tout atout');
 let u=forge([['RS','9T','AX','8X','9X','10X','DX','RX'],['AT','8T','VX','7T','9T','10T','7X','DX'],pad([]),pad([])]);
 u=play(u,0,'RS');assert.equal(cardsOf(u,1).length,8,'sans atout : défausse libre')});
test('belote : valeurs et force (trickWinner)', ()=>{
 const w=(cs,tr='S')=>belote.trickWinner(cs.map((c,i)=>({seat:i,card:c})),tr);
 assert.equal(w(['AE','RE','10E','7E']),0);assert.equal(w(['7E','10E','AE','VE']),2);
 assert.equal(w(['AE','7S','AX','8E']),1,'un atout coupe');assert.equal(w(['VS','9S','AS','10S']),0,'V > 9 > A à l\'atout');
 assert.equal(w(['9S','AS','RS','DS']),0);assert.equal(w(['10E','8S','7S','AE']),1);assert.equal(w(['AX','AT','AE','9E'],'S'),0,'défausse sans atout ne gagne pas');
 /* points d'un pli : atout V20 9=14 A11 10=10 R4 D3 ; hors atout A11 10=10 R4 D3 V2 */
 let s=forge([['VS','7X','8X','9X','10X','DX','RX','AX'],['9S','7T','8T','9T','10T','DT','RT','AT'],['AS','7E','8E','9E','10E','DE','RE','AE'],['10S','RS','DS','7S','8S','VT','VE','VX']],{trump:'S'});
 s=play(play(play(play(s,0,'VS'),1,'9S'),2,'AS'),3,'10S');
 assert.equal(s.pts[0]+s.pts[1],20+14+11+10);assert.equal(s.won[0],1);assert.equal(s.pts[0],55);
 let u=forge([['AT','7X','8X','9X','10X','DX','RX','AX'],['10T','7T','8T','9T','VT','DT','RT','7E'],['RE','7S','8E','9E','10E','DE','AE','8S'],['DS','8T','9S','VE','VX','AS','10S','RS']],{trump:'S'});
 u=play(play(u,0,'AT'),1,'10T');u=play(u,2,'RE');
 assert.equal(u.trick.cards.length,3);u=play(u,3,'8T');
 assert.equal(u.pts[0],11+10+4+0,'As 11 + Dix 10 + Roi 4 hors atout, sans atout : 0');
 assert.equal(u.pts[0]+u.pts[1],25)});

/* partie forgée : l'équipe 0 remporte les 8 plis. withBelote : le siège 0 détient D+R d'atout. */
function capotState(withBelote,score){
 const trumpsNoD=['VS','9S','AS','10S','RS','8S','7S'];
 const nonS=ALL32.filter(c=>!c.endsWith('S')),pool=nonS.filter(c=>c!=='AT');
 const hands=withBelote?[['VS','9S','AS','10S','RS','DS','8S','7S'],pool.slice(0,8),pool.slice(8,16),pool.slice(16,24).concat(['AT'])]
  :[trumpsNoD.concat(['AT']),pool.slice(0,8),['DS'].concat(pool.slice(8,15)),pool.slice(15,23)];
 const s=forge(hands);if(score)s.score=score.slice();return s}
function runCapot(s){
 const order=s.hands[0].filter(c=>c.endsWith('S')).sort((a,b)=>b==='VS'?1:a==='VS'?-1:0);
 /* meneur : le siège 0 joue d'abord ses atouts forts, puis sa carte restante ; les autres jouent leur première carte légale */
 const want=['VS','9S','AS','10S','RS','DS','8S','7S','AT'];
 for(let i=0;i<8;i++){
  const c=want.find(x=>belote.legalMoves(s,0).some(m=>m.card===x));
  s=play(s,0,c);for(const seat of [1,2,3])s=play(s,seat,belote.legalMoves(s,seat)[0].card)}
 return s}
test('belote : capot 252 + belote-rebelote 20 (même joueur), dix de der comprise', ()=>{
 const s=runCapot(capotState(true));
 const h=s.hist[0];assert.deepEqual(h.won,[8,0]);assert.deepEqual(h.cardPts,[162,0]);assert.equal(h.belote,0);assert.equal(h.capot,0);assert.equal(h.dedans,false);
 assert.deepEqual(h.gain,[272,0]);assert.deepEqual(s.score,[272,0]);assert.equal(s.deals,1);assert.equal(s.phase,'bid1')});
test('belote : pas de belote si Dame et Roi sont chez deux joueurs différents', ()=>{
 const s=runCapot(capotState(false));const h=s.hist[0];
 assert.equal(h.belote,-1);assert.equal(h.capot,0);assert.deepEqual(h.gain,[252,0]);assert.deepEqual(h.won,[8,0])});
test('belote : capot adverse = dedans du preneur (252 aux adversaires)', ()=>{
 const nonS=ALL32.filter(c=>!c.endsWith('S'));
 let s=forge([nonS.slice(0,8),['VS','9S','AS','10S','RS','DS','8S','7S'],nonS.slice(8,16),nonS.slice(16,24)],{lead:1});
 const want=['VS','9S','AS','10S','RS','DS','8S','7S'];
 for(let i=0;i<8;i++){s=play(s,1,want[i]);for(const seat of [2,3,0])s=play(s,seat,belote.legalMoves(s,seat)[0].card)}
 const h=s.hist[0];assert.equal(h.capot,1);assert.equal(h.dedans,true);assert.deepEqual(h.gain,[0,272],'252 + belote du siège 1');assert.equal(h.belote,1)});
test('belote : fin de partie à 501 (et égalité = on rejoue)', ()=>{
 let s=runCapot(capotState(true,[300,100]));
 assert.equal(belote.turn(s),-1);const r=belote.result(s);
 assert.deepEqual(r.winners,[0,2]);assert.equal(r.draw,false);assert.deepEqual(r.teams,[572,100]);assert.equal(r.scores[0],572);
 throwsCode(()=>belote.apply(s,{t:'pass'},0),'partie_finie');assert.deepEqual(belote.legalMoves(s,0),[]);
 s=runCapot(capotState(true,[229,501]));
 assert.equal(belote.result(s),null,'501-501 : on rejoue');assert.deepEqual(s.score,[501,501]);assert.notEqual(belote.turn(s),-1);
 s=runCapot(capotState(true,[100,480]));assert.equal(belote.result(s),null,'480 < 501');assert.deepEqual(s.score,[372,480])});
test('belote : scoreDeal — 162 + dix de der, contrat tenu / dedans / capot / belote', ()=>{
 const sd=belote.scoreDeal;
 assert.deepEqual(sd({takerTeam:0,cardPts:[100,62],won:[5,3],belote:-1}).gain,[100,62]);
 assert.deepEqual(sd({takerTeam:0,cardPts:[82,80],won:[4,4],belote:-1}).gain,[82,80],'82 : contrat tenu');
 const d=sd({takerTeam:0,cardPts:[81,81],won:[4,4],belote:-1});assert.equal(d.dedans,true);assert.deepEqual(d.gain,[0,162],'81 : dedans');
 assert.deepEqual(sd({takerTeam:1,cardPts:[100,62],won:[5,3],belote:-1}).gain,[162,0],'preneur équipe 1 dedans');
 assert.deepEqual(sd({takerTeam:0,cardPts:[70,92],won:[3,5],belote:0}).gain,[20,162],'dedans : la belote reste à son équipe');
 assert.deepEqual(sd({takerTeam:0,cardPts:[70,92],won:[3,5],belote:1}).gain,[0,182]);
 assert.deepEqual(sd({takerTeam:0,cardPts:[162,0],won:[8,0],belote:-1}).gain,[252,0]);
 assert.deepEqual(sd({takerTeam:0,cardPts:[162,0],won:[8,0],belote:0}).gain,[272,0]);
 const c=sd({takerTeam:0,cardPts:[0,162],won:[0,8],belote:-1});assert.deepEqual(c.gain,[0,252]);assert.equal(c.dedans,true);assert.equal(c.capot,1);
 assert.deepEqual(sd({takerTeam:1,cardPts:[0,162],won:[0,8],belote:1}).gain,[0,272]);
 assert.deepEqual(sd({takerTeam:0,cardPts:[90,72],won:[6,2],belote:0}).gain,[110,72])});
test('belote : dedans réel — total des points de cartes toujours 162', ()=>{
 /* le preneur (équipe 0) n'a presque aucun point : l'équipe 1 mène avec 7 plis forts, l'équipe 0 gagne seulement le dernier pli sans valeur */
 const s0=forge([['7T','7E','7X','8T','8E','8X','7S','8S'],['AT','AE','AX','10T','10E','10X','RT','RE'],['9T','9E','9X','VT','VE','VX','DT','DE'],['RX','DX','10S','AS','9S','VS','RS','DS']],{lead:1});
 let s=s0;
 for(let n=0;n<32;n++){const t=belote.turn(s);s=play(s,t,belote.legalMoves(s,t)[0].card)}
 const h=s.hist[0];assert.equal(h.cardPts[0]+h.cardPts[1],162,'les points de cartes (dix de der comprise) totalisent toujours 162');
 if(h.dedans)assert.ok(h.gain[1-h.taker%2]>=162,'dedans : les adversaires marquent au moins 162');
 else assert.ok(true)});

test('belote : triche (mauvais siège, hors tour, carte hors main, partie finie, coups mal formés)', ()=>{
 const s=bel(3),t0=belote.turn(s),other=(t0+1)%4;
 for(const bad of [4,-1,null,undefined,'0',1.5,NaN,Infinity])throwsCode(()=>belote.apply(s,{t:'pass'},bad),'siege_invalide');
 throwsCode(()=>belote.apply(s,{t:'pass'},other),'hors_tour');
 for(const bad of [null,undefined,'take',[],7,{},{t:3},true])throwsCode(()=>belote.apply(s,bad,t0),'coup_mal_forme');
 throwsCode(()=>belote.apply(s,{t:'triche'},t0),'coup_illegal');
 throwsCode(()=>belote.apply(s,{t:'take',x:1},t0),'coup_illegal');
 throwsCode(()=>belote.apply(s,{t:'suit',suit:'T'},t0),'coup_illegal');
 let p=belote.apply(s,{t:'take'},t0);const me=belote.turn(p);
 throwsCode(()=>belote.apply(p,{t:'play',card:'7T'},(me+1)%4),'hors_tour');
 const foreign=p.hands[(me+1)%4][0];
 throwsCode(()=>belote.apply(p,{t:'play',card:foreign},me),'carte_absente');
 throwsCode(()=>belote.apply(p,{t:'play',card:'2T'},me),'carte_absente');
 throwsCode(()=>belote.apply(p,{t:'play',card:'7B'},me),'carte_inexistante');
 throwsCode(()=>belote.apply(p,{t:'play',card:5},me),'carte_inexistante');
 throwsCode(()=>belote.apply(p,{t:'play'},me),'carte_inexistante');
 throwsCode(()=>belote.apply(p,{t:'play',card:[p.hands[me][0]]},me),'carte_inexistante');
 throwsCode(()=>belote.apply(p,{t:'pass'},me),'coup_illegal');
 throwsCode(()=>belote.apply(p,{t:'take'},me),'coup_illegal');
 throwsCode(()=>belote.apply(p,{t:'play',card:p.hands[me][0],extra:true},me),'coup_illegal');
 for(const txt of ['"take"','7','null','[]','{"t":null}','{"t":"play","card":{"a":1}}','{"__proto__":{"t":"pass"},"t":"pass"}','{"t":"suit"}','{"t":"play","card":"7T","card":"x"}'])throwsRule(()=>belote.apply(s,JSON.parse(txt),t0));
 /* partie finie */
 let g=bel(11),n=0;while(belote.turn(g)>=0&&n++<20000){const t=belote.turn(g);g=belote.apply(g,belote.chooseMove(belote.view(g,t),t,{level:2,rng:rngOf(n)}),t)}
 assert.ok(belote.result(g),'partie finie');
 for(let seat=0;seat<4;seat++){throwsCode(()=>belote.apply(g,{t:'pass'},seat),'partie_finie');assert.deepEqual(belote.legalMoves(g,seat),[])}
 assert.equal(belote.turn(g),-1)});
test('belote : apply est pure (état source jamais modifié)', ()=>{
 let s=bel(8),n=0;
 while(belote.turn(s)>=0&&n++<400){
  const t=belote.turn(s),snap=J(s),m=belote.chooseMove(belote.view(s,t),t,{level:2,rng:rngOf(n)});
  const frozen=core.clone(s);
  const a=belote.apply(s,m,t);assert.equal(J(s),snap,'état modifié');assert.deepEqual(frozen,s);
  const b=belote.apply(s,m,t);assert.equal(J(a),J(b),'apply non déterministe');
  belote.view(s,t);belote.legalMoves(s,t);assert.equal(J(s),snap);s=a;if(n>150)break}
 /* même après une redonne : la graine vit dans l'état */
 let r=bel(9);for(let i=0;i<8;i++)r=belote.apply(r,{t:'pass'},belote.turn(r));
 let r2=bel(9);for(let i=0;i<8;i++)r2=belote.apply(r2,{t:'pass'},belote.turn(r2));assert.equal(J(r),J(r2))});
test('belote : view — aucune fuite de main, talon ni graine ; observateur sans main', ()=>{
 for(let seed=1;seed<=30;seed++){
  let s=bel(seed),k=0;
  const check=()=>{
   const pub=new Set([s.up].concat(s.trick.cards.map(x=>x.card),...s.done.map(d=>d.cards.map(x=>x.card))));
   for(const seat of [0,1,2,3,null]){
    const v=belote.view(s,seat),j=J(v);
    assert.equal(v.talon,undefined);assert.equal(v.seed,undefined);assert.ok(!('seed' in v));
    for(let i=0;i<4;i++)i===seat?assert.deepEqual(v.hands[i],s.hands[i]):assert.equal(v.hands[i],null);
    const hidden=s.hands.flatMap((h,i)=>i===seat?[]:h).concat(s.talon||[]);
    for(const c of hidden)if(!pub.has(c))assert.ok(!j.includes('"'+c+'"'),'fuite de '+c+' pour le siège '+seat);
    assert.equal(v.talonN,s.talon.length);assert.deepEqual(v.counts,s.hands.map(h=>h.length))}};
  while(belote.turn(s)>=0&&k++<120){check();const t=belote.turn(s);s=belote.apply(s,belote.chooseMove(belote.view(s,t),t,{level:1+k%3,rng:rngOf(k+seed)}),t)}}
 const s=belote.apply(bel(2),{t:'take'},belote.turn(bel(2)));
 for(const seat of [null,undefined,7,-1,'x'])assert.ok(belote.view(s,seat).hands.every(h=>h===null),'observateur sans main');
 assert.deepEqual(belote.legalMoves(belote.view(s,null),0),[],'un observateur n\'a aucun coup légal')});
test('belote : le robot ne dépend que de la vue', ()=>{
 for(let seed=1;seed<=20;seed++){
  const s=bel(seed),t=belote.turn(s);
  const alt=core.clone(s);const o=[0,1,2,3].filter(i=>i!==t);
  [alt.hands[o[0]],alt.hands[o[1]]]=[alt.hands[o[1]],alt.hands[o[0]]];alt.talon.reverse();alt.seed=12345;
  assert.equal(J(belote.view(s,t)),J(belote.view(alt,t)));
  for(const level of [1,2,3])assert.equal(J(belote.chooseMove(belote.view(s,t),t,{level,rng:rngOf(seed)})),J(belote.chooseMove(belote.view(alt,t),t,{level,rng:rngOf(seed)})))}
 const v=belote.view(bel(1),0);const spy=new Proxy(v,{get(o,k){if(k==='talon'||k==='seed')throw new Error('lecture interdite '+String(k));return o[k]}});
 belote.chooseMove(spy,belote.turn(bel(1)),{level:3,rng:rngOf(1)});
 assert.equal(belote.chooseMove(belote.view(bel(1),(belote.turn(bel(1))+1)%4),(belote.turn(bel(1))+1)%4,{level:2}),null,'pas son tour : null')});
test('belote : '+GAMES+' parties robot contre robot, robot toujours légal, 32 cartes, scores cohérents', ()=>{
 let dedans=0,capots=0,deals=0,belotes=0,redeals=0;
 for(let seed=1;seed<=GAMES;seed++){
  let s=belote.init({players:4,rng:rngOf(seed*13)}),k=0;const r=rngOf(seed);
  while(belote.turn(s)>=0){
   const t=belote.turn(s),v=belote.view(s,t),m=belote.chooseMove(v,t,{level:1+(seed+t)%3,rng:r});
   assert.ok(m,'robot sans coup');
   assert.ok(core.pick(belote.legalMoves(v,t),m),'robot illégal (vue) '+J(m));
   assert.ok(core.pick(belote.legalMoves(s,t),m),'robot illégal (état) '+J(m));
   s=belote.apply(s,m,t);
   if(s.phase==='play'||s.phase==='bid1'||s.phase==='bid2'){
    const all=[].concat(...s.hands,s.talon,s.phase==='play'?[]:[s.up],s.trick.cards.map(x=>x.card),...s.done.map(d=>d.cards.map(x=>x.card)));
    assert.equal(all.length,32);assert.equal(new Set(all).size,32)}
   if(++k>60000)assert.fail('trop long')}
  const res=belote.result(s);assert.ok(res);assert.equal(res.draw,false);assert.equal(res.winners.length,2);
  const [a,b]=s.score;assert.ok(Math.max(a,b)>=501);assert.notEqual(a,b);assert.equal(res.winners[0],a>b?0:1);
  let acc=[0,0];
  for(const h of s.hist){
   assert.equal(h.cardPts[0]+h.cardPts[1],162);assert.equal(h.won[0]+h.won[1],8);deals++;
   const re=belote.scoreDeal({takerTeam:h.taker%2,cardPts:h.cardPts,won:h.won,belote:h.belote});
   assert.deepEqual(re.gain,h.gain);acc=[acc[0]+h.gain[0],acc[1]+h.gain[1]];assert.deepEqual(acc,h.score);
   if(h.dedans)dedans++;if(h.capot>=0)capots++;if(h.belote>=0)belotes++;
   const g=h.gain[0]+h.gain[1];assert.ok(g===162||g===182||g===252||g===272||g===h.gain[0]+h.gain[1]);
   assert.ok(g>=162,'une donne rapporte au moins 162 au total')}
  assert.deepEqual(acc,s.score);
  throwsCode(()=>belote.apply(s,{t:'pass'},0),'partie_finie')}
 assert.ok(deals>=GAMES,'au moins une donne par partie');assert.ok(dedans>0,'au moins un dedans observé');assert.ok(belotes>0,'au moins une belote observée');
 assert.equal(typeof capots,'number')});
test('belote : robots légaux aussi aux niveaux imposés, sans rng fourni', ()=>{
 for(const level of [1,2,3,undefined,0,9]){
  let s=bel(77),n=0;
  while(belote.turn(s)>=0&&n++<3000){const t=belote.turn(s),v=belote.view(s,t),m=belote.chooseMove(v,t,{level});assert.ok(core.pick(belote.legalMoves(v,t),m));s=belote.apply(s,m,t)}
  assert.ok(belote.result(s))}});
test('belote : notation lisible', ()=>{
 const s=bel(1),t=belote.turn(s);
 assert.match(belote.notation(s,{t:'pass'},t),/passe/);assert.match(belote.notation(s,{t:'take'},t),/prend/);
 assert.match(belote.notation(s,{t:'suit',suit:'E'},t),/Eau/)});
