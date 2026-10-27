import { explainBrevoFailure, type BrevoFailureKind } from "@/lib/newsletter/brevo-error";
import { cleanCampaignPlainText } from "@/lib/newsletter/placeholders";
import { BREVO_IMPORT_CHUNK, chunkItems } from "@/lib/newsletter/brevo-batch";
import { brevoContactAttributes } from "@/lib/newsletter/brevo-html";
import { htmlToPlainText } from "@/lib/newsletter/deliverability";
import { isEmailAddress } from "@/lib/newsletter/recipients";
import type { RecipientIdentity } from "@/lib/newsletter/personalize";

// Checked 2026-10-26: OPTIONS and GET from https://dire-express-admin.web.app and
// http://localhost:3001 return Access-Control-Allow-Origin for api-key, content-type, and accept.
// Calls use credentials: "omit" so the wildcard allow-origin on the real response stays readable.
const BREVO_API = "https://api.brevo.com/v3";
const FOLDER_NAME = "Dire Express";

export class BrevoApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly kind: BrevoFailureKind;

  constructor(message: string, options: { status: number; code: string; kind: BrevoFailureKind }) {
    super(message);
    this.name = "BrevoApiError";
    this.status = options.status;
    this.code = options.code;
    this.kind = options.kind;
  }
}

export type BrevoAccountSummary = {
  email: string;
  planLabel: string;
  emailCredits: number | null;
};

export type BrevoContact = {
  email: string;
  name: string;
};

type BrevoListRecord = {
  id: number;
  name: string;
  folderId: number | null;
};

