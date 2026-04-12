"use client";

import { useEffect, useState } from "react";
import { StatusCard } from "@/components/status-card";
import {
  Thermometer, Droplets, FlaskConical, Gauge, Zap, Activity, Info,
  Waves, Wind, Heater, Leaf, ShieldAlert, Sun, Lock,
} from "lucide-react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { relativeTime, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

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

type PumpData = { mode: string; active: boolean; timestamp: string } | null;
type BoolData = { active: boolean; timestamp: string } | null;

interface LatestData {
  temperature: { value: number; unit: string; timestamp: string } | null;
  setPoint: { value: number; unit: string; timestamp: string } | null;
  heatingStatus: { value: number; timestamp: string } | null;
  pumpStatus: { value: number; timestamp: string } | null;
  pumps: { p1: PumpData; p2: PumpData; p3: PumpData };
  circulationPump: BoolData;
  blower: BoolData;
  ozone: BoolData;
  waterfall: BoolData;
  econActive: BoolData;
  masterHeater: BoolData;
  ph: { value: number; timestamp: string } | null;
  bromine: { value: number; unit: string; timestamp: string } | null;
  alkalinity: { value: number; unit: string; timestamp: string } | null;
  orp: { value: number; unit: string; timestamp: string } | null;
  powerW: { value: number; unit: string; timestamp: string } | null;
  energyKwh: { value: number; unit: string; timestamp: string } | null;
  demoMode?: boolean;
}

interface GeckoStatus {
  configured: boolean;
  lastReading: {
    watercare: string | null;
    quietState: string | null;
    lockMode: string | null;
    reminders: { type: string; daysRemaining: number }[];
    errors: string[];
  } | null;
}

// Pump label mapping for Armstark Lotus 460
const PUMP_LABELS: Record<string, string> = {
  p1: "Jet-Pumpe 1",
  p2: "Jet-Pumpe 2",
  p3: "Swim-Jet",
};

function PumpIndicator({ label, mode, active }: { label: string; mode: string; active: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <Badge
        variant={active ? "default" : "outline"}
        className={cn(
          "text-[10px] font-semibold uppercase",
          active && mode === "HIGH" && "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
          active && mode === "LOW" && "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30",
          !active && "text-muted-foreground"
        )}
      >
        {active ? mode : "Aus"}
      </Badge>
    </div>
  );
}

function DeviceIndicator({ label, active, icon: Icon }: { label: string; active: boolean; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </span>
      <span className={cn(
        "flex items-center gap-1.5 text-xs font-semibold",
        active ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
      )}>
        <span className={cn("h-1.5 w-1.5 rounded-full", active ? "bg-emerald-500" : "bg-muted-foreground/30")} />
        {active ? "An" : "Aus"}
      </span>
    </div>
  );
}

