import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getDatabase } from "firebase-admin/database";
import { readFileSync } from "fs";

export class FirebaseConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FirebaseConfigError";
  }
}

type ServiceJson = {
  project_id?: string;
  projectId?: string;
  client_email?: string;
  clientEmail?: string;
  private_key?: string;
  privateKey?: string;
};

function databaseUrl() {
  const url = process.env.FIREBASE_DATABASE_URL || process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;
  if (!url) {
    throw new FirebaseConfigError(
      "Set FIREBASE_DATABASE_URL to https://dire-express-default-rtdb.firebaseio.com."
    );
  }
  return url;
}

function serviceAccountJson(): ServiceJson {
  const inline = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
  const path = process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim();
  if (!inline && !path) {
    throw new FirebaseConfigError(
      "Set FIREBASE_SERVICE_ACCOUNT to the service account JSON (or FIREBASE_SERVICE_ACCOUNT_PATH). The Admin SDK is used for server reads the security rules do not allow, and for the one-off import."
    );
  }

  try {
    const raw = inline
      ? inline.startsWith("{")
        ? inline
        : Buffer.from(inline, "base64").toString("utf8")
      : readFileSync(path!, "utf8");
    return JSON.parse(raw) as ServiceJson;
  } catch {
    throw new FirebaseConfigError("FIREBASE_SERVICE_ACCOUNT is not valid JSON.");
  }
}

export function getAdminApp(): App {
  const existing = getApps()[0];
  if (existing) return existing;

  const json = serviceAccountJson();
  const projectId = json.projectId || json.project_id;
  const clientEmail = json.clientEmail || json.client_email;
  const privateKey = (json.privateKey || json.private_key || "").replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) {
    throw new FirebaseConfigError(
      "Service account JSON must include project_id, client_email, and private_key."
    );
  }

  return initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
    databaseURL: databaseUrl(),
  });
}

export function adminDb() {
  return getDatabase(getAdminApp());
}

export function adminAuth() {
  return getAuth(getAdminApp());
}

export async function isAdminUid(uid: string) {
  const snap = await adminDb().ref(`admins/${uid}`).get();
  return snap.val() === true;
}
