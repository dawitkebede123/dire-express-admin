"use client";

import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { get, ref } from "firebase/database";
import { getClientAuth, getClientDb } from "@/lib/firebase/client";
import { emailIndexHash } from "@/lib/login-index";
import { NOT_AN_ADMIN, readDashboardAdmin } from "@/lib/rtdb/admin-access";

async function authEmailFor(email: string) {
  try {
    const hash = await emailIndexHash(email);
    const snap = await get(ref(getClientDb(), `loginIndex/${hash}`));
    const roles = snap.val() as Record<string, unknown> | null;
    const adminEmail = roles?.ADMIN;
    if (typeof adminEmail === "string" && adminEmail.includes("@")) return adminEmail;
  } catch {
    // A missing loginIndex still allows the typed address, which is how seeded admins sign in.
  }
  return email.trim();
}

export async function signInAdmin(email: string, password: string) {
  const auth = getClientAuth();
  const authEmail = await authEmailFor(email);
  let credential;
  try {
    credential = await signInWithEmailAndPassword(auth, authEmail, password);
  } catch {
    throw new Error("Invalid admin credentials");
  }

  try {
    const profile = await readDashboardAdmin(credential.user.uid);
    if (!profile) {
      await signOut(auth);
      throw new Error(NOT_AN_ADMIN);
    }
  } catch (error) {
    await signOut(auth).catch(() => undefined);
    throw error instanceof Error ? error : new Error(NOT_AN_ADMIN);
  }
}
