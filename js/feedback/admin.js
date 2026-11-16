/* Page avis.html : lecture des avis des visiteurs par un administrateur et export en PDF (impression du navigateur > « Enregistrer au format PDF »).
   La lecture n'est permise par la RLS qu'aux comptes de public.nzassa_admins (supabase/06_avis_visiteurs.sql) ; aucune clé secrète n'est utilisée. */
(function(){
 const $=s=>document.querySelector(s);
 const client=window.supabaseClient;
 const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
 const say=(t,bad)=>{const m=$('#msg');m.textContent=t||'';m.classList.toggle('bad',!!bad)};
 const dateFr=d=>new Date(d).toLocaleString('fr-FR',{dateStyle:'medium',timeStyle:'short'});
 let rows=[];

 function show(part){$('#login').hidden=part!=='login';$('#tools').hidden=part!=='tools';if(part!=='tools'){$('#stats').hidden=true;$('#list').hidden=true}}

 /* Avis compris entre les dates choisies (bornes incluses, heure locale). */
 function filtered(){
  const f=$('#from').value,t=$('#to').value;
  const a=f?new Date(f+'T00:00:00').getTime():-Infinity,b=t?new Date(t+'T23:59:59.999').getTime():Infinity;
  return rows.filter(r=>{const x=new Date(r.created_at).getTime();return x>=a&&x<=b})}

 function render(){
  const list=filtered(),n=list.length;
  const avg=n?list.reduce((s,r)=>s+r.note,0)/n:0;
  const per=[5,4,3,2,1].map(k=>list.filter(r=>r.note===k).length);
  $('#stats').hidden=false;
  $('#stats').innerHTML='<div><b>'+n+'</b><span>avis</span></div><div><b>'+(n?avg.toFixed(1).replace('.',','):'–')+' / 5</b><span>note moyenne</span></div>'+
   '<div><b>'+per.map((c,i)=>(5-i)+'★ '+c).join(' · ')+'</b><span>répartition</span></div>';
  $('#list').hidden=false;
  $('#list').innerHTML=n?list.map(r=>'<article class="avis"><header><span class="note" aria-label="'+r.note+' sur 5">'+'★'.repeat(r.note)+'☆'.repeat(5-r.note)+'</span><span>'+esc(dateFr(r.created_at))+(r.nom?' · '+esc(r.nom):'')+(r.email?' · '+esc(r.email):'')+(r.langue_jeu?' · langue : '+esc(r.langue_jeu):'')+'</span></header>'+
   (r.aime?'<h3>A aimé</h3><p>'+esc(r.aime)+'</p>':'')+(r.ameliorer?'<h3>À améliorer</h3><p>'+esc(r.ameliorer)+'</p>':'')+'</article>').join(''):'<p class="sub" style="margin:0">Aucun avis sur cette période.</p>';
  const f=$('#from').value,t=$('#to').value;
  $('#printInfo').textContent='Export du '+dateFr(Date.now())+' · période : '+(f||t?(f?'du '+new Date(f).toLocaleDateString('fr-FR'):'depuis le début')+(t?' au '+new Date(t).toLocaleDateString('fr-FR'):' à aujourd’hui'):'tous les avis')+' · '+n+' avis';
  $('#pdf').disabled=!n}

 async function load(){
  say('Vérification du compte…');
  const {data:isAdmin,error:e1}=await client.rpc('nzassa_is_admin');
  if(e1){say('Fonction nzassa_is_admin introuvable : exécute supabase/06_avis_visiteurs.sql dans Supabase.',true);show('tools');return}
  if(isAdmin!==true){say('Ce compte n’est pas administrateur. Ajoute-le dans public.nzassa_admins (voir la fin de supabase/06_avis_visiteurs.sql).',true);show('tools');return}
  say('Chargement des avis…');
  const {data,error}=await client.from('avis_visiteurs').select('created_at,note,aime,ameliorer,nom,email,langue_jeu').order('created_at',{ascending:false}).limit(5000);
  if(error){say('Lecture impossible : '+(error.message||'erreur inconnue'),true);show('tools');return}
  rows=data||[];show('tools');say('');render()}

 async function start(){
  if(!client){say('Supabase n’est pas configuré (js/supabase/config.js : '+(window.supabaseStatus||'absent')+').',true);return}
  const {data}=await client.auth.getSession();
  if(data&&data.session)load();else show('login')}

 $('#loginForm').addEventListener('submit',async e=>{
  e.preventDefault();say('Connexion…');
  const {error}=await client.auth.signInWithPassword({email:$('#email').value.trim().toLowerCase(),password:$('#password').value});
  $('#password').value='';
  if(error){say('Connexion refusée : vérifie l’e-mail et le mot de passe.',true);return}
  load()});
 $('#logout').addEventListener('click',async()=>{await client.auth.signOut({scope:'local'});rows=[];say('');show('login')});
 $('#from').addEventListener('change',render);
 $('#to').addEventListener('change',render);
 $('#pdf').addEventListener('click',()=>{const t=document.title;document.title='avis-nzassa-'+new Date().toISOString().slice(0,10);window.print();document.title=t});
 start();
})();
