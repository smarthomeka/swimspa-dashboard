import { NextResponse } from "next/server";
import {
  getLatestValues,
  getDosingLogs,
  getReadings,
  getDosingResponses,
  getDailyEnergyConsumption,
} from "@/lib/db/queries";
import { getProviderSetting } from "@/lib/db/settings";

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
  if (value < range.min) return `⚠️ UNTER Zielbereich (${range.min}–${range.max})`;
  if (value > range.max) return `⚠️ ÜBER Zielbereich (${range.min}–${range.max})`;
  return `✅ im Zielbereich (${range.min}–${range.max})`;
}

function trend(readings: { value: number }[]): string {
  if (readings.length < 3) return "zu wenig Daten";
  const first = readings.slice(0, Math.ceil(readings.length / 3));
  const last = readings.slice(-Math.ceil(readings.length / 3));
  const avgFirst = first.reduce((s, r) => s + r.value, 0) / first.length;
  const avgLast = last.reduce((s, r) => s + r.value, 0) / last.length;
  const diff = avgLast - avgFirst;
  const pct = Math.abs(diff / avgFirst) * 100;
  if (pct < 2) return "stabil";
  return diff > 0 ? `↗ steigend (+${fmt(pct, 1)}%)` : `↘ fallend (${fmt(-pct, 1)}%)`;
}

