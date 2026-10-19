import fs from 'node:fs';
import path from 'node:path';
import { ImageResponse } from 'next/og';
import { planPreviewByToken } from '@/lib/planCard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

// The app's own type, bundled (lib/fonts, SIL Open Font License), so the card never depends on the network.
let fonts: { name: string; data: Buffer; weight: 800 | 900; style: 'normal' }[] | null = null;
const loadFonts = () => fonts ??= [['Anybody', 'Anybody-Black-Condensed.ttf', 900], ['Figtree', 'Figtree-ExtraBold.ttf', 800]]
  .map(([name, file, weight]) => ({ name: name as string, data: fs.readFileSync(path.join(process.cwd(), 'lib/fonts', file as string)), weight: weight as 800 | 900, style: 'normal' as const }));

// The picture on a shared plan's preview (1200×630 PNG, small enough for WhatsApp). It should feel like a
// friend dropped something exciting in the chat, not an ad: the plan's color, a huge ghosted mark (the
// days once they're set, a "?" while it's still "we doing this?"), the name, and one line, what's
// confirmed or who it's from. No photo, so nothing pretends to show the place; no buttons or badges,
// the message above it does the asking.
export async function GET(req: Request, { params }: Ctx) {
  const p = planPreviewByToken((await params).id, new URL(req.url).searchParams.get('t') || '');
  if (!p) return new Response('Not found', { status: 404 });
  const days = p.when.match(/\d+/g) || [], mark = days.length ? days.slice(0, 2).join('–') : '?';
  const line = [p.when, p.place].filter(Boolean).join(' · ') || (p.host ? `from ${p.host}` : '');
  const big = p.name.length <= 14 ? 150 : p.name.length <= 22 ? 124 : p.name.length <= 34 ? 100 : 80;
  return new ImageResponse(
    <div style={{ width: '100%', height: '100%', display: 'flex', position: 'relative', overflow: 'hidden', color: '#fff', background: `linear-gradient(160deg, ${p.color} 0%, ${p.color} 52%, #17121F 125%)` }}>
      <div style={{ position: 'absolute', right: -40, top: mark === '?' ? -150 : -90, display: 'flex', fontFamily: 'Anybody', fontWeight: 900, fontSize: mark === '?' ? 640 : mark.length > 3 ? 360 : 460, lineHeight: 1, color: 'rgba(255,255,255,0.16)', letterSpacing: -8 }}>{mark}</div>
      <div style={{ position: 'absolute', left: 64, top: 52, display: 'flex', fontFamily: 'Anybody', fontWeight: 900, fontSize: 28, letterSpacing: 1, opacity: 0.85 }}>OUTTA/HERE</div>
      <div style={{ position: 'absolute', left: 64, right: 64, bottom: 58, display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', fontFamily: 'Anybody', fontWeight: 900, fontSize: big, lineHeight: 0.92, letterSpacing: -1, maxWidth: 1040 }}>{p.name}</div>
        {line ? <div style={{ display: 'flex', fontFamily: 'Figtree', fontWeight: 800, fontSize: 38, opacity: 0.94 }}>{line}</div> : null}
      </div>
    </div>,
    { width: 1200, height: 630, fonts: loadFonts(), headers: { 'cache-control': 'public, max-age=300' } },
  );
}
