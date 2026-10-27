"use client";

import { get, push, ref, serverTimestamp, set, update } from "firebase/database";
import { getClientDb, waitForUser } from "@/lib/firebase/client";
import { isEmailAddress } from "@/lib/newsletter/recipients";
import { toTitleCaseName } from "@/lib/newsletter/title-case";
import { NOT_AN_ADMIN, readDashboardAdmin } from "@/lib/rtdb/admin-access";

const SUBJECT_LIMIT = 200;
const HTML_LIMIT = 400_000;
const WRITE_CHUNK = 100;
const NEW_RECIPIENT_PARALLEL = 20;

async function requireAdminUser() {
  const user = await waitForUser();
  const profile = await readDashboardAdmin(user.uid);
  if (!profile) throw new Error(NOT_AN_ADMIN);
  return user;
}

export type WelcomeTemplate = {
  subject: string;
  html: string;
  updatedAt: number | null;
  updatedBy: string | null;
};

export type WelcomeRecipient = {
  id: string;
  email: string;
  name: string;
  addedAt: number | null;
  sentAt: number | null;
  brevoCampaignId: string | null;
};

export type WelcomeDraft = {
  email: string;
  name: string;
};

function parseRecipient(id: string, value: unknown): WelcomeRecipient | null {
  if (!value || typeof value !== "object") return null;
  const node = value as Record<string, unknown>;
  if (typeof node.email !== "string" || !node.email.trim()) return null;
  return {
    id,
    email: node.email.trim().toLowerCase(),
    name: typeof node.name === "string" ? node.name : "",
    addedAt: typeof node.addedAt === "number" ? node.addedAt : null,
    sentAt: typeof node.sentAt === "number" ? node.sentAt : null,
    brevoCampaignId: typeof node.brevoCampaignId === "string" ? node.brevoCampaignId : null,
  };
}

async function writeChunks(updates: Record<string, unknown>) {
  const entries = Object.entries(updates);
  const db = getClientDb();
  for (let index = 0; index < entries.length; index += WRITE_CHUNK) {
    const slice = Object.fromEntries(entries.slice(index, index + WRITE_CHUNK));
    await update(ref(db), slice);
  }
}

export async function loadWelcomeTemplate(): Promise<WelcomeTemplate | null> {
  await requireAdminUser();
  const snap = await get(ref(getClientDb(), "newsletter/welcomeTemplate"));
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

export async function saveWelcomeTemplate(input: { subject: string; html: string }) {
  const user = await requireAdminUser();
  const subject = input.subject.trim();
  if (!subject || subject.length > SUBJECT_LIMIT) {
    throw new Error("Subject must be 1–200 characters.");
  }
  if (!input.html.trim() || input.html.length > HTML_LIMIT) {
    throw new Error("The HTML template must be under 400,000 characters.");
  }
  await set(ref(getClientDb(), "newsletter/welcomeTemplate"), {
    subject,
    html: input.html,
    updatedAt: serverTimestamp(),
    updatedBy: user.uid,
  });
}

export async function loadWelcomeRecipients() {
  await requireAdminUser();
  const snap = await get(ref(getClientDb(), "newsletter/welcomeRecipients"));
  if (!snap.exists() || !snap.val() || typeof snap.val() !== "object") return [];
  const recipients: WelcomeRecipient[] = [];
  for (const [id, value] of Object.entries(snap.val() as Record<string, unknown>)) {
    const recipient = parseRecipient(id, value);
    if (recipient) recipients.push(recipient);
  }
  recipients.sort((a, b) => (a.addedAt ?? 0) - (b.addedAt ?? 0) || a.email.localeCompare(b.email));
  return recipients;
}

export async function addWelcomeRecipients(
  drafts: WelcomeDraft[],
  onProgress?: (saved: number, total: number) => void,
) {
  await requireAdminUser();
  const existing = new Set((await loadWelcomeRecipients()).map((row) => row.email));
  const fresh: { id: string; email: string; name: string }[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  const base = "newsletter/welcomeRecipients";
  for (const draft of drafts) {
    const email = String(draft.email ?? "").trim().toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    if (email.length <= 3 || email.length > 200 || !isEmailAddress(email)) continue;
    if (existing.has(email)) {
      skipped += 1;
      continue;
    }
    const id = push(ref(getClientDb(), base)).key;
    if (!id) throw new Error("Could not allocate a welcome recipient id.");
    const name = toTitleCaseName(String(draft.name ?? ""));
    fresh.push({ id, email, name });
  }

  const db = getClientDb();
  let added = 0;
  onProgress?.(0, fresh.length);
  for (let index = 0; index < fresh.length; index += NEW_RECIPIENT_PARALLEL) {
    const slice = fresh.slice(index, index + NEW_RECIPIENT_PARALLEL);
    const results = await Promise.all(
      slice.map(async (row) => {
        try {
          await set(ref(db, `${base}/${row.id}`), {
            email: row.email,
            name: row.name,
            addedAt: serverTimestamp(),
          });
          return null;
        } catch (error) {
          return error;
        }
      }),
    );
    added += results.filter((error) => error == null).length;
    onProgress?.(added, fresh.length);
    const failure = results.find((error) => error != null);
    if (failure) throw failure;
  }
  return { added, skipped };
}

export async function markWelcomeSent(recipientIds: string[], brevoCampaignId: string) {
  await requireAdminUser();
  if (!recipientIds.length) return;
  const updates: Record<string, unknown> = {};
  const campaignId = brevoCampaignId.trim().slice(0, 40);
  if (!campaignId) throw new Error("A sent welcome needs a campaign id.");
  for (const id of recipientIds) {
    if (!id || /[.#$[\]/]/.test(id)) throw new Error("Invalid welcome recipient id.");
    updates[`newsletter/welcomeRecipients/${id}/sentAt`] = serverTimestamp();
    updates[`newsletter/welcomeRecipients/${id}/brevoCampaignId`] = campaignId;
  }
  await writeChunks(updates);
}

export async function clearWelcomeSendHistory() {
  await requireAdminUser();
  const recipients = await loadWelcomeRecipients();
  const updates: Record<string, unknown> = {};
  let cleared = 0;
  for (const recipient of recipients) {
    if (!recipient.sentAt && !recipient.brevoCampaignId) continue;
    updates[`newsletter/welcomeRecipients/${recipient.id}/sentAt`] = null;
    updates[`newsletter/welcomeRecipients/${recipient.id}/brevoCampaignId`] = null;
    cleared += 1;
  }
  if (cleared) await writeChunks(updates);
  return cleared;
}
