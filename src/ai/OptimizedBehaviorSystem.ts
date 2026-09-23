/**
 * 优化版行为系统模块
 * @author hubin
 */

import { OptimizedAgent, AgentState } from '../engine/OptimizedAgent';
import { CompatibleOptimizedWorld as OptimizedWorld, Location, Coordinate } from '../engine/CompatibleOptimizedWorld';

// 地形类型掩码 - 需要与 OptimizedWorld 中的定义一致
const TILE_TYPE_MASKS = {
    GRASS: 0b0001,
    ROAD: 0b0010,
    WALL: 0b0100,
    FLOOR: 0b1000
};

// 预定义常量，避免重复计算
const CONSTANTS = {
    STARVATION_THRESHOLD_NORMAL: 20,
    STARVATION_THRESHOLD_POOR: 70,
    HOSPITAL_COST_MULTIPLIER: 0.2,
    RESTAURANT_COST_MULTIPLIER: 0.05,
    BAKERY_COST_MULTIPLIER: 0.03,
    HOME_COST_MULTIPLIER: 0.01,
    MIN_DEPOSIT_THRESHOLD_NORMAL: 100,
    MIN_DEPOSIT_THRESHOLD_WEALTHY: 50,
    LOAN_INTEREST_RATE: 0.0005,
    DEPOSIT_INTEREST_RATE: 0.0001,
    CHARM_INCREASE_PER_5_UNITS: 1,
    MAX_CHARM_FROM_FRIENDS: 5,
    MIN_SHOPPING_AMOUNT: 5.0,
    MIN_LOAN_REPAYMENT_FRACTION: 0.2,
    MAX_CHARM_GAIN: 10,
    POLICE_ARREST_DISTANCE: 1,
    CRIME_CHANCE: 0.001,
    DEATH_CHECK_CHANCE: 0.001,
    SICKNESS_CHANCE: 0.00002,
    CRITICAL_EVENT_CHANCE: 0.000005,
    ACCIDENT_CHANCE: 0.000002,
    WEALTHY_AGENT_SHOPPING_CHANCE: 0.1,
    WEALTHY_AGENT_MIN_THRESHOLD: 100,
    BASIC_NEEDS_MET_HUNGER: 30,
    BASIC_NEEDS_MET_HEALTH: 80,
    HEALTH_TREATMENT_THRESHOLD: 70,
    HUNGER_EATING_PRIORITY_THRESHOLD: 30,
    CHARM_SHOPPING_MIN_THRESHOLD: 5,
    CHARM_MAX: 100
};

export class OptimizedBehaviorSystem {
    world: OptimizedWorld;
    priceMultiplier: number = 1.0;
    wageMultiplier: number = 1.0;
    riskMultiplier: number = 1.0; // 控制事故/疾病概率
    
    // 缓存常用位置，避免重复查找
    private cachedLocations: Map<string, Location> = new Map();

    constructor(world: OptimizedWorld) {
        this.world = world;
        this._cacheLocations();
    }
    
    private _cacheLocations() {
        for (const location of this.world.locations) {
            this.cachedLocations.set(location.name, location);
        }
    }

    setEconomicLevels(price: number, wage: number, risk: number) {
        this.priceMultiplier = price;
        this.wageMultiplier = wage;
        this.riskMultiplier = risk;
    }

    update(agents: OptimizedAgent[], time: number) {
        // 优化：批量处理警察和罪犯
        this._handleLawEnforcement(agents);
        
        // 优化：批量处理代理更新
        for (const agent of agents) {
            if (agent.state === 'DEAD') continue;
            
            this._updateAgentState(agent, time, agents);
        }
    }
    
    private _handleLawEnforcement(agents: OptimizedAgent[]) {
        // 分离警察和罪犯，减少嵌套循环
        const police: OptimizedAgent[] = [];
        const criminals: OptimizedAgent[] = [];
        
        for (const agent of agents) {
            if (agent.role === 'Police') {
                police.push(agent);
            } else if (agent.state === 'CRIMINAL') {
                criminals.push(agent);
            }
        }
        
        // 检查逮捕
        for (const officer of police) {
            for (const criminal of criminals) {
                const dist = Math.abs(officer.position.x - criminal.position.x) +
                           Math.abs(officer.position.y - criminal.position.y);
                
                if (dist <= CONSTANTS.POLICE_ARREST_DISTANCE) {
                    criminal.state = 'ARRESTED';
                    criminal.conversation = "Oh no! I'm caught!";
                    criminal.conversationTTL = 50;
                    officer.conversation = "You're under arrest!";
                    officer.conversationTTL = 50;
                }
            }
        }
    }
    
