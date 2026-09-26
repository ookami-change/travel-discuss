import { requireMember } from "@/lib/auth";
import { subscribe } from "@/lib/events";
import { route } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Server-sent events: pushes the names of changed scopes so clients can refetch. */
export const GET = route(async (req, ctx: RouteContext<"/api/trips/[id]/events">) => {
  const { id } = await ctx.params;
  await requireMember(id);
  const enc = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const send = (s: string) => {
        try {
          controller.enqueue(enc.encode(s));
        } catch {
          cleanup();
        }
      };
      send("retry: 3000\n\n");
      const unsubscribe = subscribe(id, (scopes) => send(`data: ${JSON.stringify(scopes)}\n\n`));
      const ping = setInterval(() => send(": ping\n\n"), 25_000);
      cleanup = () => {
        clearInterval(ping);
        unsubscribe();
      };
      req.signal.addEventListener("abort", () => {
        cleanup();
        try {
          controller.close();
        } catch {}
      });
    },
    cancel: () => cleanup(),
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
});
