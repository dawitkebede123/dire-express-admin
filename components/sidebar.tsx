"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ClipboardCheck,
  Inbox,
  LayoutDashboard,
  LogOut,
  Settings,
  Users,
} from "lucide-react";
import { endClientSession } from "@/lib/firebase/client";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/loads", label: "Pending loads", icon: ClipboardCheck },
  { href: "/agents", label: "Agents", icon: Users },
  { href: "/demo-requests", label: "Demo requests", icon: Inbox },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar({
  adminName,
  unreadDemoCount = 0,
}: {
  adminName: string;
  unreadDemoCount?: number;
}) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <aside className="flex w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground">
      <div className="border-b border-white/10 px-6 py-6">
        <p className="text-xs uppercase tracking-[0.2em] text-sidebar-muted">Dire Express</p>
        <h1 className="mt-1 text-lg font-semibold">Admin</h1>
      </div>
      <nav className="flex flex-1 flex-col gap-1 p-3">
        {NAV.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Icon = item.icon;
          const showBadge = item.href === "/demo-requests" && unreadDemoCount > 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                active
                  ? "bg-white/10 text-white"
                  : "text-sidebar-muted hover:bg-white/5 hover:text-white"
              )}
            >
              <Icon size={18} />
              <span className="flex-1">{item.label}</span>
              {showBadge ? (
                <span className="rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-semibold text-black">
                  {unreadDemoCount > 99 ? "99+" : unreadDemoCount}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-white/10 p-4">
        <p className="truncate text-sm font-medium">{adminName}</p>
        <button
          type="button"
          onClick={async () => {
            try {
              await endClientSession();
            } finally {
              router.push("/login");
            }
          }}
          className="mt-3 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-sidebar-muted hover:bg-white/5 hover:text-white"
        >
          <LogOut size={16} />
          Sign out
        </button>
      </div>
    </aside>
  );
}
