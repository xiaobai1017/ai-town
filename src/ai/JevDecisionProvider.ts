/**
 * JEV 决策提供器与错峰队列
 * @author hubin
 */

import { Agent, AgentState } from '../engine/Agent';
import { World } from '../engine/World';
import { planFinances } from './FinancialPlanner';
import { callJevBatch } from './jevDecisionCore';
import { loadModelSettings } from '@/lib/modelSettings';

interface PendingJevRequest {
  context: JevDecisionContext;
  resolve: (action: JevAction | null) => void;
}

/**
 * 全局 JEV 批处理请求队列。
 * 当请求正在执行时，后续进入队列的所有小人决策请求会在下一次派发时合并为单次批量 JEV 请求发送，
 * 彻底消除排队等待延迟并减少 API 请求频次。
 * @author hubin
 */
class JevBatchQueue {
  private inFlight = false;
  private pendingQueue: PendingJevRequest[] = [];
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private isPaused = false;
  private lastDispatchTime = 0;
  private readonly maxBatchSize = 8;
  private readonly debounceMs = 60;
  private readonly minIntervalMs = 250;

  setPaused(paused: boolean) {
    this.isPaused = paused;
    if (paused) {
      this.clear();
    }
  }

  clear() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    const pending = [...this.pendingQueue];
    this.pendingQueue = [];
    pending.forEach(item => item.resolve(null));
  }

  enqueue(context: JevDecisionContext): Promise<JevAction | null> {
    if (this.isPaused) {
      return Promise.resolve(null);
    }

    return new Promise<JevAction | null>((resolve) => {
      this.pendingQueue.push({ context, resolve });

      // 若当前没有在途请求，启动短延时窗口聚合当前 tick 触发的小人
      if (!this.inFlight) {
        if (!this.debounceTimer) {
          this.debounceTimer = setTimeout(() => {
            this.debounceTimer = null;
            void this.dispatchNextBatch();
          }, this.debounceMs);
        }
      }
      // 若当前已存在在途请求 (inFlight=true)，新请求直接留存在 pendingQueue 中，
      // 等当前请求完成后的 finally 阶段会一次性取出全部排队请求合并发出。
    });
  }

  private async dispatchNextBatch(): Promise<void> {
    if (this.isPaused || this.inFlight || this.pendingQueue.length === 0) {
      return;
    }

    const now = Date.now();
    const waitMs = Math.max(0, this.minIntervalMs - (now - this.lastDispatchTime));
    if (waitMs > 0) {
      setTimeout(() => void this.dispatchNextBatch(), waitMs);
      return;
    }

    // 一次性取出当前队列中排队的所有请求（最多 maxBatchSize 个）
    const batch = this.pendingQueue.splice(0, this.maxBatchSize);
    if (batch.length === 0) return;

    this.inFlight = true;
    this.lastDispatchTime = Date.now();

    try {
      const contexts = batch.map(b => b.context);
      const settings = loadModelSettings();
      const timeoutSec = settings.jev.timeout && settings.jev.timeout > 0 ? settings.jev.timeout : 15;

      let resultMap = new Map<string, JevAction | null>();

      if (typeof window === 'undefined') {
        // 服务端环境直接调用 callJevBatch
        resultMap = await callJevBatch(contexts, settings.jev);
      } else {
        // 客户端环境通过 HTTP 接口批量调用
        try {
          const response = await fetch('/api/jev/decision', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contexts, jevConfig: settings.jev }),
            signal: AbortSignal.timeout(timeoutSec * 1000 + 3000)
          });
          if (response.ok) {
            const data = await response.json();
            const rawResults = data?.results || {};
            for (const [key, val] of Object.entries(rawResults)) {
              resultMap.set(key, parseJevAction(val));
            }
          }
        } catch (fetchErr) {
          console.error('[JEV] fetch batch error:', fetchErr);
        }
      }

      // 解包并分发给批次中的各个小人
      for (const item of batch) {
        const agentId = item.context.agent?.id;
        const action = agentId ? (resultMap.get(agentId) ?? null) : null;
        item.resolve(action);
      }
    } catch (err) {
      console.error('[JEV] dispatchNextBatch error:', err);
      for (const item of batch) {
        item.resolve(null);
      }
    } finally {
      this.inFlight = false;
      this.lastDispatchTime = Date.now();

      // 如果队列中还有排队的请求，并且未暂停，立即触发下一次批次派发（将当前排队的合并派发）
      if (this.pendingQueue.length > 0 && !this.isPaused) {
        setTimeout(() => void this.dispatchNextBatch(), 0);
      }
    }
  }
}

