
import { Agent, AgentState } from '../engine/Agent';
import { World, Location } from '../engine/World';

export class BehaviorSystem {
    world: World;

    constructor(world: World) {
        this.world = world;
    }

    update(agents: Agent[], time: number) {
        agents.forEach((agent, index) => {
            this.decideAction(agent, index, time);
        });
    }

    decideAction(agent: Agent, agentIndex: number, time: number) {
        if (agent.state === 'MOVING') return;

        const hour = Math.floor(time / 60) % 24;

        if (hour >= 22 || hour < 8) {
            // SLEEP TIME
            if (agent.state !== 'SLEEPING') {
                this.ensureAtLocation(agent, agentIndex, 'My House', 'SLEEPING');
            }
        } else if (hour >= 8 && hour < 12) {
            // WORK TIME
            if (agent.state !== 'WORKING') {
                this.ensureAtLocation(agent, agentIndex, this.getWorkLocation(agent), 'WORKING');
            }
        } else if (hour >= 12 && hour < 13) {
            // LUNCH
            if (agent.state !== 'IDLE') {
                this.ensureAtLocation(agent, agentIndex, 'Park', 'IDLE');
            }
        } else if (hour >= 13 && hour < 17) {
            // WORK TIME
            if (agent.state !== 'WORKING') {
                this.ensureAtLocation(agent, agentIndex, this.getWorkLocation(agent), 'WORKING');
            }
        } else {
            // FREE TIME
            if (agent.state !== 'IDLE' && agent.state !== 'TALKING') {
                this.ensureAtLocation(agent, agentIndex, 'Park', 'IDLE');
            } else if (agent.state === 'IDLE' && Math.random() < 0.01) {
                this.wander(agent);
            }
        }
    }

    getWorkLocation(agent: Agent): string {
        if (agent.role === 'Baker') return 'Bakery';
        if (agent.role === 'Librarian') return 'Library';
        return 'Library';
    }

    ensureAtLocation(agent: Agent, agentIndex: number, locationName: string, desiredState: 'IDLE' | 'MOVING' | 'WORKING' | 'TALKING' | 'SLEEPING') {
        const location = this.world.locations.find(l => l.name === locationName || l.type === locationName.toLowerCase())
            || this.world.locations[0];

        if (!location) return;

        let target = location.interior || location.entry;

        // If interior is available and it's a building, distribute agents
        if (location.interior && location.width && location.height) {
            const innerW = location.width - 2;
            const innerH = location.height - 2;
            const offsetX = (agentIndex % innerW) - Math.floor(innerW / 2);
            const offsetY = (Math.floor(agentIndex / innerW) % innerH) - Math.floor(innerH / 2);

            target = {
                x: location.interior.x + offsetX,
                y: location.interior.y + offsetY
            };
        }

        if (this.isAt(agent, target)) {
            agent.state = desiredState;
        } else {
            agent.moveTo(target, this.world);
        }
    }

    isAt(agent: Agent, target: { x: number, y: number }): boolean {
        return agent.position.x === target.x && agent.position.y === target.y;
    }

    wander(agent: Agent) {
        const randomLoc = this.world.locations[Math.floor(Math.random() * this.world.locations.length)];
        if (randomLoc) {
            agent.moveTo(randomLoc.entry, this.world);
        }
    }
}
