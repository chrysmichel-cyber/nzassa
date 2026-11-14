/* Rendu du Menteur (paquet N'Zassa, styles .gc-*). AUCUNE règle : le rang à annoncer (view.want), l'obligation d'accuser et les coups possibles
   viennent de la vue et de api.legal(). On choisit 1 à 4 cartes de sa main puis « Poser », ou « Menteur ! ». */
(function(root){
 const LCA=root.LCA,K=LCA.gameUI.kit,C=()=>LCA.gameUI.cards;
 const RN=r=>(C().util.RANK_NAMES[r]||r);
 function mount(el,api){
  C().ensureCss();
  const box=document.createElement('div');box.className='gb gc gc-menteur';
  box.innerHTML='<div class="gb-status" role="status" aria-live="polite"></div><div class="gc-opps"></div><div class="gc-felt gc-felt-s"><div class="gc-mid" aria-live="polite"></div></div>'+
   '<div class="gc-actions"><button type="button" class="gc-btn gc-main" data-a="play" disabled>Poser</button><button type="button" class="gc-btn gc-warn" data-a="call" disabled>Menteur !</button></div><div class="gc-hand" role="group" aria-label="Ta main"></div>';
  el.appendChild(box);
  const st=box.querySelector('.gb-status'),opps=box.querySelector('.gc-opps'),mid=box.querySelector('.gc-mid'),hand=box.querySelector('.gc-hand'),bPlay=box.querySelector('[data-a=play]'),bCall=box.querySelector('[data-a=call]');
  let v=null,info=null,sel=new Set();
  const legal=()=>info&&info.turn===info.mySeat?api.legal():[];
  const canPlay=()=>legal().some(m=>m.t==='play'),canCall=()=>legal().some(m=>m.t==='call');
  hand.addEventListener('click',e=>{const b=e.target.closest('.gc-c');if(!b||!canPlay())return;const c=b.dataset.c;if(sel.has(c))sel.delete(c);else if(sel.size<4)sel.add(c);drawHand();drawBtns()});
  bPlay.addEventListener('click',()=>{if(!sel.size||!canPlay())return;const cards=[...sel].sort(C().util.cmp);sel.clear();api.onMove({t:'play',cards})});
  bCall.addEventListener('click',()=>{if(canCall())api.onMove({t:'call'})});
  function drawHand(){
   const h=v&&v.hands&&Number.isInteger(info.mySeat)?v.hands[info.mySeat]:null;
   if(!h){hand.innerHTML='';hand.hidden=true;return}hand.hidden=false;const ok=canPlay();
   hand.innerHTML=h.map(c=>'<button type="button" class="gc-c'+(sel.has(c)?' gc-sel':'')+(ok?' gc-ok':'')+'" data-c="'+c+'" aria-pressed="'+sel.has(c)+'" aria-label="'+K.esc(C().util.name(c))+'"'+(ok?'':' disabled')+'>'+C().svg(c,{hidden:true,cls:'gc-card'})+'</button>').join('');
   requestAnimationFrame(()=>C().util.fit(hand))}
  function drawBtns(){
   const me=info&&info.mySeat,must=v&&v.last&&v.counts[v.last.seat]===0;
   bPlay.disabled=!canPlay()||!sel.size;bPlay.textContent=sel.size?'Poser '+sel.size+' carte'+(sel.size>1?'s':'')+' : « '+RN(v.want)+' »':'Choisis 1 à 4 cartes';
   bCall.disabled=!canCall();bCall.classList.toggle('gc-must',!!must&&canCall());
   const hide=me===null||me===undefined||!!info.result;bPlay.hidden=hide||(!!must);bCall.hidden=hide}
  function update(nv,ni){
   v=nv;info=ni;if(!v){mid.innerHTML='';K.status(st,info);return}
   const me=Number.isInteger(info.mySeat)?info.mySeat:null,h=me!==null&&v.hands[me]?v.hands[me]:[];
   for(const c of [...sel])if(!h.includes(c))sel.delete(c);if(!canPlay())sel.clear();
   let o='';for(let i=0;i<v.n;i++){if(i===me)continue;o+='<div class="gc-opp'+(info.turn===i?' gc-turn':'')+'"><span class="gc-mini">'+C().back({hidden:true,cls:'gc-card'})+'</span><b>'+K.esc(K.nameOf(info,i))+'</b><small>'+v.counts[i]+' carte'+(v.counts[i]>1?'s':'')+'</small></div>'}
   opps.innerHTML=o;
   let m='<div class="gc-pile" aria-label="Pile : '+v.pileN+' cartes">'+(v.pileN?C().back({hidden:true,cls:'gc-card'}):'<span class="gc-empty"></span>')+'<span class="gc-count">'+v.pileN+'</span></div><div class="gc-info">';
   if(v.reveal){const r=v.reveal,who=i=>i===me?'toi':K.esc(K.nameOf(info,i));
    m+='<p><b>'+(r.caller===me?'Tu accuses':K.esc(K.nameOf(info,r.caller))+' accuse')+' '+(r.owner===me?'toi':who(r.owner))+'.</b> Cartes retournées :</p><div class="gc-row">'+r.cards.map(c=>C().svg(c,{cls:'gc-card gc-sm'})).join('')+'</div><p>'+(r.liar?'Mensonge !':'C’était la vérité.')+' '+(r.taker===me?'Tu ramasses':who(r.taker)+' ramasse')+' la pile ('+r.pileN+' cartes).</p>'}
   else if(v.last)m+='<p>'+(v.last.seat===me?'Tu as posé':K.esc(K.nameOf(info,v.last.seat))+' a posé')+' <b>'+v.last.n+' carte'+(v.last.n>1?'s':'')+'</b> en annonçant « '+RN(v.last.rank)+' ».</p>';
   else m+='<p>La pile est vide.</p>';
   if(!info.result)m+='<p class="gc-want">Rang à annoncer : <b>'+RN(v.want)+'</b></p>'+(v.last&&v.counts[v.last.seat]===0?'<p class="gc-msg">'+(info.turn===me?'Ton voisin n’a plus de cartes : tu dois l’accuser.':'Le joueur qui a vidé sa main doit être accusé.')+'</p>':'');
   mid.innerHTML=m+'</div>';
   drawHand();drawBtns();K.status(st,info,'Coups : '+v.coups+' / 400')}
  return {update,destroy(){box.remove()}}}
 LCA.gameUI.register('menteur',{mount});
})(typeof self!=='undefined'?self:this);
