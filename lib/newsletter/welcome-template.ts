import { BRAND_NAVY, BRAND_ORANGE } from "@/lib/newsletter/brand";
import {
  NEWSLETTER_FACEBOOK_URL,
  NEWSLETTER_LINKEDIN_URL,
  NEWSLETTER_TELEGRAM_URL,
  NEWSLETTER_WEBSITE_URL,
} from "@/lib/newsletter/links";

// Default tester welcome, used when newsletter/welcomeTemplate is empty.
// Amharic first, then English. No images. {{name}} is the recipient's full name.
// {{ unsubscribe }} is left for Brevo. The Gmail path turns it into a mailto link.
// Buttons use the favicon orange (#FE6100) with navy text (#011B3C).
// <!--dx:welcome--> keeps the newsletter freight-forwarder note out of this letter.

export const WELCOME_TESTER_URL = "https://play.google.com/apps/testing/com.direexpress.app";
export const WELCOME_PLAY_URL = "https://play.google.com/store/apps/details?id=com.direexpress.app";
export const WELCOME_GROUP_URL = "https://groups.google.com/g/dire-express";
export const WELCOME_SITE_LABEL = "ድህረ ገፃችንን ይጎብኙ";
export const WELCOME_GROUP_LABEL = "የጎግል ቡድንን ይቀላቀሉ";

export const DEFAULT_WELCOME_SUBJECT = "የDire Express ሞካሪ እንኳን በደህና መጡ";

export const DEFAULT_WELCOME_PREVIEW =
  "የጎግል ቡድኑን ስለተቀላቀሉ እናመሰግናለን። Two steps to install the Dire Express tester app.";

const THANKS_AM = "የDire Express የጎግል ቡድንን ስለተቀላቀሉ እናመሰግናለን።";
const STEP1_AM = "እርምጃ 1፦ የሞካሪ መመዝገቢያ አገናኙን ይክፈቱ፣ ከዚያ Become a tester የሚለውን ይጫኑ።";
const STEP2_AM = "እርምጃ 2፦ መተግበሪያውን ከPlay Store ይጫኑ።";
const REMINDER_AM =
  "በPlay Store ላይ የገባው የጉግል መለያ፣ የጎግል ቡድኑን ለመቀላቀል የተጠቀሙበት Gmail መሆን አለበት። ተመሳሳይ ካልሆነ እንደ ሞካሪ አይቆጠሩም።";
const KEEP_AM = "መተግበሪያውን ቢያንስ ለ14 ቀናት ሳያራግፉ ይያዙ።";

const THANKS_EN = "Thank you for joining the Dire Express Google Group.";
const STEP1_EN = "Step 1: open the tester opt-in link and tap Become a tester.";
const STEP2_EN = "Step 2: install the app.";
const REMINDER_EN =
  "The Google account signed in on the Play Store must be the same Gmail you used to join the Google Group. Otherwise you will not be counted as a tester.";
const KEEP_EN = "Keep the app installed for at least 14 days.";

export function welcomeButtonHtml(href: string, label: string, main = false) {
  const safe = label.replace(/[<>]/g, "");
  const size = main ? 18 : 16;
  const line = main ? 24 : 22;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 18px 0;border-collapse:separate;">
<tr>
<td align="center" bgcolor="${BRAND_ORANGE}" style="background-color:${BRAND_ORANGE};border-radius:6px;mso-padding-alt:12px 22px;">
<a href="${href}" target="_blank" style="display:inline-block;padding:12px 22px;font-family:Georgia,'Times New Roman',serif;font-size:${size}px;line-height:${line}px;font-weight:700;color:${BRAND_NAVY};text-decoration:none;">${safe}</a>
</td>
</tr>
</table>`;
}

function reminderHtml(text: string) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px 0;border-collapse:separate;">
<tr>
<td width="4" bgcolor="${BRAND_ORANGE}" style="width:4px;background-color:${BRAND_ORANGE};font-size:0;line-height:0;">&nbsp;</td>
<td bgcolor="#FFF4EC" style="background-color:#FFF4EC;padding:14px 16px;">
<p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:16px;line-height:26px;font-weight:700;color:${BRAND_NAVY};">${text}</p>
</td>
</tr>
</table>`;
}

function socialLink(href: string, label: string) {
  return `<a href="${href}" target="_blank" style="color:${BRAND_ORANGE};font-weight:700;font-size:14px;line-height:20px;text-decoration:none;">${label}</a>`;
}

export const DEFAULT_WELCOME_HTML = `<!--dx:welcome--><div style="font-family: Georgia, 'Times New Roman', serif; font-size: 16px; line-height: 1.6; color: #222222; max-width: 560px;">
<p style="margin: 0 0 16px 0;">ሰላም {{name}}፣</p>
<p style="margin: 0 0 16px 0;">${THANKS_AM}</p>
<p style="margin: 0 0 16px 0;">${STEP1_AM}</p>
${welcomeButtonHtml(WELCOME_TESTER_URL, "ሞካሪ ይሁኑ")}
<p style="margin: 0 0 16px 0;">${STEP2_AM}</p>
${welcomeButtonHtml(WELCOME_PLAY_URL, "መተግበሪያውን ይጫኑ", true)}
${reminderHtml(REMINDER_AM)}
<p style="margin: 0 0 16px 0;">${KEEP_AM}</p>
<p style="margin: 0 0 16px 0;">Hello {{name}},</p>
<p style="margin: 0 0 16px 0;">${THANKS_EN}</p>
<p style="margin: 0 0 16px 0;">${STEP1_EN}</p>
${welcomeButtonHtml(WELCOME_TESTER_URL, "Become a tester")}
<p style="margin: 0 0 16px 0;">${STEP2_EN}</p>
${welcomeButtonHtml(WELCOME_PLAY_URL, "Install the app", true)}
${reminderHtml(REMINDER_EN)}
<p style="margin: 0 0 16px 0;">${KEEP_EN}</p>
<p style="margin: 0 0 16px 0;">Dawit<br>Dire Express</p>
${welcomeButtonHtml(NEWSLETTER_WEBSITE_URL, WELCOME_SITE_LABEL)}
${welcomeButtonHtml(WELCOME_GROUP_URL, WELCOME_GROUP_LABEL)}
<p style="margin: 0 0 16px 0; font-family: Arial, sans-serif;">${socialLink(NEWSLETTER_TELEGRAM_URL, "Telegram")} &nbsp; ${socialLink(NEWSLETTER_FACEBOOK_URL, "Facebook")} &nbsp; ${socialLink(NEWSLETTER_LINKEDIN_URL, "LinkedIn")}</p>
<p style="margin: 24px 0 0 0; font-family: Arial, sans-serif; font-size: 14px; line-height: 20px; font-weight: 700; color: #FE6100;">{{ unsubscribe }}</p>
</div>
`;
