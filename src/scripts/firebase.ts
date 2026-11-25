import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type Auth,
  type User,
} from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

const apiKey = import.meta.env.PUBLIC_FIREBASE_API_KEY;
const authDomain = import.meta.env.PUBLIC_FIREBASE_AUTH_DOMAIN;
const projectId = import.meta.env.PUBLIC_FIREBASE_PROJECT_ID;
const appId = import.meta.env.PUBLIC_FIREBASE_APP_ID;

export const configured = Boolean(apiKey && authDomain && projectId && appId);

const app: FirebaseApp | null = configured
  ? initializeApp({
      apiKey,
      authDomain,
      projectId,
      appId,
      storageBucket: import.meta.env.PUBLIC_FIREBASE_STORAGE_BUCKET || undefined,
      messagingSenderId: import.meta.env.PUBLIC_FIREBASE_MESSAGING_SENDER_ID || undefined,
      measurementId: import.meta.env.PUBLIC_FIREBASE_MEASUREMENT_ID || undefined,
    })
  : null;

export const auth: Auth | null = app ? getAuth(app) : null;
export const db: Firestore | null = app ? getFirestore(app) : null;

const provider = new GoogleAuthProvider();

export function subscribeAuth(callback: (user: User | null) => void): () => void {
  if (!auth) {
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(auth, callback);
}

export async function loginWithGoogle() {
  if (!auth) throw new Error('FIREBASE_NOT_CONFIGURED');
  return signInWithPopup(auth, provider);
}

export async function logoutGoogle() {
  if (!auth) return;
  await signOut(auth);
}
