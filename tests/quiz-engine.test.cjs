'use strict';
/* Tests UNITAIRES du moteur de quiz (server/quiz.cjs) : horloge simulée, monde simulé, SANS réseau.
   Les tests avec un vrai serveur et de vrais WebSocket sont dans tests/quiz-ws.test.cjs. */
const test=require('node:test'),assert=require('node:assert/strict');
const {createQuiz}=require('../server/quiz.cjs'),{createBank}=require('../server/quizbank.cjs'),{memoryStore}=require('../server/quizstore.cjs'),S=require('../js/quiz/scoring.js'),{mulberry32}=require('../js/games/core.js');
const bank=createBank();
const T=S.TEACHER;
function mk(over,seed){
 let t=1e6;const sessions=new Map(),sent=new Map(),store=memoryStore(),tops=[],cfg=S.config(Object.assign({revealMs:100,countdownMs:500},over||{}));
 const pend=[];const rtt=new Map();
 const world={sessions,room:id=>({players:new Map([...sessions.values()].filter(s=>s.room===id).map(s=>[s.sid,s]))})};
 const eng=createQuiz({world,bank,store,config:cfg,now:()=>t,rng:mulberry32(seed||7),
  send:(sid,m)=>{(sent.get(sid)||sent.set(sid,[]).get(sid)).push(m);if(m.t==='qzp')pend.push({sid,n:m.n,at:t+(rtt.has(sid)?rtt.get(sid):40)})},
  broadcastRoom:()=>{},onTop:(v,top)=>tops.push([v,top])});
 const h={eng,store,cfg,tops,sent,sessions,rtt,
  add(sid,o){const s=Object.assign({sid,pub:'p-'+sid,name:sid,room:'wolof',kind:'guest_online',uid:null,x:T.x,z:T.z},o||{});sessions.set(sid,s);return s},
  get now(){return t},
  adv(ms){const step=25;for(let k=0;k<ms/step;k++){t+=step;for(let i=pend.length-1;i>=0;i--)if(pend[i].at<=t){const p=pend.splice(i,1)[0];if(sessions.has(p.sid))eng.onRtt(p.sid,p.n)}eng.tick()}},
  msgs(sid,ev){return (sent.get(sid)||[]).filter(m=>m.t==='qz'&&(!ev||m.ev===ev))},
  last(sid,ev){const a=h.msgs(sid,ev);return a[a.length-1]},
  match(){return [...eng._matches.values()][0]},
  /* démarre un quiz solo et avance jusqu'à la première question */
  solo(sid,cat){eng.handle(sid,{op:'start',cat});h.adv(cfg.countdownMs+100)},
  right(sid){const m=eng._matches.get(h.last(sid,'start').m);return m.questions[m.qi].answer},
  wrong(sid){const m=eng._matches.get(h.last(sid,'start').m);return ['a','b','c','d'].find(x=>x!==m.questions[m.qi].answer)},
  ans(sid,c,after){if(after)h.adv(after);const st=h.last(sid,'start')||h.last(sid,'resume');const m=eng._matches.get(st.m);eng.handle(sid,{op:'ans',m:m.id,i:m.qi,c})},
  lastRes(sid){return h.last(sid,'r')}};
 return h}

test('Q1 barème : bonne réponse = base + bonus de vitesse décroissant ; fausse ou absente = 0',()=>{
 const h=mk({});h.add('a');h.solo('a');
 h.ans('a',h.right('a'),0);const r1=h.lastRes('a');assert.equal(r1.you.ok,true);assert.ok(r1.you.pts>=140&&r1.you.pts<=150,'quasi instantané : '+r1.you.pts);
 h.adv(300);/* question 2 : réponse à 4 s ≈ +25 de bonus */h.ans('a',h.right('a'),4000);const r2=h.lastRes('a');assert.ok(r2.you.pts>=124&&r2.you.pts<=126,'≈125 : '+r2.you.pts);
 h.adv(300);h.ans('a',h.right('a'),9000);assert.equal(h.lastRes('a').you.pts,100,'au-delà de la fenêtre de bonus : points de base seulement');
 h.adv(300);h.ans('a',h.wrong('a'),500);assert.equal(h.lastRes('a').you.pts,0,'mauvaise réponse : 0');
 h.adv(300);h.adv(h.cfg.timeMs+h.cfg.rttCapMs+h.cfg.graceMs+200);const r5=h.lastRes('a');assert.equal(r5.you.pts,0);assert.equal(r5.you.none,true,'pas de réponse avant la fin du temps : 0 point');assert.equal(r5.you.ms,h.cfg.timeMs)});
