import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDb, users } from "@rush/db";
import { eq } from "drizzle-orm";
import { getPrefs, listApiKeyStatuses } from "@rush/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const db = getDb();
  const rows = await db
    .select({ id: users.id, email: users.email, name: users.name, image: users.image })
    .from(users)
    .where(eq(users.email, session.user.email))
    .limit(1);
  const user = rows[0] ?? null;

  const [keys, prefs] = await Promise.all([
    Promise.resolve(listApiKeyStatuses()),
    getPrefs(),
  ]);

  return NextResponse.json({ user, keys, prefs });
}
