"use client";

import { useState } from "react";
import { toast } from "sonner";
import { permissionMessage, savePaymentPhone } from "@/lib/rtdb/client-writes";

export function PaymentPhoneForm({ phoneNumber }: { phoneNumber: string }) {
  const [value, setValue] = useState(phoneNumber);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await savePaymentPhone(value);
      toast.success("Payment phone number saved");
    } catch (error) {
      toast.error(permissionMessage(error, "Could not save the payment phone number"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-6 max-w-lg rounded-xl border border-border bg-card p-5 shadow-sm"
    >
      <h2 className="text-sm font-semibold">Payment phone number</h2>
      <p className="mt-2 text-sm text-muted">
        Customers see this number on the main site and in the mobile app when they pay for a load.
      </p>
      <label className="mt-5 flex flex-col gap-1.5 text-sm font-medium">
        Phone number
        <input
          type="text"
          inputMode="tel"
          autoComplete="tel"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="+251 911 234 567"
          className="h-11 rounded-lg border border-border bg-background px-3 font-normal outline-none focus:border-primary"
          required
        />
      </label>
      <p className="mt-2 text-sm text-muted">7–20 characters: digits, spaces, +, or -.</p>
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