    private _updateAgentState(agent: OptimizedAgent, time: number, agents: OptimizedAgent[]) {
        // 更新位置相关的统计数据
        this._updateLocationStats(agent);
        
        // 处理工作收入
        this._handleIncome(agent, time);
        
        // 处理饥饿系统
        this._handleHunger(agent, time);
        
        // 处理购物
        this._handleShopping(agent, time);
        
        // 处理医疗
        this._handleMedical(agent, time);
        
        // 处理银行业务
        this._handleBanking(agent, time);
        
        // 处理健康和疾病
        this._handleHealth(agent, time);
        
        // 处理意外事件
        this._handleAccidents(agent, time);
        
        // 处理死亡
        this._handleDeath(agent, time);
        
        // 处理银行利息
        this._handleBankInterest(agent, time);
        
        // 决策行动
        this._decideAction(agent, agents.indexOf(agent), time, agents);
    }
    
    private _updateLocationStats(agent: OptimizedAgent) {
        const locAt = this.world.locations.find(loc =>
            loc.x !== undefined && loc.y !== undefined && loc.width !== undefined && loc.height !== undefined &&
            agent.position.x >= loc.x && agent.position.x < loc.x + loc.width &&
            agent.position.y >= loc.y && agent.position.y < loc.y + loc.height
        );

        if (locAt) {
            if (agent.memory.lastLocationName !== locAt.name) {
                locAt.stats.visits++;
                agent.memory.lastLocationName = locAt.name;
            }
        } else {
            agent.memory.lastLocationName = undefined;
        }
    }
    
    private _handleIncome(agent: OptimizedAgent, time: number) {
        if (agent.state === 'WORKING') {
            const grossIncome = this._getIncome(agent);
            let actualIncome = grossIncome;

            // 贷款还款：收入的20%用于还贷
            if (agent.loanBalance > 0) {
                const repayment = Math.min(agent.loanBalance, grossIncome * CONSTANTS.MIN_LOAN_REPAYMENT_FRACTION);
                agent.loanBalance -= repayment;
                actualIncome -= repayment;
                agent.sessionLoan = (agent.sessionLoan || 0) + repayment;

                // 立即记录到银行（如果需要实时银行统计）
                const bank = this.cachedLocations.get('Bank');
                if (bank) {
                    bank.stats.revenue += repayment;
                }
            }
            
            agent.cash += actualIncome;

            if (!agent.sessionFinance || agent.sessionFinance.type !== 'income') {
                agent.sessionFinance = { amount: 0, description: `Work (${agent.role})`, type: 'income' };
            }
            agent.sessionFinance.amount += grossIncome;
        } else {
            // 结束工作会话记录
            if (agent.sessionFinance && agent.sessionFinance.type === 'income') {
                agent.logTransaction(agent.sessionFinance.amount, agent.sessionFinance.description, 'income', time);
                agent.sessionFinance = undefined;

                if (agent.sessionLoan && agent.sessionLoan > 0) {
                    agent.logTransaction(agent.sessionLoan, "Loan repayment (Automatic)", 'loan', time);
                    const bank = this.cachedLocations.get('Bank');
                    if (bank) this._logBuildingTransaction(bank, agent.sessionLoan, `Loan repayment from ${agent.name}`, time);
                    agent.sessionLoan = 0;
                }
            }
        }
    }
    
    private _handleHunger(agent: OptimizedAgent, time: number) {
        if (agent.state === 'EATING') {
            agent.hunger = Math.max(0, agent.hunger - 6.0); // 更快恢复
            agent.health = Math.min(100, agent.health + 0.2); // 进食时恢复健康

            // 根据地点确定费用
            let cost = CONSTANTS.RESTAURANT_COST_MULTIPLIER * this.priceMultiplier;
            const locAt = this._getLocationAt(agent.position);
            if (locAt?.name === 'Bakery') cost = CONSTANTS.BAKERY_COST_MULTIPLIER * this.priceMultiplier;
            if (locAt?.name === 'My House') cost = CONSTANTS.HOME_COST_MULTIPLIER * this.priceMultiplier;

            let hasPaid = false;
            if (agent.cash >= cost) {
                agent.cash -= cost;
                hasPaid = true;
            } else if (agent.getTotalWealth() >= cost) {
                agent.bankBalance -= cost;
                hasPaid = true;
            }

            if (hasPaid) {
                // Preserve the concrete venue (including Bakery) in both the
                // resident ledger and the building's revenue ledger.
                this._handlePaymentAtLocation(locAt, agent, cost, 'Food', time);
            }

            if (agent.getTotalWealth() < cost) {
                // 如果太贵，尝试更便宜的地方
                if (locAt?.name === 'Restaurant' || locAt?.name === 'Bakery') {
                    agent.state = 'IDLE';
                    agent.conversation = "Too expensive here! I need something cheaper.";
                    agent.conversationTTL = 30;
                } else {
                    agent.state = 'IDLE';
                    agent.conversation = "I'm completely broke and starving!";
                    agent.conversationTTL = 50;
                }
            } else if (agent.hunger === 0) {
                agent.state = 'IDLE';
                agent.conversation = "I'm full!";
                agent.conversationTTL = 50;
            }
        } else {
            // 结束进食会话
            if (agent.sessionFinance && agent.sessionFinance.type === 'expense' && agent.sessionFinance.description.startsWith('Food')) {
                this._finalizeExpenseSession(agent, agent.sessionFinance, 'expense', time);
            }
        }
    }
    
