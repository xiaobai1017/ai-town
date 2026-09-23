/**
 * 城镇仿真回放系统
 * @author hubin
 */

import { Agent } from '@/engine/Agent';
import { World } from '@/engine/World';
import type { DialoguePacket } from '@/ai/DialogueSystem';
import type { WeatherType } from '@/engine/Weather';

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
  localAiEnabled?: boolean;
  weather?: WeatherType;
  weatherIntervalHours?: number;
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
    if (agent.decisionHistory) {
      agent.decisionHistory = agent.decisionHistory.slice(0, 20);
    }
  });
  frame.world.locations.forEach(location => {
    location.stats.transactions = location.stats.transactions.slice(0, 30);
  });
  frame.dialogueLog = frame.dialogueLog.slice(-80);
  return frame;
}

/**
 * 等距降采样算法：
 * 严格保留 frames[0]（第一天开局初始帧）与 frames[last]（最新时刻帧），
 * 中间帧按均匀步长采样，保证整个时间轴从 Day 1 开局到当前始终完整连续，避免滑动窗口切除头部历史。
 * @author hubin
 */
export function downsampleFrames<T>(frames: T[], targetMax: number): T[] {
  if (frames.length <= targetMax) return frames;
  if (targetMax <= 1) return [frames[0]];
  if (targetMax === 2) return [frames[0], frames[frames.length - 1]];

  const result: T[] = new Array(targetMax);
  result[0] = frames[0];
  result[targetMax - 1] = frames[frames.length - 1];

  const totalSteps = targetMax - 1;
  const originalLength = frames.length - 1;

  for (let i = 1; i < totalSteps; i++) {
    const idx = Math.round((i * originalLength) / totalSteps);
    result[i] = frames[idx];
  }

  return result;
}

export function saveReplay(record: ReplayRecord) {
  if (typeof window === 'undefined') return;
  try {
    const bounded = record.frames.length > MAX_REPLAY_FRAMES
      ? { ...record, frames: downsampleFrames(record.frames, MAX_REPLAY_FRAMES) }
      : record;
    window.localStorage.setItem(REPLAY_STORAGE_KEY, JSON.stringify(bounded));
  } catch (error) {
    // Quota errors must never stop the simulation. Retry with a smaller
    // downsampled record, retaining the start frame and latest frame.
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      try {
        window.localStorage.setItem(
          REPLAY_STORAGE_KEY,
          JSON.stringify({ ...record, frames: downsampleFrames(record.frames, 60) })
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
