import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "rush-web",
    time: new Date().toISOString(),
  });
}
