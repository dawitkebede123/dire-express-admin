import { BREVO_DAILY_LIMIT, nextUnsentBatch, type BatchSubscriber } from "@/lib/newsletter/brevo-batch";

export function sentOnLocalDay(rows: { sent: number; createdAt: number | null }[], now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const end = start + 86_400_000;
  let sent = 0;
  for (const row of rows) {
    if (row.createdAt == null || row.createdAt < start || row.createdAt >= end) continue;
    if (!Number.isFinite(row.sent) || row.sent <= 0) continue;
    sent += row.sent;
  }
  return sent;
}

export function brevoRemainingToday(sentToday: number) {
  if (!Number.isFinite(sentToday) || sentToday <= 0) return BREVO_DAILY_LIMIT;
  return Math.max(0, BREVO_DAILY_LIMIT - Math.floor(sentToday));
}

export function welcomeBatch<T extends BatchSubscriber>(rows: T[], limit: number) {
  if (!Number.isFinite(limit) || limit <= 0) return [];
  return nextUnsentBatch(rows, limit);
}
