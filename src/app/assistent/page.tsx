"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Bot, RefreshCw, Send, Clock, AlertCircle } from "lucide-react";

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
  // Simple markdown rendering for bold, headers, lists, and code
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    if (line.startsWith("## ")) {
      elements.push(
        <h3 key={i} className="mt-4 mb-1.5 text-base font-semibold">
          {renderInline(line.slice(3))}
        </h3>
      );
    } else if (line.startsWith("### ")) {
      elements.push(
        <h4 key={i} className="mt-3 mb-1 text-sm font-semibold">
          {renderInline(line.slice(4))}
        </h4>
      );
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      elements.push(
        <li key={i} className="ml-4 text-sm leading-relaxed list-disc">
          {renderInline(line.slice(2))}
        </li>
      );
    } else if (line.trim() === "") {
      elements.push(<div key={i} className="h-2" />);
    } else {
      elements.push(
        <p key={i} className="text-sm leading-relaxed">
          {renderInline(line)}
        </p>
      );
    }
  }

  return <div>{elements}</div>;
}

function renderInline(text: string): React.ReactNode {
  // Handle **bold** and `code`
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
        content: <strong key={`b${key}`}>{boldMatch[1]}</strong>,
      };
    }
    if (codeMatch?.index !== undefined) {
      if (!nextMatch || codeMatch.index < nextMatch.index) {
        nextMatch = {
          index: codeMatch.index,
          length: codeMatch[0].length,
          content: (
            <code key={`c${key}`} className="rounded bg-muted px-1 py-0.5 text-xs font-mono">
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

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

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
      // Prepend new recommendation
      setRecommendations((prev) => [
        { id: data.id, text: data.text, model: data.model, timestamp: data.timestamp },
        ...prev,
      ]);
      setQuestion("");
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
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">KI-Assistent</h1>
        <p className="text-base text-muted-foreground">
          Intelligente Empfehlungen für Wasserqualität und Energieverbrauch
        </p>
      </div>

      {/* Action Bar */}
      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="flex gap-3">
            <Input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Frage stellen oder leer lassen für Tagesanalyse..."
              disabled={generating}
              className="flex-1"
            />
            <Button type="submit" disabled={generating}>
              {generating ? (
                <RefreshCw className="mr-1.5 h-4 w-4 animate-spin" />
              ) : question ? (
                <Send className="mr-1.5 h-4 w-4" />
              ) : (
                <Bot className="mr-1.5 h-4 w-4" />
              )}
              {generating ? "Analysiert..." : question ? "Fragen" : "Tagesanalyse"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Error */}
      {error && (
        <Card className="border-destructive/50">
          <CardContent className="flex items-center gap-3 pt-6 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </CardContent>
        </Card>
      )}

      {/* Recommendations */}
      {loading && recommendations.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Lade Empfehlungen...
          </CardContent>
        </Card>
      ) : recommendations.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Bot className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
            <p className="text-muted-foreground">
              Noch keine Analysen vorhanden. Starte eine Tagesanalyse, um Empfehlungen zu erhalten.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {recommendations.map((rec) => (
            <Card key={rec.id}>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between text-sm font-medium">
                  <span className="flex items-center gap-2">
                    <Bot className="h-4 w-4 text-primary" />
                    KI-Analyse
                  </span>
                  <span className="flex items-center gap-1 text-xs font-normal text-muted-foreground">
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
