"use client";

import { PaymentPhoneForm } from "@/components/payment-phone-form";
import { SettingsForm } from "@/components/settings-form";
import { useDirectory } from "@/components/use-directory";
import { getSettings } from "@/lib/data";

export default function SettingsPage() {
  const { directory, error } = useDirectory();
  const settings = directory ? getSettings(directory) : null;

  return (
    <div>
      <h1 className="text-2xl font-semibold">Settings</h1>
      <p className="mt-1 text-sm text-muted">
        Platform defaults used by brokers when creating loads.
      </p>
      {error && !directory ? <p className="mt-6 text-sm text-muted">{error}</p> : null}
      {!directory && !error ? <p className="mt-6 text-sm text-muted">Loading…</p> : null}
      {settings ? (
        <>
          <SettingsForm
            key={`${settings.freeLoadLimit}-${settings.basePrice}-${settings.pricePerKm}`}
            freeLoadLimit={settings.freeLoadLimit}
            basePrice={settings.basePrice}
            pricePerKm={settings.pricePerKm}
          />
          <PaymentPhoneForm key={settings.paymentPhone} phoneNumber={settings.paymentPhone} />
        </>
      ) : null}
    </div>
  );
}
