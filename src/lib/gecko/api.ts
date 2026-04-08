/**
 * Gecko in.Touch 2 local API client.
 *
 * Connects to the Gecko spa controller via its local network IP address
 * using a Python bridge (geckolib UDP protocol on port 10022).
 * No cloud services, no OAuth — pure local network communication.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

const execFileAsync = promisify(execFile);

const BRIDGE_SCRIPT = path.join(process.cwd(), "scripts", "gecko_bridge.py");
const PYTHON = "python3";

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
  lights: GeckoLightState[];
  watercare: string | null;
};

export type GeckoDiscoveredSpa = {
  spaId: string;
  spaName: string;
  address: string;
};

// ── Bridge calls ─────────────────────────────────────────────────

/**
 * Run the Python bridge script and parse its JSON output.
 */
async function runBridge(args: string[]): Promise<Record<string, unknown>> {
  const { stdout, stderr } = await execFileAsync(PYTHON, [BRIDGE_SCRIPT, ...args], {
    timeout: 35_000,
    env: { ...process.env },
  });

  if (stderr) {
    console.warn("[Gecko] Bridge stderr:", stderr.trim());
  }

  const result = JSON.parse(stdout.trim());

  if (!result.ok) {
    throw new Error(result.error ?? "Bridge returned error");
  }

  return result;
}

/**
 * Discover Gecko spas on the local network via UDP broadcast.
 */
export async function discoverSpas(): Promise<GeckoDiscoveredSpa[]> {
  const result = await runBridge(["discover"]);
  return (result.spas as GeckoDiscoveredSpa[]) ?? [];
}

/**
 * Connect to a Gecko spa at the given IP and read its current state.
 */
export async function readSpaState(host: string): Promise<GeckoSpaReading> {
  const result = await runBridge([host]);
  return {
    spaName: (result.spaName as string) ?? "Unbekannt",
    spaId: (result.spaId as string) ?? "",
    temperature: (result.temperature as number) ?? null,
    setPoint: (result.setPoint as number) ?? null,
    heatingStatus: (result.heatingStatus as string) ?? null,
    minTemp: (result.minTemp as number) ?? null,
    maxTemp: (result.maxTemp as number) ?? null,
    tempUnit: (result.tempUnit as string) ?? null,
    pumps: (result.pumps as GeckoPumpState[]) ?? [],
    lights: (result.lights as GeckoLightState[]) ?? [],
    watercare: (result.watercare as string) ?? null,
  };
}
