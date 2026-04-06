import { db } from "@/lib/db";
import { sensorReadings, dosingLog, aiRecommendations, dosingResponses } from "@/lib/db/schema";
import { sql } from "drizzle-orm";
import { readFileSync } from "fs";
import { join } from "path";
import { statSync } from "fs";

export async function GET() {
  const counts = {
    readings: db.select({ count: sql<number>`count(*)` }).from(sensorReadings).get()?.count ?? 0,
    dosingLogs: db.select({ count: sql<number>`count(*)` }).from(dosingLog).get()?.count ?? 0,
    recommendations: db.select({ count: sql<number>`count(*)` }).from(aiRecommendations).get()?.count ?? 0,
    dosingResponses: db.select({ count: sql<number>`count(*)` }).from(dosingResponses).get()?.count ?? 0,
  };

  let version = "0.1.0";
  try {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf-8"));
    version = pkg.version ?? version;
  } catch { /* ignore */ }

  let dbSizeBytes = 0;
  try {
    const dbPath = join(process.cwd(), "data", "swimspa.db");
    dbSizeBytes = statSync(dbPath).size;
  } catch { /* ignore */ }

  return Response.json({
    version,
    dbSizeBytes,
    counts,
  });
}
