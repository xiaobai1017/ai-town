/**
 * 权威服务端仿真运行时模块
 * @author hubin
 */

import { BehaviorSystem } from '@/ai/BehaviorSystem';
import { DialogueSystem } from '@/ai/DialogueSystem';
import { initializeWorld } from '@/data/townScript';
import { Agent } from '@/engine/Agent';
import type { GameState } from '@/hooks/useGameLoop';

/** Authoritative server-side simulation. One runtime is kept per Node process. */
export class SimulationRuntime {
  private state: GameState;
  private behavior: BehaviorSystem;
  private dialogue: DialogueSystem;
  private timer?: ReturnType<typeof setInterval>;
  private speed = 1;

  constructor() {
    const { world, agents } = initializeWorld();
    this.behavior = new BehaviorSystem(world);
    this.dialogue = new DialogueSystem();
    this.state = { world, agents, time: 480, isRunning: false, dialogueLog: [], priceLevel: 1, wageLevel: 1, riskLevel: 1, jevEnabled: false, jevCooldown: 30, isReplaying: false };
    this.timer = setInterval(() => this.step(), 100);
  }

  snapshot(): GameState { return this.state; }

  destroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  command(command: { type: string; value?: number | boolean }) {
    if (command.type === 'toggle') this.state.isRunning = !this.state.isRunning;
    if (command.type === 'pause') this.state.isRunning = false;
    if (command.type === 'start') this.state.isRunning = true;
    if (command.type === 'speed' && typeof command.value === 'number') this.speed = Math.max(1, Math.min(20, command.value));
    if (command.type === 'jev' && typeof command.value === 'boolean') {
      this.state.jevEnabled = command.value;
      this.behavior.setJevEnabled(command.value);
    }
    if (command.type === 'jevCooldown' && typeof command.value === 'number') {
      this.state.jevCooldown = Math.max(1, Math.min(120, command.value));
      this.behavior.setJevCooldownMinutes(this.state.jevCooldown);
    }
    if (command.type === 'price' && typeof command.value === 'number') this.state.priceLevel = command.value;
    if (command.type === 'wage' && typeof command.value === 'number') this.state.wageLevel = command.value;
    if (command.type === 'risk' && typeof command.value === 'number') this.state.riskLevel = command.value;
    if (command.type === 'addAgent') this.addAgent();
    if (command.type === 'removeAgent') this.removeAgent();
    if (command.type === 'reset') {
      const { world, agents } = initializeWorld();
      this.behavior = new BehaviorSystem(world);
      this.dialogue = new DialogueSystem();
      this.state = {
        world,
        agents,
        time: 480,
        isRunning: false,
        dialogueLog: [],
        priceLevel: 1,
        wageLevel: 1,
        riskLevel: 1,
        jevEnabled: this.state.jevEnabled,
        jevCooldown: this.state.jevCooldown,
        isReplaying: false
      };
      return this.state;
    }
    return this.state;
  }

  private addAgent() {
    const id = String(this.state.agents.length + 1);
    const agent = new Agent(id, `Resident ${id}`, 'Resident', { x: 10, y: 10 }, '#a0c4ff', '🙂', 'A resident of AI Town.');
    this.state.agents = [...this.state.agents, agent];
  }

  private removeAgent() {
    if (this.state.agents.length <= 1) return;
    const index = [...this.state.agents].reverse().findIndex(agent => agent.role !== 'Police');
    if (index >= 0) this.state.agents = this.state.agents.filter((_, i) => i !== this.state.agents.length - 1 - index);
  }

  private step() {
    if (!this.state.isRunning || !this.state.world) return;
    const steps = Math.max(1, Math.min(20, Math.round(this.speed)));
    for (let i = 0; i < steps && this.state.isRunning; i++) {
      const nextTime = this.state.time + 1;
      this.behavior.setEconomicLevels(this.state.priceLevel, this.state.wageLevel, this.state.riskLevel);
      this.behavior.setJevCooldownMinutes(this.state.jevCooldown);
      this.behavior.update(this.state.agents, nextTime);
      this.state.agents.forEach(agent => agent.update(this.state.world!, this.state.agents));
      this.dialogue.update(this.state.agents, nextTime);
      const ended = this.state.agents.some(agent => agent.charm >= 100) || this.state.agents.every(agent => agent.state === 'DEAD');
      this.state = { ...this.state, time: nextTime, isRunning: ended ? false : this.state.isRunning, dialogueLog: [...this.dialogue.dialogueLog] };
    }
  }
}
