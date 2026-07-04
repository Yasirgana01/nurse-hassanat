const { getRequiredEnv } = require('./_security');

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

async function paystackRequest(path, options = {}) {
  const response = await fetch(`https://api.paystack.co${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${getRequiredEnv('PAYSTACK_SECRET_KEY')}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.status || !result.data) throw new Error('Paystack request failed');
  return result.data;
}

async function verifyTransaction(reference, service, bookingReference) {
  const transaction = await paystackRequest(`/transaction/verify/${encodeURIComponent(reference)}`);
  const valid = transaction.status === 'success' &&
    transaction.currency === 'NGN' &&
    Number(transaction.amount) === getExpectedAmount(service) &&
    transaction.reference === reference &&
    transaction.metadata &&
    transaction.metadata.booking_reference === bookingReference;
  if (!valid) throw new Error('Payment verification failed');
  return transaction;
}

module.exports = { getExpectedAmount, paystackRequest, verifyTransaction };
