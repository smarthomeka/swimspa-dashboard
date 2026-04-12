/**
 * Gecko in.Touch 2 local API client.
 *
 * Connects to the Gecko spa controller via its local network IP address
 * using a pure TypeScript UDP client (geckolib protocol on port 10022).
 * No cloud services, no OAuth, no Python — pure local network communication.
 */

import {
  readSpaState as udpReadSpaState,
  discoverSpas as udpDiscoverSpas,
  type SpaReading,
  type DiscoveredSpa,
} from "./gecko-client";

// ── Types ────────────────────────────────────────────────────────

export type GeckoPumpState = {
  id: string;
  active: boolean;
  mode: string | null;
};

export type GeckoLightState = {
  id: string;
  active: boolean;
};

export type GeckoReminder = {
  type: string;
  daysRemaining: number;
};

export type GeckoSpaReading = {
  spaName: string;
  spaId: string;
  temperature: number | null;
  setPoint: number | null;
  heatingStatus: string | null; // "Heating" | "Cooling" | "Idle" | null
  minTemp: number | null;
  maxTemp: number | null;
  tempUnit: string | null;
  pumps: GeckoPumpState[];
  circulationPump: { active: boolean } | null;
  blower: { active: boolean } | null;
  ozone: { active: boolean } | null;
  waterfall: { active: boolean } | null;
  lights: GeckoLightState[];
  econActive: boolean;
  quietState: string | null;
  lockMode: string | null;
  masterHeater: { active: boolean } | null;
  slaveHeater: { active: boolean } | null;
  watercare: string | null;
  reminders: GeckoReminder[];
  errors: string[];
};

export type GeckoDiscoveredSpa = {
  spaId: string;
  spaName: string;
  address: string;
};

// ── Public API ───────────────────────────────────────────────────

/**
 * Discover Gecko spas on the local network via UDP broadcast.
 */
export async function discoverSpas(): Promise<GeckoDiscoveredSpa[]> {
  const results = await udpDiscoverSpas();
  return results.map((r) => ({
    spaId: r.spaId,
    spaName: r.spaName,
    address: r.address,
  }));
}

/**
 * Connect to a Gecko spa at the given IP and read its current state.
 */
export async function readSpaState(host: string): Promise<GeckoSpaReading> {
  const reading = await udpReadSpaState(host);
  return {
    spaName: reading.spaName,
    spaId: reading.spaId,
    temperature: reading.temperature,
    setPoint: reading.setPoint,
    heatingStatus: reading.heatingStatus,
    minTemp: reading.minTemp,
    maxTemp: reading.maxTemp,
    tempUnit: reading.tempUnit,
    pumps: reading.pumps,
    circulationPump: reading.circulationPump,
    blower: reading.blower,
    ozone: reading.ozone,
    waterfall: reading.waterfall,
    lights: reading.lights,
    econActive: reading.econActive,
    quietState: reading.quietState,
    lockMode: reading.lockMode,
    masterHeater: reading.masterHeater,
    slaveHeater: reading.slaveHeater,
    watercare: reading.watercare,
    reminders: reading.reminders,
    errors: reading.errors,
  };
}
