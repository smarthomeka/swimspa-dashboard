import { NextRequest, NextResponse } from "next/server";
import { getLatestValues, getReadings, getDailyEnergyConsumption } from "@/lib/db/queries";
import { seedMockData } from "@/lib/db/seed";
import { getAllSettings } from "@/lib/db/settings";
import { labcomService } from "@/lib/labcom/service";
import { shellyService } from "@/lib/shelly/service";
import { geckoService } from "@/lib/gecko/service";
import type { Tariff, TariffConfig } from "@/app/api/tariffs/route";

let seeded = false;
let servicesStarted = false;

async function isDemoMode(): Promise<boolean> {
  const settings = await getAllSettings();
  return !Object.values(settings).some((s) => s.enabled);
}

async function ensureMockData() {
  if (!seeded && await isDemoMode()) {
    await seedMockData();
    seeded = true;
  }
}

/** Auto-start configured polling services on first request. */
async function ensureServices() {
  if (servicesStarted) return;
  servicesStarted = true;

  const settings = await getAllSettings();

  if (settings.labcom?.enabled && settings.labcom.config.apiUrl && settings.labcom.config.apiKey) {
    labcomService.startPolling().catch((err) =>
      console.error("[Readings] Labcom auto-start failed:", err instanceof Error ? err.message : err)
    );
  }

  if (settings.shelly?.enabled && settings.shelly.config.host) {
    shellyService.startPolling().catch((err) =>
      console.error("[Readings] Shelly auto-start failed:", err instanceof Error ? err.message : err)
    );
  }

  if (settings.gecko?.enabled && settings.gecko.config.host) {
    geckoService.startPolling().catch((err) =>
      console.error("[Readings] Gecko auto-start failed:", err instanceof Error ? err.message : err)
    );
  }
}

export async function GET(request: NextRequest) {
  await ensureMockData();
  await ensureServices();
  const { searchParams } = request.nextUrl;
  const type = searchParams.get("type") ?? "latest";

  if (type === "latest") {
    return NextResponse.json({ ...await getLatestValues(), demoMode: await isDemoMode() });
  }

  if (type === "history") {
    const source = searchParams.get("source") ?? "gecko";
    const metric = searchParams.get("metric") ?? "temperature";
    const days = parseInt(searchParams.get("days") ?? "7", 10);
    const since = new Date();
    since.setDate(since.getDate() - days);
    const data = await getReadings(source, metric, since);
    return NextResponse.json(data);
  }

  if (type === "energy") {
    const days = parseInt(searchParams.get("days") ?? "30", 10);
    const since = new Date();
    since.setDate(since.getDate() - days);
    const data = await getDailyEnergyConsumption(since);
    return NextResponse.json(data);
  }

  if (type === "energy-costs") {
    const days = parseInt(searchParams.get("days") ?? "30", 10);
    const since = new Date();
    since.setDate(since.getDate() - days);

    // Fetch tariff config
    let tariffConfig: TariffConfig;
    try {
      const tariffRes = await fetch(new URL("/api/tariffs", request.url));
      tariffConfig = await tariffRes.json();
    } catch {
      tariffConfig = {
        tariffs: [{ name: "Standard", pricePerKwh: 0.3, startHour: 0, endHour: 0 }],
      };
    }

    // Fetch power_w readings with timestamps
    const readings = await getReadings("shelly", "power_w", since, 100000);

    // Compute cost per tariff by integrating power over time
    const tariffCosts: Record<string, { name: string; kwh: number; cost: number; pricePerKwh: number }> = {};
    for (const t of tariffConfig.tariffs) {
      tariffCosts[t.name] = { name: t.name, kwh: 0, cost: 0, pricePerKwh: t.pricePerKwh };
    }

    for (let i = 1; i < readings.length; i++) {
      const prev = readings[i - 1];
      const curr = readings[i];
      const dtMs = new Date(curr.timestamp).getTime() - new Date(prev.timestamp).getTime();
      if (dtMs <= 0 || dtMs > 3600_000) continue; // skip gaps > 1h

      const avgPowerW = (prev.value + curr.value) / 2;
      const kwh = (avgPowerW * dtMs) / (1000 * 3600_000);
      // Use Vienna timezone for tariff hour lookup
      const hour = parseInt(new Date(prev.timestamp).toLocaleString("de-DE", { timeZone: "Europe/Vienna", hour: "2-digit", hour12: false }));

      const tariff = findTariffForHour(tariffConfig.tariffs, hour);
      const key = tariff.name;
      if (!tariffCosts[key]) {
        tariffCosts[key] = { name: key, kwh: 0, cost: 0, pricePerKwh: tariff.pricePerKwh };
      }
      tariffCosts[key].kwh += kwh;
      tariffCosts[key].cost += kwh * tariff.pricePerKwh;
    }

    const breakdown = Object.values(tariffCosts);
    const totalKwh = breakdown.reduce((s, b) => s + b.kwh, 0);
    const totalCost = breakdown.reduce((s, b) => s + b.cost, 0);

    return NextResponse.json({ totalKwh, totalCost, breakdown, tariffs: tariffConfig.tariffs });
  }

  return NextResponse.json({ error: "Unknown type" }, { status: 400 });
}

function findTariffForHour(tariffs: Tariff[], hour: number): Tariff {
  for (const t of tariffs) {
    if (t.startHour === t.endHour) return t; // single tariff covers all hours
    if (t.startHour < t.endHour) {
      if (hour >= t.startHour && hour < t.endHour) return t;
    } else {
      // wraps midnight, e.g. 22:00-06:00
      if (hour >= t.startHour || hour < t.endHour) return t;
    }
  }
  return tariffs[0];
}
