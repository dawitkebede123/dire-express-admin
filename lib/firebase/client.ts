import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, onAuthStateChanged, signOut, type User } from "firebase/auth";
import { getDatabase } from "firebase/database";

export function firebasePublicConfig() {
  const config = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    ...(process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
      ? { messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID }
      : {}),
  };

  if (!config.apiKey || !config.authDomain || !config.databaseURL || !config.projectId || !config.appId) {
    throw new Error(
      "Missing NEXT_PUBLIC_FIREBASE_API_KEY, AUTH_DOMAIN, DATABASE_URL, PROJECT_ID, or APP_ID. Register a web app with `firebase apps:create web` and copy the SDK config."
    );
  }

  return config;
}

export function getClientApp(): FirebaseApp {
  if (getApps().length > 0) return getApp();
  return initializeApp(firebasePublicConfig());
}

export function getClientAuth() {
  return getAuth(getClientApp());
}

export function getClientDb() {
  return getDatabase(getClientApp());
}

export function waitForUser() {
  const auth = getClientAuth();
  if (auth.currentUser) return Promise.resolve(auth.currentUser);
  return new Promise<User>((resolve, reject) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      if (user) resolve(user);
      else reject(new Error("Sign in again to save this change."));
    });
  });
}

export async function endClientSession() {
  try {
    await signOut(getClientAuth());
  } catch {
    // The cookie is cleared by the caller even if Firebase persistence is empty.
  }
}
