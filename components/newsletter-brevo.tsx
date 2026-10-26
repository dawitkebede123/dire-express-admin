"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { BREVO_AUTHORIZED_IPS_URL, BREVO_TRACKING_HELP_URL } from "@/lib/newsletter/brevo-error";
import { BREVO_DAILY_LIMIT, nextUnsentBatch } from "@/lib/newsletter/brevo-batch";
import {
  BrevoApiError,
  createBrevoCampaign,
  deleteBrevoCampaign,
  ensureBrevoList,
  fetchBrevoAccount,
  importBrevoContacts,
  sendBrevoCampaignNow,
  sendBrevoTest,
  upsertBrevoContact,
  type BrevoAccountSummary,
  type BrevoContact,
} from "@/lib/newsletter/brevo";
import { toBrevoCampaignHtml } from "@/lib/newsletter/brevo-html";
import {
  forgetBrevoApiKey,
  patchBrevoSettings,
  saveBrevoApiKey,
  useBrevoApiKey,
  useBrevoSettings,
} from "@/lib/newsletter/brevo-storage";
import { isEmailAddress, parseRecipientFile } from "@/lib/newsletter/recipients";
import { permissionMessage } from "@/lib/rtdb/client-writes";
import { logNewsletterCampaign } from "@/lib/rtdb/newsletter";
import {
  addSubscribers,
  clearSubscriberSendHistory,
  createSubscriberList,
  deleteSubscriberList,
  loadSubscriberLists,
  markSubscribersSent,
  rememberBrevoListId,
  type NewsletterSubscriberList,
} from "@/lib/rtdb/newsletter-lists";

const TABLE_LIMIT = 400;
const fieldClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 font-normal outline-none focus:border-primary";

type PendingSend = {
  listId: string;
  listName: string;
  subscriberIds: string[];
  contacts: BrevoContact[];
  subject: string;
  previewText: string;
  senderName: string;
  senderEmail: string;
  html: string;
  alreadySent: number;
  waitingAfter: number;
};

type PendingMark = {
  listId: string;
  subscriberIds: string[];
  brevoCampaignId: string;
  subject: string;
  total: number;
};

