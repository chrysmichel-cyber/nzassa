// Faux Supabase (GoTrue + REST) pour les tests navigateur : aucune requête ne part vers le vrai service. Partagé par accounts-flow.mjs et online-flow.mjs.
export const b64u = o => Buffer.from(JSON.stringify(o)).toString('base64url');
export const UID = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');

/* ---- faux Supabase (GoTrue + REST) ---- */
export function fakeSupabase() {
  const users = {}, reqs = [];let n = 0;
  const user = (u) => ({ id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, email_confirmed_at: '2026-11-01T00:00:00Z', phone: '', app_metadata: { provider: 'email' }, user_metadata: u.meta, identities: [{ identity_id: u.id, id: u.id, user_id: u.id, provider: 'email', identity_data: {} }], created_at: '2026-11-01T00:00:00Z', updated_at: '2026-11-01T00:00:00Z' });
  const session = u => ({ access_token: b64u({ alg: 'HS256', typ: 'JWT' }) + '.' + b64u({ sub: u.id, exp: Math.floor(Date.now() / 1000) + 3600, role: 'authenticated', aud: 'authenticated' }) + '.sig', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'r-' + u.id, user: user(u) });
  const json = (route, status, body) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  const handler = async route => {
    const q = route.request(), u = new URL(q.url()), body = q.postData() ? JSON.parse(q.postData()) : null, p = u.pathname;
    if (q.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    reqs.push({ method: q.method(), path: p + (u.search || ''), body });
    if (p === '/auth/v1/signup') {
      const email = body.email;
      if (users[email]) return json(route, 422, { code: 'user_already_exists', error_code: 'user_already_exists', msg: 'User already registered' });
      if ((body.data || {}).username === 'Pris') return json(route, 500, { code: 'unexpected_failure', msg: 'Database error saving new user' });
      const m = (body.data) || {};
      users[email] = { id: UID(++n), email, pw: body.password, meta: m };
      return json(route, 200, session(users[email]));
    }
    if (p === '/auth/v1/token') {
      const grant = u.searchParams.get('grant_type');
      if (grant === 'password') { const us = users[body.email]; return us && us.pw === body.password ? json(route, 200, session(us)) : json(route, 400, { code: 'invalid_credentials', error_code: 'invalid_credentials', msg: 'Invalid login credentials' }); }
      if (grant === 'refresh_token') { const us = Object.values(users).find(x => 'r-' + x.id === body.refresh_token); return us ? json(route, 200, session(us)) : json(route, 400, { code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' }); }
    }
    if (p === '/auth/v1/logout') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } });
    if (p === '/auth/v1/user') { const us = Object.values(users)[0]; return us ? json(route, 200, user(us)) : json(route, 401, { code: 'bad_jwt', msg: 'x' }); }
    if (p.startsWith('/rest/v1/rpc/nzassa_username_available')) return json(route, 200, !Object.values(users).some(x => (x.meta.username || '').toLowerCase() === String(body.p_username).toLowerCase()) && body.p_username !== 'Pris');
    if (p.startsWith('/rest/v1/')) return json(route, 200, []);
    return json(route, 404, {});
  };
  return { users, reqs, handler };
}

