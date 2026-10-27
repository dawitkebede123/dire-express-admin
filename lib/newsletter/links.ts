export const NEWSLETTER_WEBSITE_URL = "https://direexpress.com.et/";
export const NEWSLETTER_WEBSITE_LABEL = "direexpress.com.et";
export const NEWSLETTER_TELEGRAM_URL = "https://t.me/dawitwol";
export const NEWSLETTER_FACEBOOK_URL = "https://www.facebook.com/profile.php?id=61595897277698";
export const NEWSLETTER_LINKEDIN_URL = "https://www.linkedin.com/in/dawit-woldu-293084304";

export function applyNewsletterLinks(html: string) {
  return html
    .replaceAll("https://dire-express.web.app/", NEWSLETTER_WEBSITE_URL)
    .replaceAll("http://dire-express.web.app/", NEWSLETTER_WEBSITE_URL)
    .replaceAll("https://dire-express.web.app", NEWSLETTER_WEBSITE_URL)
    .replaceAll("http://dire-express.web.app", NEWSLETTER_WEBSITE_URL)
    .replaceAll("dire-express.web.app", NEWSLETTER_WEBSITE_LABEL)
    .replaceAll("{{cta_url}}", NEWSLETTER_WEBSITE_URL)
    .replaceAll("{{telegram_url}}", NEWSLETTER_TELEGRAM_URL)
    .replaceAll("{{facebook_url}}", NEWSLETTER_FACEBOOK_URL)
    .replaceAll("{{linkedin_url}}", NEWSLETTER_LINKEDIN_URL)
    .replaceAll(">ድረ-ገጽ</a>", `>${NEWSLETTER_WEBSITE_LABEL}</a>`)
    .replaceAll(">የድር መተግበሪያውን ይጠቀሙ</a>", `>${NEWSLETTER_WEBSITE_LABEL}</a>`)
    .replaceAll(">Use the web app</a>", `>${NEWSLETTER_WEBSITE_LABEL}</a>`)
    .replaceAll(">Web</a>", `>${NEWSLETTER_WEBSITE_LABEL}</a>`);
}
