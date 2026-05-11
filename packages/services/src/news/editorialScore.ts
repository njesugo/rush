/**
 * Score éditorial 0-100 calculé sur le titre + summary d'un article.
 * Port TypeScript de one/src/services/editorialScore.js.
 */

const USD_TO_EUR = 0.92;

const SOCIETAL_KEYWORDS = [
  "école", "écoles", "enseignement", "éducation", "lycée", "université", "élève",
  "emploi", "emplois", "licenciement", "licenciements", "chômage", "salarié",
  "santé", "médecin", "hôpital", "patient", "cancer", "diagnostic",
  "élection", "élections", "vote", "démocratie", "désinformation", "deepfake",
  "climat", "environnement", "énergie", "écologique",
  "droit", "loi", "régulation", "régulier", "rgpd", "ai act", "cnil", "parlement",
  "enfant", "famille", "parent", "jeunesse",
  "discrimination", "biais", "éthique", "vie privée", "surveillance",
  "artiste", "créateur", "auteur", "droit d'auteur", "propriété intellectuelle",
  "guerre", "armée", "militaire", "défense", "cyberattaque",
];

const MAJOR_NEWS_KEYWORDS = [
  "lance", "lancement", "annonce", "dévoile", "présente", "inaugure",
  "rachète", "rachat", "acquiert", "fusion", "partenariat",
  "interdit", "interdiction", "condamné", "condamne", "amende",
  "polémique", "scandale", "accusé", "accuse", "enquête",
  "macron", "biden", "trump", "commission européenne", "gouvernement",
];

const FUNDING_KEYWORDS = [
  "lève", "levée", "lèvent", "série a", "série b", "série c", "série d",
  "raises", "raised", "funding", "seed", "pre-seed", "amorçage",
  "tour de table", "valorisation", "valuation", "ipo",
  "investissement", "invested", "investit",
];

const TECH_JARGON = [
  "benchmark", "mmlu", "gsm8k", "humaneval", "mteb",
  "tpu", "gpu", "cuda", "flops", "tflops", "pflops",
  "tokens/sec", "tokens per second", "latency", "throughput", "inference",
  "mlops", "devops", "kubernetes", "docker", "ci/cd",
  "api endpoint", "sdk", "webhook", "rest api", "graphql",
  "fine-tuning", "rlhf", "dpo", "lora", "qlora",
  "embedding", "vector database", "rag pipeline",
  "context window", "attention head", "transformer architecture",
  "quantization", "distillation", "pruning",
  "b2b saas", "enterprise", "on-premise",
];

export interface MoneyInfo {
  amount: number;
  currency: "EUR";
  formatted: string;
}

function parseMultiplier(s: string | undefined): number {
  if (!s) return 1;
  const t = s.toLowerCase();
  if (/^(t|trillion)/.test(t)) return 1e12;
  if (/^(b|bn|billion|milliard|md|g)/.test(t)) return 1e9;
  if (/^(m|million)/.test(t)) return 1e6;
  if (/^(k)/.test(t)) return 1e3;
  return 1;
}

function formatNum(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  if (Number.isInteger(rounded)) return String(rounded);
  return String(rounded).replace(".", ",");
}

function formatEur(amount: number): string {
  if (amount >= 1e9) return `${formatNum(amount / 1e9)} Md€`;
  if (amount >= 1e6) return `${formatNum(amount / 1e6)} M€`;
  if (amount >= 1e3) return `${formatNum(amount / 1e3)} k€`;
  return `${Math.round(amount)} €`;
}

export function extractMoney(text: string): MoneyInfo | null {
  if (!text) return null;
  const t = text.replace(/\s+/g, " ");

  const patterns: RegExp[] = [
    /(\d+(?:[.,]\d+)?)\s*(M|Md|B|Bn|G|T)\s*(€|\$|EUR|USD|euros?|dollars?)/gi,
    /(€|\$)\s*(\d+(?:[.,]\d+)?)\s*(M|Md|B|Bn|G|T|million|milliard|billion|trillion)?/gi,
    /(\d+(?:[.,]\d+)?)\s*(million|millions|milliard|milliards|billion|billions|trillion|trillions)\s*(?:d['e]\s*|of\s*)?(euros?|dollars?|€|\$|EUR|USD)/gi,
  ];

  let best: MoneyInfo | null = null;

  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(t)) !== null) {
      let numStr: string;
      let multStr: string | undefined;
      let curStr: string | undefined;
      if (m[1] && (m[1] === "€" || m[1] === "$")) {
        curStr = m[1];
        numStr = m[2];
        multStr = m[3];
      } else {
        numStr = m[1];
        multStr = m[2];
        curStr = m[3];
      }

      const num = parseFloat(String(numStr).replace(",", "."));
      if (!Number.isFinite(num)) continue;
      const mult = parseMultiplier(multStr);
      const amountRaw = num * mult;
      const isUsd = /\$|USD|dollar/i.test(curStr || "");
      const amountEur = isUsd ? amountRaw * USD_TO_EUR : amountRaw;
      if (amountEur < 100_000 || amountEur > 10e12) continue;
      if (!best || amountEur > best.amount) {
        best = {
          amount: Math.round(amountEur),
          currency: "EUR",
          formatted: formatEur(amountEur),
        };
      }
    }
  }
  return best;
}

function countMatches(text: string, list: string[]): number {
  let c = 0;
  for (const kw of list) if (text.includes(kw)) c++;
  return c;
}

export interface EditorialResult {
  score: number;
  money: MoneyInfo | null;
  signals: Record<string, unknown>;
}

export function editorialScore(item: { title: string; summary?: string | null }): EditorialResult {
  const text = ` ${item.title || ""} ${item.summary || ""} `.toLowerCase();
  const wordCount = text.split(/\s+/).filter(Boolean).length || 1;

  let score = 0;
  const signals: Record<string, unknown> = {};

  const societal = countMatches(text, SOCIETAL_KEYWORDS);
  if (societal > 0) {
    const bonus = Math.min(30, 15 + societal * 5);
    score += bonus;
    signals.societal = { matches: societal, bonus };
  }

  const major = countMatches(text, MAJOR_NEWS_KEYWORDS);
  if (major > 0) {
    const bonus = Math.min(20, 10 + major * 5);
    score += bonus;
    signals.major = { matches: major, bonus };
  }

  const fundingMatches = countMatches(text, FUNDING_KEYWORDS);
  const money = extractMoney(`${item.title || ""} ${item.summary || ""}`);
  if (fundingMatches > 0) {
    let bonus = 25;
    if (money && money.amount >= 100_000_000) bonus += 10;
    score += bonus;
    signals.funding = { matches: fundingMatches, money: money?.formatted, bonus };
  } else if (money && money.amount >= 100_000_000) {
    score += 10;
    signals.bigMoney = { money: money.formatted, bonus: 10 };
  }

  const jargonMatches = countMatches(text, TECH_JARGON);
  if (jargonMatches > 0) {
    const density = (jargonMatches / wordCount) * 100;
    const penalty = jargonMatches >= 4 || density > 1 ? 25 : 10;
    score -= penalty;
    signals.jargon = { matches: jargonMatches, density: density.toFixed(2), penalty };
  }

  if (
    /\bselon\s+(?:un|une|des|le|la|les)?\s*(?:source|sources|rumeur|rumor|rapport)\b/.test(text) ||
    /\brumored?\b/.test(text) ||
    /\breportedly\b/.test(text)
  ) {
    score -= 20;
    signals.rumor = { penalty: 20 };
  }

  return { score, money, signals };
}

export { formatEur };
