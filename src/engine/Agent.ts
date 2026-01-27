
import { Coordinate, World } from './World';

export type AgentState = 'IDLE' | 'MOVING' | 'WORKING' | 'TALKING' | 'SLEEPING';

export interface AgentMemory {
    lastConversion?: { with: string, topic: string, time: number };
    currentGoal?: string;
    locationState?: string; // "I'm at the park"
}

export class Agent {
    id: string;
    name: string;
    role: string;
    color: string;
    position: Coordinate;
    targetPosition: Coordinate | null = null;
    path: Coordinate[] = [];
    state: AgentState = 'IDLE';
    memory: AgentMemory = {};
    emoji: string;
    conversation: string | null = null;
    conversationTTL: number = 0;

    constructor(id: string, name: string, role: string, startPos: Coordinate, color: string, emoji: string) {
        this.id = id;
        this.name = name;
        this.role = role;
        this.position = startPos;
        this.color = color;
        this.emoji = emoji;
    }

    update(world: World) {
        if (this.conversationTTL > 0) {
            this.conversationTTL--;
            if (this.conversationTTL <= 0) {
                this.conversation = null;
                // Don't auto-reset state from TALKING here, let BehaviorSystem or DialogueSystem handle it or just let them wander
            }
        }

        if (this.state === 'MOVING') {
            this.move();
        }
        // Other state logic handled by BehaviorSystem
    }

    moveTo(target: Coordinate, world: World) {
        const path = world.findPath(this.position, target);
        if (path && path.length > 0) {
            this.targetPosition = target;
            this.path = path;
            this.state = 'MOVING';
            // console.log(`${this.name} moving to (${target.x}, ${target.y})`);
        } else {
            console.warn(`${this.name} failed to find path from (${this.position.x},${this.position.y}) to (${target.x},${target.y})`);
            this.state = 'IDLE';
        }
    }

    move() {
        if (this.path.length > 0) {
            const nextStep = this.path.shift();
            if (nextStep) {
                this.position = nextStep;
            }
        } else {
            this.state = 'IDLE';
            this.targetPosition = null;
        }
    }

    stop() {
        this.path = [];
        this.targetPosition = null;
        this.state = 'IDLE';
    }
}
