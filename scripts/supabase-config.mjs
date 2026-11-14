// Résolution de la configuration Supabase publique (URL + clé publishable) pour le build.
// Sources, par priorité : variables d'environnement (Netlify), puis le fichier local js/supabase/config.js (ignoré par Git).
// Refuse toute clé secrète (sb_secret_… ou JWT service_role) : une telle clé ne doit jamais atteindre le navigateur.
const URL_RE = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i;

export function keyKind(key) {
  const k = String(key || '');
  if (/^sb_secret_/.test(k)) return 'secret';
  const m = k.match(/^[\w-]+\.([\w-]+)\.[\w-]+$/);
  if (m) {
    try { if (JSON.parse(Buffer.from(m[1], 'base64url').toString()).role === 'service_role') return 'secret'; } catch { return 'unknown'; }
  }
  return 'public';
}

const grab = (text, name) => { const m = String(text || '').match(new RegExp(name + "\\s*=\\s*(['\"])(.*?)\\1")); return m ? m[2] : ''; };

/** @returns {{url:string,key:string,source:'env'|'file'|'none',error?:string,warning?:string}} */
export function resolveConfig({ env = {}, fileText = null } = {}) {
  let url = String(env.NZASSA_SUPABASE_URL || '').trim(), key = String(env.NZASSA_SUPABASE_KEY || env.NZASSA_SUPABASE_PUBLISHABLE_KEY || '').trim(), source = 'env';
  if (!url && !key && fileText) { url = grab(fileText, 'NZASSA_SUPABASE_URL'); key = grab(fileText, 'NZASSA_SUPABASE_KEY'); source = 'file'; }
  if (!url && !key) {
    const onNetlify = env.NETLIFY === 'true' && env.NZASSA_ALLOW_NO_ACCOUNTS !== '1';
    return onNetlify
      ? { url: '', key: '', source: 'none', error: 'Configuration Supabase absente : définis NZASSA_SUPABASE_URL et NZASSA_SUPABASE_KEY (clé publishable) dans les variables d’environnement Netlify, ou NZASSA_ALLOW_NO_ACCOUNTS=1 pour publier sans comptes.' }
      : { url: '', key: '', source: 'none', warning: 'Configuration Supabase absente : le jeu sera publié sans comptes (mode invité uniquement).' };
  }
  if (!URL_RE.test(url)) return { url: '', key: '', source, error: 'NZASSA_SUPABASE_URL invalide : https://<projet>.supabase.co attendu.' };
  if (!key) return { url: '', key: '', source, error: 'Clé publique Supabase manquante.' };
  if (keyKind(key) === 'secret') return { url: '', key: '', source, error: 'Clé SECRÈTE détectée (sb_secret_… ou service_role) : refusée. N’utilise que la clé publishable/anon.' };
  return { url, key, source };
}

export function renderConfig({ url, key }) {
  return '/* Configuration publique de Supabase pour N\'Zassa (générée au build : ne pas modifier dans dist/) */\n' +
    'window.NZASSA_SUPABASE_URL = ' + JSON.stringify(url) + ';\nwindow.NZASSA_SUPABASE_KEY = ' + JSON.stringify(key) + ';\n';
}
