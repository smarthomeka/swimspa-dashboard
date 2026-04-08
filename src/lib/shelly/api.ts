/**
 * Shelly 3EM HTTP API client — Gen3 (RPC) support.
 *
 * The Shelly 3EM Gen3 exposes a local RPC API.
 * - GET /rpc/EM.GetStatus?id=0 — live per-phase power/voltage/current
 * - GET /rpc/EMData.GetStatus?id=0 — cumulative energy totals (Wh)
 * - GET /rpc/Shelly.GetStatus — full device status (includes both)
 */

// ── Gen3 RPC types ──────────────────────────────────────────────

export type ShellyEmPhase = {
  current: number; // amps
  voltage: number; // volts
  act_power: number; // active power in watts
  aprt_power: number; // apparent power in VA
  pf: number; // power factor
  freq: number; // Hz
};

export type ShellyEmStatus = {
  id: number;
  a_current: number;
  a_voltage: number;
  a_act_power: number;
  a_aprt_power: number;
  a_pf: number;
  a_freq: number;
  b_current: number;
  b_voltage: number;
  b_act_power: number;
  b_aprt_power: number;
  b_pf: number;
  b_freq: number;
  c_current: number;
  c_voltage: number;
  c_act_power: number;
  c_aprt_power: number;
  c_pf: number;
  c_freq: number;
  n_current: number | null;
  total_current: number;
  total_act_power: number;
  total_aprt_power: number;
};

export type ShellyEmDataStatus = {
  id: number;
  a_total_act_energy: number; // Wh
  a_total_act_ret_energy: number;
  b_total_act_energy: number;
  b_total_act_ret_energy: number;
  c_total_act_energy: number;
  c_total_act_ret_energy: number;
  total_act: number; // Wh
  total_act_ret: number;
};

// ── Public aggregated type (kept compatible with service layer) ──

export type ShellyEmeterPhase = {
  power: number; // current watts
  pf: number; // power factor
  current: number; // amps
  voltage: number; // volts
  is_valid: boolean;
  total: number; // total energy in Wh
  total_returned: number; // returned energy in Wh
};

export type ShellyAggregated = {
  totalPowerW: number;
  totalEnergyKwh: number;
  phases: ShellyEmeterPhase[];
  deviceTime: string;
  uptime: number;
};

/**
 * Fetch EM live status from a Shelly 3EM Gen3 device.
 */
async function getEmStatus(host: string): Promise<ShellyEmStatus> {
  const url = `${host}/rpc/EM.GetStatus?id=0`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) {
    throw new Error(`Shelly EM.GetStatus failed (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

/**
 * Fetch EMData (energy totals) from a Shelly 3EM Gen3 device.
 */
async function getEmDataStatus(host: string): Promise<ShellyEmDataStatus> {
  const url = `${host}/rpc/EMData.GetStatus?id=0`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) {
    throw new Error(`Shelly EMData.GetStatus failed (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

/**
 * Fetch device system info for time/uptime.
 */
async function getSysStatus(host: string): Promise<{ time: string; uptime: number }> {
  const url = `${host}/rpc/Shelly.GetStatus`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) {
    throw new Error(`Shelly GetStatus failed (${res.status}): ${await res.text()}`);
  }
  const data = await res.json();
  return { time: data.sys?.time ?? "", uptime: data.sys?.uptime ?? 0 };
}

/**
 * Fetch and aggregate emeter data from a Shelly 3EM Gen3.
 * Maps Gen3 RPC responses back to the ShellyAggregated shape
 * used by the service layer and dashboard.
 */
export async function getShellyReadings(host: string): Promise<ShellyAggregated> {
  const [em, emData, sys] = await Promise.all([
    getEmStatus(host),
    getEmDataStatus(host),
    getSysStatus(host),
  ]);

  // Build per-phase objects compatible with the dashboard
  const phases: ShellyEmeterPhase[] = [
    {
      power: em.a_act_power,
      pf: em.a_pf,
      current: em.a_current,
      voltage: em.a_voltage,
      is_valid: true,
      total: emData.a_total_act_energy,
      total_returned: emData.a_total_act_ret_energy,
    },
    {
      power: em.b_act_power,
      pf: em.b_pf,
      current: em.b_current,
      voltage: em.b_voltage,
      is_valid: true,
      total: emData.b_total_act_energy,
      total_returned: emData.b_total_act_ret_energy,
    },
    {
      power: em.c_act_power,
      pf: em.c_pf,
      current: em.c_current,
      voltage: em.c_voltage,
      is_valid: true,
      total: emData.c_total_act_energy,
      total_returned: emData.c_total_act_ret_energy,
    },
  ];

  const totalPowerW = Math.round(em.total_act_power * 100) / 100;
  const totalEnergyKwh = Math.round((emData.total_act / 1000) * 1000) / 1000;

  return {
    totalPowerW,
    totalEnergyKwh,
    phases,
    deviceTime: sys.time,
    uptime: sys.uptime,
  };
}
