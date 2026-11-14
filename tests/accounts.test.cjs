/* Comptes : pseudo, adaptateur Supabase (client simulé), invité, session, transfert de progression, anciens profils. */
const test=require('node:test'),assert=require('node:assert/strict');
const path=require('node:path'),fs=require('node:fs'),vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const {load,memStorage}=require('./helpers.cjs');
const root=path.join(__dirname,'..');
const P=require('../js/account/pseudo.js'),AU=require('../js/supabase/auth.js'),CL=require('../js/supabase/client.js'),AC=require('../js/account/accounts.js');
const LCA=load();

/* ---------- pseudo ---------- */
test('P1 : pseudo valide conservé tel quel (casse, accents, _ . \' - espaces simples)',()=>{
 for(const v of ['Testeur_1','Aïssatou','N’Zassa','jean.paul','Kofi-Mensah','Awa Diop','李明','Ab','a'.repeat(40)])assert.equal(P.checkPseudo(v),null,v);
});
test('P2 : longueur 2 à 40 en CARACTÈRES (pas en octets ni en unités UTF-16)',()=>{
 assert.equal(P.checkPseudo('a'),'short');assert.equal(P.checkPseudo('a'.repeat(41)),'long');
 assert.equal(P.checkPseudo('😀😀'),null);/* 2 caractères, 4 unités UTF-16 */
 assert.equal(P.checkPseudo('é'.repeat(40)),null);assert.equal(P.checkPseudo('é'.repeat(41)),'long');
});
test('P3 : espaces en bord, doubles, tabulations ; jamais corrigés en silence',()=>{
 assert.equal(P.checkPseudo(' Awa'),'edge_space');assert.equal(P.checkPseudo('Awa '),'edge_space');
 assert.equal(P.checkPseudo('Awa  Diop'),'double_space');assert.equal(P.checkPseudo('Awa\tDiop'),'chars');assert.equal(P.checkPseudo('Awa Diop'),'space_kind');
});
test('P4 : caractères interdits (balisage, chemins, @, invisibles, contrôle)',()=>{
 for(const v of ['<b>x</b>','a&b','a"b','a\\b','a/b','a@b','ab​c','ab‮c','ab\u0007c','ab﻿c'])assert.equal(P.checkPseudo(v),'chars',JSON.stringify(v));
 assert.equal(P.checkPseudo(42),'type');assert.equal(P.checkPseudo(null),'type');
});
test('P5 : e-mail et mot de passe (72 octets au plus, jamais modifié)',()=>{
 assert.equal(P.checkEmail('awa@example.com'),null);assert.equal(P.checkEmail('  awa@example.com '),null);
 for(const v of ['','awa','awa@','@x.co','a b@x.co','awa@x'])assert.notEqual(P.checkEmail(v),null,v);
 assert.equal(P.checkPassword('1234567'),'short');assert.equal(P.checkPassword('12345678'),null);
 assert.equal(P.checkPassword('é'.repeat(36)),null);assert.equal(P.checkPassword('é'.repeat(37)),'long');/* 74 octets */
});
test('P6 : inscription : ordre des vérifications, confirmation et consentement',()=>{
 const ok={pseudo:'Awa',email:'a@b.co',password:'motdepasse8',confirm:'motdepasse8',consent:true};
 assert.equal(P.checkSignup(ok),null);
 assert.deepEqual(P.checkSignup({...ok,pseudo:'A'}),{field:'pseudo',error:'short'});
 assert.deepEqual(P.checkSignup({...ok,email:'x'}),{field:'email',error:'invalid'});
 assert.deepEqual(P.checkSignup({...ok,confirm:'autre'}),{field:'confirm',error:'mismatch'});
 assert.deepEqual(P.checkSignup({...ok,consent:false}),{field:'consent',error:'required'});
});

