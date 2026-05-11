/**
 * Scraper de news IA. Port TS de one/src/services/newsScraper.js.
 * Aggrège RSS + Tavily, dédoublonne, score (kw + géo + éditorial), insert en DB.
 */

import Parser from "rss-parser";
import { getDb, newsItems } from "@rush/db";
import { searchAINews } from "./searchService";
import { geoScore, type Region } from "./geoScoring";
import { editorialScore } from "./editorialScore";

const RSS_FEEDS = [
  // FR / EU (priorité 1)
  { url: "https://www.actuia.com/feed/", name: "ActuIA" },
  { url: "https://www.numerama.com/feed/", name: "Numerama" },
  { url: "https://www.usine-digitale.fr/rss", name: "Usine Digitale" },
  { url: "https://www.maddyness.com/feed/", name: "Maddyness" },
  { url: "https://siecledigital.fr/feed/", name: "Siècle Digital" },
  { url: "https://www.frandroid.com/category/intelligence-artificielle/feed", name: "Frandroid IA" },
  { url: "https://sifted.eu/feed", name: "Sifted EU" },
  { url: "https://www.eu-startups.com/feed/", name: "EU-Startups" },
  // US majors / global
  { url: "https://techcrunch.com/category/artificial-intelligence/feed/", name: "TechCrunch AI" },
  { url: "https://www.theverge.com/rss/index.xml", name: "The Verge" },
  { url: "https://feeds.feedburner.com/venturebeat/SZYF", name: "VentureBeat AI" },
  { url: "https://www.artificialintelligence-news.com/feed/", name: "AI News" },
  // Afrique tech
  { url: "https://techcabal.com/feed/", name: "TechCabal" },
  { url: "https://techpoint.africa/feed/", name: "Techpoint Africa" },
];

const KEYWORDS = ["ai", "agent", "model", "launch", "tool", "gpt", "llm", "claude", "anthropic", "openai", "gemini"];
const KEYWORDS_FR = ["ia", "intelligence artificielle", "modèle", "agent", "llm", "gpt", "claude", "anthropic", "openai", "gemini", "mistral", "générative", "chatbot"];

const STRICT_AI_KEYWORDS = [
  " ai ", " ai,", " ai.", " ai-", "'ai ",
  " ia ", " ia,", " ia.", " l'ia", " d'ia",
  "intelligence artificielle", "artificial intelligence",
  "gpt", "llm", "claude", "anthropic", "openai", "gemini", "mistral",
  "chatgpt", "générative", "generative ai", "genai", "gen ai",
  "machine learning", "deep learning", "apprentissage automatique",
  "agent ia", "ai agent", "agentic",
  "modèle ia", "modèle d'ia", "ai model", "foundation model", "large language",
  "chatbot", "copilot", "midjourney", "stable diffusion", "sora ",
  "deepseek", "meta ai", "grok", "perplexity", "huggingface", "hugging face",
  "nvidia", "transformer", "rag ", "fine-tuning", "fine tuning",
];

interface RssItemLike {
  title?: string;
  contentSnippet?: string;
  content?: string;
  summary?: string;
  link?: string;
  isoDate?: string;
  pubDate?: string;
}

const parser: Parser = new Parser({ timeout: 15000 });

function scoreKeywords(item: { title?: string; contentSnippet?: string }): number {
  const text = `${item.title || ""} ${item.contentSnippet || ""}`.toLowerCase();
  let score = 0;
  for (const kw of KEYWORDS) if (text.includes(kw)) score++;
  for (const kw of KEYWORDS_FR) if (text.includes(kw)) score++;
  return score;
}

function isAIRelated(item: { title?: string; contentSnippet?: string; summary?: string | null }): boolean {
  const text = ` ${item.title || ""} ${item.contentSnippet || ""} ${item.summary || ""} `.toLowerCase();
  return STRICT_AI_KEYWORDS.some((kw) => text.includes(kw));
}

function isWithin24h(item: RssItemLike): boolean {
  if (!item.isoDate && !item.pubDate) return true;
  const date = new Date(item.isoDate || item.pubDate || "");
  const ageMs = Date.now() - date.getTime();
  return ageMs <= 24 * 60 * 60 * 1000;
}

