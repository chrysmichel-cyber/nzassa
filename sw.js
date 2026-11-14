/* Service worker de N'Zassa. Les valeurs BUILD et PRECACHE sont écrites par scripts/build.mjs (en développement : cache à l'usage seulement).
   Principes : (1) le site reste utilisable hors connexion pour le jeu solo ; (2) AUCUN jeton, AUCUNE réponse d'API en cache (voir js/pwa/policy.js) ;
   (3) une nouvelle version s'installe en arrière-plan et n'est activée qu'à la demande du joueur (pas de rechargement surprise en pleine partie). */
'use strict';
importScripts('js/pwa/policy.js');
const BUILD='__BUILD__',PRECACHE=/*__PRECACHE__*/[],CACHE='nzassa-static-'+BUILD,RUNTIME='nzassa-runtime-v1',RUNTIME_MAX=80,POL=self.LCA.pwaPolicy;
const ORIGIN=self.location.origin,INDEX=new URL('index.html',self.registration.scope).href;

self.addEventListener('install',e=>{e.waitUntil((async()=>{
 const c=await caches.open(CACHE);
 /* cache:'reload' : on ne précharge jamais une copie périmée du cache HTTP du navigateur */
 await Promise.all(PRECACHE.map(async p=>{const r=await fetch(new Request(p,{cache:'reload'}));if(!POL.storable(r))throw new Error('précache refusé : '+p);await c.put(new Request(p),r)}))})())});

self.addEventListener('activate',e=>{e.waitUntil((async()=>{
 for(const k of await caches.keys())if(k.startsWith('nzassa-static-')&&k!==CACHE)await caches.delete(k);
 await self.clients.claim()})())});

self.addEventListener('message',e=>{const d=e.data||{};
 if(d.type==='SKIP_WAITING')self.skipWaiting();
 else if(d.type==='GET_VERSION'&&e.ports[0])e.ports[0].postMessage({build:BUILD,cache:CACHE})});

async function trim(cache){const ks=await cache.keys();for(let i=0;i<ks.length-RUNTIME_MAX;i++)await cache.delete(ks[i])}
async function fromNet(req,cacheName,timeout){
 const ctl=new AbortController(),t=timeout?setTimeout(()=>ctl.abort(),timeout):0;
 try{const r=await fetch(req,{signal:ctl.signal});if(POL.storable(r)){const c=await caches.open(cacheName);c.put(req,r.clone()).then(()=>cacheName===RUNTIME?trim(c):0).catch(()=>{})}return r}finally{if(t)clearTimeout(t)}}

self.addEventListener('fetch',e=>{
 const r=e.request;
 if(!POL.cacheable({url:r.url,method:r.method,hasAuth:r.headers.has('authorization')||r.headers.has('apikey'),mode:r.mode},ORIGIN))return;/* hors politique : le navigateur fait la requête normalement */
 const u=new URL(r.url);
 if(r.mode==='navigate'){/* page : réseau d'abord (version à jour), cache de secours hors connexion */
  e.respondWith((async()=>{try{return await fromNet(r,CACHE,4000)}catch(_){return (await caches.match(INDEX))||(await caches.match(r,{ignoreSearch:true}))||Response.error()}})());return}
 if(POL.networkFirst(u.pathname)){e.respondWith((async()=>{try{return await fromNet(r,CACHE,3000)}catch(_){return (await caches.match(r,{ignoreSearch:true}))||Response.error()}})());return}
 e.respondWith((async()=>{
  const hit=await caches.match(r,{ignoreSearch:true});
  if(hit){if(!PRECACHE.includes(u.pathname.replace(/^\//,'')))fromNet(r,RUNTIME).catch(()=>{});return hit}/* fichiers hors précache : on rafraîchit en arrière-plan */
  try{return await fromNet(r,RUNTIME)}catch(_){return Response.error()}})())});
