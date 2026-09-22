/**
 * JEV 行为决策接口路由
 * @author hubin
 */

import { NextResponse } from 'next/server';
import { callJev, isJevConfigured } from '@/ai/jevDecisionCore';
import type { JevDecisionContext } from '@/ai/JevDecisionProvider';
import type { JevConfig } from '@/lib/modelSettings';

interface JevRequestBody {
  context?: JevDecisionContext;
  jevConfig?: Partial<JevConfig>;
  // 兼容直接传入 JevDecisionContext 的旧调用方式
  agent?: any;
  world?: any;
  objective?: any;
  candidates?: any;
}

export async function POST(request: Request) {
  let body: JevRequestBody;
  try {
    body = (await request.json()) as JevRequestBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 });
  }
  const jevConfig = body.jevConfig;
  const context: JevDecisionContext = body.context || (body as JevDecisionContext);

  if (!isJevConfigured(jevConfig)) {
    return NextResponse.json({ error: 'JEV is not configured (API key missing)' }, { status: 503 });
  }

  let action: Awaited<ReturnType<typeof callJev>>;
  try {
    action = await callJev(context, jevConfig);
  } catch (error) {
    // callJev normally handles provider failures itself. Keep the route from
    // turning an unexpected provider exception into an unhandled rejection.
    console.error('[JEV] decision route failed:', error);
    return NextResponse.json({ error: 'JEV request failed' }, { status: 502 });
  }
  if (!action) {
    return NextResponse.json({ error: 'JEV request timed out or failed; use local fallback' }, { status: 504 });
  }
  return NextResponse.json(action);
}