/* ---------- client Supabase simulé ---------- */
function mockClient(over){
 const calls=[],listeners=[];let session=null;
 const user=(email,meta)=>({id:'11111111-2222-4333-8444-555555555555',email,created_at:'2026-11-01T00:00:00Z',user_metadata:meta||{},identities:[{}]});
 const c={calls,listeners,setSession:s=>{session=s},
  auth:{
   async signUp(a){calls.push(['signUp',a]);if(over&&over.signUp)return over.signUp(a);const u=user(a.email,a.options.data);session={user:u};return {data:{user:u,session:{access_token:'t'}},error:null}},
   async signInWithPassword(a){calls.push(['signIn',a]);if(over&&over.signIn)return over.signIn(a);return a.password==='motdepasse8'?{data:{user:user(a.email,{username:'Awa_1'}),session:{}},error:null}:{data:{},error:{code:'invalid_credentials',message:'Invalid login credentials',status:400}}},
   async signOut(a){calls.push(['signOut',a]);session=null;listeners.forEach(f=>f('SIGNED_OUT',null));return {error:null}},
   async getSession(){calls.push(['getSession']);if(over&&over.getSession)return over.getSession();return {data:{session},error:null}},
   async getUser(){return {data:{user:session&&session.user},error:null}},
   onAuthStateChange(cb){listeners.push(cb);return {data:{subscription:{unsubscribe(){const i=listeners.indexOf(cb);if(i>=0)listeners.splice(i,1)}}}}}},
  rpc:async(n,a)=>{calls.push(['rpc',n,a]);if(over&&over.rpc)return over.rpc(n,a);return {data:true,error:null}},
  from:t=>({update:v=>({eq:async(k,x)=>{calls.push(['update',t,v,k,x]);return {error:null}}})})};
 return c;
}
const mkAuth=c=>AU.create({client:c,pseudo:P});
const FORM={pseudo:'Testeur_1',email:'  Awa@Example.COM ',password:'motdepasse8',consent:true};

