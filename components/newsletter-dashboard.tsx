"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { BrevoAudience, BrevoSettings, useBrevoNewsletter } from "@/components/newsletter-brevo";
import { useAdminAuth } from "@/components/auth-provider";
import {
  NEWSLETTER_BLOCKS,
  blockFieldValue,
  readBlocks,
  writeBlock,
  type NewsletterBlock,
} from "@/lib/newsletter/blocks";
import { GMAIL_DAILY_LIMIT, runNewsletterCampaign, type SendState } from "@/lib/newsletter/campaign";
import { DEFAULT_NEWSLETTER_HTML, DEFAULT_NEWSLETTER_SUBJECT } from "@/lib/newsletter/default-template";
import { newsletterSpamWarnings } from "@/lib/newsletter/deliverability";
import { connectGmail, googleOAuthClientId, revokeGmailToken, sendGmailHtml, type GmailSession } from "@/lib/newsletter/gmail";
import { applyNewsletterLinks } from "@/lib/newsletter/links";
import { isTokenExpired } from "@/lib/newsletter/gmail-error";
import { previewNewsletterHtml } from "@/lib/newsletter/brevo-html";
import { personalizeNewsletter } from "@/lib/newsletter/personalize";
import { patchBrevoSettings, useBrevoApiKey, useBrevoSettings } from "@/lib/newsletter/brevo-storage";
import { parseRecipientFile, type ParsedRecipient, type RecipientParseResult } from "@/lib/newsletter/recipients";
import { permissionMessage } from "@/lib/rtdb/client-writes";
import { loadNewsletterTemplate, logNewsletterCampaign, saveNewsletterTemplate } from "@/lib/rtdb/newsletter";

const TABLE_LIMIT = 400;

type Delivery = {
  state: SendState;
  error: string;
};

function deliveryKey(email: string) {
  return email.toLowerCase();
}

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const area = document.createElement("textarea");
  area.value = value;
  area.setAttribute("readonly", "");
  document.body.appendChild(area);
  area.select();
  document.execCommand("copy");
  area.remove();
}

function downloadHtml(html: string) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "dire-express-newsletter.html";
  link.click();
  URL.revokeObjectURL(url);
}

function BlockField({
  block,
  value,
  onChange,
}: {
  block: NewsletterBlock;
  value: string;
  onChange: (value: string) => void;
}) {
  const long = block.mode === "html" || value.length > 80 || /intro|body|subheadline|tip|letter/.test(block.id);
  const className =
    "w-full rounded-lg border border-border bg-background px-3 py-2 font-normal outline-none focus:border-primary";
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium">
      {block.label}
      {long ? (
        <textarea rows={block.mode === "html" ? 4 : 3} value={value} onChange={(event) => onChange(event.target.value)} className={className} />
      ) : (
        <input value={value} onChange={(event) => onChange(event.target.value)} className={`h-11 ${className}`} />
      )}
      {block.mode === "html" ? <span className="text-xs font-normal text-muted">HTML in this block is kept.</span> : null}
    </label>
  );
}

