"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2, Trash2, FileText, AlertCircle, Check } from "lucide-react";
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

export function CarouselsPageClient() {
  const [items, setItems] = React.useState<CarouselListItem[]>([]);
  const [loading, setLoading] = React.useState(true);

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

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Carousels</h1>
          <p className="mt-1 text-sm text-text-muted">
            {items.length} carousel{items.length > 1 ? "s" : ""}
            {loading && " · chargement…"}
          </p>
        </div>
        <Link
          href="/news"
          className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-surface-2"
        >
          <FileText className="h-4 w-4" strokeWidth={1.5} />
          Générer depuis une news
        </Link>
      </header>

      {!loading && items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-16 text-center">
          <p className="text-sm text-text-muted">
            Aucun carousel pour le moment. Va sur <Link href="/news" className="underline">/news</Link> pour en générer un.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {items.map((c) => (
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
