"use client";

import * as React from "react";
import {
  Trash2,
  RotateCcw,
  Copy,
  Maximize2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export interface BankImage {
  id: number;
  filename: string;
  storageKey: string;
  status: string;
  source: string;
  width: number | null;
  height: number | null;
  createdAt: string;
}

interface Props {
  items: BankImage[];
  onMutate?: () => void;
}

export function BankGrid({ items, onMutate }: Props) {
  const [zoomIdx, setZoomIdx] = React.useState<number | null>(null);

  const onCopyId = React.useCallback((img: BankImage) => {
    void navigator.clipboard.writeText(String(img.id));
    toast.success(`ID #${img.id} copié`);
  }, []);

  const act = React.useCallback(
    async (img: BankImage, action: "keep" | "delete" | "redo") => {
      try {
        const res = await fetch(`/api/bank/${img.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });
        if (!res.ok) throw new Error(await res.text());
        toast.success(
          action === "keep"
            ? `Image #${img.id} gardée`
            : action === "delete"
              ? `Image #${img.id} supprimée`
              : `Image #${img.id} à re-détourer`
        );
        onMutate?.();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur");
      }
    },
    [onMutate]
  );

  React.useEffect(() => {
    if (zoomIdx === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setZoomIdx(null);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setZoomIdx((i) =>
          i === null ? null : (i - 1 + items.length) % items.length
        );
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setZoomIdx((i) => (i === null ? null : (i + 1) % items.length));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomIdx, items, act]);

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-surface p-12 text-center">
        <p className="text-sm text-text-muted">Aucune image dans cette vue.</p>
      </div>
    );
  }

  const zoom = zoomIdx !== null ? items[zoomIdx] : null;

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {items.map((img, idx) => (
          <div
            key={img.id}
            onClick={() => setZoomIdx(idx)}
            className="group relative cursor-zoom-in overflow-hidden rounded-lg border border-border checker-bg transition-all duration-180 ease-smooth hover:border-border-hover"
          >
            <div className="relative aspect-square">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/bank/file/${img.id}`}
                alt={img.filename}
                loading="lazy"
                className="h-full w-full object-contain"
              />
              <div className="pointer-events-none absolute inset-0 flex items-end justify-between bg-gradient-to-t from-black/60 to-transparent p-2 opacity-0 transition-opacity duration-200 group-hover:pointer-events-auto group-hover:opacity-100">
                <div className="flex gap-1">
                  <IconBtn
                    title="Aperçu"
                    onClick={() => setZoomIdx(idx)}
                  >
                    <Maximize2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                  </IconBtn>
                  <IconBtn title="Copier ID" onClick={() => onCopyId(img)}>
                    <Copy className="h-3.5 w-3.5" strokeWidth={1.5} />
                  </IconBtn>
                </div>
                <div className="flex gap-1">
                  <IconBtn
                    title="Re-détourer"
                    onClick={() => void act(img, "redo")}
                  >
                    <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.5} />
                  </IconBtn>
                  <IconBtn
                    title="Supprimer"
                    onClick={() => void act(img, "delete")}
                  >
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                  </IconBtn>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between border-t border-border bg-surface px-2 py-1">
              <StatusPill status={img.status} />
              <span className="font-mono text-[10px] text-text-muted">
                #{img.id}
              </span>
            </div>
          </div>
        ))}
      </div>

      {zoom && zoomIdx !== null && (
        <div
          onClick={() => setZoomIdx(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-8 backdrop-blur-sm"
        >
          <div
            className="absolute left-4 top-4 flex items-center gap-2 rounded-md bg-white/10 px-3 py-1.5 font-mono text-xs text-white/90 backdrop-blur"
            onClick={(e) => e.stopPropagation()}
          >
            #{zoom.id} · {zoomIdx + 1} / {items.length}{" "}
            <span className="ml-2 text-white/60">
              ←/→ naviguer · Esc fermer
            </span>
          </div>

          <NavBtn
            side="left"
            onClick={(e) => {
              e.stopPropagation();
              setZoomIdx((i) =>
                i === null ? null : (i - 1 + items.length) % items.length
              );
            }}
          >
            <ChevronLeft className="h-6 w-6" strokeWidth={1.5} />
          </NavBtn>

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/bank/file/${zoom.id}`}
            alt={zoom.filename}
            onClick={(e) => e.stopPropagation()}
            className="checker-bg max-h-[80vh] max-w-[85vw] rounded-lg object-contain shadow-2xl"
          />

          <NavBtn
            side="right"
            onClick={(e) => {
              e.stopPropagation();
              setZoomIdx((i) =>
                i === null ? null : (i + 1) % items.length
              );
            }}
          >
            <ChevronRight className="h-6 w-6" strokeWidth={1.5} />
          </NavBtn>
        </div>
      )}
    </>
  );
}

function NavBtn({
  side,
  children,
  onClick,
}: {
  side: "left" | "right";
  children: React.ReactNode;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "absolute top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white/90 backdrop-blur transition-colors hover:bg-white/20",
        side === "left" ? "left-4" : "right-4"
      )}
    >
      {children}
    </button>
  );
}

function IconBtn({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="rounded bg-white/95 p-1.5 text-text shadow-sm transition-colors hover:bg-white"
    >
      {children}
    </button>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "done"
      ? "bg-success/10 text-success"
      : status === "fail"
        ? "bg-danger/10 text-danger"
        : status === "raw" || status === "processing"
          ? "bg-warning/10 text-warning"
          : "bg-surface-2 text-text-muted";
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 font-mono text-[10px] font-medium",
        tone
      )}
    >
      {status}
    </span>
  );
}
