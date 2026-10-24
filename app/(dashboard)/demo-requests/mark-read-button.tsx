"use client";

import { useState } from "react";
import { toast } from "sonner";
import { markDemoRequestRead, permissionMessage } from "@/lib/rtdb/client-writes";

export function MarkReadButton({ id }: { id: string }) {
  const [loading, setLoading] = useState(false);

  async function markRead() {
    setLoading(true);
    try {
      await markDemoRequestRead(id);
    } catch (error) {
      toast.error(permissionMessage(error, "Could not mark this request read"));
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
