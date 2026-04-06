import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import { mkdirSync } from "fs";
import { join } from "path";

const dbPath = join(process.cwd(), "data", "swimspa.db");
mkdirSync(join(process.cwd(), "data"), { recursive: true });

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");

export const db = drizzle(sqlite, { schema });

// Auto-create tables if they don't exist
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS sensor_readings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    metric TEXT NOT NULL,
    value REAL NOT NULL,
    unit TEXT NOT NULL,
    timestamp TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS dosing_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chemical TEXT NOT NULL,
    amount_ml REAL NOT NULL,
    notes TEXT,
    timestamp TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_readings_source_metric ON sensor_readings(source, metric);
  CREATE INDEX IF NOT EXISTS idx_readings_timestamp ON sensor_readings(timestamp);
  CREATE TABLE IF NOT EXISTS api_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider TEXT NOT NULL UNIQUE,
    enabled INTEGER NOT NULL DEFAULT 0,
    config TEXT NOT NULL DEFAULT '{}',
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS ai_recommendations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    summary TEXT NOT NULL,
    recommendations TEXT NOT NULL,
    context TEXT NOT NULL,
    model TEXT NOT NULL,
    timestamp TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS dosing_responses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dosing_log_id INTEGER NOT NULL,
    chemical TEXT NOT NULL,
    amount_ml REAL NOT NULL,
    metrics_before TEXT NOT NULL,
    metrics_after TEXT NOT NULL,
    hours_elapsed REAL NOT NULL,
    timestamp TEXT NOT NULL
  );
`);
