"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatusCardProps {
  title: string;
  value: string | number;
  unit?: string;
  icon: LucideIcon;
  status?: "ok" | "warn" | "critical";
  subtitle?: string;
  variant?: "hero" | "standard" | "compact";
  accentColor?: string;
}

const statusColors = {
  ok: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  warn: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  critical: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

const statusLabels = {
  ok: "OK",
  warn: "Achtung",
  critical: "Kritisch",
};

function freshnessClass(subtitle?: string): string {
  if (!subtitle) return "text-muted-foreground";
  // Check for "vor X Min." pattern — green if recent
  const minMatch = subtitle.match(/vor (\d+) Min/);
  if (minMatch) {
    const mins = parseInt(minMatch[1]);
    if (mins <= 5) return "text-emerald-600 dark:text-emerald-400";
    if (mins <= 30) return "text-amber-600 dark:text-amber-400";
    return "text-red-600 dark:text-red-400";
  }
  const hrsMatch = subtitle.match(/vor (\d+) Std/);
  if (hrsMatch) return "text-amber-600 dark:text-amber-400";
  if (subtitle.includes("Tagen")) return "text-red-600 dark:text-red-400";
  return "text-muted-foreground";
}

export function StatusCard({
  title,
  value,
  unit,
  icon: Icon,
  status,
  subtitle,
  variant = "standard",
  accentColor,
}: StatusCardProps) {
  if (variant === "hero") {
    return (
      <Card className="relative overflow-hidden">
        {accentColor && (
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.06]"
            style={{
              background: `linear-gradient(135deg, ${accentColor} 0%, transparent 60%)`,
            }}
          />
        )}
        <CardHeader className="flex flex-row items-center justify-between pb-1">
          <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {title}
          </CardTitle>
          <Icon className="h-5 w-5 text-primary" />
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline gap-2">
            <span className="text-5xl font-extrabold tabular-nums tracking-tight">{value}</span>
            {unit && (
              <span className="text-lg text-muted-foreground">{unit}</span>
            )}
          </div>
          <div className="mt-2 flex items-center gap-2">
            {status && (
              <Badge variant="secondary" className={statusColors[status]}>
                {status === "critical" && (
                  <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
                )}
                {statusLabels[status]}
              </Badge>
            )}
            {subtitle && (
              <span className={cn("flex items-center gap-1.5 text-xs", freshnessClass(subtitle))}>
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                {subtitle}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (variant === "compact") {
    return (
      <Card size="sm">
        <CardHeader className="flex flex-row items-center justify-between pb-1">
          <CardTitle className="text-xs font-medium text-muted-foreground">
            {title}
          </CardTitle>
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-bold tabular-nums">{value}</span>
            {unit && (
              <span className="text-sm text-muted-foreground">{unit}</span>
            )}
          </div>
          {(status || subtitle) && (
            <div className="mt-1 flex items-center gap-2">
              {status && (
                <Badge variant="secondary" className={cn("text-[10px]", statusColors[status])}>
                  {statusLabels[status]}
                </Badge>
              )}
              {subtitle && (
                <span className="text-[10px] text-muted-foreground">{subtitle}</span>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // Standard variant
  return (
    <Card
      className={cn(
        "relative",
        accentColor && "border-l-4"
      )}
      style={accentColor ? { borderLeftColor: accentColor } : undefined}
    >
      <CardHeader className="flex flex-row items-center justify-between pb-1">
        <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline gap-1.5">
          <span className="text-3xl font-extrabold tabular-nums">{value}</span>
          {unit && (
            <span className="text-base text-muted-foreground">{unit}</span>
          )}
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          {status && (
            <Badge variant="secondary" className={statusColors[status]}>
              {status === "critical" && (
                <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
              )}
              {statusLabels[status]}
            </Badge>
          )}
          {subtitle && (
            <span className={cn("text-xs", freshnessClass(subtitle))}>
              {subtitle}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
