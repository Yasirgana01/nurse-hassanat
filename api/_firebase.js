const { cert, getApps, initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getRequiredEnv } = require('./_security');

function getServiceAccount() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } catch (error) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT must be valid JSON');
    }
  }

  return {
    projectId: getRequiredEnv('FIREBASE_PROJECT_ID'),
    clientEmail: getRequiredEnv('FIREBASE_CLIENT_EMAIL'),
    privateKey: getRequiredEnv('FIREBASE_PRIVATE_KEY').replace(/\\n/g, '\n'),
  };
}

function getDatabase() {
  const app = getApps()[0] || initializeApp({ credential: cert(getServiceAccount()) });
  return getFirestore(app);
}

module.exports = { getDatabase };
