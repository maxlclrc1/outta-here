import { planPreview } from '@/lib/planCard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

// A shared plan link: /p/<plan>?k=<invite key>. Link previews (WhatsApp, iMessage, Slack) read the card
// tags here; people are sent straight on to the plan in the app (/#plan.key), where joining works as before.
export async function GET(req: Request, { params }: Ctx) {
  const id = (await params).id, url = new URL(req.url), key = url.searchParams.get('k') || '';
  const origin = `${req.headers.get('x-forwarded-proto') || url.protocol.replace(':', '')}://${req.headers.get('x-forwarded-host') || req.headers.get('host') || url.host}`;
  const p = planPreview(id, key), safeId = /^[a-z0-9]{6,20}$/.test(id) ? id : '', safeKey = /^[a-z0-9]{4,12}$/.test(key) ? key : '';
  const to = safeId ? `/#${safeId}${safeKey ? '.' + safeKey : ''}` : '/';
  const title = p ? `${p.name} · ${p.kind}` : 'You’re invited on Outta/Here';
  const desc = p ? `${p.line} · ${p.going ? `${p.going} going. ` : ''}Tap to say if you’re in.` : 'Plans with your friends, decided together.';
  const img = p ? `${origin}/p/${safeId}/card?k=${safeKey}` : '';
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta property="og:type" content="website"><meta property="og:site_name" content="Outta/Here">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(origin + url.pathname + url.search)}">
${img ? `<meta property="og:image" content="${esc(img)}"><meta property="og:image:type" content="image/png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image">` : ''}
<meta http-equiv="refresh" content="0;url=${esc(to)}"><script>location.replace(${JSON.stringify(to)})</script>
</head><body style="background:#0B0A10;color:#fff;font-family:system-ui"><a href="${esc(to)}" style="color:#fff">Open the plan</a></body></html>`;
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}
