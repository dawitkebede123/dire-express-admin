"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function MarkReadButton({ id }: { id: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function markRead() {
    setLoading(true);
    try {
      await fetch(`/api/demo-requests/${id}/read`, { method: "POST" });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={markRead}
      disabled={loading}
      className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium hover:bg-background disabled:opacity-60"
    >
      {loading ? "…" : "Mark read"}
    </button>
  );
}