import { ImageResponse } from 'next/og';
import { planPreview } from '@/lib/planCard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

// The image on a shared plan's preview card (1200×630, a small PNG, which WhatsApp needs to show it):
// the plan's color, its name, what it is, where and when, and how many are going.
export async function GET(req: Request, { params }: Ctx) {
  const p = planPreview((await params).id, new URL(req.url).searchParams.get('k') || '');
  if (!p) return new Response('Not found', { status: 404 });
  return new ImageResponse(
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '64px 72px', color: '#fff', background: `linear-gradient(135deg, ${p.color}, #16131F)` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: 1 }}>OUTTA/HERE</div>
        <div style={{ display: 'flex', fontSize: 28, fontWeight: 700, padding: '10px 24px', borderRadius: 999, background: 'rgba(255,255,255,0.22)' }}>{p.kind}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ fontSize: p.name.length > 24 ? 76 : 96, fontWeight: 800, lineHeight: 1.02 }}>{p.name}</div>
        <div style={{ fontSize: 38, opacity: 0.92 }}>{p.line}</div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 34, fontWeight: 700 }}>{p.going ? `${p.going} going` : 'Be the first in'}</div>
        <div style={{ display: 'flex', fontSize: 34, fontWeight: 800, padding: '18px 36px', borderRadius: 22, background: '#fff', color: '#16131F' }}>Tap to join →</div>
      </div>
    </div>,
    { width: 1200, height: 630, headers: { 'cache-control': 'public, max-age=300' } },
  );
}
