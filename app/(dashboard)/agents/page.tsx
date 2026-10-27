"use client";

import { useDirectory } from "@/components/use-directory";
import { getAgentScores } from "@/lib/data";

export default function AgentsPage() {
  const { directory, error } = useDirectory();
  const rows = directory ? getAgentScores(directory) : null;

  return (
    <div>
      <h1 className="text-2xl font-semibold">Agents</h1>
      <p className="mt-1 text-sm text-muted">
        Brokers treated as agents. Score = own delivered loads + delivered loads from
        brokers they referred.
      </p>

      {error && !directory ? <p className="mt-6 text-sm text-muted">{error}</p> : null}
      {!directory && !error ? <p className="mt-6 text-sm text-muted">Loading…</p> : null}

      {rows ? (
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
                    <td className="px-4 py-3">{row.referee?.name ?? "—"}</td>
                    <td className="px-4 py-3">{row.referralCount}</td>
                    <td className="px-4 py-3">{row.delivered}</td>
                    <td className="px-4 py-3 font-semibold">{row.score}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
