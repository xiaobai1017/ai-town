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
  };
  objective: {
    healthFloor: number;
    hungerCeiling: number;
    charmTarget: number;
    priority: 'health_then_charm';
    safeReserve: number;
    disposableFunds: number;
  };
  candidates: JevAction[];
}

const ALLOWED_ACTIONS = new Set<JevActionType>(['WORK', 'EAT', 'SLEEP', 'SHOP', 'LIBRARY', 'TREAT', 'BANK', 'WANDER', 'WAIT']);

export function buildJevContext(agent: Agent, world: World, time: number, priceMultiplier: number, wageMultiplier: number, riskMultiplier: number): JevDecisionContext {
  const locations = world.locations.map(location => ({
    name: location.name,
    distance: Math.abs(agent.position.x - location.entry.x) + Math.abs(agent.position.y - location.entry.y)
  }));

  const healthFloor = 50;
  const hungerCeiling = 65;
  const hour = Math.floor(time / 60) % 24;
  const finances = planFinances(agent, priceMultiplier, hour);
  const canPursueCharmSafely = agent.health >= 55 && agent.hunger <= 55 &&
    finances.canShop && agent.charm < 100;
  const canReadSafely = agent.health >= 55 && agent.hunger <= 55 && agent.charm < 100;

  const isNight = hour >= 22 || hour < 7;

  // 动态丰富候选动作：兼顾多样性与作息时段真实感
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
    // 日间与傍晚时段 (7:00 ~ 22:00)：正常生活、工作与休闲娱乐
    candidates.push({ type: 'WANDER', location: 'Park' });

    // 工作时段 (8:00 ~ 17:00) 提供工作选项
    if (hour >= 8 && hour < 18) {
      candidates.push({ type: 'WORK', location: workLocation(agent) });
    }

    // 饥饿感出现时提供就餐选项（优先考虑资金与偏好）
    if (agent.hunger >= 20) {
      const prefersBakery = agent.cash < (0.05 * priceMultiplier) || agent.bankBalance < 10;
      candidates.push({ type: 'EAT', location: prefersBakery ? 'Bakery' : 'Restaurant' });
    }

    // 资金充裕且基本需求满足时提供商场消费 (商业时段 9:00 ~ 21:00)
    if (canPursueCharmSafely && hour >= 9 && hour < 21) {
      candidates.push({ type: 'SHOP', location: 'Mall' });
    }

    // 状态安全时提供图书馆静心阅读 (开馆时段 8:00 ~ 21:00)
    if (canReadSafely && hour >= 8 && hour < 21) {
      candidates.push({ type: 'LIBRARY', location: 'Library' });
    }

    // 健康受损时提供就医选项
    if (agent.health < 85) {
      candidates.push({ type: 'TREAT', location: 'Hospital' });
    }

    // 银行：营业时段 (9:00 ~ 17:00) 且现金充裕（存钱）或现金匮乏/有负债（贷款/取款）时提供
    if (hour >= 9 && hour < 17 && (agent.cash >= 40 || agent.cash < 15 || agent.loanBalance > 0)) {
      candidates.push({ type: 'BANK', location: 'Bank' });
    }

    // 晚间疲惫时提前提供回家休息选项 (20:00 之后或身体虚弱)
    if (hour >= 20 || agent.health < 55) {
      candidates.push({ type: 'SLEEP', location: 'My House' });
    }
  }

  if (candidates.length < 2) {
    candidates.push({ type: 'WAIT' });
  }

  return {
    agent: {
      id: agent.id, name: agent.name, role: agent.role, state: agent.state,
      position: agent.position, hunger: agent.hunger, health: agent.health,
      cash: agent.cash, bankBalance: agent.bankBalance, loanBalance: agent.loanBalance,
      charm: agent.charm, memory: agent.memory
    },
    world: { time, hour, priceMultiplier, wageMultiplier, riskMultiplier, locations },
    objective: { healthFloor, hungerCeiling, charmTarget: 100, priority: 'health_then_charm', safeReserve: finances.safeReserve, disposableFunds: finances.disposableFunds },
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
