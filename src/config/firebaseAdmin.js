import admin from 'firebase-admin';
import env from './envConfig.js';

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: env.FIREBASE_PROJECT_ID,
      clientEmail: env.FIREBASE_CLIENT_EMAIL,
      privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
    storageBucket: `${env.FIREBASE_PROJECT_ID}.appspot.com`,
  });
}

const firebaseAdmin = admin;

export default firebaseAdmin;
