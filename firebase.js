// firebase.js — inicjalizacja Firebase Admin SDK
const admin = require('firebase-admin');
require('dotenv').config();

// Inicjalizuj tylko raz
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId:   process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // Znaki \n w .env muszą zostać przekształcone w prawdziwe nowe linie
      privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

const db = admin.firestore();

module.exports = { db };
