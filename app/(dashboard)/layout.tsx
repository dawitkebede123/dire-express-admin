import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { db } from "@/lib/db";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") redirect("/login");

  const unreadDemoCount = await db.demoRequest.count({
    where: { readAt: null },
  });

  return (
    <div className="flex min-h-screen">
      <Sidebar
        adminName={session.user.name ?? "Admin"}
        unreadDemoCount={unreadDemoCount}
      />
      <main className="min-w-0 flex-1 overflow-auto p-8">{children}</main>
    </div>
  );
}
