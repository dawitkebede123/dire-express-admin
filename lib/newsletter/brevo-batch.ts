export const BREVO_DAILY_LIMIT = 300;
export const BREVO_IMPORT_CHUNK = 100;

export function clampBatchSize(value: number) {
  if (!Number.isFinite(value)) return BREVO_DAILY_LIMIT;
  return Math.min(BREVO_DAILY_LIMIT, Math.max(1, Math.floor(value)));
}

export type BatchSubscriber = {
  email: string;
  sentAt: number | null;
  addedAt: number | null;
};

export function nextUnsentBatch<T extends BatchSubscriber>(subscribers: T[], batchSize: number) {
  const size = clampBatchSize(batchSize);
  return subscribers
    .filter((row) => row.sentAt == null)
    .slice()
    .sort((a, b) => (a.addedAt ?? 0) - (b.addedAt ?? 0) || a.email.localeCompare(b.email))
    .slice(0, size);
}

export function chunkItems<T>(items: T[], size: number) {
  const chunkSize = Math.max(1, Math.floor(size));
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
}