test('S1 : inscription : e-mail réel, pseudo EXACT en métadonnées, aucun username_key, aucune adresse fabriquée',async()=>{
 const c=mockClient(),a=mkAuth(c),r=await a.signUp(FORM);
 assert.equal(r.ok,true);
 const [,p]=c.calls[0];
 assert.equal(p.email,'awa@example.com');
 assert.deepEqual(p.options.data,{username:'Testeur_1',display_name:'Testeur_1',recovery_email:null});
 assert.equal(JSON.stringify(p).includes('username_key'),false);
 assert.equal(JSON.stringify(p).includes('accounts.nzassa'),false);
 assert.equal(r.user.pseudo,'Testeur_1');
});
test('S2 : inscription refusée AVANT tout appel réseau si pseudo, e-mail, mot de passe ou consentement invalides',async()=>{
 for(const [bad,field] of [[{pseudo:'A'},'pseudo'],[{email:'nope'},'email'],[{password:'court'},'password'],[{consent:false},'consent']]){
  const c=mockClient(),r=await mkAuth(c).signUp({...FORM,...bad});
  assert.equal(r.ok,false);assert.equal(r.field,field);assert.equal(c.calls.length,0);
 }
});
test('S3 : connexion = e-mail + mot de passe ; un pseudo n’est jamais accepté comme identifiant',async()=>{
 const c=mockClient(),a=mkAuth(c);
 const r=await a.signIn({email:'Awa@Example.com',password:'motdepasse8'});assert.equal(r.ok,true);
 assert.deepEqual(c.calls[0][1],{email:'awa@example.com',password:'motdepasse8'});
 const n=c.calls.length,r2=await a.signIn({email:'Testeur_1',password:'motdepasse8'});
 assert.deepEqual(r2,{ok:false,error:'invalid_email'});assert.equal(c.calls.length,n);/* aucun appel */
 assert.equal((await a.signIn({email:'a@b.co',password:'faux'})).error,'bad_credentials');
});
test('S4 : traduction des erreurs (jamais le message brut) ; panne réseau ≠ erreur d’identifiants',async()=>{
 const E=AU.normalizeError;
 assert.equal(E({code:'user_already_exists'}),'email_taken');assert.equal(E({message:'User already registered'}),'email_taken');
 assert.equal(E({code:'weak_password'}),'weak_password');assert.equal(E({code:'over_request_rate_limit',status:429}),'rate_limited');
 assert.equal(E({code:'email_not_confirmed'}),'email_not_confirmed');assert.equal(E({code:'signup_disabled'}),'signup_disabled');
 assert.equal(E({message:'Database error saving new user',status:500,code:'unexpected_failure'}),'profile_error');
 assert.equal(E({name:'AuthRetryableFetchError',status:0,message:'Failed to fetch'}),'offline');
 assert.equal(E({message:'quelque chose d’inattendu'}),'unknown');
 const r=await mkAuth(mockClient({signIn:async()=>{throw new TypeError('Failed to fetch')}})).signIn({email:'a@b.co',password:'x'});
 assert.equal(r.error,'offline');
});
test('S5 : confirmation d’adresse exigée par le projet : pending ; adresse déjà inscrite : email_taken',async()=>{
 let r=await mkAuth(mockClient({signUp:async a=>({data:{user:{id:'u',email:a.email,identities:[{}],user_metadata:{}},session:null},error:null})})).signUp(FORM);
 assert.deepEqual([r.ok,r.pending],[true,'confirm_email']);
 r=await mkAuth(mockClient({signUp:async a=>({data:{user:{id:'u',email:a.email,identities:[],user_metadata:{}},session:null},error:null})})).signUp(FORM);
 assert.equal(r.error,'email_taken');
});
test('S6 : disponibilité du pseudo (RPC facultative), nom d’affichage, suppression de compte',async()=>{
 const c=mockClient({rpc:async n=>n==='nzassa_username_available'?{data:false,error:null}:{data:null,error:{code:'PGRST202',message:'Could not find the function'}}}),a=mkAuth(c);
 assert.equal(await a.isPseudoAvailable('Awa'),false);
 assert.equal(await mkAuth(mockClient({rpc:async()=>({data:null,error:{code:'PGRST202'}})})).isPseudoAvailable('Awa'),null);/* fonction absente : inconnu, pas « libre » */
 assert.deepEqual(await a.deleteAccount(),{ok:false,error:'delete_unavailable'});
 assert.equal(c.calls.some(x=>x[0]==='signOut'),false);/* compte non supprimé : pas de déconnexion */
});
test('S7 : client : clé secrète refusée, configuration manquante = invité, bibliothèque absente = invité',()=>{
 const jwt=role=>'x.'+Buffer.from(JSON.stringify({role})).toString('base64url')+'.y';
 assert.equal(CL.keyKind('sb_publishable_abc'),'public');assert.equal(CL.keyKind('sb_secret_abc'),'secret');
 assert.equal(CL.keyKind(jwt('service_role')),'secret');assert.equal(CL.keyKind(jwt('anon')),'public');
 const lib={createClient:(u,k,o)=>({u,k,o})},URL_='https://abcd.supabase.co';
 assert.equal(CL.init({}).status,'not_configured');
 assert.equal(CL.init({NZASSA_SUPABASE_URL:URL_,NZASSA_SUPABASE_KEY:'sb_secret_abc',supabase:lib}).status,'secret_key_refused');
 assert.equal(CL.init({NZASSA_SUPABASE_URL:'http://evil.example',NZASSA_SUPABASE_KEY:'sb_publishable_x',supabase:lib}).status,'bad_url');
 assert.equal(CL.init({NZASSA_SUPABASE_URL:URL_,NZASSA_SUPABASE_KEY:'sb_publishable_x'}).status,'missing_library');
 const ok=CL.init({NZASSA_SUPABASE_URL:URL_,NZASSA_SUPABASE_KEY:'sb_publishable_x',supabase:lib});
 assert.equal(ok.status,'ready');assert.deepEqual(ok.client.o.auth,{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true});
});

/* ---------- comptes : invité, session, transfert ---------- */
const UID='11111111-2222-4333-8444-555555555555';
const mk=(init,client)=>{const m=memStorage(init);const c=client||mockClient();const acc=AC.create({storage:m,crypto:webcrypto,auth:mkAuth(c)});return {m,c,acc}};
const save=(extra)=>JSON.stringify(Object.assign({v:5,name:'Kofi',avatar:null,d:{wolof:{done:{q1:1}}},settings:{mode:'2d',setupDone:1},learn:{xp:40}},extra||{}));

