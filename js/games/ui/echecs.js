/* Rendu des échecs (styles .gb-*). board : index 0 = a8 … 63 = h1 ; blancs positifs, noirs négatifs (1 pion … 6 roi). AUCUNE règle :
   les cases jouables viennent de api.legal() ; promotion : choix explicite parmi les coups listés. Pièces en SVG (pas de police requise). */
(function(root){
 const LCA=root.LCA,K=LCA.gameUI.kit;
 const sqName=i=>'abcdefgh'[i&7]+(8-(i>>3));
 const NAMES={1:'pion',2:'cavalier',3:'fou',4:'tour',5:'dame',6:'roi'},PROMO={q:'Dame',r:'Tour',b:'Fou',n:'Cavalier'},PROMO_P={q:5,r:4,b:3,n:2};
 /* silhouettes 100×100 dessinées pour le projet */
 const SHAPE={
  1:'<circle cx="50" cy="32" r="13"/><path d="M38 48 Q50 40 62 48 L66 74 H34 Z"/><rect x="26" y="74" width="48" height="12" rx="4"/>',
  2:'<path d="M30 86 H74 L70 74 C70 58 66 44 58 34 L60 20 L50 26 C38 26 26 40 24 52 L34 56 L42 50 C44 56 38 64 34 74 Z"/><circle cx="46" cy="38" r="3.5" fill="var(--eye)"/>',
  3:'<ellipse cx="50" cy="44" rx="14" ry="20"/><circle cx="50" cy="20" r="6"/><path d="M40 62 H60 L64 74 H36 Z"/><rect x="26" y="74" width="48" height="12" rx="4"/><path d="M56 34 L46 48" stroke="var(--eye)" stroke-width="4"/>',
  4:'<path d="M28 18 H38 V26 H45 V18 H55 V26 H62 V18 H72 V36 H28 Z"/><path d="M34 36 H66 L62 72 H38 Z"/><rect x="26" y="72" width="48" height="14" rx="4"/>',
  5:'<circle cx="24" cy="26" r="6"/><circle cx="40" cy="18" r="6"/><circle cx="60" cy="18" r="6"/><circle cx="76" cy="26" r="6"/><path d="M24 30 L34 66 H66 L76 30 L62 50 L60 24 L50 48 L40 24 L38 50 Z"/><rect x="28" y="66" width="44" height="8" rx="3"/><rect x="24" y="76" width="52" height="11" rx="4"/>',
  6:'<path d="M46 8 H54 V16 H62 V24 H54 V32 H46 V24 H38 V16 H46 Z"/><path d="M50 32 C30 32 22 46 32 64 H68 C78 46 70 32 50 32 Z"/><rect x="30" y="66" width="40" height="8" rx="3"/><rect x="24" y="76" width="52" height="11" rx="4"/>'};
 function pc(p){if(!p)return '';const w=p>0,fill=w?'#f6efe3':'#2a1a12',line=w?'#5a3a1e':'#e8c98a';
  return '<svg class="gb-pc" viewBox="0 0 100 100" aria-hidden="true" focusable="false" style="--eye:'+line+'"><g fill="'+fill+'" stroke="'+line+'" stroke-width="3.5" stroke-linejoin="round">'+SHAPE[Math.abs(p)]+'</g></svg>'}
 function mount(el,api){
  const box=document.createElement('div');box.className='gb gb-echecs';
  box.innerHTML='<div class="gb-status" role="status" aria-live="polite"></div><div class="gb-frame"><div class="gb-grid g8" role="grid" aria-label="Échiquier"></div></div><div class="gb-choose" hidden></div>';
  el.appendChild(box);const st=box.querySelector('.gb-status'),gr=box.querySelector('.gb-grid'),ch=box.querySelector('.gb-choose');
  let v=null,info=null,sel=null;
  const legal=()=>info&&info.turn===info.mySeat?api.legal():[];
  function click(s){
   const L=legal();if(!L.length)return;
   if(sel){const ms=L.filter(m=>m.from===sel&&m.to===s);
    if(ms.length===1){sel=null;ch.hidden=true;api.onMove(ms[0]);return}
    if(ms.length>1){const white=v.cur===0;ch.hidden=false;ch.innerHTML='<p class="gb-q">Promotion : choisis la pièce</p>'+ms.map((m,i)=>'<button type="button" data-i="'+i+'" aria-label="'+PROMO[m.promo]+'">'+pc((white?1:-1)*PROMO_P[m.promo])+PROMO[m.promo]+'</button>').join('');
     ch.onclick=e=>{const b=e.target.closest('button[data-i]');if(!b)return;const m=ms[+b.dataset.i];sel=null;ch.hidden=true;api.onMove(m)};return}}
   if(L.some(m=>m.from===s)){sel=sel===s?null:s;ch.hidden=true;draw();return}
   sel=null;ch.hidden=true;draw()}
  gr.addEventListener('click',e=>{const b=e.target.closest('.gb-sq[data-s]');if(b)click(b.dataset.s)});
  function draw(){
   if(!v){gr.innerHTML='';return}
   const L=legal(),from=new Set(L.map(m=>m.from)),to=new Map();if(sel)L.filter(m=>m.from===sel).forEach(m=>to.set(m.to,1));
   const flip=info.mySeat===1,last=v.last&&v.last.from?v.last:null;
   /* échec : le dernier coup (notation) se termine par + ou # → le roi du camp au trait est en échec */
   const san=v.log&&v.log.length?v.log[v.log.length-1]:'',chk=/[+#]$/.test(san)&&!(v.res&&v.res.reason==='abandon');let kingSq=-1;
   if(chk){const side=v.res?(v.res.winners&&v.res.winners.length?1-v.res.winners[0]:-1):v.cur;if(side===0||side===1)kingSq=v.board.indexOf(side===0?6:-6)}
   let h='';
   for(let rr=0;rr<8;rr++){h+='<div class="gb-row" role="row">';for(let cc=0;cc<8;cc++){const r=flip?7-rr:rr,c=flip?7-cc:cc,i=r*8+c,s=sqName(i),p=v.board[i],dark=(r+c)%2===1;
    const cls=['gb-sq'];if(dark)cls.push('d');if(last&&(last.from===s||last.to===s))cls.push('gb-last');if(from.has(s))cls.push('gb-mv');if(sel===s)cls.push('gb-sel');if(i===kingSq)cls.push('gb-chk');
    if(to.has(s)){cls.push('gb-tgt');if(p)cls.push('gb-x')}
    const lab=s+(p?' : '+NAMES[Math.abs(p)]+(p>0?' blanc':' noir'):'')+(from.has(s)?', jouable':'')+(to.has(s)?', destination possible':'')+(i===kingSq?', en échec':'');
    h+='<button type="button" class="'+cls.join(' ')+'" role="gridcell" data-s="'+s+'" aria-label="'+lab+'"'+(from.has(s)||to.has(s)?'':' tabindex="-1"')+'>'+pc(p)+(to.has(s)?'<span class="gb-mark"></span>':'')+
     (cc===0?'<span class="gb-lbl">'+(8-r)+'</span>':'')+(rr===7?'<span class="gb-coord">'+'abcdefgh'[c]+'</span>':'')+'</button>'}
    h+='</div>'}
   gr.innerHTML=h;
   const me=info.mySeat===1?1:0;K.status(st,info,(info.mySeat===0||info.mySeat===1?'Tu as les '+(me?'noirs':'blancs'):'')+(chk&&!v.res?' · échec !':'')+(san?' · dernier coup : '+K.esc(san):''))}
  return {update(nv,ni){v=nv;info=ni;if(!legal().some(m=>m.from===sel))sel=null;ch.hidden=true;draw()},destroy(){box.remove()}}}
 LCA.gameUI.register('echecs',{mount});
})(typeof self!=='undefined'?self:this);
