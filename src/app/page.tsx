"use client";

import { useEffect, useState } from "react";
import { StatusCard } from "@/components/status-card";
import { Thermometer, Droplets, FlaskConical, Gauge, Zap, Activity, Info } from "lucide-react";
import Link from "next/link";
import { relativeTime, formatNumber } from "@/lib/format";

function phStatus(v: number): "ok" | "warn" | "critical" {
  if (v >= 7.2 && v <= 7.6) return "ok";
  if (v >= 7.0 && v <= 7.8) return "warn";
  return "critical";
}

function bromineStatus(v: number): "ok" | "warn" | "critical" {
  if (v >= 3.0 && v <= 5.0) return "ok";
  if (v >= 2.0 && v <= 6.0) return "warn";
  return "critical";
}

function tempStatus(v: number): "ok" | "warn" | "critical" {
  if (v >= 36 && v <= 39) return "ok";
  if (v >= 34 && v <= 40) return "warn";
  return "critical";
}

interface LatestData {
  temperature: { value: number; unit: string; timestamp: string } | null;
  pumpStatus: { value: number; timestamp: string } | null;
  ph: { value: number; timestamp: string } | null;
  bromine: { value: number; unit: string; timestamp: string } | null;
  alkalinity: { value: number; unit: string; timestamp: string } | null;
  orp: { value: number; unit: string; timestamp: string } | null;
  powerW: { value: number; unit: string; timestamp: string } | null;
  energyKwh: { value: number; unit: string; timestamp: string } | null;
  demoMode?: boolean;
}

export default function OverviewPage() {
  const [data, setData] = useState<LatestData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/readings?type=latest")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch((err) => setError(err.message ?? "Verbindungsfehler"));
  }, []);

  if (error) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <Info className="h-6 w-6 text-destructive" />
          </div>
          <p className="text-sm font-medium text-destructive">Daten konnten nicht geladen werden</p>
          <p className="text-xs text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
          <p className="text-sm font-medium text-muted-foreground">Lade Daten...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-up">
      {/* Page header */}
      <div>
        <h1 className="font-heading text-4xl font-semibold tracking-tight sm:text-5xl">
          Übersicht
        </h1>
        <p className="mt-1 text-base text-muted-foreground">
          Armstark Lotus 460 SwimSpa — Aktuelle Werte
        </p>
      </div>

      {data.demoMode && (
        <Link
          href="/einstellungen"
          className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 transition-all duration-200 hover:bg-amber-500/10 hover:border-amber-500/30"
        >
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <div>
            <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
              Demo-Modus
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Es werden simulierte Testdaten angezeigt. Klicke hier um deine APIs zu konfigurieren.
            </p>
          </div>
        </Link>
      )}

      {/* Tier 1: Hero metrics */}
      <div className="grid gap-5 sm:grid-cols-2">
        <StatusCard
          title="Wassertemperatur"
          value={data.temperature ? formatNumber(data.temperature.value) : "–"}
          unit="°C"
          icon={Thermometer}
          status={data.temperature ? tempStatus(data.temperature.value) : undefined}
          subtitle={data.temperature ? relativeTime(data.temperature.timestamp) : undefined}
          variant="hero"
          accentColor="#ef4444"
        />
        <StatusCard
          title="pH-Wert"
          value={data.ph ? formatNumber(data.ph.value, 2) : "–"}
          icon={Droplets}
          status={data.ph ? phStatus(data.ph.value) : undefined}
          subtitle={data.ph ? relativeTime(data.ph.timestamp) : undefined}
          variant="hero"
          accentColor="#0d9488"
        />
      </div>

      {/* Tier 2: Secondary metrics */}
      <div className="grid gap-5 sm:grid-cols-3">
        <StatusCard
          title="Brom"
          value={data.bromine ? formatNumber(data.bromine.value) : "–"}
          unit="mg/l"
          icon={FlaskConical}
          status={data.bromine ? bromineStatus(data.bromine.value) : undefined}
          subtitle={data.bromine ? relativeTime(data.bromine.timestamp) : undefined}
          accentColor="#8b5cf6"
        />
        <StatusCard
          title="ORP (Redox)"
          value={data.orp ? Math.round(data.orp.value) : "–"}
          unit="mV"
          icon={Gauge}
          subtitle={data.orp ? `BlueConnect · ${relativeTime(data.orp.timestamp)}` : "BlueConnect (Demo)"}
          accentColor="#f97316"
        />
        <StatusCard
          title="Aktuelle Leistung"
          value={data.powerW ? Math.round(data.powerW.value) : "–"}
          unit="W"
          icon={Zap}
          subtitle={data.powerW ? relativeTime(data.powerW.timestamp) : undefined}
          accentColor="#ca8a04"
        />
      </div>

      {/* Tier 3: Informational */}
      <div className="grid gap-5 sm:grid-cols-2">
        <StatusCard
          title="Gesamtverbrauch"
          value={data.energyKwh ? formatNumber(data.energyKwh.value, 0) : "–"}
          unit="kWh"
          icon={Activity}
          subtitle="Shelly 3EM"
          variant="compact"
        />
        <StatusCard
          title="Pumpe"
          value={data.pumpStatus?.value === 1 ? "Läuft" : "Aus"}
          icon={Activity}
          status={data.pumpStatus?.value === 1 ? "ok" : undefined}
          subtitle={data.pumpStatus ? relativeTime(data.pumpStatus.timestamp) : undefined}
          variant="compact"
        />
      </div>
    </div>
  );
}
