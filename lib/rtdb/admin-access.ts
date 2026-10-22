"use client";

import { get, ref } from "firebase/database";
import { getClientDb } from "@/lib/firebase/client";

export const NOT_AN_ADMIN = "not an admin";

export type AdminRole = "superadmin" | "admin";

export type AdminProfile = {
  name: string;
  email: string;
  phone?: string;
  role: AdminRole;
  active: true;
  createdAt: number;
};

export function parseAdminProfile(value: unknown): AdminProfile | null {
  if (!value || typeof value !== "object") return null;
  const node = value as Record<string, unknown>;
  if (node.active !== true) return null;
  const name = typeof node.name === "string" && node.name.trim() ? node.name.trim() : "Admin";
  const email = typeof node.email === "string" ? node.email : "";
  const role: AdminRole = node.role === "superadmin" ? "superadmin" : "admin";
  return {
    name,
    email,
    phone: typeof node.phone === "string" ? node.phone : undefined,
    role,
    active: true,
    createdAt: typeof node.createdAt === "number" ? node.createdAt : 0,
  };
}

export async function readDashboardAdmin(uid: string): Promise<AdminProfile | null> {
  const db = getClientDb();
  const [profileSnap, flagSnap] = await Promise.all([
    get(ref(db, `adminUsers/${uid}`)),
    get(ref(db, `admins/${uid}`)),
  ]);
  if (flagSnap.val() !== true) return null;
  return parseAdminProfile(profileSnap.val());
}
