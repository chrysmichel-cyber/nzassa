'use strict';
/* Tests des Dames internationales : node --test tests/games-dames.test.cjs */
const test=require('node:test'),assert=require('node:assert/strict');
const core=require('../js/games/core.js'),def=require('../js/games/rules/dames.js');
const {RuleError}=core;
const rng=()=>core.mulberry32(4242);
/* Géométrie FMJD (copie indépendante de celle du module) : N(ligne,col) -> numéro 1..50 ; cases sombres = (ligne+colonne) impair. */
const N=(r,c)=>{assert.ok((r+c)%2===1&&r>=0&&r<10&&c>=0&&c<10,'case invalide '+r+','+c);return r*5+Math.floor(c/2)+1};
/* mk({w:[[r,c]..],W:[dames blanches],b:[..],B:[..]},cur) */
const mk=(o,cur,extra)=>{const board=new Array(51).fill(0);
 for(const [k,v] of [['w',1],['W',2],['b',3],['B',4]])for(const [r,c] of (o[k]||[]))board[N(r,c)]=v;
 cur=cur||0;return Object.assign({id:'dames',board,cur,quiet:0,plies:0,last:null,hist:{[board.join('')+cur]:1},res:null},extra||{})};
const code=f=>{try{f();return null}catch(e){assert.ok(e instanceof RuleError,'RuleError attendu : '+e);return e.code}};
function deepFreeze(o){if(o&&typeof o==='object'&&!Object.isFrozen(o)){Object.freeze(o);Object.values(o).forEach(deepFreeze)}return o}
const count=s=>s.board.filter(x=>x>0).length;
const legal=s=>def.legalMoves(s,def.turn(s));
const randomGame=(r,maxPlies=1500)=>{let s=def.init({players:2,rng:r}),n=0;
 while(def.turn(s)>=0&&n++<maxPlies){const t=def.turn(s),ms=def.legalMoves(s,t);assert.ok(ms.length>0);
  const mx=Math.max(...ms.map(m=>m.captures.length));for(const m of ms)assert.equal(m.captures.length,mx>0?mx:0,'prise majoritaire');
  const before=count(s);s=def.apply(s,ms[Math.floor(r()*ms.length)],t);assert.ok(count(s)<=before);assert.equal(s.board.length,51);
  for(let i=1;i<=50;i++)assert.ok(s.board[i]>=0&&s.board[i]<=4)}
 return s};

test('enregistrement : contrat complet',()=>{
 for(const k of ['id','name','minPlayers','maxPlayers','init','turn','legalMoves','apply','result','view','chooseMove','notation'])assert.ok(def[k]!==undefined,k);
 assert.equal(def.id,'dames');assert.doesNotThrow(()=>core.register(def));assert.equal(core.get('dames'),def);
 assert.equal(code(()=>def.init({players:3,rng:rng()})),'joueurs')});

test('départ : 20 pions chacun (1-20 noirs, 31-50 blancs), 9 coups blancs, notation FMJD',()=>{
 const s=def.init({players:['a','b'],rng:rng()});
 for(let n=1;n<=20;n++)assert.equal(s.board[n],3);for(let n=21;n<=30;n++)assert.equal(s.board[n],0);for(let n=31;n<=50;n++)assert.equal(s.board[n],1);
 assert.equal(def.turn(s),0);assert.equal(def.result(s),null);assert.deepEqual(def.legalMoves(s,1),[]);
 const ms=def.legalMoves(s,0);assert.equal(ms.length,9);
 const m=ms.find(x=>x.from===32&&x.to===28);assert.ok(m);assert.equal(def.notation(s,m),'32-28');
 /* coup abrégé accepté (un seul coup légal correspondant) */
 const r=def.apply(s,{from:32,to:28,captures:[]},0);assert.equal(r.board[28],1);assert.equal(r.board[32],0);assert.equal(def.turn(r),1)});

test('prise simple obligatoire (et notation 24x33 style FMJD)',()=>{
 const s=mk({w:[[5,4],[9,0]],b:[[4,3],[0,1]]});
 const ms=legal(s);assert.equal(ms.length,1);                      /* le pion (9,0) a un coup simple mais la prise est obligatoire */
 assert.deepEqual(ms[0].captures,[N(4,3)]);assert.equal(ms[0].from,N(5,4));assert.equal(ms[0].to,N(3,2));
 assert.equal(def.notation(s,ms[0]),N(5,4)+'x'+N(3,2));
 assert.equal(code(()=>def.apply(s,{from:N(9,0),to:N(8,1),captures:[]},0)),'coup_illegal');
 const r=def.apply(s,ms[0],0);assert.equal(r.board[N(4,3)],0);assert.equal(r.board[N(3,2)],1)});

