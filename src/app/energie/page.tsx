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
} from "recharts";
import { Zap, TrendingDown, Receipt, AlertTriangle } from "lucide-react";

interface EnergyDay {
  date: string;
  maxKwh: number;
  minKwh: number;
  avgPowerW: number;
}

interface Reading {
  id: number;
  value: number;
  timestamp: string;
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

const TZ = "Europe/Vienna";

function formatDateLabel(d: string) {
  const dt = new Date(d);
  return dt.toLocaleDateString("de-DE", { timeZone: TZ, day: "2-digit", month: "2-digit" });
}

function ChartTooltip({ active, payload, label, formatter }: any) {
  if (!active || !payload?.length) return null;
  const [formattedValue, labelText] = formatter(payload[0].value);
  return (
    <div className="rounded-xl border border-border/50 bg-card px-4 py-2.5 shadow-xl card-glow">
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-bold tabular-nums">
        {formattedValue}
        <span className="ml-1.5 text-xs font-medium text-muted-foreground">{labelText}</span>
      </p>
    </div>
  );
}

export default function EnergyPage() {
  const [days, setDays] = useState<number>(30);
  const [dailyData, setDailyData] = useState<
    Array<{ date: string; kwh: number; avgW: number }>
  >([]);
  const [powerData, setPowerData] = useState<PowerDetail[]>([]);
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
        setPowerData(await powerRes.json());
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

  const gridStroke = "oklch(0.88 0.005 185)";
  const tickFill = "oklch(0.48 0.02 185)";

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
                  content={
                    <ChartTooltip
                      formatter={(v: number) => [
                        `${Number(v).toFixed(1).replace(".", ",")} kWh`,
                        "Verbrauch",
                      ]}
                    />
                  }
                  labelFormatter={(v) =>
                    new Date(v).toLocaleDateString("de-DE", {
                      timeZone: TZ,
                      weekday: "short",
                      day: "2-digit",
                      month: "2-digit",
                    })
                  }
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

      {/* Live power area chart with device state */}
      <Card className="card-glow">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <span className="h-2 w-2 rounded-full bg-red-500" />
            Leistungsverlauf (Watt) — letzte {days} Tage
          </CardTitle>
          {/* Legend */}
          <div className="flex flex-wrap gap-3 mt-1">
            {[
              { label: "Heizung", color: "#ef4444" },
              { label: "Jet-Pumpe 1", color: "#3b82f6" },
              { label: "Jet-Pumpe 2", color: "#8b5cf6" },
              { label: "Swim-Jet", color: "#06b6d4" },
              { label: "Zirkulation", color: "#10b981" },
              { label: "Gebläse", color: "#f59e0b" },
            ].map((item) => (
              <span key={item.label} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: item.color }} />
                {item.label}
              </span>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-64 sm:h-80 lg:h-96">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={powerData} margin={{ bottom: 30 }}>
                <defs>
                  <linearGradient id="powerGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ef4444" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#ef4444" stopOpacity={0.01} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  horizontal={true}
                  vertical={false}
                  stroke={gridStroke}
                />
                <XAxis
                  dataKey="timestamp"
                  tickFormatter={(v) => {
                    const d = new Date(v);
                    return d.toLocaleString("de-DE", {
                      timeZone: TZ,
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    });
                  }}
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
                  width={50}
                  tickFormatter={(v) => `${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}`}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0]?.payload as PowerDetail | undefined;
                    if (!d) return null;
                    const devices: string[] = [];
                    if (d.heating) devices.push("Heizung");
                    if (d.pumpP1) devices.push("Jet-Pumpe 1");
                    if (d.pumpP2) devices.push("Jet-Pumpe 2");
                    if (d.pumpP3) devices.push("Swim-Jet");
                    if (d.circPump) devices.push("Zirkulation");
                    if (d.blower) devices.push("Gebläse");
                    return (
                      <div className="rounded-xl border border-border/50 bg-card px-4 py-3 shadow-xl card-glow min-w-[180px]">
                        <p className="text-[11px] font-medium text-muted-foreground">
                          {new Date(label).toLocaleString("de-DE", { timeZone: TZ })}
                        </p>
                        <p className="mt-1 text-lg font-bold tabular-nums text-red-500">
                          {d.powerW.toLocaleString("de-DE")} W
                        </p>
                        {devices.length > 0 ? (
                          <div className="mt-2 border-t border-border/50 pt-2 space-y-0.5">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Aktive Geräte</p>
                            {devices.map((dev) => (
                              <p key={dev} className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                {dev}
                              </p>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-1 text-[10px] text-muted-foreground">Keine Geräte aktiv</p>
                        )}
                      </div>
                    );
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="powerW"
                  stroke="#ef4444"
                  strokeWidth={1.5}
                  fill="url(#powerGrad)"
                  dot={false}
                  activeDot={{
                    r: 4,
                    stroke: "white",
                    strokeWidth: 2,
                    fill: "#ef4444",
                  }}
                  animationDuration={800}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          {/* Device state timeline below chart */}
          {powerData.length > 0 && (
            <div className="mt-4 space-y-1.5">
              {[
                { key: "heating" as const, label: "Heizung", color: "#ef4444" },
                { key: "pumpP1" as const, label: "Jet 1", color: "#3b82f6" },
                { key: "pumpP2" as const, label: "Jet 2", color: "#8b5cf6" },
                { key: "pumpP3" as const, label: "Swim", color: "#06b6d4" },
                { key: "circPump" as const, label: "Zirk.", color: "#10b981" },
              ].map(({ key, label, color }) => {
                const hasAnyActive = powerData.some((d) => d[key]);
                if (!hasAnyActive) return null;
                return (
                  <div key={key} className="flex items-center gap-2">
                    <span className="text-[10px] font-medium text-muted-foreground w-10 text-right shrink-0">
                      {label}
                    </span>
                    <div className="flex-1 h-2.5 rounded-full bg-muted/50 overflow-hidden flex">
                      {powerData.map((d, i) => (
                        <div
                          key={i}
                          className="h-full transition-colors"
                          style={{
                            flex: 1,
                            backgroundColor: d[key] ? color : "transparent",
                            opacity: d[key] ? 0.7 : 0,
                          }}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
