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
  const body = (await request.json()) as JevRequestBody;
  const jevConfig = body.jevConfig;
  const context: JevDecisionContext = body.context || (body as JevDecisionContext);

  if (!isJevConfigured(jevConfig)) {
    return NextResponse.json({ error: 'JEV is not configured (API key missing)' }, { status: 503 });
  }

  const action = await callJev(context, jevConfig);
  if (!action) {
    return NextResponse.json({ error: 'JEV request failed' }, { status: 502 });
  }
  return NextResponse.json(action);
}