test('G1 : invité : identifiant local unique et stable, sauvegarde « lca-v2 » inchangée, aucun appel Supabase',()=>{
 const {m,c,acc}=mk({'lca-v2':save()});
 const id=acc.guestId();assert.match(id,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
 assert.equal(AC.create({storage:m,crypto:webcrypto,auth:null}).guestId(),id);/* persistant */
 assert.equal(acc.mode(),'guest');assert.equal(acc.current(),null);assert.equal(acc.profileId(),'guest');
 const s=acc.storage();assert.equal(s.getItem('lca-v2'),save());s.setItem('lca-v2','X');assert.equal(m._m['lca-v2'],'X');
 assert.equal(c.calls.length,0);
 assert.notEqual(mk({}).acc.guestId(),id);/* deux navigateurs, deux identifiants */
});
test('G2 : inscription : le compte reçoit son propre emplacement ; l’invité n’est jamais touché',async()=>{
 const {m,acc}=mk({'lca-v2':save()});
 const r=await acc.register({...FORM,importProgress:false,seed:{settings:{mode:'3d',setupDone:1}}});
 assert.equal(r.ok,true);assert.equal(acc.mode(),'account');assert.equal(acc.current().pseudo,'Testeur_1');assert.equal(acc.current().id,UID);
 assert.deepEqual(JSON.parse(m._m['lca-u-'+UID]),{settings:{mode:'3d',setupDone:1}});/* réglages du parcours conservés */
 assert.equal(m._m['lca-v2'],save());/* invité intact */
 assert.equal(acc.frozen(),true);/* rechargement simulé : nouvelle instance */
 AC.create({storage:m,crypto:webcrypto,auth:null}).storage().setItem('lca-v2','COMPTE');assert.equal(m._m['lca-u-'+UID],'COMPTE');assert.equal(m._m['lca-v2'],save());
});
test('M1 : transfert vers un compte vide : COPIE de la progression invité, source intacte',async()=>{
 const {m,acc}=mk({'lca-v2':save()});
 assert.deepEqual(acc.canImport(),{label:'invité'});
 const r=await acc.register({...FORM,importProgress:true});
 assert.equal(r.imported,'copied');assert.equal(r.conflict,false);
 assert.equal(m._m['lca-u-'+UID],save());assert.equal(m._m['lca-v2'],save());
});
test('M2 : le compte a déjà une progression : AUCUN écrasement silencieux ; choix « garder » ou « remplacer » (sauvegarde conservée)',async()=>{
 const mine=save({name:'Compte',d:{swahili:{done:{a:1}}}});
 const {m,acc}=mk({'lca-v2':save(),['lca-u-'+UID]:mine});
 const r=await acc.login({email:'a@b.co',password:'motdepasse8',importProgress:true});
 assert.equal(r.ok,true);assert.equal(r.conflict,true);assert.equal(r.imported,null);
 assert.equal(m._m['lca-u-'+UID],mine);/* rien n’a bougé tant que l’utilisateur n’a pas choisi */
 assert.deepEqual(acc.pendingConflict(),{label:'invité'});
 assert.equal(acc.resolveConflict('keep').ok,true);assert.equal(m._m['lca-u-'+UID],mine);assert.equal(acc.pendingConflict(),null);
 /* même chose, mais on remplace */
 const b=mk({'lca-v2':save(),['lca-u-'+UID]:mine});await b.acc.login({email:'a@b.co',password:'motdepasse8',importProgress:true});
 assert.equal(b.acc.resolveConflict('replace').ok,true);
 assert.equal(b.m._m['lca-u-'+UID],save());assert.equal(b.m._m['lca-u-'+UID+'.pre-import'],mine);assert.equal(b.m._m['lca-v2'],save());
});
test('M3 : sans demande de transfert, rien n’est copié ; un invité sans progression n’a rien à proposer',async()=>{
 const {m,acc}=mk({'lca-v2':save()});await acc.login({email:'a@b.co',password:'motdepasse8',importProgress:false});
 assert.equal(m._m['lca-u-'+UID],undefined);
 assert.equal(mk({'lca-v2':JSON.stringify({v:5,d:{},settings:{}})}).acc.canImport(),null);
 assert.equal(AC.hasProgress('{oops'),false);
});
test('T1 : session persistante : au démarrage le compte reprend son emplacement, puis la session est vérifiée',async()=>{
 const c=mockClient(),m=memStorage({'lca-v2':save()});
 let acc=AC.create({storage:m,crypto:webcrypto,auth:mkAuth(c)});await acc.login({email:'a@b.co',password:'motdepasse8'});
 AC.create({storage:m,crypto:webcrypto,auth:null}).storage().setItem('lca-v2','PROGRESSION');
 const acc2=AC.create({storage:m,crypto:webcrypto,auth:mkAuth(c)});/* « rechargement de page » */
 assert.equal(acc2.mode(),'account');assert.equal(acc2.status(),'pending');assert.equal(acc2.storage().getItem('lca-v2'),'PROGRESSION');
 c.setSession({user:{id:UID,email:'a@b.co',user_metadata:{username:'Testeur_1'}}});
 assert.equal((await acc2.restore()).status,'ok');assert.equal(acc2.status(),'ok');
});
test('T2 : session expirée ou perdue : « expired », la progression locale reste jouable, jamais de bascule silencieuse',async()=>{
 const c=mockClient(),m=memStorage({});
 let acc=AC.create({storage:m,crypto:webcrypto,auth:mkAuth(c)});await acc.login({email:'a@b.co',password:'motdepasse8'});
 AC.create({storage:m,crypto:webcrypto,auth:null}).storage().setItem('lca-v2','X');
 const acc2=AC.create({storage:m,crypto:webcrypto,auth:mkAuth(c)}),seen=[];acc2.onStatus(s=>seen.push(s));
 c.setSession(null);await acc2.restore();
 assert.equal(acc2.status(),'expired');assert.equal(acc2.mode(),'account');assert.equal(acc2.storage().getItem('lca-v2'),'X');assert.deepEqual(seen,['expired']);
 /* autre utilisateur dans la session persistée : même traitement */
 c.setSession({user:{id:'autre',user_metadata:{}}});const acc3=AC.create({storage:m,crypto:webcrypto,auth:mkAuth(c)});await acc3.restore();assert.equal(acc3.status(),'expired');
});
test('T3 : hors ligne au démarrage : « offline » (on continue à jouer) ; déconnexion décidée ailleurs ou jeton refusé : « expired »',async()=>{
 const c=mockClient(),m=memStorage({});
 await AC.create({storage:m,crypto:webcrypto,auth:mkAuth(c)}).login({email:'a@b.co',password:'motdepasse8'});
 const off=AC.create({storage:m,crypto:webcrypto,auth:mkAuth(mockClient({getSession:async()=>{throw new TypeError('Failed to fetch')}}))});
 await off.restore();assert.equal(off.status(),'offline');
 const none=AC.create({storage:m,crypto:webcrypto,auth:null});await none.restore();assert.equal(none.status(),'offline');assert.equal(none.canAuth(),false);
 const live=AC.create({storage:m,crypto:webcrypto,auth:mkAuth(c)});c.setSession({user:{id:UID,user_metadata:{}}});await live.restore();assert.equal(live.status(),'ok');
 c.listeners.forEach(f=>f('SIGNED_OUT',null));assert.equal(live.status(),'expired');/* rafraîchissement impossible */
});
test('T4 : déconnexion voulue : retour à l’invité, progression du compte conservée sur l’appareil',async()=>{
 const {m,acc,c}=mk({'lca-v2':save()});await acc.login({email:'a@b.co',password:'motdepasse8',importProgress:true});
 const before=m._m['lca-u-'+UID];assert.equal((await acc.logout()).ok,true);
 assert.equal(acc.mode(),'guest');assert.equal(acc.status(),'guest');assert.equal(m._m['lca-u-'+UID],before);assert.deepEqual(c.calls.find(x=>x[0]==='signOut')[1],{scope:'local'});
});
test('T5 : suppression de compte : seulement si la base l’autorise ; progression locale effacée seulement sur demande',async()=>{
 const ok=mk({},mockClient({rpc:async()=>({data:null,error:null})}));await ok.acc.login({email:'a@b.co',password:'motdepasse8'});AC.create({storage:ok.m,crypto:webcrypto,auth:null}).storage().setItem('lca-v2','X');const okacc=AC.create({storage:ok.m,crypto:webcrypto,auth:ok.acc&&mkAuth(mockClient({rpc:async()=>({data:null,error:null})}))});
 assert.equal((await okacc.deleteAccount({eraseLocal:false})).ok,true);assert.equal(ok.m._m['lca-u-'+UID],'X');assert.equal(okacc.mode(),'guest');
 const er=AC.create({storage:ok.m,crypto:webcrypto,auth:null});assert.equal(er.mode(),'guest');
 const no=mk({});await no.acc.login({email:'a@b.co',password:'motdepasse8'});
 no.c.rpc=async()=>({data:null,error:{code:'PGRST202'}});
 assert.equal((await mk({}).acc.deleteAccount()).ok,false);
});
test('L1 : migration d’un ancien index (profils locaux) : rien n’est perdu, le profil actif reste actif, jeton SQLite retiré',async()=>{
 const salt=webcrypto.getRandomValues(new Uint8Array(16)),k=await webcrypto.subtle.importKey('raw',new TextEncoder().encode('secret1'),'PBKDF2',false,['deriveBits']);
 const hash=Buffer.from(new Uint8Array(await webcrypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations:1000},k,256))).toString('base64');
 const old={v:1,current:'ab12',accounts:[{id:'ab12',key:'kofi',pseudo:'Kofi',created:5,salt:Buffer.from(salt).toString('base64'),iter:1000,hash},{id:'cd34',key:'awa',pseudo:'Awa',created:6}],fails:{}};
 const m=memStorage({'lca-acc':JSON.stringify(old),'lca-u-ab12':save(),'lca-u-cd34':save({name:'Awa'}),'lca-cloud':'{"token":"t"}'});
 const acc=AC.create({storage:m,crypto:webcrypto,auth:null});
 assert.equal(acc.mode(),'local');assert.equal(acc.current().pseudo,'Kofi');assert.equal(acc.storage().getItem('lca-v2'),save());/* même sauvegarde qu’avant */
 assert.equal(m._m['lca-cloud'],undefined);assert.ok(m._m['lca-acc.v1.bak']);
 assert.deepEqual(acc.legacyProfiles().map(a=>[a.pseudo,a.hasPassword]),[['Kofi',true],['Awa',false]]);
 assert.deepEqual(acc.canImport(),{label:'ancien profil « Kofi »'});
 assert.equal((await acc.useLegacy('cd34')).ok,true);assert.equal(acc.current().pseudo,'Awa');
 assert.equal((await acc.useLegacy('ab12','faux')).ok,false);assert.equal(acc.current().pseudo,'Awa');/* mauvais mot de passe : on ne bascule pas */
 assert.equal((await acc.useLegacy('ab12','secret1')).ok,true);assert.equal(acc.current().pseudo,'Kofi');
 assert.equal(acc.useGuest().ok,true);assert.equal(acc.mode(),'guest');assert.equal(m._m['lca-u-ab12'],save());
});
test('L2 : transfert depuis un ancien profil local vers un compte (copie, source intacte)',async()=>{
 const old={v:1,current:'ab12',accounts:[{id:'ab12',key:'kofi',pseudo:'Kofi',created:5}],fails:{}};
 const {m,acc}=mk({'lca-acc':JSON.stringify(old),'lca-u-ab12':save({name:'Kofi'})});
 const r=await acc.login({email:'a@b.co',password:'motdepasse8',importProgress:true});
 assert.equal(r.imported,'copied');assert.equal(JSON.parse(m._m['lca-u-'+UID]).name,'Kofi');assert.ok(m._m['lca-u-ab12']);
});
test('R1 : index corrompu ou stockage qui échoue : pas d’exception, repli sur l’invité',async()=>{
 const a1=AC.create({storage:memStorage({'lca-acc':'{oops'}),crypto:webcrypto,auth:null});assert.equal(a1.mode(),'guest');assert.ok(a1.guestId());
 const bad={getItem(){throw new Error('x')},setItem(){throw new Error('quota')},removeItem(){throw new Error('x')}};
 const a2=AC.create({storage:bad,crypto:webcrypto,auth:mkAuth(mockClient())});
 assert.equal(a2.mode(),'guest');
 const r=await a2.login({email:'a@b.co',password:'motdepasse8'});/* connexion réussie côté Supabase mais impossible d’écrire l’index */
 assert.deepEqual([r.ok,r.error],[false,'storage']);assert.equal(a2.mode(),'guest');
});
test('R2 : aucune trace de l’ancienne logique (adresse artificielle, SQLite, jeton copié) dans le code des comptes',()=>{
 for(const f of ['js/account/accounts.js','js/account/pseudo.js','js/supabase/auth.js','js/supabase/client.js']){
  const t=fs.readFileSync(path.join(root,f),'utf8');
  assert.equal(/accounts\.nzassa|@accounts\.|sqlite|service_role.*=/i.test(t.replace(/service_role/g,'')),false,f);
 }
});

