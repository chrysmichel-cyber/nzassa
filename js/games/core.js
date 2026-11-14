/* Cadre commun des jeux de société : registre, erreurs de règles, utilitaires purs, tables du village.
   Module pur (navigateur + Node) : aucun DOM, aucun réseau. Les règles de chaque jeu vivent dans js/games/rules/<id>.js. */
(function(root,f){if(typeof module==='object'&&module.exports)module.exports=f();else{root.LCA=root.LCA||{};root.LCA.games=f();root.LCA.gameUI=root.LCA.games.ui}})(typeof self!=='undefined'?self:this,function(){
 class RuleError extends Error{constructor(code,msg){super(msg||code);this.code=code;this.name='RuleError'}}
 const defs=new Map(),uis=new Map();
 const REQUIRED=['id','name','minPlayers','maxPlayers','init','turn','legalMoves','apply','result','view','chooseMove'];
 function register(def){
  for(const k of REQUIRED)if(def[k]===undefined)throw new Error('jeu « '+(def.id||'?')+' » : champ manquant '+k);
  defs.set(def.id,def);return def}
 const get=id=>defs.get(id)||null,list=()=>[...defs.values()];
 /* Générateur pseudo-aléatoire déterministe (tests, rejeu). En production le serveur fournit un rng cryptographique. */
 function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
 function shuffle(arr,rng){const a=arr.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
 const clone=o=>JSON.parse(JSON.stringify(o));
 const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 /* Vérifie qu'un coup figure dans la liste des coups légaux ; renvoie le coup canonique (celui de la liste), jamais l'objet reçu. */
 function pick(moves,move){if(move===null||typeof move!=='object')return null;for(const m of moves)if(same(m,move))return m;return null}
 /* Tables physiques du village. x,z : position (mêmes coordonnées dans les deux rendus) ; r : rayon d'interaction ; seats : sièges.
    Zone « place des jeux » choisie hors des huttes de toutes les régions (vérifié par test). */
 const TABLES=[
  {id:'awale1',game:'awale',name:'Table d’Awalé 1',x:12,z:34,r:3.4},
  {id:'awale2',game:'awale',name:'Table d’Awalé 2',x:18,z:34,r:3.4},
  {id:'dames1',game:'dames',name:'Table de Dames 1',x:24,z:34,r:3.4},
  {id:'dames2',game:'dames',name:'Table de Dames 2',x:30,z:34,r:3.4},
  {id:'echecs1',game:'echecs',name:'Table d’Échecs 1',x:12,z:40,r:3.4},
  {id:'echecs2',game:'echecs',name:'Table d’Échecs 2',x:18,z:40,r:3.4},
  {id:'cartes1',game:'cartes',name:'Table de cartes 1',x:24,z:40,r:3.4},
  {id:'cartes2',game:'cartes',name:'Table de cartes 2',x:30,z:40,r:3.4}];
 /* Jeux de cartes jouables à une table « cartes » (le choix se fait à l'assise). */
 const CARD_GAMES=['bataille','menteur','belote'];
 const tableById=id=>TABLES.find(t=>t.id===id)||null;
 const ui={register(id,r){uis.set(id,r)},get(id){return uis.get(id)||null}};
 return {RuleError,register,get,list,mulberry32,shuffle,clone,same,pick,TABLES,CARD_GAMES,tableById,ui}});
