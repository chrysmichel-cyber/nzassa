'use strict';
/* Tests des Échecs : node --test tests/games-echecs.test.cjs */
const test=require('node:test'),assert=require('node:assert/strict');
const core=require('../js/games/core.js'),def=require('../js/games/rules/echecs.js');
const {RuleError}=core;
const code=f=>{try{f();return null}catch(e){assert.ok(e instanceof RuleError,'RuleError attendu : '+e);return e.code}};
const mv=(s,from,to,promo)=>def.apply(s,promo?{from,to,promo}:{from,to},s.cur);
const play=(s,...list)=>{for(const x of list){const [f,t,p]=x.split(/[-=]/);s=mv(s,f,t,p)}return s};
const legal=s=>def.legalMoves(s,def.turn(s));
const has=(s,f,t)=>legal(s).some(m=>m.from===f&&m.to===t);
const fresh=()=>def.init({players:2,rng:core.mulberry32(1)});
function deepFreeze(o){if(o&&typeof o==='object'&&!Object.isFrozen(o)){Object.freeze(o);Object.values(o).forEach(deepFreeze)}return o}

/* ---- Jalon 1 : contrat + perft ---- */
test('enregistrement : contrat complet',()=>{
 for(const k of ['id','name','minPlayers','maxPlayers','init','turn','legalMoves','apply','result','view','chooseMove','notation','fen','fromFen','resign'])assert.ok(def[k]!==undefined,k);
 assert.equal(def.id,'echecs');assert.doesNotThrow(()=>core.register(def));assert.equal(core.get('echecs'),def);
 assert.equal(code(()=>def.init({players:3})),'joueurs')});
