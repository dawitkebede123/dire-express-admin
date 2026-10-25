import { htmlToPlainText, prepareOutgoingHtml } from "@/lib/newsletter/deliverability";

const ENCODED_WORD_BYTES = 45;
export const SENDER_DISPLAY_NAME = "Dire Express";

function utf8(value: string) {
  return new TextEncoder().encode(value);
}

export function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const size = 0x8000;
  for (let index = 0; index < bytes.length; index += size) {
    binary += String.fromCharCode(...bytes.subarray(index, index + size));
  }
  return btoa(binary);
}

export function bytesToBase64Url(bytes: Uint8Array) {
  return bytesToBase64(bytes).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function chunkUtf8(bytes: Uint8Array, limit: number) {
  const chunks: Uint8Array[] = [];
  let index = 0;
  while (index < bytes.length) {
    let end = Math.min(index + limit, bytes.length);
    while (end > index && end < bytes.length && (bytes[end] & 0xc0) === 0x80) end -= 1;
    if (end === index) end = Math.min(index + limit, bytes.length);
    chunks.push(bytes.subarray(index, end));
    index = end;
  }
  return chunks;
}

export function encodeSubject(subject: string) {
  const cleaned = subject.replace(/[\r\n]+/g, " ").trim();
  if (!cleaned) return "";
  return chunkUtf8(utf8(cleaned), ENCODED_WORD_BYTES)
    .map((chunk) => `=?UTF-8?B?${bytesToBase64(chunk)}?=`)
    .join("\r\n ");
}

function wrapBase64(value: string) {
  const lines: string[] = [];
  for (let index = 0; index < value.length; index += 76) {
    lines.push(value.slice(index, index + 76));
  }
  return lines.join("\r\n");
}

function quotedPrintable(value: string) {
  const normalized = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return normalized.split("\n").map(encodeQuotedPrintableLine).join("\r\n");
}

function encodeQuotedPrintableLine(line: string) {
  const bytes = utf8(line);
  let trailing = bytes.length;
  while (trailing > 0 && (bytes[trailing - 1] === 32 || bytes[trailing - 1] === 9)) trailing -= 1;
  let encoded = "";
  for (let index = 0; index < bytes.length; index += 1) {
    const byte = bytes[index];
    const printable = byte === 9 || (byte >= 32 && byte <= 126 && byte !== 61);
    if (printable && index < trailing) encoded += String.fromCharCode(byte);
    else encoded += `=${byte.toString(16).toUpperCase().padStart(2, "0")}`;
  }
  const parts: string[] = [];
  while (encoded.length > 75) {
    let take = 75;
    if (encoded[take - 1] === "=") take -= 1;
    else if (encoded[take - 2] === "=") take -= 2;
    parts.push(`${encoded.slice(0, take)}=`);
    encoded = encoded.slice(take);
  }
  parts.push(encoded);
  return parts.join("\r\n");
}

export function safeMailbox(value: string | undefined) {
  const email = (value ?? "").trim();
  if (!email || /[\r\n<>",;]/.test(email)) return "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "";
  return email;
}

function formatMailbox(email: string, displayName?: string) {
  const name = (displayName ?? "").replace(/[\r\n]+/g, " ").trim();
  if (!name) return email;
  if (/^[\u0020-\u007e]+$/.test(name) && !/["\\,]/.test(name)) return `${name} <${email}>`;
  return `${encodeSubject(name)} <${email}>`;
}

function rfc5322Date(date: Date) {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${days[date.getUTCDay()]}, ${pad(date.getUTCDate())} ${months[date.getUTCMonth()]} ${date.getUTCFullYear()} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())} +0000`;
}

function createMessageId(domain: string) {
  const unique = `${Date.now().toString(36)}.${Math.random().toString(36).slice(2, 12)}`;
  return `<${unique}@${domain}>`;
}

export function buildRfc2822(input: {
  to: string;
  from?: string;
  subject: string;
  html: string;
  displayName?: string;
}) {
  const to = safeMailbox(input.to);
  if (!to) throw new Error("Send exactly one recipient in To.");
  const from = safeMailbox(input.from);
  if (!from) throw new Error("Sign in with Google so the message has a From address.");
  const domain = from.split("@")[1];
  if (!domain) throw new Error("The sender address has no domain.");
  const html = prepareOutgoingHtml(input.html, from);
  const plain = htmlToPlainText(html);
  let boundary = `dire_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  if (html.includes(boundary) || plain.includes(boundary)) {
    boundary = `dire_${crypto.randomUUID().replaceAll("-", "")}`;
  }
  const headers = [
    "MIME-Version: 1.0",
    `Date: ${rfc5322Date(new Date())}`,
    `Message-ID: ${createMessageId(domain)}`,
    `From: ${formatMailbox(from, input.displayName ?? SENDER_DISPLAY_NAME)}`,
    `Reply-To: ${from}`,
    `To: ${to}`,
    `Subject: ${encodeSubject(input.subject)}`,
    `List-Unsubscribe: <mailto:${from}?subject=unsubscribe>`,
    "List-Unsubscribe-Post: List-Unsubscribe=One-Click",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];
  const parts = [
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: quoted-printable",
    "",
    quotedPrintable(plain),
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(bytesToBase64(utf8(html))),
    `--${boundary}--`,
    "",
  ];
  return `${headers.join("\r\n")}\r\n\r\n${parts.join("\r\n")}`;
}

export function buildRawMime(input: {
  to: string;
  from?: string;
  subject: string;
  html: string;
  displayName?: string;
}) {
  return bytesToBase64Url(utf8(buildRfc2822(input)));
}
