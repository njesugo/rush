"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  ExternalLink,
  RefreshCw,
  Check,
  Loader2,
  TrendingUp,
  Clock,
  Filter as FilterIcon,
  X,
  Sparkles,
} from "lucide-react";
import { useJobsStream } from "@/lib/use-jobs-stream";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

export interface NewsItem {
  id: number;
  source: string;
  title: string;
  url: string;
  summary: string | null;
  fetchedAt: string;
  publishedAt: string | null;
  used: number;
  region: string | null;
  geoScore: number;
  keywordScore: number;
  editorialScore: number;
  finalScore: number;
  money: string | null;
}

const REGION_LABEL: Record<string, string> = {
  "FR/EU": "FR/EU",
  "US/AFRICA": "US/AF",
  OTHER: "Autres",
};

export function NewsPageClient() {
  const router = useRouter();
  const [items, setItems] = React.useState<NewsItem[]>([]);
  const [sources, setSources] = React.useState<string[]>([]);
  const [activeSources, setActiveSources] = React.useState<Set<string>>(new Set());
  const [sort, setSort] = React.useState<"score" | "recent">("score");
  const [unusedOnly, setUnusedOnly] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [scraping, setScraping] = React.useState(false);
  const [opened, setOpened] = React.useState<NewsItem | null>(null);

  const fetchItems = React.useCallback(async () => {
    try {
      const params = new URLSearchParams({ sort });
      if (unusedOnly) params.set("unused", "1");
      if (activeSources.size > 0) params.set("sources", [...activeSources].join(","));
      const res = await fetch(`/api/news?${params.toString()}`);
      if (!res.ok) return;
      const json = (await res.json()) as { items: NewsItem[]; sources: string[] };
      setItems(json.items);
      setSources(json.sources);
    } finally {
      setLoading(false);
    }
  }, [sort, unusedOnly, activeSources]);

  React.useEffect(() => {
    setLoading(true);
    void fetchItems();
  }, [fetchItems]);

  const refreshTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  useJobsStream((evt) => {
    if (evt.type === "completed" && evt.queue === "news-scrape") {
      setScraping(false);
      const r = evt.result as { inserted?: number; total?: number } | undefined;
      toast.success(
        `Scrape terminé · ${r?.inserted ?? 0} nouveaux / ${r?.total ?? 0} traités`
      );
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => void fetchItems(), 200);
    }
    if (evt.type === "failed" && evt.queue === "news-scrape") {
      setScraping(false);
      toast.error(`Scrape échoué : ${evt.error}`);
    }
    if (evt.type === "started" && evt.queue === "news-scrape") {
      setScraping(true);
    }
  });

  async function triggerScrape() {
    setScraping(true);
    try {
      const res = await fetch("/api/news/scrape", { method: "POST", body: JSON.stringify({}) });
      if (!res.ok) {
        setScraping(false);
        toast.error("Impossible de lancer le scrape");
        return;
      }
      toast.message("Scrape lancé…");
    } catch (err) {
      setScraping(false);
      toast.error((err as Error).message);
    }
  }

  async function markUsed(item: NewsItem) {
    const res = await fetch(`/api/news/${item.id}/use`, { method: "POST" });
    if (!res.ok) {
      toast.error("Échec mise à jour");
      return;
    }
    setItems((prev) =>
      prev.map((it) => (it.id === item.id ? { ...it, used: it.used + 1 } : it))
    );
  }

  async function generateCarousel(item: NewsItem) {
    try {
      const res = await fetch("/api/carousels/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ newsId: item.id }),
      });
      if (!res.ok) {
        toast.error("Échec génération");
        return;
      }
      const json = (await res.json()) as { carouselId: number };
      toast.success("Génération lancée");
      router.push(`/carousels/${json.carouselId}`);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  function toggleSource(src: string) {
    setActiveSources((prev) => {
      const next = new Set(prev);
      if (next.has(src)) next.delete(src);
      else next.add(src);
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Actualités IA</h1>
          <p className="mt-1 text-sm text-text-muted">
            {items.length} article{items.length > 1 ? "s" : ""}
            {loading && " · chargement…"}
          </p>
        </div>
        <button
          onClick={() => void triggerScrape()}
          disabled={scraping}
          className={cn(
            "inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
            "bg-accent text-accent-fg hover:bg-accent/90 disabled:opacity-60"
          )}
        >
          {scraping ? (
            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />
          ) : (
            <RefreshCw className="h-4 w-4" strokeWidth={1.5} />
          )}
          {scraping ? "Scrape en cours…" : "Scraper maintenant"}
        </button>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 inline-flex items-center gap-1 text-xs text-text-muted">
            <FilterIcon className="h-3.5 w-3.5" strokeWidth={1.5} /> Sources :
          </span>
          {sources.length === 0 && (
            <span className="text-xs text-text-muted">aucune</span>
          )}
          {sources.map((s) => {
            const on = activeSources.has(s);
            return (
              <button
                key={s}
                onClick={() => toggleSource(s)}
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-xs transition-colors",
                  on
                    ? "bg-accent text-accent-fg"
                    : "bg-surface-2 text-text-muted hover:text-text"
                )}
              >
                {s}
              </button>
            );
          })}
          {activeSources.size > 0 && (
            <button
              onClick={() => setActiveSources(new Set())}
              className="ml-1 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-text-muted hover:text-text"
            >
              <X className="h-3 w-3" strokeWidth={1.5} /> reset
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 text-xs">
          <button
            onClick={() => setUnusedOnly((v) => !v)}
            className={cn(
              "rounded-md px-2.5 py-1 transition-colors",
              unusedOnly
                ? "bg-surface-2 text-text"
                : "text-text-muted hover:bg-surface-2 hover:text-text"
            )}
          >
            Non utilisées
          </button>
          <SortBtn active={sort === "score"} onClick={() => setSort("score")}>
            <TrendingUp className="mr-1 inline h-3.5 w-3.5" strokeWidth={1.5} />
            Score
          </SortBtn>
          <SortBtn active={sort === "recent"} onClick={() => setSort("recent")}>
            <Clock className="mr-1 inline h-3.5 w-3.5" strokeWidth={1.5} />
            Récent
          </SortBtn>
        </div>
      </div>

      {!loading && items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-16 text-center">
          <p className="text-sm text-text-muted">
            Aucune news pour le moment. Cliquez « Scraper maintenant ».
          </p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {items.map((it) => (
            <NewsCard
              key={it.id}
              item={it}
              onOpen={() => setOpened(it)}
              onUse={() => void markUsed(it)}
              onGenerate={() => void generateCarousel(it)}
            />
          ))}
        </div>
      )}

      {opened && (
        <NewsDrawer
          item={opened}
          onClose={() => setOpened(null)}
          onUse={() => {
            void markUsed(opened);
          }}
          onGenerate={() => {
            void generateCarousel(opened);
            setOpened(null);
          }}
        />
      )}
    </div>
  );
}

function SortBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-md px-2.5 py-1 transition-colors",
        active
          ? "bg-surface-2 text-text"
          : "text-text-muted hover:bg-surface-2 hover:text-text"
      )}
    >
      {children}
    </button>
  );
}