const jevQueue = new JevBatchQueue();

export function setJevQueuePaused(paused: boolean) {
  jevQueue.setPaused(paused);
}

import { WeatherType } from '../engine/Weather';

export type JevActionType = 'WORK' | 'EAT' | 'SLEEP' | 'SHOP' | 'LIBRARY' | 'TREAT' | 'BANK' | 'WANDER' | 'WAIT';

export interface JevAction {
  type: JevActionType;
  location?: string;
  reason?: string;
}

export interface JevDecisionContext {
  agent: Pick<Agent, 'id' | 'name' | 'role' | 'state' | 'position' | 'hunger' | 'health' | 'cash' | 'bankBalance' | 'loanBalance' | 'charm' | 'memory'>;
  world: {
    time: number;
    hour: number;
    priceMultiplier: number;
    wageMultiplier: number;
    riskMultiplier: number;
    locations: { name: string; distance: number }[];
    weather?: WeatherType;
  };
  objective: {
    healthFloor: number;
    hungerCeiling: number;
    charmTarget: number;
    priority: 'work_duty_and_earnings' | 'lunch_break_replenish' | 'enjoy_wealth_and_elevate_charm' | 'evening_leisure_and_study' | 'night_rest_and_recovery' | 'health_and_survival';
    safeReserve: number;
    disposableFunds: number;
  };
  candidates: JevAction[];
}

const ALLOWED_ACTIONS = new Set<JevActionType>(['WORK', 'EAT', 'SLEEP', 'SHOP', 'LIBRARY', 'TREAT', 'BANK', 'WANDER', 'WAIT']);

