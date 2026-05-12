/**
 * Publer (app.publer.com/api/v1) client — TS port of legacy publerService.js.
 * Uploads slide PNGs as media, then schedules or publishes immediately on Instagram.
 */

import { downloadObject, basenameOfKey } from "./storage";

const BASE = "https://app.publer.com/api/v1";
const POLL_INTERVAL_MS = 3000;
const POLL_MAX_ATTEMPTS = 60;

let cachedWorkspaceId: string | null = null;
let cachedInstagramAccountId: string | null = null;

function getKey(): string {
  const k = process.env.PUBLER_API_KEY;
  if (!k) throw new Error("PUBLER_API_KEY manquante dans .env");
  return k;
}

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { Authorization: `Bearer-API ${getKey()}`, ...extra };
}

function workspaceHeaders(wsId: string): Record<string, string> {
  return authHeaders({ "Publer-Workspace-Id": wsId });
}

async function publerFetch<T = unknown>(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {}
): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 30000);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    if (!res.ok) {
      const d = data as { error?: string; message?: string } | string | null;
      const msg = typeof d === "object" && d ? d.error || d.message || JSON.stringify(d) : String(d);
      throw new Error(`Publer HTTP ${res.status} : ${msg}`);
    }
    return data as T;
  } finally {
    clearTimeout(t);
  }
}

export async function getWorkspaceId(): Promise<string> {
  if (cachedWorkspaceId) return cachedWorkspaceId;
  const fromEnv = process.env.PUBLER_WORKSPACE_ID;
  if (fromEnv) {
    cachedWorkspaceId = fromEnv;
    return fromEnv;
  }
  const data = await publerFetch<Array<{ id: string; name: string }>>(`${BASE}/workspaces`, {
    headers: authHeaders(),
  });
  if (!Array.isArray(data) || !data.length) throw new Error("Aucun workspace Publer trouvé");
  cachedWorkspaceId = data[0].id;
  return cachedWorkspaceId;
}

export async function getInstagramAccountId(): Promise<string> {
  if (cachedInstagramAccountId) return cachedInstagramAccountId;
  const fromEnv = process.env.PUBLER_INSTAGRAM_ACCOUNT_ID || process.env.PUBLER_ACCOUNT_ID;
  if (fromEnv) {
    cachedInstagramAccountId = fromEnv;
    return fromEnv;
  }
  const wsId = await getWorkspaceId();
  const data = await publerFetch<unknown>(`${BASE}/accounts`, { headers: workspaceHeaders(wsId) });
  const list = Array.isArray(data)
    ? (data as Array<Record<string, unknown>>)
    : ((data as { accounts?: unknown[] })?.accounts ?? []);
  const ig = (list as Array<Record<string, unknown>>).find(
    (a) => (a.provider || a.network || a.platform) === "instagram"
  );
  if (!ig?.id) throw new Error("Aucun compte Instagram connecté à Publer");
  cachedInstagramAccountId = String(ig.id);
  return cachedInstagramAccountId;
}

export async function uploadMedia(key: string): Promise<string> {
  const wsId = await getWorkspaceId();
  const buf = await downloadObject(key);
  const blob = new Blob([new Uint8Array(buf)], { type: "image/png" });
  const form = new FormData();
  form.append("file", blob, basenameOfKey(key));
  const data = await publerFetch<{ id?: string }>(`${BASE}/media`, {
    method: "POST",
    headers: workspaceHeaders(wsId),
    body: form,
    timeoutMs: 120000,
  });
  if (!data?.id) throw new Error("Upload média : pas d'ID retourné");
  return data.id;
}

interface JobStatusOuter {
  status?: string;
  data?: { status?: string; result?: { status?: string; payload?: unknown } };
  result?: { status?: string; payload?: unknown };
  payload?: unknown;
}

async function waitForJob(jobId: string): Promise<unknown> {
  const wsId = await getWorkspaceId();
  for (let i = 0; i < POLL_MAX_ATTEMPTS; i++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    try {
      const data = await publerFetch<JobStatusOuter>(`${BASE}/job_status/${jobId}`, {
        headers: workspaceHeaders(wsId),
        timeoutMs: 15000,
      });
      const outer = data?.data || data;
      const outerStatus = outer?.status;
      if (outerStatus === "complete" || outerStatus === "completed") {
        const inner = outer.result || outer;
        const innerStatus = (inner as { status?: string })?.status;
        if (innerStatus === "failed" || innerStatus === "error") {
          throw new Error(`Job échoué : ${JSON.stringify((inner as { payload?: unknown }).payload)}`);
        }
        return (inner as { payload?: unknown }).payload ?? inner;
      }
      if (outerStatus === "failed" || outerStatus === "error") {
        const fail = outer as { result?: unknown; payload?: unknown };
        throw new Error(`Job échoué : ${JSON.stringify(fail.result || fail.payload || outer)}`);
      }
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("Job échoué")) throw err;
      // network blip → keep polling
    }
  }
  throw new Error(`Timeout poll job ${jobId} (>${(POLL_INTERVAL_MS * POLL_MAX_ATTEMPTS) / 1000}s)`);
}