function NewsCard({
  item,
  onOpen,
  onUse,
  onGenerate,
}: {
  item: NewsItem;
  onOpen: () => void;
  onUse: () => void;
  onGenerate: () => void;
}) {
  return (
    <article
      onClick={onOpen}
      className="group flex cursor-pointer flex-col gap-2 rounded-lg border border-border bg-surface p-3 transition-colors hover:border-text-muted/50"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5 text-[10px] uppercase tracking-wide text-text-muted">
          <span className="rounded bg-surface-2 px-1.5 py-0.5">{item.source}</span>
          {item.region && (
            <span className="rounded bg-surface-2 px-1.5 py-0.5">
              {REGION_LABEL[item.region] ?? item.region}
            </span>
          )}
          {item.money && (
            <span className="rounded bg-accent/10 px-1.5 py-0.5 text-accent">
              {item.money}
            </span>
          )}
        </div>
        <span
          className="font-mono text-[10px] text-text-muted"
          title={`kw=${item.keywordScore} · geo=${item.geoScore} · ed=${item.editorialScore}`}
        >
          {Math.round(item.finalScore)}
        </span>
      </div>

      <h3 className="line-clamp-3 text-sm font-medium leading-snug text-text">
        {item.title}
      </h3>

      {item.summary && (
        <p className="line-clamp-3 text-xs text-text-muted">{item.summary}</p>
      )}

      <div className="mt-auto flex items-center justify-between pt-2 text-[10px] text-text-muted">
        <span>{formatRelative(item.publishedAt ?? item.fetchedAt)}</span>
        <div className="flex items-center gap-1">
          {item.used > 0 && (
            <span className="inline-flex items-center gap-1 rounded bg-surface-2 px-1.5 py-0.5">
              <Check className="h-3 w-3" strokeWidth={1.5} /> {item.used}
            </span>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onGenerate();
            }}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-accent hover:bg-accent/10"
            title="Générer un carousel"
          >
            <Sparkles className="h-3 w-3" strokeWidth={1.5} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onUse();
            }}
            className="rounded px-1.5 py-0.5 hover:bg-surface-2 hover:text-text"
            title="Marquer comme utilisée"
          >
            Utiliser
          </button>
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer noopener"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-surface-2 hover:text-text"
          >
            <ExternalLink className="h-3 w-3" strokeWidth={1.5} />
          </a>
        </div>
      </div>
    </article>
  );
}

