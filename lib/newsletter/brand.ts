import { NEWSLETTER_WEBSITE_LABEL, NEWSLETTER_WEBSITE_URL } from "@/lib/newsletter/links";

// Sampled from the Dire Express icon at https://direexpress.com.et/icon-512.png,
// which is the same mark as https://direexpress.com.et/favicon.ico. This admin
// repo has no favicon of its own. #FE6100 is the most common orange pixel (the
// arrow). #011B3C is the most common navy pixel (the circle). White on the
// orange is about 3:1, so the button text uses the navy (about 5.7:1).
export const BRAND_ORANGE = "#FE6100";
export const BRAND_NAVY = "#011B3C";

const OLD_ORANGE = /#ff6b00/gi;

export function websiteButtonHtml(label = NEWSLETTER_WEBSITE_LABEL) {
  const safe = label.replace(/[<>]/g, "");
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 18px 0;border-collapse:separate;">
<tr>
<td align="center" bgcolor="${BRAND_ORANGE}" style="background-color:${BRAND_ORANGE};border-radius:6px;mso-padding-alt:12px 22px;">
<a href="${NEWSLETTER_WEBSITE_URL}" target="_blank" style="display:inline-block;padding:12px 22px;font-family:Georgia,'Times New Roman',serif;font-size:18px;line-height:24px;font-weight:700;color:${BRAND_NAVY};text-decoration:none;">${safe}</a>
</td>
</tr>
</table>`;
}

function styleMap(style: string) {
  const decls = new Map<string, string>();
  for (const part of style.split(";")) {
    const index = part.indexOf(":");
    if (index === -1) continue;
    const key = part.slice(0, index).trim().toLowerCase();
    const value = part.slice(index + 1).trim();
    if (key && value) decls.set(key, value);
  }
  return decls;
}

function mergeOpenTag(open: string, updates: Record<string, string>) {
  const found = /style\s*=\s*"([^"]*)"/i.exec(open);
  const decls = styleMap(found?.[1] ?? "");
  for (const [key, value] of Object.entries(updates)) decls.set(key.toLowerCase(), value);
  const style = Array.from(decls.entries())
    .map(([key, value]) => `${key}:${value}`)
    .join(";");
  if (found) return open.replace(found[0], `style="${style}"`);
  return open.replace(/^<([a-z0-9]+)/i, `<$1 style="${style}"`);
}

function hrefOf(open: string) {
  return /href\s*=\s*"([^"]*)"/i.exec(open)?.[1] ?? "";
}

function restyleOrangeButtons(html: string) {
  return html.replace(
    /(<td\b[^>]*\bbackground-color:\s*#FE6100\b[^>]*>\s*)(<a\b[^>]*>)/gi,
    (_match, td: string, open: string) => {
      const href = hrefOf(open);
      const website = /direexpress\.com\.et/i.test(href);
      const declared = styleMap(/style\s*=\s*"([^"]*)"/i.exec(open)?.[1] ?? "").get("font-size");
      const large = website || declared === "18px";
      return (
        td +
        mergeOpenTag(open, {
          "font-weight": "700",
          color: BRAND_NAVY,
          "text-decoration": "none",
          "font-size": large ? "18px" : "16px",
          "line-height": large ? "24px" : "22px",
        })
      );
    },
  );
}

function recolorActionCell(html: string, host: string) {
  const pattern = new RegExp(
    `<td\\b[^>]*>\\s*<a\\b[^>]*href="[^"]*${host}[^"]*"[^>]*>[\\s\\S]*?</a>\\s*</td>`,
    "gi",
  );
  return html.replace(pattern, (cell) =>
    cell
      .replace(/bgcolor="#0B1F3A"/gi, `bgcolor="${BRAND_ORANGE}"`)
      .replace(/background-color:\s*#0B1F3A/gi, `background-color:${BRAND_ORANGE}`),
  );
}

function upgradePlainWebsiteLink(html: string) {
  return html.replace(
    /<p\b[^>]*>\s*(<a\b[^>]*href="https?:\/\/direexpress\.com\.et\/?"[^>]*>[\s\S]*?<\/a>)\s*<\/p>/gi,
    (paragraph, anchor: string) => {
      if (/display\s*:\s*(?:inline-block|block)/i.test(anchor)) return paragraph;
      const inner = anchor
        .replace(/<[^>]+>/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/^https?:\/\//i, "")
        .replace(/\/$/, "");
      return websiteButtonHtml(inner || NEWSLETTER_WEBSITE_LABEL);
    },
  );
}

function restyleLooseLinks(html: string) {
  return html.replace(/<a\b[^>]*>[\s\S]*?<\/a>/gi, (anchor) => {
    const openMatch = /^<a\b[^>]*>/i.exec(anchor);
    if (!openMatch) return anchor;
    const open = openMatch[0];
    const href = hrefOf(open);
    if (href.startsWith("#") || /\blang-link\b/i.test(open)) return anchor;
    if (/<table\b/i.test(anchor)) return anchor;
    const color = styleMap(/style\s*=\s*"([^"]*)"/i.exec(open)?.[1] ?? "").get("color");
    if (
      /display\s*:\s*(?:inline-block|block)/i.test(open) &&
      /padding\s*:/i.test(open) &&
      color?.toLowerCase() === BRAND_NAVY.toLowerCase()
    ) {
      return anchor;
    }

    const social =
      /\bsoc\b/i.test(open) ||
      /(?:^|\/\/)(?:t\.me|www\.facebook\.com|facebook\.com|www\.linkedin\.com|linkedin\.com)(?:\/|$)/i.test(href);
    const unsubscribe = /unsubscribe/i.test(href) || /unsubscribe|ምዝገባ/i.test(anchor);
    const quiet = unsubscribe || /preferences_url|\{\{\s*mirror|view_in_browser/i.test(href);
    const website = /direexpress\.com\.et/i.test(href);
    if (!social && !quiet && !website && !href.startsWith("mailto:")) return anchor;

    const updates: Record<string, string> = {
      color: BRAND_ORANGE,
      "font-weight": "700",
      "text-decoration": "underline",
    };
    if (social) {
      updates["font-size"] = "14px";
      updates["line-height"] = "20px";
      updates["text-decoration"] = "none";
      const border = styleMap(/style\s*=\s*"([^"]*)"/i.exec(open)?.[1] ?? "").get("border");
      if (border) updates.border = border.replace(/#[0-9a-f]{3,8}/i, BRAND_ORANGE);
    } else if (website || href.startsWith("mailto:")) {
      updates["font-size"] = "18px";
      updates["line-height"] = "24px";
    } else {
      updates["font-size"] = "14px";
      updates["line-height"] = "20px";
    }
    return mergeOpenTag(open, updates) + anchor.slice(open.length);
  });
}

// Recolors the saved dark template's buttons and the previous plain-letter link.
// A link that is already the bulletproof button is left as that button.
export function emphasizeNewsletterLinks(html: string) {
  let next = html.replace(OLD_ORANGE, BRAND_ORANGE);
  next = recolorActionCell(next, "groups\\.google\\.com");
  next = upgradePlainWebsiteLink(next);
  next = restyleOrangeButtons(next);
  next = restyleLooseLinks(next);
  return next;
}
