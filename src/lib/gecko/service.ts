/**
 * Gecko in.Touch 2 service layer.
 *
 * Manages the full lifecycle: OAuth tokens, MQTT connection,
 * state polling, and persisting readings to the database.
 * Singleton — one connection per process.
 */

import {
  refreshAccessToken,
  getUserInfo,
  getAccount,
  getVessels,
  getMqttSession,
  type GeckoTokens,
  type GeckoVessel,
} from "./api";
import { GeckoMqttClient, type GeckoSpaState, type GeckoSpaConfig } from "./mqtt";
import { db, ensureDb } from "../db/index";
import { sensorReadings } from "../db/schema";
import { getProviderSetting, upsertProviderSetting } from "../db/settings";

// ── Stored config shape ───────────────────────────────────────────

export type GeckoStoredConfig = {
  accessToken?: string;
  refreshToken?: string;
  tokenExpiresAt?: string; // ISO 8601
  userId?: string;
  accountId?: string;
  vesselId?: string;
  vesselName?: string;
  monitorId?: string;
  // Legacy fields (ignored but kept for backwards compat)
  apiUrl?: string;
  apiKey?: string;
};

// ── Service status ────────────────────────────────────────────────

export type GeckoServiceStatus = {
  authenticated: boolean;
  connected: boolean;
  vesselName: string | null;
  monitorId: string | null;
  lastState: GeckoSpaState | null;
  lastConfig: GeckoSpaConfig | null;
  error: string | null;
};

// ── Singleton service ─────────────────────────────────────────────

class GeckoService {
  private mqttClient: GeckoMqttClient | null = null;
  private lastState: GeckoSpaState | null = null;
  private lastConfig: GeckoSpaConfig | null = null;
  private lastError: string | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  /** Get current service status without triggering any connections. */
  async getStatus(): Promise<GeckoServiceStatus> {
    const setting = await getProviderSetting("gecko");
    const config = setting.config as unknown as GeckoStoredConfig;
    return {
      authenticated: Boolean(config.refreshToken),
      connected: this.mqttClient?.isConnected() ?? false,
      vesselName: config.vesselName ?? null,
      monitorId: config.monitorId ?? null,
      lastState: this.lastState,
      lastConfig: this.lastConfig,
      error: this.lastError,
    };
  }

  /** Store OAuth tokens after successful auth callback. */
  async saveTokens(tokens: GeckoTokens): Promise<void> {
    const setting = await getProviderSetting("gecko");
    const existing = (setting.config ?? {}) as unknown as GeckoStoredConfig;
    const expiresAt = new Date(
      Date.now() + tokens.expires_in * 1000
    ).toISOString();

    await upsertProviderSetting("gecko", true, {
      ...existing,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? existing.refreshToken,
      tokenExpiresAt: expiresAt,
    } as unknown as Record<string, string>);
  }

  /** Ensure we have a valid access token, refreshing if needed. */
  private async ensureValidToken(): Promise<string> {
    const setting = await getProviderSetting("gecko");
    const config = setting.config as unknown as GeckoStoredConfig;

    if (!config.refreshToken) {
      throw new Error("Not authenticated — please log in via Gecko OAuth");
    }

    // Check if token is still valid (with 60s buffer)
    if (
      config.accessToken &&
      config.tokenExpiresAt &&
      new Date(config.tokenExpiresAt).getTime() > Date.now() + 60_000
    ) {
      return config.accessToken;
    }

    // Refresh the token
    const tokens = await refreshAccessToken(config.refreshToken);
    await this.saveTokens(tokens);
    return tokens.access_token;
  }

  /** Discover account and vessel info, storing them in config. */
  async discoverVessels(): Promise<GeckoVessel[]> {
    const accessToken = await this.ensureValidToken();

    const userInfo = await getUserInfo(accessToken);
    const account = await getAccount(userInfo.sub, accessToken);
    const vessels = await getVessels(account.accountId, accessToken);

    // Store account info
    const setting = await getProviderSetting("gecko");
    const existing = (setting.config ?? {}) as unknown as GeckoStoredConfig;
    await upsertProviderSetting("gecko", true, {
      ...existing,
      userId: userInfo.sub,
      accountId: account.accountId,
    } as unknown as Record<string, string>);

    // If there's exactly one vessel, auto-select it
    if (vessels.length === 1) {
      await this.selectVessel(vessels[0]);
    }

    return vessels;
  }

  /** Select which vessel/monitor to connect to. */
  async selectVessel(vessel: GeckoVessel): Promise<void> {
    const setting = await getProviderSetting("gecko");
    const existing = (setting.config ?? {}) as unknown as GeckoStoredConfig;
    await upsertProviderSetting("gecko", true, {
      ...existing,
      vesselId: vessel.vesselId,
      vesselName: vessel.name,
      monitorId: vessel.monitorId,
    } as unknown as Record<string, string>);
  }

