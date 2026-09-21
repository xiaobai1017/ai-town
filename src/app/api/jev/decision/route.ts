import { NextResponse } from 'next/server';
import { choice, TypeSafeClient } from '@typesafe-ai/sdk';

const apiKey = process.env.TYPESAFE_API_KEY || process.env.JEV_API_KEY;
const client = apiKey
  ? new TypeSafeClient({ apiKey, defaultModel: process.env.TYPESAFE_DEFAULT_MODEL || 'jev-latest', timeout: 5000, retry: { maxRetries: 0 } })
  : null;

export async function POST(request: Request) {
  if (!client) {
    return NextResponse.json({ error: 'JEV is not configured' }, { status: 503 });
  }

  try {
    const context = await request.json();
    const result = await client.systemOne({
      state: context,
      questions: {
        action: choice('Which single next action is best for this resident? Choose only an action that is safe and present in candidates.', {
          WORK: 'Go to the work location and work.',
          EAT: 'Go to a food location and eat.',
          SLEEP: 'Go home and sleep.',
          SHOP: 'Go to the Mall and shop for charm.',
          TREAT: 'Go to the Hospital for treatment.',
          BANK: 'Go to the Bank for money or financial management.',
          WANDER: 'Wander to a nearby location.',
          WAIT: 'Wait and remain idle.'
        })
      }
    });
    const type = result.answers.action.choice;
    const candidate = context?.candidates?.find((item: { type?: string }) => item.type === type);
    return NextResponse.json({
      type,
      location: candidate?.location,
      reason: `Jev selected ${type} (confidence ${(result.answers.action.confidence * 100).toFixed(0)}%).`
    });
  } catch (error) {
    console.error('JEV decision failed:', error);
    return NextResponse.json({ error: 'JEV request failed' }, { status: 502 });
  }
}