    private _handleShopping(agent: OptimizedAgent, time: number) {
        if (agent.state === 'SHOPPING') {
            const luxuryCost = Math.max(CONSTANTS.MIN_SHOPPING_AMOUNT, 0.5 * this.priceMultiplier); // 最低$5.00消费
            let hasPaid = false;
            
            if (agent.cash >= luxuryCost) {
                agent.cash -= luxuryCost;
                hasPaid = true;
            } else if (agent.getTotalWealth() >= luxuryCost) {
                agent.bankBalance -= luxuryCost;
                hasPaid = true;
            }

            if (hasPaid) {
                agent.health = Math.min(100, agent.health + 0.5); // 奢侈护理
                const locAt = this._getLocationAt(agent.position);
                
                if (locAt) {
                    locAt.stats.revenue += luxuryCost;
                    if (!locAt.stats.sessionRevenue) locAt.stats.sessionRevenue = {};
                    locAt.stats.sessionRevenue[agent.id] = (locAt.stats.sessionRevenue[agent.id] || 0) + luxuryCost;
                }
                
                if (!agent.sessionFinance || agent.sessionFinance.type !== 'expense' || agent.sessionFinance.description !== 'Luxury Shopping') {
                    agent.sessionFinance = { amount: 0, description: 'Luxury Shopping', type: 'expense' };
                }
                agent.sessionFinance.amount -= luxuryCost;

                // 魅力系统：根据消费金额增加魅力
                agent.increaseCharm(luxuryCost);
                
                if (Math.random() < 0.05) {
                    agent.state = 'IDLE';
                    agent.conversation = `Great shopping! My charm is now ${Math.round(agent.charm)}!`;
                    agent.conversationTTL = 50;
                }
            } else {
                agent.state = 'IDLE';
                agent.conversation = "Too expensive! I'm out of here.";
                agent.conversationTTL = 50;
            }
        } else {
            // 结束购物会话
            if (agent.sessionFinance && agent.sessionFinance.type === 'expense' && agent.sessionFinance.description === 'Luxury Shopping') {
                this._finalizeExpenseSession(agent, agent.sessionFinance, 'expense', time);
                const mall = this.cachedLocations.get('Mall');
                if (mall && mall.stats.sessionRevenue && mall.stats.sessionRevenue[agent.id]) {
                    this._logBuildingTransaction(mall, mall.stats.sessionRevenue[agent.id], `Sales to ${agent.name}`, time);
                    delete mall.stats.sessionRevenue[agent.id];
                }
                agent.sessionFinance = undefined;
            }
        }
    }
    
    private _handleMedical(agent: OptimizedAgent, time: number) {
        if (agent.state === 'TREATING') {
            agent.health = Math.min(100, agent.health + 1.0);
            const cost = CONSTANTS.HOSPITAL_COST_MULTIPLIER * this.priceMultiplier;
            let hasPaid = false;
            
            if (agent.cash >= cost) {
                agent.cash -= cost;
                hasPaid = true;
            } else if (agent.getTotalWealth() >= cost) {
                agent.bankBalance -= cost;
                hasPaid = true;
            }

            if (hasPaid) {
                const hospital = this.cachedLocations.get('Hospital');
                if (hospital) {
                    hospital.stats.revenue += cost;
                    this._logBuildingTransaction(hospital, cost, `Treatment consumption from ${agent.name}`, time);
                }

                if (!agent.sessionFinance || agent.sessionFinance.description !== 'Hospital Treatment') {
                    agent.sessionFinance = { amount: 0, description: 'Hospital Treatment', type: 'expense' };
                }
                agent.sessionFinance.amount -= cost;
            }

            if (agent.getTotalWealth() < cost) {
                agent.state = 'IDLE';
                agent.conversation = "I can't afford treatment anymore!";
                agent.conversationTTL = 50;
            } else if (agent.health === 100) {
                agent.state = 'IDLE';
                agent.conversation = "I feel much better now!";
                agent.conversationTTL = 50;
            }
        } else {
            // 结束治疗会话
            if (agent.sessionFinance && agent.sessionFinance.description === 'Hospital Treatment') {
                this._finalizeExpenseSession(agent, agent.sessionFinance, 'expense', time);
                const hospital = this.cachedLocations.get('Hospital');
                if (hospital?.stats.sessionRevenue) delete hospital.stats.sessionRevenue[agent.id];
                agent.sessionFinance = undefined;
            }
        }
    }
    
