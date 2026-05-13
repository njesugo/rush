import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import archiver from "archiver";
import { Readable } from "node:stream";
import { auth } from "@/lib/auth";
import { getDb, reels, type ReelBlock } from "@rush/db";
import { downloadObject } from "@rush/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function buildScriptMd(args: {
  title: string | null;
  angle: string;
  hook: string;
  blocks: ReelBlock[];
}): string {
  const { title, angle, hook, blocks } = args;
  const lines: string[] = [];
  lines.push(`# ${title?.trim() || "Reel"}`);
  lines.push("");
  lines.push(`**Angle :** ${angle}`);
  lines.push("");
  lines.push(`## Hook`);
  lines.push(hook);
  lines.push("");
  blocks.forEach((b, i) => {
    lines.push(`## Block ${i + 1} — ${b.est_duration_s.toFixed(1)}s`);
    lines.push(b.script);
    if (b.broll) {
      lines.push("");
      lines.push(
        `> B-roll: ${b.broll.in_s.toFixed(1)}s → ${b.broll.out_s.toFixed(1)}s` +
          (b.broll.reason ? ` — ${b.broll.reason}` : "")
      );
    }
    lines.push("");
  });
  return lines.join("\n");
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
): Promise<Response> {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const reelId = Number(id);
  if (!Number.isFinite(reelId)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  const db = getDb();
  const rows = await db.select().from(reels).where(eq(reels.id, reelId)).limit(1);
  const reel = rows[0];
  if (!reel) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!reel.storyboard) {
    return NextResponse.json({ error: "no storyboard" }, { status: 409 });
  }

  const archive = archiver("zip", { zlib: { level: 9 } });
  // Convert archiver (Node stream) to Web ReadableStream for the Response.
  const nodeStream: Readable = archive as unknown as Readable;

  // Kick off async work feeding the archive.
  void (async () => {
    try {
      archive.append(
        buildScriptMd({
          title: reel.title,
          angle: reel.angle,
          hook: reel.storyboard!.hook,
          blocks: reel.storyboard!.blocks,
        }),
        { name: "script.md" }
      );
      archive.append(JSON.stringify(reel.storyboard, null, 2), { name: "storyboard.json" });

      const keys = (reel.brollKeys ?? []) as Array<string | null>;
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        if (!key) continue;
        try {
          const buf = await downloadObject(key);
          archive.append(buf, { name: `block-${i + 1}.mp4` });
        } catch (err) {
          // Skip missing block, embed an error note.
          archive.append(
            `Failed to fetch ${key}: ${(err as Error).message}`,
            { name: `block-${i + 1}.error.txt` }
          );
        }
      }
      await archive.finalize();
    } catch (err) {
      archive.abort();
      console.error("export-zip failed", err);
    }
  })();

  const filename = `reel-${reelId}.zip`;
  return new Response(nodeStream as unknown as ReadableStream, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
