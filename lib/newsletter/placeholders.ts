import { NEWSLETTER_WEBSITE_URL } from "@/lib/newsletter/links";

// The dark newsletter prefixes visible copy with editorial labels such as
// [Headline], [CTA], and [ርዕስ]. Those are not Outlook conditionals (those sit
// inside comments) and not CSS attribute selectors (those sit inside <style>).
const SQUARE_BRACKET_TEXT = /\[[^\[\]<>]{1,80}\]\s*/g;
const PROTECTED_HTML =
  /<!--[\s\S]*?-->|<style\b[^>]*>[\s\S]*?<\/style>|<script\b[^>]*>[\s\S]*?<\/script>/gi;

const KNOWN_PLACEHOLDER = /\{\{\s*([a-z0-9_]+)\s*\}\}/gi;
const ANY_PLACEHOLDER = /\{\{[^{}]+\}\}/g;
const KEPT_PLACEHOLDER =
  /^\s*(?:unsubscribe|mirror|update_profile|name|first_name|unsubscribe_url|contact\.[A-Za-z0-9_]+)\s*$/i;

const ADDIS_ABABA = "Africa/Addis_Ababa";

function addisParts(now: Date) {
  return {
    year: new Intl.DateTimeFormat("en-GB", { timeZone: ADDIS_ABABA, year: "numeric" }).format(now),
    longDate: new Intl.DateTimeFormat("en-GB", {
      timeZone: ADDIS_ABABA,
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(now),
    numericDate: new Intl.DateTimeFormat("en-GB", {
      timeZone: ADDIS_ABABA,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(now),
  };
}

// Fills the dark template's {{year}} / {{company_address_am}} tokens.
// {{name}}, {{first_name}}, {{ unsubscribe }}, and {{unsubscribe_url}} are left
// for the Gmail or Brevo step. This app has no street address on file.
export function resolveNewsletterPlaceholders(input: string, now: Date = new Date()) {
  const parts = addisParts(now);
  const values: Record<string, string> = {
    year: parts.year,
    company_address: "direexpress.com.et",
    company_address_am: "direexpress.com.et",
    issue_date: parts.longDate,
    issue_date_am: parts.numericDate,
    issue_number: parts.year,
    preheader_am: "",
    preheader_en: "",
    preferences_url: NEWSLETTER_WEBSITE_URL,
    view_in_browser_url: NEWSLETTER_WEBSITE_URL,
    stat_value: "",
    cta_url: NEWSLETTER_WEBSITE_URL,
  };
  return input.replace(KNOWN_PLACEHOLDER, (token, key: string) => {
    const value = values[key.toLowerCase()];
    return value === undefined ? token : value;
  });
}

export function stripSquareBracketText(input: string) {
  const kept: string[] = [];
  const masked = input.replace(PROTECTED_HTML, (block) => {
    kept.push(block);
    return `\u0000${kept.length - 1}\u0000`;
  });
  const cleaned = masked.replace(SQUARE_BRACKET_TEXT, "");
  return cleaned.replace(/\u0000(\d+)\u0000/g, (_token, index: string) => kept[Number(index)] ?? "");
}

export function dropUnresolvedPlaceholders(input: string) {
  return input.replace(ANY_PLACEHOLDER, (token) => (KEPT_PLACEHOLDER.test(token.slice(2, -2)) ? token : ""));
}

export function cleanCampaignPlainText(input: string, now: Date = new Date()) {
  return dropUnresolvedPlaceholders(
    stripSquareBracketText(resolveNewsletterPlaceholders(input, now)).replace(
      /\{\{\s*(?:name|first_name|unsubscribe_url|unsubscribe)\s*\}\}/gi,
      "",
    ),
  )
    .replace(/[\r\n]+/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
