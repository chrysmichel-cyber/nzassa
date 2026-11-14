/* Dessin du paquet N'Zassa (js/games/ui/cards.js) : SVG bien formés, accessibles, distincts, cohérents avec deck.js. node --test tests/games-cards-ui.test.cjs */
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const deck=require('../js/games/rules/deck.js');
const root=path.join(__dirname,'..');
function load(doc){const w={LCA:{}};w.self=w;if(doc)w.document=doc;vm.createContext(w);vm.runInContext(fs.readFileSync(path.join(root,'js/games/ui/cards.js'),'utf8'),w,{filename:'cards.js'});return w}
const W=load(),C=W.LCA.gameUI.cards;
/* contrôle XML minimal : chaque balise ouvrante a sa fermante, dans l'ordre ; attributs entre guillemets ; pas de « < » nu */
function wellFormed(x){
 const re=/<(\/?)([a-zA-Z][\w:-]*)((?:\s+[\w:-]+="[^"<]*")*)\s*(\/?)>/g,stack=[];let m,last=0;
 while((m=re.exec(x))){if(/</.test(x.slice(last,m.index)))return 'texte avec < avant '+m[0];last=re.lastIndex;
  if(m[1]){if(stack.pop()!==m[2])return 'fermeture inattendue '+m[2]}else if(!m[4])stack.push(m[2])}
 if(/</.test(x.slice(last)))return 'balise non reconnue';return stack.length?'non fermé : '+stack.join(','):null}
const pips=x=>(x.match(/<g transform="translate/g)||[]).length;

test('cartes : les 52 cartes donnent un SVG bien formé, avec viewBox et nom accessible', ()=>{
 for(const c of deck.full()){const s=C.svg(c);assert.equal(wellFormed(s),null,c);
  assert.match(s,/^<svg class="gc-svg" viewBox="0 0 100 140"/);assert.ok(s.includes('role="img"'));
  assert.ok(s.includes('aria-label="'+deck.name(c).replace(/'/g,'&#39;')+'"'),'nom : '+c)}});
test('cartes : 52 dessins tous différents ; dos distinct de toutes les faces', ()=>{
 const set=new Set(deck.full().map(c=>C.svg(c)));assert.equal(set.size,52);assert.ok(!set.has(C.back()))});
test('cartes : nombre de symboles = valeur (2 à 10) + 2 symboles de coin ; figures avec symbole central', ()=>{
 for(const s of deck.SUITS){
  for(let v=2;v<=10;v++)assert.equal(pips(C.svg(v+s)),v+2,v+s);
  for(const r of ['V','D','R','A'])assert.equal(pips(C.svg(r+s)),3,r+s)}});
test('cartes : couleur et forme propres à chaque famille (pas la couleur seule)', ()=>{
 const shapes=new Set(),cols=new Set();
 for(const s of deck.SUITS){const x=C.util.symSvg(s,20);assert.equal(wellFormed(x),null);shapes.add(x.replace(/#[0-9a-f]{6}/gi,''));cols.add(C.util.SUIT_COL[s])}
 assert.equal(shapes.size,4,'4 formes différentes même sans couleur');assert.equal(cols.size,4)});
test('cartes : noms identiques à deck.js ; tri et ordre identiques', ()=>{
 for(const c of deck.full()){assert.equal(C.util.name(c),deck.name(c));assert.equal(C.util.order(c),deck.order(c))}
 const sh=deck.full().slice().reverse();assert.deepEqual(sh.slice().sort(C.util.cmp),sh.slice().sort(deck.cmp))});
test('cartes : carte inconnue → dos ; dos accessible ; options échappées', ()=>{
 for(const bad of [null,undefined,'','1T','11E','AZ','A',42,{}])assert.equal(C.svg(bad),C.back());
 const b=C.back();assert.equal(wellFormed(b),null);assert.ok(b.includes('aria-label="Dos de carte N&#39;Zassa"')||b.includes('aria-label="Dos de carte N’Zassa"'));
 const h=C.svg('AS',{hidden:true,cls:'x"><script>',w:'5em"onload="x'});assert.equal(wellFormed(h),null);assert.ok(h.includes('aria-hidden="true"'));
 assert.ok(!h.includes('<script'));assert.ok(!h.includes('"onload'));assert.ok(h.includes('style="width:5em&quot;onload=&quot;x"'))});
test('cartes : SVG sans identifiant (aucune collision quand 52 cartes sont dans la page)', ()=>{
 for(const c of deck.full())assert.ok(!/\sid="/.test(C.svg(c)),c)});
test('cartes : resultText', ()=>{
 const t=C.util.resultText;assert.equal(t(null,0),'');assert.equal(t({draw:true,winners:[]},0),'Partie nulle.');
 assert.equal(t({winners:[1]},1),'Victoire !');assert.equal(t({winners:[1]},0),'Défaite.');assert.match(t({winners:[0,2]},null),/Joueur 1 et Joueur 3/)});
test('cartes : ensureCss ajoute une seule feuille, et le fichier existe', ()=>{
 const added=[];const doc={styleSheets:[],head:{appendChild:l=>added.push(l)},querySelector:sel=>added.find(l=>sel==='link[data-gc]'&&l.attrs['data-gc'])||null,
  createElement:()=>({attrs:{},setAttribute(k,v){this.attrs[k]=v}})};
 const w=load(doc);w.LCA.gameUI.cards.ensureCss();w.LCA.gameUI.cards.ensureCss();assert.equal(added.length,1);assert.equal(added[0].href,'css/games-cards.css');
 assert.ok(fs.existsSync(path.join(root,'css/games-cards.css')),'css/games-cards.css doit exister')});
