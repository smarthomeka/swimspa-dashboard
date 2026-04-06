import { db } from "./index";
import { apiSettings } from "./schema";
import { eq } from "drizzle-orm";

export type ProviderConfig = {
  gecko: { apiUrl: string; apiKey: string };
  labcom: { apiUrl: string; apiKey: string };
  shelly: { host: string };
  blueconnect: { apiUrl: string; apiKey: string };
};

export type Provider = keyof ProviderConfig;

const PROVIDERS: Provider[] = ["gecko", "labcom", "shelly", "blueconnect"];

export function getAllSettings() {
  const rows = db.select().from(apiSettings).all();
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

export function getProviderSetting(provider: Provider) {
  const row = db
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

export function isProviderConfigured(provider: Provider): boolean {
  const s = getProviderSetting(provider);
  if (!s.enabled) return false;
  const values = Object.values(s.config);
  return values.length > 0 && values.some((v) => v.trim() !== "");
}

export function upsertProviderSetting(
  provider: Provider,
  enabled: boolean,
  config: Record<string, string>
) {
  const now = new Date().toISOString();
  const existing = db
    .select()
    .from(apiSettings)
    .where(eq(apiSettings.provider, provider))
    .get();

  if (existing) {
    db.update(apiSettings)
      .set({
        enabled: enabled ? 1 : 0,
        config: JSON.stringify(config),
        updatedAt: now,
      })
      .where(eq(apiSettings.provider, provider))
      .run();
  } else {
    db.insert(apiSettings)
      .values({
        provider,
        enabled: enabled ? 1 : 0,
        config: JSON.stringify(config),
        updatedAt: now,
      })
      .run();
  }
}