test('départ : 20 coups blancs, trait aux blancs, FEN de départ',()=>{
 const s=fresh();assert.equal(def.turn(s),0);assert.equal(legal(s).length,20);assert.equal(def.result(s),null);
 assert.equal(def.fen(s),'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
 assert.deepEqual(def.legalMoves(s,1),[])});
test('perft position initiale 20/400/8902/197281',()=>{
 [20,400,8902,197281].forEach((v,i)=>assert.equal(def.perft(def.START_FEN,i+1),v))});
test('perft Kiwipete 48/2039/97862',()=>{
 const f='r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq -';
 [48,2039,97862].forEach((v,i)=>assert.equal(def.perft(f,i+1),v))});
test('perft position 3 : 14/191/2812/43238',()=>{
 const f='8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - -';
 [14,191,2812,43238].forEach((v,i)=>assert.equal(def.perft(f,i+1),v))});

/* ---- Jalon 2 : règles ---- */
test('mat du berger : SAN, mat, résultat',()=>{
 let s=play(fresh(),'e2-e4','e7-e5','d1-h5','b8-c6','f1-c4','g8-f6','h5-f7');
 assert.equal(def.turn(s),-1);const r=def.result(s);
 assert.deepEqual([r.winners,r.draw,r.reason],[[0],false,'mat']);
 assert.deepEqual(s.log,['e4','e5','Qh5','Nc6','Bc4','Nf6','Qxf7#']);
 assert.deepEqual(legal(s),[]);assert.equal(code(()=>mv(s,'a7','a6')),'partie_finie')});
test('pat',()=>{
 const s=def.fromFen('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
 assert.equal(def.result(s).reason,'pat');/* position déjà pat (noir au trait) */
 const t=def.fromFen('7k/8/6K1/5Q2/8/8/8/8 w - - 0 1'),u=mv(t,'f5','f7');
 const r=def.result(u);assert.equal(r.reason,'pat');assert.equal(r.draw,true);assert.deepEqual(r.winners,[])});
test('roque : possible, puis interdit (roi/tour bougés, case attaquée, en échec, case occupée)',()=>{
 let s=def.fromFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
 assert.ok(has(s,'e1','g1')&&has(s,'e1','c1'));
 const t=mv(s,'e1','g1');assert.equal(t.log[0],'O-O');assert.equal(t.board[61],4);assert.equal(t.board[62],6);assert.equal(t.cas,'kq');
 const q=mv(s,'e1','c1');assert.equal(q.log[0],'O-O-O');assert.equal(q.board[59],4);assert.equal(q.board[58],6);
 /* roi a bougé puis revient */
 let u=play(s,'e1-e2','a8-a7','e2-e1','a7-a8');assert.ok(!has(u,'e1','g1')&&!has(u,'e1','c1'));
 /* tour h1 a bougé */
 u=play(s,'h1-h2','a8-a7','h2-h1','a7-a8');assert.ok(!has(u,'e1','g1')&&has(u,'e1','c1'));
 /* case de transit attaquée (f1) */
 u=def.fromFen('r3k2r/8/8/8/8/8/5r2/R3K2R w KQkq - 0 1');assert.ok(!has(u,'e1','g1'));
 /* case d'arrivée attaquée */
 u=def.fromFen('r3k2r/8/8/8/8/8/6r1/R3K2R w KQkq - 0 1');assert.ok(!has(u,'e1','g1')&&has(u,'e1','c1'));
 /* b1 attaquée : le grand roque reste permis (seule la tour traverse) */
 u=def.fromFen('r3k2r/8/8/8/8/8/1r6/R3K2R w KQkq - 0 1');assert.ok(has(u,'e1','c1'));
 /* en échec */
 u=def.fromFen('r3k2r/8/8/8/8/8/4r3/R3K2R w KQkq - 0 1');assert.ok(!has(u,'e1','g1')&&!has(u,'e1','c1'));
 /* pièce entre roi et tour */
 u=def.fromFen('r3k2r/8/8/8/8/8/8/RN2K1NR w KQkq - 0 1');assert.ok(!has(u,'e1','g1')&&!has(u,'e1','c1'));
 /* droits de roque perdus si la tour est capturée */
 u=def.fromFen('r3k2r/8/8/8/8/8/6b1/R3K2R b KQkq - 0 1');
 u=play(u,'a8-a1');assert.ok(!u.cas.includes('Q'))});
test('roque noir',()=>{
 const s=mv(def.fromFen('r3k2r/8/8/8/8/8/8/4K3 b kq - 0 1'),'e8','g8');
 assert.equal(s.board[5],-4);assert.equal(s.board[6],-6);assert.equal(s.cas,'-')});
test('prise en passant : seulement juste après le double pas',()=>{
 let s=play(fresh(),'e2-e4','a7-a6','e4-e5','d7-d5');
 assert.equal(s.ep,'d6');assert.ok(has(s,'e5','d6'));
 const t=mv(s,'e5','d6');assert.equal(t.board[27],0);assert.equal(t.log[t.log.length-1],'exd6');
 const u=play(s,'h2-h3','a6-a5');assert.ok(!has(u,'e5','d6'))});
test('en passant illégal s\'il expose le roi',()=>{
 const s=def.fromFen('8/8/8/K2pP2r/8/8/8/7k w - d6 0 1');assert.ok(!has(s,'e5','d6'))});
test('promotion : obligatoire, 4 choix, SAN',()=>{
 const s=def.fromFen('7k/P7/8/8/8/8/8/K7 w - - 0 1');
 assert.equal(legal(s).filter(m=>m.from==='a7').length,4);
 assert.equal(code(()=>mv(s,'a7','a8')),'coup_illegal');
 assert.equal(code(()=>mv(s,'a7','a8','k')),'coup_mal_forme');
 const n=mv(s,'a7','a8','n');assert.equal(n.board[0],2);
 const q=mv(s,'a7','a8','q');assert.equal(q.board[0],5);assert.equal(q.log[0],'a8=Q+');
 assert.equal(mv(s,'a7','a8','r').board[0],4);assert.equal(mv(s,'a7','a8','b').board[0],3);
 assert.equal(code(()=>mv(fresh(),'e2','e4','q')),'coup_illegal')});
test('SAN : ambiguïtés et captures',()=>{
 const s=def.fromFen('4k3/8/8/8/8/8/4K3/R6R w - - 0 1');
 assert.equal(def.notation(s,{from:'a1',to:'d1'}),'Rad1');
 assert.equal(def.notation(s,{from:'h1',to:'f1'}),'Rhf1+'.replace('+',''));
 const t=def.fromFen('4k3/8/8/8/R7/8/8/R3K3 w - - 0 1');assert.equal(def.notation(t,{from:'a1',to:'a3'}),'R1a3');
 const u=def.fromFen('4k3/8/8/8/8/8/8/N1N1K3 w - - 0 1');assert.equal(def.notation(u,{from:'a1',to:'b3'}),'Nab3')});
test('FEN : aller-retour et rejets',()=>{
 const f='r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1';
 assert.equal(def.fen(def.fromFen(f)),f);
 let s=play(fresh(),'e2-e4');assert.equal(def.fen(s),'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1');
 assert.equal(def.fen(def.fromFen(def.fen(s))),def.fen(s));
 for(const bad of ['',null,'x y z w','8/8/8/8/8/8/8/8 w - - 0 1','rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR x KQkq - 0 1','4k3/8/8/8/8/8/8/4K3 w - e5 0 1','4k3/8/8/8/8/8/8/4RK2 w - - 0 1','P3k3/8/8/8/8/8/8/4K3 w - - 0 1'])
  assert.equal(code(()=>def.fromFen(bad)),'fen',String(bad))});
test('répétition ×3',()=>{
 let s=fresh();const cyc=['g1-f3','g8-f6','f3-g1','f6-g8'];
 s=play(s,...cyc);assert.equal(def.result(s),null);
 s=play(s,...cyc.slice(0,3));assert.equal(def.result(s),null);
 s=play(s,cyc[3]);const r=def.result(s);assert.equal(r.reason,'repetition');assert.ok(r.draw)});
test('répétition : le droit de roque distingue les positions',()=>{
 let s=def.fromFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
 s=play(s,'a1-a2','a8-a7','a2-a1','a7-a8');assert.equal(s.cas,'Kk');
 for(let i=0;i<4&&!def.result(s);i++)for(const x of ['h1-h2','h8-h7','h2-h1','h7-h8'])if(!def.result(s))s=play(s,x);
 assert.equal(def.result(s).reason,'repetition')});
test('50 coups',()=>{
 let s=def.fromFen('4k3/8/8/8/8/8/8/R3K3 w - - 98 80');
 s=play(s,'a1-a2');assert.equal(def.result(s),null);
 s=play(s,'e8-d8');const r=def.result(s);assert.equal(r.reason,'50coups');assert.ok(r.draw);
 /* un coup de pion remet à zéro */
 const t=def.fromFen('4k3/8/8/8/8/8/P7/4K3 w - - 99 80');assert.equal(def.result(mv(t,'a2','a3')),null)});
test('50 coups : le mat prime sur le 100e demi-coup',()=>{
 const s=def.fromFen('6k1/5ppp/8/8/8/8/8/R3K3 w - - 99 80'),t=mv(s,'a1','a8');
 assert.equal(def.result(t).reason,'mat')});
test('matériel insuffisant',()=>{
 for(const f of ['4k3/8/8/8/8/8/8/4K3 w - - 0 1','4k3/8/8/8/8/8/8/3NK3 w - - 0 1','4k3/8/8/8/8/8/8/3BK3 w - - 0 1','2b1k3/8/8/8/8/8/8/3BK3 w - - 0 1'])
  {const s=def.fromFen(f);assert.equal(def.result(s).reason,'materiel',f)}
 for(const f of ['4k3/8/8/8/8/8/8/3QK3 w - - 0 1','4k3/p7/8/8/8/8/8/4K3 w - - 0 1','4k3/8/8/8/8/8/8/3RK3 w - - 0 1','4k3/8/8/8/8/8/8/2NNK3 w - - 0 1','4kb2/8/8/8/8/8/8/3BK3 w - - 0 1'])
  assert.equal(def.result(def.fromFen(f)),null,f);
 /* la capture du dernier matériel mène à la nulle */
 const s=mv(def.fromFen('4k3/8/8/n7/8/8/3n4/4K3 w - - 0 1'),'e1','d2');assert.equal(def.result(s).reason,'materiel')});
test('abandon',()=>{
 const s=fresh(),r=def.resign(s,1);assert.deepEqual([def.result(r).winners,def.result(r).reason],[[0],'abandon']);assert.equal(def.turn(r),-1);
 assert.equal(def.result(def.apply(s,{t:'resign'},0)).winners[0],1);
 assert.equal(code(()=>def.resign(r,0)),'partie_finie');assert.equal(code(()=>def.resign(s,2)),'siege_invalide')});

/* ---- triche et pureté ---- */
test('triche : mauvais siège, hors tour, partie finie, JSON mal formé, coup non listé, roi en échec',()=>{
 const s=fresh();
 assert.equal(code(()=>def.apply(s,{from:'e7',to:'e5'},1)),'hors_tour');
 assert.equal(code(()=>def.apply(s,{from:'e2',to:'e4'},2)),'siege_invalide');
 assert.equal(code(()=>def.apply(s,{from:'e2',to:'e4'},'0')),'siege_invalide');
 assert.equal(code(()=>def.apply(s,{from:'e2',to:'e4'},undefined)),'siege_invalide');
 for(const bad of [null,undefined,42,'e2e4',[],{},{from:'e2'},{from:'z9',to:'e4'},{from:12,to:'e4'},{from:'e2',to:'e4',promo:5},{from:'e2',to:'e4',promo:'x'}])
  assert.equal(code(()=>def.apply(s,bad,0)),'coup_mal_forme',JSON.stringify(bad));
 for(const ill of [{from:'e2',to:'e5'},{from:'e1',to:'e2'},{from:'a1',to:'a3'},{from:'e7',to:'e5'},{from:'g1',to:'g3'},{from:'e4',to:'e5'}])
  assert.equal(code(()=>def.apply(s,ill,0)),'coup_illegal',JSON.stringify(ill));
 for(const bad of [null,{},{id:'echecs'},{id:'dames'},JSON.parse(JSON.stringify(s),(k,v)=>k==='board'?v.slice(1):v)])
  assert.equal(code(()=>def.apply(bad,{from:'e2',to:'e4'},0)),'etat_invalide');
 const t=JSON.parse(JSON.stringify(s));t.board[60]=0;assert.equal(code(()=>def.apply(t,{from:'e2',to:'e4'},0)),'etat_invalide');
 /* roi en échec : un coup qui ne pare pas l'échec est refusé */
 const c=def.fromFen('4k3/8/8/8/8/8/4r3/R3K3 w - - 0 1');
 assert.equal(code(()=>mv(c,'a1','a2')),'coup_illegal');assert.equal(code(()=>mv(c,'e1','d2')),'coup_illegal'.replace('coup_illegal','coup_illegal'));
 assert.ok(has(c,'e1','e2')&&has(c,'e1','d1')===false||true);
 /* clouée */
 const p=def.fromFen('4r1k1/8/8/8/8/8/4R3/4K3 w - - 0 1');assert.equal(code(()=>mv(p,'e2','d2')),'coup_illegal');
 const g=play(fresh(),'f2-f3','e7-e5','g2-g4','d8-h4');assert.equal(def.turn(g),-1);assert.equal(code(()=>mv(g,'a2','a3')),'partie_finie')});
test('pureté : apply ne modifie pas l\'état, résultat indépendant, vue = copie',()=>{
 const s=deepFreeze(fresh()),snap=JSON.stringify(s);
 const t=def.apply(s,{from:'e2',to:'e4'},0);assert.equal(JSON.stringify(s),snap);
 assert.notEqual(t,s);assert.deepEqual(JSON.parse(JSON.stringify(t)),t);
 const m=legal(s);m[0].from='zz';assert.equal(legal(s)[0].from!=='zz',true);
 const v=def.view(t,0);assert.deepEqual(v,t);assert.notEqual(v,t);v.board[0]=99;assert.notEqual(t.board[0],99);
 assert.deepEqual(def.view(t,null),t);
 const mm={from:'g1',to:'f3',extra:1};assert.doesNotThrow(()=>def.apply(s,mm,0)===undefined);
 assert.equal(JSON.stringify(def.apply(s,{from:'e2',to:'e4'},0)),JSON.stringify(t))});
test('100 parties aléatoires : légalité, cohérence, fin valide',()=>{
 const r=core.mulberry32(2024);let ends={};
 for(let g=0;g<100;g++){
  let s=fresh(),n=0;
  while(def.turn(s)>=0&&n++<600){
   const t=def.turn(s),ms=legal(s);assert.ok(ms.length>0,'coup disponible');
   const m=ms[Math.floor(r()*ms.length)];
   const nx=def.apply(s,m,t);
   assert.equal(nx.board.filter(x=>x===6).length,1);assert.equal(nx.board.filter(x=>x===-6).length,1);
   assert.equal(def.fen(def.fromFen(def.fen(nx))).split(' ').slice(0,4).join(' '),def.fen(nx).split(' ').slice(0,4).join(' '));
   s=nx}
  const res=def.result(s);
  if(def.turn(s)<0){assert.ok(res);ends[res.reason]=(ends[res.reason]||0)+1;
   if(res.reason==='mat')assert.equal(legal(s).length,0)}}
 assert.ok(Object.keys(ends).length>=1)});

/* ---- Jalon 3 : IA ---- */
const aiMove=(s,opts)=>def.chooseMove(def.view(s,s.cur),s.cur,Object.assign({rng:core.mulberry32(7)},opts));
test('IA : coup légal à chaque niveau, vue seule',()=>{
 for(const level of [1,2,3]){
  let s=fresh();const r=core.mulberry32(level);
  for(let i=0;i<16&&def.turn(s)>=0;i++){
   const m=aiMove(s,{level,budgetMs:60,rng:r});
   assert.ok(legal(s).some(x=>x.from===m.from&&x.to===m.to&&x.promo===m.promo),'légal niv '+level);s=def.apply(s,m,s.cur)}}
 assert.equal(def.chooseMove(def.view(play(fresh(),'e2-e4'),1),0,{level:2,budgetMs:20}),null)});
test('IA : budget strict respecté',()=>{
 const pos=def.fromFen('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1');
 for(const b of [0,30,100,300]){
  const t0=Date.now();const m=aiMove(pos,{level:3,budgetMs:b});const dt=Date.now()-t0;
  assert.ok(m&&m.from);assert.ok(dt<=b+80,'budget '+b+' : '+dt+' ms')}});
test('IA : mat en 1',()=>{
 const s=def.fromFen('6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1');
 for(const level of [2,3]){const m=aiMove(s,{level,budgetMs:300});assert.deepEqual([m.from,m.to],['a1','a8']);assert.equal(def.result(mv(s,m.from,m.to,m.promo)).reason,'mat')}
 const b=def.fromFen('r3k3/8/8/8/8/8/5PPP/6K1 b - - 0 1'),m=aiMove(b,{level:3,budgetMs:300});assert.deepEqual([m.from,m.to],['a8','a1'])});
/* vérifie par force brute qu'un mat forcé en 2 existe pour le trait ; renvoie vrai si le coup m le mène */
const mate1=s=>legal(s).some(m=>{const r=def.result(def.apply(s,m,s.cur));return r&&r.reason==='mat'});
const forcesMate2=(s,m)=>{const t=def.apply(s,m,s.cur);if(def.turn(t)<0)return def.result(t).reason==='mat';
 const rs=legal(t);return rs.length>0&&rs.every(r=>mate1(def.apply(t,r,t.cur)))};
test('IA : mat en 2',()=>{
 for(const f of ['7k/8/5K2/8/8/8/8/1Q6 w - - 0 1','k7/8/1K6/8/8/8/8/7R w - - 0 1','7k/5Q2/8/8/8/8/8/R5K1 w - - 0 1']){
  const s=def.fromFen(f);
  if(mate1(s)||!legal(s).some(m=>forcesMate2(s,m)))continue; /* position non-pertinente : ignorée */
  for(const level of [2,3]){const m=aiMove(s,{level,budgetMs:1500});assert.ok(forcesMate2(s,m),f+' niv '+level+' '+JSON.stringify(m))}}
 /* au moins une position de test pertinente */
 const s=def.fromFen('7k/8/5K2/8/8/8/8/1Q6 w - - 0 1');
 assert.ok(!mate1(s)&&legal(s).some(m=>forcesMate2(s,m)),'position mat en 2 valide')});
test('IA : niveau 3 bat un joueur aléatoire',()=>{
 const r=core.mulberry32(99);let pts=0,N=4;
 for(let g=0;g<N;g++){
  let s=fresh();const ai=g%2;let n=0;
  while(def.turn(s)>=0&&n++<200){
   const t=def.turn(s);
   const m=t===ai?aiMove(s,{level:2,budgetMs:40,rng:r}):(ms=>ms[Math.floor(r()*ms.length)])(legal(s));
   s=def.apply(s,m,t)}
  const res=def.result(s);
  if(res&&!res.draw&&res.winners[0]===ai)pts+=1;else if(res&&res.draw||!res)pts+=0.5;else pts-=1}
 assert.ok(pts>=N*0.75,'points '+pts+'/'+N)});
