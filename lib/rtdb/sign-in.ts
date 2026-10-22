"use client";

import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { get, ref } from "firebase/database";
import { getClientAuth, getClientDb } from "@/lib/firebase/client";
import { emailIndexHash } from "@/lib/login-index";

async function authEmailFor(email: string) {
  try {
    const hash = await emailIndexHash(email);
    const snap = await get(ref(getClientDb(), `loginIndex/${hash}`));
    const roles = snap.val() as Record<string, unknown> | null;
    const adminEmail = roles?.ADMIN;
    if (typeof adminEmail === "string" && adminEmail.includes("@")) return adminEmail;
  } catch {
    // Fall through to the typed address. Seeded admins use that address directly.
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

  const flag = await get(ref(getClientDb(), `admins/${credential.user.uid}`));
  if (flag.val() !== true) {
    await signOut(auth);
    throw new Error("This account is not an admin");
  }

  const idToken = await credential.user.getIdToken();
  const response = await fetch("/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  if (!response.ok) {
    await signOut(auth);
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "Could not start a session");
  }
}
