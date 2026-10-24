"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { useAdminAuth } from "@/components/auth-provider";
import { countUnreadDemoRequests, getDemoRequests } from "@/lib/data";
import { loadDirectory, onDirectoryInvalidated } from "@/lib/rtdb/reads";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const { status, admin, message } = useAdminAuth();
  const router = useRouter();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (status === "signedOut") router.replace("/login");
    if (status === "denied") router.replace("/login?reason=not-admin");
  }, [status, router]);

  useEffect(() => {
    if (status !== "ready") return;
    let cancelled = false;
    const run = () => {
      loadDirectory()
        .then((directory) => {
          if (!cancelled) setUnread(countUnreadDemoRequests(getDemoRequests(directory)));
        })
        .catch(() => {
          if (!cancelled) setUnread(0);
        });
    };
    run();
    const unsubscribe = onDirectoryInvalidated(run);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [status]);

  if (status === "loading" || status === "signedOut" || status === "denied") {
    return <main className="p-8 text-sm text-muted">Checking admin access…</main>;
  }

  if (status === "error" || !admin) {
    return (
      <main className="mx-auto max-w-xl p-8">
        <h1 className="text-xl font-semibold">Could not open the dashboard</h1>
        <p className="mt-3 text-sm text-muted">{message || "Sign in again."}</p>
      </main>
    );
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar adminName={admin.name || "Admin"} unreadDemoCount={unread} />
      <main className="min-w-0 flex-1 overflow-auto p-8">{children}</main>
    </div>
  );
}
