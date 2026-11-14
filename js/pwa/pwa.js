/* PWA de N'Zassa : enregistrement du service worker, mise à jour à la demande, bouton « Installer N’Zassa », bandeau hors connexion.
   Le site fonctionne exactement comme avant dans un navigateur ordinaire ; rien ici n'est obligatoire.
   Aucun jeton ni donnée de compte n'est lu, écrit ou mis en cache par ce module. */
(function(){
 window.LCA=window.LCA||{};
 const $=s=>document.querySelector(s),st={online:navigator.onLine!==false,installed:false,canPrompt:false,ios:false,swState:'none',updateReady:false,build:null};
 let deferred=null,reg=null,reloading=false;
 const standalone=()=>(window.matchMedia&&matchMedia('(display-mode: standalone)').matches)||navigator.standalone===true;
 const ua=navigator.userAgent||'';
 st.ios=/iPad|iPhone|iPod/.test(ua)||(/Macintosh/.test(ua)&&navigator.maxTouchPoints>1);
 st.installed=standalone();

 /* ---------- bandeau d'état (hors connexion, mise à jour) ---------- */
 function bar(){let b=$('#pwaBar');if(!b){b=document.createElement('div');b.id='pwaBar';b.className='glass';b.setAttribute('role','status');b.setAttribute('aria-live','polite');b.hidden=true;document.body.appendChild(b)}return b}
 function render(){
  const b=bar(),off=!st.online,upd=st.updateReady;
  document.body.classList.toggle('offline',off);
  if(upd){b.hidden=false;b.dataset.k='update';b.innerHTML='<span>Une nouvelle version de N’Zassa est prête.</span><button class="btn warm sm" data-pwa="update">Actualiser</button><button class="btn ghost sm" data-pwa="later">Plus tard</button>'}
  else if(off){b.hidden=false;b.dataset.k='offline';b.innerHTML='<span><b>Hors connexion.</b> Le jeu solo et ta progression sur cet appareil restent disponibles ; le monde ouvert, les comptes et les quiz en ligne reviendront avec le réseau.</span>'}
  else{b.hidden=true;b.dataset.k=''}
  document.querySelectorAll('[data-pwa=install]').forEach(x=>{x.hidden=st.installed})}
 window.addEventListener('online',()=>{st.online=true;render();try{reg&&reg.update()}catch(e){}});
 window.addEventListener('offline',()=>{st.online=false;render()});

 /* ---------- installation ---------- */
 window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferred=e;st.canPrompt=true;render()});
 window.addEventListener('appinstalled',()=>{deferred=null;st.canPrompt=false;st.installed=true;render()});
 function installHelp(){
  let d=$('#pwaIos');if(!d){d=document.createElement('div');d.id='pwaIos';d.className='glass';d.setAttribute('role','dialog');d.setAttribute('aria-modal','true');d.setAttribute('aria-label','Installer N’Zassa');
   document.body.appendChild(d)}
  const steps=st.ios
   ?'<ol><li>Touche le bouton <b>Partager</b> de Safari (le carré avec une flèche).</li><li>Choisis <b>Sur l’écran d’accueil</b>.</li><li>Valide avec <b>Ajouter</b>.</li></ol>'
   :/Android/i.test(ua)
    ?'<ol><li>Ouvre le menu de ton navigateur (⋮ ou ⋯).</li><li>Choisis <b>Installer l’application</b> ou <b>Ajouter à l’écran d’accueil</b>, puis confirme.</li></ol>'
    :/Macintosh/.test(ua)&&/Safari/.test(ua)&&!/(Chrome|Chromium|Edg)/.test(ua)
     ?'<ol><li>Dans Safari, ouvre le menu <b>Fichier</b>.</li><li>Choisis <b>Ajouter au Dock</b>.</li></ol>'
     :'<p>Dans Chrome ou Edge, utilise l’icône <b>Installer</b> dans la barre d’adresse ou le menu du navigateur. Sur un autre navigateur compatible, cherche <b>Installer N’Zassa</b> dans son menu.</p>';
  const https=location.protocol==='https:'||location.hostname==='localhost'||location.hostname==='127.0.0.1';
  d.innerHTML='<b>Installer N’Zassa</b>'+steps+(!https?'<p>Le site doit être publié en <b>HTTPS</b> pour être installable.</p>':'')+'<button class="btn warm sm" data-pwa="close">Compris</button>';
  d.hidden=false}
 async function install(){
  if(deferred){const e=deferred;deferred=null;st.canPrompt=false;try{await e.prompt();const c=await e.userChoice;st.lastChoice=c&&c.outcome}catch(_){installHelp();st.lastChoice='fallback'}render();return st.lastChoice||null}
  if(!st.installed){installHelp();return st.ios?'ios':'manual'}
  return null}
 document.addEventListener('click',e=>{const t=e.target.closest&&e.target.closest('[data-pwa]');if(!t)return;const a=t.dataset.pwa;
  if(a==='install')install();
  else if(a==='update')applyUpdate();
  else if(a==='later'){st.updateReady=false;render()}
  else if(a==='close'){const d=$('#pwaIos');if(d)d.hidden=true}});

 /* ---------- service worker ---------- */
 const secure=location.protocol==='https:'||location.hostname==='localhost'||location.hostname==='127.0.0.1';
 /* Pas d'enregistrement sous pilotage automatique (tests E2E des autres fonctions) sauf demande explicite : LCA_FORCE_SW */
 const allowed=('serviceWorker' in navigator)&&secure&&(!navigator.webdriver||window.LCA_FORCE_SW===true)&&window.LCA_NO_SW!==true;
 function watch(r){
  const ready=w=>{if(w&&w.state==='installed'&&navigator.serviceWorker.controller){st.updateReady=true;st.swState='waiting';render()}};
  if(r.waiting)ready(r.waiting);
  r.addEventListener('updatefound',()=>{const w=r.installing;if(!w)return;st.swState='installing';w.addEventListener('statechange',()=>{if(w.state==='installed')ready(w);if(w.state==='activated'&&!navigator.serviceWorker.controller)st.swState='active'})})}
 function applyUpdate(){if(reg&&reg.waiting){reg.waiting.postMessage({type:'SKIP_WAITING'})}}
 async function start(){
  if(!allowed){st.swState=('serviceWorker' in navigator)?'disabled':'unsupported';render();return}
  try{
   navigator.serviceWorker.addEventListener('controllerchange',()=>{if(reloading||!st.hadController)return;reloading=true;/* le jeu enregistre en continu dans localStorage : on recharge pour passer à la nouvelle version */location.reload()});
   st.hadController=!!navigator.serviceWorker.controller;
   reg=await navigator.serviceWorker.register('sw.js',{scope:'./'});st.swState=reg.active?'active':'installing';watch(reg);
   navigator.serviceWorker.ready.then(()=>{st.swState='active';st.hadController=st.hadController||!!navigator.serviceWorker.controller});
   document.addEventListener('visibilitychange',()=>{if(!document.hidden&&reg)reg.update().catch(()=>{})});
   setInterval(()=>{if(reg&&st.online)reg.update().catch(()=>{})},30*60*1000)
  }catch(e){st.swState='error';st.error=String(e&&e.message||e)}
  render()}
 window.LCA.pwa={state:st,install,applyUpdate,render,get registration(){return reg},version(){return new Promise(res=>{const c=navigator.serviceWorker&&navigator.serviceWorker.controller;if(!c)return res(null);const ch=new MessageChannel();ch.port1.onmessage=e=>res(e.data);c.postMessage({type:'GET_VERSION'},[ch.port2]);setTimeout(()=>res(null),1500)})}};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',render);else render();
 window.addEventListener('load',start);
})();
