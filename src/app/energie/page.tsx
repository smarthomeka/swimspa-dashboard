"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceArea,
} from "recharts";
import { Zap, TrendingDown, Receipt, AlertTriangle, Flame, Waves, Wind } from "lucide-react";

interface EnergyDay {
  date: string;
  maxKwh: number;
  minKwh: number;
  avgPowerW: number;
}

interface TariffBreakdown {
  name: string;
  kwh: number;
  cost: number;
  pricePerKwh: number;
}

interface EnergyCosts {
  totalKwh: number;
  totalCost: number;
  breakdown: TariffBreakdown[];
}

interface PowerDetail {
  timestamp: string;
  powerW: number;
  heating: boolean;
  pumpP1: boolean;
  pumpP2: boolean;
  pumpP3: boolean;
  circPump: boolean;
  blower: boolean;
}

/** Enriched data point for chart rendering */
interface ChartPoint extends PowerDetail {
  powerKw: number;
  activeDevices: string[];
}

const TZ = "Europe/Vienna";

const DEVICE_CONFIG = [
  { key: "heating" as const, label: "Heizung", shortLabel: "Heizung", color: "#ef4444", icon: Flame },
  { key: "pumpP1" as const, label: "Jet-Pumpe 1", shortLabel: "Jet 1", color: "#3b82f6", icon: Waves },
  { key: "pumpP2" as const, label: "Jet-Pumpe 2", shortLabel: "Jet 2", color: "#8b5cf6", icon: Waves },
  { key: "pumpP3" as const, label: "Swim-Jet", shortLabel: "Swim", color: "#06b6d4", icon: Waves },
  { key: "circPump" as const, label: "Zirkulation", shortLabel: "Zirk.", color: "#10b981", icon: Waves },
  { key: "blower" as const, label: "Gebläse", shortLabel: "Gebl.", color: "#f59e0b", icon: Wind },
] as const;

function formatDateLabel(d: string) {
  const dt = new Date(d);
  return dt.toLocaleDateString("de-DE", { timeZone: TZ, day: "2-digit", month: "2-digit" });
}

function formatKw(watts: number): string {
  return (watts / 1000).toFixed(1).replace(".", ",");
}