export function buildJevContext(
  agent: Agent,
  world: World,
  time: number,
  priceMultiplier: number,
  wageMultiplier: number,
  riskMultiplier: number,
  weather: WeatherType = 'SUNNY'
): JevDecisionContext {
  const locations = world.locations.map(location => ({
    name: location.name,
    distance: Math.abs(agent.position.x - location.entry.x) + Math.abs(agent.position.y - location.entry.y)
  }));

  const healthFloor = 50;
  const hungerCeiling = 65;
  const hour = Math.floor(time / 60) % 24;
  const finances = planFinances(agent, priceMultiplier, hour);
  const canPursueCharmSafely = agent.health >= 45 && agent.hunger <= 65 &&
    finances.canShop && agent.charm < 100;
  const canReadSafely = agent.health >= 50 && agent.hunger <= 60 && agent.charm < 100;

  const isNight = hour >= 22 || hour < 7;

  // 动态丰富候选动作：兼顾多样性、作息时段与当前天气状况
  const candidates: JevAction[] = [];

  if (isNight) {
    // 深夜时段 (22:00 ~ 7:00)：以居家就寝休息恢复精力为主
    candidates.push({ type: 'SLEEP', location: 'My House' });

    // 若深夜感到饥饿，提供在家吃些简餐补充体力
    if (agent.hunger >= 35) {
      candidates.push({ type: 'EAT', location: 'My House' });
    }

    // 若身体欠佳急需救治，依然提供急诊就医
    if (agent.health < 65) {
      candidates.push({ type: 'TREAT', location: 'Hospital' });
    }

    // 偶尔睡不着在院子/街边稍事休息
    candidates.push({ type: 'WAIT' });
  } else {
    // 日间与傍晚时段 (7:00 ~ 22:00) 细化为不同作息阶段
    const isWorkShift = (hour >= 8 && hour < 12) || (hour >= 13 && hour < 18);
    const isLunchBreak = hour >= 12 && hour < 13;
    const isEveningLeisure = hour >= 18 && hour < 22;
    const isMorningPrep = hour >= 7 && hour < 8;

    if (isWorkShift) {
      // 1. 上下文工作时段 (8:00~12:00, 13:00~18:00)：以坚守工作岗位赚取薪资为主
      candidates.push({ type: 'WORK', location: workLocation(agent) });

      // 工作中若明显饥饿提供就餐
      if (agent.hunger >= 40) {
        candidates.push({ type: 'EAT', location: 'Restaurant' });
      }
      // 身体明显不适时允许就医
      if (agent.health < 75) {
        candidates.push({ type: 'TREAT', location: 'Hospital' });
      }
      candidates.push({ type: 'WAIT' });
    } else if (isLunchBreak) {
      // 2. 午餐休息时段 (12:00 ~ 13:00)：就餐休整补充能量
      candidates.push({ type: 'EAT', location: agent.role === 'Baker' ? 'Bakery' : 'Restaurant' });
      if (weather !== 'STORMY') {
        candidates.push({ type: 'WANDER', location: 'Park' });
      }
      candidates.push({ type: 'WAIT' });
    } else if (isEveningLeisure) {
      // 3. 下班黄金休闲消费时段 (18:00 ~ 22:00)：属于市民自己的下班时光！
      // 积蓄充裕时商场购物提升魅力 (商业时段至 21:00)
      if (canPursueCharmSafely && hour < 21) {
        candidates.push({ type: 'SHOP', location: 'Mall' });
      }
      // 图书馆静心阅读提升素养 (开馆至 21:00)
      if (canReadSafely && hour < 21) {
        candidates.push({ type: 'LIBRARY', location: 'Library' });
      }
      // 公园晚间漫步
      if (weather !== 'STORMY') {
        candidates.push({ type: 'WANDER', location: 'Park' });
      }
      // 晚餐
      if (agent.hunger >= 25) {
        candidates.push({ type: 'EAT', location: 'Restaurant' });
      }
      // 较晚时准备回家休息
      if (hour >= 20 || agent.health < 55) {
        candidates.push({ type: 'SLEEP', location: 'My House' });
      }
    } else if (isMorningPrep) {
      // 4. 清晨准备时段 (7:00 ~ 8:00)：准备迎接新的一天
      if (weather !== 'STORMY') {
        candidates.push({ type: 'WANDER', location: 'Park' });
      }
      if (agent.hunger >= 20) {
        candidates.push({ type: 'EAT', location: 'Bakery' });
      }
      candidates.push({ type: 'WAIT' });
    }

    // 银行：营业时段 (9:00 ~ 17:00) 且有存贷款实际需求时提供
    const needsBank = (agent.cash >= 60) || (agent.cash < 5 && agent.bankBalance < 5) || (agent.loanBalance > 0 && agent.cash >= 20);
    if (hour >= 9 && hour < 17 && needsBank) {
      candidates.push({ type: 'BANK', location: 'Bank' });
    }
  }

  if (candidates.length < 2) {
    candidates.push({ type: 'WAIT' });
  }

  // 动态确定决策优先级
  let priority: JevDecisionContext['objective']['priority'];
  if (agent.health < 45 || agent.hunger > 75) {
    priority = 'health_and_survival';
  } else if (isNight) {
    priority = 'night_rest_and_recovery';
  } else if ((hour >= 8 && hour < 12) || (hour >= 13 && hour < 18)) {
    priority = 'work_duty_and_earnings';
  } else if (hour >= 12 && hour < 13) {
    priority = 'lunch_break_replenish';
  } else {
    // 傍晚休闲时段 (18:00 ~ 22:00)
    const isFinanciallySecure = (agent.cash + agent.bankBalance) >= 25 && finances.disposableFunds > 0;
    priority = isFinanciallySecure ? 'enjoy_wealth_and_elevate_charm' : 'evening_leisure_and_study';
  }

  return {
    agent: {
      id: agent.id, name: agent.name, role: agent.role, state: agent.state,
      position: agent.position, hunger: agent.hunger, health: agent.health,
      cash: agent.cash, bankBalance: agent.bankBalance, loanBalance: agent.loanBalance,
      charm: agent.charm, memory: agent.memory
    },
    world: { time, hour, priceMultiplier, wageMultiplier, riskMultiplier, locations, weather },
    objective: { healthFloor, hungerCeiling, charmTarget: 100, priority, safeReserve: finances.safeReserve, disposableFunds: finances.disposableFunds },
    candidates
  };
}

function workLocation(agent: Agent) {
  if (agent.role === 'Baker') return 'Bakery';
  if (agent.role === 'Librarian') return 'Library';
  if (agent.role === 'Police') return 'Police Station';
  if (agent.role === 'Doctor') return 'Hospital';
  if (agent.role === 'Gardener') return 'Park';
  if (agent.role === 'Artist') return 'Park';
  if (agent.role === 'Mayor') return 'Library';
  return 'Park';
}

export function parseJevAction(value: unknown): JevAction | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as { type?: unknown; location?: unknown; reason?: unknown };
  if (typeof candidate.type !== 'string' || !ALLOWED_ACTIONS.has(candidate.type as JevActionType)) return null;
  return {
    type: candidate.type as JevActionType,
    location: typeof candidate.location === 'string' ? candidate.location : undefined,
    reason: typeof candidate.reason === 'string' ? candidate.reason.slice(0, 200) : undefined
  };
}

export async function requestJevDecision(context: JevDecisionContext): Promise<JevAction | null> {
  return jevQueue.enqueue(context);
}
