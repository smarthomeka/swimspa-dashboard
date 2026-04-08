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

function formatDateLabel(d: string) {
  const dt = new Date(d);
  return dt.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
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
  const [powerData, setPowerData] = useState<Reading[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [energyRes, powerRes] = await Promise.all([
          fetch(`/api/readings?type=energy&days=${days}`),
          fetch(
            `/api/readings?type=history&source=shelly&metric=power_w&days=${days}`
          ),
        ]);
        if (!energyRes.ok || !powerRes.ok) throw new Error(`HTTP ${energyRes.status}`);
        const energy: EnergyDay[] = await energyRes.json();
        setPowerData(await powerRes.json());

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
  const totalCost = totalKwh * 0.3;

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
            <p className="text-[11px] font-medium text-muted-foreground mt-1">
              bei 0,30 EUR/kWh
            </p>
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

      {/* Live power area chart */}
      <Card className="card-glow">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <span className="h-2 w-2 rounded-full bg-red-500" />
            Leistungsverlauf (Watt) — letzte {days} Tage
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-48 sm:h-64 lg:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={powerData}>
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
                  width={45}
                />
                <Tooltip
                  content={
                    <ChartTooltip
                      formatter={(v: number) => [
                        `${Math.round(Number(v))} W`,
                        "Leistung",
                      ]}
                    />
                  }
                  labelFormatter={(v) =>
                    new Date(v).toLocaleString("de-DE")
                  }
                />
                <Area
                  type="monotone"
                  dataKey="value"
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
        </CardContent>
      </Card>
    </div>
  );
}
