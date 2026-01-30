import { Coordinate, World } from './World';

export type AgentState = 'IDLE' | 'MOVING' | 'WORKING' | 'TALKING' | 'SLEEPING' | 'CRIMINAL' | 'ARRESTED' | 'EATING' | 'BANKING' | 'TREATING' | 'SHOPPING' | 'DEAD';

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

// 使用位掩码优化状态检查
const STATE_FLAGS = {
    NEEDS_ATTENTION: ['EATING', 'TREATING', 'BANKING', 'SHOPPING'],
    MOBILE: ['IDLE', 'MOVING'],
    WORKING_HOURS: ['WORKING', 'MOVING']
};

export class OptimizedAgent {
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
    sessionLoan?: number; // Aggregating loan repayments during work
    deathCause?: string;
    deathTime?: number;
    livingTicks: number = 0;
    charm: number = 0; // 0-100, charm level from shopping and social status
    lastShoppingAmount: number = 0; // Track last shopping amount for charm calculation
    arrestTime?: number; // Time when agent was arrested

    // 优化：缓存常用值
    private _totalWealth: number = 0;
    protected world: World; // 添加对世界的引用，设为 protected 以便子类访问
    
    constructor(id: string, name: string, role: string, startPos: Coordinate, color: string, emoji: string, world: World, description: string = "A resident of AI Town.") {
        this.id = id;
        this.name = name;
        this.role = role;
        this.position = startPos;
        this.color = color;
        this.emoji = emoji;
        this.world = world;
        this.description = description;
        
        // 初始化财富缓存
        this._totalWealth = this.cash + this.bankBalance;
    }

    update(world: any, agents: any) { // 使用 any 类型以保持与原始 Agent 的兼容性
        if (this.state !== 'DEAD') {
            this.livingTicks++;
        }

        // 优化：批量处理状态变化
        this._updateTemporaryStates();
        
        if (this.state === 'MOVING') {
            this.move(agents);
        }
        
        // 更新财富缓存
        this._updateWealthCache();
    }
    
    // 保留优化的更新方法，但命名为不同的名称
    updateOptimized(agents: OptimizedAgent[]) {
        if (this.state !== 'DEAD') {
            this.livingTicks++;
        }

        // 优化：批量处理状态变化
        this._updateTemporaryStates();
        
        if (this.state === 'MOVING') {
            this.move(agents);
        }
        
        // 更新财富缓存
        this._updateWealthCache();
    }
    
    private _updateTemporaryStates() {
        // 优化：合并相似操作
        if (this.conversationTTL > 0) {
            this.conversationTTL--;
            if (this.conversationTTL <= 0) {
                this.conversation = null;
                this.lastSentiment = null;
            }
        }
        
        // 优化饥饿增长：减少浮点运算
        if (this.state !== 'EATING') {
            this.hunger = Math.min(100, this.hunger + 0.02);
        }
    }
    
    private _updateWealthCache() {
        this._totalWealth = this.cash + this.bankBalance;
    }

    // 优化：使用缓存的财富值
    getTotalWealth(): number {
        return this._totalWealth;
    }

    moveTo(target: Coordinate, world?: any) { // 添加可选的 world 参数以保持兼容性
        // 如果提供了 world 参数，则使用它，否则使用 this.world
        const actualWorld = world || this.world;
        const path = actualWorld.findPath(this.position, target);
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

    move(agents: any) { // 使用 any 类型以保持与原始 Agent 的兼容性
        if (this.path.length > 0) {
            const nextStep = this.path[0];

            // 优化：提前返回，减少嵌套
            if (this._isPositionOccupied(nextStep, agents)) {
                this._handleObstacle();
                return;
            }

            // 移动成功
            this._completeMove(nextStep);
        } else {
            this._stopMoving();
        }
    }
    
    // 保留优化的移动方法，但命名为不同的名称
    moveOptimized(agents: OptimizedAgent[]) {
        if (this.path.length > 0) {
            const nextStep = this.path[0];

            // 优化：提前返回，减少嵌套
            if (this._isPositionOccupied(nextStep, agents)) {
                this._handleObstacle();
                return;
            }

            // 移动成功
            this._completeMove(nextStep);
        } else {
            this._stopMoving();
        }
    }
    
    protected _isPositionOccupied(position: Coordinate, agents: OptimizedAgent[]): boolean {
        for (const other of agents) {
            if (other.id !== this.id && 
                other.state !== 'DEAD' && 
                other.position.x === position.x &&
                other.position.y === position.y) {
                return true;
            }
        }
        return false;
    }
    
    private _handleObstacle() {
        this.blockedTicks++;

        // 如果被阻挡太久，尝试重新规划路径
        if (this.blockedTicks > 10 && this.targetPosition) {
            const newPath = this.world.findPath(this.position, this.targetPosition);
            if (newPath) {
                this.path = newPath;
            }
        }

        // 如果仍然被阻挡太久，放弃并重置
        if (this.blockedTicks > 30) {
            this.stop();
            this.conversation = "Too crowded here!";
            this.conversationTTL = 30;
        }
    }
    
    protected _completeMove(nextStep: Coordinate) {
        this.blockedTicks = 0;
        this.path.shift();
        this.position = nextStep;
    }
    
    protected _stopMoving() {
        this.path = [];
        this.targetPosition = null;
        this.state = 'IDLE';
    }

    stop() {
        this.path = [];
        this.targetPosition = null;
        this.state = 'IDLE';
    }

    logTransaction(amount: number, description: string, type: 'income' | 'expense' | 'bank' | 'loan' | 'criminal', timestamp: number) {
        // 优化：使用数组索引而不是 unshift（更高效）
        this.transactions[this.transactions.length] = { amount, description, type, timestamp };
        
        // 保持最后 100 笔交易
        if (this.transactions.length > 100) {
            this.transactions = this.transactions.slice(-100);
        }
    }

    // 优化：提高 charm 计算效率
    increaseCharm(shoppingAmount: number) {
        // 预计算常量
        const CHARM_PER_5_UNITS = 1;
        const MAX_BASE_CHARM_GAIN = 10;
        const MAX_FRIEND_BONUS = 5;
        
        const baseCharmGain = Math.min(MAX_BASE_CHARM_GAIN, Math.max(1, Math.floor(shoppingAmount / 5) * CHARM_PER_5_UNITS));
        
        // 优化：使用 Object.values 而不是 Map 的 values 方法
        let friendCount = 0;
        for (const intimacy of Object.values(this.relationships)) {
            if (intimacy >= 50) friendCount++;
        }
        
        const friendBonus = Math.min(MAX_FRIEND_BONUS, friendCount);
        const totalCharmGain = baseCharmGain + friendBonus;
        
        this.charm = Math.min(100, this.charm + totalCharmGain);
        this.lastShoppingAmount = shoppingAmount;
    }
    
    // 优化：关系管理
    updateRelationship(otherId: string, delta: number) {
        const current = this.relationships[otherId] || 0;
        const newValue = Math.max(0, Math.min(100, current + delta));
        this.relationships[otherId] = newValue;
    }
    
    getRelationship(otherId: string): number {
        return this.relationships[otherId] || 0;
    }
    
    // 优化：会话历史管理
    addToConversationHistory(otherId: string, message: string) {
        let history = this.conversationHistory[otherId];
        if (!history) {
            history = [];
            this.conversationHistory[otherId] = history;
        }
        
        history.push(message);
        if (history.length > 5) {
            history.shift(); // 移除最旧的消息
        }
    }
    
    getConversationHistory(otherId: string): string[] {
        return this.conversationHistory[otherId] || [];
    }
}