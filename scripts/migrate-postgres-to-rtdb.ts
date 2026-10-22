import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { getAuth } from "firebase-admin/auth";
import { getDatabase, type Database } from "firebase-admin/database";
import { initAdminApp } from "./admin-sdk";
import { buildRtdbPayload, rtdbKey, type PgTables, type RtdbPayload, type Row } from "./map-to-rtdb";

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "application/pdf",
]);
const RAW_CHUNK = 261_120;
const MAX_BYTES = 5 * 1024 * 1024;

function pgUrl(raw: string) {
  const url = new URL(raw);
  url.searchParams.delete("schema");
  return url.toString();
}

async function readTable(client: pg.Client, table: string): Promise<Row[]> {
  const result = await client.query(`SELECT * FROM "${table}"`);
  return result.rows as Row[];
}

function mimeFrom(filePath: string, header?: string | null) {
  const fromHeader = header?.split(";")[0]?.trim().toLowerCase();
  if (fromHeader === "image/jpg") return "image/jpeg";
  if (fromHeader && ALLOWED_MIME.has(fromHeader)) return fromHeader;
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".heic": "image/heic",
    ".pdf": "application/pdf",
  };
  return map[ext] ?? fromHeader ?? "application/octet-stream";
}

async function readSource(storedUrl: string) {
  if (storedUrl.startsWith("rtdb-media://")) return null;
  if (storedUrl.startsWith("data:")) {
    const match = /^data:([^;,]+);base64,(.+)$/i.exec(storedUrl);
    if (!match) return null;
    const mime = mimeFrom("", match[1]);
    return { body: Buffer.from(match[2], "base64"), mime };
  }

  if (/^https?:\/\//i.test(storedUrl)) {
    try {
      const response = await fetch(storedUrl);
      if (!response.ok) return null;
      const body = Buffer.from(await response.arrayBuffer());
      return { body, mime: mimeFrom(new URL(storedUrl).pathname, response.headers.get("content-type")) };
    } catch {
      return null;
    }
  }

  if (!storedUrl.startsWith("/")) return null;
  const normalized = path.posix.normalize(storedUrl.replace(/^\/+/, ""));
  if (normalized.startsWith("..")) return null;
  const candidates = [
    path.join(process.cwd(), "public", normalized),
    path.join(process.cwd(), "..", "dire-express", "public", normalized),
  ];
  for (const candidate of candidates) {
    try {
      const body = await readFile(candidate);
      return { body, mime: mimeFrom(candidate) };
    } catch {
      // try the next location
    }
  }
  return null;
}

function chunkBase64(body: Buffer) {
  const parts: string[] = [];
  for (let offset = 0; offset < body.length; offset += RAW_CHUNK) {
    parts.push(body.subarray(offset, offset + RAW_CHUNK).toString("base64"));
  }
  return parts;
}

async function importMedia(db: Database, payload: RtdbPayload) {
  let stored = 0;
  let skipped = 0;
  for (const candidate of payload.mediaCandidates) {
    const source = await readSource(candidate.sourceUrl);
    if (!source || !ALLOWED_MIME.has(source.mime) || source.body.length === 0 || source.body.length > MAX_BYTES) {
      skipped += 1;
      continue;
    }
    const parts = chunkBase64(source.body);
    if (parts.length === 0 || parts.length > 20 || parts.some((part) => part.length > 349_528)) {
      skipped += 1;
      continue;
    }
    const mediaId = rtdbKey(`${candidate.ownerUid}_${candidate.suffix}`);
    const chunks: Record<string, string> = {};
    parts.forEach((part, index) => {
      chunks[String(index)] = part;
    });
    await db.ref(`mediaChunks/${mediaId}`).set(chunks);
    await db.ref(`media/${mediaId}/meta`).set({
      ownerUid: candidate.ownerUid,
      kind: candidate.kind,
      mime: source.mime,
      size: source.body.length,
      chunkCount: parts.length,
      createdAt: Date.now(),
      ...(candidate.loadId ? { loadId: candidate.loadId } : {}),
    });
    candidate.assign(`rtdb-media://${mediaId}`);
    stored += 1;
  }
  return { stored, skipped };
}

async function updateMap(db: Database, nodePath: string, value: object) {
  const entries = Object.entries(value);
  if (!entries.length) return;
  for (let index = 0; index < entries.length; index += 40) {
    await db.ref(nodePath).update(Object.fromEntries(entries.slice(index, index + 40)));
  }
}

async function setAtLeast(db: Database, nodePath: string, value: number) {
  await db.ref(nodePath).transaction((current) => {
    const existing = typeof current === "number" ? current : 0;
    return Math.max(existing, value);
  });
}

