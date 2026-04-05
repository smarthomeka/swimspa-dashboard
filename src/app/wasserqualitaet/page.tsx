"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  LineChart,
  Line,
  Area,
  AreaChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceArea,
  ReferenceLine,
} from "recharts";

interface Reading {
  id: number;
  source: string;
  metric: string;
  value: number;
  unit: string;
  timestamp: string;
}

function formatDateLabel(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
}

const METRICS = [
  {
    key: "ph",
    label: "pH-Wert",
    source: "labcom",
    metric: "ph",
    color: "#3b82f6",
    safeRange: { y1: 7.2, y2: 7.6, label: "Idealbereich" },
    domain: [6.5, 8.0] as [number, number],
  },
  {
    key: "bromine",
    label: "Brom (mg/l)",
    source: "labcom",
    metric: "bromine",
    color: "#8b5cf6",
    safeRange: { y1: 3.0, y2: 5.0, label: "Idealbereich" },
    domain: [0, 8] as [number, number],
  },
  {
    key: "alkalinity",
    label: "Alkalinität (mg/l)",
    source: "labcom",
    metric: "alkalinity",
    color: "#10b981",
    safeRange: { y1: 80, y2: 120, label: "Idealbereich" },
    domain: [40, 200] as [number, number],
  },
  {
    key: "orp",
    label: "ORP / Redox (mV)",
    source: "blueconnect",
    metric: "orp",
    color: "#f97316",
    minLine: { y: 650, label: "Min" },
    domain: [500, 850] as [number, number],
  },
  {
    key: "temperature",
    label: "Temperatur (°C)",
    source: "gecko",
    metric: "temperature",
    color: "#ef4444",
    safeRange: { y1: 36, y2: 39, label: "Idealbereich" },
    domain: [34, 41] as [number, number],
  },
];

function CustomTooltip({ active, payload, label, metricLabel, color }: any) {
  if (!active || !payload?.length) return null;
  const val = payload[0].value;
  return (
    <div className="rounded-xl border border-border/50 bg-card px-3 py-2 shadow-lg">
      <p className="text-xs text-muted-foreground">
        {new Date(label).toLocaleString("de-DE")}
      </p>
      <p className="mt-0.5 text-sm font-semibold" style={{ color }}>
        {Number(val).toFixed(2).replace(".", ",")} — {metricLabel}
      </p>
    </div>
  );
}

export default function WaterQualityPage() {
  const [days, setDays] = useState<number>(7);
  const [data, setData] = useState<Record<string, Reading[]>>({});

  useEffect(() => {
    async function load() {
      const results: Record<string, Reading[]> = {};
      await Promise.all(
        METRICS.map(async (m) => {
          const res = await fetch(
            `/api/readings?type=history&source=${m.source}&metric=${m.metric}&days=${days}`
          );
          results[m.key] = await res.json();
        })
      );
      setData(results);
    }
    load();
  }, [days]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Wasserqualität</h1>
        <p className="text-base text-muted-foreground">
          Detaillierte Messwerte und Trends
        </p>
      </div>

      <Tabs
        value={String(days)}
        onValueChange={(v) => setDays(Number(v))}
      >
        <TabsList>
          <TabsTrigger value="7">7 Tage</TabsTrigger>
          <TabsTrigger value="30">30 Tage</TabsTrigger>
          <TabsTrigger value="90">90 Tage</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="grid gap-6 lg:grid-cols-2">
        {METRICS.map((m) => (
          <Card key={m.key}>
            <CardHeader>
              <CardTitle className="text-base">{m.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-48 sm:h-64 lg:h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data[m.key] ?? []}>
                    <defs>
                      <linearGradient id={`grad-${m.key}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={m.color} stopOpacity={0.15} />
                        <stop offset="100%" stopColor={m.color} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      horizontal={true}
                      vertical={false}
                      stroke="oklch(0.9 0 0)"
                      strokeDasharray=""
                    />
                    <XAxis
                      dataKey="timestamp"
                      tickFormatter={formatDateLabel}
                      fontSize={12}
                      interval="preserveStartEnd"
                      tick={{ fill: "oklch(0.5 0 0)" }}
                    />
                    <YAxis
                      domain={m.domain}
                      fontSize={12}
                      tick={{ fill: "oklch(0.5 0 0)" }}
                    />
                    <Tooltip
                      content={
                        <CustomTooltip metricLabel={m.label} color={m.color} />
                      }
                    />
                    {"safeRange" in m && m.safeRange && (
                      <ReferenceArea
                        y1={m.safeRange.y1}
                        y2={m.safeRange.y2}
                        fill="#10b981"
                        fillOpacity={0.07}
                        label={{
                          value: m.safeRange.label,
                          position: "insideTopRight",
                          fontSize: 11,
                          fill: "#10b981",
                        }}
                      />
                    )}
                    {"minLine" in m && m.minLine && (
                      <ReferenceLine
                        y={m.minLine.y}
                        stroke="#f59e0b"
                        strokeDasharray="5 5"
                        label={{ value: m.minLine.label, fontSize: 11, fill: "#f59e0b" }}
                      />
                    )}
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke={m.color}
                      strokeWidth={2.5}
                      fill={`url(#grad-${m.key})`}
                      dot={false}
                      activeDot={{
                        r: 5,
                        stroke: "white",
                        strokeWidth: 2,
                        fill: m.color,
                      }}
                      animationDuration={800}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
