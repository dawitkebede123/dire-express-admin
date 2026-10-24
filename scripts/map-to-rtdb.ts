import { pathToFileURL } from "node:url";
import { emailIndexHash, phoneIndexHash } from "@/lib/login-index";

const AUTH_DOMAIN = "users.direexpress.app";
const ROLES = new Set(["BROKER", "DRIVER", "CUSTOMER", "ADMIN"]);
const LOAD_STATUSES = new Set([
  "PENDING",
  "CREATED",
  "ASSIGNED",
  "ACCEPTED",
  "REJECTED",
  "IN_TRANSIT",
  "DELIVERED",
  "CANCELLED",
]);

export type Row = Record<string, unknown>;

export type PgTables = {
  users: Row[];
  brokers: Row[];
  drivers: Row[];
  customers: Row[];
  loads: Row[];
  devices: Row[];
  locations: Row[];
  pods: Row[];
  notifications: Row[];
  settings: Row | null;
  demoRequests: Row[];
};

export type MediaCandidate = {
  ownerUid: string;
  kind: "avatar" | "truck" | "receipt" | "pod";
  sourceUrl: string;
  suffix: string;
  loadId?: string;
  assign: (storedUrl: string) => void;
};

export type AuthImportUser = {
  uid: string;
  email: string;
  displayName: string;
  passwordHash: string;
};

export type RtdbPayload = {
  authUsers: AuthImportUser[];
  users: Record<string, Record<string, unknown>>;
  brokers: Record<string, Record<string, unknown>>;
  drivers: Record<string, Record<string, unknown>>;
  customers: Record<string, Record<string, unknown>>;
  brokerDrivers: Record<string, Record<string, Record<string, unknown>>>;
  brokerCustomers: Record<string, Record<string, Record<string, unknown>>>;
  agentCodes: Record<string, string>;
  loginIndex: Record<string, Record<string, string>>;
  loads: Record<string, Record<string, unknown>>;
  userLoads: Record<string, Record<string, string>>;
  counters: {
    loadRef?: number;
    users: Record<string, number>;
    devices: Record<string, number>;
  };
  notifications: Record<string, Record<string, Record<string, unknown>>>;
  liveLocations: Record<string, Record<string, unknown>>;
  locationHistory: Record<string, Record<string, Record<string, unknown>>>;
  settings?: Record<string, unknown>;
  admins: Record<string, true>;
  adminUsers: Record<
    string,
    {
      name: string;
      email: string;
      phone?: string;
      role: "admin" | "superadmin";
      active: true;
      createdAt: number;
    }
  >;
  demoRequests: Record<string, Record<string, unknown>>;
  mediaCandidates: MediaCandidate[];
  warnings: string[];
};

export function rtdbKey(value: string) {
  return value.replace(/[.#$[\]/]/g, "_");
}

function asString(value: unknown) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  if (value && typeof value === "object" && "toNumber" in value) {
    const parsed = Number((value as { toNumber: () => number }).toNumber());
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function asMillis(value: unknown) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return undefined;
}

function asIso(value: unknown) {
  const millis = asMillis(value);
  return millis == null ? undefined : new Date(millis).toISOString();
}

function asBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

function compact(value: Record<string, unknown>) {
  const next: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined && item !== null) next[key] = item;
  }
  return next;
}

function authEmailFor(role: string, uid: string) {
  return `${role.toLowerCase()}.${uid}@${AUTH_DOMAIN}`;
}

function agentCodeFor(uid: string, taken: Set<string>) {
  const hash = [...uid].reduce((sum, char) => (sum * 33 + char.charCodeAt(0)) >>> 0, 7);
  for (let offset = 0; offset < 1_000_000; offset++) {
    const code = String((hash + offset) % 1_000_000).padStart(6, "0");
    if (code !== "000000" && !taken.has(code)) {
      taken.add(code);
      return code;
    }
  }
  throw new Error(`No free agent code for ${uid}`);
}

function referenceSequence(referenceNo: string) {
  const matches = referenceNo.match(/\d+/g);
  if (!matches) return 0;
  return Math.max(...matches.map((part) => Number(part)));
}

