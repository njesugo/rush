/**
 * Migrate data from legacy SQLite (`one/data.db`) into Postgres.
 * Usage:
 *   pnpm --filter @rush/db exec tsx src/migrations/from-legacy-sqlite.ts \
 *     [path/to/data.db] [path/to/legacy/bank]
 *
 * Defaults:
 *   sqlite path: /mnt/c/Users/20016390/Desktop/rush/one/data.db
 *   bank path:   /mnt/c/Users/20016390/Desktop/rush/one/images/bank
 *
 * Behaviour:
 *   - Idempotent: re-runs skip rows already imported (by hash / url / worker_id).
 *   - Preserves carousel and news IDs (resets sequences afterwards).
 *   - Copies bank files into BANK_DIR/{done,fail,raw,generic} preserving filename.
 *   - Skips legacy `_trash/`.
 */
import "dotenv/config";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import Database from "better-sqlite3";
import postgres from "postgres";

const DEFAULT_DB = "/mnt/c/Users/20016390/Desktop/rush/one/data.db";
const DEFAULT_BANK = "/mnt/c/Users/20016390/Desktop/rush/one/images/bank";

const sqlitePath = process.argv[2] ?? DEFAULT_DB;
const legacyBank = process.argv[3] ?? DEFAULT_BANK;

