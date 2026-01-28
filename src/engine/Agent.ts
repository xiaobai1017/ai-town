import { Coordinate, World } from './World';

export type AgentState = 'IDLE' | 'MOVING' | 'WORKING' | 'TALKING' | 'SLEEPING' | 'CRIMINAL' | 'ARRESTED' | 'EATING' | 'BANKING' | 'TREATING' | 'DEAD';

export interface AgentMemory {
    lastConversion?: { with: string, topic: string, time: number };
    currentGoal?: string;
    locationState?: string; // "I'm at the park"
    lastLocationName?: string;
    lastDiagnosis?: string;
}

export interface Transaction {
    amount: number;
    description: string;
    type: 'income' | 'expense' | 'bank' | 'loan';
    timestamp: number;
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
    cash: number = 0;
    bankBalance: number = 0;
    loanBalance: number = 0; // Outstanding debt to the bank
    hunger: number = 0; // 0 to 100, 100 is starving
    health: number = 100; // 0 to 100, < 100 can be sick
    relationships: Record<string, number> = {}; // agentId -> intimacy level (0-100)
    conversationHistory: Record<string, string[]> = {}; // agentId -> last few dialogue lines
    description: string;
    lastSentiment: 'POS' | 'NEG' | 'NEU' | null = null;
    blockedTicks: number = 0; // Tracking how long we have been stuck
    transactions: Transaction[] = []; // Financial history
    sessionFinance?: { amount: number, description: string, type: 'income' | 'expense' | 'bank' | 'loan' };
    deathCause?: string;
    deathTime?: number;
    livingTicks: number = 0;

    constructor(id: string, name: string, role: string, startPos: Coordinate, color: string, emoji: string, description: string = "A resident of AI Town.") {
        this.id = id;
        this.name = name;
        this.role = role;
        this.position = startPos;
        this.color = color;
        this.emoji = emoji;
        this.description = description;
    }

    update(world: World, agents: Agent[]) {
        if (this.state !== 'DEAD') {
            this.livingTicks++;
        }

        if (this.conversationTTL > 0) {
            this.conversationTTL--;
            if (this.conversationTTL <= 0) {
                this.conversation = null;
                this.lastSentiment = null;
            }
        }

        if (this.state === 'MOVING') {
            this.move(agents, world);
        }
    }

    moveTo(target: Coordinate, world: World) {
        const path = world.findPath(this.position, target);
        if (path && path.length > 0) {
            this.targetPosition = target;
            this.path = path;
            this.state = 'MOVING';
            this.blockedTicks = 0;
        } else {
            console.warn(`${this.name} failed to find path to (${target.x},${target.y})`);
            this.state = 'IDLE';
        }
    }

    move(agents: Agent[], world: World) {
        if (this.path.length > 0) {
            const nextStep = this.path[0];

            // Collision detection
            const isOccupied = agents.some(other =>
                other.id !== this.id &&
                other.state !== 'DEAD' && // Dead bodies don't block? Actually maybe they should. But let's say they don't for gameplay.
                other.position.x === nextStep.x &&
                other.position.y === nextStep.y
            );

            if (isOccupied) {
                this.blockedTicks++;

                // If stuck for too long, try to find another way
                if (this.blockedTicks > 10 && this.targetPosition) {
                    const newPath = world.findPath(this.position, this.targetPosition);
                    if (newPath) {
                        this.path = newPath;
                    }
                }

                // If still stuck for way too long, just give up and reset
                if (this.blockedTicks > 30) {
                    this.stop();
                    this.conversation = "Too crowded here!";
                    this.conversationTTL = 30;
                }
                return;
            }

            // Move successful
            this.blockedTicks = 0;
            this.path.shift();
            this.position = nextStep;
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

    logTransaction(amount: number, description: string, type: 'income' | 'expense' | 'bank' | 'loan', timestamp: number) {
        this.transactions.unshift({ amount, description, type, timestamp });
        // Keep only last 50 transactions to save memory
        if (this.transactions.length > 50) {
            this.transactions.pop();
        }
    }
}
