export type ReceiptReviewState = "pending" | "approved" | "rejected";

export type ReceiptReview = {
  state: ReceiptReviewState;
  reviewedAt?: number;
  reviewedBy?: string;
  rejectionReason?: string;
};

export function isAwaitingReceiptReview(load: {
  paymentReceiptUrl?: unknown;
  status?: unknown;
  receiptReview?: { state?: unknown } | null;
  deletedAt?: unknown;
}) {
  if (load.deletedAt) return false;
  if (typeof load.paymentReceiptUrl !== "string" || !load.paymentReceiptUrl) return false;
  if (load.status !== "PENDING" && load.status !== "CREATED") return false;
  const state = load.receiptReview?.state;
  return state !== "approved" && state !== "rejected";
}

export function reviewCopy(input: {
  locale: string | null | undefined;
  approved: boolean;
  referenceNo: string;
  reason: string;
}) {
  if (input.locale === "am") {
    if (input.approved) {
      return {
        title: "ጭነት ጸድቋል",
        body: `ጭነት ${input.referenceNo} ጸድቆ አሁን ንቁ ነው።`,
      };
    }
    return {
      title: "ጭነት ተቀባይነት አላገኘም",
      body: `ጭነት ${input.referenceNo} ተቀባይነት አላገኘም፦ ${input.reason}`,
    };
  }

  if (input.approved) {
    return {
      title: "Load approved",
      body: `Load ${input.referenceNo} was approved and is now active.`,
    };
  }
  return {
    title: "Load rejected",
    body: `Load ${input.referenceNo} was rejected: ${input.reason}`,
  };
}