async function brevoRequest<T>(apiKey: string, path: string, init?: { method?: string; body?: unknown }): Promise<T | undefined> {
  const key = apiKey.trim();
  if (!key) {
    throw new BrevoApiError("Paste the Brevo API key first.", { status: 0, code: "missing_key", kind: "invalid_key" });
  }
  let response: Response;
  try {
    response = await fetch(`${BREVO_API}${path}`, {
      method: init?.method ?? "GET",
      credentials: "omit",
      cache: "no-store",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "api-key": key,
      },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new BrevoApiError(
      "The browser could not reach api.brevo.com. A direct call is allowed (Brevo answers browser preflight with this site's origin). Check the network connection and try again.",
      { status: 0, code: "network", kind: "network" },
    );
  }

  if (response.status === 204 || response.status === 202) {
    const text = await response.text();
    if (!text) return undefined;
    try {
      return JSON.parse(text) as T;
    } catch {
      return undefined;
    }
  }

  const text = await response.text();
  let payload: Record<string, unknown> | null = null;
  if (text) {
    try {
      const parsed = JSON.parse(text) as unknown;
      if (parsed && typeof parsed === "object") payload = parsed as Record<string, unknown>;
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const code = typeof payload?.code === "string" ? payload.code : "";
    const message = brevoErrorText(payload, text);
    const explained = explainBrevoFailure({ status: response.status, code, message });
    throw new BrevoApiError(explained.message, { status: response.status, code, kind: explained.kind });
  }

  if (!text) return undefined;
  return JSON.parse(text) as T;
}

function brevoErrorText(payload: Record<string, unknown> | null, text: string) {
  const message = typeof payload?.message === "string" ? payload.message : text.slice(0, 300);
  const extras: string[] = [];
  for (const key of ["unexistingEmails", "blackListedEmails", "withoutListEmails"] as const) {
    const value = payload?.[key];
    if (Array.isArray(value) && value.length) extras.push(`${key}: ${value.join(", ")}`);
  }
  return [message, ...extras].filter(Boolean).join(" ");
}

function asId(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchBrevoAccount(apiKey: string): Promise<BrevoAccountSummary> {
  const body = await brevoRequest<Record<string, unknown>>(apiKey, "/account");
  const email = typeof body?.email === "string" ? body.email : "";
  let emailCredits: number | null = null;
  let planLabel = "";
  if (Array.isArray(body?.plan)) {
    for (const entry of body.plan) {
      if (!entry || typeof entry !== "object") continue;
      const row = entry as Record<string, unknown>;
      if (row.type === "sms") continue;
      if (row.creditsType === "sendLimit" && typeof row.credits === "number") {
        emailCredits = row.credits;
        if (typeof row.type === "string" && !planLabel) planLabel = row.type;
      }
    }
  }
  if (Array.isArray(body?.planVerticals)) {
    for (const entry of body.planVerticals) {
      if (!entry || typeof entry !== "object") continue;
      const row = entry as Record<string, unknown>;
      if (row.planCategory === "Marketing" && typeof row.name === "string") {
        planLabel = row.name;
        break;
      }
    }
  }
  return { email, planLabel: planLabel || "Brevo", emailCredits };
}

async function listPaged<T>(apiKey: string, path: string, key: string) {
  const rows: T[] = [];
  for (let offset = 0; offset < 500; offset += 50) {
    const page = await brevoRequest<Record<string, unknown>>(apiKey, `${path}?limit=50&offset=${offset}`);
    const items = Array.isArray(page?.[key]) ? (page[key] as T[]) : [];
    rows.push(...items);
    if (items.length < 50) break;
  }
  return rows;
}

async function ensureFolder(apiKey: string) {
  const folders = await listPaged<Record<string, unknown>>(apiKey, "/contacts/folders", "folders");
  for (const folder of folders) {
    if (folder.name === FOLDER_NAME && asId(folder.id)) return asId(folder.id) as number;
  }
  const created = await brevoRequest<{ id?: number }>(apiKey, "/contacts/folders", {
    method: "POST",
    body: { name: FOLDER_NAME },
  });
  const id = asId(created?.id);
  if (!id) throw new BrevoApiError("Brevo did not return a folder id.", { status: 0, code: "folder", kind: "other" });
  return id;
}

async function readList(apiKey: string, listId: number) {
  try {
    const body = await brevoRequest<Record<string, unknown>>(apiKey, `/contacts/lists/${listId}`);
    const id = asId(body?.id);
    if (!id) return null;
    return {
      id,
      name: typeof body?.name === "string" ? body.name : "",
      folderId: asId(body?.folderId),
    } satisfies BrevoListRecord;
  } catch (error) {
    if (error instanceof BrevoApiError && error.status === 404) return null;
    throw error;
  }
}

async function findListByName(apiKey: string, folderId: number, name: string) {
  const lists = await listPaged<Record<string, unknown>>(apiKey, "/contacts/lists", "lists");
  for (const list of lists) {
    const id = asId(list.id);
    if (!id) continue;
    if (list.name === name && asId(list.folderId) === folderId) return id;
  }
  return null;
}

export async function ensureBrevoList(apiKey: string, name: string, existingId: number | null) {
  if (existingId) {
    const existing = await readList(apiKey, existingId);
    if (existing) return existing.id;
  }
  const folderId = await ensureFolder(apiKey);
  const trimmed = name.trim().slice(0, 120);
  const found = await findListByName(apiKey, folderId, trimmed);
  if (found) return found;
  try {
    const created = await brevoRequest<{ id?: number }>(apiKey, "/contacts/lists", {
      method: "POST",
      body: { name: trimmed, folderId },
    });
    const id = asId(created?.id);
    if (!id) throw new BrevoApiError("Brevo did not return a list id.", { status: 0, code: "list", kind: "other" });
    return id;
  } catch (error) {
    const again = await findListByName(apiKey, folderId, trimmed);
    if (again) return again;
    throw error;
  }
}

async function ensureFirstNameAttribute(apiKey: string) {
  try {
    await brevoRequest(apiKey, "/contacts/attributes/normal/FIRSTNAME", {
      method: "POST",
      body: { type: "text" },
    });
  } catch (error) {
    if (error instanceof BrevoApiError && (error.status === 400 || error.status === 409)) return;
    throw error;
  }
}

async function waitForImport(apiKey: string, processId: number) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const body = await brevoRequest<Record<string, unknown>>(apiKey, `/processes/${processId}`);
    const status = typeof body?.status === "string" ? body.status : "";
    if (status === "completed") return;
    if (status === "failed" || status === "cancelled") {
      throw new BrevoApiError(`Brevo contact import ${status} (process ${processId}).`, {
        status: 0,
        code: status,
        kind: "other",
      });
    }
    await sleep(1000);
  }
  throw new BrevoApiError(
    `Brevo is still importing contacts (process ${processId}). Wait a minute and try the send again. This batch was not marked as sent.`,
    { status: 0, code: "import_timeout", kind: "other" },
  );
}

export async function upsertBrevoContact(apiKey: string, listId: number, contact: BrevoContact) {
  await ensureFirstNameAttribute(apiKey);
  await brevoRequest(apiKey, "/contacts", {
    method: "POST",
    body: {
      email: contact.email,
      attributes: brevoContactAttributes(contact),
      listIds: [listId],
      updateEnabled: true,
      emailBlacklisted: false,
    },
  });
}

export async function importBrevoContacts(
  apiKey: string,
  listId: number,
  contacts: BrevoContact[],
  onProgress?: (message: string) => void,
) {
  if (!contacts.length) return;
  await ensureFirstNameAttribute(apiKey);
  const chunks = chunkItems(contacts, BREVO_IMPORT_CHUNK);
  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    onProgress?.(`Importing contacts ${index * BREVO_IMPORT_CHUNK + 1}–${index * BREVO_IMPORT_CHUNK + chunk.length} of ${contacts.length}…`);
    const body = await brevoRequest<{ processId?: number }>(apiKey, "/contacts/import", {
      method: "POST",
      body: {
        listIds: [listId],
        updateExistingContacts: true,
        emptyContactsAttributes: false,
        emailBlacklist: false,
        smsBlacklist: false,
        disableNotification: true,
        jsonBody: chunk.map((contact) => ({
          email: contact.email,
          attributes: brevoContactAttributes(contact),
        })),
      },
    });
    const processId = asId(body?.processId);
    if (!processId) {
      throw new BrevoApiError("Brevo accepted the import but did not return a process id.", {
        status: 0,
        code: "import",
        kind: "other",
      });
    }
    onProgress?.(`Waiting for Brevo to finish import ${index + 1} of ${chunks.length}…`);
    await waitForImport(apiKey, processId);
  }
}

