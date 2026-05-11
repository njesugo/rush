import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDb, users } from "@rush/db";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const profileSchema = z.object({
  name: z.string().trim().max(120).nullable().optional(),
  email: z.string().trim().email(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = profileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid", details: parsed.error.flatten() }, { status: 400 });
  }

  const db = getDb();
  const me = await db.select().from(users).where(eq(users.email, session.user.email)).limit(1);
  if (!me[0]) return NextResponse.json({ error: "not_found" }, { status: 404 });

  if (parsed.data.email !== session.user.email) {
    const taken = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.email, parsed.data.email), ne(users.id, me[0].id)))
      .limit(1);
    if (taken.length) return NextResponse.json({ error: "email_taken" }, { status: 409 });
  }

  await db
    .update(users)
    .set({ name: parsed.data.name ?? null, email: parsed.data.email })
    .where(eq(users.id, me[0].id));

  return NextResponse.json({ ok: true });
}
