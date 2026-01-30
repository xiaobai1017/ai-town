export class Agent {
    constructor(id, name, role, startPos, color, emoji, description = "A resident of AI Town.") {
        this.targetPosition = null;
        this.path = [];
        this.state = 'IDLE';
        this.memory = {};
        this.conversation = null;
        this.conversationTTL = 0;
        this.cash = 0;
        this.bankBalance = 0;
        this.loanBalance = 0; // Outstanding debt to the bank
        this.hunger = 0; // 0 to 100, 100 is starving
        this.health = 100; // 0 to 100, < 100 can be sick
        this.relationships = {}; // agentId -> intimacy level (0-100)
        this.conversationHistory = {}; // agentId -> last few dialogue lines
        this.lastSentiment = null;
        this.blockedTicks = 0; // Tracking how long we have been stuck
        this.transactions = []; // Financial history
        this.livingTicks = 0;
        this.charm = 0; // 0-100, charm level from shopping and social status
        this.lastShoppingAmount = 0; // Track last shopping amount for charm calculation
        this.id = id;
        this.name = name;
        this.role = role;
        this.position = startPos;
        this.color = color;
        this.emoji = emoji;
        this.description = description;
    }
    update(world, agents) {
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
    moveTo(target, world) {
        const path = world.findPath(this.position, target);
        if (path && path.length > 0) {
            this.targetPosition = target;
            this.path = path;
            this.state = 'MOVING';
            this.blockedTicks = 0;
        }
        else {
            console.warn(`${this.name} failed to find path to (${target.x},${target.y})`);
            this.state = 'IDLE';
        }
    }
    move(agents, world) {
        if (this.path.length > 0) {
            const nextStep = this.path[0];
            // Collision detection
            const isOccupied = agents.some(other => other.id !== this.id &&
                other.state !== 'DEAD' && // Dead bodies don't block? Actually maybe they should. But let's say they don't for gameplay.
                other.position.x === nextStep.x &&
                other.position.y === nextStep.y);
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
        }
        else {
            this.state = 'IDLE';
            this.targetPosition = null;
        }
    }
    stop() {
        this.path = [];
        this.targetPosition = null;
        this.state = 'IDLE';
    }
    logTransaction(amount, description, type, timestamp) {
        this.transactions.unshift({ amount, description, type, timestamp });
        // Keep only last 100 transactions to save memory
        if (this.transactions.length > 100) {
            this.transactions.pop();
        }
    }
    // Increase charm based on shopping amount and number of friends
    increaseCharm(shoppingAmount) {
        const charmPer5Units = 1; // 1 charm per $5.00 spent
        const baseCharmGain = Math.min(10, Math.max(1, Math.floor(shoppingAmount / 5) * charmPer5Units));
        // Calculate number of friends (relationships >= 50)
        const friendCount = Object.values(this.relationships).filter(intimacy => intimacy >= 50).length;
        // Additional charm gain from friends
        const friendBonus = Math.min(5, friendCount); // Maximum 5 bonus charm from friends
        const totalCharmGain = baseCharmGain + friendBonus;
        this.charm = Math.min(100, this.charm + totalCharmGain);
        this.lastShoppingAmount = shoppingAmount;
    }
}
