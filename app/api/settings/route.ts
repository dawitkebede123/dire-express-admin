import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

const DEFAULT_FREE_LOAD_LIMIT = 3;
const DEFAULT_BASE_PRICE = 50;
const DEFAULT_PRICE_PER_KM = 1;

const updateSchema = z.object({
  freeLoadLimit: z.number().int().min(1).max(1000),
  basePrice: z.number().min(0).max(100_000),
  pricePerKm: z.number().min(0).max(1_000),
});

function serializeSettings(settings: {
  freeLoadLimit: number;
  basePrice: unknown;
  pricePerKm: unknown;
}) {
  return {
    freeLoadLimit: settings.freeLoadLimit,
    basePrice: Number(settings.basePrice),
    pricePerKm: Number(settings.pricePerKm),
  };
}

async function getOrCreateSettings() {
  return db.appSettings.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      freeLoadLimit: DEFAULT_FREE_LOAD_LIMIT,
      basePrice: DEFAULT_BASE_PRICE,
      pricePerKm: DEFAULT_PRICE_PER_KM,
    },
  });
}

export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const settings = await getOrCreateSettings();
  return NextResponse.json(serializeSettings(settings));
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = updateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const settings = await db.appSettings.upsert({
    where: { id: "default" },
    update: {
      freeLoadLimit: parsed.data.freeLoadLimit,
      basePrice: parsed.data.basePrice,
      pricePerKm: parsed.data.pricePerKm,
    },
    create: {
      id: "default",
      freeLoadLimit: parsed.data.freeLoadLimit,
      basePrice: parsed.data.basePrice,
      pricePerKm: parsed.data.pricePerKm,
    },
  });

  return NextResponse.json(serializeSettings(settings));
}
