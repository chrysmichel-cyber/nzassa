/* Tests unitaires de la PWA : politique de cache, manifeste, construction (build) et cohérence des versions. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const root=path.join(__dirname,'..'),P=require('../js/pwa/policy.js'),O='https://nzassa.example';
const req=(u,x)=>Object.assign({url:u,method:'GET'},x||{});

test('politique : fichiers statiques du site autorisés',()=>{
 ['/index.html','/js/main.js','/css/styles.css','/img/icon-192.png','/manifest.webmanifest','/vendor/supabase-js-2.109.0.umd.js'].forEach(u=>assert.equal(P.cacheable(req(O+u),O),true,u));
 assert.equal(P.cacheable(req(O+'/anything',{mode:'navigate'}),O),true)});
test('politique : jamais d’API, de compte, de temps réel, de santé',()=>{
 ['/v1/ws','/v1/world/join','/auth/v1/token','/rest/v1/profiles','/realtime/v1/websocket','/health','/api/x'].forEach(u=>assert.equal(P.cacheable(req(O+u),O),false,u))});
test('politique : jamais de requête à jeton, avec autorisation, hors origine ou non GET',()=>{
 assert.equal(P.cacheable(req(O+'/js/a.js?access_token=abc'),O),false);
 assert.equal(P.cacheable(req(O+'/js/a.js?apikey=k'),O),false);
 assert.equal(P.cacheable(req(O+'/js/a.js?x=1&token=t'),O),false);
 assert.equal(P.cacheable(req(O+'/js/a.js',{hasAuth:true}),O),false);
 assert.equal(P.cacheable(req('https://abc.supabase.co/auth/v1/user'),O),false);
 assert.equal(P.cacheable(req('https://fonts.googleapis.com/css2?family=X'),O),false);
 assert.equal(P.cacheable(req(O+'/js/a.js',{method:'POST'}),O),false);
 assert.equal(P.cacheable(req('not a url'),O),false);
 assert.equal(P.cacheable(req(O+'/data.json'),O),false,'JSON non listé : refusé par prudence')});
const res=(o)=>({status:200,type:'basic',headers:new Map(Object.entries(o||{}))});
test('politique : réponses stockables',()=>{
 assert.equal(P.storable(res()),true);
 assert.equal(P.storable(Object.assign(res(),{status:404})),false);
 assert.equal(P.storable(Object.assign(res(),{type:'opaque'})),false);
 assert.equal(P.storable(res({'cache-control':'no-store'})),false);
 assert.equal(P.storable(res({'cache-control':'private, max-age=0'})),false);
 assert.equal(P.storable(res({'set-cookie':'a=b'})),false);
 assert.equal(P.storable(null),false)});
test('politique : fraîcheur prioritaire pour la configuration publique',()=>{
 assert.equal(P.networkFirst('/js/supabase/config.js'),true);assert.equal(P.networkFirst('/manifest.webmanifest'),true);assert.equal(P.networkFirst('/js/main.js'),false)});

test('manifeste : champs requis pour l’installation',()=>{
 const m=JSON.parse(fs.readFileSync(path.join(root,'manifest.webmanifest'),'utf8'));
 assert.equal(m.display,'standalone');assert.ok(m.name&&m.short_name&&m.start_url&&m.scope&&m.id);
 assert.ok(m.icons.some(i=>i.sizes==='192x192'&&i.purpose==='any')&&m.icons.some(i=>i.sizes==='512x512'&&i.purpose==='maskable'));
 m.icons.forEach(i=>{const b=fs.readFileSync(path.join(root,i.src));assert.equal(b.readUInt32BE(16)+'x'+b.readUInt32BE(20),i.sizes,i.src)})});

test('build : sw.js généré, précache sans secret, version cohérente',()=>{
 execFileSync('node',[path.join(root,'scripts/build.mjs')],{cwd:root,stdio:'pipe'});
 const sw=fs.readFileSync(path.join(root,'dist/sw.js'),'utf8');
 const build=/const BUILD="([^"]+)"/.exec(sw);assert.ok(build,'BUILD remplacé');
 const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')),lock=JSON.parse(fs.readFileSync(path.join(root,'package-lock.json'),'utf8'));
 assert.ok(build[1].startsWith(pkg.version+'-'),'version du build = version du package');
 assert.equal(lock.version,pkg.version,'package-lock cohérent');
 const pre=JSON.parse(/PRECACHE=(\[.*?\]),CACHE/.exec(sw)[1]);
 assert.ok(pre.length>100&&pre.includes('index.html')&&pre.includes('js/main.js')&&pre.includes('manifest.webmanifest'));
 assert.ok(!pre.some(f=>/\.(?:env|pem|key|map|md)$|node_modules|server\/|supabase\/.*\.sql|tests\//.test(f)),'rien de sensible ni d’inutile dans le précache');
 pre.forEach(f=>assert.ok(fs.existsSync(path.join(root,'dist',f)),'fichier absent du dist : '+f));
 assert.ok(!/service_role|sb_secret_/.test(fs.readFileSync(path.join(root,'dist/js/supabase/config.js'),'utf8')),'aucune clé secrète dans la configuration publique')});
test('build : deux builds identiques donnent la même version, un fichier modifié la change',()=>{
 const get=()=>/const BUILD="([^"]+)"/.exec(fs.readFileSync(path.join(root,'dist/sw.js'),'utf8'))[1];
 execFileSync('node',[path.join(root,'scripts/build.mjs')],{cwd:root,stdio:'pipe'});const a=get();
 execFileSync('node',[path.join(root,'scripts/build.mjs')],{cwd:root,stdio:'pipe'});assert.equal(get(),a);
 const f=path.join(root,'css/styles.css'),orig=fs.readFileSync(f);
 try{fs.appendFileSync(f,'\n/* test */');execFileSync('node',[path.join(root,'scripts/build.mjs')],{cwd:root,stdio:'pipe'});assert.notEqual(get(),a)}
 finally{fs.writeFileSync(f,orig);execFileSync('node',[path.join(root,'scripts/build.mjs')],{cwd:root,stdio:'pipe'})}});
