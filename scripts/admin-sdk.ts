import { readFileSync } from "node:fs";
import { cert, getApps, initializeApp } from "firebase-admin/app";

function serviceAccount() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT?.trim()) {
    console.warn(
      "FIREBASE_SERVICE_ACCOUNT is ignored. Set FIREBASE_SERVICE_ACCOUNT_PATH to a JSON file."
    );
  }
  const file =
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim() ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (!file) {
    throw new Error(
      "Set FIREBASE_SERVICE_ACCOUNT_PATH to the service account JSON file. These scripts run on your machine and are not part of the hosted app."
    );
  }

  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch {
    throw new Error(`Could not read the service account file at ${file}.`);
  }

  let json: {
    project_id?: string;
    projectId?: string;
    client_email?: string;
    clientEmail?: string;
    private_key?: string;
    privateKey?: string;
  };
  try {
    json = JSON.parse(raw) as typeof json;
  } catch {
    throw new Error(`Service account file at ${file} is not valid JSON.`);
  }

  const projectId = json.projectId || json.project_id;
  const clientEmail = json.clientEmail || json.client_email;
  const privateKey = (json.privateKey || json.private_key || "").replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("Service account JSON is missing project_id, client_email, or private_key.");
  }
  return { projectId, clientEmail, privateKey };
}

export function initAdminApp() {
  const databaseURL = process.env.FIREBASE_DATABASE_URL || process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;
  if (!databaseURL) throw new Error("Set FIREBASE_DATABASE_URL.");
  if (!getApps().length) {
    initializeApp({ credential: cert(serviceAccount()), databaseURL });
  }
}
