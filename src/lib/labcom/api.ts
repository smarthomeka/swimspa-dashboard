/**
 * Labcom PoolLab GraphQL API client.
 *
 * Talks to backend.labcom.cloud/graphql.
 * Auth: plain Authorization header (no Bearer prefix).
 * Returns water quality measurements (pH, Bromine, Alkalinity).
 */

export type LabcomMeasurement = {
  id: number;
  parameter: string; // e.g. "PL pH", "PL Bromine", "PL Alkalinity"
  value: string; // numeric string
  unit: string; // e.g. "pH", "mg/l Br₂", "mg/l CaCO₃"
  timestamp: number; // unix epoch seconds
  account_id: number;
};

export type LabcomAccount = {
  id: number;
  email: string;
};

const MEASUREMENTS_QUERY = `{
  Measurements {
    id
    parameter
    value
    unit
    timestamp
    account_id
  }
}`;

const MEASUREMENTS_SINCE_QUERY = `query($from: Int) {
  Measurements(from: $from) {
    id
    parameter
    value
    unit
    timestamp
    account_id
  }
}`;

const ACCOUNT_QUERY = `{
  CloudAccount {
    id
    email
  }
}`;

async function gqlRequest<T>(
  apiUrl: string,
  apiKey: string,
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const res = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: apiKey,
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    throw new Error(`Labcom API request failed (${res.status}): ${await res.text()}`);
  }

  const json = await res.json();
  if (json.errors?.length) {
    throw new Error(`Labcom GraphQL error: ${json.errors[0].message}`);
  }

  return json.data as T;
}

/**
 * Fetch all measurements, optionally since a unix timestamp.
 */
export async function getMeasurements(
  apiUrl: string,
  apiKey: string,
  since?: number
): Promise<LabcomMeasurement[]> {
  if (since) {
    const data = await gqlRequest<{ Measurements: LabcomMeasurement[] }>(
      apiUrl,
      apiKey,
      MEASUREMENTS_SINCE_QUERY,
      { from: since }
    );
    return data.Measurements ?? [];
  }

  const data = await gqlRequest<{ Measurements: LabcomMeasurement[] }>(
    apiUrl,
    apiKey,
    MEASUREMENTS_QUERY
  );
  return data.Measurements ?? [];
}

/**
 * Fetch the cloud account info (validates credentials).
 */
export async function getAccount(
  apiUrl: string,
  apiKey: string
): Promise<LabcomAccount> {
  const data = await gqlRequest<{ CloudAccount: LabcomAccount }>(
    apiUrl,
    apiKey,
    ACCOUNT_QUERY
  );
  return data.CloudAccount;
}

/** Map Labcom parameter names to our internal metric names. */
const PARAMETER_MAP: Record<string, { metric: string; unit: string }> = {
  "PL pH": { metric: "ph", unit: "pH" },
  "PL Bromine": { metric: "bromine", unit: "mg/l" },
  "PL Alkalinity": { metric: "alkalinity", unit: "mg/l" },
};

export type NormalizedReading = {
  metric: string;
  value: number;
  unit: string;
  timestamp: string; // ISO 8601
};

/**
 * Convert raw Labcom measurements to our normalized sensor reading format.
 * Filters to only the parameters we care about (pH, Bromine, Alkalinity).
 */
export function normalizeMeasurements(
  measurements: LabcomMeasurement[]
): NormalizedReading[] {
  const results: NormalizedReading[] = [];

  for (const m of measurements) {
    const mapped = PARAMETER_MAP[m.parameter];
    if (!mapped) continue;

    const value = parseFloat(m.value);
    if (isNaN(value)) continue;

    results.push({
      metric: mapped.metric,
      value: Math.round(value * 100) / 100,
      unit: mapped.unit,
      timestamp: new Date(m.timestamp * 1000).toISOString(),
    });
  }

  return results;
}
