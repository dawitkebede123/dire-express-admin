// Default welcome letter. The attached HTML is the body.
// <!--dx:welcome--> keeps the newsletter freight-forwarder note out of this letter.
// The video control is a text button, with no thumbnail image.

export const DEFAULT_WELCOME_SUBJECT = "እንኳን ወደ ድሬ ኤክስፕረስ በደህና መጡ | Welcome to Dire Express";

export const DEFAULT_WELCOME_PREVIEW =
  "አፕሊኬሽኑን ለመጠቀም የፕሌይ ስቶር ማገናኛውን ይክፈቱ · Open the Play Store testing link to become a tester.";

export const WELCOME_VIDEO_URL = "https://youtu.be/XPQOuIJrDV8?si=8IDuR2uluMi-2_0j";

export const DEFAULT_WELCOME_HTML = `<!DOCTYPE html>
<html lang="am">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no, date=no, address=no, email=no">
<title>እንኳን ወደ ድሬ ኤክስፕረስ በደህና መጡ | Welcome to Dire Express</title>
<style>
  html,body{margin:0 !important;padding:0 !important;width:100% !important;}
  *{-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;}
  table,td{mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;}
  a{text-decoration:none;}
  a[x-apple-data-detectors]{color:inherit !important;text-decoration:none !important;font-size:inherit !important;font-family:inherit !important;font-weight:inherit !important;line-height:inherit !important;}
  @media only screen and (max-width:620px){
    .container{width:100% !important;max-width:100% !important;}
    .px{padding-left:20px !important;padding-right:20px !important;}
    .btn-full{width:100% !important;}
    .btn-full a{display:block !important;}
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:#FFFFFF;">
<!--dx:welcome-->
<!-- Preheader -->
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#ffffff;">
  አፕሊኬሽኑን ለመጠቀም የፕሌይ ስቶር ማገናኛውን ይክፈቱ · Open the Play Store testing link to become a tester.
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" style="background-color:#FFFFFF;">
<tr><td align="center" style="padding:24px 12px;">

<!--[if mso]><table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td><![endif]-->
<table role="presentation" class="container" width="560" cellpadding="0" cellspacing="0" border="0" align="center" style="width:560px;max-width:560px;margin:0 auto;">

  <!-- ========== AMHARIC ========== -->
  <tr>
    <td class="px" style="padding:8px 24px 8px 24px;font-family:Arial,'Noto Sans Ethiopic','Nyala','Ebrima',sans-serif;font-size:15px;line-height:1.7;color:#222222;">

      <p style="margin:0 0 16px 0;">ሰላም፣</p>

      <p style="margin:0 0 16px 0;">የድሬ ኤክስፕረስ ጎግል ቡድንን ስለተቀላቀሉ እናመሰግናለን። አፕሊኬሽኑን ለመጠቀም እባክዎ እነዚህን ሁለት ደረጃዎች ይከተሉ።</p>

      <p style="margin:0 0 8px 0;"><strong>ደረጃ ፩ — ምዝገባ</strong><br>
      ይህን ማገናኛ ይክፈቱና «Become a tester» የሚለውን ይጫኑ፦</p>
      <p style="margin:0 0 16px 0;"><a href="https://play.google.com/apps/testing/com.direexpress.app" style="color:#011B3C;font-weight:700;text-decoration:underline;">https://play.google.com/apps/testing/com.direexpress.app</a></p>

      <!-- Opt-in button (secondary) -->
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" class="btn-full" style="margin:0 0 20px 0;">
        <tr>
          <td bgcolor="#FE6100" align="center" style="background-color:#FE6100;border-radius:10px;mso-padding-alt:14px 28px;">
            <a href="https://play.google.com/apps/testing/com.direexpress.app" target="_blank" style="display:inline-block;padding:14px 28px;font-family:Arial,'Noto Sans Ethiopic','Nyala','Ebrima',sans-serif;font-size:16px;line-height:22px;font-weight:700;color:#011B3C;text-decoration:none;border-radius:10px;">Become a tester &rarr;</a>
          </td>
        </tr>
      </table>

      <p style="margin:0 0 8px 0;"><strong>ደረጃ ፪ — አፕሊኬሽኑን ይጫኑ</strong><br>
      ከዚያ አፕሊኬሽኑን ከፕሌይ ስቶር ይጫኑ፦</p>

      <!-- Main Play Store button -->
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" class="btn-full" style="margin:0 0 24px 0;">
        <tr>
          <td bgcolor="#FE6100" align="center" style="background-color:#FE6100;border-radius:10px;mso-padding-alt:16px 32px;">
            <a href="https://play.google.com/store/apps/details?id=com.direexpress.app" target="_blank" style="display:inline-block;padding:16px 32px;font-family:Arial,'Noto Sans Ethiopic','Nyala','Ebrima',sans-serif;font-size:18px;line-height:24px;font-weight:700;color:#011B3C;text-decoration:none;border-radius:10px;">ከፕሌይ ስቶር ይጫኑ &rarr;</a>
          </td>
        </tr>
      </table>

      <table role="presentation" cellpadding="0" cellspacing="0" border="0" class="btn-full" style="margin:0 0 24px 0;">
        <tr>
          <td bgcolor="#FE6100" align="center" style="background-color:#FE6100;border-radius:10px;mso-padding-alt:14px 28px;">
            <a href="https://youtu.be/XPQOuIJrDV8?si=8IDuR2uluMi-2_0j" target="_blank" style="display:inline-block;padding:14px 28px;font-family:Arial,'Noto Sans Ethiopic','Nyala','Ebrima',sans-serif;font-size:16px;line-height:22px;font-weight:700;color:#011B3C;text-decoration:none;border-radius:10px;">የቪዲዮ መመሪያውን ይመልከቱ</a>
          </td>
        </tr>
      </table>

      <!-- Prominent same-account reminder -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px 0;">
        <tr>
          <td bgcolor="#FFF4EC" style="background-color:#FFF4EC;border-left:4px solid #FE6100;padding:14px 16px;border-radius:4px;">
            <p style="margin:0;font-family:Arial,'Noto Sans Ethiopic','Nyala','Ebrima',sans-serif;font-size:15px;line-height:1.65;font-weight:700;color:#011B3C;">
              አስፈላጊ፦ በፕሌይ ስቶር ላይ የገባው ጎግል አካውንት የጎግል ቡድኑን ለመቀላቀል ከተጠቀሙበት <u>ተመሳሳይ ጂሜይል</u> መሆን አለበት። የተለየ ከሆነ ምዝገባዎ አይቆጠርም።
            </p>
          </td>
        </tr>
      </table>

      <p style="margin:0 0 16px 0;">እባክዎ አፕሊኬሽኑን ቢያንስ ለ፲፬ (14) ቀናት ተጭኖ እንዲቆይ ያድርጉ።</p>

      <p style="margin:0 0 8px 0;">ከሰላምታ ጋር፣<br>ዳዊት ወልዱ<br>ድሬ ኤክስፕረስ</p>
    </td>
  </tr>

  <!-- Divider -->
  <tr>
    <td class="px" style="padding:8px 24px;">
      <div style="border-top:1px solid #E5EAF0;font-size:0;line-height:0;">&nbsp;</div>
      <p style="margin:16px 0 0 0;font-family:Arial,sans-serif;font-size:12px;line-height:18px;color:#888888;text-transform:uppercase;letter-spacing:0.5px;">English</p>
    </td>
  </tr>

  <!-- ========== ENGLISH ========== -->
  <tr>
    <td class="px" style="padding:8px 24px 8px 24px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.7;color:#222222;">

      <p style="margin:0 0 16px 0;">Hello,</p>

      <p style="margin:0 0 16px 0;">Thank you for joining the Dire Express Google Group. To use the app, please follow these two steps.</p>

      <p style="margin:0 0 8px 0;"><strong>Step 1 — Registration</strong><br>
      Open this link and tap <strong>Become a tester</strong>:</p>
      <p style="margin:0 0 16px 0;"><a href="https://play.google.com/apps/testing/com.direexpress.app" style="color:#011B3C;font-weight:700;text-decoration:underline;">https://play.google.com/apps/testing/com.direexpress.app</a></p>

      <table role="presentation" cellpadding="0" cellspacing="0" border="0" class="btn-full" style="margin:0 0 20px 0;">
        <tr>
          <td bgcolor="#FE6100" align="center" style="background-color:#FE6100;border-radius:10px;mso-padding-alt:14px 28px;">
            <a href="https://play.google.com/apps/testing/com.direexpress.app" target="_blank" style="display:inline-block;padding:14px 28px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:22px;font-weight:700;color:#011B3C;text-decoration:none;border-radius:10px;">Become a tester &rarr;</a>
          </td>
        </tr>
      </table>

      <p style="margin:0 0 8px 0;"><strong>Step 2 — Install the app</strong><br>
      Then install the app from the Play Store:</p>

      <table role="presentation" cellpadding="0" cellspacing="0" border="0" class="btn-full" style="margin:0 0 24px 0;">
        <tr>
          <td bgcolor="#FE6100" align="center" style="background-color:#FE6100;border-radius:10px;mso-padding-alt:16px 32px;">
            <a href="https://play.google.com/store/apps/details?id=com.direexpress.app" target="_blank" style="display:inline-block;padding:16px 32px;font-family:Arial,Helvetica,sans-serif;font-size:18px;line-height:24px;font-weight:700;color:#011B3C;text-decoration:none;border-radius:10px;">Install from Play Store &rarr;</a>
          </td>
        </tr>
      </table>

      <table role="presentation" cellpadding="0" cellspacing="0" border="0" class="btn-full" style="margin:0 0 24px 0;">
        <tr>
          <td bgcolor="#FE6100" align="center" style="background-color:#FE6100;border-radius:10px;mso-padding-alt:14px 28px;">
            <a href="https://youtu.be/XPQOuIJrDV8?si=8IDuR2uluMi-2_0j" target="_blank" style="display:inline-block;padding:14px 28px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:22px;font-weight:700;color:#011B3C;text-decoration:none;border-radius:10px;">Watch the video guide</a>
          </td>
        </tr>
      </table>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px 0;">
        <tr>
          <td bgcolor="#FFF4EC" style="background-color:#FFF4EC;border-left:4px solid #FE6100;padding:14px 16px;border-radius:4px;">
            <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.65;font-weight:700;color:#011B3C;">
              Important: The Google account signed in on the Play Store must be the <u>same Gmail</u> you used to join the Google Group. If it is different, you will not be counted as a tester.
            </p>
          </td>
        </tr>
      </table>

      <p style="margin:0 0 16px 0;">Please keep the app installed for at least 14 days.</p>

      <p style="margin:0 0 8px 0;">Best regards,<br>Dawit Woldu<br>Dire Express</p>
    </td>
  </tr>

  <!-- ========== FOOTER ========== -->
  <tr>
    <td class="px" style="padding:24px 24px 8px 24px;">
      <div style="border-top:1px solid #E5EAF0;font-size:0;line-height:0;">&nbsp;</div>
    </td>
  </tr>

  <tr>
    <td class="px" align="center" style="padding:8px 24px 8px 24px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" class="btn-full" style="margin:0 0 12px 0;">
        <tr>
          <td bgcolor="#FE6100" align="center" style="background-color:#FE6100;border-radius:10px;mso-padding-alt:12px 24px;">
            <a href="https://direexpress.com.et/" target="_blank" style="display:inline-block;padding:12px 24px;font-family:Arial,'Noto Sans Ethiopic','Nyala','Ebrima',sans-serif;font-size:16px;line-height:22px;font-weight:700;color:#011B3C;text-decoration:none;border-radius:10px;">ድህረ ገፃችንን ይጎብኙ &rarr;</a>
          </td>
        </tr>
      </table>

      <table role="presentation" cellpadding="0" cellspacing="0" border="0" class="btn-full" style="margin:0 0 20px 0;">
        <tr>
          <td bgcolor="#FE6100" align="center" style="background-color:#FE6100;border-radius:10px;mso-padding-alt:12px 24px;">
            <a href="https://groups.google.com/g/dire-express" target="_blank" style="display:inline-block;padding:12px 24px;font-family:Arial,'Noto Sans Ethiopic','Nyala','Ebrima',sans-serif;font-size:16px;line-height:22px;font-weight:700;color:#011B3C;text-decoration:none;border-radius:10px;">የጎግል ቡድንን ይቀላቀሉ</a>
          </td>
        </tr>
      </table>

      <p style="margin:0 0 8px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:22px;color:#555555;">
        <a href="https://t.me/dawitwol" style="color:#011B3C;font-weight:700;text-decoration:underline;">Telegram</a>
        &nbsp;·&nbsp;
        <a href="https://www.facebook.com/profile.php?id=61595897277698" style="color:#011B3C;font-weight:700;text-decoration:underline;">Facebook</a>
        &nbsp;·&nbsp;
        <a href="https://www.linkedin.com/in/dawit-woldu-293084304" style="color:#011B3C;font-weight:700;text-decoration:underline;">LinkedIn</a>
      </p>

      <p style="margin:16px 0 0 0;font-family:Arial,'Noto Sans Ethiopic','Nyala','Ebrima',sans-serif;font-size:12px;line-height:18px;color:#888888;">
        ይህን መልእክት መቀበል ካልፈለጉ <a href="{{ unsubscribe }}" style="color:#888888;">እዚህ ይጥፉ</a>።
        <br>
        If you no longer wish to receive these emails, <a href="{{ unsubscribe }}" style="color:#888888;">unsubscribe here</a>.
      </p>
    </td>
  </tr>

</table>
<!--[if mso]></td></tr></table><![endif]-->

</td></tr>
</table>
</body>
</html>
`;
