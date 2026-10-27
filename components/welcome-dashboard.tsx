"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useAdminAuth } from "@/components/auth-provider";
import { BREVO_DAILY_LIMIT, clampBatchSize } from "@/lib/newsletter/brevo-batch";
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
} from "@/lib/newsletter/brevo";
import { toBrevoCampaignHtml, previewNewsletterHtml } from "@/lib/newsletter/brevo-html";
import {
  forgetBrevoApiKey,
  patchBrevoSettings,
  saveBrevoApiKey,
  useBrevoApiKey,
  useBrevoSettings,
} from "@/lib/newsletter/brevo-storage";
import { GMAIL_DAILY_LIMIT, runNewsletterCampaign } from "@/lib/newsletter/campaign";
import { connectGmail, googleOAuthClientId, revokeGmailToken, sendGmailHtml, type GmailSession } from "@/lib/newsletter/gmail";
import { isTokenExpired } from "@/lib/newsletter/gmail-error";
import { isEmailAddress, parseRecipientFile } from "@/lib/newsletter/recipients";
import { toTitleCaseName } from "@/lib/newsletter/title-case";
import { personalizeNewsletter, recipientDisplayName } from "@/lib/newsletter/personalize";
import { brevoRemainingToday, sentOnLocalDay, welcomeBatch } from "@/lib/newsletter/welcome-quota";
import {
  DEFAULT_WELCOME_HTML,
  DEFAULT_WELCOME_PREVIEW,
  DEFAULT_WELCOME_SUBJECT,
} from "@/lib/newsletter/welcome-template";
import { permissionMessage } from "@/lib/rtdb/client-writes";
import { loadNewsletterCampaignSummaries, logNewsletterCampaign } from "@/lib/rtdb/newsletter";
import { loadSubscriberLists, type NewsletterSubscriberList } from "@/lib/rtdb/newsletter-lists";
import {
  addWelcomeRecipients,
  clearWelcomeSendHistory,
  loadWelcomeRecipients,
  loadWelcomeTemplate,
  markWelcomeSent,
  saveWelcomeTemplate,
  type WelcomeRecipient,
} from "@/lib/rtdb/welcome";

const PAGE_SIZE = 50;
const fieldClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 font-normal outline-none focus:border-primary";

type PendingSend = {
  channel: "brevo" | "gmail";
  ids: string[];
  contacts: { email: string; name: string }[];
  subject: string;
  senderName: string;
  senderEmail: string;
  html: string;
  alreadySent: number;
  waitingAfter: number;
};

type PendingMark = {
  ids: string[];
  brevoCampaignId: string;
  subject: string;
  total: number;
};

function messageFrom(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function contactName(email: string, name: string) {
  const titled = toTitleCaseName(name);
  if (titled) return titled;
  return toTitleCaseName(recipientDisplayName({ email, name: "" }));
}

function batchListName() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `DX welcome ${stamp}`.slice(0, 120);
}

