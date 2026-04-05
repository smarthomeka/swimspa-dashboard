import { NextRequest, NextResponse } from "next/server";
import { getLatestValues, getReadings, getDailyEnergyConsumption } from "@/lib/db/queries";
import { seedMockData } from "@/lib/db/seed";

// Ensure mock data exists
seedMockData();

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const type = searchParams.get("type") ?? "latest";

  if (type === "latest") {
    return NextResponse.json(getLatestValues());
  }

  if (type === "history") {
    const source = searchParams.get("source") ?? "gecko";
    const metric = searchParams.get("metric") ?? "temperature";
    const days = parseInt(searchParams.get("days") ?? "7", 10);
    const since = new Date();
    since.setDate(since.getDate() - days);
    const data = getReadings(source, metric, since);
    return NextResponse.json(data);
  }

  if (type === "energy") {
    const days = parseInt(searchParams.get("days") ?? "30", 10);
    const since = new Date();
    since.setDate(since.getDate() - days);
    const data = getDailyEnergyConsumption(since);
    return NextResponse.json(data);
  }

  return NextResponse.json({ error: "Unknown type" }, { status: 400 });
}
