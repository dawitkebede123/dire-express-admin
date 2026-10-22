import "dotenv/config";
import { getAuth } from "firebase-admin/auth";
import { getDatabase } from "firebase-admin/database";
import { emailIndexHash } from "@/lib/login-index";
import { initAdminApp } from "./admin-sdk";

const DEFAULT_SETTINGS = {
  freeLoadLimit: 3,
  basePrice: 50,
  pricePerKm: 1,
};

function requestedRole() {
  const role = (process.env.ADMIN_ROLE || "superadmin").trim().toLowerCase();
  if (role !== "admin" && role !== "superadmin") {
    throw new Error("ADMIN_ROLE must be admin or superadmin.");
  }
  return role;
}

async function main() {
  initAdminApp();
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
  const createdAt = existing.createdAt || Date.now();
  await db.ref(`users/${user.uid}`).update({
    name: existing.name || name,
    phone: existing.phone || phone,
    role: "ADMIN",
    email: existing.email || email,
    authEmail: canonicalAuthEmail,
    createdAt,
  });

  const existingProfile = ((await db.ref(`adminUsers/${user.uid}`).get()).val() ?? {}) as {
    name?: string;
    email?: string;
    phone?: string;
    role?: string;
    createdAt?: number;
  };
  const role =
    existingProfile.role === "superadmin" || existingProfile.role === "admin"
      ? existingProfile.role
      : requestedRole();
  const profilePhone = existingProfile.phone || existing.phone || phone;
  await db.ref(`adminUsers/${user.uid}`).set({
    name: existingProfile.name || existing.name || name,
    email: existingProfile.email || existing.email || email,
    ...(profilePhone ? { phone: profilePhone } : {}),
    role,
    active: true,
    createdAt: existingProfile.createdAt || createdAt,
  });

  await db.ref(`loginIndex/${hash}/ADMIN`).set(canonicalAuthEmail);
  console.log(`Seeded admins/${user.uid} = true and adminUsers/${user.uid} (${role}, active)`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
