/* Noms réservés : un nom de personnage qui est le pseudo d'un compte appartient à ce compte. Le serveur interroge Supabase (fonction SQL
   public.nzassa_name_taken_by_other, voir supabase/03_nom_reserve.sql) AVEC le jeton du joueur s'il est connecté, de sorte que Supabase sait
   « qui demande » (auth.uid()) sans que le serveur ne voie ni n'expose d'identifiant. Invité : appel anonyme (clé publique uniquement).
   Réponse : true (pris par un autre compte) · false (libre, ou c'est le sien) · null (inconnu : fonction absente, Supabase injoignable).
   Politique : « null » laisse passer (le jeu reste jouable) mais est compté et signalé dans /health?detail=1 ; NZASSA_NAME_GUARD=strict refuse. */
'use strict';
const crypto=require('crypto');
const norm=n=>String(n==null?'':n).replace(/\s+/g,' ').trim();
function createNameGuard(o){
 const url=String(o.url||'').replace(/\/+$/,''),key=String(o.key||''),fx=o.fetch||globalThis.fetch,now=o.now||(()=>Date.now()),ttl=o.ttlMs||60000,strict=!!o.strict;
 if(!/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/i.test(url)&&!o.allowAnyUrl)return null;
 if(!key)return null;
 const cache=new Map(),stats={checked:0,taken:0,unknown:0,lastError:null};
 async function check(name,token){
  const n=norm(name).toLowerCase();if(!n)return false;
  const ck=n+'|'+(token?crypto.createHash('sha256').update(token).digest('hex').slice(0,16):'anon'),t=now(),hit=cache.get(ck);
  if(hit&&hit.until>t)return hit.v;
  stats.checked++;let v=null;
  try{
   const h={apikey:key,'content-type':'application/json'};if(token)h.authorization='Bearer '+token;
   const res=await fx(url+'/rest/v1/rpc/nzassa_name_taken_by_other',{method:'POST',headers:h,body:JSON.stringify({p_name:norm(name)}),signal:AbortSignal.timeout(4000)});
   if(res.ok){const j=await res.json();v=typeof j==='boolean'?j:null;if(v===null)stats.lastError='réponse inattendue'}
   else stats.lastError='HTTP '+res.status;
  }catch(e){stats.lastError='réseau'}
  if(v===true)stats.taken++;if(v===null)stats.unknown++;
  if(cache.size>1000)cache.clear();cache.set(ck,{v,until:t+(v===null?10000:ttl)});return v}
 return {check,strict,stats}}
module.exports={createNameGuard,norm};
