/* Paquet de 52 cartes original N'Zassa (décision utilisateur : 4 familles Terre, Eau, Soleil, Étoile × 13 rangs). Module pur (navigateur + Node), aucune dépendance.
   Familles : T Terre, E Eau, S Soleil, X Étoile (noms et symboles à faire valider culturellement ; aucune signification culturelle n'est affirmée).
   Rangs : 2 3 4 5 6 7 8 9 10 V(Valet) D(Dame) R(Roi) A(As). Une carte est la chaîne rang+famille : « 10T », « VS », « 2X ».
   La belote se joue avec le sous-ensemble 7 8 9 10 V D R A de chaque famille (BELOTE_RANKS : 32 cartes).
   Navigateur : exposé comme LCA.games.deck (core.js doit être chargé avant). Node : module.exports. */
(function(root,f){if(typeof module==='object'&&module.exports)module.exports=f();else{root.LCA=root.LCA||{};root.LCA.games=root.LCA.games||{};root.LCA.games.deck=f()}})(typeof self!=='undefined'?self:this,function(){
 const SUITS=['T','E','S','X'],RANKS=['2','3','4','5','6','7','8','9','10','V','D','R','A'],BELOTE_RANKS=['7','8','9','10','V','D','R','A'];
 const SUIT_NAMES={T:'Terre',E:'Eau',S:'Soleil',X:'Étoile'};
 const RANK_NAMES={'2':'Deux','3':'Trois','4':'Quatre','5':'Cinq','6':'Six','7':'Sept','8':'Huit','9':'Neuf','10':'Dix',V:'Valet',D:'Dame',R:'Roi',A:'As'};
 const RANK_PLURAL={'2':'Deux','3':'Trois','4':'Quatre','5':'Cinq','6':'Six','7':'Sept','8':'Huit','9':'Neuf','10':'Dix',V:'Valets',D:'Dames',R:'Rois',A:'As'};
 const card=(rank,suit)=>rank+suit;
 const isCard=c=>typeof c==='string'&&c.length>=2&&c.length<=3&&RANKS.includes(c.slice(0,-1))&&SUITS.includes(c.slice(-1));
 const rankOf=c=>c.slice(0,-1),suitOf=c=>c.slice(-1);
 const rankIndex=c=>RANKS.indexOf(rankOf(c));
 /* Ordre total fixe (famille puis rang) : sert de forme canonique et de tri d'affichage. */
 const order=c=>SUITS.indexOf(suitOf(c))*13+rankIndex(c);
 const cmp=(a,b)=>order(a)-order(b);
 const full=()=>{const a=[];for(const s of SUITS)for(const r of RANKS)a.push(card(r,s));return a};
 const belote32=()=>{const a=[];for(const s of SUITS)for(const r of BELOTE_RANKS)a.push(card(r,s));return a};
 const name=c=>RANK_NAMES[rankOf(c)]+' de '+SUIT_NAMES[suitOf(c)];
 /* Paquet complet mélangé par core.shuffle(arr,rng) (le mélange est fourni par l'appelant pour rester pur). */
 const shuffled=(core,rng)=>core.shuffle(full(),rng),shuffled32=(core,rng)=>core.shuffle(belote32(),rng);
 return {SUITS,RANKS,BELOTE_RANKS,belote32,shuffled32,SUIT_NAMES,RANK_NAMES,RANK_PLURAL,card,isCard,rankOf,suitOf,rankIndex,order,cmp,full,name,shuffled}});
