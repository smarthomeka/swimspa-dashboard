/**
 * Labcom PoolLab service layer.
 *
 * Manages periodic polling of the Labcom GraphQL API, persisting
 * water quality readings (pH, Bromine, Alkalinity) to the database.
 * Singleton -- one poller per process.
 */

import {
  getMeasurements,
  getAccount,
  normalizeMeasurements,
  type NormalizedReading,
  type LabcomAccount,
} from "./api";
import { db, ensureDb } from "../db/index";
import { sensorReadings } from "../db/schema";
import { getProviderSetting } from "../db/settings";

export type LabcomServiceStatus = {
  configured: boolean;
  apiUrl: string | null;
  polling: boolean;
  account: LabcomAccount | null;
  lastReadings: NormalizedReading[] | null;
  lastSyncAt: string | null;
  error: string | null;
};

// Poll every 15 minutes — PoolLab readings are manual (user takes a measurement),
// so they don't change as frequently as Shelly power data.
const POLL_INTERVAL_MS = 15 * 60_000;

class LabcomService {
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private account: LabcomAccount | null = null;
  private lastReadings: NormalizedReading[] | null = null;
  private lastSyncAt: string | null = null;
  private lastError: string | null = null;
  private lastMaxTimestamp: number | null = null;

  async getStatus(): Promise<LabcomServiceStatus> {
    const setting = await getProviderSetting("labcom");
    const config = setting.config as { apiUrl?: string; apiKey?: string };
    return {
      configured: setting.enabled && Boolean(config.apiUrl) && Boolean(config.apiKey),
      apiUrl: config.apiUrl ?? null,
      polling: this.pollTimer !== null,
      account: this.account,
      lastReadings: this.lastReadings,
      lastSyncAt: this.lastSyncAt,
      error: this.lastError,
    };
  }

  private async resolveConfig(): Promise<{ apiUrl: string; apiKey: string }> {
    const setting = await getProviderSetting("labcom");
    const config = setting.config as { apiUrl?: string; apiKey?: string };

    if (setting.enabled && config.apiUrl && config.apiKey) {
      return { apiUrl: config.apiUrl, apiKey: config.apiKey };
    }

    // Fall back to env vars
    const apiUrl = process.env.LABCOM_API_URL;
    const apiKey = process.env.LABCOM_API_KEY;
    if (apiUrl && apiKey) {
      return { apiUrl, apiKey };
    }

    throw new Error(
      "Labcom not configured -- set API URL and Key in settings or LABCOM_API_URL/LABCOM_API_KEY env vars"
    );
  }

  async syncOnce(): Promise<NormalizedReading[]> {
    const { apiUrl, apiKey } = await this.resolveConfig();
    this.lastError = null;

    try {
      // Validate credentials on first sync
      if (!this.account) {
        this.account = await getAccount(apiUrl, apiKey);
      }

      // Fetch measurements (incremental if we have a previous timestamp)
      const raw = await getMeasurements(
        apiUrl,
        apiKey,
        this.lastMaxTimestamp ?? undefined
      );

      const readings = normalizeMeasurements(raw);
      this.lastReadings = readings;
      this.lastSyncAt = new Date().toISOString();

      // Track the max timestamp for incremental fetches
      if (raw.length > 0) {
        const maxTs = Math.max(...raw.map((m) => m.timestamp));
        this.lastMaxTimestamp = maxTs;
      }

      // Persist new readings
      if (readings.length > 0) {
        await this.persistReadings(readings);
      }

      return readings;
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      throw err;
    }
  }

  async startPolling(): Promise<void> {
    if (this.pollTimer) return;

    try {
      await this.syncOnce();
    } catch (err) {
      console.error("[Labcom] Initial sync failed:", err instanceof Error ? err.message : err);
    }

    this.pollTimer = setInterval(async () => {
      try {
        await this.syncOnce();
      } catch (err) {
        console.error("[Labcom] Poll failed:", err instanceof Error ? err.message : err);
      }
    }, POLL_INTERVAL_MS);
    console.log("[Labcom] Polling started (every 15min)");
  }

  stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
      console.log("[Labcom] Polling stopped");
    }
  }

  private async persistReadings(readings: NormalizedReading[]): Promise<void> {
    await ensureDb();

    const values = readings.map((r) => ({
      source: "labcom" as const,
      metric: r.metric,
      value: r.value,
      unit: r.unit,
      timestamp: r.timestamp,
    }));

    await db.insert(sensorReadings).values(values).run();
  }
}

export const labcomService = new LabcomService();
