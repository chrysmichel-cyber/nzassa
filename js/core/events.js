/* Bus d'événements interne : léger, sans dépendance, sans accès au DOM (navigateur + Node).
   Sert de colonne vertébrale au futur moteur de quêtes : le jeu publie des faits (« on a parlé à un PNJ », « un mot est appris »),
   les systèmes intéressés s'abonnent. Un abonné qui plante ne bloque jamais les autres ; les émissions imbriquées sont bornées. */
(function(root,factory){const m=factory();if(typeof module==='object'&&module.exports)module.exports=m;else{root.LCA=root.LCA||{};root.LCA.events=m}})(typeof window!=='undefined'?window:this,function(){
'use strict';

/* Noms d'événements conventionnels (convention, pas une obligation : un nom libre reste accepté). */
const NAMES=Object.freeze({
 NPC_TALK:'npc:talk',PLACE_ENTER:'place:enter',WORD_LEARNED:'word:learned',QUIZ_ANSWER:'quiz:answer',
 ITEM_FOUND:'item:found',DIALOGUE_CHOICE:'dialogue:choice',
 QUEST_STARTED:'quest:started',QUEST_STEP:'quest:step',QUEST_DONE:'quest:done'
});
const MAX_DEPTH=16;

function create(opts){
 opts=opts||{};
 const onError=typeof opts.onError==='function'?opts.onError:null;
 const lists=new Map(),any=[];
 let depth=0;

 const report=(e,name)=>{if(onError){try{onError(e,name)}catch(_){}}};
 const listFor=n=>{let l=lists.get(n);if(!l){l=[];lists.set(n,l)}return l};
 function remove(rec){rec.on=false;const i=rec.list.indexOf(rec);if(i>=0)rec.list.splice(i,1)}
 function add(list,fn,once){
  if(typeof fn!=='function')throw new TypeError('Un abonné doit être une fonction.');
  const rec={fn,once:!!once,on:true,list};list.push(rec);return()=>remove(rec);
 }
 function checkName(n){if(typeof n!=='string'||!n)throw new TypeError('Le nom d’un événement est une chaîne non vide.')}

 const api={
  /* Renvoie une fonction de désabonnement. */
  on(name,fn){checkName(name);return add(listFor(name),fn,false)},
  once(name,fn){checkName(name);return add(listFor(name),fn,true)},
  /* Reçoit tous les événements : fn(payload, name). */
  onAny(fn){return add(any,fn,false)},
  off(name,fn){const l=lists.get(name);if(!l)return;l.slice().forEach(r=>{if(r.fn===fn)remove(r)})},
  /* Publie un événement. Renvoie le nombre d'abonnés appelés. */
  emit(name,payload){
   checkName(name);
   if(depth>=MAX_DEPTH){report(new Error('Émissions imbriquées trop profondes : '+name),name);return 0}
   const targets=(lists.get(name)||[]).slice().concat(any.slice());
   let n=0;depth++;
   try{
    for(const rec of targets){
     if(!rec.on)continue;
     if(rec.once)remove(rec);
     n++;
     try{rec.fn(payload,name)}catch(e){report(e,name)}
    }
   }finally{depth--}
   return n;
  },
  count(name){return(lists.get(name)||[]).length},
  clear(name){if(name===undefined){lists.forEach(l=>l.slice().forEach(remove));any.slice().forEach(remove)}else{(lists.get(name)||[]).slice().forEach(remove)}}
 };
 return api;
}
return {create,NAMES,MAX_DEPTH};
});
