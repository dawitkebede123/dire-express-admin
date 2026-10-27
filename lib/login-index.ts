const encoder = new TextEncoder();

export async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function emailIndexInput(email: string) {
  return `e:${email.trim().toLowerCase()}`;
}

/** Ethiopia-oriented phone key: `p:2519…`, matching the mobile login index. */
export function phoneIndexInput(phone: string) {
  let digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("0")) digits = `251${digits.slice(1)}`;
  else if (digits.length === 9) digits = `251${digits}`;
  return `p:${digits}`;
}

export async function emailIndexHash(email: string) {
  return sha256Hex(emailIndexInput(email));
}

export async function phoneIndexHash(phone: string) {
  const input = phoneIndexInput(phone);
  if (!input) return null;
  return sha256Hex(input);
}
