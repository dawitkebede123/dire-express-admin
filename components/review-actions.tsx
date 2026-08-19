"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export function ReviewActions({ loadId }: { loadId: string }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);

  async function review(action: "approve" | "reject") {
    setBusy(action);
    const res = await fetch(`/api/loads/${loadId}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        rejectionReason: action === "reject" ? reason : undefined,
      }),
    });
    setBusy(null);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "Review failed");
      return;
    }

    toast.success(action === "approve" ? "Load approved" : "Load rejected");
    router.push("/loads");
    router.refresh();
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h2 className="text-sm font-semibold">Decision</h2>
      <label className="mt-3 block text-sm text-muted">
        Rejection reason (optional)
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
          placeholder="Why is this receipt being rejected?"
        />
      </label>
      <div className="mt-4 flex gap-3">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => review("approve")}
          className="h-10 flex-1 rounded-lg bg-success text-sm font-semibold text-white disabled:opacity-70"
        >
          {busy === "approve" ? "Approving..." : "Approve"}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => review("reject")}
          className="h-10 flex-1 rounded-lg bg-danger text-sm font-semibold text-white disabled:opacity-70"
        >
          {busy === "reject" ? "Rejecting..." : "Reject"}
        </button>
      </div>
    </div>
  );
}
