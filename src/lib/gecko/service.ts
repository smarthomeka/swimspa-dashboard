/**
 * Gecko in.Touch 2 service layer.
 *
 * Manages periodic polling of the Gecko spa via its local network IP,
 * persisting temperature and pump readings to the database.
 * Singleton — one poller per process.
 *
 * Communication uses a pure TypeScript UDP client (port 10022) —
 * no cloud services, no OAuth, no Python.
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

const DEFAULT_POLL_INTERVAL_MS = 15_000; // 15 seconds

class GeckoService {
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private currentIntervalMs: number = DEFAULT_POLL_INTERVAL_MS;
  private lastReading: GeckoSpaReading | null = null;
  private lastSyncAt: string | null = null;
  private lastError: string | null = null;

  /** Get current service status without triggering any connections. */
  async getStatus(): Promise<GeckoServiceStatus & { pollIntervalMs: number }> {
    const setting = await getProviderSetting("gecko");
    const config = setting.config as unknown as GeckoStoredConfig;
    return {
      configured: setting.enabled && Boolean(config.host),
      host: config.host ?? null,
      polling: this.pollTimer !== null,
      pollIntervalMs: this.currentIntervalMs,
      spaName: config.spaName ?? this.lastReading?.spaName ?? null,
      lastReading: this.lastReading,
      lastSyncAt: this.lastSyncAt,
      error: this.lastError,
    };
  }

  /** Read the poll interval from spa settings (seconds → ms). */
  private async getConfiguredInterval(): Promise<number> {
    const spaSetting = await getProviderSetting("spa");
    const seconds = parseInt(spaSetting.config.pollInterval || "15", 10);
    return seconds > 0 ? seconds * 1000 : DEFAULT_POLL_INTERVAL_MS;
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

    this.currentIntervalMs = await this.getConfiguredInterval();

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
    }, this.currentIntervalMs);
    console.log(`[Gecko] Polling started (every ${this.currentIntervalMs / 1000}s)`);
  }

  /** Restart polling with updated interval from settings. */
  async restartPolling(): Promise<void> {
    const wasPolling = this.pollTimer !== null;
    this.stopPolling();
    if (wasPolling) {
      await this.startPolling();
    }
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

    // Pump status — 1 if any pump is active, 0 otherwise (legacy aggregate)
    const anyPumpActive = reading.pumps.some((p) => p.active);
    rows.push({
      source: "gecko",
      metric: "pump_status",
      value: anyPumpActive ? 1 : 0,
      unit: "",
      timestamp: now,
    });

    // Individual pumps (P1–P5) with mode as numeric: 0=OFF, 1=LOW, 2=HIGH
    for (const pump of reading.pumps) {
      let modeValue = 0;
      if (pump.mode === "LOW") modeValue = 1;
      else if (pump.mode === "HIGH") modeValue = 2;
      else if (pump.active) modeValue = 2; // fallback if active but unknown mode
      rows.push({
        source: "gecko",
        metric: `pump_${pump.id.toLowerCase()}`,
        value: modeValue,
        unit: "",
        timestamp: now,
      });
    }

    // Circulation pump
    if (reading.circulationPump != null) {
      rows.push({
        source: "gecko",
        metric: "circulation_pump",
        value: reading.circulationPump.active ? 1 : 0,
        unit: "",
        timestamp: now,
      });
    }

    // Blower
    if (reading.blower != null) {
      rows.push({
        source: "gecko",
        metric: "blower",
        value: reading.blower.active ? 1 : 0,
        unit: "",
        timestamp: now,
      });
    }

    // Ozone
    if (reading.ozone != null) {
      rows.push({
        source: "gecko",
        metric: "ozone",
        value: reading.ozone.active ? 1 : 0,
        unit: "",
        timestamp: now,
      });
    }

    // Waterfall
    if (reading.waterfall != null) {
      rows.push({
        source: "gecko",
        metric: "waterfall",
        value: reading.waterfall.active ? 1 : 0,
        unit: "",
        timestamp: now,
      });
    }

    // Economy mode
    rows.push({
      source: "gecko",
      metric: "econ_active",
      value: reading.econActive ? 1 : 0,
      unit: "",
      timestamp: now,
    });

    // Heaters
    if (reading.masterHeater != null) {
      rows.push({
        source: "gecko",
        metric: "master_heater",
        value: reading.masterHeater.active ? 1 : 0,
        unit: "",
        timestamp: now,
      });
    }

    if (rows.length > 0) {
      await db.insert(sensorReadings).values(rows).run();
    }
  }
}

// Global singleton
export const geckoService = new GeckoService();
