"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { saveAppSettings } from "@/lib/rtdb/client-writes";

export function SettingsForm({
  freeLoadLimit,
  basePrice,
  pricePerKm,
}: {
  freeLoadLimit: number;
  basePrice: number;
  pricePerKm: number;
}) {
  const router = useRouter();
  const [limitValue, setLimitValue] = useState(String(freeLoadLimit));
  const [baseValue, setBaseValue] = useState(String(basePrice));
  const [perKmValue, setPerKmValue] = useState(String(pricePerKm));
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const nextLimit = Number(limitValue);
    const nextBase = Number(baseValue);
    const nextPerKm = Number(perKmValue);

    if (!Number.isInteger(nextLimit) || nextLimit < 1 || nextLimit > 1000) {
      toast.error("Enter a whole number between 1 and 1000 for the free load limit");
      return;
    }
    if (!Number.isFinite(nextBase) || nextBase < 0 || nextBase > 100_000) {
      toast.error("Enter a base price between 0 and 100000 ETB");
      return;
    }
    if (!Number.isFinite(nextPerKm) || nextPerKm < 0 || nextPerKm > 1_000) {
      toast.error("Enter a per-km rate between 0 and 1000 ETB");
      return;
    }

    setSaving(true);
    try {
      await saveAppSettings({
        freeLoadLimit: nextLimit,
        basePrice: nextBase,
        pricePerKm: nextPerKm,
      });
      toast.success("Settings saved");
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save settings";
      toast.error(
        message.includes("PERMISSION_DENIED")
          ? "Realtime Database rejected the update. Confirm /admins/{uid} is true."
          : message
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-6 max-w-lg rounded-xl border border-border bg-card p-5 shadow-sm"
    >
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Free loads per day
        <input
          type="number"
          min={1}
          max={1000}
          step={1}
          value={limitValue}
          onChange={(e) => setLimitValue(e.target.value)}
          className="h-11 rounded-lg border border-border bg-background px-3 font-normal outline-none focus:border-primary"
          required
        />
      </label>
      <p className="mt-2 text-sm text-muted">
        Brokers can post this many loads each day without a payment receipt. After that, a
        receipt is required and waits for admin approval. The count resets at midnight
        (Ethiopia time).
      </p>

      <label className="mt-5 flex flex-col gap-1.5 text-sm font-medium">
        Base price (ETB)
        <input
          type="number"
          min={0}
          max={100000}
          step="0.01"
          value={baseValue}
          onChange={(e) => setBaseValue(e.target.value)}
          className="h-11 rounded-lg border border-border bg-background px-3 font-normal outline-none focus:border-primary"
          required
        />
      </label>
      <p className="mt-2 text-sm text-muted">
        Flat amount added to every load. Default is 50 ETB.
      </p>

      <label className="mt-5 flex flex-col gap-1.5 text-sm font-medium">
        Price per km (ETB)
        <input
          type="number"
          min={0}
          max={1000}
          step="0.01"
          value={perKmValue}
          onChange={(e) => setPerKmValue(e.target.value)}
          className="h-11 rounded-lg border border-border bg-background px-3 font-normal outline-none focus:border-primary"
          required
        />
      </label>
      <p className="mt-2 text-sm text-muted">
        Rate is base price plus this amount times driving distance in kilometers. Default
        is 1 ETB per km.
      </p>

      <button
        type="submit"
        disabled={saving}
        className="mt-5 h-11 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-70"
      >
        {saving ? "Saving..." : "Save"}
      </button>
    </form>
  );
}
