/* Réserve de questions du quiz (partagée serveur / navigateur : même code, mêmes questions).
   - catégorie « langues » : questions du moteur de leçons (LCA.quiz.allQuestions) pour la langue du village ;
   - autres catégories : LCA.quizCats, remplies par les fichiers js/data/quiz/cats/*.js (1 fichier = 1 catégorie ; aucun changement de moteur pour en ajouter).
   Format normalisé d'une question tirée : {id, cat, prompt, text, options:[{id,text}], answer, explanation, difficulty, validation}. */
(function(root,f){root.LCA=root.LCA||{};root.LCA.quizPool=f(root.LCA)})(typeof self!=='undefined'?self:this,function(LCA){
 const IDS=['a','b','c','d'];
 const generic=new Map(),langCache=new Map();let loaded=0;
 function sync(){/* (re)lit LCA.quizCats : les fichiers de catégories peuvent se charger après ce module */
  const cats=LCA.quizCats||[];if(loaded===cats.length&&generic.size===cats.length)return;generic.clear();
  cats.forEach(c=>{
   if(!c.id||!Array.isArray(c.questions))throw new Error('catégorie de quiz invalide');
   if(generic.has(c.id)||c.id==='langues')throw new Error('catégorie en double : '+c.id);
   generic.set(c.id,{id:c.id,name:c.name||c.id,validation:c.validation||'brouillon',source:c.source||'',questions:c.questions.map(q=>{
    if(!q.id||!q.prompt||!q.right||!Array.isArray(q.wrong)||q.wrong.length!==3)throw new Error('question invalide : '+(q.id||'?'));
    if(new Set([q.right].concat(q.wrong)).size!==4)throw new Error('propositions identiques : '+q.id);
    return {id:c.id+':'+q.id,cat:c.id,prompt:q.prompt,text:'',right:q.right,wrong:q.wrong.slice(),explanation:q.explanation||'',difficulty:q.difficulty||1,villages:q.villages||null,validation:q.validation||c.validation||'brouillon'}})})});
  loaded=cats.length}
 function langQuestions(village){
  if(langCache.has(village))return langCache.get(village);
  const L=LCA.langs&&LCA.langs[village];let out=[];
  if(L&&LCA.quiz){const m=LCA.quiz.allQuestions(Object.assign({id:village},L));
   out=Object.keys(m).sort().map(k=>m[k]).map(q=>{const right=q.options.find(x=>x.id===q.answer);return {id:'langues:'+q.id,cat:'langues',prompt:q.prompt,text:q.text||'',right:right.text,wrong:q.options.filter(x=>x.id!==q.answer).map(x=>x.text),explanation:q.explanation||'',difficulty:q.difficulty||1,villages:[village],validation:q.validation||'brouillon'}})}
  langCache.set(village,out);return out}
 const categoryIds=()=>{sync();return ['langues'].concat([...generic.keys()])};
 const categoryName=id=>{sync();return id==='langues'?'Langues africaines':(generic.get(id)||{}).name||id};
 const hasVillage=v=>!!(LCA.langs&&LCA.langs[v]);
 function pool(village,cat){sync();if(cat==='langues')return langQuestions(village);const g=generic.get(cat);return g?g.questions.filter(q=>!q.villages||q.villages.includes(village)):[]}
 /* Tirage de `count` questions avec un rng injecté (déterministe en test). Par défaut : mélange équilibré de toutes les catégories disponibles ;
    `cat` impose une seule catégorie. Les propositions sont mélangées ici, une seule fois : tous les joueurs d'un duel reçoivent le même ordre. */
 function pick({village,count,rng,cat}){
  if(!hasVillage(village))throw new Error('village inconnu');
  const shuffle=a=>{a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
  let cats=(cat?[cat]:categoryIds()).filter(c=>pool(village,c).length>0);
  if(!cats.length)throw new Error('aucune question disponible');
  cats=shuffle(cats);const picked=[],left=new Map(cats.map(c=>[c,shuffle(pool(village,c))]));
  let i=0,guard=0;
  while(picked.length<count&&guard++<count*cats.length*3){const c=cats[i++%cats.length],l=left.get(c);if(l.length)picked.push(l.pop())}
  if(picked.length<count)throw new Error('pas assez de questions ('+picked.length+'/'+count+')');
  return shuffle(picked).map(q=>{const opts=shuffle([q.right].concat(q.wrong));return {id:q.id,cat:q.cat,prompt:q.prompt,text:q.text,options:opts.map((t,k)=>({id:IDS[k],text:t})),answer:IDS[opts.indexOf(q.right)],explanation:q.explanation,difficulty:q.difficulty,validation:q.validation}})}
 const forClient=(q,i)=>({i,id:q.id,cat:q.cat,catName:categoryName(q.cat),prompt:q.prompt,text:q.text,options:q.options});
 return {pick,pool,categoryIds,categoryName,hasVillage,forClient,stats:()=>{sync();return {categories:categoryIds().length,generic:[...generic.values()].map(g=>({id:g.id,n:g.questions.length}))}}}});
