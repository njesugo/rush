import { desc } from "drizzle-orm";
import { getDb, newsItems } from "@rush/db";

/**
 * Master Pinterest visual queries tagged by theme.
 * One query may belong to multiple themes.
 */
export const TAGGED_QUERIES: Array<{ q: string; tags: string[] }> = [
  // === BUSINESS / FINANCE / VC ===
  { q: "boardroom meeting dark cinematic", tags: ["business"] },
  { q: "wall street trading floor", tags: ["business"] },
  { q: "venture capital pitch room", tags: ["business"] },
  { q: "business handshake corporate dark", tags: ["business"] },
  { q: "billion dollar deal aesthetic", tags: ["business", "money"] },
  { q: "luxury office skyline night", tags: ["business"] },
  { q: "private equity boardroom", tags: ["business"] },
  { q: "hedge fund manhattan office", tags: ["business"] },
  { q: "startup pitch deck aesthetic", tags: ["business", "startup"] },
  { q: "money cash stack closeup", tags: ["money"] },
  { q: "gold bars vault aesthetic", tags: ["money"] },
  { q: "financial chart crash cinematic", tags: ["business", "money"] },
  // === INFRA / HARDWARE / TECH ===
  { q: "data center server room blue", tags: ["infra"] },
  { q: "nvidia gpu macro photography", tags: ["infra"] },
  { q: "silicon chip closeup macro", tags: ["infra"] },
  { q: "fiber optic cables glow dark", tags: ["infra"] },
  { q: "computer hardware cinematic", tags: ["infra"] },
  { q: "modern server room neon", tags: ["infra"] },
  { q: "circuit board macro abstract", tags: ["infra"] },
  { q: "cloud computing aesthetic minimalist", tags: ["infra"] },
  // === PEOPLE / CEO / PORTRAITS ===
  { q: "ceo portrait dramatic lighting", tags: ["people"] },
  { q: "tech founder magazine cover", tags: ["people"] },
  { q: "silicon valley executive portrait", tags: ["people"] },
  { q: "keynote stage spotlight", tags: ["people"] },
  { q: "business leader minimalist portrait", tags: ["people"] },
  { q: "suit man window city night", tags: ["people"] },
  { q: "dramatic male portrait black background", tags: ["people"] },
  { q: "businesswoman power portrait", tags: ["people"] },
  // === STARTUP / FRENCH TECH / PARIS ===
  { q: "paris skyline modern night", tags: ["france"] },
  { q: "station f startup campus", tags: ["france", "startup"] },
  { q: "french startup office bright", tags: ["france", "startup"] },
  { q: "european tech hub coworking", tags: ["france", "startup"] },
  { q: "modern coworking space minimalist", tags: ["startup"] },
  { q: "eiffel tower modern aesthetic", tags: ["france"] },
  { q: "paris bureau haussmannien moderne", tags: ["france"] },
  // === DRAME / PROCÈS / DOCUMENTS ===
  { q: "courtroom dramatic lighting", tags: ["drama"] },
  { q: "legal documents stacked desk", tags: ["drama"] },
  { q: "handwritten manuscript pages aesthetic", tags: ["drama"] },
  { q: "lawsuit newspaper headline vintage", tags: ["drama"] },
  { q: "document leak files folder", tags: ["drama"] },
  { q: "gavel courtroom dark cinematic", tags: ["drama"] },
  { q: "old typewriter document pages", tags: ["drama"] },
  // === AI AESTHETIC ===
  { q: "artificial intelligence abstract art", tags: ["ai-aesthetic"] },
  { q: "neural network visualization minimalist", tags: ["ai-aesthetic"] },
  { q: "futuristic interface ui dark", tags: ["ai-aesthetic"] },
  { q: "humanoid robot portrait cinematic", tags: ["ai-aesthetic"] },
  { q: "cyberpunk city neon rain", tags: ["ai-aesthetic"] },
  { q: "sci-fi technology aesthetic", tags: ["ai-aesthetic"] },
  { q: "quantum computer macro", tags: ["ai-aesthetic", "infra"] },
  // === MACRO / WORLD / GENERIC ÉDITORIAL ===
  { q: "world map abstract dark", tags: ["macro"] },
  { q: "newspaper front page cinematic", tags: ["macro"] },
  { q: "magazine cover editorial dark", tags: ["macro"] },
  { q: "globe earth night satellite", tags: ["macro"] },
  { q: "city aerial view night", tags: ["macro"] },
  { q: "industrial factory cinematic", tags: ["macro", "infra"] },
  // === MEETING / WORK / OFFICE ===
  { q: "team meeting whiteboard brainstorm", tags: ["startup", "business"] },
  { q: "laptop coffee desk minimalist", tags: ["startup"] },
  { q: "engineer working dual screen", tags: ["infra", "startup"] },
];

