import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import { aiClient, AI_MODEL, SYSTEM } from '@/lib/ai';
import { inTrip } from '@/lib/access';
import { hiddenNeedsText } from '@/lib/privacy';
import { userOf } from '@/lib/user';
import { allow, enter, retryAfter } from '@/lib/limits';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type Turn = { role: 'user' | 'assistant'; content: string };
const fail = (code: string, message: string, status: number) => NextResponse.json({ code, message }, { status });

// AI requests: only from someone in the plan they're for, small enough, and not too often.
// Checked before the key is used, so nothing reaches Claude unless it passes.
const LIMITS = { bodyBytes: 128 * 1024, promptChars: 64 * 1024, turns: 20, perMinute: 6, perHour: 40, planPerHour: 120, atOnce: 2 };

export async function POST(req: Request) {
  if (Number(req.headers.get('content-length') || 0) > LIMITS.bodyBytes) return fail('prompt_too_large', 'That request is too large.', 413);
  let raw: string;
  try { raw = await req.text(); } catch { return fail('invalid_request', 'Couldn’t read the request.', 400); }
  if (raw.length > LIMITS.bodyBytes) return fail('prompt_too_large', 'That request is too large.', 413);
  let body: { input?: unknown; tid?: unknown };
  try { body = JSON.parse(raw); } catch { return fail('invalid_request', 'Body must be JSON', 400); }
  if (!body || typeof body !== 'object') return fail('invalid_request', 'Body must be a JSON object', 400);
  const { input, tid } = body;
  const messages = (typeof input === 'string' ? [{ role: 'user', content: input }] : input) as Turn[];
  if (!Array.isArray(messages) || !messages.length || messages.length > LIMITS.turns || messages.some((m) => !m || typeof m.content !== 'string' || !m.content.trim() || !['user', 'assistant'].includes(m.role))) {
    return fail('invalid_request', `input must be a non-empty string or up to ${LIMITS.turns} user/assistant turns`, 400);
  }
  if (messages.reduce((n, m) => n + m.content.length, 0) > LIMITS.promptChars) return fail('prompt_too_large', 'That request is too large.', 413);

  // every AI feature belongs to a plan: you have to be in it
  const user = userOf(req);
  if (typeof tid !== 'string' || !/^[A-Za-z0-9_\-]{4,40}$/.test(tid)) return fail('invalid_request', 'Say which plan this is for (tid).', 400);
  if (!inTrip(tid, user)) return fail('permission_denied', 'AI picks only work inside a plan you’re in.', 403);

  for (const [key, max, ms] of [[`ai:u:${user}`, LIMITS.perMinute, 6e4], [`ai:u1h:${user}`, LIMITS.perHour, 36e5], [`ai:p:${tid}`, LIMITS.planPerHour, 36e5]] as [string, number, number][]) {
    if (!allow(key, max, ms)) return NextResponse.json({ code: 'rate_limited', message: 'Too many AI requests. Give it a minute.' }, { status: 429, headers: { 'Retry-After': String(retryAfter(key, ms)) } });
  }
  const done = enter(`ai:run:${user}`, LIMITS.atOnce);
  if (!done) return NextResponse.json({ code: 'rate_limited', message: 'Wait for your other AI request to finish.' }, { status: 429, headers: { 'Retry-After': '5' } });

  try {
    const client = aiClient();
    if (!client) return fail('sampling_disabled', 'AI is off. Add ANTHROPIC_API_KEY to .env.local and restart.', 503);
    // needs some members shared only with organizers: added here, unnamed, so the AI plans
    // around them without them ever reaching this person's browser
    const extra = hiddenNeedsText(tid, user), last = messages[messages.length - 1];
    if (extra && last.role === 'user') messages[messages.length - 1] = { ...last, content: last.content + '\n\n' + extra };
    return await ask(client, messages);
  } finally { done(); }
}

async function ask(client: Anthropic, messages: Turn[]) {
  try {
    // Server-side fallbacks retry on another model if this one declines a request.
    const stream = client.beta.messages.stream({
      model: AI_MODEL,
      max_tokens: 16000,
      system: SYSTEM,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      messages,
    });
    const message = await stream.finalMessage();
    if (message.stop_reason === 'refusal') return fail('refused', 'Claude declined this request.', 422);
    const text = message.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
    return NextResponse.json({ text, truncated: message.stop_reason === 'max_tokens', model: message.model });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return fail('not_granted', 'Your Anthropic API key was rejected. Check ANTHROPIC_API_KEY in .env.local.', 401);
    if (e instanceof Anthropic.RateLimitError) return fail('rate_limited', 'Too many AI requests at once. Try again in a minute.', 429);
    if (e instanceof Anthropic.APIConnectionError) return fail('upstream_error', 'Could not reach the Claude API. Check your internet connection.', 502);
    if (e instanceof Anthropic.APIError) {
      console.error('Claude API error', e.status);
      return fail('upstream_error', e.message, 502);
    }
    console.error('AI request failed', e instanceof Error ? e.name : 'error');
    return fail('upstream_error', 'AI request failed', 500);
  }
}
