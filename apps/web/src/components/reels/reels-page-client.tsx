"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2, Plus, RefreshCw, Trash2, X, Film } from "lucide-react";
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

interface ReelListItem {
  id: number;
  title: string | null;
  youtubeUrl: string;
  angle: string;
  sourceVideoId: number | null;
  hook: string | null;
  status: ReelStatus;
  brollKeys: Array<string | null> | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
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

export function ReelsPageClient() {
  const [items, setItems] = React.useState<ReelListItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [showNew, setShowNew] = React.useState(false);

  const fetchItems = React.useCallback(async () => {
    try {
      const res = await fetch("/api/reels");
      if (!res.ok) return;
      const json = (await res.json()) as { items: ReelListItem[] };
      setItems(json.items);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    setLoading(true);
    void fetchItems();
  }, [fetchItems]);

  const refreshTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  useJobsStream((evt) => {
    if (
      (evt.type === "completed" || evt.type === "failed" || evt.type === "started") &&
      typeof (evt as { queue?: string }).queue === "string" &&
      (
        (evt as { queue: string }).queue.startsWith("yt-") ||
        (evt as { queue: string }).queue.startsWith("reel-")
      )
    ) {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => void fetchItems(), 200);
    }
  });

  async function handleDelete(id: number) {
    if (!confirm("Supprimer ce reel ?")) return;
    const res = await fetch(`/api/reels/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Échec suppression");
      return;
    }
    setItems((prev) => prev.filter((c) => c.id !== id));
  }

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reels</h1>
          <p className="mt-1 text-sm text-text-muted">
            {items.length} reel{items.length > 1 ? "s" : ""}
            {loading && " · chargement…"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void fetchItems()}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm hover:border-border-hover hover:bg-surface-2"
          >
            <RefreshCw className="h-4 w-4" strokeWidth={1.5} />
            Rafraîchir
          </button>
          <button
            onClick={() => setShowNew(true)}
            className="inline-flex items-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-fg hover:bg-accent-hover"
          >
            <Plus className="h-4 w-4" strokeWidth={1.5} />
            Nouveau reel
          </button>
        </div>
      </header>

      {items.length === 0 && !loading ? (
        <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-border py-16 text-center">
          <Film className="h-8 w-8 text-text-muted" strokeWidth={1.25} />
          <div>
            <p className="text-sm font-medium">Aucun reel pour l'instant</p>
            <p className="text-xs text-text-muted">Crée ton premier reel depuis une vidéo YouTube.</p>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Hook / titre</th>
                <th className="px-4 py-2 font-medium">Angle</th>
                <th className="px-4 py-2 font-medium">Statut</th>
                <th className="px-4 py-2 font-medium">B-roll</th>
                <th className="px-4 py-2 font-medium">Créé</th>
                <th className="px-4 py-2 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((it) => {
                const brollDone = (it.brollKeys ?? []).filter(Boolean).length;
                const brollTotal = it.brollKeys?.length ?? 0;
                return (
                  <tr key={it.id} className="hover:bg-surface-2/40">
                    <td className="max-w-md px-4 py-3">
                      <Link
                        href={`/reels/${it.id}`}
                        className="block truncate font-medium hover:underline"
                      >
                        {it.hook || it.title || `Reel #${it.id}`}
                      </Link>
                      <div className="truncate text-xs text-text-muted">{it.youtubeUrl}</div>
                    </td>
                    <td className="max-w-xs truncate px-4 py-3 text-text-body">{it.angle}</td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
                          STATUS_CLASS[it.status]
                        )}
                      >
                        {(it.status === "downloading" ||
                          it.status === "transcribing" ||
                          it.status === "generating" ||
                          it.status === "broll_rendering") && (
                          <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2} />
                        )}
                        {STATUS_LABEL[it.status]}
                      </span>
                      {it.error && (
                        <div className="mt-1 max-w-xs truncate text-[10px] text-red-500" title={it.error}>
                          {it.error}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-text-body">
                      {brollTotal > 0 ? `${brollDone}/${brollTotal}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-text-muted">
                      {new Date(it.createdAt).toLocaleDateString("fr-FR", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => void handleDelete(it.id)}
                        className="rounded p-1 text-text-muted hover:bg-surface-2 hover:text-red-500"
                        title="Supprimer"
                      >
                        <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showNew && (
        <NewReelModal
          onClose={() => setShowNew(false)}
          onCreated={() => {
            setShowNew(false);
            void fetchItems();
          }}
        />
      )}
    </div>
  );
}

function NewReelModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: number) => void;
}) {
  const [youtubeUrl, setYoutubeUrl] = React.useState("");
  const [angle, setAngle] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!youtubeUrl.trim() || !angle.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/reels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          youtubeUrl: youtubeUrl.trim(),
          angle: angle.trim(),
          title: title.trim() || undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error || "Échec création");
        return;
      }
      toast.success(json.svReady ? "Reel créé · génération du script en cours" : "Reel créé · téléchargement YouTube en cours");
      onCreated(json.id);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-lg border border-border bg-surface p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Nouveau reel</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-text-muted hover:bg-surface-2"
            disabled={submitting}
          >
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-text-muted">
              URL YouTube
            </label>
            <input
              autoFocus
              type="url"
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              required
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-text-muted">
              Angle éditorial
            </label>
            <textarea
              value={angle}
              onChange={(e) => setAngle(e.target.value)}
              placeholder="Ex : montrer pourquoi Claude Cowork change la prod des dev seniors avec 3 features concrètes."
              required
              rows={3}
              className="w-full resize-y rounded-md border border-border bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-text-muted">
              Titre (optionnel)
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Brouillon interne"
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-md border border-border bg-surface px-4 py-2 text-sm hover:border-border-hover hover:bg-surface-2"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={submitting || !youtubeUrl.trim() || !angle.trim()}
              className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:bg-accent-hover disabled:opacity-50"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />}
              Créer
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
