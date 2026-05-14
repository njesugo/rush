/**
 * Reel storyboard v2 generator (Remotion-oriented).
 *
 * Inputs:
 *  - the user's free-text script (what they want to say in the reel),
 *  - the Whisper word-level transcript of their voice-over,
 *  - the URLs (or base64 buffers) of the screenshots they uploaded.
 *
 * Output: a JSON object matching `@rush/shared#storyboardSchema`, ready to be
 * fed straight into the Remotion `Reel` composition.
 *
 * The model gets each screenshot through Claude's vision API so it can pick
 * sensible focus rectangles for each beat without manual annotation.
 */

import Anthropic from "@anthropic-ai/sdk";
import { storyboardSchema, type Storyboard } from "@rush/shared";
import { extractJson } from "../carousel/extractJson";
import { CLAUDE_MODEL, type ClaudeUsage } from "../carousel/claude";

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (client) return client;
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY manquante dans .env");
  }
  client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

export type WhisperWord = { word: string; start: number; end: number };

export type GenerateRemotionStoryboardInput = {
  /** Free-text script the user wrote (their angle / message). */
  script: string;
  /** Whisper word-level timestamps from the recorded voice-over. */
  voTranscript: WhisperWord[];
  /** Total VO duration in seconds (used to size the storyboard). */
  voDurationS: number;
  /** Public URLs of uploaded screenshots, in display order. */
  screenshotUrls: string[];
  /** Optional human-readable topic / title hint. */
  topic?: string | null;
  retries?: number;
};

export const REEL_V2_LIMITS = {
  hookMs: 3000,
  setupMaxMs: 3000,
  endCardMs: 5000,
  beatMinMs: 4000,
  beatMaxMs: 12000,
  totalMaxMs: 60000,
} as const;

const SYSTEM_PROMPT = `Tu es un directeur artistique et monteur de Reels Instagram pour une audience francophone (créateurs, devs, entrepreneurs IA).

Tu reçois :
- Un SCRIPT court écrit par le créateur (ce qu'il veut dire),
- La TRANSCRIPTION mot-à-mot timestampée de sa voix-off (Whisper),
- Une série de SCREENSHOTS (captures d'app, d'interface ou de produit) numérotés.

Tu produis un STORYBOARD JSON pour un moteur de rendu Remotion qui assemble:
hook -> setup -> 4 beats (un par fonctionnalité / idée) -> endCard.

Principes narratifs (style "Ninon Official" + démos SaaS propres) :
- Le HOOK est une promesse en une phrase, max ~14 mots, qui pose un chiffre / un constat / un nom propre. Choisis un mot-clé saillant à mettre en surbrillance.
- Le SETUP (2-3s) plante le décor avec le screenshot le plus représentatif et 4-8 mots.
- Chaque BEAT (4-12s) = 1 idée précise + 1 zone visuelle à zoomer dans le screenshot pertinent.
- L'END CARD résume avec une CTA douce ("Suis-moi pour +", handle, etc.).
- Tu suis EXACTEMENT les timestamps de la voix-off : chaque mot du caption d'une section doit avoir startMs/endMs issus de la transcription Whisper.
- Sections jointives, pas de trou : la fin d'une section = le début de la suivante.

Pour les FOCUS RECTS :
- Tu observes les screenshots et choisis une zone (x,y,w,h normalisée 0..1) qui contient le détail dont parle la voix-off à ce moment-là.
- Bornes prudentes : w et h entre 0.25 et 0.7 (sinon le zoom est imperceptible ou trop agressif).

OVERLAYS PAR BEAT (optionnels, max 2 par beat, pour appuyer la démonstration) :
Chaque overlay a un startMs / endMs ABSOLUS, contenus dans la fenêtre du beat.
Coordonnées en [0,1] dans le repère du screenshot pertinent du beat.

1) "highlight" — encadre une zone précise pendant qu'on en parle.
   { "kind":"highlight", "rect":{"x":0,"y":0,"w":0.3,"h":0.1}, "startMs":..., "endMs":..., "label":"texte court optionnel" }
   → utile quand la voix nomme un bouton, une métrique, un onglet.

2) "cursor" — curseur fantôme qui glisse de "from" à "to", click optionnel.
   { "kind":"cursor", "from":{"x":0.1,"y":0.2}, "to":{"x":0.6,"y":0.5}, "startMs":..., "endMs":..., "click":true }
   → utile quand la voix décrit une action ("tu cliques sur…", "tu sélectionnes…").

3) "typeInto" — simule la frappe de texte dans un champ d'input.
   { "kind":"typeInto", "rect":{"x":0.1,"y":0.85,"w":0.8,"h":0.06}, "text":"Crée moi une landing page", "startMs":..., "endMs":... }
   → utile quand la voix décrit une saisie / un prompt envoyé.

Règles overlays :
- Toujours optionnels (overlays:[] est valide). N'en mets que s'ils servent vraiment la narration.
- Ne dépasse pas la fenêtre [beat.startMs, beat.endMs].
- Pas de chevauchement de cursor + typeInto sur la même zone à la même seconde.

INTERDICTIONS :
- Pas d'invention de chiffres ou de fonctionnalités absentes du script.
- Pas de mots dans un caption qui n'apparaissent pas dans la transcription Whisper (ordre + casse souples mais le texte doit correspondre).
- Pas de section qui dépasse 12s.
- Pas de référence à un screenshot inexistant (index >= nombre de screenshots).`;

