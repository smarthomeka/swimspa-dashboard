"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FlaskConical, Plus, Trash2, AlertTriangle } from "lucide-react";

interface DosingEntry {
  id: number;
  chemical: string;
  amountMl: number;
  notes: string | null;
  timestamp: string;
}

const CHEMICAL_UNITS: Record<string, string> = {
  "tubhub Bromine Granules": "g",
  "hth Spa Brom Tabs": "Stk.",
  "hth Spa Schock-Sauerstoff": "g",
  "Armstark PH+": "g",
  "Armstark PH-": "g",
  "SpaLine Calcium+": "g",
};

const TZ = "Europe/Vienna";

function formatTimestamp(iso: string) {
  return new Date(iso).toLocaleString("de-DE", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function DosingPage() {
  const [days, setDays] = useState<number>(30);
  const [filterChemical, setFilterChemical] = useState<string>("");
  const [logs, setLogs] = useState<DosingEntry[]>([]);
  const [chemicals, setChemicals] = useState<string[]>([]);

  const [chemical, setChemical] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [timestamp, setTimestamp] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const params = new URLSearchParams({ days: String(days) });
      if (filterChemical) params.set("chemical", filterChemical);
      const res = await fetch(`/api/dosing?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setLogs(data.logs);
      setChemicals(data.chemicals);
      setError(null);
    } catch (err: any) {
      setError(err.message ?? "Verbindungsfehler");
    }
  }, [days, filterChemical]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const now = new Date();
    const offset = now.getTimezoneOffset();
    const local = new Date(now.getTime() - offset * 60000);
    setTimestamp(local.toISOString().slice(0, 16));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!chemical || !amount) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/dosing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chemical,
          amountMl: parseFloat(amount),
          notes: notes || null,
          timestamp: timestamp
            ? new Date(timestamp).toISOString()
            : new Date().toISOString(),
        }),
      });
      if (res.ok) {
        setChemical("");
        setAmount("");
        setNotes("");
        const now = new Date();
        const offset = now.getTimezoneOffset();
        const local = new Date(now.getTime() - offset * 60000);
        setTimestamp(local.toISOString().slice(0, 16));
        await loadData();
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: number) {
    await fetch(`/api/dosing?id=${id}`, { method: "DELETE" });
    await loadData();
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-6 w-6 text-destructive" />
          </div>
          <p className="text-sm font-medium text-destructive">Dosierungsdaten konnten nicht geladen werden</p>
          <p className="text-xs text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-up">
      <div>
        <h1 className="font-heading text-4xl font-semibold tracking-tight sm:text-5xl">
          Dosierung
        </h1>
        <p className="mt-1 text-base text-muted-foreground">
          Chemikalien-Dosierung erfassen und verfolgen
        </p>
      </div>

      {/* Entry Form */}
      <Card className="card-glow relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-violet-500 to-transparent" />
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500/10">
              <Plus className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
            </div>
            Neue Dosierung erfassen
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-1.5">
              <Label htmlFor="chemical">Chemikalie</Label>
              <Select value={chemical} onValueChange={(v) => setChemical(v ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Auswählen..." />
                </SelectTrigger>
                <SelectContent>
                  {chemicals.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="amount">
                Menge ({chemical ? CHEMICAL_UNITS[chemical] || "ml" : "ml"})
              </Label>
              <Input
                id="amount"
                type="number"
                step="0.1"
                min="0"
                placeholder="z.B. 15"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="timestamp">Zeitpunkt</Label>
              <Input
                id="timestamp"
                type="datetime-local"
                value={timestamp}
                onChange={(e) => setTimestamp(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notes">Notizen</Label>
              <Input
                id="notes"
                placeholder="Optional..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={submitting || !chemical || !amount} className="w-full">
                <FlaskConical className="mr-1.5 h-4 w-4" />
                Erfassen
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <Tabs value={String(days)} onValueChange={(v) => setDays(Number(v))}>
          <TabsList>
            <TabsTrigger value="7">7 Tage</TabsTrigger>
            <TabsTrigger value="30">30 Tage</TabsTrigger>
            <TabsTrigger value="90">90 Tage</TabsTrigger>
          </TabsList>
        </Tabs>
        <Select value={filterChemical} onValueChange={(v) => setFilterChemical(v ?? "")}>
          <SelectTrigger>
            <SelectValue placeholder="Alle Chemikalien" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Alle Chemikalien</SelectItem>
            {chemicals.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* History Table */}
      <Card className="card-glow">
        <CardHeader>
          <CardTitle className="text-base">
            Dosierungshistorie
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {logs.length} Einträge
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <div className="py-12 text-center">
              <FlaskConical className="mx-auto mb-3 h-8 w-8 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">
                Noch keine Dosierungen erfasst.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Zeitpunkt</TableHead>
                  <TableHead>Chemikalie</TableHead>
                  <TableHead className="text-right">Menge</TableHead>
                  <TableHead>Notizen</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="text-muted-foreground tabular-nums text-sm">
                      {formatTimestamp(entry.timestamp)}
                    </TableCell>
                    <TableCell className="font-medium">{entry.chemical}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {String(entry.amountMl).replace(".", ",")}{" "}
                      {CHEMICAL_UNITS[entry.chemical] || "ml"}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-muted-foreground text-sm">
                      {entry.notes || "—"}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleDelete(entry.id)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
