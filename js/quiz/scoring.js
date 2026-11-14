/* Quiz du village : barème, compensation de latence, départage. Module PUR partagé par le serveur (qui fait autorité)
   et le navigateur (quiz solo local sans réseau, aperçu du barème). Aucune horloge ici : les durées sont passées en paramètre.

   FORMULES (toutes les durées en millisecondes) :
   - temps utile        u = max(0, brut − compensation)            brut = réception de la réponse − envoi de la question, mesurés sur l'horloge du SERVEUR
   - compensation       c = min(rttCapMs, médiane des RTT récents mesurés par le serveur)  (0 s'il y a moins de minRttSamples mesures)
   - réponse tardive    si u > timeMs → réponse comptée comme absente (0 point, temps = timeMs)
   - bonne réponse      points = base + round(bonusMax × clamp(1 − u / bonusWindowMs, 0, 1))
   - mauvaise / absente 0 point
   - temps total        somme des u (une question sans réponse ou tardive compte timeMs ; une mauvaise réponse compte son u)
   - départage          score décroissant, puis temps total croissant ; égalité parfaite = nul (duel) / ancienneté (classement). */
(function(root,f){if(typeof module==='object'&&module.exports)module.exports=f();else{root.LCA=root.LCA||{};root.LCA.quizScoring=f()}})(typeof self!=='undefined'?self:this,function(){
 const DEFAULTS=Object.freeze({questions:10,timeMs:15000,base:100,bonusMax:50,bonusWindowMs:8000,revealMs:2500,countdownMs:3000,rttCapMs:300,minRttSamples:3,rttWindow:5,graceMs:250,disconnectGraceMs:20000,inviteTtlMs:30000,teacherRadius:10});
 const NUM_BOUNDS={questions:[1,30],timeMs:[2000,120000],base:[0,10000],bonusMax:[0,10000],bonusWindowMs:[1,120000],revealMs:[0,15000],countdownMs:[0,10000],rttCapMs:[0,1000],minRttSamples:[1,10],rttWindow:[1,20],graceMs:[0,2000],disconnectGraceMs:[2000,120000],inviteTtlMs:[3000,120000],teacherRadius:[2,40]};
 /* Fusionne une configuration partielle avec les valeurs par défaut ; toute valeur hors bornes ou non numérique est refusée (erreur explicite). */
 function config(over){const c=Object.assign({},DEFAULTS);
  Object.keys(over||{}).forEach(k=>{if(!(k in DEFAULTS))throw new Error('barème : paramètre inconnu « '+k+' »');
   const v=Number(over[k]);const b=NUM_BOUNDS[k];if(!Number.isFinite(v)||v<b[0]||v>b[1])throw new Error('barème : « '+k+' » doit être entre '+b[0]+' et '+b[1]);c[k]=Math.round(v)});
  return Object.freeze(c)}
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 function median(a){if(!a.length)return 0;const s=a.slice().sort((x,y)=>x-y),m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2}
 /* Compensation de latence à partir des seules mesures du serveur (jamais d'une valeur annoncée par le client). */
 function compensation(cfg,samples){const s=(samples||[]).filter(x=>Number.isFinite(x)&&x>=0).slice(-cfg.rttWindow);if(s.length<cfg.minRttSamples)return 0;return Math.round(Math.min(cfg.rttCapMs,median(s)))}
 const usefulMs=(rawMs,compMs)=>Math.max(0,Math.round(rawMs-compMs));
 /* Résultat d'une question : {ok, points, ms (temps retenu), late}. choice=null : pas de réponse. */
 function judge(cfg,{correct,rawMs,compMs}){
  if(rawMs==null)return {ok:false,points:0,ms:cfg.timeMs,late:false,none:true};
  const u=usefulMs(rawMs,compMs||0);
  if(u>cfg.timeMs)return {ok:false,points:0,ms:cfg.timeMs,late:true,none:true};
  if(!correct)return {ok:false,points:0,ms:u,late:false,none:false};
  const bonus=Math.round(cfg.bonusMax*clamp(1-u/cfg.bonusWindowMs,0,1));
  return {ok:true,points:cfg.base+bonus,ms:u,bonus,late:false,none:false}}
 const maxPoints=cfg=>cfg.questions*(cfg.base+cfg.bonusMax);
 /* Comparateur de classement : négatif si a est meilleur que b. */
 function compare(a,b){if(a.score!==b.score)return b.score-a.score;if(a.timeMs!==b.timeMs)return a.timeMs-b.timeMs;return (a.at||0)-(b.at||0)}
 /* Duel : 'a', 'b' ou 'draw' (score ET temps total identiques). */
 function duel(a,b){if(a.score!==b.score)return a.score>b.score?'a':'b';if(a.timeMs!==b.timeMs)return a.timeMs<b.timeMs?'a':'b';return 'draw'}
 /* Emplacements physiques (mêmes coordonnées dans les rendus 2D et 3D et sur le serveur) : l'enseignant (école) et le mur des champions. */
 const TEACHER=Object.freeze({x:30,z:-22}),WALL=Object.freeze({x:38.5,z:-22.5}),RANKED_QUESTIONS=10;
 return {DEFAULTS,TEACHER,WALL,RANKED_QUESTIONS,config,compensation,usefulMs,judge,compare,duel,maxPoints,median}});
