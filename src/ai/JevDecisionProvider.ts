/**
 * JEV 决策提供器与错峰队列
 * @author hubin
 */

import { Agent, AgentState } from '../engine/Agent';
import { World } from '../engine/World';
import { planFinances } from './FinancialPlanner';
import { callJev } from './jevDecisionCore';
import { loadModelSettings } from '@/lib/modelSettings';

/** 全局 JEV 请求错峰与限流调度队列，限制最大并发避免冲垮网络 */
class JevRequestQueue {
  private inFlight = 0;
  private readonly maxConcurrent = 2;
  private queue: Array<() => void> = [];
  private lastDispatchTime = 0;

  async enqueue<T>(fn: () => Promise<T>): Promise<T> {
    if (this.inFlight >= this.maxConcurrent) {
      await new Promise<void>(resolve => this.queue.push(resolve));
    }
    this.inFlight++;

    // 每次请求间隔至少 250ms，防止瞬时并发网络风暴
    const now = Date.now();
    const waitMs = Math.max(0, 250 - (now - this.lastDispatchTime));
    if (waitMs > 0) {
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }
    this.lastDispatchTime = Date.now();

    try {
      return await fn();
    } finally {
      this.inFlight--;
      if (this.queue.length > 0) {
        const next = this.queue.shift();
        next?.();
      }
    }
  }
}

const jevQueue = new JevRequestQueue();

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

  // 动态丰富候选动作：兼顾多样性与适度选项数量（保持 3~6 个贴合情境的候选）
  const candidates: JevAction[] = [
    { type: 'WANDER', location: 'Park' },
  ];

  // 白天工作时段提供工作选项
  if (hour >= 7 && hour < 20) {
    candidates.push({ type: 'WORK', location: workLocation(agent) });
  }

  // 饥饿感出现时提供就餐选项（优先考虑资金与偏好）
  if (agent.hunger >= 20) {
    const prefersBakery = agent.cash < (0.05 * priceMultiplier) || agent.bankBalance < 10;
    candidates.push({ type: 'EAT', location: prefersBakery ? 'Bakery' : 'Restaurant' });
  }

  // 资金充裕且基本需求满足时提供商场消费
  if (canPursueCharmSafely) {
    candidates.push({ type: 'SHOP', location: 'Mall' });
  }

  // 状态安全时提供图书馆静心阅读
  if (canReadSafely) {
    candidates.push({ type: 'LIBRARY', location: 'Library' });
  }

  // 健康受损时提供就医选项
  if (agent.health < 85) {
    candidates.push({ type: 'TREAT', location: 'Hospital' });
  }

  // 银行：现金充裕（存钱）或现金匮乏/有负债（贷款/取款）时提供
  if (agent.cash >= 40 || agent.cash < 15 || agent.loanBalance > 0) {
    candidates.push({ type: 'BANK', location: 'Bank' });
  }

  // 夜间、清晨或身体虚弱时提供回家睡觉选项
  if (hour >= 20 || hour < 7 || agent.health < 60) {
    candidates.push({ type: 'SLEEP', location: 'My House' });
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
  return jevQueue.enqueue(async () => {
    const settings = loadModelSettings();
    const timeoutSec = settings.jev.timeout && settings.jev.timeout > 0 ? settings.jev.timeout : 15;

    // When running on the server (SimulationRuntime), call the shared core
    // directly instead of fetching our own HTTP route (relative URLs don't
    // resolve in Node). On the client, fall back to the HTTP route.
    if (typeof window === 'undefined') {
      return callJev(context, settings.jev);
    }
    try {
      const response = await fetch('/api/jev/decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context, jevConfig: settings.jev }),
        signal: AbortSignal.timeout(timeoutSec * 1000 + 3000)
      });
      if (!response.ok) return null;
      return parseJevAction(await response.json());
    } catch {
      return null;
    }
  });
}