test('F1 : après un changement d’emplacement, les écritures de l’ancienne progression en mémoire sont ignorées (aucun écrasement)',async()=>{
 const mine=save({name:'Compte',d:{swahili:{done:{a:1}}}});
 const {m,acc}=mk({'lca-v2':save(),['lca-u-'+UID]:mine});
 const s=acc.storage();
 await acc.login({email:'a@b.co',password:'motdepasse8',importProgress:true});/* conflit : l’interface reste ouverte sans recharger */
 assert.equal(acc.frozen(),true);
 s.setItem('lca-v2','ANCIENNE-PROGRESSION-INVITE');s.removeItem('lca-v2');
 assert.equal(m._m['lca-u-'+UID],mine);assert.equal(m._m['lca-v2'],save());
 assert.equal(acc.storage().getItem('lca-v2'),mine);/* la lecture suit le nouvel emplacement */
 /* un rechargement (nouvelle instance) réécrit normalement */
 const acc2=AC.create({storage:m,crypto:webcrypto,auth:null});acc2.storage().setItem('lca-v2','OK');assert.equal(m._m['lca-u-'+UID],'OK');
 /* déconnexion : même protection pour la sauvegarde invité */
 const b=mk({'lca-v2':save()});await b.acc.login({email:'a@b.co',password:'motdepasse8'});const b2=AC.create({storage:b.m,crypto:webcrypto,auth:mkAuth(b.c)});
 await b2.logout();b2.storage().setItem('lca-v2','ÉTAT-DU-COMPTE');assert.equal(b.m._m['lca-v2'],save());
});

