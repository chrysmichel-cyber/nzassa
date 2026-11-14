/* Panneau commun des jeux de société : choix du mode à une table du village, partie (plateau ou cartes), joueurs, chronomètre, historique,
   messages rapides, invitations, revanche, classement de session. AUCUNE règle de jeu ici : la session (js/games/session.js) et le serveur décident.
   Hôte (fourni par main.js) : LCA.gamesHost = {online(), kind(), send(obj), onTables(fn), onReopen(fn), players(), room(), toast(m), freeze(bool), record(r)}. */
(function(root){
 const LCA=root.LCA=root.LCA||{};
 const G=()=>LCA.games,UI=()=>LCA.gameUI,S=()=>LCA.gameSession,K=()=>LCA.gameUI.kit;
 const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const SAY={bonjour:'Bonjour !',bien_joue:'Bien joué !',belle_partie:'Belle partie !',a_toi:'À toi !',merci:'Merci !',revanche:'Une revanche ?',patience:'Patience…',bravo:'Bravo !'};
 const GN=id=>(GAME[id]||{name:id}).name;
 const GAME={awale:{name:'Awalé',info:'2 joueurs · semer et capturer les graines (25 pour gagner).'},dames:{name:'Dames',info:'2 joueurs · dames internationales 10×10, prise obligatoire et majoritaire.'},
  echecs:{name:'Échecs',info:'2 joueurs · règles officielles (roque, prise en passant, promotion).'},belote:{name:'Belote',info:'4 joueurs en 2 équipes · 501 points · les places libres sont prises par des robots.'},
  bataille:{name:'Bataille',info:'2 joueurs · la plus forte carte gagne le pli.'},menteur:{name:'Menteur',info:'2 à 4 joueurs · pose tes cartes face cachée… ou accuse !'}};
 const LEVEL={1:'Facile',2:'Moyen',3:'Fort'},KIND={a:'compte',g:'invité',b:'robot'};
 const RS='nzassa.tables.resume.v1';
 let host=null,panel=null,inv=null,scr='idle',tableId=null,sess=null,snap=null,rd=null,rdGame=null,notice='',noticeBad=false,confirmA=null,clockT=null,offset=0,recorded=false;
 let autoShow=false,cardGame='belote',level=2,nMenteur=3,priv=false,showInvite=false,rank=null,chat=[],lastList=new Map();
 const online=()=>!!(host&&host.online&&host.online());
 const spec=()=>tableId?G().tableById(tableId):null;
 const isCard=()=>!!(spec()&&spec().game==='cartes');
 const toast=m=>{try{host&&host.toast&&host.toast(m)}catch(e){}};
 const store={get(){try{return JSON.parse(sessionStorage.getItem(RS)||'null')}catch(e){return null}},set(v){try{v?sessionStorage.setItem(RS,JSON.stringify(v)):sessionStorage.removeItem(RS)}catch(e){}}};
 /* ---------- coquille ---------- */
 function ensure(){if(panel)return panel;panel=document.createElement('section');panel.id='gamePanel';panel.className='ui glass';panel.hidden=true;panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label','Jeux de société');
  panel.innerHTML='<div id="gpTop"></div><div id="gpBoard"></div><div id="gpCtl"></div>';document.body.appendChild(panel);
  panel.addEventListener('click',onClick);panel.addEventListener('change',onChange);panel.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();close()}});return panel}
 const $p=s=>panel.querySelector(s);
 function show(){ensure();if(panel.hidden){panel.hidden=false;if(host&&host.freeze)host.freeze(true)}}
 function head(title,sub){return '<header class="gph"><div><small>'+esc(sub||'')+'</small><h2>'+esc(title)+'</h2></div><button type="button" class="lx" data-g="close" aria-label="Fermer">×</button></header>'}
 const note=()=>notice?'<p class="gpn'+(noticeBad?' bad':'')+'" role="status">'+esc(notice)+'</p>':'';
 function setNotice(t,bad){notice=t||'';noticeBad=!!bad;const n=$p('#gpTop .gpn');if(scr==='game'||scr==='wait')renderGame();else render()}
 /* ---------- écrans ---------- */
 function render(){
  if(!panel||panel.hidden)return;
  if(scr==='game'||scr==='wait')return renderGame();
  dropRenderer();const sp=spec(),top=$p('#gpTop'),ctl=$p('#gpCtl');$p('#gpBoard').innerHTML='';
  if(scr==='rank'){top.innerHTML=head('Classement des tables','Session du serveur');
   ctl.innerHTML=(rank&&rank.length?'<ol class="gprank">'+rank.map(e=>'<li><b>'+e.rank+'</b><span>'+esc(e.name)+'</span><span>'+e.pts+' pts · '+e.w+'V '+e.d+'N '+e.l+'D</span></li>').join('')+'</ol>':'<p class="sub">Aucune partie classée pour l’instant. Seules les parties en ligne entre comptes connectés, à une table publique, comptent.</p>')+
    '<p class="sub">Victoire 3 points, nulle 1 point. Le classement repart à zéro quand le serveur redémarre.</p><div class="gpbar"><button type="button" class="btn ghost" data-g="lobby">Retour</button></div>';return}
  /* lobby d'une table */
  const live=lastList.get(tableId),kind=host?host.kind():'guest_local',g=isCard()?cardGame:sp.game,liveG=live&&live.status!=='free'&&live.card&&GAME[live.game]?live.game:null;
  top.innerHTML=head(sp.name,'Place des jeux')+note();
  let h='';
  if(isCard()){h+='<section><h3>Jeu de cartes</h3><div class="gpseg" role="group" aria-label="Choix du jeu">'+G().CARD_GAMES.map(id=>'<button type="button" data-g="card" data-id="'+id+'" aria-pressed="'+(id===g)+'">'+GAME[id].name+'</button>').join('')+'</div></section>'}
  h+='<p class="sub">'+esc(GAME[g].info)+'</p>';
  h+='<section><h3>Contre l’ordinateur</h3><div class="gpseg" role="group" aria-label="Niveau">'+[1,2,3].map(l=>'<button type="button" data-g="level" data-l="'+l+'" aria-pressed="'+(l===level)+'">'+LEVEL[l]+'</button>').join('')+'</div>'+
   (g==='menteur'?'<div class="gpseg" role="group" aria-label="Nombre de joueurs">'+[2,3,4].map(n=>'<button type="button" data-g="nm" data-n="'+n+'" aria-pressed="'+(n===nMenteur)+'">'+n+' joueurs</button>').join('')+'</div>':'')+
   '<div class="gpbar"><button type="button" class="btn warm" data-g="solo">Jouer contre l’ordinateur</button></div><p class="sub">Partie 100 % sur ton appareil, sans réseau.</p></section>';
  h+='<section><h3>Avec d’autres joueurs</h3>';
  if(!online())h+='<p class="sub">'+(kind==='guest_local'?'Tu joues hors ligne. Active le monde ouvert (Profil → En ligne) pour t’asseoir avec d’autres joueurs.':'Connexion au monde ouvert indisponible pour l’instant.')+'</p>';
  else{const stTxt=!live?'':live.status==='free'?'Table libre.':live.status==='wait'?(live.n+' joueur'+(live.n>1?'s':'')+' assis'+(live.game&&live.card&&GAME[live.game]?' ('+GN(live.game)+')':'')+(live.priv?' · table privée':'')+'.'):'Partie en cours'+(live.game&&live.card&&GAME[live.game]?' ('+GN(live.game)+')':'')+(live.watchers?' · '+live.watchers+' spectateur'+(live.watchers>1?'s':''):'')+'.';
   h+='<p class="sub">'+esc(stTxt)+' '+(kind==='authenticated'?'Compte connecté : tes victoires contre d’autres comptes comptent au classement.':'Invité en ligne : parties amicales, sans classement.')+'</p>';
   if(kind==='authenticated'&&(!live||live.status==='free'))h+='<label class="gpchk"><input type="checkbox" data-g="priv"'+(priv?' checked':'')+'> Table privée (sur invitation)</label>';
   if(liveG&&liveG!==g)h+='<p class="sub">À cette table, on joue à : <b>'+GN(liveG)+'</b>.</p>';
   h+='<div class="gpbar">'+(!live||live.status!=='play'?'<button type="button" class="btn" data-g="sit">M’asseoir'+(liveG?' ('+GN(liveG)+')':'')+'</button>':'')+(live&&live.status==='play'?'<button type="button" class="btn ghost" data-g="watch">Observer la partie</button>':'')+'<button type="button" class="btn ghost" data-g="rank">Classement</button></div>'}
  h+='</section>';ctl.innerHTML=h}
 function names(){return snap&&snap.seats?snap.seats.map((s,i)=>s?s.name:'Place '+(i+1)):[]}
 function info(){return {turn:snap?snap.turn:-1,mySeat:snap&&Number.isInteger(snap.seat)?snap.seat:null,result:snap?snap.res:null,last:snap?snap.last:null,names:names()}}
 function rendererApi(){return {get seat(){return snap?snap.seat:null},
  onMove(m){if(!sess)return;notice='';const r=sess.move(m);if(r&&r.err&&sess.mode==='local'){setNotice(r.error||'Coup impossible.',true)}},
  legal(){if(!snap)return [];if(Array.isArray(snap.legal))return snap.legal;/* liste trop longue envoyée vide par le serveur : calculée sur la vue */
   const d=G().get(snap.game);try{return d&&snap.view&&Number.isInteger(snap.seat)&&snap.turn===snap.seat?d.legalMoves(snap.view,snap.seat):[]}catch(e){return []}},t:s=>s}}
 function dropRenderer(){if(rd){try{rd.destroy()}catch(e){}rd=null;rdGame=null}}
 function renderGame(){
  if(!panel||panel.hidden)return;const sp=spec(),s=snap,top=$p('#gpTop'),ctl=$p('#gpCtl'),live=sess&&sess.mode==='live';
  const g=s&&s.game,title=g?GAME[g].name:(sp?sp.name:'Partie');
  const my=s&&Number.isInteger(s.seat)?s.seat:null,playing=s&&s.phase==='play'&&!s.res,over=!!(s&&s.res);
  let t=head(title,(sess&&sess.mode==='local'?'Contre l’ordinateur · '+LEVEL[s&&s.level||level]:live?(my===null?'Observation · ':'En ligne · ')+(sp?sp.name:''):''))+note();
  if(s&&s.seats){t+='<ul class="gpseats" aria-label="Joueurs">'+s.seats.map((q,i)=>{if(!q)return '<li>Place '+(i+1)+' libre</li>';const k=q.bot?'b':q.k;
   return '<li class="'+(s.turn===i&&!over?'turn':'')+(q.up===false?' down':'')+'">'+(i===my?'<b>'+esc(q.name)+'</b> <span class="gpk">toi</span>':esc(q.name)+' <span class="gpk">'+KIND[k]+'</span>')+(q.up===false?' <span class="gpk">déconnecté</span>':'')+'</li>'}).join('')+'</ul>'}
  if(live&&s&&s.deadline&&playing)t+='<p class="sub">Temps pour jouer : <span class="gpclock" id="gpClock"></span></p>';
  top.innerHTML=t;
  /* plateau : monté une fois par partie, mis à jour ensuite */
  const board=$p('#gpBoard');
  if(s&&s.view&&g){if(rdGame!==g){dropRenderer();board.innerHTML='';const r=UI().get(g);if(r){rd=r.mount(board,rendererApi());rdGame=g}}if(rd)rd.update(s.view,info())}
  else{dropRenderer();board.innerHTML=''}
  /* commandes */
  let c='';
  if(confirmA)c+='<div class="gpconfirm" role="alertdialog"><p>'+esc(confirmA.q)+'</p><div class="row"><button type="button" class="btn warm" data-g="yes">'+esc(confirmA.yes)+'</button><button type="button" class="btn ghost" data-g="no">Annuler</button></div></div>';
  if(live&&s&&s.phase!=='play'&&!over&&my!==null){/* attente à la table */
   const hum=s.seats.filter(q=>q&&!q.bot).length,owner=s.owner&&host&&host.myPub?host.myPub()===s.owner:true;
   c+='<p class="sub">'+(g==='belote'||g==='menteur'?'Tu peux attendre d’autres joueurs ou lancer : les places libres seront prises par des robots.':g==='bataille'?'Attends un adversaire, ou lance contre un robot.':'En attente d’un adversaire…')+'</p>';
   c+='<div class="gpbar">'+((isCard())&&owner?'<button type="button" class="btn warm" data-g="start">Lancer la partie</button>':'')+'<button type="button" class="btn" data-g="inv">Inviter un joueur</button><button type="button" class="btn ghost" data-g="stand">Me lever</button></div>';
   if(showInvite){const ps=host&&host.players?host.players():[];c+='<div class="gpplayers">'+(ps.length?ps.map(p=>'<button type="button" class="btn ghost sm" data-g="invto" data-id="'+esc(p.id)+'">'+esc(p.name)+' <span class="gpk">'+(p.k==='a'?'compte':'invité')+'</span></button>').join(''):'<p class="sub">Personne d’autre dans le village pour l’instant.</p>')+'</div>'}}
  else{c+='<div class="gpbar">';
   if(playing&&my!==null)c+='<button type="button" class="btn ghost" data-g="resign">Abandonner</button>';
   if(over&&my!==null)c+='<button type="button" class="btn warm" data-g="rematch">'+(live?'Revanche'+(s.rematch?' ('+s.rematch+' prêt'+(s.rematch>1?'s':'')+')':''):'Rejouer')+'</button>';
   if(live&&my===null)c+='<button type="button" class="btn ghost" data-g="unwatch">Arrêter d’observer</button>';
   c+='<button type="button" class="btn ghost" data-g="'+(live&&my!==null?'stand':'leave')+'">'+(live&&my!==null?'Quitter la table':'Fermer la partie')+'</button></div>'}
  if(live&&my!==null)c+='<div class="gpsay" role="group" aria-label="Messages rapides">'+Object.keys(SAY).map(k=>'<button type="button" data-g="say" data-id="'+k+'">'+SAY[k]+'</button>').join('')+'</div><p class="gpchat" aria-live="polite">'+chat.slice(-3).map(m=>'<b>'+esc(m.from)+'</b> : '+esc(SAY[m.id]||'')).join(' · ')+'</p>';
  if(s&&s.hist&&s.hist.length)c+='<details><summary>Historique ('+s.hist.length+(s.hist.length>=60?'+':'')+' coups)</summary><ol class="gphist">'+s.hist.map(x=>'<li>'+esc(names()[x.seat]||'')+' : '+esc(x.note||'')+'</li>').join('')+'</ol></details>';
  ctl.innerHTML=c;tickClock()}
 function tickClock(){const el=panel&&panel.querySelector('#gpClock');if(!el||!snap||!snap.deadline)return;const left=Math.max(0,snap.deadline-(Date.now()+offset));el.textContent=Math.ceil(left/1000)+' s';el.classList.toggle('low',left<15000)}
 /* ---------- sessions ---------- */
 function onSnap(s){
  const was=snap;snap=s;if(s.mode==='live'&&typeof s.now==='number')offset=s.now-Date.now();
  if(s.phase==='play'&&!s.res)recorded=false;
  if(s.res&&!recorded&&Number.isInteger(s.seat)){recorded=true;const r=s.res,me=s.seat,res=r.draw||!r.winners||!r.winners.length?'draw':r.winners.includes(me)?'win':'loss';
   try{host&&host.record&&host.record({game:s.game,mode:s.mode,result:res,reason:r.reason,level:s.level||null,at:Date.now()})}catch(e){}}
  if(scr!=='game'&&scr!=='wait'){scr='game'}
  if(autoShow){autoShow=false;show();clearInterval(clockT);clockT=setInterval(tickClock,250);toast('Partie reprise.')}
  if(!was||was.game!==s.game)dropRenderer();
  renderGame()}
 function stopSess(){if(sess){try{sess.stop()}catch(e){}}sess=null;snap=null;dropRenderer();confirmA=null;showInvite=false;chat=[]}
 function startLocal(){
  const sp=spec(),g=isCard()?cardGame:sp.game;stopSess();
  try{sess=S().local({game:g,level,players:g==='menteur'?nMenteur:undefined,name:(host&&host.myName&&host.myName())||'Toi'})}catch(e){setNotice('Ce jeu n’est pas disponible.',true);return}
  sess.on(onSnap);notice='';scr='game';sess.start()}
 function liveSess(){
  if(sess&&sess.mode==='live'&&sess.table===tableId)return sess;stopSess();
  sess=S().live({host,table:tableId,onToken:(table,token)=>store.set({room:host.room(),table,token})});
  sess.on(onSnap);sess.onError(m=>{const t=m.error||'Action impossible.';if(m.code==='trop_loin'||m.code==='pas_en_jeu'||!snap){scr=snap?scr:'lobby'}setNotice(t,true);toast(t)});
  return sess}
 /* ---------- événements serveur hors session ---------- */
 function onTbl(m){
  if(!m||m.t!=='tbl')return;
  switch(m.ev){
   case 'list':lastList=new Map((m.tables||[]).map(x=>[x.id,x]));if(LCA.gamesWorld&&LCA.gamesWorld.setStatus)LCA.gamesWorld.setStatus(m.tables||[]);if(scr==='lobby')render();break;
   case 'left':if(sess&&sess.mode==='live'&&m.table===sess.table){store.set(null);stopSess();scr='lobby';notice='';render()}break;
   case 'rank':rank=m.top||[];if(scr==='rank')render();break;
   case 'say':chat.push(m);if(chat.length>20)chat.shift();if(scr==='game'||scr==='wait')renderGame();break;
   case 'inv':showInv(m);break;
   case 'invSent':toast('Invitation envoyée à '+m.to+'.');showInvite=false;renderGame();break;
   case 'invDeclined':toast('Invitation refusée.');break;
   case 'invOk':{toast('Invitation acceptée : va jusqu’à la '+(G().tableById(m.table)||{name:'table'}).name+' et touche-la pour t’asseoir.');pendingInv=m.table;break}
   case 'err':if(!sess){const t=m.error||'Action impossible.';if(panel&&!panel.hidden){setNotice(t,true)}else toast(t)}break}}
 let pendingInv=null;
 function showInv(m){if(!inv){inv=document.createElement('section');inv.id='gameInv';inv.className='ui glass';inv.setAttribute('role','alertdialog');inv.setAttribute('aria-label','Invitation à une table');document.body.appendChild(inv);
   inv.addEventListener('click',e=>{const b=e.target.closest('[data-gi]');if(!b)return;const id=inv.dataset.inv;inv.hidden=true;host.send({t:'tbl',op:b.dataset.gi==='yes'?'accept':'decline',inv:id})})}
  inv.dataset.inv=m.inv;inv.hidden=false;const g=m.game?GAME[m.game].name:'une partie';
  inv.innerHTML='<p><b>'+esc(m.from&&m.from.name)+'</b> t’invite à jouer : '+esc(g)+' ('+esc(m.name)+(m.priv?', table privée':'')+').</p><div class="row"><button type="button" class="btn warm" data-gi="yes">Accepter</button><button type="button" class="btn ghost" data-gi="no">Refuser</button></div>';
  clearTimeout(showInv.t);showInv.t=setTimeout(()=>{if(inv&&inv.dataset.inv===m.inv)inv.hidden=true},m.ttlMs||30000)}
 /* ---------- actions ---------- */
 function ask(q,yes,fn){confirmA={q,yes,fn};renderGame()}
 function onChange(e){const t=e.target;if(t.matches('[data-g=priv]'))priv=t.checked}
 function onClick(e){const b=e.target.closest('[data-g]');if(!b||b.disabled||b.tagName==='INPUT')return;const a=b.dataset.g;
  switch(a){
   case 'close':return close();
   case 'card':cardGame=b.dataset.id;return render();
   case 'level':level=+b.dataset.l;return render();
   case 'nm':nMenteur=+b.dataset.n;return render();
   case 'solo':return startLocal();
   case 'sit':{if(!online())return setNotice('Pas de connexion au monde ouvert.',true);notice='';const s=liveSess(),live=lastList.get(tableId);s.sit(Object.assign({},isCard()&&!(live&&G().CARD_GAMES.includes(live.game)&&live.status!=='free')?{game:cardGame}:{},priv?{priv:true}:{}));scr='wait';return render()}
   case 'watch':{if(!online())return;notice='';const s=liveSess();s.watch();scr='wait';return render()}
   case 'start':return sess&&sess.start&&sess.start();
   case 'inv':showInvite=!showInvite;return renderGame();
   case 'invto':return sess&&sess.invite(b.dataset.id);
   case 'stand':if(snap&&snap.phase==='play'&&!snap.res&&Number.isInteger(snap.seat))return ask('Quitter la table maintenant compte comme un abandon.','Abandonner et partir',()=>{sess.stand();store.set(null)});
    if(sess&&sess.mode==='live'){sess.stand();store.set(null)}return;
   case 'unwatch':if(sess&&sess.mode==='live')sess.unwatch();stopSess();scr='lobby';return render();
   case 'resign':return ask('Abandonner cette partie ?','Abandonner',()=>sess&&sess.resign());
   case 'rematch':if(sess){notice='';sess.rematch()}return;
   case 'leave':if(sess&&sess.mode==='local'&&snap&&!snap.res)return ask('La partie en cours sera perdue.','Quitter',()=>{stopSess();scr='lobby';render()});stopSess();scr='lobby';return render();
   case 'say':return sess&&sess.say&&sess.say(b.dataset.id);
   case 'rank':scr='rank';rank=null;if(online())host.send({t:'tbl',op:'rank'});return render();
   case 'lobby':scr='lobby';return render();
   case 'yes':{const f=confirmA&&confirmA.fn;confirmA=null;if(f)f();return render()}
   case 'no':confirmA=null;return render()}}
 function close(){
  if(sess&&snap&&!snap.res&&snap.phase==='play'&&Number.isInteger(snap.seat)){
   if(sess.mode==='local')return ask('Fermer abandonne la partie en cours contre l’ordinateur.','Fermer',()=>{stopSess();hide()});
   return ask('Fermer quitte la table : la partie en ligne sera perdue.','Quitter la table',()=>{sess.stand();store.set(null);stopSess();hide()})}
  if(sess&&sess.mode==='live'){if(Number.isInteger(snap&&snap.seat)||(snap==null))sess.stand();else sess.unwatch();store.set(null)}
  stopSess();hide()}
 function hide(){if(panel)panel.hidden=true;scr='idle';clearInterval(clockT);clockT=null;if(host&&host.freeze)host.freeze(false)}
 /* ---------- API ---------- */
 LCA.gamePanel={
  attach(h){host=h;if(h.onTables)h.onTables(onTbl)},
  /* ouverture depuis une table du village */
  openTable(id){if(!G().tableById(id))return;ensure();if(sess&&tableId===id&&snap){show();scr='game';renderGame();return}if(sess&&tableId!==id)stopSess();
   tableId=id;notice='';confirmA=null;scr='lobby';show();if(online())host.send({t:'tbl',op:'list'});
   if(pendingInv===id&&online()){pendingInv=null;const s=liveSess();s.sit({});scr='wait'}render();clearInterval(clockT);clockT=setInterval(tickClock,250)},
  /* appelé par l'hôte quand le monde ouvert est (re)joint : liste des tables, reprise d'une partie interrompue par un rechargement */
  onlineReady(){if(!online())return;host.send({t:'tbl',op:'list'});const r=store.get();if(r&&r.room===host.room()&&!sess){tableId=r.table;const s=liveSess();autoShow=true;s.resume(r.token);scr='game'}},
  close,isOpen:()=>!!(panel&&!panel.hidden),get state(){return {scr,tableId,snap,mode:sess?sess.mode:null,notice}},
  reset(){stopSess();store.set(null);if(inv)inv.hidden=true;hide()}};
})(typeof self!=='undefined'?self:this);
