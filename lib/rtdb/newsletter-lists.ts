"use client";

import { get, push, ref, remove, serverTimestamp, set, update } from "firebase/database";
import { getClientDb, waitForUser } from "@/lib/firebase/client";
import { isEmailAddress } from "@/lib/newsletter/recipients";
import { NOT_AN_ADMIN, readDashboardAdmin } from "@/lib/rtdb/admin-access";
import { permissionMessage } from "@/lib/rtdb/client-writes";

const LIST_NAME_LIMIT = 120;
const WRITE_CHUNK = 100;
// Each new subscriber is its own set() with one serverTimestamp. addedAt must
// equal the rules' `now`, and one update() of many timestamps is all-or-nothing.
const NEW_SUBSCRIBER_PARALLEL = 20;

async function requireAdminUser() {
  const user = await waitForUser();
  const profile = await readDashboardAdmin(user.uid);
  if (!profile) throw new Error(NOT_AN_ADMIN);
  return user;
}

export type NewsletterSubscriber = {
  id: string;
  email: string;
  name: string;
  addedAt: number | null;
  sentAt: number | null;
  brevoCampaignId: string | null;
};

export type NewsletterSubscriberList = {
  id: string;
  name: string;
  createdAt: number | null;
  brevoListId: number | null;
  subscribers: NewsletterSubscriber[];
};

export type SubscriberDraft = {
  email: string;
  name: string;
};