test('pion prend en arrière',()=>{
 const s=mk({w:[[4,3]],b:[[5,4],[0,1]]});
 const ms=legal(s);assert.equal(ms.length,1);assert.deepEqual(ms[0].captures,[N(5,4)]);assert.equal(ms[0].to,N(6,5))});

test('prise majoritaire : la rafle de 2 prime sur la prise de 1',()=>{
 const s=mk({w:[[9,0],[9,6]],b:[[8,1],[8,5],[6,5],[0,1]]});
 const ms=legal(s);assert.ok(ms.length>=1);
 for(const m of ms){assert.equal(m.captures.length,2);assert.equal(m.from,N(9,6))}
 assert.equal(code(()=>def.apply(s,{from:N(9,0),to:N(7,2),captures:[N(8,1)]},0)),'coup_illegal')});

test('dame volante : prise à distance, choix de la case d’arrivée, déplacement long',()=>{
 const s=mk({W:[[7,0]],b:[[4,3],[0,5]]});
 const ms=legal(s);assert.equal(ms.length,4);
 assert.deepEqual(ms.map(m=>m.to).sort((a,b)=>a-b),[N(3,4),N(2,5),N(1,6),N(0,7)].sort((a,b)=>a-b));
 for(const m of ms)assert.deepEqual(m.captures,[N(4,3)]);
 const q=mk({W:[[9,0]],b:[[0,5]]});
 assert.ok(legal(q).some(m=>m.from===N(9,0)&&m.to===N(5,4)&&!m.captures.length));   /* quatre cases d'un coup */
 assert.equal(legal(q).length,9)});

test('rafle en boucle : pièces prises restent obstacles, jamais prises deux fois, départ libre',()=>{
 const s=mk({w:[[6,3]],b:[[5,4],[3,4],[3,2],[5,2],[0,1]]});
 const ms=legal(s);assert.equal(ms.length,2);
 for(const m of ms){assert.equal(m.captures.length,4);assert.equal(new Set(m.captures).size,4);assert.equal(m.to,m.from)}
 /* deux sens de parcours : même départ/arrivée/pièces, ordre des prises différent -> distinguables */
 assert.equal(code(()=>def.apply(s,{from:N(6,3),to:N(6,3),captures:[]},0)),'coup_illegal');
 const a=ms[0],b=ms[1];assert.notDeepEqual(a.captures,b.captures);
 const r=def.apply(s,{from:a.from,to:a.to,captures:a.captures.slice()},0);
 assert.equal(r.board[N(6,3)],1);assert.equal(count(r),2);                      /* le pion + (0,1) noir */
 const ra=def.apply(s,{from:a.from,to:a.to,captures:b.captures.slice().reverse()},0);assert.ok(ra)});

test('promotion seulement si la rafle finit sur la dernière rangée',()=>{
 const prom=def.apply(mk({w:[[2,1]],b:[[1,2],[9,0]]}),{from:N(2,1),to:N(0,3),captures:[N(1,2)]},0);
 assert.equal(prom.board[N(0,3)],2);assert.equal(prom.last.promoted,true);
 /* traverse la rangée 0 puis repart en arrière : reste un pion */
 const s=mk({w:[[2,1]],b:[[1,2],[1,4],[9,0]]});
 const ms=legal(s);assert.equal(ms.length,1);assert.equal(ms[0].captures.length,2);assert.equal(ms[0].to,N(2,5));
 const r=def.apply(s,ms[0],0);assert.equal(r.board[N(2,5)],1);assert.equal(r.last.promoted,false);
 /* simple pas sur la dernière rangée : promotion aussi */
 const r2=def.apply(mk({w:[[1,2]],b:[[9,0]]}),{from:N(1,2),to:N(0,1),captures:[]},0);assert.equal(r2.board[N(0,1)],2);
 /* noir : dernière rangée = 9 */
 const r3=def.apply(mk({w:[[0,1]],b:[[8,3]]},1),{from:N(8,3),to:N(9,4),captures:[]},1);assert.equal(r3.board[N(9,4)],4)});