/* ---------- transfert invité → compte : cas d'ÉCHEC (rien ne doit se perdre, rien ne doit se corrompre) ---------- */
const failing=(init,pred)=>{const m=memStorage(init),raw=m.setItem;m.setItem=(k,v)=>{if(pred(k))throw Object.assign(new Error('QuotaExceededError'),{name:'QuotaExceededError'});raw(k,v)};return m};
const snapshot=m=>JSON.stringify(m._m);
test('M4 : échec d’écriture du compte (stockage plein) : sauvegarde d’invité intacte, pas d’emplacement à moitié écrit, on reste invité',async()=>{
 const m=failing({'lca-v2':save()},k=>k.startsWith('lca-u-'));const acc=AC.create({storage:m,crypto:webcrypto,auth:mkAuth(mockClient())});
 const r=await acc.register({...FORM,importProgress:true});
 assert.equal(r.ok,false);assert.equal(m._m['lca-v2'],save(),'la progression d’invité n’a pas bougé');
 assert.equal(Object.keys(m._m).some(k=>k.startsWith('lca-u-')),false,'aucun emplacement de compte partiel');
 assert.equal(acc.mode(),'guest','le joueur reste invité : il peut réessayer');
});
test('M5 : identifiants refusés par Supabase : AUCUNE écriture de compte, progression d’invité intacte',async()=>{
 const m=memStorage({'lca-v2':save()});
 const c=mockClient({signIn:async()=>({data:{user:null,session:null},error:{status:400,code:'invalid_credentials',message:'Invalid login credentials'}})});
 const acc=AC.create({storage:m,crypto:webcrypto,auth:mkAuth(c)});
 const r=await acc.login({email:'a@b.co',password:'mauvais-mot-de-passe',importProgress:true});
 assert.equal(r.ok,false);assert.equal(m._m['lca-v2'],save());assert.equal(Object.keys(m._m).some(k=>k.startsWith('lca-u-')),false);
 assert.equal(acc.mode(),'guest');assert.equal(JSON.parse(m._m['lca-acc']).current.kind,'guest')});
