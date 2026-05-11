"use client";

import * as React from "react";
import { RefreshCw, RotateCcw, Trash2, Loader2, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { useJobsStream } from "@/lib/use-jobs-stream";
import { cn } from "@/lib/utils";

interface JobLite {
  id: string;
  name: string;
  state: string;
  progress: unknown;
  attemptsMade: number;
  data: unknown;
  failedReason?: string;
  returnvalue?: unknown;
  timestamp: number;
  processedOn?: number;
  finishedOn?: number;
}

interface QueueSummary {
  name: string;
  counts: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  };
  jobs: JobLite[];
}

interface ApiResponse {
  queues: QueueSummary[];
}

const QUEUE_LABELS: Record<string, string> = {
  "bg-removal": "Détourage",
  "pinterest-sync": "Pinterest",
  "pinterest-scrape": "Pinterest scrape",
  "publer-schedule": "Publer",
  "bank-review-push": "Bank review",
  "news-scrape": "News",
  "carousel-generate": "Carrousels",
};

const STATE_FILTERS = [
  { key: "all", label: "Tous" },
  { key: "active", label: "Actifs" },
  { key: "waiting", label: "En attente" },
  { key: "delayed", label: "Différés" },
  { key: "failed", label: "Échecs" },
  { key: "completed", label: "Terminés" },
] as const;
type StateFilter = (typeof STATE_FILTERS)[number]["key"];