    private _handleBanking(agent: OptimizedAgent, time: number) {
        if (agent.state === 'BANKING') {
            const bank = this.cachedLocations.get('Bank');
            if (bank) {
                const needsEmergencyLoan = (agent.health < 70 || agent.hunger > 80) && agent.cash < 10 && agent.bankBalance < 20;

                if (needsEmergencyLoan) {
                    // 获得救命贷款
                    const loanAmount = 50;
                    agent.loanBalance += loanAmount;
                    agent.cash += loanAmount;
                    agent.logTransaction(loanAmount, "Emergency Bank Loan", 'loan', time);
                    this._logBuildingTransaction(bank, loanAmount, `Emergency Loan to ${agent.name}`, time);
                    agent.conversation = agent.health < 70 ? "Bank gave me a life-saving loan for health!" : "Bank gave me a loan so I don't starve!";
                    if (bank.stats.extra) {
                        if (!bank.stats.extra.loans) bank.stats.extra.loans = 0;
                        bank.stats.extra.loans += loanAmount;
                    }
                } else if (agent.health < 70 && agent.cash < 10 && agent.bankBalance >= 20) {
                    // 为治疗取款
                    agent.bankBalance -= 20;
                    agent.cash += 20;
                    agent.logTransaction(20, "Withdraw for bills", 'bank', time);
                    this._logBuildingTransaction(bank, -20, `Withdrawal (Health) by ${agent.name}`, time);
                    if (bank.stats.extra) bank.stats.extra.withdrawals += 20;
                    agent.conversation = "Withdrew money for medical bills!";
                } else if (agent.bankBalance >= 50 && agent.cash < 5 && Math.random() < 0.05) {
                    // 定期取款：很少发生，仅当几乎没有现金时
                    const amount = 50;
                    agent.bankBalance -= amount;
                    agent.cash += amount;
                    agent.logTransaction(amount, "Bank Withdrawal", 'bank', time);
                    this._logBuildingTransaction(bank, -amount, `Regular Withdrawal by ${agent.name}`, time);
                    if (bank.stats.extra) bank.stats.extra.withdrawals += amount;
                    agent.conversation = "Withdrew some cash for future needs.";
                } else {
                    // Deposit surplus cash while preserving a small operating reserve.
                    const depositReserve = Math.max(1, CONSTANTS.MIN_DEPOSIT_THRESHOLD_NORMAL * this.priceMultiplier);
                    const depositAmount = Math.max(0, Math.floor((agent.cash - depositReserve) * 100) / 100);
                    if (depositAmount >= 1) {
                        agent.cash -= depositAmount;
                        agent.bankBalance += depositAmount;
                        agent.logTransaction(-depositAmount, "Deposit to Savings", 'bank', time);
                        this._logBuildingTransaction(bank, depositAmount, `Deposit from ${agent.name}`, time);
                        if (!bank.stats.extra) bank.stats.extra = { deposits: 0, withdrawals: 0, loans: 0 };
                        bank.stats.extra.deposits = (bank.stats.extra.deposits || 0) + depositAmount;
                        agent.conversation = `Deposited $${depositAmount.toFixed(2)} for a safer future.`;
                    }
                }
                agent.state = 'IDLE';
                agent.conversationTTL = 50;
            }
        }
    }
    
    private _handleHealth(agent: OptimizedAgent, time: number) {
        // 健康衰减（如果没有接受治疗）
        if (agent.health < 100) {
            agent.health = Math.max(0, agent.health - 0.02);
        }
        
        // 有机会生病
        if (agent.health === 100 && Math.random() < CONSTANTS.SICKNESS_CHANCE * this.riskMultiplier) {
            agent.health = 30;
            const illnesses = ["Severe Infection", "Respiratory Flu", "Food Poisoning"];
            const illness = illnesses[Math.floor(Math.random() * illnesses.length)];
            agent.memory.lastDiagnosis = illness;
            agent.conversation = `I think I have ${illness}...`;
            agent.conversationTTL = 50;
        }

        // 罕见的突发严重健康事件
        if (agent.health > 80 && Math.random() < CONSTANTS.CRITICAL_EVENT_CHANCE * this.riskMultiplier) {
            agent.health = 5;
            agent.memory.lastDiagnosis = "Cardiac Event";
            agent.conversation = "My chest... it hurts!";
            agent.conversationTTL = 80;
        }
    }
    