const PG_URL = process.env.DATABASE_URL;
if (!PG_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const TARGET_BANK = (() => {
  const env = process.env.BANK_DIR;
  if (env && path.isAbsolute(env)) return env;
  // assume run from repo root
  return path.resolve(process.cwd(), "../../data/bank");
})();

console.log("[migrate] sqlite =", sqlitePath);
console.log("[migrate] legacy bank =", legacyBank);
console.log("[migrate] target bank =", TARGET_BANK);

if (!fs.existsSync(sqlitePath)) throw new Error(`Sqlite not found: ${sqlitePath}`);
if (!fs.existsSync(legacyBank)) throw new Error(`Legacy bank not found: ${legacyBank}`);
fs.mkdirSync(path.join(TARGET_BANK, "done"), { recursive: true });
fs.mkdirSync(path.join(TARGET_BANK, "fail"), { recursive: true });
fs.mkdirSync(path.join(TARGET_BANK, "raw"), { recursive: true });
fs.mkdirSync(path.join(TARGET_BANK, "generic"), { recursive: true });

const sqlite = new Database(sqlitePath, { readonly: true });
const sql = postgres(PG_URL, { prepare: false });

interface LegacyNews {
  id: number;
  title: string;
  url: string;
  source: string;
  summary: string | null;
  scraped_at: string | null;
  used: number | null;
  editorial_score: number | null;
  money_amount: number | null;
  money_formatted: string | null;
}

interface LegacyCarousel {
  id: number;
  news_item_id: number | null;
  status: string | null;
  angle_options: string | null;
  selected_angle: number | null;
  slides_content: string | null;
  slide_pngs: string | null;
  caption: string | null;
  scheduled_at: string | null;
  published_at: string | null;
  ig_post_url: string | null;
  publer_post_id: string | null;
  format: string | null;
  created_at: string | null;
  updated_at: string | null;
  error_log: string | null;
}

interface LegacyBankAsset {
  filename: string;
  width: number | null;
  height: number | null;
  tags_auto: string | null;
  tags_manual: string | null;
}

interface LegacyPinAsset {
  worker_id: string;
  url: string;
  pin_url: string | null;
  action: string | null;
  swiped_at: string | null;
  synced_at: string | null;
  filename: string | null;
  downloaded_at: string | null;
  error: string | null;
  source: string | null;
}

function safeJSON<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

function toDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function sha256(file: string): string {
  const h = crypto.createHash("sha256");
  h.update(fs.readFileSync(file));
  return h.digest("hex");
}

function mapStatus(legacy: string | null): "draft" | "ready" | "scheduled" | "published" | "failed" {
  switch ((legacy ?? "").toLowerCase()) {
    case "ready":
      return "ready";
    case "scheduled":
      return "scheduled";
    case "published":
      return "published";
    case "failed":
    case "error":
      return "failed";
    default:
      return "draft";
  }
}

interface MapAngleOption {
  angle_title?: string;
  angle_type?: string;
  angle_description?: string;
  title?: string;
  type?: string;
  description?: string;
}
function mapAngle(o: MapAngleOption | null | undefined): {
  angle_title: string;
  angle_type: string;
  angle_description: string;
} | null {
  if (!o || typeof o !== "object") return null;
  return {
    angle_title: o.angle_title ?? o.title ?? "",
    angle_type: o.angle_type ?? o.type ?? "",
    angle_description: o.angle_description ?? o.description ?? "",
  };
}

interface MapSlideRow {
  slide_number?: number | string;
  number?: number | string;
  type?: string;
  title?: string;
  body?: string | null;
  text?: string | null;
}
function mapSlides(arr: MapSlideRow[] | null | undefined): {
  slide_number: number;
  type: "hook" | "content" | "outro";
  title: string;
  body: string | null;
}[] {
  if (!Array.isArray(arr)) return [];
  return arr.map((s, i) => ({
    slide_number: Number(s.slide_number ?? s.number ?? i + 1),
    type: ((): "hook" | "content" | "outro" => {
      const t = (s.type ?? "").toLowerCase();
      if (t === "hook" || t === "outro") return t;
      return "content";
    })(),
    title: String(s.title ?? ""),
    body: s.body ?? s.text ?? null,
  }));
}

async function migrateNews() {
  const rows = sqlite.prepare("SELECT * FROM news_items ORDER BY id").all() as LegacyNews[];
  let inserted = 0;
  let skipped = 0;
  for (const r of rows) {
    const fetched = toDate(r.scraped_at) ?? new Date();
    const res = await sql`
      INSERT INTO news_items
        (id, source, title, url, summary, fetched_at, used, editorial_score, money)
      VALUES
        (${r.id}, ${r.source ?? "unknown"}, ${r.title}, ${r.url},
         ${r.summary ?? null}, ${fetched}, ${r.used ?? 0},
         ${r.editorial_score ?? 0}, ${r.money_formatted ?? null})
      ON CONFLICT DO NOTHING
      RETURNING id
    `;
    if (res.length) inserted++;
    else skipped++;
  }
  await sql`SELECT setval(pg_get_serial_sequence('news_items', 'id'), COALESCE((SELECT MAX(id) FROM news_items), 1))`;
  console.log(`[news_items] ${inserted} inserted, ${skipped} skipped`);
}

async function migrateCarousels() {
  const rows = sqlite.prepare("SELECT * FROM carousels ORDER BY id").all() as LegacyCarousel[];
  let inserted = 0;
  let skipped = 0;
  for (const r of rows) {
    const slidesContent = safeJSON<MapSlideRow[]>(r.slides_content, []);
    const slides = mapSlides(slidesContent);
    const angleOptions = safeJSON<MapAngleOption[]>(r.angle_options, []);
    const candidates = angleOptions.map((a) => mapAngle(a)).filter(Boolean);
    const angle =
      r.selected_angle != null && angleOptions[r.selected_angle]
        ? mapAngle(angleOptions[r.selected_angle])
        : null;
    const slidePngs = safeJSON<string[]>(r.slide_pngs, []);
    const renderedPaths = slidePngs
      .filter((p) => typeof p === "string")
      .map((p) => p.replace(/^\/+/, ""));
    const renderedAt = renderedPaths.length ? toDate(r.updated_at) : null;
    const status = mapStatus(r.status);

    const res = await sql`
      INSERT INTO carousels
        (id, title, status, slides, caption, angle, candidate_angles,
         scheduled_at, publer_post_id, publer_post_url, published_at,
         rendered_at, rendered_paths, render_format, source_news_ids,
         error, created_at, updated_at)
      VALUES
        (${r.id},
         ${slides[0]?.title ?? null},
         ${status},
         ${sql.json(slides)},
         ${r.caption ?? null},
         ${angle ? sql.json(angle) : null},
         ${sql.json(candidates)},
         ${toDate(r.scheduled_at)},
         ${r.publer_post_id ?? null},
         ${r.ig_post_url ?? null},
         ${toDate(r.published_at)},
         ${renderedAt},
         ${sql.json(renderedPaths)},
         ${r.format ?? "4:5"},
         ${sql.json(r.news_item_id ? [r.news_item_id] : [])},
         ${r.error_log ?? null},
         ${toDate(r.created_at) ?? new Date()},
         ${toDate(r.updated_at) ?? new Date()})
      ON CONFLICT DO NOTHING
      RETURNING id
    `;
    if (res.length) inserted++;
    else skipped++;
  }
  await sql`SELECT setval(pg_get_serial_sequence('carousels', 'id'), COALESCE((SELECT MAX(id) FROM carousels), 1))`;
  console.log(`[carousels] ${inserted} inserted, ${skipped} skipped`);
}

interface BankFile {
  abs: string;
  filename: string;
  status: "done" | "fail" | "raw" | "generic";
  source: "pinterest" | "upload_generic" | "upload_raw";
  destSubdir: "done" | "fail" | "raw" | "generic";
}

function listBankFiles(): BankFile[] {
  const out: BankFile[] = [];
  const map: { sub: string; status: BankFile["status"]; source: BankFile["source"]; dest: BankFile["destSubdir"] }[] = [
    { sub: "raw/_done", status: "done", source: "pinterest", dest: "done" },
    { sub: "raw/_fail", status: "fail", source: "pinterest", dest: "fail" },
    { sub: "raw", status: "raw", source: "pinterest", dest: "raw" },
    { sub: "generic", status: "generic", source: "upload_generic", dest: "generic" },
  ];
  for (const m of map) {
    const dir = path.join(legacyBank, m.sub);
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      const abs = path.join(dir, name);
      let st;
      try {
        st = fs.statSync(abs);
      } catch {
        continue;
      }
      if (!st.isFile()) continue;
      out.push({ abs, filename: name, status: m.status, source: m.source, destSubdir: m.dest });
    }
  }
  return out;
}

