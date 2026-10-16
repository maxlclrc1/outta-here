import { onChange } from '@/lib/store';
import { notifiable } from '@/lib/access';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Server-sent events: tells every open browser which document path changed,
// so its subscriptions re-read just what they need. Each tab only hears about plans and
// crews it's in, so plan ids aren't broadcast to everyone.
export async function GET(req: Request) {
  const u = new URL(req.url).searchParams.get('u') || '';
  const user = /^[A-Za-z0-9_\-]{4,64}$/.test(u) ? u : 'anonymous';
  const enc = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const send = (s: string) => {
        try { controller.enqueue(enc.encode(s)); } catch { cleanup(); }
      };
      send('retry: 2000\n\n');
      const off = onChange((p) => { if (notifiable(p, user)) send(`data: ${JSON.stringify({ path: p })}\n\n`); });
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