    private _handleAccidents(agent: OptimizedAgent, time: number) {
        // 检查位置是否在建筑物内
        const locAt = this._getLocationAt(agent.position);
        if (!locAt && Math.random() < CONSTANTS.ACCIDENT_CHANCE * this.riskMultiplier) {
            const accidents = ["Traffic Accident", "Industrial Mishap", "Struck by Lightning"];
            agent.state = 'DEAD';
            agent.emoji = '🪦';
            agent.deathTime = time;
            agent.deathCause = accidents[Math.floor(Math.random() * accidents.length)];
            agent.conversation = `Tragedy: ${agent.deathCause}`;
            agent.conversationTTL = 999999;
            console.log(`TRAGEDY: Agent ${agent.name} died in a ${agent.deathCause}.`);
        }
    }
    
    private _handleDeath(agent: OptimizedAgent, time: number) {
        // 饥饿导致的死亡
        if (agent.hunger >= 100) {
            agent.health = Math.max(0, agent.health - 0.1); // 饥饿时更快衰减
        }

        if (agent.health <= 0) {
            agent.health = 0;
            if (Math.random() < CONSTANTS.DEATH_CHECK_CHANCE) { // 0.1% 概率死亡
                agent.state = 'DEAD';
                agent.emoji = '🪦';
                agent.deathTime = time;
                
                if (agent.hunger >= 99.9) {
                    agent.deathCause = "Starvation";
                } else if (agent.memory.lastDiagnosis) {
                    agent.deathCause = "Untreated " + agent.memory.lastDiagnosis;
                } else {
                    agent.deathCause = "Chronic Illness";
                }

                agent.conversation = `RIP (${agent.deathCause})`;
                agent.conversationTTL = 999999;
                console.log(`Agent ${agent.name} has passed away due to ${agent.deathCause}.`);
            }
        }
    }
    
    private _handleBankInterest(agent: OptimizedAgent, time: number) {
        // 存款利息：每游戏小时（60次循环）
        if (time % 60 === 0) {
            if (agent.bankBalance > 0) {
                const interest = agent.bankBalance * CONSTANTS.DEPOSIT_INTEREST_RATE;
                if (interest >= 0.01) { // 最低$0.01利息
                    agent.bankBalance += interest;
                    agent.logTransaction(interest, "Bank Interest Earned", 'bank', time);
                    const bank = this.cachedLocations.get('Bank');
                    if (bank) this._logBuildingTransaction(bank, -interest, `Interest Paid to ${agent.name}`, time);
                }
            }

            // 贷款利息
            if (agent.loanBalance > 0) {
                const loanInterest = agent.loanBalance * CONSTANTS.LOAN_INTEREST_RATE;
                if (loanInterest >= 0.01) {
                    agent.loanBalance += loanInterest;
                    agent.logTransaction(-loanInterest, "Loan Interest Accrued", 'loan', time);
                    const bank = this.cachedLocations.get('Bank');
                    if (bank) this._logBuildingTransaction(bank, loanInterest, `Loan Interest from ${agent.name}`, time);
                }
            }
        }
    }
    
