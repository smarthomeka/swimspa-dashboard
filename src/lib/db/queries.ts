import { db } from "./index";
import { sensorReadings, dosingLog, aiRecommendations, dosingResponses } from "./schema";
import type { NewDosingLogEntry } from "./schema";
import { desc, eq, and, gte, sql } from "drizzle-orm";

export function getLatestReading(source: string, metric: string) {
  return db
    .select()
    .from(sensorReadings)
    .where(
      and(eq(sensorReadings.source, source), eq(sensorReadings.metric, metric))
    )
    .orderBy(desc(sensorReadings.timestamp))
    .limit(1)
    .get();
}

export function getReadings(
  source: string,
  metric: string,
  since: Date,
  limit = 5000
) {
  return db
    .select()
    .from(sensorReadings)
    .where(
      and(
        eq(sensorReadings.source, source),
        eq(sensorReadings.metric, metric),
        gte(sensorReadings.timestamp, since.toISOString())
      )
    )
    .orderBy(sensorReadings.timestamp)
    .limit(limit)
    .all();
}

export function getDailyEnergyConsumption(since: Date) {
  return db
    .select({
      date: sql<string>`date(timestamp)`.as("date"),
      maxKwh: sql<number>`max(value)`.as("max_kwh"),
      minKwh: sql<number>`min(value)`.as("min_kwh"),
      avgPowerW: sql<number>`avg(case when metric = 'power_w' then value end)`.as("avg_power_w"),
    })
    .from(sensorReadings)
    .where(
      and(
        eq(sensorReadings.source, "shelly"),
        gte(sensorReadings.timestamp, since.toISOString())
      )
    )
    .groupBy(sql`date(timestamp)`)
    .orderBy(sql`date(timestamp)`)
    .all();
}

export function getDosingLogs(since?: Date, chemical?: string) {
  const conditions = [];
  if (since) conditions.push(gte(dosingLog.timestamp, since.toISOString()));
  if (chemical) conditions.push(eq(dosingLog.chemical, chemical));

  return db
    .select()
    .from(dosingLog)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(dosingLog.timestamp))
    .all();
}

export function insertDosingLog(entry: NewDosingLogEntry) {
  return db.insert(dosingLog).values(entry).returning().get();
}

export function deleteDosingLog(id: number) {
  return db.delete(dosingLog).where(eq(dosingLog.id, id)).run();
}

export function getRecentRecommendations(limit = 10) {
  return db
    .select()
    .from(aiRecommendations)
    .orderBy(desc(aiRecommendations.timestamp))
    .limit(limit)
    .all();
}

export function insertRecommendation(rec: {
  summary: string;
  recommendations: string;
  context: string;
  model: string;
  timestamp: string;
}) {
  return db.insert(aiRecommendations).values(rec).returning().get();
}

export function getDosingResponses(chemical?: string) {
  const conditions = [];
  if (chemical) conditions.push(eq(dosingResponses.chemical, chemical));
  return db
    .select()
    .from(dosingResponses)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(dosingResponses.timestamp))
    .limit(50)
    .all();
}

export function insertDosingResponse(resp: {
  dosingLogId: number;
  chemical: string;
  amountMl: number;
  metricsBefore: string;
  metricsAfter: string;
  hoursElapsed: number;
  timestamp: string;
}) {
  return db.insert(dosingResponses).values(resp).returning().get();
}

export function getLatestValues() {
  const temp = getLatestReading("gecko", "temperature");
  const pumpStatus = getLatestReading("gecko", "pump_status");
  const ph = getLatestReading("labcom", "ph");
  const bromine = getLatestReading("labcom", "bromine");
  const alkalinity = getLatestReading("labcom", "alkalinity");
  const orp = getLatestReading("blueconnect", "orp");
  const powerW = getLatestReading("shelly", "power_w");
  const energyKwh = getLatestReading("shelly", "energy_kwh");

  return {
    temperature: temp ? { value: temp.value, unit: temp.unit, timestamp: temp.timestamp } : null,
    pumpStatus: pumpStatus ? { value: pumpStatus.value, timestamp: pumpStatus.timestamp } : null,
    ph: ph ? { value: ph.value, timestamp: ph.timestamp } : null,
    bromine: bromine ? { value: bromine.value, unit: bromine.unit, timestamp: bromine.timestamp } : null,
    alkalinity: alkalinity ? { value: alkalinity.value, unit: alkalinity.unit, timestamp: alkalinity.timestamp } : null,
    orp: orp ? { value: orp.value, unit: orp.unit, timestamp: orp.timestamp } : null,
    powerW: powerW ? { value: powerW.value, unit: powerW.unit, timestamp: powerW.timestamp } : null,
    energyKwh: energyKwh ? { value: energyKwh.value, unit: energyKwh.unit, timestamp: energyKwh.timestamp } : null,
  };
}
