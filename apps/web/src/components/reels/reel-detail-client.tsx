"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Loader2,
  ArrowLeft,
  Save,
  Sparkles,
  Film,
  Download,
  RefreshCw,
  Trash2,
  Plus,
} from "lucide-react";
import { useJobsStream } from "@/lib/use-jobs-stream";
import { cn } from "@/lib/utils";

type ReelStatus =
  | "draft"
  | "downloading"
  | "transcribing"
  | "generating"
  | "ready"
  | "broll_rendering"
  | "broll_ready"
  | "failed";

interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}
interface ReelBlock {
  script: string;
  est_duration_s: number;
  broll: {
    in_s: number;
    out_s: number;
    zoom: { x: number; y: number; scale: number };
    reason?: string;
  } | null;
}
interface ReelStoryboard {
  hook: string;
  blocks: ReelBlock[];
}
interface ReelDetail {
  id: number;
  title: string | null;
  youtubeUrl: string;
  angle: string;
  sourceVideoId: number | null;
  storyboard: ReelStoryboard | null;
  hook: string | null;
  brollKeys: Array<string | null> | null;
  status: ReelStatus;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}
interface SourceVideoDetail {
  id: number;
  youtubeId: string;
  title: string | null;
  channel: string | null;
  durationS: number | null;
  status: string;
  transcript: TranscriptSegment[] | null;
  error: string | null;
}

const STATUS_LABEL: Record<ReelStatus, string> = {
  draft: "Brouillon",
  downloading: "Téléchargement…",
  transcribing: "Transcription…",
  generating: "Script…",
  ready: "Script prêt",
  broll_rendering: "B-roll en cours…",
  broll_ready: "B-roll prêt",
  failed: "Échoué",
};
const STATUS_CLASS: Record<ReelStatus, string> = {
  draft: "bg-surface-2 text-text-muted",
  downloading: "bg-blue-500/10 text-blue-600",
  transcribing: "bg-blue-500/10 text-blue-600",
  generating: "bg-blue-500/10 text-blue-600",
  ready: "bg-accent/10 text-accent",
  broll_rendering: "bg-blue-500/10 text-blue-600",
  broll_ready: "bg-green-500/10 text-green-600",
  failed: "bg-red-500/10 text-red-600",
};

