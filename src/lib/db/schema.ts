import { sqliteTable, text, real, integer } from "drizzle-orm/sqlite-core";

export const sensorReadings = sqliteTable("sensor_readings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  source: text("source").notNull(), // 'gecko' | 'labcom' | 'shelly' | 'blueconnect'
  metric: text("metric").notNull(), // 'temperature' | 'ph' | 'bromine' | 'alkalinity' | 'orp' | 'power_w' | 'energy_kwh' | 'pump_status'
  value: real("value").notNull(),
  unit: text("unit").notNull(),
  timestamp: text("timestamp").notNull(), // ISO 8601
});

export const dosingLog = sqliteTable("dosing_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  chemical: text("chemical").notNull(),
  amountMl: real("amount_ml").notNull(),
  notes: text("notes"),
  timestamp: text("timestamp").notNull(),
});

export type SensorReading = typeof sensorReadings.$inferSelect;
export type NewSensorReading = typeof sensorReadings.$inferInsert;
export type DosingLogEntry = typeof dosingLog.$inferSelect;
export type NewDosingLogEntry = typeof dosingLog.$inferInsert;
