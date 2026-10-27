"use client";

import { get, push, ref, serverTimestamp, set, update } from "firebase/database";
import { getClientDb, waitForUser } from "@/lib/firebase/client";
import { NOT_AN_ADMIN, readDashboardAdmin } from "@/lib/rtdb/admin-access";
import { invalidateDirectory } from "@/lib/rtdb/reads";
import { isAwaitingReceiptReview, reviewCopy } from "@/lib/rtdb/review-state";

async function requireAdminUser() {
  const user = await waitForUser();
  const profile = await readDashboardAdmin(user.uid);
  if (!profile) throw new Error(NOT_AN_ADMIN);
  return user;
}

export function permissionMessage(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  if (message.includes("PERMISSION_DENIED")) {
    return "Realtime Database rejected the update. Confirm admins/{uid} is true and adminUsers/{uid} is active.";
  }
  return message;
}

export async function saveAppSettings(input: {
  freeLoadLimit: number;
  basePrice: number;
  pricePerKm: number;
}) {
  await requireAdminUser();
  await update(ref(getClientDb(), "settings"), {
    freeLoadLimit: input.freeLoadLimit,
    basePrice: input.basePrice,
    pricePerKm: input.pricePerKm,
    updatedAt: Date.now(),
  });
  invalidateDirectory();
}

const PAYMENT_PHONE_PATTERN = /^[0-9 +\-]{7,20}$/;

export function isPaymentPhone(value: string) {
  return PAYMENT_PHONE_PATTERN.test(value);
}

export async function savePaymentPhone(phoneNumber: string) {
  const user = await requireAdminUser();
  const trimmed = phoneNumber.trim();
  if (!isPaymentPhone(trimmed)) {
    throw new Error("Enter a phone number of 7–20 characters using digits, spaces, +, or -.");
  }
  await set(ref(getClientDb(), "settings/payment"), {
    phoneNumber: trimmed,
    updatedAt: serverTimestamp(),
    updatedBy: user.uid,
  });
  invalidateDirectory();
}

export async function markDemoRequestRead(id: string) {
  if (!id || /[.#$[\]/]/.test(id)) throw new Error("Invalid demo request id");
  await requireAdminUser();
  const db = getClientDb();
  const snap = await get(ref(db, `demoRequests/${id}`));
  if (!snap.exists()) throw new Error("Demo request not found");
  await update(ref(db, `demoRequests/${id}`), { readAt: Date.now() });
  invalidateDirectory();
}

export async function submitLoadReview(input: {
  loadId: string;
  brokerId: string;
  referenceNo: string;
  action: "approve" | "reject";
  rejectionReason?: string;
}) {
  const user = await requireAdminUser();
  const db = getClientDb();
  const loadSnap = await get(ref(db, `loads/${input.loadId}`));
  const load = loadSnap.val() as {
    paymentReceiptUrl?: string;
    status?: string;
    receiptReview?: { state?: string };
    brokerId?: string;
    deletedAt?: number;
  } | null;

  if (!load) throw new Error("Load not found");
  if (!isAwaitingReceiptReview(load)) {
    throw new Error("Load is not awaiting receipt approval");
  }

  const brokerId = load.brokerId || input.brokerId;
  if (!brokerId) throw new Error("Load has no broker");

  const localeSnap = await get(ref(db, `users/${brokerId}/locale`));
  const approved = input.action === "approve";
  const reason = input.rejectionReason?.trim() || "Receipt rejected";
  const copy = reviewCopy({
    locale: localeSnap.val() === "am" ? "am" : "en",
    approved,
    referenceNo: input.referenceNo,
    reason,
  });
  const now = Date.now();
  const notificationId = push(ref(db, `notifications/${brokerId}`)).key;
  if (!notificationId) throw new Error("Could not allocate a notification id");

  const receiptReview = approved
    ? { state: "approved", reviewedAt: now, reviewedBy: user.uid }
    : {
        state: "rejected",
        reviewedAt: now,
        reviewedBy: user.uid,
        rejectionReason: reason,
      };

  await update(ref(db), {
    [`loads/${input.loadId}/status`]: approved ? "CREATED" : "CANCELLED",
    [`loads/${input.loadId}/receiptReview`]: receiptReview,
    [`loads/${input.loadId}/updatedAt`]: now,
    [`notifications/${brokerId}/${notificationId}`]: {
      type: "STATUS_UPDATE",
      title: copy.title,
      body: copy.body,
      read: false,
      createdAt: now,
      from: user.uid,
      loadId: input.loadId,
      data: {
        kind: approved ? "approved" : "receipt_rejected",
        referenceNo: input.referenceNo,
        ...(approved ? {} : { reason }),
      },
    },
  });
  invalidateDirectory();
}
