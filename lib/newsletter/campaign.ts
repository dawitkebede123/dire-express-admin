import { isTokenExpired } from "@/lib/newsletter/gmail-error";
import { personalizeNewsletter } from "@/lib/newsletter/personalize";

export const SEND_INTERVAL_MIN_MS = 3000;
export const SEND_INTERVAL_MAX_MS = 5000;
export const GMAIL_DAILY_LIMIT = 500;

export function nextSendDelay(random: () => number = Math.random) {
  const span = SEND_INTERVAL_MAX_MS - SEND_INTERVAL_MIN_MS;
  const base = SEND_INTERVAL_MIN_MS + random() * span;
  const jitter = (random() - 0.5) * 400;
  return Math.round(Math.min(SEND_INTERVAL_MAX_MS, Math.max(SEND_INTERVAL_MIN_MS, base + jitter)));
}

export type SendState = "pending" | "sending" | "sent" | "failed";

export type SendUpdate = {
  email: string;
  state: SendState;
  error?: string;
};

export type OutboundMessage = {
  accessToken: string;
  to: string;
  from?: string;
  subject: string;
  html: string;
};

export type CampaignRecipient = {
  email: string;
  name: string;
};

function errorText(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

async function pause(ms: number, isCancelled: () => boolean) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (isCancelled()) return;
    const remaining = end - Date.now();
    await new Promise((resolve) => setTimeout(resolve, Math.min(100, remaining)));
  }
}

export async function runNewsletterCampaign(options: {
  recipients: CampaignRecipient[];
  subject: string;
  html: string;
  from?: string;
  intervalMs?: number;
  isCancelled?: () => boolean;
  prepareToken: () => Promise<string>;
  refreshToken: () => Promise<string>;
  send: (message: OutboundMessage) => Promise<void>;
  onUpdate: (update: SendUpdate) => void;
  sleep?: (ms: number) => Promise<void>;
}) {
  const intervalMs = options.intervalMs;
  const isCancelled = options.isCancelled ?? (() => false);
  const sleep = options.sleep ?? ((ms: number) => pause(ms, isCancelled));
  let sent = 0;
  let failed = 0;
  let stopped = false;

  for (let index = 0; index < options.recipients.length; index += 1) {
    if (isCancelled()) {
      stopped = true;
      break;
    }

    const recipient = options.recipients[index];
    options.onUpdate({ email: recipient.email, state: "sending" });
    const message = personalizeNewsletter(
      { subject: options.subject, html: options.html },
      recipient,
    );

    const sendWith = (accessToken: string) =>
      options.send({
        accessToken,
        to: recipient.email,
        from: options.from,
        subject: message.subject,
        html: message.html,
      });

    let token: string;
    try {
      token = await options.prepareToken();
    } catch (error) {
      failed += 1;
      stopped = true;
      options.onUpdate({
        email: recipient.email,
        state: "failed",
        error: errorText(error, "Google sign-in failed"),
      });
      break;
    }

    try {
      await sendWith(token);
      sent += 1;
      options.onUpdate({ email: recipient.email, state: "sent" });
    } catch (error) {
      if (!isTokenExpired(error)) {
        failed += 1;
        options.onUpdate({
          email: recipient.email,
          state: "failed",
          error: errorText(error, "Send failed"),
        });
      } else {
        let refreshed = "";
        try {
          refreshed = await options.refreshToken();
        } catch (refreshError) {
          failed += 1;
          stopped = true;
          options.onUpdate({
            email: recipient.email,
            state: "failed",
            error: errorText(refreshError, "Google sign-in failed"),
          });
          break;
        }
        try {
          await sendWith(refreshed);
          sent += 1;
          options.onUpdate({ email: recipient.email, state: "sent" });
        } catch (retryError) {
          failed += 1;
          options.onUpdate({
            email: recipient.email,
            state: "failed",
            error: errorText(retryError, "Send failed"),
          });
          if (isTokenExpired(retryError)) {
            stopped = true;
            break;
          }
        }
      }
    }

    if (index < options.recipients.length - 1) {
      if (isCancelled()) {
        stopped = true;
        break;
      }
      await sleep(intervalMs === undefined ? nextSendDelay() : intervalMs);
      if (isCancelled()) {
        stopped = true;
        break;
      }
    }
  }

  return {
    total: options.recipients.length,
    sent,
    failed,
    stopped,
  };
}
