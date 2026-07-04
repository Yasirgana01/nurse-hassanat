const { getDatabase } = require('./_firebase');
const { json, methodNotAllowed, readJson } = require('./_security');
const { getExpectedAmount, paystackRequest } = require('./_paystack');
const { guardPublicEndpoint } = require('./_request-guard');

function getOrigin(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  return `${proto}://${host}`;
}

module.exports = async function handler(req, res) {
  if (!(await guardPublicEndpoint(req, res, { endpoint: 'initialize-payment', limit: 10, windowSeconds: 600 }))) return;
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);

  try {
    const body = await readJson(req);
    const bookingReference = String(body.bookingReference || '').trim();
    if (!/^BK-[A-F0-9]{8}$/.test(bookingReference)) {
      return json(res, 400, { error: 'Invalid booking reference' });
    }

    const bookingSnapshot = await getDatabase().collection('bookings').doc(bookingReference).get();
    if (!bookingSnapshot.exists) return json(res, 404, { error: 'Booking not found' });
    const booking = bookingSnapshot.data();
    if (booking.payment_status === 'paid') return json(res, 409, { error: 'Booking is already paid' });

    const callbackUrl = `${getOrigin(req)}/api/payment-callback?booking=${encodeURIComponent(bookingReference)}`;
    const transaction = await paystackRequest('/transaction/initialize', {
      method: 'POST',
      body: JSON.stringify({
        email: `booking-${bookingReference.toLowerCase()}@nursehassanat.com`,
        amount: getExpectedAmount(booking.service),
        currency: 'NGN',
        reference: `NH-${bookingReference.slice(3)}-${Date.now()}`,
        callback_url: callbackUrl,
        metadata: { booking_reference: bookingReference },
      }),
    });

    return json(res, 200, { authorizationUrl: transaction.authorization_url });
  } catch (error) {
    console.error('Payment initialization failed', error);
    return json(res, 500, { error: 'Unable to initialize payment' });
  }
};