test('Q2 barème configurable : valeurs personnalisées appliquées, valeurs hors bornes refusées',()=>{
 const h=mk({base:10,bonusMax:90,bonusWindowMs:1000});h.add('a');h.solo('a');h.ans('a',h.right('a'),0);assert.ok(h.lastRes('a').you.pts>=85&&h.lastRes('a').you.pts<=100);
 assert.throws(()=>S.config({base:-1}),/base/);assert.throws(()=>S.config({inconnu:1}),/inconnu/);assert.throws(()=>S.config({timeMs:'x'}),/timeMs/);
 assert.equal(S.config({}).base,100)});
test('Q3 le client ne fournit jamais le temps ni le score : champs supplémentaires ignorés',()=>{
 const h=mk({});h.add('a');h.solo('a');const m=h.match();
 h.eng.handle('a',{op:'ans',m:m.id,i:m.qi,c:h.right('a'),ms:1,rtt:0,score:9999,points:9999,t:0,at:0});
 const r=h.lastRes('a');assert.ok(r.you.ms>=0&&r.you.pts<=150&&r.you.pts>0&&r.you.ms!==1||r.you.pts<=150,'points calculés par le serveur');
 assert.ok(h.match().players[0].score<=150)});
test('Q4 compensation de latence : médiane des RTT mesurés par le serveur, plafonnée à 300 ms, nulle sans mesures fiables',()=>{
 const c=S.config({});assert.equal(S.compensation(c,[200,200]),0,'moins de 3 mesures');assert.equal(S.compensation(c,[100,200,900]),200,'médiane');assert.equal(S.compensation(c,[900,900,900]),300,'plafond');
 assert.equal(S.compensation(c,[100,NaN,-5,200,300,150]),Math.round(S.median([100,200,300,150])>300?300:S.median([100,200,300,150])),'valeurs invalides ignorées');
 /* bout en bout : RTT réel de 200 ms mesuré par sondes serveur → la réponse à 4200 ms brutes compte 4000 ms utiles */
 const h=mk({});h.add('a');h.rtt.set('a',200);h.solo('a');h.ans('a',h.right('a'),4000);
 const r=h.lastRes('a');assert.ok(h.match().players[0].rtt.length>=3,'sondes serveur reçues');assert.ok(r.you.ms>=3700&&r.you.ms<=4000,'temps utile = brut − compensation : '+r.you.ms)});
test('Q5 une réponse tardive (au-delà du temps, même compensée) vaut 0',()=>{
 const c=S.config({});assert.equal(S.judge(c,{correct:true,rawMs:15400,compMs:300}).points,0);assert.equal(S.judge(c,{correct:true,rawMs:15300,compMs:300}).points,100)});
test('Q6 doublon / hors question / choix invalide / mauvais match : refusés sans effet',()=>{
 const h=mk({});h.add('a');h.solo('a');const m=h.match(),q=m.qi;
 h.eng.handle('a',{op:'ans',m:m.id,i:q,c:'z'});assert.equal(h.last('a','err').code,'bad_choice');
 h.eng.handle('a',{op:'ans',m:'faux',i:q,c:'a'});assert.equal(h.last('a','err').code,'no_match');
 h.eng.handle('a',{op:'ans',m:m.id,i:q+1,c:'a'});assert.equal(h.last('a','err').code,'stale');
 h.ans('a',h.right('a'),100);const s1=m.players[0].score;
 h.eng.handle('a',{op:'ans',m:m.id,i:q,c:h.right('a')||'a'});assert.ok(['duplicate','stale'].includes(h.last('a','err').code));assert.equal(m.players[0].score,s1,'score inchangé');
 h.eng.handle('a',null);assert.equal(h.last('a','err').code,'bad_message');h.eng.handle('a',{op:'xx'});assert.equal(h.last('a','err').code,'bad_op')});