test('M6 : « remplacer » sans pouvoir sauvegarder l’ancienne progression du compte : le remplacement est REFUSÉ (jamais de perte silencieuse)',async()=>{
 const mine=save({name:'Compte',d:{swahili:{done:{a:1}}}});
 const m=failing({'lca-v2':save(),['lca-u-'+UID]:mine},k=>k.endsWith('.pre-import'));
 const acc=AC.create({storage:m,crypto:webcrypto,auth:mkAuth(mockClient())});
 const r=await acc.login({email:'a@b.co',password:'motdepasse8',importProgress:true});assert.equal(r.conflict,true);
 const res=acc.resolveConflict('replace');assert.equal(res.ok,false);
 assert.equal(m._m['lca-u-'+UID],mine,'la progression du compte est conservée');assert.equal(m._m['lca-v2'],save());
 assert.equal(acc.pendingConflict()!==null,true,'le conflit reste en attente : l’utilisateur peut choisir « garder »');
 assert.equal(acc.resolveConflict('keep').ok,true)});
test('M7 : réseau coupé pendant l’inscription : aucun changement local, réessai possible',async()=>{
 const m=memStorage({'lca-v2':save()});
 const c=mockClient({signUp:async()=>{throw new TypeError('Failed to fetch')}});const acc=AC.create({storage:m,crypto:webcrypto,auth:mkAuth(c)});
 const r=await acc.register({...FORM,importProgress:true});assert.equal(r.ok,false);
 assert.equal(m._m['lca-v2'],save());assert.equal(Object.keys(m._m).some(k=>k.startsWith('lca-u-')),false);assert.equal(acc.mode(),'guest');
 /* le réseau revient : le même formulaire fonctionne */
 const acc2=AC.create({storage:m,crypto:webcrypto,auth:mkAuth(mockClient())});const r2=await acc2.register({...FORM,importProgress:true});assert.equal(r2.ok,true);assert.equal(r2.imported,'copied')});
