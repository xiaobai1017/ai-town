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
    const candidates: Array<{ type?: string; location?: string }> = Array.isArray(context?.candidates) ? context.candidates : [];
    const availableTypes = new Set<string>(candidates
      .map((candidate: { type?: string }) => candidate.type)
      .filter((type): type is string => Boolean(type)));
    const descriptions: Record<string, string> = {
      WORK: 'Work to earn money for future safe charm growth.',
      EAT: 'Eat now when hunger is too high; health comes first.',
      SLEEP: 'Sleep and recover when it is the safest option.',
      SHOP: 'Shop at the Mall to gain charm quickly, only when health and hunger floors are safe.',
      LIBRARY: 'Read at the Library for slower charm growth with no money cost; hunger rises more than at the Mall.',
      TREAT: 'Recover health at the Hospital when below the health floor.',
      BANK: 'Get money or a loan when resources are insufficient for safe needs.',
      WANDER: 'Move locally when needs are satisfied and no higher-value action is available.',
      WAIT: 'Wait briefly when no useful safe action is available.'
    };
    const criteria = Object.fromEntries([...availableTypes].map(type => [type, descriptions[type] || 'A safe available action.']));
    const result = await client.systemOne({
      state: context,
      questions: {
        action: choice('Choose one available candidate. Hard constraint: keep health at or above objective.healthFloor and hunger at or below objective.hungerCeiling. Subject to that constraint, maximize charm as quickly as possible; use SHOP when it is available and safe.', criteria)
      }
    });
    const type = result.answers.action.choice;
    if (!availableTypes.has(type)) {
      return NextResponse.json({ error: 'JEV selected an unavailable action' }, { status: 502 });
    }
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