test('Q7 duel : les deux joueurs reçoivent exactement les mêmes questions, sans bonne réponse ni explication avant la fin',()=>{
 const h=mk({});h.add('a');h.add('b');h.eng.handle('a',{op:'challenge',to:'p-b'});const iv=h.last('b','inv');assert.ok(iv);
 h.eng.handle('b',{op:'accept',inv:iv.inv});h.adv(700);
 const m=h.match();for(let i=0;i<m.questions.length;i++){
  const qa=h.msgs('a','q').pop(),qb=h.msgs('b','q').pop();assert.deepEqual(qa.q,qb.q,'question '+i+' identique pour les deux');
  assert.equal(Object.keys(qa.q).sort().join(),'cat,catName,i,id,options,prompt,text','aucune clé « answer » ni « explanation » dans la question envoyée');
  h.ans('a',h.right('a'),200);h.ans('b',h.wrong('b'),100);h.adv(200)}
 const ids=h.msgs('a','q').map(x=>x.q.id).join(),idb=h.msgs('b','q').map(x=>x.q.id).join();assert.equal(ids,idb);assert.equal(h.msgs('a','q').length,m.questions.length);
 assert.equal(h.last('a','end').outcome,'win');assert.equal(h.last('b','end').outcome,'loss')});
test('Q8 départage : score, puis temps total ; égalité parfaite = nul',()=>{
 assert.equal(S.duel({score:500,timeMs:9},{score:400,timeMs:1}),'a');assert.equal(S.duel({score:400,timeMs:5},{score:400,timeMs:9}),'a');assert.equal(S.duel({score:400,timeMs:9},{score:400,timeMs:5}),'b');assert.equal(S.duel({score:400,timeMs:5},{score:400,timeMs:5}),'draw');
 assert.ok(S.compare({score:5,timeMs:9,at:1},{score:5,timeMs:9,at:2})<0,'à égalité, le plus ancien');
 /* bout en bout : mêmes réponses exactement au même moment → égalité */
 const h=mk({questions:3});h.add('a');h.add('b');h.eng.handle('a',{op:'challenge',to:'p-b'});h.eng.handle('b',{op:'accept',inv:h.last('b','inv').inv});h.adv(700);
 for(let i=0;i<3;i++){h.ans('a',h.right('a'),0);h.ans('b',h.right('b'),0);h.adv(300)}
 assert.equal(h.last('a','end').outcome,'draw');assert.equal(h.last('b','end').outcome,'draw')});
test('Q9 classement : seul « authenticated » entre au classement ; un invité en ligne joue mais n’est jamais classé',()=>{
 const h=mk({});h.add('g',{kind:'guest_online'});h.add('u1',{kind:'authenticated',uid:'uid-1',name:'Ama'});
 const play=(sid)=>{h.solo(sid);const m=h.match();for(let i=0;i<m.questions.length;i++){h.ans(sid,h.right(sid),50);h.adv(300)}};
 play('g');assert.equal(h.last('g','end').rank.ranked,false);assert.equal(h.last('g','end').rank.reason,'invité');assert.deepEqual(h.store.top('wolof',10),[]);
 play('u1');const e=h.last('u1','end');assert.equal(e.rank.ranked,true);assert.equal(e.rank.rank,1);const top=h.store.top('wolof',10);assert.equal(top.length,1);assert.equal(top[0].name,'Ama');assert.ok(top[0].score>1000);
 assert.equal(JSON.stringify(top).includes('uid-1'),false,'aucun identifiant de compte dans le classement public');
 assert.equal(h.tops.length,1,'le mur est notifié après un match validé')});
