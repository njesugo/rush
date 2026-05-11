/**
 * Claude service for carousel generation.
 * Port TS de one/src/services/claudeService.js.
 */

import Anthropic from "@anthropic-ai/sdk";
import { extractJson } from "./extractJson";

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (client) return client;
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY manquante dans .env");
  }
  client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

export const CLAUDE_MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-4-5-20250929";

export interface ClaudeUsage {
  input_tokens: number;
  output_tokens: number;
}

export const SYSTEM_PROMPT = `Tu es un analyste IA qui produit du contenu Instagram pour une audience francophone de professionnels et entrepreneurs avertis sur l'IA.

Ton rôle : INFORMER et ANALYSER. Pas conseiller. Pas évoqué ou généraliste.
Chaque carousel est une analyse condensée d'une actualité, d'une tendance ou d'un signal faible du marché IA.

INTERDICTIONS STRICTES :
- Aucun conseil généraliste type "adopte l'IA", "forme tes équipes", "ne reste pas à la traîne".
- Aucune recommandation passe-partout ou plan d'action générique.
- Aucune liste de "5 outils" ou "3 étapes pour".
- Aucun ton coach / motivationnel / lifestyle.
- Aucune invitation à réfléchir ("et toi, comment tu utilises l'IA ?").

CE QUE TU FAIS :
- Décrypter ce qui se passe vraiment derrière une annonce.
- Mettre en perspective avec le marché, les précédents techniques, les acteurs.
- Donner des chiffres précis, des comparaisons, des conséquences concrètes.
- Identifier ce qui change réellement et ce qui n'est que du marketing.
- Révéler des détails techniques ou stratégiques que la majorité va manquer.

Objectif : que le lecteur sauvegarde le post parce qu'il y a appris quelque chose de précis qu'il ne savait pas.`;

interface CallOpts {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  retries?: number;
}

async function callClaude<T = unknown>(opts: CallOpts): Promise<{ parsed: T; usage: ClaudeUsage; raw: string }> {
  const { systemPrompt, userPrompt, maxTokens = 2048, retries = 2 } = opts;
  const c = getClient();
  let lastErr: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await c.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      });

      const textBlock = response.content.find((b) => b.type === "text");
      const text = textBlock && "text" in textBlock ? textBlock.text : "";
      const usage: ClaudeUsage = {
        input_tokens: response.usage?.input_tokens ?? 0,
        output_tokens: response.usage?.output_tokens ?? 0,
      };
      const parsed = extractJson<T>(text);
      return { parsed, usage, raw: text };
    } catch (err) {
      lastErr = err as Error;
      if (attempt < retries) {
        const wait = 2000 * Math.pow(2, attempt);
        console.warn(`[claude] tentative ${attempt + 1} échouée, retry dans ${wait}ms : ${(err as Error).message}`);
        await new Promise((r) => setTimeout(r, wait));
      }
    }
  }
  throw new Error(`callClaude failed après ${retries + 1} tentatives : ${lastErr?.message}`);
}

export interface Angle {
  angle_title: string;
  angle_type: string;
  angle_description: string;
}

export interface OutlineEntry {
  slide: number;
  role: "hook" | "content" | "outro";
  goal: string;
}

export interface SlidePlan {
  slideCount: number;
  rationale: string;
  outline: OutlineEntry[];
  usage: ClaudeUsage;
}

export interface Slide {
  slide_number: number;
  type: "hook" | "content" | "outro";
  title: string;
  body: string | null;
}

export interface Money {
  amount?: number;
  currency?: string;
  formatted: string;
}

