/* Dessin partagé du paquet ORIGINAL N'Zassa (52 cartes) + petits utilitaires d'interface pour les jeux de cartes.
   Familles (reconnaissables par la FORME, jamais par la couleur seule) :
     T Terre = montagne à deux sommets · E Eau = goutte · S Soleil = disque à huit rayons · X Étoile = étoile à quatre branches.
   Figures sobres et originales : V Valet = fanion à queue d'hirondelle · D Dame = collier à pendentif · R Roi = couronne à trois pointes · A As = grand symbole dans un anneau.
   API : LCA.gameUI.cards = {svg(card,opts), back(opts), css, ensureCss(), util}
     svg('10T',{w:'64px',cls:'x',hidden:true})  -> chaîne SVG autonome (aucun CSS requis : couleurs en attributs)
     back({w,cls,hidden})                        -> dos de carte (motifs losanges/zigzag N'Zassa)
     css                                         -> chemin de la feuille de style ('css/games-cards.css') ; ensureCss() la lie au document si absente. */
(function(root){
 const LCA=root.LCA=root.LCA||{};LCA.gameUI=LCA.gameUI||{};
 const SUITS=['T','E','S','X'],RANKS=['2','3','4','5','6','7','8','9','10','V','D','R','A'];
 const SUIT_NAMES={T:'Terre',E:'Eau',S:'Soleil',X:'Étoile'};
 const RANK_NAMES={'2':'Deux','3':'Trois','4':'Quatre','5':'Cinq','6':'Six','7':'Sept','8':'Huit','9':'Neuf','10':'Dix',V:'Valet',D:'Dame',R:'Roi',A:'As'};
 const SUIT_COL={T:'#7a3a12',E:'#0b6b86',S:'#b85a00',X:'#5a2a88'};
 const FACE='#fbf5e8',EDGE='#8a6d4a',FONT="Figtree,'Trebuchet MS',system-ui,sans-serif";
 const rankOf=c=>String(c).slice(0,-1),suitOf=c=>String(c).slice(-1);
 const valid=c=>typeof c==='string'&&RANKS.includes(rankOf(c))&&SUITS.includes(suitOf(c));
 const order=c=>SUITS.indexOf(suitOf(c))*13+RANKS.indexOf(rankOf(c));
 const cmp=(a,b)=>order(a)-order(b);
 const cardName=c=>RANK_NAMES[rankOf(c)]+' de '+SUIT_NAMES[suitOf(c)];
 const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
 const f=n=>Math.round(n*100)/100;
 /* Symbole centré en (cx,cy), taille size (boîte 20×20 mise à l'échelle) */
 function sym(s,cx,cy,size,col){
  col=col||SUIT_COL[s];const k=size/20,tr='translate('+f(cx-size/2)+' '+f(cy-size/2)+') scale('+f(k)+')';let b;
  if(s==='T')b='<path d="M1 17.5 L7.5 4.5 L11 11 L13.6 7.4 L19 17.5 Z" fill="'+col+'"/><path d="M5 17.5 H15" stroke="'+FACE+'" stroke-width="1.2"/>';
  else if(s==='E')b='<path d="M10 1.5 C10 1.5 3.6 9 3.6 12.6 A6.4 6.4 0 0 0 16.4 12.6 C16.4 9 10 1.5 10 1.5 Z" fill="'+col+'"/><path d="M7 13 A3.2 3.2 0 0 0 10 16" stroke="'+FACE+'" stroke-width="1.3" fill="none" stroke-linecap="round"/>';
  else if(s==='S'){let r='';for(let i=0;i<8;i++){const a=i*Math.PI/4,c=Math.cos(a),s2=Math.sin(a);r+='M'+f(10+c*6.6)+' '+f(10+s2*6.6)+' L'+f(10+c*9.4)+' '+f(10+s2*9.4)+' '}
   b='<circle cx="10" cy="10" r="4.4" fill="'+col+'"/><path d="'+r+'" stroke="'+col+'" stroke-width="2" stroke-linecap="round"/>'}
  else b='<path d="M10 1 L12.3 7.7 L19 10 L12.3 12.3 L10 19 L7.7 12.3 L1 10 L7.7 7.7 Z" fill="'+col+'"/><circle cx="10" cy="10" r="1.5" fill="'+FACE+'"/>';
  return '<g transform="'+tr+'">'+b+'</g>'}
 /* Positions des symboles (x,y) dans la carte 100×140 */
 const L=34,C=50,R=66,Y=[32,56.7,83.3,108];
 const PIPS={'2':[[C,34],[C,106]],'3':[[C,34],[C,70],[C,106]],'4':[[L,34],[R,34],[L,106],[R,106]],'5':[[L,34],[R,34],[C,70],[L,106],[R,106]],
  '6':[[L,34],[R,34],[L,70],[R,70],[L,106],[R,106]],'7':[[L,34],[R,34],[C,52],[L,70],[R,70],[L,106],[R,106]],
  '8':[[L,34],[R,34],[C,52],[L,70],[R,70],[C,88],[L,106],[R,106]],
  '9':[[L,Y[0]],[R,Y[0]],[L,Y[1]],[R,Y[1]],[C,70],[L,Y[2]],[R,Y[2]],[L,Y[3]],[R,Y[3]]],
  '10':[[L,Y[0]],[R,Y[0]],[C,44.5],[L,Y[1]],[R,Y[1]],[L,Y[2]],[R,Y[2]],[C,95.5],[L,Y[3]],[R,Y[3]]]};
 function figure(r,s){
  const c=SUIT_COL[s];let b='<rect x="27" y="27" width="46" height="86" rx="7" fill="'+c+'" fill-opacity=".08" stroke="'+c+'" stroke-width="1.6"/>';
  if(r==='A')return b+'<circle cx="50" cy="70" r="26" fill="none" stroke="'+c+'" stroke-width="1.6"/><circle cx="50" cy="70" r="22" fill="none" stroke="'+c+'" stroke-width=".8" stroke-dasharray="2 3"/>'+sym(s,50,70,34);
  if(r==='R')return b+'<path d="M32 62 L32 42 L41 52 L50 38 L59 52 L68 42 L68 62 Z" fill="'+c+'"/><rect x="32" y="65" width="36" height="6" rx="2" fill="'+c+'"/><circle cx="50" cy="35" r="0" /><path d="M32 42 L32 62 M68 42 L68 62" stroke="'+FACE+'" stroke-width="1"/>'+sym(s,50,92,18);
  if(r==='D')return b+'<path d="M35 62 A15 15 0 0 1 65 62" fill="none" stroke="'+c+'" stroke-width="3" stroke-linecap="round"/><circle cx="35" cy="62" r="3" fill="'+c+'"/><circle cx="65" cy="62" r="3" fill="'+c+'"/><circle cx="50" cy="47" r="3.2" fill="'+c+'"/><path d="M50 50 V62 L45 67 L50 74 L55 67 L50 62" fill="'+c+'" stroke="'+c+'" stroke-width="1" stroke-linejoin="round"/>'+sym(s,50,94,18);
  return b+'<path d="M38 36 V84" stroke="'+c+'" stroke-width="3" stroke-linecap="round"/><path d="M38 38 H68 L60 48 L68 58 H38 Z" fill="'+c+'"/><circle cx="38" cy="35" r="2.6" fill="'+c+'"/>'+sym(s,56,92,18)}
 const gid=s=>s; // pas d'identifiants (pas de collision entre SVG)
 function svg(card,opt){
  opt=opt||{};
  if(!valid(card))return back(opt);
  const r=rankOf(card),s=suitOf(card),c=SUIT_COL[s],label=cardName(card);
  let g='<rect x="1" y="1" width="98" height="138" rx="8" fill="'+FACE+'" stroke="'+EDGE+'" stroke-width="1.5"/>';
  const fs=r==='10'?15:18,tx=r==='10'?'translate(0 0)':'';
  const corner='<text x="12" y="21" text-anchor="middle" font-family="'+FONT+'" font-weight="800" font-size="'+fs+'" fill="'+c+'">'+r+'</text>'+sym(s,12,33,11);
  g+=corner+'<g transform="rotate(180 50 70)">'+corner+'</g>';
  if(PIPS[r])for(const p of PIPS[r])g+=sym(s,p[0],p[1],r==='9'||r==='10'?15:18);
  else g+=figure(r,s);
  return wrap(g,opt,label)}
 function wrap(g,opt,label){
  const st=opt.w?' style="width:'+esc(opt.w)+'"':'';
  return '<svg class="gc-svg'+(opt.cls?' '+esc(opt.cls):'')+'" viewBox="0 0 100 140" xmlns="http://www.w3.org/2000/svg"'+st+(opt.hidden?' aria-hidden="true"':' role="img" aria-label="'+esc(label)+'"')+' focusable="false">'+g+'</svg>'}
 /* Dos : fond brun, cadre ocre, treillis de losanges, bandes en zigzag, rosace centrale avec les quatre symboles. */
 function back(opt){
  opt=opt||{};let g='<rect x="1" y="1" width="98" height="138" rx="8" fill="#3a1c10" stroke="#f5aa50" stroke-width="1.5"/><rect x="6" y="6" width="88" height="128" rx="5" fill="none" stroke="#f5aa50" stroke-width="1"/>';
  const zig=y=>{let d='M10 '+y;for(let i=0;i<8;i++)d+=' L'+(10+i*10+5)+' '+(y-4)+' L'+(10+(i+1)*10)+' '+y;return '<path d="'+d+'" fill="none" stroke="#3fb8a4" stroke-width="2" stroke-linejoin="round"/>'};
  g+=zig(18)+zig(128);
  for(let r=0;r<7;r++)for(let c=0;c<5;c++){const cx=20+c*15+(r%2?7.5:0),cy=32+r*13;if(cx>86||cx<14)continue;
   g+='<path d="M'+cx+' '+(cy-5)+' L'+(cx+5)+' '+cy+' L'+cx+' '+(cy+5)+' L'+(cx-5)+' '+cy+' Z" fill="'+((r+c)%2?'#f59a2e':'#5a2a18')+'" fill-opacity="'+((r+c)%2?'.85':'1')+'" stroke="#f5aa50" stroke-width=".6"/>'}
  g+='<circle cx="50" cy="70" r="19" fill="#2a130c" stroke="#3fb8a4" stroke-width="2"/><circle cx="50" cy="70" r="15" fill="none" stroke="#f5aa50" stroke-width=".8"/>';
  const q=[['T',42,62],['E',58,62],['S',42,78],['X',58,78]];for(const x of q)g+=sym(x[0],x[1],x[2],12,'#ffd9a0');
  return wrap(g,opt,'Dos de carte N’Zassa')}
 const CSS_PATH='css/games-cards.css';
 function ensureCss(){try{const d=root.document;if(!d||d.querySelector('link[data-gc]')||[].some.call(d.styleSheets,s=>s.href&&/games-cards\.css/.test(s.href)))return;
  const l=d.createElement('link');l.rel='stylesheet';l.href=CSS_PATH;l.setAttribute('data-gc','1');d.head.appendChild(l)}catch(e){}}
 /* ---------- utilitaires d'interface partagés ---------- */
 /* Éventail : place les enfants (.gc-c) d'un conteneur en une ou plusieurs rangées qui tiennent dans sa largeur. */
 function fit(box){
  const kids=[].slice.call(box.children);if(!kids.length){box.style.height='0';return}
  const W=box.clientWidth;if(!W)return;
  const cw=kids[0].offsetWidth||60,ch=kids[0].offsetHeight||cw*1.4,n=kids.length,full=cw*.9,min=cw*.42;
  let per=n;if(n>1&&(n-1)*min+cw>W)per=Math.max(1,Math.floor((W-cw)/min)+1);
  const rows=Math.ceil(n/per);per=Math.ceil(n/rows);const rowH=rows>1?ch*.6:ch;
  kids.forEach((k,i)=>{const row=Math.floor(i/per),idx=i%per,inRow=Math.min(per,n-row*per);
   const step=inRow>1?Math.min(full,(W-cw)/(inRow-1)):0,total=cw+step*(inRow-1),x0=(W-total)/2;
   k.style.left=f(x0+idx*step)+'px';k.style.top=f(row*rowH)+'px';k.style.zIndex=String(row*100+idx+1)});
  box.style.height=f((rows-1)*rowH+ch+14)+'px'}
 function resultText(res,mySeat,teamOf){
  if(!res)return '';
  const me=Number.isInteger(mySeat)?mySeat:null;
  if(res.draw||!res.winners||!res.winners.length)return 'Partie nulle.';
  if(me!==null)return res.winners.includes(me)?'Victoire !':'Défaite.';
  return 'Fin de partie : '+res.winners.map(w=>'Joueur '+(w+1)).join(' et ')+' gagne.'}
 const util={esc,rankOf,suitOf,cmp,order,name:cardName,sym,SUIT_NAMES,RANK_NAMES,SUIT_COL,SUITS,RANKS,fit,ensureCss,resultText,
  symSvg:(s,size)=>'<svg class="gc-sym" viewBox="0 0 '+size+' '+size+'" width="'+size+'" height="'+size+'" aria-hidden="true" focusable="false">'+sym(s,size/2,size/2,size)+'</svg>',
  T:api=>(typeof (api&&api.t)==='function'?api.t.bind(api):s=>s)};
 LCA.gameUI.cards={svg,back,css:CSS_PATH,ensureCss,util};
})(typeof self!=='undefined'?self:this);