function parseSubscriber(id: string, value: unknown): NewsletterSubscriber | null {
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

function parseList(id: string, value: unknown): NewsletterSubscriberList | null {
  if (!value || typeof value !== "object") return null;
  const node = value as Record<string, unknown>;
  if (typeof node.name !== "string" || !node.name.trim()) return null;
  const subscribers: NewsletterSubscriber[] = [];
  if (node.subscribers && typeof node.subscribers === "object") {
    for (const [subId, subValue] of Object.entries(node.subscribers as Record<string, unknown>)) {
      const subscriber = parseSubscriber(subId, subValue);
      if (subscriber) subscribers.push(subscriber);
    }
  }
  subscribers.sort((a, b) => (a.addedAt ?? 0) - (b.addedAt ?? 0) || a.email.localeCompare(b.email));
  return {
    id,
    name: node.name.trim(),
    createdAt: typeof node.createdAt === "number" ? node.createdAt : null,
    brevoListId: typeof node.brevoListId === "number" && node.brevoListId > 0 ? node.brevoListId : null,
    subscribers,
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

export async function loadSubscriberLists() {
  await requireAdminUser();
  const snap = await get(ref(getClientDb(), "newsletter/lists"));
  if (!snap.exists()) return [];
  const value = snap.val() as unknown;
  if (!value || typeof value !== "object") return [];
  const lists: NewsletterSubscriberList[] = [];
  for (const [id, node] of Object.entries(value as Record<string, unknown>)) {
    const list = parseList(id, node);
    if (list) lists.push(list);
  }
  lists.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0) || a.name.localeCompare(b.name));
  return lists;
}

export async function createSubscriberList(name: string) {
  const user = await requireAdminUser();
  const trimmed = name.trim().slice(0, LIST_NAME_LIMIT);
  if (!trimmed) throw new Error("Give the subscriber list a name.");
  const id = push(ref(getClientDb(), "newsletter/lists")).key;
  if (!id) throw new Error("Could not allocate a list id.");
  await set(ref(getClientDb(), `newsletter/lists/${id}`), {
    name: trimmed,
    createdAt: serverTimestamp(),
    createdBy: user.uid,
  });
  return id;
}

export async function deleteSubscriberList(listId: string) {
  await requireAdminUser();
  if (!listId || /[.#$[\]/]/.test(listId)) throw new Error("Invalid list id.");
  await remove(ref(getClientDb(), `newsletter/lists/${listId}`));
}

export async function rememberBrevoListId(listId: string, brevoListId: number) {
  await requireAdminUser();
  if (!Number.isInteger(brevoListId) || brevoListId <= 0) throw new Error("Invalid Brevo list id.");
  await update(ref(getClientDb(), `newsletter/lists/${listId}`), { brevoListId });
}

export type SubscriberWriteFailure = {
  email: string;
  message: string;
};

export type AddSubscribersResult = {
  added: number;
  renamed: number;
  alreadyInList: number;
  alreadyExamples: string[];
  writeFailed: SubscriberWriteFailure[];
};

export async function addSubscribers(
  listId: string,
  drafts: SubscriberDraft[],
  onProgress?: (saved: number, total: number) => void,
): Promise<AddSubscribersResult> {
  await requireAdminUser();
  if (!listId || /[.#$[\]/]/.test(listId)) throw new Error("Invalid list id.");
  const snap = await get(ref(getClientDb(), `newsletter/lists/${listId}/subscribers`));
  const existing = new Map<string, NewsletterSubscriber>();
  if (snap.exists() && snap.val() && typeof snap.val() === "object") {
    for (const [id, value] of Object.entries(snap.val() as Record<string, unknown>)) {
      const subscriber = parseSubscriber(id, value);
      if (subscriber) existing.set(subscriber.email, subscriber);
    }
  }

  const fresh: { id: string; email: string; name: string }[] = [];
  const renames: { path: string; email: string; name: string }[] = [];
  const writeFailed: SubscriberWriteFailure[] = [];
  const alreadyExamples: string[] = [];
  let alreadyInList = 0;
  const base = `newsletter/lists/${listId}/subscribers`;
  const seen = new Set<string>();
  for (const draft of drafts) {
    const email = String(draft.email ?? "").trim().toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    const name = String(draft.name ?? "")
      .replace(/[\r\n]+/g, " ")
      .trim()
      .slice(0, 200);
    if (email.length <= 3 || email.length > 200 || !isEmailAddress(email)) {
      writeFailed.push({ email: email.slice(0, 200), message: "invalid email" });
      continue;
    }
    const current = existing.get(email);
    if (current) {
      alreadyInList += 1;
      if (alreadyExamples.length < 3) alreadyExamples.push(email);
      if (name && name !== current.name) {
        renames.push({ path: `${base}/${current.id}/name`, email, name });
      }
      continue;
    }
    const id = push(ref(getClientDb(), base)).key;
    if (!id) {
      writeFailed.push({ email, message: "Could not allocate a subscriber id." });
      continue;
    }
    fresh.push({ id, email, name });
  }

  const db = getClientDb();
  let renamed = 0;
  for (let index = 0; index < renames.length; index += WRITE_CHUNK) {
    const slice = renames.slice(index, index + WRITE_CHUNK);
    const payload = Object.fromEntries(slice.map((job) => [job.path, job.name]));
    try {
      await update(ref(db), payload);
      renamed += slice.length;
    } catch (error) {
      const message = permissionMessage(error, "Could not update names.");
      for (const job of slice) writeFailed.push({ email: job.email, message });
    }
  }

  let added = 0;
  onProgress?.(0, fresh.length);
  for (let index = 0; index < fresh.length; index += NEW_SUBSCRIBER_PARALLEL) {
    const slice = fresh.slice(index, index + NEW_SUBSCRIBER_PARALLEL);
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
          return {
            email: row.email,
            message: permissionMessage(error, "Could not save this contact."),
          };
        }
      }),
    );
    for (const failure of results) {
      if (failure) writeFailed.push(failure);
      else added += 1;
    }
    onProgress?.(added, fresh.length);
  }
  return { added, renamed, alreadyInList, alreadyExamples, writeFailed };
}

export async function markSubscribersSent(listId: string, subscriberIds: string[], brevoCampaignId: string) {
  await requireAdminUser();
  if (!subscriberIds.length) return;
  const updates: Record<string, unknown> = {};
  for (const id of subscriberIds) {
    if (!id || /[.#$[\]/]/.test(id)) throw new Error("Invalid subscriber id.");
    updates[`newsletter/lists/${listId}/subscribers/${id}/sentAt`] = serverTimestamp();
    updates[`newsletter/lists/${listId}/subscribers/${id}/brevoCampaignId`] = brevoCampaignId.slice(0, 40);
  }
  await writeChunks(updates);
}

export async function clearSubscriberSendHistory(listId: string) {
  await requireAdminUser();
  const snap = await get(ref(getClientDb(), `newsletter/lists/${listId}/subscribers`));
  if (!snap.exists() || !snap.val() || typeof snap.val() !== "object") return 0;
  const updates: Record<string, unknown> = {};
  let cleared = 0;
  for (const [id, value] of Object.entries(snap.val() as Record<string, unknown>)) {
    const subscriber = parseSubscriber(id, value);
    if (!subscriber?.sentAt && !subscriber?.brevoCampaignId) continue;
    updates[`newsletter/lists/${listId}/subscribers/${id}/sentAt`] = null;
    updates[`newsletter/lists/${listId}/subscribers/${id}/brevoCampaignId`] = null;
    cleared += 1;
  }
  if (cleared) await writeChunks(updates);
  return cleared;
}
