import { getSettings } from "@/lib/data";
import { SettingsForm } from "@/components/settings-form";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const settings = await getSettings();

  return (
    <div>
      <h1 className="text-2xl font-semibold">Settings</h1>
      <p className="mt-1 text-sm text-muted">
        Platform defaults used by brokers when creating loads.
      </p>
      <SettingsForm
        freeLoadLimit={settings.freeLoadLimit}
        basePrice={settings.basePrice}
        pricePerKm={settings.pricePerKm}
      />
    </div>
  );
}
