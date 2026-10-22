"use client";

import { get, push, ref, update } from "firebase/database";
import { getClientDb, waitForUser } from "@/lib/firebase/client";
import { isAwaitingReceiptReview, reviewCopy } from "@/lib/rtdb/review-state";

async function requireAdminUser() {
  const user = await waitForUser();
  const flag = await get(ref(getClientDb(), `admins/${user.uid}`));
  if (flag.val() !== true) {
    throw new Error("This account is not listed under /admins.");
  }
  return user;
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
}
