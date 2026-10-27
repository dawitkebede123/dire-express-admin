"use client";

import { get, push, ref, serverTimestamp, set } from "firebase/database";
import { getClientDb, waitForUser } from "@/lib/firebase/client";
import { NOT_AN_ADMIN, readDashboardAdmin } from "@/lib/rtdb/admin-access";

const SUBJECT_LIMIT = 200;
const HTML_LIMIT = 400_000;

async function requireAdminUser() {
  const user = await waitForUser();
  const profile = await readDashboardAdmin(user.uid);
  if (!profile) throw new Error(NOT_AN_ADMIN);
  return user;
}

export type NewsletterTemplate = {
  subject: string;
  html: string;
  updatedAt: number | null;
  updatedBy: string | null;
};

export async function loadNewsletterTemplate(): Promise<NewsletterTemplate | null> {
  await requireAdminUser();
  const snap = await get(ref(getClientDb(), "newsletter/template"));
  if (!snap.exists()) return null;
  const value = snap.val() as unknown;
  if (!value || typeof value !== "object") return null;
  const node = value as Record<string, unknown>;
  if (typeof node.subject !== "string" || typeof node.html !== "string") return null;
  return {
    subject: node.subject,
    html: node.html,
    updatedAt: typeof node.updatedAt === "number" ? node.updatedAt : null,
    updatedBy: typeof node.updatedBy === "string" ? node.updatedBy : null,
  };
}

export async function saveNewsletterTemplate(input: { subject: string; html: string }) {
  const user = await requireAdminUser();
  const subject = input.subject.trim();
  if (!subject || subject.length > SUBJECT_LIMIT) {
    throw new Error("Subject must be 1–200 characters.");
  }
  if (!input.html.trim() || input.html.length > HTML_LIMIT) {
    throw new Error("The HTML template must be under 400,000 characters.");
  }
  await set(ref(getClientDb(), "newsletter/template"), {
    subject,
    html: input.html,
    updatedAt: serverTimestamp(),
    updatedBy: user.uid,
  });
}

export type NewsletterCampaignSummary = {
  sent: number;
  createdAt: number | null;
};

export async function loadNewsletterCampaignSummaries(): Promise<NewsletterCampaignSummary[]> {
  await requireAdminUser();
  const snap = await get(ref(getClientDb(), "newsletter/campaigns"));
  if (!snap.exists() || !snap.val() || typeof snap.val() !== "object") return [];
  const rows: NewsletterCampaignSummary[] = [];
  for (const value of Object.values(snap.val() as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue;
    const node = value as Record<string, unknown>;
    rows.push({
      sent: typeof node.sent === "number" ? node.sent : 0,
      createdAt: typeof node.createdAt === "number" ? node.createdAt : null,
    });
  }
  return rows;
}

export async function logNewsletterCampaign(input: {
  subject: string;
  total: number;
  sent: number;
  failed: number;
}) {
  const user = await requireAdminUser();
  const subject = input.subject.trim().slice(0, SUBJECT_LIMIT);
  if (!subject) throw new Error("A campaign needs a subject.");
  const id = push(ref(getClientDb(), "newsletter/campaigns")).key;
  if (!id) throw new Error("Could not allocate a campaign id.");
  await set(ref(getClientDb(), `newsletter/campaigns/${id}`), {
    subject,
    total: input.total,
    sent: input.sent,
    failed: input.failed,
    createdAt: serverTimestamp(),
    createdBy: user.uid,
  });
  return id;
}
