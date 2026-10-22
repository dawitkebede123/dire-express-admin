import { cache } from "react";
import { adminDb } from "@/lib/firebase/admin";
import { isAwaitingReceiptReview, type ReceiptReview } from "@/lib/rtdb/review-state";

const DEFAULT_SETTINGS = {
  freeLoadLimit: 3,
  basePrice: 50,
  pricePerKm: 1,
};

type UserNode = {
  name?: string;
  phone?: string;
  email?: string;
  role?: string;
  locale?: string;
  imageUrl?: string;
};

type BrokerNode = {
  company?: string;
  agentId?: string;
  referredByEmail?: string;
};

type LoadNode = {
  referenceNo?: string;
  status?: string;
  brokerId?: string;
  customerId?: string;
  driverId?: string;
  pickupAddress?: string;
  deliveryAddress?: string;
  pickupDate?: string;
  cargoDescription?: string;
  rate?: number;
  paymentReceiptUrl?: string;
  createdAt?: number;
  receiptReview?: ReceiptReview;
  customerSnap?: { name?: string; company?: string };
  deletedAt?: number;
};

export type Directory = {
  users: Record<string, UserNode>;
  brokers: Record<string, BrokerNode>;
  loads: Record<string, LoadNode>;
};

async function readNode<T>(path: string): Promise<Record<string, T>> {
  const snap = await adminDb().ref(path).get();
  const value = snap.val();
  if (!value || typeof value !== "object") return {};
  return value as Record<string, T>;
}

export const getDirectory = cache(async (): Promise<Directory> => {
  const [users, brokers, loads] = await Promise.all([
    readNode<UserNode>("users"),
    readNode<BrokerNode>("brokers"),
    readNode<LoadNode>("loads"),
  ]);
  return { users, brokers, loads };
});

function userName(users: Record<string, UserNode>, uid: string | undefined, fallback?: string) {
  if (uid && users[uid]?.name) return users[uid].name;
  return fallback || "—";
}

function asDate(value: number | string | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) return new Date(value);
  if (typeof value === "string" && value) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date(0);
}

export async function getOverviewCounts() {
  const { brokers, loads } = await getDirectory();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const start = startOfToday.getTime();

  let pendingCount = 0;
  let approvedToday = 0;
  for (const load of Object.values(loads)) {
    if (isAwaitingReceiptReview(load)) pendingCount += 1;
    const reviewedAt = load.receiptReview?.reviewedAt;
    if (
      load.status === "CREATED" &&
      load.receiptReview?.state === "approved" &&
      typeof reviewedAt === "number" &&
      reviewedAt >= start
    ) {
      approvedToday += 1;
    }
  }

  return {
    pendingCount,
    approvedToday,
    agentCount: Object.keys(brokers).length,
  };
}

export type PendingLoad = {
  id: string;
  referenceNo: string;
  pickupAddress: string;
  deliveryAddress: string;
  rate: number | null;
  createdAt: Date;
  broker: { company: string | null; user: { name: string; email: string | null } };
  customer: { user: { name: string } };
};

export async function getPendingLoads(): Promise<PendingLoad[]> {
  const { users, brokers, loads } = await getDirectory();
  return Object.entries(loads)
    .filter(([, load]) => isAwaitingReceiptReview(load))
    .map(([id, load]) => ({
      id,
      referenceNo: load.referenceNo || id,
      pickupAddress: load.pickupAddress || "",
      deliveryAddress: load.deliveryAddress || "",
      rate: typeof load.rate === "number" ? load.rate : null,
      createdAt: asDate(load.createdAt),
      broker: {
        company: (load.brokerId && brokers[load.brokerId]?.company) || null,
        user: {
          name: userName(users, load.brokerId),
          email: (load.brokerId && users[load.brokerId]?.email) || null,
        },
      },
      customer: {
        user: {
          name: userName(users, load.customerId, load.customerSnap?.name),
        },
      },
    }))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export type LoadDetail = {
  id: string;
  referenceNo: string;
  status: string;
  pickupAddress: string;
  deliveryAddress: string;
  pickupDate: Date;
  cargoDescription: string | null;
  rate: number | null;
  paymentReceiptUrl: string | null;
  reviewedAt: Date | null;
  rejectionReason: string | null;
  brokerId: string;
  broker: {
    company: string | null;
    user: { name: string; email: string | null; phone: string | null };
  };
  customer: { user: { name: string } };
};

export async function getLoad(id: string): Promise<LoadDetail | null> {
  const snap = await adminDb().ref(`loads/${id}`).get();
  const load = snap.val() as LoadNode | null;
  if (!load) return null;

  const { users, brokers } = await getDirectory();
  const review = load.receiptReview;
  const closed = review?.state === "approved" || review?.state === "rejected";
  const brokerId = load.brokerId || "";

  return {
    id,
    referenceNo: load.referenceNo || id,
    status: load.status || "PENDING",
    pickupAddress: load.pickupAddress || "",
    deliveryAddress: load.deliveryAddress || "",
    pickupDate: asDate(load.pickupDate),
    cargoDescription: load.cargoDescription ?? null,
    rate: typeof load.rate === "number" ? load.rate : null,
    paymentReceiptUrl: load.paymentReceiptUrl ?? null,
    reviewedAt: closed && typeof review?.reviewedAt === "number" ? new Date(review.reviewedAt) : null,
    rejectionReason: review?.state === "rejected" ? review.rejectionReason || null : null,
    brokerId,
    broker: {
      company: brokers[brokerId]?.company ?? null,
      user: {
        name: userName(users, brokerId),
        email: users[brokerId]?.email ?? null,
        phone: users[brokerId]?.phone ?? null,
      },
    },
    customer: {
      user: { name: userName(users, load.customerId, load.customerSnap?.name) },
    },
  };
}

export type AgentScore = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  referee: { id: string; name: string; email: string | null } | null;
  referralCount: number;
  delivered: number;
  score: number;
};