function formatTimeTick(v: string) {
  const d = new Date(v);
  return d.toLocaleString("de-DE", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function EnergyPage() {
  const [days, setDays] = useState<number>(30);
  const [dailyData, setDailyData] = useState<
    Array<{ date: string; kwh: number; avgW: number }>
  >([]);
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [costData, setCostData] = useState<EnergyCosts | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [energyRes, powerRes, costRes] = await Promise.all([
          fetch(`/api/readings?type=energy&days=${days}`),
          fetch(`/api/readings?type=power-detail&days=${days}`),
          fetch(`/api/readings?type=energy-costs&days=${days}`),
        ]);
        if (!energyRes.ok || !powerRes.ok) throw new Error(`HTTP ${energyRes.status}`);
        const energy: EnergyDay[] = await energyRes.json();
        const rawPower: PowerDetail[] = await powerRes.json();
        if (costRes.ok) setCostData(await costRes.json());

        const daily = energy.map((d, i) => ({
          date: d.date,
          kwh:
            i > 0
              ? Math.max(0, d.maxKwh - energy[i - 1].maxKwh)
              : d.maxKwh - d.minKwh,
          avgW: Math.round(d.avgPowerW ?? 0),
        }));
        setDailyData(daily);

        // Enrich power data with kW and active device list
        const enriched: ChartPoint[] = rawPower.map((p) => {
          const activeDevices: string[] = [];
          for (const dev of DEVICE_CONFIG) {
            if (p[dev.key]) activeDevices.push(dev.label);
          }
          return { ...p, powerKw: p.powerW / 1000, activeDevices };
        });
        setChartData(enriched);
        setError(null);
      } catch (err: any) {
        setError(err.message ?? "Verbindungsfehler");
      }
    }
    load();
  }, [days]);

  const totalKwh = dailyData.reduce((sum, d) => sum + d.kwh, 0);
  const avgDaily = dailyData.length > 0 ? totalKwh / dailyData.length : 0;
  const totalCost = costData?.totalCost ?? totalKwh * 0.3;
  const peakKw = chartData.length > 0 ? Math.max(...chartData.map((d) => d.powerKw)) : 0;

  const gridStroke = "oklch(0.88 0.005 185)";
  const tickFill = "oklch(0.48 0.02 185)";

  // Detect which devices have any activity in the data
  const activeDeviceKeys = DEVICE_CONFIG.filter((dev) =>
    chartData.some((d) => d[dev.key])
  );

  if (error) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-6 w-6 text-destructive" />
          </div>
          <p className="text-sm font-medium text-destructive">Energiedaten konnten nicht geladen werden</p>
          <p className="text-xs text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-up">
      <div>
        <h1 className="font-heading text-4xl font-semibold tracking-tight sm:text-5xl">
          Energieverbrauch
        </h1>
        <p className="mt-1 text-base text-muted-foreground">
          Shelly 3EM — Stromverbrauch und Kosten
        </p>
      </div>

      <Tabs value={String(days)} onValueChange={(v) => setDays(Number(v))}>
        <TabsList>
          <TabsTrigger value="7">7 Tage</TabsTrigger>
          <TabsTrigger value="30">30 Tage</TabsTrigger>
          <TabsTrigger value="90">90 Tage</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Summary cards */}
      <div className="grid gap-5 sm:grid-cols-3">
        <Card className="card-glow relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-amber-500 to-transparent" />
          <CardContent className="pt-5 pb-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10">
                <Zap className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
              </div>
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Gesamtverbrauch
              </span>
            </div>
            <span className="font-heading text-3xl font-bold tabular-nums">
              {totalKwh.toFixed(0).replace(".", ",")}
            </span>
            <span className="ml-1.5 text-base font-medium text-muted-foreground">kWh</span>
          </CardContent>
        </Card>
        <Card className="card-glow relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-teal-500 to-transparent" />
          <CardContent className="pt-5 pb-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-500/10">
                <TrendingDown className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
              </div>
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Durchschnitt / Tag
              </span>
            </div>
            <span className="font-heading text-3xl font-bold tabular-nums">
              {avgDaily.toFixed(1).replace(".", ",")}
            </span>
            <span className="ml-1.5 text-base font-medium text-muted-foreground">kWh</span>
          </CardContent>
        </Card>
        <Card className="card-glow relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-emerald-500 to-transparent" />
          <CardContent className="pt-5 pb-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10">
                <Receipt className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Geschätzte Kosten
              </span>
            </div>
            <span className="font-heading text-3xl font-bold tabular-nums">
              {totalCost.toFixed(0).replace(".", ",")}
            </span>
            <span className="ml-1.5 text-base font-medium text-muted-foreground">EUR</span>
            {costData?.breakdown && costData.breakdown.length > 0 ? (
              <div className="mt-1.5 space-y-0.5">
                {costData.breakdown.map((b) => (
                  <p key={b.name} className="text-[11px] font-medium text-muted-foreground">
                    {b.name}: {b.kwh.toFixed(1).replace(".", ",")} kWh
                    {" "}({(b.pricePerKwh * 100).toFixed(0)} ct/kWh = {b.cost.toFixed(2).replace(".", ",")} EUR)
                  </p>
                ))}
              </div>
            ) : (
              <p className="text-[11px] font-medium text-muted-foreground mt-1">
                bei 0,30 EUR/kWh (Standard)
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Daily consumption bar chart */}
      <Card className="card-glow">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            Täglicher Verbrauch (kWh)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-48 sm:h-64 lg:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyData}>
                <defs>
                  <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ca8a04" stopOpacity={0.85} />
                    <stop offset="100%" stopColor="#ca8a04" stopOpacity={0.3} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  horizontal={true}
                  vertical={false}
                  stroke={gridStroke}
                />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatDateLabel}
                  fontSize={11}
                  interval="preserveStartEnd"
                  tick={{ fill: tickFill }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  fontSize={11}
                  tick={{ fill: tickFill }}
                  axisLine={false}
                  tickLine={false}
                  width={40}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const v = payload[0].value as number;
                    return (
                      <div className="rounded-xl border border-border/50 bg-card px-4 py-2.5 shadow-xl card-glow">
                        <p className="text-[11px] font-medium text-muted-foreground">
                          {new Date(label).toLocaleDateString("de-DE", {
                            timeZone: TZ,
                            weekday: "short",
                            day: "2-digit",
                            month: "2-digit",
                          })}
                        </p>
                        <p className="mt-0.5 text-sm font-bold tabular-nums">
                          {Number(v).toFixed(1).replace(".", ",")} kWh
                        </p>
                      </div>
                    );
                  }}
                />
                <Bar
                  dataKey="kwh"
                  fill="url(#barGrad)"
                  radius={[6, 6, 0, 0]}
                  animationDuration={800}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Power consumption chart with device correlation */}
      <Card className="card-glow">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Zap className="h-4 w-4 text-red-500" />
              Leistungsverlauf — letzte {days} Tage
            </CardTitle>
            {peakKw > 0 && (
              <span className="text-xs font-medium text-muted-foreground tabular-nums">
                Peak: {formatKw(peakKw * 1000)} kW
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Main power chart in kW */}
          <div className="h-56 sm:h-72 lg:h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                <defs>
                  <linearGradient id="powerGradKw" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ef4444" stopOpacity={0.15} />
                    <stop offset="100%" stopColor="#ef4444" stopOpacity={0.01} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  horizontal={true}
                  vertical={false}
                  stroke={gridStroke}
                  strokeDasharray="3 3"
                />
                <XAxis
                  dataKey="timestamp"
                  tickFormatter={formatTimeTick}
                  fontSize={10}
                  interval="preserveStartEnd"
                  tick={{ fill: tickFill }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  fontSize={11}
                  tick={{ fill: tickFill }}
                  axisLine={false}
                  tickLine={false}
                  width={42}
                  tickFormatter={(v) => `${Number(v).toFixed(1)}`}
                  label={{
                    value: "kW",
                    position: "top",
                    offset: 10,
                    style: { fontSize: 10, fill: tickFill, fontWeight: 600 },
                  }}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0]?.payload as ChartPoint | undefined;
                    if (!d) return null;
                    return (
                      <div className="rounded-xl border border-border/50 bg-card px-4 py-3 shadow-xl card-glow min-w-[200px]">
                        <p className="text-[11px] font-medium text-muted-foreground">
                          {new Date(d.timestamp).toLocaleString("de-DE", { timeZone: TZ, weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                        </p>
                        <div className="mt-1.5 flex items-baseline gap-1">
                          <span className="text-xl font-bold tabular-nums">{d.powerKw.toFixed(2).replace(".", ",")}</span>
                          <span className="text-sm font-medium text-muted-foreground">kW</span>
                          <span className="ml-1 text-xs text-muted-foreground">({d.powerW.toLocaleString("de-DE")} W)</span>
                        </div>
                        {d.activeDevices.length > 0 ? (
                          <div className="mt-2.5 border-t border-border/40 pt-2 space-y-1">
                            {d.activeDevices.map((dev) => {
                              const cfg = DEVICE_CONFIG.find((c) => c.label === dev);
                              return (
                                <div key={dev} className="flex items-center gap-2 text-xs">
                                  <span
                                    className="h-2 w-2 rounded-full shrink-0"
                                    style={{ backgroundColor: cfg?.color ?? "#888" }}
                                  />
                                  <span className="font-medium">{dev}</span>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="mt-2 text-[11px] text-muted-foreground/70">Standby — keine Geräte aktiv</p>
                        )}
                      </div>
                    );
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="powerKw"
                  stroke="#ef4444"
                  strokeWidth={1.5}
                  fill="url(#powerGradKw)"
                  dot={false}
                  activeDot={{
                    r: 4,
                    stroke: "#ef4444",
                    strokeWidth: 2,
                    fill: "white",
                  }}
                  animationDuration={600}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Device activity timeline */}
          {activeDeviceKeys.length > 0 && (
            <div className="space-y-0.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground mb-2">
                Geräteaktivität
              </p>
              {activeDeviceKeys.map(({ key, shortLabel, label, color }) => (
                <div key={key} className="flex items-center gap-2.5 group">
                  <span
                    className="text-[10px] font-semibold w-12 text-right shrink-0 truncate"
                    style={{ color }}
                    title={label}
                  >
                    {shortLabel}
                  </span>
                  <div className="flex-1 h-3 rounded bg-muted/30 overflow-hidden flex relative">
                    {chartData.map((d, i) => (
                      <div
                        key={i}
                        className="h-full"
                        style={{
                          flex: 1,
                          backgroundColor: d[key] ? color : "transparent",
                          opacity: d[key] ? 0.8 : 0,
                        }}
                      />
                    ))}
                  </div>
                </div>
              ))}
              {/* Time axis labels for timeline */}
              <div className="flex items-center gap-2.5">
                <span className="w-12 shrink-0" />
                <div className="flex-1 flex justify-between">
                  {chartData.length > 0 && (
                    <>
                      <span className="text-[9px] text-muted-foreground/60">{formatTimeTick(chartData[0].timestamp)}</span>
                      <span className="text-[9px] text-muted-foreground/60">{formatTimeTick(chartData[chartData.length - 1].timestamp)}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
