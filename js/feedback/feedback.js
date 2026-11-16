/* Avis des visiteurs : vérification du formulaire « Donner mon avis » et envoi dans la table Supabase avis_visiteurs
   (voir supabase/06_avis_visiteurs.sql). Seule la clé publique est utilisée : la RLS permet d'envoyer un avis, jamais de relire ceux des autres.
   Les méthodes ne lèvent pas d'exception : elles renvoient {ok:true} ou {ok:false,error:<code>}. */
(function (root, factory) {
    const m = factory();
    if (typeof module === 'object' && module.exports) module.exports = m;
    else { root.LCA = root.LCA || {}; root.LCA.feedback = m; }
})(typeof window !== 'undefined' ? window : this, function () {
    'use strict';

    const LIMITS = { aime: 1000, ameliorer: 1000, nom: 60, email: 120, langue_jeu: 40 };
    const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

    /* Retire les caractères de contrôle (sauf retours à la ligne) et les espaces en bord. */
    const tidy = s => String(s == null ? '' : s).replace(/[\u0000-\u0009\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();

    /* Renvoie {row} prêt à insérer, ou {error:'note'|'texte'|'email'|'long'}. */
    function check(f) {
        f = f || {};
        const note = Number(f.note);
        if (!Number.isInteger(note) || note < 1 || note > 5) return { error: 'note' };
        const row = { note };
        for (const k of Object.keys(LIMITS)) {
            const v = tidy(f[k]);
            if (v.length > LIMITS[k]) return { error: 'long', field: k };
            row[k] = v || null;
        }
        if (!row.aime && !row.ameliorer) return { error: 'texte' };
        if (row.email && !EMAIL.test(row.email)) return { error: 'email' };
        return { row };
    }

    async function send(client, f) {
        const c = check(f);
        if (c.error) return { ok: false, error: c.error, field: c.field };
        if (!client || typeof client.from !== 'function') return { ok: false, error: 'not_configured' };
        try {
            const { error } = await client.from('avis_visiteurs').insert(c.row);
            if (!error) return { ok: true };
            const msg = String(error.message || '').toLowerCase();
            if (error.status === 0 || /failed to fetch|networkerror|load failed/.test(msg)) return { ok: false, error: 'offline' };
            if (error.code === '42P01' || error.code === 'PGRST205' || error.status === 404) return { ok: false, error: 'not_configured' };
            return { ok: false, error: 'refused' };
        } catch (e) { return { ok: false, error: 'offline' }; }
    }

    return { check, send, LIMITS };
});
