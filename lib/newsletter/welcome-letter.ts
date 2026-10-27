import { escapeHtml } from "@/lib/newsletter/blocks";
import { DEFAULT_BREVO_SENDER_EMAIL, DEFAULT_BREVO_SENDER_NAME } from "@/lib/newsletter/default-template";
import { htmlToPlainText, sanitizeNewsletterHtml, visibleText } from "@/lib/newsletter/deliverability";
import { isEmailAddress } from "@/lib/newsletter/recipients";
import { toTitleCaseName } from "@/lib/newsletter/title-case";

// Brevo's transactional send has no field that removes the open pixel or stops
// link rewriting. These headers are the SMTP-relay switches some accounts honor.
// contactPixelTrackingConsent false only anonymises tracking, and only when that
// account feature is on. It does not remove the pixel.
export const WELCOME_TRACKING_HEADERS = {
  "X-Mailin-Track": "false",
  "X-Mailin-Track-Clicks": "false",
  "X-Mailin-Track-Opens": "false",
} as const;

export const WELCOME_TRACKING_NOTE =
  "Brevo’s transactional API cannot turn open and click tracking off. This send still asks, with X-Mailin-Track headers set to false and contactPixelTrackingConsent set to false. That consent flag only anonymises tracking when Brevo has enabled the feature, and it leaves the pixel in place. If links still go through a Brevo tracking domain, the switch is under Transactional → Settings. A full disable is an Enterprise request. These messages do not add a List-Unsubscribe header.";

export const WELCOME_SENDER_NAME = DEFAULT_BREVO_SENDER_NAME;

export const WELCOME_HELP_EMAIL = "dawitkebedewoldu@gmail.com";

const HELP_AM = `ለማንኛውም እርዳታ በ ${WELCOME_HELP_EMAIL} ይጻፉልን።`;
const HELP_EN = `For any help, email us at ${WELCOME_HELP_EMAIL}.`;

const REPLY_LINE = "If you no longer want these notes, reply to this email.";

function mailboxLocalName(email: string) {
  const local = email.split("@")[0] ?? "";
  return toTitleCaseName(local.replace(/[._+-]+/g, " "));
}

function cleanName(value: string) {
  const name = toTitleCaseName(value).slice(0, 70);
  if (!name || isEmailAddress(name)) return "";
  return name;
}

// A name typed on a subscriber list counts. A welcome-history name that is only
// the mailbox local-part does not: that was filled in automatically.
export function knownPersonName(email: string, options: { listNames: string[]; storedName?: string }) {
  for (const candidate of options.listNames) {
    const name = cleanName(candidate);
    if (name) return name;
  }
  const stored = cleanName(options.storedName ?? "");
  if (!stored) return "";
  if (stored.toLocaleLowerCase("en") === mailboxLocalName(email).toLocaleLowerCase("en")) return "";
  return stored;
}

export function welcomeSenderEmail(configured: string) {
  const email = configured.trim();
  if (isEmailAddress(email) && email.toLowerCase().endsWith("@direexpress.com.et")) return email;
  return DEFAULT_BREVO_SENDER_EMAIL;
}

function stripMarketingUnsubscribe(html: string) {
  return html
    .replace(/<p\b[^>]*>[\s\S]*?\{\{\s*unsubscribe\s*\}\}[\s\S]*?<\/p>/gi, "")
    .replaceAll("{{ unsubscribe }}", "")
    .replaceAll("{{unsubscribe}}", "");
}

function helpParagraph(sentence: string) {
  const linked = sentence.replaceAll(
    WELCOME_HELP_EMAIL,
    `<a href="mailto:${WELCOME_HELP_EMAIL}" style="color:#011B3C;font-weight:700;text-decoration:underline;">${WELCOME_HELP_EMAIL}</a>`,
  );
  return `<p style="margin:0 0 16px 0;">${linked}</p>`;
}

function insertBeforeSignOff(html: string, signOff: string, paragraph: string) {
  const at = html.indexOf(signOff);
  if (at === -1) return `${html}\n${paragraph}`;
  const paragraphAt = html.lastIndexOf("<p", at);
  if (paragraphAt === -1) return `${paragraph}\n${html}`;
  return `${html.slice(0, paragraphAt)}${paragraph}\n${html.slice(paragraphAt)}`;
}

function ensureHelpLines(html: string) {
  let next = html;
  if (!visibleText(next).includes("ለማንኛውም እርዳታ በ")) {
    next = insertBeforeSignOff(next, "ከሰላምታ ጋር", helpParagraph(HELP_AM));
  }
  if (!visibleText(next).includes("For any help, email us at")) {
    next = insertBeforeSignOff(next, "Best regards", helpParagraph(HELP_EN));
  }
  return next;
}

function ensureReplyLine(html: string) {
  if (visibleText(html).includes(REPLY_LINE)) return html;
  return `${html}\n<p style="margin:16px 0 0 0;font-family:Georgia,'Times New Roman',serif;font-size:14px;line-height:1.5;color:#555555;">${REPLY_LINE}</p>`;
}

function applyName(value: string, name: string, escape: boolean) {
  const written = escape ? escapeHtml(name) : name;
  if (name) {
    return value.replaceAll("{{first_name}}", written).replaceAll("{{name}}", written);
  }
  return value
    .replaceAll("ሰላም {{name}}፣", "ሰላም፣")
    .replaceAll("Hello {{name}},", "Hello,")
    .replaceAll("{{first_name}}", "")
    .replaceAll("{{name}}", "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ሰላም\s+፣/g, "ሰላም፣")
    .replace(/Hello\s+,/g, "Hello,");
}

// What actually goes out: the designed letter, no images we added, no Brevo unsubscribe tag.
export function prepareWelcomeLetter(html: string, name: string) {
  const cleaned = ensureHelpLines(
    stripMarketingUnsubscribe(
      sanitizeNewsletterHtml(html)
        .replaceAll("ይጻፍሉልን", "ይጻፉልን")
        .replace(/<img\b[^>]*>/gi, "")
        .replace(/background(?:-image)?\s*:\s*url\([^)]*\)\s*;?/gi, ""),
    ),
  );
  return ensureReplyLine(applyName(cleaned, name.trim(), true));
}

export function personalizeWelcome(input: { subject: string; html: string }, name: string) {
  const html = prepareWelcomeLetter(input.html, name);
  const subject = applyName(input.subject, name.trim(), false).replace(/[\r\n]+/g, " ").trim();
  const text = htmlToPlainText(html);
  if (!text.trim()) throw new Error("The plain-text version of the welcome letter is empty.");
  return { subject, html, text };
}
