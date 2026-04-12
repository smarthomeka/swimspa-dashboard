"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Bot, RefreshCw, Clock, AlertCircle, Sparkles,
  Copy, Check, ClipboardPaste, ExternalLink, ChevronDown, ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Recommendation {
  id: number;
  text: string;
  model: string;
  timestamp: string;
}

function formatTimestamp(iso: string) {
  return new Date(iso).toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function MarkdownContent({ text }: { text: string }) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("## ")) {
      elements.push(
        <h3 key={i} className="mt-5 mb-2 font-heading text-xl font-semibold">
          {renderInline(line.slice(3))}
        </h3>
      );
    } else if (line.startsWith("### ")) {
      elements.push(
        <h4 key={i} className="mt-4 mb-1.5 text-sm font-bold uppercase tracking-wider text-muted-foreground">
          {renderInline(line.slice(4))}
        </h4>
      );
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      elements.push(
        <li key={i} className="ml-4 text-sm leading-relaxed list-disc marker:text-primary/40">
          {renderInline(line.slice(2))}
        </li>
      );
    } else if (line.match(/^\d+\.\s/)) {
      elements.push(
        <li key={i} className="ml-4 text-sm leading-relaxed list-decimal marker:text-primary/40">
          {renderInline(line.replace(/^\d+\.\s/, ""))}
        </li>
      );
    } else if (line.trim() === "---") {
      elements.push(<hr key={i} className="my-3 border-border/50" />);
    } else if (line.trim() === "") {
      elements.push(<div key={i} className="h-2" />);
    } else {
      elements.push(
        <p key={i} className="text-sm leading-relaxed text-foreground/90">
          {renderInline(line)}
        </p>
      );
    }
  }

  return <div>{elements}</div>;
}

function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    const codeMatch = remaining.match(/`(.+?)`/);

    let nextMatch: { index: number; length: number; content: React.ReactNode } | null = null;

    if (boldMatch?.index !== undefined) {
      nextMatch = {
        index: boldMatch.index,
        length: boldMatch[0].length,
        content: <strong key={`b${key}`} className="font-semibold text-foreground">{boldMatch[1]}</strong>,
      };
    }
    if (codeMatch?.index !== undefined) {
      if (!nextMatch || codeMatch.index < nextMatch.index) {
        nextMatch = {
          index: codeMatch.index,
          length: codeMatch[0].length,
          content: (
            <code key={`c${key}`} className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-mono font-medium text-primary">
              {codeMatch[1]}
            </code>
          ),
        };
      }
    }

    if (nextMatch) {
      if (nextMatch.index > 0) {
        parts.push(remaining.slice(0, nextMatch.index));
      }
      parts.push(nextMatch.content);
      remaining = remaining.slice(nextMatch.index + nextMatch.length);
      key++;
    } else {
      parts.push(remaining);
      break;
    }
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>;
}

