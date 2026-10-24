const ENCODED_WORD_BYTES = 45;

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

export function safeMailbox(value: string | undefined) {
  const email = (value ?? "").trim();
  if (!email || /[\r\n<>"]/.test(email)) return "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "";
  return email;
}

export function buildRfc2822(input: { to: string; from?: string; subject: string; html: string }) {
  const to = safeMailbox(input.to);
  if (!to) throw new Error("Recipient address is not a valid email.");
  const from = safeMailbox(input.from);
  const headers = [
    "MIME-Version: 1.0",
    `To: ${to}`,
    from ? `From: ${from}` : "",
    `Subject: ${encodeSubject(input.subject)}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
  ].filter(Boolean);
  const body = wrapBase64(bytesToBase64(utf8(input.html)));
  return `${headers.join("\r\n")}\r\n\r\n${body}`;
}

export function buildRawMime(input: { to: string; from?: string; subject: string; html: string }) {
  return bytesToBase64Url(utf8(buildRfc2822(input)));
}
