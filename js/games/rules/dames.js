/* Dames internationales 10×10 — 2 joueurs. Règles PURES (aucun DOM, aucun réseau).
   Règles retenues :
   - numérotation FMJD 1..50 (1 = en haut à gauche du côté des Noirs, 50 = en bas à droite du côté des Blancs) ; pions sur cases sombres ;
     siège 0 = Blancs (31-50, montent vers 1-5, jouent en premier), siège 1 = Noirs (1-20) ;
   - pion : avance d'une case en diagonale ; dame : « volante » (toute distance en diagonale) ;
   - prise obligatoire ET majoritaire : on doit jouer la rafle qui prend le plus de pièces (une dame compte pour une pièce) ;
   - pions et dames prennent en avant et en arrière ; les pièces prises ne sont retirées qu'à la fin de la rafle : elles restent des
     obstacles et ne peuvent être prises deux fois ; la case de départ est considérée libre pendant la rafle ;
   - promotion seulement si la rafle (ou le coup) se termine sur la dernière rangée ;
   - nulle : 25 coups par camp (50 demi-coups) de dame sans prise ni mouvement de pion, ou même position (même camp au trait) 3 fois ;
   - un joueur sans coup légal (plus de pièces ou bloqué) perd.
   Coup : {from,to,captures:[numéros dans l'ordre de prise],path:[cases d'atterrissage, la dernière = to]}. apply accepte aussi un coup
   sans path et/ou sans captures s'il désigne un seul coup légal ; sinon RuleError 'coup_ambigu'.
   Cases : 0 vide, 1 pion blanc, 2 dame blanche, 3 pion noir, 4 dame noire (board[0] inutilisé). */
