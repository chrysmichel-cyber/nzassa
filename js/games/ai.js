/* Aide d'IA générique pour jeux à information parfaite : minimax alpha-bêta avec approfondissement itératif,
   budget de temps strict, ordre des coups à la racine et tirage aléatoire parmi les coups de même valeur.
   Module pur (navigateur + Node) : aucun DOM, aucun réseau. Exposé en `LCA.gameAI` (navigateur) ou `module.exports` (Node).
   Le « jeu » passé à alphabeta n'a besoin que de : turn(state), legalMoves(state,seat), apply(state,move,seat) (sans validation
   nécessaire) et result(state). */
(function(root,f){if(typeof module==='object'&&module.exports)module.exports=f();else{root.LCA=root.LCA||{};root.LCA.gameAI=f()}})(typeof self!=='undefined'?self:this,function(){
 'use strict';
 const WIN=1000000;
 const now=()=>typeof performance!=='undefined'&&performance.now?performance.now():Date.now();
 const TIMEOUT={timeout:true};

 /* Paramètres par niveau : 1 = faible (parfois aléatoire, profondeur 1-2), 2 = profondeur ~4, 3 = le plus profond possible dans le budget. */
 function levelParams(opts){
  opts=opts||{};
  const lv=opts.level===1||opts.level===2||opts.level===3?opts.level:2;
  const rng=opts.rng||Math.random;
  const budgets={1:300,2:600,3:1200};
  const p={level:lv,
   depth:lv===1?(rng()<0.5?1:2):lv===2?4:24,
   blunder:lv===1?0.3:0,
   budgetMs:typeof opts.budgetMs==='number'&&opts.budgetMs>=0?opts.budgetMs:budgets[lv],rng};
  return p}

 /* Recherche du meilleur coup pour `seat` dans `state`.
    opts : depth (profondeur max), budgetMs (temps max, strict), rng, evaluate(state,seat)->nombre (du point de vue de seat),
           order(state,moves,seat)->moves (ordre interne facultatif), extend(state)->bool (prolonge d'un demi-coup une position instable).
    Renvoie {move,score,depth,nodes,ms} ; move vaut null s'il n'y a aucun coup. */
 function alphabeta(def,state,seat,opts){
  opts=opts||{};
  const t0=now(),rng=opts.rng||Math.random;
  const budget=typeof opts.budgetMs==='number'?opts.budgetMs:Infinity;
  const deadline=t0+budget;
  const maxDepth=Math.max(1,(opts.depth|0)||(budget<Infinity?64:3));
  const evalf=s=>Math.round(opts.evaluate?opts.evaluate(s,seat)||0:0);
  const moves=def.legalMoves(state,seat);
  if(!moves.length)return{move:null,score:0,depth:0,nodes:0,ms:0};
  if(moves.length===1)return{move:moves[0],score:0,depth:0,nodes:0,ms:now()-t0};
  let nodes=0,cut=false;
  /* L'horloge est lue tous les 32 nœuds : un dépassement lève TIMEOUT qui remonte jusqu'à la racine. */
  const tick=()=>{if((++nodes&31)===0&&now()>deadline)throw TIMEOUT};

  function search(s,depth,alpha,beta,ply){
   tick();
   const t=def.turn(s);
   if(t<0){const r=def.result(s);
    if(!r||r.draw||!r.winners||!r.winners.length)return 0;
    return r.winners.includes(seat)?WIN-ply:-(WIN-ply)}
   if(depth<=0){
    if(opts.extend&&ply<maxDepth*2+4&&opts.extend(s))depth=1;
    else{cut=true;return evalf(s)}}
   let ms=def.legalMoves(s,t);
   if(!ms.length)return evalf(s);
   if(opts.order)ms=opts.order(s,ms,t)||ms;
   if(t===seat){let v=-Infinity;
    for(const m of ms){const r=search(def.apply(s,m,t),depth-1,alpha,beta,ply+1);if(r>v)v=r;if(v>alpha)alpha=v;if(alpha>=beta)break}
    return v}
   let v=Infinity;
   for(const m of ms){const r=search(def.apply(s,m,t),depth-1,alpha,beta,ply+1);if(r<v)v=r;if(v<beta)beta=v;if(alpha>=beta)break}
   return v}

  let roots=moves.map(m=>({m,s:def.apply(state,m,seat),score:0}));
  if(opts.order){const o=opts.order(state,moves,seat);if(o&&o.length===moves.length)roots=o.map(m=>roots[moves.indexOf(m)])}
  let result=null;
  for(let d=1;d<=maxDepth;d++){
   if(result&&now()>deadline)break;
   cut=false;
   try{
    let best=-Infinity;
    for(const r of roots){
     /* fenêtre alpha = best-1 : les coups de même valeur que le meilleur ne sont pas élagués (scores entiers) */
     const v=search(r.s,d-1,best===-Infinity?-Infinity:best-1,Infinity,1);
     r.score=v;if(v>best)best=v}
    const ties=roots.filter(r=>r.score===best);
    result={move:ties[Math.floor(rng()*ties.length)].m,score:best,depth:d};
    roots.sort((a,b)=>b.score-a.score);
    if(best>=WIN-1000||best<=-(WIN-1000)||!cut)break;
   }catch(e){if(e!==TIMEOUT)throw e;break}
  }
  if(!result)result={move:moves[Math.floor(rng()*moves.length)],score:0,depth:0};
  result.nodes=nodes;result.ms=now()-t0;
  return result}

 return{alphabeta,levelParams,WIN}});