export const TAG_KEYWORDS: Record<string, string[]> = {
  business: [
    "fonds", "capital", "levée", "levées", "venture", "wall street", "billion",
    "million", "bourse", "investor", "investment", "série", "series", "round",
    "valuation", "valorisation", "ipo", "cnbc", "financial", "enterprise",
    "company", "companies", "business", "deal", "market", "revenue", "profit",
  ],
  money: [
    "million", "milliard", "billion", "euros", "dollars", "cash", "argent",
    "monnaie", "fund", "levée", "capital",
  ],
  infra: [
    "data center", "gpu", "nvidia", "intel", "amd", "compute", "chip", "puce",
    "server", "cloud", "infrastructure", "silicon", "hardware", "tsmc",
    "datacenter", "rack",
  ],
  people: [
    "musk", "altman", "huang", "brockman", "sundar", "pichai", "zuckerberg",
    "cook", "satya", "nadella", "hassabis", "amodei", "cramer", "ceo",
    "founder", "fondateur", "directeur", "patron",
  ],
  france: [
    "france", "station f", "paris", "french", "européen", "europe", "européenne",
    "mistral", "kyutai", "lyon", "française", "français", "hexagone",
  ],
  startup: [
    "startup", "start-up", "startups", "levée", "fondateur", "founder",
    "série", "seed", "pré-seed", "incubateur", "accelerator", "launch",
    "lancement",
  ],
  drama: [
    "trial", "procès", "lawsuit", "court", "tribunal", "document", "documents",
    "leak", "fuite", "dysfunction", "affaire", "scandal", "scandale", "manuscrit",
    "pages", "echange", "échanges", "révélation", "enquête",
  ],
  "ai-aesthetic": [
    "intelligence artificielle", "agentic", "agent", "agents", "model",
    "modèle", "neural", "gpt", "claude", "gemini", "llm", "transformer",
  ],
  macro: [
    "inflation", "jobs", "emploi", "macro", "global", "world", "monde",
    "industrie", "industry", "manufacturing", "gdp", "pib",
  ],
};

const BASE_WEIGHTS: Record<string, number> = {
  business: 1.5,
  money: 1.0,
  infra: 1.0,
  people: 1.0,
  france: 0.8,
  startup: 1.0,
  drama: 0.5,
  "ai-aesthetic": 1.0,
  macro: 0.5,
};

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function computeTagScores(corpusText: string): Record<string, number> {
  const text = " " + corpusText.toLowerCase() + " ";
  const scores: Record<string, number> = {};
  for (const [tag, kws] of Object.entries(TAG_KEYWORDS)) {
    let s = 0;
    for (const kw of kws) {
      if (kw.includes(" ")) {
        const matches = text.split(kw).length - 1;
        s += matches * 1.5;
      } else {
        const re = new RegExp(`[^a-zà-ÿ0-9]${escapeRegex(kw)}[^a-zà-ÿ0-9]`, "gi");
        const m = text.match(re);
        s += m ? m.length : 0;
      }
    }
    scores[tag] = s;
  }
  return scores;
}

function pickWeighted(items: Array<{ q: string; weight: number }>, count: number): string[] {
  const result: string[] = [];
  const pool = items.slice();
  for (let n = 0; n < count && pool.length > 0; n++) {
    const total = pool.reduce((acc, it) => acc + it.weight, 0);
    if (total <= 0) break;
    let r = Math.random() * total;
    let chosen = -1;
    for (let i = 0; i < pool.length; i++) {
      r -= pool[i].weight;
      if (r <= 0) {
        chosen = i;
        break;
      }
    }
    if (chosen === -1) chosen = pool.length - 1;
    result.push(pool[chosen].q);
    pool.splice(chosen, 1);
  }
  return result;
}

export interface SuggestQueriesResult {
  queries: string[];
  generatedAt: string;
  sampleSize: number;
  tagWeights: Record<string, number>;
}

export async function suggestQueries(
  opts: { count?: number; sampleSize?: number } = {}
): Promise<SuggestQueriesResult> {
  const count = Math.min(Math.max(opts.count ?? 30, 5), 60);
  const sampleSize = Math.min(Math.max(opts.sampleSize ?? 300, 20), 1000);

  const db = getDb();
  const rows = await db
    .select({ title: newsItems.title, summary: newsItems.summary })
    .from(newsItems)
    .orderBy(desc(newsItems.id))
    .limit(sampleSize);

  const corpus = rows.map((r) => `${r.title ?? ""} ${r.summary ?? ""}`).join(" ");
  const rawScores = computeTagScores(corpus);

  const maxScore = Math.max(1, ...Object.values(rawScores));
  const tagWeights: Record<string, number> = {};
  for (const tag of Object.keys(BASE_WEIGHTS)) {
    const norm = (rawScores[tag] || 0) / maxScore;
    tagWeights[tag] = BASE_WEIGHTS[tag] + norm * 3;
  }

  const items = TAGGED_QUERIES.map((tq) => ({
    q: tq.q,
    weight: tq.tags.reduce((acc, t) => acc + (tagWeights[t] || 0), 0),
  }));

  const queries = pickWeighted(items, count);

  return {
    queries,
    generatedAt: new Date().toISOString(),
    sampleSize: rows.length,
    tagWeights,
  };
}