export interface PublishCarouselArgs {
  pngPaths: string[];
  caption: string;
  scheduledAt?: string | null; // ISO 8601, null = immediate
}

export interface PublishCarouselResult {
  id: string; // Publer post id (or job:xxx fallback)
  url: string | null; // Instagram post URL when immediate
  scheduled: boolean;
  jobId: string;
}

export async function publishCarousel(args: PublishCarouselArgs): Promise<PublishCarouselResult> {
  if (args.pngPaths.length < 2) throw new Error("Un carousel Instagram doit avoir au moins 2 slides");
  if (args.pngPaths.length > 10) throw new Error("Maximum 10 slides par carousel Instagram");

  const wsId = await getWorkspaceId();
  const igAccountId = await getInstagramAccountId();
  const isScheduled = !!args.scheduledAt;

  const mediaIds: string[] = [];
  for (const p of args.pngPaths) {
    const id = await uploadMedia(p);
    mediaIds.push(id);
  }

  const accountEntry: { id: string; scheduled_at?: string } = { id: igAccountId };
  if (isScheduled) {
    accountEntry.scheduled_at = new Date(args.scheduledAt!).toISOString().replace(/\.\d{3}Z$/, "Z");
  }

  const body = {
    bulk: {
      state: isScheduled ? "scheduled" : "publish",
      posts: [
        {
          networks: {
            instagram: {
              type: "photo",
              text: args.caption || "",
              media: mediaIds.map((id) => ({ id, type: "image" })),
            },
          },
          accounts: [accountEntry],
        },
      ],
    },
  };

  const endpoint = isScheduled ? "/posts/schedule" : "/posts/schedule/publish";
  const postRes = await publerFetch<{ data?: { job_id?: string }; job_id?: string }>(
    `${BASE}${endpoint}`,
    {
      method: "POST",
      headers: { ...workspaceHeaders(wsId), "Content-Type": "application/json" },
      body: JSON.stringify(body),
      timeoutMs: 30000,
    }
  );
  const jobId = postRes.data?.job_id || postRes.job_id;
  if (!jobId) throw new Error("Pas de job_id retourné");

  await waitForJob(jobId);

  // Look up the resulting post id / url
  const captionStart = (args.caption || "").slice(0, 60);
  const findInState = async (state: "scheduled" | "published"): Promise<{ id?: string; url?: string | null } | null> => {
    try {
      const data = await publerFetch<{ posts?: Array<{ id?: string; text?: string; post_link?: string | null }> }>(
        `${BASE}/posts?state=${state}&account_ids[]=${igAccountId}`,
        { headers: workspaceHeaders(wsId), timeoutMs: 15000 }
      );
      const posts = data?.posts || [];
      const match = posts.find((p) => (p.text || "").startsWith(captionStart));
      return match ? { id: match.id, url: match.post_link ?? null } : null;
    } catch {
      return null;
    }
  };

  if (isScheduled) {
    const found = await findInState("scheduled");
    return { id: found?.id || `job:${jobId}`, url: null, scheduled: true, jobId };
  }
  const found = await findInState("published");
  return { id: found?.id || `job:${jobId}`, url: found?.url ?? null, scheduled: false, jobId };
}

export async function getPostStatus(
  publerPostId: string
): Promise<{ state: string; postLink: string | null; scheduledAt: string | null } | null> {
  if (!publerPostId || publerPostId.startsWith("job:")) return null;
  const wsId = await getWorkspaceId();
  const igAccountId = await getInstagramAccountId();
  for (const state of ["published", "scheduled", "failed"] as const) {
    const data = await publerFetch<{
      posts?: Array<{ id?: string; post_link?: string | null; scheduled_at?: string | null }>;
    }>(
      `${BASE}/posts?state=${state}&account_ids[]=${igAccountId}`,
      { headers: workspaceHeaders(wsId), timeoutMs: 15000 }
    );
    const m = (data?.posts || []).find((p) => p.id === publerPostId);
    if (m) return { state, postLink: m.post_link ?? null, scheduledAt: m.scheduled_at ?? null };
  }
  return null;
}