export function JobsPageClient() {
  const [data, setData] = React.useState<ApiResponse | null>(null);
  const [activeQueue, setActiveQueue] = React.useState<string | null>(null);
  const [stateFilter, setStateFilter] = React.useState<StateFilter>("all");
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [expandedJob, setExpandedJob] = React.useState<string | null>(null);

  const fetchData = React.useCallback(async () => {
    try {
      const res = await fetch("/api/jobs?limit=40");
      if (!res.ok) return;
      const json = (await res.json()) as ApiResponse;
      setData(json);
      setActiveQueue((cur) => cur ?? json.queues[0]?.name ?? null);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // Live refresh on any job event (debounced)
  const refreshTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  useJobsStream(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => void fetchData(), 350);
  });

  // Periodic refresh fallback (active jobs progress)
  React.useEffect(() => {
    const t = setInterval(() => void fetchData(), 5000);
    return () => clearInterval(t);
  }, [fetchData]);

  const queue = data?.queues.find((q) => q.name === activeQueue) ?? null;

  const action = async (queueName: string, body: Record<string, unknown>, label: string) => {
    setBusy(`${queueName}:${body.action}:${body.jobId ?? ""}`);
    try {
      const res = await fetch(`/api/jobs/${queueName}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      const json = (await res.json()) as Record<string, unknown>;
      const detail =
        typeof json.retried === "number"
          ? ` (${json.retried})`
          : typeof json.removed === "number"
            ? ` (${json.removed})`
            : "";
      toast.success(`${label}${detail}`);
      await fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(null);
    }
  };

  const filteredJobs = React.useMemo(() => {
    if (!queue) return [];
    if (stateFilter === "all") return queue.jobs;
    return queue.jobs.filter((j) => j.state === stateFilter);
  }, [queue, stateFilter]);

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tâches</h1>
          <p className="mt-1 text-sm text-text-muted">
            Files BullMQ live{loading && " · chargement…"}
          </p>
        </div>
        <button
          onClick={() => void fetchData()}
          className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-1.5 text-sm hover:border-border-hover hover:bg-surface-2"
        >
          <RefreshCw className="h-4 w-4" strokeWidth={1.5} />
          Rafraîchir
        </button>
      </header>

      {/* Queue tabs */}
      <div className="flex flex-wrap gap-2 border-b border-border pb-3">
        {data?.queues.map((q) => {
          const total = q.counts.waiting + q.counts.active + q.counts.delayed + q.counts.failed;
          const isActive = q.name === activeQueue;
          return (
            <button
              key={q.name}
              onClick={() => {
                setActiveQueue(q.name);
                setStateFilter("all");
                setExpandedJob(null);
              }}
              className={cn(
                "group flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors",
                isActive
                  ? "border-accent bg-accent-soft text-text"
                  : "border-border bg-surface text-text-muted hover:border-border-hover"
              )}
            >
              <span className="font-medium">{QUEUE_LABELS[q.name] ?? q.name}</span>
              <span className="flex items-center gap-1 text-xs">
                {q.counts.active > 0 && (
                  <Pill color="amber">{q.counts.active} actif{q.counts.active > 1 ? "s" : ""}</Pill>
                )}
                {q.counts.failed > 0 && <Pill color="red">{q.counts.failed} fail</Pill>}
                {q.counts.waiting > 0 && <Pill color="muted">{q.counts.waiting} att.</Pill>}
                {total === 0 && <span className="text-text-muted/60">vide</span>}
              </span>
            </button>
          );
        })}
      </div>

      {queue && (
        <>
          {/* Counts row + actions */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <CountCard label="En attente" value={queue.counts.waiting} />
            <CountCard label="Actifs" value={queue.counts.active} highlight={queue.counts.active > 0} />
            <CountCard label="Différés" value={queue.counts.delayed} />
            <CountCard label="Échecs" value={queue.counts.failed} danger={queue.counts.failed > 0} />
            <CountCard label="Terminés" value={queue.counts.completed} muted />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-2">
            <div className="flex flex-wrap gap-1">
              {STATE_FILTERS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setStateFilter(f.key)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm transition-colors",
                    stateFilter === f.key
                      ? "bg-accent text-accent-fg"
                      : "text-text-muted hover:bg-surface-2"
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => void action(queue.name, { action: "retryFailed" }, "Rejoués")}
                disabled={queue.counts.failed === 0 || busy !== null}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1 text-xs hover:bg-surface-2 disabled:opacity-40"
              >
                <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.5} />
                Rejouer les échecs
              </button>
              <button
                onClick={() => void action(queue.name, { action: "cleanFailed" }, "Échecs purgés")}
                disabled={queue.counts.failed === 0 || busy !== null}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1 text-xs hover:bg-surface-2 disabled:opacity-40"
              >
                <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                Purger échecs
              </button>
              <button
                onClick={() => void action(queue.name, { action: "cleanCompleted" }, "Terminés purgés")}
                disabled={queue.counts.completed === 0 || busy !== null}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1 text-xs hover:bg-surface-2 disabled:opacity-40"
              >
                <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                Purger terminés
              </button>
            </div>
          </div>

          {filteredJobs.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-surface p-12 text-center">
              <p className="text-sm text-text-muted">Aucun job pour ce filtre.</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-surface text-xs uppercase tracking-wide text-text-muted">
                  <tr>
                    <th className="w-8 px-2 py-2"></th>
                    <th className="px-3 py-2 text-left">ID</th>
                    <th className="px-3 py-2 text-left">État</th>
                    <th className="px-3 py-2 text-left">Job</th>
                    <th className="px-3 py-2 text-left">Tentatives</th>
                    <th className="px-3 py-2 text-left">Durée</th>
                    <th className="px-3 py-2 text-left">Démarré</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-bg">
                  {filteredJobs.map((j) => (
                    <JobRow
                      key={`${queue.name}-${j.id}`}
                      job={j}
                      queueName={queue.name}
                      expanded={expandedJob === j.id}
                      onToggle={() => setExpandedJob((cur) => (cur === j.id ? null : j.id))}
                      busy={busy}
                      onAction={(body, label) => action(queue.name, body, label)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function CountCard({
  label,
  value,
  highlight,
  danger,
  muted,
}: {
  label: string;
  value: number;
  highlight?: boolean;
  danger?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-surface p-3",
        danger ? "border-red-500/30" : highlight ? "border-amber-500/30" : "border-border",
        muted && "opacity-70"
      )}
    >
      <p className="text-xs uppercase tracking-wide text-text-muted">{label}</p>
      <p
        className={cn(
          "mt-1 font-mono text-xl font-semibold tabular-nums",
          danger && value > 0 && "text-red-600",
          highlight && value > 0 && "text-amber-600"
        )}
      >
        {value}
      </p>
    </div>
  );
}

function Pill({ children, color }: { children: React.ReactNode; color: "amber" | "red" | "muted" }) {
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 font-mono text-[10px]",
        color === "amber" && "bg-amber-500/15 text-amber-600",
        color === "red" && "bg-red-500/15 text-red-600",
        color === "muted" && "bg-text-muted/15 text-text-muted"
      )}
    >
      {children}
    </span>
  );
}

function JobRow({
  job,
  queueName,
  expanded,
  onToggle,
  busy,
  onAction,
}: {
  job: JobLite;
  queueName: string;
  expanded: boolean;
  onToggle: () => void;
  busy: string | null;
  onAction: (body: Record<string, unknown>, label: string) => void;
}) {
  const startedAt = job.processedOn
    ? new Date(job.processedOn).toLocaleTimeString("fr-FR")
    : new Date(job.timestamp).toLocaleTimeString("fr-FR");
  const duration =
    job.processedOn && job.finishedOn
      ? `${((job.finishedOn - job.processedOn) / 1000).toFixed(1)}s`
      : job.processedOn
        ? `${((Date.now() - job.processedOn) / 1000).toFixed(0)}s…`
        : "—";

  const stateClass: Record<string, string> = {
    active: "bg-amber-500/15 text-amber-600",
    waiting: "bg-text-muted/15 text-text-muted",
    delayed: "bg-text-muted/15 text-text-muted",
    failed: "bg-red-500/15 text-red-600",
    completed: "bg-emerald-500/15 text-emerald-600",
  };
  const isBusyRow = busy?.startsWith(`${queueName}:`) && busy.endsWith(`:${job.id}`);

  return (
    <>
      <tr className="hover:bg-surface/50">
        <td className="px-2 py-2">
          <button
            onClick={onToggle}
            className={cn(
              "rounded p-1 transition-transform",
              expanded ? "rotate-90 text-text" : "text-text-muted hover:text-text"
            )}
          >
            <ChevronRight className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
        </td>
        <td className="px-3 py-2 font-mono text-xs">{job.id}</td>
        <td className="px-3 py-2">
          <span className={cn("rounded px-2 py-0.5 text-[11px] font-medium", stateClass[job.state] ?? "bg-text-muted/15 text-text-muted")}>
            {job.state}
            {job.state === "active" && typeof job.progress === "number" && job.progress > 0 && (
              <span className="ml-1 font-mono">{Math.round(job.progress)}%</span>
            )}
          </span>
        </td>
        <td className="px-3 py-2">{job.name}</td>
        <td className="px-3 py-2 font-mono text-xs">{job.attemptsMade}</td>
        <td className="px-3 py-2 font-mono text-xs text-text-muted">{duration}</td>
        <td className="px-3 py-2 font-mono text-xs text-text-muted">{startedAt}</td>
        <td className="px-3 py-2">
          <div className="flex justify-end gap-1">
            {job.state === "failed" && (
              <button
                title="Rejouer"
                disabled={isBusyRow}
                onClick={() => onAction({ action: "retryJob", jobId: job.id }, "Job rejoué")}
                className="rounded p-1 text-text-muted hover:bg-surface-2 hover:text-text disabled:opacity-40"
              >
                {isBusyRow ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} />
                ) : (
                  <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.5} />
                )}
              </button>
            )}
            {(job.state === "failed" || job.state === "completed" || job.state === "delayed") && (
              <button
                title="Supprimer"
                disabled={isBusyRow}
                onClick={() => onAction({ action: "removeJob", jobId: job.id }, "Job supprimé")}
                className="rounded p-1 text-text-muted hover:bg-surface-2 hover:text-red-600 disabled:opacity-40"
              >
                <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
              </button>
            )}
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-surface/40">
          <td colSpan={8} className="px-4 py-3">
            <div className="space-y-2">
              {job.failedReason && (
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-text-muted">Erreur</p>
                  <pre className="mt-1 whitespace-pre-wrap break-words rounded bg-red-500/5 p-2 font-mono text-xs text-red-600">
                    {job.failedReason}
                  </pre>
                </div>
              )}
              <div>
                <p className="text-[10px] uppercase tracking-wide text-text-muted">Données</p>
                <pre className="mt-1 max-h-48 overflow-auto rounded bg-bg p-2 font-mono text-xs">
                  {JSON.stringify(job.data, null, 2)}
                </pre>
              </div>
              {job.returnvalue !== undefined && job.returnvalue !== null && (
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-text-muted">Résultat</p>
                  <pre className="mt-1 max-h-48 overflow-auto rounded bg-bg p-2 font-mono text-xs">
                    {JSON.stringify(job.returnvalue, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
