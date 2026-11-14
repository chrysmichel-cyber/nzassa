/* Comptes et emplacements de sauvegarde (module sans DOM : navigateur + Node).
   Trois façons de jouer, toutes avec une sauvegarde persistante dans ce navigateur :
   - INVITÉ : aucun compte, aucun appel réseau. Identifiant local unique (guestId), sauvegarde « lca-v2 » (inchangée, donc compatible).
              Un invité n'a JAMAIS de compte Supabase.
   - COMPTE : utilisateur Supabase Auth (adresse e-mail + mot de passe). Sa progression locale est « lca-u-<uuid> ».
              La session (jetons) est conservée et rafraîchie par la bibliothèque Supabase ; ce module n'en copie aucun jeton.
   - ANCIEN PROFIL LOCAL : profils créés avant Supabase (« lca-u-<id> »). Conservés et jouables, mais on n'en crée plus.
   Transfert de progression : toujours une COPIE ; la source n'est jamais modifiée ; rien n'est écrasé sans choix explicite,
   et la sauvegarde remplacée est gardée à côté (« .pre-import »).
   Index : « lca-acc » v2 = {v,guest:{id,created},current:{kind,id,pseudo,email},legacy:[…]}. Un index v1 (profils locaux) est migré sans perte. */
(function(root,factory){const m=factory(root);if(typeof module==='object'&&module.exports)module.exports=m;else{root.LCA=root.LCA||{};root.LCA.accounts=m}})(typeof window!=='undefined'?window:this,function(root){
'use strict';
const INDEX='lca-acc',SAVE='lca-v2',PREFIX='lca-u-',OLD_CLOUD='lca-cloud',PRE='.pre-import';
const b64=u=>{let s='';u.forEach(c=>s+=String.fromCharCode(c));return btoa(s)};
const unb64=t=>Uint8Array.from(atob(t),c=>c.charCodeAt(0));
const same=(a,b)=>{if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let r=0;for(let i=0;i<a.length;i++)r|=a.charCodeAt(i)^b.charCodeAt(i);return r===0};
const isObj=x=>!!x&&typeof x==='object'&&!Array.isArray(x);

/* Une sauvegarde « contient une progression » si elle a plus que des réglages par défaut. */
function hasProgress(text){
 try{const j=typeof text==='string'?JSON.parse(text):text;if(!isObj(j))return false;
  return (isObj(j.d)&&Object.keys(j.d).length>0)||!!j.avatar||!!j.name||!!j.started||!!(isObj(j.learn)&&(j.learn.xp>0||(isObj(j.learn.stats)&&j.learn.stats.answers>0)));
 }catch(e){return false}}

function uuid(cr){
 try{if(cr&&typeof cr.randomUUID==='function')return cr.randomUUID()}catch(e){}
 const u=new Uint8Array(16);
 if(cr&&cr.getRandomValues)cr.getRandomValues(u);else for(let i=0;i<16;i++)u[i]=Math.floor(Math.random()*256);
 u[6]=(u[6]&15)|64;u[8]=(u[8]&63)|128;
 const h=Array.from(u,x=>x.toString(16).padStart(2,'0')).join('');
 return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);
}

function create(o){
 o=o||{};const st=o.storage,cr=o.crypto||root.crypto,now=o.now||(()=>Date.now()),auth=o.auth||null;
 const subtle=cr&&cr.subtle;
 const listeners=[];let accStatus='pending',signingOut=false,pendingConflict=null,unsub=null,frozen=false;
 /* Dès que l'emplacement actif change, la page garde en mémoire la progression de l'ANCIEN emplacement : ses écritures sont ignorées jusqu'au rechargement,
    sinon elle écraserait la sauvegarde du nouvel emplacement. */

 /* ---------- index ---------- */
 function blank(){return {v:2,guest:{id:uuid(cr),created:now()},current:{kind:'guest'},legacy:[]}}
 function readIndex(){
  let raw=null;try{raw=JSON.parse(st.getItem(INDEX))}catch(e){raw=null}
  if(!isObj(raw))return {idx:blank(),fresh:true};
  if(raw.v===2&&isObj(raw.guest)&&typeof raw.guest.id==='string'&&isObj(raw.current)){
   return {idx:{v:2,guest:raw.guest,current:raw.current,legacy:Array.isArray(raw.legacy)?raw.legacy.filter(a=>isObj(a)&&typeof a.id==='string'):[]},fresh:false};
  }
  /* index v1 : profils locaux avec mot de passe local. Conservés comme « anciens profils » ; le profil actif reste actif. */
  if(Array.isArray(raw.accounts)){
   const legacy=raw.accounts.filter(a=>isObj(a)&&typeof a.id==='string').map(a=>({id:a.id,pseudo:String(a.pseudo||''),created:a.created||0,last:a.last||0,salt:a.salt,iter:a.iter,hash:a.hash}));
   const cur=legacy.find(a=>a.id===raw.current);
   const idx=blank();idx.legacy=legacy;if(cur)idx.current={kind:'local',id:cur.id,pseudo:cur.pseudo};
   try{if(!st.getItem(INDEX+'.v1.bak'))st.setItem(INDEX+'.v1.bak',JSON.stringify(raw))}catch(e){}
   return {idx,fresh:true};
  }
  return {idx:blank(),fresh:true};
 }
 const loaded=readIndex();let idx=loaded.idx;
 function writeIndex(){try{st.setItem(INDEX,JSON.stringify(idx));return true}catch(e){return false}}
 if(loaded.fresh)writeIndex();
 try{st.removeItem(OLD_CLOUD)}catch(e){}/* ancien jeton de session du service local (avant Supabase) : plus utilisé */

 const kind=()=>idx.current&&idx.current.kind;
 const slotKey=()=>kind()==='account'||kind()==='local'?PREFIX+idx.current.id:SAVE;
 function readSlot(k){try{return st.getItem(k)}catch(e){return null}}
 function notify(){listeners.slice().forEach(f=>{try{f(accStatus)}catch(e){}})}
 function setStatus(s){if(accStatus!==s){accStatus=s;notify()}}

 /* ---------- abonnement aux changements de session ---------- */
 if(auth&&auth.onChange){
  unsub=auth.onChange((ev,user)=>{
   if(kind()!=='account')return;
   if(ev==='SIGNED_OUT'){if(!signingOut)setStatus('expired');return}
   if(user&&user.id===idx.current.id&&(ev==='TOKEN_REFRESHED'||ev==='SIGNED_IN'||ev==='INITIAL_SESSION'))setStatus('ok');
  });
 }

 async function hashPw(pw,salt,iter){
  const k=await subtle.importKey('raw',new TextEncoder().encode(pw),'PBKDF2',false,['deriveBits']);
  const bits=await subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations:iter||150000},k,256);
  return b64(new Uint8Array(bits));
 }

 /* Active un compte : choisit l'emplacement, applique le transfert demandé, mémorise l'utilisateur. */
 function activate(user,opt){
  opt=opt||{};
  const slot=PREFIX+user.id,src=kind()==='account'?null:slotKey();
  let imported=null,conflict=false;
  try{
   const slotText=readSlot(slot),srcText=src?readSlot(src):null;
   if(opt.importProgress&&src&&hasProgress(srcText)){
    if(slotText===srcText){imported='same'}/* transfert déjà effectué (relance après une interruption) : rien à faire, ni conflit ni doublon */
    else if(!hasProgress(slotText)){
     if(slotText)st.setItem(slot+PRE,slotText);/* un emplacement qui ne contenait que des réglages est quand même gardé */
     st.setItem(slot,srcText);imported='copied';
    }else{conflict=true;pendingConflict={src,slot,label:kind()==='local'?'ancien profil « '+(idx.current.pseudo||'')+' »':'invité'}}
   }else if(!slotText&&opt.seed){st.setItem(slot,typeof opt.seed==='string'?opt.seed:JSON.stringify(opt.seed))}
  }catch(e){return {ok:false,error:'storage'}}
  const prev=idx.current;
  idx.current={kind:'account',id:user.id,pseudo:user.pseudo||'',email:user.email||''};
  if(!writeIndex()){idx.current=prev;pendingConflict=null;return {ok:false,error:'storage'}}
  frozen=true;accStatus='ok';notify();
  return {ok:true,account:api.current(),imported,conflict};
 }

 const api={
  INDEX,SAVE,
  guestId:()=>idx.guest.id,
  mode:kind,
  isAccount:()=>kind()==='account',
  /* « Compte » : l'interface appelle ceci pour savoir si le service est joignable en principe (bibliothèque + configuration présentes). */
  canAuth:()=>!!auth,
  /* Statut : guest | local | pending (session à vérifier) | ok | expired | offline. */
  status:()=>kind()==='account'?accStatus:kind(),
  onStatus(fn){listeners.push(fn);return()=>{const i=listeners.indexOf(fn);if(i>=0)listeners.splice(i,1)}},
  /* Profil actif : null pour un invité (compatibilité avec l'interface), sinon {kind,id,pseudo,email?,hasPassword?}. */
  current(){
   if(kind()==='account')return {kind:'account',id:idx.current.id,pseudo:idx.current.pseudo||'',email:idx.current.email||''};
   if(kind()==='local'){const a=idx.legacy.find(x=>x.id===idx.current.id);return a?{kind:'local',id:a.id,pseudo:a.pseudo,hasPassword:!!a.hash}:null}
   return null},
  /* Identifiant stable pour les données propres au profil (récits oraux…) : « guest » pour l'invité, comme avant. */
  profileId(){const c=api.current();return c?c.id:'guest'},
  /* Stockage « vu » par le jeu : la clé de sauvegarde habituelle est redirigée vers l'emplacement actif. */
  storage(){
   const map=k=>typeof k==='string'&&k.indexOf(SAVE)===0?slotKey()+k.slice(SAVE.length):k;
   return {getItem:k=>st.getItem(map(k)),setItem:(k,v)=>{if(!frozen)st.setItem(map(k),v)},removeItem:k=>{if(!frozen)st.removeItem(map(k))}};
  },
  /* La progression de l'emplacement actif (invité ou ancien profil) peut-elle être transférée vers un compte ? */
  canImport(){if(kind()==='account')return null;const t=readSlot(slotKey());return hasProgress(t)?{label:kind()==='local'?'ancien profil « '+((api.current()||{}).pseudo||'')+' »':'invité'}:null},
  guestHasData:()=>hasProgress(readSlot(SAVE)),

  /* ---------- compte Supabase ---------- */
  async register(f){
   f=f||{};if(!auth)return {ok:false,error:'unavailable'};
   const r=await auth.signUp({pseudo:f.pseudo,email:f.email,password:f.password,consent:f.consent===true});
   if(!r.ok)return r;
   if(r.pending)return {ok:true,pending:r.pending};
   return activate(r.user,{importProgress:f.importProgress===true,seed:f.seed});
  },
  async login(f){
   f=f||{};if(!auth)return {ok:false,error:'unavailable'};
   const r=await auth.signIn({email:f.email,password:f.password});
   if(!r.ok)return r;
   return activate(r.user,{importProgress:f.importProgress===true,seed:f.seed});
  },
  /* Vérifie la session persistée au démarrage (sans changer d'emplacement : le jeu est déjà lancé sur celui-ci). */
  async restore(){
   if(kind()!=='account')return {ok:true,status:kind()};
   if(!auth){setStatus('offline');return {ok:false,status:'offline'}}
   const r=await auth.restore();
   if(!r.ok){setStatus(r.error==='offline'?'offline':'expired');return {ok:false,status:accStatus}}
   if(r.user&&r.user.id===idx.current.id)setStatus('ok');else setStatus('expired');/* autre utilisateur ou plus de session : reconnexion demandée */
   return {ok:true,status:accStatus};
  },
  /* Jeton de session du compte actif pour le monde ouvert ; null si invité, session expirée ou si la session appartient à un autre compte. */
  async accessToken(){
   if(kind()!=='account'||!auth||!auth.accessToken||accStatus==='expired')return null;
   const r=await auth.accessToken();return r&&r.userId===idx.current.id?r.token:null;
  },
  async logout(){
   signingOut=true;
   try{if(auth)await auth.signOut()}catch(e){}
   idx.current={kind:'guest'};const ok=writeIndex();pendingConflict=null;signingOut=false;if(ok)frozen=true;
   return {ok};
  },
  async setDisplayName(name){
   if(kind()!=='account'||!auth||accStatus!=='ok')return {ok:false,error:'offline'};
   return auth.updateDisplayName(name);
  },
  /* Suppression du compte Supabase (fonction SQL à valider) ; la progression locale du compte n'est effacée que si on le demande. */
  async deleteAccount(opt){
   if(kind()!=='account'||!auth)return {ok:false,error:'unavailable'};
   const id=idx.current.id,r=await auth.deleteAccount();
   if(!r.ok)return r;
   if(opt&&opt.eraseLocal){try{st.removeItem(PREFIX+id);st.removeItem(PREFIX+id+'.bak');st.removeItem(PREFIX+id+PRE)}catch(e){}}
   idx.current={kind:'guest'};writeIndex();frozen=true;
   return {ok:true};
  },

  /* ---------- transfert de progression ---------- */
  pendingConflict:()=>pendingConflict?{label:pendingConflict.label}:null,
  /* keep : garde la progression du compte (rien ne change). replace : la progression transférée remplace celle du compte, qui est conservée en « .pre-import ». */
  resolveConflict(choice){
   const c=pendingConflict;if(!c)return {ok:false,error:'none'};
   if(choice==='replace'){
    try{const cur=st.getItem(c.slot),src=st.getItem(c.src);if(cur)st.setItem(c.slot+PRE,cur);if(src)st.setItem(c.slot,src)}catch(e){return {ok:false,error:'storage'}}
   }
   pendingConflict=null;return {ok:true,choice};
  },

  /* ---------- anciens profils locaux ---------- */
  legacyProfiles:()=>idx.legacy.map(a=>({id:a.id,pseudo:a.pseudo,hasPassword:!!a.hash,created:a.created||0})),
  async useLegacy(id,password){
   const a=idx.legacy.find(x=>x.id===id);if(!a)return {ok:false,error:'unknown'};
   if(a.hash){
    let ok=false;
    if(subtle&&typeof password==='string'&&password){try{ok=same(await hashPw(password,unb64(a.salt),a.iter),a.hash)}catch(e){ok=false}}
    if(!ok)return {ok:false,error:'bad'};
   }
   const prev=idx.current;idx.current={kind:'local',id:a.id,pseudo:a.pseudo};
   if(!writeIndex()){idx.current=prev;return {ok:false,error:'storage'}}
   frozen=true;return {ok:true};
  },
  useGuest(){if(kind()==='account')return {ok:false,error:'account'};idx.current={kind:'guest'};const ok=writeIndex();if(ok)frozen=true;return {ok}},
  frozen:()=>frozen,
  dispose(){if(unsub)unsub();unsub=null}
 };
 return api;
}
return {create,hasProgress,INDEX,SAVE,PREFIX,PRE};
});
