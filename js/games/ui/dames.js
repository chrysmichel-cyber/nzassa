/* Rendu des dames internationales 10×10 (styles .gb-*). Numérotation FMJD 1..50 sur les cases sombres. AUCUNE règle : sélection d'une pièce
   jouable → cases d'arrivée possibles (api.legal()) → coup envoyé tel que listé (avec captures et chemin). Plusieurs rafles vers la même case : choix explicite. */
(function(root){
 const LCA=root.LCA,K=LCA.gameUI.kit;
 const RC=[null],GRID={};for(let n=1;n<=50;n++){const r=Math.floor((n-1)/5),k=(n-1)%5,c=r%2===0?2*k+1:2*k;RC[n]=[r,c];GRID[r*10+c]=n}
 const PIECE={1:['#f6efe3','#8a6d4a',0],2:['#f6efe3','#8a6d4a',1],3:['#2a1a12','#c9a25a',0],4:['#2a1a12','#c9a25a',1]};
 function pc(p){const d=PIECE[p];if(!d)return '';const crown=d[2]?'<path d="M32 52 L32 40 L41 47 L50 36 L59 47 L68 40 L68 52 Z" fill="'+d[1]+'"/>':'';
  return '<svg class="gb-pc" viewBox="0 0 100 100" aria-hidden="true" focusable="false"><circle cx="50" cy="54" r="40" fill="rgba(0,0,0,.35)"/><circle cx="50" cy="50" r="40" fill="'+d[0]+'" stroke="'+d[1]+'" stroke-width="4"/><circle cx="50" cy="50" r="27" fill="none" stroke="'+d[1]+'" stroke-width="3"/>'+crown+'</svg>'}
 const NAMES={1:'pion blanc',2:'dame blanche',3:'pion noir',4:'dame noire'};
 function mount(el,api){
  const box=document.createElement('div');box.className='gb gb-dames';
  box.innerHTML='<div class="gb-status" role="status" aria-live="polite"></div><div class="gb-frame"><div class="gb-grid g10" role="grid" aria-label="Damier 10 sur 10"></div></div><div class="gb-choose" hidden></div>';
  el.appendChild(box);const st=box.querySelector('.gb-status'),gr=box.querySelector('.gb-grid'),ch=box.querySelector('.gb-choose');
  let v=null,info=null,sel=null;
  const legal=()=>info&&info.turn===info.mySeat?api.legal():[];
  function click(n){
   const L=legal();if(!L.length)return;
   if(sel){const ms=L.filter(m=>m.from===sel&&m.to===n);
    if(ms.length===1){sel=null;ch.hidden=true;api.onMove(ms[0]);return}
    if(ms.length>1){ch.hidden=false;ch.innerHTML='<p class="gb-q">Plusieurs rafles mènent à '+n+' : laquelle ?</p>'+ms.map((m,i)=>'<button type="button" data-i="'+i+'">'+sel+'×'+m.path.join('×')+' (prend '+m.captures.join(', ')+')</button>').join('');
     ch.onclick=e=>{const b=e.target.closest('button[data-i]');if(!b)return;const m=ms[+b.dataset.i];sel=null;ch.hidden=true;api.onMove(m)};return}}
   if(L.some(m=>m.from===n)){sel=sel===n?null:n;ch.hidden=true;draw();return}
   sel=null;ch.hidden=true;draw()}
  gr.addEventListener('click',e=>{const b=e.target.closest('.gb-sq[data-n]');if(b)click(+b.dataset.n)});
  function draw(){
   if(!v){gr.innerHTML='';return}
   const L=legal(),from=new Set(L.map(m=>m.from)),to=new Set(sel?L.filter(m=>m.from===sel).map(m=>m.to):[]);
   const flip=info.mySeat===1,last=v.last,lastSq=new Set(last?[last.from,last.to]:[]),caps=new Set(last?last.captures:[]);
   let h='';
   for(let rr=0;rr<10;rr++){h+='<div class="gb-row" role="row">';for(let cc=0;cc<10;cc++){const r=flip?9-rr:rr,c=flip?9-cc:cc,n=GRID[r*10+c];
    if(!n){h+='<div class="gb-sq" role="gridcell" aria-hidden="true"></div>';continue}
    const p=v.board[n],cls=['gb-sq','d'];if(lastSq.has(n))cls.push('gb-last');if(from.has(n))cls.push('gb-mv');if(sel===n)cls.push('gb-sel');if(to.has(n)){cls.push('gb-tgt');if(L.some(m=>m.from===sel&&m.to===n&&m.captures.length))cls.push('gb-x')}
    const lab='Case '+n+(p?' : '+NAMES[p]:'')+(from.has(n)?', jouable':'')+(to.has(n)?', destination possible':'')+(caps.has(n)?', pièce prise au dernier coup':'');
    h+='<button type="button" class="'+cls.join(' ')+'" role="gridcell" data-n="'+n+'" aria-label="'+lab+'"'+(from.has(n)||to.has(n)?'':' tabindex="-1"')+'>'+pc(p)+(from.has(n)&&!sel?'<span class="gb-ring"></span>':'')+(to.has(n)?'<span class="gb-mark"></span>':'')+'<span class="gb-coord">'+n+'</span></button>'}
    h+='</div>'}
   gr.innerHTML=h;
   const cnt=s=>{let k=0;for(let n=1;n<=50;n++){const p=v.board[n];if(p&&(p<=2?0:1)===s)k++}return k};
   const me=Number.isInteger(info.mySeat)?info.mySeat:0;
   K.status(st,info,(info.mySeat===null||info.mySeat===undefined?'Blancs ':'Toi ('+(me===0?'blancs':'noirs')+') ')+cnt(me)+' · '+K.esc(K.nameOf(info,1-me))+' '+cnt(1-me)+(L.length&&L[0].captures.length?' · prise obligatoire':''))}
  return {update(nv,ni){v=nv;info=ni;if(!legal().some(m=>m.from===sel))sel=null;ch.hidden=true;draw()},destroy(){box.remove()}}}
 LCA.gameUI.register('dames',{mount});
})(typeof self!=='undefined'?self:this);
