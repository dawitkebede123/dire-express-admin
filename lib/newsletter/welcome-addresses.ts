import { isEmailAddress } from "@/lib/newsletter/recipients";

export type ParsedWelcomeAddresses = {
  valid: string[];
  invalid: string[];
};

// Commas, semicolons, and any whitespace separate addresses. Repeats are dropped.
export function parseWelcomeAddresses(raw: string): ParsedWelcomeAddresses {
  const parts = raw.split(/[\s,;]+/);
  const seen = new Set<string>();
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const part of parts) {
    const email = part.trim().toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    if (email.length > 3 && email.length <= 200 && isEmailAddress(email)) valid.push(email);
    else invalid.push(email);
  }
  return { valid, invalid };
}
