const crypto = require('crypto');
const { json, methodNotAllowed, readJson, requireSameOrigin } = require('./_security');
const { getDatabase } = require('./_firebase');

const COLLECTION = 'bookings';
const ALLOWED_SERVICES = new Set([
  'Reproductive & Sexual Health Consultation',
  'Antenatal / Postnatal Guidance',
  'Family Planning Consultation',
  'Chronic Disease Management (Hypertension/Diabetes)',
  'Nutrition & Lifestyle Counselling',
  'Health Education Session (Group)',
  'Mental Health Session',
  'General Health Q&A',
]);
const ALLOWED_TYPES = new Set(['WhatsApp Chat', 'WhatsApp Video Call', 'Zoom Video Call', 'Phone Call']);

function cleanText(value, maxLength) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, maxLength);
}
function makeReference() {
  return `BK-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}
function isValidBookingReference(reference) {
  return typeof reference === 'string' && /^BK-[A-F0-9]{8}$/.test(reference);
}
function validateBooking(body) {
  const booking = {
    full_name: cleanText(body.name, 120),
    phone: cleanText(body.phone, 40),
    service: cleanText(body.service, 160),
    consultation_type: cleanText(body.type, 80),
    preferred_date: cleanText(body.date || 'Flexible', 40),
    preferred_time: cleanText(body.time || 'Flexible', 40),
    provider_preference: cleanText(body.gender || 'No preference', 80),
  };
  if (!booking.full_name) return { error: 'Name is required' };
  if (!booking.phone) return { error: 'Phone is required' };
  if (!ALLOWED_SERVICES.has(booking.service)) return { error: 'Invalid service' };
  if (!ALLOWED_TYPES.has(booking.consultation_type)) return { error: 'Invalid consultation type' };
  if (booking.preferred_date !== 'Flexible' && !/^\d{4}-\d{2}-\d{2}$/.test(booking.preferred_date)) {
    return { error: 'Invalid preferred date' };
  }
  return { booking };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'PATCH') return methodNotAllowed(res, ['POST', 'PATCH']);
  if (!requireSameOrigin(req, res)) return;

  try {
    const body = await readJson(req);
    const collection = getDatabase().collection(COLLECTION);

    if (req.method === 'PATCH') {
      const reference = cleanText(body.reference, 40);
      const paymentReference = cleanText(body.paymentReference, 120);
      if (!isValidBookingReference(reference)) return json(res, 400, { error: 'Invalid booking reference' });
      if (!paymentReference) return json(res, 400, { error: 'Payment reference is required' });

      const document = collection.doc(reference);
      const snapshot = await document.get();
      if (!snapshot.exists) return json(res, 404, { error: 'Booking not found' });
      const payment = {
        payment_status: 'paid',
        payment_reference: paymentReference,
        payment_verified_at: new Date().toISOString(),
      };
      await document.update(payment);
      return json(res, 200, { booking: { ...snapshot.data(), ...payment } });
    }

    const { booking, error } = validateBooking(body);
    if (error) return json(res, 400, { error });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const reference = makeReference();
      const record = {
        reference,
        ...booking,
        payment_status: body.paymentStatus === 'paid' ? 'paid' : 'pending',
        payment_reference: cleanText(body.paymentReference, 120) || null,
        payment_verified_at: body.paymentStatus === 'paid' ? new Date().toISOString() : null,
        created_at: new Date().toISOString(),
      };
      try {
        await collection.doc(reference).create(record);
        return json(res, 201, { booking: record });
      } catch (writeError) {
        if (writeError.code !== 6 && writeError.code !== 'already-exists') throw writeError;
      }
    }
    return json(res, 500, { error: 'Unable to create booking reference' });
  } catch (error) {
    console.error('Booking request failed', error);
    return json(res, 500, { error: 'Booking request failed' });
  }
};
