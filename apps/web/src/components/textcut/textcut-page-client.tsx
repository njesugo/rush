"use client";

import * as React from "react";
import { toast } from "sonner";
import { Loader2, Sparkles, Download, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type TextCutStatus = "queued" | "rendering" | "ready" | "failed";

interface TextCutItem {
  id: number;
  word: string;
  language: "fr" | "en";
  status: TextCutStatus;
  renderedVideoKey: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

const STATUS_LABEL: Record<TextCutStatus, string> = {
  queued: "En file…",
  rendering: "Rendu en cours…",
  ready: "MP4 prêt",
  failed: "Échoué",
};

const STATUS_CLASS: Record<TextCutStatus, string> = {
  queued: "bg-surface-2 text-text-muted",
  rendering: "bg-blue-500/10 text-blue-600",
  ready: "bg-green-500/10 text-green-600",
  failed: "bg-red-500/10 text-red-600",
};

export function TextCutPageClient() {
  const [items, setItems] = React.useState<TextCutItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [word, setWord] = React.useState("");
  const [language, setLanguage] = React.useState<"fr" | "en">("fr");
  const [submitting, setSubmitting] = React.useState(false);

  const fetchItems = React.useCallback(async () => {
    try {
      const res = await fetch("/api/textcut");
      if (!res.ok) return;
      const json = (await res.json()) as { items: TextCutItem[] };
      setItems(json.items);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    setLoading(true);
    void fetchItems();
  }, [fetchItems]);

  // Poll every 3s if anything is in flight.
  React.useEffect(() => {
    const inflight = items.some((i) => i.status === "queued" || i.status === "rendering");
    if (!inflight) return;
    const t = setInterval(() => void fetchItems(), 3000);
    return () => clearInterval(t);
  }, [items, fetchItems]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const w = word.trim();
    if (!w) {
      toast.error("Mot requis");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/textcut", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word: w, language }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(j.error || "Erreur");
        return;
      }
      toast.success("Vidéo en file");
      setWord("");
      void fetchItems();
    } finally {
      setSubmitting(false);
    }
  };

  const onDownload = async (id: number) => {
    const res = await fetch(`/api/textcut/${id}`);
    if (!res.ok) {
      toast.error("Téléchargement impossible");
      return;
    }
    const j = (await res.json()) as { url?: string };
    if (!j.url) {
      toast.error("MP4 non prêt");
      return;
    }
    window.open(j.url, "_blank");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Text Match Cut</h1>
          <p className="text-sm text-text-muted">
            Génère une vidéo virale 9:16 (3 s) où ton mot reste verrouillé pendant que tout change autour.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void fetchItems()}>
          <RefreshCw className="h-4 w-4" />
          Rafraîchir
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" /> Nouveau text-cut
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-text-muted">
                Mot ou expression (max 40 caractères)
              </label>
              <input
                type="text"
                value={word}
                onChange={(e) => setWord(e.target.value)}
                maxLength={40}
                placeholder="amour, café noir, productivité…"
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-base outline-none focus:ring-2 focus:ring-accent/40"
                autoFocus
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-text-muted">Langue</label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as "fr" | "en")}
                className="rounded-md border border-border bg-surface px-3 py-2 text-base outline-none focus:ring-2 focus:ring-accent/40"
              >
                <option value="fr">Français</option>
                <option value="en">English</option>
              </select>
            </div>
            <Button type="submit" disabled={submitting || !word.trim()}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Générer
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Historique</CardTitle>
        </CardHeader>
        <CardContent className="divide-y divide-border">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-text-muted">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : items.length === 0 ? (
            <div className="py-8 text-center text-sm text-text-muted">Aucune vidéo pour l&apos;instant.</div>
          ) : (
            items.map((it) => (
              <div key={it.id} className="flex items-center justify-between py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-text-muted">#{it.id}</span>
                    <span className="truncate font-medium">{it.word}</span>
                    <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] uppercase text-text-muted">
                      {it.language}
                    </span>
                  </div>
                  {it.error ? (
                    <div className="mt-1 truncate text-xs text-red-600" title={it.error}>
                      {it.error}
                    </div>
                  ) : (
                    <div className="mt-1 text-xs text-text-muted">
                      {new Date(it.createdAt).toLocaleString()}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", STATUS_CLASS[it.status])}>
                    {STATUS_LABEL[it.status]}
                  </span>
                  {it.status === "ready" ? (
                    <Button size="sm" variant="outline" onClick={() => void onDownload(it.id)}>
                      <Download className="h-4 w-4" /> MP4
                    </Button>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
