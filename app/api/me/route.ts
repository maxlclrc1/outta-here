import { NextResponse } from 'next/server';
import { claimId, claimWithCode, cookieName, ownedIds } from '@/lib/identity';
import { crossSite, CROSS_SITE } from '@/lib/user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The browser's identity (lib/identity.ts).
//   GET  → { ids }: the ids this browser's cookies prove it owns
//   POST { id }   → use this id: fine if this browser owns it or it's brand new (sets the cookie)
//   POST { code } → open a one-time sign-in link from scripts/claim-link.mjs (sets the cookie)
// The secret only ever travels in the HttpOnly cookie; responses never include it.

// Secure (sent only over https) whenever the request came over https, and always in production
// unless OUTTA_INSECURE_COOKIES is exactly 1 or true (for running on plain http on your Wi-Fi):
// any other value, like 0 or false, keeps it on.
const insecureOk = () => ['1', 'true'].includes(String(process.env.OUTTA_INSECURE_COOKIES || '').trim().toLowerCase());
const secure = (req: Request) => new URL(req.url).protocol === 'https:' || req.headers.get('x-forwarded-proto') === 'https'
  || (process.env.NODE_ENV === 'production' && !insecureOk());
const cookie = (req: Request, id: string, secret: string) =>
  `${cookieName(id)}=${secret}; Path=/; HttpOnly; SameSite=Strict; Max-Age=315360000${secure(req) ? '; Secure' : ''}`;

export async function GET(req: Request) {
  return NextResponse.json({ ids: ownedIds(req) });
}

export async function POST(req: Request) {
  if (crossSite(req)) return NextResponse.json(CROSS_SITE, { status: 403 });
  // a JSON body can't be sent by a plain form from another site without the browser asking first
  if (!(req.headers.get('content-type') || '').startsWith('application/json')) return NextResponse.json({ code: 'invalid_argument', message: 'Send JSON.' }, { status: 415 });
  let body: { id?: unknown; code?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ code: 'invalid_argument', message: 'Body must be JSON' }, { status: 400 }); }
  const r = typeof body.code === 'string' ? claimWithCode(body.code) : claimId(req, typeof body.id === 'string' ? body.id : '');
  if (!r.ok) return NextResponse.json({ code: r.code, message: r.message }, { status: r.status });
  const res = NextResponse.json({ ok: true, id: r.id });
  if (r.secret) res.headers.append('Set-Cookie', cookie(req, r.id, r.secret));
  return res;
}
