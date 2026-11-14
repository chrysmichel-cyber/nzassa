'use strict';
/* Test du SCRIPT de vérification (scripts/verify-supabase-live.mjs) contre un Supabase SIMULÉ en mémoire.
   Ce n'est PAS une validation de Supabase : cela prouve seulement que le script détecte les bonnes anomalies quand on le lancera sur un vrai projet de test. */
const test=require('node:test'),assert=require('node:assert');
const b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
function emu(o){
 o=o||{};const users=[],S={calls:[]};let n=0;
 const j=(status,body)=>({ok:status>=200&&status<300,status,json:async()=>body});
 const who=h=>{const a=h.authorization||'';const t=a.replace('Bearer ','');return users.find(u=>u.token===t)||null};
 S.fetch=async(url,init)=>{init=init||{};const u=new URL(url),p=u.pathname,h=init.headers||{},body=init.body?JSON.parse(init.body):{};S.calls.push(p);
  if(p==='/auth/v1/signup'){const name=body.data.username,key=name.toLowerCase();
   if(users.some(x=>(o.noUnique?x.name===name:x.key===key)))return j(500,{msg:'Database error saving new user'});
   const id='00000000-0000-4000-8000-'+String(++n).padStart(12,'0'),tok='h.'+b64({sub:id,exp:Math.floor(Date.now()/1000)+3600})+'.sig'+n;users.push({id,name,key,email:body.email,token:tok});
   return j(200,{access_token:tok,user:{id}})}
  if(p==='/auth/v1/user'){const me=who(h);return me?j(200,{id:me.id}):j(401,{})}
  if(p==='/rest/v1/rpc/nzassa_name_taken_by_other'){if(o.noRpc)return j(404,{});const me=who(h),k=String(body.p_name).trim().toLowerCase();
   const rows=o.invoker&&!me?[]:users.filter(x=>x.key===k&&(!me||x.id!==me.id));return j(200,rows.length>0)}
  if(p==='/rest/v1/profiles'){const me=who(h);if(!me)return j(200,[]);return j(200,o.leakRls?users.map(x=>({id:x.id})):[{id:me.id}])}
  if(p==='/rest/v1/rpc/delete_my_account'){if(o.noDelete)return j(404,{});const me=who(h);if(me)users.splice(users.indexOf(me),1);return j(204,{})}
  return j(404,{})};
 S.users=users;return S}
const load=()=>import('../scripts/verify-supabase-live.mjs');
const env={NZASSA_TEST_SUPABASE_URL:'https://abcdefgh.supabase.co',NZASSA_TEST_SUPABASE_KEY:'sb_publishable_x'};
const go=async(o,extra)=>{const {run}=await load();const e=emu(o),logs=[];const r=await run({env:Object.assign({},env,extra||{}),fetch:e.fetch,argv:['--confirm-test-project'],log:m=>logs.push(m),rand:(()=>{let i=0;return()=>'r'+(++i)})()});return {r,e,logs}};

test('V1 projet conforme : toutes les vérifications passent, comptes jetables supprimés',async()=>{const {r,e}=await go();assert.equal(r.ok,true,JSON.stringify(r.results.filter(x=>!x.ok)));assert.equal(e.users.length,0)});
test('V2 pas d’index unique en base : le script le détecte et pointe vers 04',async()=>{const {r}=await go({noUnique:true});assert.equal(r.ok,false);assert.ok(r.results.some(x=>!x.ok&&/refusé par la base/.test(x.msg)))});
test('V3 fonction absente : détectée (« exécuter 03 »)',async()=>{const {r}=await go({noRpc:true});assert.equal(r.ok,false);assert.ok(r.results.some(x=>!x.ok&&/03_nom_reserve/.test(x.msg)))});
test('V4 fonction non SECURITY DEFINER (la RLS cache les lignes à l’invité) : recherche incomplète détectée',async()=>{const {r}=await go({invoker:true});assert.equal(r.ok,false);assert.ok(r.results.some(x=>!x.ok&&/invité : le pseudo de A est vu comme pris/.test(x.msg)))});
test('V5 RLS trop permissive (un compte voit les autres profils) : détectée',async()=>{const {r}=await go({leakRls:true});assert.equal(r.ok,false);assert.ok(r.results.some(x=>!x.ok&&/RLS/.test(x.msg)))});
test('V6 garde-fous : sans confirmation, avec clé secrète ou URL invalide → aucun appel réseau',async()=>{
 const {run}=await load();const e=emu();
 let r=await run({env,fetch:e.fetch,argv:[],log:()=>{}});assert.equal(r.refused,true);
 r=await run({env:{...env,NZASSA_TEST_SUPABASE_KEY:'sb_secret_x'},fetch:e.fetch,argv:['--confirm-test-project'],log:()=>{}});assert.equal(r.ok,false);
 r=await run({env:{...env,NZASSA_TEST_SUPABASE_URL:'http://evil.example'},fetch:e.fetch,argv:['--confirm-test-project'],log:()=>{}});assert.equal(r.ok,false);
 r=await run({env,fetch:e.fetch,argv:['--dry-run'],log:()=>{}});assert.equal(r.dry,true);assert.equal(e.calls.length,0)});
test('V7 nettoyage impossible (delete_my_account absente) : les comptes jetables sont listés pour suppression manuelle',async()=>{const {r,logs}=await go({noDelete:true});assert.ok(r.left.length>=2);assert.ok(logs.some(l=>/À SUPPRIMER MANUELLEMENT/.test(l)))});