async function migrateImages() {
  const bankAssets = sqlite.prepare("SELECT filename, width, height, tags_auto, tags_manual FROM bank_assets").all() as LegacyBankAsset[];
  const meta = new Map<string, LegacyBankAsset>();
  for (const a of bankAssets) meta.set(a.filename, a);

  const files = listBankFiles();
  console.log(`[images] scanning ${files.length} files…`);
  let inserted = 0;
  let skippedDup = 0;
  let copied = 0;
  let copyErrors = 0;

  for (const f of files) {
    let hash: string;
    try {
      hash = sha256(f.abs);
    } catch (err) {
      console.warn(`[images] sha256 failed for ${f.abs}: ${(err as Error).message}`);
      copyErrors++;
      continue;
    }

    const dest = path.join(TARGET_BANK, f.destSubdir, f.filename);
    if (!fs.existsSync(dest)) {
      try {
        fs.copyFileSync(f.abs, dest);
        copied++;
      } catch (err) {
        console.warn(`[images] copy failed for ${f.filename}: ${(err as Error).message}`);
        copyErrors++;
        continue;
      }
    }

    const m = meta.get(f.filename);
    const tagsAuto = safeJSON<string[]>(m?.tags_auto ?? null, []);
    const tagsManual = safeJSON<string[]>(m?.tags_manual ?? null, []);
    const tags = Array.from(new Set([...tagsAuto, ...tagsManual]));
    const storageKey = `${f.destSubdir}/${f.filename}`;

    const res = await sql`
      INSERT INTO images
        (filename, storage_key, status, source, hash, width, height, tags)
      VALUES
        (${f.filename}, ${storageKey}, ${f.status}, ${f.source}, ${hash},
         ${m?.width ?? null}, ${m?.height ?? null}, ${sql.json(tags)})
      ON CONFLICT DO NOTHING
      RETURNING id
    `;
    if (res.length) inserted++;
    else skippedDup++;
  }
  console.log(`[images] ${inserted} inserted, ${skippedDup} skipped (dup hash), ${copied} files copied, ${copyErrors} copy errors`);
}

async function migratePinterest() {
  const rows = sqlite.prepare("SELECT * FROM pinterest_assets ORDER BY id").all() as LegacyPinAsset[];
  let inserted = 0;
  let skipped = 0;
  for (const r of rows) {
    if (!r.worker_id || !r.url) {
      skipped++;
      continue;
    }
    const res = await sql`
      INSERT INTO pinterest_assets
        (worker_id, url, pin_url, source, action, swiped_at, filename, downloaded_at, synced_at, error)
      VALUES
        (${r.worker_id}, ${r.url}, ${r.pin_url ?? null}, ${r.source ?? null},
         ${r.action ?? "kept"}, ${toDate(r.swiped_at)}, ${r.filename ?? null},
         ${toDate(r.downloaded_at)}, ${toDate(r.synced_at) ?? new Date()},
         ${r.error ?? null})
      ON CONFLICT DO NOTHING
      RETURNING id
    `;
    if (res.length) inserted++;
    else skipped++;
  }
  console.log(`[pinterest_assets] ${inserted} inserted, ${skipped} skipped`);
}

async function main() {
  await migrateNews();
  await migrateCarousels();
  await migrateImages();
  await migratePinterest();
  console.log("[migrate] done.");
}

main()
  .catch((err) => {
    console.error("[migrate] failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    sqlite.close();
    await sql.end({ timeout: 5 });
  });
