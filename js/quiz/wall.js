/* Mur des champions : panneau physique du village affichant UNIQUEMENT le Top 10 du quiz de ce village.
   Un seul dessin (drawBoard) sert les deux rendus : texture 3D (CanvasTexture) et sprite 2D. Les données viennent du serveur
   (messages « top » poussés après chaque match validé) ; ce module ne calcule aucun classement. */
(function(){
 window.LCA=window.LCA||{};
 const W=512,H=640,fmt=ms=>{const s=ms/1000;return (s>=100?Math.round(s):s.toFixed(1)).toString().replace('.',',')+' s'};
 const st={village:null,villageName:'',top:[],version:0,updatedAt:0,hash:0};
 const listeners=[];let cv3=null,spr2=null,tex3=null;
 const medal=['#e6b422','#c9ced6','#c4753a'];
 function drawBoard(c,w,h,d){
  c.clearRect(0,0,w,h);
  /* cadre en bois */
  const g=c.createLinearGradient(0,0,w,h);g.addColorStop(0,'#5a2f1d');g.addColorStop(1,'#3b1d11');c.fillStyle=g;c.fillRect(0,0,w,h);
  c.strokeStyle='#e8b45a';c.lineWidth=Math.max(2,w/128);c.strokeRect(w*.03,h*.025,w*.94,h*.95);
  c.fillStyle='#f6efe3';c.fillRect(w*.05,h*.045,w*.9,h*.91);
  c.textAlign='center';c.fillStyle='#2a130c';c.font='800 '+Math.round(h*.055)+'px Trebuchet MS, system-ui, sans-serif';c.fillText('MUR DES CHAMPIONS',w/2,h*.115);
  c.fillStyle='#b45309';c.font='700 '+Math.round(h*.034)+'px Trebuchet MS, system-ui, sans-serif';c.fillText('Village '+(d.villageName||'')+' · Top 10',w/2,h*.16);
  c.strokeStyle='#d9c7a6';c.lineWidth=2;c.beginPath();c.moveTo(w*.09,h*.185);c.lineTo(w*.91,h*.185);c.stroke();
  c.textAlign='left';c.fillStyle='#7a5a3a';c.font='700 '+Math.round(h*.026)+'px Trebuchet MS, system-ui, sans-serif';
  c.fillText('Rang',w*.09,h*.215);c.fillText('Joueur',w*.22,h*.215);c.textAlign='right';c.fillText('Score',w*.74,h*.215);c.fillText('Temps',w*.91,h*.215);
  const rows=10,y0=h*.245,dy=h*.0685;
  for(let i=0;i<rows;i++){
   const e=d.top[i],y=y0+i*dy;
   if(i%2===0){c.fillStyle='rgba(180,83,9,.07)';c.fillRect(w*.07,y-dy*.15,w*.86,dy*.92)}
   const r=y+dy*.5;
   /* rang : pastille (forme + chiffre, jamais la couleur seule) */
   c.beginPath();c.arc(w*.125,r-h*.004,h*.026,0,6.283);c.fillStyle=e&&i<3?medal[i]:'#e7dcc6';c.fill();
   c.textAlign='center';c.fillStyle='#2a130c';c.font='800 '+Math.round(h*.03)+'px Trebuchet MS, system-ui, sans-serif';c.fillText(String(i+1),w*.125,r+h*.008);
   if(e){
    c.textAlign='left';c.font='700 '+Math.round(h*.034)+'px Trebuchet MS, system-ui, sans-serif';c.fillStyle='#2a130c';
    let nm=String(e.name);while(c.measureText(nm).width>w*.38&&nm.length>3)nm=nm.slice(0,-2);if(nm!==e.name)nm+='…';c.fillText(nm,w*.22,r+h*.008);
    c.textAlign='right';c.fillStyle='#1d5a2e';c.font='800 '+Math.round(h*.034)+'px Trebuchet MS, system-ui, sans-serif';c.fillText(String(e.score),w*.74,r+h*.008);
    c.fillStyle='#5b4636';c.font='600 '+Math.round(h*.028)+'px Trebuchet MS, system-ui, sans-serif';c.fillText(fmt(e.timeMs),w*.91,r+h*.008)}
   else{c.textAlign='left';c.fillStyle='#b9a98c';c.font='600 '+Math.round(h*.03)+'px Trebuchet MS, system-ui, sans-serif';c.fillText('—',w*.22,r+h*.008)}}
  c.textAlign='center';c.fillStyle='#7a5a3a';c.font='600 '+Math.round(h*.022)+'px Trebuchet MS, system-ui, sans-serif';
  c.fillText(d.top.length?'Classement : meilleur match de 10 questions, puis temps total':'Aucun champion pour l’instant : sois le premier !',w/2,h*.93)}
 function paint(){
  const d={top:st.top,villageName:st.villageName};
  if(cv3){drawBoard(cv3.getContext('2d'),W,H,d)}
  if(spr2){const c=spr2.cv.getContext('2d');c.save();c.setTransform(1,0,0,1,0,0);drawBoard(c,spr2.cv.width,spr2.cv.height,d);c.restore();spr2.tint={}/* invalide les copies teintées (brume) */}
  if(tex3)tex3.needsUpdate=true;
  /* empreinte du contenu : sert aux tests (le mur a-t-il vraiment été redessiné ?) */
  let h=0;const s=JSON.stringify(st.top);for(let i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))|0;st.hash=h}
 const api={
  state:st,W,H,fmt,drawBoard,
  /* données : appelé avec le Top 10 reçu du serveur (jamais calculé ici) */
  setTop(village,name,top){const clean=(Array.isArray(top)?top:[]).slice(0,10).map(e=>({rank:e.rank,name:String(e.name||'').slice(0,40),score:e.score|0,timeMs:e.timeMs|0}));
   const same=st.village===village&&JSON.stringify(clean)===JSON.stringify(st.top);
   st.village=village;st.villageName=name||village||'';st.top=clean;if(same&&st.version>0)return false;st.version++;st.updatedAt=Date.now();paint();listeners.forEach(f=>{try{f(st)}catch(e){}});return true},
  reset(){st.village=null;st.villageName='';st.top=[];st.version++;paint();listeners.forEach(f=>{try{f(st)}catch(e){}})},
  onChange(f){listeners.push(f)},
  /* toile partagée (texture 3D) */
  canvas3d(){if(!cv3){cv3=document.createElement('canvas');cv3.width=W;cv3.height=H;paint()}return cv3},
  setTexture3d(t){tex3=t},get texture3d(){return tex3},
  /* sprite du moteur 2D (même objet réutilisé à chaque construction du village) */
  sprite2d(){if(!spr2&&LCA.art){spr2=LCA.art.spr(4.4,5.4,()=>{});paint()}return spr2},
  get canvas(){return cv3},
  pixelHash(){const c=cv3||(spr2&&spr2.cv);if(!c)return 0;const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let h=0;for(let i=0;i<d.length;i+=37)h=(h*31+d[i])|0;return h}};
 LCA.quizWall=api})();
