import { db } from "@/lib/db";

function agentScore(ownDelivered: number, referredDelivered: number) {
  return ownDelivered + referredDelivered;
}

export default async function AgentsPage() {
  const agents = await db.brokerProfile.findMany({
    include: {
      user: { select: { name: true, email: true, phone: true } },
      referredBy: { include: { user: { select: { name: true, email: true } } } },
      referrals: {
        include: {
          loads: { where: { status: "DELIVERED" }, select: { id: true } },
        },
      },
      loads: { where: { status: "DELIVERED" }, select: { id: true } },
    },
    orderBy: { user: { name: "asc" } },
  });

  const rows = agents
    .map((agent) => {
      const delivered = agent.loads.length;
      const referredDelivered = agent.referrals.reduce(
        (sum, referral) => sum + referral.loads.length,
        0
      );
      return {
        id: agent.id,
        name: agent.user.name,
        email: agent.user.email,
        company: agent.company,
        referee: agent.referredBy?.user.name ?? "—",
        referralCount: agent.referrals.length,
        delivered,
        score: agentScore(delivered, referredDelivered),
      };
    })
    .sort((a, b) => b.score - a.score);

  return (
    <div>
      <h1 className="text-2xl font-semibold">Agents</h1>
      <p className="mt-1 text-sm text-muted">
        Brokers treated as agents. Score = own delivered loads + delivered loads from
        brokers they referred.
      </p>

      <div className="mt-6 overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full text-left text-sm">
          <thead className="bg-background text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Agent</th>
              <th className="px-4 py-3 font-medium">Company</th>
              <th className="px-4 py-3 font-medium">Referee</th>
              <th className="px-4 py-3 font-medium">Referrals</th>
              <th className="px-4 py-3 font-medium">Delivered</th>
              <th className="px-4 py-3 font-medium">Score</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted">
                  No agents yet.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-t border-border">
                  <td className="px-4 py-3">
                    <span className="font-medium">{row.name}</span>
                    <span className="block text-xs text-muted">{row.email ?? "—"}</span>
                  </td>
                  <td className="px-4 py-3">{row.company ?? "—"}</td>
                  <td className="px-4 py-3">{row.referee}</td>
                  <td className="px-4 py-3">{row.referralCount}</td>
                  <td className="px-4 py-3">{row.delivered}</td>
                  <td className="px-4 py-3 font-semibold">{row.score}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
