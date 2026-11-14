/* Vérification des comptes côté serveur : le navigateur envoie son jeton de session Supabase, le serveur le fait valider par Supabase
   (GET /auth/v1/user) et n'utilise QUE l'identifiant renvoyé par Supabase. Aucune clé secrète : la clé « publishable » (publique) suffit.
   Résultats en cache quelques secondes pour ne pas solliciter Supabase à chaque connexion. Le jeton n'est jamais journalisé. */
'use strict';
const {WorldError}=require('./world.cjs');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const crypto=require('crypto');

function keyIsSecret(key){
 if(/^sb_secret_/.test(key))return true;
 const p=String(key).split('.');if(p.length===3){try{const j=JSON.parse(Buffer.from(p[1],'base64url').toString());return j&&j.role==='service_role'}catch(e){}}
 return false}
/* exp (secondes) lu dans le jeton SANS en tirer d'identité : c'est Supabase qui a validé la signature. */
function expOf(token){try{const j=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString());return Number.isFinite(j.exp)?j.exp:0}catch(e){return 0}}

function createSupabaseVerifier(o){
 const url=String(o.url||'').replace(/\/+$/,''),key=String(o.key||''),fx=o.fetch||globalThis.fetch,now=o.now||(()=>Date.now()),ttl=o.ttlMs||60000;
 if(!/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/i.test(url)&&!o.allowAnyUrl)return null;
 if(!key||keyIsSecret(key))return null;
 const cache=new Map();
 return async function verify(token){
  if(typeof token!=='string'||token.length>4096||token.split('.').length!==3)return null;
  const h=crypto.createHash('sha256').update(token).digest('hex'),t=now(),hit=cache.get(h);
  if(hit&&hit.until>t)return hit.ident;
  let res;try{res=await fx(url+'/auth/v1/user',{headers:{apikey:key,authorization:'Bearer '+token},signal:AbortSignal.timeout(4000)})}
  catch(e){throw new WorldError(503,'auth_unavailable','Vérification du compte momentanément impossible : réessaie.')}
  if(res.status>=500)throw new WorldError(503,'auth_unavailable','Vérification du compte momentanément impossible : réessaie.');
  if(!res.ok)return null;
  let j;try{j=await res.json()}catch(e){return null}
  if(!j||typeof j.id!=='string'||!UUID.test(j.id))return null;
  const exp=expOf(token);if(exp&&exp*1000<=t)return null;
  const ident={sub:j.id.toLowerCase(),exp};
  if(cache.size>500)cache.clear();cache.set(h,{ident,until:Math.min(t+ttl,exp?exp*1000:Infinity)});return ident}}
module.exports={createSupabaseVerifier,keyIsSecret,expOf};
