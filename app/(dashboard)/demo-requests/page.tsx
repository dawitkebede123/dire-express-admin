import { db } from "@/lib/db";
import { MarkReadButton } from "./mark-read-button";

export const dynamic = "force-dynamic";

export default async function DemoRequestsPage() {
  const requests = await db.demoRequest.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const unread = requests.filter((r) => !r.readAt).length;

  return (
    <div>
      <h1 className="text-2xl font-semibold">Demo requests</h1>
      <p className="mt-1 text-sm text-muted">
        Email leads from the landing page “Request a demo” form.
        {unread > 0 ? (
          <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            {unread} unread
          </span>
        ) : null}
      </p>

      <div className="mt-6 overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full text-left text-sm">
          <thead className="bg-background text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Submitted</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {requests.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-muted">
                  No demo requests yet.
                </td>
              </tr>
            ) : (
              requests.map((row) => {
                const unreadRow = !row.readAt;
                return (
                  <tr
                    key={row.id}
                    className={`border-t border-border ${unreadRow ? "bg-primary/5" : ""}`}
                  >
                    <td className="px-4 py-3">
                      <a
                        href={`mailto:${row.email}`}
                        className={`font-medium hover:underline ${unreadRow ? "text-foreground" : ""}`}
                      >
                        {row.email}
                      </a>
                      <span className="block text-xs text-muted">{row.source}</span>
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {row.createdAt.toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      {unreadRow ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                          New
                        </span>
                      ) : (
                        <span className="text-xs text-muted">Read</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {unreadRow ? <MarkReadButton id={row.id} /> : "—"}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
