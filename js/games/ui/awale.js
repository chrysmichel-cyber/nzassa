/* Rendu de l'awalé (DOM + SVG, styles .gb-* de css/games-boards.css). AUCUNE règle : les coups proposés viennent de api.legal(), le coup choisi part par api.onMove(). */
(function(root){
 const LCA=root.LCA,K=LCA.gameUI.kit;
 /* graines : disposition en spirale (déterministe) ; au-delà de 18, on dessine 18 graines et le nombre fait foi */
 const SEED_COL=['#f2d9a6','#e8c27a','#d9a85e','#f5e2bd'];
 function seeds(n){let g='';const m=Math.min(n,18);for(let i=0;i<m;i++){const a=i*2.4,r=i?Math.min(34,8+Math.sqrt(i)*8.5):0,x=50+Math.cos(a)*r,y=52+Math.sin(a)*r*.9;
  /* rotation portée par un groupe : l'ellipse garde sa propre transformation CSS (animation) sans décaler son centre */
  g+='<g transform="rotate('+((i*47)%180)+' '+x.toFixed(1)+' '+y.toFixed(1)+')"><ellipse class="gb-seed" cx="'+x.toFixed(1)+'" cy="'+y.toFixed(1)+'" rx="8" ry="6" fill="'+SEED_COL[i%4]+'" stroke="#6b3a1f" stroke-width="1"/></g>'}
  return '<svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">'+g+'</svg>'}
 function mount(el,api){
  const box=document.createElement('div');box.className='gb gb-awale';
  box.innerHTML='<div class="gb-status" role="status" aria-live="polite"></div><div class="gb-awboard" role="group" aria-label="Plateau d’awalé"></div>';
  el.appendChild(box);const st=box.querySelector('.gb-status'),bd=box.querySelector('.gb-awboard');let cur=null,lastKey='';
  bd.addEventListener('click',e=>{const b=e.target.closest('.gb-pit.gb-legal');if(!b)return;const pit=+b.dataset.pit;if(api.legal().some(m=>m.pit===pit))api.onMove({pit})});
  bd.addEventListener('keydown',e=>{if(e.key!=='ArrowLeft'&&e.key!=='ArrowRight')return;const l=[...bd.querySelectorAll('.gb-pit.gb-legal')];const i=l.indexOf(document.activeElement);if(i<0)return;e.preventDefault();const n=l[(i+(e.key==='ArrowRight'?1:l.length-1))%l.length];n&&n.focus()});
  function update(v,info){
   cur=v;if(!v){bd.innerHTML='';K.status(st,info);return}
   const me=Number.isInteger(info.mySeat)?info.mySeat:0,op=1-me,legal=info.turn===info.mySeat?api.legal():[],L=new Set(legal.map(m=>m.pit));
   const last=v.last,lastPos=last?last.seat*6+last.pit:-1,endPos=last?last.end:-1;
   const pit=(abs,mine)=>{const n=v.pits[abs],rel=abs%6,isL=mine&&L.has(rel),lbl=(mine?'Ton trou ':'Trou adverse ')+(rel+1)+' : '+n+' graine'+(n>1?'s':'');
    return '<button type="button" class="gb-pit'+(mine?' gb-mine':'')+(isL?' gb-legal':'')+(abs===lastPos?' gb-last':'')+(abs===endPos&&last&&last.captured?' gb-end':'')+'" data-pit="'+rel+'"'+(mine?'':' tabindex="-1"')+
     (mine&&!isL?' aria-disabled="true"':'')+' aria-label="'+lbl+(isL?' (jouable)':'')+'">'+seeds(n)+'<span class="gb-n">'+n+'</span></button>'};
   const store=(s,mine)=>'<div class="gb-store" aria-label="Réserve '+(mine?'à toi':'de '+K.esc(K.nameOf(info,s)))+' : '+v.store[s]+'"><span class="gb-who">'+(mine?'Toi':K.esc(K.nameOf(info,s)).slice(0,10))+'</span>'+seeds(Math.min(v.store[s],18))+'<span class="gb-n">'+v.store[s]+'</span></div>';
   let top='',bot='';for(let i=5;i>=0;i--)top+=pit(op*6+i,false);for(let i=0;i<6;i++)bot+=pit(me*6+i,info.mySeat!==null&&info.mySeat!==undefined);
   /* réserve de l'adversaire à gauche, la sienne à droite (sens du semis : vers la droite chez soi) */
   bd.innerHTML=store(op,false)+'<div class="gb-row gb-row-top">'+top+'</div><div class="gb-row gb-row-bot">'+bot+'</div>'+store(me,info.mySeat===me);
   bd.querySelector('.gb-store').style.gridColumn='1';bd.querySelectorAll('.gb-store')[1].style.gridColumn='8';
   [...bd.querySelectorAll('.gb-row-top .gb-pit')].forEach((b,i)=>{b.style.gridRow='1';b.style.gridColumn=String(i+2)});
   [...bd.querySelectorAll('.gb-row-bot .gb-pit')].forEach((b,i)=>{b.style.gridRow='2';b.style.gridColumn=String(i+2)});
   const k=JSON.stringify(v.pits)+v.plies;if(k!==lastKey&&lastKey&&last){const lp=bd.querySelector('.gb-pit.gb-last');if(lp)lp.classList.add('gb-pop')}lastKey=k;
   K.status(st,info,'Graines prises : toi '+v.store[me]+' · '+K.esc(K.nameOf(info,op))+' '+v.store[op])}
  return {update,destroy(){box.remove()}}}
 LCA.gameUI.register('awale',{mount});
})(typeof self!=='undefined'?self:this);
