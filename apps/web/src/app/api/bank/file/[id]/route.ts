import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getDb, images } from "@rush/db";
import { signedUrl } from "@rush/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  try {
    const url = await signedUrl(row.storageKey, 600);
    return NextResponse.redirect(url, { status: 307 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "signed url failed" },
      { status: 404 }
    );
  }
}