function fmt(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function ReelDetailClient({ reelId }: { reelId: number }) {
  const [reel, setReel] = React.useState<ReelDetail | null>(null);
  const [sourceVideo, setSourceVideo] = React.useState<SourceVideoDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [draft, setDraft] = React.useState<ReelStoryboard | null>(null);
  const [dirty, setDirty] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const fetchReel = React.useCallback(async () => {
    try {
      const res = await fetch(`/api/reels/${reelId}`);
      if (!res.ok) {
        if (res.status === 404) toast.error("Reel introuvable");
        return;
      }
      const json = (await res.json()) as { item: ReelDetail; sourceVideo: SourceVideoDetail | null };
      setReel(json.item);
      setSourceVideo(json.sourceVideo);
      // Only reset draft if user hasn't edited — avoids clobbering in-progress edits.
      setDraft((prev) => (prev && dirty ? prev : json.item.storyboard));
    } finally {
      setLoading(false);
    }
  }, [reelId, dirty]);

  React.useEffect(() => {
    setLoading(true);
    void fetchReel();
  }, [fetchReel]);

  useJobsStream((evt) => {
    if (
      (evt.type === "completed" || evt.type === "failed" || evt.type === "started") &&
      typeof (evt as { queue?: string }).queue === "string"
    ) {
      const q = (evt as { queue: string }).queue;
      if (q.startsWith("yt-") || q.startsWith("reel-")) {
        if (evt.type === "completed" && q === "reel-generate") toast.success("Script généré");
        if (evt.type === "completed" && q === "reel-extract-broll") toast.success("B-roll prêt");
        if (evt.type === "failed") toast.error(`Échec ${q} : ${evt.error}`);
        setTimeout(() => void fetchReel(), 250);
      }
    }
  });

  function patchBlock(idx: number, patch: Partial<ReelBlock>) {
    setDraft((prev) => {
      if (!prev) return prev;
      const blocks = prev.blocks.map((b, i) => (i === idx ? { ...b, ...patch } : b));
      return { ...prev, blocks };
    });
    setDirty(true);
  }
  function patchBroll(idx: number, patch: Partial<NonNullable<ReelBlock["broll"]>>) {
    setDraft((prev) => {
      if (!prev) return prev;
      const blocks = prev.blocks.map((b, i) => {
        if (i !== idx || !b.broll) return b;
        const broll = { ...b.broll, ...patch };
        if (patch.zoom) broll.zoom = { ...b.broll.zoom, ...patch.zoom };
        return { ...b, broll };
      });
      return { ...prev, blocks };
    });
    setDirty(true);
  }
  function patchHook(hook: string) {
    setDraft((prev) => (prev ? { ...prev, hook } : prev));
    setDirty(true);
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/reels/${reelId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storyboard: draft }),
      });
      if (!res.ok) {
        toast.error("Échec sauvegarde");
        return;
      }
      toast.success("Sauvegardé");
      setDirty(false);
      void fetchReel();
    } finally {
      setSaving(false);
    }
  }

  async function regenerateScript() {
    const res = await fetch(`/api/reels/${reelId}/regenerate-script`, { method: "POST" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(json.error || "Échec");
      return;
    }
    toast.success("Génération relancée");
    setDirty(false);
    setTimeout(() => void fetchReel(), 200);
  }

  async function renderBroll() {
    if (dirty) {
      if (!confirm("Modifications non sauvegardées seront perdues. Continuer ?")) return;
    }
    const res = await fetch(`/api/reels/${reelId}/render-broll`, { method: "POST" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(json.error || "Échec");
      return;
    }
    toast.success("Extraction du B-roll lancée");
    setTimeout(() => void fetchReel(), 200);
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-text-muted">
        <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
      </div>
    );
  }
  if (!reel) {
    return <div className="text-sm text-text-muted">Reel introuvable.</div>;
  }

  const totalDuration = draft
    ? Math.min(85, Math.max(2, draft.hook.split(/\s+/).length / 2.5)) +
      draft.blocks.reduce((acc, b) => acc + b.est_duration_s, 0)
    : 0;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href="/reels"
            className="mb-1 inline-flex items-center gap-1 text-xs text-text-muted hover:text-text"
          >
            <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.5} /> Reels
          </Link>
          <h1 className="truncate text-xl font-semibold tracking-tight">
            {reel.title || reel.hook || `Reel #${reel.id}`}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-text-muted">
            <a
              href={reel.youtubeUrl}
              target="_blank"
              rel="noreferrer"
              className="truncate hover:text-accent"
            >
              {reel.youtubeUrl}
            </a>
            {sourceVideo && (
              <span>
                · {sourceVideo.channel} · {sourceVideo.durationS ? fmt(sourceVideo.durationS) : "?"}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
              STATUS_CLASS[reel.status]
            )}
          >
            {(reel.status === "downloading" ||
              reel.status === "transcribing" ||
              reel.status === "generating" ||
              reel.status === "broll_rendering") && (
              <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2} />
            )}
            {STATUS_LABEL[reel.status]}
          </span>
          {reel.error && (
            <span className="rounded bg-red-500/10 px-2 py-1 text-xs text-red-500" title={reel.error}>
              Erreur
            </span>
          )}
        </div>
      </header>

      <div className="grid grid-cols-12 gap-4">
        {/* Left: transcript */}
        <section className="col-span-12 space-y-2 lg:col-span-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            Transcription
          </h3>
          <div className="max-h-[70vh] overflow-y-auto rounded-md border border-border bg-surface p-3 text-xs">
            {!sourceVideo && <p className="text-text-muted">Pas de source vidéo.</p>}
            {sourceVideo && sourceVideo.status !== "ready" && (
              <p className="text-text-muted">
                Source : {sourceVideo.status}
                {sourceVideo.error && ` · ${sourceVideo.error}`}
              </p>
            )}
            {sourceVideo?.transcript?.map((s, i) => (
              <div key={i} className="mb-1.5 leading-relaxed">
                <span className="mr-2 font-mono text-[10px] text-text-muted">
                  {fmt(s.start)}
                </span>
                {s.text}
              </div>
            ))}
            {sourceVideo?.transcript && sourceVideo.transcript.length === 0 && (
              <p className="text-text-muted">Transcription vide.</p>
            )}
          </div>
        </section>

        {/* Middle: storyboard editor */}
        <section className="col-span-12 space-y-3 lg:col-span-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
              Storyboard
            </h3>
            {draft && (
              <span className="text-xs text-text-muted">
                ~{totalDuration.toFixed(1)}s · {draft.blocks.length} blocs
              </span>
            )}
          </div>
          {!draft ? (
            <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-text-muted">
              {reel.status === "downloading" ||
              reel.status === "transcribing" ||
              reel.status === "generating"
                ? "Pipeline en cours…"
                : reel.status === "failed"
                ? `Échec : ${reel.error ?? "?"}`
                : "Storyboard vide. Lance la génération."}
            </div>
          ) : (
            <>
              <div className="rounded-md border border-border bg-surface p-3">
                <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-text-muted">
                  Hook
                </label>
                <textarea
                  value={draft.hook}
                  onChange={(e) => patchHook(e.target.value)}
                  rows={2}
                  className="w-full resize-y rounded-md border border-border bg-surface-2 px-2 py-1.5 text-sm focus:border-accent focus:outline-none"
                />
              </div>
              {draft.blocks.map((b, i) => (
                <div key={i} className="rounded-md border border-border bg-surface p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold text-text-body">Bloc {i + 1}</span>
                    <span className="text-[10px] text-text-muted">
                      {b.est_duration_s.toFixed(1)}s
                      {b.broll && ` · src ${fmt(b.broll.in_s)}–${fmt(b.broll.out_s)}`}
                    </span>
                  </div>
                  <textarea
                    value={b.script}
                    onChange={(e) => patchBlock(i, { script: e.target.value })}
                    rows={3}
                    className="mb-2 w-full resize-y rounded-md border border-border bg-surface-2 px-2 py-1.5 text-sm focus:border-accent focus:outline-none"
                  />
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <label className="flex flex-col gap-0.5">
                      <span className="text-[10px] uppercase text-text-muted">durée (s)</span>
                      <input
                        type="number"
                        step={0.5}
                        min={1}
                        max={30}
                        value={b.est_duration_s}
                        onChange={(e) =>
                          patchBlock(i, { est_duration_s: Number(e.target.value) || 0 })
                        }
                        className="rounded-md border border-border bg-surface-2 px-2 py-1 focus:border-accent focus:outline-none"
                      />
                    </label>
                    {b.broll && (
                      <>
                        <label className="flex flex-col gap-0.5">
                          <span className="text-[10px] uppercase text-text-muted">in_s</span>
                          <input
                            type="number"
                            step={0.5}
                            min={0}
                            value={b.broll.in_s}
                            onChange={(e) =>
                              patchBroll(i, { in_s: Number(e.target.value) || 0 })
                            }
                            className="rounded-md border border-border bg-surface-2 px-2 py-1 focus:border-accent focus:outline-none"
                          />
                        </label>
                        <label className="flex flex-col gap-0.5">
                          <span className="text-[10px] uppercase text-text-muted">out_s</span>
                          <input
                            type="number"
                            step={0.5}
                            min={0}
                            value={b.broll.out_s}
                            onChange={(e) =>
                              patchBroll(i, { out_s: Number(e.target.value) || 0 })
                            }
                            className="rounded-md border border-border bg-surface-2 px-2 py-1 focus:border-accent focus:outline-none"
                          />
                        </label>
                        <label className="flex flex-col gap-0.5">
                          <span className="text-[10px] uppercase text-text-muted">zoom (1–3)</span>
                          <input
                            type="number"
                            step={0.1}
                            min={1}
                            max={3}
                            value={b.broll.zoom.scale}
                            onChange={(e) =>
                              patchBroll(i, {
                                zoom: { ...b.broll!.zoom, scale: Number(e.target.value) || 1 },
                              })
                            }
                            className="rounded-md border border-border bg-surface-2 px-2 py-1 focus:border-accent focus:outline-none"
                          />
                        </label>
                      </>
                    )}
                  </div>
                  {b.broll?.reason && (
                    <p className="mt-2 text-[11px] italic text-text-muted">
                      « {b.broll.reason} »
                    </p>
                  )}
                </div>
              ))}
            </>
          )}
        </section>

        {/* Right: actions */}
        <aside className="col-span-12 space-y-2 lg:col-span-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Actions</h3>
          <div className="space-y-2 rounded-md border border-border bg-surface p-3">
            <button
              onClick={() => void save()}
              disabled={!dirty || saving || !draft}
              className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-fg hover:bg-accent-hover disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
              ) : (
                <Save className="h-4 w-4" strokeWidth={1.5} />
              )}
              Sauvegarder
            </button>
            <button
              onClick={() => void regenerateScript()}
              disabled={
                !sourceVideo ||
                sourceVideo.status !== "ready" ||
                reel.status === "generating" ||
                reel.status === "broll_rendering"
              }
              className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm hover:bg-surface-2 disabled:opacity-50"
            >
              <Sparkles className="h-4 w-4" strokeWidth={1.5} />
              Régénérer le script
            </button>
            <button
              onClick={() => void renderBroll()}
              disabled={
                !draft ||
                draft.blocks.length === 0 ||
                reel.status === "broll_rendering" ||
                reel.status === "generating"
              }
              className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm hover:bg-surface-2 disabled:opacity-50"
            >
              <Film className="h-4 w-4" strokeWidth={1.5} />
              Extraire le B-roll
            </button>
            <a
              href={`/api/reels/${reelId}/export-zip`}
              className={cn(
                "inline-flex w-full items-center justify-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm hover:bg-surface-2",
                reel.status !== "broll_ready" && "pointer-events-none opacity-50"
              )}
            >
              <Download className="h-4 w-4" strokeWidth={1.5} />
              Télécharger zip
            </a>
          </div>

          {reel.brollKeys && reel.brollKeys.length > 0 && (
            <div className="rounded-md border border-border bg-surface p-3 text-xs">
              <h4 className="mb-2 text-[10px] font-semibold uppercase text-text-muted">B-roll keys</h4>
              <ul className="space-y-1">
                {reel.brollKeys.map((k, i) => (
                  <li
                    key={i}
                    className={cn(
                      "truncate font-mono text-[10px]",
                      k ? "text-text-body" : "text-text-muted"
                    )}
                    title={k ?? "(aucun)"}
                  >
                    block-{i + 1}: {k ?? "—"}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
