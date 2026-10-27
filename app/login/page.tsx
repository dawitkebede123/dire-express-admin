"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAdminAuth } from "@/components/auth-provider";
import { NOT_AN_ADMIN } from "@/lib/rtdb/admin-access";
import { signInAdmin } from "@/lib/rtdb/sign-in";

export default function LoginPage() {
  const router = useRouter();
  const { status } = useAdminAuth();
  const [email, setEmail] = useState("admin@direexpress.com");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const reason = new URLSearchParams(window.location.search).get("reason");
    if (reason === "not-admin") toast.error(NOT_AN_ADMIN);
  }, []);

  useEffect(() => {
    if (status === "ready") router.replace("/");
  }, [status, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await signInAdmin(email, password);
      router.push("/");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Invalid admin credentials");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-sm">
        <p className="text-xs uppercase tracking-[0.2em] text-muted">Dire Express</p>
        <h1 className="mt-2 text-2xl font-semibold">Admin sign in</h1>
        <p className="mt-1 text-sm text-muted">Review receipts and agent referral scores.</p>

        <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-11 rounded-lg border border-border bg-background px-3 font-normal outline-none focus:border-primary"
              required
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11 rounded-lg border border-border bg-background px-3 font-normal outline-none focus:border-primary"
              required
            />
          </label>
          <button
            type="submit"
            disabled={loading}
            className="mt-2 h-11 rounded-lg bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-70"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-muted">
          Demo: admin@direexpress.com / password123
        </p>
      </div>
    </div>
  );
}