export type BrevoCampaignDraft = {
  name: string;
  subject: string;
  previewText: string;
  senderName: string;
  senderEmail: string;
  htmlContent: string;
  listId: number;
};

export async function createBrevoCampaign(apiKey: string, draft: BrevoCampaignDraft) {
  // Free-plan body. Brevo answers HTTP 405 method_not_allowed
  // ("You are not allowed to avail tag option for your campaign") when `tag` is sent
  // on a plan below Professional. Also omitted, because they are paid or add-on only:
  // abTesting and its subject/split/winner fields, sendAtBestTime, ipWarmupEnable
  // (plus increaseRate and initialQuota), custom utm* overrides, emailExpirationDate,
  // attachmentUrl, segment ids, and custom unsubscribe/profile form ids.
  // inlineImageActivation false is the API default (do not embed images).
  // mirrorActive false keeps Brevo from adding a view-in-browser link; that flag is not plan-gated.
  const body: Record<string, unknown> = {
    name: draft.name.slice(0, 150),
    subject: cleanCampaignPlainText(draft.subject) || draft.subject.trim(),
    sender: { name: draft.senderName, email: draft.senderEmail },
    replyTo: draft.senderEmail,
    htmlContent: draft.htmlContent,
    recipients: { listIds: [draft.listId] },
    inlineImageActivation: false,
    mirrorActive: false,
    // Omitting these stores the sentinels [DEFAULT_HEADER] and [DEFAULT_FOOTER].
    // A new account has no custom chrome, so the sent email shows that bracket text.
    // An empty string is treated as omitted. A span survives trim and has no visible text.
    header: "<span></span>",
    footer: "<span></span>",
  };
  const preview = cleanCampaignPlainText(draft.previewText);
  if (preview) body.previewText = preview.slice(0, 300);
  const created = await brevoRequest<{ id?: number }>(apiKey, "/emailCampaigns", { method: "POST", body });
  const id = asId(created?.id);
  if (!id) throw new BrevoApiError("Brevo did not return a campaign id.", { status: 0, code: "campaign", kind: "other" });
  return id;
}

export async function sendBrevoTest(apiKey: string, campaignId: number, emailTo: string) {
  await brevoRequest(apiKey, `/emailCampaigns/${campaignId}/sendTest`, {
    method: "POST",
    body: { emailTo: [emailTo] },
  });
}

export async function sendBrevoCampaignNow(apiKey: string, campaignId: number) {
  await brevoRequest(apiKey, `/emailCampaigns/${campaignId}/sendNow`, { method: "POST" });
}

// One transactional message to one address. No cc, bcc, list, or campaign.
// Brevo's HTTP API has no switch that removes open and click tracking. The
// X-Mailin-Track headers are the SMTP switches some accounts honor.
// contactPixelTrackingConsent false only anonymises tracking when that account
// feature is on. It does not remove the pixel.
export async function sendBrevoTransactional(
  apiKey: string,
  message: {
    senderName: string;
    senderEmail: string;
    replyToEmail: string;
    replyToName?: string;
    toEmail: string;
    toName?: string;
    subject: string;
    htmlContent: string;
    textContent: string;
  },
) {
  const toEmail = message.toEmail.trim();
  if (!isEmailAddress(toEmail)) throw new Error("Send exactly one recipient.");
  const senderEmail = message.senderEmail.trim();
  if (!isEmailAddress(senderEmail)) throw new Error("The sender email is not valid.");
  const replyToEmail = message.replyToEmail.trim();
  if (!isEmailAddress(replyToEmail)) throw new Error("The reply-to email is not valid.");
  const textContent = message.textContent.trim() || htmlToPlainText(message.htmlContent);
  if (!textContent) throw new Error("A plain-text version is required.");
  const senderName = message.senderName.trim().slice(0, 70);
  const replyToName = (message.replyToName ?? senderName).trim().slice(0, 70);
  const to: { email: string; name?: string; contactPixelTrackingConsent: false } = {
    email: toEmail,
    contactPixelTrackingConsent: false,
  };
  const name = message.toName?.trim().slice(0, 70);
  if (name) to.name = name;
  const body = await brevoRequest<{ messageId?: string }>(apiKey, "/smtp/email", {
    method: "POST",
    body: {
      sender: { name: senderName, email: senderEmail },
      to: [to],
      replyTo: { email: replyToEmail, name: replyToName || senderName },
      subject: message.subject,
      htmlContent: message.htmlContent,
      textContent,
      headers: {
        "X-Mailin-Track": "false",
        "X-Mailin-Track-Clicks": "false",
        "X-Mailin-Track-Opens": "false",
      },
    },
  });
  return typeof body?.messageId === "string" ? body.messageId : "";
}

export async function deleteBrevoCampaign(apiKey: string, campaignId: number) {
  await brevoRequest(apiKey, `/emailCampaigns/${campaignId}`, { method: "DELETE" });
}

export function campaignContact(recipient: RecipientIdentity): BrevoContact {
  return { email: recipient.email.trim().toLowerCase(), name: recipient.name ?? "" };
}
