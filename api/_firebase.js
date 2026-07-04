const { cert, getApps, initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getRequiredEnv } = require('./_security');

function cleanEnv(value) {
  return String(value || '').replace(/^\uFEFF/, '').trim();
}

function getServiceAccount() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      return JSON.parse(cleanEnv(process.env.FIREBASE_SERVICE_ACCOUNT));
    } catch (error) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT must be valid JSON');
    }
  }

  return {
    projectId: cleanEnv(getRequiredEnv('FIREBASE_PROJECT_ID')),
    clientEmail: cleanEnv(getRequiredEnv('FIREBASE_CLIENT_EMAIL')),
    privateKey: cleanEnv(getRequiredEnv('FIREBASE_PRIVATE_KEY')).replace(/\\n/g, '\n'),
  };
}

function getDatabase() {
  const app = getApps()[0] || initializeApp({ credential: cert(getServiceAccount()) });
  return getFirestore(app);
}

module.exports = { getDatabase };
