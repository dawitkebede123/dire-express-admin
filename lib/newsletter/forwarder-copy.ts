import { BRAND_NAVY, BRAND_ORANGE } from "@/lib/newsletter/brand";

// Singular: the new note addresses one forwarder ("ከሆኑ").
// ደላሎች is already plural, so the three sentences in the dark template take the plural.
export const FORWARDER_NOTE_AM =
  "የጭነት አስተላላፊ ከሆኑ፣ አሁኑኑ ጭነትዎን ድሬ ኤክስፕረስ ላይ በነፃ ይፍጠሩ፤ ለደንበኞችዎ የተሻለ ዘመናዊ አማራጭ ያቅርቡ።";

export const FORWARDER_NOTE_EN =
  "If you are a freight forwarder, create your shipments on Dire Express for free right now and offer your customers a better, modern option.";

const NOTE_MARKER = "dx:forwarder-note";

export function forwarderNoteHtml() {
  return `<!--${NOTE_MARKER}--><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px 0;border-collapse:separate;">
<tr>
<td width="4" bgcolor="${BRAND_ORANGE}" style="width:4px;background-color:${BRAND_ORANGE};font-size:0;line-height:0;">&nbsp;</td>
<td bgcolor="#FFF4EC" style="background-color:#FFF4EC;padding:14px 16px;">
<p style="margin:0 0 8px 0;font-family:Georgia,'Times New Roman',serif;font-size:16px;line-height:26px;font-weight:700;color:${BRAND_NAVY};">${FORWARDER_NOTE_AM}</p>
<p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:15px;line-height:24px;color:#222222;">${FORWARDER_NOTE_EN}</p>
</td>
</tr>
</table>`;
}

const OLD_SITE_BUTTON_LABEL = "የድር መተግበሪያውን ይክፈቱ";
const NEW_SITE_BUTTON_LABEL = "ድህረ ገፃችንን ይጎብኙ";

// The saved hero button already points at https://direexpress.com.et/. Only the label changes.
function renameSiteButtonLabel(html: string) {
  return html.replaceAll(OLD_SITE_BUTTON_LABEL, NEW_SITE_BUTTON_LABEL);
}

const NEW_GROUP_BUTTON_LABEL = "የጎግል ቡድንን ይቀላቀሉ";

// The Google Group control already points at https://groups.google.com/g/dire-express.
// The saved heading is "የሞካሪዎች ቡድናችንን ይቀላቀሉ"; the button itself is "ጉግል ግሩፑን ይቀላቀሉ".
function renameGroupButtonLabel(html: string) {
  return html
    .replaceAll("የሞካሪዎች ቡድናችንን ይቀላቀሉ", NEW_GROUP_BUTTON_LABEL)
    .replaceAll("የሞካሪዎች ቡድንን ይቀላቀሉ", NEW_GROUP_BUTTON_LABEL)
    .replaceAll("ጉግል ግሩፑን ይቀላቀሉ", NEW_GROUP_BUTTON_LABEL);
}

function replaceBrokerWording(html: string) {
  return html
    .replaceAll("ደላሎችና", "የጭነት አስተላላፊዎችና")
    .replaceAll("ደላሎች እና", "የጭነት አስተላላፊዎች እና")
    .replaceAll("ደላሎች", "የጭነት አስተላላፊዎች")
    .replaceAll("trusted brokers and drivers", "trusted freight forwarders and drivers")
    .replaceAll("customers and brokers", "customers and freight forwarders")
    .replaceAll("Brokers &amp; Agents", "Freight forwarders &amp; agents")
    .replaceAll("Brokers & Agents", "Freight forwarders & agents");
}

