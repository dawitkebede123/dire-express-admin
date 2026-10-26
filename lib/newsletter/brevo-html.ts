import { escapeHtml } from "@/lib/newsletter/blocks";
import { applyNewsletterLinks } from "@/lib/newsletter/links";
import { sanitizeNewsletterHtml } from "@/lib/newsletter/deliverability";
import { recipientDisplayName, type RecipientIdentity } from "@/lib/newsletter/personalize";

const NAME_TAG = /\{\{\s*(?:name|first_name)\s*\}\}/gi;
const UNSUBSCRIBE_TAG = /\{\{\s*unsubscribe\s*\}\}/i;

export const BREVO_FIRST_NAME = "{{ contact.FIRSTNAME }}";
export const BREVO_UNSUBSCRIBE = "{{ unsubscribe }}";

export function toBrevoCampaignHtml(html: string, previewText: string) {
  let body = sanitizeNewsletterHtml(applyNewsletterLinks(html));
  body = body.replace(NAME_TAG, BREVO_FIRST_NAME);
  if (!UNSUBSCRIBE_TAG.test(body)) {
    body += `<p style="margin:24px 0 0;font-family:Arial,sans-serif;font-size:12px;line-height:16px;color:#666666;">${BREVO_UNSUBSCRIBE}</p>`;
  }
  const preview = previewText.replace(/[\r\n]+/g, " ").trim();
  if (preview) {
    const hidden = `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#ffffff;">${escapeHtml(preview)}</div>`;
    body = `${hidden}${body}`;
  }
  return body;
}

export function previewNewsletterHtml(html: string, recipient: RecipientIdentity) {
  const name = escapeHtml(recipientDisplayName(recipient));
  return html
    .replace(NAME_TAG, name)
    .replace(/\{\{\s*unsubscribe\s*\}\}/gi, "Unsubscribe");
}

export function brevoContactAttributes(recipient: RecipientIdentity) {
  return { FIRSTNAME: recipientDisplayName(recipient) };
}