test('Q10 un seul résultat par joueur : un moins bon match ne remplace pas ; un meilleur remplace',()=>{
 const h=mk({});h.add('u',{kind:'authenticated',uid:'u-1',name:'Ama'});
 const play=(good)=>{h.solo('u');const m=h.match();for(let i=0;i<m.questions.length;i++){h.ans('u',good?h.right('u'):h.wrong('u'),good?50:20);h.adv(300)}return h.last('u','end')};
 const e1=play(true),s1=h.store.top('wolof')[0].score;assert.equal(e1.rank.improved,true);
 const e2=play(false);assert.equal(e2.rank.improved,false);assert.equal(h.store.top('wolof')[0].score,s1,'ancien meilleur résultat conservé');assert.equal(h.store.top('wolof').length,1,'une seule entrée par joueur');
 const e3=play(true);assert.equal(h.store.top('wolof').length,1);assert.ok(e3.rank.rank===1)});
test('Q11 catégorie imposée (entraînement) : non classé ; mélange : classé',()=>{
 const h=mk({});h.add('u',{kind:'authenticated',uid:'u-1'});h.solo('u','geographie');const m=h.match();assert.ok(m.questions.every(q=>q.cat==='geographie'));
 for(let i=0;i<m.questions.length;i++){h.ans('u',h.right('u'),50);h.adv(300)}
 assert.equal(h.last('u','end').rank.ranked,false);assert.equal(h.last('u','end').rank.reason,'catégorie');assert.deepEqual(h.store.top('wolof'),[])});
test('Q12 Top 10 par village : isolé, trié, limité à 10',()=>{
 const st=memoryStore();
 for(let i=0;i<14;i++)st.submit('wolof',{uid:'u'+i,name:'J'+i,score:500+i*10,timeMs:20000,matchId:'m'+i});
 st.submit('bambara',{uid:'x',name:'Autre',score:1,timeMs:1,matchId:'mb'});
 const top=st.top('wolof',10);assert.equal(top.length,10);assert.equal(top[0].name,'J13');assert.equal(top[9].name,'J4');assert.deepEqual(top.map(x=>x.rank),[1,2,3,4,5,6,7,8,9,10]);
 assert.equal(st.top('bambara',10).length,1);assert.equal(st.top('bambara',10)[0].name,'Autre');assert.deepEqual(st.top('inconnu',10),[]);
 /* égalité de score : temps le plus court devant ; mêmes score et temps : le plus ancien devant */
 st.submit('swa',{uid:'a',name:'A',score:900,timeMs:30000,matchId:'1',at:5});st.submit('swa',{uid:'b',name:'B',score:900,timeMs:25000,matchId:'2',at:9});st.submit('swa',{uid:'c',name:'C',score:900,timeMs:25000,matchId:'3',at:8});
 assert.deepEqual(st.top('swa').map(x=>x.name),['C','B','A'])});
test('Q13 résultat envoyé deux fois : jamais de doublon',()=>{
 const st=memoryStore();const a=st.submit('wolof',{uid:'u',name:'A',score:900,timeMs:1,matchId:'m1'}),b=st.submit('wolof',{uid:'u',name:'A',score:900,timeMs:1,matchId:'m1'});
 assert.equal(a.duplicate,false);assert.equal(b.duplicate,true);assert.equal(st.count('wolof'),1);
 assert.throws(()=>st.submit('wolof',{uid:'u',name:'A',score:-1,timeMs:1,matchId:'m2'}));assert.throws(()=>st.submit('wolof',{uid:'',name:'A',score:1,timeMs:1,matchId:'m3'}))});
