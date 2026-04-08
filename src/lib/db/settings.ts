import { db, ensureDb } from "./index";
import { apiSettings } from "./schema";
import { eq } from "drizzle-orm";

export type ProviderConfig = {
  gecko: Record<string, string>; // OAuth tokens + vessel info — managed by gecko service
  labcom: { apiUrl: string; apiKey: string };
  shelly: { host: string };
  blueconnect: { apiUrl: string; apiKey: string };
};

export type Provider = keyof ProviderConfig;

const PROVIDERS: Provider[] = ["gecko", "labcom", "shelly", "blueconnect"];

export async function getAllSettings() {
  await ensureDb();
  const rows = await db.select().from(apiSettings).all();
  const map: Record<string, { enabled: boolean; config: Record<string, string> }> = {};
  for (const row of rows) {
    map[row.provider] = {
      enabled: row.enabled === 1,
      config: JSON.parse(row.config),
    };
  }
  // Fill in defaults for providers not yet in DB
  for (const p of PROVIDERS) {
    if (!map[p]) {
      map[p] = { enabled: false, config: {} };
    }
  }
  return map;
}

export async function getProviderSetting(provider: Provider) {
  await ensureDb();
  const row = await db
    .select()
    .from(apiSettings)
    .where(eq(apiSettings.provider, provider))
    .get();
  if (!row) return { enabled: false, config: {} as Record<string, string> };
  return {
    enabled: row.enabled === 1,
    config: JSON.parse(row.config) as Record<string, string>,
  };
}

export async function isProviderConfigured(provider: Provider): Promise<boolean> {
  const s = await getProviderSetting(provider);
  if (!s.enabled) return false;
  const values = Object.values(s.config);
  return values.length > 0 && values.some((v) => v.trim() !== "");
}

export async function upsertProviderSetting(
  provider: Provider,
  enabled: boolean,
  config: Record<string, string>
) {
  await ensureDb();
  const now = new Date().toISOString();
  const existing = await db
    .select()
    .from(apiSettings)
    .where(eq(apiSettings.provider, provider))
    .get();

  if (existing) {
    await db.update(apiSettings)
      .set({
        enabled: enabled ? 1 : 0,
        config: JSON.stringify(config),
        updatedAt: now,
      })
      .where(eq(apiSettings.provider, provider))
      .run();
  } else {
    await db.insert(apiSettings)
      .values({
        provider,
        enabled: enabled ? 1 : 0,
        config: JSON.stringify(config),
        updatedAt: now,
      })
      .run();
  }
}
