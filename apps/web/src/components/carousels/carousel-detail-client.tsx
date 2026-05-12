"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Save, RefreshCw, Trash2, AlertCircle, ImageIcon, Send, Calendar, ExternalLink, Shuffle, Images } from "lucide-react";
import { useJobsStream } from "@/lib/use-jobs-stream";
import { cn } from "@/lib/utils";

interface Slide {
  slide_number: number;
  type: "hook" | "content" | "outro";
  title: string;
  body: string | null;
  highlight?: string | null;
}

interface Angle {
  angle_title: string;
  angle_type: string;
  angle_description: string;
}

interface CarouselDetail {
  id: number;
  title: string | null;
  status: "draft" | "ready" | "scheduled" | "published" | "failed";
  slides: Slide[];
  caption: string | null;
  angle: Angle | null;
  candidateAngles: Angle[] | null;
  sourceNewsIds: number[] | null;
  scheduledAt: string | null;
  publerJobId: string | null;
  publerPostId: string | null;
  publerPostUrl: string | null;
  publishedAt: string | null;
  renderedAt: string | null;
  renderedPaths: string[] | null;
  renderFormat: "1:1" | "4:5" | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export function CarouselDetailClient({ carouselId }: { carouselId: number }) {
  const router = useRouter();
  const [item, setItem] = React.useState<CarouselDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [caption, setCaption] = React.useState("");
  const [slides, setSlides] = React.useState<Slide[]>([]);
  const [saving, setSaving] = React.useState(false);
  const [regenerating, setRegenerating] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);
  const [rendering, setRendering] = React.useState(false);
  const [publishing, setPublishing] = React.useState(false);
  const [scheduleAt, setScheduleAt] = React.useState<string>("");
  const [renderFormat, setRenderFormat] = React.useState<"1:1" | "4:5">("4:5");
  const [lightboxIndex, setLightboxIndex] = React.useState<number | null>(null);
  const [pickerSlide, setPickerSlide] = React.useState<number | null>(null);

