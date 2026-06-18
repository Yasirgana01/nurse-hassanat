const { getRequiredEnv, json, methodNotAllowed, readJson, requireSameOrigin } = require('./_security');

const SERVICE_PRICES = {
  'Reproductive & Sexual Health Consultation': 5000,
  'Antenatal / Postnatal Guidance': 5000,
  'Family Planning Consultation': 5000,
  'Chronic Disease Management (Hypertension/Diabetes)': 5000,
  'Nutrition & Lifestyle Counselling': 5000,
  'Health Education Session (Group)': 12000,
  'Mental Health Session': 7000,
  'General Health Q&A': 5000,
};

function getExpectedAmount(service) {
  return (SERVICE_PRICES[service] || 5000) * 100;
}

function isValidReference(reference) {
  return typeof reference === 'string' && /^[A-Za-z0-9_.=-]{4,100}$/.test(reference);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  if (!requireSameOrigin(req, res)) return;

  try {
    const body = await readJson(req);
    const reference = String(body.reference || '').trim();
    const service = String(body.service || '').trim();

    if (!isValidReference(reference)) return json(res, 400, { error: 'Invalid payment reference' });
    if (!service) return json(res, 400, { error: 'Service is required' });

    const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${getRequiredEnv('PAYSTACK_SECRET_KEY')}`,
      },
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.status || !result.data) {
      return json(res, 400, { error: 'Payment could not be verified' });
    }

    const expectedAmount = getExpectedAmount(service);
    const transaction = result.data;
    const isVerified =
      transaction.status === 'success' &&
      transaction.currency === 'NGN' &&
      Number(transaction.amount) === expectedAmount &&
      transaction.reference === reference;

    if (!isVerified) return json(res, 400, { error: 'Payment verification failed' });

    return json(res, 200, {
      verified: true,
      reference: transaction.reference,
      amount: transaction.amount,
      currency: transaction.currency,
      paidAt: transaction.paid_at || transaction.paidAt || null,
    });
  } catch (error) {
    return json(res, 500, { error: 'Payment verification failed' });
  }
};
