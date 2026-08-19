import Link from "next/link";
import { db } from "@/lib/db";
import { formatCurrency, formatDateTime, toNumber } from "@/lib/utils";

export default async function PendingLoadsPage() {
  const loads = await db.load.findMany({
    where: {
      paymentReceiptUrl: { not: null },
      reviewedAt: null,
      status: { in: ["PENDING", "CREATED"] },
    },
    include: {
      broker: { include: { user: { select: { name: true, email: true } } } },
      customer: { include: { user: { select: { name: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold">Pending loads</h1>
      <p className="mt-1 text-sm text-muted">
        Broker loads waiting for receipt review. Approve to make them active.
      </p>

      <div className="mt-6 overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full text-left text-sm">
          <thead className="bg-background text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Reference</th>
              <th className="px-4 py-3 font-medium">Agent</th>
              <th className="px-4 py-3 font-medium">Route</th>
              <th className="px-4 py-3 font-medium">Rate</th>
              <th className="px-4 py-3 font-medium">Submitted</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {loads.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted">
                  No receipts waiting for review.
                </td>
              </tr>
            ) : (
              loads.map((load) => (
                <tr key={load.id} className="border-t border-border">
                  <td className="px-4 py-3 font-medium">{load.referenceNo}</td>
                  <td className="px-4 py-3">
                    {load.broker.user.name}
                    {load.broker.company ? (
                      <span className="block text-xs text-muted">{load.broker.company}</span>
                    ) : null}
                  </td>
                  <td className="max-w-xs px-4 py-3 text-muted">
                    {load.pickupAddress} → {load.deliveryAddress}
                  </td>
                  <td className="px-4 py-3">{formatCurrency(toNumber(load.rate))}</td>
                  <td className="px-4 py-3 text-muted">{formatDateTime(load.createdAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/loads/${load.id}`} className="font-semibold text-secondary">
                      Review
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
