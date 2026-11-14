/* IP du client et confiance accordée aux proxys. Isolé pour être testé.
   Règle de sécurité : X-Forwarded-For est un en-tête que n'importe quel client peut écrire. Il n'est donc lu QUE si la connexion TCP vient d'un proxy
   EXPLICITEMENT APPROUVÉ (liste trustedProxies : adresses, plages CIDR, ou mots-clés « loopback » / « private »). Dans ce cas seule la part ajoutée par
   nos proxys (les `hops` entrées de DROITE) est crue ; tout ce qui est à gauche vient du client et est ignoré.
   Pas de liste (ou connexion venant d'une adresse non approuvée) → X-Forwarded-For est ignoré en bloc. */
'use strict';

const PRESETS={loopback:['127.0.0.0/8','::1/128'],private:['10.0.0.0/8','172.16.0.0/12','192.168.0.0/16','fc00::/7','fe80::/10']};

/* Adresse → BigInt + famille (4 ou 6). Les adresses IPv4 « mappées » (::ffff:a.b.c.d) sont ramenées en IPv4. */
function parseIp(s){
 s=String(s||'').trim().replace(/^\[|\]$/g,'').replace(/%.*$/,'');
 const m=/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(s);if(m)s=m[1];
 if(/^\d+\.\d+\.\d+\.\d+$/.test(s)){const p=s.split('.').map(Number);if(p.some(n=>n>255))return null;return {v:4,n:p.reduce((a,b)=>(a<<8n)|BigInt(b),0n)}}
 if(!/^[0-9a-f:]+$/i.test(s)||!s.includes(':'))return null;
 let [h,t]=s.split('::');if(s.split('::').length>2)return null;
 const a=h?h.split(':'):[],b=t!==undefined&&t!==''?t.split(':'):[];
 if(t===undefined&&a.length!==8)return null;
 const mid=t===undefined?[]:Array(8-a.length-b.length).fill('0');if(mid.length<0)return null;
 const all=[...a,...mid,...b];if(all.length!==8||all.some(x=>!/^[0-9a-f]{1,4}$/i.test(x)))return null;
 return {v:6,n:all.reduce((x,y)=>(x<<16n)|BigInt(parseInt(y,16)),0n)}}

function parseRule(r){
 r=String(r).trim();if(PRESETS[r.toLowerCase()])return PRESETS[r.toLowerCase()].flatMap(parseRule);
 const [ip,len]=r.split('/'),p=parseIp(ip);if(!p)return [];
 const max=p.v===4?32:128,bits=len===undefined?max:Number(len);if(!Number.isInteger(bits)||bits<0||bits>max)return [];
 return [{v:p.v,bits,max,n:p.n}]}
/* Compile une liste (tableau ou texte séparé par des virgules) en prédicat « cette adresse est-elle un proxy approuvé ? ». */
function trustList(list){
 const rules=(Array.isArray(list)?list:String(list||'').split(',')).filter(x=>String(x).trim()).flatMap(parseRule);
 return ip=>{const p=parseIp(ip);if(!p)return false;return rules.some(r=>r.v===p.v&&(p.n>>BigInt(r.max-r.bits))===(r.n>>BigInt(r.max-r.bits)))}}

/* o = {trustedProxies: tableau|texte, hops: nombre d'entrées de droite ajoutées par nos proxys (défaut 1)} */
function clientIp(req,o){
 o=o||{};const raw=(req.socket&&req.socket.remoteAddress)||'?';
 const trusted=o.trusted||(o.trustedProxies?trustList(o.trustedProxies):null);
 if(!trusted||!trusted(raw))return raw;
 const hops=Math.max(1,Math.floor(+o.hops||1));
 const xs=String(req.headers['x-forwarded-for']||'').split(',').map(s=>s.trim()).filter(Boolean);
 if(xs.length<hops)return raw;
 const ip=xs[xs.length-hops];return parseIp(ip)?ip:raw}
module.exports={clientIp,trustList,parseIp,PRESETS};