    private _decideAction(agent: OptimizedAgent, agentIndex: number, time: number, allAgents: OptimizedAgent[]) {
        const totalWealth = agent.getTotalWealth();

        // 最高优先级：如果被逮捕，强制前往警察局
        if (agent.state === 'ARRESTED') {
            this._ensureAtLocation(agent, agentIndex, 'Police Station', 'SLEEPING', allAgents); // 使用睡觉作为"坐牢"
            if (Math.random() < 0.005) { // 有机会获释
                agent.state = 'IDLE';
                agent.conversation = "I've served my time.";
                agent.conversationTTL = 50;
            }
            return;
        }

        const hour = Math.floor(time / 60) % 24;
        const isBankOpen = hour >= 9 && hour < 18;

        if (agent.state === 'BANKING') {
            if (!isBankOpen) {
                agent.state = 'IDLE';
                agent.conversation = "Bank's closed. I'll come back tomorrow.";
                agent.conversationTTL = 50;
            } else {
                this._ensureAtLocation(agent, agentIndex, 'Bank', 'BANKING', allAgents);
                return;
            }
        }

        // 低机会犯罪（如果不是警察）
        if (agent.role !== 'Police' && agent.state === 'IDLE' && Math.random() < CONSTANTS.CRIME_CHANCE) {
            agent.state = 'CRIMINAL';
            agent.conversation = "Time for some mischief...";
            agent.conversationTTL = 50;
        }

        // 极度饥饿逻辑：最高优先级 - 始终优先在饥饿时进食（中断移动）
        const starvationThreshold = totalWealth >= (1.0 * this.priceMultiplier) ? CONSTANTS.STARVATION_THRESHOLD_NORMAL : CONSTANTS.STARVATION_THRESHOLD_POOR;
        if (agent.hunger > starvationThreshold && agent.state !== 'SLEEPING') {
            const restaurantCost = CONSTANTS.RESTAURANT_COST_MULTIPLIER * this.priceMultiplier;
            const bakeryCost = CONSTANTS.BAKERY_COST_MULTIPLIER * this.priceMultiplier;
            const homeCost = CONSTANTS.HOME_COST_MULTIPLIER * this.priceMultiplier;

            if (totalWealth >= restaurantCost) {
                this._ensureAtLocation(agent, agentIndex, 'Restaurant', 'EATING', allAgents);
                return;
            } else if (totalWealth >= bakeryCost) {
                this._ensureAtLocation(agent, agentIndex, 'Bakery', 'EATING', allAgents);
                return;
            } else if (totalWealth >= homeCost) {
                this._ensureAtLocation(agent, agentIndex, 'My House', 'EATING', allAgents);
                return;
            } else if (isBankOpen && (agent.bankBalance >= (5 * this.priceMultiplier) || agent.loanBalance < 200)) {
                // 最后手段：如果买不起任何食物，必须去银行贷款
                agent.state = 'BANKING';
                agent.conversation = "I'm hungry but broke. Need a loan!";
                agent.conversationTTL = 50;
                this._ensureAtLocation(agent, agentIndex, 'Bank', 'BANKING', allAgents);
                return;
            }
        }

        // 健康优先逻辑：如果健康状况不佳，优先恢复而非工作/休闲
        if (agent.health < CONSTANTS.HEALTH_TREATMENT_THRESHOLD && agent.state !== 'SLEEPING') {
            const hospitalCost = CONSTANTS.HOSPITAL_COST_MULTIPLIER * this.priceMultiplier;
            // 优先级1：医院（最快恢复）
            if (totalWealth >= hospitalCost) {
                this._ensureAtLocation(agent, agentIndex, 'Hospital', 'TREATING', allAgents);
                return;
            }
            // 优先级2：进食（中等恢复+防止衰减）
            const restaurantCost = CONSTANTS.RESTAURANT_COST_MULTIPLIER * this.priceMultiplier;
            if (totalWealth >= restaurantCost) {
                this._ensureAtLocation(agent, agentIndex, 'Restaurant', 'EATING', allAgents);
                return;
            }

            // 优先级3：银行（获得资金或贷款用于健康）- 如果买不起护理必须去银行
            if (isBankOpen && (agent.bankBalance >= 20 || agent.loanBalance < 200)) {
                agent.state = 'BANKING';
                agent.conversation = "I need money for medical treatment. To the bank!";
                agent.conversationTTL = 50;
                this._ensureAtLocation(agent, agentIndex, 'Bank', 'BANKING', allAgents);
                return;
            }
        }

        // 魅力系统：有钱的代理优先购物增加魅力
        const isWealthy = totalWealth >= CONSTANTS.WEALTHY_AGENT_MIN_THRESHOLD * this.priceMultiplier;
        const hasBasicNeedsMet = agent.hunger < CONSTANTS.BASIC_NEEDS_MET_HUNGER && agent.health > CONSTANTS.BASIC_NEEDS_MET_HEALTH;
        const isCharmSeeker = isWealthy && hasBasicNeedsMet && agent.charm < CONSTANTS.CHARM_MAX;
        
        if (isCharmSeeker && agent.state !== 'WORKING' && agent.state !== 'SLEEPING' && Math.random() < CONSTANTS.WEALTHY_AGENT_SHOPPING_CHANCE) {
            agent.state = 'SHOPPING';
            agent.conversation = "Time to shop and increase my charm!";
            agent.conversationTTL = 50;
            this._ensureAtLocation(agent, agentIndex, 'Mall', 'SHOPPING', allAgents);
            return;
        }

        // 财务管理：只有在富裕时才存款以减少频率
        // Saving is a deterministic financial rule, not a rare random event.
        const depositChance = 1;
        const depositThreshold = isWealthy ? CONSTANTS.MIN_DEPOSIT_THRESHOLD_WEALTHY : CONSTANTS.MIN_DEPOSIT_THRESHOLD_NORMAL;

        if (isBankOpen && agent.cash >= depositThreshold && agent.hunger < 20 && agent.health > 90 &&
            Math.random() < depositChance && agent.state !== 'WORKING' && agent.state !== 'SLEEPING') {
            agent.state = 'BANKING';
            agent.conversation = isWealthy ? "Need to manage my growing capital." : "Better deposit this extra cash.";
            agent.conversationTTL = 50;
            this._ensureAtLocation(agent, agentIndex, 'Bank', 'BANKING', allAgents);
            return;
        }

        // 低优先级检查：如果已经在移动到常规目的地，不要中断除非极度饥饿
        const criticalHunger = totalWealth >= (1.0 * this.priceMultiplier) ? CONSTANTS.HUNGER_EATING_PRIORITY_THRESHOLD : 80;
        if (agent.state === 'MOVING' && agent.hunger < criticalHunger) return;

        if (hour >= 22 || hour < 8) {
            // 睡眠时间
            if (agent.state !== 'SLEEPING') {
                this._ensureAtLocation(agent, agentIndex, 'My House', 'SLEEPING', allAgents);
            }
        } else if (hour >= 8 && hour < 12) {
            // 工作时间
            if (agent.state !== 'WORKING') {
                this._ensureAtLocation(agent, agentIndex, this._getWorkLocation(agent), 'WORKING', allAgents);
            }
        } else if (hour >= 12 && hour < 13) {
            // 午餐 - 根据索引错开开始时间（最多15分钟）
            const minuteOffset = (agentIndex * 3) % 15;
            const currentMinute = time % 60;

            if (currentMinute >= minuteOffset && agent.state !== 'IDLE') {
                this._ensureAtLocation(agent, agentIndex, this._getLeisureLocation(agentIndex), 'IDLE', allAgents);
            }
        } else if (hour >= 13 && hour < 17) {
            // 下午工作时间
            if (agent.state !== 'WORKING') {
                this._ensureAtLocation(agent, agentIndex, this._getWorkLocation(agent), 'WORKING', allAgents);
            }
        } else if (hour >= 17 && hour < 22) {
            // 休闲时间
            if (agent.state !== 'IDLE' && agent.state !== 'SHOPPING') {
                const loc = this._getLeisureLocation(agentIndex, agent);
                const desState = loc === 'Mall' ? 'SHOPPING' : 'IDLE';
                this._ensureAtLocation(agent, agentIndex, loc, desState, allAgents);
            }
        } else {
            // 空闲时间（剩余小时，例如22-23, 0-7 如果不是在睡觉）
            if (agent.state !== 'IDLE' && agent.state !== 'TALKING' && agent.state !== 'EATING' && agent.state !== 'SHOPPING') {
                this._ensureAtLocation(agent, agentIndex, this._getLeisureLocation(agentIndex + 1, agent), 'IDLE', allAgents);
            } else if (agent.state === 'IDLE' && Math.random() < 0.02) {
                this._wander(agent);
            }
        }
    }
    
