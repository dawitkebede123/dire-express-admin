import { escapeHtml } from "@/lib/newsletter/blocks";

export type RecipientIdentity = {
  email: string;
  name?: string;
};

export function recipientDisplayName(recipient: RecipientIdentity) {
  const provided = (recipient.name ?? "").replace(/[\r\n]+/g, " ").trim();
  if (provided) return provided;
  const local = recipient.email.split("@")[0] ?? "";
  return local.replace(/[._+-]+/g, " ").replace(/[\r\n]+/g, " ").trim();
}

export function recipientFirstName(recipient: RecipientIdentity) {
  const display = recipientDisplayName(recipient);
  return display.split(/\s+/).find(Boolean) ?? "";
}

function fill(input: string, name: string, firstName: string) {
  return input.replaceAll("{{first_name}}", firstName).replaceAll("{{name}}", name);
}

export function personalizeNewsletter(
  input: { subject: string; html: string },
  recipient: RecipientIdentity,
) {
  const name = recipientDisplayName(recipient);
  const firstName = recipientFirstName(recipient);
  return {
    subject: fill(input.subject, name, firstName),
    html: fill(input.html, escapeHtml(name), escapeHtml(firstName)),
  };
}