test('plus de coup = défaite (plus de pièces)',()=>{
 const s=mk({w:[[4,3]],b:[[3,2]]},1);
 const r=def.apply(s,legal(s)[0],1);
 assert.ok(r.res);assert.equal(r.res.reason,'plus_de_coups');assert.deepEqual(r.res.winners,[1]);assert.equal(r.res.draw,false);assert.equal(def.turn(r),-1);
 assert.equal(code(()=>def.apply(r,{from:1,to:6,captures:[]},0)),'partie_finie')});

test('plus de coup = défaite (pièces bloquées)',()=>{
 /* pion blanc (5,0) ; le noir joue (3,0)->(4,1), soutenu par (3,2) : le blanc ne peut ni avancer ni prendre */
 const s=mk({w:[[5,0]],b:[[3,0],[3,2]]},1);
 const r=def.apply(s,{from:N(3,0),to:N(4,1),captures:[]},1);
 assert.ok(r.res,'la partie est terminée');assert.deepEqual(r.res.winners,[1]);assert.equal(def.turn(r),-1)});

test('nulle : 25 coups de dame sans prise ni pion',()=>{
 const s=mk({W:[[9,0]],B:[[0,9]]},0,{quiet:49});
 const r=def.apply(s,legal(s)[0],0);
 assert.ok(r.res);assert.equal(r.res.draw,true);assert.equal(r.res.reason,'vingt_cinq_coups');assert.deepEqual(r.res.winners,[]);
 /* un mouvement de pion remet le compteur à zéro */
 const t=mk({W:[[9,0]],B:[[0,9]],w:[[6,1]]},0,{quiet:49});
 const r2=def.apply(t,{from:N(6,1),to:N(5,2),captures:[]},0);assert.equal(r2.res,null);assert.equal(r2.quiet,0)});

test('nulle : trois répétitions de la même position',()=>{
 let s=mk({W:[[9,2]],B:[[0,7]]});
 const a=N(9,2),b=N(8,3),c=N(0,7),d=N(1,6);
 const cycle=[[0,a,b],[1,c,d],[0,b,a],[1,d,c]];
 for(let rep=0;rep<2;rep++)for(const [seat,f,t] of cycle){assert.equal(s.res,null);s=def.apply(s,{from:f,to:t,captures:[]},seat)}
 assert.ok(s.res,'troisième occurrence');assert.equal(s.res.reason,'repetition');assert.equal(s.res.draw,true)});

test('triche et coups mal formés',()=>{
 const s=def.init({players:2,rng:rng()});
 assert.equal(code(()=>def.apply(s,{from:32,to:28,captures:[]},1)),'hors_tour');
 assert.equal(code(()=>def.apply(s,{from:32,to:28,captures:[]},2)),'siege_invalide');
 assert.equal(code(()=>def.apply(s,{from:32,to:28,captures:[]},'0')),'siege_invalide');
 assert.equal(code(()=>def.apply(s,{from:32,to:28,captures:[]},-1)),'siege_invalide');
 for(const bad of [null,undefined,'32-28',32,[],[32,28],{},{from:32},{from:'32',to:28},{from:32,to:28.5},{from:0,to:5},{from:32,to:51},{from:32,to:28,captures:'x'},{from:32,to:28,captures:[1.5]},{from:32,to:28,captures:[],extra:1},{from:32,to:28,path:[0]}])
  assert.equal(code(()=>def.apply(s,bad,0)),'coup_mal_forme',JSON.stringify(bad));
 for(const bad of [{from:32,to:23,captures:[]},{from:1,to:6,captures:[]},{from:18,to:23,captures:[]},{from:32,to:28,captures:[27]},{from:32,to:28,captures:[]}.from])
  if(typeof bad==='object')assert.ok(['coup_illegal','coup_mal_forme'].includes(code(()=>def.apply(s,bad,0))),JSON.stringify(bad));
 /* coup non listé : reculer, pion adverse, case occupée */
 assert.equal(code(()=>def.apply(s,{from:32,to:37,captures:[]},0)),'coup_illegal');
 assert.equal(code(()=>def.apply(s,{from:32,to:33,captures:[]},0)),'coup_illegal');
 assert.equal(code(()=>def.apply(s,{from:36,to:31,captures:[]},0)),'coup_illegal');   /* case d'arrivée occupée */
});
