/**
 * Shelly 3EM HTTP API client.
 *
 * The Shelly 3EM (Gen1) exposes a local REST API.
 * Main endpoint: GET /status — returns full device status
 * including per-phase emeter data (power, voltage, energy totals).
 */

export type ShellyEmeterPhase = {
  power: number; // current watts
  pf: number; // power factor
  current: number; // amps
  voltage: number; // volts
  is_valid: boolean;
  total: number; // total energy in Wh
  total_returned: number; // returned energy in Wh
};

export type ShellyStatus = {
  wifi_sta: { connected: boolean; ssid: string; ip: string };
  cloud: { enabled: boolean; connected: boolean };
  mqtt: { connected: boolean };
  time: string;
  unixtime: number;
  serial: number;
  has_update: boolean;
  mac: string;
  cfg_changed_cnt: number;
  actions_stats: { skipped: number };
  emeters: ShellyEmeterPhase[];
  total_power: number; // sum of all phases in watts
  fs_mounted: boolean;
  uptime: number;
};

export type ShellyAggregated = {
  totalPowerW: number;
  totalEnergyKwh: number;
  phases: ShellyEmeterPhase[];
  deviceTime: string;
  uptime: number;
};

/**
 * Fetch the full status from a Shelly 3EM device.
 * @param host - Base URL of the device, e.g. "http://10.10.20.241"
 */
export async function getShellyStatus(host: string): Promise<ShellyStatus> {
  const url = `${host.replace(/\/+$/, "")}/status`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new Error(`Shelly status request failed (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

/**
 * Fetch and aggregate emeter data from a Shelly 3EM.
 * Sums power across all 3 phases and converts energy from Wh to kWh.
 */
export async function getShellyReadings(host: string): Promise<ShellyAggregated> {
  const status = await getShellyStatus(host);

  const totalPowerW = status.emeters.reduce(
    (sum, phase) => sum + (phase.is_valid ? phase.power : 0),
    0
  );

  const totalEnergyWh = status.emeters.reduce(
    (sum, phase) => sum + (phase.is_valid ? phase.total : 0),
    0
  );

  return {
    totalPowerW: Math.round(totalPowerW * 100) / 100,
    totalEnergyKwh: Math.round((totalEnergyWh / 1000) * 1000) / 1000,
    phases: status.emeters,
    deviceTime: status.time,
    uptime: status.uptime,
  };
}
