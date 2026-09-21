import { Coordinate, World } from './World';

export type AgentState = 'IDLE' | 'MOVING' | 'WORKING' | 'READING' | 'TALKING' | 'SLEEPING' | 'CRIMINAL' | 'ARRESTED' | 'EATING' | 'BANKING' | 'TREATING' | 'SHOPPING' | 'DEAD';

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
    type: 'income' | 'expense' | 'bank' | 'loan' | 'criminal';
    timestamp: number;
}

export interface JevIntent {
    type: string;
    location?: string;
    reason?: string;
    time: number;
    status: 'thinking' | 'planned' | 'fallback';
}

export interface CharmEvent {
    source: 'shopping' | 'library';
    description: string;
    spent: number; // Money spent during the session (shopping only)
    baseGain: number; // Charm gained from the activity itself
    friendBonus: number; // Charm gained from friend bonus
    gain: number; // Total charm actually applied (baseGain + friendBonus, capped at 100)
    charmBefore: number;
    charmAfter: number;
    timestamp: number; // Game minute when the session started
    lastTimestamp: number; // Game minute of the latest gain in the session
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
    /** State to enter after reaching a planned destination. */
    arrivalState?: AgentState;
    transactions: Transaction[] = []; // Financial history
    sessionFinance?: { amount: number, description: string, type: 'income' | 'expense' | 'bank' | 'loan' };
    sessionLoan?: number; // Aggregating loan repayments during work
    deathCause?: string;
    deathTime?: number;
    livingTicks: number = 0;
    charm: number = 0; // 0-100, charm level from shopping and social status
    /** Charm gain history, newest session first (capped). */
    charmHistory: CharmEvent[] = [];
    /** Latest JEV plan, shown in the resident inspector. */
    jevIntent?: JevIntent;
    lastShoppingAmount: number = 0; // Track last shopping amount for charm calculation
    arrestTime?: number; // Time when agent was arrested

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
            this.state = this.arrivalState || 'IDLE';
            this.targetPosition = null;
            this.arrivalState = undefined;
        }
    }

    stop() {
        this.path = [];
        this.targetPosition = null;
        this.state = 'IDLE';
        this.arrivalState = undefined;
    }

    logTransaction(amount: number, description: string, type: 'income' | 'expense' | 'bank' | 'loan' | 'criminal', timestamp: number) {
        this.transactions.unshift({ amount, description, type, timestamp });
        // Keep only last 100 transactions to save memory
        if (this.transactions.length > 100) {
            this.transactions.pop();
        }
    }

    // Increase charm based on shopping amount and number of friends
    increaseCharm(shoppingAmount: number, timestamp: number = 0) {
        const charmPer5Units = 1; // 1 charm per $5.00 spent
        const baseCharmGain = Math.min(10, Math.max(1, Math.floor(shoppingAmount / 5) * charmPer5Units));

        // Calculate number of friends (relationships >= 50)
        const friendCount = Object.values(this.relationships).filter(intimacy => intimacy >= 50).length;

        // Additional charm gain from friends
        const friendBonusNominal = Math.min(5, friendCount); // Maximum 5 bonus charm from friends

        // Respect the 100 cap so the ledger reflects what was actually applied
        const charmBefore = this.charm;
        const remaining = 100 - charmBefore;
        const appliedBase = Math.min(baseCharmGain, remaining);
        const appliedFriend = Math.min(friendBonusNominal, Math.max(0, remaining - appliedBase));
        const appliedTotal = Math.round((appliedBase + appliedFriend) * 100) / 100;

        this.charm = Math.min(100, Math.round((charmBefore + baseCharmGain + friendBonusNominal) * 100) / 100);
        this.lastShoppingAmount = shoppingAmount;

        pushCharmEvent(this.charmHistory, {
            source: 'shopping',
            description: 'Luxury Shopping',
            spent: shoppingAmount,
            baseGain: appliedBase,
            friendBonus: appliedFriend,
            gain: appliedTotal,
            charmBefore,
            charmAfter: this.charm,
            timestamp
        });
    }

    /** Low-cost charm growth from reading at the Library. */
    increaseLibraryCharm(amount: number = 0.03, timestamp: number = 0) {
        const charmBefore = this.charm;
        const applied = Math.round(Math.min(amount, 100 - charmBefore) * 100) / 100;
        this.charm = Math.min(100, Math.round((charmBefore + amount) * 100) / 100);
        this.lastShoppingAmount = 0;

        pushCharmEvent(this.charmHistory, {
            source: 'library',
            description: 'Library Reading',
            spent: 0,
            baseGain: applied,
            friendBonus: 0,
            gain: applied,
            charmBefore,
            charmAfter: this.charm,
            timestamp
        });
    }
}

/**
 * Append a charm gain, merging it into the latest entry when it belongs to
 * the same continuous activity session (gains fire every game tick).
 */
function pushCharmEvent(history: CharmEvent[], event: Omit<CharmEvent, 'lastTimestamp'>) {
    if (event.gain <= 0) return;

    const SESSION_GAP_MINUTES = 30;
    const last = history[0];
    if (
        last &&
        last.source === event.source &&
        event.timestamp >= last.timestamp &&
        event.timestamp - last.lastTimestamp <= SESSION_GAP_MINUTES
    ) {
        last.spent = Math.round((last.spent + event.spent) * 100) / 100;
        last.baseGain = Math.round((last.baseGain + event.baseGain) * 100) / 100;
        last.friendBonus = Math.round((last.friendBonus + event.friendBonus) * 100) / 100;
        last.gain = Math.round((event.charmAfter - last.charmBefore) * 100) / 100;
        last.charmAfter = event.charmAfter;
        last.lastTimestamp = event.timestamp;
        return;
    }

    history.unshift({ ...event, lastTimestamp: event.timestamp });
    if (history.length > 50) {
        history.pop();
    }
}
