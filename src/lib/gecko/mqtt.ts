/**
 * Gecko in.Touch 2 MQTT client.
 *
 * Connects to the AWS IoT Core broker via WebSocket using the broker URL
 * obtained from the Gecko REST API. Uses AWS IoT Device Shadow topics
 * for spa configuration and real-time state updates.
 */

import mqtt from "mqtt";
import type { MqttClient } from "mqtt";

// ── Types ─────────────────────────────────────────────────────────

export type TemperatureZoneState = {
  zoneId: string;
  name?: string;
  temperature: number | null;
  setPoint: number | null;
  status: number; // 0=IDLE,1=HEATING,2=COOLING,...
  minSetPoint?: number;
  maxSetPoint?: number;
};

export type FlowZoneState = {
  zoneId: string;
  name?: string;
  active: boolean;
  speed: number | null;
  minSpeed?: number;
  maxSpeed?: number;
  speedStep?: number;
  initiator?: string;
};

export type LightingZoneState = {
  zoneId: string;
  name?: string;
  active: boolean;
  rgbi?: [number, number, number, number];
  effect?: string;
};

export type ConnectivityState = {
  gatewayStatus: string;
  vesselStatus: string;
};

export type GeckoSpaState = {
  temperatureZones: TemperatureZoneState[];
  flowZones: FlowZoneState[];
  lightingZones: LightingZoneState[];
  connectivity: ConnectivityState;
  lastUpdated: string;
};

export type GeckoSpaConfig = {
  temperatureZones: Record<
    string,
    { name: string; minSetPoint: number; maxSetPoint: number }
  >;
  flowZones: Record<
    string,
    { name: string; minSpeed: number; maxSpeed: number; speedStep: number }
  >;
  lightingZones: Record<string, { name: string }>;
};

export type GeckoMqttEvents = {
  onStateUpdate: (state: GeckoSpaState) => void;
  onConfigUpdate: (config: GeckoSpaConfig) => void;
  onConnected: () => void;
  onDisconnected: (reason?: string) => void;
  onError: (error: Error) => void;
};

// ── Topic builders ────────────────────────────────────────────────

function configGetTopic(monitorId: string) {
  return `$aws/things/${monitorId}/config/get`;
}
function configAcceptedTopic(monitorId: string) {
  return `$aws/things/${monitorId}/config/get/accepted`;
}
function stateGetTopic(monitorId: string) {
  return `$aws/things/${monitorId}/shadow/name/state/get`;
}
function stateAcceptedTopic(monitorId: string) {
  return `$aws/things/${monitorId}/shadow/name/state/get/accepted`;
}
function stateUpdateTopic(monitorId: string) {
  return `$aws/things/${monitorId}/shadow/name/state/update`;
}
function stateDocumentsTopic(monitorId: string) {
  return `$aws/things/${monitorId}/shadow/name/state/update/documents`;
}

// ── State parsers ─────────────────────────────────────────────────

function extractConfigValue(
  obj: Record<string, unknown>
): number | undefined {
  if (typeof obj === "number") return obj;
  if (obj && typeof obj === "object") {
    for (const key of ["value", "currentValue", "default", "initialValue", "minimum"]) {
      if (typeof obj[key] === "number") return obj[key] as number;
    }
  }
  return undefined;
}

