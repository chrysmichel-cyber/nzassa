/* Échecs — règles FIDE complètes, 2 joueurs. Règles PURES (aucun DOM, aucun réseau). Module UMD.
   Siège 0 = blancs (jouent en premier), siège 1 = noirs.
   État JSON : {id:'echecs', board:[64 entiers], cur:0|1, cas:'KQkq'|'-', ep:null|'e3', half, full, hist:[clés], log:[SAN], last, res}
     board : index 0 = a8 … 63 = h1 (ordre FEN) ; 0 vide ; blancs 1..6 positifs, noirs négatifs ; 1 pion 2 cavalier 3 fou 4 tour 5 dame 6 roi.
     hist  : clés de position (placement, trait, roques, en passant jouable) depuis le dernier coup irréversible (répétition ×3).
   Coup : {from:'e2', to:'e4'} ; promotion : {from:'e7', to:'e8', promo:'q'|'r'|'b'|'n'} (obligatoire). Le roque se joue par le coup du roi (e1→g1).
   Abandon : fonction exportée resign(state, seat) ; apply accepte aussi le coup spécial {t:'resign'} (permis à tout moment, des deux sièges,
   tant que la partie n'est pas finie) -> reason 'abandon'.
   Fin automatique : mat, pat, matériel insuffisant (R+... non : K, K+C, K+F, fous tous de même couleur), répétition ×3, 50 coups (100 demi-coups).
   Extras exportés : fen(state), fromFen(fen), perft(fenOuEtat, profondeur), resign(state, seat), START_FEN.
   IA : negamax alpha-bêta + quiescence + MVV-LVA + killers/historique + approfondissement itératif à budget strict ; génération par
   tableaux typés avec make/unmake (aucun clonage dans la recherche). */
