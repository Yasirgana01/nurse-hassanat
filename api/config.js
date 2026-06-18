const { json, methodNotAllowed } = require('./_security');

module.exports = function handler(req, res) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);

  return json(res, 200, {
    paystackPublicKey: process.env.PAYSTACK_PUBLIC_KEY || '',
  });
};
