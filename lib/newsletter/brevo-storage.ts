"use client";

import { useSyncExternalStore } from "react";
import {
  DEFAULT_BREVO_SENDER_EMAIL,
  DEFAULT_BREVO_SENDER_NAME,
  DEFAULT_NEWSLETTER_PREVIEW,
} from "@/lib/newsletter/default-template";
import { clampBatchSize } from "@/lib/newsletter/brevo-batch";

const KEY_STORAGE = "dire-express-admin.brevoApiKey";
const SETTINGS_STORAGE = "dire-express-admin.brevoSettings";

export type BrevoProviderChoice = "" | "brevo" | "gmail";

export type BrevoSettings = {
  senderName: string;
  senderEmail: string;
  previewText: string;
  batchSize: number;
  testEmail: string;
  provider: BrevoProviderChoice;
};

export const DEFAULT_BREVO_SETTINGS: BrevoSettings = {
  senderName: DEFAULT_BREVO_SENDER_NAME,
  senderEmail: DEFAULT_BREVO_SENDER_EMAIL,
  previewText: DEFAULT_NEWSLETTER_PREVIEW,
  batchSize: 300,
  testEmail: "",
  provider: "",
};

const listeners = new Set<() => void>();
let settingsCache: BrevoSettings = DEFAULT_BREVO_SETTINGS;
let settingsRaw: string | null = null;

function emitBrevoStore() {
  for (const listener of listeners) listener();
}

export function subscribeBrevoStore(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== KEY_STORAGE && event.key !== SETTINGS_STORAGE && event.key !== null) return;
    settingsRaw = null;
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function storage() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function brevoStorageAvailable() {
  const store = storage();
  if (!store) return false;
  try {
    const probe = `${KEY_STORAGE}.probe`;
    store.setItem(probe, "1");
    store.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

export function readBrevoApiKey() {
  const store = storage();
  if (!store) return "";
  try {
    return (store.getItem(KEY_STORAGE) ?? "").trim();
  } catch {
    return "";
  }
}

export function saveBrevoApiKey(apiKey: string) {
  const store = storage();
  const trimmed = apiKey.trim();
  if (!store) throw new Error("This browser is blocking localStorage, so the API key cannot be kept here.");
  if (!trimmed) throw new Error("Paste the Brevo API key first.");
  store.setItem(KEY_STORAGE, trimmed);
  emitBrevoStore();
}

export function forgetBrevoApiKey() {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(KEY_STORAGE);
  } catch {
    // The key is already unreachable.
  }
  emitBrevoStore();
}

function parseSettings(raw: string): BrevoSettings {
  if (!raw) return DEFAULT_BREVO_SETTINGS;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return DEFAULT_BREVO_SETTINGS;
    const node = parsed as Record<string, unknown>;
    const provider: BrevoProviderChoice =
      node.provider === "brevo" || node.provider === "gmail" ? node.provider : "";
    return {
      senderName: typeof node.senderName === "string" ? node.senderName.slice(0, 120) : DEFAULT_BREVO_SETTINGS.senderName,
      senderEmail:
        typeof node.senderEmail === "string" && node.senderEmail.trim()
          ? node.senderEmail.trim()
          : DEFAULT_BREVO_SETTINGS.senderEmail,
      previewText: typeof node.previewText === "string" ? node.previewText.slice(0, 300) : DEFAULT_BREVO_SETTINGS.previewText,
      batchSize: clampBatchSize(typeof node.batchSize === "number" ? node.batchSize : DEFAULT_BREVO_SETTINGS.batchSize),
      testEmail: typeof node.testEmail === "string" ? node.testEmail.trim() : "",
      provider,
    };
  } catch {
    return DEFAULT_BREVO_SETTINGS;
  }
}

export function readBrevoSettings(): BrevoSettings {
  const store = storage();
  const raw = store ? (store.getItem(SETTINGS_STORAGE) ?? "") : "";
  if (raw === settingsRaw) return settingsCache;
  settingsRaw = raw;
  settingsCache = parseSettings(raw);
  return settingsCache;
}

export function writeBrevoSettings(settings: BrevoSettings) {
  const store = storage();
  const payload: BrevoSettings = {
    senderName: settings.senderName.slice(0, 120),
    senderEmail: settings.senderEmail.trim(),
    previewText: settings.previewText.slice(0, 300),
    batchSize: clampBatchSize(settings.batchSize),
    testEmail: settings.testEmail.trim(),
    provider: settings.provider,
  };
  settingsCache = payload;
  settingsRaw = JSON.stringify(payload);
  if (!store) return;
  try {
    store.setItem(SETTINGS_STORAGE, settingsRaw);
  } catch {
    // Settings are a convenience. The API key has its own key and its own error.
  }
  emitBrevoStore();
}

export function patchBrevoSettings(patch: Partial<BrevoSettings>) {
  writeBrevoSettings({ ...readBrevoSettings(), ...patch });
}

export function useBrevoApiKey() {
  return useSyncExternalStore(subscribeBrevoStore, readBrevoApiKey, () => "");
}

export function useBrevoSettings() {
  return useSyncExternalStore(subscribeBrevoStore, readBrevoSettings, () => DEFAULT_BREVO_SETTINGS);
}
