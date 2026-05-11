import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getDb, images } from "@rush/db";
import { resolveStorage, BANK_DIR } from "@rush/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function mimeFor(ext: string): string {
  switch (ext.toLowerCase()) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const imageId = parseInt(id, 10);
  if (!Number.isFinite(imageId)) {
    return NextResponse.json({ error: "bad id" }, { status: 400 });
  }

  const db = getDb();
  const [row] = await db.select().from(images).where(eq(images.id, imageId)).limit(1);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  const abs = resolveStorage(row.storageKey);
  if (!abs.startsWith(BANK_DIR)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!fs.existsSync(abs)) {
    return NextResponse.json({ error: "file missing" }, { status: 404 });
  }

  const stat = fs.statSync(abs);
  const stream = fs.createReadStream(abs);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body = stream as any;

  return new Response(body, {
    headers: {
      "Content-Type": mimeFor(path.extname(abs)),
      "Content-Length": String(stat.size),
      "Cache-Control": "private, max-age=60",
    },
  });
}
