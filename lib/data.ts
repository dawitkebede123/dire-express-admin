import { isAwaitingReceiptReview, type ReceiptReview } from "@/lib/rtdb/review-state";

const DEFAULT_SETTINGS = {
  freeLoadLimit: 3,
  basePrice: 50,
  pricePerKm: 1,
};

export type UserNode = {
  name?: string;
  phone?: string;
  email?: string;
  role?: string;
  locale?: string;
  imageUrl?: string;
};

export type BrokerNode = {
  company?: string;
  agentId?: string;
  referredByEmail?: string;
};

export type LoadNode = {
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

export type DemoNode = {
  email?: string;
  source?: string;
  createdAt?: number;
  readAt?: number | null;
};

export type SettingsNode = {
  freeLoadLimit?: unknown;
  basePrice?: unknown;
  pricePerKm?: unknown;
};

export type Directory = {
  users: Record<string, UserNode>;
  brokers: Record<string, BrokerNode>;
  loads: Record<string, LoadNode>;
  demoRequests: Record<string, DemoNode>;
  settings: SettingsNode | null;
};

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

export function getOverviewCounts(directory: Directory) {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const start = startOfToday.getTime();

  let pendingCount = 0;
  let approvedToday = 0;
  for (const load of Object.values(directory.loads)) {
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
    agentCount: Object.keys(directory.brokers).length,
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

export function getPendingLoads(directory: Directory): PendingLoad[] {
  const { users, brokers, loads } = directory;
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
  awaitingReview: boolean;
  brokerId: string;
  broker: {
    company: string | null;
    user: { name: string; email: string | null; phone: string | null };
  };
  customer: { user: { name: string } };
};

export function getLoad(directory: Directory, id: string): LoadDetail | null {
  const load = directory.loads[id];
  if (!load) return null;

  const { users, brokers } = directory;
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
    awaitingReview: isAwaitingReceiptReview(load),
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

export function getAgentScores(directory: Directory): AgentScore[] {
  const { users, brokers, loads } = directory;

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

export type AppSettings = {
  freeLoadLimit: number;
  basePrice: number;
  pricePerKm: number;
};

export function getSettings(directory: Directory): AppSettings {
  const value = directory.settings;
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

export function getDemoRequests(directory: Directory): DemoRequestRow[] {
  return Object.entries(directory.demoRequests)
    .map(([id, row]) => ({
      id,
      email: row.email || "",
      source: row.source || "landing",
      createdAt: asDate(row.createdAt),
      readAt: typeof row.readAt === "number" ? new Date(row.readAt) : null,
    }))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 200);
}

export function countUnreadDemoRequests(requests: DemoRequestRow[]) {
  return requests.filter((request) => !request.readAt).length;
}
