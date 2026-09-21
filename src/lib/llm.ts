/**
 * 大模型对话调用模块，支持环境自适应（Node 服务端直接调用 / 浏览器端代理中转）
 * @author hubin
 */

import { loadModelSettings, LLMConfig } from './modelSettings';
import { callLLM } from './llmCore';

export async function generateResponse(
  model?: string,
  prompt: string = '',
  customConfig?: Partial<LLMConfig>
): Promise<string> {
  try {
    const settings = loadModelSettings();
    const activeConfig: LLMConfig = {
      ...settings.llm,
      ...(customConfig || {}),
      ...(model ? { model } : {}),
    };

    const targetModel = activeConfig.model || 'qwen3:0.6b';
    await logToServer(`LLM Request [${activeConfig.provider} / ${targetModel}]: ${prompt}`);

    // 环境自适应：Node.js 服务端环境下直接调用核心逻辑，避免相对路径 '/api/llm' 导致 ERR_INVALID_URL
    if (typeof window === 'undefined') {
      const res = await callLLM(prompt, activeConfig);
      if (res.error) {
        const errorMsg = `LLM Server Error: ${res.error}`;
        console.error(errorMsg);
        await logToServer(errorMsg);
        return "I cannot think right now.";
      }
      const result = res.text.trim();
      await logToServer(`LLM Response: ${result}`);
      return result || "...";
    }

    // 浏览器环境下，通过 Next.js API 代理请求，避免跨域
    const response = await fetch('/api/llm', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt,
        config: activeConfig,
        model: targetModel,
      }),
    });

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      const errorMsg = `LLM API Error: ${response.status} ${errJson.error || response.statusText}`;
      console.error(errorMsg);
      await logToServer(errorMsg);
      return "I cannot think right now.";
    }

    const data = await response.json();
    const result = (data.text || '').trim();

    await logToServer(`LLM Response: ${result}`);

    if (!result) return "...";

    return result;
  } catch (error) {
    console.error('LLM Fetch Error:', error);
    await logToServer(`LLM Fetch Error: ${String(error)}`);
    return "Hello there!";
  }
}

async function logToServer(message: string) {
  try {
    if (typeof window !== 'undefined') {
      await fetch('/api/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });
    } else {
      console.log('[SERVER LOG]:', message);
    }
  } catch (e) {
    // ignore log error
  }
}
