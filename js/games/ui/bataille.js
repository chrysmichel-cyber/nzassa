/* Rendu de la bataille (paquet N'Zassa, styles .gc-*). AUCUNE règle : un seul coup possible, « Retourner », proposé quand api.legal() le contient. */
(function(root){
 const LCA=root.LCA,K=LCA.gameUI.kit,C=()=>LCA.gameUI.cards;
 function mount(el,api){
  C().ensureCss();
  const box=document.createElement('div');box.className='gb gc gc-bataille';
  box.innerHTML='<div class="gb-status" role="status" aria-live="polite"></div><div class="gc-felt"><div class="gc-side gc-top"></div><div class="gc-mid" aria-live="polite"></div><div class="gc-side gc-bot"></div></div><div class="gc-actions"><button type="button" class="gc-btn gc-main" data-a="flip">Retourner ma carte</button></div>';
  el.appendChild(box);const st=box.querySelector('.gb-status'),top=box.querySelector('.gc-top'),bot=box.querySelector('.gc-bot'),mid=box.querySelector('.gc-mid'),btn=box.querySelector('[data-a=flip]');
  btn.addEventListener('click',()=>{if(api.legal().some(m=>m.t==='flip'))api.onMove({t:'flip'})});
  const pile=(n,label)=>'<div class="gc-deck" aria-label="'+K.esc(label)+' : '+n+' carte'+(n>1?'s':'')+'">'+(n?C().back({hidden:true,cls:'gc-card'}):'<span class="gc-empty"></span>')+'<span class="gc-count">'+n+'</span></div><span class="gc-name">'+K.esc(label)+'</span>';
  function update(v,info){
   if(!v){mid.innerHTML='';K.status(st,info);return}
   const me=info.mySeat===1?1:0,op=1-me,can=info.turn===info.mySeat&&api.legal().some(m=>m.t==='flip');
   top.innerHTML=pile(v.counts[op],K.nameOf(info,op));bot.innerHTML=pile(v.counts[me],info.mySeat===null||info.mySeat===undefined?K.nameOf(info,me):'Toi');
   const cards=v.table.length?v.table:[];let h='<div class="gc-trick">';
   if(cards.length)h+=cards.map(x=>'<span class="gc-play gc-s'+(x.seat===me?'b':'t')+'">'+(x.up&&x.card?C().svg(x.card,{cls:'gc-card'}):C().back({cls:'gc-card'}))+'</span>').join('');
   else if(v.last&&v.last.up)h+=v.last.up.map((c,i)=>'<span class="gc-play gc-old">'+C().svg(c,{cls:'gc-card'})+'</span>').join('');
   h+='</div>';
   let msg='';if(v.table.some(x=>!x.up))msg='Bataille ! Chacun pose une carte cachée puis en retourne une.';
   else if(!v.table.length&&v.last&&v.last.winner!==null&&v.last.winner!==undefined)msg=(v.last.winner===me&&info.mySeat!==null?'Tu remportes':K.esc(K.nameOf(info,v.last.winner))+' remporte')+' le pli ('+v.last.n+' cartes)'+(v.last.battle?' après une bataille':'')+'.';
   mid.innerHTML=h+(msg?'<p class="gc-msg">'+msg+'</p>':'');
   btn.disabled=!can;btn.hidden=info.mySeat===null||info.mySeat===undefined||!!info.result;
   K.status(st,info,'Plis : '+v.plis+(v.battles?' · batailles : '+v.battles:''))}
  return {update,destroy(){box.remove()}}}
 LCA.gameUI.register('bataille',{mount});
})(typeof self!=='undefined'?self:this);