test('Q14 permissions : trop loin de l’enseignant, village inconnu, quiz déjà en cours',()=>{
 const h=mk({});h.add('a',{x:T.x+50});h.eng.handle('a',{op:'start'});assert.equal(h.last('a','err').code,'too_far');
 h.add('b',{room:'salon-prive'});h.eng.handle('b',{op:'start'});assert.equal(h.last('b','err').code,'no_village');
 h.add('c');h.solo('c');h.eng.handle('c',{op:'start'});assert.equal(h.last('c','err').code,'busy');
 h.add('d');h.eng.handle('d',{op:'start',cat:'inexistante'});assert.equal(h.last('d','err').code,'bad_cat')});
test('Q15 invitations : refus, expiration, soi-même, inconnu, occupé, hors village',()=>{
 const h=mk({});h.add('a');h.add('b');h.add('c',{room:'bambara'});
 h.eng.handle('a',{op:'challenge',to:'p-a'});assert.equal(h.last('a','err').code,'self');h.adv(2100);
 h.eng.handle('a',{op:'challenge',to:'p-zzz'});assert.equal(h.last('a','err').code,'not_found');h.adv(2100);
 h.eng.handle('a',{op:'challenge',to:'p-c'});assert.equal(h.last('a','err').code,'not_found','un joueur d’un autre village n’est pas joignable');h.adv(2100);
 h.eng.handle('a',{op:'challenge',to:'p-b'});const iv=h.last('b','inv');assert.ok(iv);
 h.eng.handle('a',{op:'challenge',to:'p-b'});assert.ok(['slow_down','pending'].includes(h.last('a','err').code));
 h.eng.handle('b',{op:'decline',inv:iv.inv});assert.equal(h.last('a','invDeclined').why,'declined');
 h.adv(2100);h.eng.handle('a',{op:'challenge',to:'p-b'});const iv2=h.last('b','inv');h.adv(h.cfg.inviteTtlMs+500);assert.ok(h.last('a','invExpired')&&h.last('b','invExpired'));
 h.eng.handle('b',{op:'accept',inv:iv2.inv});assert.equal(h.last('b','err').code,'no_invite','accepter une invitation expirée est refusé');
 /* un tiers ne peut pas accepter l'invitation d'un autre */
 h.add('d');h.adv(2100);h.eng.handle('a',{op:'challenge',to:'p-b'});const iv3=h.last('b','inv');h.eng.handle('d',{op:'accept',inv:iv3.inv});assert.equal(h.last('d','err').code,'no_invite')});
test('Q16 invité en ligne : peut défier et être défié (duel amical non classé)',()=>{
 const h=mk({questions:10});h.add('g1');h.add('g2');h.eng.handle('g1',{op:'challenge',to:'p-g2'});h.eng.handle('g2',{op:'accept',inv:h.last('g2','inv').inv});h.adv(700);
 const m=h.match();for(let i=0;i<10;i++){h.ans('g1',h.right('g1'),100);h.ans('g2',h.right('g2'),500);h.adv(300)}
 assert.equal(h.last('g1','end').outcome,'win');assert.equal(h.last('g1','end').rank.ranked,false);assert.deepEqual(h.store.top('wolof'),[])});
test('Q17 déconnexion en duel : grâce, reprise avec le jeton, forfait au-delà ; jamais d’usurpation',()=>{
 const h=mk({});h.add('a',{kind:'authenticated',uid:'A'});h.add('b',{kind:'authenticated',uid:'B'});
 h.eng.handle('a',{op:'challenge',to:'p-b'});h.eng.handle('b',{op:'accept',inv:h.last('b','inv').inv});h.adv(700);
 const st=h.last('b','start'),tok=st.resume,mid=st.m;
 h.eng.onLeave('b');h.sessions.delete('b');assert.ok(h.last('a','oppDown'));
 h.ans('a',h.right('a'),100);/* a répond, b est absent : la question se ferme sans l'attendre */assert.ok(h.lastRes('a'));
 /* b revient avec un NOUVEL identifiant de session */h.add('b2',{kind:'authenticated',uid:'B',pub:'p-b2'});h.eng.handle('b2',{op:'resume',m:mid,token:tok});assert.ok(h.last('b2','resume'),'reprise acceptée');assert.ok(h.last('a','oppBack'));
 /* usurpation : un autre compte avec le jeton volé est refusé ; un faux jeton aussi */
 h.add('x',{kind:'authenticated',uid:'X'});h.eng.handle('x',{op:'resume',m:mid,token:tok});assert.equal(h.last('x','err').code,'bad_identity');h.eng.handle('x',{op:'resume',m:mid,token:'faux'});assert.equal(h.last('x','err').code,'no_match');
 /* b2 se déconnecte définitivement : forfait après la grâce */
 h.eng.onLeave('b2');h.sessions.delete('b2');h.adv(h.cfg.disconnectGraceMs+500);assert.ok(h.last('a','oppLeft'));
 const m=h.match();while(m.state==='running'){h.ans('a',h.right('a'),50);h.adv(400)}
 const e=h.last('a','end');assert.equal(e.outcome,'win');assert.equal(e.reason,'forfait');assert.equal(e.rank.ranked,true,'l’adversaire qui a terminé reste classé');
 assert.equal(h.store.top('wolof').length,1,'le joueur qui a abandonné n’est pas classé')});
