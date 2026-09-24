/**
 * 居民智能体核心类，包含防死锁移动系统、让路机制与紧急脱困
 * @author hubin
 */

import { Coordinate, World } from './World';
import { getOriginalAgentEmoji } from '../data/townScript';

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

export interface DecisionLogEntry {
    type: string;
    source: 'JEV' | 'LOCAL_RULE' | 'SYSTEM';
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
    originalEmoji: string = '🙂';
    conversation: string | null = null;
    conversationTTL: number = 0;
    cash: number = 20.0;
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
    /** Decision log history, newest first (capped). */
    decisionHistory: DecisionLogEntry[] = [];
    lastShoppingAmount: number = 0; // Track last shopping amount for charm calculation
    arrestTime?: number; // Time when agent was arrested

    /**
     * 记录小人决策日志并更新当前意图
     */
    recordDecision(intent: JevIntent, source: 'JEV' | 'LOCAL_RULE' | 'SYSTEM' = intent.type === 'LOCAL_RULE' ? 'LOCAL_RULE' : 'JEV') {
        this.jevIntent = intent;
        if (intent.status !== 'thinking') {
            this.decisionHistory.unshift({
                type: intent.type,
                source,
                location: intent.location,
                reason: intent.reason,
                time: intent.time,
                status: intent.status
            });
            if (this.decisionHistory.length > 50) {
                this.decisionHistory.pop();
            }
        }
    }

    constructor(id: string, name: string, role: string, startPos: Coordinate, color: string, emoji: string, description: string = "A resident of AI Town.") {
        this.id = id;
        this.name = name;
        this.role = role;
        this.position = startPos;
        this.color = color;
        this.originalEmoji = (emoji && emoji !== '🪦') ? emoji : getOriginalAgentEmoji({ name, role, emoji });
        this.emoji = (emoji && emoji !== '🪦') ? emoji : this.originalEmoji;
        this.description = description;
    }

    sanitizeEmoji() {
        if (this.state === 'DEAD') {
            this.emoji = '🪦';
        } else if (this.state === 'CRIMINAL') {
            this.emoji = '🦹';
        } else if (this.state === 'ARRESTED') {
            this.emoji = '⛓️';
        } else if (this.emoji === '🪦' || this.emoji === '🦹' || this.emoji === '⛓️') {
            this.emoji = this.originalEmoji || getOriginalAgentEmoji(this);
        }
    }

