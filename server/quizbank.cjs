/* Banque de questions du quiz, côté serveur : charge les MÊMES fichiers que le navigateur (js/data/**, js/quiz/pool.js) dans un bac à sable `vm`.
   Les bonnes réponses ne quittent JAMAIS le serveur : `forClient(q)` ne contient que l'énoncé et les propositions. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function createBank(o){
 o=o||{};const root=o.root||path.join(__dirname,'..');
 const w={};w.window=w;w.LCA={};w.btoa=btoa;w.atob=atob;w.TextEncoder=TextEncoder;vm.createContext(w);
 const run=f=>vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),w,{filename:f});
 run('js/data/common.js');
 fs.readdirSync(path.join(root,'js/data')).filter(f=>f.endsWith('.js')&&!['common.js','regions.js'].includes(f)).sort().forEach(f=>run('js/data/'+f));
 ['js/learn/quiz.js','js/data/quiz/curriculum.js','js/data/quiz/bank.js'].forEach(run);
 const catDir=path.join(root,'js/data/quiz/cats');
 if(fs.existsSync(catDir))fs.readdirSync(catDir).filter(f=>f.endsWith('.js')).sort().forEach(f=>run('js/data/quiz/cats/'+f));
 run('js/quiz/pool.js');
 const P=w.LCA.quizPool,villages=Object.keys(w.LCA.langs||{}).sort();
 P.stats();/* valide toutes les catégories au chargement : une catégorie mal formée empêche le démarrage au lieu de casser un match */
 return {pick:P.pick,forClient:P.forClient,categoryIds:P.categoryIds,categoryName:P.categoryName,hasVillage:P.hasVillage,villages:()=>villages,pool:P.pool,stats:()=>Object.assign({villages:villages.length},P.stats())}}
module.exports={createBank};
