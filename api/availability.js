const {
  getRequiredEnv,
  json,
  methodNotAllowed,
  readJson,
  requireAdmin,
  requireSameOrigin,
} = require('./_security');

const TABLE = 'nurse_availability';

function getSupabaseHeaders() {
  const key = getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY');
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
}

function getSupabaseUrl(path = '') {
  return `${getRequiredEnv('SUPABASE_URL').replace(/\/$/, '')}/rest/v1/${TABLE}${path}`;
}

function isValidStatus(status) {
  return status === 'available' || status === 'unavailable';
}

function normalizeTimeSlots(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((slot) => String(slot).trim().toLowerCase().replace(/\s+/g, '').replace(/^0(\d)/, '$1').replace(':00am', 'am').replace(':00pm', 'pm'))
    .filter(Boolean)
    .slice(0, 12);
}

async function getAvailability(res) {
  const response = await fetch(getSupabaseUrl('?select=date,status,time_slots&order=date.asc'), {
    headers: getSupabaseHeaders(),
  });

  if (!response.ok) return json(res, response.status, { error: 'Unable to load availability' });
  const data = await response.json();
  return json(res, 200, { availability: data });
}

async function saveAvailability(req, res) {
  if (!requireAdmin(req, res)) return;

  const body = await readJson(req);
  if (!body.date || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
    return json(res, 400, { error: 'A valid date is required' });
  }
  if (!isValidStatus(body.status)) return json(res, 400, { error: 'Invalid status' });

  const timeSlots = body.status === 'available' ? normalizeTimeSlots(body.timeSlots) : [];
  const response = await fetch(getSupabaseUrl('?on_conflict=date'), {
    method: 'POST',
    headers: {
      ...getSupabaseHeaders(),
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify({
      date: body.date,
      status: body.status,
      time_slots: timeSlots,
    }),
  });

  if (!response.ok) return json(res, response.status, { error: 'Unable to save availability' });
  const data = await response.json();
  return json(res, 200, { availability: data[0] || null });
}

async function deleteAvailability(req, res) {
  if (!requireAdmin(req, res)) return;

  const body = await readJson(req);
  let path = '';
  if (body.resetAll) {
    if (body.confirmReset !== 'RESET_AVAILABILITY') {
      return json(res, 400, { error: 'Reset confirmation is required' });
    }
    path = '?date=neq.0001-01-01';
  } else if (body.date && /^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
    path = `?date=eq.${encodeURIComponent(body.date)}`;
  } else {
    return json(res, 400, { error: 'A valid date is required' });
  }

  const response = await fetch(getSupabaseUrl(path), {
    method: 'DELETE',
    headers: getSupabaseHeaders(),
  });

  if (!response.ok) return json(res, response.status, { error: 'Unable to clear availability' });
  return json(res, 200, { ok: true });
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'GET') return getAvailability(res);
    if (!requireSameOrigin(req, res)) return;
    if (req.method === 'POST') return saveAvailability(req, res);
    if (req.method === 'DELETE') return deleteAvailability(req, res);
    return methodNotAllowed(res, ['GET', 'POST', 'DELETE']);
  } catch (error) {
    return json(res, 500, { error: 'Availability request failed' });
  }
};