    private _getWorkLocation(agent: OptimizedAgent): string {
        if (agent.role === 'Baker') return 'Bakery';
        if (agent.role === 'Librarian') return 'Library';
        if (agent.role === 'Police') return 'Police Station';
        if (agent.role === 'Doctor') return 'Hospital';
        if (agent.role === 'Gardener') return 'Park';
        if (agent.role === 'Artist') return 'Park';
        if (agent.role === 'Mayor') return 'Library';
        return 'Park';
    }

    private _getIncome(agent: OptimizedAgent): number {
        let baseIncome = 0.1;
        switch (agent.role) {
            case 'Mayor': baseIncome = 0.5; break;
            case 'Doctor': baseIncome = 0.4; break;
            case 'Police': baseIncome = 0.3; break;
            case 'Librarian': baseIncome = 0.2; break;
            case 'Baker': baseIncome = 0.2; break;
            case 'Gardener': baseIncome = 0.1; break;
            default: baseIncome = 0.1; break;
        }
        return baseIncome * this.wageMultiplier;
    }

    private _getLeisureLocation(index: number, agent?: OptimizedAgent): string {
        const totalWealth = agent ? agent.getTotalWealth() : 0;
        const isWealthy = totalWealth > CONSTANTS.WEALTHY_AGENT_MIN_THRESHOLD * this.priceMultiplier;

        const locations = ['Park', 'Library', 'Bakery', 'Restaurant'];
        if (isWealthy && Math.random() < 0.7) return 'Mall'; // 富人喜欢商场

        return locations[index % locations.length];
    }
    
