/* Politique de cache de la PWA : ce qui a le droit d'être mis en cache. Module PUR (navigateur, service worker via importScripts, Node pour les tests).
   Règle d'or : on ne met en cache que des fichiers STATIQUES du site lui-même, jamais une réponse d'API, de compte ou de temps réel,
   jamais une requête portant un jeton ou un en-tête d'autorisation. Les jetons Supabase restent dans le stockage du navigateur, hors cache. */
(function(root,f){const m=f();if(typeof module==='object'&&module.exports)module.exports=m;else{root.LCA=root.LCA||{};root.LCA.pwaPolicy=m}})(typeof self!=='undefined'?self:this,function(){
 const STATIC_EXT=/\.(?:html|js|css|png|jpe?g|svg|webp|ico|webmanifest|woff2?|mp3|ogg|wav)$/i;
 const BLOCKED_PATH=/^\/(?:v1|auth|rest|realtime|storage|functions|health|api)(?:\/|$)/i;
 const SENSITIVE_QS=/(?:^|[?&])(?:token|access_token|refresh_token|apikey|api_key|key|jwt|code|session)=/i;
 /* req : {url, method, hasAuth, mode} ; origin : origine du site (self.location.origin) */
 function cacheable(req,origin){
  let u;try{u=new URL(req.url)}catch(e){return false}
  if((req.method||'GET').toUpperCase()!=='GET')return false;
  if(u.origin!==origin)return false;
  if(req.hasAuth)return false;
  if(BLOCKED_PATH.test(u.pathname))return false;
  if(SENSITIVE_QS.test(u.search))return false;
  if(req.mode==='navigate')return true;
  return STATIC_EXT.test(u.pathname)||u.pathname==='/'||u.pathname.endsWith('/')}
 /* Une RÉPONSE n'est stockée que si elle est « ordinaire » : 200, même origine, sans cookie ni interdiction de cache. */
 function storable(res){
  if(!res||res.status!==200||res.type==='opaque'||res.type==='error')return false;
  const cc=(res.headers.get('cache-control')||'').toLowerCase();
  if(/no-store|private/.test(cc))return false;
  if(res.headers.get('set-cookie'))return false;
  return true}
 /* Fichiers dont la fraîcheur prime (configuration publique du site) : réseau d'abord, cache en secours. */
 const networkFirst=path=>/\/js\/supabase\/config\.js$/.test(path)||/\/manifest\.webmanifest$/.test(path)||/\/sw\.js$/.test(path);
 return {cacheable,storable,networkFirst,STATIC_EXT,BLOCKED_PATH}});
