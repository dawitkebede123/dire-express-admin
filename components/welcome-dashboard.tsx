"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { BREVO_DAILY_LIMIT } from "@/lib/newsletter/brevo-batch";
import { BrevoApiError, fetchBrevoAccount, sendBrevoTransactional, type BrevoAccountSummary } from "@/lib/newsletter/brevo";
import {
  forgetBrevoApiKey,
  patchBrevoSettings,
  saveBrevoApiKey,
  useBrevoApiKey,
  useBrevoSettings,
} from "@/lib/newsletter/brevo-storage";
import { isEmailAddress } from "@/lib/newsletter/recipients";
import { recipientDisplayName } from "@/lib/newsletter/personalize";
import { toTitleCaseName } from "@/lib/newsletter/title-case";
import { parseWelcomeAddresses } from "@/lib/newsletter/welcome-addresses";
import { brevoRemainingToday, sentOnLocalDay } from "@/lib/newsletter/welcome-quota";
import { DEFAULT_WELCOME_HTML, DEFAULT_WELCOME_SUBJECT } from "@/lib/newsletter/welcome-template";
import { permissionMessage } from "@/lib/rtdb/client-writes";
import { loadNewsletterCampaignSummaries, logNewsletterCampaign } from "@/lib/rtdb/newsletter";
import {
  clearWelcomeSendHistory,
  loadWelcomeRecipients,
  loadWelcomeTemplate,
  recordWelcomeSent,
  saveWelcomeTemplate,
  type WelcomeRecipient,
} from "@/lib/rtdb/welcome";

const PAGE_SIZE = 50;
const SEND_PARALLEL = 8;
const fieldClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 font-normal outline-none focus:border-primary";

type SendResult = {
  email: string;
  status: "sent" | "failed" | "invalid";
  detail: string;
};

type ResendChoice = {
  fresh: string[];
  again: string[];
};

