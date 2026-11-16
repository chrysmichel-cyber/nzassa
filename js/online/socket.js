/* Transport WebSocket du monde ouvert. Présente à LCA.worldClient la MÊME interface que le transport HTTP (join, sync, report, leave, setSession) :
   le client du monde (js/online/world.js) et l'interface n'ont donc pas à changer de logique.
   - join() envoie le jeton de compte (si fourni par getToken) : le serveur le fait valider par Supabase ; sans jeton, on est invité en ligne.
   - Les messages du serveur sont des DELTAS ; ce module les assemble en un instantané complet renvoyé par sync().
   - Coupure de connexion : reconnexion automatique avec attente progressive et variation aléatoire ; un jeton frais est redemandé à chaque tentative.
   - Fin définitive (jeton refusé, serveur complet…) : onFatal({code,message}) est appelé ; plus aucune tentative automatique.
   Module pur (navigateur + Node) : WebSocket et horloge sont injectables. */
(function(root,f){if(typeof module==='object'&&module.exports)module.exports=f();else{root.LCA=root.LCA||{};root.LCA.worldSocket=f()}})(typeof self!=='undefined'?self:this,function(){
 const wsUrl=base=>String(base||'').replace(/\/+$/,'').replace(/^http/,'ws')+'/v1/ws';
 const FATAL=new Set(['name_reserved','bad_token','auth_unavailable','bad_name','bad_room','consent_required','server_full','room_full','expired']);
 function create(o){
  o=o||{};const WS=o.WebSocket||(typeof WebSocket!=='undefined'?WebSocket:null),now=o.now||(()=>Date.now()),url=o.url||wsUrl(o.apiBase),getToken=o.getToken||null,
   onFatal=o.onFatal||(()=>{}),setT=o.setTimeout||setTimeout,clearT=o.clearTimeout||clearTimeout,joinTimeout=o.joinTimeoutMs||8000,backoff=o.backoffMs||500;
  let ws=null,args=null,wanted=false,state='idle',tries=0,retryTimer=null,welcome=null,pendingJoin=null;
  let stopped=false,needReset=false,qzHandlers=[],pmHandlers=[],tblHandlers=[],actHandlers=[],nearQ=[],openHandlers=[],players=new Map(),chat=[],cursor=0,online=0,chatError=null,lastSent={x:1e9,z:1e9,h:1e9,a:-1,t:0},fatal=null;

  const err=(code,message,status)=>Object.assign(new Error(message||code),{code,status});
  const send=m=>{if(ws&&ws.readyState===1){ws.send(JSON.stringify(m));return true}return false};

  function reset(st){players=new Map();(st.players||[]).forEach(p=>players.set(p.id,Object.assign({},p)));chat=(st.chat||[]).slice();cursor=st.cursor||0;online=st.online||players.size+1;chatError=null;lastSent={x:1e9,z:1e9,h:1e9,a:-1,t:0}}
  function apply(m){
   (m.add||[]).forEach(p=>players.set(p.id,Object.assign({},p)));
   (m.mv||[]).forEach(e=>{const p=players.get(e[0]);if(p){p.x=e[1];p.z=e[2];p.h=e[3];p.a=e[4];p.e=e[5]||0}});
   (m.rm||[]).forEach(id=>players.delete(id));
   if(m.chat)m.chat.forEach(c=>{chat.push(c);if(c.n>cursor)cursor=c.n});while(chat.length>100)chat.shift();
   if(typeof m.on==='number')online=m.on}

  /* Ouvre une connexion et attend « welcome ». Rejette avec {code,fatal}. */
  function open(){
   return new Promise((ok,ko)=>{
    if(!WS){ko(err('offline','WebSocket indisponible dans ce navigateur.'));return}
    let settled=false,sock;const done=(fn,v)=>{if(!settled){settled=true;clearT(to);fn(v)}};
    const to=setT(()=>{done(ko,err('timeout','Le serveur ne répond pas.'));try{sock.close()}catch(e){}},joinTimeout);
    (async()=>{
     let token=null;if(getToken){try{token=await getToken()}catch(e){token=null}}
     if(args.requireToken&&!token)return done(ko,Object.assign(err('bad_token','Session de compte introuvable : reconnecte-toi.',401),{fatal:true}));
     try{sock=new WS(url)}catch(e){return done(ko,err('offline','Connexion impossible.'))}
     ws=sock;
     sock.onopen=()=>{const j={t:'join',name:args.name,room:args.room,consent:args.consent===true,avatar:args.avatar,x:args.x,z:args.z};if(token)j.token=token;else if(args.requireToken)j.kind='authenticated';sock.send(JSON.stringify(j))};
     sock.onmessage=ev=>{let m;try{m=JSON.parse(ev.data)}catch(e){return}
      if(m.t==='qzp'){send({t:'qzp',n:m.n});return}/* sonde de latence du quiz : réponse immédiate (le serveur mesure lui-même) */
      if(m.t==='qz'){qzHandlers.forEach(h=>{try{h(m)}catch(e){}});return}
      if(m.t==='tbl'){tblHandlers.forEach(h=>{try{h(m)}catch(e){}});return}
      if(m.t==='nc'){if(m.m){nearQ.push(Object.assign({near:true},m.m));if(nearQ.length>30)nearQ.shift()}return}/* chat de proximité : livré au prochain sync() */
      if(m.t==='pm'){if(m.m)pmHandlers.forEach(h=>{try{h(m.m)}catch(e){}});return}
      if(m.t==='act'){actHandlers.forEach(h=>{try{h(m)}catch(e){}});return}
      if(m.t==='welcome'){welcome=m;reset(m.state||{});state='open';done(ok,m);return}
      if(m.t==='err'&&!welcome){done(ko,Object.assign(err(m.code,m.error),{fatal:FATAL.has(m.code)||!!m.fatal}));return}
      if(!welcome)return;
      if(m.t==='s')apply(m);
      else if(m.t==='err')chatError={code:m.code,error:m.error};
      else if(m.t==='expired'){fatal={code:'expired',message:'Ta session de compte a expiré.'}}
     };
     sock.onclose=ev=>{if(sock!==ws)return;
      if(!settled)return done(ko,Object.assign(err(ev.code===4401?'bad_token':'offline',ev.code===4401?'Session de compte refusée.':'Connexion fermée.'),{fatal:ev.code===4401||ev.code===4503||ev.code===4409,closeCode:ev.code}));
      state='down';welcome=null;if(wanted)scheduleRetry(ev.code)};
     sock.onerror=()=>{}
    })()})}

  function scheduleRetry(code){
   if(!wanted||retryTimer)return;
   if(code===4401||(fatal&&fatal.code==='expired')){/* jeton expiré ou refusé : on tente UNE fois avec un jeton frais (Supabase le renouvelle) */ if(tries>0){stopFatal(fatal||{code:'bad_token',message:'Session de compte refusée.'});return}}
   const d=Math.min(8000,backoff*2**Math.min(tries,4))*(.5+Math.random()*.5);tries++;
   retryTimer=setT(async()=>{retryTimer=null;if(!wanted)return;
    try{fatal=null;const w=await open();tries=0;welcome=w;needReset=true;openHandlers.forEach(h=>{try{h(true)}catch(e){}})}
    catch(e){if(e.fatal)stopFatal(e);else scheduleRetry(0)}},d)}
  function stopFatal(e){wanted=false;state='idle';stopped=true;try{ws&&ws.close()}catch(_){}onFatal({code:e.code,message:e.message})}

  return {
   async join(a){args=a;wanted=true;stopped=false;tries=0;fatal=null;if(retryTimer){clearT(retryTimer);retryTimer=null}
    try{const w=await open();return {sid:'ws',id:w.id,name:w.name,room:w.room,kind:w.kind,limits:w.limits,tickMs:w.tickMs,state:snapshot()}}
    catch(e){wanted=false;state='idle';throw e}},
   /* Envoie la position (si elle a changé, ou au moins chaque seconde) et le message de chat éventuel ; renvoie l'état courant. */
   async sync(b){
    if(stopped)throw Object.assign(err('stopped','Connexion arrêtée.'),{status:410});/* arrêt définitif : surtout pas de nouvelle tentative automatique du client du monde */
    if(state!=='open'||!ws||ws.readyState!==1)throw Object.assign(err(wanted?'reconnecting':'closed','Connexion perdue.'),{status:wanted?503:401});
    if(fatal&&fatal.code==='expired'){/* le serveur va fermer : la reconnexion se fera avec un jeton frais */}
    b=b||{};const t=now(),moved=Math.abs((b.x||0)-lastSent.x)>.01||Math.abs((b.z||0)-lastSent.z)>.01||Math.abs((b.h||0)-lastSent.h)>.01||b.a!==lastSent.a;
    if(moved||t-lastSent.t>1000){send({t:'pos',x:b.x,z:b.z,h:b.h,a:b.a});lastSent={x:b.x||0,z:b.z||0,h:b.h||0,a:b.a,t}}
    if(typeof b.say==='string'&&b.say)send(b.near?{t:'chat',text:b.say,near:true}:{t:'chat',text:b.say});
    const st=snapshot(needReset?null:b.since);if(needReset){st.reset=true;needReset=false}if(chatError){st.chatError=chatError;chatError=null}if(nearQ.length)st.near=nearQ.splice(0);return st},
   /* social (phase 4) : emotes et activités collectives ; uniquement en WebSocket */
   emote(id){return send({t:'emote',id})},onActivity(fn){actHandlers.push(fn);return ()=>{actHandlers=actHandlers.filter(x=>x!==fn)}},nearChat:true,
   report:async id=>{if(!send({t:'report',id}))throw err('closed','Connexion perdue.',503);return {reported:true}},
   async leave(){wanted=false;if(retryTimer){clearT(retryTimer);retryTimer=null}try{send({t:'leave'});ws&&ws.close(1000)}catch(e){}state='idle';return {left:true}},
   setSession(){},
   /* Quiz : messages t:'qz' reçus du serveur, envoi brut, notification de reconnexion */
   onQuiz(fn){qzHandlers.push(fn);return ()=>{qzHandlers=qzHandlers.filter(x=>x!==fn)}},onTables(fn){tblHandlers.push(fn);return ()=>{tblHandlers=tblHandlers.filter(x=>x!==fn)}},onReopen(fn){openHandlers.push(fn);return ()=>{openHandlers=openHandlers.filter(x=>x!==fn)}},
   onPm(fn){pmHandlers.push(fn);return ()=>{pmHandlers=pmHandlers.filter(x=>x!==fn)}},pm(to,text){return send({t:'pm',to:String(to),text:String(text)})},privateChat:true,
   sendRaw(obj){return send(obj)},get open(){return state==='open'},
   get state(){return state},get kind(){return welcome?welcome.kind:null}};
  function snapshot(since){return {players:[...players.values()],chat:since==null?chat.slice():chat.filter(m=>m.n>since),cursor,online}}}
 return {create,wsUrl}});
