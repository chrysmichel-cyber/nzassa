/* Client Supabase de N'Zassa : créé une seule fois, avec persistance de session et rafraîchissement automatique des jetons.
   Ne démarre jamais avec une clé secrète : seule une clé publique (publishable / anon) est acceptée.
   Si la bibliothèque ou la configuration manque, le jeu continue en mode invité : root.supabaseClient vaut null et root.supabaseStatus explique pourquoi. */
(function (root, factory) {
    const m = factory();
    if (typeof module === 'object' && module.exports) module.exports = m;
    else {
        const r = m.init(root);
        root.supabaseClient = r.client;
        root.supabaseStatus = r.status;
    }
})(typeof window !== 'undefined' ? window : this, function () {
    'use strict';

    /* 'secret' : clé sb_secret_… ou JWT dont le rôle est service_role. 'public' sinon. */
    function keyKind(key) {
        const k = String(key || '');
        if (/^sb_secret_/.test(k)) return 'secret';
        const m = k.match(/^[\w-]+\.([\w-]+)\.[\w-]+$/);
        if (m) {
            try {
                const b = m[1].replace(/-/g, '+').replace(/_/g, '/');
                const json = typeof atob === 'function' ? atob(b + '==='.slice((b.length + 3) % 4)) : Buffer.from(b, 'base64').toString();
                if (JSON.parse(json).role === 'service_role') return 'secret';
            } catch (e) { return 'unknown'; }
        }
        return 'public';
    }

    function init(root) {
        const url = root.NZASSA_SUPABASE_URL, key = root.NZASSA_SUPABASE_KEY;
        if (!url || !key) return { client: null, status: 'not_configured' };
        if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(String(url))) return { client: null, status: 'bad_url' };
        if (keyKind(key) === 'secret') return { client: null, status: 'secret_key_refused' };
        if (!root.supabase || typeof root.supabase.createClient !== 'function') return { client: null, status: 'missing_library' };
        try {
            const client = root.supabase.createClient(url, key, {
                auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
            });
            return { client, status: 'ready' };
        } catch (e) {
            return { client: null, status: 'init_failed' };
        }
    }

    return { init, keyKind };
});
