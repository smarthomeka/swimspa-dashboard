"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Thermometer,
  FlaskConical,
  Zap,
  Radio,
  Save,
  Check,
  Loader2,
  Eye,
  EyeOff,
} from "lucide-react";

type ProviderMeta = {
  key: string;
  label: string;
  description: string;
  icon: typeof Thermometer;
  accentColor: string;
  fields: { key: string; label: string; placeholder: string; secret?: boolean }[];
};

const PROVIDERS: ProviderMeta[] = [
  {
    key: "gecko",
    label: "Gecko in.Touch 2",
    description: "Armstark Lotus 460 Controller — Wassertemperatur, Pumpenstatus",
    icon: Thermometer,
    accentColor: "#ef4444",
    fields: [
      { key: "apiUrl", label: "API URL", placeholder: "https://api.gecko.io" },
      { key: "apiKey", label: "API Key", placeholder: "Dein Gecko API Key", secret: true },
    ],
  },
  {
    key: "labcom",
    label: "Labcom PoolLab",
    description: "Wasserchemie — pH, Brom, Alkalinität",
    icon: FlaskConical,
    accentColor: "#8b5cf6",
    fields: [
      { key: "apiUrl", label: "API URL", placeholder: "https://api.labcom.cloud" },
      { key: "apiKey", label: "API Key", placeholder: "Dein Labcom API Key", secret: true },
    ],
  },
  {
    key: "shelly",
    label: "Shelly 3EM",
    description: "Energiemonitoring — Leistung, Verbrauch",
    icon: Zap,
    accentColor: "#ca8a04",
    fields: [
      { key: "host", label: "Host / IP", placeholder: "http://192.168.1.100" },
    ],
  },
  {
    key: "blueconnect",
    label: "BlueConnect",
    description: "ORP-Monitoring (optional)",
    icon: Radio,
    accentColor: "#f97316",
    fields: [
      { key: "apiUrl", label: "API URL", placeholder: "https://api.blueconnect.io" },
      { key: "apiKey", label: "API Key", placeholder: "Dein BlueConnect API Key", secret: true },
    ],
  },
];

type SettingsData = Record<
  string,
  { enabled: boolean; config: Record<string, string> }
>;

function ProviderCard({
  meta,
  data,
  onChange,
  onSave,
  saving,
  saved,
}: {
  meta: ProviderMeta;
  data: { enabled: boolean; config: Record<string, string> };
  onChange: (provider: string, enabled: boolean, config: Record<string, string>) => void;
  onSave: (provider: string) => void;
  saving: boolean;
  saved: boolean;
}) {
  const Icon = meta.icon;
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});

  return (
    <Card className={`card-glow relative overflow-hidden transition-all duration-300 ${data.enabled ? "ring-1 ring-primary/20" : ""}`}>
      {data.enabled && (
        <div
          className="absolute top-0 left-0 right-0 h-[2px]"
          style={{ background: `linear-gradient(90deg, ${meta.accentColor}, transparent)` }}
        />
      )}
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-xl transition-colors"
              style={{ backgroundColor: `${meta.accentColor}12` }}
            >
              <Icon className="h-5 w-5" style={{ color: meta.accentColor }} />
            </div>
            <div>
              <CardTitle className="text-base">{meta.label}</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">{meta.description}</p>
            </div>
          </div>
          <label className="relative inline-flex cursor-pointer items-center">
            <input
              type="checkbox"
              checked={data.enabled}
              onChange={(e) => onChange(meta.key, e.target.checked, data.config)}
              className="peer sr-only"
            />
            <div className="h-6 w-11 rounded-full bg-muted transition-colors after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-background after:shadow-sm after:transition-transform peer-checked:bg-primary peer-checked:after:translate-x-5" />
          </label>
        </div>
      </CardHeader>
      {data.enabled && (
        <CardContent className="space-y-3 pt-0">
          {meta.fields.map((field) => (
            <div key={field.key}>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {field.label}
              </label>
              <div className="relative">
                <input
                  type={field.secret && !showSecrets[field.key] ? "password" : "text"}
                  value={data.config[field.key] ?? ""}
                  onChange={(e) =>
                    onChange(meta.key, data.enabled, {
                      ...data.config,
                      [field.key]: e.target.value,
                    })
                  }
                  placeholder={field.placeholder}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all"
                />
                {field.secret && (
                  <button
                    type="button"
                    onClick={() =>
                      setShowSecrets((prev) => ({
                        ...prev,
                        [field.key]: !prev[field.key],
                      }))
                    }
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showSecrets[field.key] ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                )}
              </div>
            </div>
          ))}
          <Button
            size="sm"
            onClick={() => onSave(meta.key)}
            disabled={saving}
            className="mt-3"
          >
            {saving ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : saved ? (
              <Check className="mr-1.5 h-4 w-4" />
            ) : (
              <Save className="mr-1.5 h-4 w-4" />
            )}
            {saved ? "Gespeichert" : "Speichern"}
          </Button>
        </CardContent>
      )}
    </Card>
  );
}

export default function EinstellungenPage() {
  const [settings, setSettings] = useState<SettingsData>({});
  const [loading, setLoading] = useState(true);
  const [savingProvider, setSavingProvider] = useState<string | null>(null);
  const [savedProvider, setSavedProvider] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        setSettings(data);
        setLoading(false);
      });
  }, []);

  const handleChange = useCallback(
    (provider: string, enabled: boolean, config: Record<string, string>) => {
      setSettings((prev) => ({
        ...prev,
        [provider]: { enabled, config },
      }));
    },
    []
  );

  const handleSave = useCallback(
    async (provider: string) => {
      const s = settings[provider];
      if (!s) return;
      setSavingProvider(provider);
      setSavedProvider(null);
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          enabled: s.enabled,
          config: s.config,
        }),
      });
      setSavingProvider(null);
      setSavedProvider(provider);
      setTimeout(() => setSavedProvider(null), 2000);
    },
    [settings]
  );

  const configuredCount = Object.values(settings).filter((s) => s.enabled).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
          <p className="text-sm font-medium text-muted-foreground">Lade Einstellungen...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-up">
      <div>
        <h1 className="font-heading text-4xl font-semibold tracking-tight sm:text-5xl">
          Einstellungen
        </h1>
        <p className="mt-1 text-base text-muted-foreground">
          API-Verbindungen konfigurieren.{" "}
          {configuredCount === 0
            ? "Aktuell werden Demo-Daten angezeigt."
            : `${configuredCount} von ${PROVIDERS.length} APIs aktiv.`}
        </p>
      </div>

      {configuredCount === 0 && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
          <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
            Demo-Modus aktiv
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Keine APIs konfiguriert — das Dashboard zeigt simulierte Testdaten an.
            Aktiviere eine oder mehrere APIs um Live-Daten zu sehen.
          </p>
        </div>
      )}

      <div className="grid gap-5">
        {PROVIDERS.map((meta) => (
          <ProviderCard
            key={meta.key}
            meta={meta}
            data={settings[meta.key] ?? { enabled: false, config: {} }}
            onChange={handleChange}
            onSave={handleSave}
            saving={savingProvider === meta.key}
            saved={savedProvider === meta.key}
          />
        ))}
      </div>
    </div>
  );
}
