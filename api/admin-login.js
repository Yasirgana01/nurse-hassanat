const {
  getRequiredEnv,
  json,
  methodNotAllowed,
  readJson,
  safeEqual,
  signToken,
  verifyToken,
} = require('./_security');
const { getDatabase } = require('./_firebase');
const { guardPublicEndpoint } = require('./_request-guard');

const MAX_ATTEMPTS = 8;
const WINDOW_MINUTES = 15;
const RATE_LIMIT_COLLECTION = 'admin_login_attempts';

function getClientId(req) {
  return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
}
function getAttemptDocument(clientId) {
  return getDatabase().collection(RATE_LIMIT_COLLECTION).doc(Buffer.from(clientId).toString('base64url'));
}
function isWindowExpired(row) {
  if (!row || !row.window_started_at) return true;
  const startedAt = new Date(row.window_started_at).getTime();
  return Number.isNaN(startedAt) || Date.now() - startedAt > WINDOW_MINUTES * 60 * 1000;
}
async function getAttemptRow(clientId) {
  const snapshot = await getAttemptDocument(clientId).get();
  return snapshot.exists ? snapshot.data() : null;
}
async function isRateLimited(clientId) {
  const row = await getAttemptRow(clientId);
  return row && !isWindowExpired(row) && Number(row.attempt_count) >= MAX_ATTEMPTS;
}
async function recordFailedAttempt(clientId) {
  const database = getDatabase();
  const document = getAttemptDocument(clientId);
  await database.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(document);
    const row = snapshot.exists ? snapshot.data() : null;
    const expired = isWindowExpired(row);
    const now = new Date().toISOString();
    transaction.set(document, {
      client_id: clientId,
      attempt_count: expired ? 1 : Number(row.attempt_count || 0) + 1,
      window_started_at: expired ? now : row.window_started_at,
      last_attempt_at: now,
    });
  });
}
async function clearFailedAttempts(clientId) {
  await getAttemptDocument(clientId).delete();
}

module.exports = async function handler(req, res) {
  if (!(await guardPublicEndpoint(req, res, { endpoint: 'admin-login', limit: 30, windowSeconds: 300 }))) return;
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
    const token = signToken({ role: 'nurse-admin', email: body.email || configuredEmail || 'nurse', exp: expiresAt });
    res.setHeader('Set-Cookie', `nurse_admin_session=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${60 * 60 * 8}`);
    return json(res, 200, { ok: true, expiresAt });
  } catch (error) {
    console.error('Login failed', error);
    return json(res, 500, { error: 'Login failed' });
  }
};
