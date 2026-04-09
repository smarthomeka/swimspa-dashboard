import { NextRequest } from "next/server";
import { db, ensureDb } from "@/lib/db";
import { apiSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export type Tariff = {
  name: string;
  pricePerKwh: number;
  startHour: number;
  endHour: number;
};

export type TariffConfig = {
  tariffs: Tariff[];
};

const SETTINGS_KEY = "tariffs";

const DEFAULT_CONFIG: TariffConfig = {
  tariffs: [
    { name: "Hochtarif (HT)", pricePerKwh: 0.35, startHour: 6, endHour: 22 },
    { name: "Niedertarif (NT)", pricePerKwh: 0.25, startHour: 22, endHour: 6 },
  ],
};

async function getTariffConfig(): Promise<TariffConfig> {
  await ensureDb();
  const row = await db
    .select()
    .from(apiSettings)
    .where(eq(apiSettings.provider, SETTINGS_KEY))
    .get();
  if (!row || row.enabled === 0) return DEFAULT_CONFIG;
  try {
    const parsed = JSON.parse(row.config) as TariffConfig;
    if (!parsed.tariffs?.length) return DEFAULT_CONFIG;
    return parsed;
  } catch {
    return DEFAULT_CONFIG;
  }
}

export async function GET() {
  return Response.json(await getTariffConfig());
}

export async function PUT(request: NextRequest) {
  const body = (await request.json()) as TariffConfig;

  if (!Array.isArray(body.tariffs) || body.tariffs.length === 0) {
    return Response.json(
      { error: "Mindestens ein Tarif muss konfiguriert sein." },
      { status: 400 }
    );
  }

  for (const t of body.tariffs) {
    if (!t.name || typeof t.pricePerKwh !== "number" || t.pricePerKwh < 0) {
      return Response.json(
        { error: `Ungültiger Tarif: "${t.name}"` },
        { status: 400 }
      );
    }
    if (
      typeof t.startHour !== "number" ||
      typeof t.endHour !== "number" ||
      t.startHour < 0 ||
      t.startHour > 23 ||
      t.endHour < 0 ||
      t.endHour > 23
    ) {
      return Response.json(
        { error: `Ungültige Zeitfenster für "${t.name}"` },
        { status: 400 }
      );
    }
  }

  await ensureDb();
  const now = new Date().toISOString();
  const configJson = JSON.stringify({ tariffs: body.tariffs });

  const existing = await db
    .select()
    .from(apiSettings)
    .where(eq(apiSettings.provider, SETTINGS_KEY))
    .get();

  if (existing) {
    await db
      .update(apiSettings)
      .set({ enabled: 1, config: configJson, updatedAt: now })
      .where(eq(apiSettings.provider, SETTINGS_KEY))
      .run();
  } else {
    await db
      .insert(apiSettings)
      .values({ provider: SETTINGS_KEY, enabled: 1, config: configJson, updatedAt: now })
      .run();
  }

  return Response.json({ ok: true });
}
