export type BlockMode = "text" | "html";
export type BlockLang = "am" | "en" | "both";

export type NewsletterBlock = {
  id: string;
  label: string;
  lang: BlockLang;
  mode: BlockMode;
};

export const NEWSLETTER_BLOCKS: NewsletterBlock[] = [
  { id: "letter", label: "Letter", lang: "both", mode: "text" },
  { id: "stat_value", label: "Stat number", lang: "both", mode: "text" },
  { id: "am_headline", label: "Headline", lang: "am", mode: "text" },
  { id: "am_headline_accent", label: "Headline accent", lang: "am", mode: "text" },
  { id: "am_subheadline", label: "Subheadline", lang: "am", mode: "text" },
  { id: "am_cta", label: "Button", lang: "am", mode: "text" },
  { id: "am_intro", label: "Intro", lang: "am", mode: "text" },
  { id: "am_feature_1_title", label: "Update 1 title", lang: "am", mode: "text" },
  { id: "am_feature_1_body", label: "Update 1 text", lang: "am", mode: "text" },
  { id: "am_feature_2_title", label: "Update 2 title", lang: "am", mode: "text" },
  { id: "am_feature_2_body", label: "Update 2 text", lang: "am", mode: "text" },
  { id: "am_feature_3_title", label: "Update 3 title", lang: "am", mode: "text" },
  { id: "am_feature_3_body", label: "Update 3 text", lang: "am", mode: "text" },
  { id: "am_stat", label: "Stat label", lang: "am", mode: "text" },
  { id: "am_tip", label: "Tip", lang: "am", mode: "html" },
  { id: "en_headline", label: "Headline", lang: "en", mode: "text" },
  { id: "en_headline_accent", label: "Headline accent", lang: "en", mode: "text" },
  { id: "en_subheadline", label: "Subheadline", lang: "en", mode: "text" },
  { id: "en_cta", label: "Button", lang: "en", mode: "text" },
  { id: "en_intro", label: "Intro", lang: "en", mode: "text" },
  { id: "en_feature_1_title", label: "Update 1 title", lang: "en", mode: "text" },
  { id: "en_feature_1_body", label: "Update 1 text", lang: "en", mode: "text" },
  { id: "en_feature_2_title", label: "Update 2 title", lang: "en", mode: "text" },
  { id: "en_feature_2_body", label: "Update 2 text", lang: "en", mode: "text" },
  { id: "en_feature_3_title", label: "Update 3 title", lang: "en", mode: "text" },
  { id: "en_feature_3_body", label: "Update 3 text", lang: "en", mode: "text" },
  { id: "en_stat", label: "Stat label", lang: "en", mode: "text" },
  { id: "en_tip", label: "Tip", lang: "en", mode: "html" },
];

const BLOCK_ID = /^[a-z0-9_]+$/;

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00a0",
  rsquo: "\u2019",
  lsquo: "\u2018",
  rdquo: "\u201d",
  ldquo: "\u201c",
  mdash: "\u2014",
  ndash: "\u2013",
  middot: "\u00b7",
  rarr: "\u2192",
  copy: "\u00a9",
  hellip: "\u2026",
};

export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function decodeHtmlText(value: string) {
  return value.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (entity, body: string) => {
    if (body.startsWith("#x") || body.startsWith("#X")) {
      const code = Number.parseInt(body.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : entity;
    }
    if (body.startsWith("#")) {
      const code = Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : entity;
    }
    return NAMED_ENTITIES[body] ?? entity;
  });
}

export function readBlocks(html: string) {
  const found: Record<string, string> = {};
  for (const match of html.matchAll(/<!--dx:([a-z0-9_]+)-->([\s\S]*?)<!--\/dx:\1-->/g)) {
    found[match[1]] = match[2];
  }
  return found;
}

export function blockFieldValue(raw: string, mode: BlockMode) {
  return mode === "text" ? decodeHtmlText(raw) : raw;
}

export function writeBlock(html: string, id: string, value: string, mode: BlockMode) {
  if (!BLOCK_ID.test(id)) return html;
  const inner = mode === "text" ? escapeHtml(value) : value.replaceAll("<!--", "");
  return html.replace(
    new RegExp(`<!--dx:${id}-->[\\s\\S]*?<!--/dx:${id}-->`, "g"),
    `<!--dx:${id}-->${inner}<!--/dx:${id}-->`,
  );
}
