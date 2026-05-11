"use client";

import * as React from "react";
import { DropZone } from "@/components/bank/drop-zone";
import { BankGrid, type BankImage } from "@/components/bank/bank-grid";
import { useJobsStream } from "@/lib/use-jobs-stream";
import { cn } from "@/lib/utils";

const FILTERS = [
  { key: "available", label: "Disponibles" },
  { key: "raw", label: "En cours" },
  { key: "used", label: "Utilisées" },
  { key: "failed", label: "Échecs" },
  { key: "all", label: "Toutes" },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

export function BankPageClient() {
  const [filter, setFilter] = React.useState<FilterKey>("available");
  const [sort, setSort] = React.useState<"recent" | "popular">("recent");
  const [items, setItems] = React.useState<BankImage[]>([]);
  const [loading, setLoading] = React.useState(true);

  const fetchItems = React.useCallback(async () => {
    try {
      const res = await fetch(`/api/bank?filter=${filter}&sort=${sort}`);
      if (!res.ok) return;
      const json = (await res.json()) as { items: BankImage[] };
      setItems(json.items);
    } finally {
      setLoading(false);
    }
  }, [filter, sort]);

  React.useEffect(() => {
    setLoading(true);
    void fetchItems();
  }, [fetchItems]);

  const refreshTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  useJobsStream((evt) => {
    if (evt.type === "image:updated" || evt.type === "completed") {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => void fetchItems(), 400);
    }
  });

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Banque d&apos;images</h1>
          <p className="mt-1 text-sm text-text-muted">
            {items.length} image{items.length > 1 ? "s" : ""}
            {loading && " · chargement…"}
          </p>
        </div>
      </header>

      <div className="grid gap-3 md:grid-cols-2">
        <DropZone
          source="upload_raw"
          title="Upload RAW (à détourer)"
          hint="PNG, JPG, WebP · sera traité automatiquement"
          onUploaded={() => void fetchItems()}
        />
        <DropZone
          source="upload_generic"
          title="Upload générique"
          hint="PNG transparent prêt à l&apos;emploi"
          onUploaded={() => void fetchItems()}
        />
      </div>

      <div className="flex items-center justify-between border-b border-border pb-2">
        <div className="flex gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                filter === f.key
                  ? "bg-accent text-accent-fg"
                  : "text-text-body hover:bg-surface-2 hover:text-text"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1 text-xs">
          <SortBtn active={sort === "recent"} onClick={() => setSort("recent")}>
            Récentes
          </SortBtn>
          <SortBtn active={sort === "popular"} onClick={() => setSort("popular")}>
            Populaires
          </SortBtn>
        </div>
      </div>

      <BankGrid items={items} onMutate={() => void fetchItems()} />
    </div>
  );
}

function SortBtn({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
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