export async function generateAngles(args: {
  title: string;
  summary: string;
  money?: Money | null;
  excludeTitles?: string[];
}): Promise<{ angles: Angle[]; usage: ClaudeUsage }> {
  const { title, summary, money = null, excludeTitles = [] } = args;
  const exclusionBlock = excludeTitles.length
    ? `\n\nIMPORTANT : ces angles ont déjà été proposés et REJETÉS. Tu dois en proposer 3 NOUVEAUX, fondamentalement différents (autre prise de vue narrative, autre type, autre promesse) :\n${excludeTitles.map((t) => `- ${t}`).join("\n")}`
    : "";

  const moneyBlock = money?.formatted
    ? `\n\nMONTANT DÉTECTÉ : ${money.formatted}\nRÈGLE OBLIGATOIRE : tu DOIS inclure ce montant textuellement ("${money.formatted}") dans le hook (angle_title) d'AU MOINS UN angle, idéalement le premier.`
    : "";

  const userPrompt = `Voici une actualité IA :
Titre : ${title}
Résumé : ${summary}

Génère 3 angles pour un carousel Instagram destiné à une audience qui suit l'actualité IA : nouveautés produits/modèles, grandes décisions, nouveaux acteurs, applications concrètes, implications.

TYPOLOGIE DES ANGLES (choisis 3 types DIFFÉRENTS dans cette liste) :
- "qui_gagne_qui_perd" : qui sort gagnant, qui sort perdant concrètement
- "rupture_usage" : ce qui change concrètement pour l'utilisateur final ou un secteur
- "coulisses" : ce qui se passe vraiment derrière l'annonce officielle
- "chiffre_choc" : un chiffre marquant et ce qu'il révèle vraiment
- "comparaison" : avant/après, ou vs concurrent direct (avec données)
- "signal_faible" : ce que tout le monde rate dans cette annonce
- "consequence_chaine" : effet domino, qui sera touché ensuite et comment
- "decryptage_technique" : la rupture technique sous-jacente, expliquée simplement

EXIGENCES (NON-NÉGOCIABLES) :
- Les 3 angles DOIVENT être de TYPES DIFFÉRENTS dans la liste ci-dessus.
- AU MOINS UN angle doit parler USAGE / UTILISATEUR / QUOTIDIEN / IMPACT CONCRET.
- Les 3 hooks doivent être radicalement distincts.
- Chaque angle doit être ancré dans un fait précis de l'article.

INTERDICTIONS ABSOLUES :
- Pas d'angle "comment l'utiliser", "5 façons de…", conseil pratique.
- Pas d'angle motivationnel, opportuniste, ou promesse vague.
- Pas d'impératif dans le hook.
- Pas de question rhétorique creuse.

Pour chaque angle, donne :
- angle_title : hook de la slide 1 (max 10 mots, factuel et tendu)
- angle_type : un type EXACT de la liste ci-dessus
- angle_description : 2 phrases — ce que le carousel va RÉVÉLER concrètement${exclusionBlock}${moneyBlock}

Réponds en JSON uniquement, format :
[{"angle_title": "...", "angle_type": "...", "angle_description": "..."}, ...]`;

  const { parsed, usage } = await callClaude<Angle[]>({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    maxTokens: 1024,
  });

  if (!Array.isArray(parsed) || parsed.length !== 3) {
    throw new Error(`generateAngles: réponse invalide (attendu 3 angles, reçu ${(parsed as unknown[])?.length})`);
  }
  return { angles: parsed, usage };
}

export async function planSlides(args: {
  title: string;
  fullText?: string | null;
  summary: string;
  angle: Angle;
}): Promise<SlidePlan> {
  const { title, fullText, summary, angle } = args;
  const sourceText = fullText && fullText.length > 400 ? fullText : summary || title;
  const userPrompt = `Tu es responsable éditorial d'un carousel Instagram d'analyse IA.

ANGLE CHOISI : ${angle.angle_title}
Type : ${angle.angle_type}
Description : ${angle.angle_description}

ARTICLE SOURCE :
Titre : ${title}
${sourceText.slice(0, 6000)}

Ton job : décider COMBIEN DE SLIDES (entre 3 et 10) ce sujet mérite vraiment, et l'outline.

RÈGLES STRICTES :
- 3-4 slides : info brève, un seul fait
- 5-6 slides : annonce avec contexte (cas le plus courant)
- 7-8 slides : sujet riche, plusieurs dimensions
- 9-10 slides : dossier de fond (RARE)

MIEUX VAUT 4 SLIDES DENSES QUE 8 DILUÉES.

Slide 1 = HOOK (titre seul). Slides 2 à N-1 = un point d'analyse précis chacune. Slide N = conclusion analytique forte.

Réponds en JSON UNIQUEMENT :
{
  "slide_count": 5,
  "rationale": "explication courte (max 20 mots)",
  "outline": [
    {"slide": 1, "role": "hook", "goal": "..."},
    {"slide": 2, "role": "content", "goal": "..."}
  ]
}`;

  const { parsed, usage } = await callClaude<{
    slide_count: number;
    rationale?: string;
    outline: OutlineEntry[];
  }>({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    maxTokens: 1200,
  });

  if (!parsed || typeof parsed.slide_count !== "number" || !Array.isArray(parsed.outline)) {
    throw new Error("planSlides: réponse invalide");
  }
  const n = Math.max(3, Math.min(10, Math.round(parsed.slide_count)));
  return {
    slideCount: n,
    rationale: parsed.rationale || "",
    outline: parsed.outline.slice(0, n),
    usage,
  };
}

