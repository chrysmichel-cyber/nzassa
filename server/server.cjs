#!/usr/bin/env node
/* Serveur de référence N'Zassa (Node ≥ 18, base SQLite db.sqlite). Sert de contrat exécutable pour la future API ;
   il n'est PAS un déploiement de production : pas de TLS (à placer derrière un proxy HTTPS), pas de vraie modération.
   Sécurité mise en œuvre : mots de passe hachés (scrypt + sel), jetons signés HMAC-SHA256 avec expiration, limitation de débit,
   limites de taille, validation stricte, consentement explicite, suppression et export des données, statut de modération (aucun récit public sans validation). */
'use strict';
const {createWorld,WorldError}=require('./world.cjs');
const {createDatabase}=require('./database.cjs');
const {createRealtime}=require('./realtime.cjs');
const {createTables}=require('./tables.cjs');
const GAME_DEFS=Object.fromEntries(['awale','dames','echecs','bataille','menteur','belote'].map(id=>[id,require('../js/games/rules/'+id+'.js')]));
const {createQuiz}=require('./quiz.cjs'),{createBank}=require('./quizbank.cjs'),{memoryStore,fileStore}=require('./quizstore.cjs'),QS=require('../js/quiz/scoring.js');
const {createSupabaseVerifier}=require('./identity.cjs');
const {createNameGuard}=require('./nameguard.cjs');
const {clientIp:clientIpOf,trustList}=require('./netutil.cjs');
const http=require('http'),crypto=require('crypto'),path=require('path');
const {monitorEventLoopDelay}=require('perf_hooks');
const MAX_BODY=6*1024*1024,TOKEN_TTL=7*24*3600,NAME_RE=/^[\p{L}\p{N}][\p{L}\p{N} '’_-]{1,23}$/u;
function createServer(opts){
 opts=opts||{};const secret=opts.secret||process.env.NZASSA_SECRET||crypto.randomBytes(32).toString('hex'),file=opts.file||null,rate=opts.rate||{max:60,windowMs:60000},now=opts.now||(()=>Date.now());
 /* Ancien module de comptes/récits SQLite : actif par défaut (compatibilité, tests), DÉSACTIVABLE (legacy:false) — il exige Python et un disque durable,
    ce que Render n'offre pas par défaut. Le monde ouvert et les jeux n'en dépendent pas. */
 const legacy=opts.legacy!==false,limits=opts.limits||{},hops=Math.max(1,+opts.proxyHops||1),origins=opts.cors?String(opts.cors).split(',').map(s=>s.trim()).filter(Boolean):[];
 const world=createWorld({now,limits}),database=legacy?createDatabase(file):null,db=legacy?database.load():{users:{},stories:{},reports:[],appData:{}};
 const persist=()=>{if(database)database.save(db)};
 const lag=monitorEventLoopDelay({resolution:10});lag.enable();
 const verifyToken=opts.verifyToken!==undefined?opts.verifyToken:(opts.supabaseUrl&&opts.supabaseKey?createSupabaseVerifier({url:opts.supabaseUrl,key:opts.supabaseKey,now}):null);
 const nameGuard=opts.nameGuard!==undefined?opts.nameGuard:(opts.supabaseUrl&&opts.supabaseKey?createNameGuard({url:opts.supabaseUrl,key:opts.supabaseKey,now,strict:opts.nameGuardStrict}):null);
 async function checkName(name,token){if(!nameGuard)return;const v=await nameGuard.check(name,token);if(v===true||(v===null&&nameGuard.strict))throw new WorldError(409,'name_reserved','Ce nom est celui d’un compte. Choisis un autre nom de personnage, ou connecte-toi avec ce compte.')}
 /* Quiz du village : désactivable (quiz:false) ; stockage des classements derrière l'interface `store` (mémoire par défaut, fichier JSON si dataDir). */
 const qo=opts.quiz===false?null:(opts.quiz||{});let quizEngine=null,quizStore=null,tablesEngine=null;
 if(qo){quizStore=qo.store||(qo.dataDir?fileStore({dir:qo.dataDir,log:m=>console.log(m)}):memoryStore())}
 const rt=createRealtime({world,verifyToken,nameGuard,now,config:Object.assign({origins:origins.length?origins:null},opts.realtime||{}),
  tablesFactory:opts.tables===false?null:api=>{tablesEngine=createTables({world,games:GAME_DEFS,config:(opts.tables&&opts.tables.config)||undefined,now:(opts.tables&&opts.tables.now)||undefined,rng:(opts.tables&&opts.tables.rng)||undefined,log:m=>console.log(m),send:api.send,broadcastRoom:api.broadcastRoom});return tablesEngine},
  quizFactory:qo?api=>{quizEngine=createQuiz({world,bank:qo.bank||createBank(),store:quizStore,config:QS.config(qo.config),now,rng:qo.rng,log:m=>console.log(m),send:api.send,broadcastRoom:api.broadcastRoom,onTop:(v,top)=>api.broadcastRoom(v,{t:'qz',ev:'top',village:v,top})});return quizEngine}:null});
 /* IP du client : voir server/netutil.cjs (X-Forwarded-For n'est lu que si trustProxy est configuré, et seulement la part ajoutée par notre proxy). */
 const trusted=opts.trustedProxies&&(Array.isArray(opts.trustedProxies)?opts.trustedProxies.length:String(opts.trustedProxies).trim())?trustList(opts.trustedProxies):null;
 const clientIp=req=>clientIpOf(req,{trusted,hops});
 const b64=b=>Buffer.from(b).toString('base64url');
 const sign=p=>{const body=b64(JSON.stringify(p));return body+'.'+crypto.createHmac('sha256',secret).update(body).digest('base64url')};
 function verify(t){if(typeof t!=='string'||t.length>2000)return null;const [body,sig]=t.split('.');if(!body||!sig)return null;
  const exp=crypto.createHmac('sha256',secret).update(body).digest('base64url'),a=Buffer.from(sig),c=Buffer.from(exp);
  if(a.length!==c.length||!crypto.timingSafeEqual(a,c))return null;let p;try{p=JSON.parse(Buffer.from(body,'base64url').toString())}catch(e){return null}
  return p&&p.exp>now()/1000?p:null}
 const hash=(pw,salt)=>crypto.scryptSync(pw,salt,64,{N:16384,r:8,p:1}).toString('hex');
 const hits=new Map();
 function limited(ip,path){const kind=path.startsWith('/v1/auth')?'auth':path==='/v1/world/sync'?'sync':path==='/v1/world/join'?'join':'api',
  max=kind==='auth'?(rate.authMax||Math.min(rate.max,10)):kind==='sync'?(rate.syncMax||900):kind==='join'?(rate.joinMax||30):rate.max,k=ip+'|'+kind,t=now();
  let h=hits.get(k);if(!h||t-h.t>rate.windowMs){h={t,n:0};hits.set(k,h)}h.n++;return h.n>max}
 const send=(res,code,obj)=>{const b=JSON.stringify(obj);res.writeHead(code,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','access-control-allow-origin':res.corsOrigin||'null','vary':'Origin','access-control-allow-headers':'content-type, authorization','access-control-allow-methods':'GET,POST,PUT,DELETE,OPTIONS'});res.end(b)};
 const err=(res,code,msg,c)=>send(res,code,{error:msg,code:c||'error'});
 const clean=(s,n)=>String(s==null?'':s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').slice(0,n);
 const pub=u=>({id:u.id,name:u.name,characterName:u.characterName||'',created:u.created});
 function readBody(req){return new Promise((ok,ko)=>{let n=0;const ch=[];req.on('data',d=>{n+=d.length;if(n>MAX_BODY){ko(Object.assign(new Error('Corps trop volumineux'),{status:413}));req.destroy();return}ch.push(d)});req.on('end',()=>{if(!n)return ok({});try{ok(JSON.parse(Buffer.concat(ch).toString()))}catch(e){ko(Object.assign(new Error('JSON invalide'),{status:400}))}});req.on('error',ko)})}
 const server=http.createServer(async(req,res)=>{
  try{
   if(req.method==='OPTIONS')return send(res,204,{});
   const org=req.headers.origin;res.corsOrigin=origins.includes('*')?'*':(org&&origins.includes(org)?org:(origins[0]||'null'));
   const url=new URL(req.url,'http://x'),p=url.pathname,ip=clientIp(req);
   if(p==='/health'||p==='/v1/health'){const st=world.stats(),base={ok:true,uptime:Math.round(process.uptime()),players:st.players,capacity:st.max};
     /* Détails (CPU, mémoire, boucle d'événements, compteurs) : jamais publics. Jeton NZASSA_METRICS_TOKEN en en-tête x-nzassa-metrics, ou machine locale si aucun jeton n'est défini. */
     const tok=req.headers['x-nzassa-metrics'],okDetail=url.searchParams.get('detail')==='1'&&(opts.metricsToken?(typeof tok==='string'&&tok.length===opts.metricsToken.length&&crypto.timingSafeEqual(Buffer.from(tok),Buffer.from(opts.metricsToken))):/^(::1|127\.0\.0\.1|::ffff:127\.0\.0\.1)$/.test(req.socket.remoteAddress||''));
     if(okDetail){base.proxy={trustedProxiesConfigured:!!trusted,peer:req.socket.remoteAddress||null,peerIsApproved:!!(trusted&&trusted(req.socket.remoteAddress||'')),forwardedFor:req.headers['x-forwarded-for']||null,resolvedClientIp:ip};const cu=process.cpuUsage(),mu=process.memoryUsage(),h=lag;Object.assign(base,{connections:rt.size(),rssMB:Math.round(mu.rss/1048576),heapMB:Math.round(mu.heapUsed/1048576),cpuMs:Math.round((cu.user+cu.system)/1000),loopMs:{p50:+(h.percentile(50)/1e6).toFixed(2),p99:+(h.percentile(99)/1e6).toFixed(2),max:+(h.max/1e6).toFixed(2)},rt:rt.metrics,nameGuard:nameGuard?nameGuard.stats:null,tables:tablesEngine?Object.assign({open:tablesEngine._tables.size},tablesEngine.metrics):null})}
     return send(res,200,base)}
   if(!legacy&&/^\/v1\/(auth|me|stories|transcribe|translate)(\/|$)/.test(p))return err(res,404,'Service hérité désactivé sur ce serveur','legacy_disabled');
   if(limited(ip,p))return err(res,429,'Trop de requêtes','rate_limited');
   const body=['POST','PUT','DELETE'].includes(req.method)?await readBody(req):{};
   let user=null;const m=/^Bearer (.+)$/.exec(req.headers.authorization||'');if(m){const t=verify(m[1]);if(t&&db.users[t.sub])user=db.users[t.sub]}
   const need=()=>{if(!user){err(res,401,'Connexion requise','unauthorized');return false}return true};
   if(p==='/v1/auth/register'&&req.method==='POST'){
    const name=clean(body.name,24).trim(),pw=typeof body.password==='string'?body.password:'';
    if(!NAME_RE.test(name))return err(res,400,'Nom invalide (2 à 24 caractères : lettres, chiffres, espace, apostrophe, tiret)','bad_name');
    if(pw.length<8||pw.length>200)return err(res,400,'Mot de passe : 8 caractères minimum','bad_password');
    if(body.consent!==true)return err(res,400,'Consentement requis pour créer un compte en ligne','consent_required');
    const key=name.toLowerCase();if(Object.values(db.users).some(u=>u.key===key))return err(res,409,'Nom déjà utilisé','name_taken');
    const id=crypto.randomUUID(),salt=crypto.randomBytes(16).toString('hex');
    db.users[id]={id,name,key,salt,hash:hash(pw,salt),created:now(),consent:{at:now(),v:1}};persist();
    return send(res,201,{user:pub(db.users[id]),token:sign({sub:id,exp:now()/1000+TOKEN_TTL})})}
   if(p==='/v1/auth/login'&&req.method==='POST'){
    const key=clean(body.name,24).trim().toLowerCase(),u=Object.values(db.users).find(x=>x.key===key),pw=typeof body.password==='string'?body.password:'';
    const salt=u?u.salt:'00'.repeat(16),h=hash(pw.slice(0,200),salt);
    const good=u&&crypto.timingSafeEqual(Buffer.from(h),Buffer.from(u.hash));
    if(!good)return err(res,401,'Nom ou mot de passe incorrect','bad_credentials');
    return send(res,200,{user:pub(u),token:sign({sub:u.id,exp:now()/1000+TOKEN_TTL})})}
   if(p==='/v1/me'&&req.method==='GET'){if(!need())return;return send(res,200,{user:pub(user)})}
   if(p==='/v1/me/profile'&&req.method==='PUT'){if(!need())return;const name=clean(body.characterName,16).trim();if(name&&!/^[\p{L}\p{N}][\p{L}\p{N} '’_-]{0,15}$/u.test(name))return err(res,400,'Nom du personnage invalide','bad_profile');user.characterName=name;persist();return send(res,200,{user:pub(user)})}
   if(p==='/v1/me'&&req.method==='DELETE'){if(!need())return;delete db.users[user.id];Object.keys(db.stories).forEach(k=>{if(db.stories[k].owner===user.id)delete db.stories[k]});persist();return send(res,200,{deleted:true})}
   if(p==='/v1/me/export'&&req.method==='GET'){if(!need())return;return send(res,200,{user:pub(user),consent:user.consent,stories:Object.values(db.stories).filter(s=>s.owner===user.id)})}
   if(p==='/v1/stories'&&req.method==='GET'){
    const mine=url.searchParams.get('mine')==='1';if(mine&&!need())return;
    const list=Object.values(db.stories).filter(s=>mine?s.owner===user.id:s.status==='approved').map(s=>({id:s.id,title:s.title,lang:s.lang,transcript:s.transcript,translation:s.translation,author:s.author,status:s.status,created:s.created,draft:true}));
    return send(res,200,{stories:list})}
   if(p==='/v1/stories'&&req.method==='POST'){if(!need())return;
    if(body.consent!==true)return err(res,400,'Le consentement des personnes enregistrées est requis','consent_required');
    const title=clean(body.title,120).trim();if(!title)return err(res,400,'Titre requis','bad_title');
    const id=crypto.randomUUID();
    db.stories[id]={id,owner:user.id,author:user.name,title,lang:clean(body.lang,40),transcript:clean(body.transcript,8000),translation:clean(body.translation,8000),
     audio:typeof body.audio==='string'&&body.audio.length<=MAX_BODY?body.audio:'',status:'pending',created:now()};persist();
    return send(res,201,{id,status:'pending',note:'En attente de modération : aucun récit n’est public avant validation.'})}
   const sm=/^\/v1\/stories\/([\w-]{1,64})(\/report)?$/.exec(p);
   if(sm){const s=db.stories[sm[1]];
    if(sm[2]&&req.method==='POST'){if(!need())return;if(!s)return err(res,404,'Introuvable','not_found');db.reports.push({story:s.id,by:user.id,reason:clean(body.reason,300),at:now()});if(s.status==='approved')s.status='pending';persist();return send(res,202,{reported:true})}
    if(req.method==='DELETE'){if(!need())return;if(!s||s.owner!==user.id)return err(res,404,'Introuvable','not_found');delete db.stories[s.id];persist();return send(res,200,{deleted:true})}}
   if(p.startsWith('/v1/world/')){
    try{
     if(p==='/v1/world/join'&&req.method==='POST'){let ident=null;if(typeof body.token==='string'&&body.token){if(!verifyToken)return err(res,503,'Comptes non configurés sur ce serveur','auth_unavailable');ident=await verifyToken(body.token);if(!ident)return err(res,401,'Session de compte invalide ou expirée','bad_token')}else if(body.kind==='authenticated')return err(res,401,'Un compte connecté est requis','bad_token');await checkName(body.name,ident?body.token:null);return send(res,200,world.join(body,ident))}
     const sid=((/^Bearer (.+)$/.exec(req.headers.authorization||''))||[])[1]||'';
     if(p==='/v1/world/sync'&&req.method==='POST')return send(res,200,world.sync(sid,body));
     if(p==='/v1/world/report'&&req.method==='POST')return send(res,202,world.report(sid,body));
     if(p==='/v1/world/leave'&&req.method==='POST')return send(res,200,world.leave(sid));
    }catch(e){if(e instanceof WorldError)return err(res,e.status,e.message,e.code);throw e}
    return err(res,404,'Route inconnue','not_found')}
   if((p==='/v1/transcribe'||p==='/v1/translate')&&req.method==='POST'){if(!need())return;
    return err(res,501,'Aucun fournisseur de '+(p.endsWith('transcribe')?'transcription':'traduction')+' n’est configuré. Le jeu n’invente pas de résultat : saisis le texte à la main.','no_provider')}
   return err(res,404,'Route inconnue','not_found')
  }catch(e){err(res,e.status||500,e.status?e.message:'Erreur serveur')}});
 server.db=db;server.world=world;server.sqlite=database;server.realtime=rt;server.quiz=quizEngine;server.tables=tablesEngine;server.quizStore=quizStore;
 server.on('upgrade',(req,socket,head)=>rt.handleUpgrade(req,socket,head,clientIp(req)));
 server.keepAliveTimeout=65000;server.headersTimeout=66000;/* au-delà des délais d'inactivité du répartiteur de Render */
 rt.start();
 /* server.close() ferme d'abord les WebSocket (les connexions « upgrade » ne sont pas comptées par Node), puis l'écoute HTTP. */
 const httpClose=server.close.bind(server);
 server.close=cb=>{rt.close().then(()=>quizStore?quizStore.close():0).then(()=>{httpClose(cb);server.closeAllConnections&&server.closeAllConnections()});return server};
 server.on('close',()=>{lag.disable();if(database)database.close()});return server}
module.exports={createServer};
if(require.main===module){
 const env=process.env,port=+env.PORT||8787,host=env.HOST||(env.PORT||env.NODE_ENV==='production'?'0.0.0.0':'127.0.0.1');
 const num=(k,d)=>Number.isFinite(+env[k])&&env[k]!==''&&env[k]!==undefined?+env[k]:d;
 const s=createServer({cors:env.NZASSA_CORS,file:env.NZASSA_DB||path.join(__dirname,'db.sqlite'),legacy:env.NZASSA_LEGACY_API==='1'||(env.NZASSA_LEGACY_API===undefined&&env.NODE_ENV!=='production'),
  metricsToken:env.NZASSA_METRICS_TOKEN,nameGuardStrict:env.NZASSA_NAME_GUARD==='strict',supabaseUrl:env.NZASSA_SUPABASE_URL,supabaseKey:env.NZASSA_SUPABASE_KEY,trustedProxies:env.NZASSA_TRUSTED_PROXIES,proxyHops:num('NZASSA_PROXY_HOPS',1),
  limits:{maxTotal:num('NZASSA_MAX_PLAYERS',50),maxPlayers:num('NZASSA_ROOM_MAX',50)},realtime:{maxConnections:num('NZASSA_MAX_CONNECTIONS',60),perIp:num('NZASSA_WS_PER_IP',10)},
  quiz:env.NZASSA_QUIZ==='off'?false:{dataDir:env.NZASSA_DATA_DIR||null,config:env.NZASSA_QUIZ_CONFIG?JSON.parse(env.NZASSA_QUIZ_CONFIG):undefined}});
 if(!env.NZASSA_SUPABASE_URL||!env.NZASSA_SUPABASE_KEY)console.log('Comptes Supabase non configurés : seuls les invités en ligne peuvent rejoindre.');
 if(env.NODE_ENV==='production'&&!env.NZASSA_CORS)console.log('Attention : NZASSA_CORS absent, les navigateurs seront refusés (définis l’adresse de ton site).');
 s.listen(port,host,()=>console.log('N’Zassa temps réel sur '+host+':'+port));
 let stopping=false;
 const stop=sig=>{if(stopping)return;stopping=true;console.log(sig+' reçu : arrêt propre…');
  s.realtime.close().then(()=>{s.close(()=>process.exit(0));s.closeIdleConnections&&s.closeIdleConnections()});setTimeout(()=>process.exit(0),5000).unref()};
 process.on('SIGTERM',()=>stop('SIGTERM'));process.on('SIGINT',()=>stop('SIGINT'))}
