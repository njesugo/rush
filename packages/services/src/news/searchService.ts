/** Tavily Search API client. Port TS de one/src/services/searchService.js */

const TAVILY_ENDPOINT = "https://api.tavily.com/search";

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