(function(root,f){if(typeof module==='object'&&module.exports){module.exports=f(require('../core.js'),require('../ai.js'))}else{root.LCA.games.register(f(root.LCA.games,root.LCA.gameAI))}})(typeof self!=='undefined'?self:this,function(core,AI){
 'use strict';
 const {RuleError}=core,QUIET_MAX=50;
 const nPlayers=p=>Array.isArray(p)?p.length:p;
 /* Géométrie : RC[n]=[ligne,colonne] ; RAYS[n][d]=cases successives dans la direction d. */
 const RC=[null],GRID={};
 for(let n=1;n<=50;n++){const r=Math.floor((n-1)/5),k=(n-1)%5,c=r%2===0?2*k+1:2*k;RC[n]=[r,c];GRID[r*10+c]=n}
 const DIRS=[[-1,-1],[-1,1],[1,-1],[1,1]];
 const RAYS=[null];
 for(let n=1;n<=50;n++){RAYS[n]=DIRS.map(([dr,dc])=>{const a=[];let r=RC[n][0]+dr,c=RC[n][1]+dc;while(r>=0&&r<10&&c>=0&&c<10){a.push(GRID[r*10+c]);r+=dr;c+=dc}return a})}
 const sideOf=p=>p===0?-1:p<=2?0:1,isKing=p=>p===2||p===4;

 function initialBoard(){const b=new Array(51).fill(0);for(let n=1;n<=20;n++)b[n]=3;for(let n=31;n<=50;n++)b[n]=1;return b}
 const posKey=(b,cur)=>b.join('')+cur;

 function init({players}){
  if(nPlayers(players)!==2)throw new RuleError('joueurs','Les dames se jouent à 2 joueurs');
  const board=initialBoard();
  return {id:'dames',board,cur:0,quiet:0,plies:0,last:null,hist:{[posKey(board,0)]:1},res:null}}

 /* Rafles possibles d'une pièce (toutes les séquences maximales de cette pièce, avant filtre majoritaire). */
 function capturesFrom(board,n,seat){
  const out=[],taken=new Set(),king=isKing(board[n]);
  const free=x=>board[x]===0||x===n;
  function dfs(pos,path,caps){
   let any=false;
   for(let d=0;d<4;d++){
    const ray=RAYS[pos][d];
    if(!king){
     if(ray.length<2)continue;
     const a=ray[0],b=ray[1],pa=board[a];
     if(pa&&sideOf(pa)!==seat&&!taken.has(a)&&free(b)){any=true;taken.add(a);dfs(b,path.concat(b),caps.concat(a));taken.delete(a)}
    }else{
     let i=0;while(i<ray.length&&free(ray[i]))i++;
     if(i>=ray.length)continue;
     const a=ray[i],pa=board[a];
     if(!pa||sideOf(pa)===seat||taken.has(a))continue;
     for(let j=i+1;j<ray.length&&free(ray[j]);j++){any=true;taken.add(a);dfs(ray[j],path.concat(ray[j]),caps.concat(a));taken.delete(a)}
    }}
   if(!any&&caps.length)out.push({from:n,to:pos,captures:caps,path})}
  dfs(n,[],[]);
  return out}

 function genMoves(st,seat){
  const b=st.board;let caps=[];
  for(let n=1;n<=50;n++)if(b[n]&&sideOf(b[n])===seat)for(const m of capturesFrom(b,n,seat))caps.push(m);
  if(caps.length){let mx=0;for(const m of caps)if(m.captures.length>mx)mx=m.captures.length;return caps.filter(m=>m.captures.length===mx)}
  const out=[];
  for(let n=1;n<=50;n++){
   const p=b[n];if(!p||sideOf(p)!==seat)continue;
   if(isKing(p)){for(let d=0;d<4;d++)for(const t of RAYS[n][d]){if(b[t]!==0)break;out.push({from:n,to:t,captures:[],path:[t]})}}
   else{const dirs=seat===0?[0,1]:[2,3];for(const d of dirs){const t=RAYS[n][d][0];if(t&&b[t]===0)out.push({from:n,to:t,captures:[],path:[t]})}}}
  return out}

 const cache=new WeakMap();      /* coups des états créés en interne (IA) : jamais exposé au public */
 function genCached(s){let m=cache.get(s);if(!m){m=genMoves(s,s.cur);cache.set(s,m)}return m}
 const legalMoves=(st,seat)=>(st.res||seat!==st.cur)?[]:core.clone(genMoves(st,seat));
 const turn=st=>st.res?-1:st.cur;
 const result=st=>st.res?core.clone(st.res):null;
 const counts=b=>{let w=0,k=0,bl=0,bk=0;for(let n=1;n<=50;n++){const p=b[n];if(p===1)w++;else if(p===2)k++;else if(p===3)bl++;else if(p===4)bk++}return {0:w+k,1:bl+bk}};

 /* Application sans validation. track : met à jour l'historique de répétition (apply public seulement). */
 function raw(s,m,seat,track){
  const b=s.board.slice(),piece=b[m.from];
  b[m.from]=0;for(const c of m.captures)b[c]=0;
  let np=piece,promoted=false;
  if(!isKing(piece)&&RC[m.to][0]===(seat===0?0:9)){np=piece+1;promoted=true}
  b[m.to]=np;
  const n={id:'dames',board:b,cur:1-seat,quiet:(m.captures.length||!isKing(piece))?0:s.quiet+1,plies:s.plies+1,
   last:{seat,from:m.from,to:m.to,captures:m.captures.slice(),path:m.path.slice(),promoted},hist:s.hist,res:null};
  const moves=genMoves(n,n.cur);cache.set(n,moves);
  if(!moves.length)n.res={winners:[seat],draw:false,reason:'plus_de_coups',scores:counts(b)};
  else{
   if(track){n.hist=Object.assign({},s.hist);const k=posKey(b,n.cur);n.hist[k]=(n.hist[k]||0)+1;
    if(n.hist[k]>=3)n.res={winners:[],draw:true,reason:'repetition',scores:counts(b)}}
   if(!n.res&&n.quiet>=QUIET_MAX)n.res={winners:[],draw:true,reason:'vingt_cinq_coups',scores:counts(b)}}
  if(n.res)n.cur=-1;
  return n}

 const isInt=x=>Number.isInteger(x),sq=x=>isInt(x)&&x>=1&&x<=50;
 const sameArr=(a,b)=>a.length===b.length&&a.every((x,i)=>x===b[i]);
 function resolve(legal,move){
  if(move===null||typeof move!=='object'||Array.isArray(move))throw new RuleError('coup_mal_forme','Coup mal formé');
  for(const k of Object.keys(move))if(k!=='from'&&k!=='to'&&k!=='captures'&&k!=='path')throw new RuleError('coup_mal_forme','Coup mal formé');
  if(!sq(move.from)||!sq(move.to))throw new RuleError('coup_mal_forme','Coup mal formé');
  for(const k of ['captures','path'])if(move[k]!==undefined&&(!Array.isArray(move[k])||!move[k].every(sq)))throw new RuleError('coup_mal_forme','Coup mal formé');
  const cs=move.captures&&move.captures.slice().sort((a,b)=>a-b);
  const found=legal.filter(m=>m.from===move.from&&m.to===move.to&&(!move.path||sameArr(m.path,move.path))&&
   (!cs||sameArr(m.captures.slice().sort((a,b)=>a-b),cs)));
  if(!found.length)throw new RuleError('coup_illegal','Coup illégal');
  if(found.length>1&&move.captures){const ex=found.filter(m=>sameArr(m.captures,move.captures));if(ex.length===1)return ex[0]}   /* l'ordre des prises distingue deux rafles */
  if(found.length>1)throw new RuleError('coup_ambigu','Plusieurs rafles correspondent : précisez le chemin (path)');
  return found[0]}

 function apply(state,move,seat){
  if(!state||state.res)throw new RuleError('partie_finie','La partie est terminée');
  if(!Number.isInteger(seat)||seat<0||seat>1)throw new RuleError('siege_invalide','Siège invalide');
  if(seat!==state.cur)throw new RuleError('hors_tour','Ce n’est pas votre tour');
  const m=resolve(genMoves(state,seat),move);
  return raw(state,m,seat,true)}

 const view=(st,seat)=>core.clone(st);

 /* IA : matériel (pion 100, dame 320) + avancement des pions + léger bonus de centre. */
 function evaluate(s,seat){
  const b=s.board;let v=0;
  for(let n=1;n<=50;n++){
   const p=b[n];if(!p)continue;
   const sd=sideOf(p),sign=sd===seat?1:-1,[r,c]=RC[n];
   let x;
   if(isKing(p))x=320+(Math.abs(c-4.5)<2.5&&Math.abs(r-4.5)<2.5?6:0);
   else{const adv=sd===0?9-r:r;x=100+adv*3+(Math.abs(c-4.5)<2.5?2:0)}
   v+=sign*x}
  return v}
 const aiGame={turn:s=>s.res?-1:s.cur,legalMoves:(s)=>s.res?[]:genCached(s),apply:(s,m,t)=>raw(s,m,t,false),result:s=>s.res};
 /* Quiescence : une position où le trait a une prise obligatoire est prolongée. */
 const extend=s=>{if(s.res)return false;const m=genCached(s);return m.length>0&&m[0].captures.length>0};
 function chooseMove(v,seat,opts){
  const p=AI.levelParams(opts),moves=legalMoves(v,seat);
  if(!moves.length)return null;
  if(p.blunder&&p.rng()<p.blunder)return moves[Math.floor(p.rng()*moves.length)];
  v=core.clone(v);   /* copie propre : le cache interne ne doit jamais servir un objet fourni par l'appelant */
  const r=AI.alphabeta(aiGame,v,seat,{depth:Math.min(p.depth,12),budgetMs:p.budgetMs,rng:p.rng,evaluate,extend});
  return r.move?core.clone(r.move):moves[0]}

 function notation(st,move){
  if(!move||!sq(move.from)||!sq(move.to))return '?';
  if(!move.captures||!move.captures.length)return move.from+'-'+move.to;
  const legal=st.res?[]:genMoves(st,st.cur);
  const dup=legal.filter(m=>m.from===move.from&&m.to===move.to).length>1;
  return dup&&move.path?move.from+'x'+move.path.join('x'):move.from+'x'+move.to}

 return {id:'dames',name:'Dames internationales',minPlayers:2,maxPlayers:2,init,turn,legalMoves,apply,result,view,chooseMove,notation}});