  /** Connect to the spa via MQTT and start receiving updates. */
  async connect(): Promise<void> {
    this.lastError = null;

    const setting = await getProviderSetting("gecko");
    const config = setting.config as unknown as GeckoStoredConfig;

    if (!config.monitorId) {
      // Try to discover vessels first
      await this.discoverVessels();
      const refreshedSetting = await getProviderSetting("gecko");
      const refreshedConfig = refreshedSetting.config as unknown as GeckoStoredConfig;
      if (!refreshedConfig.monitorId) {
        throw new Error("No vessel/monitor selected — run vessel discovery first");
      }
    }

    const accessToken = await this.ensureValidToken();
    const updatedSetting = await getProviderSetting("gecko");
    const updatedConfig = updatedSetting.config as unknown as GeckoStoredConfig;
    const monitorId = updatedConfig.monitorId!;

    // Get MQTT session URL
    const session = await getMqttSession(monitorId, accessToken);

    // Disconnect existing client if any
    this.disconnect();

    // Create new MQTT client
    this.mqttClient = new GeckoMqttClient(monitorId, {
      onStateUpdate: (state) => {
        this.lastState = state;
        this.persistState(state).catch((err) =>
          console.error("[Gecko] Failed to persist state:", err)
        );
      },
      onConfigUpdate: (cfg) => {
        this.lastConfig = cfg;
      },
      onConnected: () => {
        this.lastError = null;
        console.log("[Gecko] MQTT connected to", monitorId);
      },
      onDisconnected: (reason) => {
        console.log("[Gecko] MQTT disconnected:", reason);
        this.scheduleReconnect();
      },
      onError: (err) => {
        this.lastError = err.message;
        console.error("[Gecko] MQTT error:", err.message);
      },
    });

    await this.mqttClient.connect(session.brokerUrl);

    // Request initial config + state
    this.mqttClient.requestFullUpdate();

    // Poll for state every 60 seconds as a fallback
    this.pollTimer = setInterval(() => {
      if (this.mqttClient?.isConnected()) {
        this.mqttClient.requestState();
      }
    }, 60_000);
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      try {
        await this.connect();
      } catch (err) {
        this.lastError = err instanceof Error ? err.message : String(err);
        console.error("[Gecko] Reconnect failed:", this.lastError);
        // Try again in 30s
        this.scheduleReconnect();
      }
    }, 30_000);
  }

  /** Persist the latest state as sensor readings in the database. */
  private async persistState(state: GeckoSpaState): Promise<void> {
    await ensureDb();
    const now = state.lastUpdated;

    const readings: {
      source: string;
      metric: string;
      value: number;
      unit: string;
      timestamp: string;
    }[] = [];

    // Temperature from first zone
    const tempZone = state.temperatureZones[0];
    if (tempZone?.temperature != null) {
      readings.push({
        source: "gecko",
        metric: "temperature",
        value: tempZone.temperature,
        unit: "°C",
        timestamp: now,
      });
    }

    // Set point from first zone
    if (tempZone?.setPoint != null) {
      readings.push({
        source: "gecko",
        metric: "set_point",
        value: tempZone.setPoint,
        unit: "°C",
        timestamp: now,
      });
    }

    // Heating status from first zone
    if (tempZone) {
      readings.push({
        source: "gecko",
        metric: "heating_status",
        value: tempZone.status,
        unit: "",
        timestamp: now,
      });
    }

    // Pump status — 1 if any flow zone is active, 0 otherwise
    const anyPumpActive = state.flowZones.some((f) => f.active);
    readings.push({
      source: "gecko",
      metric: "pump_status",
      value: anyPumpActive ? 1 : 0,
      unit: "",
      timestamp: now,
    });

    if (readings.length > 0) {
      await db.insert(sensorReadings).values(readings).run();
    }
  }

  /** Do a one-shot sync: connect, get state, persist, disconnect. */
  async syncOnce(): Promise<GeckoSpaState> {
    if (this.mqttClient?.isConnected() && this.lastState) {
      // Already connected — just request fresh state
      this.mqttClient.requestState();
      // Wait a moment for response
      await new Promise((r) => setTimeout(r, 3000));
      if (this.lastState) return this.lastState;
    }

    // Not connected — do a quick connect/disconnect cycle
    await this.connect();
    // Wait for config + state
    await new Promise((r) => setTimeout(r, 5000));

    if (!this.lastState) {
      throw new Error("Failed to receive spa state within timeout");
    }
    return this.lastState;
  }

  /** Send a command to change spa temperature. */
  async setTemperature(zoneId: string, setPoint: number): Promise<void> {
    if (!this.mqttClient?.isConnected()) {
      throw new Error("Not connected to spa");
    }
    this.mqttClient.setTemperature(zoneId, setPoint);
  }

  /** Send a command to toggle a pump. */
  async setPumpActive(zoneId: string, active: boolean): Promise<void> {
    if (!this.mqttClient?.isConnected()) {
      throw new Error("Not connected to spa");
    }
    this.mqttClient.setPumpActive(zoneId, active);
  }

  /** Disconnect from MQTT and stop polling. */
  disconnect() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.mqttClient) {
      this.mqttClient.disconnect();
      this.mqttClient = null;
    }
  }
}

// Global singleton
export const geckoService = new GeckoService();
