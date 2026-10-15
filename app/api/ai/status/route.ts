import { NextResponse } from 'next/server';
import { aiClient, AI_MODEL } from '@/lib/ai';

export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json({ enabled: !!aiClient(), model: AI_MODEL });
}
