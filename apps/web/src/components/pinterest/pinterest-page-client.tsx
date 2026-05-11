"use client";

import * as React from "react";
import { RefreshCw, ExternalLink, Sparkles, Copy, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { useJobsStream } from "@/lib/use-jobs-stream";
import { cn } from "@/lib/utils";

interface PinterestStats {
  downloaded: number;
  pending: number;
  skipped: number;
  lastSync: string | null;
  enabled: boolean;
  workerUrl: string | null;
}

interface PinterestAsset {
  id: number;
  workerId: string;
  url: string;
  pinUrl: string | null;
  source: string | null;
  action: string;
  filename: string | null;
  imageId: number | null;
  imageStatus: string | null;
  swipedAt: string | null;
  syncedAt: string;
  downloadedAt: string | null;
  error: string | null;
}

interface ApiResponse {
  stats: PinterestStats;
  assets: PinterestAsset[];
}

interface SuggestResponse {
  queries: string[];
  generatedAt: string;
  sampleSize: number;
  tagWeights: Record<string, number>;
}

const FILTERS = [
  { key: "all", label: "Tous" },
  { key: "kept", label: "Gardés" },
  { key: "skipped", label: "Skip" },
  { key: "errors", label: "Erreurs" },
] as const;
type FilterKey = (typeof FILTERS)[number]["key"];

export function PinterestPageClient() {
  const [data, setData] = React.useState<ApiResponse | null>(null);
  const [filter, setFilter] = React.useState<FilterKey>("kept");
  const [loading, setLoading] = React.useState(true);
  const [syncing, setSyncing] = React.useState(false);
  const [suggest, setSuggest] = React.useState<SuggestResponse | null>(null);
  const [suggestLoading, setSuggestLoading] = React.useState(false);
  const [suggestOpen, setSuggestOpen] = React.useState(false);

  const fetchData = React.useCallback(async () => {
    try {
      const res = await fetch("/api/pinterest");
      if (!res.ok) return;
      setData((await res.json()) as ApiResponse);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const refreshTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  useJobsStream((evt) => {
    const isMine =
      ("queue" in evt && evt.queue === "pinterest-sync") ||
      evt.type === "image:updated";
    if (!isMine) return;
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => void fetchData(), 400);
    if (evt.type === "completed" && "queue" in evt && evt.queue === "pinterest-sync") {
      setSyncing(false);
      const r = evt.result as { downloaded?: number; skipped?: number; pulled?: number } | undefined;
      if (r) toast.success(`Sync OK · ${r.downloaded ?? 0} téléchargés, ${r.skipped ?? 0} skip (${r.pulled ?? 0} pull)`);
    }
    if (evt.type === "failed" && "queue" in evt && evt.queue === "pinterest-sync") {
      setSyncing(false);
      toast.error(`Sync échec : ${evt.error}`);
    }
  });

  const triggerSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/pinterest/sync", { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      toast.info("Sync lancé…");
    } catch (err) {
      setSyncing(false);
      toast.error(err instanceof Error ? err.message : "Erreur");
    }
  };

  const loadSuggestions = async () => {
    setSuggestLoading(true);
    setSuggestOpen(true);
    try {
      const res = await fetch("/api/pinterest/keywords?count=30");
      if (!res.ok) throw new Error(await res.text());
      setSuggest((await res.json()) as SuggestResponse);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSuggestLoading(false);
    }
  };

  const stats = data?.stats;
  const assets = data?.assets ?? [];
  const filtered = assets.filter((a) => {
    if (filter === "all") return true;
    if (filter === "errors") return !!a.error;
    if (filter === "kept") return a.action === "kept";
    if (filter === "skipped") return a.action === "skipped";
    return true;
  });

  const lastSyncStr = stats?.lastSync
    ? new Date(stats.lastSync).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })
    : "—";

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Pinterest</h1>
          <p className="mt-1 text-sm text-text-muted">
            {stats?.enabled ? `Worker : ${stats.workerUrl}` : "Worker désactivé (PINTEREST_WORKER_URL/TOKEN manquants)"}
            {loading && " · chargement…"}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadSuggestions}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-1.5 text-sm hover:border-border-hover hover:bg-surface-2"
          >
            <Sparkles className="h-4 w-4" strokeWidth={1.5} />
            Suggérer queries
          </button>
          <button
            onClick={triggerSync}
            disabled={syncing || !stats?.enabled}
            className="inline-flex items-center gap-2 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg hover:bg-accent/90 disabled:opacity-50"
          >
            {syncing ? (
              <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />
            ) : (
              <RefreshCw className="h-4 w-4" strokeWidth={1.5} />
            )}
            {syncing ? "Sync…" : "Sync maintenant"}
          </button>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Téléchargés" value={stats?.downloaded ?? 0} />
        <StatCard label="En attente" value={stats?.pending ?? 0} />
        <StatCard label="Skip" value={stats?.skipped ?? 0} />
        <StatCard label="Dernier sync" value={lastSyncStr} mono={false} />
      </div>

      <div className="flex items-center justify-between border-b border-border pb-2">
        <div className="flex gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm transition-colors",
                filter === f.key ? "bg-accent text-accent-fg" : "text-text-muted hover:bg-surface-2"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-text-muted">{filtered.length} élément{filtered.length > 1 ? "s" : ""}</span>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-surface p-12 text-center">
          <p className="text-sm text-text-muted">Aucun pin pour ce filtre.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {filtered.map((a) => (
            <AssetCard key={a.id} asset={a} />
          ))}
        </div>
      )}

      {suggestOpen && (
        <SuggestModal
          loading={suggestLoading}
          data={suggest}
          onClose={() => setSuggestOpen(false)}
          onRefresh={loadSuggestions}
        />
      )}
    </div>
  );
}