  const previewCount = item?.renderedPaths?.length ?? 0;
  React.useEffect(() => {
    if (lightboxIndex === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxIndex(null);
      else if (e.key === "ArrowLeft")
        setLightboxIndex((i) => (i === null ? null : (i - 1 + previewCount) % previewCount));
      else if (e.key === "ArrowRight")
        setLightboxIndex((i) => (i === null ? null : (i + 1) % previewCount));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxIndex, previewCount]);

  const fetchItem = React.useCallback(async () => {
    const res = await fetch(`/api/carousels/${carouselId}`);
    if (!res.ok) {
      toast.error("Carousel introuvable");
      setLoading(false);
      return;
    }
    const json = (await res.json()) as { item: CarouselDetail };
    setItem(json.item);
    setCaption(json.item.caption || "");
    setSlides(json.item.slides || []);
    setDirty(false);
    setLoading(false);
  }, [carouselId]);

  React.useEffect(() => {
    void fetchItem();
  }, [fetchItem]);

  useJobsStream((evt) => {
    if (!("queue" in evt)) return;
    const isRender = evt.queue === "carousel-render";
    const isPublish = evt.queue === "carousel-publish";
    const isGenerate = evt.queue === "carousel-generate";
    if (!isRender && !isPublish && !isGenerate) return;

    const targetId =
      evt.type === "completed"
        ? (evt.result as { carouselId?: number } | undefined)?.carouselId
        : evt.type === "started"
          ? (evt.payload as { carouselId?: number } | undefined)?.carouselId
          : undefined;
    if (targetId !== carouselId && evt.type !== "failed") return;

    if (evt.type === "completed") {
      if (isRender) {
        toast.success("Slides rendues");
        setRendering(false);
      } else if (isPublish) {
        const r = evt.result as { scheduled?: boolean; url?: string | null } | undefined;
        toast.success(r?.scheduled ? "Carousel planifié" : "Carousel publié");
        setPublishing(false);
      } else {
        toast.success("Carousel régénéré");
        setRegenerating(false);
      }
      void fetchItem();
    }
    if (evt.type === "failed") {
      toast.error(`Échec : ${evt.error}`);
      void fetchItem();
      setRegenerating(false);
      setRendering(false);
      setPublishing(false);
    }
  });

  function updateSlide(index: number, patch: Partial<Slide>) {
    setSlides((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
    setDirty(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/carousels/${carouselId}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ caption, slides }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success("Sauvegardé");
      setDirty(false);
    } catch (err) {
      toast.error(`Sauvegarde échouée : ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleRegenerate(angleIndex: number) {
    if (!item?.sourceNewsIds?.[0]) {
      toast.error("Pas de news source");
      return;
    }
    setRegenerating(true);
    try {
      const res = await fetch(`/api/carousels/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ newsId: item.sourceNewsIds[0], angleIndex }),
      });
      if (!res.ok) throw new Error(await res.text());
      const json = (await res.json()) as { carouselId: number };
      toast.success("Génération en cours sur un nouveau carousel");
      router.push(`/carousels/${json.carouselId}`);
    } catch (err) {
      toast.error(`Échec : ${(err as Error).message}`);
      setRegenerating(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Supprimer ce carousel ?")) return;
    const res = await fetch(`/api/carousels/${carouselId}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Échec");
      return;
    }
    router.push("/carousels");
  }

  async function handleRender() {
    setRendering(true);
    try {
      const res = await fetch(`/api/carousels/${carouselId}/render`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ format: renderFormat }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success("Rendu en cours…");
    } catch (err) {
      toast.error(`Échec rendu : ${(err as Error).message}`);
      setRendering(false);
    }
  }

  async function handlePublish(scheduledAt: string | null) {
    if (dirty) {
      toast.error("Enregistre d'abord les modifications");
      return;
    }
    if (!item?.caption || !item.caption.trim()) {
      toast.error("Caption vide");
      return;
    }
    setPublishing(true);
    try {
      const res = await fetch(`/api/carousels/${carouselId}/publish`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scheduledAt: scheduledAt ?? null,
          format: renderFormat,
          forceRerender: false,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success(scheduledAt ? "Planification en cours…" : "Publication en cours…");
    } catch (err) {
      toast.error(`Échec : ${(err as Error).message}`);
      setPublishing(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-text-muted" strokeWidth={1.5} />
      </div>
    );
  }
  if (!item) {
    return <div className="text-sm text-text-muted">Introuvable.</div>;
  }

  const isGenerating = item.status === "draft" && (!item.slides || item.slides.length === 0);

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <Link
            href="/carousels"
            className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-text"
          >
            <ArrowLeft className="h-3 w-3" strokeWidth={1.5} />
            Retour
          </Link>
          <h1 className="text-xl font-semibold tracking-tight">
            {item.angle?.angle_title || item.title || `Carousel #${item.id}`}
          </h1>
          <p className="text-xs text-text-muted">
            <span className="font-mono">#{item.id}</span> · {item.status}
            {item.angle?.angle_type && ` · ${item.angle.angle_type.replace(/_/g, " ")}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void handleSave()}
            disabled={!dirty || saving}
            className="inline-flex items-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />
            ) : (
              <Save className="h-4 w-4" strokeWidth={1.5} />
            )}
            Enregistrer
          </button>
          <button
            onClick={() => void handleDelete()}
            className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-surface-2 hover:text-red-600"
          >
            <Trash2 className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>
      </header>

      {item.error && (
        <div className="flex items-start gap-2 rounded-md border border-red-500/40 bg-red-500/5 p-3 text-sm text-red-600">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" strokeWidth={1.5} />
          <span>{item.error}</span>
        </div>
      )}

      {isGenerating && (
        <div className="flex items-center gap-2 rounded-md border border-border bg-surface-2 p-3 text-sm text-text-muted">
          <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />
          Génération en cours…
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* Slides */}
        <div className="space-y-3">
          {/* Rendered previews row */}
          {item.renderedPaths && item.renderedPaths.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium uppercase tracking-wide text-text-muted">
                  Aperçu PNG ({item.renderedPaths.length})
                </h2>
                <span className="text-[10px] text-text-muted">
                  {item.renderFormat ?? "4:5"} ·{" "}
                  {item.renderedAt
                    ? new Date(item.renderedAt).toLocaleString("fr-FR")
                    : ""}
                </span>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-2">
                {item.renderedPaths.map((_, i) => {
                  const slideNum = i + 1;
                  const isOutro = slides[i]?.type === "outro";
                  return (
                    <div key={i} className="group relative flex-shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/carousels/${carouselId}/preview/${slideNum}?v=${item.renderedAt ? new Date(item.renderedAt).getTime() : 0}`}
                        alt={`Slide ${slideNum}`}
                        onClick={() => setLightboxIndex(i)}
                        className="h-44 w-auto cursor-zoom-in rounded-md border border-border bg-surface-2 object-cover transition-opacity hover:opacity-80"
                      />
                      {!isOutro && (
                        <div className="absolute right-1 top-1 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPickerSlide(slideNum);
                            }}
                            title="Choisir une image dans la banque"
                            className="rounded-full bg-black/60 p-1.5 text-white hover:bg-black/80"
                          >
                            <Images className="h-3.5 w-3.5" strokeWidth={2} />
                          </button>
                          <button
                            type="button"
                            onClick={async (e) => {
                              e.stopPropagation();
                              try {
                                const r = await fetch(
                                  `/api/carousels/${carouselId}/slides/${slideNum}/reroll-image`,
                                  { method: "POST" }
                                );
                                if (!r.ok) {
                                  const j = await r.json().catch(() => ({}));
                                  throw new Error(j?.error || `HTTP ${r.status}`);
                                }
                                toast.success(`Image ré-tirée (slide ${slideNum})`);
                                void fetchItem();
                              } catch (err) {
                                toast.error(`Échec : ${(err as Error).message}`);
                              }
                            }}
                            title="Tirer une autre image au hasard"
                            className="rounded-full bg-black/60 p-1.5 text-white hover:bg-black/80"
                          >
                            <Shuffle className="h-3.5 w-3.5" strokeWidth={2} />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <h2 className="text-sm font-medium uppercase tracking-wide text-text-muted">
            Slides ({slides.length})
          </h2>
          {slides.map((slide, idx) => (
            <SlideCard
              key={slide.slide_number}
              slide={slide}
              onChange={(patch) => updateSlide(idx, patch)}
            />
          ))}
          {slides.length === 0 && !isGenerating && (
            <p className="text-sm text-text-muted">Aucune slide.</p>
          )}
        </div>

        {/* Sidebar */}
        <aside className="space-y-6">
          {/* Publish panel */}
          <section className="space-y-3 rounded-md border border-border bg-surface p-4">
            <h2 className="text-sm font-medium uppercase tracking-wide text-text-muted">
              Publication
            </h2>

            {item.publerPostUrl && (
              <a
                href={item.publerPostUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
              >
                <ExternalLink className="h-3 w-3" strokeWidth={1.5} />
                Voir sur Instagram
              </a>
            )}
            {item.publishedAt && (
              <p className="text-[10px] text-text-muted">
                Publié le {new Date(item.publishedAt).toLocaleString("fr-FR")}
              </p>
            )}
            {item.scheduledAt && item.status === "scheduled" && (
              <p className="text-[10px] text-text-muted">
                Planifié le {new Date(item.scheduledAt).toLocaleString("fr-FR")}
              </p>
            )}

            <div className="flex items-center gap-2">
              <label className="text-[10px] uppercase tracking-wide text-text-muted">
                Format
              </label>
              <select
                value={renderFormat}
                onChange={(e) => setRenderFormat(e.target.value as "1:1" | "4:5")}
                className="rounded-md border border-border bg-surface-2 px-2 py-1 text-xs"
              >
                <option value="4:5">4 : 5 (1080×1350)</option>
                <option value="1:1">1 : 1 (1080×1080)</option>
              </select>
            </div>

            <button
              onClick={() => void handleRender()}
              disabled={rendering || slides.length === 0}
              className="flex w-full items-center justify-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm hover:border-border-hover hover:bg-surface-2 disabled:opacity-50"
            >
              {rendering ? (
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />
              ) : (
                <ImageIcon className="h-4 w-4" strokeWidth={1.5} />
              )}
              {item.renderedPaths?.length ? "Re-rendre les PNG" : "Rendre les PNG"}
            </button>

            <button
              onClick={() => void handlePublish(null)}
              disabled={publishing || !item.caption?.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-fg hover:bg-accent/90 disabled:opacity-50"
            >
              {publishing ? (
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />
              ) : (
                <Send className="h-4 w-4" strokeWidth={1.5} />
              )}
              Publier maintenant
            </button>

            <div className="space-y-2 border-t border-border pt-3">
              <label className="block space-y-1">
                <span className="text-[10px] uppercase tracking-wide text-text-muted">
                  Planifier à
                </span>
                <input
                  type="datetime-local"
                  value={scheduleAt}
                  onChange={(e) => setScheduleAt(e.target.value)}
                  className="w-full rounded-md border border-border bg-surface-2 px-2 py-1 text-sm focus:border-accent focus:outline-none"
                />
              </label>
              <button
                onClick={() => {
                  if (!scheduleAt) {
                    toast.error("Sélectionne une date");
                    return;
                  }
                  void handlePublish(new Date(scheduleAt).toISOString());
                }}
                disabled={publishing || !scheduleAt || !item.caption?.trim()}
                className="flex w-full items-center justify-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm hover:border-border-hover hover:bg-surface-2 disabled:opacity-50"
              >
                <Calendar className="h-4 w-4" strokeWidth={1.5} />
                Planifier
              </button>
            </div>
          </section>

          <section>
            <h2 className="text-sm font-medium uppercase tracking-wide text-text-muted">
              Caption
            </h2>
            <textarea
              value={caption}
              onChange={(e) => {
                setCaption(e.target.value);
                setDirty(true);
              }}
              rows={10}
              className="mt-2 w-full rounded-md border border-border bg-surface p-3 text-sm focus:border-accent focus:outline-none"
              placeholder="Caption Instagram…"
            />
            <p className="mt-1 text-[10px] text-text-muted">
              {caption.length} caractères
            </p>
          </section>

          {item.angle && (
            <section>
              <h2 className="text-sm font-medium uppercase tracking-wide text-text-muted">
                Angle
              </h2>
              <div className="mt-2 space-y-1 rounded-md border border-border bg-surface p-3 text-sm">
                <p className="font-medium">{item.angle.angle_title}</p>
                <p className="text-[10px] uppercase tracking-wide text-text-muted">
                  {item.angle.angle_type.replace(/_/g, " ")}
                </p>
                <p className="text-xs text-text-muted">{item.angle.angle_description}</p>
              </div>
            </section>
          )}

          {item.candidateAngles && item.candidateAngles.length > 0 && (
            <section>
              <h2 className="text-sm font-medium uppercase tracking-wide text-text-muted">
                Régénérer avec un autre angle
              </h2>
              <div className="mt-2 space-y-2">
                {item.candidateAngles.map((a, i) => (
                  <button
                    key={i}
                    disabled={regenerating}
                    onClick={() => void handleRegenerate(i)}
                    className={cn(
                      "w-full rounded-md border border-border bg-surface p-3 text-left text-sm hover:border-accent disabled:opacity-50",
                      item.angle?.angle_title === a.angle_title && "border-accent"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase tracking-wide text-text-muted">
                        {a.angle_type.replace(/_/g, " ")}
                      </span>
                      {regenerating ? (
                        <Loader2 className="h-3 w-3 animate-spin" strokeWidth={1.5} />
                      ) : (
                        <RefreshCw className="h-3 w-3 text-text-muted" strokeWidth={1.5} />
                      )}
                    </div>
                    <p className="mt-1 font-medium">{a.angle_title}</p>
                  </button>
                ))}
              </div>
            </section>
          )}

          {item.sourceNewsIds && item.sourceNewsIds.length > 0 && (
            <section>
              <h2 className="text-sm font-medium uppercase tracking-wide text-text-muted">
                Source
              </h2>
              <Link
                href={`/news?focus=${item.sourceNewsIds[0]}`}
                className="mt-2 inline-block text-xs text-accent hover:underline"
              >
                News #{item.sourceNewsIds[0]}
              </Link>
            </section>
          )}
        </aside>
      </div>

      {pickerSlide !== null && (
        <BankPickerModal
          slideNumber={pickerSlide}
          onClose={() => setPickerSlide(null)}
          onPick={async (storageKey) => {
            try {
              const r = await fetch(
                `/api/carousels/${carouselId}/slides/${pickerSlide}/set-image`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ storageKey }),
                }
              );
              if (!r.ok) {
                const j = await r.json().catch(() => ({}));
                throw new Error(j?.error || `HTTP ${r.status}`);
              }
              toast.success(`Image définie (slide ${pickerSlide})`);
              setPickerSlide(null);
              void fetchItem();
            } catch (err) {
              toast.error(`Échec : ${(err as Error).message}`);
            }
          }}
        />
      )}

      {lightboxIndex !== null && item.renderedPaths && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
          onClick={() => setLightboxIndex(null)}
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setLightboxIndex((i) => (i === null ? null : (i - 1 + previewCount) % previewCount));
            }}
            className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 px-4 py-3 text-white hover:bg-white/20"
            aria-label="Précédent"
          >
            ‹
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/carousels/${carouselId}/preview/${lightboxIndex + 1}`}
            alt={`Slide ${lightboxIndex + 1}`}
            className="max-h-full max-w-full rounded-md object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setLightboxIndex((i) => (i === null ? null : (i + 1) % previewCount));
            }}
            className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 px-4 py-3 text-white hover:bg-white/20"
            aria-label="Suivant"
          >
            ›
          </button>
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 text-xs text-white">
            {lightboxIndex + 1} / {previewCount} · ← → pour naviguer · Échap pour fermer
          </div>
          <button
            type="button"
            onClick={() => setLightboxIndex(null)}
            className="absolute right-4 top-4 rounded-full bg-white/10 px-3 py-1 text-white hover:bg-white/20"
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

function SlideCard({
  slide,
  onChange,
}: {
  slide: Slide;
  onChange: (patch: Partial<Slide>) => void;
}) {
  return (
    <div className="space-y-2 rounded-md border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-wide text-text-muted">
          Slide {slide.slide_number} · {slide.type}
        </span>
      </div>
      <input
        value={slide.title}
        onChange={(e) => onChange({ title: e.target.value })}
        className="w-full rounded-md border border-border bg-surface-2 px-2 py-1 text-sm font-medium focus:border-accent focus:outline-none"
        placeholder="Titre"
      />
      {slide.type !== "hook" && (
        <textarea
          value={slide.body || ""}
          onChange={(e) => onChange({ body: e.target.value })}
          rows={4}
          className="w-full rounded-md border border-border bg-surface-2 px-2 py-1 text-sm focus:border-accent focus:outline-none"
          placeholder="Contenu"
        />
      )}
      {slide.type === "content" && (
        <input
          value={slide.highlight || ""}
          onChange={(e) => onChange({ highlight: e.target.value })}
          className="w-full rounded-md border border-border bg-[rgba(96,165,250,0.18)] px-2 py-1 text-sm font-semibold italic focus:border-accent focus:outline-none"
          placeholder="Phrase à surligner (extrait du contenu)"
        />
      )}
    </div>
  );
}

interface BankItem {
  id: number;
  filename: string;
  storageKey: string;
  status: string;
  source: string | null;
  width: number | null;
  height: number | null;
}

function BankPickerModal({
  slideNumber,
  onClose,
  onPick,
}: {
  slideNumber: number;
  onClose: () => void;
  onPick: (storageKey: string) => void | Promise<void>;
}) {
  const [items, setItems] = React.useState<BankItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [hasMore, setHasMore] = React.useState(false);
  const [offset, setOffset] = React.useState(0);
  const [filter, setFilter] = React.useState<"available" | "all">("available");
  const sentinelRef = React.useRef<HTMLDivElement | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [uploadError, setUploadError] = React.useState<string | null>(null);
  const PAGE_SIZE = 60;

  // Reset + initial fetch quand le filtre change
  React.useEffect(() => {
    let alive = true;
    setLoading(true);
    setItems([]);
    setOffset(0);
    setHasMore(false);
    fetch(`/api/bank?filter=${filter}&limit=${PAGE_SIZE}&offset=0`)
      .then((r) => r.json())
      .then((j: { items: BankItem[]; hasMore?: boolean; nextOffset?: number }) => {
        if (!alive) return;
        setItems(j.items || []);
        setHasMore(Boolean(j.hasMore));
        setOffset(j.nextOffset ?? (j.items?.length ?? 0));
        setLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [filter]);

  // Lazy load via IntersectionObserver sur le sentinel
  React.useEffect(() => {
    if (loading || loadingMore || !hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        setLoadingMore(true);
        fetch(`/api/bank?filter=${filter}&limit=${PAGE_SIZE}&offset=${offset}`)
          .then((r) => r.json())
          .then((j: { items: BankItem[]; hasMore?: boolean; nextOffset?: number }) => {
            setItems((prev) => [...prev, ...(j.items || [])]);
            setHasMore(Boolean(j.hasMore));
            setOffset(j.nextOffset ?? offset + (j.items?.length ?? 0));
            setLoadingMore(false);
          })
          .catch(() => setLoadingMore(false));
      },
      { rootMargin: "200px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [filter, offset, hasMore, loading, loadingMore]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleUploadFiles = React.useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || !fileList.length) return;
      setUploading(true);
      setUploadError(null);
      try {
        const fd = new FormData();
        fd.append("source", "upload_generic");
        for (const f of Array.from(fileList)) fd.append("files", f);
        const r = await fetch("/api/bank/upload", { method: "POST", body: fd });
        const j = (await r.json()) as {
          results?: Array<{
            filename: string;
            status: string;
            imageId?: number;
            storageKey?: string;
            error?: string;
          }>;
          error?: string;
        };
        if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
        const ok = (j.results || []).find((x) => x.storageKey && x.status !== "error");
        const failed = (j.results || []).find((x) => x.status === "error");
        if (failed && !ok) throw new Error(failed.error || "upload échoué");
        if (ok?.storageKey) {
          // Sélectionne directement la première image uploadée pour la slide
          await onPick(ok.storageKey);
          return;
        }
        // Pas d'erreur mais pas de storageKey → recharge la liste
        setOffset(0);
        setItems([]);
        setHasMore(false);
        setLoading(true);
        const rr = await fetch(
          `/api/bank?filter=${filter}&limit=${PAGE_SIZE}&offset=0`
        );
        const jj = await rr.json();
        setItems(jj.items || []);
        setHasMore(Boolean(jj.hasMore));
        setOffset(jj.nextOffset ?? (jj.items?.length ?? 0));
        setLoading(false);
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : String(err));
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [filter, onPick]
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold">
              Choisir une image · slide {slideNumber}
            </h3>
            <div className="flex gap-1 rounded-md border border-border p-0.5 text-[11px]">
              {(["available", "all"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setFilter(k)}
                  className={
                    "rounded px-2 py-0.5 transition-colors " +
                    (filter === k
                      ? "bg-accent text-white"
                      : "text-text-muted hover:text-text")
                  }
                >
                  {k === "available" ? "Disponibles" : "Toutes"}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              className="hidden"
              onChange={(e) => void handleUploadFiles(e.target.files)}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="rounded-md border border-border bg-surface-2 px-2 py-1 text-[11px] font-medium text-text hover:border-accent hover:text-accent disabled:cursor-wait disabled:opacity-60"
              title="Uploader une image depuis l'ordinateur"
            >
              {uploading ? "Upload…" : "+ Upload"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full bg-surface-2 px-2 py-0.5 text-sm text-text-muted hover:text-text"
              aria-label="Fermer"
            >
              ✕
            </button>
          </div>
        </div>
        {uploadError ? (
          <div className="border-b border-red-500/30 bg-red-500/10 px-4 py-2 text-xs text-red-400">
            Upload échoué : {uploadError}
          </div>
        ) : null}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex h-40 items-center justify-center text-sm text-text-muted">
              Chargement…
            </div>
          ) : !items.length ? (
            <div className="flex h-40 items-center justify-center text-sm text-text-muted">
              Aucune image dans la banque.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
                {items.map((it) => (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => onPick(it.storageKey)}
                    className="group relative aspect-square overflow-hidden rounded-md border border-border bg-surface-2 transition-all hover:border-accent hover:ring-2 hover:ring-accent/40"
                    title={it.filename}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/bank/file/${it.id}`}
                      alt={it.filename}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  </button>
                ))}
              </div>
              {hasMore && (
                <div
                  ref={sentinelRef}
                  className="flex h-16 items-center justify-center text-xs text-text-muted"
                >
                  {loadingMore ? "Chargement…" : ""}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
