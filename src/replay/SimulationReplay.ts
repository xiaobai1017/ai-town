import { Agent } from '@/engine/Agent';
import { World } from '@/engine/World';
import type { DialoguePacket } from '@/ai/DialogueSystem';

export const REPLAY_STORAGE_KEY = 'ai-town-latest-replay-v1';
const MAX_REPLAY_FRAMES = 240;

export interface ReplayFrame {
  time: number;
  world: World;
  agents: Agent[];
  dialogueLog: DialoguePacket[];
  priceLevel: number;
  wageLevel: number;
  riskLevel: number;
  jevEnabled: boolean;
}

export interface ReplayRecord {
  version: 1;
  createdAt: string;
  frames: ReplayFrame[];
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export function makeReplayFrame(state: Omit<ReplayFrame, 'world' | 'agents'> & { world: World; agents: Agent[] }): ReplayFrame {
  const frame = clone(state);
  // Replay needs the visible state, not unbounded historical data. Keeping
  // these bounded also prevents localStorage quota failures on long runs.
  frame.agents.forEach(agent => {
    agent.transactions = agent.transactions.slice(0, 20);
    agent.conversationHistory = Object.fromEntries(
      Object.entries(agent.conversationHistory).map(([id, messages]) => [id, messages.slice(-3)])
    );
  });
  frame.world.locations.forEach(location => {
    location.stats.transactions = location.stats.transactions.slice(0, 30);
  });
  frame.dialogueLog = frame.dialogueLog.slice(-80);
  return frame;
}

export function saveReplay(record: ReplayRecord) {
  if (typeof window === 'undefined') return;
  try {
    const bounded = record.frames.length > MAX_REPLAY_FRAMES
      ? { ...record, frames: record.frames.slice(-MAX_REPLAY_FRAMES) }
      : record;
    window.localStorage.setItem(REPLAY_STORAGE_KEY, JSON.stringify(bounded));
  } catch (error) {
    // Quota errors must never stop the simulation. Retry with a smaller
    // rolling window, retaining the most recent state for replay.
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      try {
        window.localStorage.setItem(
          REPLAY_STORAGE_KEY,
          JSON.stringify({ ...record, frames: record.frames.slice(-60) })
        );
      } catch {
        // Storage is optional; gameplay continues without persistence.
      }
    }
  }
}

export function loadReplay(): ReplayRecord | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(REPLAY_STORAGE_KEY);
    if (!raw) return null;
    const record = JSON.parse(raw) as ReplayRecord;
    return record.version === 1 && Array.isArray(record.frames) && record.frames.length > 0 ? record : null;
  } catch {
    return null;
  }
}

export function clearReplay() {
  if (typeof window !== 'undefined') window.localStorage.removeItem(REPLAY_STORAGE_KEY);
}

export function restoreFrame(frame: ReplayFrame): ReplayFrame {
  const world = Object.assign(new World(frame.world.width, frame.world.height), clone(frame.world));
  const agents = frame.agents.map(raw => Object.assign(new Agent(raw.id, raw.name, raw.role, raw.position, raw.color, raw.emoji, raw.description), clone(raw)));
  return { ...clone(frame), world, agents };
}
