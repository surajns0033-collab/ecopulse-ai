// src/firebase/config.js
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const apiKey = import.meta.env.VITE_FIREBASE_API_KEY || "demo-key";
export const isFirebaseConfigured = Boolean(
  apiKey && !apiKey.startsWith('your_') && !apiKey.includes('demo-') && !apiKey.includes('replace_with')
);

const firebaseConfig = {
  apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "echopulse-ai.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "echopulse-ai",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "echopulse-ai.appspot.com",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "000000000000",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:000000000000:web:0000000000000000"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export default app;
