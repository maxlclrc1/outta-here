import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import { aiClient, AI_MODEL, SYSTEM } from '@/lib/ai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type Turn = { role: 'user' | 'assistant'; content: string };
const fail = (code: string, message: string, status: number) => NextResponse.json({ code, message }, { status });

export async function POST(req: Request) {
  const client = aiClient();
  if (!client) return fail('sampling_disabled', 'AI is off. Add ANTHROPIC_API_KEY to .env.local and restart.', 503);

  let input: string | Turn[];
  try {
    ({ input } = (await req.json()) as { input: string | Turn[] });
  } catch {
    return fail('invalid_request', 'Body must be JSON', 400);
  }
  const messages: Turn[] = typeof input === 'string' ? [{ role: 'user', content: input }] : input;
  if (!Array.isArray(messages) || !messages.length || messages.some((m) => typeof m?.content !== 'string' || !['user', 'assistant'].includes(m.role))) {
    return fail('invalid_request', 'input must be a string or a list of user/assistant turns', 400);
  }
  if (JSON.stringify(messages).length > 256 * 1024) return fail('prompt_too_large', 'Prompt is too large', 413);

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
      console.error('Claude API error', e.status, e.message);
      return fail('upstream_error', e.message, 502);
    }
    console.error(e);
    return fail('upstream_error', 'AI request failed', 500);
  }
}
