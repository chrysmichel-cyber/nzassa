/* Schémas et validateurs des données de contenu : quêtes, dialogues, personnages (module pur, navigateur + Node).
   Le contenu vit dans des « paquets » de données, indépendants du moteur ; ce module dit seulement si un paquet est bien formé.
   Honnêteté culturelle, appliquée par le validateur :
   - chaque quête déclare un statut culturel ; « valide » ou « publie » exige des sources, « fictif » exige une note qui l'explique ;
   - un mot enseigné doit exister dans les données de langues (quand elles sont fournies) : aucune traduction n'est inventée ;
   - aucun texte ne peut contenir de balise HTML (le jeu injecte du texte via innerHTML à plusieurs endroits). */
(function(root,factory){const m=factory();if(typeof module==='object'&&module.exports)module.exports=m;else{root.LCA=root.LCA||{};root.LCA.questSchema=m}})(typeof window!=='undefined'?window:this,function(){
'use strict';

const KINDS=['decouverte','exploration','rencontre','apprentissage','transmission_orale','recette','patrimoine','probleme'];
const TIERS=['principale','secondaire','optionnelle'];
const STATUS=['fictif','brouillon','verification','valide','publie'];
const NPC_STATES=['idle','work','walk','sit','talk','sleep'];
const ID_RE=/^[a-z0-9][a-z0-9_-]{1,47}$/;
const TAG_RE=/<[a-z\/!?]/i;
const LIM={title:80,desc:600,text:600,short:200,steps:30,objectives:10,rewards:10,nodes:200,choices:6,effects:8,routine:12};

/* Gabarits : type → champs attendus. « ? » en fin de clé = facultatif. id = identifiant, str = texte, num = entier ≥ 1. */
const COND_SPEC={flag:{key:'id'},quest_done:{quest:'id'},quest_active:{quest:'id'},lang:{lang:'id'},xp_min:{amount:'num'},words_min:{amount:'num'}};
const OBJ_SPEC={talk:{target:'id'},visit:{target:'id'},learn_word:{lang:'id',word:'str'},answer_correct:{count:'num'},collect:{target:'id','count?':'num'},event:{name:'str'}};
const REWARD_SPEC={xp:{amount:'num'},word:{lang:'id',word:'str'},unlock:{key:'id'},badge:{id:'id'},item:{id:'id'}};
const EFFECT_SPEC={set_flag:{key:'id'},learn_word:{lang:'id',word:'str'},give_xp:{amount:'num'},emit:{name:'str'},start_quest:{quest:'id'}};

function Rep(){const r={errors:[],warnings:[],err(p,m){r.errors.push(p+' : '+m)},warn(p,m){r.warnings.push(p+' : '+m)}};return r}
const isObj=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
const isId=x=>typeof x==='string'&&ID_RE.test(x);

/* Texte affichable : chaîne non vide, bornée, sans balise. */
function text(r,p,v,max,required){
 if(v===undefined||v===null||v===''){if(required)r.err(p,'texte manquant');return false}
 if(typeof v!=='string'){r.err(p,'doit être un texte');return false}
 if(v.length>max)r.err(p,'trop long ('+v.length+' > '+max+')');
 if(TAG_RE.test(v))r.err(p,'balise HTML interdite dans un texte');
 return true;
}
function id(r,p,v){if(!isId(v)){r.err(p,'identifiant invalide (minuscules, chiffres, _ et -, 2 à 48 caractères)');return false}return true}

/* Vérifie un objet {type,...} selon un gabarit. */
function typed(r,p,o,spec){
 if(!isObj(o)){r.err(p,'objet attendu');return false}
 if(!Object.prototype.hasOwnProperty.call(spec,o.type)){r.err(p,'type inconnu « '+o.type+' » (attendus : '+Object.keys(spec).join(', ')+')');return false}
 const fields=spec[o.type],known={type:1,id:1};
 for(const k of Object.keys(fields)){
  const opt=k.endsWith('?'),name=opt?k.slice(0,-1):k,kind=fields[k];known[name]=1;
  const v=o[name];
  if(v===undefined||v===null){if(!opt)r.err(p+'.'+name,'champ manquant');continue}
  if(kind==='id')id(r,p+'.'+name,v);
  else if(kind==='str')text(r,p+'.'+name,v,LIM.short,true);
  else if(kind==='num'&&!(Number.isInteger(v)&&v>=1&&v<=100000))r.err(p+'.'+name,'entier entre 1 et 100000 attendu');
 }
 Object.keys(o).forEach(k=>{if(!known[k]&&!(spec[o.type]['id']===undefined&&k==='id'))r.warn(p,'champ inconnu « '+k+' » ignoré')});
 return true;
}
function list(r,p,arr,min,max,each){
 if(arr===undefined||arr===null){if(min>0)r.err(p,'liste manquante');return}
 if(!Array.isArray(arr)){r.err(p,'liste attendue');return}
 if(arr.length<min||arr.length>max){r.err(p,'entre '+min+' et '+max+' éléments attendus (reçu '+arr.length+')');if(arr.length>max)return}
 arr.forEach((x,i)=>each(x,p+'['+i+']'));
}
/* Un mot enseigné existe-t-il dans les données de langues ? Sans données fournies, on ne peut pas le savoir : on laisse passer. */
function wordCheck(r,p,ctx,lang,word){
 if(!ctx||!ctx.langs||!isId(lang)||typeof word!=='string')return;
 const L=ctx.langs[lang];
 if(!L){r.err(p,'langue inconnue « '+lang+' »');return}
 if(!(L.words||[]).some(w=>w&&w[1]===word))r.err(p,'le mot « '+word+' » n’existe pas dans les données de « '+lang+' » (aucune traduction n’est inventée)');
}
function conds(r,p,arr,ctx){list(r,p,arr,0,10,(c,q)=>typed(r,q,c,COND_SPEC))}
function effects(r,p,arr,ctx){list(r,p,arr,0,LIM.effects,(e,q)=>{if(typed(r,q,e,EFFECT_SPEC)&&e.type==='learn_word')wordCheck(r,q,ctx,e.lang,e.word)})}

/* ---------- Quête ---------- */
function validateQuest(q,ctx){
 const r=Rep(),P='quête';
 if(!isObj(q)){r.err(P,'objet attendu');return done(r)}
 const p=P+' « '+(q.id||'?')+' »';
 id(r,p+'.id',q.id);
 text(r,p+'.title',q.title,LIM.title,true);text(r,p+'.description',q.description,LIM.desc,true);
 if(!KINDS.includes(q.kind))r.err(p+'.kind','type inconnu (attendus : '+KINDS.join(', ')+')');
 if(!TIERS.includes(q.tier))r.err(p+'.tier','catégorie inconnue (attendues : '+TIERS.join(', ')+')');
 if(q.repeatable!==undefined&&typeof q.repeatable!=='boolean')r.err(p+'.repeatable','booléen attendu');
 if(q.giver!==undefined)id(r,p+'.giver',q.giver);
 if(q.lang!==undefined&&q.lang!==null){id(r,p+'.lang',q.lang);if(ctx&&ctx.langs&&!ctx.langs[q.lang])r.err(p+'.lang','langue inconnue « '+q.lang+' »')}
 /* données culturelles associées */
 const c=q.culture;
 if(!isObj(c))r.err(p+'.culture','bloc « culture » obligatoire (statut, sources, note)');
 else{
  if(!STATUS.includes(c.status))r.err(p+'.culture.status','statut inconnu (attendus : '+STATUS.join(', ')+')');
  const src=Array.isArray(c.sources)?c.sources.filter(s=>typeof s==='string'&&s.trim()):[];
  if(c.sources!==undefined&&!Array.isArray(c.sources))r.err(p+'.culture.sources','liste attendue');
  if((c.status==='valide'||c.status==='publie')&&!src.length)r.err(p+'.culture.sources','un contenu « '+c.status+' » exige des sources : sans preuve, il reste « brouillon »');
  if((c.status==='brouillon'||c.status==='verification')&&!src.length)r.warn(p+'.culture.sources','aucune source renseignée');
  if(c.status==='fictif')text(r,p+'.culture.note',c.note,LIM.desc,true);
  else text(r,p+'.culture.note',c.note,LIM.desc,false);
  src.forEach((s,i)=>text(r,p+'.culture.sources['+i+']',s,LIM.short,true));
 }
 conds(r,p+'.start',q.start,ctx);
 /* étapes et objectifs */
 const stepIds=new Set(),objIds=new Set();
 list(r,p+'.steps',q.steps,1,LIM.steps,(s,sp)=>{
  if(!isObj(s)){r.err(sp,'objet attendu');return}
  if(id(r,sp+'.id',s.id)){if(stepIds.has(s.id))r.err(sp+'.id','étape en double « '+s.id+' »');stepIds.add(s.id)}
  text(r,sp+'.title',s.title,LIM.title,true);
  if(s.optional!==undefined&&typeof s.optional!=='boolean')r.err(sp+'.optional','booléen attendu');
  list(r,sp+'.objectives',s.objectives,1,LIM.objectives,(o,op)=>{
   if(!typed(r,op,o,OBJ_SPEC))return;
   if(!isId(o.id))r.err(op+'.id','identifiant d’objectif obligatoire');
   else{if(objIds.has(o.id))r.err(op+'.id','objectif en double « '+o.id+' »');objIds.add(o.id)}
   if(o.text!==undefined)text(r,op+'.text',o.text,LIM.short,false);
   if(o.type==='learn_word')wordCheck(r,op,ctx,o.lang,o.word);
  });
 });
 if(Array.isArray(q.steps)&&q.steps.length&&q.steps.every(s=>s&&s.optional===true))r.err(p+'.steps','au moins une étape doit être obligatoire');
 conds(r,p+'.success',q.success,ctx);
 list(r,p+'.rewards',q.rewards,0,LIM.rewards,(w,wp)=>{if(typed(r,wp,w,REWARD_SPEC)&&w.type==='word')wordCheck(r,wp,ctx,w.lang,w.word)});
 return done(r);
}

/* ---------- Dialogue à embranchements ---------- */
function validateDialogue(d,ctx){
 const r=Rep(),P='dialogue';
 if(!isObj(d)){r.err(P,'objet attendu');return done(r)}
 const p=P+' « '+(d.id||'?')+' »';
 id(r,p+'.id',d.id);if(d.npc!==undefined)id(r,p+'.npc',d.npc);
 if(!isObj(d.nodes)||!Object.keys(d.nodes).length){r.err(p+'.nodes','au moins un nœud attendu');return done(r)}
 const names=Object.keys(d.nodes);
 if(names.length>LIM.nodes){r.err(p+'.nodes','trop de nœuds ('+names.length+' > '+LIM.nodes+')');return done(r)}
 if(!names.includes(d.start))r.err(p+'.start','nœud de départ inconnu « '+d.start+' »');
 names.forEach(n=>{
  const np=p+'.nodes.'+n,node=d.nodes[n];
  if(!isId(n))r.err(np,'nom de nœud invalide');
  if(!isObj(node)){r.err(np,'objet attendu');return}
  text(r,np+'.text',node.text,LIM.text,true);
  if(node.speaker!==undefined&&node.speaker!=='npc'&&node.speaker!=='player')r.err(np+'.speaker','« npc » ou « player » attendu');
  const exits=(node.choices!==undefined?1:0)+(node.next!==undefined?1:0)+(node.end===true?1:0);
  if(exits!==1)r.err(np,'exactement une sortie attendue : « choices », « next » ou « end:true »');
  if(node.next!==undefined&&!names.includes(node.next))r.err(np+'.next','nœud inconnu « '+node.next+' »');
  list(r,np+'.teach',node.teach,0,LIM.effects,(t,tp)=>{
   if(!isObj(t)){r.err(tp,'objet attendu');return}
   id(r,tp+'.lang',t.lang);text(r,tp+'.word',t.word,LIM.short,true);wordCheck(r,tp,ctx,t.lang,t.word);
  });
  effects(r,np+'.effects',node.effects,ctx);
  list(r,np+'.choices',node.choices,1,LIM.choices,(c,cp)=>{
   if(!isObj(c)){r.err(cp,'objet attendu');return}
   text(r,cp+'.text',c.text,LIM.short,true);
   if(!names.includes(c.next))r.err(cp+'.next','nœud inconnu « '+c.next+' »');
   conds(r,cp+'.if',c.if,ctx);effects(r,cp+'.effects',c.effects,ctx);
  });
 });
 /* atteignabilité : toute branche doit pouvoir se terminer */
 if(names.includes(d.start)){
  const seen=new Set([d.start]),stack=[d.start];
  while(stack.length){const n=d.nodes[stack.pop()];if(!isObj(n))continue;
   const nx=[].concat(n.next!==undefined?[n.next]:[],Array.isArray(n.choices)?n.choices.map(c=>c&&c.next):[]);
   nx.forEach(t=>{if(typeof t==='string'&&names.includes(t)&&!seen.has(t)){seen.add(t);stack.push(t)}})}
  names.filter(n=>!seen.has(n)).forEach(n=>r.warn(p+'.nodes.'+n,'nœud inatteignable depuis « '+d.start+' »'));
  if(![...seen].some(n=>isObj(d.nodes[n])&&d.nodes[n].end===true))r.err(p,'aucune fin atteignable : le dialogue ne peut pas se terminer');
 }
 return done(r);
}

/* ---------- Personnage (machine à états déterministe, routine par heures) ---------- */
function validateCharacter(c,ctx){
 const r=Rep(),P='personnage';
 if(!isObj(c)){r.err(P,'objet attendu');return done(r)}
 const p=P+' « '+(c.id||'?')+' »';
 id(r,p+'.id',c.id);text(r,p+'.name',c.name,40,true);text(r,p+'.role',c.role,60,true);
 if(c.dialogue!==undefined)id(r,p+'.dialogue',c.dialogue);
 if(c.village!==undefined)id(r,p+'.village',c.village);
 if(c.poi!==undefined)list(r,p+'.poi',c.poi,0,10,(x,xp)=>id(r,xp,x));
 const occ=new Array(24).fill(null);
 list(r,p+'.routine',c.routine,0,LIM.routine,(s,sp)=>{
  if(!isObj(s)){r.err(sp,'objet attendu');return}
  const okH=h=>Number.isInteger(h)&&h>=0&&h<=24;
  if(!okH(s.from)||!okH(s.to)||s.from===s.to){r.err(sp,'« from » et « to » : heures entières 0–24, différentes');return}
  if(!NPC_STATES.includes(s.state))r.err(sp+'.state','état inconnu (attendus : '+NPC_STATES.join(', ')+')');
  if(s.poi!==undefined)id(r,sp+'.poi',s.poi);
  for(let h=s.from%24,n=(s.to-s.from+24)%24||24,i=0;i<n;i++,h=(h+1)%24){
   if(occ[h]!==null){r.err(sp,'chevauche l’heure '+h+' h déjà prise par une autre plage');break}occ[h]=1}
 });
 return done(r);
}

/* ---------- Paquet complet + références croisées ---------- */
function validatePack(pack,ctx){
 const r=Rep();ctx=ctx||{};
 if(!isObj(pack)){r.err('paquet','objet attendu');return done(r)}
 if(!isId(pack.id))r.err('paquet.id','identifiant invalide');
 if(pack.version!==1)r.err('paquet.version','version 1 attendue');
 const qs=pack.quests||[],ds=pack.dialogues||[],cs=pack.characters||[];
 [['quests',qs],['dialogues',ds],['characters',cs]].forEach(([k,a])=>{if(!Array.isArray(a))r.err('paquet.'+k,'liste attendue')});
 if(!Array.isArray(qs)||!Array.isArray(ds)||!Array.isArray(cs))return done(r);
 const merge=x=>{x.errors.forEach(e=>r.errors.push(e));x.warnings.forEach(w=>r.warnings.push(w))};
 qs.forEach(q=>merge(validateQuest(q,ctx)));ds.forEach(d=>merge(validateDialogue(d,ctx)));cs.forEach(c=>merge(validateCharacter(c,ctx)));
 const ids=a=>a.filter(isObj).map(x=>x.id);
 const dup=(label,a)=>{const s=new Set();a.forEach(i=>{if(s.has(i))r.err('paquet.'+label,'identifiant en double « '+i+' »');s.add(i)})};
 dup('quests',ids(qs));dup('dialogues',ids(ds));dup('characters',ids(cs));
 const Q=new Set(ids(qs).concat(ctx.questIds||[])),D=new Set(ids(ds).concat(ctx.dialogueIds||[])),C=new Set(ids(cs).concat(ctx.npcIds||[]));
 const knowNpc=C.size>0;
 qs.filter(isObj).forEach(q=>{
  const p='quête « '+q.id+' »';
  if(q.giver&&knowNpc&&!C.has(q.giver))r.err(p+'.giver','personnage inconnu « '+q.giver+' »');
  const refs=[].concat(q.start||[],q.success||[]).filter(isObj);
  refs.forEach(c=>{if((c.type==='quest_done'||c.type==='quest_active')&&!Q.has(c.quest))r.err(p,'quête référencée inconnue « '+c.quest+' »')});
  [].concat(...(Array.isArray(q.steps)?q.steps:[]).map(s=>s&&Array.isArray(s.objectives)?s.objectives:[])).filter(isObj).forEach(o=>{if(o.type==='talk'&&knowNpc&&!C.has(o.target))r.err(p,'objectif « talk » : personnage inconnu « '+o.target+' »')});
 });
 ds.filter(isObj).forEach(d=>{if(d.npc&&knowNpc&&!C.has(d.npc))r.err('dialogue « '+d.id+' »','personnage inconnu « '+d.npc+' »');
  Object.values(isObj(d.nodes)?d.nodes:{}).filter(isObj).forEach(n=>{[].concat(n.effects||[],...(Array.isArray(n.choices)?n.choices.map(c=>c&&c.effects||[]):[])).filter(isObj).forEach(e=>{if(e.type==='start_quest'&&!Q.has(e.quest))r.err('dialogue « '+d.id+' »','start_quest : quête inconnue « '+e.quest+' »')})})});
 cs.filter(isObj).forEach(c=>{if(c.dialogue&&!D.has(c.dialogue))r.err('personnage « '+c.id+' »','dialogue inconnu « '+c.dialogue+' »')});
 /* cycle de prérequis : A exige B qui exige A ne pourrait jamais démarrer */
 const pre={};qs.filter(isObj).forEach(q=>{pre[q.id]=[].concat(q.start||[]).filter(c=>isObj(c)&&c.type==='quest_done').map(c=>c.quest)});
 const state={};
 const visit=(n,path)=>{if(state[n]===2)return;if(state[n]===1){r.err('paquet.quests','prérequis circulaire : '+path.concat(n).join(' → '));return}
  state[n]=1;(pre[n]||[]).forEach(m=>{if(pre[m])visit(m,path.concat(n))});state[n]=2};
 Object.keys(pre).forEach(n=>visit(n,[]));
 return done(r);
}
function done(r){return {ok:r.errors.length===0,errors:r.errors,warnings:r.warnings}}

return {validateQuest,validateDialogue,validateCharacter,validatePack,KINDS,TIERS,STATUS,NPC_STATES,COND_SPEC,OBJ_SPEC,REWARD_SPEC,EFFECT_SPEC,LIM};
});