(function(root,f){if(typeof module==='object'&&module.exports){module.exports=f(require('../core.js'))}else{root.LCA.games.register(f(root.LCA.games))}})(typeof self!=='undefined'?self:this,function(core){
 'use strict';
 const {RuleError}=core;
 const START_FEN='rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
 const LETTERS='PNBRQK',PROMO_CODE={n:2,b:3,r:4,q:5},PROMO_CH=[null,null,'n','b','r','q'];

 /* ---------- tables précalculées ---------- */
 const KN=[],KG=[],RAYS=[],PCAP=[[],[]];
 const DIRS=[[-1,0],[0,1],[1,0],[0,-1],[-1,1],[1,1],[1,-1],[-1,-1]];
 (function(){
  const on=(r,c)=>r>=0&&r<8&&c>=0&&c<8;
  for(let s=0;s<64;s++){
   const r=s>>3,c=s&7;
   KN[s]=[[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]].filter(d=>on(r+d[0],c+d[1])).map(d=>(r+d[0])*8+c+d[1]);
   KG[s]=DIRS.filter(d=>on(r+d[0],c+d[1])).map(d=>(r+d[0])*8+c+d[1]);
   RAYS[s]=DIRS.map(d=>{const a=[];let rr=r+d[0],cc=c+d[1];while(on(rr,cc)){a.push(rr*8+cc);rr+=d[0];cc+=d[1]}return a});
   PCAP[0][s]=[[-1,-1],[-1,1]].filter(d=>on(r+d[0],c+d[1])).map(d=>(r+d[0])*8+c+d[1]);
   PCAP[1][s]=[[1,-1],[1,1]].filter(d=>on(r+d[0],c+d[1])).map(d=>(r+d[0])*8+c+d[1]);
  }})();
 const CASMASK=new Int8Array(64).fill(15);
 CASMASK[60]=~3&15;CASMASK[63]=~1&15;CASMASK[56]=~2&15;CASMASK[4]=~12&15;CASMASK[7]=~4&15;CASMASK[0]=~8&15;

 /* Zobrist 32 bits (répétition dans la recherche uniquement) */
 let zs;const zp=new Int32Array(13*64),zcas=new Int32Array(16),zep=new Int32Array(65);
 let zseed=0x9E3779B9;
 const zrand=()=>{zseed^=zseed<<13;zseed^=zseed>>>17;zseed^=zseed<<5;return zseed|0};
 for(let i=0;i<zp.length;i++)zp[i]=zrand();
 zs=zrand();for(let i=0;i<16;i++)zcas[i]=zrand();for(let i=0;i<65;i++)zep[i]=zrand();

 const sqName=i=>'abcdefgh'[i&7]+(8-(i>>3));
 const nameSq=s=>(typeof s==='string'&&/^[a-h][1-8]$/.test(s))?(8-(+s[1]))*8+(s.charCodeAt(0)-97):-1;

 /* ---------- position interne (mutable, réservée à la recherche et aux calculs) ---------- */
 const UCAP=new Int8Array(2048),UCAS=new Int8Array(2048),UEP=new Int16Array(2048),UHALF=new Int16Array(2048),UH=new Int32Array(2048);
 function casBits(s){let n=0;if(s&&s!=='-'){if(s.includes('K'))n|=1;if(s.includes('Q'))n|=2;if(s.includes('k'))n|=4;if(s.includes('q'))n|=8}return n}
 const casStr=n=>n?((n&1?'K':'')+(n&2?'Q':'')+(n&4?'k':'')+(n&8?'q':'')):'-';
 function hashOf(pos){
  let h=0;for(let s=0;s<64;s++){const p=pos.b[s];if(p)h^=zp[(p+6)*64+s]}
  if(pos.side)h^=zs;return h^zcas[pos.cas]^zep[pos.ep+1]}
 function mkPos(board,side,cas,ep,half){
  const pos={b:Int8Array.from(board),side,cas,ep,half,ks:[-1,-1],sp:0,h:0};
  for(let s=0;s<64;s++){if(pos.b[s]===6)pos.ks[0]=s;else if(pos.b[s]===-6)pos.ks[1]=s}
  pos.h=hashOf(pos);return pos}

 function attacked(pos,sq,by){
  const b=pos.b,sg=by?-1:1;
  const pa=PCAP[by^1][sq];for(let i=0;i<pa.length;i++)if(b[pa[i]]===sg)return true;
  const kn=KN[sq];for(let i=0;i<kn.length;i++)if(b[kn[i]]===2*sg)return true;
  const kg=KG[sq];for(let i=0;i<kg.length;i++)if(b[kg[i]]===6*sg)return true;
  const rays=RAYS[sq];
  for(let d=0;d<8;d++){const ray=rays[d];
   for(let i=0;i<ray.length;i++){const p=b[ray[i]];if(!p)continue;const q=p*sg;
    if(q===5||(d<4?q===4:q===3))return true;break}}
  return false}

 /* Coups pseudo-légaux. m = from | to<<6 | promo<<12 | flags<<15 (1 en passant, 2 roque, 4 double pas). caps : captures + promotions en dame (quiescence). */
 function gen(pos,out,caps){
  let n=0;const b=pos.b,side=pos.side,sg=side?-1:1,opp=side^1;
  for(let s=0;s<64;s++){
   const p=b[s]*sg;if(p<=0)continue;
   if(p===1){
    const row=s>>3,dir=side?8:-8,to=s+dir,last=side?7:0,start=side?1:6;
    if(b[to]===0){
     if((to>>3)===last){if(caps)out[n++]=s|to<<6|5<<12;else{out[n++]=s|to<<6|5<<12;out[n++]=s|to<<6|4<<12;out[n++]=s|to<<6|3<<12;out[n++]=s|to<<6|2<<12}}
     else if(!caps){out[n++]=s|to<<6;if(row===start&&b[to+dir]===0)out[n++]=s|(to+dir)<<6|4<<15}}
    const pc=PCAP[side][s];
    for(let i=0;i<pc.length;i++){const t=pc[i],v=b[t]*sg;
     if(v<0){if((t>>3)===last){out[n++]=s|t<<6|5<<12;if(!caps){out[n++]=s|t<<6|4<<12;out[n++]=s|t<<6|3<<12;out[n++]=s|t<<6|2<<12}}else out[n++]=s|t<<6}
     else if(v===0&&t===pos.ep)out[n++]=s|t<<6|1<<15}
   }else if(p===2||p===6){
    const L=p===2?KN[s]:KG[s];
    for(let i=0;i<L.length;i++){const t=L[i],v=b[t]*sg;if(v<0||(v===0&&!caps))out[n++]=s|t<<6}
    if(p===6&&!caps){
     if(side===0&&s===60){
      if((pos.cas&1)&&b[63]===4&&!b[61]&&!b[62]&&!attacked(pos,60,1)&&!attacked(pos,61,1)&&!attacked(pos,62,1))out[n++]=60|62<<6|2<<15;
      if((pos.cas&2)&&b[56]===4&&!b[57]&&!b[58]&&!b[59]&&!attacked(pos,60,1)&&!attacked(pos,59,1)&&!attacked(pos,58,1))out[n++]=60|58<<6|2<<15}
     else if(side===1&&s===4){
      if((pos.cas&4)&&b[7]===-4&&!b[5]&&!b[6]&&!attacked(pos,4,0)&&!attacked(pos,5,0)&&!attacked(pos,6,0))out[n++]=4|6<<6|2<<15;
      if((pos.cas&8)&&b[0]===-4&&!b[1]&&!b[2]&&!b[3]&&!attacked(pos,4,0)&&!attacked(pos,3,0)&&!attacked(pos,2,0))out[n++]=4|2<<6|2<<15}}
   }else{
    const d0=p===3?4:0,d1=p===4?4:8,rays=RAYS[s];
    for(let d=d0;d<d1;d++){const ray=rays[d];
     for(let i=0;i<ray.length;i++){const t=ray[i],v=b[t]*sg;
      if(v===0){if(!caps)out[n++]=s|t<<6}else{if(v<0)out[n++]=s|t<<6;break}}}}
  }
  return n}

 function make(pos,m){
  const b=pos.b,f=m&63,t=(m>>6)&63,pr=(m>>12)&7,fl=m>>15,side=pos.side,sg=side?-1:1,p=b[f],cap=b[t],i=pos.sp++;
  UCAP[i]=cap;UCAS[i]=pos.cas;UEP[i]=pos.ep;UHALF[i]=pos.half;UH[i]=pos.h;
  let h=pos.h^zs^zcas[pos.cas]^zep[pos.ep+1];
  h^=zp[(p+6)*64+f];if(cap)h^=zp[(cap+6)*64+t];
  const np=pr?sg*pr:p;b[f]=0;b[t]=np;h^=zp[(np+6)*64+t];
  if(fl&1){const cs=side?t-8:t+8;h^=zp[(b[cs]+6)*64+cs];b[cs]=0}
  else if(fl&2){const rf=t>f?t+1:t-2,rt=t>f?t-1:t+1,rk=sg*4;b[rf]=0;b[rt]=rk;h^=zp[(rk+6)*64+rf]^zp[(rk+6)*64+rt]}
  const nc=pos.cas&CASMASK[f]&CASMASK[t];
  pos.ep=(fl&4)?(f+t)>>1:-1;
  pos.half=(p===sg||cap||(fl&1))?0:pos.half+1;
  if(p===6*sg)pos.ks[side]=t;
  pos.cas=nc;h^=zcas[nc]^zep[pos.ep+1];pos.h=h;pos.side=side^1}
 function unmake(pos,m){
  const b=pos.b,f=m&63,t=(m>>6)&63,pr=(m>>12)&7,fl=m>>15,i=--pos.sp,side=pos.side^1,sg=side?-1:1;
  pos.side=side;const p=pr?sg:b[t];
  b[f]=p;b[t]=UCAP[i];
  if(fl&1){b[side?t-8:t+8]=-sg}
  else if(fl&2){const rf=t>f?t+1:t-2,rt=t>f?t-1:t+1;b[rt]=0;b[rf]=sg*4}
  if(p===6*sg)pos.ks[side]=f;
  pos.cas=UCAS[i];pos.ep=UEP[i];pos.half=UHALF[i];pos.h=UH[i]}

 const TMP=new Int32Array(256);
 function legalInts(pos){
  const n=gen(pos,TMP,false),out=[],side=pos.side;
  for(let i=0;i<n;i++){const m=TMP[i];make(pos,m);if(!attacked(pos,pos.ks[side],side^1))out.push(m);unmake(pos,m)}
  return out}
 function anyLegal(pos){
  const n=gen(pos,TMP,false),side=pos.side;let ok=false;
  for(let i=0;i<n&&!ok;i++){const m=TMP[i];make(pos,m);if(!attacked(pos,pos.ks[side],side^1))ok=true;unmake(pos,m)}
  return ok}
 const inCheck=pos=>attacked(pos,pos.ks[pos.side],pos.side^1);

 function perftRec(pos,d,ply,bufs){
  const buf=bufs[ply],n=gen(pos,buf,false),side=pos.side;let c=0;
  for(let i=0;i<n;i++){const m=buf[i];make(pos,m);
   if(!attacked(pos,pos.ks[side],side^1))c+=d===1?1:perftRec(pos,d-1,ply+1,bufs);
   unmake(pos,m)}
  return c}

 /* ---------- conversions état <-> position, FEN, clé ---------- */
 function posOfState(st){
  if(!st||typeof st!=='object'||Array.isArray(st)||st.id!=='echecs'||!Array.isArray(st.board)||st.board.length!==64||(st.cur!==0&&st.cur!==1)
   ||typeof st.cas!=='string'||!Array.isArray(st.hist)||!Array.isArray(st.log)||!Number.isInteger(st.half)||!Number.isInteger(st.full)||(st.ep!==null&&nameSq(st.ep)<0))
   throw new RuleError('etat_invalide','État de partie invalide');
  let k0=0,k1=0;
  for(const p of st.board){if(!Number.isInteger(p)||p<-6||p>6)throw new RuleError('etat_invalide','État de partie invalide');if(p===6)k0++;if(p===-6)k1++}
  if(k0!==1||k1!==1)throw new RuleError('etat_invalide','État de partie invalide');
  return mkPos(st.board,st.cur,casBits(st.cas),st.ep===null?-1:nameSq(st.ep),st.half)}

 function keyOf(pos){
  let s='',e=0;
  for(let i=0;i<64;i++){const p=pos.b[i];
   if(!p)e++;else{if(e){s+=e;e=0}s+=p>0?LETTERS[p-1]:LETTERS[-p-1].toLowerCase()}
   if((i&7)===7){if(e){s+=e;e=0}if(i<63)s+='/'}}
  let ep='-';
  if(pos.ep>=0){const side=pos.side,n=gen(pos,TMP,false);
   for(let i=0;i<n;i++){const m=TMP[i];if((m>>15)&1){make(pos,m);if(!attacked(pos,pos.ks[side],side^1))ep=sqName(pos.ep===-1?(m>>6)&63:(m>>6)&63);unmake(pos,m)}}}
  return s+' '+(pos.side?'b':'w')+' '+casStr(pos.cas)+' '+ep}
 /* hash d'une clé de l'historique (pour la répétition dans la recherche de l'IA) */
 function hashOfKey(key){
  const f=key.split(' '),board=new Array(64).fill(0);let i=0;
  for(const ch of f[0]){if(ch==='/')continue;if(ch>='1'&&ch<='8')i+=+ch;else{const u=ch.toUpperCase(),x=LETTERS.indexOf(u)+1;board[i++]=ch===u?x:-x}}
  return mkPos(board,f[1]==='b'?1:0,casBits(f[2]),-1,0).h}

 function insufficient(pos){
  let minors=0,bishopsOnly=true,colors=0,lastSq=-1;
  for(let s=0;s<64;s++){const a=Math.abs(pos.b[s]);
   if(!a||a===6)continue;
   if(a===1||a===4||a===5)return false;
   minors++;if(a===2)bishopsOnly=false;else colors|=1<<(((s>>3)+(s&7))&1);lastSq=s}
  if(minors<=1)return true;
  return bishopsOnly&&colors!==3}

 function evalResult(pos,hist,key){
  if(!anyLegal(pos)){
   const sc=n=>n;void sc;
   return inCheck(pos)?{winners:[pos.side^1],draw:false,reason:'mat',scores:pos.side?{0:1,1:0}:{0:0,1:1}}
    :{winners:[],draw:true,reason:'pat',scores:{0:0.5,1:0.5}}}
  if(insufficient(pos))return{winners:[],draw:true,reason:'materiel',scores:{0:0.5,1:0.5}};
  let c=0;for(const k of hist)if(k===key)c++;
  if(c>=3)return{winners:[],draw:true,reason:'repetition',scores:{0:0.5,1:0.5}};
  if(pos.half>=100)return{winners:[],draw:true,reason:'50coups',scores:{0:0.5,1:0.5}};
  return null}

 function stateOfPos(pos,full,log,hist,last){
  const key=keyOf(pos);
  const h=hist===null?[key]:(pos.half===0?[key]:hist.concat(key));
  return{id:'echecs',board:Array.from(pos.b),cur:pos.side,cas:casStr(pos.cas),ep:pos.ep>=0?sqName(pos.ep):null,half:pos.half,full,hist:h,log,last,res:evalResult(pos,h,key)}}

 function fen(st){
  const pos=posOfState(st);let s='',e=0;
  for(let i=0;i<64;i++){const p=pos.b[i];
   if(!p)e++;else{if(e){s+=e;e=0}s+=p>0?LETTERS[p-1]:LETTERS[-p-1].toLowerCase()}
   if((i&7)===7){if(e){s+=e;e=0}if(i<63)s+='/'}}
  return s+' '+(st.cur?'b':'w')+' '+st.cas+' '+(st.ep||'-')+' '+st.half+' '+st.full}

 function fromFen(text){
  const bad=m=>new RuleError('fen','FEN invalide : '+m);
  if(typeof text!=='string')throw bad('texte attendu');
  const f=text.trim().split(/\s+/);
  if(f.length<4||f.length>6)throw bad('4 à 6 champs attendus');
  const rows=f[0].split('/');if(rows.length!==8)throw bad('8 rangées attendues');
  const board=new Array(64).fill(0);
  for(let r=0;r<8;r++){let c=0;
   for(const ch of rows[r]){
    if(ch>='1'&&ch<='8')c+=+ch;
    else{const u=ch.toUpperCase(),x=LETTERS.indexOf(u)+1;if(!x)throw bad('pièce inconnue');if(c>7)throw bad('rangée trop longue');board[r*8+c]=ch===u?x:-x;c++}
    if(c>8)throw bad('rangée trop longue')}
   if(c!==8)throw bad('rangée incomplète')}
  if(f[1]!=='w'&&f[1]!=='b')throw bad('trait');
  const side=f[1]==='b'?1:0;
  if(!/^(-|[KQkq]+)$/.test(f[2]))throw bad('roques');
  if(f[3]!=='-'&&!/^[a-h][36]$/.test(f[3]))throw bad('en passant');
  const half=f[4]===undefined?0:(/^\d+$/.test(f[4])?+f[4]:-1),full=f[5]===undefined?1:(/^\d+$/.test(f[5])?+f[5]:0);
  if(half<0||full<1)throw bad('compteurs');
  let k0=0,k1=0;
  for(let i=0;i<64;i++){const p=board[i];if(p===6)k0++;if(p===-6)k1++;if(Math.abs(p)===1&&((i>>3)===0||(i>>3)===7))throw bad('pion sur une rangée de fond')}
  if(k0!==1||k1!==1)throw bad('un roi de chaque couleur');
  let cas=casBits(f[2]);
  if(board[60]!==6){cas&=~3}if(board[63]!==4)cas&=~1;if(board[56]!==4)cas&=~2;
  if(board[4]!==-6){cas&=~12}if(board[7]!==-4)cas&=~4;if(board[0]!==-4)cas&=~8;
  let ep=-1;
  if(f[3]!=='-'){ep=nameSq(f[3]);const row=ep>>3;
   if(row!==(side?5:2))throw bad('en passant incohérent');
   const pawn=side?ep-8:ep+8,from=side?ep+8:ep-8;
   if(board[ep]!==0||board[pawn]!==(side?1:-1)||board[from]!==0)throw bad('en passant incohérent')}
  const pos=mkPos(board,side,cas,ep,half);
  if(attacked(pos,pos.ks[side^1],side))throw bad('le camp qui n’a pas le trait est en échec');
  return stateOfPos(pos,full,[],null,null)}

 const sqToObj=m=>{const o={from:sqName(m&63),to:sqName((m>>6)&63)},pr=(m>>12)&7;if(pr)o.promo=PROMO_CH[pr];return o};
 function sanOf(pos,m,legal){
  const f=m&63,t=(m>>6)&63,pr=(m>>12)&7,fl=m>>15,p=Math.abs(pos.b[f]),cap=pos.b[t]!==0||(fl&1)!==0;
  let s;
  if(fl&2)s=t>f?'O-O':'O-O-O';
  else if(p===1){s=(cap?'abcdefgh'[f&7]+'x':'')+sqName(t);if(pr)s+='='+LETTERS[pr-1]}
  else{
   s=LETTERS[p-1];let sameFile=false,sameRank=false,other=false;
   for(const o of legal){if(o===m)continue;
    if(((o>>6)&63)===t&&Math.abs(pos.b[o&63])===p){other=true;if((o&7)===(f&7))sameFile=true;if((o>>3&7)===(f>>3))sameRank=true}}
   if(other){if(!sameFile)s+='abcdefgh'[f&7];else if(!sameRank)s+=8-(f>>3);else s+=sqName(f)}
   s+=(cap?'x':'')+sqName(t)}
  const side=pos.side;make(pos,m);
  if(inCheck(pos))s+=anyLegal(pos)?'+':'#';
  unmake(pos,m);void side;return s}

 /* ---------- contrat des règles ---------- */
 function init({players}={}){
  const n=Array.isArray(players)?players.length:players;
  if(n!==2)throw new RuleError('joueurs','Les échecs se jouent à 2 joueurs');
  return fromFen(START_FEN)}
 const turn=st=>st&&st.res?-1:st.cur;
 function legalMoves(st,seat){
  if(st.res||seat!==st.cur)return[];
  return legalInts(posOfState(st)).map(sqToObj)}
 const result=st=>st.res?core.clone(st.res):null;
 function resign(st,seat){
  if(!st||typeof st!=='object'||st.id!=='echecs')throw new RuleError('etat_invalide','État de partie invalide');
  if(st.res)throw new RuleError('partie_finie','La partie est terminée');
  if(seat!==0&&seat!==1)throw new RuleError('siege_invalide','Siège invalide');
  const s=core.clone(st);s.res={winners:[1-seat],draw:false,reason:'abandon',scores:seat?{0:1,1:0}:{0:0,1:1}};
  s.last=Object.assign({},s.last||{},{resign:seat});return s}

 function apply(state,move,seat){
  if(!state||typeof state!=='object'||Array.isArray(state)||state.id!=='echecs'||!Array.isArray(state.board)||(state.cur!==0&&state.cur!==1&&!state.res))throw new RuleError('etat_invalide','État de partie invalide');
  if(state.res)throw new RuleError('partie_finie','La partie est terminée');
  if(seat!==0&&seat!==1)throw new RuleError('siege_invalide','Siège invalide');
  if(move!==null&&typeof move==='object'&&!Array.isArray(move)&&move.t==='resign')return resign(state,seat);
  if(seat!==state.cur)throw new RuleError('hors_tour','Ce n’est pas votre tour');
  if(move===null||typeof move!=='object'||Array.isArray(move)||typeof move.from!=='string'||typeof move.to!=='string'
   ||(move.promo!==undefined&&typeof move.promo!=='string'))throw new RuleError('coup_mal_forme','Coup mal formé');
  const f=nameSq(move.from),t=nameSq(move.to);
  if(f<0||t<0||(move.promo!==undefined&&!PROMO_CODE[move.promo]))throw new RuleError('coup_mal_forme','Coup mal formé');
  const pos=posOfState(state),legal=legalInts(pos),pr=move.promo===undefined?0:PROMO_CODE[move.promo];
  const m=legal.find(x=>(x&63)===f&&((x>>6)&63)===t&&((x>>12)&7)===pr);
  if(m===undefined)throw new RuleError('coup_illegal','Coup illégal');
  const san=sanOf(pos,m,legal),o=sqToObj(m);
  const full=state.full+(state.cur===1?1:0);
  make(pos,m);
  return stateOfPos(pos,full,state.log.concat(san),state.hist,Object.assign({from:o.from,to:o.to,san,by:seat},o.promo?{promo:o.promo}:{}))}

 const view=(st)=>core.clone(st);
 function notation(st,move,seat){
  try{
   const pos=posOfState(st),legal=legalInts(pos),f=nameSq(move.from),t=nameSq(move.to),pr=move.promo?PROMO_CODE[move.promo]:0;
   const m=legal.find(x=>(x&63)===f&&((x>>6)&63)===t&&((x>>12)&7)===pr);
   return m===undefined?'?':sanOf(pos,m,legal)}catch(e){return '?'}}
 function perft(x,depth){
  const st=typeof x==='string'?fromFen(x):x,pos=posOfState(st),bufs=[];
  for(let i=0;i<=depth;i++)bufs.push(new Int32Array(256));
  return depth<=0?1:perftRec(pos,depth,0,bufs)}

 /* ---------- IA ---------- */
 const VAL=[0,100,320,330,500,900,20000];
 const PST=[null,
  [0,0,0,0,0,0,0,0,50,50,50,50,50,50,50,50,10,10,20,30,30,20,10,10,5,5,10,25,25,10,5,5,0,0,0,20,20,0,0,0,5,-5,-10,0,0,-10,-5,5,5,10,10,-20,-20,10,10,5,0,0,0,0,0,0,0,0],
  [-50,-40,-30,-30,-30,-30,-40,-50,-40,-20,0,0,0,0,-20,-40,-30,0,10,15,15,10,0,-30,-30,5,15,20,20,15,5,-30,-30,0,15,20,20,15,0,-30,-30,5,10,15,15,10,5,-30,-40,-20,0,5,5,0,-20,-40,-50,-40,-30,-30,-30,-30,-40,-50],
  [-20,-10,-10,-10,-10,-10,-10,-20,-10,0,0,0,0,0,0,-10,-10,0,5,10,10,5,0,-10,-10,5,5,10,10,5,5,-10,-10,0,10,10,10,10,0,-10,-10,10,10,10,10,10,10,-10,-10,5,0,0,0,0,5,-10,-20,-10,-10,-10,-10,-10,-10,-20],
  [0,0,0,0,0,0,0,0,5,10,10,10,10,10,10,5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,0,0,0,5,5,0,0,0],
  [-20,-10,-10,-5,-5,-10,-10,-20,-10,0,0,0,0,0,0,-10,-10,0,5,5,5,5,0,-10,-5,0,5,5,5,5,0,-5,0,0,5,5,5,5,0,-5,-10,5,5,5,5,5,0,-10,-10,0,5,0,0,0,0,-10,-20,-10,-10,-5,-5,-10,-10,-20],
  [-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30,-20,-30,-30,-40,-40,-30,-30,-20,-10,-20,-20,-20,-20,-20,-20,-10,20,20,0,0,0,0,20,20,20,30,10,0,0,10,30,20]];
 const KEG=[-50,-40,-30,-20,-20,-30,-40,-50,-30,-20,-10,0,0,-10,-20,-30,-30,-10,20,30,30,20,-10,-30,-30,-10,30,40,40,30,-10,-30,-30,-10,30,40,40,30,-10,-30,-30,-10,20,30,30,20,-10,-30,-30,-30,0,0,0,0,-30,-30,-50,-30,-30,-30,-30,-30,-30,-50];
 const MATE=30000,INF=32000,MAXPLY=64;
 const TIMEOUT={timeout:true};
 const now=()=>typeof performance!=='undefined'&&performance.now?performance.now():Date.now();

 function evaluate(pos){
  const b=pos.b;let sc=0,np=0,bw=0,bb=0;
  for(let s=0;s<64;s++){const p=b[s];if(!p)continue;const a=p<0?-p:p;if(a>1&&a<6)np+=VAL[a];}
  const eg=np<2600;
  for(let s=0;s<64;s++){const p=b[s];if(!p)continue;
   if(p>0){sc+=VAL[p]+(p===6?(eg?KEG[s]:PST[6][s]):PST[p][s]);if(p===3)bw++}
   else{const a=-p,m=s^56;sc-=VAL[a]+(a===6?(eg?KEG[m]:PST[6][m]):PST[a][m]);if(a===3)bb++}}
  if(bw>1)sc+=30;if(bb>1)sc-=30;
  return pos.side?-sc:sc}

 const MB=[],SB=[];for(let i=0;i<MAXPLY+8;i++){MB.push(new Int32Array(256));SB.push(new Int32Array(256))}
 let S=null;
 function scoreMoves(pos,buf,sc,n,ply,caps){
  const b=pos.b,sg=pos.side?-1:1;
  for(let i=0;i<n;i++){const m=buf[i],f=m&63,t=(m>>6)&63,pr=(m>>12)&7,fl=m>>15,v=b[t]*sg;let s=0;
   if(v<0||(fl&1))s=100000+VAL[fl&1?1:-v]*10-Math.abs(b[f]);
   else if(pr)s=90000+pr;
   else if(!caps){const k=S.killers[ply];s=(k[0]===m)?80000:(k[1]===m)?79000:S.hist[(pos.side<<12)|(m&4095)]}
   if(pr&&v<0)s+=VAL[pr];
   if(ply===0&&m===S.pv)s=1e9;
   sc[i]=s}}
 function search(pos,depth,alpha,beta,ply){
  if((++S.nodes&255)===0&&now()>S.deadline)throw TIMEOUT;
  const side=pos.side,chk=attacked(pos,pos.ks[side],side^1);
  if(ply>0){
   if(pos.half>=100)return 0;
   const lo=Math.max(0,S.base+ply-pos.half),hs=S.hs;
   for(let j=S.base+ply-2;j>=lo;j-=2)if(hs[j]===pos.h)return 0}
  S.hs[S.base+ply]=pos.h;
  if(chk&&ply<MAXPLY-8)depth++;
  if(depth<=0)return qsearch(pos,alpha,beta,ply);
  const buf=MB[ply],sc=SB[ply],n=gen(pos,buf,false);
  if(ply===0){for(let i=n-1;i>0;i--){const j=Math.floor(S.rng()*(i+1)),x=buf[i];buf[i]=buf[j];buf[j]=x}}
  scoreMoves(pos,buf,sc,n,ply,false);
  let best=-INF,legal=0;
  for(let i=0;i<n;i++){
   let bi=i;for(let j=i+1;j<n;j++)if(sc[j]>sc[bi])bi=j;
   if(bi!==i){const m0=buf[i],s0=sc[i];buf[i]=buf[bi];sc[i]=sc[bi];buf[bi]=m0;sc[bi]=s0}
   const m=buf[i];make(pos,m);
   if(attacked(pos,pos.ks[side],side^1)){unmake(pos,m);continue}
   legal++;
   const v=-search(pos,depth-1,-beta,-alpha,ply+1);
   unmake(pos,m);
   if(v>best){best=v;
    if(v>alpha){alpha=v;if(ply===0)S.rootBest=m;
     if(alpha>=beta){
      if(!pos.b[(m>>6)&63]&&!((m>>12)&7)&&!((m>>15)&1)){const k=S.killers[ply];if(k[0]!==m){k[1]=k[0];k[0]=m}S.hist[(side<<12)|(m&4095)]+=depth*depth}
      break}}}}
  if(!legal)return chk?-(MATE-ply):0;
  return best}
 function qsearch(pos,alpha,beta,ply){
  if((++S.nodes&255)===0&&now()>S.deadline)throw TIMEOUT;
  const stand=evaluate(pos);
  if(stand>=beta)return stand;
  if(ply>=MAXPLY)return stand;
  if(stand>alpha)alpha=stand;
  const side=pos.side,buf=MB[ply],sc=SB[ply],n=gen(pos,buf,true);
  scoreMoves(pos,buf,sc,n,ply,true);
  for(let i=0;i<n;i++){
   let bi=i;for(let j=i+1;j<n;j++)if(sc[j]>sc[bi])bi=j;
   if(bi!==i){const m0=buf[i],s0=sc[i];buf[i]=buf[bi];sc[i]=sc[bi];buf[bi]=m0;sc[bi]=s0}
   const m=buf[i];
   if(!((m>>12)&7)&&stand+VAL[Math.abs(pos.b[(m>>6)&63])||1]+200<alpha)continue;
   make(pos,m);
   if(attacked(pos,pos.ks[side],side^1)){unmake(pos,m);continue}
   const v=-qsearch(pos,-beta,-alpha,ply+1);
   unmake(pos,m);
   if(v>stand&&v>alpha){alpha=v;if(alpha>=beta)return v}}
  return alpha}

 function chooseMove(v,seat,opts){
  opts=opts||{};
  if(!v||v.res||seat!==v.cur)return null;
  const rng=typeof opts.rng==='function'?opts.rng:Math.random;
  const lv=opts.level===1||opts.level===3?opts.level:2;
  const budget=typeof opts.budgetMs==='number'&&opts.budgetMs>=0?opts.budgetMs:({1:150,2:500,3:1500})[lv];
  const pos=posOfState(v),legal=legalInts(pos);
  if(!legal.length)return null;
  if(legal.length===1)return sqToObj(legal[0]);
  if(lv===1&&rng()<0.25)return sqToObj(legal[Math.floor(rng()*legal.length)]);
  const maxDepth=lv===1?2:lv===2?4:MAXPLY-8;
  const hs=new Int32Array(1024+v.hist.length+4);let base=0;
  for(let i=0;i<v.hist.length-1;i++)hs[base++]=hashOfKey(v.hist[i]);
  S={nodes:0,deadline:now()+budget,rng,base,hs,rootBest:0,pv:0,
   killers:Array.from({length:MAXPLY+8},()=>[0,0]),hist:new Int32Array(2*4096)};
  let best=legal[Math.floor(rng()*legal.length)],bestMove=null;
  try{
   for(let d=1;d<=maxDepth;d++){
    S.rootBest=0;
    const sc=search(pos,d,-INF,INF,0);
    if(S.rootBest){best=S.rootBest;S.pv=best;bestMove=best}
    if(sc>MATE-200||sc<-(MATE-200))break}
  }catch(e){if(e!==TIMEOUT)throw e;
   /* itération interrompue : on garde le résultat de la dernière itération complète (S.pv) */
   if(S.pv)best=S.pv;
   while(pos.sp>0){/* restaure la position (non utilisée ensuite) */pos.sp--}}
  void bestMove;S=null;
  return sqToObj(best)}

 return{id:'echecs',name:'Échecs',minPlayers:2,maxPlayers:2,init,turn,legalMoves,apply,result,view,chooseMove,notation,fen,fromFen,resign,perft,START_FEN}});
