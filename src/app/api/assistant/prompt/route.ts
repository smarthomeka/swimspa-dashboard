import { NextResponse } from "next/server";
import {
  getLatestValues,
  getDosingLogs,
  getReadings,
  getDosingResponses,
} from "@/lib/db/queries";

const TARGET_RANGES: Record<string, { min: number; max: number; unit: string; label: string }> = {
  ph: { min: 7.2, max: 7.6, unit: "", label: "pH-Wert" },
  bromine: { min: 3, max: 5, unit: "ppm", label: "Brom" },
  alkalinity: { min: 80, max: 120, unit: "ppm", label: "Alkalinität" },
  orp: { min: 650, max: 750, unit: "mV", label: "ORP (Redox)" },
};

function fmt(n: number, decimals = 1): string {
  return n.toFixed(decimals).replace(".", ",");
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "gerade eben";
  if (mins < 60) return `vor ${mins} Min.`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `vor ${hours} Std.`;
  const days = Math.floor(hours / 24);
  return `vor ${days} Tag${days > 1 ? "en" : ""}`;
}

function assess(key: string, value: number): string {
  const range = TARGET_RANGES[key];
  if (!range) return "";
  if (value < range.min) return `unter Zielbereich (${range.min}–${range.max})`;
  if (value > range.max) return `über Zielbereich (${range.min}–${range.max})`;
  return "im Zielbereich";
}

function trend(readings: { value: number }[]): string {
  if (readings.length < 3) return "zu wenig Daten für Trend";
  const first = readings.slice(0, Math.ceil(readings.length / 3));
  const last = readings.slice(-Math.ceil(readings.length / 3));
  const avgFirst = first.reduce((s, r) => s + r.value, 0) / first.length;
  const avgLast = last.reduce((s, r) => s + r.value, 0) / last.length;
  const diff = avgLast - avgFirst;
  const pct = Math.abs(diff / avgFirst) * 100;
  if (pct < 2) return "stabil";
  return diff > 0 ? "steigend" : "fallend";
}

export async function GET() {
  const latest = await getLatestValues();
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [dosingLogs, dosingResponsesData, phHistory, bromineHistory, alkalinityHistory, orpHistory] = await Promise.all([
    getDosingLogs(sevenDaysAgo),
    getDosingResponses(),
    getReadings("labcom", "ph", sevenDaysAgo, 500),
    getReadings("labcom", "bromine", sevenDaysAgo, 500),
    getReadings("labcom", "alkalinity", sevenDaysAgo, 500),
    getReadings("blueconnect", "orp", sevenDaysAgo, 500),
  ]);

  const lines: string[] = [];

  // Current values section
  lines.push("Bitte analysiere die folgenden aktuellen Wasserwerte meines SwimSpas und gib mir konkrete Dosierungsempfehlungen:\n");

  lines.push("## Aktuelle Messwerte");

  if (latest.temperature) {
    lines.push(`- Wassertemperatur: ${fmt(latest.temperature.value)}°C (${relTime(latest.temperature.timestamp)})`);
  }

  const metrics: { key: string; data: typeof latest.ph }[] = [
    { key: "ph", data: latest.ph },
    { key: "bromine", data: latest.bromine },
    { key: "alkalinity", data: latest.alkalinity },
    { key: "orp", data: latest.orp },
  ];

  for (const { key, data } of metrics) {
    const range = TARGET_RANGES[key];
    if (data) {
      const status = assess(key, data.value);
      const unit = "unit" in data && data.unit ? ` ${data.unit}` : (range.unit ? ` ${range.unit}` : "");
      lines.push(`- ${range.label}: ${fmt(data.value, key === "orp" ? 0 : 2)}${unit} → ${status} (${relTime(data.timestamp)})`);
    } else {
      lines.push(`- ${range.label}: keine aktuellen Daten`);
    }
  }

  // Trends
  const histories: { key: string; data: { value: number }[] }[] = [
    { key: "ph", data: phHistory },
    { key: "bromine", data: bromineHistory },
    { key: "alkalinity", data: alkalinityHistory },
    { key: "orp", data: orpHistory },
  ];

  const trendLines = histories
    .filter(h => h.data.length >= 3)
    .map(h => `${TARGET_RANGES[h.key].label}: ${trend(h.data)} (${h.data.length} Messpunkte)`);

  if (trendLines.length > 0) {
    lines.push("\n## Trends der letzten 7 Tage");
    for (const t of trendLines) lines.push(`- ${t}`);
  }

  // Recent dosing
  const recentDosing = dosingLogs.slice(0, 10);
  if (recentDosing.length > 0) {
    lines.push("\n## Letzte Dosierungen");
    for (const d of recentDosing) {
      const dateStr = new Date(d.timestamp).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
      lines.push(`- ${dateStr}: ${fmt(d.amountMl, 0)}g ${d.chemical}${d.notes ? ` (${d.notes})` : ""}`);
    }
  }

  // Dosing response patterns
  const responses = dosingResponsesData.slice(0, 5);
  if (responses.length > 0) {
    lines.push("\n## Bekannte Wirkungsmuster");
    for (const r of responses) {
      const before = JSON.parse(r.metricsBefore);
      const after = JSON.parse(r.metricsAfter);
      const changes: string[] = [];
      for (const key of Object.keys(before)) {
        if (after[key] !== undefined) {
          const diff = after[key] - before[key];
          if (Math.abs(diff) > 0.01) {
            changes.push(`${key}: ${fmt(before[key], 2)} → ${fmt(after[key], 2)}`);
          }
        }
      }
      if (changes.length > 0) {
        lines.push(`- ${fmt(r.amountMl, 0)}g ${r.chemical} → nach ${fmt(r.hoursElapsed, 0)}h: ${changes.join(", ")}`);
      }
    }
  }

  // The actual question
  lines.push("\n## Frage");

  const issues: string[] = [];
  for (const { key, data } of metrics) {
    if (!data) continue;
    const range = TARGET_RANGES[key];
    if (data.value < range.min) issues.push(`${range.label} zu niedrig`);
    if (data.value > range.max) issues.push(`${range.label} zu hoch`);
  }

  if (issues.length > 0) {
    lines.push(`Folgende Werte sind außerhalb des Zielbereichs: ${issues.join(", ")}.`);
    lines.push("Welche Chemikalien soll ich in welcher Menge zugeben, um die Werte zu korrigieren? Bitte berücksichtige dabei die bisherigen Dosierungen und deren Wirkung.");
  } else {
    lines.push("Alle Werte sind aktuell im Zielbereich. Gibt es trotzdem Handlungsbedarf basierend auf den Trends? Wann sollte ich das nächste Mal messen und ggf. nachdosieren?");
  }

  return NextResponse.json({ prompt: lines.join("\n") });
}