    private _ensureAtLocation(agent: OptimizedAgent, agentIndex: number, locationName: string, desiredState: AgentState, allAgents: OptimizedAgent[]) {
        const location = this.cachedLocations.get(locationName) || this.world.locations[0];
        if (!location) return;

        let target = location.interior || location.entry;

        // 如果是内部有空间的建筑物，找一个好位置
        if (location.interior && location.width && location.height) {
            // 优先：尝试在内部找到空闲瓦片
            let foundFree = false;
            const innerX = location.x! + 1;
            const innerY = location.y! + 1;
            const innerW = location.width - 2;
            const innerH = location.height - 2;

            // 螺旋或随机搜索内部的空闲瓦片
            for (let attempt = 0; attempt < 10; attempt++) {
                const tx = innerX + Math.floor(Math.random() * innerW);
                const ty = innerY + Math.floor(Math.random() * innerH);

                // 不站在门的瓦片上
                if (tx === location.entry.x && ty === location.entry.y) continue;

                const tileType = this.world._getTile(ty, tx);
                const occupies = (tileType & TILE_TYPE_MASKS.FLOOR) !== 0;
                const isOccupied = allAgents.some(a => a.id !== agent.id && a.position.x === tx && a.position.y === ty);

                if (occupies && !isOccupied) {
                    target = { x: tx, y: ty };
                    foundFree = true;
                    break;
                }
            }

            // 备选：如果找不到空位，使用旧的基于索引的分布，但确保不是门
            if (!foundFree) {
                const offsetX = (agentIndex % innerW);
                const offsetY = (Math.floor(agentIndex / innerW) % innerH);
                target = { x: innerX + offsetX, y: innerY + offsetY };
                if (target.x === location.entry.x && target.y === location.entry.y) {
                    target.y = Math.max(innerY, target.y - 1);
                }
            }
        }

        if (this._isAt(agent, target)) {
            agent.state = desiredState;
        } else {
            agent.moveTo(target);
        }
    }
    
    private _isAt(agent: OptimizedAgent, target: { x: number, y: number }): boolean {
        return agent.position.x === target.x && agent.position.y === target.y;
    }
    
    private _wander(agent: OptimizedAgent) {
        const randomLoc = this.world.locations[Math.floor(Math.random() * this.world.locations.length)];
        if (randomLoc) {
            agent.moveTo(randomLoc.entry);
        }
    }
    
    private _getLocationAt(position: Coordinate): Location | undefined {
        return this.world.locations.find(loc =>
            loc.x !== undefined && loc.y !== undefined && loc.width !== undefined && loc.height !== undefined &&
            position.x >= loc.x && position.x < loc.x + loc.width &&
            position.y >= loc.y && position.y < loc.y + loc.height
        );
    }
    
    private _handlePaymentAtLocation(location: Location | undefined, agent: OptimizedAgent, cost: number, purpose: string, time: number) {
        if (location) {
            location.stats.revenue += cost;
            const description = purpose === 'Food' ? `Food purchase from ${agent.name}` : `${purpose} consumption from ${agent.name}`;
            this._logBuildingTransaction(location, cost, description, time);
        }

        if (!agent.sessionFinance || agent.sessionFinance.type !== 'expense' || !agent.sessionFinance.description.startsWith(purpose)) {
            agent.sessionFinance = { amount: 0, description: `${purpose} at ${location?.name || 'Local Area'}`, type: 'expense' };
        }
        agent.sessionFinance.amount -= cost;
    }
    
    private _finalizeExpenseSession(agent: OptimizedAgent, session: { amount: number, description: string, type: 'income' | 'expense' | 'bank' | 'loan' }, type: 'income' | 'expense' | 'bank' | 'loan', time: number) {
        agent.logTransaction(agent.sessionFinance!.amount, agent.sessionFinance!.description, type, time);
        
        // 记录到建筑物
        const lastLocName = agent.sessionFinance!.description.split(' at ')[1];
        if (lastLocName && lastLocName !== 'Local Area') {
            const building = this.cachedLocations.get(lastLocName);
            if (building && building.stats.sessionRevenue && building.stats.sessionRevenue[agent.id]) {
                const detail = session.description.startsWith('Food')
                    ? `Food purchase from ${agent.name}`
                    : session.description === 'Hospital Treatment'
                        ? `Treatment consumption from ${agent.name}`
                        : `Sales to ${agent.name}`;
                this._logBuildingTransaction(building, building.stats.sessionRevenue[agent.id], detail, time);
                delete building.stats.sessionRevenue[agent.id];
            }
        }
        
        agent.sessionFinance = undefined;
    }
    
    private _logBuildingTransaction(loc: Location, amount: number, description: string, timestamp: number) {
        loc.stats.transactions.unshift({ amount, description, timestamp });
        if (loc.stats.transactions.length > 100) {
            loc.stats.transactions.pop();
        }
    }
}
