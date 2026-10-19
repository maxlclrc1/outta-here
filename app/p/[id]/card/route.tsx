import fs from 'node:fs';
import path from 'node:path';
import { ImageResponse } from 'next/og';
import { planPreviewByToken } from '@/lib/planCard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

// The app's own type, bundled (lib/fonts, SIL Open Font License), so the card never depends on the network.
let fonts: { name: string; data: Buffer; weight: 600 | 800 | 900; style: 'normal' }[] | null = null;
const loadFonts = () => fonts ??= [['Anybody', 'Anybody-Black-Condensed.ttf', 900], ['Figtree', 'Figtree-SemiBold.ttf', 600], ['Figtree', 'Figtree-ExtraBold.ttf', 800]]
  .map(([name, file, weight]) => ({ name: name as string, data: fs.readFileSync(path.join(process.cwd(), 'lib/fonts', file as string)), weight: weight as 600 | 800 | 900, style: 'normal' as const }));

// The image on a shared plan's preview card (1200×630 PNG, well under WhatsApp's size limit): the plan's
// color, who invited you, its name, when and where once decided (or what's being picked), how many are
// going, and the way in. No photo: nothing here pretends to show the place itself.
export async function GET(req: Request, { params }: Ctx) {
  const p = planPreviewByToken((await params).id, new URL(req.url).searchParams.get('t') || '');
  if (!p) return new Response('Not found', { status: 404 });
  const big = p.name.length <= 16 ? 124 : p.name.length <= 26 ? 100 : 78;
  const fact = (k: string, v: string) => <div style={{ display: 'flex', flexDirection: 'column', padding: '14px 24px', borderRadius: 22, background: 'rgba(255,255,255,0.16)', border: '2px solid rgba(255,255,255,0.28)' }}>
    <div style={{ fontFamily: 'Figtree', fontWeight: 800, fontSize: 20, letterSpacing: 3, opacity: 0.8 }}>{k}</div>
    <div style={{ fontFamily: 'Figtree', fontWeight: 800, fontSize: 36 }}>{v}</div></div>;
  return new ImageResponse(
    <div style={{ width: '100%', height: '100%', display: 'flex', position: 'relative', overflow: 'hidden', color: '#fff', fontFamily: 'Figtree', background: `linear-gradient(140deg, ${p.color} 0%, ${p.color} 30%, #17121F 100%)` }}>
      <div style={{ position: 'absolute', right: -170, top: -210, width: 620, height: 620, borderRadius: 999, background: 'rgba(255,255,255,0.10)' }} />
      <div style={{ position: 'absolute', right: 150, bottom: -190, width: 360, height: 360, borderRadius: 999, background: 'rgba(255,255,255,0.07)' }} />
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: '100%', padding: '54px 64px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontFamily: 'Anybody', fontWeight: 900, fontSize: 36, letterSpacing: 1 }}>OUTTA/HERE</div>
          <div style={{ display: 'flex', fontWeight: 800, fontSize: 26, padding: '10px 24px', borderRadius: 999, background: 'rgba(255,255,255,0.22)' }}>{p.kind}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontWeight: 600, fontSize: 34, opacity: 0.92 }}>{p.host ? `${p.host} invited you to` : 'You’re invited to'}</div>
          <div style={{ fontFamily: 'Anybody', fontWeight: 900, fontSize: big, lineHeight: 0.95, maxWidth: 1060 }}>{p.name}</div>
          <div style={{ display: 'flex', gap: 14, marginTop: 10 }}>
            {p.when ? fact('WHEN', p.when) : null}
            {p.place ? fact(p.small && !p.when ? 'IN' : 'WHERE', p.place) : null}
            {p.stage ? <div style={{ display: 'flex', alignItems: 'center', padding: '14px 24px', borderRadius: 22, border: '2px dashed rgba(255,255,255,0.55)', fontWeight: 800, fontSize: 30 }}>{p.stage}</div> : null}
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            {p.going ? <div style={{ display: 'flex' }}>{Array.from({ length: Math.min(p.going, 5) }, (_, i) => <div key={i} style={{ width: 46, height: 46, borderRadius: 999, background: '#fff', border: `5px solid ${p.color}`, marginLeft: i ? -14 : 0, opacity: 1 - i * 0.12 }} />)}</div> : null}
            <div style={{ fontWeight: 800, fontSize: 34 }}>{p.going > 1 ? `${p.going} going` : p.going === 1 ? `${p.host || 'One'} is in` : 'Be the first in'}</div>
          </div>
          <div style={{ display: 'flex', fontWeight: 800, fontSize: 32, padding: '20px 36px', borderRadius: 24, background: '#fff', color: '#17121F', boxShadow: '0 8px 0 rgba(0,0,0,0.28)' }}>Tap to say you’re in →</div>
        </div>
      </div>
    </div>,
    { width: 1200, height: 630, fonts: loadFonts(), headers: { 'cache-control': 'public, max-age=300' } },
  );
}
