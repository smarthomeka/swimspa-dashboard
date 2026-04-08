import { NextRequest, NextResponse } from "next/server";
import { getLatestValues, getReadings, getDailyEnergyConsumption } from "@/lib/db/queries";
import { seedMockData } from "@/lib/db/seed";
import { getAllSettings } from "@/lib/db/settings";
import { labcomService } from "@/lib/labcom/service";
import { shellyService } from "@/lib/shelly/service";
import { geckoService } from "@/lib/gecko/service";

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

  return NextResponse.json({ error: "Unknown type" }, { status: 400 });
}
