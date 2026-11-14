/* Petits outils communs aux rendus de jeux (js/games/ui/*.js) : échappement, bandeau d'état, textes de fin. AUCUNE règle de jeu ici. */
(function(root){
 const LCA=root.LCA=root.LCA||{};LCA.gameUI=LCA.gameUI||{};
 const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
 const REASONS={captures:'25 graines capturées',plus_de_coups:'plus de coup possible',boucle:'partie sans fin : chacun garde ses graines',mat:'échec et mat',pat:'pat',
  materiel:'matériel insuffisant',repetition:'répétition de la position','50coups':'règle des 50 coups',vingt_cinq_coups:'25 coups de dame sans prise',abandon:'abandon',temps:'temps écoulé',
  cartes:'plus de cartes',plafond:'limite de coups atteinte',bataille:'bataille impossible',points:'501 points atteints',blocage:'partie bloquée'};
 const reasonText=r=>REASONS[r]||r||'';
 const nameOf=(info,i)=>info&&info.names&&info.names[i]?info.names[i]:'Joueur '+(i+1);
 /* Phrase de fin, du point de vue de mySeat (équipes de belote : winners contient les deux sièges de l'équipe). */
 function resultLine(res,info){
  if(!res)return '';const me=info&&Number.isInteger(info.mySeat)?info.mySeat:null,why=reasonText(res.reason);
  if(res.draw||!res.winners||!res.winners.length)return 'Partie nulle'+(why?' ('+why+')':'')+'.';
  if(me!==null)return (res.winners.includes(me)?'Victoire !':'Défaite.')+(why?' '+why.charAt(0).toUpperCase()+why.slice(1)+'.':'');
  return res.winners.map(w=>nameOf(info,w)).join(' et ')+(res.winners.length>1?' gagnent':' gagne')+(why?' ('+why+')':'')+'.'}
 /* Bandeau d'état : à qui de jouer, ou résultat. */
 function status(el,info,extra){
  if(!el)return;const res=info&&info.result,me=info?info.mySeat:null,t=info?info.turn:-1;let cls='gb-status',txt;
  if(res){cls+=' gb-over';txt=resultLine(res,info)}
  else if(t===me&&me!==null){txt='À toi de jouer'}
  else if(t>=0){cls+=' gb-wait';txt='Au tour de '+nameOf(info,t)}
  else{cls+=' gb-wait';txt='En attente…'}
  el.className=cls;el.innerHTML='<span><span class="gb-dot" aria-hidden="true"></span>'+esc(txt)+'</span>'+(extra?'<small>'+extra+'</small>':'');}
 LCA.gameUI.kit={esc,status,resultLine,reasonText,nameOf};
 if(typeof module==='object'&&module.exports)module.exports=LCA.gameUI.kit;
})(typeof self!=='undefined'?self:this);
