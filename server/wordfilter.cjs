/* Filtre de modération N'Zassa : harcèlement, insultes, haine/discrimination, menaces, propos sexuels, incitation à se faire du mal,
   échange de coordonnées. Hors ligne, sans service externe. Une liste de mots ne détecte pas tout : les signalements restent nécessaires. */
'use strict';
const LEET={'0':'o','1':'i','3':'e','4':'a','5':'s','7':'t','8':'b','@':'a','$':'s','!':'i','€':'e','+':'t'};
function norm(t){
 let s=String(t==null?'':t).normalize('NFKD').replace(/[̀-ͯ]/g,'').toLowerCase();
 s=s.replace(/[0134578@$!€+]/g,c=>LEET[c]);/* « c0nn@rd » → « connard » */
 s=s.replace(/[^a-z\s'’-]/g,' ').replace(/['’-]/g,' ');
 const w=s.split(/\s+/).filter(Boolean),o=[];let run='';
 for(const x of w){if(x.length===1){run+=x}else{if(run){o.push(run);run=''}o.push(x)}}/* « c o n n a r d » → « conard » */
 if(run)o.push(run);
 return o.join(' ').replace(/(.)\1+/g,'$1')}/* lettres répétées : « conaard » → « conard » */
const K=a=>a.map(norm);
const RULES=[
 {cat:'insulte',msg:'Message refusé : pas d’insultes. Reste poli(e) avec les autres joueurs.',
  words:K(['connard','connasse','conard','salope','salopard','enculer','encule','enfoire','fdp','ntm','pute','putain de','batard','bouffon','debile','abruti','pourriture','trouduc','tg','ftg','ta gueule','ferme la','nique ta mere','nique ta race','niquer','bitch','fuck you','fuck off','asshole','motherfucker','shut up']),
  seq:[]},
 {cat:'haine',msg:'Message refusé : pas de propos racistes, tribalistes ou discriminatoires. Ici, on respecte toutes les cultures.',
  words:K(['negre','negresse','negro','nigger','nigga','bougnoule','bamboula','youpin','sale juif','sale arabe','sale noir','sale blanc','sale negre','pede','pd','tapette','gouine','sale pd','faggot','nazi','heil hitler','sieg heil','racaille','sale race','retourne dans ton pays','rentre chez toi','sales etrangers','sale etranger','sale africain']),
  re:/\b(?:sale|sales|vermine|race de|bande de|espece de|tous les)\s+(?:noirs?|blancs?|arabes?|juifs?|juives?|musulmans?|chretiens?|peuls?|wolofs?|bambaras?|dioulas?|betes?|baoules?|senoufos?|sereres?|mossis?|haoussas?|igbos?|yorubas?|tutsis?|hutus?|africains?|etrangers?|immigres?|gays?|lesbiennes?|trans|handicapes?|femmes?|filles?|pauvres?|villageois|paysans?)\b/},
 {cat:'menace',msg:'Message refusé : les menaces sont interdites. Si quelqu’un t’embête, utilise « Signaler ».',
  words:K(['je vais te tuer','je te tue','je vais te frapper','je vais te retrouver','je te retrouve','je sais ou tu habites','je vais te violer','je vais te casser','je vais te faire du mal','tu vas mourir','tu vas payer','i will kill you','i ll kill you','im gonna kill you','kill you'])},
 {cat:'harcelement',msg:'Message refusé : le harcèlement est interdit. Personne ne doit être embêté(e) ou rabaissé(e) ici.',
  words:K(['suicide toi','suicide toi','va te suicider','va te tuer','va te pendre','va mourir','tue toi','personne ne t aime','personne t aime','tout le monde te deteste','tu sers a rien','t es un rien','kill yourself','kys','go die','tu es moche','t es moche','t es grosse','t es gros','sale gros','sale moche','espece de moche'])},
 {cat:'sexuel',msg:'Message refusé : les propos sexuels ne sont pas autorisés.',
  words:K(['suce','sucer','bite','couilles','sexe','nude','nudes','porno','viol','violer','chatte'])},
 {cat:'coordonnees',msg:'Message refusé : ne partage pas de coordonnées (réseaux, téléphone, adresse) et ne demande pas d’informations personnelles.',
  words:K(['snap','snapchat','whatsapp','telegram','instagram','insta','tiktok','facebook','discord','ton numero','ton adresse','ou tu habites','quel age as tu','envoie une photo','envoie moi une photo','envoie des photos','ta photo','mon numero','mon adresse'])}];
const LONG=[];/* termes longs et sans ambiguïté : détectés même collés à d'autres lettres */
RULES.forEach(r=>(r.words||[]).forEach(w=>{if(w.length>=7&&!w.includes(' ')&&['insulte','haine'].includes(r.cat))LONG.push([w,r])}));
function screen(text){
 const n=norm(text);if(!n)return null;const padded=' '+n+' ';
 for(const r of RULES){
  for(const w of r.words||[])if(padded.includes(' '+w+' '))return {cat:r.cat,msg:r.msg,hit:w};
  if(r.re&&r.re.test(n))return {cat:r.cat,msg:r.msg,hit:'regle'}}
 const sq=n.replace(/\s+/g,'');
 for(const [w,r] of LONG)if(sq.includes(w.replace(/\s+/g,'')))return {cat:r.cat,msg:r.msg,hit:w};
 return null}
module.exports={screen,norm,RULES};
