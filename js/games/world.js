/* Tables physiques de la « place des jeux » dans le village, pour les deux rendus (3D three.js et 2D peint).
   Positions : LCA.games.TABLES (mêmes coordonnées que le serveur, qui vérifie la distance). Interaction : bouton #act de main.js (spots gtable).
   État en ligne (libre / en attente / en cours) : setStatus(liste du serveur) → voyant coloré au-dessus de chaque table en 3D. */
(function(root){
 const LCA=root.LCA=root.LCA||{};
 const T=()=>LCA.games.TABLES;
 const COL={free:0x5fd493,wait:0xf5aa50,play:0xff7a6b};
 let lamps=new Map(),status=new Map();
 /* points d'interaction (même forme que SPOTS de main.js) */
 function spots(){return T().map(t=>({id:'gt_'+t.id,tableId:t.id,gtable:true,name:t.name,role:'Jeux de société',pos:[t.x,t.z],r:t.r,p:{x:t.x,z:t.z}}))}
 /* ---------- 3D ---------- */
 function build3d(THREE,scene,addColl){
  const M=c=>new THREE.MeshLambertMaterial({color:c}),wood=M(0x7a4a26),dark=M(0x4a2418),cloth=M(0x1f5a46);
  const g0=new THREE.Group();g0.name='gamesPlaza';
  /* sol de la place : terre battue claire, natte tressée au centre, bordure de pierres */
  const ground=new THREE.Mesh(new THREE.CircleGeometry(1,40),M(0xd2a06a));ground.scale.set(15,8.2,1);ground.rotation.x=-Math.PI/2;ground.position.set(21,.015,37);ground.receiveShadow=true;g0.add(ground);
  const mat=new THREE.Mesh(new THREE.PlaneGeometry(24,11),M(0xc98d52));mat.rotation.x=-Math.PI/2;mat.position.set(21,.025,37);mat.receiveShadow=true;g0.add(mat);
  for(let i=0;i<11;i++){const st=new THREE.Mesh(new THREE.PlaneGeometry(24,.18),M(i%2?0xb07440:0xcf9a5e));st.rotation.x=-Math.PI/2;st.position.set(21,.03,32+i*1);g0.add(st)}
  const stone=new THREE.DodecahedronGeometry(.32,0),stoneM=M(0x8a7f70);
  for(let i=0;i<46;i++){const a=i/46*Math.PI*2,b=new THREE.Mesh(stone,stoneM);b.position.set(21+Math.cos(a)*15,.12,37+Math.sin(a)*8.2);b.rotation.set(i,i*2,0);b.scale.setScalar(.8+((i*37)%10)/25);g0.add(b)}
  /* deux paillotes (toit de chaume sur poteau) qui ombragent les tables */
  const thatch=M(0xb8893f),pole=M(0x5a3418);
  for(const px of [15,27]){const pg=new THREE.Group();pg.position.set(px,0,37);
   const po=new THREE.Mesh(new THREE.CylinderGeometry(.13,.17,3.4,8),pole);po.position.y=1.7;po.castShadow=true;pg.add(po);
   const roof=new THREE.Mesh(new THREE.ConeGeometry(3.4,1.5,14,1,true),thatch);roof.position.y=3.85;roof.castShadow=true;pg.add(roof);
   const fr=new THREE.Mesh(new THREE.CylinderGeometry(3.42,3.42,.28,14,1,true),M(0x9a6c2c));fr.position.y=3.05;pg.add(fr);
   const top=new THREE.Mesh(new THREE.SphereGeometry(.22,8,6),pole);top.position.y=4.6;pg.add(top);
   g0.add(pg);if(addColl)addColl(px,37,.35)}
  /* lanternes aux quatre coins (lumière chaude, sans coût d'éclairage) */
  const glow=new THREE.MeshBasicMaterial({color:0xffc56b});
  for(const [lx,lz] of [[7.5,32],[34.5,32],[7.5,42],[34.5,42]]){const lg=new THREE.Group();lg.position.set(lx,0,lz);
   const lp=new THREE.Mesh(new THREE.CylinderGeometry(.06,.08,2.3,6),pole);lp.position.y=1.15;lg.add(lp);
   const cage=new THREE.Mesh(new THREE.CylinderGeometry(.2,.16,.38,6),M(0x3a2414));cage.position.y=2.4;lg.add(cage);
   const fl=new THREE.Mesh(new THREE.SphereGeometry(.13,8,6),glow);fl.position.y=2.4;lg.add(fl);
   g0.add(lg);if(addColl)addColl(lx,lz,.25)}
  /* panneau d'entrée */
  {const sg=new THREE.Group();sg.position.set(21,0,30.6);const a=new THREE.Mesh(new THREE.BoxGeometry(.12,1.6,.12),pole);a.position.set(-1.1,.8,0);sg.add(a);const b=a.clone();b.position.x=1.1;sg.add(b);
   const c=document.createElement('canvas');c.width=256;c.height=64;const x=c.getContext('2d');x.fillStyle='#6b3a1f';x.fillRect(0,0,256,64);x.strokeStyle='#e8c27a';x.lineWidth=4;x.strokeRect(4,4,248,56);x.fillStyle='#fbe9c6';x.font='bold 30px sans-serif';x.textAlign='center';x.textBaseline='middle';x.fillText('Place des jeux',128,34);
   const tx=new THREE.CanvasTexture(c);const bd=new THREE.Mesh(new THREE.BoxGeometry(2.6,.66,.08),[M(0x6b3a1f),M(0x6b3a1f),M(0x6b3a1f),M(0x6b3a1f),new THREE.MeshLambertMaterial({map:tx}),new THREE.MeshLambertMaterial({map:tx})]);bd.position.y=1.45;bd.castShadow=true;sg.add(bd);g0.add(sg)}
  lamps=new Map();
  for(const t of T()){
   const g=new THREE.Group();g.position.set(t.x,0,t.z);g.name='table_'+t.id;
   const top=new THREE.Mesh(new THREE.CylinderGeometry(1.15,1.15,.12,20),t.game==='cartes'?cloth:wood);top.position.y=.78;g.add(top);
   const rim=new THREE.Mesh(new THREE.TorusGeometry(1.15,.05,6,24),dark);rim.rotation.x=Math.PI/2;rim.position.y=.84;g.add(rim);
   const leg=new THREE.Mesh(new THREE.CylinderGeometry(.16,.28,.74,10),dark);leg.position.y=.37;g.add(leg);
   /* plateau du jeu posé dessus */
   if(t.game==='awale'){const b=new THREE.Mesh(new THREE.BoxGeometry(1.5,.12,.5),M(0x5e3219));b.position.y=.9;g.add(b);
    for(let i=0;i<12;i++){const s=new THREE.Mesh(new THREE.SphereGeometry(.07,8,6),M(0xe8c27a));s.position.set(-.6+(i%6)*.24,.98,i<6?-.1:.1);g.add(s)}}
   else if(t.game==='dames'||t.game==='echecs'){const n=t.game==='dames'?10:8,sz=1.1/n;
    for(let r=0;r<n;r++)for(let c=0;c<n;c++){const q=new THREE.Mesh(new THREE.BoxGeometry(sz,.04,sz),(r+c)%2?M(0x6b3a1f):M(0xead2a6));q.position.set(-.55+sz/2+c*sz,.86,-.55+sz/2+r*sz);g.add(q)}}
   if(t.game==='dames'){for(let i=0;i<8;i++){const pc=new THREE.Mesh(new THREE.CylinderGeometry(.045,.045,.03,10),M(i<4?0xfbf5e8:0x2a160c));pc.position.set(-.385+(i%4)*.22+(i<4?0:.11),.895,i<4?.44:-.44);g.add(pc)}}
   if(t.game==='echecs'){[[-.07,.48,0xfbf5e8],[.07,-.48,0x2a160c],[-.34,.48,0xfbf5e8],[.34,-.48,0x2a160c]].forEach((q,i)=>{const pc=new THREE.Mesh(new THREE.CylinderGeometry(.025,.05,i<2?.2:.13,8),M(q[2]));pc.position.set(q[0],.88+(i<2?.1:.065),q[1]);g.add(pc);if(i<2){const hd=new THREE.Mesh(new THREE.SphereGeometry(.035,8,6),M(q[2]));hd.position.set(q[0],1.0,q[1]);g.add(hd)}})}
   if(t.game==='cartes'){for(let i=0;i<4;i++){const c=new THREE.Mesh(new THREE.BoxGeometry(.22,.01,.31),M(i%2?0xfbf5e8:0x3a1c10));c.position.set(-.3+i*.2,.86,(i%2)*.1-.05);c.rotation.y=i*.3;g.add(c)}}
   /* tabourets (2 ou 4 places) */
   const n=t.game==='cartes'?4:2;for(let i=0;i<n;i++){const a=i*Math.PI*2/n+(n===2?Math.PI/2:Math.PI/4),st=new THREE.Mesh(new THREE.CylinderGeometry(.32,.36,.5,12),wood);st.position.set(Math.cos(a)*1.75,.25,Math.sin(a)*1.75);g.add(st)}
   /* voyant d'état (en ligne seulement) */
   const lamp=new THREE.Mesh(new THREE.SphereGeometry(.16,10,8),new THREE.MeshBasicMaterial({color:COL.free}));lamp.position.y=2.1;lamp.visible=false;g.add(lamp);lamps.set(t.id,lamp);
   g.traverse(o=>{if(o.isMesh&&o!==lamp)o.castShadow=true});
   const halo=new THREE.Mesh(new THREE.SphereGeometry(.34,12,8),new THREE.MeshBasicMaterial({color:COL.free,transparent:true,opacity:.28,depthWrite:false}));lamp.add(halo);lamp.userData.halo=halo;
   g0.add(g);if(addColl)addColl(t.x,t.z,1.25)}
  scene.add(g0);applyStatus();return g0}
 function applyStatus(){for(const [id,l] of lamps){const s=status.get(id);l.visible=!!s;if(s){const c=COL[s.status]||COL.free;l.material.color.setHex(c);if(l.userData.halo)l.userData.halo.material.color.setHex(c)}}}
 function setStatus(list){status=new Map((list||[]).map(x=>[x.id,x]));applyStatus()}
 function clearStatus(){status=new Map();applyStatus()}
 /* ---------- 2D ---------- */
 function sprite2d(game){const A=LCA.art;if(!A)return null;
  return A.spr(4.2,2.6,(c)=>{
   c.fillStyle='rgba(0,0,0,.22)';c.beginPath();c.ellipse(0,-.08,1.9,.42,0,0,Math.PI*2);c.fill();
   const stool=(x)=>{c.fillStyle='#5a3418';c.fillRect(x-.25,-.62,.5,.6);c.fillStyle='#8a5a30';c.beginPath();c.ellipse(x,-.64,.36,.14,0,0,Math.PI*2);c.fill()};
   stool(-1.55);stool(1.55);
   c.fillStyle='#4a2418';c.fillRect(-.16,-1.1,.32,1.05);
   c.fillStyle=game==='cartes'?'#1f5a46':'#7a4a26';c.beginPath();c.ellipse(0,-1.15,1.35,.42,0,0,Math.PI*2);c.fill();
   c.strokeStyle='#3a1c0e';c.lineWidth=.06;c.stroke();
   if(game==='awale'){c.fillStyle='#5e3219';c.fillRect(-.8,-1.32,1.6,.3);c.fillStyle='#e8c27a';for(let i=0;i<6;i++){c.beginPath();c.arc(-.62+i*.25,-1.2,.06,0,Math.PI*2);c.fill()}}
   else if(game==='dames'||game==='echecs'){const n=game==='dames'?10:8,w=1.2/n,h=.5/n;for(let r=0;r<n;r++)for(let k=0;k<n;k++){c.fillStyle=(r+k)%2?'#6b3a1f':'#ead2a6';c.fillRect(-.6+k*w,-1.4+r*h,w+.002,h+.002)}}
   else{const cs=['#fbf5e8','#3a1c10','#fbf5e8'];cs.forEach((col,i)=>{c.save();c.translate(-.35+i*.35,-1.2);c.rotate((i-1)*.25);c.fillStyle=col;c.fillRect(-.13,-.18,.26,.36);c.restore()})}})}
 /* api : {add(sprite,x,z,sc,opts), addColl(x,z,r)} du constructeur de world2d.js */
 const cache={};
 function build2d(api){for(const t of T()){const s=cache[t.game]||(cache[t.game]=sprite2d(t.game));if(s)api.add(s,t.x,t.z,1,{label:t.name,ly:3.2});api.addColl(t.x,t.z,1.2)}}
 LCA.gamesWorld={spots,build3d,build2d,setStatus,clearStatus,get status(){return status}};
})(typeof self!=='undefined'?self:this);
