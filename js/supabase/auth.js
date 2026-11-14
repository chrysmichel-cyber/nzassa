/* Adaptateur Supabase Auth de N'Zassa.
   - L'identifiant de connexion est l'ADRESSE E-MAIL ; le pseudo est un nom public transmis en métadonnées, jamais transformé en adresse.
   - Le profil est créé côté base par l'UNIQUE déclencheur on_auth_user_created_nzassa (public.handle_new_nzassa_user()),
     qui lit username, display_name et recovery_email. Le client n'écrit jamais dans profiles à l'inscription et n'envoie pas username_key.
   - Aucun rôle, aucune clé secrète : tout passe par la clé publique et les règles RLS.
   - Les méthodes ne lèvent pas d'exception : elles renvoient {ok:true,…} ou {ok:false,error:<code>} ; les codes sont traduits en messages par l'interface. */
(function (root, factory) {
    const m = factory();
    if (typeof module === 'object' && module.exports) module.exports = m;
    else { root.LCA = root.LCA || {}; root.LCA.supabaseAuth = m; }
})(typeof window !== 'undefined' ? window : this, function () {
    'use strict';

    /* Traduit une erreur Supabase en code stable. Jamais de message brut : il peut contenir l'adresse saisie. */
    function normalizeError(error) {
        if (!error) return 'unknown';
        const code = String(error.code || '').toLowerCase();
        const msg = String(error.message || '').toLowerCase();
        const status = error.status;
        if (error.name === 'AuthRetryableFetchError' || status === 0 || /failed to fetch|networkerror|load failed|network request failed/.test(msg)) return 'offline';
        if (code === 'user_already_exists' || code === 'email_exists' || /already (been )?registered|already exists/.test(msg)) return 'email_taken';
        if (code === 'weak_password' || /password (is )?(too )?(short|weak)|at least \d+ characters/.test(msg)) return 'weak_password';
        if (code === 'invalid_credentials' || /invalid login credentials/.test(msg)) return 'bad_credentials';
        if (code === 'email_not_confirmed' || /email not confirmed/.test(msg)) return 'email_not_confirmed';
        if (code.indexOf('rate_limit') > -1 || code.indexOf('over_') === 0 || /rate limit|too many/.test(msg) || status === 429) return 'rate_limited';
        if (code === 'signup_disabled' || /signups? (are |is )?not allowed|signup is disabled/.test(msg)) return 'signup_disabled';
        if (code === 'email_address_invalid' || /invalid email|unable to validate email/.test(msg)) return 'invalid_email';
        if (/database error saving new user/.test(msg) || (code === 'unexpected_failure' && status === 500)) return 'profile_error';
        if (code === 'session_not_found' || code === 'refresh_token_not_found' || /refresh token|session (not found|missing)/.test(msg)) return 'session_expired';
        return 'unknown';
    }

    function mapUser(u) {
        if (!u) return null;
        const meta = u.user_metadata || {};
        return {
            id: u.id,
            email: u.email || '',
            pseudo: typeof meta.username === 'string' ? meta.username : '',
            created: u.created_at ? new Date(u.created_at).getTime() : Date.now()
        };
    }

    function create(options) {
        options = options || {};
        const client = options.client;
        const rules = options.pseudo || (typeof window !== 'undefined' && window.LCA && window.LCA.pseudo);
        const log = typeof options.log === 'function' ? options.log : function () {};
        if (!client || !client.auth || !rules) return null;

        const fail = (error, where) => {
            const code = normalizeError(error);
            log(where, code, error && error.status);
            return { ok: false, error: code };
        };

        return {
            enabled: () => true,

            /* Inscription. Vérifie les mêmes règles que l'interface, puis laisse Supabase créer l'utilisateur ;
               le déclencheur crée le profil. Renvoie pending:'confirm_email' si le projet exige la confirmation de l'adresse. */
            async signUp(f) {
                f = f || {};
                const bad = rules.checkSignup({ pseudo: f.pseudo, email: f.email, password: f.password, confirm: f.password, consent: f.consent });
                if (bad) return { ok: false, error: bad.field === 'pseudo' ? 'invalid_username' : bad.field === 'email' ? 'invalid_email' : bad.field === 'password' ? 'weak_password' : 'consent_required', field: bad.field, detail: bad.error };
                try {
                    const { data, error } = await client.auth.signUp({
                        email: f.email.trim().toLowerCase(),
                        password: f.password,
                        options: { data: { username: f.pseudo, display_name: f.pseudo, recovery_email: null } }
                    });
                    if (error) return fail(error, 'signUp');
                    const u = data && data.user;
                    if (!u) return { ok: false, error: 'unknown' };
                    /* adresse déjà inscrite quand la confirmation par e-mail est active : Supabase renvoie un utilisateur sans identité */
                    if (Array.isArray(u.identities) && u.identities.length === 0) return { ok: false, error: 'email_taken' };
                    if (!data.session) return { ok: true, pending: 'confirm_email', user: mapUser(u) };
                    return { ok: true, user: mapUser(u) };
                } catch (e) { return fail(e, 'signUp'); }
            },

            async signIn(f) {
                f = f || {};
                const bad = rules.checkEmail(f.email);
                if (bad) return { ok: false, error: 'invalid_email' };
                if (typeof f.password !== 'string' || !f.password) return { ok: false, error: 'bad_credentials' };
                try {
                    const { data, error } = await client.auth.signInWithPassword({ email: f.email.trim().toLowerCase(), password: f.password });
                    if (error) return fail(error, 'signIn');
                    return { ok: true, user: mapUser(data.user) };
                } catch (e) { return fail(e, 'signIn'); }
            },

            /* Déconnexion locale (toujours effective, même sans réseau). */
            async signOut() {
                try {
                    const { error } = await client.auth.signOut({ scope: 'local' });
                    if (error) return fail(error, 'signOut');
                    return { ok: true };
                } catch (e) { return fail(e, 'signOut'); }
            },

            /* Restauration de session au démarrage : lit la session persistée, la rafraîchit si besoin. user:null = pas de session. */
            async restore() {
                try {
                    const { data, error } = await client.auth.getSession();
                    if (error) return fail(error, 'restore');
                    return { ok: true, user: data && data.session ? mapUser(data.session.user) : null };
                } catch (e) { return fail(e, 'restore'); }
            },

            /* Jeton d'accès courant (renouvelé par la bibliothèque s'il a expiré), à envoyer au serveur temps réel qui le fait valider par Supabase.
               Renvoie {token,userId} ou null. Jamais journalisé, jamais stocké ailleurs que par la bibliothèque. */
            async accessToken() {
                try {
                    const { data, error } = await client.auth.getSession();
                    if (error || !data || !data.session || !data.session.access_token) return null;
                    return { token: data.session.access_token, userId: data.session.user && data.session.user.id };
                } catch (e) { return null; }
            },

            /* Abonnement aux changements (connexion, déconnexion, jeton rafraîchi). cb(event, user|null). Ne pas appeler Supabase dans cb. */
            onChange(cb) {
                const r = client.auth.onAuthStateChange((event, session) => { try { cb(event, session ? mapUser(session.user) : null); } catch (e) { log('onChange', 'callback', 0); } });
                const sub = r && r.data && r.data.subscription;
                return () => { if (sub && sub.unsubscribe) sub.unsubscribe(); };
            },

            /* true / false si la fonction SQL de disponibilité existe ; null si elle est absente (la base reste juge à l'inscription). */
            async isPseudoAvailable(pseudo) {
                try {
                    const { data, error } = await client.rpc('nzassa_username_available', { p_username: pseudo });
                    if (error || typeof data !== 'boolean') return null;
                    return data;
                } catch (e) { return null; }
            },

            /* Nom d'affichage du profil de l'utilisateur connecté (RLS : uniquement sa propre ligne). */
            async updateDisplayName(name) {
                try {
                    const { data, error: ae } = await client.auth.getUser();
                    if (ae) return fail(ae, 'getUser');
                    if (!data || !data.user) return { ok: false, error: 'session_expired' };
                    const { error } = await client.from('profiles').update({ display_name: String(name || '').slice(0, 40) }).eq('id', data.user.id);
                    if (error) return fail(error, 'updateDisplayName');
                    return { ok: true };
                } catch (e) { return fail(e, 'updateDisplayName'); }
            },

            /* Suppression du compte : exige la fonction SQL delete_my_account() (voir supabase/02_suppression_compte.sql, à valider avant exécution). */
            async deleteAccount() {
                try {
                    const { error } = await client.rpc('delete_my_account');
                    if (error) {
                        const missing = error.code === 'PGRST202' || error.status === 404 || /could not find the function/i.test(String(error.message || ''));
                        return missing ? { ok: false, error: 'delete_unavailable' } : fail(error, 'deleteAccount');
                    }
                    await client.auth.signOut({ scope: 'local' });
                    return { ok: true };
                } catch (e) { return fail(e, 'deleteAccount'); }
            }
        };
    }

    return { create, normalizeError, mapUser };
});
