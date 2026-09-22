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
        action: choice('Choose one available candidate. Hard constraints: keep health at or above objective.healthFloor, hunger at or below objective.hungerCeiling, and never spend objective.safeReserve. If objective.disposableFunds is negative, prefer WORK or BANK over charm activities. Otherwise maximize charm as quickly as possible; use SHOP when available and safe.', criteria)
      }
    });
    const type = result.answers.action.choice;
    if (!availableTypes.has(type)) return null;
    const candidate = context?.candidates?.find((item: { type?: string }) => item.type === type);
    return {
      type: type as JevAction['type'],
      location: candidate?.location,
      reason: `Jev selected ${type} (confidence ${(result.answers.action.confidence * 100).toFixed(0)}%).`
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
