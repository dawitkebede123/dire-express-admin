import Link from "next/link";
import { getOverviewCounts } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function AdminHomePage() {
  const { pendingCount, approvedToday, agentCount } = await getOverviewCounts();

  const cards = [
    { label: "Pending receipts", value: pendingCount, href: "/loads" },
    { label: "Approved today", value: approvedToday, href: "/loads" },
    { label: "Agents", value: agentCount, href: "/agents" },
  ];

  return (
    <div>
      <h1 className="text-2xl font-semibold">Overview</h1>
      <p className="mt-1 text-sm text-muted">
        Approve post-trial loads and track agent referral scores.
      </p>
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
    </div>
  );
}
