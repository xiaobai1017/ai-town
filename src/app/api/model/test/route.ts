/**
 * 大模型与 JEV 模型连通性测试接口
 * @author hubin
 */

import { NextResponse } from 'next/server';
import { TypeSafeClient, choice } from '@typesafe-ai/sdk';
import type { LLMConfig, JevConfig } from '@/lib/modelSettings';
import { callLLM } from '@/lib/llmCore';

interface TestRequestBody {
  type: 'llm' | 'jev';
  llmConfig?: LLMConfig;
  jevConfig?: JevConfig;
}

function sanitizeError(msg: string): string {
  if (!msg) return '未知异常';
  return msg
    .replace(/apikey_[a-zA-Z0-9_]+/gi, '[REDACTED_API_KEY]')
    .replace(/sk-[a-zA-Z0-9_-]+/gi, '[REDACTED_API_KEY]');
}

export async function POST(request: Request) {
  const startTime = Date.now();

  try {
    const body = (await request.json()) as TestRequestBody;

    if (body.type === 'llm') {
      const config = body.llmConfig;
      if (!config) {
        return NextResponse.json({ success: false, error: 'Missing LLM configuration' }, { status: 400 });
      }

      const provider = config.provider || 'ollama';
      const baseUrl = (config.baseUrl || '').trim();
      const apiKey = (config.apiKey || '').trim();
      const model = (config.model || '').trim();

      if (!baseUrl) {
        return NextResponse.json({ success: false, error: 'API 地址不能为空' });
      }
      if (!model) {
        return NextResponse.json({ success: false, error: '模型名称不能为空' });
      }
      if (provider === 'openai' && !apiKey) {
        return NextResponse.json({ success: false, error: 'OpenAI 协议通常需要填写 API Key' });
      }

      const res = await callLLM('Say "OK" in one word.', config);
      const latencyMs = Date.now() - startTime;

      if (res.error) {
        return NextResponse.json({
          success: false,
          latencyMs,
          error: sanitizeError(res.error),
        });
      }

      return NextResponse.json({
        success: true,
        latencyMs,
        sample: res.text || '连接成功 (模型返回空内容)',
      });
    }

    if (body.type === 'jev') {
      const config = body.jevConfig;
      if (!config) {
        return NextResponse.json({ success: false, error: 'Missing JEV configuration' }, { status: 400 });
      }

      const apiKey = (config.apiKey || process.env.TYPESAFE_API_KEY || process.env.JEV_API_KEY || '').trim();
      const baseURL = (config.baseUrl || process.env.TYPESAFE_BASE_URL || 'https://api.typesafe.ai').trim();
      const defaultModel = (config.model || process.env.TYPESAFE_DEFAULT_MODEL || 'jev-latest').trim();

      if (!apiKey) {
        return NextResponse.json({ success: false, error: 'JEV API Key 不能为空' });
      }

      const client = new TypeSafeClient({
        apiKey,
        baseURL: baseURL || undefined,
        defaultModel: defaultModel || undefined,
        timeout: 8000,
        retry: { maxRetries: 0 },
      });

      // 验证连接：简单探测
      try {
        await client.systemOne({
          state: { status: 'ping' },
          questions: {
            test: choice('Respond with YES for connectivity test.', { YES: 'Affirmative response' }),
          },
        });
      } catch (err: any) {
        const latencyMs = Date.now() - startTime;
        return NextResponse.json({
          success: false,
          latencyMs,
          error: sanitizeError(err.message || 'JEV 调用失败'),
        });
      }

      const latencyMs = Date.now() - startTime;
      return NextResponse.json({
        success: true,
        latencyMs,
        sample: 'JEV 决策模型连接正常',
      });
    }

    return NextResponse.json({ success: false, error: 'Unsupported test type' }, { status: 400 });
  } catch (error: any) {
    const latencyMs = Date.now() - startTime;
    return NextResponse.json({
      success: false,
      latencyMs,
      error: error.name === 'AbortError' ? '连接请求超时 (12s)' : sanitizeError(error.message || '网络连接异常'),
    });
  }
}