async function writePayload(db: Database, payload: RtdbPayload) {
  await updateMap(db, "users", payload.users);
  await updateMap(db, "brokers", payload.brokers);
  await updateMap(db, "drivers", payload.drivers);
  await updateMap(db, "customers", payload.customers);
  await updateMap(db, "brokerDrivers", payload.brokerDrivers);
  await updateMap(db, "brokerCustomers", payload.brokerCustomers);
  await updateMap(db, "agentCodes", payload.agentCodes);
  await updateMap(db, "loginIndex", payload.loginIndex);
  await updateMap(db, "loads", payload.loads);
  await updateMap(db, "userLoads", payload.userLoads);
  await updateMap(db, "notifications", payload.notifications);
  await updateMap(db, "liveLocations", payload.liveLocations);
  await updateMap(db, "locationHistory", payload.locationHistory);
  await updateMap(db, "admins", payload.admins);
  await updateMap(db, "adminUsers", payload.adminUsers);
  await updateMap(db, "demoRequests", payload.demoRequests);
  for (const [uid, count] of Object.entries(payload.counters.users)) {
    await setAtLeast(db, `counters/users/${uid}`, count);
  }
  for (const [deviceId, count] of Object.entries(payload.counters.devices)) {
    await setAtLeast(db, `counters/devices/${deviceId}`, count);
  }
  if (payload.counters.loadRef) {
    await setAtLeast(db, "counters/loadRef", payload.counters.loadRef);
  }
  if (payload.settings) await db.ref("settings").update(payload.settings);
}

async function importAuthUsers(payload: RtdbPayload) {
  if (!payload.authUsers.length) {
    console.log("No auth users to import.");
    return;
  }
  const auth = getAuth();
  let successCount = 0;
  let failureCount = 0;

  for (let offset = 0; offset < payload.authUsers.length; offset += 100) {
    const batch = payload.authUsers.slice(offset, offset + 100);
    const result = await auth.importUsers(
      batch.map((user) => ({
        uid: user.uid,
        email: user.email,
        emailVerified: true,
        displayName: user.displayName,
        passwordHash: Buffer.from(user.passwordHash),
      })),
      { hash: { algorithm: "BCRYPT" } }
    );
    successCount += result.successCount;
    failureCount += result.failureCount;

    for (const failure of result.errors) {
      const user = batch[failure.index];
      if (failure.error.code === "auth/uid-already-exists" && user) {
        try {
          await auth.updateUser(user.uid, {
            email: user.email,
            displayName: user.displayName,
            emailVerified: true,
          });
          console.log(`auth updated existing ${user.uid}`);
        } catch (error) {
          console.error(
            `auth update failed for ${user.uid}: ${error instanceof Error ? error.message : error}`
          );
        }
        continue;
      }
      console.error(`auth import failed for ${user?.uid}: ${failure.error.message}`);
    }
  }

  console.log(`auth imported ${successCount} new users, ${failureCount} existing or failed`);
}

function summarize(payload: RtdbPayload) {
  console.log(
    JSON.stringify(
      {
        users: Object.keys(payload.users).length,
        admins: Object.keys(payload.admins).length,
        adminUsers: Object.keys(payload.adminUsers).length,
        brokers: Object.keys(payload.brokers).length,
        drivers: Object.keys(payload.drivers).length,
        customers: Object.keys(payload.customers).length,
        loads: Object.keys(payload.loads).length,
        notifications: Object.values(payload.notifications).reduce((sum, items) => sum + Object.keys(items).length, 0),
        demoRequests: Object.keys(payload.demoRequests).length,
        mediaCandidates: payload.mediaCandidates.length,
        warnings: payload.warnings,
      },
      null,
      2
    )
  );
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("Set DATABASE_URL to the current Postgres database.");
  }

  const client = new pg.Client({ connectionString: pgUrl(process.env.DATABASE_URL) });
  await client.connect();
  let tables: PgTables;
  try {
    const [users, brokers, drivers, customers, loads, devices, locations, pods, notifications, settingsRows, demoRequests] =
      await Promise.all([
        readTable(client, "User"),
        readTable(client, "BrokerProfile"),
        readTable(client, "DriverProfile"),
        readTable(client, "CustomerProfile"),
        readTable(client, "Load"),
        readTable(client, "Device"),
        readTable(client, "DriverLocation"),
        readTable(client, "ProofOfDelivery"),
        readTable(client, "Notification"),
        readTable(client, "AppSettings"),
        readTable(client, "DemoRequest"),
      ]);
    tables = {
      users,
      brokers,
      drivers,
      customers,
      loads,
      devices,
      locations,
      pods,
      notifications,
      settings: settingsRows[0] ?? null,
      demoRequests,
    };
  } finally {
    await client.end();
  }

  const payload = await buildRtdbPayload(tables);
  summarize(payload);
  if (process.argv.includes("--dry-run")) {
    console.log("Dry run only. Nothing was written.");
    return;
  }

  initAdminApp();
  const db = getDatabase();
  await importAuthUsers(payload);
  const media = await importMedia(db, payload);
  console.log(`media stored ${media.stored}, left as original URLs ${media.skipped}`);
  await writePayload(db, payload);
  console.log("Realtime Database import finished.");
  if (!Object.keys(payload.admins).length) {
    console.log("No ADMIN users were found. Run npm run db:seed to create the first admin.");
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
