/**
 * Reel script generation via Claude.
 * Takes the transcript of a YouTube source video + a free-text angle and produces
 * a tight Instagram Reels storyboard: hook + N blocks, each with its own b-roll cut.
 */

import Anthropic from "@anthropic-ai/sdk";
import { extractJson } from "../carousel/extractJson";
import { CLAUDE_MODEL, type ClaudeUsage } from "../carousel/claude";
import type { ReelStoryboard, ReelBlock, TranscriptSegment } from "@rush/db";

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (client) return client;
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY manquante dans .env");
  }
  client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

/** Hard caps used both for the prompt and for validation. */
export const REEL_LIMITS = {
  totalDurationS: 85,
  hookDurationS: 5,
  minBlocks: 3,
  maxBlocks: 6,
  minBlockS: 4,
  maxBlockS: 25,
  minZoomScale: 1,
  maxZoomScale: 3,
} as const;

const SYSTEM_PROMPT = `Tu es un scénariste expert en Instagram Reels pour une audience francophone de pros et entrepreneurs IA.

Tu reçois :
- la TRANSCRIPTION TIMESTAMPÉE d'une vidéo YouTube source (un tutoriel, une démo, un talk),
- un ANGLE éditorial libre choisi par l'utilisateur.

Tu produis un storyboard Reels TRÈS court (<= 85 secondes total, hook <= 5s) qui exécute cet angle, avec pour chaque bloc le segment de la vidéo source à utiliser comme B-roll (in/out + zoom).

PRINCIPES :
- Hook ultra-tendu, factuel, qui pose une promesse précise. Pas de question rhétorique creuse.
- Chaque bloc = une idée précise + une preuve ou un détail concret tiré de la transcription.
- Le script du créateur est ce qui sera dit en VOIX OFF par-dessus le B-roll. Il doit pouvoir être lu en exactement est_duration_s secondes (~2.5 mots/seconde en français).
- Le B-roll choisi pour chaque bloc doit ILLUSTRER ce que dit la voix off (montrer ce dont on parle).
- N'invente jamais d'information absente de la transcription. Si l'angle demande des infos absentes, contourne avec ce que la source contient réellement.

INTERDICTIONS :
- Pas d'impératif coach ("forme-toi", "adopte", "fais", "essaie").
- Pas de "et toi…", pas d'invitation à commenter.
- Pas de listicle générique.
- Pas de chiffre inventé.`;

/** Build the user prompt. Transcript is condensed to fit token budgets. */
function buildUserPrompt(args: {
  angle: string;
  sourceTitle: string | null;
  sourceDurationS: number;
  transcriptCondensed: string;
}): string {
  const { angle, sourceTitle, sourceDurationS, transcriptCondensed } = args;
  return `ANGLE ÉDITORIAL :
${angle.trim()}

VIDÉO SOURCE :
- Titre : ${sourceTitle ?? "(inconnu)"}
- Durée : ${sourceDurationS.toFixed(1)} s

TRANSCRIPTION (timestamps en secondes, format [start-end] texte) :
${transcriptCondensed}

CONTRAINTES DE FORMAT (NON-NÉGOCIABLES) :
- Total des est_duration_s (hook compris) <= ${REEL_LIMITS.totalDurationS} s.
- Hook lisible en <= ${REEL_LIMITS.hookDurationS} s (= 1 phrase courte, max ~12 mots).
- Entre ${REEL_LIMITS.minBlocks} et ${REEL_LIMITS.maxBlocks} blocs après le hook.
- Chaque bloc : ${REEL_LIMITS.minBlockS}–${REEL_LIMITS.maxBlockS} s.
- Chaque bloc DOIT avoir un broll dont in_s/out_s sont dans [0, ${sourceDurationS.toFixed(1)}] et out_s > in_s.
- Durée du broll (out_s - in_s) >= 1 s, idéalement proche de est_duration_s du bloc.
- broll.zoom : { x, y, scale } en coordonnées NORMALISÉES de la frame source (0..1 pour x/y = coin haut-gauche du crop, scale dans [${REEL_LIMITS.minZoomScale}, ${REEL_LIMITS.maxZoomScale}], 1 = frame entière, 2 = zoom x2). Garde scale=1 par défaut sauf si zoomer est nécessaire pour rendre l'élément lisible.
- broll.reason : 1 phrase ultra-courte expliquant pourquoi ce passage colle au script.

RÉPONDS EN JSON UNIQUEMENT, format strict :
{
  "hook": "string",
  "blocks": [
    {
      "script": "string",
      "est_duration_s": number,
      "broll": {
        "in_s": number,
        "out_s": number,
        "zoom": { "x": number, "y": number, "scale": number },
        "reason": "string"
      }
    }
  ]
}`;
}

/** Condense the transcript into a compact, token-cheap representation. */
export function condenseTranscript(segments: TranscriptSegment[], maxChars = 12000): string {
  if (!segments.length) return "(transcription vide)";
  const lines: string[] = [];
  let used = 0;
  for (const s of segments) {
    const line = `[${s.start.toFixed(1)}-${s.end.toFixed(1)}] ${s.text.trim()}`;
    if (used + line.length + 1 > maxChars) {
      lines.push("[...] (transcription tronquée)");
      break;
    }
    lines.push(line);
    used += line.length + 1;
  }
  return lines.join("\n");
}

/* ---------------- Validation ---------------- */

class ScriptValidationError extends Error {
  constructor(msg: string) {
    super(`script invalid: ${msg}`);
  }
}

