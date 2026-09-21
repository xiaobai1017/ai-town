import { Agent, AgentState } from '../engine/Agent';
import { World } from '../engine/World';

export type JevActionType = 'WORK' | 'EAT' | 'SLEEP' | 'SHOP' | 'TREAT' | 'BANK' | 'WANDER' | 'WAIT';

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
  candidates: JevAction[];
}

const ALLOWED_ACTIONS = new Set<JevActionType>(['WORK', 'EAT', 'SLEEP', 'SHOP', 'TREAT', 'BANK', 'WANDER', 'WAIT']);

export function buildJevContext(agent: Agent, world: World, time: number, priceMultiplier: number, wageMultiplier: number, riskMultiplier: number): JevDecisionContext {
  const locations = world.locations.map(location => ({
    name: location.name,
    distance: Math.abs(agent.position.x - location.entry.x) + Math.abs(agent.position.y - location.entry.y)
  }));

  return {
    agent: {
      id: agent.id, name: agent.name, role: agent.role, state: agent.state,
      position: agent.position, hunger: agent.hunger, health: agent.health,
      cash: agent.cash, bankBalance: agent.bankBalance, loanBalance: agent.loanBalance,
      charm: agent.charm, memory: agent.memory
    },
    world: { time, hour: Math.floor(time / 60) % 24, priceMultiplier, wageMultiplier, riskMultiplier, locations },
    candidates: [
      { type: 'WORK', location: workLocation(agent) },
      { type: 'EAT', location: 'Restaurant' },
      { type: 'SLEEP', location: 'My House' },
      { type: 'SHOP', location: 'Mall' },
      { type: 'TREAT', location: 'Hospital' },
      { type: 'BANK', location: 'Bank' },
      { type: 'WANDER' },
      { type: 'WAIT' }
    ]
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
  try {
    const response = await fetch('/api/jev/decision', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(context), signal: AbortSignal.timeout(6000)
    });
    if (!response.ok) return null;
    return parseJevAction(await response.json());
  } catch {
    return null;
  }
}
