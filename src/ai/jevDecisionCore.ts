/**
 * JEV 决策核心模块
 * @author hubin
 */

import { choice, TypeSafeClient } from '@typesafe-ai/sdk';
import type { JevAction, JevDecisionContext } from './JevDecisionProvider';
import type { JevConfig } from '@/lib/modelSettings';
import { WeatherType, WEATHER_CONFIGS } from '../engine/Weather';

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
  EAT: 'Have a hearty meal at the Restaurant to deeply relieve hunger and regain stamina, or enjoy fresh snacks at the Bakery.',
  SLEEP: 'Return home to sleep and recharge physical energy.',
  SHOP: 'Visit the Mall to reward your hard work, buy stylish goods, and greatly elevate your social charm, lifestyle, and prestige (ideal when financially comfortable).',
  LIBRARY: 'Read books quietly at the Library for steady, low-cost intellectual study and cultural reflection.',
  TREAT: 'Visit the Hospital to recover health and cure disease.',
  BANK: 'Visit the Bank to deposit surplus cash for interest, or take a loan if short on funds.',
  WANDER: 'Stroll pleasantly around the Park or town streets to relax and observe the community.',
  WAIT: 'Pause briefly to assess the surroundings.'
};

export function formatJevReason(
  type: string,
  location?: string,
  confidence?: number,
  agent?: { name?: string; role?: string; hunger?: number; health?: number },
  weather?: WeatherType
): string {
  const confText = typeof confidence === 'number' ? ` (置信度 ${(confidence * 100).toFixed(0)}%)` : '';
  switch (type) {
    case 'EAT':
      if (weather === 'SNOWY') {
        return `外面飘着小雪寒气袭人，前往${location || '面包房'}点一份刚出炉的热食暖饮，驱散寒意补充能量。${confText}`;
      }
      return location === 'Bakery'
        ? `腹中微饥，前往面包房买些新鲜出炉的美味点心垫垫肚子。${confText}`
        : `饥饿感上升，前往餐厅享用一份热气腾腾的丰盛餐品补充能量。${confText}`;
    case 'SHOP':
      if (weather === 'RAINY' || weather === 'STORMY') {
        return `室外阴雨绵绵，前往商场室内漫步选购品质好物，避雨的同时提升生活品质。${confText}`;
      }
      return `前往商场随心选购心仪好物，丰俭由人多花多获魅力提升。${confText}`;
    case 'LIBRARY':
      if (weather === 'RAINY' || weather === 'STORMY') {
        return `窗外细雨蒙蒙，前往图书馆静心研读图书借以避雨，在墨香中提升修养与心境。${confText}`;
      }
      return `向往知识与宁静，前往图书馆静心研读图书，陶冶情操提升修养。${confText}`;
    case 'WORK':
      return `作为一名敬业的${agent?.role || '居民'}，前往${location || '工作岗位'}专心工作，赚取稳定报酬。${confText}`;
    case 'BANK':
      return `出于理财规划与资金安全考量，前往银行办理存取款或贷款业务。${confText}`;
    case 'TREAT':
      return `感觉身体健康状态有所欠佳，前往医院接受医生诊断与康复治疗。${confText}`;
    case 'SLEEP':
      if (weather === 'STORMY') {
        return `外面雷雨交加，决定尽快返回家中就寝安歇避雨，养精蓄锐。${confText}`;
      }
      return `感到有些疲惫困倦，决定返回家中就寝休息，养精蓄锐。${confText}`;
    case 'WANDER':
      if (weather === 'SUNNY') {
        return `今日艳阳高照微风和煦，前往小镇公园惬意漫步赏景，享受美好日光。${confText}`;
      }
      if (weather === 'RAINY') {
        return `撑着雨伞在细雨霏霏的街头信步漫游，享受雨中小镇别样的清幽宁静。${confText}`;
      }
      return location === 'Park'
        ? `忙里偷闲，前往小镇公园惬意漫步赏景，放松身心。${confText}`
        : `在小镇街头悠闲漫步，享受轻松自由的街区时光。${confText}`;
    case 'WAIT':
      if (weather === 'STORMY') {
        return `外面突降大雷雨，先在屋檐或室内稍事避雨休整。${confText}`;
      }
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

/**
 * 批量执行 JEV 决策，单次 systemOne 请求聚合当前批次中所有小人的状态和问题
 * @author hubin
 */
export async function callJevBatch(
  contexts: JevDecisionContext[],
  overrideConfig?: Partial<JevConfig>
): Promise<Map<string, JevAction | null>> {
  const resultMap = new Map<string, JevAction | null>();
  if (!contexts || contexts.length === 0) return resultMap;

  for (const ctx of contexts) {
    if (ctx.agent?.id) {
      resultMap.set(ctx.agent.id, null);
    }
  }

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
    if (typeof window === 'undefined') console.warn('[JEV] callJevBatch invoked but client is null (API key not loaded)');
    return resultMap;
  }

  const firstWorld = contexts[0]?.world;
  const hour = firstWorld?.hour ?? 12;
  const weather = firstWorld?.weather || 'SUNNY';
  const weatherMeta = WEATHER_CONFIGS[weather] || WEATHER_CONFIGS.SUNNY;
  const isNight = hour >= 22 || hour < 7;

  const questions: Record<string, any> = {};
  const agentCandidatesMap = new Map<string, Array<{ type?: string; location?: string }>>();

  for (const ctx of contexts) {
    const agent = ctx.agent;
    if (!agent?.id) continue;
    const candidates: Array<{ type?: string; location?: string }> = Array.isArray(ctx?.candidates) ? ctx.candidates : [];
    agentCandidatesMap.set(agent.id, candidates);

    const availableTypes = new Set<string>(
      candidates.map(c => c.type).filter((t): t is string => Boolean(t))
    );
    if (availableTypes.size === 0) {
      availableTypes.add('WAIT');
    }
    const criteria = Object.fromEntries(
      [...availableTypes].map(type => [type, DESCRIPTIONS[type] || 'A safe available action.'])
    );

    const totalWealth = (agent.cash ?? 0) + (agent.bankBalance ?? 0);
    const isWealthyAndSafe = totalWealth >= 25 && (agent.health ?? 100) >= 55 && (agent.hunger ?? 0) <= 60;

    let promptText: string;
    if (isNight) {
      promptText = `It is currently late night in AI Town (${hour}:00) and the weather is ${weatherMeta.nameEn} (${weatherMeta.emoji}). Resident ${agent.name} (${agent.role}) should rest or take essential care. Choose the best candidate action.`;
    } else if (isWealthyAndSafe) {
      promptText = `The weather in AI Town is currently ${weatherMeta.nameEn} (${weatherMeta.emoji}: ${weatherMeta.descriptionEn}). Resident ${agent.name} (${agent.role}) is in good health with healthy savings ($${totalWealth.toFixed(2)}). They have achieved financial security and should consider treating themselves at the Mall to boost charm and social prestige, or pursue leisure and study. Choose the best candidate action.`;
    } else {
      promptText = `The weather in AI Town is currently ${weatherMeta.nameEn} (${weatherMeta.emoji}: ${weatherMeta.descriptionEn}). Choose the best candidate action for resident ${agent.name} (${agent.role}) balancing health, hunger, financial security, charm, and current weather.`;
    }

    const qKey = `action_${agent.id}`;
    questions[qKey] = choice(promptText, criteria);
  }

  if (Object.keys(questions).length === 0) {
    return resultMap;
  }

  const state = {
    world: firstWorld,
    residents: contexts.map(ctx => ({
      agent: ctx.agent,
      objective: ctx.objective,
      candidateActions: ctx.candidates?.map(c => c.type)
    }))
  };

  if (typeof window === 'undefined') {
    const names = contexts.map(c => c.agent?.name).join(', ');
    console.log(`[JEV] calling systemOne batch for ${contexts.length} agents (weather: ${weather}): [${names}]`);
  }

  try {
    const result = await activeClient.systemOne({
      state: state as any,
      questions
    });

    const answers = result?.answers as Record<string, any> | undefined;
    if (answers) {
      for (const ctx of contexts) {
        const agent = ctx.agent;
        if (!agent?.id) continue;
        const qKey = `action_${agent.id}`;
        const answer = answers[qKey];
        if (!answer) continue;
        const chosenType = answer.choice;
        const candidates = agentCandidatesMap.get(agent.id) ?? [];
        const matchingCandidate = candidates.find(c => c.type === chosenType);
        const confidence = answer.confidence;

        if (chosenType) {
          resultMap.set(agent.id, {
            type: chosenType as JevAction['type'],
            location: matchingCandidate?.location,
            reason: formatJevReason(chosenType, matchingCandidate?.location, confidence, agent, weather)
          });
        }
      }
    }
  } catch (error) {
    if (isTimeoutError(error)) {
      if (typeof window === 'undefined') {
        console.warn(`[JEV] batch decision timed out (${timeoutSec}s) for ${contexts.length} agents; using local fallback.`);
      }
    } else {
      console.error('[JEV] batch decision failed:', error);
    }
  }

  return resultMap;
}

/** Returns null if JEV is not configured or the request fails. */
export async function callJev(context: JevDecisionContext, overrideConfig?: Partial<JevConfig>): Promise<JevAction | null> {
  if (!context?.agent?.id) return null;
  const resultMap = await callJevBatch([context], overrideConfig);
  return resultMap.get(context.agent.id) ?? null;
}

export function isJevConfigured(overrideConfig?: Partial<JevConfig>): boolean {
  if (overrideConfig?.apiKey?.trim()) return true;
  return defaultClient !== null;
}
