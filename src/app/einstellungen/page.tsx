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
  LogIn,
  LogOut,
  RefreshCw,
  Wifi,
  WifiOff,
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
  authenticated: boolean;
  connected: boolean;
  vesselName: string | null;
  monitorId: string | null;
  lastState: {
    temperatureZones: { temperature: number | null; setPoint: number | null; status: number }[];
    flowZones: { active: boolean; speed: number | null }[];
    connectivity: { gatewayStatus: string; vesselStatus: string };
    lastUpdated: string;
  } | null;
  error: string | null;
};

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

function GeckoCard({ geckoStatus, onRefreshStatus }: { geckoStatus: GeckoStatus | null; onRefreshStatus: () => void }) {
  const [loggingIn, setLoggingIn] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setLoggingIn(true);
    setLoginError(null);
    try {
      const res = await fetch("/api/gecko/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLoginError(data.error ?? "Login fehlgeschlagen");
        return;
      }
      setEmail("");
      setPassword("");
      onRefreshStatus();
    } catch {
      setLoginError("Verbindungsfehler");
    } finally {
      setLoggingIn(false);
    }
  }, [email, password, onRefreshStatus]);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    try {
      await fetch("/api/gecko/sync", { method: "POST" });
      onRefreshStatus();
    } finally {
      setSyncing(false);
    }
  }, [onRefreshStatus]);

  const handleDisconnect = useCallback(async () => {
    setDisconnecting(true);
    try {
      await fetch("/api/gecko/disconnect", { method: "POST" });
      onRefreshStatus();
    } finally {
      setDisconnecting(false);
    }
  }, [onRefreshStatus]);

  const isConnected = geckoStatus?.connected ?? false;
  const isAuthenticated = geckoStatus?.authenticated ?? false;
  const temp = geckoStatus?.lastState?.temperatureZones?.[0]?.temperature;
  const setPoint = geckoStatus?.lastState?.temperatureZones?.[0]?.setPoint;
  const pumpActive = geckoStatus?.lastState?.flowZones?.some(f => f.active);

  return (
    <Card className={`card-glow relative overflow-hidden transition-all duration-300 ${isConnected ? "ring-1 ring-primary/20" : ""}`}>
      {isConnected && (
        <div
          className="absolute top-0 left-0 right-0 h-[2px]"
          style={{ background: "linear-gradient(90deg, #ef4444, transparent)" }}
        />
      )}
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-xl transition-colors"
              style={{ backgroundColor: "#ef444412" }}
            >
              <Thermometer className="h-5 w-5" style={{ color: "#ef4444" }} />
            </div>
            <div>
              <CardTitle className="text-base">Gecko in.Touch 2</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {geckoStatus?.vesselName
                  ? `${geckoStatus.vesselName} — Wassertemperatur, Pumpenstatus`
                  : "Armstark Lotus 460 Controller — Wassertemperatur, Pumpenstatus"}
              </p>
            </div>
          </div>
          {isConnected ? (
            <Wifi className="h-5 w-5 text-emerald-500" />
          ) : isAuthenticated ? (
            <WifiOff className="h-5 w-5 text-amber-500" />
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {geckoStatus?.error && (
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3">
            <p className="text-xs text-destructive">{geckoStatus.error}</p>
          </div>
        )}

        {isConnected && geckoStatus?.lastState && (
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
        )}

        {!isAuthenticated && (
          <form onSubmit={handleLogin} className="space-y-2">
            {loginError && (
              <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3">
                <p className="text-xs text-destructive">{loginError}</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <input
                type="email"
                placeholder="E-Mail"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="rounded-lg border border-border/50 bg-muted/30 px-3 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
              />
              <input
                type="password"
                placeholder="Passwort"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="rounded-lg border border-border/50 bg-muted/30 px-3 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
              />
            </div>
            <Button size="sm" type="submit" disabled={loggingIn}>
              {loggingIn ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <LogIn className="mr-1.5 h-4 w-4" />
              )}
              Mit Gecko anmelden
            </Button>
          </form>
        )}

        <div className="flex flex-wrap gap-2">
          {isAuthenticated && (
            <>
              <Button size="sm" onClick={handleSync} disabled={syncing}>
                {syncing ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-1.5 h-4 w-4" />
                )}
                {isConnected ? "Aktualisieren" : "Verbinden"}
              </Button>
              {isConnected && (
                <Button size="sm" variant="outline" onClick={handleDisconnect} disabled={disconnecting}>
                  {disconnecting ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <LogOut className="mr-1.5 h-4 w-4" />
                  )}
                  Trennen
                </Button>
              )}
            </>
          )}
        </div>

        {isConnected && geckoStatus?.lastState?.lastUpdated && (
          <p className="text-[10px] text-muted-foreground">
            Letzte Aktualisierung: {new Date(geckoStatus.lastState.lastUpdated).toLocaleString("de-DE")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

type ProviderStatus = {
  configured: boolean;
  polling: boolean;
  lastSyncAt: string | null;
  error: string | null;
};

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
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncSuccess, setSyncSuccess] = useState(false);
  const [providerStatus, setProviderStatus] = useState<ProviderStatus | null>(null);

  const syncEndpoint = meta.key === "labcom" ? "/api/labcom/sync" : meta.key === "shelly" ? "/api/shelly/sync" : null;
  const statusEndpoint = meta.key === "labcom" ? "/api/labcom/status" : null;

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
              Letzte Synchronisierung: {new Date(providerStatus.lastSyncAt).toLocaleString("de-DE")}
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
          </div>
        </CardContent>
      )}
    </Card>
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

      // Auto-trigger sync after saving if provider is enabled and has config
      if (s.enabled) {
        const syncUrl =
          provider === "labcom" ? "/api/labcom/sync" :
          provider === "shelly" ? "/api/shelly/sync" :
          null;
        if (syncUrl) {
          fetch(syncUrl, { method: "POST" }).catch(() => {});
        }
      }
    },
    [settings]
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
          <GeckoCard geckoStatus={geckoStatus} onRefreshStatus={loadGeckoStatus} />
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
      </section>

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