export async function GET() {
  const latest = await getLatestValues();
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [dosingLogs, dosingResponsesData, energyData, phHistory, bromineHistory, alkalinityHistory, orpHistory] = await Promise.all([
    getDosingLogs(sevenDaysAgo),
    getDosingResponses(),
    getDailyEnergyConsumption(sevenDaysAgo),
    getReadings("labcom", "ph", sevenDaysAgo, 500),
    getReadings("labcom", "bromine", sevenDaysAgo, 500),
    getReadings("labcom", "alkalinity", sevenDaysAgo, 500),
    getReadings("blueconnect", "orp", sevenDaysAgo, 500),
  ]);

  // ── Load spa settings ──
  const spaSettings = await getProviderSetting("spa");
  const volumeLiters = spaSettings.config.volumeLiters ? parseInt(spaSettings.config.volumeLiters) : 7300;
  const location = spaSettings.config.location || "";
  const covered = spaSettings.config.covered || "covered";

  const coverageLabel =
    covered === "open" ? "offen (ohne Abdeckung)" :
    covered === "partial" ? "teilweise abgedeckt" :
    "abgedeckt (mit Abdeckung)";

  const lines: string[] = [];

  // ── System context (so Claude knows what it's dealing with) ──
  const spaDesc = `meinen Armstark Lotus 460 SwimSpa (~${volumeLiters.toLocaleString("de-DE")} Liter, Brom-basiert, ${coverageLabel}${location ? `, Standort: ${location}` : ""})`;
  lines.push(`Du bist mein Wasserchemie-Berater für ${spaDesc}.`);
  lines.push("");
  lines.push("Verfügbare Chemikalien:");
  lines.push("- tubhub Bromine Granules (Gramm) – Brom-Granulat");
  lines.push("- hth Spa Brom Tabs (Stück) – Brom-Tabletten für Schwimmer");
  lines.push("- hth Spa Schock-Sauerstoff (Gramm) – Schockbehandlung");
  lines.push("- Armstark PH+ (Gramm) – pH erhöhen");
  lines.push("- Armstark PH- (Gramm) – pH senken");
  lines.push("- SpaLine Calcium+ (Gramm) – Alkalinität erhöhen");
  lines.push("");

  // ── Current values ──
  lines.push("---");
  lines.push("");
  lines.push("## Aktuelle Messwerte");
  lines.push("");

  if (latest.temperature) {
    const setPointStr = latest.setPoint ? ` (Soll: ${fmt(latest.setPoint.value)}°C)` : "";
    const heatingStr = latest.heatingStatus
      ? latest.heatingStatus.value === 1 ? " 🔥 Heizung aktiv" : ""
      : "";
    lines.push(`- **Wassertemperatur**: ${fmt(latest.temperature.value)}°C${setPointStr}${heatingStr} — ${relTime(latest.temperature.timestamp)}`);
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
      lines.push(`- **${range.label}**: ${fmt(data.value, key === "orp" ? 0 : 2)}${unit} → ${status} — ${relTime(data.timestamp)}`);
    } else {
      lines.push(`- **${range.label}**: keine aktuellen Daten`);
    }
  }

  // ── Trends ──
  const histories: { key: string; data: { value: number }[] }[] = [
    { key: "ph", data: phHistory },
    { key: "bromine", data: bromineHistory },
    { key: "alkalinity", data: alkalinityHistory },
    { key: "orp", data: orpHistory },
  ];

  const trendLines = histories
    .filter(h => h.data.length >= 3)
    .map(h => {
      const vals = h.data.map(r => r.value);
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      return `- **${TARGET_RANGES[h.key].label}**: ${trend(h.data)} · Min: ${fmt(min, 2)} · Max: ${fmt(max, 2)} · Ø ${fmt(avg, 2)} (${h.data.length} Messpunkte)`;
    });

  if (trendLines.length > 0) {
    lines.push("");
    lines.push("## 7-Tage-Trends");
    lines.push("");
    for (const t of trendLines) lines.push(t);
  }

  // ── Energy ──
  const recentEnergy = energyData.slice(-7);
  if (recentEnergy.length > 0) {
    const totalKwh = recentEnergy.reduce((s, d) => s + (d.maxKwh - d.minKwh), 0);
    const avgKwhPerDay = totalKwh / recentEnergy.length;
    lines.push("");
    lines.push("## Energieverbrauch (letzte 7 Tage)");
    lines.push("");
    lines.push(`- Gesamt: ${fmt(totalKwh, 1)} kWh · Ø ${fmt(avgKwhPerDay, 1)} kWh/Tag`);
  }

  // ── Recent dosing ──
  const recentDosing = dosingLogs.slice(0, 15);
  if (recentDosing.length > 0) {
    lines.push("");
    lines.push("## Letzte Dosierungen");
    lines.push("");
    for (const d of recentDosing) {
      const dateStr = new Date(d.timestamp).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
      lines.push(`- ${dateStr}: **${fmt(d.amountMl, 0)}g ${d.chemical}**${d.notes ? ` — ${d.notes}` : ""}`);
    }
  }

  // ── Dosing response patterns ──
  const responses = dosingResponsesData.slice(0, 8);
  if (responses.length > 0) {
    lines.push("");
    lines.push("## Bekannte Dosierungs-Wirkungsmuster");
    lines.push("*(So hat der Spa bisher auf Chemikalien reagiert)*");
    lines.push("");
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
        lines.push(`- **${fmt(r.amountMl, 0)}g ${r.chemical}** → nach ${fmt(r.hoursElapsed, 0)}h: ${changes.join(", ")}`);
      }
    }
  }

  // ── Question ──
  lines.push("");
  lines.push("---");
  lines.push("");

  const issues: string[] = [];
  for (const { key, data } of metrics) {
    if (!data) continue;
    const range = TARGET_RANGES[key];
    if (data.value < range.min) issues.push(`${range.label} zu niedrig`);
    if (data.value > range.max) issues.push(`${range.label} zu hoch`);
  }

  if (issues.length > 0) {
    lines.push(`**Folgende Werte sind außerhalb des Zielbereichs: ${issues.join(", ")}.**`);
    lines.push("");
    lines.push("Bitte analysiere die Situation und gib mir eine konkrete Empfehlung:");
    lines.push("1. Welche Chemikalie(n) soll ich zugeben?");
    lines.push("2. Wieviel genau (in Gramm oder Stück)?");
    lines.push("3. Zu welchem Zeitpunkt (sofort, abends, morgens)?");
    lines.push("4. Berücksichtige dabei die bisherigen Dosierungen und deren Wirkung auf meinen Spa.");
    lines.push("5. Wann sollte ich nach der Dosierung erneut messen?");
  } else {
    lines.push("**Alle Werte sind aktuell im Zielbereich.** Bitte analysiere trotzdem:");
    lines.push("1. Gibt es basierend auf den Trends Handlungsbedarf?");
    lines.push("2. Wann sollte ich das nächste Mal messen?");
    lines.push("3. Gibt es präventive Maßnahmen die ich jetzt treffen sollte?");
  }

  lines.push("");
  lines.push("Antworte auf Deutsch, strukturiert mit Überschriften. Sei konkret mit Mengenangaben, keine generischen Ratschläge.");

  return NextResponse.json({ prompt: lines.join("\n") });
}
