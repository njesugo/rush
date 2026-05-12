import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  jsonb,
  pgEnum,
  uniqueIndex,
  index,
  real,
  primaryKey,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { AdapterAccountType } from "next-auth/adapters";

/* ----------- Enums ----------- */
export const carouselStatusEnum = pgEnum("carousel_status", [
  "draft",
  "ready",
  "scheduled",
  "published",
  "failed",
]);

export const imageStatusEnum = pgEnum("image_status", [
  "raw",
  "processing",
  "generic",
  "review_pending",
  "review_kept",
  "review_skipped",
  "done",
  "fail",
]);

export const imageSourceEnum = pgEnum("image_source", [
  "pinterest",
  "upload_raw",
  "upload_generic",
]);

export const jobStatusEnum = pgEnum("job_status", [
  "waiting",
  "active",
  "completed",
  "failed",
  "delayed",
]);

/* ----------- Auth ----------- */
export const users = pgTable("users", {
  id: text("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("email_verified", { mode: "date" }),
  image: text("image"),
  passwordHash: text("password_hash"),
  name: text("name"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/* NextAuth (Drizzle adapter) — JWT strategy now, OAuth-ready later */
export const accounts = pgTable(
  "accounts",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.provider, t.providerAccountId] }),
  })
);

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.identifier, t.token] }),
  })
);

/* ----------- Carousels ----------- */
export interface CarouselSlide {
  slide_number: number;
  type: "hook" | "content" | "outro";
  title: string;
  body: string | null;
  /** Phrase clé résumant l'idée de la slide (surlignée en bleu, gras italique). Pour les slides de type "content" uniquement. */
  highlight?: string | null;
  /** storageKey (chemin relatif dans BANK_DIR) de l'image fixée sur cette slide. Si null/absent, une image aléatoire est tirée au rendu. */
  imageStorageKey?: string | null;
}

export interface CarouselAngle {
  angle_title: string;
  angle_type: string;
  angle_description: string;
}

export const carousels = pgTable(
  "carousels",
  {
    id: serial("id").primaryKey(),
    title: text("title"),
    status: carouselStatusEnum("status").default("draft").notNull(),
    slides: jsonb("slides").$type<CarouselSlide[]>().default([]).notNull(),
    caption: text("caption"),
    angle: jsonb("angle").$type<CarouselAngle | null>(),
    candidateAngles: jsonb("candidate_angles").$type<CarouselAngle[]>().default([]),
    scheduledAt: timestamp("scheduled_at"),
    publerJobId: text("publer_job_id"),
    publerPostId: text("publer_post_id"),
    publerPostUrl: text("publer_post_url"),
    publishedAt: timestamp("published_at"),
    renderedAt: timestamp("rendered_at"),
    renderedPaths: jsonb("rendered_paths").$type<string[]>().default([]),
    renderFormat: text("render_format").default("4:5"),
    sourceNewsIds: jsonb("source_news_ids").$type<number[]>().default([]),
    error: text("error"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    statusIdx: index("carousels_status_idx").on(t.status),
    scheduledIdx: index("carousels_scheduled_idx").on(t.scheduledAt),
  })
);

