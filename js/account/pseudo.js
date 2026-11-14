/* Règles du pseudo public et validations d'inscription : une seule source de vérité, identique en JavaScript et en PostgreSQL
   (voir supabase/01_pseudo_et_verifications.sql, qui reprend exactement ces règles).
   Principe : la valeur saisie est conservée TELLE QUELLE (casse, accents, « _ »). Si elle ne respecte pas les règles, elle est REFUSÉE
   avec une raison précise ; elle n'est jamais « nettoyée » en silence. Module pur (navigateur + Node). */
(function(root,factory){const m=factory();if(typeof module==='object'&&module.exports)module.exports=m;else{root.LCA=root.LCA||{};root.LCA.pseudo=m}})(typeof window!=='undefined'?window:this,function(){
'use strict';

const MIN=2,MAX=40,EMAIL_MAX=254,PW_MIN=8,PW_MAX_BYTES=72;
/* Interdits : caractères de contrôle, caractères invisibles ou de direction du texte (usurpation), et < > & " \ / @ (balisage, chemins, adresses).
   L'apostrophe, le point, le tiret, le tiret bas, les accents, les lettres de toutes écritures et les chiffres restent permis. */
const BAD=/[\u0000-\u001F\u007F-\u009F\u00AD\u200B-\u200F\u2028-\u202E\u2060-\u2064\uFEFF<>&"\\\/@]/;
const SP=/\s/;

const len=s=>Array.from(String(s)).length;

/* Renvoie null si le pseudo est valide, sinon un code d'erreur : type, short, long, edge_space, double_space, space_kind, chars. */
function checkPseudo(v){
 if(typeof v!=='string')return 'type';
 const n=len(v);
 if(n<MIN)return 'short';
 if(n>MAX)return 'long';
 if(BAD.test(v))return 'chars';
 if(SP.test(v[0])||SP.test(v[v.length-1]))return 'edge_space';
 if(/\s/.test(v.replace(/ /g,'')))return 'space_kind';
 if(/ {2,}/.test(v))return 'double_space';
 return null;
}
/* Clé de comparaison insensible à la casse (affichage et tests locaux ; l'unicité réelle est garantie par la colonne générée username_key). */
const sameName=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();

const EMAIL_RE=/^[^\s@<>"\\]+@[^\s@<>"\\]+\.[^\s@<>"\\]{2,}$/;
function checkEmail(v){
 if(typeof v!=='string')return 'type';
 const e=v.trim();
 if(!e)return 'required';
 if(e.length>EMAIL_MAX||!EMAIL_RE.test(e))return 'invalid';
 return null;
}
/* Mot de passe : 8 caractères au moins ; 72 octets au plus (limite de bcrypt utilisée par Supabase Auth). Jamais modifié, jamais journalisé. */
function checkPassword(v){
 if(typeof v!=='string'||!v)return 'required';
 if(len(v)<PW_MIN)return 'short';
 const bytes=typeof TextEncoder!=='undefined'?new TextEncoder().encode(v).length:unescape(encodeURIComponent(v)).length;
 if(bytes>PW_MAX_BYTES)return 'long';
 return null;
}
/* Toutes les vérifications d'une inscription, dans l'ordre d'affichage. Renvoie null ou {field,error}. */
function checkSignup(f){
 f=f||{};
 let e=checkPseudo(f.pseudo);if(e)return {field:'pseudo',error:e};
 e=checkEmail(f.email);if(e)return {field:'email',error:e};
 e=checkPassword(f.password);if(e)return {field:'password',error:e};
 if(f.password!==f.confirm)return {field:'confirm',error:'mismatch'};
 if(f.consent!==true)return {field:'consent',error:'required'};
 return null;
}
return {MIN,MAX,EMAIL_MAX,PW_MIN,PW_MAX_BYTES,checkPseudo,checkEmail,checkPassword,checkSignup,sameName,len};
});
