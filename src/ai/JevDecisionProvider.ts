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

  const healthFloor = 80;
  const hungerCeiling = 35;
  const hour = Math.floor(time / 60) % 24;
  const finances = planFinances(agent, priceMultiplier, hour);
  const canPursueCharmSafely = agent.health >= healthFloor && agent.hunger <= hungerCeiling &&
    finances.canShop && agent.charm < 100;
  const canReadSafely = agent.health >= healthFloor && agent.hunger <= hungerCeiling && agent.charm < 100;

  // 智能剪枝候选动作：从无脑 9 个精简为 3~5 个当前相关的动作，大幅减少模型推理负担与超时率
  const candidates: JevAction[] = [
    { type: 'WORK', location: workLocation(agent) },
    { type: 'WANDER' },
  ];

  if (canPursueCharmSafely) {
    candidates.push({ type: 'SHOP', location: 'Mall' });
  }
  if (canReadSafely) {
    candidates.push({ type: 'LIBRARY', location: 'Library' });
  }
  // 仅在健康明显亏损时考虑就医
  if (agent.health < 80) {
    candidates.push({ type: 'TREAT', location: 'Hospital' });
  }
  // 仅在已有轻微饥饿感时考虑就餐
  if (agent.hunger >= 25) {
    candidates.push({ type: 'EAT', location: 'Restaurant' });
  }
  // 仅在夜间、清晨或虚弱时考虑休息
  if (hour >= 21 || hour < 6 || agent.health < 60) {
    candidates.push({ type: 'SLEEP', location: 'My House' });
  }
  // 仅在现金短缺、现金过剩或背负负债时考虑银行
  if (agent.cash < 15 || agent.cash > 150 || agent.loanBalance > 0) {
    candidates.push({ type: 'BANK', location: 'Bank' });
  }
  if (candidates.length < 3) {
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
  return 'Library';
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
