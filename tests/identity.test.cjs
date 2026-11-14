'use strict';
const test=require('node:test'),assert=require('node:assert');
const {createSupabaseVerifier,keyIsSecret,expOf}=require('../server/identity.cjs');
const b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const tok=(exp,extra)=>'h.'+b64(Object.assign({exp},extra||{}))+'.s';
const UID='55555555-5555-4555-8555-555555555555',URL='https://abcdefgh.supabase.co';
const resp=(status,json)=>({ok:status>=200&&status<300,status,json:async()=>json});
test('I1 jeton valide : identité = identifiant renvoyé par Supabase, jamais celui du jeton',async()=>{
 let seen;const v=createSupabaseVerifier({url:URL,key:'sb_publishable_x',now:()=>1e12,fetch:async(u,o)=>{seen={u,o};return resp(200,{id:UID})}});
 const r=await v(tok(1e9+1,{sub:'99999999-9999-4999-8999-999999999999'}));assert.equal(r.sub,UID);
 assert.equal(seen.u,URL+'/auth/v1/user');assert.equal(seen.o.headers.apikey,'sb_publishable_x')});
test('I2 refus : 401, jeton expiré, forme invalide, identifiant non UUID',async()=>{
 const now=()=>2e12;let st=401,body={};const v=createSupabaseVerifier({url:URL,key:'sb_publishable_x',now,fetch:async()=>resp(st,body)});
 assert.equal(await v(tok(3e9)),null);st=200;body={id:'pas-un-uuid'};assert.equal(await v(tok(3e9)),null);
 body={id:UID};assert.equal(await v(tok(1)),null,'expiré');assert.equal(await v('abc'),null);assert.equal(await v(null),null)});
test('I3 panne Supabase : erreur 503 explicite (pas de faux invité, pas de faux compte)',async()=>{
 const v=createSupabaseVerifier({url:URL,key:'sb_publishable_x',fetch:async()=>resp(502,{})});await assert.rejects(()=>v(tok(4e9)),e=>e.code==='auth_unavailable'&&e.status===503);
 const w=createSupabaseVerifier({url:URL,key:'sb_publishable_x',fetch:async()=>{throw new Error('réseau')}});await assert.rejects(()=>w(tok(4e9)),e=>e.code==='auth_unavailable')});
test('I4 cache : un même jeton ne rappelle pas Supabase pendant le délai',async()=>{
 let n=0,t=1e12;const v=createSupabaseVerifier({url:URL,key:'sb_publishable_x',now:()=>t,fetch:async()=>{n++;return resp(200,{id:UID})}});
 const k=tok(4e9);await v(k);await v(k);assert.equal(n,1);t+=61000;await v(k);assert.equal(n,2)});
test('I5 clés secrètes et URL non Supabase refusées',()=>{
 assert.equal(keyIsSecret('sb_secret_abc'),true);assert.equal(keyIsSecret('sb_publishable_abc'),false);
 assert.equal(keyIsSecret('h.'+b64({role:'service_role'})+'.s'),true);assert.equal(keyIsSecret('h.'+b64({role:'anon'})+'.s'),false);
 assert.equal(createSupabaseVerifier({url:URL,key:'sb_secret_abc'}),null);assert.equal(createSupabaseVerifier({url:'https://evil.example',key:'sb_publishable_x'}),null);
 assert.equal(expOf(tok(123)),123)});
