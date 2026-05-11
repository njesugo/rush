import { appSettings, getDb } from "@rush/db";
import { eq } from "drizzle-orm";
import { getRedis } from "./redis";

/* ----------------- API keys (read-only presence) ----------------- */

export type ApiKeyDescriptor = {
  name: string;
  label: string;
  category: "ai" | "search" | "social" | "infra" | "pinterest" | "media" | "other";
  required?: boolean;
  description?: string;
};

export const API_KEY_DESCRIPTORS: ApiKeyDescriptor[] = [
  // AI
  { name: "ANTHROPIC_API_KEY", label: "Anthropic (Claude)", category: "ai", required: true, description: "Génération de carrousels et angles" },
  { name: "CLAUDE_MODEL", label: "Modèle Claude", category: "ai", description: "Override du modèle par défaut" },
  // Search
  { name: "TAVILY_API_KEY", label: "Tavily", category: "search", description: "Recherche complémentaire pour les news" },
  // Pinterest
  { name: "PINTEREST_WORKER_URL", label: "Pinterest worker URL", category: "pinterest", description: "Cloudflare Worker de swipe" },
  { name: "PINTEREST_WORKER_TOKEN", label: "Pinterest worker token", category: "pinterest" },
  // Infra
  { name: "DATABASE_URL", label: "Postgres", category: "infra", required: true },
  { name: "REDIS_URL", label: "Redis", category: "infra", required: true, description: "BullMQ + pubsub SSE" },
  { name: "BANK_DIR", label: "Banque d'images", category: "infra", description: "Chemin local du stockage" },
  // Social
  { name: "PUBLER_API_KEY", label: "Publer API key", category: "social" },
  { name: "PUBLER_WORKSPACE_ID", label: "Publer workspace", category: "social" },
  { name: "PUBLER_ACCOUNT_ID", label: "Publer compte Instagram", category: "social" },
  { name: "AYRSHARE_API_KEY", label: "Ayrshare", category: "social" },
  { name: "IG_USER_ID", label: "Instagram user ID", category: "social" },
  { name: "META_ACCESS_TOKEN", label: "Meta access token", category: "social" },
  // Media
  { name: "UNSPLASH_KEY", label: "Unsplash", category: "media" },
  // Tunnel
  { name: "NGROK_AUTHTOKEN", label: "ngrok", category: "other" },
];

export type ApiKeyStatus = ApiKeyDescriptor & {
  present: boolean;
  preview: string | null;
};

function maskValue(v: string | undefined): string | null {
  if (!v) return null;
  const trimmed = v.trim();
  if (!trimmed) return null;
  if (trimmed.length <= 8) return "•".repeat(trimmed.length);
  return `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`;
}

export function listApiKeyStatuses(): ApiKeyStatus[] {
  return API_KEY_DESCRIPTORS.map((d) => {
    const raw = process.env[d.name];
    return {
      ...d,
      present: !!(raw && raw.trim()),
      preview: maskValue(raw),
    };
  });
}

/* ----------------- Preferences (KV in DB) ----------------- */

export type AppPrefs = {
  claudeModel: string;
  carouselSchedule: string; // cron-like, free text for now
  pinterestSyncSchedule: string;
  newsScrapeSchedule: string;
  defaultCarouselCount: number;
  autoEnqueueBgRemoval: boolean;
};

export const DEFAULT_PREFS: AppPrefs = {
  claudeModel: process.env.CLAUDE_MODEL || "claude-sonnet-4-5-20250929",
  carouselSchedule: process.env.CRON_CAROUSEL_SCHEDULE || "",
  pinterestSyncSchedule: process.env.CRON_PINTEREST_SCHEDULE || "",
  newsScrapeSchedule: process.env.CRON_NEWS_SCHEDULE || "",
  defaultCarouselCount: 3,
  autoEnqueueBgRemoval: true,
};

export const PREFS_KEY = "app:prefs";

export async function getPrefs(): Promise<AppPrefs> {
  const db = getDb();
  const rows = await db.select().from(appSettings).where(eq(appSettings.key, PREFS_KEY)).limit(1);
  const stored = (rows[0]?.value ?? {}) as Partial<AppPrefs>;
  return { ...DEFAULT_PREFS, ...stored };
}

export async function setPrefs(patch: Partial<AppPrefs>): Promise<AppPrefs> {
  const current = await getPrefs();
  const next: AppPrefs = { ...current, ...patch };
  const db = getDb();
  const existing = await db.select().from(appSettings).where(eq(appSettings.key, PREFS_KEY)).limit(1);
  if (existing.length) {
    await db
      .update(appSettings)
      .set({ value: next, updatedAt: new Date() })
      .where(eq(appSettings.key, PREFS_KEY));
  } else {
    await db.insert(appSettings).values({ key: PREFS_KEY, value: next });
  }
  return next;
}

/* ----------------- Connection tests ----------------- */

export type ConnectionTestResult = {
  ok: boolean;
  detail?: string;
  latencyMs?: number;
};

export type TestableService =
  | "anthropic"
  | "tavily"
  | "pinterest"
  | "redis"
  | "db"
  | "publer";

export async function testConnection(service: TestableService): Promise<ConnectionTestResult> {
  const start = Date.now();
  try {
    switch (service) {
      case "db": {
        const db = getDb();
        await db.execute("select 1" as never);
        return { ok: true, latencyMs: Date.now() - start };
      }
      case "redis": {
        const r = getRedis();
        const pong = await r.ping();
        return { ok: pong === "PONG", detail: pong, latencyMs: Date.now() - start };
      }
      case "anthropic": {
        const key = process.env.ANTHROPIC_API_KEY;
        if (!key) return { ok: false, detail: "ANTHROPIC_API_KEY manquante" };
        const res = await fetch("https://api.anthropic.com/v1/models", {
          headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
        });
        if (!res.ok) return { ok: false, detail: `HTTP ${res.status}`, latencyMs: Date.now() - start };
        return { ok: true, latencyMs: Date.now() - start };
      }
      case "tavily": {
        const key = process.env.TAVILY_API_KEY;
        if (!key) return { ok: false, detail: "TAVILY_API_KEY manquante" };
        const res = await fetch("https://api.tavily.com/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ api_key: key, query: "ping", max_results: 1 }),
        });
        if (!res.ok) return { ok: false, detail: `HTTP ${res.status}`, latencyMs: Date.now() - start };
        return { ok: true, latencyMs: Date.now() - start };
      }
      case "pinterest": {
        const url = process.env.PINTEREST_WORKER_URL;
        const token = process.env.PINTEREST_WORKER_TOKEN;
        if (!url || !token) return { ok: false, detail: "URL/token Pinterest manquant" };
        const res = await fetch(`${url.replace(/\/$/, "")}/api/health`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return { ok: false, detail: `HTTP ${res.status}`, latencyMs: Date.now() - start };
        return { ok: true, latencyMs: Date.now() - start };
      }
      case "publer": {
        const key = process.env.PUBLER_API_KEY;
        const ws = process.env.PUBLER_WORKSPACE_ID;
        if (!key || !ws) return { ok: false, detail: "Clé/workspace Publer manquant" };
        const res = await fetch("https://app.publer.com/api/v1/users/me", {
          headers: { Authorization: `Bearer-API ${key}`, "Publer-Workspace-Id": ws },
        });
        if (!res.ok) return { ok: false, detail: `HTTP ${res.status}`, latencyMs: Date.now() - start };
        return { ok: true, latencyMs: Date.now() - start };
      }
    }
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}
