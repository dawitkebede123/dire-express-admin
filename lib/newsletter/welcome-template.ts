// Default welcome letter. A short personal letter, in the same shape as the
// newsletter, lands in Gmail Primary more often than a designed marketing email.
// <!--dx:welcome--> keeps the newsletter freight-forwarder note out of this letter.
// {{name}} is filled only when a real name is on file. There is no image and no
// {{ unsubscribe }} tag, so Brevo is not asked to add a List-Unsubscribe header.

export const DEFAULT_WELCOME_SUBJECT = "እንኳን ወደ ድሬ ኤክስፕረስ በደህና መጡ | Welcome to Dire Express";

export const DEFAULT_WELCOME_PREVIEW =
  "አፕሊኬሽኑን ለመጠቀም የፕሌይ ስቶር ማገናኛውን ይክፈቱ · Open the Play Store testing link to become a tester.";

export const WELCOME_VIDEO_URL = "https://youtu.be/XPQOuIJrDV8?si=8IDuR2uluMi-2_0j";

const OPT_IN_URL = "https://play.google.com/apps/testing/com.direexpress.app";
const PLAY_URL = "https://play.google.com/store/apps/details?id=com.direexpress.app";
const LINK = "color:#011B3C;font-weight:700;text-decoration:underline;";

export const DEFAULT_WELCOME_HTML = `<div style="font-family:Georgia,'Times New Roman',serif;font-size:16px;line-height:1.6;color:#222222;max-width:560px;">
<!--dx:welcome-->
<p style="margin:0 0 16px 0;">ሰላም {{name}}፣</p>
<p style="margin:0 0 16px 0;">የድሬ ኤክስፕረስ ጎግል ቡድንን ስለተቀላቀሉ እናመሰግናለን። አፕሊኬሽኑን ለመጠቀም እባክዎ እነዚህን ሁለት ደረጃዎች ይከተሉ።</p>
<p style="margin:0 0 16px 0;"><strong>ደረጃ ፩ — ምዝገባ</strong><br>ይህን ማገናኛ ይክፈቱና «Become a tester» የሚለውን ይጫኑ፦<br><a href="${OPT_IN_URL}" style="${LINK}">${OPT_IN_URL}</a></p>
<p style="margin:0 0 16px 0;"><strong>ደረጃ ፪ — አፕሊኬሽኑን ይጫኑ</strong><br>ከዚያ አፕሊኬሽኑን ከፕሌይ ስቶር ይጫኑ፦<br><a href="${PLAY_URL}" style="${LINK}">ከፕሌይ ስቶር ይጫኑ</a></p>
<p style="margin:0 0 16px 0;"><a href="${WELCOME_VIDEO_URL}" style="${LINK}">የቪዲዮ መመሪያውን ይመልከቱ</a></p>
<p style="margin:0 0 16px 0;"><strong>አስፈላጊ፦</strong> በፕሌይ ስቶር ላይ የገባው ጎግል አካውንት የጎግል ቡድኑን ለመቀላቀል ከተጠቀሙበት ተመሳሳይ ጂሜይል መሆን አለበት። የተለየ ከሆነ ምዝገባዎ አይቆጠርም።</p>
<p style="margin:0 0 16px 0;">እባክዎ አፕሊኬሽኑን ቢያንስ ለ፲፬ (14) ቀናት ተጭኖ እንዲቆይ ያድርጉ።</p>
<p style="margin:0 0 16px 0;">ለማንኛውም እርዳታ በ <a href="mailto:dawitkebedewoldu@gmail.com" style="${LINK}">dawitkebedewoldu@gmail.com</a> ይጻፍሉልን።</p>
<p style="margin:0 0 16px 0;">ከሰላምታ ጋር፣<br>ዳዊት ወልዱ<br>ድሬ ኤክስፕረስ</p>
<p style="margin:24px 0 16px 0;font-family:Arial,sans-serif;font-size:12px;line-height:18px;letter-spacing:0.5px;color:#888888;">English</p>
<p style="margin:0 0 16px 0;">Hello {{name}},</p>
<p style="margin:0 0 16px 0;">Thank you for joining the Dire Express Google Group. To use the app, please follow these two steps.</p>
<p style="margin:0 0 16px 0;"><strong>Step 1 — Registration</strong><br>Open this link and tap <strong>Become a tester</strong>:<br><a href="${OPT_IN_URL}" style="${LINK}">${OPT_IN_URL}</a></p>
<p style="margin:0 0 16px 0;"><strong>Step 2 — Install the app</strong><br>Then install the app from the Play Store:<br><a href="${PLAY_URL}" style="${LINK}">Install from Play Store</a></p>
<p style="margin:0 0 16px 0;"><a href="${WELCOME_VIDEO_URL}" style="${LINK}">Watch the video guide</a></p>
<p style="margin:0 0 16px 0;"><strong>Important:</strong> The Google account signed in on the Play Store must be the same Gmail you used to join the Google Group. If it is different, you will not be counted as a tester.</p>
<p style="margin:0 0 16px 0;">Please keep the app installed for at least 14 days.</p>
<p style="margin:0 0 16px 0;">For any help, email us at <a href="mailto:dawitkebedewoldu@gmail.com" style="${LINK}">dawitkebedewoldu@gmail.com</a>.</p>
<p style="margin:0 0 16px 0;">Best regards,<br>Dawit Woldu<br>Dire Express</p>
<p style="margin:24px 0 0 0;font-size:14px;line-height:1.7;"><a href="https://direexpress.com.et/" style="${LINK}">ድህረ ገፃችንን ይጎብኙ</a><br><a href="https://groups.google.com/g/dire-express" style="${LINK}">የጎግል ቡድንን ይቀላቀሉ</a><br><a href="https://t.me/dawitwol" style="${LINK}">Telegram</a> · <a href="https://www.facebook.com/profile.php?id=61595897277698" style="${LINK}">Facebook</a> · <a href="https://www.linkedin.com/in/dawit-woldu-293084304" style="${LINK}">LinkedIn</a></p>
<p style="margin:16px 0 0 0;font-size:14px;line-height:1.5;color:#555555;">ይህን መልእክት መቀበል ካልፈለጉ ለዚህ ኢሜይል ምላሽ ይስጡ።<br>If you no longer want these notes, reply to this email.</p>
</div>
`;
