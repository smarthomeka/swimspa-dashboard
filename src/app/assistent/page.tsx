"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Bot, RefreshCw, Send, Clock, AlertCircle, Sparkles } from "lucide-react";

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
    let line = lines[i];

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
  const [generating, setGenerating] = useState(false);
  const [question, setQuestion] = useState("");
  const [promptLoading, setPromptLoading] = useState(true);
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
      if (data.prompt) setQuestion(data.prompt);
    } catch {
      // Silently fail — user can still type manually
    } finally {
      setPromptLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
    loadAutoPrompt();
  }, [loadHistory, loadAutoPrompt]);

  async function generateAnalysis(message?: string) {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: message || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Fehler bei der Analyse.");
        return;
      }
      setRecommendations((prev) => [
        { id: data.id, text: data.text, model: data.model, timestamp: data.timestamp },
        ...prev,
      ]);
      loadAutoPrompt();
    } catch {
      setError("Verbindungsfehler. Bitte erneut versuchen.");
    } finally {
      setGenerating(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    generateAnalysis(question || undefined);
  }

  return (
    <div className="space-y-8 animate-fade-up">
      <div>
        <h1 className="font-heading text-4xl font-semibold tracking-tight sm:text-5xl">
          KI-Assistent
        </h1>
        <p className="mt-1 text-base text-muted-foreground">
          Intelligente Empfehlungen für Wasserqualität und Energieverbrauch
        </p>
      </div>

      {/* Action Bar */}
      <Card className="card-glow relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-primary to-transparent" />
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <Sparkles className="mr-1.5 inline h-3 w-3" />
                Auto-generierter Prompt
              </label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={loadAutoPrompt}
                disabled={promptLoading || generating}
                className="h-7 text-xs"
              >
                <RefreshCw className={`mr-1 h-3 w-3 ${promptLoading ? "animate-spin" : ""}`} />
                Neu generieren
              </Button>
            </div>
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={promptLoading ? "Prompt wird generiert..." : "Frage stellen oder Prompt anpassen..."}
              disabled={generating || promptLoading}
              rows={8}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm leading-relaxed ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-y"
            />
            <div className="flex justify-end">
              <Button type="submit" disabled={generating || promptLoading || !question.trim()}>
                {generating ? (
                  <RefreshCw className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-1.5 h-4 w-4" />
                )}
                {generating ? "Analysiert..." : "Analyse starten"}
              </Button>
            </div>
          </form>
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

      {/* Recommendations */}
      {loading && recommendations.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-4">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
            <p className="text-sm font-medium text-muted-foreground">Lade Empfehlungen...</p>
          </div>
        </div>
      ) : recommendations.length === 0 ? (
        <Card className="card-glow">
          <CardContent className="py-16 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
              <Bot className="h-7 w-7 text-primary/60" />
            </div>
            <p className="text-sm text-muted-foreground">
              Noch keine Analysen vorhanden. Starte eine Tagesanalyse, um Empfehlungen zu erhalten.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-5">
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
