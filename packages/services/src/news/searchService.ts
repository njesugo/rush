/** Tavily Search API client. Port TS de one/src/services/searchService.js */

const TAVILY_ENDPOINT = "https://api.tavily.com/search";
const TAVILY_EXTRACT_ENDPOINT = "https://api.tavily.com/extract";

export interface TavilyExtractResult {
  url: string;
  rawContent: string;
}

export interface TavilyExtractOptions {
  /** "basic" (rapide, gratuit-tier friendly) ou "advanced" (plus propre, paywall partiel). Défaut: "advanced". */
  extractDepth?: "basic" | "advanced";
  /** "markdown" (plus lisible) ou "text". Défaut: "markdown". */
  format?: "markdown" | "text";
  /** Timeout fetch (ms). Défaut 30000. */
  timeoutMs?: number;
}

/**
 * Tavily /extract : récupère le contenu complet d'un article à partir de son URL.
 * Renvoie le rawContent extrait + l'URL canonique. Lève si Tavily répond non-2xx
 * ou si l'URL est rapportée comme "failed" par Tavily.
 */
export async function extractArticle(
  url: string,
  opts: TavilyExtractOptions = {}
): Promise<TavilyExtractResult> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) throw new Error("TAVILY_API_KEY manquante dans .env");
  if (!url) throw new Error("url manquante");

  const { extractDepth = "advanced", format = "markdown", timeoutMs = 30000 } = opts;

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(TAVILY_EXTRACT_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        urls: [url],
        extract_depth: extractDepth,
        format,
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(t);
  }

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Tavily Extract ${res.status} : ${txt.slice(0, 200)}`);
  }

  const json = (await res.json()) as {
    results?: Array<{ url: string; raw_content?: string }>;
    failed_results?: Array<{ url: string; error?: string }>;
  };
  const failed = json.failed_results?.find((f) => f.url === url);
  if (failed) throw new Error(`Tavily extract failed : ${failed.error || "unknown"}`);

  const r = json.results?.[0];
  if (!r || !r.raw_content) throw new Error("Tavily extract: contenu vide");

  return { url: r.url || url, rawContent: r.raw_content };
}

export interface TavilyResult {
  title: string;
  url: string;
  source: string;
  summary: string;
  score: number;
}

export interface TavilyOptions {
  query?: string;
  maxResults?: number;
  timeRange?: "day" | "week" | "month" | "year";
  topic?: "news" | "general";
  searchDepth?: "basic" | "advanced";
  includeDomains?: string[];
  excludeDomains?: string[];
}

export async function searchAINews(opts: TavilyOptions = {}): Promise<TavilyResult[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) throw new Error("TAVILY_API_KEY manquante dans .env");

  const {
    query = "latest AI launch OR release OR major update",
    maxResults = 10,
    timeRange = "day",
    topic = "news",
    searchDepth = "basic",
    includeDomains,
    excludeDomains,
  } = opts;

  const body: Record<string, unknown> = {
    api_key: apiKey,
    query,
    topic,
    search_depth: searchDepth,
    max_results: Math.min(20, Math.max(1, maxResults)),
    include_answer: false,
    include_raw_content: false,
  };
  if (topic === "news" && timeRange) body.time_range = timeRange;
  if (includeDomains?.length) body.include_domains = includeDomains;
  if (excludeDomains?.length) body.exclude_domains = excludeDomains;

  const res = await fetch(TAVILY_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Tavily API ${res.status} : ${txt.slice(0, 200)}`);
  }

  const json = (await res.json()) as { results?: Array<{ title?: string; url?: string; content?: string; score?: number }> };
  const results = Array.isArray(json.results) ? json.results : [];

  return results
    .filter((r): r is { title: string; url: string; content?: string; score?: number } =>
      Boolean(r && r.url && r.title)
    )
    .map((r) => {
      let host = "tavily";
      try {
        host = new URL(r.url).hostname.replace(/^www\./, "");
      } catch {}
      return {
        title: String(r.title).trim(),
        url: r.url,
        source: `Tavily · ${host}`,
        summary: String(r.content || "").replace(/\s+/g, " ").trim().slice(0, 500),
        score: typeof r.score === "number" ? r.score : 0,
      };
    });
}