export async function buildRtdbPayload(tables: PgTables): Promise<RtdbPayload> {
  const warnings: string[] = [];
  const users: RtdbPayload["users"] = {};
  const brokers: RtdbPayload["brokers"] = {};
  const drivers: RtdbPayload["drivers"] = {};
  const customers: RtdbPayload["customers"] = {};
  const brokerDrivers: RtdbPayload["brokerDrivers"] = {};
  const brokerCustomers: RtdbPayload["brokerCustomers"] = {};
  const agentCodes: Record<string, string> = {};
  const loginIndex: RtdbPayload["loginIndex"] = {};
  const loads: RtdbPayload["loads"] = {};
  const userLoads: RtdbPayload["userLoads"] = {};
  const notifications: RtdbPayload["notifications"] = {};
  const liveLocations: RtdbPayload["liveLocations"] = {};
  const locationHistory: RtdbPayload["locationHistory"] = {};
  const admins: Record<string, true> = {};
  const adminUsers: RtdbPayload["adminUsers"] = {};
  const demoRequests: RtdbPayload["demoRequests"] = {};
  const mediaCandidates: MediaCandidate[] = [];
  const authUsers: AuthImportUser[] = [];
  const counterUsers: Record<string, number> = {};
  const counterDevices: Record<string, number> = {};
  const takenCodes = new Set<string>();

  const userById = new Map(tables.users.map((row) => [rtdbKey(String(row.id)), row]));
  const brokerById = new Map(tables.brokers.map((row) => [String(row.id), row]));
  const driverById = new Map(tables.drivers.map((row) => [String(row.id), row]));
  const customerById = new Map(tables.customers.map((row) => [String(row.id), row]));

  for (const row of tables.users) {
    const uid = rtdbKey(String(row.id));
    const role = asString(row.role)?.toUpperCase() ?? "";
    if (!ROLES.has(role)) {
      warnings.push(`Skipping user ${uid} with unknown role ${role || "(empty)"}`);
      continue;
    }

    const name = asString(row.name) ?? "Unknown";
    const email = asString(row.email);
    const phone = asString(row.phone) ?? "";
    const authEmail = authEmailFor(role, uid);
    const passwordHash = asString(row.passwordHash);
    const createdAt = asMillis(row.createdAt) ?? Date.now();

    if (passwordHash) {
      authUsers.push({ uid, email: authEmail, displayName: name, passwordHash });
    } else {
      warnings.push(`User ${uid} has no password hash and was not imported into Auth`);
    }

    const profile: Record<string, unknown> = {
      name,
      phone,
      role,
      authEmail,
      createdAt,
    };
    if (email) profile.email = email;
    const imageUrl = asString(row.imageUrl);
    if (imageUrl) {
      profile.imageUrl = imageUrl;
      mediaCandidates.push({
        ownerUid: uid,
        kind: "avatar",
        sourceUrl: imageUrl,
        suffix: "avatar",
        assign: (storedUrl) => {
          profile.imageUrl = storedUrl;
        },
      });
    }
    users[uid] = profile;

    if (role === "ADMIN") {
      admins[uid] = true;
      adminUsers[uid] = {
        name,
        email: email ?? authEmail,
        role: "admin",
        active: true,
        createdAt,
        ...(phone ? { phone } : {}),
      };
    }

    const loadsCreated = asNumber(row.loadsCreated);
    if (loadsCreated && loadsCreated > 0) counterUsers[uid] = Math.floor(loadsCreated);

    if (email) {
      const hash = await emailIndexHash(email);
      loginIndex[hash] ??= {};
      if (loginIndex[hash][role] && loginIndex[hash][role] !== authEmail) {
        warnings.push(`Duplicate login index for ${email} / ${role}`);
      }
      loginIndex[hash][role] = authEmail;
    }
    if (phone) {
      const hash = await phoneIndexHash(phone);
      if (hash) {
        loginIndex[hash] ??= {};
        loginIndex[hash][role] = authEmail;
      }
    }
  }

  const brokerUidByProfile = new Map<string, string>();
  for (const row of tables.brokers) {
    const uid = rtdbKey(asString(row.userId) ?? "");
    if (!uid || !users[uid]) {
      warnings.push(`Skipping broker profile ${String(row.id)}`);
      continue;
    }
    brokerUidByProfile.set(String(row.id), uid);
  }

  for (const [profileId, uid] of brokerUidByProfile) {
    const row = brokerById.get(profileId);
    if (!row) continue;
    const referrerProfileId = asString(row.referredById);
    const referrerUid = referrerProfileId ? brokerUidByProfile.get(referrerProfileId) : undefined;
    const referrerEmail = referrerUid ? asString(userById.get(referrerUid)?.email) : undefined;
    const code = agentCodeFor(uid, takenCodes);
    agentCodes[code] = uid;
    brokers[uid] = compact({
      agentId: code,
      company: asString(row.company),
      referredByEmail: referrerEmail,
    });
  }

  for (const row of tables.drivers) {
    const uid = rtdbKey(asString(row.userId) ?? "");
    if (!uid || !users[uid]) {
      warnings.push(`Skipping driver profile ${String(row.id)}`);
      continue;
    }
    const brokerUid = asString(row.brokerId) ? brokerUidByProfile.get(String(row.brokerId)) : undefined;
    if (!brokerUid) {
      warnings.push(`Driver ${uid} has no broker; drivers/{uid} was not written`);
      continue;
    }
    const user = users[uid];
    const card = compact({
      brokerId: brokerUid,
      plateNo: asString(row.plateNo),
      vehicleType: asString(row.vehicleType),
      loadingCapacity: asNumber(row.loadingCapacity),
      truckImageUrl: asString(row.truckImageUrl),
      isAvailable: asBoolean(row.isAvailable) ?? true,
    });
    drivers[uid] = card;
    const directory = compact({
      name: user.name,
      nameLower: String(user.name).toLowerCase(),
      phone: user.phone ?? "",
      plateNo: card.plateNo,
      vehicleType: card.vehicleType,
      loadingCapacity: card.loadingCapacity,
      truckImageUrl: card.truckImageUrl,
      isAvailable: card.isAvailable,
    });
    brokerDrivers[brokerUid] ??= {};
    brokerDrivers[brokerUid][uid] = directory;
    const truckUrl = asString(row.truckImageUrl);
    if (truckUrl) {
      mediaCandidates.push({
        ownerUid: uid,
        kind: "truck",
        sourceUrl: truckUrl,
        suffix: "truck",
        assign: (storedUrl) => {
          card.truckImageUrl = storedUrl;
          directory.truckImageUrl = storedUrl;
        },
      });
    }
  }

  for (const row of tables.customers) {
    const uid = rtdbKey(asString(row.userId) ?? "");
    if (!uid || !users[uid]) {
      warnings.push(`Skipping customer profile ${String(row.id)}`);
      continue;
    }
    const brokerUid = asString(row.brokerId) ? brokerUidByProfile.get(String(row.brokerId)) : undefined;
    if (!brokerUid) {
      warnings.push(`Customer ${uid} has no broker; customers/{uid} was not written`);
      continue;
    }
    const user = users[uid];
    const profile = compact({
      brokerId: brokerUid,
      company: asString(row.company),
      address: asString(row.address),
    });
    customers[uid] = profile;
    brokerCustomers[brokerUid] ??= {};
    brokerCustomers[brokerUid][uid] = compact({
      name: user.name,
      nameLower: String(user.name).toLowerCase(),
      phone: user.phone ?? "",
      company: profile.company,
      address: profile.address,
    });
  }

  const podByLoad = new Map(tables.pods.map((row) => [String(row.loadId), row]));
  let maxRef = 0;

  for (const row of tables.loads) {
    const loadId = rtdbKey(String(row.id));
    const brokerUid = asString(row.brokerId) ? brokerUidByProfile.get(String(row.brokerId)) : undefined;
    const customerProfile = asString(row.customerId) ? customerById.get(String(row.customerId)) : undefined;
    const customerUid = customerProfile ? rtdbKey(asString(customerProfile.userId) ?? "") : undefined;
    if (!brokerUid || !customerUid) {
      warnings.push(`Skipping load ${loadId}; broker or customer could not be resolved`);
      continue;
    }

    const driverProfile = asString(row.driverId) ? driverById.get(String(row.driverId)) : undefined;
    const driverUid = driverProfile ? rtdbKey(asString(driverProfile.userId) ?? "") : undefined;
    const statusRaw = asString(row.status)?.toUpperCase() ?? "PENDING";
    const status = LOAD_STATUSES.has(statusRaw) ? statusRaw : "PENDING";
    if (status !== statusRaw) warnings.push(`Load ${loadId} status ${statusRaw} was rewritten to PENDING`);

    const referenceNo = asString(row.referenceNo) ?? `DE-${loadId.slice(-6).toUpperCase()}`;
    maxRef = Math.max(maxRef, referenceSequence(referenceNo));
    const createdAt = asMillis(row.createdAt) ?? Date.now();
    const customerUser = users[customerUid];
    const customerProfileRow = customerProfile;

    const load: Record<string, unknown> = compact({
      referenceNo,
      status,
      brokerId: brokerUid,
      customerId: customerUid,
      createdBy: brokerUid,
      createdAt,
      updatedAt: asMillis(row.updatedAt) ?? createdAt,
      pickupAddress: asString(row.pickupAddress) ?? "",
      deliveryAddress: asString(row.deliveryAddress) ?? "",
      pickupDate: asIso(row.pickupDate) ?? new Date(createdAt).toISOString(),
      deliveryDate: asIso(row.deliveryDate),
      cargoDescription: asString(row.cargoDescription),
      equipmentType: asString(row.equipmentType),
      weightLbs: asNumber(row.weightLbs),
      rate: asNumber(row.rate),
      systemPrice: asNumber(row.systemPrice),
      distanceKm: asNumber(row.distanceKm),
      notes: asString(row.notes),
      pickupLat: asNumber(row.pickupLat),
      pickupLng: asNumber(row.pickupLng),
      deliveryLat: asNumber(row.deliveryLat),
      deliveryLng: asNumber(row.deliveryLng),
      paymentReceiptUrl: asString(row.paymentReceiptUrl),
      customerSnap: compact({
        name: customerUser?.name,
        email: customerUser?.email,
        phone: customerUser?.phone,
        company: customerProfileRow ? asString(customerProfileRow.company) : undefined,
      }),
    });

    if (driverUid && users[driverUid]) {
      load.driverId = driverUid;
      load.driverSnap = compact({
        name: users[driverUid].name,
        email: users[driverUid].email,
        phone: users[driverUid].phone,
        plateNo: asString(driverProfile?.plateNo),
        vehicleType: asString(driverProfile?.vehicleType),
        loadingCapacity: asNumber(driverProfile?.loadingCapacity),
        truckImageUrl: asString(driverProfile?.truckImageUrl),
        isAvailable: asBoolean(driverProfile?.isAvailable),
      });
    }

    const reviewedAt = asMillis(row.reviewedAt);
    const receiptUrl = asString(row.paymentReceiptUrl);
    if (reviewedAt) {
      const rejected = status === "CANCELLED";
      load.receiptReview = compact({
        state: rejected ? "rejected" : "approved",
        reviewedAt,
        reviewedBy: asString(row.reviewedById) ? rtdbKey(String(row.reviewedById)) : undefined,
        rejectionReason: rejected ? asString(row.rejectionReason) ?? "Receipt rejected" : undefined,
      });
    } else if (receiptUrl && (status === "PENDING" || status === "CREATED")) {
      load.receiptReview = { state: "pending" };
    }

    const pod = podByLoad.get(String(row.id));
    if (pod) {
      const podNode = compact({
        photoUrl: asString(pod.photoUrl) ?? "",
        signatureUrl: asString(pod.signatureUrl) ?? "",
        recipientName: asString(pod.recipientName),
        notes: asString(pod.notes),
        deliveredAt: asMillis(pod.deliveredAt) ?? asMillis(pod.createdAt),
      });
      load.pod = podNode;
      const photoUrl = asString(pod.photoUrl);
      const signatureUrl = asString(pod.signatureUrl);
      const ownerUid = driverUid && users[driverUid] ? driverUid : brokerUid;
      if (photoUrl) {
        mediaCandidates.push({
          ownerUid,
          kind: "pod",
          sourceUrl: photoUrl,
          suffix: `${loadId}_pod_photo`,
          loadId,
          assign: (storedUrl) => {
            podNode.photoUrl = storedUrl;
          },
        });
      }
      if (signatureUrl) {
        mediaCandidates.push({
          ownerUid,
          kind: "pod",
          sourceUrl: signatureUrl,
          suffix: `${loadId}_pod_signature`,
          loadId,
          assign: (storedUrl) => {
            podNode.signatureUrl = storedUrl;
          },
        });
      }
    }

    if (receiptUrl) {
      mediaCandidates.push({
        ownerUid: brokerUid,
        kind: "receipt",
        sourceUrl: receiptUrl,
        suffix: `${loadId}_receipt`,
        loadId,
        assign: (storedUrl) => {
          load.paymentReceiptUrl = storedUrl;
        },
      });
    }

    loads[loadId] = load;
    userLoads[brokerUid] ??= {};
    userLoads[brokerUid][loadId] = "broker";
    if (customerUid !== brokerUid) {
      userLoads[customerUid] ??= {};
      userLoads[customerUid][loadId] = "customer";
    }
    if (driverUid && driverUid !== brokerUid && driverUid !== customerUid && users[driverUid]) {
      userLoads[driverUid] ??= {};
      userLoads[driverUid][loadId] = "driver";
    }
  }

  const latestLocation = new Map<string, { at: number; node: Record<string, unknown> }>();
  for (const row of tables.locations) {
    const driverProfileId = asString(row.driverId);
    const driverUid = driverProfileId
      ? rtdbKey(asString(driverById.get(driverProfileId)?.userId) ?? "")
      : undefined;
    const lat = asNumber(row.lat);
    const lng = asNumber(row.lng);
    const at = asMillis(row.recordedAt) ?? Date.now();
    if (!driverUid || lat == null || lng == null) continue;
    const point = compact({
      lat,
      lng,
      at,
      loadId: asString(row.loadId) ? rtdbKey(String(row.loadId)) : undefined,
      heading: asNumber(row.heading),
      speed: asNumber(row.speed),
    });
    const previous = latestLocation.get(driverUid);
    if (!previous || at >= previous.at) latestLocation.set(driverUid, { at, node: point });
    const loadId = asString(row.loadId);
    if (loadId && loads[rtdbKey(loadId)]) {
      const key = rtdbKey(String(row.id));
      locationHistory[rtdbKey(loadId)] ??= {};
      locationHistory[rtdbKey(loadId)][key] = point;
    }
  }
  for (const [uid, latest] of latestLocation) liveLocations[uid] = latest.node;

  for (const row of tables.notifications) {
    const uid = rtdbKey(asString(row.userId) ?? "");
    if (!uid || !users[uid]) continue;
    const id = rtdbKey(String(row.id));
    let data: unknown = row.data;
    if (typeof data === "string") {
      try {
        data = JSON.parse(data);
      } catch {
        data = undefined;
      }
    }
    notifications[uid] ??= {};
    notifications[uid][id] = compact({
      type: asString(row.type) ?? "STATUS_UPDATE",
      title: asString(row.title) ?? "",
      body: asString(row.body) ?? "",
      read: asBoolean(row.read) ?? false,
      createdAt: asMillis(row.createdAt) ?? Date.now(),
      loadId: asString(row.loadId),
      data: data && typeof data === "object" ? data : undefined,
    });
  }

  for (const row of tables.devices) {
    const key = rtdbKey(asString(row.deviceId) ?? String(row.id));
    const count = asNumber(row.loadsCreated);
    if (count && count > 0) counterDevices[key] = Math.floor(count);
  }

  for (const row of tables.demoRequests) {
    const id = rtdbKey(String(row.id));
    demoRequests[id] = compact({
      email: asString(row.email) ?? "",
      source: asString(row.source) ?? "landing",
      createdAt: asMillis(row.createdAt) ?? Date.now(),
      readAt: asMillis(row.readAt),
    });
  }

  const settingsRow = tables.settings;
  const settings = settingsRow
    ? compact({
        freeLoadLimit: asNumber(settingsRow.freeLoadLimit) ?? 3,
        basePrice: asNumber(settingsRow.basePrice) ?? 50,
        pricePerKm: asNumber(settingsRow.pricePerKm) ?? 1,
        updatedAt: asMillis(settingsRow.updatedAt) ?? Date.now(),
      })
    : undefined;

  return {
    authUsers,
    users,
    brokers,
    drivers,
    customers,
    brokerDrivers,
    brokerCustomers,
    agentCodes,
    loginIndex,
    loads,
    userLoads,
    counters: {
      ...(maxRef > 0 ? { loadRef: maxRef } : {}),
      users: counterUsers,
      devices: counterDevices,
    },
    notifications,
    liveLocations,
    locationHistory,
    settings,
    admins,
    adminUsers,
    demoRequests,
    mediaCandidates,
    warnings,
  };
}