function num(v: unknown, name: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) {
    throw new ScriptValidationError(`${name} must be a finite number`);
  }
  return v;
}

function str(v: unknown, name: string): string {
  if (typeof v !== "string" || !v.trim()) {
    throw new ScriptValidationError(`${name} must be a non-empty string`);
  }
  return v.trim();
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function validateAndNormalize(
  raw: unknown,
  sourceDurationS: number
): ReelStoryboard {
  if (!raw || typeof raw !== "object") throw new ScriptValidationError("not an object");
  const obj = raw as Record<string, unknown>;
  const hook = str(obj.hook, "hook");
  const blocksRaw = obj.blocks;
  if (!Array.isArray(blocksRaw)) throw new ScriptValidationError("blocks must be array");
  if (blocksRaw.length < REEL_LIMITS.minBlocks || blocksRaw.length > REEL_LIMITS.maxBlocks) {
    throw new ScriptValidationError(
      `blocks length ${blocksRaw.length} not in [${REEL_LIMITS.minBlocks}, ${REEL_LIMITS.maxBlocks}]`
    );
  }

  const blocks: ReelBlock[] = blocksRaw.map((b, i) => {
    if (!b || typeof b !== "object") {
      throw new ScriptValidationError(`block[${i}] not an object`);
    }
    const bo = b as Record<string, unknown>;
    const script = str(bo.script, `block[${i}].script`);
    const est = clamp(
      num(bo.est_duration_s, `block[${i}].est_duration_s`),
      REEL_LIMITS.minBlockS,
      REEL_LIMITS.maxBlockS
    );
    if (!bo.broll || typeof bo.broll !== "object") {
      throw new ScriptValidationError(`block[${i}].broll missing`);
    }
    const br = bo.broll as Record<string, unknown>;
    let inS = num(br.in_s, `block[${i}].broll.in_s`);
    let outS = num(br.out_s, `block[${i}].broll.out_s`);
    inS = clamp(inS, 0, Math.max(0, sourceDurationS - 1));
    outS = clamp(outS, inS + 1, sourceDurationS);
    if (!br.zoom || typeof br.zoom !== "object") {
      throw new ScriptValidationError(`block[${i}].broll.zoom missing`);
    }
    const z = br.zoom as Record<string, unknown>;
    const x = clamp(num(z.x, `block[${i}].broll.zoom.x`), 0, 1);
    const y = clamp(num(z.y, `block[${i}].broll.zoom.y`), 0, 1);
    const scale = clamp(
      num(z.scale, `block[${i}].broll.zoom.scale`),
      REEL_LIMITS.minZoomScale,
      REEL_LIMITS.maxZoomScale
    );
    const reason = typeof br.reason === "string" ? br.reason.trim() : undefined;

    return {
      script,
      est_duration_s: est,
      broll: { in_s: inS, out_s: outS, zoom: { x, y, scale }, reason },
    };
  });

  // Hook duration counts towards total budget; estimate ~2.5 words/s if missing.
  const hookEst = Math.min(REEL_LIMITS.hookDurationS, Math.max(2, hook.split(/\s+/).length / 2.5));
  const total = hookEst + blocks.reduce((acc, b) => acc + b.est_duration_s, 0);
  if (total > REEL_LIMITS.totalDurationS + 5) {
    throw new ScriptValidationError(
      `total duration ${total.toFixed(1)}s exceeds ${REEL_LIMITS.totalDurationS}s`
    );
  }

  return { hook, blocks };
}

/* ---------------- Public API ---------------- */

export async function generateReelScript(args: {
  angle: string;
  transcript: TranscriptSegment[];
  sourceTitle?: string | null;
  sourceDurationS: number;
  retries?: number;
}): Promise<{ storyboard: ReelStoryboard; usage: ClaudeUsage; raw: string }> {
  const { angle, transcript, sourceTitle = null, sourceDurationS, retries = 2 } = args;
  if (!angle.trim()) throw new Error("generateReelScript: angle required");
  if (!Array.isArray(transcript) || !transcript.length) {
    throw new Error("generateReelScript: transcript empty");
  }
  if (!Number.isFinite(sourceDurationS) || sourceDurationS <= 0) {
    throw new Error("generateReelScript: invalid sourceDurationS");
  }

  const transcriptCondensed = condenseTranscript(transcript);
  const userPrompt = buildUserPrompt({
    angle,
    sourceTitle,
    sourceDurationS,
    transcriptCondensed,
  });
  const c = getClient();

  let lastErr: Error | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await c.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 3000,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      });
      const block = response.content.find((b) => b.type === "text");
      const text = block && "text" in block ? block.text : "";
      const usage: ClaudeUsage = {
        input_tokens: response.usage?.input_tokens ?? 0,
        output_tokens: response.usage?.output_tokens ?? 0,
      };
      const parsed = extractJson<unknown>(text);
      const storyboard = validateAndNormalize(parsed, sourceDurationS);
      return { storyboard, usage, raw: text };
    } catch (err) {
      lastErr = err as Error;
      if (attempt < retries) {
        const wait = 1500 * Math.pow(2, attempt);
        console.warn(
          `[reel-script] attempt ${attempt + 1} failed, retry in ${wait}ms: ${lastErr.message}`
        );
        await new Promise((r) => setTimeout(r, wait));
      }
    }
  }
  throw new Error(`generateReelScript failed after ${retries + 1} attempts: ${lastErr?.message}`);
}
