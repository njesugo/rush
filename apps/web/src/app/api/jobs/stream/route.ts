import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { getRedisSubscriber, JOB_EVENTS_CHANNEL } from "@rush/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<Response> {
  const session = await auth();
  if (!session) return new Response("unauthorized", { status: 401 });

  const encoder = new TextEncoder();
  const sub = getRedisSubscriber().duplicate();
  await sub.subscribe(JOB_EVENTS_CHANNEL);

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: string, event?: string) => {
        try {
          if (event) controller.enqueue(encoder.encode(`event: ${event}\n`));
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        } catch {
          /* closed */
        }
      };

      send(JSON.stringify({ type: "ready", at: Date.now() }), "ready");

      sub.on("message", (_chan, msg) => send(msg));

      const ping = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping ${Date.now()}\n\n`));
        } catch {
          /* closed */
        }
      }, 25_000);

      const cleanup = () => {
        clearInterval(ping);
        sub.unsubscribe(JOB_EVENTS_CHANNEL).catch(() => {});
        sub.quit().catch(() => {});
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      req.signal.addEventListener("abort", cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
