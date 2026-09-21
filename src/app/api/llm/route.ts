/**
 * 大语言模型通用调用代理路由，适配 Ollama 原生与 OpenAI 兼容格式
 * @author hubin
 */

import { NextResponse } from 'next/server';
import type { LLMConfig } from '@/lib/modelSettings';
import { callLLM } from '@/lib/llmCore';

interface LLMRequestBody {
  prompt: string;
  config?: Partial<LLMConfig>;
  model?: string;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as LLMRequestBody;
    const prompt = body.prompt;

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    const provider = body.config?.provider || 'ollama';
    const baseUrl = (body.config?.baseUrl || process.env.NEXT_PUBLIC_LLM_ENDPOINT || 'http://localhost:11434/api/generate').trim();
    const apiKey = (body.config?.apiKey || process.env.NEXT_PUBLIC_LLM_API_KEY || '').trim();
    const model = (body.model || body.config?.model || process.env.NEXT_PUBLIC_LLM_MODEL || 'qwen3:0.6b').trim();
    const temperature = typeof body.config?.temperature === 'number' ? body.config.temperature : 0.4;

    const fullConfig: LLMConfig = {
      provider,
      baseUrl,
      apiKey,
      model,
      temperature,
    };

    const res = await callLLM(prompt, fullConfig);

    if (res.error) {
      return NextResponse.json(
        { error: res.error },
        { status: 502 }
      );
    }

    return NextResponse.json({
      text: res.text,
      model,
      provider,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Internal error' },
      { status: 500 }
    );
  }
}
