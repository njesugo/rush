"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2, Trash2, FileText, AlertCircle, Check, RefreshCw, Search, X } from "lucide-react";
import { useJobsStream } from "@/lib/use-jobs-stream";
import { cn } from "@/lib/utils";

interface CarouselListItem {
  id: number;
  title: string | null;
  status: "draft" | "ready" | "scheduled" | "published" | "failed";
  slides: Array<{ slide_number: number; type: string; title: string; body: string | null }>;
  caption: string | null;
  angle: { angle_title?: string; angle_type?: string } | null;
  sourceNewsIds: number[] | null;
  scheduledAt: string | null;
  publerPostId: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

const STATUS_LABEL: Record<CarouselListItem["status"], string> = {
  draft: "Brouillon",
  ready: "Prêt",
  scheduled: "Planifié",
  published: "Publié",
  failed: "Échoué",
};

const STATUS_CLASS: Record<CarouselListItem["status"], string> = {
  draft: "bg-surface-2 text-text-muted",
  ready: "bg-accent/10 text-accent",
  scheduled: "bg-blue-500/10 text-blue-600",
  published: "bg-green-500/10 text-green-600",
  failed: "bg-red-500/10 text-red-600",
};

const STATUS_FILTERS = [
  { key: "all", label: "Tous" },
  { key: "draft", label: "Brouillons" },
  { key: "ready", label: "Prêts" },
  { key: "scheduled", label: "Planifiés" },
  { key: "published", label: "Publiés" },
  { key: "failed", label: "Échoués" },
] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number]["key"];

export function CarouselsPageClient() {
  const [items, setItems] = React.useState<CarouselListItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("all");
  const [search, setSearch] = React.useState("");

  const fetchItems = React.useCallback(async () => {
    try {
      const res = await fetch("/api/carousels");
      if (!res.ok) return;
      const json = (await res.json()) as { items: CarouselListItem[] };
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
      evt.queue === "carousel-generate"
    ) {
      if (evt.type === "completed") toast.success("Carousel généré");
      if (evt.type === "failed") toast.error(`Génération échouée : ${evt.error}`);
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => void fetchItems(), 200);
    }
  });

  async function handleDelete(id: number) {
    if (!confirm("Supprimer ce carousel ?")) return;
    const res = await fetch(`/api/carousels/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Échec suppression");
      return;
    }
    setItems((prev) => prev.filter((c) => c.id !== id));
  }

  const counts = React.useMemo(() => {
    const c: Record<string, number> = { all: items.length, draft: 0, ready: 0, scheduled: 0, published: 0, failed: 0 };
    for (const it of items) c[it.status] = (c[it.status] ?? 0) + 1;
    return c;
  }, [items]);

  const filteredItems = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      if (statusFilter !== "all" && it.status !== statusFilter) return false;
      if (!q) return true;
      const hookSlide = it.slides?.find((s) => s.type === "hook") || it.slides?.[0];
      const hay = [
        it.title,
        hookSlide?.title,
        it.angle?.angle_title,
        it.angle?.angle_type,
        it.caption,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [items, statusFilter, search]);

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Carousels</h1>
          <p className="mt-1 text-sm text-text-muted">
            {filteredItems.length}
            {filteredItems.length !== items.length && ` / ${items.length}`} carousel
            {items.length > 1 ? "s" : ""}
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
          <Link
            href="/news"
            className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-surface-2"
          >
            <FileText className="h-4 w-4" strokeWidth={1.5} />
            Générer depuis une news
          </Link>
        </div>
      </header>

      {/* Toolbar : filtres statut + recherche */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex flex-wrap gap-1">
          {STATUS_FILTERS.map((f) => {
            const n = counts[f.key] ?? 0;
            const active = statusFilter === f.key;
            return (
              <button
                key={f.key}
                onClick={() => setStatusFilter(f.key)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors",
                  active ? "bg-accent text-accent-fg" : "text-text-muted hover:bg-surface-2"
                )}
              >
                <span>{f.label}</span>
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 font-mono text-[10px]",
                    active ? "bg-accent-fg/15 text-accent-fg" : "bg-text-muted/15 text-text-muted"
                  )}
                >
                  {n}
                </span>
              </button>
            );
          })}
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" strokeWidth={1.5} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher hook, angle, caption…"
            className="w-72 rounded-md border border-border bg-surface py-1.5 pl-8 pr-8 text-sm placeholder:text-text-muted/60 focus:border-accent focus:outline-none"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-text-muted hover:bg-surface-2 hover:text-text"
              title="Effacer"
            >
              <X className="h-3.5 w-3.5" strokeWidth={1.5} />
            </button>
          )}
        </div>
      </div>

      {!loading && filteredItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-16 text-center">
          {items.length === 0 ? (
            <p className="text-sm text-text-muted">
              Aucun carousel pour le moment. Va sur <Link href="/news" className="underline">/news</Link> pour en générer un.
            </p>
          ) : (
            <p className="text-sm text-text-muted">Aucun carousel pour ce filtre.</p>
          )}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {filteredItems.map((c) => (
            <CarouselCard key={c.id} item={c} onDelete={() => void handleDelete(c.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function CarouselCard({
  item,
  onDelete,
}: {
  item: CarouselListItem;
  onDelete: () => void;
}) {
  const hookSlide = item.slides?.find((s) => s.type === "hook") || item.slides?.[0];
  const hookText = hookSlide?.title || item.title || "Sans titre";
  const isGenerating = item.status === "draft" && item.slides.length === 0;

  return (
    <div className="group flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 transition-colors hover:border-text-muted/50">
      <div className="flex items-start justify-between gap-2">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
            STATUS_CLASS[item.status]
          )}
        >
          {isGenerating && <Loader2 className="h-3 w-3 animate-spin" strokeWidth={1.5} />}
          {item.status === "failed" && <AlertCircle className="h-3 w-3" strokeWidth={1.5} />}
          {item.status === "published" && <Check className="h-3 w-3" strokeWidth={1.5} />}
          {STATUS_LABEL[item.status]}
        </span>
        <span className="font-mono text-[10px] text-text-muted">#{item.id}</span>
      </div>

      <Link href={`/carousels/${item.id}`} className="flex-1 space-y-2">
        <h3 className="line-clamp-3 text-sm font-semibold leading-snug">
          {hookText}
        </h3>
        {item.angle?.angle_type && (
          <p className="text-[10px] uppercase tracking-wide text-text-muted">
            {item.angle.angle_type.replace(/_/g, " ")}
          </p>
        )}
        {item.error && (
          <p className="line-clamp-2 text-xs text-red-600">{item.error}</p>
        )}
      </Link>

      <div className="flex items-center justify-between text-[10px] text-text-muted">
        <span>{item.slides.length || "—"} slides</span>
        <div className="flex items-center gap-1">
          <span>{formatRelative(item.createdAt)}</span>
          <button
            onClick={(e) => {
              e.preventDefault();
              onDelete();
            }}
            className="ml-1 rounded p-1 hover:bg-surface-2 hover:text-red-600"
            title="Supprimer"
          >
            <Trash2 className="h-3 w-3" strokeWidth={1.5} />
          </button>
        </div>
      </div>
    </div>
  );
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return "à l'instant";
  if (mins < 60) return `il y a ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `il y a ${hours} h`;
  return `il y a ${Math.round(hours / 24)} j`;
}
