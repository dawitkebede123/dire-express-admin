import { BRAND_ORANGE, emphasizeNewsletterLinks } from "@/lib/newsletter/brand";
import { applyForwarderCopy } from "@/lib/newsletter/forwarder-copy";
import { decodeHtmlText } from "@/lib/newsletter/blocks";
import { applyNewsletterLinks } from "@/lib/newsletter/links";
import {
  dropUnresolvedPlaceholders,
  resolveNewsletterPlaceholders,
  stripSquareBracketText,
} from "@/lib/newsletter/placeholders";

export const GMAIL_CLIP_BYTES = 100 * 1024;

const FONT_HOST =
  /fonts\.(?:googleapis|gstatic)\.com|use\.typekit\.net|fonts\.cdnfonts\.com|api\.fontshare\.com|use\.fontawesome\.com/i;

const SHORTENER =
  /(?:^|\/\/|\.)(?:bit\.ly|tinyurl\.com|t\.co|goo\.gl|ow\.ly|is\.gd|buff\.ly|rebrand\.ly|cutt\.ly|tiny\.cc|short\.link|rb\.gy)(?:\/|$)/i;

export type SpamWarning = {
  id: string;
  message: string;
};

export function visibleText(html: string) {
  return decodeHtmlText(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  ).replace(/\s+/g, " ").trim();
}

export function sanitizeNewsletterHtml(html: string) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<script\b[^>]*\/?>/gi, "")
    .replace(/<link\b[^>]*>/gi, (tag) => {
      const href = /href\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1] ?? "";
      if (FONT_HOST.test(href) || /\.(?:woff2?|ttf|otf|eot)(?:$|\?)/i.test(href)) return "";
      return tag;
    })
    .replace(/@import\s+(?:url\(\s*)?['"]?https?:\/\/[^)'";]+['"]?\s*\)?\s*;?/gi, (rule) =>
      FONT_HOST.test(rule) ? "" : rule,
    )
    .replace(/@font-face\s*\{[^}]*\}/gi, (block) => (/url\(\s*['"]?https?:/i.test(block) ? "" : block));
}

function gmailUnsubscribeHtml(sender: string) {
  const mailbox = sender.trim();
  const mailto = mailbox ? `mailto:${mailbox}?subject=${encodeURIComponent("unsubscribe")}` : "";
  if (mailto) {
    return `<a href="${mailto}" style="color:${BRAND_ORANGE};font-weight:700;font-size:14px;line-height:20px;text-decoration:underline;">Unsubscribe</a>`;
  }
  return "Reply with the subject unsubscribe.";
}

export function ensureUnsubscribeFooter(html: string, sender: string) {
  const mailbox = sender.trim();
  const mailto = mailbox ? `mailto:${mailbox}?subject=${encodeURIComponent("unsubscribe")}` : "";
  const link = gmailUnsubscribeHtml(sender);
  let next = html.replaceAll("{{ unsubscribe }}", link).replaceAll("{{unsubscribe}}", link);
  next = mailto ? next.replaceAll("{{unsubscribe_url}}", mailto) : next;
  const text = visibleText(next);
  if (/unsubscribe|ምዝገባ/i.test(text)) return next;
  const line = mailto
    ? `<p style="margin:16px 0 0 0;font-family:Arial,sans-serif;font-size:14px;line-height:20px;color:#5B6B82;text-align:center;">If you no longer want these emails, <a href="${mailto}" style="color:${BRAND_ORANGE};font-weight:700;text-decoration:underline;">unsubscribe</a>.</p>`
    : `<p style="margin:16px 0 0 0;font-family:Arial,sans-serif;font-size:12px;line-height:18px;color:#5B6B82;text-align:center;">If you no longer want these emails, reply with the subject unsubscribe.</p>`;
  if (/<\/body>/i.test(next)) return next.replace(/<\/body>/i, `${line}\n</body>`);
  return `${next}\n${line}`;
}

export function prepareOutgoingHtml(html: string, sender: string, now: Date = new Date()) {
  const cleaned = stripSquareBracketText(
    resolveNewsletterPlaceholders(
      emphasizeNewsletterLinks(sanitizeNewsletterHtml(applyNewsletterLinks(applyForwarderCopy(html)))),
      now,
    ),
  );
  return dropUnresolvedPlaceholders(ensureUnsubscribeFooter(cleaned, sender));
}

export function htmlToPlainText(html: string) {
  let text = html.replace(/<!--[\s\S]*?-->/g, "");
  text = text.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
  text = text.replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, "");
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/(p|div|h[1-6]|tr|li|table|blockquote)>/gi, "\n");
  text = text.replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_match, href: string, label: string) => {
    const words = label.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    if (!href || href.startsWith("#") || href.includes("{{")) return words;
    if (/^mailto:/i.test(href)) {
      const raw = href.slice(href.indexOf(":") + 1).split("?")[0] ?? "";
      let mailbox = raw;
      try {
        mailbox = decodeURIComponent(raw);
      } catch {
        mailbox = raw;
      }
      if (!words || words.toLowerCase() === mailbox.toLowerCase()) return words || mailbox;
      return `${words} (${mailbox})`;
    }
    if (!words || words === href) return href;
    return `${words} (${href})`;
  });
  text = text.replace(/<[^>]+>/g, "");
  text = decodeHtmlText(text).replace(/\u00a0/g, " ");
  text = text
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text || "Dire Express";
}

function imageSources(html: string) {
  const sources: string[] = [];
  for (const match of html.matchAll(/\b(?:src|background)\s*=\s*["']([^"']+)["']/gi)) sources.push(match[1]);
  for (const match of html.matchAll(/url\(\s*["']?(https?:[^)"']+)/gi)) sources.push(match[1]);
  return sources;
}

export function newsletterSpamWarnings(input: { subject: string; html: string }): SpamWarning[] {
  const warnings: SpamWarning[] = [];
  const subject = input.subject.trim();
  const letters = subject.replace(/[^A-Za-z]/g, "");
  if ((letters.length >= 8 && letters === letters.toUpperCase()) || subject.includes("!!!")) {
    warnings.push({
      id: "subject",
      message: 'The subject is all caps or contains "!!!". Spam filters treat that as a trigger.',
    });
  }

  const words = visibleText(input.html).split(/\s+/).filter(Boolean);
  const images = (input.html.match(/<img\b/gi) ?? []).length;
  if (images > 0 && words.length < 30) {
    warnings.push({
      id: "image",
      message: "This email is mostly one big image. Filters trust messages that are mostly real text.",
    });
  }

  if (SHORTENER.test(input.html) || SHORTENER.test(subject)) {
    warnings.push({
      id: "shortener",
      message: "A link shortener (bit.ly and similar) is a common spam signal. Use the full https address.",
    });
  }

  if (new TextEncoder().encode(input.html).length > GMAIL_CLIP_BYTES) {
    warnings.push({
      id: "size",
      message: "This HTML is over about 100 KB. Gmail clips messages that large.",
    });
  }

  if (imageSources(input.html).some((src) => /^http:\/\//i.test(src))) {
    warnings.push({
      id: "http-image",
      message: "An image is loaded over http. Host images on https.",
    });
  }

  return warnings;
}