function StatCard({ label, value, mono = true }: { label: string; value: string | number; mono?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <p className="text-xs uppercase tracking-wide text-text-muted">{label}</p>
      <p className={cn("mt-1 text-xl font-semibold", mono && "font-mono")}>{value}</p>
    </div>
  );
}

function AssetCard({ asset }: { asset: PinterestAsset }) {
  const hasImage = asset.imageId !== null;
  const isError = !!asset.error;
  const isSkipped = asset.action === "skipped";
  return (
    <div className="group relative overflow-hidden rounded-lg border border-border checker-bg transition-all duration-180 hover:border-border-hover">
      <div className="relative aspect-square">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={hasImage ? `/api/bank/file/${asset.imageId}` : asset.url}
          alt={asset.workerId}
          loading="lazy"
          className={cn("h-full w-full object-cover", (isSkipped || isError) && "opacity-40")}
        />
        {asset.pinUrl && (
          <a
            href={asset.pinUrl}
            target="_blank"
            rel="noreferrer"
            className="absolute right-1 top-1 rounded-md bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
            title="Ouvrir sur Pinterest"
          >
            <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.5} />
          </a>
        )}
      </div>
      <div className="flex items-center justify-between border-t border-border bg-surface px-2 py-1">
        <span
          className={cn(
            "rounded px-1.5 py-0.5 text-[10px] font-medium",
            isError
              ? "bg-red-500/15 text-red-600"
              : isSkipped
                ? "bg-text-muted/15 text-text-muted"
                : asset.imageStatus === "fail"
                  ? "bg-red-500/15 text-red-600"
                  : asset.imageStatus === "generic" || asset.imageStatus === "done"
                    ? "bg-emerald-500/15 text-emerald-600"
                    : "bg-amber-500/15 text-amber-600"
          )}
        >
          {isError ? "error" : isSkipped ? "skip" : (asset.imageStatus ?? "kept")}
        </span>
        <span className="font-mono text-[10px] text-text-muted">#{asset.id}</span>
      </div>
      {isError && (
        <p className="border-t border-border bg-red-500/5 px-2 py-1 text-[10px] text-red-600 line-clamp-2" title={asset.error ?? ""}>
          {asset.error}
        </p>
      )}
    </div>
  );
}

function SuggestModal({
  loading,
  data,
  onClose,
  onRefresh,
}: {
  loading: boolean;
  data: SuggestResponse | null;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const copyAll = () => {
    if (!data) return;
    void navigator.clipboard.writeText(data.queries.join("\n"));
    toast.success(`${data.queries.length} queries copiées`);
  };
  const copyOne = (q: string) => {
    void navigator.clipboard.writeText(q);
    toast.success("Query copiée");
  };

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm">
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl border border-border bg-bg shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-border px-5 py-3">
          <div>
            <h2 className="text-lg font-semibold">Queries Pinterest suggérées</h2>
            {data && (
              <p className="text-xs text-text-muted">
                Basé sur {data.sampleSize} articles · généré {new Date(data.generatedAt).toLocaleTimeString("fr-FR")}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onRefresh}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs hover:bg-surface-2 disabled:opacity-50"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} strokeWidth={1.5} />
              Régénérer
            </button>
            <button
              onClick={copyAll}
              disabled={!data}
              className="inline-flex items-center gap-1.5 rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-accent-fg hover:bg-accent/90 disabled:opacity-50"
            >
              <Copy className="h-3.5 w-3.5" strokeWidth={1.5} />
              Tout copier
            </button>
            <button onClick={onClose} className="rounded-md p-1 hover:bg-surface-2">
              <X className="h-4 w-4" strokeWidth={1.5} />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-5">
          {loading && !data ? (
            <div className="flex items-center justify-center py-12 text-text-muted">
              <Loader2 className="h-5 w-5 animate-spin" strokeWidth={1.5} />
            </div>
          ) : data ? (
            <>
              <div className="mb-4 flex flex-wrap gap-1.5">
                {Object.entries(data.tagWeights)
                  .sort(([, a], [, b]) => b - a)
                  .map(([tag, w]) => (
                    <span
                      key={tag}
                      className="rounded-md bg-surface px-2 py-0.5 text-[11px] text-text-muted"
                    >
                      {tag} <span className="font-mono">{w.toFixed(2)}</span>
                    </span>
                  ))}
              </div>
              <ul className="space-y-1">
                {data.queries.map((q, i) => (
                  <li
                    key={`${q}-${i}`}
                    className="group flex items-center justify-between rounded-md border border-border bg-surface px-3 py-1.5 text-sm"
                  >
                    <span>{q}</span>
                    <button
                      onClick={() => copyOne(q)}
                      className="opacity-0 transition-opacity group-hover:opacity-100"
                      title="Copier"
                    >
                      <Copy className="h-3.5 w-3.5 text-text-muted" strokeWidth={1.5} />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
