import { websiteButtonHtml } from "@/lib/newsletter/brand";

// Default newsletter loaded when newsletter/template is empty.
// A short personal letter lands in Gmail Primary more often than a designed marketing email.
// {{name}} is the recipient's full name. {{first_name}} is an alias for that same full name.
// {{ unsubscribe }} is left for Brevo to replace. The Gmail path turns it into a mailto link.
// The button uses the favicon orange (#FE6100) with navy text (#011B3C).

export const DEFAULT_NEWSLETTER_SUBJECT = "A note from Dawit at Dire Express";

export const DEFAULT_NEWSLETTER_PREVIEW =
  "A short note from Dawit, and the link to direexpress.com.et.";

export const DEFAULT_BREVO_SENDER_NAME = "Dawit from Dire Express";

export const DEFAULT_BREVO_SENDER_EMAIL = "contact@direexpress.com.et";

export const DEFAULT_NEWSLETTER_HTML = `<div style="font-family: Georgia, 'Times New Roman', serif; font-size: 16px; line-height: 1.6; color: #222222; max-width: 560px;">
<p style="margin: 0 0 16px 0;">Hello {{name}},</p>
<p style="margin: 0 0 16px 0;"><!--dx:letter-->I wanted to write to you myself. Dire Express is how we move freight across Ethiopia, and the simplest way to open it is the link below.<!--/dx:letter--></p>
${websiteButtonHtml()}
<p style="margin: 0;">Dawit<br>Dire Express</p>
<p style="margin: 24px 0 0 0; font-family: Arial, sans-serif; font-size: 14px; line-height: 20px; font-weight: 700; color: #FE6100;">{{ unsubscribe }}</p>
</div>
`;
