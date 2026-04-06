import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import {
  getLatestValues,
  getDosingLogs,
  getDailyEnergyConsumption,
  getReadings,
  getRecentRecommendations,
  insertRecommendation,
  getDosingResponses,
} from "@/lib/db/queries";

const TARGET_RANGES = {
  ph: { min: 7.2, max: 7.6, unit: "" },
  bromine: { min: 3, max: 5, unit: "ppm" },
  alkalinity: { min: 80, max: 120, unit: "ppm" },
  orp: { min: 650, max: 750, unit: "mV" },
};

function buildContext() {
  const latest = getLatestValues();
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const dosingLogs = getDosingLogs(sevenDaysAgo);
  const energyData = getDailyEnergyConsumption(sevenDaysAgo);
  const dosingResponses = getDosingResponses();

  // Get 7-day history for water metrics
  const phHistory = getReadings("labcom", "ph", sevenDaysAgo, 500);
  const bromineHistory = getReadings("labcom", "bromine", sevenDaysAgo, 500);
  const alkalinityHistory = getReadings("labcom", "alkalinity", sevenDaysAgo, 500);
  const orpHistory = getReadings("blueconnect", "orp", sevenDaysAgo, 500);
  const tempHistory = getReadings("gecko", "temperature", sevenDaysAgo, 500);

  return {
    currentValues: latest,
    targetRanges: TARGET_RANGES,
    waterHistory: {
      ph: summarizeHistory(phHistory),
      bromine: summarizeHistory(bromineHistory),
      alkalinity: summarizeHistory(alkalinityHistory),
      orp: summarizeHistory(orpHistory),
      temperature: summarizeHistory(tempHistory),
    },
    recentDosing: dosingLogs.slice(0, 20).map((d) => ({
      chemical: d.chemical,
      amountMl: d.amountMl,
      timestamp: d.timestamp,
      notes: d.notes,
    })),
    energyLast7Days: energyData.slice(-7).map((d) => ({
      date: d.date,
      consumptionKwh: d.maxKwh - d.minKwh,
      avgPowerW: d.avgPowerW,
    })),
    dosingResponsePatterns: dosingResponses.slice(0, 20).map((r) => ({
      chemical: r.chemical,
      amountMl: r.amountMl,
      metricsBefore: JSON.parse(r.metricsBefore),
      metricsAfter: JSON.parse(r.metricsAfter),
      hoursElapsed: r.hoursElapsed,
    })),
    swimSpaInfo: {
      model: "Armstark Lotus 460",
      volumeLiters: 7300,
      sanitizer: "Brom (Bromine)",
    },
  };
}

function summarizeHistory(readings: { value: number; timestamp: string }[]) {
  if (readings.length === 0) return null;
  const values = readings.map((r) => r.value);
  return {
    current: values[values.length - 1],
    min: Math.min(...values),
    max: Math.max(...values),
    avg: Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100,
    trend: values.length >= 2
      ? values[values.length - 1] > values[0]
        ? "steigend"
        : values[values.length - 1] < values[0]
        ? "fallend"
        : "stabil"
      : "unbekannt",
    dataPoints: values.length,
  };
}

const SYSTEM_PROMPT = `Du bist der KI-Assistent für ein Armstark Lotus 460 SwimSpa Dashboard (~7.300 Liter, Brom-basiert).

Deine Aufgaben:
1. Analysiere aktuelle Wasserwerte und Trends der letzten 7 Tage
2. Gib konkrete Dosierungsempfehlungen (Chemikalie, Menge in Gramm/Stück, Zeitpunkt)
3. Erkenne Muster in der Dosierungs-Wirkung-Historie und verbessere deine Empfehlungen
4. Gib Energiespartipps basierend auf Verbrauchsmustern

Zielwerte:
- pH: 7,2–7,6
- Brom: 3–5 ppm
- Alkalinität: 80–120 ppm
- ORP: 650–750 mV

Verfügbare Chemikalien:
- tubhub Bromine Granules (Gramm) – Brom-Granulat
- hth Spa Brom Tabs (Stück) – Brom-Tabletten
- hth Spa Schock-Sauerstoff (Gramm) – Schockbehandlung
- Armstark PH+ (Gramm) – pH erhöhen
- Armstark PH- (Gramm) – pH senken
- SpaLine Calcium+ (Gramm) – Alkalinität erhöhen

Antworte IMMER auf Deutsch. Strukturiere deine Antwort klar mit Markdown:
- **Zusammenfassung**: Kurzer Status (1-2 Sätze)
- **Wasserwerte**: Bewertung jedes Parameters mit Trend
- **Dosierungsempfehlungen**: Konkrete Maßnahmen mit Mengenangabe
- **Energietipps**: Falls relevant
- **Nächste Schritte**: Was als nächstes zu tun ist

Wenn Dosierungs-Wirkung-Muster vorhanden sind, nutze diese für präzisere Mengenempfehlungen.
Sei konkret und praxisnah. Keine generischen Ratschläge.`;

export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY nicht konfiguriert. Bitte in den Umgebungsvariablen setzen." },
      { status: 503 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const userMessage = body.message as string | undefined;

  const context = buildContext();
  const contextText = JSON.stringify(context, null, 2);

  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `Hier sind die aktuellen SwimSpa-Daten:\n\n\`\`\`json\n${contextText}\n\`\`\`\n\n${
        userMessage
          ? userMessage
          : "Erstelle bitte eine tägliche Analyse mit Dosierungsempfehlungen und Energietipps."
      }`,
    },
  ];

  const model = "claude-haiku-4-5-20251001";

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model,
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      messages,
    });

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    // Store the recommendation
    const stored = insertRecommendation({
      summary: text.slice(0, 200),
      recommendations: JSON.stringify({ text }),
      context: contextText,
      model,
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json({
      id: stored.id,
      text,
      model,
      timestamp: stored.timestamp,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unbekannter Fehler";
    return NextResponse.json({ error: `Claude API Fehler: ${message}` }, { status: 500 });
  }
}

export async function GET() {
  const recent = getRecentRecommendations(10);
  return NextResponse.json({
    recommendations: recent.map((r) => ({
      id: r.id,
      summary: r.summary,
      text: JSON.parse(r.recommendations).text,
      model: r.model,
      timestamp: r.timestamp,
    })),
  });
}
