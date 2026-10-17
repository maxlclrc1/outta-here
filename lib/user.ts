import { NextResponse } from 'next/server';
import { ID, owns } from '@/lib/identity';

// Who is asking. The browser says which id it is (x-outta-user, or ?u= on the live-update
// stream), and it only counts if the request also carries the secret cookie the server gave that
// browser for that id (lib/identity.ts). Anything else is treated as an anonymous visitor: they
// can open what a link opens, and can't change anything.
// This proves "the same browser as before", not who a person is: real accounts replace it before
// the app goes on the internet.
export function userOf(req: Request, claimed = req.headers.get('x-outta-user') || '') {
  return ID.test(claimed) && owns(req, claimed) ? claimed : 'anonymous';
}
/** True if an id was given but this browser can't prove it owns it. */
export function unverified(req: Request, claimed = req.headers.get('x-outta-user') || '') {
  return !!claimed && userOf(req, claimed) === 'anonymous';
}
export const UNVERIFIED = { code: 'unauthenticated', message: 'This browser can’t prove who you are, so nothing was changed. Reload the page; if it keeps happening, ask whoever runs the app for a sign-in link.' };

// Requests that change something must come from the app's own pages: browsers mark requests
// from other sites (Sec-Fetch-Site, Origin), and those are refused. Requests with neither header
// don't come from a web page (scripts, tests) and can't carry a browser's cookies by accident.
export function crossSite(req: Request) {
  const site = req.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'none') return true;
  const origin = req.headers.get('origin');
  if (!origin) return false;
  try { return new URL(origin).host !== req.headers.get('host'); } catch { return true; }
}
export const CROSS_SITE = { code: 'permission_denied', message: 'Requests from other sites aren’t allowed.' };

/** For routes that change something: a refusal to send back, or null to go ahead. */
export function guard(req: Request, claimed?: string) {
  if (crossSite(req)) return NextResponse.json(CROSS_SITE, { status: 403 });
  if (unverified(req, claimed)) return NextResponse.json(UNVERIFIED, { status: 401 });
  return null;
}