function parseConfig(payload: Record<string, unknown>): GeckoSpaConfig | null {
  const cfg =
    (payload as Record<string, Record<string, unknown>>)?.configuration
      ?.configuration ??
    (payload as Record<string, unknown>)?.configuration;
  if (!cfg) return null;
  const zones = (cfg as Record<string, unknown>).zones as Record<string, Record<string, Record<string, unknown>>> | undefined;
  if (!zones) return null;

  const temperatureZones: GeckoSpaConfig["temperatureZones"] = {};
  if (zones.temperatureControl) {
    for (const [id, z] of Object.entries(zones.temperatureControl)) {
      temperatureZones[id] = {
        name: (z.name as string) ?? `Temperature ${id}`,
        minSetPoint: (z.minTemperatureSetPointC as number) ?? 26,
        maxSetPoint: (z.maxTemperatureSetPointC as number) ?? 40,
      };
    }
  }

  const flowZones: GeckoSpaConfig["flowZones"] = {};
  if (zones.flow) {
    for (const [id, z] of Object.entries(zones.flow)) {
      const speed = z.speed as Record<string, unknown> | undefined;
      flowZones[id] = {
        name: (z.name as string) ?? `Pump ${id}`,
        minSpeed: extractConfigValue(speed as Record<string, unknown>) ?? 0,
        maxSpeed: (speed?.maximum as number) ?? 100,
        speedStep: (speed?.stepIncrement as number) ?? 25,
      };
    }
  }

  const lightingZones: GeckoSpaConfig["lightingZones"] = {};
  if (zones.lighting) {
    for (const [id, z] of Object.entries(zones.lighting)) {
      lightingZones[id] = { name: (z.name as string) ?? `Light ${id}` };
    }
  }

  return { temperatureZones, flowZones, lightingZones };
}

function parseState(
  reported: Record<string, unknown>,
  config?: GeckoSpaConfig | null
): GeckoSpaState {
  const zones = reported.zones as Record<string, Record<string, Record<string, unknown>>> | undefined;
  const temperatureZones: TemperatureZoneState[] = [];
  const flowZones: FlowZoneState[] = [];
  const lightingZones: LightingZoneState[] = [];

  if (zones?.temperatureControl) {
    for (const [id, z] of Object.entries(zones.temperatureControl)) {
      const cfgZone = config?.temperatureZones?.[id];
      temperatureZones.push({
        zoneId: id,
        name: cfgZone?.name,
        temperature: (z.temperature_ as number) ?? null,
        setPoint: (z.setPoint as number) ?? null,
        status: (z.status_ as number) ?? 0,
        minSetPoint: cfgZone?.minSetPoint,
        maxSetPoint: cfgZone?.maxSetPoint,
      });
    }
  }

  if (zones?.flow) {
    for (const [id, z] of Object.entries(zones.flow)) {
      const cfgZone = config?.flowZones?.[id];
      flowZones.push({
        zoneId: id,
        name: cfgZone?.name,
        active: Boolean(z.active ?? z.isActive ?? z.running ?? z.enabled),
        speed: (z.speed as number) ?? (z.flowSpeed as number) ?? (z.pumpSpeed as number) ?? null,
        minSpeed: cfgZone?.minSpeed,
        maxSpeed: cfgZone?.maxSpeed,
        speedStep: cfgZone?.speedStep,
        initiator: z.initiator as string | undefined,
      });
    }
  }

  if (zones?.lighting) {
    for (const [id, z] of Object.entries(zones.lighting)) {
      lightingZones.push({
        zoneId: id,
        name: config?.lightingZones?.[id]?.name,
        active: Boolean(z.active),
        rgbi: z.rgbi as [number, number, number, number] | undefined,
        effect: z.effect as string | undefined,
      });
    }
  }

  const conn = reported.connectivity_ as Record<string, string> | undefined;
  const connectivity: ConnectivityState = {
    gatewayStatus: conn?.gatewayStatus ?? "UNKNOWN",
    vesselStatus: conn?.vesselStatus ?? "UNKNOWN",
  };

  return {
    temperatureZones,
    flowZones,
    lightingZones,
    connectivity,
    lastUpdated: new Date().toISOString(),
  };
}

// ── MQTT client class ─────────────────────────────────────────────

export class GeckoMqttClient {
  private client: MqttClient | null = null;
  private monitorId: string;
  private config: GeckoSpaConfig | null = null;
  private state: GeckoSpaState | null = null;
  private events: Partial<GeckoMqttEvents>;

  constructor(monitorId: string, events: Partial<GeckoMqttEvents> = {}) {
    this.monitorId = monitorId;
    this.events = events;
  }

