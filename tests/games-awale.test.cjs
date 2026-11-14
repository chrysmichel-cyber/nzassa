'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const core=require('../js/games/core.js'),def=require('../js/games/rules/awale.js');
const {RuleError}=core;
const rng=()=>core.mulberry32(12345);
const mk=(pits,o)=>Object.assign({id:'awale',pits,store:[0,0],cur:0,noCap:0,plies:0,last:null,res:null},o||{});
const sum=s=>s.pits.reduce((a,b)=>a+b,0)+s.store[0]+s.store[1];
const code=(f)=>{try{f();return null}catch(e){assert.ok(e instanceof RuleError,'RuleError attendu : '+e);return e.code}};
function deepFreeze(o){if(o&&typeof o==='object'&&!Object.isFrozen(o)){Object.freeze(o);Object.values(o).forEach(deepFreeze)}return o}
const randomGame=(r,maxPlies=2000)=>{let s=def.init({players:2,rng:r}),n=0;
 while(def.turn(s)>=0&&n++<maxPlies){const t=def.turn(s),ms=def.legalMoves(s,t);assert.ok(ms.length>0);s=def.apply(s,ms[Math.floor(r()*ms.length)],t);assert.equal(sum(s),48)}return s};

test('enregistrement : contrat complet',()=>{
 for(const k of ['id','name','minPlayers','maxPlayers','init','turn','legalMoves','apply','result','view','chooseMove','notation'])assert.ok(def[k]!==undefined,k);
 assert.equal(def.id,'awale');assert.doesNotThrow(()=>core.register(def));assert.equal(core.get('awale'),def);
 assert.equal(code(()=>def.init({players:3,rng:rng()})),'joueurs')});

test('départ : 4 graines partout, 6 coups, siège 0 commence',()=>{
 const s=def.init({players:['a','b'],rng:rng()});
 assert.deepEqual(s.pits,new Array(12).fill(4));assert.equal(def.turn(s),0);assert.equal(def.result(s),null);
 assert.deepEqual(def.legalMoves(s,0),[0,1,2,3,4,5].map(pit=>({pit})));assert.deepEqual(def.legalMoves(s,1),[])});

test('semis simple anti-horaire (coup relatif au siège)',()=>{
 let s=def.apply(def.init({players:2,rng:rng()}),{pit:2},0);
 assert.deepEqual(s.pits,[4,4,0,5,5,5,5,4,4,4,4,4]);assert.equal(def.turn(s),1);
 s=def.apply(s,{pit:0},1);   /* siège 1, pit 0 = trou absolu 6 (5 graines : 7..11) */
 assert.deepEqual(s.pits,[4,4,0,5,5,5,0,5,5,5,5,5])});

test('trou de départ sauté pour 12 graines ou plus',()=>{
 const s=def.apply(mk([12,0,0,0,0,0, 0,0,0,0,0,1]),{pit:0},0);
 /* 12 graines : cases 1..11, saut du départ, la 12e graine tombe en case 1 */
 assert.deepEqual(s.pits,[0,2,1,1,1,1,1,1,1,1,1,2]);assert.equal(s.store[0],0);assert.equal(sum(s),13)});

test('capture de 2 ou 3 et chaîne rétrograde',()=>{
 /* simple : dernière graine en 6 (1 -> 2) */
 let s=def.apply(mk([0,0,0,3,0,0, 1,3,0,2,1,2]),{pit:3},0);
 assert.equal(s.store[0],2);assert.equal(s.pits[6],0);assert.equal(s.pits[5],1);
 /* chaîne : 6..9 deviennent 2,3,2,2 ; dernière en 9 : on prend 9,8,7,6 ; 11 reste (pas de rafle totale) */
 const r2=def.apply(mk([0,0,0,0,0,4, 1,2,1,1,0,5]),{pit:5},0);
 assert.equal(r2.store[0],9);assert.deepEqual(r2.pits.slice(6),[0,0,0,0,0,5]);
 /* chaîne interrompue par un trou à 5 graines : seul le dernier est pris */
 const r3=def.apply(mk([0,0,0,0,0,4, 1,2,4,1,0,5]),{pit:5},0);
 assert.equal(r3.store[0],2);assert.deepEqual(r3.pits.slice(6),[2,3,5,0,0,5])});

test('pas de capture chez soi ni sur 1 ou 4+ graines',()=>{
 assert.equal(def.apply(mk([1,1,0,0,0,0, 4,4,0,0,0,1]),{pit:0},0).store[0],0);
 assert.equal(def.apply(mk([0,0,0,0,0,1, 3,4,0,0,0,1]),{pit:5},0).store[0],0);   /* 3+1=4 */
 assert.equal(def.apply(mk([0,0,0,0,0,1, 0,4,0,0,0,1]),{pit:5},0).store[0],0)});  /* 0+1=1 */

