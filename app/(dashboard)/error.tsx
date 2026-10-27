"use client";

export default function DashboardError({ error }: { error: Error }) {
  return (
    <main className="mx-auto max-w-xl p-8">
      <h1 className="text-xl font-semibold">Could not load the dashboard</h1>
      <p className="mt-3 text-sm text-muted">{error.message}</p>
    </main>
  );
}
