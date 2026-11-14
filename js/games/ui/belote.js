/* Rendu de la belote (4 joueurs, équipes 0&2 contre 1&3 ; styles .gc-*). AUCUNE règle : enchères et cartes jouables viennent de api.legal().
   Placement relatif : soi en bas, partenaire en haut, adversaires à gauche (siège suivant) et à droite. */
(function(root){
 const LCA=root.LCA,K=LCA.gameUI.kit,C=()=>LCA.gameUI.cards;
 const SN=s=>C().util.SUIT_NAMES[s],SYM=(s,n)=>C().util.symSvg(s,n||18);
 function mount(el,api){
  C().ensureCss();
  const box=document.createElement('div');box.className='gb gc gc-belote';
  box.innerHTML='<div class="gb-status" role="status" aria-live="polite"></div><div class="gc-score"></div>'+
   '<div class="gc-felt gc-table4"><div class="gc-p gc-pt"></div><div class="gc-p gc-pl"></div><div class="gc-p gc-pr"></div><div class="gc-center" aria-live="polite"></div><div class="gc-p gc-pb"></div></div>'+
   '<div class="gc-actions gc-bids"></div><div class="gc-hand" role="group" aria-label="Ta main"></div>';
  el.appendChild(box);
  const q=s=>box.querySelector(s),st=q('.gb-status'),sc=q('.gc-score'),center=q('.gc-center'),bids=q('.gc-bids'),hand=q('.gc-hand'),P={t:q('.gc-pt'),l:q('.gc-pl'),r:q('.gc-pr'),b:q('.gc-pb')};
  let v=null,info=null;
  const legal=()=>info&&info.turn===info.mySeat?api.legal():[];
  hand.addEventListener('click',e=>{const b=e.target.closest('.gc-c.gc-ok');if(!b)return;const m=legal().find(x=>x.t==='play'&&x.card===b.dataset.c);if(m)api.onMove(m)});
  bids.addEventListener('click',e=>{const b=e.target.closest('button[data-m]');if(!b)return;const m=JSON.parse(b.dataset.m);if(legal().some(x=>JSON.stringify(x)===JSON.stringify(m)))api.onMove(m)});
  function update(nv,ni){
   v=nv;info=ni;if(!v){center.innerHTML='';K.status(st,info);return}
   const me=Number.isInteger(info.mySeat)?info.mySeat:0,seen=Number.isInteger(info.mySeat),pos={[me]:'b',[(me+1)%4]:'l',[(me+2)%4]:'t',[(me+3)%4]:'r'},L=legal();
   const team=i=>i%2===me%2?'nous':'eux';
   for(let i=0;i<4;i++){const el=P[pos[i]],taker=v.contract&&v.contract.seat===i,turn=info.turn===i;
    el.className='gc-p gc-p'+pos[i]+(turn?' gc-turn':'');
    el.innerHTML='<b>'+(i===me&&seen?'Toi':K.esc(K.nameOf(info,i)))+'</b><small>'+(i===v.dealer?'donneur · ':'')+v.counts[i]+' cartes'+(taker?' · preneur':'')+'</small>'}
   /* centre : retourne pendant les enchères, pli en cours sinon (ou dernier pli terminé) */
   let c='';
   if(v.phase==='bid1'||v.phase==='bid2'){c='<div class="gc-up"><span>Retourne</span>'+C().svg(v.up,{cls:'gc-card'})+'</div><p class="gc-msg">'+(v.phase==='bid1'?'1er tour : prendre la retourne comme atout ?':'2e tour : choisir une autre famille d’atout ?')+'</p>'}
   else{const cards=v.trick.cards.length?v.trick.cards:(v.done.length?v.done[v.done.length-1].cards:[]),old=!v.trick.cards.length;
    c='<div class="gc-trick4'+(old?' gc-old':'')+'">'+cards.map(x=>'<span class="gc-play gc-s'+pos[x.seat]+'">'+C().svg(x.card,{cls:'gc-card'})+'</span>').join('')+'</div>';
    if(old&&v.done.length)c+='<p class="gc-msg">Pli pour '+(v.done[v.done.length-1].winner===me&&seen?'toi':K.esc(K.nameOf(info,v.done[v.done.length-1].winner)))+'.</p>'}
   center.innerHTML=c;
   const ct=v.contract;
   sc.innerHTML='<span>Score : <b>nous '+v.score[me%2]+'</b> · eux '+v.score[1-me%2]+' (objectif '+v.target+')</span>'+(ct?'<span>Atout '+SYM(ct.suit)+' '+SN(ct.suit)+' · pris par '+(ct.seat===me&&seen?'toi':K.esc(K.nameOf(info,ct.seat)))+' ('+team(ct.seat)+')</span><span>Plis : nous '+v.won[me%2]+' · eux '+v.won[1-me%2]+'</span>':'')+
    (v.hist.length?'<span>Dernière donne : '+(()=>{const h=v.hist[v.hist.length-1];return 'nous +'+h.gain[me%2]+', eux +'+h.gain[1-me%2]+(h.capot>=0?' (capot)':h.dedans?' (dedans)':'')+(h.belote>=0?' · belote':'')})()+'</span>':'');
   /* enchères */
   const bl=L.filter(m=>m.t!=='play');
   bids.innerHTML=bl.map(m=>'<button type="button" class="gc-btn'+(m.t==='pass'?'':' gc-main')+'" data-m=\''+K.esc(JSON.stringify(m))+'\'>'+(m.t==='take'?'Prendre ('+SYM(C().util.suitOf(v.up))+' '+SN(C().util.suitOf(v.up))+')':m.t==='suit'?SYM(m.suit)+' '+SN(m.suit):'Passer')+'</button>').join('');
   bids.hidden=!bl.length;
   /* main */
   const h=seen&&v.hands[me]?v.hands[me]:null,ok=new Set(L.filter(m=>m.t==='play').map(m=>m.card));
   if(!h){hand.hidden=true;hand.innerHTML=''}
   else{hand.hidden=false;hand.innerHTML=h.map(c=>'<button type="button" class="gc-c'+(ok.has(c)?' gc-ok':(ok.size?' gc-dim':''))+(ct&&C().util.suitOf(c)===ct.suit?' gc-trump':'')+'" data-c="'+c+'" aria-label="'+K.esc(C().util.name(c))+(ok.has(c)?' (jouable)':'')+'"'+(ok.has(c)?'':' disabled')+'>'+C().svg(c,{hidden:true,cls:'gc-card'})+'</button>').join('');
    requestAnimationFrame(()=>C().util.fit(hand))}
   K.status(st,info,'Donne '+(v.hist.length+1))}
  return {update,destroy(){box.remove()}}}
 LCA.gameUI.register('belote',{mount});
})(typeof self!=='undefined'?self:this);