export default function OverviewPage() {
  const [data, setData] = useState<LatestData | null>(null);
  const [geckoStatus, setGeckoStatus] = useState<GeckoStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/readings?type=latest")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch((err) => setError(err.message ?? "Verbindungsfehler"));

    fetch("/api/gecko/status")
      .then((r) => r.json())
      .then(setGeckoStatus)
      .catch(() => {});
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

  const reading = geckoStatus?.lastReading;
  const hasErrors = reading?.errors && reading.errors.length > 0;
  // Filter out garbage reminders (unknown types, unreasonable day counts)
  const KNOWN_REMINDERS = ["Filter spülen", "Filter reinigen", "Wasser wechseln", "Spa prüfen", "Ozonator wechseln", "Vision-Kartusche wechseln"];
  const validReminders = reading?.reminders?.filter(
    (r) => KNOWN_REMINDERS.includes(r.type) && Math.abs(r.daysRemaining) <= 365
  ) ?? [];
  const overdueReminders = validReminders.filter((r) => r.daysRemaining <= 0);
  const upcomingReminders = validReminders.filter((r) => r.daysRemaining > 0 && r.daysRemaining <= 14);
  const heatingLabel = data.heatingStatus
    ? data.heatingStatus.value === 1 ? "Heizt" : data.heatingStatus.value === 2 ? "Kühlt" : "Standby"
    : null;

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

      {/* Errors / Alerts */}
      {hasErrors && (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="flex items-start gap-3 pt-5 pb-5">
            <ShieldAlert className="h-5 w-5 shrink-0 text-red-500 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-700 dark:text-red-400">
                Fehlermeldung vom Spa
              </p>
              <ul className="mt-1 space-y-0.5">
                {reading!.errors.map((err) => (
                  <li key={err} className="text-xs text-red-600 dark:text-red-400">{err}</li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Overdue reminders */}
      {overdueReminders.length > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="flex items-start gap-3 pt-5 pb-5">
            <Info className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                Wartung fällig
              </p>
              <ul className="mt-1 space-y-0.5">
                {overdueReminders.map((r) => (
                  <li key={r.type} className="text-xs text-amber-600 dark:text-amber-400">
                    {r.type} — {r.daysRemaining === 0 ? "heute fällig" : `${Math.abs(r.daysRemaining)} Tage überfällig`}
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tier 1: Hero metrics */}
      <div className="grid gap-5 sm:grid-cols-2">
        <StatusCard
          title="Wassertemperatur"
          value={data.temperature ? formatNumber(data.temperature.value) : "–"}
          unit="°C"
          icon={Thermometer}
          status={data.temperature ? tempStatus(data.temperature.value) : undefined}
          subtitle={data.temperature
            ? `${heatingLabel ? heatingLabel + " · " : ""}${data.setPoint ? `Soll: ${formatNumber(data.setPoint.value)}°C · ` : ""}${relativeTime(data.temperature.timestamp)}`
            : undefined}
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

      {/* Tier 3: Pumps & Devices + Status */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {/* Pumps card */}
        <Card className="card-glow relative border-l-[3px]" style={{ borderLeftColor: "#3b82f6" }}>
          <CardContent className="pt-5 pb-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Pumpen & Geräte
              </span>
              <Waves className="h-4 w-4 text-muted-foreground/60" />
            </div>
            <div className="divide-y divide-border/50">
              {Object.entries(data.pumps).map(([key, pump]) =>
                pump && (
                  <PumpIndicator
                    key={key}
                    label={PUMP_LABELS[key] ?? key.toUpperCase()}
                    mode={pump.mode}
                    active={pump.active}
                  />
                )
              )}
              {data.circulationPump && (
                <DeviceIndicator label="Zirkulation" active={data.circulationPump.active} icon={Activity} />
              )}
              {data.blower && (
                <DeviceIndicator label="Gebläse" active={data.blower.active} icon={Wind} />
              )}
              {data.ozone && (
                <DeviceIndicator label="Ozon" active={data.ozone.active} icon={Sun} />
              )}
              {data.waterfall && (
                <DeviceIndicator label="Wasserfall" active={data.waterfall.active} icon={Waves} />
              )}
            </div>
          </CardContent>
        </Card>

        {/* Operating mode card */}
        <Card className="card-glow relative border-l-[3px]" style={{ borderLeftColor: "#10b981" }}>
          <CardContent className="pt-5 pb-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Betriebsmodus
              </span>
              <Leaf className="h-4 w-4 text-muted-foreground/60" />
            </div>
            <div className="space-y-3">
              {reading?.watercare && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Watercare</span>
                  <Badge variant="outline" className="text-[10px] font-semibold">
                    {reading.watercare}
                  </Badge>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Heizung</span>
                <Badge
                  variant={data.masterHeater?.active ? "default" : "outline"}
                  className={cn(
                    "text-[10px] font-semibold",
                    data.masterHeater?.active && "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30"
                  )}
                >
                  {data.masterHeater?.active ? (heatingLabel ?? "An") : "Aus"}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Energiesparmodus</span>
                <Badge
                  variant={data.econActive?.active ? "default" : "outline"}
                  className={cn(
                    "text-[10px] font-semibold",
                    data.econActive?.active && "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30"
                  )}
                >
                  {data.econActive?.active ? "Aktiv" : "Aus"}
                </Badge>
              </div>
              {reading?.quietState && reading.quietState !== "NOT_SET" && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Ruhemodus</span>
                  <Badge variant="default" className="text-[10px] font-semibold bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 border-indigo-500/30">
                    {reading.quietState === "OFF" ? "Aktiv" : reading.quietState}
                  </Badge>
                </div>
              )}
              {reading?.lockMode && reading.lockMode !== "UNLOCK" && (
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Lock className="h-3.5 w-3.5" />
                    Sperre
                  </span>
                  <Badge variant="outline" className="text-[10px] font-semibold">
                    {reading.lockMode === "PARTIAL" ? "Teilweise" : "Voll"}
                  </Badge>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Energy + Info card */}
        <Card className="card-glow relative border-l-[3px]" style={{ borderLeftColor: "#ca8a04" }}>
          <CardContent className="pt-5 pb-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Energie & Wartung
              </span>
              <Activity className="h-4 w-4 text-muted-foreground/60" />
            </div>
            <div className="space-y-3">
              <div>
                <div className="text-xs text-muted-foreground">Gesamtverbrauch</div>
                <div className="flex items-baseline gap-1">
                  <span className="font-heading text-2xl font-bold tabular-nums">
                    {data.energyKwh ? formatNumber(data.energyKwh.value, 0) : "–"}
                  </span>
                  <span className="text-sm text-muted-foreground">kWh</span>
                </div>
              </div>
              {upcomingReminders.length > 0 && (
                <div className="border-t border-border/50 pt-3">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                    Anstehende Wartung
                  </div>
                  {upcomingReminders.map((r) => (
                    <div key={r.type} className="flex items-center justify-between py-0.5">
                      <span className="text-xs text-muted-foreground">{r.type}</span>
                      <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                        in {r.daysRemaining} Tagen
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {!upcomingReminders.length && !overdueReminders.length && validReminders.length > 0 && (
                <div className="border-t border-border/50 pt-3">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                    Nächste Wartung
                  </div>
                  {validReminders.slice(0, 3).map((r) => (
                    <div key={r.type} className="flex items-center justify-between py-0.5">
                      <span className="text-xs text-muted-foreground">{r.type}</span>
                      <span className="text-xs font-medium text-muted-foreground">
                        in {r.daysRemaining} Tagen
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
