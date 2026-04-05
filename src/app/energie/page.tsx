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
    <div className="rounded-xl border border-border/50 bg-card px-3 py-2 shadow-lg">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-semibold">{formattedValue} — {labelText}</p>
    </div>
  );
}

export default function EnergyPage() {
  const [days, setDays] = useState<number>(30);
  const [dailyData, setDailyData] = useState<
    Array<{ date: string; kwh: number; avgW: number }>
  >([]);
  const [powerData, setPowerData] = useState<Reading[]>([]);

  useEffect(() => {
    async function load() {
      const [energyRes, powerRes] = await Promise.all([
        fetch(`/api/readings?type=energy&days=${days}`),
        fetch(
          `/api/readings?type=history&source=shelly&metric=power_w&days=${Math.min(days, 7)}`
        ),
      ]);
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
    }
    load();
  }, [days]);

  const totalKwh = dailyData.reduce((sum, d) => sum + d.kwh, 0);
  const avgDaily = dailyData.length > 0 ? totalKwh / dailyData.length : 0;
  const totalCost = totalKwh * 0.3;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Energieverbrauch</h1>
        <p className="text-base text-muted-foreground">
          Shelly 3EM &mdash; Stromverbrauch und Kosten
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
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Gesamtverbrauch
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-3xl font-extrabold tabular-nums">
              {totalKwh.toFixed(0).replace(".", ",")}
            </span>
            <span className="ml-1.5 text-base text-muted-foreground">kWh</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Durchschnitt / Tag
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-3xl font-extrabold tabular-nums">
              {avgDaily.toFixed(1).replace(".", ",")}
            </span>
            <span className="ml-1.5 text-base text-muted-foreground">kWh</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Geschätzte Kosten
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-3xl font-extrabold tabular-nums">
              {totalCost.toFixed(0).replace(".", ",")}
            </span>
            <span className="ml-1.5 text-base text-muted-foreground">EUR</span>
            <p className="text-xs text-muted-foreground mt-1">
              bei 0,30 EUR/kWh
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Daily consumption bar chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Täglicher Verbrauch (kWh)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-48 sm:h-64 lg:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyData}>
                <defs>
                  <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.9} />
                    <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.4} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  horizontal={true}
                  vertical={false}
                  stroke="oklch(0.9 0 0)"
                />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatDateLabel}
                  fontSize={12}
                  interval="preserveStartEnd"
                  tick={{ fill: "oklch(0.5 0 0)" }}
                />
                <YAxis fontSize={12} tick={{ fill: "oklch(0.5 0 0)" }} />
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
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Leistungsverlauf (Watt) &mdash; letzte{" "}
            {Math.min(days, 7)} Tage
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-48 sm:h-64 lg:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={powerData}>
                <defs>
                  <linearGradient id="powerGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ef4444" stopOpacity={0.15} />
                    <stop offset="100%" stopColor="#ef4444" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  horizontal={true}
                  vertical={false}
                  stroke="oklch(0.9 0 0)"
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
                  fontSize={11}
                  interval="preserveStartEnd"
                  tick={{ fill: "oklch(0.5 0 0)" }}
                />
                <YAxis fontSize={12} tick={{ fill: "oklch(0.5 0 0)" }} />
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
                  strokeWidth={2}
                  fill="url(#powerGrad)"
                  dot={false}
                  activeDot={{
                    r: 5,
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
