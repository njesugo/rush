"use client";

import * as React from "react";
import { Check, X, RotateCcw, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useJobsStream } from "@/lib/use-jobs-stream";

interface Item {
  id: number;
  filename: string;
  storageKey: string;
}

type Action = "keep" | "skip" | "redo";

export function CleanupPageClient() {
  const [items, setItems] = React.useState<Item[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [stats, setStats] = React.useState({ kept: 0, skipped: 0, redo: 0 });
  const [pending, setPending] = React.useState<Set<number>>(new Set());
  const [zoomIdx, setZoomIdx] = React.useState<number | null>(null);

  const fetchItems = React.useCallback(async () => {
    const res = await fetch("/api/cleanup/decide");
    if (!res.ok) return;
    const json = (await res.json()) as { items: Item[] };
    setItems(json.items);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    void fetchItems();
  }, [fetchItems]);

  useJobsStream((evt) => {
    if (evt.type === "image:updated" && evt.status === "generic") {
      void fetchItems();
    }
  });

  const decide = React.useCallback(
    async (img: Item, action: Action) => {
      setPending((prev) => new Set(prev).add(img.id));
      setItems((prev) => prev.filter((i) => i.id !== img.id));
      setStats((s) => ({
        kept: s.kept + (action === "keep" ? 1 : 0),
        skipped: s.skipped + (action === "skip" ? 1 : 0),
        redo: s.redo + (action === "redo" ? 1 : 0),
      }));
      try {
        const res = await fetch("/api/cleanup/decide", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageId: img.id, action }),
        });
        if (!res.ok) throw new Error(await res.text());
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur");
        setItems((prev) => [img, ...prev]);
        setStats((s) => ({
          kept: s.kept - (action === "keep" ? 1 : 0),
          skipped: s.skipped - (action === "skip" ? 1 : 0),
          redo: s.redo - (action === "redo" ? 1 : 0),
        }));
      } finally {
        setPending((prev) => {
          const next = new Set(prev);
          next.delete(img.id);
          return next;
        });
      }
    },
    []
  );

  const [focusIdx, setFocusIdx] = React.useState(0);

  // Grid keyboard shortcuts (only when preview NOT open)
  React.useEffect(() => {
    if (zoomIdx !== null) return;
    function onKey(e: KeyboardEvent) {
      if (items.length === 0) return;
      const target = items[focusIdx] ?? items[0];
      if (!target) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        void decide(target, "keep");
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        void decide(target, "skip");
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        void decide(target, "redo");
      } else if (e.key === "Tab") {
        e.preventDefault();
        setFocusIdx((i) => (i + 1) % items.length);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items, focusIdx, decide, zoomIdx]);

  // Preview keyboard shortcuts
  React.useEffect(() => {
    if (zoomIdx === null) return;
    function onKey(e: KeyboardEvent) {
      if (zoomIdx === null) return;
      const i = zoomIdx;
      if (e.key === "Escape") {
        e.preventDefault();
        setZoomIdx(null);
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (items.length > 0) setZoomIdx((i - 1 + items.length) % items.length);
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        if (items.length > 0) setZoomIdx((i + 1) % items.length);
        return;
      }
      const k = e.key.toLowerCase();
      const target = items[i];
      if (!target) return;
      let action: Action | null = null;
      if (k === "k") action = "keep";
      else if (k === "d") action = "skip";
      else if (k === "r") action = "redo";
      if (action) {
        e.preventDefault();
        void decide(target, action);
        if (items.length <= 1) setZoomIdx(null);
        else setZoomIdx(Math.min(i, items.length - 2));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomIdx, items, decide]);

  const zoomItem = zoomIdx !== null ? items[zoomIdx] ?? null : null;

  return (
    <div className="space-y-6">
      <header className="sticky top-14 z-10 -mx-6 flex items-end justify-between border-b border-border bg-background/95 px-6 py-4 backdrop-blur">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">File de tri</h1>
          <p className="mt-1 text-sm text-text-muted">
            Raccourcis :{" "}
            <kbd className="rounded border border-border px-1 font-mono text-[10px]">←</kbd> skip ·{" "}
            <kbd className="rounded border border-border px-1 font-mono text-[10px]">→</kbd> garder ·{" "}
            <kbd className="rounded border border-border px-1 font-mono text-[10px]">↑</kbd> re-détourer ·{" "}
            clic = aperçu
          </p>
        </div>
        <div className="flex gap-6 text-sm">
          <Stat label="Restantes" value={items.length} />
          <Stat label="Gardées" value={stats.kept} tone="success" />
          <Stat label="Skipées" value={stats.skipped} tone="danger" />
        </div>
      </header>

      {loading ? (
        <p className="text-sm text-text-muted">Chargement…</p>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-12 text-center">
          <p className="text-sm text-text-muted">
            Rien à trier. Importe des images RAW depuis la Banque pour en ajouter.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {items.map((img, idx) => (
            <CleanupCard
              key={img.id}
              img={img}
              focused={idx === focusIdx}
              busy={pending.has(img.id)}
              onClick={() => {
                setFocusIdx(idx);
                setZoomIdx(idx);
              }}
              onAction={(a) => decide(img, a)}
            />
          ))}
        </div>
      )}

      {zoomItem && zoomIdx !== null && (
        <div
          onClick={() => setZoomIdx(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
        >
          <div className="absolute left-4 top-4 flex flex-col gap-1 text-xs text-white/80">
            <div className="font-mono">
              #{zoomItem.id} · {zoomIdx + 1}/{items.length}
            </div>
            <div className="text-white/60">
              ←/→ naviguer · K garder · D skip · R re-détourer · Esc fermer
            </div>
          </div>

          <NavBtn
            side="left"
            onClick={(e) => {
              e.stopPropagation();
              if (items.length > 0)
                setZoomIdx((zoomIdx - 1 + items.length) % items.length);
            }}
          >
            <ChevronLeft className="h-7 w-7" strokeWidth={1.5} />
          </NavBtn>

          <div
            onClick={(e) => e.stopPropagation()}
            className="checker-bg flex max-h-[80vh] max-w-[85vw] items-center justify-center overflow-hidden rounded-lg"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/bank/file/${zoomItem.id}`}
              alt={zoomItem.filename}
              className="max-h-[80vh] max-w-[85vw] object-contain"
            />
          </div>

          <NavBtn
            side="right"
            onClick={(e) => {
              e.stopPropagation();
              if (items.length > 0) setZoomIdx((zoomIdx + 1) % items.length);
            }}
          >
            <ChevronRight className="h-7 w-7" strokeWidth={1.5} />
          </NavBtn>

          <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 gap-3">
            <ZoomActionBtn
              tone="danger"
              kbd="D"
              onClick={(e) => {
                e.stopPropagation();
                void decide(zoomItem, "skip");
                if (items.length <= 1) setZoomIdx(null);
                else setZoomIdx(Math.min(zoomIdx, items.length - 2));
              }}
            >
              <X className="h-4 w-4" strokeWidth={1.5} />
              Skip
            </ZoomActionBtn>
            <ZoomActionBtn
              kbd="R"
              onClick={(e) => {
                e.stopPropagation();
                void decide(zoomItem, "redo");
                if (items.length <= 1) setZoomIdx(null);
                else setZoomIdx(Math.min(zoomIdx, items.length - 2));
              }}
            >
              <RotateCcw className="h-4 w-4" strokeWidth={1.5} />
              Re-détourer
            </ZoomActionBtn>
            <ZoomActionBtn
              tone="success"
              kbd="K"
              onClick={(e) => {
                e.stopPropagation();
                void decide(zoomItem, "keep");
                if (items.length <= 1) setZoomIdx(null);
                else setZoomIdx(Math.min(zoomIdx, items.length - 2));
              }}
            >
              <Check className="h-4 w-4" strokeWidth={1.5} />
              Garder
            </ZoomActionBtn>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "success" | "danger";
}) {
  return (
    <div className="text-right">
      <div
        className={cn(
          "font-mono text-xl font-semibold tabular-nums",
          tone === "success" && "text-success",
          tone === "danger" && "text-danger"
        )}
      >
        {value}
      </div>
      <div className="text-[11px] uppercase tracking-wide text-text-muted">{label}</div>
    </div>
  );
}

function CleanupCard({
  img,
  focused,
  busy,
  onClick,
  onAction,
}: {
  img: Item;
  focused: boolean;
  busy: boolean;
  onClick: () => void;
  onAction: (a: Action) => void;
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "cursor-zoom-in overflow-hidden rounded-lg border bg-surface transition-all duration-180 ease-smooth",
        focused
          ? "border-accent ring-2 ring-accent/35"
          : "border-border hover:border-border-hover",
        busy && "pointer-events-none opacity-50"
      )}
    >
      <div className="relative aspect-square checker-bg">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/api/bank/file/${img.id}`}
          alt={img.filename}
          loading="lazy"
          className="h-full w-full object-contain"
        />
      </div>
      <div className="border-t border-border px-2 py-1 font-mono text-[10px] text-text-muted">
        #{img.id} · {img.filename}
      </div>
      <div className="grid grid-cols-3 border-t border-border">
        <ActionBtn onClick={() => onAction("skip")} tone="danger" label="Skip">
          <X className="h-4 w-4" strokeWidth={1.5} />
        </ActionBtn>
        <ActionBtn onClick={() => onAction("redo")} label="Redo">
          <RotateCcw className="h-4 w-4" strokeWidth={1.5} />
        </ActionBtn>
        <ActionBtn onClick={() => onAction("keep")} tone="success" label="Garder">
          <Check className="h-4 w-4" strokeWidth={1.5} />
        </ActionBtn>
      </div>
    </div>
  );
}

function ActionBtn({
  children,
  onClick,
  tone,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  tone?: "success" | "danger";
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={label}
      className={cn(
        "flex items-center justify-center gap-1.5 py-2 text-sm font-medium transition-colors hover:bg-surface-2",
        tone === "success" && "text-success hover:bg-success/5",
        tone === "danger" && "text-danger hover:bg-danger/5"
      )}
    >
      {children}
      <span className="text-xs">{label}</span>
    </button>
  );
}

function NavBtn({
  side,
  onClick,
  children,
}: {
  side: "left" | "right";
  onClick: (e: React.MouseEvent) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "absolute top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white transition-colors hover:bg-white/20",
        side === "left" ? "left-4" : "right-4"
      )}
      aria-label={side === "left" ? "Précédente" : "Suivante"}
    >
      {children}
    </button>
  );
}

function ZoomActionBtn({
  children,
  onClick,
  tone,
  kbd,
}: {
  children: React.ReactNode;
  onClick: (e: React.MouseEvent) => void;
  tone?: "success" | "danger";
  kbd: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-white backdrop-blur transition-colors hover:bg-white/20",
        tone === "success" && "hover:bg-success/30",
        tone === "danger" && "hover:bg-danger/30"
      )}
    >
      {children}
      <kbd className="rounded border border-white/30 px-1.5 font-mono text-[10px]">{kbd}</kbd>
    </button>
  );
}
