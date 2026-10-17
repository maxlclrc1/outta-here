import { onChange } from '@/lib/store';
import { notifiable } from '@/lib/access';
import { unverified, UNVERIFIED, userOf } from '@/lib/user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Server-sent events: tells every open browser which document path changed,
// so its subscriptions re-read just what they need. Each tab only hears about plans and
// crews it's in, so plan ids aren't broadcast to everyone.
export async function GET(req: Request) {
  // the id in ?u= only counts with this browser's cookie for it (lib/identity.ts)
  const u = new URL(req.url).searchParams.get('u') || '';
  if (unverified(req, u)) return Response.json(UNVERIFIED, { status: 401 });
  const user = userOf(req, u);
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
