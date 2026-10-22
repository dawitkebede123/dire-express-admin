"use client";

import Link from "next/link";
import { useDirectory } from "@/components/use-directory";
import { getOverviewCounts } from "@/lib/data";

export default function AdminHomePage() {
  const { directory, error } = useDirectory();
  const counts = directory ? getOverviewCounts(directory) : null;
  const cards = counts
    ? [
        { label: "Pending receipts", value: counts.pendingCount, href: "/loads" },
        { label: "Approved today", value: counts.approvedToday, href: "/loads" },
        { label: "Agents", value: counts.agentCount, href: "/agents" },
      ]
    : [];

  return (
    <div>
      <h1 className="text-2xl font-semibold">Overview</h1>
      <p className="mt-1 text-sm text-muted">
        Approve post-trial loads and track agent referral scores.
      </p>
      {error && !directory ? <p className="mt-6 text-sm text-muted">{error}</p> : null}
      {!directory && !error ? <p className="mt-6 text-sm text-muted">Loading…</p> : null}
      {counts ? (
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {cards.map((card) => (
            <Link
              key={card.label}
              href={card.href}
              className="rounded-xl border border-border bg-card p-5 shadow-sm transition-colors hover:border-primary"
            >
              <p className="text-sm text-muted">{card.label}</p>
              <p className="mt-2 text-3xl font-semibold">{card.value}</p>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