test('M8 : migration INTERROMPUE (coupure entre la copie et l’enregistrement de l’index) puis relancée : ni doublon, ni conflit fantôme, ni corruption',async()=>{
 /* 1re tentative : l'emplacement du compte est copié, puis l'écriture de l'index échoue (onglet fermé, stockage plein…) */
 let armed=true;const m=memStorage({'lca-v2':save()}),raw=m.setItem;
 m.setItem=(k,v)=>{if(armed&&k==='lca-acc'&&JSON.parse(v).current&&JSON.parse(v).current.kind==='account')throw Object.assign(new Error('QuotaExceededError'),{name:'QuotaExceededError'});raw(k,v)};
 const a1=AC.create({storage:m,crypto:webcrypto,auth:mkAuth(mockClient())});const r1=await a1.register({...FORM,importProgress:true});
 assert.equal(r1.ok,false);assert.equal(m._m['lca-v2'],save(),'invité intact');
 /* relance (nouvelle session de l'application, même stockage) : le compte existe déjà côté Supabase, on se connecte avec import */
 armed=false;const a2=AC.create({storage:m,crypto:webcrypto,auth:mkAuth(mockClient())});
 const r2=await a2.login({email:'a@b.co',password:'motdepasse8',importProgress:true});
 assert.equal(r2.ok,true);assert.equal(r2.conflict,false,'une copie identique déjà présente n’est pas un conflit');
 assert.equal(m._m['lca-u-'+UID],save(),'progression du compte = progression d’invité, octet pour octet');
 assert.equal(m._m['lca-v2'],save());assert.equal(Object.keys(m._m).filter(k=>k.startsWith('lca-u-')).length,1,'un seul emplacement de compte');
 assert.equal(Object.keys(m._m).some(k=>k.endsWith('.pre-import')),false,'aucune sauvegarde parasite');
 assert.equal(JSON.parse(m._m['lca-acc']).current.kind,'account');
 /* relancer une TROISIÈME fois ne change rien (idempotent) */
 const snap=JSON.stringify(m._m);const a3=AC.create({storage:m,crypto:webcrypto,auth:mkAuth(mockClient())});await a3.login({email:'a@b.co',password:'motdepasse8',importProgress:true});
 assert.equal(JSON.stringify(m._m),snap)});