export async function assertMapping() {
  const now = new Date("2026-10-22T12:00:00.000Z");
  const payload = await buildRtdbPayload({
    users: [
      {
        id: "admin1",
        email: "admin@direexpress.com",
        passwordHash: "$2a$10$abcdefghijklmnopqrstuv",
        name: "Ada Admin",
        phone: "0911000000",
        role: "ADMIN",
        loadsCreated: 0,
        createdAt: now,
      },
      {
        id: "broker1",
        email: "Broker@Example.com",
        passwordHash: "$2b$10$brokerhashbrokerhashbrok",
        name: "Betty Broker",
        phone: "+251911111111",
        role: "BROKER",
        loadsCreated: 2,
        createdAt: now,
      },
      {
        id: "broker2",
        email: "referred@example.com",
        passwordHash: "$2b$10$brokerhashbrokerhashbro2",
        name: "Bobby Broker",
        role: "BROKER",
        loadsCreated: 0,
        createdAt: now,
      },
      {
        id: "driver1",
        email: "driver@example.com",
        passwordHash: "$2b$10$driverhashdriverhashdriv",
        name: "Desta Driver",
        phone: "0922000000",
        role: "DRIVER",
        createdAt: now,
      },
      {
        id: "customer1",
        email: "customer@example.com",
        passwordHash: "$2b$10$customerhashcustomerhash",
        name: "Chaltu Customer",
        role: "CUSTOMER",
        createdAt: now,
      },
    ],
    brokers: [
      { id: "bp1", userId: "broker1", company: "Betty Co" },
      { id: "bp2", userId: "broker2", company: "Bobby Co", referredById: "bp1" },
    ],
    drivers: [
      {
        id: "dp1",
        userId: "driver1",
        brokerId: "bp1",
        plateNo: "AA-12345",
        vehicleType: "Isuzu",
        loadingCapacity: "5.5",
        isAvailable: true,
        truckImageUrl: "/trucks/d1.jpg",
      },
    ],
    customers: [
      { id: "cp1", userId: "customer1", brokerId: "bp1", company: "Shop", address: "Bole" },
    ],
    loads: [
      {
        id: "load-pending",
        referenceNo: "DE-0007",
        status: "PENDING",
        pickupAddress: "A",
        deliveryAddress: "B",
        pickupDate: now,
        rate: "1500.50",
        paymentReceiptUrl: "/receipts/pending.jpg",
        brokerId: "bp1",
        customerId: "cp1",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "load-done",
        referenceNo: "DE-0003",
        status: "DELIVERED",
        pickupAddress: "C",
        deliveryAddress: "D",
        pickupDate: now,
        brokerId: "bp2",
        customerId: "cp1",
        driverId: "dp1",
        createdAt: now,
        updatedAt: now,
        reviewedAt: now,
      },
    ],
    devices: [{ id: "devrow", deviceId: "phone.1", loadsCreated: 4 }],
    locations: [
      {
        id: "loc1",
        driverId: "dp1",
        loadId: "load-done",
        lat: 9.03,
        lng: 38.74,
        recordedAt: now,
      },
    ],
    pods: [
      {
        id: "pod1",
        loadId: "load-done",
        photoUrl: "/pods/photo.jpg",
        signatureUrl: "/pods/sign.png",
        recipientName: "Sara",
        deliveredAt: now,
        createdAt: now,
      },
    ],
    notifications: [
      {
        id: "note1",
        userId: "broker1",
        type: "STATUS_UPDATE",
        title: "Hello",
        body: "Body",
        read: false,
        loadId: "load-pending",
        createdAt: now,
        data: { kind: "approved" },
      },
    ],
    settings: { id: "default", freeLoadLimit: 4, basePrice: "60.00", pricePerKm: "1.50", updatedAt: now },
    demoRequests: [
      { id: "demo1", email: "lead@example.com", source: "landing", createdAt: now, readAt: null },
    ],
  });

  if (payload.admins.admin1 !== true) throw new Error("admin flag missing");
  if (payload.admins.broker1) throw new Error("broker was flagged as an admin");
  const importedAdmin = payload.adminUsers.admin1;
  if (
    !importedAdmin ||
    importedAdmin.role !== "admin" ||
    importedAdmin.active !== true ||
    importedAdmin.email !== "admin@direexpress.com" ||
    importedAdmin.phone !== "0911000000"
  ) {
    throw new Error("adminUsers profile missing");
  }
  if (payload.adminUsers.broker1) throw new Error("broker was added to adminUsers");
  if (payload.authUsers.find((user) => user.uid === "broker1")?.email !== "broker.broker1@users.direexpress.app") {
    throw new Error("synthetic auth email mismatch");
  }
  if ("passwordHash" in payload.users.broker1) throw new Error("password hash leaked into RTDB");
  if (payload.brokers.broker2.referredByEmail !== "Broker@Example.com") {
    throw new Error("referral email was not preserved");
  }
  if (payload.agentCodes[String(payload.brokers.broker1.agentId)] !== "broker1") {
    throw new Error("agent code does not point at the broker uid");
  }
  const pending = payload.loads["load-pending"];
  if (pending.brokerId !== "broker1" || pending.customerId !== "customer1") {
    throw new Error("load ids were not rewritten to user uids");
  }
  if ((pending.receiptReview as { state: string }).state !== "pending") {
    throw new Error("pending receipt was not marked pending");
  }
  if (pending.rate !== 1500.5) throw new Error("decimal rate was not converted");
  if (payload.userLoads.broker1["load-pending"] !== "broker") throw new Error("userLoads broker missing");
  if (payload.userLoads.customer1["load-pending"] !== "customer") throw new Error("userLoads customer missing");
  if (payload.userLoads.broker2["load-done"] !== "broker") throw new Error("delivered load index missing");
  if (payload.counters.loadRef !== 7) throw new Error("loadRef counter mismatch");
  if (payload.counters.users.broker1 !== 2) throw new Error("user counter mismatch");
  if (payload.counters.devices["phone_1"] !== 4) throw new Error("device counter key was not sanitized");
  if (!payload.liveLocations.driver1 || !payload.locationHistory["load-done"]) {
    throw new Error("locations were not mapped");
  }
  if ((payload.loads["load-done"].pod as { recipientName: string }).recipientName !== "Sara") {
    throw new Error("pod was not embedded");
  }
  if (payload.drivers.driver1.brokerId !== "broker1") throw new Error("driver broker mismatch");
  if (!payload.brokerDrivers.broker1.driver1.nameLower) throw new Error("brokerDrivers card missing");
  if (payload.settings?.freeLoadLimit !== 4 || payload.settings.basePrice !== 60) {
    throw new Error("settings were not copied");
  }
  const emailHash = await emailIndexHash("broker@example.com");
  if (payload.loginIndex[emailHash]?.BROKER !== "broker.broker1@users.direexpress.app") {
    throw new Error("email login index mismatch");
  }
  const phoneHash = await phoneIndexHash("0911000000");
  if (!phoneHash || payload.loginIndex[phoneHash]?.ADMIN !== "admin.admin1@users.direexpress.app") {
    throw new Error("phone login index mismatch");
  }
  if (!payload.mediaCandidates.some((item) => item.kind === "receipt" && item.loadId === "load-pending")) {
    throw new Error("receipt was not queued for media import");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  assertMapping()
    .then(() => {
      console.log("map self-test ok");
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    });
}
