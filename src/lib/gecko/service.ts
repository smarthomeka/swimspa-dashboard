/**
 * Gecko in.Touch 2 service layer.
 *
 * Manages periodic polling of the Gecko spa via its local network IP,
 * persisting temperature and pump readings to the database.
 * Singleton — one poller per process.
 *
 * Communication uses the geckolib Python bridge (UDP port 10022) —
 * no cloud services, no OAuth.
 */

import { readSpaState, type GeckoSpaReading } from "./api";
import { db, ensureDb } from "../db/index";
import { sensorReadings } from "../db/schema";
import { getProviderSetting, upsertProviderSetting } from "../db/settings";

// ── Stored config shape ───────────────────────────────────────────

export type GeckoStoredConfig = {
  host?: string; // Local IP address of the Gecko in.Touch 2
  spaName?: string;
  spaId?: string;
};

// ── Service status ────────────────────────────────────────────────

export type GeckoServiceStatus = {
  configured: boolean;
  host: string | null;
  polling: boolean;
  spaName: string | null;
  lastReading: GeckoSpaReading | null;
  lastSyncAt: string | null;
  error: string | null;
};

// ── Singleton service ─────────────────────────────────────────────

const POLL_INTERVAL_MS = 60_000; // 1 minute

class GeckoService {
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private lastReading: GeckoSpaReading | null = null;
  private lastSyncAt: string | null = null;
  private lastError: string | null = null;

  /** Get current service status without triggering any connections. */
  async getStatus(): Promise<GeckoServiceStatus> {
    const setting = await getProviderSetting("gecko");
    const config = setting.config as unknown as GeckoStoredConfig;
    return {
      configured: setting.enabled && Boolean(config.host),
      host: config.host ?? null,
      polling: this.pollTimer !== null,
      spaName: config.spaName ?? this.lastReading?.spaName ?? null,
      lastReading: this.lastReading,
      lastSyncAt: this.lastSyncAt,
      error: this.lastError,
    };
  }

  /** Resolve the Gecko host from DB settings or GECKO_HOST env var. */
  private async resolveHost(): Promise<string> {
    const setting = await getProviderSetting("gecko");
    const config = setting.config as unknown as GeckoStoredConfig;

    if (setting.enabled && config.host) {
      return config.host.trim();
    }

    const envHost = process.env.GECKO_HOST;
    if (envHost) {
      return envHost.trim();
    }

    throw new Error(
      "Gecko nicht konfiguriert — IP-Adresse in den Einstellungen oder GECKO_HOST setzen"
    );
  }

  /** Save the spa host and optional discovery info to settings. */
  async saveHost(host: string, spaName?: string, spaId?: string): Promise<void> {
    const setting = await getProviderSetting("gecko");
    const existing = (setting.config ?? {}) as unknown as GeckoStoredConfig;
    await upsertProviderSetting("gecko", true, {
      ...existing,
      host,
      ...(spaName && { spaName }),
      ...(spaId && { spaId }),
    } as unknown as Record<string, string>);
  }

  /** Fetch current readings from the Gecko spa and persist to DB. */
  async syncOnce(): Promise<GeckoSpaReading> {
    const host = await this.resolveHost();
    this.lastError = null;

    try {
      const reading = await readSpaState(host);
      this.lastReading = reading;
      this.lastSyncAt = new Date().toISOString();

      // Update stored spa name if we learned it
      if (reading.spaName) {
        const setting = await getProviderSetting("gecko");
        const config = setting.config as unknown as GeckoStoredConfig;
        if (!config.spaName || config.spaName !== reading.spaName) {
          await this.saveHost(host, reading.spaName, reading.spaId);
        }
      }

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
      console.error(
        "[Gecko] Initial sync failed:",
        err instanceof Error ? err.message : err
      );
    }

    this.pollTimer = setInterval(async () => {
      try {
        await this.syncOnce();
      } catch (err) {
        console.error(
          "[Gecko] Poll failed:",
          err instanceof Error ? err.message : err
        );
      }
    }, POLL_INTERVAL_MS);
    console.log("[Gecko] Polling started (every 60s)");
  }

  /** Stop polling. */
  stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
      console.log("[Gecko] Polling stopped");
    }
  }

  /** Persist a reading as sensor_readings rows. */
  private async persistReading(reading: GeckoSpaReading): Promise<void> {
    await ensureDb();
    const now = new Date().toISOString();

    const rows: {
      source: string;
      metric: string;
      value: number;
      unit: string;
      timestamp: string;
    }[] = [];

    // Temperature
    if (reading.temperature != null) {
      rows.push({
        source: "gecko",
        metric: "temperature",
        value: reading.temperature,
        unit: "°C",
        timestamp: now,
      });
    }

    // Set point
    if (reading.setPoint != null) {
      rows.push({
        source: "gecko",
        metric: "set_point",
        value: reading.setPoint,
        unit: "°C",
        timestamp: now,
      });
    }

    // Heating status: map string to numeric (0=IDLE, 1=HEATING, 2=COOLING)
    if (reading.heatingStatus != null) {
      let statusValue = 0;
      if (reading.heatingStatus === "Heating") statusValue = 1;
      else if (reading.heatingStatus === "Cooling") statusValue = 2;
      rows.push({
        source: "gecko",
        metric: "heating_status",
        value: statusValue,
        unit: "",
        timestamp: now,
      });
    }

    // Pump status — 1 if any pump is active, 0 otherwise
    const anyPumpActive = reading.pumps.some((p) => p.active);
    rows.push({
      source: "gecko",
      metric: "pump_status",
      value: anyPumpActive ? 1 : 0,
      unit: "",
      timestamp: now,
    });

    if (rows.length > 0) {
      await db.insert(sensorReadings).values(rows).run();
    }
  }
}

// Global singleton
export const geckoService = new GeckoService();