  async connect(brokerUrl: string): Promise<void> {
    if (this.client) {
      this.disconnect();
    }

    // Parse the broker URL — mqtt.js can connect to wss:// directly
    const parsed = new URL(brokerUrl);
    const customAuthName = parsed.searchParams.get("x-amz-customauthorizer-name");
    const token = parsed.searchParams.get("token");
    const signature = parsed.searchParams.get("x-amz-customauthorizer-signature");

    // Build the connection URL with auth params in the path for AWS IoT
    const connectUrl = `wss://${parsed.host}/mqtt?${new URLSearchParams({
      ...(customAuthName && { "x-amz-customauthorizer-name": customAuthName }),
      ...(token && { token }),
      ...(signature && { "x-amz-customauthorizer-signature": signature }),
    })}`;

    this.client = mqtt.connect(connectUrl, {
      protocolVersion: 5,
      clean: true,
      keepalive: 30,
      clientId: `swimspa-${this.monitorId}-${Date.now().toString(36)}`,
      reconnectPeriod: 5000,
    });

    this.client.on("connect", () => {
      this.subscribeToTopics();
      this.events.onConnected?.();
    });

    this.client.on("message", (_topic: string, payload: Buffer) => {
      this.handleMessage(_topic, payload);
    });

    this.client.on("error", (err: Error) => {
      this.events.onError?.(err);
    });

    this.client.on("close", () => {
      this.events.onDisconnected?.("connection closed");
    });

    // Wait for initial connection
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("MQTT connection timeout")), 15000);
      this.client!.once("connect", () => {
        clearTimeout(timeout);
        resolve();
      });
      this.client!.once("error", (err: Error) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  private subscribeToTopics() {
    if (!this.client) return;
    const topics = [
      configAcceptedTopic(this.monitorId),
      stateAcceptedTopic(this.monitorId),
      stateDocumentsTopic(this.monitorId),
    ];
    this.client.subscribe(topics, { qos: 1 });
  }

  private handleMessage(topic: string, payload: Buffer) {
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(payload.toString());
    } catch {
      return;
    }

    if (topic === configAcceptedTopic(this.monitorId)) {
      this.config = parseConfig(data);
      if (this.config) {
        this.events.onConfigUpdate?.(this.config);
      }
      // After getting config, request state
      this.requestState();
    } else if (topic === stateAcceptedTopic(this.monitorId)) {
      const reported = (data.state as Record<string, unknown>)?.reported as Record<string, unknown>;
      if (reported) {
        this.state = parseState(reported, this.config);
        this.events.onStateUpdate?.(this.state);
      }
    } else if (topic === stateDocumentsTopic(this.monitorId)) {
      const current = data.current as Record<string, unknown> | undefined;
      const reported = (current?.state as Record<string, unknown>)?.reported as Record<string, unknown>;
      if (reported) {
        this.state = parseState(reported, this.config);
        this.events.onStateUpdate?.(this.state);
      }
    }
  }

  requestConfig() {
    this.client?.publish(configGetTopic(this.monitorId), "{}", { qos: 1 });
  }

  requestState() {
    this.client?.publish(stateGetTopic(this.monitorId), "{}", { qos: 1 });
  }

  /** Fetch config + state in sequence (config first, then state on config response). */
  requestFullUpdate() {
    this.requestConfig();
  }

  /** Send a desired-state command to the spa. */
  sendCommand(desiredState: Record<string, unknown>) {
    this.client?.publish(
      stateUpdateTopic(this.monitorId),
      JSON.stringify({ state: { desired: desiredState } }),
      { qos: 1 }
    );
  }

  setTemperature(zoneId: string, setPoint: number) {
    this.sendCommand({
      zones: { temperatureControl: { [zoneId]: { setPoint } } },
    });
  }

  setPumpActive(zoneId: string, active: boolean) {
    this.sendCommand({
      zones: { flow: { [zoneId]: { active } } },
    });
  }

  setLightActive(zoneId: string, active: boolean) {
    this.sendCommand({
      zones: { lighting: { [zoneId]: { active } } },
    });
  }

  getState(): GeckoSpaState | null {
    return this.state;
  }

  getConfig(): GeckoSpaConfig | null {
    return this.config;
  }

  isConnected(): boolean {
    return this.client?.connected ?? false;
  }

  disconnect() {
    this.client?.end(true);
    this.client = null;
  }
}
