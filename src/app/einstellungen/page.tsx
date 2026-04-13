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
  DatabaseZap,
  Trash2,
  AlertTriangle,
  HardDrive,
  Info,
  RefreshCw,
  Receipt,
  Plus,
  X,
  Clock,
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
    description: "Lokale Verbindung — Wassertemperatur, Pumpenstatus",
    icon: Thermometer,
    accentColor: "#ef4444",
    fields: [
      { key: "host", label: "IP-Adresse", placeholder: "z.B. 192.168.1.50 oder 10.10.20.241" },
    ],
  },
  {
    key: "labcom",
    label: "Labcom PoolLab",
    description: "Wasserchemie — pH, Brom, Alkalinität",
    icon: FlaskConical,
    accentColor: "#8b5cf6",
    fields: [
      { key: "apiUrl", label: "API URL", placeholder: "https://backend.labcom.cloud/graphql" },
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

type GeckoStatus = {
  configured: boolean;
  host: string | null;
  polling: boolean;
  spaName: string | null;
  lastReading: {
    temperature: number | null;
    setPoint: number | null;
    heatingStatus: string | null;
    pumps: { id: string; active: boolean }[];
  } | null;
  lastSyncAt: string | null;
  error: string | null;
};

type GeckoStatusProps = { geckoStatus: GeckoStatus | null };

type SystemInfo = {
  version: string;
  dbSizeBytes: number;
  counts: {
    readings: number;
    dosingLogs: number;
    recommendations: number;
    dosingResponses: number;
  };
};

type ProviderStatus = {
  configured: boolean;
  polling: boolean;
  lastSyncAt: string | null;
  error: string | null;
};

function GeckoStatusDisplay({ geckoStatus }: GeckoStatusProps) {
  if (!geckoStatus?.polling || !geckoStatus.lastReading) return null;
  const temp = geckoStatus.lastReading.temperature;
  const setPoint = geckoStatus.lastReading.setPoint;
  const pumpActive = geckoStatus.lastReading.pumps?.some(p => p.active);
  return (
    <div className="grid grid-cols-3 gap-3 rounded-xl border border-border/50 bg-muted/30 p-3">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Temperatur</p>
        <p className="text-lg font-semibold font-heading">
          {temp != null ? `${temp.toFixed(1)}°C` : "–"}
        </p>
      </div>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Sollwert</p>
        <p className="text-lg font-semibold font-heading">
          {setPoint != null ? `${setPoint.toFixed(1)}°C` : "–"}
        </p>
      </div>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Pumpe</p>
        <p className={`text-lg font-semibold font-heading ${pumpActive ? "text-emerald-500" : ""}`}>
          {pumpActive ? "Aktiv" : "Aus"}
        </p>
      </div>
    </div>
  );
}

function ProviderCard({
  meta,
  data,
  onChange,
  onSave,
  saving,
  saved,
  geckoStatus,
}: {
  meta: ProviderMeta;
  data: { enabled: boolean; config: Record<string, string> };
  onChange: (provider: string, enabled: boolean, config: Record<string, string>) => void;
  onSave: (provider: string) => void;
  saving: boolean;
  saved: boolean;
  geckoStatus?: GeckoStatus | null;
}) {
  const Icon = meta.icon;
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncSuccess, setSyncSuccess] = useState(false);
  const [providerStatus, setProviderStatus] = useState<ProviderStatus | null>(null);
  const [diagnosing, setDiagnosing] = useState(false);
  const [diagnoseResult, setDiagnoseResult] = useState<{ steps: { step: string; status: string; detail: string; durationMs: number }[]; success: boolean } | null>(null);

  const isGecko = meta.key === "gecko";
  const syncEndpoint = isGecko ? "/api/gecko/sync" : meta.key === "labcom" ? "/api/labcom/sync" : meta.key === "shelly" ? "/api/shelly/sync" : null;
  const statusEndpoint = isGecko ? "/api/gecko/status" : meta.key === "labcom" ? "/api/labcom/status" : null;

  // Load status on mount if enabled
  useEffect(() => {
    if (!data.enabled || !statusEndpoint) return;
    fetch(statusEndpoint)
      .then((r) => r.ok ? r.json() : null)
      .then((s) => { if (s) setProviderStatus(s); })
      .catch(() => {});
  }, [data.enabled, statusEndpoint]);

  const handleSync = useCallback(async () => {
    if (!syncEndpoint) return;
    setSyncing(true);
    setSyncError(null);
    setSyncSuccess(false);
    try {
      const res = await fetch(syncEndpoint, { method: "POST" });
      const json = await res.json();
      if (!res.ok || json.error) {
        setSyncError(json.error ?? `HTTP ${res.status}`);
      } else {
        setSyncSuccess(true);
        setTimeout(() => setSyncSuccess(false), 3000);
        // Refresh status
        if (statusEndpoint) {
          const sr = await fetch(statusEndpoint);
          if (sr.ok) setProviderStatus(await sr.json());
        }
      }
    } catch (err: any) {
      setSyncError(err.message ?? "Verbindungsfehler");
    } finally {
      setSyncing(false);
    }
  }, [syncEndpoint, statusEndpoint]);

  const handleDiagnose = useCallback(async () => {
    setDiagnosing(true);
    setDiagnoseResult(null);
    try {
      const res = await fetch("/api/gecko/diagnose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host: data.config.host }),
      });
      const json = await res.json();
      if (json.steps) setDiagnoseResult(json);
      else setSyncError(json.error ?? "Diagnose fehlgeschlagen");
    } catch (err: any) {
      setSyncError(err.message ?? "Diagnose fehlgeschlagen");
    } finally {
      setDiagnosing(false);
    }
  }, [data.config.host]);

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
          {isGecko && geckoStatus && <GeckoStatusDisplay geckoStatus={geckoStatus} />}

          {(isGecko && geckoStatus?.error) && (
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3">
              <p className="text-xs text-destructive">{geckoStatus.error}</p>
            </div>
          )}

          {syncError && (
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3">
              <p className="text-xs text-destructive">{syncError}</p>
            </div>
          )}

          {syncSuccess && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
              <p className="text-xs text-emerald-700 dark:text-emerald-400">Verbindung erfolgreich — Daten werden synchronisiert.</p>
            </div>
          )}

          {providerStatus?.polling && providerStatus.lastSyncAt && (
            <p className="text-[10px] text-muted-foreground">
              Letzte Synchronisierung: {new Date(providerStatus.lastSyncAt).toLocaleString("de-DE", { timeZone: "Europe/Vienna" })}
            </p>
          )}

          <div className="flex flex-wrap gap-2 mt-3">
            <Button
              size="sm"
              onClick={() => onSave(meta.key)}
              disabled={saving}
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
            {syncEndpoint && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleSync}
                disabled={syncing || saving}
              >
                {syncing ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-1.5 h-4 w-4" />
                )}
                {syncing ? "Synchronisiere..." : providerStatus?.polling ? "Aktualisieren" : "Verbinden"}
              </Button>
            )}
            {isGecko && data.config.host && (
              <Button
                size="sm"
                variant="ghost"
                onClick={handleDiagnose}
                disabled={diagnosing}
              >
                {diagnosing ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Info className="mr-1.5 h-4 w-4" />
                )}
                {diagnosing ? "Prüfe..." : "Diagnose"}
              </Button>
            )}
          </div>

          {diagnoseResult && (
            <div className="rounded-xl border border-border/50 bg-muted/30 p-3 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Verbindungsdiagnose</p>
              {diagnoseResult.steps.map((s, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <span className={s.status === "ok" ? "text-emerald-500" : "text-destructive"}>
                    {s.status === "ok" ? "✓" : "✗"}
                  </span>
                  <span className="text-muted-foreground flex-1">{s.detail}</span>
                  <span className="text-muted-foreground/60 tabular-nums">{s.durationMs}ms</span>
                </div>
              ))}
              <p className={`text-xs font-medium ${diagnoseResult.success ? "text-emerald-500" : "text-destructive"}`}>
                {diagnoseResult.success ? "Verbindung erfolgreich" : "Verbindung fehlgeschlagen"}
              </p>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

type Tariff = {
  name: string;
  pricePerKwh: number;
  startHour: number;
  endHour: number;
};

function TariffSection() {
  const [tariffs, setTariffs] = useState<Tariff[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/tariffs")
      .then((r) => r.json())
      .then((data) => {
        setTariffs(data.tariffs ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/tariffs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tariffs }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Fehler beim Speichern");
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch {
      setError("Verbindungsfehler");
    } finally {
      setSaving(false);
    }
  }, [tariffs]);

  const addTariff = useCallback(() => {
    setTariffs((prev) => [
      ...prev,
      { name: "", pricePerKwh: 0.3, startHour: 0, endHour: 0 },
    ]);
  }, []);

  const removeTariff = useCallback((index: number) => {
    setTariffs((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updateTariff = useCallback(
    (index: number, field: keyof Tariff, value: string | number) => {
      setTariffs((prev) =>
        prev.map((t, i) => (i === index ? { ...t, [field]: value } : t))
      );
    },
    []
  );

  if (loading) return null;

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <Receipt className="h-5 w-5 text-primary" />
        <h2 className="font-heading text-xl font-semibold">Stromtarife</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Konfiguriere Strompreise pro kWh und Zeitfenster (z.B. Hochtarif / Niedertarif).
        Die Kostenberechnung auf der Energieseite verwendet diese Tarife.
      </p>

      <div className="space-y-3">
        {tariffs.map((tariff, i) => (
          <Card key={i} className="card-glow relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-emerald-500 to-transparent" />
            <CardContent className="pt-5 pb-4">
              <div className="flex items-start justify-between gap-3">
                <div className="grid gap-3 flex-1 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Tarifname
                    </label>
                    <input
                      type="text"
                      value={tariff.name}
                      onChange={(e) => updateTariff(i, "name", e.target.value)}
                      placeholder="z.B. Hochtarif (HT)"
                      className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Preis (EUR/kWh)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={tariff.pricePerKwh}
                      onChange={(e) =>
                        updateTariff(i, "pricePerKwh", parseFloat(e.target.value) || 0)
                      }
                      className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      <Clock className="inline h-3 w-3 mr-1" />
                      Von (Stunde)
                    </label>
                    <select
                      value={tariff.startHour}
                      onChange={(e) =>
                        updateTariff(i, "startHour", parseInt(e.target.value))
                      }
                      className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all"
                    >
                      {Array.from({ length: 24 }, (_, h) => (
                        <option key={h} value={h}>
                          {String(h).padStart(2, "0")}:00
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      <Clock className="inline h-3 w-3 mr-1" />
                      Bis (Stunde)
                    </label>
                    <select
                      value={tariff.endHour}
                      onChange={(e) =>
                        updateTariff(i, "endHour", parseInt(e.target.value))
                      }
                      className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all"
                    >
                      {Array.from({ length: 24 }, (_, h) => (
                        <option key={h} value={h}>
                          {String(h).padStart(2, "0")}:00
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                {tariffs.length > 1 && (
                  <button
                    onClick={() => removeTariff(i)}
                    className="mt-6 shrink-0 rounded-lg p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    title="Tarif entfernen"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              {tariff.startHour === tariff.endHour && (
                <p className="mt-2 text-[10px] text-muted-foreground">
                  Gleiche Start- und Endzeit = gilt ganztägig (24h)
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3">
          <p className="text-xs text-destructive">{error}</p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={addTariff}>
          <Plus className="mr-1.5 h-4 w-4" />
          Tarif hinzufügen
        </Button>
        <Button size="sm" onClick={handleSave} disabled={saving || tariffs.length === 0}>
          {saving ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : saved ? (
            <Check className="mr-1.5 h-4 w-4" />
          ) : (
            <Save className="mr-1.5 h-4 w-4" />
          )}
          {saved ? "Gespeichert" : "Tarife speichern"}
        </Button>
      </div>
    </section>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

export default function EinstellungenPage() {
  const [settings, setSettings] = useState<SettingsData>({});
  const [loading, setLoading] = useState(true);
  const [savingProvider, setSavingProvider] = useState<string | null>(null);
  const [savedProvider, setSavedProvider] = useState<string | null>(null);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [seedingData, setSeedingData] = useState(false);
  const [clearingData, setClearingData] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [seedSuccess, setSeedSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [geckoStatus, setGeckoStatus] = useState<GeckoStatus | null>(null);

  const loadSystemInfo = useCallback(() => {
    fetch("/api/system")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setSystemInfo)
      .catch(() => {});
  }, []);

  const loadGeckoStatus = useCallback(() => {
    fetch("/api/gecko/status")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setGeckoStatus)
      .catch(() => {});
  }, []);

  useEffect(() => {
    Promise.all([
      fetch("/api/settings").then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }),
      fetch("/api/system").then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }),
      fetch("/api/gecko/status").then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }).catch(() => null),
    ]).then(([settingsData, sysData, geckoData]) => {
      setSettings(settingsData);
      setSystemInfo(sysData);
      if (geckoData) setGeckoStatus(geckoData);
      setLoading(false);
    }).catch((err) => {
      setError(err.message ?? "Verbindungsfehler");
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

      // Auto-trigger sync/connect after saving if provider is enabled
      if (s.enabled) {
        if (provider === "gecko" && s.config.host) {
          // Gecko: use connect endpoint which saves host + syncs + starts polling
          fetch("/api/gecko/connect", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ host: s.config.host }),
          }).then(() => loadGeckoStatus()).catch(() => {});
        } else {
          const syncUrl =
            provider === "labcom" ? "/api/labcom/sync" :
            provider === "shelly" ? "/api/shelly/sync" :
            null;
          if (syncUrl) {
            fetch(syncUrl, { method: "POST" }).catch(() => {});
          }
        }
      }
    },
    [settings, loadGeckoStatus]
  );

  const handleSeedData = useCallback(async () => {
    setSeedingData(true);
    setSeedSuccess(null);
    await fetch("/api/seed", { method: "POST" });
    setSeedingData(false);
    setSeedSuccess("loaded");
    loadSystemInfo();
    setTimeout(() => setSeedSuccess(null), 3000);
  }, [loadSystemInfo]);

  const handleClearData = useCallback(async () => {
    setClearingData(true);
    setSeedSuccess(null);
    await fetch("/api/seed", { method: "DELETE" });
    setClearingData(false);
    setShowClearConfirm(false);
    setSeedSuccess("cleared");
    loadSystemInfo();
    setTimeout(() => setSeedSuccess(null), 3000);
  }, [loadSystemInfo]);

  const configuredCount = Object.values(settings).filter((s) => s.enabled).length;
  const totalRecords = systemInfo
    ? systemInfo.counts.readings + systemInfo.counts.dosingLogs + systemInfo.counts.recommendations + systemInfo.counts.dosingResponses
    : 0;

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

  if (error) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-6 w-6 text-destructive" />
          </div>
          <p className="text-sm font-medium text-destructive">Einstellungen konnten nicht geladen werden</p>
          <p className="text-xs text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-10 animate-fade-up">
      <div>
        <h1 className="font-heading text-4xl font-semibold tracking-tight sm:text-5xl">
          Einstellungen
        </h1>
        <p className="mt-1 text-base text-muted-foreground">
          Testdaten, API-Verbindungen und Systeminformationen verwalten.
        </p>
      </div>

      {/* ── Section: Testdaten ── */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <DatabaseZap className="h-5 w-5 text-primary" />
          <h2 className="font-heading text-xl font-semibold">Testdaten</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Lade realistische Demo-Daten (90 Tage Sensormesswerte, Dosierungsprotokolle) oder lösche alle gespeicherten Daten.
        </p>

        {seedSuccess && (
          <div className={`rounded-xl border p-3 ${
            seedSuccess === "loaded"
              ? "border-emerald-500/20 bg-emerald-500/5"
              : "border-amber-500/20 bg-amber-500/5"
          }`}>
            <p className={`text-sm font-semibold ${
              seedSuccess === "loaded"
                ? "text-emerald-700 dark:text-emerald-400"
                : "text-amber-700 dark:text-amber-400"
            }`}>
              {seedSuccess === "loaded"
                ? "Testdaten wurden erfolgreich geladen."
                : "Alle Daten wurden gelöscht."}
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <Button
            onClick={handleSeedData}
            disabled={seedingData || clearingData}
          >
            {seedingData ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <DatabaseZap className="mr-1.5 h-4 w-4" />
            )}
            {seedingData ? "Lade Testdaten..." : "Testdaten laden"}
          </Button>

          {!showClearConfirm ? (
            <Button
              variant="outline"
              onClick={() => setShowClearConfirm(true)}
              disabled={seedingData || clearingData || totalRecords === 0}
            >
              <Trash2 className="mr-1.5 h-4 w-4" />
              Alle Daten löschen
            </Button>
          ) : (
            <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-2">
              <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
              <span className="text-sm font-medium text-destructive">Wirklich alle Daten löschen?</span>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleClearData}
                disabled={clearingData}
              >
                {clearingData ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : null}
                Ja, löschen
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowClearConfirm(false)}
                disabled={clearingData}
              >
                Abbrechen
              </Button>
            </div>
          )}
        </div>

        {systemInfo && (
          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span>{systemInfo.counts.readings.toLocaleString("de-DE")} Messwerte</span>
            <span>{systemInfo.counts.dosingLogs.toLocaleString("de-DE")} Dosierungen</span>
            <span>{systemInfo.counts.recommendations.toLocaleString("de-DE")} KI-Empfehlungen</span>
          </div>
        )}
      </section>

      {/* ── Section: API-Verbindungen ── */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Radio className="h-5 w-5 text-primary" />
          <h2 className="font-heading text-xl font-semibold">API-Verbindungen</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          {configuredCount === 0
            ? "Keine APIs konfiguriert — das Dashboard zeigt Demo-Daten an."
            : `${configuredCount} von ${PROVIDERS.length} APIs aktiv.`}
        </p>

        {configuredCount === 0 && (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
            <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
              Demo-Modus aktiv
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
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
              geckoStatus={meta.key === "gecko" ? geckoStatus : undefined}
            />
          ))}
        </div>
      </section>

      {/* ── Section: Spa-Grunddaten ── */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Thermometer className="h-5 w-5 text-primary" />
          <h2 className="font-heading text-xl font-semibold">Spa-Grunddaten</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Grundlegende Informationen über deinen Swim Spa — werden im KI-Prompt berücksichtigt.
        </p>

        <Card className="card-glow relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-cyan-500 to-transparent" />
          <CardContent className="pt-6 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Volumen (Liter)
                </label>
                <input
                  type="number"
                  min="0"
                  step="100"
                  value={settings.spa?.config?.volumeLiters ?? ""}
                  onChange={(e) =>
                    handleChange("spa", true, {
                      ...(settings.spa?.config ?? {}),
                      volumeLiters: e.target.value,
                    })
                  }
                  placeholder="z.B. 7300"
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground tabular-nums placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Standort
                </label>
                <input
                  type="text"
                  value={settings.spa?.config?.location ?? ""}
                  onChange={(e) =>
                    handleChange("spa", true, {
                      ...(settings.spa?.config ?? {}),
                      location: e.target.value,
                    })
                  }
                  placeholder="z.B. Terrasse, Garten, Innenraum"
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Abdeckung
                </label>
                <select
                  value={settings.spa?.config?.covered ?? "covered"}
                  onChange={(e) =>
                    handleChange("spa", true, {
                      ...(settings.spa?.config ?? {}),
                      covered: e.target.value,
                    })
                  }
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all"
                >
                  <option value="covered">Abgedeckt (mit Abdeckung)</option>
                  <option value="open">Offen (ohne Abdeckung)</option>
                  <option value="partial">Teilweise abgedeckt</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Gecko Abfrageintervall
                </label>
                <select
                  value={settings.spa?.config?.pollInterval ?? "15"}
                  onChange={(e) =>
                    handleChange("spa", true, {
                      ...(settings.spa?.config ?? {}),
                      pollInterval: e.target.value,
                    })
                  }
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all"
                >
                  <option value="5">Alle 5 Sekunden</option>
                  <option value="10">Alle 10 Sekunden</option>
                  <option value="15">Alle 15 Sekunden</option>
                  <option value="30">Alle 30 Sekunden</option>
                  <option value="60">Jede Minute</option>
                </select>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Wie oft Pumpen, Heizung &amp; Temperatur vom Gecko in.Touch abgefragt werden
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => handleSave("spa")}
                disabled={savingProvider === "spa"}
              >
                {savingProvider === "spa" ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : savedProvider === "spa" ? (
                  <Check className="mr-1.5 h-4 w-4" />
                ) : (
                  <Save className="mr-1.5 h-4 w-4" />
                )}
                {savedProvider === "spa" ? "Gespeichert" : "Speichern"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* ── Section: Stromtarife ── */}
      <TariffSection />

      {/* ── Section: System ── */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Info className="h-5 w-5 text-primary" />
          <h2 className="font-heading text-xl font-semibold">System</h2>
        </div>

        <Card className="card-glow">
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">App-Version</p>
                <p className="text-lg font-semibold font-heading">{systemInfo?.version ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Datenbankgröße</p>
                <div className="flex items-center gap-2">
                  <HardDrive className="h-4 w-4 text-muted-foreground" />
                  <p className="text-lg font-semibold font-heading">{systemInfo ? formatBytes(systemInfo.dbSizeBytes) : "—"}</p>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Datensätze gesamt</p>
                <p className="text-lg font-semibold font-heading">{totalRecords.toLocaleString("de-DE")}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
