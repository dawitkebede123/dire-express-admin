import Link from "next/link";
import { db } from "@/lib/db";

export default async function AdminHomePage() {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [pendingCount, approvedToday, agentCount] = await Promise.all([
    db.load.count({
      where: {
        paymentReceiptUrl: { not: null },
        reviewedAt: null,
        status: { in: ["PENDING", "CREATED"] },
      },
    }),
    db.load.count({
      where: {
        status: "CREATED",
        reviewedAt: { gte: startOfToday },
      },
    }),
    db.brokerProfile.count(),
  ]);

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
