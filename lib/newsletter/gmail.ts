"use client";

import { buildRawMime } from "@/lib/newsletter/mime";
import { GmailTokenExpired } from "@/lib/newsletter/gmail-error";

const GSI_SRC = "https://accounts.google.com/gsi/client";

export const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
export const GMAIL_EMAIL_SCOPE = "https://www.googleapis.com/auth/userinfo.email";
export const GMAIL_TOKEN_SCOPES = `${GMAIL_SEND_SCOPE} ${GMAIL_EMAIL_SCOPE}`;
export const GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

export type GmailSession = {
  accessToken: string;
  expiresAt: number;
  email: string;
};

type TokenResponse = {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

type TokenClient = {
  requestAccessToken: (override?: { prompt?: "" | "consent" }) => void;
};

type GoogleAccounts = {
  oauth2: {
    initTokenClient: (config: {
      client_id: string;
      scope: string;
      callback: (response: TokenResponse) => void;
      error_callback?: (error: { type: string; message?: string }) => void;
    }) => TokenClient;
    revoke?: (accessToken: string, done: () => void) => void;
  };
};

export function googleOAuthClientId() {
  return process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID?.trim() ?? "";
}

function googleAccounts() {
  if (typeof window === "undefined") return null;
  const google = (window as Window & { google?: { accounts?: GoogleAccounts } }).google;
  return google?.accounts ?? null;
}

let gsiPromise: Promise<void> | null = null;
let tokenClient: TokenClient | null = null;
let tokenWaiter: {
  resolve: (value: { accessToken: string; expiresAt: number }) => void;
  reject: (error: Error) => void;
} | null = null;

export function loadGoogleIdentity() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google sign-in only runs in the browser."));
  }
  if (googleAccounts()?.oauth2) return Promise.resolve();
  if (gsiPromise) return gsiPromise;
  gsiPromise = new Promise<void>((resolve, reject) => {
    const fail = () => {
      gsiPromise = null;
      reject(new Error("Could not load Google sign-in."));
    };
    const finish = () => {
      if (googleAccounts()?.oauth2) resolve();
      else fail();
    };
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GSI_SRC}"]`);
    if (existing) {
      if (googleAccounts()?.oauth2) {
        resolve();
        return;
      }
      existing.addEventListener("load", finish, { once: true });
      existing.addEventListener("error", fail, { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = GSI_SRC;
    script.async = true;
    script.onload = finish;
    script.onerror = fail;
    document.head.appendChild(script);
  });
  return gsiPromise;
}

export function requestGmailToken(prompt: "" | "consent") {
  const clientId = googleOAuthClientId();
  if (!clientId) {
    return Promise.reject(
      new Error("Set NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID and rebuild before signing in with Google."),
    );
  }
  return loadGoogleIdentity().then(
    () =>
      new Promise<{ accessToken: string; expiresAt: number }>((resolve, reject) => {
        if (tokenWaiter) {
          reject(new Error("A Google sign-in is already open."));
          return;
        }
        const accounts = googleAccounts();
        if (!accounts) {
          reject(new Error("Google sign-in did not load."));
          return;
        }
        tokenWaiter = { resolve, reject };
        try {
          if (!tokenClient) {
            tokenClient = accounts.oauth2.initTokenClient({
              client_id: clientId,
              scope: GMAIL_TOKEN_SCOPES,
              callback: (response) => {
                const waiter = tokenWaiter;
                tokenWaiter = null;
                if (!waiter) return;
                if (!response.access_token || response.error) {
                  waiter.reject(
                    new Error(
                      response.error_description || response.error || "Google did not return an access token.",
                    ),
                  );
                  return;
                }
                const expiresIn = response.expires_in && response.expires_in > 0 ? response.expires_in : 3600;
                waiter.resolve({
                  accessToken: response.access_token,
                  expiresAt: Date.now() + expiresIn * 1000,
                });
              },
              error_callback: (error) => {
                const waiter = tokenWaiter;
                tokenWaiter = null;
                if (!waiter) return;
                const cancelled = error.type === "popup_closed";
                waiter.reject(
                  new Error(cancelled ? "Google sign-in was cancelled." : error.message || "Google sign-in failed."),
                );
              },
            });
          }
          tokenClient.requestAccessToken({ prompt });
        } catch (error) {
          tokenWaiter = null;
          reject(error instanceof Error ? error : new Error("Google sign-in failed."));
        }
      }),
  );
}

export async function fetchSenderEmail(accessToken: string) {
  const response = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return "";
  const body = (await response.json()) as { email?: unknown };
  return typeof body.email === "string" ? body.email : "";
}

export async function connectGmail(prompt: "" | "consent"): Promise<GmailSession> {
  const token = await requestGmailToken(prompt);
  const email = await fetchSenderEmail(token.accessToken);
  return { ...token, email };
}

export async function sendGmailHtml(input: {
  accessToken: string;
  to: string;
  from?: string;
  subject: string;
  html: string;
}) {
  const response = await fetch(GMAIL_SEND_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      raw: buildRawMime({
        to: input.to,
        from: input.from,
        subject: input.subject,
        html: input.html,
      }),
    }),
  });
  if (response.status === 401) throw new GmailTokenExpired();
  if (!response.ok) {
    let message = `Gmail rejected the message (${response.status}).`;
    try {
      const body = (await response.json()) as { error?: { message?: string } };
      if (body.error?.message) message = body.error.message;
    } catch {
      // Gmail sometimes returns an empty error body.
    }
    throw new Error(message);
  }
}

export function revokeGmailToken(accessToken: string) {
  const revoke = googleAccounts()?.oauth2.revoke;
  if (!revoke) return;
  try {
    revoke(accessToken, () => undefined);
  } catch {
    // The local session is cleared either way.
  }
}
