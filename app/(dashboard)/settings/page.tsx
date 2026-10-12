import { db } from "@/lib/db";
import { SettingsForm } from "@/components/settings-form";

const DEFAULT_FREE_LOAD_LIMIT = 3;
const DEFAULT_BASE_PRICE = 50;
const DEFAULT_PRICE_PER_KM = 1;

export default async function SettingsPage() {
  const settings = await db.appSettings.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      freeLoadLimit: DEFAULT_FREE_LOAD_LIMIT,
      basePrice: DEFAULT_BASE_PRICE,
      pricePerKm: DEFAULT_PRICE_PER_KM,
    },
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold">Settings</h1>
      <p className="mt-1 text-sm text-muted">
        Platform defaults used by brokers when creating loads.
      </p>
      <SettingsForm
        freeLoadLimit={settings.freeLoadLimit}
        basePrice={Number(settings.basePrice)}
        pricePerKm={Number(settings.pricePerKm)}
      />
    </div>
  );
}
