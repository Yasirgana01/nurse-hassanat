const { getDatabase } = require('./_firebase');
const { verifyTransaction } = require('./_paystack');
const { guardPublicEndpoint } = require('./_request-guard');

function redirect(res, location) {
  res.statusCode = 302;
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Location', location);
  res.end();
}

module.exports = async function handler(req, res) {
  if (!(await guardPublicEndpoint(req, res, { endpoint: 'payment-callback', limit: 30, windowSeconds: 600 }))) return;
  if (req.method !== 'GET') {
    res.statusCode = 405;
    return res.end();
  }
  const bookingReference = String(req.query.booking || '').trim();
  const paymentReference = String(req.query.reference || req.query.trxref || '').trim();
  if (!/^BK-[A-F0-9]{8}$/.test(bookingReference) || !/^[A-Za-z0-9_.=-]{4,100}$/.test(paymentReference)) {
    return redirect(res, '/?payment=failed');
  }

  try {
    const document = getDatabase().collection('bookings').doc(bookingReference);
    const snapshot = await document.get();
    if (!snapshot.exists) return redirect(res, '/?payment=failed');
    const booking = snapshot.data();
    const transaction = await verifyTransaction(paymentReference, booking.service, bookingReference);
    await document.update({
      payment_status: 'paid',
      payment_reference: transaction.reference,
      payment_verified_at: new Date().toISOString(),
    });
    return redirect(res, `/?payment=success&booking=${encodeURIComponent(bookingReference)}`);
  } catch (error) {
    console.error('Payment callback failed', error);
    return redirect(res, `/?payment=failed&booking=${encodeURIComponent(bookingReference)}`);
  }
};