test('Q18 abandon volontaire et déconnexion en solo : match annulé, jamais classé',()=>{
 const h=mk({});h.add('u',{kind:'authenticated',uid:'U'});h.solo('u');h.eng.handle('u',{op:'abandon'});assert.ok(h.last('u','left'));assert.equal(h.match().state,'done');assert.deepEqual(h.store.top('wolof'),[]);
 h.add('v',{kind:'authenticated',uid:'V'});h.solo('v');h.eng.onLeave('v');h.adv(h.cfg.disconnectGraceMs+500);assert.equal([...h.eng._matches.values()].pop().abandoned!==undefined,true);assert.deepEqual(h.store.top('wolof'),[])});
test('Q19 reprise d’un solo avant la fin de la grâce : état rendu, reprise de la question en cours',()=>{
 const h=mk({});h.add('u',{kind:'authenticated',uid:'U'});h.solo('u');const st=h.last('u','start');h.eng.onLeave('u');h.sessions.delete('u');h.adv(2000);
 h.add('u2',{kind:'authenticated',uid:'U',pub:'p-u2'});h.eng.handle('u2',{op:'resume',m:st.m,token:st.resume});const r=h.last('u2','resume');assert.equal(r.phase,'ask');assert.ok(r.q&&r.q.remainMs<h.cfg.timeMs&&r.q.remainMs>0);assert.equal('answer' in r.q,false)});
test('Q20 un match n’est finalisé qu’une fois (idempotence)',()=>{
 const h=mk({});h.add('u',{kind:'authenticated',uid:'U'});h.solo('u');const m=h.match();for(let i=0;i<m.questions.length;i++){h.ans('u',h.right('u'),50);h.adv(300)}
 const n=h.store.count('wolof'),ends=h.msgs('u','end').length;h.adv(5000);h.eng.tick();assert.equal(h.store.count('wolof'),n);assert.equal(h.msgs('u','end').length,ends,'un seul message de fin')});
test('Q21 banque : même village, même graine → mêmes questions ; catégories ; pas de bonne réponse côté client',()=>{
 const a=bank.pick({village:'wolof',count:10,rng:mulberry32(3)}),b=bank.pick({village:'wolof',count:10,rng:mulberry32(3)});assert.deepEqual(a,b);
 assert.equal(new Set(a.map(q=>q.id)).size,10,'pas de doublon');assert.ok(new Set(a.map(q=>q.cat)).size>=5,'mélange de catégories');
 assert.deepEqual([...bank.categoryIds()].sort(),['general','geographie','histoire','langues','patrimoine','traditions']);
 assert.ok(!('answer' in bank.forClient(a[0],0)));assert.throws(()=>bank.pick({village:'nimporte',count:3,rng:mulberry32(1)}),/village inconnu/);
 bank.villages().forEach(v=>{const q=bank.pick({village:v,count:10,rng:mulberry32(9)});assert.equal(q.length,10,v)})});
