"use client";

import { Card, CardContent } from "@/components/ui/card";
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
  children?: React.ReactNode;
}

const statusConfig = {
  ok: {
    badge: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-500/20",
    label: "OK",
    dot: "bg-emerald-500",
  },
  warn: {
    badge: "bg-amber-500/10 text-amber-700 dark:text-amber-400 ring-1 ring-amber-500/20",
    label: "Achtung",
    dot: "bg-amber-500",
  },
  critical: {
    badge: "bg-red-500/10 text-red-700 dark:text-red-400 ring-1 ring-red-500/20",
    label: "Kritisch",
    dot: "bg-red-500",
  },
};

function freshnessClass(subtitle?: string): string {
  if (!subtitle) return "text-muted-foreground";
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
  children,
}: StatusCardProps) {
  if (variant === "hero") {
    return (
      <Card className="relative overflow-hidden card-glow group">
        {/* Gradient wash */}
        {accentColor && (
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.05] transition-opacity duration-500 group-hover:opacity-[0.08]"
            style={{
              background: `radial-gradient(ellipse at top left, ${accentColor} 0%, transparent 70%)`,
            }}
          />
        )}
        {/* Accent line */}
        {accentColor && (
          <div
            className="absolute top-0 left-0 right-0 h-[2px]"
            style={{ background: `linear-gradient(90deg, ${accentColor}, transparent)` }}
          />
        )}
        <CardContent className="relative pt-5 pb-5">
          <div className="flex items-start justify-between mb-3">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {title}
            </span>
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg"
              style={{ backgroundColor: accentColor ? `${accentColor}15` : undefined }}
            >
              <Icon
                className="h-4.5 w-4.5"
                style={{ color: accentColor || "var(--color-primary)" }}
              />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="font-heading text-5xl font-bold tabular-nums tracking-tight">
              {value}
            </span>
            {unit && (
              <span className="text-lg font-medium text-muted-foreground">{unit}</span>
            )}
          </div>
          <div className="mt-3 flex items-center gap-2.5">
            {status && (
              <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold", statusConfig[status].badge)}>
                {status === "critical" && (
                  <span className={cn("h-1.5 w-1.5 rounded-full animate-pulse", statusConfig[status].dot)} />
                )}
                {statusConfig[status].label}
              </span>
            )}
            {subtitle && (
              <span className={cn("flex items-center gap-1.5 text-xs font-medium", freshnessClass(subtitle))}>
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-subtle-pulse" />
                {subtitle}
              </span>
            )}
          </div>
          {children}
        </CardContent>
      </Card>
    );
  }

  if (variant === "compact") {
    return (
      <Card size="sm" className="card-glow">
        <CardContent className="pt-3 pb-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              {title}
            </span>
            <Icon className="h-3.5 w-3.5 text-muted-foreground/70" />
          </div>
          <div className="flex items-baseline gap-1">
            <span className="font-heading text-2xl font-bold tabular-nums">{value}</span>
            {unit && (
              <span className="text-sm font-medium text-muted-foreground">{unit}</span>
            )}
          </div>
          {(status || subtitle) && (
            <div className="mt-1.5 flex items-center gap-2">
              {status && (
                <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-px text-[10px] font-semibold", statusConfig[status].badge)}>
                  {statusConfig[status].label}
                </span>
              )}
              {subtitle && (
                <span className="text-[10px] font-medium text-muted-foreground">{subtitle}</span>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // Standard variant — with accent left border
  return (
    <Card
      className={cn("relative card-glow", accentColor && "border-l-[3px]")}
      style={accentColor ? { borderLeftColor: accentColor } : undefined}
    >
      <CardContent className="pt-5 pb-5">
        <div className="flex items-start justify-between mb-2">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {title}
          </span>
          <Icon className="h-4 w-4 text-muted-foreground/60" />
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="font-heading text-3xl font-bold tabular-nums">{value}</span>
          {unit && (
            <span className="text-base font-medium text-muted-foreground">{unit}</span>
          )}
        </div>
        <div className="mt-2 flex items-center gap-2">
          {status && (
            <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold", statusConfig[status].badge)}>
              {status === "critical" && (
                <span className={cn("h-1.5 w-1.5 rounded-full animate-pulse", statusConfig[status].dot)} />
              )}
              {statusConfig[status].label}
            </span>
          )}
          {subtitle && (
            <span className={cn("text-xs font-medium", freshnessClass(subtitle))}>
              {subtitle}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