test('rafle totale : joué sans capture',()=>{
 /* Tous les trous adverses finiraient à 2 ou 3 : aucune prise */
 const s=mk([0,0,0,0,0,6, 1,2,1,2,1,1]);   /* 6 graines -> 6..11 : 2,3,2,3,2,2 tout capturable */
 const r=def.apply(s,{pit:5},0);
 assert.equal(r.store[0],0);assert.deepEqual(r.pits.slice(6),[2,3,2,3,2,2]);assert.equal(sum(r),sum(s))});

test('rafle partielle autorisée (un trou adverse resté hors de la chaîne)',()=>{
 const r=def.apply(mk([0,0,0,0,0,4, 1,2,1,1,5,0]),{pit:5},0);
 assert.equal(r.store[0],9);assert.deepEqual(r.pits.slice(6),[0,0,0,0,5,0])});

test('obligation de nourrir : seuls les coups qui donnent des graines',()=>{
 const s=mk([1,0,0,0,2,3, 0,0,0,0,0,0]);
 assert.deepEqual(def.legalMoves(s,0),[{pit:4},{pit:5}]);
 assert.equal(code(()=>def.apply(s,{pit:0},0)),'coup_illegal')});

test('impossible de nourrir : fin, chacun garde les graines de son côté',()=>{
 /* siège 1 donne sa dernière graine au siège 0 ; siège 0 (2 graines en pit 0) ne peut pas nourrir -> fin */
 const s=mk([1,0,0,0,0,0, 0,0,0,0,0,1],{cur:1,store:[23,23]});
 const r=def.apply(s,{pit:5},1);
 assert.ok(r.res);assert.equal(r.res.reason,'plus_de_coups');assert.equal(r.store[0]+r.store[1],48);
 assert.deepEqual(r.res.scores,{0:25,1:23});assert.deepEqual(r.res.winners,[0]);assert.equal(def.turn(r),-1);
 /* si l'adversaire peut recevoir des graines, la partie continue */
 const u=mk([0,0,0,0,0,1, 0,0,0,0,0,1],{cur:1,store:[23,23]});
 const r2=def.apply(u,{pit:5},1);
 assert.equal(r2.res,null);assert.deepEqual(def.legalMoves(r2,0),[{pit:5}])});

test('fin « plus de coups » : égalité possible',()=>{
 const s=mk([1,0,0,0,0,0, 0,0,0,0,0,1],{cur:1,store:[22,24]});
 const r=def.apply(s,{pit:5},1);
 assert.equal(r.res.draw,true);assert.deepEqual(r.res.scores,{0:24,1:24})});

test('victoire à 25 graines (>24) immédiate',()=>{
 const r=def.apply(mk([0,0,0,0,0,4, 1,2,1,1,5,0],{store:[16,0]}),{pit:5},0);   /* +9 = 25 */
 assert.ok(r.res);assert.equal(r.res.reason,'captures');assert.deepEqual(r.res.winners,[0]);assert.equal(def.turn(r),-1);
 assert.equal(code(()=>def.apply(r,{pit:0},1)),'partie_finie')});

test('200 coups sans capture : chacun garde les graines de son côté',()=>{
 const s=mk([1,0,0,0,0,0, 0,0,0,0,0,3],{noCap:199,store:[22,22]});
 const r=def.apply(s,{pit:0},0);
 assert.equal(r.res.reason,'boucle');assert.deepEqual(r.res.scores,{0:23,1:25});assert.deepEqual(r.res.winners,[1])});

test('égalité 24-24',()=>{
 const s=mk([1,0,0,0,0,0, 0,0,0,0,0,3],{noCap:199,store:[23,21]});
 const r=def.apply(s,{pit:0},0);
 assert.equal(r.res.draw,true);assert.deepEqual(r.res.winners,[]);assert.deepEqual(r.res.scores,{0:24,1:24})});

