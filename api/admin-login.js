const {
  getRequiredEnv,
  json,
  methodNotAllowed,
  readJson,
  requireSameOrigin,
  safeEqual,
  signToken,
  verifyToken,
} = require('./_security');

const MAX_ATTEMPTS = 8;
const WINDOW_MINUTES = 15;
const RATE_LIMIT_TABLE = 'admin_login_attempts';

function getClientId(req) {
  return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
}

function getSupabaseHeaders() {
  const key = getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY');
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
}

function getSupabaseUrl(path = '') {
  return `${getRequiredEnv('SUPABASE_URL').replace(/\/$/, '')}/rest/v1/${RATE_LIMIT_TABLE}${path}`;
}

function isWindowExpired(row) {
  if (!row || !row.window_started_at) return true;
  const startedAt = new Date(row.window_started_at).getTime();
  return Number.isNaN(startedAt) || Date.now() - startedAt > WINDOW_MINUTES * 60 * 1000;
}

async function getAttemptRow(clientId) {
  const response = await fetch(getSupabaseUrl(`?client_id=eq.${encodeURIComponent(clientId)}&select=client_id,attempt_count,window_started_at&limit=1`), {
    headers: getSupabaseHeaders(),
  });
  if (!response.ok) throw new Error('Rate limit lookup failed');
  const rows = await response.json();
  return rows[0] || null;
}

async function isRateLimited(clientId) {
  const row = await getAttemptRow(clientId);
  return row && !isWindowExpired(row) && Number(row.attempt_count) >= MAX_ATTEMPTS;
}

async function recordFailedAttempt(clientId) {
  const row = await getAttemptRow(clientId);
  const expired = isWindowExpired(row);
  const nextCount = expired ? 1 : Number(row.attempt_count || 0) + 1;
  const now = new Date().toISOString();

  const response = await fetch(getSupabaseUrl('?on_conflict=client_id'), {
    method: 'POST',
    headers: {
      ...getSupabaseHeaders(),
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify({
      client_id: clientId,
      attempt_count: nextCount,
      window_started_at: expired ? now : row.window_started_at,
      last_attempt_at: now,
    }),
  });
  if (!response.ok) throw new Error('Rate limit update failed');
}

async function clearFailedAttempts(clientId) {
  const response = await fetch(getSupabaseUrl(`?client_id=eq.${encodeURIComponent(clientId)}`), {
    method: 'DELETE',
    headers: getSupabaseHeaders(),
  });
  if (!response.ok) throw new Error('Rate limit clear failed');
}

module.exports = async function handler(req, res) {
  if (!requireSameOrigin(req, res)) return;

  if (req.method === 'DELETE') {
    res.setHeader('Set-Cookie', 'nurse_admin_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0');
    return json(res, 200, { ok: true });
  }

  if (req.method !== 'POST') return methodNotAllowed(res, ['POST', 'DELETE']);

  try {
    const body = await readJson(req);
    const configuredEmail = process.env.NURSE_ADMIN_EMAIL || '';
    const configuredPassword = getRequiredEnv('NURSE_ADMIN_PASSWORD');
    const clientId = getClientId(req);

    if (body.checkSession) {
      const cookie = req.headers.cookie || '';
      const token = (cookie.match(/(?:^|;\s*)nurse_admin_session=([^;]+)/) || [])[1];
      const payload = verifyToken(token ? decodeURIComponent(token) : '');
      return json(res, payload ? 200 : 401, payload ? { ok: true } : { error: 'Session expired' });
    }

    const emailOk = configuredEmail ? safeEqual(body.email, configuredEmail) : true;
    const passwordOk = safeEqual(body.password, configuredPassword);
    if (await isRateLimited(clientId)) return json(res, 429, { error: 'Too many login attempts. Try again later.' });
    if (!emailOk || !passwordOk) {
      await recordFailedAttempt(clientId);
      return json(res, 401, { error: 'Invalid login credentials' });
    }

    await clearFailedAttempts(clientId);

    const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60 * 8;
    const token = signToken({
      role: 'nurse-admin',
      email: body.email || configuredEmail || 'nurse',
      exp: expiresAt,
    });

    res.setHeader(
      'Set-Cookie',
      `nurse_admin_session=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${60 * 60 * 8}`
    );

    return json(res, 200, { ok: true, expiresAt });
  } catch (error) {
    return json(res, 500, { error: 'Login failed' });
  }
};
