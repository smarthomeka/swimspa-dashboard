import { db, ensureDb } from "@/lib/db";
import { sensorReadings, dosingLog, aiRecommendations, dosingResponses } from "@/lib/db/schema";
import { sql } from "drizzle-orm";
import { readFileSync } from "fs";
import { join } from "path";
import { statSync } from "fs";

export async function GET() {
  await ensureDb();
  const [readingsCount, dosingCount, recsCount, responsesCount] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(sensorReadings).get(),
    db.select({ count: sql<number>`count(*)` }).from(dosingLog).get(),
    db.select({ count: sql<number>`count(*)` }).from(aiRecommendations).get(),
    db.select({ count: sql<number>`count(*)` }).from(dosingResponses).get(),
  ]);

  const counts = {
    readings: readingsCount?.count ?? 0,
    dosingLogs: dosingCount?.count ?? 0,
    recommendations: recsCount?.count ?? 0,
    dosingResponses: responsesCount?.count ?? 0,
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
