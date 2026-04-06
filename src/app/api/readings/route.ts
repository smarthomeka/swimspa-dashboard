import { NextRequest, NextResponse } from "next/server";
import { getLatestValues, getReadings, getDailyEnergyConsumption } from "@/lib/db/queries";
import { seedMockData } from "@/lib/db/seed";
import { getAllSettings } from "@/lib/db/settings";

let seeded = false;

async function ensureMockData() {
  if (!seeded) {
    await seedMockData();
    seeded = true;
  }
}

async function isDemoMode(): Promise<boolean> {
  const settings = await getAllSettings();
  return !Object.values(settings).some((s) => s.enabled);
}

export async function GET(request: NextRequest) {
  await ensureMockData();
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
