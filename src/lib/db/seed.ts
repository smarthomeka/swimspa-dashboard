import { db } from "./index";
import { sensorReadings, dosingLog, aiRecommendations, dosingResponses } from "./schema";
import { sql } from "drizzle-orm";

function randomBetween(min: number, max: number, decimals = 1): number {
  return parseFloat((Math.random() * (max - min) + min).toFixed(decimals));
}

export function clearAllData() {
  db.delete(dosingResponses).run();
  db.delete(aiRecommendations).run();
  db.delete(dosingLog).run();
  db.delete(sensorReadings).run();
}

export function seedMockData(force = false) {
  // Check if we already have data
  const count = db
    .select({ count: sql<number>`count(*)` })
    .from(sensorReadings)
    .get();
  if (!force && count && count.count > 0) return;

  if (force) {
    clearAllData();
  }

  const now = new Date();
  const readings: Array<{
    source: string;
    metric: string;
    value: number;
    unit: string;
    timestamp: string;
  }> = [];

  // Generate 90 days of data, one reading every 30 minutes
  for (let daysAgo = 90; daysAgo >= 0; daysAgo--) {
    for (let hour = 0; hour < 24; hour += 0.5) {
      const ts = new Date(now);
      ts.setDate(ts.getDate() - daysAgo);
      ts.setHours(Math.floor(hour), (hour % 1) * 60, 0, 0);
      const timestamp = ts.toISOString();

      // Gecko in.Touch 2 — water temperature (36-39C for swim spa)
      const baseTemp = 37.5 + Math.sin(daysAgo * 0.1) * 0.5;
      readings.push({
        source: "gecko",
        metric: "temperature",
        value: randomBetween(baseTemp - 0.3, baseTemp + 0.3),
        unit: "°C",
        timestamp,
      });

      // Gecko — pump status (0 or 1)
      readings.push({
        source: "gecko",
        metric: "pump_status",
        value: hour >= 8 && hour <= 22 ? (Math.random() > 0.3 ? 1 : 0) : 0,
        unit: "",
        timestamp,
      });

      // Shelly 3EM — power draw
      const basePower = hour >= 8 && hour <= 22 ? 2200 : 800;
      readings.push({
        source: "shelly",
        metric: "power_w",
        value: randomBetween(basePower - 200, basePower + 400, 0),
        unit: "W",
        timestamp,
      });

      // Shelly — cumulative energy (grows over time)
      const dailyKwh = 35 + randomBetween(-5, 5);
      const totalKwh = (90 - daysAgo) * dailyKwh + hour * (dailyKwh / 24);
      readings.push({
        source: "shelly",
        metric: "energy_kwh",
        value: parseFloat(totalKwh.toFixed(2)),
        unit: "kWh",
        timestamp,
      });
    }

    // Water quality — once per day (Labcom PoolLab readings)
    const dayTs = new Date(now);
    dayTs.setDate(dayTs.getDate() - daysAgo);
    dayTs.setHours(10, 0, 0, 0);
    const dayTimestamp = dayTs.toISOString();

    readings.push({
      source: "labcom",
      metric: "ph",
      value: randomBetween(7.0, 7.6),
      unit: "",
      timestamp: dayTimestamp,
    });

    readings.push({
      source: "labcom",
      metric: "bromine",
      value: randomBetween(2.0, 5.0),
      unit: "mg/l",
      timestamp: dayTimestamp,
    });

    readings.push({
      source: "labcom",
      metric: "alkalinity",
      value: randomBetween(80, 150, 0),
      unit: "mg/l",
      timestamp: dayTimestamp,
    });

    // BlueConnect — ORP (demo/stub)
    readings.push({
      source: "blueconnect",
      metric: "orp",
      value: randomBetween(650, 750, 0),
      unit: "mV",
      timestamp: dayTimestamp,
    });
  }

  // Batch insert
  const batchSize = 500;
  for (let i = 0; i < readings.length; i += batchSize) {
    db.insert(sensorReadings).values(readings.slice(i, i + batchSize)).run();
  }

  // Seed dosing logs — realistic entries every few days
  const chemicals = [
    { name: "Brom-Tabletten", amounts: [20, 40, 60] },
    { name: "pH-Minus", amounts: [15, 30, 50] },
    { name: "pH-Plus", amounts: [15, 30, 50] },
    { name: "Algizid", amounts: [25, 50] },
    { name: "Klareffekt", amounts: [30, 50] },
  ];
  const dosingEntries: Array<{
    chemical: string;
    amountMl: number;
    notes: string | null;
    timestamp: string;
  }> = [];

  for (let daysAgo = 85; daysAgo >= 0; daysAgo -= Math.floor(randomBetween(2, 5, 0))) {
    const ts = new Date(now);
    ts.setDate(ts.getDate() - daysAgo);
    ts.setHours(Math.floor(randomBetween(9, 18, 0)), Math.floor(randomBetween(0, 59, 0)), 0, 0);

    const chem = chemicals[Math.floor(Math.random() * chemicals.length)];
    const amount = chem.amounts[Math.floor(Math.random() * chem.amounts.length)];
    const notes = Math.random() > 0.6
      ? ["Nach Messung dosiert", "Wöchentliche Pflege", "Wasser trüb", "Routine-Dosierung", "Nach Badenutzung"][Math.floor(Math.random() * 5)]
      : null;

    dosingEntries.push({
      chemical: chem.name,
      amountMl: amount,
      notes,
      timestamp: ts.toISOString(),
    });
  }

  for (let i = 0; i < dosingEntries.length; i += batchSize) {
    db.insert(dosingLog).values(dosingEntries.slice(i, i + batchSize)).run();
  }

  console.log(`Seeded ${readings.length} sensor readings, ${dosingEntries.length} dosing logs`);
}