function NewsDrawer({
  item,
  onClose,
  onUse,
  onGenerate,
}: {
  item: NewsItem;
  onClose: () => void;
  onUse: () => void;
  onGenerate: () => void;
}) {
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-end bg-black/40"
      onClick={onClose}
    >
      <aside
        className="flex h-full w-full max-w-lg flex-col gap-4 overflow-y-auto bg-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex flex-wrap items-center gap-1.5 text-[10px] uppercase tracking-wide text-text-muted">
            <span className="rounded bg-surface-2 px-1.5 py-0.5">{item.source}</span>
            {item.region && (
              <span className="rounded bg-surface-2 px-1.5 py-0.5">
                {REGION_LABEL[item.region] ?? item.region}
              </span>
            )}
            {item.money && (
              <span className="rounded bg-accent/10 px-1.5 py-0.5 text-accent">
                {item.money}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-text-muted hover:bg-surface-2 hover:text-text"
          >
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>

        <h2 className="text-lg font-semibold leading-snug">{item.title}</h2>

        {item.summary && (
          <p className="text-sm leading-relaxed text-text-body">{item.summary}</p>
        )}

        <div className="grid grid-cols-4 gap-2 rounded-md border border-border p-3 text-xs">
          <Stat label="Final" value={Math.round(item.finalScore)} />
          <Stat label="Kw" value={item.keywordScore} />
          <Stat label="Geo" value={item.geoScore} />
          <Stat label="Édito" value={item.editorialScore} />
        </div>

        <div className="mt-auto flex items-center gap-2">
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-surface-2"
          >
            <ExternalLink className="h-4 w-4" strokeWidth={1.5} />
            Voir source
          </a>
          <button
            onClick={onUse}
            className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-surface-2"
          >
            <Check className="h-4 w-4" strokeWidth={1.5} />
            Marquer utilisée
          </button>
          <button
            onClick={onGenerate}
            className="inline-flex items-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-fg hover:bg-accent/90"
          >
            <Sparkles className="h-4 w-4" strokeWidth={1.5} />
            Générer carousel
          </button>
        </div>

        <p className="text-[10px] text-text-muted">
          Publié {formatRelative(item.publishedAt ?? item.fetchedAt)} · récupéré{" "}
          {formatRelative(item.fetchedAt)}
        </p>
      </aside>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col items-center">
      <span className="font-mono text-sm">{Math.round(value)}</span>
      <span className="text-[10px] uppercase tracking-wide text-text-muted">{label}</span>
    </div>
  );
}

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return "à l'instant";
  if (mins < 60) return `il y a ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.round(hours / 24);
  return `il y a ${days} j`;
}