function removeInnermostTag(html: string, marker: string, tag: "td") {
  const openTag = `<${tag}`;
  const closeTag = `</${tag}>`;
  let from = 0;
  let out = "";
  while (from < html.length) {
    const at = html.indexOf(marker, from);
    if (at === -1) {
      out += html.slice(from);
      break;
    }
    const open = html.lastIndexOf(openTag, at);
    const closeBefore = html.lastIndexOf(closeTag, at);
    if (open === -1 || closeBefore > open) {
      out += html.slice(from, at + marker.length);
      from = at + marker.length;
      continue;
    }
    const close = html.indexOf(closeTag, at);
    if (close === -1) {
      out += html.slice(from);
      break;
    }
    out += html.slice(from, open);
    from = close + closeTag.length;
  }
  return out;
}

// The saved dark template puts "Pro tip" / "ጠቃሚ ምክር" in the cell beside the stat.
// Drop that cell (heading, [Tip] / [ምክር], and both languages). Keep the stat.
function stripTipSection(html: string) {
  let next = html;
  for (const marker of ["<!--dx:am_tip-->", "<!--dx:en_tip-->", ">Pro tip<", ">ጠቃሚ ምክር<"]) {
    next = removeInnermostTag(next, marker, "td");
  }
  next = next
    .replace(/<!--dx:am_tip-->[\s\S]*?<!--\/dx:am_tip-->/g, "")
    .replace(/<!--dx:en_tip-->[\s\S]*?<!--\/dx:en_tip-->/g, "")
    .replaceAll("<!-- ============ STAT / TIP ============ -->", "<!-- ============ STAT ============ -->");
  return next.replace(/<td\b[^>]*\bstat-cell\b[^>]*>/gi, (tag, offset) => {
    const rowStart = next.lastIndexOf("<tr", offset);
    const rowEnd = next.indexOf("</tr>", offset);
    const row = rowStart === -1 || rowEnd === -1 ? "" : next.slice(rowStart, rowEnd);
    if (/<!--dx:(?:am|en)_tip-->|>Pro tip<|>ጠቃሚ ምክር</.test(row)) return tag;
    return tag
      .replace(/\swidth="200"/g, "")
      .replace(/width:\s*200px;?/g, "")
      .replace(/border-right:\s*1px solid #22406A;?/g, "");
  });
}

function insertForwarderNote(html: string) {
  if (html.includes(NOTE_MARKER) || html.includes(FORWARDER_NOTE_AM)) return html;
  const note = forwarderNoteHtml();
  const intro = "<!-- ============ INTRO ============ -->";
  const introAt = html.indexOf(intro);
  if (introAt !== -1) {
    const row = `<tr><td align="left" bgcolor="#FFFFFF" style="background-color:#FFFFFF;padding:12px 40px 4px 40px;">${note}</td></tr>\n`;
    return `${html.slice(0, introAt)}${row}${html.slice(introAt)}`;
  }
  const buttonAt = html.indexOf(`bgcolor="${BRAND_ORANGE}"`);
  if (buttonAt !== -1) {
    const tableAt = html.lastIndexOf("<table", buttonAt);
    if (tableAt !== -1) return `${html.slice(0, tableAt)}${note}\n${html.slice(tableAt)}`;
  }
  const linkAt = html.search(/<p\b[^>]*>\s*<a\b[^>]*href="https?:\/\/direexpress\.com\.et/i);
  if (linkAt !== -1) return `${html.slice(0, linkAt)}${note}\n${html.slice(linkAt)}`;
  const unsubAt = html.search(/\{\{\s*unsubscribe/);
  if (unsubAt !== -1) {
    const paragraphAt = html.lastIndexOf("<p", unsubAt);
    if (paragraphAt !== -1) return `${html.slice(0, paragraphAt)}${note}\n${html.slice(paragraphAt)}`;
  }
  return `${html}\n${note}`;
}

// The saved newsletter/template in Realtime Database overrides the code default.
// This runs when that HTML is loaded, previewed, and sent, so the wording,
// the tip removal, and the site-button rename do not wait for a click.
// It is safe to run more than once.
export function applyForwarderCopy(html: string) {
  return insertForwarderNote(
    replaceBrokerWording(stripTipSection(renameGroupButtonLabel(renameSiteButtonLabel(html)))),
  );
}
