import { readFile } from "fs/promises";
import path from "path";

const MIME: Record<string, string> = {
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
};

export type ReceiptPayload = {
  body: Buffer;
  contentType: string;
};

function mimeForPath(filePath: string, fallback = "application/octet-stream") {
  return MIME[path.extname(filePath).toLowerCase()] ?? fallback;
}

function publicPathname(storedUrl: string): string | null {
  if (/^https?:\/\//i.test(storedUrl)) {
    try {
      return new URL(storedUrl).pathname;
    } catch {
      return null;
    }
  }
  if (storedUrl.startsWith("/")) return storedUrl;
  return null;
}

async function readPublicFile(relativePath: string): Promise<ReceiptPayload | null> {
  const normalized = path.posix.normalize(relativePath.replace(/^\/+/, ""));
  if (normalized.startsWith("..") || path.isAbsolute(normalized)) return null;

  const adminFile = path.join(process.cwd(), "public", normalized);
  const mainFile = path.join(process.cwd(), "..", "dire-express", "public", normalized);

  for (const candidate of [adminFile, mainFile]) {
    try {
      const body = await readFile(/* turbopackIgnore: true */ candidate);
      return { body, contentType: mimeForPath(candidate) };
    } catch {
      // try next location
    }
  }
  return null;
}

async function fetchUrl(url: string): Promise<ReceiptPayload | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const body = Buffer.from(await res.arrayBuffer());
    const contentType =
      res.headers.get("content-type") ?? mimeForPath(new URL(url).pathname);
    return { body, contentType };
  } catch {
    return null;
  }
}

export async function loadReceipt(storedUrl: string): Promise<ReceiptPayload | null> {
  if (storedUrl.startsWith("data:")) {
    const match = /^data:([^;,]+);base64,(.+)$/i.exec(storedUrl);
    if (!match) return null;
    return { body: Buffer.from(match[2], "base64"), contentType: match[1] };
  }

  const pathname = publicPathname(storedUrl);
  if (pathname) {
    const fromDisk = await readPublicFile(pathname);
    if (fromDisk) return fromDisk;
  }

  if (/^https?:\/\//i.test(storedUrl)) {
    return fetchUrl(storedUrl);
  }

  return null;
}
