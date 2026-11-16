'use strict';
const test=require('node:test'),assert=require('node:assert');
const FB=require('../js/feedback/feedback.js');
const fake=(result)=>{const calls=[];return {calls,from:t=>({insert:async row=>{calls.push({t,row});if(result instanceof Error)throw result;return result}})}};
test('A1 : note obligatoire entre 1 et 5',()=>{
 assert.equal(FB.check({aime:'super'}).error,'note');
 assert.equal(FB.check({note:6,aime:'super'}).error,'note');
 assert.equal(FB.check({note:2.5,aime:'super'}).error,'note');
 assert.ok(FB.check({note:5,aime:'super'}).row);
});
test('A2 : au moins un des deux textes, e-mail facultatif mais valide',()=>{
 assert.equal(FB.check({note:4,aime:'   '}).error,'texte');
 assert.equal(FB.check({note:4,ameliorer:'x',email:'pas-une-adresse'}).error,'email');
 const r=FB.check({note:4,ameliorer:'  les quiz  ',email:'a@b.co'}).row;
 assert.deepEqual(r,{note:4,aime:null,ameliorer:'les quiz',nom:null,email:'a@b.co',langue_jeu:null});
});
test('A3 : texte trop long refusé, jamais tronqué',()=>{
 const r=FB.check({note:3,aime:'a'.repeat(1001)});assert.equal(r.error,'long');assert.equal(r.field,'aime');
});
test('A4 : envoi dans avis_visiteurs, erreurs traduites en codes',async()=>{
 const ok=fake({error:null});assert.deepEqual(await FB.send(ok,{note:5,aime:'bravo'}),{ok:true});
 assert.equal(ok.calls[0].t,'avis_visiteurs');assert.equal(ok.calls[0].row.aime,'bravo');
 assert.equal((await FB.send(null,{note:5,aime:'bravo'})).error,'not_configured');
 assert.equal((await FB.send(fake({error:{code:'PGRST205',message:'not found'}}),{note:5,aime:'b'})).error,'not_configured');
 assert.equal((await FB.send(fake({error:{code:'42501',message:'rls'}}),{note:5,aime:'b'})).error,'refused');
 assert.equal((await FB.send(fake(new Error('x')),{note:5,aime:'b'})).error,'offline');
 const none=fake({error:null});assert.equal((await FB.send(none,{note:0})).error,'note');assert.equal(none.calls.length,0);
});
