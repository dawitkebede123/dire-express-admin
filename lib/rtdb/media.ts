"use client";

import { get, ref } from "firebase/database";
import { getClientDb } from "@/lib/firebase/client";
import { isPdfUrl } from "@/lib/utils";

export type ReceiptSource = {
  url: string;
  contentType: string;
  revoke: boolean;
};

export function mediaIdFromStoredUrl(storedUrl: string) {
  const match = /^rtdb-media:\/\/([^/?#\s]+)$/i.exec(storedUrl.trim());
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

function bytesFromBase64(payload: string) {
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function contentTypeFor(storedUrl: string, mime?: string) {
  if (mime) return mime;
  if (storedUrl.startsWith("data:application/pdf") || isPdfUrl(storedUrl)) return "application/pdf";
  return "";
}

export async function loadReceiptSource(storedUrl: string): Promise<ReceiptSource | null> {
  const mediaId = mediaIdFromStoredUrl(storedUrl);
  if (mediaId) {
    if (/[.#$[\]/]/.test(mediaId)) return null;
    const db = getClientDb();
    const metaSnap = await get(ref(db, `media/${mediaId}/meta`));
    const meta = metaSnap.val() as { mime?: unknown; chunkCount?: unknown } | null;
    if (!meta) return null;

    const chunksSnap = await get(ref(db, `mediaChunks/${mediaId}`));
    const chunks = chunksSnap.val() as Record<string, unknown> | null;
    if (!chunks) return null;

    const count = typeof meta.chunkCount === "number" ? meta.chunkCount : Number(meta.chunkCount);
    const total = Number.isFinite(count) && count > 0 ? count : Object.keys(chunks).length;
    const parts: string[] = [];
    for (let index = 0; index < total; index += 1) {
      const part = chunks[String(index)];
      if (typeof part !== "string" || !part) return null;
      parts.push(part);
    }

    const contentType =
      typeof meta.mime === "string" && meta.mime ? meta.mime : "application/octet-stream";
    const blob = new Blob([bytesFromBase64(parts.join(""))], { type: contentType });
    return { url: URL.createObjectURL(blob), contentType, revoke: true };
  }

  if (storedUrl.startsWith("data:") || /^https?:\/\//i.test(storedUrl)) {
    return { url: storedUrl, contentType: contentTypeFor(storedUrl), revoke: false };
  }

  if (storedUrl.startsWith("/")) {
    const origin = process.env.NEXT_PUBLIC_MAIN_APP_URL?.replace(/\/$/, "");
    if (!origin) return null;
    return {
      url: `${origin}${storedUrl}`,
      contentType: contentTypeFor(storedUrl),
      revoke: false,
    };
  }

  return null;
}
