"use client";

import * as React from "react";
import { UploadCloud, ImagePlus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Source = "upload_raw" | "upload_generic";

interface Props {
  source: Source;
  title: string;
  hint: string;
  onUploaded?: () => void;
}

export function DropZone({ source, title, hint, onUploaded }: Props) {
  const [dragging, setDragging] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState<{ done: number; total: number } | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const upload = React.useCallback(
    async (fileList: FileList | File[]) => {
      const files = Array.from(fileList);
      if (files.length === 0) return;
      setBusy(true);
      setProgress({ done: 0, total: files.length });
      try {
        const chunkSize = 8;
        let done = 0;
        let dup = 0;
        let errs = 0;
        for (let i = 0; i < files.length; i += chunkSize) {
          const chunk = files.slice(i, i + chunkSize);
          const form = new FormData();
          form.set("source", source);
          for (const f of chunk) form.append("files", f);
          const res = await fetch("/api/bank/upload", { method: "POST", body: form });
          if (!res.ok) {
            errs += chunk.length;
          } else {
            const json = (await res.json()) as { results: Array<{ status: string }> };
            for (const r of json.results) {
              if (r.status === "duplicate") dup++;
              else if (r.status === "error") errs++;
            }
          }
          done += chunk.length;
          setProgress({ done, total: files.length });
        }
        const ok = files.length - dup - errs;
        toast.success(
          source === "upload_raw"
            ? `${ok} envoyée(s) au détourage` + (dup ? ` · ${dup} déjà connues` : "")
            : `${ok} ajoutée(s)` + (dup ? ` · ${dup} déjà connues` : "")
        );
        if (errs) toast.error(`${errs} erreur(s)`);
        onUploaded?.();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setBusy(false);
        setTimeout(() => setProgress(null), 1200);
      }
    },
    [source, onUploaded]
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (e.dataTransfer.files?.length) upload(e.dataTransfer.files);
      }}
      onClick={() => inputRef.current?.click()}
      className={cn(
        "relative flex h-32 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed bg-surface text-center transition-all duration-180 ease-smooth",
        dragging
          ? "border-accent bg-surface-2"
          : "border-border hover:border-border-hover hover:bg-surface-2",
        busy && "pointer-events-none opacity-70"
      )}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) upload(e.target.files);
          e.target.value = "";
        }}
      />
      <div className="flex items-center gap-2 text-text">
        {source === "upload_raw" ? (
          <UploadCloud className="h-5 w-5" strokeWidth={1.5} />
        ) : (
          <ImagePlus className="h-5 w-5" strokeWidth={1.5} />
        )}
        <span className="text-sm font-medium">{title}</span>
      </div>
      <p className="mt-1 text-xs text-text-muted">{hint}</p>
      {progress && (
        <div className="absolute inset-x-3 bottom-2 h-1 overflow-hidden rounded-full bg-border">
          <div
            className="h-full bg-accent transition-all duration-200"
            style={{ width: `${(progress.done / progress.total) * 100}%` }}
          />
        </div>
      )}
    </div>
  );
}
