import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { ingestUpload } from "@rush/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 25 * 1024 * 1024;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const form = await req.formData();
  const source = form.get("source");
  const files = form.getAll("files");

  if (source !== "upload_raw" && source !== "upload_generic") {
    return NextResponse.json({ error: "invalid source" }, { status: 400 });
  }
  if (files.length === 0) return NextResponse.json({ error: "no files" }, { status: 400 });

  const results: Array<{ filename: string; status: string; imageId?: number; error?: string }> = [];
  for (const f of files) {
    if (!(f instanceof File)) {
      results.push({ filename: "?", status: "error", error: "not a file" });
      continue;
    }
    if (f.size > MAX_BYTES) {
      results.push({ filename: f.name, status: "error", error: "file too large" });
      continue;
    }
    try {
      const buf = Buffer.from(await f.arrayBuffer());
      const res = await ingestUpload({ filename: f.name, buffer: buf, source });
      results.push({ filename: f.name, status: res.status, imageId: res.imageId });
    } catch (err) {
      results.push({
        filename: f.name,
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({ results });
}
