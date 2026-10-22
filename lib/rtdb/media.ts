import { adminDb } from "@/lib/firebase/admin";

export type MediaBytes = {
  body: Buffer;
  contentType: string;
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

export async function readChunkedMedia(mediaId: string): Promise<MediaBytes | null> {
  if (!mediaId || /[.#$[\]/]/.test(mediaId)) return null;

  const db = adminDb();
  const metaSnap = await db.ref(`media/${mediaId}/meta`).get();
  const meta = metaSnap.val() as { mime?: unknown; chunkCount?: unknown } | null;
  if (!meta) return null;

  const chunksSnap = await db.ref(`mediaChunks/${mediaId}`).get();
  const chunks = chunksSnap.val() as Record<string, unknown> | null;
  if (!chunks) return null;

  const count = typeof meta.chunkCount === "number" ? meta.chunkCount : Number(meta.chunkCount);
  const total = Number.isFinite(count) && count > 0 ? count : Object.keys(chunks).length;
  const parts: string[] = [];
  for (let index = 0; index < total; index++) {
    const part = chunks[String(index)];
    if (typeof part !== "string" || !part) return null;
    parts.push(part);
  }

  const contentType = typeof meta.mime === "string" && meta.mime ? meta.mime : "application/octet-stream";
  return { body: Buffer.from(parts.join(""), "base64"), contentType };
}
