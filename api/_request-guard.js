const crypto = require('crypto');
const { getDatabase } = require('./_firebase');
const { json, requireSameOrigin } = require('./_security');

const COLLECTION = 'api_rate_limits';

function getClientId(req) {
  return String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
}

function getDocumentId(endpoint, clientId) {
  return crypto.createHash('sha256').update(`${endpoint}:${clientId}`).digest('hex');
}

async function enforceRateLimit(req, res, { endpoint, limit, windowSeconds }) {
  const database = getDatabase();
  const document = database.collection(COLLECTION).doc(getDocumentId(endpoint, getClientId(req)));
  const now = Date.now();

  const result = await database.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(document);
    const current = snapshot.exists ? snapshot.data() : null;
    const expired = !current || Number(current.reset_at || 0) <= now;
    const count = expired ? 1 : Number(current.count || 0) + 1;
    const resetAt = expired ? now + windowSeconds * 1000 : Number(current.reset_at);

    transaction.set(document, {
      endpoint,
      count,
      reset_at: resetAt,
      expires_at: new Date(resetAt + 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date(now).toISOString(),
    });
    return { allowed: count <= limit, remaining: Math.max(0, limit - count), resetAt };
  });

  res.setHeader('RateLimit-Limit', String(limit));
  res.setHeader('RateLimit-Remaining', String(result.remaining));
  res.setHeader('RateLimit-Reset', String(Math.ceil(result.resetAt / 1000)));
  if (result.allowed) return true;

  res.setHeader('Retry-After', String(Math.max(1, Math.ceil((result.resetAt - now) / 1000))));
  json(res, 429, { error: 'Too many requests. Please try again later.' });
  return false;
}

async function guardPublicEndpoint(req, res, options) {
  if (!requireSameOrigin(req, res)) return false;
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return false;
  }

  try {
    return await enforceRateLimit(req, res, options);
  } catch (error) {
    console.error('Rate limit check failed', error);
    json(res, 503, { error: 'Service temporarily unavailable' });
    return false;
  }
}

module.exports = { guardPublicEndpoint };