export default function AssistentPage() {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [promptLoading, setPromptLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [promptExpanded, setPromptExpanded] = useState(false);
  const [pasteMode, setPasteMode] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/assistant");
      const data = await res.json();
      setRecommendations(data.recommendations ?? []);
    } catch {
      setError("Empfehlungen konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAutoPrompt = useCallback(async () => {
    setPromptLoading(true);
    try {
      const res = await fetch("/api/assistant/prompt");
      const data = await res.json();
      if (data.prompt) setPrompt(data.prompt);
    } catch {
      // Silently fail
    } finally {
      setPromptLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
    loadAutoPrompt();
  }, [loadHistory, loadAutoPrompt]);

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback: select textarea content
      const textarea = document.querySelector("textarea");
      if (textarea) {
        textarea.select();
        document.execCommand("copy");
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }
    }
  }

  async function saveResponse() {
    if (!pasteText.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: pasteText.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Fehler beim Speichern.");
        return;
      }
      setRecommendations((prev) => [
        { id: data.id, text: data.text, model: data.model, timestamp: data.timestamp },
        ...prev,
      ]);
      setPasteText("");
      setPasteMode(false);
    } catch {
      setError("Speichern fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  }

  const promptLineCount = prompt.split("\n").length;
  const previewLines = 12;

  return (
    <div className="space-y-8 animate-fade-up">
      <div>
        <h1 className="font-heading text-4xl font-semibold tracking-tight sm:text-5xl">
          KI-Assistent
        </h1>
        <p className="mt-1 text-base text-muted-foreground">
          Kopiere den Prompt in Claude für eine Wasserchemie-Analyse
        </p>
      </div>

      {/* Step 1: Generated Prompt */}
      <Card className="card-glow relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-primary to-transparent" />
        <CardContent className="pt-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5" />
                <span>Schritt 1 — Prompt kopieren</span>
              </label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => { loadAutoPrompt(); setPromptExpanded(false); }}
                disabled={promptLoading}
                className="h-7 text-xs"
              >
                <RefreshCw className={cn("mr-1 h-3 w-3", promptLoading && "animate-spin")} />
                Aktualisieren
              </Button>
            </div>

            {/* Prompt preview */}
            <div className="relative">
              <div
                className={cn(
                  "rounded-lg border border-input bg-muted/30 px-4 py-3 text-sm leading-relaxed font-mono whitespace-pre-wrap overflow-hidden transition-all duration-300",
                  promptExpanded ? "max-h-none" : "max-h-[280px]"
                )}
              >
                {promptLoading ? (
                  <span className="text-muted-foreground animate-pulse">Prompt wird aus aktuellen Daten generiert...</span>
                ) : (
                  <MarkdownContent text={prompt} />
                )}
              </div>
              {!promptExpanded && promptLineCount > previewLines && (
                <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-background to-transparent pointer-events-none rounded-b-lg" />
              )}
            </div>

            {promptLineCount > previewLines && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setPromptExpanded(!promptExpanded)}
                className="w-full text-xs text-muted-foreground"
              >
                {promptExpanded ? <ChevronUp className="mr-1 h-3 w-3" /> : <ChevronDown className="mr-1 h-3 w-3" />}
                {promptExpanded ? "Weniger anzeigen" : `Vollständigen Prompt anzeigen (${promptLineCount} Zeilen)`}
              </Button>
            )}

            {/* Action buttons */}
            <div className="flex gap-3 pt-1">
              <Button
                onClick={copyPrompt}
                disabled={promptLoading || !prompt}
                className={cn(
                  "flex-1 h-12 text-base font-semibold transition-all duration-300",
                  copied
                    ? "bg-emerald-600 hover:bg-emerald-600 text-white"
                    : ""
                )}
              >
                {copied ? (
                  <>
                    <Check className="mr-2 h-5 w-5" />
                    In Zwischenablage kopiert!
                  </>
                ) : (
                  <>
                    <Copy className="mr-2 h-5 w-5" />
                    Prompt kopieren
                  </>
                )}
              </Button>
              <a
                href="https://claude.ai/new"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center rounded-md border border-input bg-background h-12 px-4 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                Claude öffnen
              </a>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Step 2: Paste response (optional) */}
      <Card className="card-glow relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
        <CardContent className="pt-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <ClipboardPaste className="h-3.5 w-3.5" />
                <span>Schritt 2 — Antwort speichern (optional)</span>
              </label>
            </div>

            {!pasteMode ? (
              <button
                onClick={() => setPasteMode(true)}
                className="w-full rounded-lg border-2 border-dashed border-border/60 bg-muted/20 py-6 text-center transition-all duration-200 hover:border-primary/40 hover:bg-muted/40"
              >
                <ClipboardPaste className="mx-auto mb-2 h-6 w-6 text-muted-foreground/50" />
                <p className="text-sm font-medium text-muted-foreground">
                  Claude-Antwort hier einfügen, um sie zu archivieren
                </p>
              </button>
            ) : (
              <>
                <textarea
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  placeholder="Claude-Antwort hier einfügen..."
                  rows={8}
                  autoFocus
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm leading-relaxed ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-y"
                />
                <div className="flex gap-2 justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setPasteMode(false); setPasteText(""); }}
                  >
                    Abbrechen
                  </Button>
                  <Button
                    size="sm"
                    onClick={saveResponse}
                    disabled={saving || !pasteText.trim()}
                  >
                    {saving ? (
                      <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Check className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    Speichern
                  </Button>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Error */}
      {error && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="flex items-center gap-3 pt-6 text-sm font-medium text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </CardContent>
        </Card>
      )}

      {/* History */}
      {loading && recommendations.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-4">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
            <p className="text-sm font-medium text-muted-foreground">Lade Empfehlungen...</p>
          </div>
        </div>
      ) : recommendations.length > 0 && (
        <div className="space-y-5">
          <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Gespeicherte Analysen
          </h2>
          {recommendations.map((rec) => (
            <Card key={rec.id} className="card-glow">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between text-sm font-medium">
                  <span className="flex items-center gap-2.5">
                    <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/10">
                      <Bot className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <span className="font-semibold">KI-Analyse</span>
                  </span>
                  <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {formatTimestamp(rec.timestamp)}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <MarkdownContent text={rec.text} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
