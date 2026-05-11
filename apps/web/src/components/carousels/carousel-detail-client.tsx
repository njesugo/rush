"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Save, RefreshCw, Trash2, AlertCircle } from "lucide-react";
import { useJobsStream } from "@/lib/use-jobs-stream";
import { cn } from "@/lib/utils";

interface Slide {
  slide_number: number;
  type: "hook" | "content" | "outro";
  title: string;
  body: string | null;
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
    if (!("queue" in evt) || evt.queue !== "carousel-generate") return;
    const targetId =
      evt.type === "completed"
        ? (evt.result as { carouselId?: number } | undefined)?.carouselId
        : evt.type === "started"
          ? (evt.payload as { carouselId?: number } | undefined)?.carouselId
          : undefined;
    if (targetId !== carouselId && evt.type !== "failed") return;
    if (evt.type === "completed") {
      toast.success("Carousel régénéré");
      void fetchItem();
      setRegenerating(false);
    }
    if (evt.type === "failed") {
      toast.error(`Échec : ${evt.error}`);
      void fetchItem();
      setRegenerating(false);
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
    </div>
  );
}
