import { db, ensureDb } from "./index";
import { sensorReadings, dosingLog, aiRecommendations, dosingResponses } from "./schema";
import type { NewDosingLogEntry } from "./schema";
import { desc, eq, and, gte, sql } from "drizzle-orm";

export async function getLatestReading(source: string, metric: string) {
  await ensureDb();
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

export async function getReadings(
  source: string,
  metric: string,
  since: Date,
  limit = 5000
) {
  await ensureDb();
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

export async function getDailyEnergyConsumption(since: Date) {
  await ensureDb();
  return db
    .select({
      date: sql<string>`date(timestamp)`.as("date"),
      maxKwh: sql<number>`max(case when metric = 'energy_kwh' then value end)`.as("max_kwh"),
      minKwh: sql<number>`min(case when metric = 'energy_kwh' then value end)`.as("min_kwh"),
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

export async function getDosingLogs(since?: Date, chemical?: string) {
  await ensureDb();
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

export async function insertDosingLog(entry: NewDosingLogEntry) {
  await ensureDb();
  return db.insert(dosingLog).values(entry).returning().get();
}

export async function deleteDosingLog(id: number) {
  await ensureDb();
  return db.delete(dosingLog).where(eq(dosingLog.id, id)).run();
}

export async function getRecentRecommendations(limit = 10) {
  await ensureDb();
  return db
    .select()
    .from(aiRecommendations)
    .orderBy(desc(aiRecommendations.timestamp))
    .limit(limit)
    .all();
}

export async function insertRecommendation(rec: {
  summary: string;
  recommendations: string;
  context: string;
  model: string;
  timestamp: string;
}) {
  await ensureDb();
  return db.insert(aiRecommendations).values(rec).returning().get();
}

export async function getDosingResponses(chemical?: string) {
  await ensureDb();
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

export async function insertDosingResponse(resp: {
  dosingLogId: number;
  chemical: string;
  amountMl: number;
  metricsBefore: string;
  metricsAfter: string;
  hoursElapsed: number;
  timestamp: string;
}) {
  await ensureDb();
  return db.insert(dosingResponses).values(resp).returning().get();
}

export async function getLatestValues() {
  const temp = await getLatestReading("gecko", "temperature");
  const setPoint = await getLatestReading("gecko", "set_point");
  const heatingStatus = await getLatestReading("gecko", "heating_status");
  const pumpStatus = await getLatestReading("gecko", "pump_status");
  const pumpP1 = await getLatestReading("gecko", "pump_p1");
  const pumpP2 = await getLatestReading("gecko", "pump_p2");
  const pumpP3 = await getLatestReading("gecko", "pump_p3");
  const circPump = await getLatestReading("gecko", "circulation_pump");
  const ozone = await getLatestReading("gecko", "ozone");
  const waterfall = await getLatestReading("gecko", "waterfall");
  const econActive = await getLatestReading("gecko", "econ_active");
  const masterHeater = await getLatestReading("gecko", "master_heater");
  const ph = await getLatestReading("labcom", "ph");
  const bromine = await getLatestReading("labcom", "bromine");
  const alkalinity = await getLatestReading("labcom", "alkalinity");
  const orp = await getLatestReading("blueconnect", "orp");
  const powerW = await getLatestReading("shelly", "power_w");
  const energyKwh = await getLatestReading("shelly", "energy_kwh");

  const PUMP_MODES: Record<number, string> = { 0: "OFF", 1: "LOW", 2: "HIGH" };

  return {
    temperature: temp ? { value: temp.value, unit: temp.unit, timestamp: temp.timestamp } : null,
    setPoint: setPoint ? { value: setPoint.value, unit: setPoint.unit, timestamp: setPoint.timestamp } : null,
    heatingStatus: heatingStatus ? { value: heatingStatus.value, timestamp: heatingStatus.timestamp } : null,
    pumpStatus: pumpStatus ? { value: pumpStatus.value, timestamp: pumpStatus.timestamp } : null,
    pumps: {
      p1: pumpP1 ? { mode: PUMP_MODES[pumpP1.value] ?? "OFF", active: pumpP1.value > 0, timestamp: pumpP1.timestamp } : null,
      p2: pumpP2 ? { mode: PUMP_MODES[pumpP2.value] ?? "OFF", active: pumpP2.value > 0, timestamp: pumpP2.timestamp } : null,
      p3: pumpP3 ? { mode: PUMP_MODES[pumpP3.value] ?? "OFF", active: pumpP3.value > 0, timestamp: pumpP3.timestamp } : null,
    },
    circulationPump: circPump ? { active: circPump.value === 1, timestamp: circPump.timestamp } : null,
    ozone: ozone ? { active: ozone.value === 1, timestamp: ozone.timestamp } : null,
    waterfall: waterfall ? { active: waterfall.value === 1, timestamp: waterfall.timestamp } : null,
    econActive: econActive ? { active: econActive.value === 1, timestamp: econActive.timestamp } : null,
    masterHeater: masterHeater ? { active: masterHeater.value === 1, timestamp: masterHeater.timestamp } : null,
    ph: ph ? { value: ph.value, timestamp: ph.timestamp } : null,
    bromine: bromine ? { value: bromine.value, unit: bromine.unit, timestamp: bromine.timestamp } : null,
    alkalinity: alkalinity ? { value: alkalinity.value, unit: alkalinity.unit, timestamp: alkalinity.timestamp } : null,
    orp: orp ? { value: orp.value, unit: orp.unit, timestamp: orp.timestamp } : null,
    powerW: powerW ? { value: powerW.value, unit: powerW.unit, timestamp: powerW.timestamp } : null,
    energyKwh: energyKwh ? { value: energyKwh.value, unit: energyKwh.unit, timestamp: energyKwh.timestamp } : null,
  };
}
