/**
 * Carousel renderer using Satori (JSX → SVG) + resvg-js (SVG → PNG).
 * No headless browser, lightweight, perfect for Railway worker container.
 *
 * Layouts:
 *   - hook    : large title, small CTA at bottom
 *   - content : title + body, image background with overlay
 *   - outro   : centered profile/handle + CTA
 */

import path from "node:path";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import { eq, inArray } from "drizzle-orm";
import {
  getDb,
  carousels,
  images,
  type CarouselSlide,
} from "@rush/db";
import { OUTPUT_DIR, GENERIC_DIR, DONE_DIR, BANK_DIR } from "../paths";

/* ----------------------- Constants ----------------------- */

export const RENDER_FORMATS = {
  "1:1": { width: 1080, height: 1080 },
  "4:5": { width: 1080, height: 1350 },
} as const;
export type RenderFormat = keyof typeof RENDER_FORMATS;

const ACCENT = "#282829";
const SURFACE = "#fafaf9";
const TEXT = "#282829";
const MUTED = "#6b6b70";

/* ----------------------- Font loader (cached) ----------------------- */

let _fontCache: { regular: ArrayBuffer; bold: ArrayBuffer } | null = null;

async function loadFonts(): Promise<{ regular: ArrayBuffer; bold: ArrayBuffer }> {
  if (_fontCache) return _fontCache;
  // Static Inter weights from @fontsource (variable Inter is not parsable by satori)
  const REG_URL = "https://cdn.jsdelivr.net/npm/@fontsource/inter@5.0.16/files/inter-latin-400-normal.woff";
  const BOLD_URL = "https://cdn.jsdelivr.net/npm/@fontsource/inter@5.0.16/files/inter-latin-700-normal.woff";
  const [reg, bold] = await Promise.all([
    fetch(REG_URL).then((r) => {
      if (!r.ok) throw new Error(`font fetch failed: ${REG_URL} -> ${r.status}`);
      return r.arrayBuffer();
    }),
    fetch(BOLD_URL).then((r) => {
      if (!r.ok) throw new Error(`font fetch failed: ${BOLD_URL} -> ${r.status}`);
      return r.arrayBuffer();
    }),
  ]);
  _fontCache = { regular: reg, bold };
  return _fontCache;
}

/* ----------------------- Image picking ----------------------- */

async function pickBankImages(count: number): Promise<string[]> {
  const db = getDb();
  // Pull `done` and `generic` filenames from DB
  const rows = await db
    .select({ filename: images.filename, status: images.status, storageKey: images.storageKey })
    .from(images)
    .where(inArray(images.status, ["done", "generic"]));
  const usable = rows
    .map((r) => path.join(BANK_DIR, r.storageKey))
    .filter((p) => existsSync(p));
  if (!usable.length) return [];
  const shuffled = [...usable].sort(() => Math.random() - 0.5);
  if (count <= shuffled.length) return shuffled.slice(0, count);
  // pad with replacement
  const out = [...shuffled];
  while (out.length < count) {
    out.push(usable[Math.floor(Math.random() * usable.length)]);
  }
  return out;
}

