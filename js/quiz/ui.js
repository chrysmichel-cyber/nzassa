/* Quiz du village : interface (panneau, duel, mur). AUCUNE règle de score ici en ligne : le serveur décide du temps, des points et du classement.
   Le seul calcul local est celui du mode « invité local » (hors réseau), avec les mêmes formules partagées (LCA.quizScoring) et les mêmes formes d'événements,
   pour que l'interface soit identique dans les deux cas. Le meilleur score local n'entre dans aucun classement. */
(function(){
 window.LCA=window.LCA||{};
 const $=s=>document.querySelector(s),esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const SC=()=>LCA.quizScoring,fmt=ms=>(ms/1000).toFixed(1).replace('.',',')+' s';
 let host=null,S={screen:'idle'},panel=null,tick=null,cats=[],bestTxt='',invite=null,localEng=null,lastTop=null,dismissed=false;
 const LS='nzassa.quiz.local.v1';
 const lsGet=()=>{try{return JSON.parse(localStorage.getItem(LS)||'{}')||{}}catch(e){return{}}};
 const lsSet=o=>{try{localStorage.setItem(LS,JSON.stringify(o))}catch(e){}};
 /* ---------- moteur local (invité hors ligne) : mêmes événements que le serveur ---------- */
 function localEngine(emit,village){
  const cfg=SC().config(),pool=LCA.quizPool,rng=Math.random;let m=null,timers=[];
  const T=(f,ms)=>{timers.push(setTimeout(f,ms))};const clear=()=>{timers.forEach(clearTimeout);timers=[]};
  function ask(){m.qi++;m.sentAt=performance.now();m.cur=null;emit({t:'qz',ev:'q',m:m.id,q:pool.forClient(m.qs[m.qi],m.qi),total:m.qs.length,timeMs:cfg.timeMs});m.to=setTimeout(()=>close(),cfg.timeMs+50)}
  function close(){clearTimeout(m.to);if(m.phase==='reveal')return;m.phase='reveal';const q=m.qs[m.qi];
   if(!m.cur){m.cur={c:null,res:SC().judge(cfg,{correct:false,rawMs:null})};m.score+=0;m.timeMs+=m.cur.res.ms;m.answers.push({i:m.qi,c:null,ok:false,points:0,ms:m.cur.res.ms,none:true})}
   const pc=m.cur;emit({t:'qz',ev:'r',m:m.id,i:m.qi,correct:q.answer,explanation:q.explanation,you:{c:pc.c,ok:pc.res.ok,pts:pc.res.points,ms:pc.res.ms,bonus:pc.res.bonus||0,none:!!pc.res.none},opp:null,scores:{you:m.score,opp:null},times:{you:m.timeMs,opp:null},revealMs:cfg.revealMs,last:m.qi===m.qs.length-1});
   T(()=>{m.phase='ask';if(m.qi>=m.qs.length-1)end();else ask()},cfg.revealMs)}
  function end(){const b=lsGet(),key='best_'+village;let imp=false;if(!b[key]||SC().compare({score:m.score,timeMs:m.timeMs},b[key])<0){b[key]={score:m.score,timeMs:m.timeMs};lsSet(b);imp=true}
   emit({t:'qz',ev:'end',m:m.id,mode:'solo',village,you:{score:m.score,timeMs:m.timeMs,answers:m.answers},opp:null,outcome:'solo',reason:'score',max:SC().maxPoints(Object.assign({},cfg,{questions:m.qs.length})),rank:{ranked:false,reason:'local',improved:imp}});m=null}
  return {send(o){
   if(o.op==='start'){if(m)return;let qs;try{qs=pool.pick({village,count:cfg.questions,rng,cat:o.cat||null})}catch(e){emit({t:'qz',ev:'err',code:'no_questions',error:'Pas assez de questions pour ce village et cette catégorie.'});return}
    m={id:'L'+Date.now(),qs,qi:-1,score:0,timeMs:0,answers:[],phase:'ask'};
    emit({t:'qz',ev:'start',m:m.id,mode:'solo',village,n:qs.length,timeMs:cfg.timeMs,countdownMs:cfg.countdownMs,cat:o.cat?pool.categoryName(o.cat):null,you:0,players:[{slot:0,name:'Toi',k:'g'}],scoring:{base:cfg.base,bonusMax:cfg.bonusMax,bonusWindowMs:cfg.bonusWindowMs},ranked:false,local:true});
    T(ask,cfg.countdownMs)}
   else if(o.op==='ans'&&m&&m.phase==='ask'&&!m.cur&&o.i===m.qi){const q=m.qs[m.qi];m.cur={c:o.c,res:SC().judge(cfg,{correct:o.c===q.answer,rawMs:performance.now()-m.sentAt,compMs:0})};m.score+=m.cur.res.points;m.timeMs+=m.cur.res.ms;m.answers.push({i:m.qi,c:o.c,ok:m.cur.res.ok,points:m.cur.res.points,ms:m.cur.res.ms});emit({t:'qz',ev:'a',m:m.id,i:m.qi});close()}
   else if(o.op==='abandon'&&m){clear();clearTimeout(m.to);const id=m.id;m=null;emit({t:'qz',ev:'left',m:id})}
   else if(o.op==='top'){emit({t:'qz',ev:'top',village,top:[],best:lsGet()['best_'+village]||null,local:true})}},stop(){clear();if(m)clearTimeout(m.to);m=null}}}
 /* ---------- transport ---------- */
 const online=()=>host&&host.online();
 function out(o){if(online()){if(!host.send(o)){toast('Connexion perdue : reconnexion en cours.');return false}return true}
  if(!localEng)localEng=localEngine(onEvent,host.village());localEng.send(o);return true}
 const toast=m=>{try{(host&&host.toast||(()=>{}))(m)}catch(e){}};
 /* ---------- événements (serveur ou moteur local) ---------- */
 function onEvent(m){
  if(!m||m.t!=='qz')return;
  switch(m.ev){
   case 'top':lastTop=m;if(LCA.quizWall&&host&&m.village===host.village())LCA.quizWall.setTop(m.village,host.villageName(),m.top||[]);
    bestTxt=m.best?('Ton meilleur : '+m.best.score+' pts en '+fmt(m.best.timeMs)):'';if(S.screen==='menu'||S.screen==='wall')render();break;
   case 'start':clearTick();S={screen:'count',m:m.m,mode:m.mode,n:m.n,timeMs:m.timeMs,cat:m.cat,you:m.you,players:m.players,ranked:!!m.ranked,local:!!m.local,resume:m.resume,until:Date.now()+m.countdownMs,scoring:m.scoring,scores:{you:0,opp:0},answered:false};
    if(host.setResume)host.setResume(m.m,m.resume);invite=null;open(true);render();startTick();break;
   case 'q':S.screen='ask';S.q=m.q;S.qi=m.q.i;S.total=m.total;S.timeMs=m.timeMs;S.until=Date.now()+m.timeMs;S.answered=false;S.picked=null;S.banner=S.banner&&S.banner.keep?S.banner:null;render();startTick();break;
   case 'a':S.answered=true;render();break;
   case 'r':S.screen='reveal';S.r=m;S.scores=m.scores;clearTick();render();break;
   case 'end':clearTick();S.screen='end';S.end=m;if(host.setResume)host.setResume(null);render();if(online()&&host.refreshTop)host.refreshTop();open(true);break;
   case 'left':clearTick();S={screen:'menu'};if(host.setResume)host.setResume(null);render();break;
   case 'inv':invite={id:m.inv,from:m.from,until:Date.now()+m.ttlMs};if(!S.m)showInvite();else out({t:'qz',op:'decline',inv:m.inv});break;
   case 'invSent':S={screen:'wait',inv:m.inv,to:m.to,until:Date.now()+m.ttlMs};open(true);render();startTick();break;
   case 'invDeclined':if(S.screen==='wait'){S={screen:'menu',notice:m.why==='busy'?'Ton ami est déjà en quiz.':'Ton ami a refusé le défi.'};clearTick();render()}break;
   case 'invExpired':case 'invCancelled':if(invite&&invite.id===m.inv){invite=null;hideInvite()}if(S.screen==='wait'){S={screen:'menu',notice:'Le défi n’a pas été accepté à temps.'};clearTick();render()}break;
   case 'oppLeft':S.banner={t:'Ton adversaire a quitté le quiz : tu gagnes par forfait si tu termines.',keep:1};render();break;
   case 'oppDown':S.banner={t:'Ton adversaire est déconnecté. Le quiz continue ; il peut revenir quelques secondes.',keep:1};render();break;
   case 'oppBack':S.banner=null;render();break;
   case 'resume':{const oldMs=m.timeMs;S=Object.assign(S.m?S:{},{m:m.m,mode:m.mode,n:m.n,you:m.you,timeMs:oldMs,scores:m.scores,answered:m.answered,screen:m.phase==='ask'?(m.q?'ask':'reveal'):m.phase==='countdown'?'count':'reveal',total:m.n,banner:m.oppLeft?{t:'Ton adversaire a quitté le quiz.',keep:1}:null});
    if(m.q){S.q=m.q;S.qi=m.q.i;S.until=Date.now()+m.q.remainMs}open(true);render();startTick();break}
   case 'err':if(S.screen==='wait'||S.screen==='menu'||S.screen==='pick'||S.screen==='idle')S.notice=m.error||'Action impossible.';toast(m.error||'Quiz : action impossible.');render();break}}
 /* ---------- rendu ---------- */
 function clearTick(){if(tick){clearInterval(tick);tick=null}}
 function startTick(){clearTick();tick=setInterval(()=>{if(S.screen==='ask'){const l=Math.max(0,S.until-Date.now()),b=panel&&panel.querySelector('#qzBar'),t=panel&&panel.querySelector('#qzLeft');if(b)b.style.width=(l/S.timeMs*100)+'%';if(t)t.textContent=Math.ceil(l/1000)+' s'}
   else if(S.screen==='count'){const t=panel&&panel.querySelector('#qzCd');if(t)t.textContent=Math.max(0,Math.ceil((S.until-Date.now())/1000))}
   else if(S.screen==='wait'){const t=panel&&panel.querySelector('#qzW');if(t)t.textContent=Math.max(0,Math.ceil((S.until-Date.now())/1000))}
   if(invite){const t=document.querySelector('#qzInvT');if(t)t.textContent=Math.max(0,Math.ceil((invite.until-Date.now())/1000));if(Date.now()>invite.until){invite=null;hideInvite()}}},200)}
 function ensurePanel(){if(panel)return panel;panel=document.createElement('section');panel.id='quizPanel';panel.className='ui glass';panel.hidden=true;panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label','Quiz du village');document.body.appendChild(panel);
  panel.addEventListener('click',onClick);panel.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();closeUI()}});return panel}
 function open(force){ensurePanel();if(!force&&S.screen==='idle')S={screen:'menu'};panel.hidden=false;if(S.screen==='idle')S={screen:'menu'};render();if(host&&host.freeze)host.freeze(true)}
 function closeUI(){if(S.m&&(S.screen==='ask'||S.screen==='reveal'||S.screen==='count')){if(!confirm('Quitter le quiz en cours ? Tu perdras la partie.'))return;out({t:'qz',op:'abandon'})}
  if(S.screen==='wait')out({t:'qz',op:'cancel'});
  clearTick();if(panel)panel.hidden=true;S={screen:'idle'};if(host&&host.freeze)host.freeze(false)}
 const kindTxt=k=>k==='a'?'compte':'invité';
 function render(){if(!panel||panel.hidden)return;const L=[];const head=(t)=>'<header class="qzh"><div><small>Village '+esc(host.villageName())+'</small><h2>'+t+'</h2></div><button class="lx" data-qz="close" aria-label="Fermer">×</button></header>';
  const note=S.notice?'<p class="qzn" role="status">'+esc(S.notice)+'</p>':'',ban=S.banner?'<p class="qzb" role="status">'+esc(S.banner.t)+'</p>':'';
  const kind=host.kind(),ranked=online()&&kind==='authenticated';
  if(S.screen==='menu'){
   if(!cats.length&&LCA.quizPool)cats=LCA.quizPool.categoryIds().map(id=>({id,name:LCA.quizPool.categoryName(id)}));
   const ok=LCA.quizPool&&LCA.quizPool.hasVillage(host.room());
   L.push(head('Quiz du village')+note);
   if(!ok)L.push('<p class="qzn">Ce village n’a pas encore de questions.</p>');
   L.push('<p class="sub">'+(online()?(ranked?'Compte connecté : ton meilleur match de 10 questions peut entrer au Top 10 du village.':'Invité en ligne : tu peux jouer et défier un ami, mais tu n’entres pas au classement officiel. Connecte-toi avec un compte pour y figurer.'):'Mode hors ligne : ton meilleur score reste sur cet appareil, sans classement.')+'</p>'+(bestTxt?'<p class="qzbest">'+esc(bestTxt)+'</p>':''));
   L.push('<div class="qzgrid"><button class="btn warm" data-qz="solo" data-cat=""'+(ok?'':' disabled')+'>Quiz seul · 10 questions</button>'+
    (online()?'<button class="btn" data-qz="pick"'+(ok?'':' disabled')+'>Défier un ami</button>':'<button class="btn ghost" disabled title="Nécessite le mode en ligne">Défier un ami (en ligne)</button>')+
    '<button class="btn ghost" data-qz="wall">Mur des champions</button></div>');
   if(cats.length)L.push('<details class="qzcats"><summary>Une seule catégorie (entraînement, hors classement)</summary><div class="qzchips">'+cats.map(c=>'<button class="chip" data-qz="solo" data-cat="'+esc(c.id)+'">'+esc(c.name)+'</button>').join('')+'</div></details>');
  }else if(S.screen==='pick'){
   const ps=host.players();L.push(head('Défier un ami')+'<p class="sub">Choisis un joueur connecté dans ton village. Il recevra ton défi et pourra l’accepter ou le refuser. Les questions seront identiques pour vous deux.</p>');
   L.push(ps.length?'<ul class="qzpl">'+ps.map(p=>'<li><span><b>'+esc(p.name)+'</b> <small>'+kindTxt(p.k)+'</small></span><button class="btn sm" data-qz="chal" data-id="'+esc(p.id)+'">Défier</button></li>').join('')+'</ul>':'<p class="qzn">Personne d’autre n’est connecté dans ce village pour le moment.</p>');
   L.push('<div class="row"><button class="btn ghost" data-qz="menu">Retour</button></div>')}
  else if(S.screen==='wait'){L.push(head('Défi envoyé')+'<p class="sub">En attente de la réponse de <b>'+esc(S.to&&S.to.name)+'</b>… (<span id="qzW">30</span> s)</p><div class="row"><button class="btn ghost" data-qz="cancel">Annuler le défi</button></div>')}
  else if(S.screen==='count'){L.push(head(S.mode==='duel'?'Duel du village':'Quiz du village')+ban+'<p class="qzcd">Prépare-toi… <b id="qzCd">'+Math.max(0,Math.ceil((S.until-Date.now())/1000))+'</b></p>'+(S.mode==='duel'?'<p class="sub">'+S.players.map(p=>esc(p.name)).join(' contre ')+' · '+S.n+' questions identiques</p>':'<p class="sub">'+S.n+' questions'+(S.cat?' · '+esc(S.cat):' · toutes catégories')+'. Réponds vite : une bonne réponse rapide rapporte un bonus.</p>')+(S.ranked?'<p class="qzbest">Match classé : compte pour le Top 10.</p>':'<p class="sub">Match non classé'+(S.local?' (hors ligne).':host.kind()==='authenticated'?' (catégorie ou format spécial).':' (invité).')+'</p>'))}
  else if(S.screen==='ask'){const q=S.q,opp=S.mode==='duel'?S.players.find(p=>p.slot!==S.you):null;
   L.push(head('Question '+(S.qi+1)+' / '+S.total)+ban+'<div class="qztime"><div id="qzBar"></div></div><p class="qzleft"><span id="qzLeft">'+Math.ceil(Math.max(0,S.until-Date.now())/1000)+' s</span> · <small>'+esc(q.catName||'')+'</small></p><p class="qzq">'+esc(q.prompt)+'</p>'+(q.text?'<p class="qzt">'+esc(q.text)+'</p>':'')+
    '<div class="qzopts" role="group" aria-label="Réponses">'+q.options.map(o=>'<button class="qzopt" data-qz="ans" data-c="'+esc(o.id)+'"'+(S.answered?' disabled':'')+(S.picked===o.id?' aria-pressed="true"':'')+'><b>'+esc(o.id.toUpperCase())+'</b> '+esc(o.text)+'</button>').join('')+'</div>'+
    (S.answered?'<p class="qzn" role="status">Réponse envoyée'+(opp?' · en attente de '+esc(opp.name):'')+'…</p>':''))}
  else if(S.screen==='reveal'){const r=S.r,q=S.q,you=r.you,opp=r.opp;const o=q.options.find(x=>x.id===r.correct);
   L.push(head('Question '+(r.i+1)+' / '+S.total)+ban+'<p class="qzq">'+esc(q.prompt)+'</p>'+
    '<p class="qzres" data-ok="'+(you.ok?1:0)+'">'+(you.none?'Temps écoulé : 0 point.':you.ok?'Bonne réponse ! +'+you.pts+' pts'+(you.bonus?' (dont bonus rapidité '+you.bonus+')':'')+' · '+fmt(you.ms):'Mauvaise réponse : 0 point.')+'</p>'+
    '<p class="qzgood">Bonne réponse : <b>'+esc(o?o.text:r.correct)+'</b></p>'+(r.explanation?'<p class="sub">'+esc(r.explanation)+'</p>':'')+
    (opp?'<p class="sub">'+esc((S.players.find(p=>p.slot!==S.you)||{}).name)+' : '+(opp.none?'pas de réponse':opp.ok?'+'+opp.pts+' pts':'0 point')+'</p>':'')+
    '<p class="qzsc">Score : <b>'+r.scores.you+'</b>'+(r.scores.opp!=null?' · adversaire <b>'+r.scores.opp+'</b>':'')+' · temps '+fmt(r.times.you)+'</p>')}
  else if(S.screen==='end'){const e=S.end,y=e.you,o=e.opp,rk=e.rank||{};
   const out2=e.outcome==='win'?'Victoire !':e.outcome==='loss'?'Défaite':e.outcome==='draw'?'Égalité parfaite':'Quiz terminé';
   const why=e.outcome==='draw'||e.outcome==='solo'?'':e.reason==='forfait'?' (forfait de l’adversaire)':e.reason==='temps'?' (même score, départagés au temps)':' (au score)';
   const rt=rk.ranked?(rk.duplicate?'Résultat déjà enregistré.':rk.improved?'Nouveau meilleur score du village ! Classement : n°'+rk.rank+'.':'Match classé : ton meilleur score est conservé'+(rk.rank?' (n°'+rk.rank+')':'')+'.'):
    rk.reason==='local'?(rk.improved?'Nouveau meilleur score sur cet appareil.':'Meilleur score local conservé.')+' (aucun classement hors ligne)':rk.reason==='invité'?'Non classé : connecte-toi avec un compte pour entrer au Top 10.':rk.reason==='abandon'?'Non classé : quiz abandonné.':rk.reason==='catégorie'?'Non classé : entraînement par catégorie.':'Non classé.';
   L.push(head(out2+why)+'<table class="qzcmp"><thead><tr><th></th><th>Score</th><th>Temps</th></tr></thead><tbody><tr><th>Toi</th><td>'+y.score+' / '+e.max+'</td><td>'+fmt(y.timeMs)+'</td></tr>'+(o?'<tr><th>'+esc(o.name)+(o.forfeited?' (a quitté)':'')+'</th><td>'+o.score+' / '+e.max+'</td><td>'+fmt(o.timeMs)+'</td></tr>':'')+'</tbody></table><p class="qzbest" id="qzRank">'+esc(rt)+'</p>'+
    '<div class="row"><button class="btn warm" data-qz="menu">Rejouer</button><button class="btn ghost" data-qz="wall">Mur des champions</button><button class="btn ghost" data-qz="close">Fermer</button></div>')}
  else if(S.screen==='wall'){const w=LCA.quizWall&&LCA.quizWall.state,top=(w&&w.top)||[];
   L.push(head('Mur des champions')+(online()?'':'<p class="qzn">Le classement du village est en ligne : hors ligne, seul ton meilleur score local est gardé.</p>')+
    (top.length?'<ol class="qztop">'+top.map(e=>'<li><b>'+e.rank+'</b><span>'+esc(e.name)+'</span><em>'+e.score+' pts</em><small>'+fmt(e.timeMs)+'</small></li>').join('')+'</ol>':'<p class="sub">Aucun champion pour l’instant.</p>')+(bestTxt?'<p class="qzbest">'+esc(bestTxt)+'</p>':'')+'<div class="row"><button class="btn ghost" data-qz="menu">Retour</button></div>')}
  panel.innerHTML=L.join('');
  if(S.screen==='ask'||S.screen==='reveal'){const f=panel.querySelector('.qzopt:not([disabled])');if(f&&!panel.contains(document.activeElement))try{f.focus({preventScroll:true})}catch(e){}}}
 function onClick(e){const b=e.target.closest('[data-qz]');if(!b||b.disabled)return;const a=b.dataset.qz;
  if(a==='close')closeUI();
  else if(a==='menu'){S={screen:'menu'};if(online()&&host.refreshTop)host.refreshTop();render()}
  else if(a==='solo'){S.notice='';out({t:'qz',op:'start',cat:b.dataset.cat||undefined})}
  else if(a==='pick'){S={screen:'pick'};render()}
  else if(a==='chal')out({t:'qz',op:'challenge',to:b.dataset.id});
  else if(a==='cancel'){out({t:'qz',op:'cancel'});S={screen:'menu'};clearTick();render()}
  else if(a==='wall'){S={screen:'wall'};if(online()&&host.refreshTop)host.refreshTop();else out({t:'qz',op:'top'});render()}
  else if(a==='ans'){if(S.answered)return;S.picked=b.dataset.c;S.answered=true;render();out({t:'qz',op:'ans',m:S.m,i:S.qi,c:b.dataset.c})}}
 /* ---------- invitation reçue ---------- */
 function showInvite(){let d=document.querySelector('#qzInv');if(!d){d=document.createElement('section');d.id='qzInv';d.className='ui glass';d.setAttribute('role','alertdialog');d.setAttribute('aria-label','Défi reçu');document.body.appendChild(d);
   d.addEventListener('click',e=>{const b=e.target.closest('[data-qzi]');if(!b||!invite)return;const id=invite.id;invite=null;hideInvite();out({t:'qz',op:b.dataset.qzi==='yes'?'accept':'decline',inv:id})})}
  d.innerHTML='<p><b>'+esc(invite.from.name)+'</b> te défie au quiz du village !</p><p class="sub">Mêmes 10 questions pour vous deux. Réponse dans <span id="qzInvT">'+Math.ceil((invite.until-Date.now())/1000)+'</span> s.</p><div class="row"><button class="btn warm" data-qzi="yes">Accepter</button><button class="btn ghost" data-qzi="no">Refuser</button></div>';d.hidden=false;startTick()}
 function hideInvite(){const d=document.querySelector('#qzInv');if(d)d.hidden=true}
 /* ---------- API ---------- */
 LCA.quizUI={
  attach(h){host=h;if(h.onEvent)h.onEvent(onEvent)},
  onEvent,open(){if(!host)return;ensurePanel();S={screen:'menu'};if(online()&&host.refreshTop)host.refreshTop();open(true)},
  openWall(){if(!host)return;ensurePanel();S={screen:'wall'};if(online()&&host.refreshTop)host.refreshTop();else out({t:'qz',op:'top'});open(true)},
  close:closeUI,isOpen:()=>!!(panel&&!panel.hidden),get state(){return S},get lastTop(){return lastTop},
  /* à la reconnexion du socket : reprise du quiz en cours (jeton) et rafraîchissement du Top 10 */
  reopened(){if(S.m&&host&&host.resumeToken&&host.resumeToken())out({t:'qz',op:'resume',m:S.m,token:host.resumeToken()});else if(host.refreshTop)host.refreshTop()},
  reset(){clearTick();if(localEng){localEng.stop();localEng=null}S={screen:'idle'};invite=null;hideInvite();if(panel)panel.hidden=true;if(host&&host.freeze)host.freeze(false)}}})();
