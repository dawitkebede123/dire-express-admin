// Welcome letter in the newsletter's email design: navy header, white body,
// orange section headings, the cream callout, and #FE6100 buttons with #011B3C text.
// <!--dx:welcome--> keeps the freight-forwarder note out of this letter.
// Wording stays the welcome copy. There is no image and no {{ unsubscribe }} tag.

import { BRAND_NAVY, BRAND_ORANGE } from "@/lib/newsletter/brand";

export const DEFAULT_WELCOME_SUBJECT = "እንኳን ወደ ድሬ ኤክስፕረስ በደህና መጡ | Welcome to Dire Express";

export const DEFAULT_WELCOME_PREVIEW =
  "አፕሊኬሽኑን ለመጠቀም የፕሌይ ስቶር ማገናኛውን ይክፈቱ · Open the Play Store testing link to become a tester.";

export const WELCOME_VIDEO_URL = "https://youtu.be/XPQOuIJrDV8?si=8IDuR2uluMi-2_0j";

const OPT_IN_URL = "https://play.google.com/apps/testing/com.direexpress.app";
const PLAY_URL = "https://play.google.com/store/apps/details?id=com.direexpress.app";
const SITE_URL = "https://direexpress.com.et/";
const GROUP_URL = "https://groups.google.com/g/dire-express";
const TELEGRAM_URL = "https://t.me/dawitwol";
const FACEBOOK_URL = "https://www.facebook.com/profile.php?id=61595897277698";
const LINKEDIN_URL = "https://www.linkedin.com/in/dawit-woldu-293084304";
const HELP_EMAIL = "dawitkebedewoldu@gmail.com";

const HEADER_NAVY = "#0B1F3A";
const PAGE = "#EDF1F6";
const INK = "#22324A";
const FONT = "'Noto Sans Ethiopic','Nyala','Abyssinica SIL','Ebrima','Inter','Segoe UI',Arial,sans-serif";

function cta(href: string, label: string, align: "left" | "center" = "left") {
  return `<table role="presentation" align="${align}" cellpadding="0" cellspacing="0" border="0" class="btn-full" style="margin:4px 0 20px 0;border-collapse:separate;">
<tr><td align="center" bgcolor="${BRAND_ORANGE}" style="background-color:${BRAND_ORANGE};border-radius:10px;mso-padding-alt:14px 28px;">
<a href="${href}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:${FONT};font-size:16px;line-height:22px;font-weight:700;color:${BRAND_NAVY};text-decoration:none;border-radius:10px;">${label}</a>
</td></tr></table>`;
}

function callout(text: string) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 20px 0;border-collapse:separate;">
<tr>
<td width="4" bgcolor="${BRAND_ORANGE}" style="width:4px;background-color:${BRAND_ORANGE};font-size:0;line-height:0;">&nbsp;</td>
<td bgcolor="#FFF4EC" style="background-color:#FFF4EC;padding:14px 16px;">
<p style="margin:0;font-family:${FONT};font-size:16px;line-height:26px;font-weight:700;color:${BRAND_NAVY};">${text}</p>
</td>
</tr></table>`;
}

function heading(text: string) {
  return `<h2 style="margin:8px 0 8px 0;font-family:${FONT};font-size:22px;line-height:32px;font-weight:800;color:${HEADER_NAVY};">${text}</h2>`;
}

function paragraph(text: string) {
  return `<p style="margin:0 0 16px 0;font-family:${FONT};font-size:16px;line-height:26px;color:${INK};">${text}</p>`;
}

function textLink(href: string, label: string) {
  return `<a href="${href}" style="color:${BRAND_ORANGE};font-weight:700;text-decoration:underline;">${label}</a>`;
}

const wordmark = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;">
<tr>
<td valign="middle" bgcolor="${BRAND_ORANGE}" width="40" height="40" align="center" style="width:40px;height:40px;background-color:${BRAND_ORANGE};border-radius:10px;font-family:${FONT};font-size:22px;line-height:40px;font-weight:800;color:${BRAND_NAVY};">D</td>
<td valign="middle" style="padding-left:10px;font-family:${FONT};font-size:22px;line-height:26px;font-weight:800;color:#FFFFFF;">Dire <span style="color:${BRAND_ORANGE};">Express</span>
<div style="font-family:${FONT};font-size:12px;line-height:16px;font-weight:600;color:#9FB3CF;">ድሬ ኤክስፕረስ</div>
</td>
</tr></table>`;