export async function generateSlides(args: {
  angle: Angle;
  articleSummary: string;
  fullText?: string | null;
  slideCount: number;
  outline?: OutlineEntry[] | null;
}): Promise<{ slides: Slide[]; usage: ClaudeUsage }> {
  const { angle, articleSummary, fullText = null, slideCount, outline = null } = args;
  const sourceText = fullText && fullText.length > 400 ? fullText : articleSummary;
  const outlineBlock = outline
    ? `\nPLAN IMPOSÉ (${slideCount} slides) :\n${outline
        .map((o) => `- Slide ${o.slide} (${o.role}) : ${o.goal}`)
        .join("\n")}\n\nTu DOIS suivre ce plan exactement.`
    : "";
  const lastIdx = slideCount;

  const userPrompt = `Crée le contenu complet d'un carousel Instagram de ${slideCount} slides d'ANALYSE :
Angle : ${angle.angle_title}
Type : ${angle.angle_type}
Description : ${angle.angle_description}

ARTICLE SOURCE :
${sourceText.slice(0, 6000)}
${outlineBlock}

PHILOSOPHIE : décryptage, pas guide. Tu informes, tu analyses, tu révèles. Tu ne conseilles pas.

CONTRAINTE DE LONGUEUR (RÈGLE D'OR) :
Chaque slide = MAX 4 phrases ET 1 à 2 idées. Une liste à bullets compte pour 1 phrase.
Si plus à dire : SPLIT en 2 slides. Mieux vaut 8 courtes que 5 longues.
Lecture en moins de 8 secondes par slide.

INTERDICTIONS ABSOLUES :
- Pas de verbe impératif ("adopte", "utilise", "forme-toi"…).
- Aucun conseil généraliste, aucun "comment faire", aucun plan d'action.
- Aucune slide "Étapes pour…" ni "5 façons de…".
- Aucune slide "Pour aller plus loin" / "Et maintenant ?".
- Aucun appel à l'action ("Follow", "Commente").
- Aucune généralité type "l'IA va tout changer".

STRUCTURE :
- Slide 1 (HOOK) : titre uniquement, max 8 mots, body = null. Crée une tension.
- Slides 2 à ${lastIdx - 1} (CONTENU) : titre court (3-7 mots) + body 1-4 phrases.
- Slide ${lastIdx} : CONCLUSION forte. Pas d'ouverture, pas de conseil.

QUALITÉ :
- Chiffres, noms propres, dates précises tirés de l'article.
- Mise en perspective avec ce qui existait avant.

LANGUE : Français strict. Éviter les anglicismes (sauf API/IA/GPT/LLM/SaaS et noms propres).
Ton : analyste froid et précis.

Réponds en JSON uniquement, EXACTEMENT ${slideCount} slides :
[
  {"slide_number": 1, "type": "hook", "title": "...", "body": null},
  {"slide_number": 2, "type": "content", "title": "...", "body": "..."},
  {"slide_number": ${lastIdx}, "type": "content", "title": "...", "body": "..."}
]`;

  const { parsed, usage } = await callClaude<Slide[]>({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    maxTokens: 3500,
  });

  if (!Array.isArray(parsed) || parsed.length !== slideCount) {
    throw new Error(`generateSlides: réponse invalide (attendu ${slideCount}, reçu ${(parsed as unknown[])?.length})`);
  }
  return { slides: parsed, usage };
}

export async function generateCaption(args: {
  slides: Slide[];
  angle: Angle;
}): Promise<{ caption: string; usage: ClaudeUsage }> {
  const { slides, angle } = args;
  const slidesSummary = slides
    .map((s) => `${s.slide_number}. ${s.title}${s.body ? " — " + s.body.replace(/\n/g, " ") : ""}`)
    .join("\n");

  const userPrompt = `Écris la caption Instagram pour ce carousel.
Angle : ${angle.angle_title}
Contenu :
${slidesSummary}

La caption doit :
- Commencer par la phrase la plus impactante (pas de hashtag en premier)
- Entre 150 et 300 caractères (texte seul, hashtags non comptés)
- Terminer par "Sauvegarde ce post 🔖" ou équivalent naturel
- 5 hashtags maximum, pertinents : #IA #IntelligenceArtificielle #AITools et 2 spécifiques
- 2-3 emojis maximum
- Français strict

Réponds en JSON : {"caption": "..."}`;

  const { parsed, usage } = await callClaude<{ caption: string }>({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    maxTokens: 800,
  });

  if (!parsed || typeof parsed.caption !== "string") {
    throw new Error("generateCaption: réponse invalide");
  }
  return { caption: parsed.caption.trim(), usage };
}

export async function shortenSlide(args: {
  title: string;
  body: string;
  angle?: Angle;
}): Promise<{ body: string; usage: ClaudeUsage }> {
  const { title, body, angle } = args;
  const userPrompt = `Cette slide d'un carousel Instagram est TROP LONGUE. Le lecteur va décrocher.

Angle du carousel : ${angle?.angle_title || ""}

TITRE : ${title}
BODY ACTUEL :
${body}

CONSIGNE :
Réécris UNIQUEMENT le body :
- MAX 4 phrases. Une liste à bullets entière compte pour 1 phrase.
- 1 à 2 idées maximum.
- Garder chiffres, noms propres, citations exactes.
- Ne PAS reformuler stylistiquement : couper, pas paraphraser.
- Pas de phrase de transition.
- Ton brut, factuel.

Réponds en JSON UNIQUEMENT : {"body": "..."}
Utilise \\n pour les sauts de ligne.`;

  const { parsed, usage } = await callClaude<{ body: string }>({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    maxTokens: 600,
  });

  if (!parsed || typeof parsed.body !== "string") {
    throw new Error("shortenSlide: réponse invalide");
  }
  return { body: parsed.body.trim(), usage };
}