export function NewsletterDashboard() {
  const clientId = googleOAuthClientId();
  const { admin } = useAdminAuth();
  const brevoSettings = useBrevoSettings();
  const brevoKey = useBrevoApiKey();
  const provider: "brevo" | "gmail" =
    brevoSettings.provider === "gmail" ? "gmail" : brevoSettings.provider === "brevo" || brevoKey ? "brevo" : "gmail";
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [subject, setSubject] = useState(DEFAULT_NEWSLETTER_SUBJECT);
  const [html, setHtml] = useState(DEFAULT_NEWSLETTER_HTML);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [blockLang, setBlockLang] = useState<"am" | "en">("am");
  const [previewName, setPreviewName] = useState("Abebe Bekele");
  const [fileName, setFileName] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<RecipientParseResult | null>(null);
  const [delivery, setDelivery] = useState<Record<string, Delivery>>({});
  const [session, setSession] = useState<GmailSession | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [sending, setSending] = useState(false);
  const [testing, setTesting] = useState(false);
  const sessionRef = useRef<GmailSession | null>(null);
  const cancelRef = useRef(false);

  const brevo = useBrevoNewsletter({
    active: provider === "brevo",
    subject,
    html,
    previewName,
    adminEmail: admin?.email ?? "",
    onConfigured: () => {
      patchBrevoSettings({ provider: "brevo" });
    },
    onForgot: () => {
      patchBrevoSettings({ provider: "gmail" });
    },
  });

  useEffect(() => {
    let cancelled = false;
    loadNewsletterTemplate()
      .then((saved) => {
        if (cancelled) return;
        if (saved) {
          setSubject(saved.subject);
          setHtml(applyNewsletterLinks(saved.html));
          setUpdatedAt(saved.updatedAt);
        }
        setReady(true);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setLoadError(permissionMessage(error, "Could not load the saved template."));
        setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const rawBlocks = readBlocks(html);
  const sharedBlocks = NEWSLETTER_BLOCKS.filter((block) => block.lang === "both" && block.id in rawBlocks);
  const langBlocks = NEWSLETTER_BLOCKS.filter((block) => block.lang === blockLang && block.id in rawBlocks);
  const preview = personalizeNewsletter(
    { subject, html },
    { email: "preview@direexpress.app", name: previewName.trim() || "Abebe Bekele" },
  );
  const previewHtml = previewNewsletterHtml(html, {
    email: "preview@direexpress.app",
    name: previewName.trim() || "Abebe Bekele",
  });
  const recipients = parsed?.recipients ?? [];
  const validRecipients = recipients.filter((row) => row.status === "valid");
  const sentCount = validRecipients.filter((row) => delivery[deliveryKey(row.email)]?.state === "sent").length;
  const failedCount = validRecipients.filter((row) => delivery[deliveryKey(row.email)]?.state === "failed").length;
  const remaining = validRecipients.filter((row) => delivery[deliveryKey(row.email)]?.state !== "sent");
  const retryFailed =
    remaining.length > 0 && remaining.every((row) => delivery[deliveryKey(row.email)]?.state === "failed");
  const progress = validRecipients.length
    ? Math.round(((sentCount + failedCount) / validRecipients.length) * 100)
    : 0;
  const visibleRows = recipients.slice(0, TABLE_LIMIT);

  function rememberSession(next: GmailSession | null) {
    sessionRef.current = next;
    setSession(next);
  }

  function updateBlock(block: NewsletterBlock, value: string) {
    setHtml((current) => writeBlock(current, block.id, value, block.mode));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await saveNewsletterTemplate({ subject, html });
      setUpdatedAt(Date.now());
      toast.success("Newsletter template saved");
    } catch (error) {
      toast.error(permissionMessage(error, "Could not save the newsletter template"));
    } finally {
      setSaving(false);
    }
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setParsing(true);
    try {
      const result = await parseRecipientFile(file);
      setParsed(result);
      setDelivery({});
      setFileName(file.name);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not read that file.");
    } finally {
      setParsing(false);
    }
  }

  async function handleCopyBcc() {
    const emails = validRecipients.map((row) => row.email);
    if (!emails.length) return;
    try {
      await copyText(emails.join(", "));
      toast.success(`Copied ${emails.length} addresses for BCC`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not copy the addresses");
    }
  }

  async function handleSignIn() {
    setConnecting(true);
    try {
      const next = await connectGmail("consent");
      rememberSession(next);
      toast.success(next.email ? `Signed in as ${next.email}` : "Signed in with Google");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Google sign-in failed");
    } finally {
      setConnecting(false);
    }
  }

  function handleGoogleSignOut() {
    const token = sessionRef.current?.accessToken;
    if (token) revokeGmailToken(token);
    rememberSession(null);
  }

  async function tokenFor(forceRefresh: boolean) {
    const current = sessionRef.current;
    if (!forceRefresh && current && current.expiresAt - Date.now() > 60_000) {
      return current.accessToken;
    }
    try {
      const next = await connectGmail(current ? "" : "consent");
      rememberSession(next);
      return next.accessToken;
    } catch (error) {
      if (!current) throw error;
      const next = await connectGmail("consent");
      rememberSession(next);
      return next.accessToken;
    }
  }

  async function handleSendTest() {
    const subjectSnapshot = subject.trim();
    const to = sessionRef.current?.email ?? "";
    if (!subjectSnapshot || !to || sending || testing) return;
    setTesting(true);
    const message = personalizeNewsletter(
      { subject: subjectSnapshot, html },
      { email: to, name: previewName.trim() || "Dire Express" },
    );
    const sendOnce = async (forceRefresh: boolean) => {
      const accessToken = await tokenFor(forceRefresh);
      await sendGmailHtml({
        accessToken,
        to,
        from: sessionRef.current?.email || to,
        subject: message.subject,
        html: message.html,
      });
    };
    try {
      try {
        await sendOnce(false);
      } catch (error) {
        if (!isTokenExpired(error)) throw error;
        await sendOnce(true);
      }
      toast.success(`Test sent to ${to}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Test send failed");
    } finally {
      setTesting(false);
    }
  }

  async function handleSend() {
    if (testing) return;
    const queued = validRecipients.filter((row) => delivery[deliveryKey(row.email)]?.state !== "sent");
    const subjectSnapshot = subject.trim();
    if (!queued.length || !subjectSnapshot) return;
    if (queued.length > GMAIL_DAILY_LIMIT) {
      const proceed = window.confirm(
        `This send includes ${queued.length} addresses. A Gmail account can send about ${GMAIL_DAILY_LIMIT} messages a day. Send anyway?`,
      );
      if (!proceed) return;
    }
    const htmlSnapshot = html;
    setSending(true);
    cancelRef.current = false;
    try {
      const result = await runNewsletterCampaign({
        recipients: queued.map((row) => ({ email: row.email, name: row.name })),
        subject: subjectSnapshot,
        html: htmlSnapshot,
        isCancelled: () => cancelRef.current,
        prepareToken: () => tokenFor(false),
        refreshToken: () => tokenFor(true),
        send: (message) =>
          sendGmailHtml({
            ...message,
            from: sessionRef.current?.email || undefined,
          }),
        onUpdate: (update) => {
          setDelivery((current) => ({
            ...current,
            [deliveryKey(update.email)]: {
              state: update.state,
              error: update.error ?? "",
            },
          }));
        },
      });
      if (result.sent + result.failed > 0) {
        try {
          await logNewsletterCampaign({
            subject: subjectSnapshot,
            total: result.total,
            sent: result.sent,
            failed: result.failed,
          });
        } catch (error) {
          toast.error(permissionMessage(error, "The campaign log was not saved."));
        }
      }
      const summary = `Sent ${result.sent}, failed ${result.failed}.`;
      if (result.stopped && result.sent + result.failed < result.total) {
        toast.message(`${summary} Stopped before the rest of the list.`);
      } else if (result.failed > 0) {
        toast.error(summary);
      } else if (result.sent > 0) {
        toast.success(summary);
      }
    } finally {
      setSending(false);
    }
  }

  const sendLabel = sending ? "Stop" : retryFailed ? "Retry failed" : sentCount > 0 ? "Resume sending" : "Send with Gmail";
  const canSend =
    Boolean(session) && !connecting && !parsing && !testing && remaining.length > 0 && Boolean(subject.trim());
  const canTest = Boolean(session?.email) && !connecting && !sending && !testing && Boolean(subject.trim());
  const spamWarnings = newsletterSpamWarnings({ subject, html });

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-semibold">Newsletter</h1>
      <p className="mt-1 max-w-3xl text-sm text-muted">
        Edit the Dire Express letter, then send it with Brevo or Gmail from this browser. {"{{name}}"} and{" "}
        {"{{first_name}}"} both use the full name. The default letter is plain text with a link to direexpress.com.et,
        which is what tends to land in Gmail Primary.
      </p>

      <div className="mt-6 flex gap-2">
        {(["brevo", "gmail"] as const).map((choice) => (
          <button
            key={choice}
            type="button"
            onClick={() => {
              patchBrevoSettings({ provider: choice });
            }}
            className={`h-10 rounded-lg px-4 text-sm font-semibold ${
              provider === choice ? "bg-primary text-primary-foreground" : "border border-border"
            }`}
          >
            {choice === "brevo" ? "Brevo" : "Gmail"}
            {choice === "brevo" && brevo.apiKeySaved ? " · key saved" : ""}
          </button>
        ))}
      </div>
      <p className="mt-2 text-sm text-muted">
        {provider === "brevo"
          ? "Brevo is selected. Once a key is saved in this browser it is the default sender. Gmail is still on the other tab."
          : "Gmail is selected. Each message is one To address from the connected Google account."}
      </p>

      {provider === "brevo" ? <BrevoSettings controller={brevo} /> : null}

      {provider === "gmail" ? (
      <section className="mt-6 rounded-xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-sm font-semibold">Gmail sender</h2>
        <p className="mt-2 text-sm text-muted">
          A regular Gmail account can send about {GMAIL_DAILY_LIMIT} messages a day. This page sends about one message
          every 3–5 seconds. Messages past the daily limit are rejected until the quota resets.
        </p>
        {!clientId ? (
          <p className="mt-3 text-sm text-danger">
            Set NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID and rebuild before signing in. Download and copy still work.
          </p>
        ) : null}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {session ? (
            <>
              <p className="text-sm">
                Sending as{" "}
                <span className="font-semibold">{session.email || "the connected Google account"}</span>
              </p>
              <button
                type="button"
                onClick={handleGoogleSignOut}
                disabled={sending || testing}
                className="h-11 rounded-lg border border-border px-4 text-sm font-semibold disabled:opacity-70"
              >
                Disconnect Google
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => void handleSignIn()}
              disabled={!clientId || connecting || sending || testing}
              className="h-11 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-70"
            >
              {connecting ? "Waiting for Google..." : "Sign in with Google"}
            </button>
          )}
        </div>
      </section>
      ) : null}

      {!ready ? <p className="mt-6 text-sm text-muted">Loading template…</p> : null}
      {loadError ? <p className="mt-4 text-sm text-danger">{loadError}</p> : null}

      {ready ? (
        <section className="mt-6 rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Template</h2>
              <p className="mt-2 text-sm text-muted">
                Saved at newsletter/template. The text fields edit the tagged sections. The code box is the HTML that
                gets saved and sent.
              </p>
              {updatedAt ? (
                <p className="mt-2 text-xs text-muted">Last saved {new Date(updatedAt).toLocaleString()}.</p>
              ) : (
                <p className="mt-2 text-xs text-muted">Showing the built-in personal letter. Save it to keep your edits.</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                setSubject(DEFAULT_NEWSLETTER_SUBJECT);
                setHtml(DEFAULT_NEWSLETTER_HTML);
              }}
              className="h-11 rounded-lg border border-border px-4 text-sm font-semibold"
            >
              Restore default template
            </button>
          </div>

          <label className="mt-5 flex flex-col gap-1.5 text-sm font-medium">
            Subject
            <input
              value={subject}
              maxLength={200}
              onChange={(event) => setSubject(event.target.value)}
              className="h-11 rounded-lg border border-border bg-background px-3 font-normal outline-none focus:border-primary"
            />
          </label>

          {sharedBlocks.length ? (
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {sharedBlocks.map((block) => (
                <BlockField
                  key={block.id}
                  block={block}
                  value={blockFieldValue(rawBlocks[block.id] ?? "", block.mode)}
                  onChange={(value) => updateBlock(block, value)}
                />
              ))}
            </div>
          ) : null}

          {langBlocks.length ? (
            <>
              <div className="mt-5 flex gap-2">
                {(["am", "en"] as const).map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => setBlockLang(lang)}
                    className={`h-10 rounded-lg px-4 text-sm font-semibold ${
                      blockLang === lang ? "bg-primary text-primary-foreground" : "border border-border"
                    }`}
                  >
                    {lang === "am" ? "አማርኛ" : "English"}
                  </button>
                ))}
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {langBlocks.map((block) => (
                  <BlockField
                    key={block.id}
                    block={block}
                    value={blockFieldValue(rawBlocks[block.id] ?? "", block.mode)}
                    onChange={(value) => updateBlock(block, value)}
                  />
                ))}
              </div>
            </>
          ) : null}

          {spamWarnings.length ? (
            <ul className="mt-4 space-y-1 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              {spamWarnings.map((warning) => (
                <li key={warning.id}>{warning.message}</li>
              ))}
            </ul>
          ) : null}
          <p className="mt-3 text-xs text-muted">
            Script tags and external font links are removed before a message is sent. If the template has no unsubscribe
            line, one is added in the footer.
          </p>

          <label className="mt-5 flex flex-col gap-1.5 text-sm font-medium">
            HTML
            <textarea
              value={html}
              spellCheck={false}
              onChange={(event) => setHtml(event.target.value)}
              className="h-80 w-full rounded-lg border border-border bg-background p-3 font-mono text-xs leading-5 font-normal outline-none focus:border-primary"
            />
          </label>

          <div className="mt-5 overflow-hidden rounded-xl border border-border">
            <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                Preview as
                <input
                  value={previewName}
                  onChange={(event) => setPreviewName(event.target.value)}
                  className="h-9 rounded-lg border border-border bg-background px-3 font-normal outline-none focus:border-primary"
                />
              </label>
              <p className="min-w-0 flex-1 truncate text-sm text-muted">Subject: {preview.subject}</p>
            </div>
            <iframe title="Newsletter preview" sandbox="" srcDoc={previewHtml} className="h-[720px] w-full bg-white" />
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || !subject.trim()}
              className="h-11 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-70"
            >
              {saving ? "Saving..." : "Save template"}
            </button>
            <button
              type="button"
              onClick={() => downloadHtml(html)}
              className="h-11 rounded-lg border border-border px-4 text-sm font-semibold"
            >
              Download HTML
            </button>
          </div>
        </section>
      ) : null}

      {provider === "gmail" ? (
      <section className="mt-6 rounded-xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-sm font-semibold">Recipients</h2>
        <p className="mt-2 text-sm text-muted">
          Attach an .xlsx, .xls, or .csv file. The email column is the header containing “email”, or the first column
          that contains email addresses. The name is the whole cell, including spaces and commas, and fills {"{{name}}"}{" "}
          and {"{{first_name}}"}. Addresses are validated and duplicates are skipped.
        </p>
        <input
          type="file"
          accept=".xlsx,.xls,.csv,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          disabled={parsing || sending || testing}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            void handleFile(file);
          }}
          className="mt-4 block text-sm"
        />
        {parsing ? <p className="mt-3 text-sm text-muted">Reading the file…</p> : null}
        {parsed ? (
          <>
            <p className="mt-4 text-sm">
              <span className="font-semibold">{parsed.validCount}</span> valid,{" "}
              <span className="font-semibold">{parsed.invalidCount}</span> invalid
              {fileName ? ` in ${fileName}` : ""}. Email column: {parsed.emailHeader}.
              {parsed.nameHeader ? ` Name column: ${parsed.nameHeader}.` : " No name column found."}
            </p>
            {parsed.validCount > GMAIL_DAILY_LIMIT ? (
              <p className="mt-2 text-sm text-danger">
                This list is over the approximate {GMAIL_DAILY_LIMIT}-message Gmail daily limit.
              </p>
            ) : null}
            <div className="mt-4 max-h-80 overflow-auto rounded-lg border border-border">
              <table className="min-w-full text-left text-sm">
                <thead className="sticky top-0 bg-background text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-3 py-2 font-medium">Email</th>
                    <th className="px-3 py-2 font-medium">Full name</th>
                    <th className="px-3 py-2 font-medium">Check</th>
                    <th className="px-3 py-2 font-medium">Send</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row, index) => (
                    <RecipientRow key={`${row.email}-${row.status}-${index}`} row={row} delivery={delivery[deliveryKey(row.email)]} />
                  ))}
                </tbody>
              </table>
            </div>
            {recipients.length > visibleRows.length ? (
              <p className="mt-2 text-xs text-muted">
                Showing the first {visibleRows.length} of {recipients.length}. Sending and copy use every valid address.
              </p>
            ) : null}
          </>
        ) : null}

        <div className="mt-5">
          {sending || sentCount + failedCount > 0 ? (
            <div className="mb-4">
              <div className="h-2 overflow-hidden rounded-full bg-border">
                <div className="h-full bg-primary" style={{ width: `${progress}%` }} />
              </div>
              <p className="mt-2 text-sm text-muted">
                {sentCount} sent, {failedCount} failed, {validRecipients.length} valid.
              </p>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={sending ? false : !canSend}
              onClick={() => {
                if (sending) {
                  cancelRef.current = true;
                  return;
                }
                void handleSend();
              }}
              className="h-11 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-70"
            >
              {sendLabel}
            </button>
            <button
              type="button"
              onClick={() => void handleSendTest()}
              disabled={!canTest}
              className="h-11 rounded-lg border border-border px-4 text-sm font-semibold disabled:opacity-70"
            >
              {testing ? "Sending test..." : "Send test to me"}
            </button>
            <button
              type="button"
              onClick={() => void handleCopyBcc()}
              disabled={!validRecipients.length || sending || testing}
              className="h-11 rounded-lg border border-border px-4 text-sm font-semibold disabled:opacity-70"
            >
              Copy recipients (BCC)
            </button>
          </div>
          <p className="mt-3 text-sm text-muted">
            {session
              ? "Send test to me uses the preview name and sends one message to the connected Gmail address."
              : "Sign in with Google to send."}
          </p>
        </div>
      </section>
      ) : (
        <BrevoAudience controller={brevo} />
      )}
    </div>
  );
}

function RecipientRow({ row, delivery }: { row: ParsedRecipient; delivery?: Delivery }) {
  const sendLabel =
    row.status !== "valid"
      ? ""
      : delivery?.state === "sending"
        ? "Sending"
        : delivery?.state === "sent"
          ? "Sent"
          : delivery?.state === "failed"
            ? delivery.error || "Failed"
            : "Ready";
  return (
    <tr className="border-t border-border">
      <td className="px-3 py-2">{row.email || "—"}</td>
      <td className="px-3 py-2">{row.name || "—"}</td>
      <td className={`px-3 py-2 ${row.status === "valid" ? "text-success" : "text-danger"}`}>
        {row.status === "valid" ? "Valid" : row.reason}
      </td>
      <td className={`px-3 py-2 ${delivery?.state === "failed" ? "text-danger" : delivery?.state === "sent" ? "text-success" : "text-muted"}`}>
        {sendLabel}
      </td>
    </tr>
  );
}
