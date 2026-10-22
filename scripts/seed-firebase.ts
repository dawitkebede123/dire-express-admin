import "dotenv/config";
import { readFileSync } from "node:fs";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getDatabase } from "firebase-admin/database";
import { emailIndexHash } from "@/lib/login-index";

const DEFAULT_SETTINGS = {
  freeLoadLimit: 3,
  basePrice: 50,
  pricePerKm: 1,
};

function serviceAccount() {
  const inline = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
  const file = process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim();
  if (!inline && !file) {
    throw new Error("Set FIREBASE_SERVICE_ACCOUNT or FIREBASE_SERVICE_ACCOUNT_PATH.");
  }
  const raw = inline
    ? inline.startsWith("{")
      ? inline
      : Buffer.from(inline, "base64").toString("utf8")
    : readFileSync(file!, "utf8");
  const json = JSON.parse(raw) as {
    project_id?: string;
    projectId?: string;
    client_email?: string;
    clientEmail?: string;
    private_key?: string;
    privateKey?: string;
  };
  const projectId = json.projectId || json.project_id;
  const clientEmail = json.clientEmail || json.client_email;
  const privateKey = (json.privateKey || json.private_key || "").replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("Service account JSON is missing project_id, client_email, or private_key.");
  }
  return { projectId, clientEmail, privateKey };
}

async function main() {
  const databaseURL = process.env.FIREBASE_DATABASE_URL || process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;
  if (!databaseURL) throw new Error("Set FIREBASE_DATABASE_URL.");

  if (!getApps().length) {
    initializeApp({ credential: cert(serviceAccount()), databaseURL });
  }

  const db = getDatabase();
  const settings = await db.ref("settings").get();
  if (!settings.exists()) {
    await db.ref("settings").set({ ...DEFAULT_SETTINGS, updatedAt: Date.now() });
    console.log("Created /settings", DEFAULT_SETTINGS);
  } else {
    console.log("/settings already exists; left unchanged");
  }

  const email = (process.env.ADMIN_EMAIL || "admin@direexpress.com").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "";
  const name = process.env.ADMIN_NAME || "Admin";
  const phone = process.env.ADMIN_PHONE || "";
  const hash = await emailIndexHash(email);
  const indexed = (await db.ref(`loginIndex/${hash}/ADMIN`).get()).val();
  const authEmail = typeof indexed === "string" && indexed.includes("@") ? indexed : email;

  const auth = getAuth();
  let user;
  try {
    user = await auth.getUserByEmail(authEmail);
    console.log(`Auth user ${authEmail} already exists (${user.uid})`);
  } catch {
    if (!password) {
      throw new Error("Set ADMIN_PASSWORD to create the admin Auth user.");
    }
    user = await auth.createUser({
      email: authEmail,
      password,
      displayName: name,
      emailVerified: true,
    });
    console.log(`Created Auth user ${authEmail} (${user.uid})`);
  }

  await db.ref(`admins/${user.uid}`).set(true);
  const existing = ((await db.ref(`users/${user.uid}`).get()).val() ?? {}) as {
    name?: string;
    phone?: string;
    email?: string;
    role?: string;
    authEmail?: string;
    createdAt?: number;
  };
  if (existing.role && existing.role !== "ADMIN") {
    throw new Error(
      `${email} already belongs to a ${existing.role} profile. Refusing to mark that account as an admin.`
    );
  }
  const canonicalAuthEmail = user.email || existing.authEmail || authEmail;
  await db.ref(`users/${user.uid}`).update({
    name: existing.name || name,
    phone: existing.phone || phone,
    role: "ADMIN",
    email: existing.email || email,
    authEmail: canonicalAuthEmail,
    createdAt: existing.createdAt || Date.now(),
  });
  await db.ref(`loginIndex/${hash}/ADMIN`).set(canonicalAuthEmail);
  console.log(`Seeded /admins/${user.uid} = true`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