function messageFrom(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function batchListName(listName: string) {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `DX batch ${stamp} ${listName}`.slice(0, 120);
}

export function useBrevoNewsletter(options: {
  active: boolean;
  subject: string;
  html: string;
  previewName: string;
  adminEmail: string;
  onConfigured: () => void;
  onForgot: () => void;
}) {
  const settings = useBrevoSettings();
  const apiKey = useBrevoApiKey();
  const [keyDraft, setKeyDraft] = useState("");
  const [account, setAccount] = useState<BrevoAccountSummary | null>(null);
  const [lists, setLists] = useState<NewsletterSubscriberList[]>([]);
  const [listsLoaded, setListsLoaded] = useState(false);
  const [listsLoading, setListsLoading] = useState(false);
  const [listsError, setListsError] = useState("");
  const [selectedListId, setSelectedListId] = useState("");
  const [newListName, setNewListName] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingSend, setPendingSend] = useState<PendingSend | null>(null);
  const [pendingMark, setPendingMark] = useState<PendingMark | null>(null);
  const senderName = settings.senderName;
  const senderEmail = settings.senderEmail;
  const previewText = settings.previewText;
  const batchSize = settings.batchSize;
  const testEmail = settings.testEmail;

  const refreshLists = useCallback(async () => {
    setListsLoading(true);
    try {
      const next = await loadSubscriberLists();
      setLists(next);
      setListsError("");
      setSelectedListId((current) => (current && next.some((list) => list.id === current) ? current : next[0]?.id ?? ""));
      setListsLoaded(true);
    } catch (loadError) {
      setListsError(permissionMessage(loadError, "Could not load subscriber lists."));
    } finally {
      setListsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!options.active) return;
    let cancelled = false;
    loadSubscriberLists()
      .then((next) => {
        if (cancelled) return;
        setLists(next);
        setListsError("");
        setListsLoaded(true);
        setSelectedListId((current) => (current && next.some((list) => list.id === current) ? current : next[0]?.id ?? ""));
      })
      .catch((loadError: unknown) => {
        if (cancelled) return;
        setListsError(permissionMessage(loadError, "Could not load subscriber lists."));
        setListsLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [options.active]);

  useEffect(() => {
    if (!options.active || !apiKey) return;
    let cancelled = false;
    fetchBrevoAccount(apiKey)
      .then((summary) => {
        if (!cancelled) {
          setAccount(summary);
          setError("");
        }
      })
      .catch((accountError: unknown) => {
        if (cancelled) return;
        setAccount(null);
        setError(messageFrom(accountError, "Could not reach Brevo with the saved key."));
      });
    return () => {
      cancelled = true;
    };
  }, [options.active, apiKey]);

  function fail(actionError: unknown, fallback: string) {
    const message = messageFrom(actionError, fallback);
    setStatus("");
    setError(message);
    toast.error(message.length > 220 ? `${message.slice(0, 220)}…` : message);
  }

  async function saveKey() {
    const candidate = keyDraft.trim();
    if (!candidate || busy) return;
    setBusy(true);
    setError("");
    try {
      const summary = await fetchBrevoAccount(candidate);
      saveBrevoApiKey(candidate);
      setKeyDraft("");
      setAccount(summary);
      setStatus(summary.email ? `Key saved in this browser. Brevo account ${summary.email}.` : "Key saved in this browser.");
      options.onConfigured();
      toast.success("Brevo API key saved in this browser");
    } catch (saveError) {
      fail(saveError, "Could not save the Brevo API key.");
    } finally {
      setBusy(false);
    }
  }

  function forgetKey() {
    forgetBrevoApiKey();
    setKeyDraft("");
    setAccount(null);
    setStatus("Brevo API key removed from this browser.");
    setError("");
    options.onForgot();
    toast.success("Brevo API key forgotten");
  }

  async function createList() {
    const name = newListName.trim();
    if (!name || busy) return;
    setBusy(true);
    setError("");
    try {
      const id = await createSubscriberList(name);
      setNewListName("");
      setSelectedListId(id);
      await refreshLists();
      setStatus(`List “${name}” saved in Realtime Database.`);
    } catch (createError) {
      fail(createError, "Could not create the list.");
    } finally {
      setBusy(false);
    }
  }

  async function removeList() {
    const list = lists.find((item) => item.id === selectedListId);
    if (!list || busy) return;
    const proceed = window.confirm(`Delete the subscriber list “${list.name}” from Dire Express? This does not delete contacts in Brevo.`);
    if (!proceed) return;
    setBusy(true);
    setError("");
    try {
      await deleteSubscriberList(list.id);
      await refreshLists();
      setStatus(`Deleted “${list.name}”.`);
    } catch (deleteError) {
      fail(deleteError, "Could not delete the list.");
    } finally {
      setBusy(false);
    }
  }

  async function importFile(file: File | undefined) {
    if (!file || busy) return;
    setBusy(true);
    setError("");
    try {
      let listId = selectedListId;
      let listName = lists.find((item) => item.id === listId)?.name ?? "";
      if (!listId) {
        listName = newListName.trim() || file.name.replace(/\.[^.]+$/, "") || "Subscribers";
        listId = await createSubscriberList(listName);
        setNewListName("");
        setSelectedListId(listId);
      }
      const parsed = await parseRecipientFile(file);
      const valid = parsed.recipients.filter((row) => row.status === "valid");
      const result = await addSubscribers(
        listId,
        valid.map((row) => ({ email: row.email, name: row.name })),
      );
      await refreshLists();
      setStatus(
        `“${listName || "List"}”: added ${result.added}, updated ${result.renamed} names, skipped ${parsed.invalidCount} rows.`,
      );
    } catch (importError) {
      fail(importError, "Could not import that file.");
    } finally {
      setBusy(false);
    }
  }

  function selectedList() {
    return lists.find((item) => item.id === selectedListId) ?? null;
  }

  function requireMessage() {
    const subject = options.subject.trim();
    const html = options.html;
    const sender = senderName.trim();
    const from = senderEmail.trim();
    if (!apiKey) throw new Error("Save a Brevo API key in this browser first.");
    if (!subject) throw new Error("The subject is empty.");
    if (html.trim().length < 11) throw new Error("The HTML template is too short for Brevo.");
    if (html.length > 900_000) throw new Error("The HTML template is over Brevo's 1 MB campaign limit.");
    if (!sender) throw new Error("Enter the sender name.");
    if (!isEmailAddress(from)) throw new Error("Enter a valid sender email. The default is contact@direexpress.com.et.");
    return { subject, html, sender, from };
  }

  function requireSendable() {
    const message = requireMessage();
    const list = selectedList();
    if (!list) throw new Error("Choose a subscriber list.");
    return { ...message, list };
  }

  async function syncList(list: NewsletterSubscriberList) {
    if (!list.subscribers.length) throw new Error("This list has no subscribers to sync.");
    setStatus(`Syncing ${list.subscribers.length} contacts to Brevo…`);
    const brevoListId = await ensureBrevoList(apiKey, `Dire Express — ${list.name}`, list.brevoListId);
    if (brevoListId !== list.brevoListId) await rememberBrevoListId(list.id, brevoListId);
    await importBrevoContacts(
      apiKey,
      brevoListId,
      list.subscribers.map((row) => ({ email: row.email, name: row.name })),
      setStatus,
    );
    return brevoListId;
  }

  async function syncSelected() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (!apiKey) throw new Error("Save a Brevo API key in this browser first.");
      const list = selectedList();
      if (!list) throw new Error("Choose a subscriber list.");
      const brevoListId = await syncList(list);
      await refreshLists();
      setStatus(`Synced ${list.subscribers.length} contacts to Brevo list ${brevoListId}. Nothing was sent.`);
      toast.success("Subscriber list synced to Brevo");
    } catch (syncError) {
      fail(syncError, "Could not sync the list to Brevo.");
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    if (busy) return;
    const to = (testEmail.trim() || options.adminEmail.trim()).toLowerCase();
    setBusy(true);
    setError("");
    let campaignId = 0;
    try {
      const { subject, html, sender, from } = requireMessage();
      if (!isEmailAddress(to)) throw new Error("Enter the address that should receive the test.");
      setStatus("Preparing a Brevo test list…");
      const listId = await ensureBrevoList(apiKey, "Dire Express — test", null);
      await upsertBrevoContact(apiKey, listId, { email: to, name: options.previewName.trim() || sender });
      const campaignHtml = toBrevoCampaignHtml(html, previewText);
      setStatus("Creating the test campaign…");
      campaignId = await createBrevoCampaign(apiKey, {
        name: `Dire Express test ${subject}`.slice(0, 150),
        subject,
        previewText,
        senderName: sender,
        senderEmail: from,
        htmlContent: campaignHtml,
        listId,
      });
      setStatus(`Sending the test to ${to}…`);
      await sendBrevoTest(apiKey, campaignId, to);
      try {
        await deleteBrevoCampaign(apiKey, campaignId);
      } catch {
        // The test already went out. A leftover draft is harmless.
      }
      setStatus(`Test sent to ${to}. Subscribers were not marked as sent.`);
      toast.success(`Test sent to ${to}`);
    } catch (testError) {
      const extra = campaignId ? ` Draft campaign ${campaignId} is still in Brevo.` : "";
      fail(testError instanceof Error ? new Error(`${testError.message}${extra}`) : testError, "Test send failed.");
    } finally {
      setBusy(false);
    }
  }

  function requestSend() {
    if (busy) return;
    setError("");
    try {
      const { list, subject, html, sender, from } = requireSendable();
      const batch = nextUnsentBatch(list.subscribers, batchSize);
      if (!batch.length) {
        throw new Error("Everyone on this list is already marked sent. Clear the send history to mail them again.");
      }
      const sent = list.subscribers.length - list.subscribers.filter((row) => row.sentAt == null).length;
      setPendingSend({
        listId: list.id,
        listName: list.name,
        subscriberIds: batch.map((row) => row.id),
        contacts: batch.map((row) => ({ email: row.email, name: row.name })),
        subject,
        previewText,
        senderName: sender,
        senderEmail: from,
        html,
        alreadySent: sent,
        waitingAfter: list.subscribers.filter((row) => row.sentAt == null).length - batch.length,
      });
    } catch (prepareError) {
      fail(prepareError, "Cannot send yet.");
    }
  }

  async function saveSentFlags(mark: PendingMark) {
    await markSubscribersSent(mark.listId, mark.subscriberIds, mark.brevoCampaignId);
    try {
      await logNewsletterCampaign({
        subject: mark.subject,
        total: mark.total,
        sent: mark.total,
        failed: 0,
      });
    } catch (logError) {
      toast.error(permissionMessage(logError, "The campaign log was not saved."));
    }
    setPendingMark(null);
    await refreshLists();
  }

  async function confirmSend() {
    const pending = pendingSend;
    if (!pending || busy) return;
    setPendingSend(null);
    setBusy(true);
    setError("");
    try {
      const list = lists.find((item) => item.id === pending.listId) ?? selectedList();
      if (!list) throw new Error("That subscriber list is no longer loaded.");
      const masterId = await syncList(list);
      setStatus(`Creating today's batch list for ${pending.contacts.length} people…`);
      const batchId = await ensureBrevoList(apiKey, batchListName(pending.listName), null);
      await importBrevoContacts(apiKey, batchId, pending.contacts, setStatus);
      setStatus("Creating the Brevo campaign…");
      const campaignId = await createBrevoCampaign(apiKey, {
        name: `Dire Express ${pending.subject}`.slice(0, 150),
        subject: pending.subject,
        previewText: pending.previewText,
        senderName: pending.senderName,
        senderEmail: pending.senderEmail,
        htmlContent: toBrevoCampaignHtml(pending.html, pending.previewText),
        listId: batchId,
      });
      setStatus(`Sending campaign ${campaignId}…`);
      try {
        await sendBrevoCampaignNow(apiKey, campaignId);
      } catch (sendError) {
        if (sendError instanceof BrevoApiError && sendError.kind === "daily_limit") {
          throw sendError;
        }
        throw sendError instanceof Error
          ? new Error(`${sendError.message} Campaign ${campaignId} was created but not sent. Nobody was marked as sent.`)
          : sendError;
      }
      const mark: PendingMark = {
        listId: pending.listId,
        subscriberIds: pending.subscriberIds,
        brevoCampaignId: String(campaignId),
        subject: pending.subject,
        total: pending.contacts.length,
      };
      try {
        await saveSentFlags(mark);
      } catch (markError) {
        setPendingMark(mark);
        throw new Error(
          `Brevo accepted campaign ${campaignId} (list ${batchId}, master list ${masterId}), but the sent flags were not saved. Save them before the next batch or these ${pending.contacts.length} people can be emailed again. ${permissionMessage(markError, "Could not write sent flags.")}`,
        );
      }
      const left = pending.waitingAfter;
      setStatus(
        `Sent ${pending.contacts.length} via Brevo campaign ${campaignId}.${left ? ` ${left} still waiting for a later day.` : " This list is finished."}`,
      );
      toast.success(`Sent ${pending.contacts.length} with Brevo`);
    } catch (sendError) {
      fail(sendError, "Brevo send failed.");
    } finally {
      setBusy(false);
    }
  }

  async function retryMark() {
    if (!pendingMark || busy) return;
    setBusy(true);
    setError("");
    try {
      await saveSentFlags(pendingMark);
      setStatus("Saved the sent flags for the batch Brevo already accepted.");
      toast.success("Sent flags saved");
    } catch (markError) {
      fail(markError, "Could not save the sent flags.");
    } finally {
      setBusy(false);
    }
  }

  async function clearSent() {
    const list = selectedList();
    if (!list || busy) return;
    const proceed = window.confirm(
      `Clear send history for “${list.name}”? The next batch can include everyone again. This does not delete the addresses.`,
    );
    if (!proceed) return;
    setBusy(true);
    setError("");
    try {
      const cleared = await clearSubscriberSendHistory(list.id);
      await refreshLists();
      setStatus(`Cleared send history for ${cleared} subscribers.`);
    } catch (clearError) {
      fail(clearError, "Could not clear send history.");
    } finally {
      setBusy(false);
    }
  }

  const list = selectedList();
  const unsent = list ? list.subscribers.filter((row) => row.sentAt == null) : [];
  const batch = list ? nextUnsentBatch(list.subscribers, batchSize) : [];

  return {
    apiKeySaved: Boolean(apiKey),
    keyDraft,
    setKeyDraft,
    senderName,
    setSenderName: (value: string) => patchBrevoSettings({ senderName: value }),
    senderEmail,
    setSenderEmail: (value: string) => patchBrevoSettings({ senderEmail: value }),
    previewText,
    setPreviewText: (value: string) => patchBrevoSettings({ previewText: value }),
    batchSize,
    setBatchSize: (value: number) => patchBrevoSettings({ batchSize: value }),
    testEmail,
    setTestEmail: (value: string) => patchBrevoSettings({ testEmail: value }),
    account,
    lists,
    listsLoading: listsLoading || !listsLoaded,
    listsError,
    selectedListId,
    setSelectedListId,
    newListName,
    setNewListName,
    list,
    unsentCount: unsent.length,
    batch,
    status,
    error,
    busy,
    pendingSend,
    setPendingSend,
    pendingMark,
    saveKey,
    forgetKey,
    createList,
    removeList,
    importFile,
    syncSelected,
    sendTest,
    requestSend,
    confirmSend,
    retryMark,
    clearSent,
    adminEmail: options.adminEmail,
  };
}

export type BrevoNewsletterController = ReturnType<typeof useBrevoNewsletter>;

function Notice({ error, status }: { error: string; status: string }) {
  return (
    <>
      {error ? (
        <p role="alert" className="mt-4 whitespace-pre-wrap rounded-lg border border-danger bg-danger-bg px-4 py-3 text-sm text-danger">
          {error}
        </p>
      ) : null}
      {status ? <p className="mt-3 text-sm text-muted">{status}</p> : null}
    </>
  );
}

export function BrevoSettings({ controller }: { controller: BrevoNewsletterController }) {
  const credits =
    controller.account?.emailCredits == null ? "" : `${controller.account.emailCredits} email credits reported`;
  return (
    <section className="mt-6 rounded-xl border border-border bg-card p-5 shadow-sm">
      <h2 className="text-sm font-semibold">Brevo sender</h2>
      <p className="mt-2 text-sm text-muted">
        The API key stays in this browser’s localStorage only. It is not written to Realtime Database, source, or an env
        file. Forget key deletes it from this browser.
      </p>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="flex min-w-[16rem] flex-1 flex-col gap-1.5 text-sm font-medium">
          {controller.apiKeySaved ? "Replace API key" : "Brevo API key"}
          <input
            type="password"
            autoComplete="off"
            value={controller.keyDraft}
            onChange={(event) => controller.setKeyDraft(event.target.value)}
            placeholder={controller.apiKeySaved ? "Paste a new v3 key to replace the saved one" : "xkeysib-…"}
            className={`h-11 ${fieldClass}`}
          />
        </label>
        <button
          type="button"
          onClick={() => void controller.saveKey()}
          disabled={controller.busy || !controller.keyDraft.trim()}
          className="h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-70"
        >
          {controller.apiKeySaved ? "Replace key" : "Save key"}
        </button>
        {controller.apiKeySaved ? (
          <button
            type="button"
            onClick={controller.forgetKey}
            disabled={controller.busy}
            className="h-11 rounded-lg border border-border px-4 text-sm font-semibold disabled:opacity-70"
          >
            Forget key
          </button>
        ) : null}
      </div>
      <p className="mt-3 text-sm text-muted">
        {controller.apiKeySaved
          ? "A key is saved in this browser."
          : "No key saved. Brevo stays unavailable until you paste one."}
        {controller.account?.email ? ` Connected as ${controller.account.email} (${controller.account.planLabel}${credits ? `, ${credits}` : ""}).` : ""}
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Sender name
          <input
            value={controller.senderName}
            onChange={(event) => controller.setSenderName(event.target.value)}
            className={`h-11 ${fieldClass}`}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Sender email
          <input
            value={controller.senderEmail}
            onChange={(event) => controller.setSenderEmail(event.target.value)}
            className={`h-11 ${fieldClass}`}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium sm:col-span-2">
          Preview text
          <input
            value={controller.previewText}
            maxLength={300}
            onChange={(event) => controller.setPreviewText(event.target.value)}
            className={`h-11 ${fieldClass}`}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Batch size (max {BREVO_DAILY_LIMIT}/day)
          <input
            type="number"
            min={1}
            max={BREVO_DAILY_LIMIT}
            value={controller.batchSize}
            onChange={(event) => {
              const parsed = Number(event.target.value);
              if (Number.isFinite(parsed)) controller.setBatchSize(Math.min(BREVO_DAILY_LIMIT, Math.max(1, Math.floor(parsed))));
            }}
            className={`h-11 ${fieldClass}`}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Send test to
          <input
            value={controller.testEmail}
            placeholder={controller.adminEmail || "you@direexpress.com.et"}
            onChange={(event) => controller.setTestEmail(event.target.value)}
            className={`h-11 ${fieldClass}`}
          />
        </label>
      </div>
      <p className="mt-4 text-sm text-muted">
        Verify the sender at Brevo → Senders, domains & IPs before the first real send. The free plan sends about{" "}
        {BREVO_DAILY_LIMIT} emails a day, so each press of Send now mails at most one batch. Open and click tracking
        cannot be turned off per campaign in the API. Turn them off in the Brevo tracking settings (
        <a href={BREVO_TRACKING_HELP_URL} className="underline" target="_blank" rel="noreferrer">
          how tracking works
        </a>
        ). This page does leave the mirror link off. If Brevo answers “unrecognised IP”, allow it at{" "}
        <a href={BREVO_AUTHORIZED_IPS_URL} className="underline" target="_blank" rel="noreferrer">
          Authorized IPs
        </a>
        .
      </p>
      <Notice error={controller.error} status="" />
    </section>
  );
}

export function BrevoAudience({ controller }: { controller: BrevoNewsletterController }) {
  const list = controller.list;
  const visible = list ? list.subscribers.slice() : [];
  visible.sort((a, b) => {
    const aWaiting = a.sentAt == null ? 0 : 1;
    const bWaiting = b.sentAt == null ? 0 : 1;
    return aWaiting - bWaiting || a.email.localeCompare(b.email);
  });
  const rows = visible.slice(0, TABLE_LIMIT);
  const pending = controller.pendingSend;

  return (
    <section className="mt-6 rounded-xl border border-border bg-card p-5 shadow-sm">
      <h2 className="text-sm font-semibold">Brevo subscribers</h2>
      <p className="mt-2 text-sm text-muted">
        Lists live in Realtime Database at newsletter/lists. Sync copies the chosen list into a Brevo contact list in
        batches of 100 and does not send. Send now syncs that list, then creates a campaign for the next unsent batch
        only, so people already mailed are not included again today.
      </p>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="flex min-w-[16rem] flex-1 flex-col gap-1.5 text-sm font-medium">
          Subscriber list
          <select
            value={controller.selectedListId}
            onChange={(event) => controller.setSelectedListId(event.target.value)}
            className={`h-11 ${fieldClass}`}
          >
            <option value="">Select a list</option>
            {controller.lists.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} ({item.subscribers.length})
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[12rem] flex-col gap-1.5 text-sm font-medium">
          New list name
          <input
            value={controller.newListName}
            onChange={(event) => controller.setNewListName(event.target.value)}
            className={`h-11 ${fieldClass}`}
          />
        </label>
        <button
          type="button"
          onClick={() => void controller.createList()}
          disabled={controller.busy || !controller.newListName.trim()}
          className="h-11 rounded-lg border border-border px-4 text-sm font-semibold disabled:opacity-70"
        >
          Create list
        </button>
        <button
          type="button"
          onClick={() => void controller.removeList()}
          disabled={controller.busy || !list}
          className="h-11 rounded-lg border border-border px-4 text-sm font-semibold disabled:opacity-70"
        >
          Delete list
        </button>
      </div>
      {controller.listsLoading ? <p className="mt-3 text-sm text-muted">Loading lists…</p> : null}
      {controller.listsError ? <p className="mt-3 text-sm text-danger">{controller.listsError}</p> : null}
      <label className="mt-4 block text-sm font-medium">
        Add a spreadsheet to the selected list
        <input
          type="file"
          accept=".xlsx,.xls,.csv,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          disabled={controller.busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            void controller.importFile(file);
          }}
          className="mt-2 block font-normal"
        />
      </label>
      {list ? (
        <>
          <p className="mt-4 text-sm">
            <span className="font-semibold">{list.subscribers.length}</span> subscribers,{" "}
            <span className="font-semibold">{list.subscribers.length - controller.unsentCount}</span> already sent,{" "}
            <span className="font-semibold">{controller.unsentCount}</span> waiting. Next batch:{" "}
            <span className="font-semibold">{controller.batch.length}</span>.
            {list.brevoListId ? ` Brevo list #${list.brevoListId}.` : " Not synced to Brevo yet."}
          </p>
          <div className="mt-4 max-h-80 overflow-auto rounded-lg border border-border">
            <table className="min-w-full text-left text-sm">
              <thead className="sticky top-0 bg-background text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">Email</th>
                  <th className="px-3 py-2 font-medium">Full name</th>
                  <th className="px-3 py-2 font-medium">Send</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-border">
                    <td className="px-3 py-2">{row.email}</td>
                    <td className="px-3 py-2">{row.name || "—"}</td>
                    <td className={`px-3 py-2 ${row.sentAt ? "text-success" : "text-muted"}`}>
                      {row.sentAt ? `Sent ${new Date(row.sentAt).toLocaleString()}` : "Waiting"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {list.subscribers.length > rows.length ? (
            <p className="mt-2 text-xs text-muted">
              Showing the first {rows.length} of {list.subscribers.length}. Sending uses the whole list.
            </p>
          ) : null}
        </>
      ) : (
        <p className="mt-4 text-sm text-muted">No list yet. Create one, or attach a spreadsheet and a list is created from the file name.</p>
      )}
      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => void controller.syncSelected()}
          disabled={controller.busy || !controller.apiKeySaved || !list?.subscribers.length}
          className="h-11 rounded-lg border border-border px-4 text-sm font-semibold disabled:opacity-70"
        >
          Sync to Brevo
        </button>
        <button
          type="button"
          onClick={() => void controller.sendTest()}
          disabled={controller.busy || !controller.apiKeySaved}
          className="h-11 rounded-lg border border-border px-4 text-sm font-semibold disabled:opacity-70"
        >
          Send test to me
        </button>
        <button
          type="button"
          onClick={controller.requestSend}
          disabled={controller.busy || !controller.apiKeySaved || !controller.batch.length}
          className="h-11 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-70"
        >
          Send now
        </button>
        <button
          type="button"
          onClick={() => void controller.clearSent()}
          disabled={controller.busy || !list?.subscribers.some((row) => row.sentAt)}
          className="h-11 rounded-lg border border-border px-4 text-sm font-semibold disabled:opacity-70"
        >
          Clear send history
        </button>
      </div>
      {controller.pendingMark ? (
        <button
          type="button"
          onClick={() => void controller.retryMark()}
          disabled={controller.busy}
          className="mt-3 h-11 rounded-lg border border-danger px-4 text-sm font-semibold text-danger disabled:opacity-70"
        >
          Save sent flags for the batch Brevo already accepted
        </button>
      ) : null}
      <p className="mt-3 text-sm text-muted">
        {"{{name}}"} is sent as the Brevo contact attribute FIRSTNAME (the full name). {"{{ unsubscribe }}"} stays in
        the HTML so Brevo can replace it. A test goes only to the address above and does not mark subscribers sent.
      </p>
      <Notice error={controller.error} status={controller.status} />
      {pending ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="brevo-send-title"
            className="w-full max-w-lg rounded-xl bg-card p-5 shadow-lg"
          >
            <h3 id="brevo-send-title" className="text-lg font-semibold">
              Send this batch now?
            </h3>
            <p className="mt-3 text-sm">
              This sends to <span className="font-semibold">{pending.contacts.length}</span>{" "}
              {pending.contacts.length === 1 ? "person" : "people"} on “{pending.listName}”.
            </p>
            <p className="mt-2 text-sm text-muted">
              {pending.alreadySent} already sent. {pending.waitingAfter} will still be waiting after this batch. Brevo’s
              free plan is about {BREVO_DAILY_LIMIT} emails a day.
              {controller.account?.emailCredits != null
                ? ` Brevo last reported ${controller.account.emailCredits} email credits.`
                : ""}
            </p>
            <dl className="mt-4 space-y-1 text-sm">
              <div>
                <dt className="inline text-muted">Subject: </dt>
                <dd className="inline">{pending.subject}</dd>
              </div>
              <div>
                <dt className="inline text-muted">From: </dt>
                <dd className="inline">
                  {pending.senderName} &lt;{pending.senderEmail}&gt;
                </dd>
              </div>
            </dl>
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void controller.confirmSend()}
                className="h-11 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground"
              >
                Send now
              </button>
              <button
                type="button"
                onClick={() => controller.setPendingSend(null)}
                className="h-11 rounded-lg border border-border px-4 text-sm font-semibold"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
