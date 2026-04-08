/**
 * Shelly 3EM service layer.
 *
 * Manages periodic polling of the Shelly device, persisting
 * power and energy readings to the database.
 * Singleton — one poller per process.
 */

import { getShellyReadings, type ShellyAggregated } from "./api";
import { db, ensureDb } from "../db/index";
import { sensorReadings } from "../db/schema";
import { getProviderSetting } from "../db/settings";

// ── Service status ────────────────────────────────────────────────

export type ShellyServiceStatus = {
  configured: boolean;
  host: string | null;
  polling: boolean;
  lastReading: ShellyAggregated | null;
  lastSyncAt: string | null;
  error: string | null;
};

// ── Singleton service ─────────────────────────────────────────────

const POLL_INTERVAL_MS = 60_000; // 1 minute

class ShellyService {
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private lastReading: ShellyAggregated | null = null;
  private lastSyncAt: string | null = null;
  private lastError: string | null = null;

  /** Get current service status without triggering any connections. */
  async getStatus(): Promise<ShellyServiceStatus> {
    const setting = await getProviderSetting("shelly");
    const config = setting.config as { host?: string };
    return {
      configured: setting.enabled && Boolean(config.host),
      host: config.host ?? null,
      polling: this.pollTimer !== null,
      lastReading: this.lastReading,
      lastSyncAt: this.lastSyncAt,
      error: this.lastError,
    };
  }

  /** Resolve the Shelly host from DB settings or SHELLY_HOST env var. */
  private async resolveHost(): Promise<string> {
    const setting = await getProviderSetting("shelly");
    const config = setting.config as { host?: string };

    if (setting.enabled && config.host) {
      return config.host.replace(/\/+$/, "");
    }

    // Fall back to environment variable
    const envHost = process.env.SHELLY_HOST;
    if (envHost) {
      return envHost.replace(/\/+$/, "");
    }

    throw new Error("Shelly not configured — set host in settings or SHELLY_HOST env var");
  }

  /** Fetch current readings from the Shelly device and persist to DB. */
  async syncOnce(): Promise<ShellyAggregated> {
    const host = await this.resolveHost();
    this.lastError = null;

    try {
      const reading = await getShellyReadings(host);
      this.lastReading = reading;
      this.lastSyncAt = new Date().toISOString();
      await this.persistReading(reading);
      return reading;
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      throw err;
    }
  }

  /** Start periodic polling. Idempotent — calling twice does nothing. */
  async startPolling(): Promise<void> {
    if (this.pollTimer) return;

    // Do an initial sync
    try {
      await this.syncOnce();
    } catch (err) {
      console.error("[Shelly] Initial sync failed:", err instanceof Error ? err.message : err);
    }

    this.pollTimer = setInterval(async () => {
      try {
        await this.syncOnce();
      } catch (err) {
        console.error("[Shelly] Poll failed:", err instanceof Error ? err.message : err);
      }
    }, POLL_INTERVAL_MS);
    console.log("[Shelly] Polling started (every 60s)");
  }

  /** Stop polling. */
  stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
      console.log("[Shelly] Polling stopped");
    }
  }

  /** Persist a reading as sensor_readings rows. */
  private async persistReading(reading: ShellyAggregated): Promise<void> {
    await ensureDb();
    const now = new Date().toISOString();

    await db
      .insert(sensorReadings)
      .values([
        {
          source: "shelly",
          metric: "power_w",
          value: reading.totalPowerW,
          unit: "W",
          timestamp: now,
        },
        {
          source: "shelly",
          metric: "energy_kwh",
          value: reading.totalEnergyKwh,
          unit: "kWh",
          timestamp: now,
        },
      ])
      .run();
  }
}

// Global singleton
export const shellyService = new ShellyService();
