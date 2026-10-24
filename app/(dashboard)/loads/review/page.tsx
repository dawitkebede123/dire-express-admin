"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ReceiptViewer } from "@/components/receipt-viewer";
import { ReviewActions } from "@/components/review-actions";
import { useDirectory } from "@/components/use-directory";
import { getLoad } from "@/lib/data";
import { formatCurrency, formatDateTime, toNumber } from "@/lib/utils";

export default function LoadReviewPage() {
  return (
    <Suspense fallback={<p className="mx-auto max-w-5xl text-sm text-muted">Loading…</p>}>
      <LoadReview />
    </Suspense>
  );
}

function LoadReview() {
  const params = useSearchParams();
  const loadId = params.get("id");
  const { directory, error } = useDirectory();
  const load = directory && loadId ? getLoad(directory, loadId) : null;

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/loads" className="text-sm text-secondary hover:underline">
        ← Pending loads
      </Link>

      {!loadId ? <p className="mt-6 text-sm text-muted">Open a load from the pending list.</p> : null}
      {loadId && error && !directory ? <p className="mt-6 text-sm text-muted">{error}</p> : null}
      {loadId && !directory && !error ? <p className="mt-6 text-sm text-muted">Loading…</p> : null}
      {directory && loadId && !load ? (
        <p className="mt-6 text-sm text-muted">Load not found.</p>
      ) : null}

      {load ? (
        <>
          <div className="mt-4 flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold">{load.referenceNo}</h1>
              <p className="mt-1 text-sm text-muted">
                {load.status}
                {load.reviewedAt ? ` · reviewed ${formatDateTime(load.reviewedAt)}` : ""}
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <section className="rounded-xl border border-border bg-card p-5">
              <h2 className="text-sm font-semibold">Payment receipt</h2>
              <div className="mt-4">
                {load.paymentReceiptUrl ? (
                  <ReceiptViewer storedUrl={load.paymentReceiptUrl} />
                ) : (
                  <p className="text-sm text-muted">No receipt attached.</p>
                )}
              </div>
            </section>

            <div className="flex flex-col gap-6">
              <section className="rounded-xl border border-border bg-card p-5">
                <h2 className="text-sm font-semibold">Load details</h2>
                <dl className="mt-4 space-y-3 text-sm">
                  <Row
                    label="Agent"
                    value={`${load.broker.user.name}${load.broker.company ? ` · ${load.broker.company}` : ""}`}
                  />
                  <Row label="Customer" value={load.customer.user.name} />
                  <Row label="Pickup" value={load.pickupAddress} />
                  <Row label="Delivery" value={load.deliveryAddress} />
                  <Row label="Pickup date" value={formatDateTime(load.pickupDate)} />
                  <Row label="Cargo" value={load.cargoDescription ?? "—"} />
                  <Row label="Rate" value={formatCurrency(toNumber(load.rate))} />
                </dl>
              </section>
              {load.awaitingReview ? (
                <ReviewActions
                  loadId={load.id}
                  brokerId={load.brokerId}
                  referenceNo={load.referenceNo}
                />
              ) : (
                <p className="rounded-xl border border-border bg-card p-5 text-sm text-muted">
                  This load is no longer waiting for receipt approval.
                  {load.rejectionReason ? ` Reason: ${load.rejectionReason}` : ""}
                </p>
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className="mt-0.5 font-medium">{value}</dd>
    </div>
  );
}
