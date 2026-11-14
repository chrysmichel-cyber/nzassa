/* Stockage des classements du quiz, isolé derrière une interface : le moteur (server/quiz.cjs) n'en connaît que ces méthodes.
     submit(village, {uid,name,score,timeMs,matchId,at}) -> {duplicate, improved, rank, top}
     top(village, n)    -> [{rank,name,score,timeMs}]        (jamais d'identifiant de compte dans le résultat)
     best(village, uid) -> {score,timeMs,rank} | null
     flush(), close(), describe()
   Deux implémentations : mémoire (tests) et fichier JSON.
   FICHIER JSON — PROVISOIRE : écriture atomique (fichier temporaire + fsync + renommage), copie de secours .bak du fichier précédent,
   somme de contrôle SHA-256 à la lecture, reprise sur la copie de secours si le fichier principal est corrompu.
   ATTENTION : sur Render gratuit le disque est éphémère : les scores disparaissent à chaque redéploiement ou redémarrage à froid.
   Pour migrer vers un stockage persistant (base SQL, disque payant), il suffit d'écrire une autre classe qui respecte l'interface ci-dessus. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const SCHEMA=1,MAX_PLAYERS=5000,MAX_MATCH_IDS=2000;
const cmp=(a,b)=>a.score!==b.score?b.score-a.score:a.timeMs!==b.timeMs?a.timeMs-b.timeMs:a.at-b.at;
const emptyData=()=>({v:SCHEMA,villages:{}});

/* Règles de classement, communes aux deux stockages : un joueur = une entrée ; un nouveau résultat ne remplace l'ancien que s'il est meilleur. */
function createCore(data,onChange){
 const village=id=>data.villages[id]||(data.villages[id]={players:{},matches:[]});
 const ranked=v=>Object.values(v.players).sort(cmp);
 const pub=(e,i)=>({rank:i+1,name:e.name,score:e.score,timeMs:e.timeMs});
 return {
  submit(vid,e){
   if(!vid||!e||!e.uid||!e.matchId||!Number.isInteger(e.score)||!Number.isInteger(e.timeMs)||e.score<0||e.timeMs<0)throw new Error('résultat invalide');
   const v=village(vid);
   if(v.matches.includes(e.matchId))return {duplicate:true,improved:false,rank:this.rankOf(vid,e.uid),top:this.top(vid,10)};
   v.matches.push(e.matchId);if(v.matches.length>MAX_MATCH_IDS)v.matches.splice(0,v.matches.length-MAX_MATCH_IDS);
   const cur=v.players[e.uid],cand={uid:e.uid,name:String(e.name||'').slice(0,40),score:e.score,timeMs:e.timeMs,at:e.at||Date.now(),matchId:e.matchId};
   let improved=false;
   if(!cur){v.players[e.uid]=cand;improved=true}
   else if(cmp(cand,cur)<0){/* strictement meilleur (score, puis temps) : l'ancienne date d'obtention n'est pas conservée */v.players[e.uid]=cand;improved=true}
   else cur.name=cand.name;/* le pseudo affiché reste à jour */
   const n=Object.keys(v.players).length;
   if(n>MAX_PLAYERS){ranked(v).slice(MAX_PLAYERS).forEach(x=>{delete v.players[x.uid]})}
   onChange();
   return {duplicate:false,improved,rank:this.rankOf(vid,e.uid),top:this.top(vid,10)}},
  rankOf(vid,uid){const v=data.villages[vid];if(!v)return null;const i=ranked(v).findIndex(x=>x.uid===uid);return i<0?null:i+1},
  top(vid,n){const v=data.villages[vid];if(!v)return [];return ranked(v).slice(0,Math.max(1,Math.min(50,n||10))).map(pub)},
  best(vid,uid){const v=data.villages[vid],e=v&&v.players[uid];if(!e)return null;return {score:e.score,timeMs:e.timeMs,rank:this.rankOf(vid,uid)}},
  count(vid){const v=data.villages[vid];return v?Object.keys(v.players).length:0}}}

function memoryStore(){
 const data=emptyData(),core=createCore(data,()=>{});
 return Object.assign(core,{async flush(){},async close(){},describe:()=>({kind:'mémoire',persistent:false}),_data:data})}

const sum=obj=>crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex');
function readValid(file){
 let raw;try{raw=fs.readFileSync(file,'utf8')}catch(e){return {missing:true}}
 try{const j=JSON.parse(raw);if(!j||j.data==null||sum(j.data)!==j.sum||j.data.v!==SCHEMA||typeof j.data.villages!=='object')return {corrupt:true};return {data:j.data}}catch(e){return {corrupt:true}}}

function fileStore(o){
 const dir=o.dir,file=path.join(dir,'quiz-scores.json'),bak=file+'.bak',log=o.log||(()=>{});
 fs.mkdirSync(dir,{recursive:true});
 let data=emptyData(),recovered=null;
 const a=readValid(file);
 if(a.data)data=a.data;
 else{const b=readValid(bak);
  if(b.data){data=b.data;recovered=a.corrupt?'sauvegarde':null;if(a.corrupt)log('quizstore : fichier principal corrompu, reprise depuis la copie .bak')}
  else if(a.corrupt||b.corrupt){log('quizstore : fichiers de scores corrompus et sans copie valide : départ à vide');recovered='vide'}}
 let dirty=false,writing=null,closed=false,failures=0;
 async function write(){
  const body=JSON.stringify({sum:sum(data),data}),tmp=file+'.'+process.pid+'.tmp';
  const fh=await fs.promises.open(tmp,'w');
  try{await fh.writeFile(body);await fh.sync()}finally{await fh.close()}
  try{await fs.promises.copyFile(file,bak)}catch(e){}/* copie de secours de la version précédente (absente au premier enregistrement) */
  await fs.promises.rename(tmp,file)}
 function persist(){
  dirty=true;if(writing||closed)return;
  writing=(async()=>{while(dirty){dirty=false;try{await write();failures=0}catch(e){failures++;log('quizstore : écriture impossible : '+e.message);dirty=failures<3}}})().finally(()=>{writing=null})}
 const core=createCore(data,persist);
 return Object.assign(core,{
  async flush(){while(writing||dirty){if(!writing)persist();await writing}},
  async close(){await this.flush();closed=true},
  describe:()=>({kind:'fichier JSON',persistent:'éphémère sur Render gratuit',file,recovered}),
  _data:data})}

module.exports={memoryStore,fileStore,cmp,SCHEMA};
