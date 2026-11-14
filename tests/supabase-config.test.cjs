'use strict';
const test=require('node:test'),assert=require('node:assert');
const load=()=>import('../scripts/supabase-config.mjs');
const URL_OK='https://abcdefgh.supabase.co',PUB='sb_publishable_abc123';
test('B1 : variables d’environnement acceptées',async()=>{
 const {resolveConfig}=await load();
 const r=resolveConfig({env:{NZASSA_SUPABASE_URL:URL_OK,NZASSA_SUPABASE_KEY:PUB}});
 assert.equal(r.error,undefined);assert.equal(r.url,URL_OK);assert.equal(r.key,PUB);assert.equal(r.source,'env');
});
test('B2 : repli sur le fichier local quand l’environnement est vide',async()=>{
 const {resolveConfig}=await load();
 const r=resolveConfig({env:{},fileText:`window.NZASSA_SUPABASE_URL='${URL_OK}';window.NZASSA_SUPABASE_KEY='${PUB}';`});
 assert.equal(r.source,'file');assert.equal(r.url,URL_OK);
});
test('B3 : clé secrète refusée',async()=>{
 const {resolveConfig}=await load();
 const r=resolveConfig({env:{NZASSA_SUPABASE_URL:URL_OK,NZASSA_SUPABASE_KEY:'sb_secret_xyz'}});
 assert.ok(r.error);assert.equal(r.key,'');
});
test('B4 : Netlify sans configuration → échec ; en local → simple avertissement',async()=>{
 const {resolveConfig}=await load();
 assert.ok(resolveConfig({env:{NETLIFY:'true'}}).error);
 const l=resolveConfig({env:{}});assert.equal(l.error,undefined);assert.ok(l.warning);
 assert.equal(resolveConfig({env:{NETLIFY:'true',NZASSA_ALLOW_NO_ACCOUNTS:'1'}}).error,undefined);
});
test('B5 : URL invalide refusée',async()=>{
 const {resolveConfig}=await load();
 assert.ok(resolveConfig({env:{NZASSA_SUPABASE_URL:'http://evil.example',NZASSA_SUPABASE_KEY:PUB}}).error);
});
