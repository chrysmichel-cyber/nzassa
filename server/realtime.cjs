/* Temps réel N'Zassa : couche WebSocket au-dessus du monde existant (server/world.cjs, inchangé dans ses règles).
   - Une connexion = une session ; la fermeture de la connexion libère le joueur (pas besoin d'attendre l'expiration par inactivité).
   - Le serveur envoie des DELTAS (arrivées, déplacements, départs, messages) à 10 Hz, uniquement aux joueurs du même salon et à portée (zone d'intérêt).
   - Rien n'est cru sur parole : identité Supabase vérifiée par verifyToken, statut déterminé par le serveur, limites de débit par connexion. */
'use strict';
const {WebSocketServer}=require('ws');
const {WorldError}=require('./world.cjs');

const DEFAULTS={near:14,danceR:8,danceCooldownMs:30000,path:'/v1/ws',tickMs:100,maxMsgBytes:4096,joinTimeoutMs:5000,pingMs:25000,maxConnections:60,perIp:10,aoi:80,burst:40,perSec:30,maxViolations:20,maxBuffered:512*1024,origins:null};
const r2=v=>Math.round(v*100)/100;

function createRealtime(o){
 const world=o.world,guard=o.nameGuard||null,verify=o.verifyToken||null,now=o.now||(()=>Date.now()),cfg=Object.assign({},DEFAULTS,o.config||{});
 const wss=new WebSocketServer({noServer:true,maxPayload:cfg.maxMsgBytes,perMessageDeflate:false});
 const conns=new Set(),perIp=new Map();
 const metrics={accepted:0,rejected:0,msgsIn:0,msgsOut:0,bytesOut:0,dropped:0,closed:0,violations:0,badJson:0};
 let tickTimer=null,pingTimer=null,closing=false;
 const bySid=new Map();/* sid du monde → connexion (pour que le quiz puisse écrire à un joueur) */

 function send(c,obj){
  const ws=c.ws;if(ws.readyState!==1)return;
  if(ws.bufferedAmount>cfg.maxBuffered){metrics.dropped++;if(ws.bufferedAmount>cfg.maxBuffered*4)ws.terminate();return}
  const d=JSON.stringify(obj);metrics.msgsOut++;metrics.bytesOut+=d.length;ws.send(d)}
 const fail=(c,code,error,close)=>{send(c,{t:'err',code,error,fatal:!!close});if(close)c.ws.close(close,String(code).slice(0,100))};

 const api={send:(sid,obj)=>{const c=bySid.get(sid);if(c)send(c,obj)},broadcastRoom:(room,obj)=>{for(const c of conns)if(c.sid&&c.room===room)send(c,obj)}};
 const quiz=o.quizFactory?o.quizFactory(api):null,tbl=o.tablesFactory?o.tablesFactory(api):null;
 function allowedOrigin(req){const org=req.headers.origin;if(!cfg.origins||!org)return true;return cfg.origins.includes('*')||cfg.origins.includes(org)}
 function reject(socket,code,text){metrics.rejected++;try{socket.write('HTTP/1.1 '+code+' '+text+'\r\nConnection: close\r\nContent-Length: 0\r\n\r\n')}catch(e){}socket.destroy()}

 /* Appelé par le serveur HTTP sur l'événement « upgrade ». */
 function handleUpgrade(req,socket,head,ip){
  let p;try{p=new URL(req.url,'http://x').pathname}catch(e){return reject(socket,400,'Bad Request')}
  if(p!==cfg.path)return reject(socket,404,'Not Found');
  if(closing)return reject(socket,503,'Service Unavailable');
  if(!allowedOrigin(req))return reject(socket,403,'Forbidden');
  if(conns.size>=cfg.maxConnections)return reject(socket,503,'Service Unavailable');
  if((perIp.get(ip)||0)>=cfg.perIp)return reject(socket,429,'Too Many Requests');
  wss.handleUpgrade(req,socket,head,ws=>onConnection(ws,ip))}

 function onConnection(ws,ip){
  const c={ws,ip,sid:null,pub:null,room:null,kind:null,exp:0,known:new Map(),cursor:0,online:-1,alive:true,tokens:cfg.burst,tAt:now(),viol:0,joining:false,timer:null};
  conns.add(c);perIp.set(ip,(perIp.get(ip)||0)+1);metrics.accepted++;
  c.timer=setTimeout(()=>{if(!c.sid)ws.close(4408,'join_timeout')},cfg.joinTimeoutMs);
  ws.on('pong',()=>{c.alive=true});
  ws.on('message',(data,isBin)=>{
   if(isBin){c.viol++;return}
   const t=now();c.tokens=Math.min(cfg.burst,c.tokens+(t-c.tAt)/1000*cfg.perSec);c.tAt=t;
   if(c.tokens<1){metrics.violations++;if(++c.viol>cfg.maxViolations)ws.close(4429,'rate_limited');return}
   c.tokens--;metrics.msgsIn++;
   let m;try{m=JSON.parse(data.toString())}catch(e){metrics.badJson++;if(++c.viol>cfg.maxViolations)ws.close(4400,'bad_message');return}
   if(!m||typeof m!=='object'||typeof m.t!=='string')return;
   Promise.resolve(onMessage(c,m)).catch(e=>{if(e instanceof WorldError)fail(c,e.code,e.message,e.status===401?4401:0);else{fail(c,'server_error','Erreur serveur.',1011)}})});
  ws.on('close',()=>{clearTimeout(c.timer);conns.delete(c);const n=(perIp.get(ip)||1)-1;if(n>0)perIp.set(ip,n);else perIp.delete(ip);metrics.closed++;
   if(c.sid){try{quiz&&quiz.onLeave(c.sid)}catch(e){}try{tbl&&tbl.onLeave(c.sid)}catch(e){}bySid.delete(c.sid);try{world.leave(c.sid)}catch(e){}c.sid=null}});
  ws.on('error',()=>{})}

 async function onMessage(c,m){
  if(m.t==='join'){
   if(c.sid||c.joining)return fail(c,'already_joined','Déjà connecté.');
   c.joining=true;
   try{
    let ident=null;
    if(typeof m.token==='string'&&m.token){
     if(!verify)throw new WorldError(503,'auth_unavailable','La vérification des comptes n’est pas configurée sur ce serveur : rejoins en invité.');
     ident=await verify(m.token);
     if(!ident)throw new WorldError(401,'bad_token','Session de compte invalide ou expirée : reconnecte-toi.')}
    else if(m.kind==='authenticated')throw new WorldError(401,'bad_token','Un compte connecté est requis.');
    if(c.ws.readyState!==1)return;
    if(guard){const v=await guard.check(m.name,ident?m.token:null);if(v===true||(v===null&&guard.strict))throw new WorldError(409,'name_reserved','Ce nom est celui d’un compte. Choisis un autre nom de personnage, ou connecte-toi avec ce compte.');if(c.ws.readyState!==1)return}
    const r=world.join({name:m.name,room:m.room,consent:m.consent,avatar:m.avatar,x:m.x,z:m.z},ident);
    c.sid=r.sid;bySid.set(r.sid,c);c.pub=r.id;c.room=r.room;c.kind=r.kind;c.exp=ident&&ident.exp?ident.exp*1000:0;clearTimeout(c.timer);
    const st=r.state,vis=[];
    const me={x:+m.x||0,z:+m.z||26};
    st.players.forEach(p=>{if((p.x-me.x)**2+(p.z-me.z)**2<=cfg.aoi**2){vis.push(p);c.known.set(p.id,key(p))}});
    c.cursor=st.cursor;c.online=st.online;
    send(c,{t:'welcome',id:r.id,name:r.name,room:r.room,kind:r.kind,limits:r.limits,tickMs:cfg.tickMs,state:{players:vis,chat:st.chat,cursor:st.cursor,online:st.online}})
   }catch(e){if(e instanceof WorldError){fail(c,e.code,e.message,4000+e.status);return}throw e}
   finally{c.joining=false}
   return}
  if(!c.sid)return fail(c,'not_joined','Rejoins d’abord le monde.');
  if(m.t==='qz'){if(!quiz)return fail(c,'quiz_unavailable','Le quiz n’est pas disponible sur ce serveur.');try{quiz.handle(c.sid,m)}catch(e){fail(c,'server_error','Erreur du quiz.')}return}
  if(m.t==='tbl'){if(!tbl)return fail(c,'tables_unavailable','Les tables de jeux ne sont pas disponibles sur ce serveur.');try{tbl.handle(c.sid,m)}catch(e){fail(c,'server_error','Erreur des tables.')}return}
  if(m.t==='qzp'){if(quiz&&Number.isInteger(m.n))quiz.onRtt(c.sid,m.n);return}
  if(m.t==='pos'){world.move(c.sid,m);return}
  /* chat de proximité : seuls les joueurs du salon à moins de cfg.near unités le reçoivent (expéditeur compris) */
  if(m.t==='chat'&&m.near===true){let nm;try{nm=world.sayNear(c.sid,String(m.text||''))}catch(e){if(e instanceof WorldError&&e.status!==401)return fail(c,e.code,e.message);throw e}
   if(!nm)return;const r=world.room(c.room);if(!r)return;const out={t:'nc',m:{id:nm.id,name:nm.name,text:nm.text,t:nm.t}};
   for(const [sid,p] of r.players){if(Math.hypot(p.x-nm.x,p.z-nm.z)<=cfg.near){const cc=bySid.get(sid);if(cc)send(cc,out)}}return}
  if(m.t==='emote'){try{world.emote(c.sid,String(m.id||''))}catch(e){if(e instanceof WorldError&&e.status!==401)return fail(c,e.code,e.message);throw e}
   if(m.id==='danse')collective(c);return}
  if(m.t==='chat'){try{world.say(c.sid,String(m.text||''))}catch(e){if(e instanceof WorldError&&e.status!==401)return fail(c,e.code,e.message);throw e}return}
  if(m.t==='report'){try{world.report(c.sid,{id:m.id});send(c,{t:'reported'})}catch(e){if(e instanceof WorldError&&e.status!==401)return fail(c,e.code,e.message);throw e}return}
  if(m.t==='ping'){send(c,{t:'pong',c:m.c,s:now()});return}
  if(m.t==='leave'){c.ws.close(1000,'leave');return}}

 /* Activité collective « danse du village » : au moins 2 joueurs proches dansent en même temps → annonce à tout le salon (une fois par groupe et par délai). */
 const lastDance=new Map();
 function collective(c){const r=world.room(c.room);if(!r)return;const me=r.players.get(c.sid);if(!me)return;
  const grp=[...r.players.values()].filter(p=>world.emoteOf(p)==='danse'&&Math.hypot(p.x-me.x,p.z-me.z)<=cfg.danceR);
  if(grp.length<2)return;const t=now(),last=lastDance.get(c.room)||0;if(t-last<cfg.danceCooldownMs)return;lastDance.set(c.room,t);metrics.dances=(metrics.dances||0)+1;
  const out={t:'act',id:'danse',names:grp.map(p=>p.name),n:grp.length};for(const cc of conns)if(cc.sid&&cc.room===c.room)send(cc,out)}
 const key=p=>Math.round(p.x*20)+','+Math.round(p.z*20)+','+Math.round(p.h*10)+','+p.a+','+world.emoteOf(p);

 /* Un tour d'horloge : diffuse à chaque connexion ce qui a changé DANS SA ZONE. */
 function tick(){
  if(quiz){try{quiz.tick()}catch(e){}}
  if(tbl){try{tbl.tick()}catch(e){}}
  const t=now(),aoi2=cfg.aoi*cfg.aoi,out2=(cfg.aoi*1.15)**2;
  for(const c of conns){
   if(!c.sid)continue;
   if(!world.touch(c.sid)){c.ws.close(4401,'session');continue}
   if(c.exp&&t>=c.exp){send(c,{t:'expired'});c.ws.close(4401,'expired');continue}
   const r=world.room(c.room);if(!r)continue;
   const me=r.players.get(c.sid);if(!me)continue;
   const add=[],mv=[],rm=[],seen=new Set();
   for(const p of r.players.values()){
    if(p===me)continue;
    const d2=(p.x-me.x)**2+(p.z-me.z)**2,known=c.known.has(p.pub);
    if(d2>(known?out2:aoi2))continue;
    seen.add(p.pub);const k=key(p);
    if(!known){c.known.set(p.pub,k);const em=world.emoteOf(p),o={id:p.pub,name:p.name,k:p.kind==='authenticated'?'a':'g',av:p.av,x:r2(p.x),z:r2(p.z),h:r2(p.h),a:p.a};if(em)o.e=em;add.push(o)}
    else if(c.known.get(p.pub)!==k){c.known.set(p.pub,k);const em=world.emoteOf(p);mv.push(em?[p.pub,r2(p.x),r2(p.z),r2(p.h),p.a,em]:[p.pub,r2(p.x),r2(p.z),r2(p.h),p.a])}}
   for(const id of c.known.keys())if(!seen.has(id)){c.known.delete(id);rm.push(id)}
   const chat=c.cursor<r.seq?r.chat.filter(m=>m.n>c.cursor):[];c.cursor=r.seq;
   const on=r.players.size,onChanged=on!==c.online;c.online=on;
   if(add.length||mv.length||rm.length||chat.length||onChanged){const msg={t:'s'};if(add.length)msg.add=add;if(mv.length)msg.mv=mv;if(rm.length)msg.rm=rm;if(chat.length)msg.chat=chat;if(onChanged)msg.on=on;send(c,msg)}}}

 function start(){if(tickTimer)return;tickTimer=setInterval(tick,cfg.tickMs);tickTimer.unref&&tickTimer.unref();
  pingTimer=setInterval(()=>{for(const c of conns){if(!c.alive){c.ws.terminate();continue}c.alive=false;try{c.ws.ping()}catch(e){}}},cfg.pingMs);pingTimer.unref&&pingTimer.unref()}
 /* Arrêt propre (SIGTERM de Render lors d'un déploiement) : prévient les clients, qui se reconnecteront d'eux-mêmes. */
 let closeP=null;
 function close(){if(closeP)return closeP;closing=true;clearInterval(tickTimer);clearInterval(pingTimer);tickTimer=pingTimer=null;
  for(const c of conns){send(c,{t:'bye',reason:'restart'});c.ws.close(1012,'service_restart')}
  return closeP=new Promise(res=>{let fin=false;const done=()=>{if(fin)return;fin=true;wss.close(()=>res())};setTimeout(()=>{for(const c of conns)c.ws.terminate();done()},1500).unref();
   const chk=setInterval(()=>{if(!conns.size){clearInterval(chk);done()}},50);chk.unref&&chk.unref()})}
 /* Coupe brutalement toutes les connexions (simulation de panne réseau dans les tests ; outil d'exploitation). */
 function terminateAll(){for(const c of conns)c.ws.terminate()}
 return {handleUpgrade,start,close,tick,terminateAll,metrics,size:()=>conns.size,config:cfg,quiz,tables:tbl}}
module.exports={createRealtime,DEFAULTS};
