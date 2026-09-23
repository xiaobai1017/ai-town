/**
 * JEV 行为决策接口路由
 * @author hubin
 */

import { NextResponse } from 'next/server';
import { callJev, callJevBatch, isJevConfigured } from '@/ai/jevDecisionCore';
import type { JevDecisionContext } from '@/ai/JevDecisionProvider';
import type { JevConfig } from '@/lib/modelSettings';

interface JevRequestBody {
  context?: JevDecisionContext;
  contexts?: JevDecisionContext[];
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

  if (!isJevConfigured(jevConfig)) {
    return NextResponse.json({ error: 'JEV is not configured (API key missing)' }, { status: 503 });
  }

  // 1. 批量决策处理分支
  if (Array.isArray(body.contexts) && body.contexts.length > 0) {
    try {
      const resultsMap = await callJevBatch(body.contexts, jevConfig);
      return NextResponse.json({ results: Object.fromEntries(resultsMap.entries()) });
    } catch (error) {
      console.error('[JEV] batch decision route failed:', error);
      return NextResponse.json({ error: 'JEV batch request failed' }, { status: 502 });
    }
  }

  // 2. 单个决策处理分支（向后兼容）
  const context: JevDecisionContext = body.context || (body as JevDecisionContext);
  let action: Awaited<ReturnType<typeof callJev>>;
  try {
    action = await callJev(context, jevConfig);
  } catch (error) {
    console.error('[JEV] decision route failed:', error);
    return NextResponse.json({ error: 'JEV request failed' }, { status: 502 });
  }
  if (!action) {
    return NextResponse.json({ error: 'JEV request timed out or failed; use local fallback' }, { status: 504 });
  }
  return NextResponse.json(action);
}
