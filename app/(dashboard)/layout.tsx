import { redirect } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { countUnreadDemoRequests } from "@/lib/data";
import { FirebaseConfigError, isAdminUid } from "@/lib/firebase/admin";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  try {
    if (!(await isAdminUid(session.uid))) redirect("/api/session");
  } catch (error) {
    if (error instanceof FirebaseConfigError) {
      return (
        <main className="mx-auto max-w-xl p-8">
          <h1 className="text-xl font-semibold">Firebase is not configured</h1>
          <p className="mt-3 text-sm text-muted">{error.message}</p>
        </main>
      );
    }
    throw error;
  }

  const unreadDemoCount = await countUnreadDemoRequests();

  return (
    <div className="flex min-h-screen">
      <Sidebar adminName={session.name || "Admin"} unreadDemoCount={unreadDemoCount} />
      <main className="min-w-0 flex-1 overflow-auto p-8">{children}</main>
    </div>
  );
}
