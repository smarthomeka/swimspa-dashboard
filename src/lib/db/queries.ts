import { db } from "./index";
import { sensorReadings } from "./schema";
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
