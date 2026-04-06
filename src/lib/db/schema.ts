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
export const apiSettings = sqliteTable("api_settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  provider: text("provider").notNull().unique(), // 'gecko' | 'labcom' | 'shelly' | 'blueconnect'
  enabled: integer("enabled").notNull().default(0), // 0 = disabled, 1 = enabled
  config: text("config").notNull().default("{}"), // JSON blob with provider-specific settings
  updatedAt: text("updated_at").notNull(),
});

export const aiRecommendations = sqliteTable("ai_recommendations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  summary: text("summary").notNull(), // markdown summary from Claude
  recommendations: text("recommendations").notNull(), // JSON array of recommendation objects
  context: text("context").notNull(), // JSON snapshot of input data sent to Claude
  model: text("model").notNull(), // model used
  timestamp: text("timestamp").notNull(),
});

export const dosingResponses = sqliteTable("dosing_responses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  dosingLogId: integer("dosing_log_id").notNull(),
  chemical: text("chemical").notNull(),
  amountMl: real("amount_ml").notNull(),
  metricsBefore: text("metrics_before").notNull(), // JSON: { ph, bromine, alkalinity, orp }
  metricsAfter: text("metrics_after").notNull(), // JSON: same shape, measured ~24h later
  hoursElapsed: real("hours_elapsed").notNull(),
  timestamp: text("timestamp").notNull(),
});

export type DosingLogEntry = typeof dosingLog.$inferSelect;
export type NewDosingLogEntry = typeof dosingLog.$inferInsert;
export type ApiSetting = typeof apiSettings.$inferSelect;
export type NewApiSetting = typeof apiSettings.$inferInsert;
export type AiRecommendation = typeof aiRecommendations.$inferSelect;
export type DosingResponse = typeof dosingResponses.$inferSelect;
