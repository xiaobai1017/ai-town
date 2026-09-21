/**
 * 大模型调用核心逻辑，支持服务端直接调用与协议适配（Ollama & OpenAI）
 * @author hubin
 */

import type { LLMConfig } from './modelSettings';

export interface LLMCallResult {
  text: string;
  error?: string;
}

/**
 * 核心 LLM 调用函数，可在 Node 服务端直接运行或被 API 路由调用
 */
export async function callLLM(prompt: string, config: LLMConfig): Promise<LLMCallResult> {
  const provider = config.provider || 'ollama';
  const baseUrl = (config.baseUrl || process.env.NEXT_PUBLIC_LLM_ENDPOINT || 'http://localhost:11434/api/generate').trim();
  const apiKey = (config.apiKey || process.env.NEXT_PUBLIC_LLM_API_KEY || '').trim();
  const model = (config.model || process.env.NEXT_PUBLIC_LLM_MODEL || 'qwen3:0.6b').trim();
  const temperature = typeof config.temperature === 'number' ? config.temperature : 0.4;

  let targetUrl = baseUrl;
  let requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  let requestPayload: any = {};

  if (provider === 'openai') {
    // 适配 OpenAI / DeepSeek / 兼容协议
    if (!targetUrl.includes('/chat/completions')) {
      const cleanBase = targetUrl.replace(/\/+$/, '');
      if (cleanBase.endsWith('/v1')) {
        targetUrl = `${cleanBase}/chat/completions`;
      } else {
        targetUrl = `${cleanBase}/v1/chat/completions`;
      }
    }

    if (apiKey) {
      requestHeaders['Authorization'] = `Bearer ${apiKey}`;
    }

    requestPayload = {
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature,
    };
  } else {
    // 适配 Ollama 原生协议
    if (!targetUrl.includes('/api/generate') && !targetUrl.includes('/api/chat')) {
      const cleanBase = targetUrl.replace(/\/+$/, '');
      targetUrl = `${cleanBase}/api/generate`;
    }

    if (apiKey) {
      requestHeaders['Authorization'] = `Bearer ${apiKey}`;
    }

    requestPayload = {
      model,
      prompt,
      temperature,
      stream: false,
    };
  }

  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), 20000);

  try {
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify(requestPayload),
      signal: abortController.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      return {
        text: '',
        error: `Upstream HTTP ${response.status} ${response.statusText}: ${errText.slice(0, 200)}`,
      };
    }

    const data = await response.json();
    let resultText = '';

    if (provider === 'openai') {
      resultText = data.choices?.[0]?.message?.content || '';
    } else {
      resultText = data.response || '';
    }

    return {
      text: resultText.trim(),
    };
  } catch (err: any) {
    clearTimeout(timeoutId);
    const isTimeout = err.name === 'AbortError';
    return {
      text: '',
      error: isTimeout ? 'Request timed out (20s)' : (err.message || 'LLM call failed'),
    };
  }
}