export async function getAgentScores(): Promise<AgentScore[]> {
  const { users, brokers, loads } = await getDirectory();

  const deliveredByBroker = new Map<string, number>();
  for (const load of Object.values(loads)) {
    if (load.status === "DELIVERED" && load.brokerId && !load.deletedAt) {
      deliveredByBroker.set(load.brokerId, (deliveredByBroker.get(load.brokerId) ?? 0) + 1);
    }
  }

  const brokersByEmail = new Map<string, string>();
  for (const [uid, user] of Object.entries(users)) {
    if (user.email && brokers[uid]) brokersByEmail.set(user.email.trim().toLowerCase(), uid);
  }

  const referralsOf = new Map<string, string[]>();
  for (const [uid, broker] of Object.entries(brokers)) {
    const email = broker.referredByEmail?.trim().toLowerCase();
    if (!email) continue;
    const referrer = brokersByEmail.get(email);
    if (!referrer || referrer === uid) continue;
    const list = referralsOf.get(referrer) ?? [];
    list.push(uid);
    referralsOf.set(referrer, list);
  }

  return Object.keys(brokers)
    .map((uid) => {
      const broker = brokers[uid];
      const user = users[uid];
      const delivered = deliveredByBroker.get(uid) ?? 0;
      const referralIds = referralsOf.get(uid) ?? [];
      const referredDelivered = referralIds.reduce(
        (sum, referralId) => sum + (deliveredByBroker.get(referralId) ?? 0),
        0
      );
      const refereeEmail = broker?.referredByEmail?.trim().toLowerCase();
      const refereeId = refereeEmail ? brokersByEmail.get(refereeEmail) : undefined;
      return {
        id: uid,
        name: user?.name || "—",
        email: user?.email ?? null,
        phone: user?.phone ?? null,
        company: broker?.company ?? null,
        referee: refereeId
          ? {
              id: refereeId,
              name: users[refereeId]?.name || "—",
              email: users[refereeId]?.email ?? null,
            }
          : null,
        referralCount: referralIds.length,
        delivered,
        score: delivered + referredDelivered,
      };
    })
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

export async function getSettings() {
  const snap = await adminDb().ref("settings").get();
  const value = snap.val() as {
    freeLoadLimit?: unknown;
    basePrice?: unknown;
    pricePerKm?: unknown;
  } | null;
  return {
    freeLoadLimit: numberOr(value?.freeLoadLimit, DEFAULT_SETTINGS.freeLoadLimit),
    basePrice: numberOr(value?.basePrice, DEFAULT_SETTINGS.basePrice),
    pricePerKm: numberOr(value?.pricePerKm, DEFAULT_SETTINGS.pricePerKm),
  };
}

function numberOr(value: unknown, fallback: number) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export type DemoRequestRow = {
  id: string;
  email: string;
  source: string;
  createdAt: Date;
  readAt: Date | null;
};

type DemoNode = {
  email?: string;
  source?: string;
  createdAt?: number;
  readAt?: number | null;
};

export const getDemoRequests = cache(async (): Promise<DemoRequestRow[]> => {
  const rows = await readNode<DemoNode>("demoRequests");
  return Object.entries(rows)
    .map(([id, row]) => ({
      id,
      email: row.email || "",
      source: row.source || "landing",
      createdAt: asDate(row.createdAt),
      readAt: typeof row.readAt === "number" ? new Date(row.readAt) : null,
    }))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 200);
});

export async function countUnreadDemoRequests() {
  const requests = await getDemoRequests();
  return requests.filter((request) => !request.readAt).length;
}

export async function markDemoRequestRead(id: string) {
  if (!id || /[.#$[\]/]/.test(id)) {
    throw new Error("Invalid demo request id");
  }
  const ref = adminDb().ref(`demoRequests/${id}`);
  const snap = await ref.get();
  if (!snap.exists()) {
    throw new Error("Demo request not found");
  }
  await ref.update({ readAt: Date.now() });
}