function titleKey(title: string): string {
  return String(title || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter((w) => w.length >= 4)
    .slice(0, 6)
    .join(" ");
}

function buildSummary(item: RssItemLike): string {
  const snippet = item.contentSnippet || item.content || "";
  return snippet.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim().slice(0, 500);
}

interface ScrapedItem {
  title: string;
  url: string;
  source: string;
  summary: string;
  publishedAt?: Date | null;
  keywordScore: number;
  geoScore: number;
  region: Region;
  editorialScore: number;
  finalScore: number;
  money: string | null;
}

export interface ScrapeOptions {
  useTavily?: boolean;
  tavilyQuery?: string;
  tavilyQueryUS?: string;
}

export interface ScrapeResult {
  inserted: number;
  total: number;
  top: ScrapedItem[];
  sources: { rss: number; tavily: number };
  regions: Record<Region, number>;
}

export async function scrapeNews(opts: ScrapeOptions = {}): Promise<ScrapeResult> {
  const useTavily = opts.useTavily !== false && !!process.env.TAVILY_API_KEY;
  const tavilyQueryEU =
    opts.tavilyQuery ||
    "intelligence artificielle France Europe startup levée IA annonce lancement";
  const tavilyQueryUS =
    opts.tavilyQueryUS ||
    "major AI launch OR release OR new model OpenAI Anthropic Google";

  type RawItem = {
    title: string;
    url: string;
    source: string;
    summary: string;
    publishedAt?: Date | null;
    score: number;
  };
  const allItems: RawItem[] = [];
  const sources = { rss: 0, tavily: 0 };

  // 1) RSS
  for (const feed of RSS_FEEDS) {
    try {
      const parsed = await parser.parseURL(feed.url);
      for (const item of (parsed.items || []) as RssItemLike[]) {
        if (!item.link || !item.title) continue;
        if (!isWithin24h(item)) continue;
        if (!isAIRelated(item)) continue;
        const pub = item.isoDate || item.pubDate;
        allItems.push({
          title: item.title.trim(),
          url: item.link,
          source: feed.name,
          summary: buildSummary(item),
          publishedAt: pub ? new Date(pub) : null,
          score: scoreKeywords({ title: item.title, contentSnippet: item.contentSnippet }),
        });
        sources.rss++;
      }
    } catch (err) {
      console.warn(`[newsScraper] échec ${feed.name} : ${(err as Error).message}`);
    }
  }

  // 2) Tavily
  if (useTavily) {
    const jobs = [
      searchAINews({
        query: tavilyQueryEU,
        maxResults: 12,
        timeRange: "day",
        includeDomains: [
          "lemonde.fr", "lesechos.fr", "numerama.com", "usine-digitale.fr",
          "maddyness.com", "actuia.com", "siecledigital.fr", "frandroid.com",
          "01net.com", "clubic.com", "zdnet.fr", "journaldunet.com",
          "sifted.eu", "eu-startups.com", "tech.eu", "heise.de", "golem.de",
        ],
      }).catch((e: Error) => {
        console.warn(`[newsScraper] Tavily FR/EU : ${e.message}`);
        return [];
      }),
      searchAINews({
        query: tavilyQueryUS,
        maxResults: 10,
        timeRange: "day",
        includeDomains: [
          "techcrunch.com", "theverge.com", "wired.com", "arstechnica.com",
          "bloomberg.com", "wsj.com", "nytimes.com", "cnbc.com",
          "theinformation.com", "venturebeat.com", "axios.com", "semafor.com",
          "techcabal.com", "techpoint.africa", "jeuneafrique.com", "africanews.com",
        ],
      }).catch((e: Error) => {
        console.warn(`[newsScraper] Tavily US/AF : ${e.message}`);
        return [];
      }),
    ];
    const [resEU, resUS] = await Promise.all(jobs);
    for (const r of [...resEU, ...resUS]) {
      if (!isAIRelated({ title: r.title, summary: r.summary })) continue;
      const kwScore = scoreKeywords({ title: r.title, contentSnippet: r.summary });
      allItems.push({
        title: r.title,
        url: r.url,
        source: r.source,
        summary: r.summary,
        publishedAt: null,
        score: r.score + kwScore,
      });
      sources.tavily++;
    }
  }

  // 3) Dédoublonnage (URL puis titre sémantique)
  const seenUrls = new Set<string>();
  const seenTitles = new Map<string, RawItem>();
  const unique: RawItem[] = [];
  for (const it of allItems) {
    if (seenUrls.has(it.url)) continue;
    seenUrls.add(it.url);
    const key = titleKey(it.title);
    if (key && seenTitles.has(key)) {
      const existing = seenTitles.get(key)!;
      if (it.score > existing.score) {
        const idx = unique.indexOf(existing);
        if (idx >= 0) unique[idx] = it;
        seenTitles.set(key, it);
      }
      continue;
    }
    if (key) seenTitles.set(key, it);
    unique.push(it);
  }

  // 4) Scores géo + éditorial
  const regionCounts: Record<Region, number> = { "FR/EU": 0, "US/AFRICA": 0, OTHER: 0 };
  const enriched: ScrapedItem[] = unique.map((it) => {
    const { score: gScore, region } = geoScore(it);
    const ed = editorialScore({ title: it.title, summary: it.summary });
    regionCounts[region]++;
    return {
      title: it.title,
      url: it.url,
      source: it.source,
      summary: it.summary,
      publishedAt: it.publishedAt,
      keywordScore: it.score,
      geoScore: gScore,
      region,
      editorialScore: ed.score,
      money: ed.money?.formatted || null,
      finalScore: it.score + gScore + ed.score,
    };
  });

  // 5) Insert en DB (onConflict do nothing sur url)
  const db = getDb();
  let inserted = 0;
  for (const it of enriched) {
    const r = await db
      .insert(newsItems)
      .values({
        source: it.source,
        title: it.title,
        url: it.url,
        summary: it.summary,
        publishedAt: it.publishedAt ?? null,
        region: it.region,
        geoScore: it.geoScore,
        keywordScore: it.keywordScore,
        editorialScore: it.editorialScore,
        finalScore: it.finalScore,
        money: it.money,
      })
      .onConflictDoNothing({ target: newsItems.url })
      .returning({ id: newsItems.id });
    if (r.length > 0) inserted++;
  }

  const top = [...enriched].sort((a, b) => b.finalScore - a.finalScore).slice(0, 5);
  return { inserted, total: enriched.length, top, sources, regions: regionCounts };
}

export { RSS_FEEDS };