test('coups illégaux et triche',()=>{
 const s=def.init({players:2,rng:rng()});
 assert.equal(code(()=>def.apply(s,{pit:0},1)),'hors_tour');
 assert.equal(code(()=>def.apply(s,{pit:0},2)),'siege_invalide');
 assert.equal(code(()=>def.apply(s,{pit:0},'0')),'siege_invalide');
 assert.equal(code(()=>def.apply(s,{pit:6},0)),'coup_mal_forme');
 assert.equal(code(()=>def.apply(s,{pit:-1},0)),'coup_mal_forme');
 assert.equal(code(()=>def.apply(s,{pit:1.5},0)),'coup_mal_forme');
 for(const bad of [null,undefined,'3',3,[],[3],{},{pit:'3'},{pit:null},{pit:2,extra:1},{from:1}])assert.equal(code(()=>def.apply(s,bad,0)),'coup_mal_forme',JSON.stringify(bad));
 assert.equal(code(()=>def.apply(mk([0,0,0,0,0,0, 4,4,4,4,4,4]),{pit:0},0)),'coup_illegal');   /* trou vide */
 let f=s;while(def.turn(f)>=0)f=def.apply(f,def.legalMoves(f,def.turn(f))[0],def.turn(f));
 assert.equal(code(()=>def.apply(f,{pit:0},0)),'partie_finie');assert.equal(code(()=>def.apply(f,{pit:0},1)),'partie_finie');
 assert.deepEqual(def.legalMoves(f,0),[]);assert.ok(def.result(f))});

test('objet coup reçu jamais réutilisé ; pureté',()=>{
 const s=deepFreeze(def.init({players:2,rng:rng()})),before=JSON.stringify(s);
 const mv={pit:3},r=def.apply(s,mv,0);
 assert.equal(JSON.stringify(s),before);               /* état figé non modifié (aurait levé en mode strict) */
 mv.pit=0;assert.equal(r.last.pit,3);assert.notEqual(r.last,mv);
 const ms=def.legalMoves(s,0);ms[0].pit=99;assert.equal(def.legalMoves(s,0)[0].pit,0);
 r.pits[0]=99;assert.equal(s.pits[0],4)});

test('invariant 48 graines + 200 parties aléatoires terminées sans exception',()=>{
 const r=core.mulberry32(777);let fin={};
 for(let i=0;i<200;i++){const s=randomGame(r);assert.equal(def.turn(s),-1);const res=def.result(s);assert.ok(res);fin[res.reason]=(fin[res.reason]||0)+1;
  assert.equal(res.scores[0]+res.scores[1]+s.pits.reduce((a,b)=>a+b,0),48);assert.equal(res.draw,res.winners.length===0);if(!res.draw)assert.ok(res.scores[res.winners[0]]>24);
  assert.ok(s.noCap<=200)}
 assert.ok(Object.keys(fin).length>=1)});

test('view : copie sans rien de plus, observateur compris ; notation',()=>{
 const s=def.apply(def.init({players:2,rng:rng()}),{pit:1},0);
 for(const seat of [0,1,null]){const v=def.view(s,seat);assert.deepEqual(v,s);assert.notEqual(v.pits,s.pits);assert.deepEqual(Object.keys(v).sort(),Object.keys(s).sort())}
 assert.deepEqual(def.legalMoves(def.view(s,1),1),def.legalMoves(s,1));
 assert.equal(def.notation(def.init({players:2,rng:rng()}),{pit:2}),'3');
 assert.equal(def.notation(mk([0,0,0,0,0,4, 1,2,1,1,5,0]),{pit:5}),'6x9')});

test('IA : toujours légale, aux 3 niveaux, sur la vue figée',()=>{
 const r=core.mulberry32(5);
 for(const level of [1,2,3]){let s=def.init({players:2,rng:r});
  for(let i=0;i<30&&def.turn(s)>=0;i++){const t=def.turn(s),v=deepFreeze(def.view(s,t)),m=def.chooseMove(v,t,{level,budgetMs:20,rng:r});
   assert.ok(core.pick(def.legalMoves(s,t),m),'niveau '+level);s=def.apply(s,m,t)}}});

test('IA : respecte budgetMs',()=>{
 const r=core.mulberry32(9);let s=def.init({players:2,rng:r}),worst=0;
 for(let i=0;i<20&&def.turn(s)>=0;i++){const t=def.turn(s),t0=Date.now();const m=def.chooseMove(def.view(s,t),t,{level:3,budgetMs:60,rng:r});worst=Math.max(worst,Date.now()-t0);s=def.apply(s,m,t)}
 assert.ok(worst<60+150,'pire temps '+worst+' ms')});

test('IA niveau 2 bat nettement un joueur aléatoire (8/10 au moins)',()=>{
 const r=core.mulberry32(2024);let wins=0;
 for(let g=0;g<10;g++){const ai=g%2;let s=def.init({players:2,rng:r});
  while(def.turn(s)>=0){const t=def.turn(s),v=def.view(s,t);
   const m=t===ai?def.chooseMove(v,t,{level:2,budgetMs:25,rng:r}):(ms=>ms[Math.floor(r()*ms.length)])(def.legalMoves(v,t));
   s=def.apply(s,m,t)}
  const res=def.result(s);if(res.winners[0]===ai)wins++}
 assert.ok(wins>=8,'victoires IA : '+wins+'/10')});
