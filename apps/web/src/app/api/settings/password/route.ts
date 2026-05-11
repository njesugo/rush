import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDb, users } from "@rush/db";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  current: z.string().min(1),
  next: z.string().min(8).max(200),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid", details: parsed.error.flatten() }, { status: 400 });
  }

  const db = getDb();
  const rows = await db.select().from(users).where(eq(users.email, session.user.email)).limit(1);
  const me = rows[0];
  if (!me || !me.passwordHash) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const ok = await bcrypt.compare(parsed.data.current, me.passwordHash);
  if (!ok) return NextResponse.json({ error: "wrong_password" }, { status: 403 });

  const hash = await bcrypt.hash(parsed.data.next, 10);
  await db.update(users).set({ passwordHash: hash }).where(eq(users.id, me.id));

  return NextResponse.json({ ok: true });
}