function buildUserPrompt(args: {
  script: string;
  voTranscript: WhisperWord[];
  voDurationS: number;
  screenshotCount: number;
  topic: string | null;
}): string {
  const { script, voTranscript, voDurationS, screenshotCount, topic } = args;
  const transcriptLine = voTranscript
    .map((w) => `${w.word}@${Math.round(w.start * 1000)}-${Math.round(w.end * 1000)}`)
    .join(" ");
  return `TOPIC : ${topic ?? "(non précisé)"}

SCRIPT (intention créateur) :
${script.trim()}

VOICE-OVER (Whisper word-level, format mot@startMs-endMs) :
${transcriptLine}

VO duration : ${(voDurationS * 1000).toFixed(0)} ms
Screenshots disponibles : ${screenshotCount} (indexés de 0 à ${screenshotCount - 1}, joints en pièces images dans ce message)

CONTRAINTES DE FORMAT (strictes) :
- Hook : 0 -> ${REEL_V2_LIMITS.hookMs} ms
- Setup : ${REEL_V2_LIMITS.hookMs} -> au plus ${REEL_V2_LIMITS.hookMs + REEL_V2_LIMITS.setupMaxMs} ms
- 4 beats jointifs après le setup, chacun ${REEL_V2_LIMITS.beatMinMs}-${REEL_V2_LIMITS.beatMaxMs} ms
- EndCard : ${REEL_V2_LIMITS.endCardMs} ms à la fin
- Total durationMs <= ${REEL_V2_LIMITS.totalMaxMs}
- Chaque caption[i].startMs / endMs DOIT être une valeur déjà présente dans la transcription Whisper.

RÉPONDS EN JSON UNIQUEMENT, sans markdown, sans préambule, format :
{
  "version": 1,
  "durationMs": number,
  "fps": 30,
  "width": 1080,
  "height": 1920,
  "assets": { "screenshots": [...], "voiceUrl": null },
  "sections": [
    { "kind": "hook", "startMs": 0, "endMs": 3000, "text": "...", "highlight": "..." },
    { "kind": "setup", "startMs": 3000, "endMs": 5000, "screenshotIndex": 0,
      "focusRect": { "x":0,"y":0,"w":0.5,"h":0.5 },
      "caption": [ { "text":"...","startMs":3000,"endMs":3380 } ] },
    { "kind": "beat", "index": 1, "startMs": 5000, "endMs": 12000, "label": "01 · ...",
      "screenshotIndex": 0, "focusRect": { ... }, "caption": [ ... ], "overlays": [] },
    { "kind": "beat", "index": 2, ... },
    { "kind": "beat", "index": 3, ... },
    { "kind": "beat", "index": 4, ... },
    { "kind": "endCard", "startMs": ..., "endMs": ..., "title": "...", "subtitle": "...", "cta": "Suis-moi pour +" }
  ]
}

Le champ assets.screenshots et assets.voiceUrl seront remplacés côté serveur ; mets [] et null.`;
}

/* -------- Image fetching for vision API -------- */

