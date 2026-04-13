"use client";

import { useEffect, useState, useCallback } from "react";
import { StatusCard } from "@/components/status-card";
import {
  Thermometer, Droplets, FlaskConical, Gauge, Zap, Activity, Info,
  Waves, Heater, Leaf, ShieldAlert, Sun, Lock, Lightbulb,
} from "lucide-react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { relativeTime, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Default auto-refresh interval in ms (synced with Gecko polling setting) */
const DEFAULT_POLL_INTERVAL = 15_000;

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

// SwimSpa range: swim area 26–32°C, whirlpool 35–40°C — both are normal
function tempStatus(v: number, setPoint?: number): "ok" | "warn" | "critical" {
  // If we have a set point, compare against it (±2°C = OK, ±3°C = warn)
  if (setPoint != null) {
    const diff = Math.abs(v - setPoint);
    if (diff <= 2) return "ok";
    if (diff <= 3) return "warn";
    return "critical";
  }
  // Fallback: wide SwimSpa range
  if (v >= 26 && v <= 40) return "ok";
  if (v >= 20 && v <= 42) return "warn";
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
  light: BoolData;
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

/** Inline SVG sparkline for temperature history */
function TempSparkline({ data }: { data: { value: number; timestamp: string }[] }) {
  if (data.length < 2) return null;
  const w = 200, h = 40, pad = 2;
  const vals = data.map(d => d.value);
  const min = Math.min(...vals) - 0.5;
  const max = Math.max(...vals) + 0.5;
  const range = max - min || 1;
  const points = data.map((d, i) => {
    const x = pad + (i / (data.length - 1)) * (w - pad * 2);
    const y = h - pad - ((d.value - min) / range) * (h - pad * 2);
    return `${x},${y}`;
  });
  const last = data[data.length - 1];
  const lastX = w - pad;
  const lastY = h - pad - ((last.value - min) / range) * (h - pad * 2);

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-10 mt-2 opacity-60" preserveAspectRatio="none">
      <defs>
        <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ef4444" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#ef4444" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <polygon
        points={`${pad},${h} ${points.join(" ")} ${w - pad},${h}`}
        fill="url(#sparkGrad)"
      />
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke="#ef4444"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={lastX} cy={lastY} r="2.5" fill="#ef4444" />
    </svg>
  );
}

export default function OverviewPage() {
  const [data, setData] = useState<LatestData | null>(null);
  const [geckoStatus, setGeckoStatus] = useState<GeckoStatus | null>(null);
  const [tempHistory, setTempHistory] = useState<{ value: number; timestamp: string }[]>([]);
  const [pollInterval, setPollInterval] = useState(DEFAULT_POLL_INTERVAL);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [latestRes, geckoRes, tempRes] = await Promise.all([
        fetch("/api/readings?type=latest"),
        fetch("/api/gecko/status").catch(() => null),
        fetch("/api/readings?type=history&source=gecko&metric=temperature&days=1").catch(() => null),
      ]);
      if (!latestRes.ok) throw new Error(`HTTP ${latestRes.status}`);
      const latestData = await latestRes.json();
      setData(latestData);
      // Update poll interval from settings (0 = disabled)
      if (latestData.pollInterval !== undefined) {
        setPollInterval(latestData.pollInterval * 1000);
      }
      if (geckoRes?.ok) setGeckoStatus(await geckoRes.json());
      if (tempRes?.ok) {
        const hist = await tempRes.json();
        setTempHistory(Array.isArray(hist) ? hist : []);
      }
    } catch (err: any) {
      setError(err.message ?? "Verbindungsfehler");
    }
  }, []);

  useEffect(() => {
    loadData();
    if (pollInterval <= 0) return; // polling disabled
    const interval = setInterval(loadData, pollInterval);
    return () => clearInterval(interval);
  }, [loadData, pollInterval]);

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
        <div>
          <StatusCard
            title="Wassertemperatur"
            value={data.temperature ? formatNumber(data.temperature.value) : "–"}
            unit="°C"
            icon={Thermometer}
            status={data.temperature ? tempStatus(data.temperature.value, data.setPoint?.value) : undefined}
            subtitle={data.temperature
              ? `${heatingLabel ? heatingLabel + " · " : ""}${data.setPoint ? `Soll: ${formatNumber(data.setPoint.value)}°C · ` : ""}${relativeTime(data.temperature.timestamp)}`
              : undefined}
            variant="hero"
            accentColor="#ef4444"
          >
            <TempSparkline data={tempHistory} />
          </StatusCard>
        </div>
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
              {data.waterfall && (
                <DeviceIndicator label="Wasserfall" active={data.waterfall.active} icon={Waves} />
              )}
              {data.light && (
                <DeviceIndicator label="Licht" active={data.light.active} icon={Lightbulb} />
              )}
              {data.ozone && (
                <DeviceIndicator label="Ozon" active={data.ozone.active} icon={Sun} />
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
