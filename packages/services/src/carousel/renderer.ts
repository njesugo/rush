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
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
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
  // Inter via Google Fonts static distribution
  const [reg, bold] = await Promise.all([
    fetch("https://github.com/google/fonts/raw/main/ofl/inter/Inter%5Bopsz%2Cwght%5D.ttf").then((r) =>
      r.arrayBuffer()
    ),
    // Same variable font carries bold weights — reuse
    fetch("https://github.com/google/fonts/raw/main/ofl/inter/Inter%5Bopsz%2Cwght%5D.ttf").then((r) =>
      r.arrayBuffer()
    ),
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
        style: { position: "absolute", top: 0, left: 0, width: w, height: h, objectFit: "cover", opacity: 0.18 },
      }),
    el(
      "div",
      {
        style: {
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          padding: 80,
          position: "relative",
        },
      },
      el(
        "div",
        {
          style: {
            fontSize: 88,
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
            marginTop: 56,
            display: "flex",
            alignItems: "center",
            gap: 16,
            color: MUTED,
            fontSize: 28,
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
          bottom: 32,
          right: 48,
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

function renderContent(plan: SlidePlan, w: number, h: number): Node {
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
        style: { position: "absolute", top: 0, left: 0, width: w, height: Math.round(h * 0.45), objectFit: "cover" },
      }),
    el(
      "div",
      {
        style: {
          marginTop: Math.round(h * 0.45),
          flex: 1,
          display: "flex",
          flexDirection: "column",
          padding: 72,
          gap: 28,
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
        el(
          "div",
          {
            style: {
              fontSize: 32,
              fontWeight: 400,
              color: "#3f3f42",
              lineHeight: 1.4,
              display: "flex",
            },
          },
          plan.body
        )
    ),
    el(
      "div",
      {
        style: {
          position: "absolute",
          bottom: 32,
          right: 48,
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

function renderOutro(plan: SlidePlan, w: number, h: number, username: string): Node {
  return el(
    "div",
    {
      style: {
        width: w,
        height: h,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: ACCENT,
        color: "#ffffff",
        fontFamily: "Inter",
        gap: 32,
        padding: 80,
      },
    },
    el(
      "div",
      { style: { fontSize: 36, fontWeight: 500, opacity: 0.7, display: "flex" } },
      "Merci d'avoir lu"
    ),
    el(
      "div",
      { style: { fontSize: 64, fontWeight: 700, letterSpacing: "-0.02em", display: "flex" } },
      username
    ),
    el(
      "div",
      {
        style: {
          marginTop: 48,
          padding: "20px 40px",
          background: "#ffffff",
          color: ACCENT,
          borderRadius: 999,
          fontSize: 28,
          fontWeight: 600,
          display: "flex",
        },
      },
      "Suis pour plus"
    )
  );
}

/* ----------------------- Public API ----------------------- */

export interface RenderCarouselArgs {
  carouselId: number;
  format?: RenderFormat;
  username?: string;
  onProgress?: (pct: number) => void;
}

export interface RenderCarouselResult {
  carouselId: number;
  format: RenderFormat;
  paths: string[]; // absolute paths of generated PNGs
}

export async function renderCarousel(args: RenderCarouselArgs): Promise<RenderCarouselResult> {
  const { carouselId } = args;
  const format: RenderFormat = args.format ?? "4:5";
  const dims = RENDER_FORMATS[format];
  const username = args.username || process.env.INSTAGRAM_USERNAME || "@rush";

  const db = getDb();
  const [row] = await db.select().from(carousels).where(eq(carousels.id, carouselId)).limit(1);
  if (!row) throw new Error(`carousel #${carouselId} introuvable`);
  const slides = (row.slides ?? []) as CarouselSlide[];
  if (!slides.length) throw new Error(`carousel #${carouselId} n'a pas de slides`);

  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  // Pick one image per content slide (hook also gets one for background opacity)
  const needs = slides.filter((s) => s.type !== "outro").length;
  const picks = await pickBankImages(needs);
  const imageDataUrls = await Promise.all(picks.map(loadImageDataUrl));

  const fonts = await loadFonts();
  const total = slides.length;

  const paths: string[] = [];
  let imgIdx = 0;
  for (let i = 0; i < slides.length; i++) {
    const s = slides[i];
    const plan: SlidePlan = {
      layout: s.type,
      slideNumber: s.slide_number,
      totalSlides: total,
      title: s.title || "",
      body: s.body || "",
      imageDataUrl: s.type === "outro" ? null : (imageDataUrls[imgIdx++] ?? null),
    };
    const tree =
      plan.layout === "hook"
        ? renderHook(plan, dims.width, dims.height)
        : plan.layout === "outro"
          ? renderOutro(plan, dims.width, dims.height, username)
          : renderContent(plan, dims.width, dims.height);

    // satori expects a React element; our plain-object tree is structurally compatible.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svg = await satori(tree as any, {
      width: dims.width,
      height: dims.height,
      fonts: [
        { name: "Inter", data: fonts.regular, weight: 400, style: "normal" },
        { name: "Inter", data: fonts.bold, weight: 700, style: "normal" },
      ],
    });
    const png = new Resvg(svg, { fitTo: { mode: "width", value: dims.width } }).render().asPng();
    const out = path.join(
      OUTPUT_DIR,
      `carousel_${carouselId}_slide_${String(s.slide_number).padStart(2, "0")}.png`
    );
    await fs.writeFile(out, png);
    paths.push(out);

    if (args.onProgress) args.onProgress(Math.round(((i + 1) / total) * 100));
  }

  // Persist on carousel row
  const relPaths = paths.map((p) => path.relative(BANK_DIR, p).split(path.sep).join("/"));
  await db
    .update(carousels)
    .set({
      renderedAt: new Date(),
      renderedPaths: relPaths,
      renderFormat: format,
      updatedAt: new Date(),
    })
    .where(eq(carousels.id, carouselId));

  return { carouselId, format, paths };
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