export function WelcomeDashboard() {
  const clientId = googleOAuthClientId();
  const { admin } = useAdminAuth();
  const settings = useBrevoSettings();
  const apiKey = useBrevoApiKey();
  const provider: "brevo" | "gmail" =
    settings.provider === "gmail" ? "gmail" : settings.provider === "brevo" || apiKey ? "brevo" : "gmail";
  const [keyDraft, setKeyDraft] = useState("");
  const [account, setAccount] = useState<BrevoAccountSummary | null>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [subject, setSubject] = useState(DEFAULT_WELCOME_SUBJECT);
  const [html, setHtml] = useState(DEFAULT_WELCOME_HTML);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [previewName, setPreviewName] = useState("Abebe Bekele");
  const [recipients, setRecipients] = useState<WelcomeRecipient[]>([]);
  const [lists, setLists] = useState<NewsletterSubscriberList[]>([]);
  const [selectedListId, setSelectedListId] = useState("");
  const [sentToday, setSentToday] = useState(0);
  const [emailInput, setEmailInput] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(0);
  const [pendingSend, setPendingSend] = useState<PendingSend | null>(null);
  const [pendingMark, setPendingMark] = useState<PendingMark | null>(null);
  const [session, setSession] = useState<GmailSession | null>(null);
  const [connecting, setConnecting] = useState(false);
  const sessionRef = useRef<GmailSession | null>(null);
  const cancelRef = useRef(false);

  const refreshAudience = useCallback(async () => {
    const [nextRecipients, campaigns] = await Promise.all([
      loadWelcomeRecipients(),
      loadNewsletterCampaignSummaries(),
    ]);
    setRecipients(nextRecipients);
    setSentToday(sentOnLocalDay(campaigns));
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadWelcomeTemplate(), loadWelcomeRecipients(), loadNewsletterCampaignSummaries(), loadSubscriberLists()])
      .then(([saved, nextRecipients, campaigns, nextLists]) => {
        if (cancelled) return;
        if (saved) {
          setSubject(saved.subject);
          setHtml(saved.html);
          setUpdatedAt(saved.updatedAt);
        }
        setRecipients(nextRecipients);
        setSentToday(sentOnLocalDay(campaigns));
        setLists(nextLists);
        setSelectedListId(nextLists[0]?.id ?? "");
        setReady(true);
      })
      .catch((loadFailure: unknown) => {
        if (cancelled) return;
        setLoadError(permissionMessage(loadFailure, "Could not load the welcome email."));
        setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (provider !== "brevo" || !apiKey) return;
    let cancelled = false;
    fetchBrevoAccount(apiKey)
      .then((summary) => {
        if (!cancelled) setAccount(summary);
      })
      .catch(() => {
        if (!cancelled) setAccount(null);
      });
    return () => {
      cancelled = true;
    };
  }, [provider, apiKey]);

  const remaining = brevoRemainingToday(sentToday);
  const batchCap = provider === "gmail" ? Math.min(clampBatchSize(settings.batchSize), GMAIL_DAILY_LIMIT) : Math.min(clampBatchSize(settings.batchSize), remaining);
  const batch = welcomeBatch(recipients, batchCap);
  const sentCount = recipients.filter((row) => row.sentAt != null).length;
  const waiting = recipients.length - sentCount;
  const previewPerson = toTitleCaseName(previewName) || "Abebe Bekele";
  const previewHtml = previewNewsletterHtml(html, { email: "preview@direexpress.app", name: previewPerson });
  const pageCount = Math.max(1, Math.ceil(recipients.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageStart = currentPage * PAGE_SIZE;
  const pageRows = recipients.slice(pageStart, pageStart + PAGE_SIZE);

  function fail(actionError: unknown, fallback: string) {
    const message = messageFrom(actionError, fallback);
    setError(message);
    toast.error(message.length > 220 ? `${message.slice(0, 220)}…` : message);
  }

  function rememberSession(next: GmailSession | null) {
    sessionRef.current = next;
    setSession(next);
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      await saveWelcomeTemplate({ subject, html });
      setUpdatedAt(Date.now());
      toast.success("Welcome template saved");
    } catch (saveError) {
      toast.error(permissionMessage(saveError, "Could not save the welcome template"));
    } finally {
      setSaving(false);
    }
  }

  async function restoreDefault() {
    setSubject(DEFAULT_WELCOME_SUBJECT);
    setHtml(DEFAULT_WELCOME_HTML);
    setSaving(true);
    try {
      await saveWelcomeTemplate({ subject: DEFAULT_WELCOME_SUBJECT, html: DEFAULT_WELCOME_HTML });
      setUpdatedAt(Date.now());
      toast.success("Default welcome saved");
    } catch (saveError) {
      toast.error(permissionMessage(saveError, "Could not save the default welcome"));
    } finally {
      setSaving(false);
    }
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
      patchBrevoSettings({ provider: "brevo" });
      toast.success("Brevo API key saved in this browser");
    } catch (saveError) {
      fail(saveError, "Could not save the Brevo API key.");
    } finally {
      setBusy(false);
    }
  }

  async function addDrafts(drafts: { email: string; name: string }[], label: string) {
    setBusy(true);
    setError("");
    try {
      setStatus(`Saving contacts from ${label}…`);
      const result = await addWelcomeRecipients(drafts, (saved, total) => {
        setStatus(`Saving ${saved} of ${total} welcome contacts…`);
      });
      await refreshAudience();
      setStatus(`Added ${result.added}. ${result.skipped} already on the welcome list.`);
      toast.success(`Added ${result.added} to the welcome list`);
      return true;
    } catch (addError) {
      await refreshAudience().catch(() => undefined);
      fail(addError, "Could not add those contacts.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function addIndividual() {
    const email = emailInput.trim().toLowerCase();
    if (!isEmailAddress(email)) {
      fail(new Error("Enter one valid email address."), "Enter one valid email address.");
      return;
    }
    const saved = await addDrafts([{ email, name: nameInput }], email);
    if (!saved) return;
    setEmailInput("");
    setNameInput("");
  }

  async function addSelectedList() {
    const list = lists.find((item) => item.id === selectedListId);
    if (!list) {
      fail(new Error("Choose a subscriber list."), "Choose a subscriber list.");
      return;
    }
    await addDrafts(
      list.subscribers.map((row) => ({ email: row.email, name: row.name })),
      list.name,
    );
  }

  async function addFile(file: File | undefined) {
    if (!file || busy) return;
    setError("");
    try {
      const parsed = await parseRecipientFile(file);
      const valid = parsed.recipients.filter((row) => row.status === "valid");
      await addDrafts(
        valid.map((row) => ({ email: row.email, name: row.name })),
        file.name,
      );
    } catch (fileError) {
      fail(fileError, "Could not read that file.");
    }
  }

  function requestSend() {
    if (busy) return;
    setError("");
    try {
      const trimmedSubject = subject.trim();
      if (!trimmedSubject) throw new Error("The subject is empty.");
      if (html.trim().length < 11) throw new Error("The welcome HTML is too short.");
      if (!batch.length) {
        if (provider === "brevo" && remaining <= 0) {
          throw new Error("The Brevo free plan’s 300 emails for today are already logged. Come back tomorrow, or send with Gmail.");
        }
        throw new Error("Everyone on the welcome list is already marked sent.");
      }
      if (provider === "brevo") {
        if (!apiKey) throw new Error("Save a Brevo API key in this browser first.");
        const sender = settings.senderName.trim();
        const from = settings.senderEmail.trim();
        if (!sender) throw new Error("Enter the sender name.");
        if (!isEmailAddress(from)) throw new Error("Enter a valid sender email. The default is contact@direexpress.com.et.");
        setPendingSend({
          channel: "brevo",
          ids: batch.map((row) => row.id),
          contacts: batch.map((row) => ({ email: row.email, name: contactName(row.email, row.name) })),
          subject: trimmedSubject,
          senderName: sender,
          senderEmail: from,
          html,
          alreadySent: sentCount,
          waitingAfter: waiting - batch.length,
        });
        return;
      }
      if (!sessionRef.current) throw new Error("Sign in with Google first.");
      setPendingSend({
        channel: "gmail",
        ids: batch.map((row) => row.id),
        contacts: batch.map((row) => ({ email: row.email, name: contactName(row.email, row.name) })),
        subject: trimmedSubject,
        senderName: sessionRef.current.email || "Gmail",
        senderEmail: sessionRef.current.email || "",
        html,
        alreadySent: sentCount,
        waitingAfter: waiting - batch.length,
      });
    } catch (prepareError) {
      fail(prepareError, "Cannot send yet.");
    }
  }

  async function saveSentFlags(mark: PendingMark) {
    await markWelcomeSent(mark.ids, mark.brevoCampaignId);
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
    await refreshAudience();
  }

  async function confirmBrevo(pending: PendingSend) {
    setStatus(`Creating today's welcome batch for ${pending.contacts.length} people…`);
    const listId = await ensureBrevoList(apiKey, batchListName(), null);
    await importBrevoContacts(apiKey, listId, pending.contacts, setStatus);
    setStatus("Creating the Brevo campaign…");
    const campaignId = await createBrevoCampaign(apiKey, {
      name: `Dire Express welcome ${pending.subject}`.slice(0, 150),
      subject: pending.subject,
      previewText: DEFAULT_WELCOME_PREVIEW,
      senderName: pending.senderName,
      senderEmail: pending.senderEmail,
      htmlContent: toBrevoCampaignHtml(pending.html, DEFAULT_WELCOME_PREVIEW),
      listId,
    });
    setStatus(`Sending campaign ${campaignId}…`);
    try {
      await sendBrevoCampaignNow(apiKey, campaignId);
    } catch (sendError) {
      if (sendError instanceof BrevoApiError && sendError.kind === "daily_limit") throw sendError;
      throw sendError instanceof Error
        ? new Error(`${sendError.message} Campaign ${campaignId} was created but not sent. Nobody was marked as sent.`)
        : sendError;
    }
    const mark: PendingMark = {
      ids: pending.ids,
      brevoCampaignId: String(campaignId),
      subject: pending.subject,
      total: pending.contacts.length,
    };
    try {
      await saveSentFlags(mark);
    } catch (markError) {
      setPendingMark(mark);
      throw new Error(
        `Brevo accepted campaign ${campaignId}, but the sent flags were not saved. Save them before the next batch or these ${pending.contacts.length} people can be emailed again. ${permissionMessage(markError, "Could not write sent flags.")}`,
      );
    }
    const left = pending.waitingAfter;
    setStatus(
      `Sent ${pending.contacts.length} via Brevo campaign ${campaignId}.${left ? ` ${left} still waiting.` : " The welcome list is finished."}`,
    );
    toast.success(`Sent ${pending.contacts.length} with Brevo`);
  }

  async function tokenFor(forceRefresh: boolean) {
    const current = sessionRef.current;
    if (!forceRefresh && current && current.expiresAt - Date.now() > 60_000) return current.accessToken;
    try {
      const next = await connectGmail(current ? "" : "consent");
      rememberSession(next);
      return next.accessToken;
    } catch (connectError) {
      if (!current) throw connectError;
      const next = await connectGmail("consent");
      rememberSession(next);
      return next.accessToken;
    }
  }

  async function confirmGmail(pending: PendingSend) {
    const sentIds: string[] = [];
    cancelRef.current = false;
    const byEmail = new Map(pending.contacts.map((row, index) => [row.email.toLowerCase(), pending.ids[index]]));
    setStatus(`Sending ${pending.contacts.length} welcome messages with Gmail…`);
    const result = await runNewsletterCampaign({
      recipients: pending.contacts,
      subject: pending.subject,
      html: pending.html,
      isCancelled: () => cancelRef.current,
      prepareToken: () => tokenFor(false),
      refreshToken: () => tokenFor(true),
      send: (message) => sendGmailHtml({ ...message, from: sessionRef.current?.email || undefined }),
      onUpdate: (update) => {
        if (update.state !== "sent") return;
        const id = byEmail.get(update.email.toLowerCase());
        if (id) sentIds.push(id);
      },
    });
    if (sentIds.length) {
      try {
        await markWelcomeSent(sentIds, "gmail");
      } catch (markError) {
        setPendingMark({
          ids: sentIds,
          brevoCampaignId: "gmail",
          subject: pending.subject,
          total: sentIds.length,
        });
        throw new Error(
          `Gmail sent ${sentIds.length}, but the sent flags were not saved. ${permissionMessage(markError, "Could not write sent flags.")}`,
        );
      }
      try {
        await logNewsletterCampaign({
          subject: pending.subject,
          total: result.total,
          sent: result.sent,
          failed: result.failed,
        });
      } catch (logError) {
        toast.error(permissionMessage(logError, "The campaign log was not saved."));
      }
    }
    await refreshAudience();
    setStatus(`Gmail sent ${result.sent}, failed ${result.failed}. Sent people will not get this welcome again.`);
    if (result.failed > 0) toast.error(`Sent ${result.sent}, failed ${result.failed}.`);
    else if (result.sent > 0) toast.success(`Sent ${result.sent} with Gmail`);
  }

  async function confirmSend() {
    const pending = pendingSend;
    if (!pending || busy) return;
    setPendingSend(null);
    setBusy(true);
    setError("");
    try {
      if (pending.channel === "brevo") await confirmBrevo(pending);
      else await confirmGmail(pending);
    } catch (sendError) {
      fail(sendError, "Welcome send failed.");
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    if (busy) return;
    setBusy(true);
    setError("");
    const to = (settings.testEmail.trim() || admin?.email || "").trim().toLowerCase();
    try {
      if (provider === "gmail") {
        const gmailTo = sessionRef.current?.email ?? "";
        if (!gmailTo) throw new Error("Sign in with Google first.");
        const message = personalizeNewsletter({ subject: subject.trim(), html }, { email: gmailTo, name: previewPerson });
        const sendOnce = async (forceRefresh: boolean) => {
          const accessToken = await tokenFor(forceRefresh);
          await sendGmailHtml({
            accessToken,
            to: gmailTo,
            from: gmailTo,
            subject: message.subject,
            html: message.html,
          });
        };
        try {
          await sendOnce(false);
        } catch (gmailError) {
          if (!isTokenExpired(gmailError)) throw gmailError;
          await sendOnce(true);
        }
        setStatus(`Test sent to ${gmailTo}. The welcome list was not marked as sent.`);
        toast.success(`Test sent to ${gmailTo}`);
        return;
      }
      if (!apiKey) throw new Error("Save a Brevo API key in this browser first.");
      if (!isEmailAddress(to)) throw new Error("Enter the address that should receive the test.");
      const sender = settings.senderName.trim();
      const from = settings.senderEmail.trim();
      if (!sender || !isEmailAddress(from)) throw new Error("Enter the sender name and a valid sender email.");
      setStatus("Preparing a Brevo test…");
      const listId = await ensureBrevoList(apiKey, "Dire Express — welcome test", null);
      await upsertBrevoContact(apiKey, listId, { email: to, name: previewPerson });
      const campaignId = await createBrevoCampaign(apiKey, {
        name: `Dire Express welcome test ${subject}`.slice(0, 150),
        subject: subject.trim(),
        previewText: DEFAULT_WELCOME_PREVIEW,
        senderName: sender,
        senderEmail: from,
        htmlContent: toBrevoCampaignHtml(html, DEFAULT_WELCOME_PREVIEW),
        listId,
      });
      await sendBrevoTest(apiKey, campaignId, to);
      try {
        await deleteBrevoCampaign(apiKey, campaignId);
      } catch {
        // The test already went out.
      }
      setStatus(`Test sent to ${to}. The welcome list was not marked as sent.`);
      toast.success(`Test sent to ${to}`);
    } catch (testError) {
      fail(testError, "Test send failed.");
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
      setStatus("Saved the sent flags for the welcome Brevo already accepted.");
      toast.success("Sent flags saved");
    } catch (markError) {
      fail(markError, "Could not save the sent flags.");
    } finally {
      setBusy(false);
    }
  }

  async function clearSent() {
    if (busy) return;
    const proceed = window.confirm(
      "Clear welcome send history? The next batch can include everyone again. This does not delete the addresses, and it does not change the newsletter sent flags.",
    );
    if (!proceed) return;
    setBusy(true);
    setError("");
    try {
      const cleared = await clearWelcomeSendHistory();
      await refreshAudience();
      setStatus(`Cleared welcome send history for ${cleared} people.`);
    } catch (clearError) {
      fail(clearError, "Could not clear welcome send history.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSignIn() {
    setConnecting(true);
    try {
      const next = await connectGmail("consent");
      rememberSession(next);
      toast.success(next.email ? `Signed in as ${next.email}` : "Signed in with Google");
    } catch (signInError) {
      toast.error(messageFrom(signInError, "Google sign-in failed"));
    } finally {
      setConnecting(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-semibold">Welcome email</h1>
      <p className="mt-1 max-w-3xl text-sm text-muted">
        The tester welcome, Amharic then English. It uses the same Brevo key and sender as the Newsletter page. The key
        stays in this browser’s localStorage only. {"{{name}}"} is the contact’s full name, in Title Case.
      </p>

      <div className="mt-6 flex gap-2">
        {(["brevo", "gmail"] as const).map((choice) => (
          <button
            key={choice}
            type="button"
            onClick={() => patchBrevoSettings({ provider: choice })}
            className={`h-10 rounded-lg px-4 text-sm font-semibold ${
              provider === choice ? "bg-primary text-primary-foreground" : "border border-border"
            }`}
          >
            {choice === "brevo" ? "Brevo" : "Gmail"}
            {choice === "brevo" && apiKey ? " · key saved" : ""}
          </button>
        ))}
      </div>
      <p className="mt-2 text-sm text-muted">
        {provider === "brevo"
          ? `Brevo free plan: ${BREVO_DAILY_LIMIT} emails a day. This dashboard logged ${sentToday} sends today, so ${remaining} remain for Brevo.`
          : `Gmail sends one message at a time, about ${GMAIL_DAILY_LIMIT} a day. Welcome sent flags are still saved. Brevo remaining today: ${remaining} of ${BREVO_DAILY_LIMIT}.`}
        {account?.emailCredits != null ? ` Brevo last reported ${account.emailCredits} email credits.` : ""}
      </p>

      {provider === "brevo" ? (
        <section className="mt-6 rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="text-sm font-semibold">Brevo sender</h2>
          <p className="mt-2 text-sm text-muted">
            Sender defaults to Dawit from Dire Express. Forget key removes it from this browser. It is not written to
            Realtime Database.
          </p>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="flex min-w-[16rem] flex-1 flex-col gap-1.5 text-sm font-medium">
              {apiKey ? "Replace API key" : "Brevo API key"}
              <input
                type="password"
                autoComplete="off"
                value={keyDraft}
                onChange={(event) => setKeyDraft(event.target.value)}
                placeholder={apiKey ? "Paste a new v3 key to replace the saved one" : "xkeysib-…"}
                className={`h-11 ${fieldClass}`}
              />
            </label>
            <button
              type="button"
              onClick={() => void saveKey()}
              disabled={busy || !keyDraft.trim()}
              className="h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-70"
            >
              {apiKey ? "Replace key" : "Save key"}
            </button>
            {apiKey ? (
              <button
                type="button"
                onClick={() => {
                  forgetBrevoApiKey();
                  setAccount(null);
                  patchBrevoSettings({ provider: "gmail" });
                  toast.success("Brevo API key forgotten");
                }}
                className="h-11 rounded-lg border border-border px-4 text-sm font-semibold"
              >
                Forget key
              </button>
            ) : null}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Sender name
              <input
                value={settings.senderName}
                onChange={(event) => patchBrevoSettings({ senderName: event.target.value })}
                className={`h-11 ${fieldClass}`}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Sender email
              <input
                value={settings.senderEmail}
                onChange={(event) => patchBrevoSettings({ senderEmail: event.target.value })}
                className={`h-11 ${fieldClass}`}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Batch size
              <input
                type="number"
                min={1}
                max={BREVO_DAILY_LIMIT}
                value={settings.batchSize}
                onChange={(event) => patchBrevoSettings({ batchSize: Number(event.target.value) })}
                className={`h-11 ${fieldClass}`}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Test address
              <input
                value={settings.testEmail}
                onChange={(event) => patchBrevoSettings({ testEmail: event.target.value })}
                placeholder={admin?.email || "you@example.com"}
                className={`h-11 ${fieldClass}`}
              />
            </label>
          </div>
        </section>
      ) : (
        <section className="mt-6 rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="text-sm font-semibold">Gmail sender</h2>
          <p className="mt-2 text-sm text-muted">
            A regular Gmail account can send about {GMAIL_DAILY_LIMIT} messages a day. This page sends about one message
            every 3–5 seconds. The next batch is at most {batchCap}.
          </p>
          {!clientId ? (
            <p className="mt-3 text-sm text-danger">
              Set NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID and rebuild before signing in.
            </p>
          ) : null}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {session ? (
              <>
                <p className="text-sm">
                  Sending as <span className="font-semibold">{session.email || "the connected Google account"}</span>
                </p>
                <button
                  type="button"
                  onClick={() => {
                    const token = sessionRef.current?.accessToken;
                    if (token) revokeGmailToken(token);
                    rememberSession(null);
                  }}
                  disabled={busy}
                  className="h-11 rounded-lg border border-border px-4 text-sm font-semibold disabled:opacity-70"
                >
                  Disconnect Google
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => void handleSignIn()}
                disabled={!clientId || connecting || busy}
                className="h-11 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-70"
              >
                {connecting ? "Waiting for Google..." : "Sign in with Google"}
              </button>
            )}
          </div>
        </section>
      )}

      {!ready ? <p className="mt-6 text-sm text-muted">Loading the welcome template…</p> : null}
      {loadError ? <p className="mt-4 text-sm text-danger">{loadError}</p> : null}

      {ready ? (
        <section className="mt-6 rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Template</h2>
              <p className="mt-1 text-sm text-muted">
                Saved at newsletter/welcomeTemplate. The live database rules have to include that node before the first
                save.
                {updatedAt ? ` Last saved ${new Date(updatedAt).toLocaleString()}.` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void restoreDefault()}
              disabled={saving || busy}
              className="h-10 rounded-lg border border-border px-4 text-sm font-semibold disabled:opacity-70"
            >
              Restore default
            </button>
          </div>
          <label className="mt-4 flex flex-col gap-1.5 text-sm font-medium">
            Subject
            <input value={subject} onChange={(event) => setSubject(event.target.value)} className={`h-11 ${fieldClass}`} />
          </label>
          <label className="mt-4 flex flex-col gap-1.5 text-sm font-medium">
            HTML
            <textarea
              value={html}
              onChange={(event) => setHtml(event.target.value)}
              rows={14}
              className={`${fieldClass} font-mono text-xs`}
            />
          </label>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || busy || !subject.trim()}
              className="h-11 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-70"
            >
              {saving ? "Saving..." : "Save template"}
            </button>
            <label className="flex items-center gap-2 text-sm font-medium">
              Preview as
              <input
                value={previewName}
                onChange={(event) => setPreviewName(event.target.value)}
                className="h-9 rounded-lg border border-border bg-background px-3 font-normal outline-none focus:border-primary"
              />
            </label>
          </div>
          <iframe title="Welcome preview" sandbox="" srcDoc={previewHtml} className="mt-4 h-[640px] w-full rounded-xl border border-border bg-white" />
        </section>
      ) : null}

      <section className="mt-6 rounded-xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-sm font-semibold">Recipients</h2>
        <p className="mt-2 text-sm text-muted">
          Add a subscriber list, a spreadsheet, or one address. People are stored at newsletter/welcomeRecipients with
          their own sentAt, so a newsletter send does not count as this welcome, and nobody gets the welcome twice.
          Names are stored in Title Case. The table shows 50 rows at a time.
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="flex min-w-[16rem] flex-1 flex-col gap-1.5 text-sm font-medium">
            Subscriber list
            <select
              value={selectedListId}
              onChange={(event) => setSelectedListId(event.target.value)}
              className={`h-11 ${fieldClass}`}
            >
              <option value="">Select a list</option>
              {lists.map((list) => (
                <option key={list.id} value={list.id}>
                  {list.name} ({list.subscribers.length})
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => void addSelectedList()}
            disabled={busy || !selectedListId}
            className="h-11 rounded-lg border border-border px-4 text-sm font-semibold disabled:opacity-70"
          >
            Add list
          </button>
        </div>
        <label className="mt-4 block text-sm font-medium">
          Spreadsheet
          <input
            type="file"
            accept=".xlsx,.xls,.csv,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              void addFile(file);
            }}
            className="mt-2 block font-normal"
          />
        </label>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="flex min-w-[16rem] flex-1 flex-col gap-1.5 text-sm font-medium">
            One email
            <input
              value={emailInput}
              onChange={(event) => setEmailInput(event.target.value)}
              className={`h-11 ${fieldClass}`}
            />
          </label>
          <label className="flex min-w-[12rem] flex-1 flex-col gap-1.5 text-sm font-medium">
            Name
            <input value={nameInput} onChange={(event) => setNameInput(event.target.value)} className={`h-11 ${fieldClass}`} />
          </label>
          <button
            type="button"
            onClick={() => void addIndividual()}
            disabled={busy || !emailInput.trim()}
            className="h-11 rounded-lg border border-border px-4 text-sm font-semibold disabled:opacity-70"
          >
            Add email
          </button>
        </div>
        <p className="mt-4 text-sm">
          <span className="font-semibold">{recipients.length}</span> people,{" "}
          <span className="font-semibold">{sentCount}</span> already sent this welcome,{" "}
          <span className="font-semibold">{waiting}</span> waiting. Next batch:{" "}
          <span className="font-semibold">{batch.length}</span>.
        </p>
        <div className="mt-4 max-h-80 overflow-auto rounded-lg border border-border">
          <table className="min-w-full text-left text-sm">
            <thead className="sticky top-0 bg-background text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Email</th>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Welcome</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row) => (
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
        {recipients.length > PAGE_SIZE ? (
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted">
            <span>
              {pageStart + 1}–{pageStart + pageRows.length} of {recipients.length}.
            </span>
            <button
              type="button"
              disabled={currentPage === 0}
              onClick={() => setPage(currentPage - 1)}
              className="h-8 rounded-lg border border-border px-3 font-semibold disabled:opacity-50"
            >
              Previous
            </button>
            <span>
              Page {currentPage + 1} of {pageCount}
            </span>
            <button
              type="button"
              disabled={currentPage >= pageCount - 1}
              onClick={() => setPage(currentPage + 1)}
              className="h-8 rounded-lg border border-border px-3 font-semibold disabled:opacity-50"
            >
              Next
            </button>
          </div>
        ) : null}
        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={requestSend}
            disabled={busy || !batch.length || (provider === "gmail" && !session)}
            className="h-11 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-70"
          >
            {provider === "brevo" ? "Send now" : "Send with Gmail"}
          </button>
          <button
            type="button"
            onClick={() => void sendTest()}
            disabled={busy || (provider === "gmail" && !session)}
            className="h-11 rounded-lg border border-border px-4 text-sm font-semibold disabled:opacity-70"
          >
            Send test to me
          </button>
          <button
            type="button"
            onClick={() => void clearSent()}
            disabled={busy || sentCount === 0}
            className="h-11 rounded-lg border border-border px-4 text-sm font-semibold disabled:opacity-70"
          >
            Clear welcome history
          </button>
          {provider === "gmail" && busy ? (
            <button
              type="button"
              onClick={() => {
                cancelRef.current = true;
              }}
              className="h-11 rounded-lg border border-border px-4 text-sm font-semibold"
            >
              Stop
            </button>
          ) : null}
        </div>
        {pendingMark ? (
          <button
            type="button"
            onClick={() => void retryMark()}
            disabled={busy}
            className="mt-3 h-11 rounded-lg border border-danger px-4 text-sm font-semibold text-danger disabled:opacity-70"
          >
            Save sent flags for the welcome already accepted
          </button>
        ) : null}
        {error ? (
          <p role="alert" className="mt-4 whitespace-pre-wrap rounded-lg border border-danger bg-danger-bg px-4 py-3 text-sm text-danger">
            {error}
          </p>
        ) : null}
        {status ? <p className="mt-3 text-sm text-muted">{status}</p> : null}
      </section>

      {pendingSend ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="welcome-send-title" className="w-full max-w-lg rounded-xl bg-card p-5 shadow-lg">
            <h3 id="welcome-send-title" className="text-lg font-semibold">
              Send this welcome batch?
            </h3>
            <p className="mt-3 text-sm">
              This sends to <span className="font-semibold">{pendingSend.contacts.length}</span>{" "}
              {pendingSend.contacts.length === 1 ? "person" : "people"}.
            </p>
            <p className="mt-2 text-sm text-muted">
              {pendingSend.alreadySent} already received the welcome. {pendingSend.waitingAfter} will still be waiting
              after this batch.
              {pendingSend.channel === "brevo"
                ? ` Brevo remaining today: ${remaining} of ${BREVO_DAILY_LIMIT}.`
                : ` Gmail sends these one at a time.`}
            </p>
            <dl className="mt-4 space-y-1 text-sm">
              <div>
                <dt className="inline text-muted">Subject: </dt>
                <dd className="inline">{pendingSend.subject}</dd>
              </div>
              <div>
                <dt className="inline text-muted">From: </dt>
                <dd className="inline">
                  {pendingSend.senderName}
                  {pendingSend.senderEmail ? ` <${pendingSend.senderEmail}>` : ""}
                </dd>
              </div>
            </dl>
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void confirmSend()}
                className="h-11 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground"
              >
                Send now
              </button>
              <button
                type="button"
                onClick={() => setPendingSend(null)}
                className="h-11 rounded-lg border border-border px-4 text-sm font-semibold"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