/* ----------- Hooks templates (future feature) ----------- */
export const hooks = pgTable("hooks", {
  id: serial("id").primaryKey(),
  template: text("template").notNull(),
  category: text("category"),
  performanceScore: real("performance_score").default(0),
  usedCount: integer("used_count").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/* ----------- News ----------- */
export const newsItems = pgTable(
  "news_items",
  {
    id: serial("id").primaryKey(),
    source: text("source").notNull(),
    title: text("title").notNull(),
    url: text("url").notNull(),
    summary: text("summary"),
    fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
    publishedAt: timestamp("published_at"),
    used: integer("used").default(0).notNull(),
    region: text("region"), // 'FR/EU' | 'US/AFRICA' | 'OTHER'
    geoScore: real("geo_score").default(0).notNull(),
    keywordScore: real("keyword_score").default(0).notNull(),
    editorialScore: real("editorial_score").default(0).notNull(),
    finalScore: real("final_score").default(0).notNull(),
    money: text("money"), // formatted "600 M€"
  },
  (t) => ({
    urlUnique: uniqueIndex("news_url_unique").on(t.url),
    fetchedIdx: index("news_fetched_idx").on(t.fetchedAt),
    finalScoreIdx: index("news_final_score_idx").on(t.finalScore),
  })
);

/* ----------- Images ----------- */
export const images = pgTable(
  "images",
  {
    id: serial("id").primaryKey(),
    filename: text("filename").notNull(),
    storageKey: text("storage_key").notNull(), // path on disk or R2 key
    status: imageStatusEnum("status").default("raw").notNull(),
    source: imageSourceEnum("source").notNull(),
    hash: text("hash"), // sha256, dedupe
    width: integer("width"),
    height: integer("height"),
    tags: jsonb("tags").$type<string[]>().default([]),
    embedding: jsonb("embedding").$type<number[] | null>(), // future pgvector
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    hashUnique: uniqueIndex("images_hash_unique").on(t.hash),
    statusIdx: index("images_status_idx").on(t.status),
    sourceIdx: index("images_source_idx").on(t.source),
  })
);

/* ----------- Pinterest ----------- */
export const pinterestKeywords = pgTable("pinterest_keywords", {
  id: serial("id").primaryKey(),
  keyword: text("keyword").notNull().unique(),
  score: real("score").default(0).notNull(),
  source: text("source"), // 'manual' | 'auto' | 'news'
  lastUsedAt: timestamp("last_used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const pinterestSwipes = pgTable("pinterest_swipes", {
  id: serial("id").primaryKey(),
  imageId: integer("image_id").references(() => images.id),
  action: text("action").notNull(), // 'kept' | 'skipped' | 'redo_bg'
  mode: text("mode").notNull(), // 'discovery' | 'review'
  swipedAt: timestamp("swiped_at").defaultNow().notNull(),
});

/**
 * Assets pulled from the Cloudflare Pinterest swipe Worker.
 * One row per worker swipe (kept or skipped). For "kept" rows, `filename`
 * is set once the image has been downloaded into the local bank.
 */
export const pinterestAssets = pgTable(
  "pinterest_assets",
  {
    id: serial("id").primaryKey(),
    workerId: text("worker_id").notNull().unique(),
    url: text("url").notNull(),
    pinUrl: text("pin_url"),
    source: text("source"),
    action: text("action").notNull(), // 'kept' | 'skipped'
    swipedAt: timestamp("swiped_at"),
    filename: text("filename"),
    imageId: integer("image_id").references(() => images.id),
    downloadedAt: timestamp("downloaded_at"),
    syncedAt: timestamp("synced_at").defaultNow().notNull(),
    error: text("error"),
  },
  (t) => ({
    actionIdx: index("pinterest_assets_action_idx").on(t.action),
    filenameIdx: index("pinterest_assets_filename_idx").on(t.filename),
    sourceIdx: index("pinterest_assets_source_idx").on(t.source),
  })
);

/* ----------- Jobs (mirror BullMQ pour observabilité) ----------- */
export const jobsLog = pgTable(
  "jobs_log",
  {
    id: serial("id").primaryKey(),
    queueName: text("queue_name").notNull(),
    bullJobId: text("bull_job_id"),
    kind: text("kind").notNull(),
    status: jobStatusEnum("status").default("waiting").notNull(),
    payload: jsonb("payload"),
    attempts: integer("attempts").default(0).notNull(),
    error: text("error"),
    startedAt: timestamp("started_at"),
    finishedAt: timestamp("finished_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    statusIdx: index("jobs_status_idx").on(t.status),
    kindIdx: index("jobs_kind_idx").on(t.kind),
  })
);

/* ----------- App settings (KV preferences) ----------- */
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
