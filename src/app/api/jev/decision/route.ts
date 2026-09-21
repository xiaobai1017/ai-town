import { NextResponse } from 'next/server';
import { callJev, isJevConfigured } from '@/ai/jevDecisionCore';
import { parseJevAction } from '@/ai/JevDecisionProvider';
import type { JevDecisionContext } from '@/ai/JevDecisionProvider';

export async function POST(request: Request) {
  if (!isJevConfigured()) {
    return NextResponse.json({ error: 'JEV is not configured' }, { status: 503 });
  }

  const context = (await request.json()) as JevDecisionContext;
  const action = await callJev(context);
  if (!action) {
    return NextResponse.json({ error: 'JEV request failed' }, { status: 502 });
  }
  return NextResponse.json(action);
}
