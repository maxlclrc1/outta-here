import Anthropic from '@anthropic-ai/sdk';

export const AI_MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-5-5';

let client: Anthropic | null = null;
export function aiClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  client ||= new Anthropic();
  return client;
}

export const SYSTEM = `You are the AI inside Outta Here, an app that helps friend groups plan and run trips together.
Be specific and realistic: name real, well-known places, give honest typical price ranges, and say when something is an estimate.
When the request asks for JSON, reply with only the JSON value, no prose around it.`;