async function loadImageDataUrl(absPath: string): Promise<string | null> {
  try {
    const buf = await fs.readFile(absPath);
    const ext = path.extname(absPath).toLowerCase().replace(".", "");
    const mime = ext === "jpg" ? "jpeg" : ext;
    return `data:image/${mime};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

/* ----------------------- Layouts (JSX-as-objects, Satori-style) ----------------------- */

type SlidePlan = {
  layout: "hook" | "content" | "outro";
  slideNumber: number;
  totalSlides: number;
  title: string;
  body: string;
  highlight: string | null;
  imageDataUrl: string | null;
};

// Satori expects React-like nodes; we use plain objects (no React import needed).
type Node = {
  type: string;
  props: Record<string, unknown> & { children?: unknown };
};
function el(type: string, props: Record<string, unknown> = {}, ...children: unknown[]): Node {
  return { type, props: { ...props, children: children.length === 1 ? children[0] : children } };
}

function renderHook(plan: SlidePlan, w: number, h: number): Node {
  // Bande texte basse occupant ~32% de la slide, avec fade court au-dessus
  const bandH = Math.round(h * 0.32);
  const fadeH = Math.round(h * 0.1);
  return el(
    "div",
    {
      style: {
        width: w,
        height: h,
        display: "flex",
        flexDirection: "column",
        background: SURFACE,
        position: "relative",
        fontFamily: "Inter",
      },
    },
    plan.imageDataUrl &&
      el("img", {
        src: plan.imageDataUrl,
        style: { position: "absolute", top: 0, left: 0, width: w, height: h, objectFit: "cover" },
      }),
    // Fade au-dessus de la bande
    plan.imageDataUrl &&
      el("div", {
        style: {
          position: "absolute",
          left: 0,
          right: 0,
          bottom: bandH,
          height: fadeH,
          background: `linear-gradient(to bottom, rgba(250,250,249,0) 0%, ${SURFACE} 100%)`,
          display: "flex",
        },
      }),
    // Bande basse opaque
    el(
      "div",
      {
        style: {
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: bandH,
          background: SURFACE,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: 64,
        },
      },
      el(
        "div",
        {
          style: {
            fontSize: 76,
            fontWeight: 700,
            color: TEXT,
            lineHeight: 1.05,
            letterSpacing: "-0.02em",
            display: "flex",
          },
        },
        plan.title
      ),
      el(
        "div",
        {
          style: {
            marginTop: 32,
            display: "flex",
            alignItems: "center",
            gap: 16,
            color: MUTED,
            fontSize: 26,
            fontWeight: 500,
          },
        },
        el("div", { style: { width: 48, height: 2, background: ACCENT, display: "flex" } }),
        el("div", { style: { display: "flex" } }, "Voici comment")
      )
    ),
    el(
      "div",
      {
        style: {
          position: "absolute",
          bottom: 24,
          right: 40,
          fontSize: 22,
          color: MUTED,
          fontWeight: 600,
          display: "flex",
        },
      },
      `${plan.slideNumber} / ${plan.totalSlides}`
    )
  );
}

/**
 * Rend le body en flux inline (mot par mot via flex-wrap), avec la phrase `highlight`
 * (extraite du body) en gras italique. Si introuvable, fallback sur le body brut.
 *
 * Pourquoi mot-par-mot : Satori ne sait pas wrapper du contenu inline mixte. Un seul
 * <span> enfant d'un parent flex est traité comme un item indivisible. La seule façon
 * fiable d'obtenir un texte continu avec stylage partiel est de générer un <span>
 * par mot (Satori les arrange alors comme du texte qui wrap naturellement).
 */
// Palette de couleurs pour les surlignages (rotation par slide).
// Tons doux, transparence élevée pour rester lisible sur fond clair.
const HIGHLIGHT_COLORS = [
  "rgba(96, 165, 250, 0.22)",  // bleu
  "rgba(250, 204, 21, 0.30)",  // jaune
  "rgba(244, 114, 182, 0.25)", // rose
  "rgba(74, 222, 128, 0.25)",  // vert
  "rgba(251, 146, 60, 0.28)",  // orange
  "rgba(167, 139, 250, 0.25)", // violet
];

function renderBodyWithHighlight(body: string, highlight: string | null, slideNumber: number): Node {
  const baseStyle = {
    fontSize: 32,
    fontWeight: 400,
    color: "#3f3f42",
    lineHeight: 1.4,
  } as const;

  const norm = (s: string) => s.toLowerCase().replace(/[\s\u00a0]+/g, " ").trim();

  // Découpe le body en tokens (mots séparés par espaces). On garde les ponctuations
  // collées au mot précédent, ce qui correspond au comportement typographique attendu.
  const tokens = body.split(/\s+/).filter((t) => t.length > 0);

  // Couleur du surlignage : rotation par n° de slide (slide 2 → bleu, 3 → jaune, …).
  const hlColor = HIGHLIGHT_COLORS[(slideNumber - 2 + HIGHLIGHT_COLORS.length) % HIGHLIGHT_COLORS.length];

  // Détermine quels indices de tokens font partie de la phrase à styler.
  const highlightSet = new Set<number>();
  if (highlight && highlight.trim()) {
    const hlTokens = highlight.split(/\s+/).filter((t) => t.length > 0).map(norm);
    if (hlTokens.length > 0) {
      const tokensNorm = tokens.map(norm);
      // Recherche de la séquence hlTokens dans tokensNorm (matching tolérant : on
      // accepte un préfixe/suffixe — ex. ponctuation collée).
      outer: for (let i = 0; i + hlTokens.length <= tokensNorm.length; i++) {
        for (let j = 0; j < hlTokens.length; j++) {
          const a = tokensNorm[i + j];
          const b = hlTokens[j];
          if (!(a === b || a.startsWith(b) || a.endsWith(b) || a.includes(b))) {
            continue outer;
          }
        }
        for (let j = 0; j < hlTokens.length; j++) highlightSet.add(i + j);
        break;
      }
    }
  }

  return el(
    "div",
    {
      style: {
        ...baseStyle,
        display: "flex",
        flexWrap: "wrap",
      },
    },
    ...tokens.map((tok, i) => {
      const isHi = highlightSet.has(i);
      // Pour que le surlignage soit continu (sans trous entre les mots),
      // on remplace le margin par du padding sur les tokens du highlight,
      // sauf pour le dernier token de la séquence (pas de padding final).
      const nextIsHi = highlightSet.has(i + 1);
      return el(
        "span",
        {
          style: isHi
            ? {
                fontWeight: 700,
                color: TEXT,
                transform: "skewX(-10deg)",
                background: hlColor,
                paddingRight: nextIsHi ? "0.28em" : 0,
                marginRight: nextIsHi ? 0 : "0.28em",
              }
            : { marginRight: "0.28em" },
        },
        tok
      );
    })
  );
}

function renderContent(plan: SlidePlan, w: number, h: number, imagePosition: "top" | "bottom"): Node {
  // Image occupe ~45% de la slide, le texte l'autre côté, fade sur 8% à la jonction
  const imgH = Math.round(h * 0.45);
  const fadeH = Math.round(h * 0.08);
  const imgTop = imagePosition === "top" ? 0 : h - imgH;

  return el(
    "div",
    {
      style: {
        width: w,
        height: h,
        display: "flex",
        flexDirection: "column",
        background: SURFACE,
        position: "relative",
        fontFamily: "Inter",
      },
    },
    plan.imageDataUrl &&
      el("img", {
        src: plan.imageDataUrl,
        style: {
          position: "absolute",
          top: imgTop,
          left: 0,
          width: w,
          height: imgH,
          objectFit: "cover",
        },
      }),
    // Fade à la jonction image / texte
    plan.imageDataUrl &&
      el("div", {
        style: {
          position: "absolute",
          left: 0,
          right: 0,
          top: imagePosition === "top" ? imgH - fadeH : h - imgH,
          height: fadeH,
          background:
            imagePosition === "top"
              ? `linear-gradient(to bottom, rgba(250,250,249,0) 0%, ${SURFACE} 100%)`
              : `linear-gradient(to top, rgba(250,250,249,0) 0%, ${SURFACE} 100%)`,
          display: "flex",
        },
      }),
    el(
      "div",
      {
        style: {
          position: "absolute",
          top: imagePosition === "top" ? imgH : 0,
          left: 0,
          right: 0,
          height: h - imgH,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: 72,
          gap: 28,
          background: SURFACE,
        },
      },
      el(
        "div",
        {
          style: {
            fontSize: 56,
            fontWeight: 700,
            color: TEXT,
            lineHeight: 1.1,
            letterSpacing: "-0.015em",
            display: "flex",
          },
        },
        plan.title
      ),
      plan.body &&
        renderBodyWithHighlight(plan.body, plan.highlight, plan.slideNumber)
    ),
    el(
      "div",
      {
        style: {
          position: "absolute",
          bottom: 24,
          right: 40,
          fontSize: 22,
          color: MUTED,
          fontWeight: 600,
          display: "flex",
        },
      },
      `${plan.slideNumber} / ${plan.totalSlides}`
    )
  );
}

function renderOutro(plan: SlidePlan, w: number, h: number, _username: string): Node {
  const template = (plan.body || "").trim();
  const lines = template.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const HI = {
    fontWeight: 700,
    color: TEXT,
    transform: "skewX(-10deg)",
  } as const;

  // Parse **...** markers in a line into a list of { text, hi } segments.
  const parseSegments = (line: string): { text: string; hi: boolean }[] => {
    const out: { text: string; hi: boolean }[] = [];
    const re = /\*\*([^*]+)\*\*/g;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) {
      if (m.index > last) out.push({ text: line.slice(last, m.index), hi: false });
      out.push({ text: m[1], hi: true });
      last = m.index + m[0].length;
    }
    if (last < line.length) out.push({ text: line.slice(last), hi: false });
    return out;
  };

  const renderLine = (line: string): Node => {
    const segs = parseSegments(line);
    const tokens: Node[] = [];
    segs.forEach((seg) => {
      const words = seg.text.split(/\s+/).filter(Boolean);
      words.forEach((w, idx) => {
        const isLastInSeg = idx === words.length - 1;
        tokens.push(
          el(
            "span",
            {
              style: seg.hi
                ? {
                    ...HI,
                    background: HIGHLIGHT_COLORS[0], // bleu, comme le 1er content
                    paddingRight: isLastInSeg ? 0 : "0.28em",
                    marginRight: isLastInSeg ? "0.28em" : 0,
                  }
                : { marginRight: "0.28em" },
            },
            w
          )
        );
      });
    });
    return el(
      "div",
      {
        style: {
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          width: "100%",
        },
      },
      ...tokens
    );
  };

  return el(
    "div",
    {
      style: {
        width: w,
        height: h,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: SURFACE,
        color: TEXT,
        fontFamily: "Inter",
        padding: 96,
      },
    },
    el(
      "div",
      {
        style: {
          fontSize: 44,
          fontWeight: 400,
          lineHeight: 1.45,
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 18,
          width: "100%",
        },
      },
      ...lines.map(renderLine)
    )
  );
}

/* ----------------------- Public API ----------------------- */

export interface RenderCarouselArgs {
  carouselId: number;
  format?: RenderFormat;
  username?: string;
  onProgress?: (pct: number) => void;
  /** Si fourni, seules ces slides sont (re)rendues ; les autres conservent leur PNG existant. */
  onlySlideNumbers?: number[];
}

export interface RenderCarouselResult {
  carouselId: number;
  format: RenderFormat;
  paths: string[]; // absolute paths of generated PNGs
}

export async function renderCarousel(args: RenderCarouselArgs): Promise<RenderCarouselResult> {
  const { carouselId, onlySlideNumbers } = args;
  const format: RenderFormat = args.format ?? "4:5";
  const dims = RENDER_FORMATS[format];
  const username = args.username || process.env.INSTAGRAM_USERNAME || "@rush";

  const db = getDb();
  const [row] = await db.select().from(carousels).where(eq(carousels.id, carouselId)).limit(1);
  if (!row) throw new Error(`carousel #${carouselId} introuvable`);
  const slides = (row.slides ?? []) as CarouselSlide[];
  if (!slides.length) throw new Error(`carousel #${carouselId} n'a pas de slides`);

  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  // Pour chaque slide non-outro, déterminer l'image à utiliser :
  // - si imageStorageKey est défini → ce fichier précis (stable)
  // - sinon → tirage aléatoire UNE FOIS, puis persisté sur la slide pour rester stable
  const nonOutroSlides = slides.filter((s) => s.type !== "outro");
  const needsRandom = nonOutroSlides.filter((s) => !s.imageStorageKey).length;
  const randomPicks = await pickBankImages(needsRandom);
  let randomIdx = 0;

  // On construit une copie mutable des slides pour persister les picks aléatoires.
  const mutatedSlides: CarouselSlide[] = slides.map((s) => ({ ...s }));
  let slidesChanged = false;

  const slideToImagePath = new Map<number, string | null>();
  for (const s of nonOutroSlides) {
    if (s.imageStorageKey) {
      const p = path.join(BANK_DIR, s.imageStorageKey);
      if (existsSync(p)) {
        slideToImagePath.set(s.slide_number, p);
        continue;
      }
      // Fichier introuvable → on retire la clé invalide et on retombe en aléatoire
      const idx = mutatedSlides.findIndex((m) => m.slide_number === s.slide_number);
      if (idx !== -1) {
        mutatedSlides[idx].imageStorageKey = null;
        slidesChanged = true;
      }
    }
    const pickedAbs = randomPicks[randomIdx++] ?? null;
    slideToImagePath.set(s.slide_number, pickedAbs);
    if (pickedAbs) {
      // Persiste le pick aléatoire pour que les futurs re-renders soient stables
      const rel = path.relative(BANK_DIR, pickedAbs).split(path.sep).join("/");
      const idx = mutatedSlides.findIndex((m) => m.slide_number === s.slide_number);
      if (idx !== -1) {
        mutatedSlides[idx].imageStorageKey = rel;
        slidesChanged = true;
      }
    }
  }

  // Fichiers PNG existants (chemins absolus, indexés par slide_number)
  const existingRelPaths = (row.renderedPaths as string[] | null) ?? [];
  const existingAbsBySlide = new Map<number, string>();
  for (const rel of existingRelPaths) {
    const m = rel.match(/_slide_(\d+)\.png$/);
    if (m) existingAbsBySlide.set(parseInt(m[1], 10), path.join(BANK_DIR, rel));
  }

  // Sélection des slides à réellement rendre
  const renderTargets = onlySlideNumbers && onlySlideNumbers.length
    ? new Set(onlySlideNumbers)
    : null;

  const fonts = await loadFonts();
  const total = slides.length;

  const finalPaths: string[] = [];
  let renderedCount = 0;
  const toRender = renderTargets
    ? slides.filter((s) => renderTargets.has(s.slide_number)).length
    : total;

  for (let i = 0; i < slides.length; i++) {
    const s = slides[i];
    const out = path.join(
      OUTPUT_DIR,
      `carousel_${carouselId}_slide_${String(s.slide_number).padStart(2, "0")}.png`
    );

    const shouldRender = !renderTargets || renderTargets.has(s.slide_number);
    if (!shouldRender) {
      // Conserve le PNG existant s'il est dispo
      const existing = existingAbsBySlide.get(s.slide_number);
      if (existing && existsSync(existing)) {
        finalPaths.push(existing);
        continue;
      }
      // Pas de PNG existant → on est obligé de le rendre quand même
    }

    const imgAbs = s.type === "outro" ? null : slideToImagePath.get(s.slide_number) ?? null;
    const imgDataUrl = imgAbs ? await loadImageDataUrl(imgAbs) : null;

    const plan: SlidePlan = {
      layout: s.type,
      slideNumber: s.slide_number,
      totalSlides: total,
      title: s.title || "",
      body: s.body || "",
      highlight: s.type === "content" ? (s.highlight ?? null) : null,
      imageDataUrl: imgDataUrl,
    };
    const tree =
      plan.layout === "hook"
        ? renderHook(plan, dims.width, dims.height)
        : plan.layout === "outro"
          ? renderOutro(plan, dims.width, dims.height, username)
          : renderContent(
              plan,
              dims.width,
              dims.height,
              s.slide_number % 2 === 0 ? "top" : "bottom"
            );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svg = await (await import(/* webpackIgnore: true */ "satori")).default(tree as any, {
      width: dims.width,
      height: dims.height,
      fonts: [
        { name: "Inter", data: fonts.regular, weight: 400, style: "normal" },
        { name: "Inter", data: fonts.bold, weight: 700, style: "normal" },
      ],
    });
    const { Resvg } = await import(/* webpackIgnore: true */ "@resvg/resvg-js");
    const png = new Resvg(svg, { fitTo: { mode: "width", value: dims.width } }).render().asPng();
    await fs.writeFile(out, png);
    finalPaths.push(out);
    renderedCount++;
    if (args.onProgress && toRender > 0) {
      args.onProgress(Math.round((renderedCount / toRender) * 100));
    }
  }

  // Persiste : slides (avec picks stables) + chemins PNG + format
  const relPaths = finalPaths.map((p) => path.relative(BANK_DIR, p).split(path.sep).join("/"));
  await db
    .update(carousels)
    .set({
      ...(slidesChanged ? { slides: mutatedSlides } : {}),
      renderedAt: new Date(),
      renderedPaths: relPaths,
      renderFormat: format,
      updatedAt: new Date(),
    })
    .where(eq(carousels.id, carouselId));

  return { carouselId, format, paths: finalPaths };
}

export async function loadRenderedPaths(carouselId: number): Promise<string[]> {
  const db = getDb();
  const [row] = await db
    .select({ renderedPaths: carousels.renderedPaths })
    .from(carousels)
    .where(eq(carousels.id, carouselId))
    .limit(1);
  if (!row?.renderedPaths) return [];
  return (row.renderedPaths as string[]).map((rel) => path.join(BANK_DIR, rel));
}

// Unused imports kept for re-export needs by other files
void DONE_DIR;
void GENERIC_DIR;
