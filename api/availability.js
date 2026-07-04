const {
  json,
  methodNotAllowed,
  readJson,
  requireAdmin,
  requireSameOrigin,
} = require('./_security');
const { getDatabase } = require('./_firebase');

const COLLECTION = 'nurse_availability';

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
  const snapshot = await getDatabase().collection(COLLECTION).orderBy('date').get();
  const availability = snapshot.docs.map((document) => document.data());
  return json(res, 200, { availability });
}

async function saveAvailability(req, res) {
  if (!requireAdmin(req, res)) return;

  const body = await readJson(req);
  if (!body.date || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
    return json(res, 400, { error: 'A valid date is required' });
  }
  if (!isValidStatus(body.status)) return json(res, 400, { error: 'Invalid status' });

  const timeSlots = body.status === 'available' ? normalizeTimeSlots(body.timeSlots) : [];
  const availability = {
    date: body.date,
    status: body.status,
    time_slots: timeSlots,
    updated_at: new Date().toISOString(),
  };
  await getDatabase().collection(COLLECTION).doc(body.date).set(availability);
  return json(res, 200, { availability });
}

async function deleteCollection(collection) {
  let snapshot = await collection.limit(400).get();
  while (!snapshot.empty) {
    const batch = collection.firestore.batch();
    snapshot.docs.forEach((document) => batch.delete(document.ref));
    await batch.commit();
    snapshot = await collection.limit(400).get();
  }
}

async function deleteAvailability(req, res) {
  if (!requireAdmin(req, res)) return;

  const body = await readJson(req);
  const collection = getDatabase().collection(COLLECTION);
  if (body.resetAll) {
    if (body.confirmReset !== 'RESET_AVAILABILITY') {
      return json(res, 400, { error: 'Reset confirmation is required' });
    }
    await deleteCollection(collection);
  } else if (body.date && /^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
    await collection.doc(body.date).delete();
  } else {
    return json(res, 400, { error: 'A valid date is required' });
  }

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
    console.error('Availability request failed', error);
    return json(res, 500, { error: 'Availability request failed' });
  }
};
