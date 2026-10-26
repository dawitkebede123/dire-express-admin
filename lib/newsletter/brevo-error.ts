export const BREVO_AUTHORIZED_IPS_URL = "https://app.brevo.com/security/authorised_ips";
export const BREVO_SENDERS_URL = "https://app.brevo.com/senders/list";
export const BREVO_API_KEYS_URL = "https://app.brevo.com/settings/keys/api";
export const BREVO_TRACKING_HELP_URL =
  "https://help.brevo.com/hc/en-us/articles/208828089-Understand-and-export-the-statistics-of-your-email-campaigns";

export type BrevoFailureKind =
  | "invalid_key"
  | "unauthorized_ip"
  | "daily_limit"
  | "sender"
  | "network"
  | "other";

const IPV4 = /\b(?:\d{1,3}\.){3}\d{1,3}\b/;

export function explainBrevoFailure(input: { status: number; code: string; message: string }) {
  const message = input.message.trim();
  const code = input.code.trim();
  const haystack = `${code} ${message}`.toLowerCase();
  const reportedIp = IPV4.exec(message)?.[0] ?? null;

  if (
    /unrecognis|authorised_ips|authorized_ips|ip address not|unknown ip|ip not author/.test(haystack) ||
    (reportedIp !== null && /\bip\b/.test(haystack))
  ) {
    const ip = reportedIp ? ` Brevo reported ${reportedIp}.` : "";
    return {
      kind: "unauthorized_ip" as const,
      message: `Brevo blocked this request because the IP address is not on the key's allow list.${ip} Open Security → Authorized IPs (${BREVO_AUTHORIZED_IPS_URL}), add that public IP, or turn the restriction off. A home or mobile connection changes address, so you may need to allow it again. Brevo said: ${message || code || "unauthorized"}.`,
    };
  }

  if (
    input.status === 402 ||
    code === "not_enough_credits" ||
    /not enough credit|insufficient credit|daily limit|sending limit|quota|exceeded your|too many requests/.test(haystack)
  ) {
    return {
      kind: "daily_limit" as const,
      message: `Brevo refused the send because this account is out of email credits or hit its daily limit. The free plan is about 300 emails a day. Nobody in this batch was marked as sent. Try again tomorrow, or lower the batch size. Brevo said: ${message || code || "not enough credits"}.`,
    };
  }

  if (
    /sender/.test(haystack) &&
    /valid|verif|authori|domain|exist|activ/.test(haystack)
  ) {
    return {
      kind: "sender" as const,
      message: `Brevo did not accept the sender address. Add it under Senders, domains & IPs (${BREVO_SENDERS_URL}) and finish domain verification (SPF and DKIM) for direexpress.com.et before sending. Brevo said: ${message || code}.`,
    };
  }

  if (/dmarc|dkim|spf|dns records/.test(haystack)) {
    return {
      kind: "sender" as const,
      message: `Brevo rejected the sender domain. Finish SPF, DKIM, and DMARC for direexpress.com.et under Senders, domains & IPs (${BREVO_SENDERS_URL}). Brevo said: ${message || code}.`,
    };
  }

  if (
    input.status === 401 ||
    /key not found|invalid api|api-key|api key|authentication failed/.test(haystack)
  ) {
    return {
      kind: "invalid_key" as const,
      message: `Brevo rejected this API key. Open SMTP & API → API keys (${BREVO_API_KEYS_URL}), create a v3 key, and paste the whole key. It is stored only in this browser. Brevo said: ${message || code || "unauthorized"}.`,
    };
  }

  if (code === "unauthorized" || input.status === 403) {
    return {
      kind: "invalid_key" as const,
      message: `Brevo refused the key (${message || code || input.status}). If the key is correct, the usual cause is the IP allow list: open ${BREVO_AUTHORIZED_IPS_URL}, add this browser's public IP, or turn the restriction off.`,
    };
  }

  const planOption = /not allowed to avail\s+(.+?)\s+option/i.exec(message)?.[1]?.trim() ?? "";
  if (planOption || /not allowed to avail/i.test(haystack)) {
    const which = planOption ? ` The blocked option is "${planOption}".` : "";
    return {
      kind: "other" as const,
      message: `Brevo refused because this account's plan does not include that campaign option.${which} On the free plan that usually means a campaign tag, an A/B test, or send-time optimization. The campaign was not created, and nobody was marked as sent. Brevo said: ${message || code || "method not allowed"}.`,
    };
  }

  if (input.status === 405 || code === "method_not_allowed") {
    const detail = [input.status ? `HTTP ${input.status}` : "", code, message].filter(Boolean).join(" — ");
    return {
      kind: "other" as const,
      message: `Brevo refused the request (${detail || "method not allowed"}). Nothing was marked as sent.`,
    };
  }

  if (input.status === 429) {
    return {
      kind: "other" as const,
      message: `Brevo rate-limited this browser. Wait a minute and try again. Brevo said: ${message || "too many requests"}.`,
    };
  }

  const detail = [input.status ? `HTTP ${input.status}` : "", code, message].filter(Boolean).join(" — ");
  return {
    kind: "other" as const,
    message: detail ? `Brevo request failed: ${detail}` : "Brevo request failed.",
  };
}
