import Anthropic from '@anthropic-ai/sdk';

export const AI_MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-5-5';

let client: Anthropic | null = null;
export function aiClient() {
  // OUTTA_AI_OFF: the test runner's server never calls the real API, even if a key is set
  if (!process.env.ANTHROPIC_API_KEY || process.env.OUTTA_AI_OFF) return null;
  client ||= new Anthropic();
  return client;
}

export const SYSTEM = `You are the AI inside Outta Here, an app that helps friend groups plan and run trips together.
Be specific and realistic: name real, well-known places, give honest typical price ranges, and say when something is an estimate.
When the request asks for JSON, reply with only the JSON value, no prose around it.`;
