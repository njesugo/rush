import { Queue, type Job } from "bullmq";
import { getRedis } from "./redis";
import { QUEUE_NAMES, type QueueName } from "./queues";

export interface JobLite {
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

export interface QueueSummary {
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

const _qCache = new Map<string, Queue>();
function getQueue(name: string): Queue {
  const e = _qCache.get(name);
  if (e) return e;
  const q = new Queue(name, { connection: getRedis() });
  _qCache.set(name, q);
  return q;
}

async function jobToLite(j: Job): Promise<JobLite> {
  return {
    id: String(j.id),
    name: j.name,
    state: await j.getState(),
    progress: j.progress,
    attemptsMade: j.attemptsMade,
    data: j.data,
    failedReason: j.failedReason,
    returnvalue: j.returnvalue,
    timestamp: j.timestamp,
    processedOn: j.processedOn ?? undefined,
    finishedOn: j.finishedOn ?? undefined,
  };
}

export async function summarizeQueue(name: string, perStateLimit: number): Promise<QueueSummary> {
  const queue = getQueue(name);
  const counts = await queue.getJobCounts("waiting", "active", "completed", "failed", "delayed");

  const [active, waiting, failed, completed, delayed] = await Promise.all([
    queue.getJobs(["active"], 0, perStateLimit - 1, false),
    queue.getJobs(["waiting"], 0, perStateLimit - 1, false),
    queue.getJobs(["failed"], 0, perStateLimit - 1, false),
    queue.getJobs(["completed"], 0, perStateLimit - 1, false),
    queue.getJobs(["delayed"], 0, perStateLimit - 1, false),
  ]);

  const jobs = await Promise.all(
    [...active, ...waiting, ...delayed, ...failed, ...completed].map(jobToLite)
  );
  jobs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  return {
    name,
    counts: {
      waiting: counts.waiting ?? 0,
      active: counts.active ?? 0,
      completed: counts.completed ?? 0,
      failed: counts.failed ?? 0,
      delayed: counts.delayed ?? 0,
    },
    jobs,
  };
}

export async function summarizeAllQueues(perStateLimit: number): Promise<QueueSummary[]> {
  const queues = Object.values(QUEUE_NAMES);
  return Promise.all(queues.map((name) => summarizeQueue(name, perStateLimit)));
}

export type JobAction = "retryFailed" | "cleanCompleted" | "cleanFailed" | "retryJob" | "removeJob";

export interface JobActionResult {
  ok: true;
  retried?: number;
  removed?: number;
}

export async function runJobAction(
  name: string,
  action: JobAction,
  jobId?: string
): Promise<JobActionResult> {
  const queue = getQueue(name);
  switch (action) {
    case "retryFailed": {
      const failed = await queue.getJobs(["failed"], 0, 200, false);
      await Promise.all(failed.map((j) => j.retry().catch(() => {})));
      return { ok: true, retried: failed.length };
    }
    case "cleanCompleted": {
      const ids = await queue.clean(0, 1000, "completed");
      return { ok: true, removed: ids.length };
    }
    case "cleanFailed": {
      const ids = await queue.clean(0, 1000, "failed");
      return { ok: true, removed: ids.length };
    }
    case "retryJob": {
      if (!jobId) throw new Error("jobId required");
      const job = await queue.getJob(jobId);
      if (!job) throw new Error("job not found");
      await job.retry();
      return { ok: true };
    }
    case "removeJob": {
      if (!jobId) throw new Error("jobId required");
      const job = await queue.getJob(jobId);
      if (!job) throw new Error("job not found");
      await job.remove();
      return { ok: true };
    }
  }
}

export function isKnownQueueName(s: string): s is QueueName {
  return (Object.values(QUEUE_NAMES) as string[]).includes(s);
}
