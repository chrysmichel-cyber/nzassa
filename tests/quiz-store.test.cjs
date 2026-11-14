'use strict';
/* Tests du stockage JSON des classements : persistance, écriture atomique, copie de secours, corruption, interface commune. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {fileStore,memoryStore}=require('../server/quizstore.cjs');
const tmp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'nzq-'));
const sub=(s,v,u,score,t,m)=>s.submit(v,{uid:u,name:u,score,timeMs:t,matchId:m,at:1});

test('S1 persistance : les scores survivent à un redémarrage du processus (nouvelle instance, même dossier)',async()=>{
 const d=tmp();let s=fileStore({dir:d});sub(s,'wolof','a',900,1000,'m1');sub(s,'wolof','b',800,1000,'m2');await s.close();
 s=fileStore({dir:d});assert.deepEqual(s.top('wolof').map(x=>x.name),['a','b']);assert.equal(s.describe().kind,'fichier JSON');await s.close()});
test('S2 écriture atomique : aucun fichier temporaire résiduel, contenu toujours valide',async()=>{
 const d=tmp(),s=fileStore({dir:d});for(let i=0;i<30;i++)sub(s,'wolof','u'+i,500+i,1000,'m'+i);await s.flush();
 assert.deepEqual(fs.readdirSync(d).filter(f=>f.endsWith('.tmp')),[]);const j=JSON.parse(fs.readFileSync(path.join(d,'quiz-scores.json'),'utf8'));assert.ok(j.sum&&j.data.v===1);await s.close()});
test('S3 fichier tronqué ou altéré : reprise sur la copie de secours',async()=>{
 const d=tmp();let s=fileStore({dir:d});sub(s,'wolof','a',900,1,'m1');await s.flush();sub(s,'wolof','b',800,1,'m2');await s.close();
 const f=path.join(d,'quiz-scores.json');fs.writeFileSync(f,fs.readFileSync(f,'utf8').slice(0,40));/* troncature */
 const logs=[];s=fileStore({dir:d,log:m=>logs.push(m)});assert.ok(s.top('wolof').length>=1,'données de la copie .bak');assert.ok(logs.some(l=>/corrompu/.test(l)));await s.close()});
test('S4 somme de contrôle : une modification manuelle est détectée',async()=>{
 const d=tmp();let s=fileStore({dir:d});sub(s,'wolof','a',900,1,'m1');await s.close();
 const f=path.join(d,'quiz-scores.json'),j=JSON.parse(fs.readFileSync(f,'utf8'));j.data.villages.wolof.players.a.score=99999;fs.writeFileSync(f,JSON.stringify(j));fs.rmSync(f+'.bak',{force:true});
 const logs=[];s=fileStore({dir:d,log:m=>logs.push(m)});assert.deepEqual(s.top('wolof'),[],'départ à vide plutôt que des scores falsifiés');assert.ok(logs.length>0);await s.close()});
test('S5 fichier absent : démarrage à vide sans erreur ; dossier créé',async()=>{
 const d=path.join(tmp(),'sous','dossier'),s=fileStore({dir:d});assert.deepEqual(s.top('wolof'),[]);sub(s,'wolof','a',1,1,'m');await s.close();assert.ok(fs.existsSync(path.join(d,'quiz-scores.json')))});
test('S6 doublons après redémarrage : un résultat déjà enregistré n’est pas recompté',async()=>{
 const d=tmp();let s=fileStore({dir:d});sub(s,'wolof','a',900,1,'m1');await s.close();s=fileStore({dir:d});const r=sub(s,'wolof','a',900,1,'m1');assert.equal(r.duplicate,true);assert.equal(s.count('wolof'),1);await s.close()});
test('S7 l’interface est la même pour tous les stockages (migration sans réécrire le moteur)',()=>{
 const m=memoryStore(),f=fileStore({dir:tmp()});['submit','top','best','count','rankOf','flush','close','describe'].forEach(k=>{assert.equal(typeof m[k],'function',k);assert.equal(typeof f[k],'function',k)});f.close()});
test('S8 écritures concurrentes : aucune perte, aucune corruption',async()=>{
 const d=tmp(),s=fileStore({dir:d});await Promise.all(Array.from({length:200},(_,i)=>Promise.resolve().then(()=>sub(s,'v'+(i%5),'u'+i,i,1,'m'+i))));await s.close();
 const r=fileStore({dir:d});assert.equal(['v0','v1','v2','v3','v4'].reduce((a,v)=>a+r.count(v),0),200);await r.close()});
test('S9 le classement public ne contient jamais d’identifiant de compte',()=>{
 const s=memoryStore();s.submit('wolof',{uid:'uid-secret-123',name:'Ama',score:900,timeMs:1,matchId:'m',at:1});assert.equal(JSON.stringify(s.top('wolof')).includes('uid-secret'),false);assert.equal(JSON.stringify(s.best('wolof','uid-secret-123')).includes('uid-secret'),false)});