function messageFrom(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function personName(email: string) {
  return toTitleCaseName(recipientDisplayName({ email, name: "" }));
}

export function WelcomeDashboard() {
  const settings = useBrevoSettings();
  const apiKey = useBrevoApiKey();
  const [keyDraft, setKeyDraft] = useState("");
  const [account, setAccount] = useState<BrevoAccountSummary | null>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [subject, setSubject] = useState(DEFAULT_WELCOME_SUBJECT);
  const [html, setHtml] = useState(DEFAULT_WELCOME_HTML);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [recipients, setRecipients] = useState<WelcomeRecipient[]>([]);
  const [sentToday, setSentToday] = useState(0);
  const [addressDraft, setAddressDraft] = useState("");
  const [results, setResults] = useState<SendResult[]>([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(0);
  const [resendChoice, setResendChoice] = useState<ResendChoice | null>(null);
  const [unlogged, setUnlogged] = useState<{ email: string; name: string; messageId: string }[]>([]);

  const refreshAudience = useCallback(async () => {
    const [nextRecipients, campaigns] = await Promise.all([loadWelcomeRecipients(), loadNewsletterCampaignSummaries()]);
    setRecipients(nextRecipients);
    setSentToday(sentOnLocalDay(campaigns));
    return { recipients: nextRecipients, sentToday: sentOnLocalDay(campaigns) };
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadWelcomeTemplate(), loadWelcomeRecipients(), loadNewsletterCampaignSummaries()])
      .then(([saved, nextRecipients, campaigns]) => {
        if (cancelled) return;
        if (saved) {
          setSubject(saved.subject);
          setHtml(saved.html);
          setUpdatedAt(saved.updatedAt);
        }
        setRecipients(nextRecipients);
        setSentToday(sentOnLocalDay(campaigns));
        setReady(true);
      })
      .catch((loadFailure: unknown) => {
        if (cancelled) return;
        setLoadError(permissionMessage(loadFailure, "Could not load the welcome letter."));
        setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!apiKey) return;
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
  }, [apiKey]);

  const remaining = brevoRemainingToday(sentToday);
  const parsed = parseWelcomeAddresses(addressDraft);
  const sentEmails = new Set(recipients.filter((row) => row.sentAt != null).map((row) => row.email));
  const already = parsed.valid.filter((email) => sentEmails.has(email));
  const pageCount = Math.max(1, Math.ceil(recipients.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageStart = currentPage * PAGE_SIZE;
  const pageRows = recipients.slice(pageStart, pageStart + PAGE_SIZE);

  function fail(actionError: unknown, fallback: string) {
    const message = messageFrom(actionError, fallback);
    setError(message);
    toast.error(message.length > 220 ? `${message.slice(0, 220)}…` : message);
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      await saveWelcomeTemplate({ subject, html });
      setUpdatedAt(Date.now());
      toast.success("Welcome letter saved");
    } catch (saveError) {
      toast.error(permissionMessage(saveError, "Could not save the welcome letter"));
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

  async function deliver(emails: string[]) {
    const trimmedSubject = subject.trim();
    const sender = settings.senderName.trim();
    const from = settings.senderEmail.trim();
    if (!apiKey) throw new Error("Save a Brevo API key in this browser first.");
    if (!trimmedSubject) throw new Error("The subject is empty.");
    if (html.trim().length < 11) throw new Error("The welcome letter is too short.");
    if (!sender) throw new Error("Enter the sender name.");
    if (!isEmailAddress(from)) throw new Error("Enter a valid sender email. The default is contact@direexpress.com.et.");
    if (!emails.length) throw new Error("Enter at least one email address.");

    const latest = await refreshAudience();
    const remainingNow = brevoRemainingToday(latest.sentToday);
    if (emails.length > remainingNow) {
      throw new Error(
        `The Brevo free plan has ${remainingNow} sends left today. This send has ${emails.length} addresses.`,
      );
    }

    const outcome: SendResult[] = parsed.invalid.map((email) => ({
      email,
      status: "invalid",
      detail: "Invalid address",
    }));
    const sentRows: { email: string; name: string; messageId: string }[] = [];
    let stopMessage = "";
    setResults(outcome);
    for (let index = 0; index < emails.length; index += SEND_PARALLEL) {
      const slice = emails.slice(index, index + SEND_PARALLEL);
      if (stopMessage) {
        outcome.push(...slice.map((email) => ({ email, status: "failed" as const, detail: stopMessage })));
        setResults([...outcome]);
        continue;
      }
      setStatus(`Sending ${Math.min(index + slice.length, emails.length)} of ${emails.length}…`);
      const batch = await Promise.all(
        slice.map(async (email) => {
          try {
            const messageId = await sendBrevoTransactional(apiKey, {
              senderName: sender,
              senderEmail: from,
              toEmail: email,
              toName: personName(email),
              subject: trimmedSubject,
              htmlContent: html,
            });
            return { email, status: "sent" as const, detail: "Sent", messageId };
          } catch (sendError) {
            if (sendError instanceof BrevoApiError && sendError.kind === "daily_limit") stopMessage = sendError.message;
            return {
              email,
              status: "failed" as const,
              detail: messageFrom(sendError, "Send failed"),
              messageId: "",
            };
          }
        }),
      );
      for (const row of batch) {
        outcome.push({ email: row.email, status: row.status, detail: row.detail });
        if (row.status === "sent") sentRows.push({ email: row.email, name: personName(row.email), messageId: row.messageId });
      }
      setResults([...outcome]);
    }

    const sentCount = sentRows.length;
    const failedCount = outcome.filter((row) => row.status !== "sent").length;
    if (sentCount) {
      try {
        await logNewsletterCampaign({
          subject: trimmedSubject,
          total: emails.length,
          sent: sentCount,
          failed: emails.length - sentCount,
        });
      } catch (logError) {
        toast.error(permissionMessage(logError, "The send log was not saved."));
      }
      try {
        await recordWelcomeSent(sentRows);
        setUnlogged([]);
      } catch (markError) {
        setUnlogged(sentRows);
        throw new Error(
          `Brevo accepted ${sentCount} ${sentCount === 1 ? "message" : "messages"}, but sentAt was not saved. Save the sent flags before sending again. ${permissionMessage(markError, "Could not write sent flags.")}`,
        );
      }
    }
    await refreshAudience();
    setStatus(`Sent ${sentCount}. Failed ${failedCount}.`);
    if (failedCount) toast.error(`Sent ${sentCount}. Failed ${failedCount}.`);
    else toast.success(`Sent ${sentCount}`);
  }

  function requestSend() {
    if (busy) return;
    setError("");
    if (!parsed.valid.length) {
      fail(new Error("Enter at least one valid email address."), "Enter at least one valid email address.");
      return;
    }
    if (parsed.valid.length > remaining) {
      fail(
        new Error(`The Brevo free plan has ${remaining} sends left today. This send has ${parsed.valid.length} addresses.`),
        "Too many addresses for today.",
      );
      return;
    }
    const again = parsed.valid.filter((email) => sentEmails.has(email));
    const fresh = parsed.valid.filter((email) => !sentEmails.has(email));
    if (again.length) {
      setResendChoice({ fresh, again });
      return;
    }
    setBusy(true);
    deliver(parsed.valid)
      .catch((sendError: unknown) => fail(sendError, "Welcome send failed."))
      .finally(() => setBusy(false));
  }

  function startChosenSend(emails: string[]) {
    setResendChoice(null);
    if (!emails.length) {
      setStatus("Nothing new to send.");
      return;
    }
    setBusy(true);
    setError("");
    deliver(emails)
      .catch((sendError: unknown) => fail(sendError, "Welcome send failed."))
      .finally(() => setBusy(false));
  }

  async function retryLog() {
    if (!unlogged.length || busy) return;
    setBusy(true);
    setError("");
    try {
      await recordWelcomeSent(unlogged);
      setUnlogged([]);
      await refreshAudience();
      setStatus("Saved sentAt for the welcome messages Brevo already accepted.");
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
      "Clear welcome send history? The next send can include everyone again. This does not delete the letter.",
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

  const sentCount = recipients.filter((row) => row.sentAt != null).length;

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-semibold">Welcome</h1>
      <p className="mt-1 max-w-3xl text-sm text-muted">
        Send the welcome letter through Brevo to the addresses you type. Each address is its own transactional email,
        not a list campaign. The API key stays in this browser’s localStorage.
      </p>

      <section className="mt-6 rounded-xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-sm font-semibold">Recipients</h2>
        <p className="mt-2 text-sm text-muted">
          One or more email addresses, separated by commas or new lines. Duplicates are skipped. Brevo’s free plan has{" "}
          <span className="font-semibold">{remaining}</span> of {BREVO_DAILY_LIMIT} sends left today.
          {account?.emailCredits != null ? ` Brevo last reported ${account.emailCredits} email credits.` : ""}
        </p>
        <textarea
          value={addressDraft}
          onChange={(event) => setAddressDraft(event.target.value)}
          rows={8}
          placeholder={"one@example.com\ntwo@example.com"}
          aria-label="Recipients"
          className={`mt-4 ${fieldClass} min-h-40 font-mono text-sm`}
        />
        <p className="mt-3 text-sm">
          <span className="font-semibold">{parsed.valid.length}</span> valid
          {parsed.invalid.length ? (
            <>
              , <span className="font-semibold">{parsed.invalid.length}</span> invalid
            </>
          ) : null}
          {already.length ? (
            <>
              , <span className="font-semibold">{already.length}</span> already received this welcome
            </>
          ) : null}
          .
        </p>
        {parsed.invalid.length ? (
          <p className="mt-2 text-sm text-danger">Invalid: {parsed.invalid.slice(0, 8).join(", ")}</p>
        ) : null}
        {already.length ? (
          <p className="mt-2 text-sm text-danger">
            Already sent: {already.slice(0, 8).join(", ")}
            {already.length > 8 ? ` and ${already.length - 8} more` : ""}. Send will ask before mailing them again.
          </p>
        ) : null}
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm font-medium">
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
          <div className="flex flex-wrap items-end gap-3">
            <button
              type="button"
              onClick={() => void saveKey()}
              disabled={busy || !keyDraft.trim()}
              className="h-11 rounded-lg border border-border px-4 text-sm font-semibold disabled:opacity-70"
            >
              {apiKey ? "Replace key" : "Save key"}
            </button>
            {apiKey ? (
              <button
                type="button"
                onClick={() => {
                  forgetBrevoApiKey();
                  setAccount(null);
                  toast.success("Brevo API key forgotten");
                }}
                className="h-11 rounded-lg border border-border px-4 text-sm font-semibold"
              >
                Forget key
              </button>
            ) : null}
          </div>
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
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={requestSend}
            disabled={busy || !parsed.valid.length}
            className="h-11 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-70"
          >
            {busy ? "Sending…" : "Send"}
          </button>
        </div>
        {results.length ? (
          <ul className="mt-4 max-h-64 space-y-1 overflow-auto text-sm">
            {results.map((row) => (
              <li key={`${row.status}-${row.email}`} className={row.status === "sent" ? "text-success" : "text-danger"}>
                <span className="font-semibold">{row.email}</span> — {row.detail}
              </li>
            ))}
          </ul>
        ) : null}
        {unlogged.length ? (
          <button
            type="button"
            onClick={() => void retryLog()}
            disabled={busy}
            className="mt-3 h-11 rounded-lg border border-danger px-4 text-sm font-semibold text-danger disabled:opacity-70"
          >
            Save sent flags for the messages Brevo already accepted
          </button>
        ) : null}
        {error ? (
          <p role="alert" className="mt-4 whitespace-pre-wrap rounded-lg border border-danger bg-danger-bg px-4 py-3 text-sm text-danger">
            {error}
          </p>
        ) : null}
        {status ? <p className="mt-3 text-sm text-muted">{status}</p> : null}
      </section>

      {!ready ? <p className="mt-6 text-sm text-muted">Loading the welcome letter…</p> : null}
      {loadError ? <p className="mt-4 text-sm text-danger">{loadError}</p> : null}

      {ready ? (
        <section className="mt-6 rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Letter</h2>
              <p className="mt-1 text-sm text-muted">
                Saved at newsletter/welcomeTemplate.
                {updatedAt ? ` Last saved ${new Date(updatedAt).toLocaleString()}.` : " Not saved yet."} The live
                database rules have to include that node before the first save.
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
              rows={12}
              className={`${fieldClass} font-mono text-xs`}
            />
          </label>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || busy || !subject.trim()}
            className="mt-4 h-11 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-70"
          >
            {saving ? "Saving..." : "Save letter"}
          </button>
          <iframe title="Welcome preview" sandbox="" srcDoc={html} className="mt-4 h-[720px] w-full rounded-xl border border-border bg-white" />
        </section>
      ) : null}

      <section className="mt-6 rounded-xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-sm font-semibold">Already sent</h2>
        <p className="mt-2 text-sm text-muted">
          <span className="font-semibold">{sentCount}</span> of {recipients.length} stored addresses have
          a welcome sentAt. This is separate from the newsletter send history.
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
        <button
          type="button"
          onClick={() => void clearSent()}
          disabled={busy || sentCount === 0}
          className="mt-4 h-11 rounded-lg border border-border px-4 text-sm font-semibold disabled:opacity-70"
        >
          Clear welcome history
        </button>
      </section>

      {resendChoice ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="welcome-resend-title" className="w-full max-w-lg rounded-xl bg-card p-5 shadow-lg">
            <h3 id="welcome-resend-title" className="text-lg font-semibold">
              Send again?
            </h3>
            <p className="mt-3 text-sm">
              <span className="font-semibold">{resendChoice.again.length}</span>{" "}
              {resendChoice.again.length === 1 ? "address has" : "addresses have"} already received this welcome.
            </p>
            <p className="mt-2 text-sm text-muted">{resendChoice.again.slice(0, 8).join(", ")}
              {resendChoice.again.length > 8 ? ` and ${resendChoice.again.length - 8} more` : ""}
            </p>
            <p className="mt-2 text-sm text-muted">
              {resendChoice.fresh.length
                ? `${resendChoice.fresh.length} ${resendChoice.fresh.length === 1 ? "address has" : "addresses have"} not received it yet.`
                : "Every address in this box has already received it."}
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => startChosenSend([...resendChoice.fresh, ...resendChoice.again])}
                className="h-11 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground"
              >
                Send again
              </button>
              <button
                type="button"
                onClick={() => startChosenSend(resendChoice.fresh)}
                disabled={!resendChoice.fresh.length}
                className="h-11 rounded-lg border border-border px-4 text-sm font-semibold disabled:opacity-70"
              >
                Skip already sent
              </button>
              <button
                type="button"
                onClick={() => setResendChoice(null)}
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