async function fetchImageAsBase64(url: string): Promise<{ data: string; mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif" }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url}: ${res.status}`);
  const ct = res.headers.get("content-type")?.toLowerCase() ?? "";
  let mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif" = "image/png";
  if (ct.includes("jpeg") || ct.includes("jpg")) mediaType = "image/jpeg";
  else if (ct.includes("webp")) mediaType = "image/webp";
  else if (ct.includes("gif")) mediaType = "image/gif";
  const buf = Buffer.from(await res.arrayBuffer());
  return { data: buf.toString("base64"), mediaType };
}

/* -------- Public API -------- */

export async function generateRemotionStoryboard(
  input: GenerateRemotionStoryboardInput
): Promise<{ storyboard: Storyboard; usage: ClaudeUsage; raw: string }> {
  const {
    script,
    voTranscript,
    voDurationS,
    screenshotUrls,
    topic = null,
    retries = 2,
  } = input;

  if (!script.trim()) throw new Error("generateRemotionStoryboard: script required");
  if (!voTranscript.length) throw new Error("generateRemotionStoryboard: voTranscript empty");
  if (!Number.isFinite(voDurationS) || voDurationS <= 0) {
    throw new Error("generateRemotionStoryboard: invalid voDurationS");
  }
  if (!screenshotUrls.length) {
    throw new Error("generateRemotionStoryboard: at least one screenshot required");
  }

  const userText = buildUserPrompt({
    script,
    voTranscript,
    voDurationS,
    screenshotCount: screenshotUrls.length,
    topic,
  });

  const images = await Promise.all(
    screenshotUrls.map(async (url, i) => {
      const { data, mediaType } = await fetchImageAsBase64(url);
      return { index: i, data, mediaType };
    })
  );

  const c = getClient();

  let lastErr: Error | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await c.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 4000,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: userText },
              ...images.flatMap((img) => [
                {
                  type: "text" as const,
                  text: `Screenshot index ${img.index} :`,
                },
                {
                  type: "image" as const,
                  source: {
                    type: "base64" as const,
                    media_type: img.mediaType,
                    data: img.data,
                  },
                },
              ]),
            ],
          },
        ],
      });
      const block = response.content.find((b) => b.type === "text");
      const text = block && "text" in block ? block.text : "";
      const usage: ClaudeUsage = {
        input_tokens: response.usage?.input_tokens ?? 0,
        output_tokens: response.usage?.output_tokens ?? 0,
      };
      const parsed = extractJson<unknown>(text);
      // Fill server-controlled assets fields before validation.
      if (parsed && typeof parsed === "object") {
        (parsed as Record<string, unknown>).assets = {
          screenshots: screenshotUrls,
          voiceUrl: null,
        };
      }
      const storyboard = storyboardSchema.parse(parsed);
      validateBusinessRules(storyboard, screenshotUrls.length);
      return { storyboard, usage, raw: text };
    } catch (err) {
      lastErr = err as Error;
      if (attempt < retries) {
        const wait = 1500 * Math.pow(2, attempt);
        console.warn(
          `[reel-storyboard-v2] attempt ${attempt + 1} failed, retry in ${wait}ms: ${lastErr.message}`
        );
        await new Promise((r) => setTimeout(r, wait));
      }
    }
  }
  throw new Error(
    `generateRemotionStoryboard failed after ${retries + 1} attempts: ${lastErr?.message}`
  );
}

function validateBusinessRules(s: Storyboard, screenshotCount: number): void {
  if (s.durationMs > REEL_V2_LIMITS.totalMaxMs) {
    throw new Error(
      `total durationMs ${s.durationMs} exceeds ${REEL_V2_LIMITS.totalMaxMs}`
    );
  }
  // Check screenshot indices in range.
  for (const sec of s.sections) {
    if (sec.kind === "setup" || sec.kind === "beat") {
      if (sec.screenshotIndex >= screenshotCount) {
        throw new Error(
          `${sec.kind} references screenshotIndex ${sec.screenshotIndex} but only ${screenshotCount} provided`
        );
      }
    }
  }
  // Sections must be jointive and chronological.
  let prevEnd = 0;
  for (const [i, sec] of s.sections.entries()) {
    if (sec.startMs < prevEnd) {
      throw new Error(`sections[${i}] starts at ${sec.startMs} before previous end ${prevEnd}`);
    }
    if (sec.endMs <= sec.startMs) {
      throw new Error(`sections[${i}] endMs <= startMs`);
    }
    prevEnd = sec.endMs;
  }
}