export const DEFAULT_WELCOME_HTML = `<!DOCTYPE html>
<html lang="am">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${DEFAULT_WELCOME_SUBJECT}</title>
<style>
  html,body{margin:0 !important;padding:0 !important;width:100% !important;}
  table,td{border-collapse:collapse;}
  a{text-decoration:none;}
  @media only screen and (max-width:620px){
    .container{width:100% !important;max-width:100% !important;}
    .px{padding-left:20px !important;padding-right:20px !important;}
    .btn-full{width:100% !important;}
    .btn-full a{display:block !important;}
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:${PAGE};">
<!--dx:welcome-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${PAGE}" style="background-color:${PAGE};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" align="center" style="width:600px;max-width:600px;margin:0 auto;">
<tr>
<td class="px" bgcolor="${HEADER_NAVY}" style="background-color:${HEADER_NAVY};padding:28px 40px 24px 40px;border-radius:16px 16px 0 0;">
${wordmark}
<h1 style="margin:22px 0 0 0;font-family:${FONT};font-size:26px;line-height:36px;font-weight:800;color:#FFFFFF;">እንኳን ወደ ድሬ ኤክስፕረስ በደህና መጡ</h1>
<p style="margin:8px 0 0 0;font-family:${FONT};font-size:16px;line-height:24px;color:#DCE4EF;">Welcome to Dire Express</p>
</td>
</tr>
<tr><td bgcolor="${BRAND_ORANGE}" style="background-color:${BRAND_ORANGE};height:4px;font-size:0;line-height:0;">&nbsp;</td></tr>
<tr>
<td class="px" bgcolor="#FFFFFF" style="background-color:#FFFFFF;padding:32px 40px 12px 40px;">
${paragraph("ሰላም {{name}}፣")}
${paragraph("የድሬ ኤክስፕረስ ጎግል ቡድንን ስለተቀላቀሉ እናመሰግናለን። አፕሊኬሽኑን ለመጠቀም እባክዎ እነዚህን ሁለት ደረጃዎች ይከተሉ።")}
${heading("ደረጃ ፩ — ምዝገባ")}
${paragraph(`ይህን ማገናኛ ይክፈቱና «Become a tester» የሚለውን ይጫኑ፦<br>${textLink(OPT_IN_URL, OPT_IN_URL)}`)}
${cta(OPT_IN_URL, "Become a tester &rarr;")}
${heading("ደረጃ ፪ — አፕሊኬሽኑን ይጫኑ")}
${paragraph("ከዚያ አፕሊኬሽኑን ከፕሌይ ስቶር ይጫኑ፦")}
${cta(PLAY_URL, "ከፕሌይ ስቶር ይጫኑ &rarr;")}
${cta(WELCOME_VIDEO_URL, "የቪዲዮ መመሪያውን ይመልከቱ")}
${callout("<strong>አስፈላጊ፦</strong> በፕሌይ ስቶር ላይ የገባው ጎግል አካውንት የጎግል ቡድኑን ለመቀላቀል ከተጠቀሙበት ተመሳሳይ ጂሜይል መሆን አለበት። የተለየ ከሆነ ምዝገባዎ አይቆጠርም።")}
${paragraph("እባክዎ አፕሊኬሽኑን ቢያንስ ለ፲፬ (14) ቀናት ተጭኖ እንዲቆይ ያድርጉ።")}
${paragraph(`ለማንኛውም እርዳታ በ ${textLink(`mailto:${HELP_EMAIL}`, HELP_EMAIL)} ይጻፉልን።`)}
${paragraph("ከሰላምታ ጋር፣<br>ዳዊት ወልዱ<br>ድሬ ኤክስፕረስ")}
</td>
</tr>
<tr>
<td bgcolor="${PAGE}" style="background-color:${PAGE};padding:28px 24px 8px 24px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td width="28%" style="border-top:2px dashed #C3CDDB;font-size:0;line-height:0;">&nbsp;</td>
<td align="center" style="padding:0 12px;white-space:nowrap;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;"><tr>
<td bgcolor="${HEADER_NAVY}" style="background-color:${HEADER_NAVY};border-radius:20px;padding:7px 16px;font-family:${FONT};font-size:12px;line-height:16px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#FFFFFF;">English</td>
</tr></table>
</td>
<td width="28%" style="border-top:2px dashed #C3CDDB;font-size:0;line-height:0;">&nbsp;</td>
</tr></table>
</td>
</tr>
<tr>
<td class="px" bgcolor="#FFFFFF" style="background-color:#FFFFFF;padding:28px 40px 20px 40px;border-radius:0;">
${paragraph("Hello {{name}},")}
${paragraph("Thank you for joining the Dire Express Google Group. To use the app, please follow these two steps.")}
${heading("Step 1 — Registration")}
${paragraph(`Open this link and tap <strong>Become a tester</strong>:<br>${textLink(OPT_IN_URL, OPT_IN_URL)}`)}
${cta(OPT_IN_URL, "Become a tester &rarr;")}
${heading("Step 2 — Install the app")}
${paragraph("Then install the app from the Play Store:")}
${cta(PLAY_URL, "Install from Play Store &rarr;")}
${cta(WELCOME_VIDEO_URL, "Watch the video guide")}
${callout("<strong>Important:</strong> The Google account signed in on the Play Store must be the same Gmail you used to join the Google Group. If it is different, you will not be counted as a tester.")}
${paragraph("Please keep the app installed for at least 14 days.")}
${paragraph(`For any help, email us at ${textLink(`mailto:${HELP_EMAIL}`, HELP_EMAIL)}.`)}
${paragraph("Best regards,<br>Dawit Woldu<br>Dire Express")}
</td>
</tr>
<tr>
<td class="px" bgcolor="${HEADER_NAVY}" align="center" style="background-color:${HEADER_NAVY};padding:32px 40px 28px 40px;border-radius:0 0 16px 16px;">
${cta(SITE_URL, "ድህረ ገፃችንን ይጎብኙ &rarr;", "center")}
${cta(GROUP_URL, "የጎግል ቡድንን ይቀላቀሉ", "center")}
<p style="margin:4px 0 0 0;font-family:${FONT};font-size:14px;line-height:22px;">
<a href="${TELEGRAM_URL}" style="color:#FFFFFF;font-weight:700;text-decoration:underline;">Telegram</a>
&nbsp;&middot;&nbsp;
<a href="${FACEBOOK_URL}" style="color:#FFFFFF;font-weight:700;text-decoration:underline;">Facebook</a>
&nbsp;&middot;&nbsp;
<a href="${LINKEDIN_URL}" style="color:#FFFFFF;font-weight:700;text-decoration:underline;">LinkedIn</a>
</p>
<p style="margin:22px 0 0 0;font-family:${FONT};font-size:13px;line-height:20px;color:#9FB3CF;">ይህን መልእክት መቀበል ካልፈለጉ ለዚህ ኢሜይል ምላሽ ይስጡ።<br>If you no longer want these notes, reply to this email.</p>
</td>
</tr>
</table>
</td></tr>
</table>
</body>
</html>
`;
