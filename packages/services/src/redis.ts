import IORedis, { type Redis } from "ioredis";

let _redis: Redis | null = null;
let _sub: Redis | null = null;

function makeClient(): Redis {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL is not set");
  return new IORedis(url, { maxRetriesPerRequest: null });
}

/** Shared client for BullMQ (commands + producers). */
export function getRedis(): Redis {
  if (!_redis) _redis = makeClient();
  return _redis;
}

/** Dedicated subscriber connection (BullMQ requires its own; we use for SSE pubsub). */
export function getRedisSubscriber(): Redis {
  if (!_sub) _sub = makeClient();
  return _sub;
}

export const JOB_EVENTS_CHANNEL = "rush:jobs:events";

export type JobEvent =
  | { type: "started"; queue: string; jobId: string; kind: string; payload?: unknown; at: number }
  | { type: "progress"; queue: string; jobId: string; progress: number; at: number }
  | { type: "completed"; queue: string; jobId: string; result?: unknown; at: number }
  | { type: "failed"; queue: string; jobId: string; error: string; at: number }
  | { type: "image:updated"; imageId: number; status: string; at: number };

export async function publishJobEvent(evt: JobEvent): Promise<void> {
  await getRedis().publish(JOB_EVENTS_CHANNEL, JSON.stringify(evt));
}
