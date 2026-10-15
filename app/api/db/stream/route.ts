import { onChange } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Server-sent events: tells every open browser which document path changed,
// so its subscriptions re-read just what they need.
export async function GET(req: Request) {
  const enc = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const send = (s: string) => {
        try { controller.enqueue(enc.encode(s)); } catch { cleanup(); }
      };
      send('retry: 2000\n\n');
      const off = onChange((p) => send(`data: ${JSON.stringify({ path: p })}\n\n`));
      const ping = setInterval(() => send(': ping\n\n'), 25000);
      cleanup = () => { off(); clearInterval(ping); };
      req.signal.addEventListener('abort', () => { cleanup(); try { controller.close(); } catch {} });
    },
    cancel() { cleanup(); },
  });
  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' },
  });
}
