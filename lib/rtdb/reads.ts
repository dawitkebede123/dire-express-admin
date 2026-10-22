"use client";

import { get, ref } from "firebase/database";
import { getClientDb } from "@/lib/firebase/client";
import type { BrokerNode, DemoNode, Directory, LoadNode, SettingsNode, UserNode } from "@/lib/data";

let directoryPromise: Promise<Directory> | null = null;
const listeners = new Set<() => void>();

function asRecord<T>(value: unknown): Record<string, T> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, T>;
}

async function fetchDirectory(): Promise<Directory> {
  const db = getClientDb();
  const [users, brokers, loads, demoRequests, settings] = await Promise.all([
    get(ref(db, "users")),
    get(ref(db, "brokers")),
    get(ref(db, "loads")),
    get(ref(db, "demoRequests")),
    get(ref(db, "settings")),
  ]);
  const settingsValue = settings.val() as SettingsNode | null;
  return {
    users: asRecord<UserNode>(users.val()),
    brokers: asRecord<BrokerNode>(brokers.val()),
    loads: asRecord<LoadNode>(loads.val()),
    demoRequests: asRecord<DemoNode>(demoRequests.val()),
    settings: settingsValue && typeof settingsValue === "object" ? settingsValue : null,
  };
}

export function loadDirectory() {
  if (!directoryPromise) {
    directoryPromise = fetchDirectory().catch((error: unknown) => {
      directoryPromise = null;
      throw error;
    });
  }
  return directoryPromise;
}

export function onDirectoryInvalidated(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function invalidateDirectory() {
  directoryPromise = null;
  for (const listener of listeners) listener();
}

export function explainReadError(error: unknown) {
  const message = error instanceof Error ? error.message : "Could not load data";
  if (message.includes("PERMISSION_DENIED")) {
    return "Realtime Database denied this read. Deploy the rules and confirm admins/{uid} is true and adminUsers/{uid} is active.";
  }
  return message;
}