    update(world: World, agents: Agent[]) {
        this.sanitizeEmoji();
        if (this.state === 'DEAD') {
            return;
        }

        this.livingTicks++;

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
        if (this.state === 'DEAD') return;
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
        if (this.state === 'DEAD') return;
        if (this.path.length > 0) {
            const nextStep = this.path[0];

            // 碰撞检测：寻找阻挡者
            const blocker = agents.find(other =>
                other.id !== this.id &&
                other.state !== 'DEAD' &&
                other.position.x === nextStep.x &&
                other.position.y === nextStep.y
            );

            if (blocker) {
                this.blockedTicks++;

                // 1. 礼让机制 (Yielding)：如果阻挡者是 IDLE 状态，且阻挡者周围有空位，让阻挡者主动挪一步给赶路/出门人让道
                if (blocker.state === 'IDLE' && this.blockedTicks >= 1) {
                    const yielded = attemptYield(blocker, agents, world);
                    if (yielded) {
                        this.blockedTicks = 0;
                        return;
                    }
                }

                // 2. 动态绕行 (Dynamic Rerouting)：当受阻 >= 2 ticks 且有目标时，避开所有其他静止小人重新寻路
                if (this.blockedTicks >= 2 && this.targetPosition) {
                    const otherPositions = agents
                        .filter(a => a.id !== this.id && a.state !== 'DEAD')
                        .map(a => a.position);
                    const newPath = world.findPath(this.position, this.targetPosition, otherPositions);
                    if (newPath && newPath.length > 0 && (newPath[0].x !== nextStep.x || newPath[0].y !== nextStep.y)) {
                        this.path = newPath;
                        this.blockedTicks = 0;
                        return;
                    }
                }

                // 3. 紧急脱困/软穿透 (Emergency Ghosting)：
                // 若生命垂危（health < 40 或 hunger > 80 急需就医/就餐）且受阻 >= 4 ticks，或任何小人严重受阻 >= 10 ticks
                const isCritical = this.health < 40 || this.hunger > 80;
                if ((isCritical && this.blockedTicks >= 4) || this.blockedTicks >= 10) {
                    // 允许单步穿透脱困，彻底打破死锁
                    this.blockedTicks = 0;
                    this.path.shift();
                    this.position = nextStep;
                    return;
                }

                // 4. 重度拥堵提示与重置
                if (this.blockedTicks >= 25) {
                    this.stop(world, agents);
                    this.conversation = "Too crowded here!";
                    this.conversationTTL = 20;
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

    stop(world?: World, agents?: Agent[]) {
        if (this.state === 'DEAD') return;
        this.path = [];
        this.targetPosition = null;
        this.state = 'IDLE';
        this.arrivalState = undefined;

        // 门口禁停保护：若当前位于建筑门上，尝试挪到旁边非门格子，避免堵门
        if (world && agents) {
            const isOnDoor = world.locations.some(loc => 
                (loc.doors?.some(d => d.x === this.position.x && d.y === this.position.y)) ||
                (loc.entry.x === this.position.x && loc.entry.y === this.position.y)
            );
            if (isOnDoor) {
                attemptYield(this, agents, world);
            }
        }
    }

    logTransaction(amount: number, description: string, type: 'income' | 'expense' | 'bank' | 'loan' | 'criminal', timestamp: number) {
        this.transactions.unshift({ amount, description, type, timestamp });
        // Keep only last 100 transactions to save memory
        if (this.transactions.length > 100) {
            this.transactions.pop();
        }
    }

    // Increase charm based on shopping amount (diminishing returns, encouraging long-term competition over many days)
    increaseCharm(shoppingAmount: number, timestamp: number = 0) {
        // 平滑长线魅力成长模型：兼顾“多花多得魅力”与“游戏多日竞逐”
        // 采用边际效益递减函数，单次高消费获得 2~5 点魅力，单次封顶 6.0 魅力
        // $1 -> 0.42, $5 -> 0.83, $15 -> 1.31, $50 -> 2.17, $80 -> 2.65, $150 -> 3.44, $300 -> 4.60
        const rawCharm = shoppingAmount > 0 ? (Math.pow(shoppingAmount, 0.42) * 0.42) : 0;
        const baseCharmGain = Math.round(Math.min(6.0, rawCharm) * 100) / 100;

        // 好友社交加成：朋友多可带来额外社交声望，每个好友贡献 0.1 魅力加成，上限 0.8
        const friendCount = Object.values(this.relationships).filter(intimacy => intimacy >= 50).length;
        const friendBonusNominal = Math.round(Math.min(0.8, friendCount * 0.1) * 100) / 100;

        // Respect the 100 cap so the ledger reflects what was actually applied
        const charmBefore = this.charm;
        const remaining = 100 - charmBefore;
        const appliedBase = Math.min(baseCharmGain, remaining);
        const appliedFriend = Math.min(friendBonusNominal, Math.max(0, remaining - appliedBase));
        const appliedTotal = Math.round((appliedBase + appliedFriend) * 100) / 100;

        this.charm = Math.min(100, Math.round((charmBefore + baseCharmGain + friendBonusNominal) * 100) / 100);
        this.lastShoppingAmount = shoppingAmount;

        const description = shoppingAmount >= 15.0 ? 'Luxury Shopping' : (shoppingAmount > 0 ? 'Mall Shopping' : 'Window Shopping');

        pushCharmEvent(this.charmHistory, {
            source: 'shopping',
            description,
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

/**
 * 尝试让阻挡者小人主动挪步让出通道
 */
function attemptYield(blocker: Agent, agents: Agent[], world: World): boolean {
    const dirs = [
        { x: 0, y: 1 }, { x: 0, y: -1 }, { x: 1, y: 0 }, { x: -1, y: 0 }
    ];
    // 随机打乱方向避免都往同一方向躲
    for (let i = dirs.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
    }

    for (const d of dirs) {
        const nx = blocker.position.x + d.x;
        const ny = blocker.position.y + d.y;
        if (world.isWalkable(nx, ny)) {
            const occ = agents.some(a => a.state !== 'DEAD' && a.position.x === nx && a.position.y === ny);
            if (!occ) {
                blocker.position = { x: nx, y: ny };
                return true;
            }
        }
    }
    return false;
}
