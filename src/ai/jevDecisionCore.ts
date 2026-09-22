/**
 * JEV 决策核心模块
 * @author hubin
 */

import { choice, TypeSafeClient } from '@typesafe-ai/sdk';
import type { JevAction, JevDecisionContext } from './JevDecisionProvider';
import type { JevConfig } from '@/lib/modelSettings';

const envApiKey = process.env.TYPESAFE_API_KEY || process.env.JEV_API_KEY;

// TypeSafeClient 实例缓存池，复用底层 TCP/TLS 与 HTTP Keep-Alive 连接
const clientCache = new Map<string, TypeSafeClient>();

function getOrCreateClient(
  apiKey: string,
  baseURL?: string,
  defaultModel?: string,
  timeoutMs: number = 15000
): TypeSafeClient {
  const model = defaultModel?.trim() || process.env.TYPESAFE_DEFAULT_MODEL || 'jev-latest';
  const url = baseURL?.trim() || process.env.TYPESAFE_BASE_URL || undefined;
  const key = `${apiKey}::${url || ''}::${model}::${timeoutMs}`;

  let client = clientCache.get(key);
  if (!client) {
    client = new TypeSafeClient({
      apiKey,
      baseURL: url,
      defaultModel: model,
      timeout: timeoutMs,
      retry: {
        maxRetries: 1,
        backoffInitialMs: 1000,
        backoffMaxMs: 3000,
      },
    });
    clientCache.set(key, client);
  }
  return client;
}

const defaultClient = envApiKey
  ? getOrCreateClient(envApiKey, process.env.TYPESAFE_BASE_URL, process.env.TYPESAFE_DEFAULT_MODEL, 15000)
  : null;

const DESCRIPTIONS: Record<string, string> = {
  WORK: 'Work diligently at your assigned role to earn income.',
  EAT: 'Have a nutritious meal at the Restaurant or Bakery to relieve hunger.',
  SLEEP: 'Return home to sleep and recharge physical energy.',
  SHOP: 'Shop at the Mall to boost personal charm and lifestyle when finances are safe.',
  LIBRARY: 'Read books quietly at the Library for steady, zero-cost charm and intellect growth.',
  TREAT: 'Visit the Hospital to recover health and cure disease.',
  BANK: 'Visit the Bank to deposit surplus cash for interest, or take a loan if short on funds.',
  WANDER: 'Stroll pleasantly around the Park or town streets to relax and observe the community.',
  WAIT: 'Pause briefly to assess the surroundings.'
};

export function formatJevReason(
  type: string,
  location?: string,
  confidence?: number,
  agent?: { name?: string; role?: string; hunger?: number; health?: number }
): string {
  const confText = typeof confidence === 'number' ? ` (置信度 ${(confidence * 100).toFixed(0)}%)` : '';
  switch (type) {
    case 'EAT':
      return location === 'Bakery'
        ? `腹中微饥，前往面包房买些新鲜出炉的美味点心垫垫肚子。${confText}`
        : `饥饿感上升，前往餐厅享用一份热气腾腾的丰盛餐品补充能量。${confText}`;
    case 'SHOP':
      return `当前资金充裕且身心健康，前往商场选购品质好物提升个人魅力。${confText}`;
    case 'LIBRARY':
      return `向往知识与宁静，前往图书馆静心研读图书，陶冶情操提升修养。${confText}`;
    case 'WORK':
      return `作为一名敬业的${agent?.role || '居民'}，前往${location || '工作岗位'}专心工作，赚取稳定报酬。${confText}`;
    case 'BANK':
      return `出于理财规划与资金安全考量，前往银行办理存取款或贷款业务。${confText}`;
    case 'TREAT':
      return `感觉身体健康状态有所欠佳，前往医院接受医生诊断与康复治疗。${confText}`;
    case 'SLEEP':
      return `感到有些疲惫困倦，决定返回家中就寝休息，养精蓄锐。${confText}`;
    case 'WANDER':
      return location === 'Park'
        ? `忙里偷闲，前往小镇公园惬意漫步赏景，放松身心。${confText}`
        : `在小镇街头悠闲漫步，享受轻松自由的街区时光。${confText}`;
    case 'WAIT':
      return `周围状态平稳，在原地稍作休整与观察。${confText}`;
    default:
      return `综合权衡当前生理状态与发展目标，决定执行 ${type} 行动。${confText}`;
  }
}

function isTimeoutError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { name?: unknown; code?: unknown; message?: unknown };
  const name = typeof candidate.name === 'string' ? candidate.name.toLowerCase() : '';
  const code = typeof candidate.code === 'string' ? candidate.code.toLowerCase() : '';
  const message = typeof candidate.message === 'string' ? candidate.message.toLowerCase() : '';
  return name.includes('timeout') || name.includes('abort') || code === 'timeout_err' ||
    code.includes('timeout') || message.includes('timed out') || message.includes('timeout');
}

/** Returns null if JEV is not configured or the request fails. */
export async function callJev(context: JevDecisionContext, overrideConfig?: Partial<JevConfig>): Promise<JevAction | null> {
  const apiKey = overrideConfig?.apiKey?.trim() || envApiKey;
  const timeoutSec = overrideConfig?.timeout && overrideConfig.timeout > 0 ? overrideConfig.timeout : 15;
  const timeoutMs = timeoutSec * 1000;

  let activeClient = defaultClient;

  if (apiKey) {
    activeClient = getOrCreateClient(
      apiKey,
      overrideConfig?.baseUrl,
      overrideConfig?.model,
      timeoutMs
    );
  }

  if (!activeClient) {
    if (typeof window === 'undefined') console.warn('[JEV] callJev invoked but client is null (API key not loaded)');
    return null;
  }

  if (typeof window === 'undefined') console.log(`[JEV] calling systemOne for agent ${context.agent?.name} (candidates: ${context.candidates?.length})`);

  try {
    const candidates: Array<{ type?: string; location?: string }> = Array.isArray(context?.candidates) ? context.candidates : [];
    const availableTypes = new Set<string>(candidates
      .map((candidate: { type?: string }) => candidate.type)
      .filter((type): type is string => Boolean(type)));
    const criteria = Object.fromEntries([...availableTypes].map(type => [type, DESCRIPTIONS[type] || 'A safe available action.']));

    const result = await activeClient.systemOne({
      state: context as any as Record<string, any>,
      questions: {
        action: choice('Choose the best candidate action for the resident balancing health, hunger, financial security, and charm aspirations.', criteria)
      }
    });
    const type = result.answers.action.choice;
    if (!availableTypes.has(type)) return null;
    const candidate = context?.candidates?.find((item: { type?: string }) => item.type === type);
    const confidence = result?.answers?.action?.confidence;
    return {
      type: type as JevAction['type'],
      location: candidate?.location,
      reason: formatJevReason(type, candidate?.location, confidence, context?.agent)
    };
  } catch (error) {
    // A timeout is an expected transient failure. The caller already has a
    // deterministic local-rule fallback, so do not emit a noisy stack trace.
    if (isTimeoutError(error)) {
      if (typeof window === 'undefined') {
        console.warn(`[JEV] decision timed out (${timeoutSec}s) for agent ${context.agent?.name}; using local fallback.`);
      }
    } else {
      console.error('[JEV] decision failed:', error);
    }
    return null;
  }
}

export function isJevConfigured(overrideConfig?: Partial<JevConfig>): boolean {
  if (overrideConfig?.apiKey?.trim()) return true;
  return defaultClient !== null;
}
