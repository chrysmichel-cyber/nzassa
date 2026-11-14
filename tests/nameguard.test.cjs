'use strict';
const test=require('node:test'),assert=require('node:assert');
const {createNameGuard,norm}=require('../server/nameguard.cjs');
const {clientIp}=require('../server/netutil.cjs');
const URL='https://abcdefgh.supabase.co';
const resp=(status,json)=>({ok:status>=200&&status<300,status,json:async()=>json});
const mk=(fx,o)=>createNameGuard(Object.assign({url:URL,key:'sb_publishable_x',fetch:fx},o||{}));

test('N1 invité : appel anonyme (clé publique seule) ; true = nom pris par un compte',async()=>{
 let seen;const g=mk(async(u,o)=>{seen={u,o};return resp(200,true)});
 assert.equal(await g.check('  Kofi_B ',null),true);
 assert.equal(seen.u,URL+'/rest/v1/rpc/nzassa_name_taken_by_other');assert.equal(seen.o.headers.authorization,undefined);assert.equal(seen.o.headers.apikey,'sb_publishable_x');
 assert.deepEqual(JSON.parse(seen.o.body),{p_name:'Kofi_B'})});
test('N2 compte : le jeton du joueur est transmis pour que Supabase sache qui demande ; false = nom libre ou le sien',async()=>{
 let seen;const g=mk(async(u,o)=>{seen=o;return resp(200,false)});assert.equal(await g.check('Kofi_B','h.p.s'),false);assert.equal(seen.headers.authorization,'Bearer h.p.s')});
test('N3 cache par (nom insensible à la casse, jeton) ; invité et compte ne partagent pas leurs réponses',async()=>{
 let n=0,t=1e6;const g=mk(async(u,o)=>{n++;return resp(200,!o.headers.authorization)},{now:()=>t});
 assert.equal(await g.check('Kofi',null),true);assert.equal(await g.check('KOFI',null),true);assert.equal(n,1);
 assert.equal(await g.check('Kofi','h.p.s'),false);assert.equal(n,2);t+=61000;await g.check('Kofi',null);assert.equal(n,3)});
test('N4 inconnu (fonction SQL absente, panne, réponse bizarre) : null, jamais « libre » inventé',async()=>{
 assert.equal(await mk(async()=>resp(404,{})).check('Kofi',null),null);
 assert.equal(await mk(async()=>{throw new Error('x')}).check('Kofi',null),null);
 assert.equal(await mk(async()=>resp(200,{a:1})).check('Kofi',null),null);
 const g=mk(async()=>resp(404,{}));await g.check('Kofi',null);assert.equal(g.stats.unknown,1);assert.ok(g.stats.lastError)});
test('N5 URL non Supabase refusée ; normalisation des espaces',()=>{
 assert.equal(createNameGuard({url:'https://evil.example',key:'k'}),null);assert.equal(norm('  a   b '),'a b')});

const {trustList,parseIp}=require('../server/netutil.cjs');
const req=(remote,xff)=>({socket:{remoteAddress:remote},headers:xff===undefined?{}:{'x-forwarded-for':xff}});
const ip=(remote,xff,o)=>clientIp(req(remote,xff),o);
test('P1 aucun proxy approuvé : X-Forwarded-For ignoré (falsifiable par le client)',()=>{
 assert.equal(ip('10.0.0.1','6.6.6.6',{}),'10.0.0.1');assert.equal(ip('10.0.0.1','6.6.6.6',{trustedProxies:[]}),'10.0.0.1');assert.equal(ip('10.0.0.1','6.6.6.6',{trustedProxies:''}),'10.0.0.1')});
test('P2 connexion venant d’une adresse NON approuvée : l’en-tête est ignoré même si une liste existe',()=>{
 assert.equal(ip('203.0.113.9','6.6.6.6',{trustedProxies:['10.0.0.0/8']}),'203.0.113.9');
 assert.equal(ip('11.0.0.1','6.6.6.6',{trustedProxies:'10.0.0.0/8'}),'11.0.0.1')});
test('P3 proxy approuvé : seule l’entrée de DROITE (ajoutée par lui) est crue ; la gauche (écrite par le client) est ignorée',()=>{
 const o={trustedProxies:['10.0.0.0/8']};
 assert.equal(ip('10.1.2.3','1.1.1.1, 2.2.2.2',o),'2.2.2.2');assert.equal(ip('10.1.2.3','9.9.9.9',o),'9.9.9.9');
 assert.equal(ip('10.1.2.3','fake, 3.3.3.3, 172.16.0.5',{trustedProxies:'private',hops:2}),'3.3.3.3')});
test('P4 cas limites : en-tête absent, trop court, invalide, hops absurde',()=>{
 const o={trustedProxies:'private'};
 assert.equal(ip('10.0.0.1',undefined,o),'10.0.0.1');assert.equal(ip('10.0.0.1','1.1.1.1',{...o,hops:2}),'10.0.0.1');
 assert.equal(ip('10.0.0.1','<script>',o),'10.0.0.1');assert.equal(ip('10.0.0.1','1.1.1.1, 2.2.2.2',{...o,hops:'abc'}),'2.2.2.2');
 assert.equal(ip('10.0.0.1','1.1.1.1, 2.2.2.2',{...o,hops:-5}),'2.2.2.2');assert.equal(clientIp({socket:{},headers:{}},{}),'?')});
test('P5 plages : CIDR IPv4/IPv6, mots-clés, IPv4 mappée en IPv6, entrées invalides ignorées',()=>{
 const f=trustList('loopback, 10.0.0.0/8, 192.0.2.7, 2001:db8::/32, n’importe quoi, 999.1.1.1/8');
 assert.ok(f('127.0.0.1')&&f('::1')&&f('::ffff:127.0.0.1')&&f('10.255.0.1')&&f('192.0.2.7')&&f('2001:db8::1'));
 assert.ok(!f('11.0.0.1')&&!f('192.0.2.8')&&!f('2001:db9::1')&&!f('8.8.8.8')&&!f('')&&!f('pas une ip'));
 assert.ok(trustList('private')('172.20.1.1')&&!trustList('private')('172.32.0.1')&&trustList('private')('fd00::1'));
 assert.equal(parseIp('::ffff:1.2.3.4').v,4);assert.equal(trustList('')('10.0.0.1'),false)});
