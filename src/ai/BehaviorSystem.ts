
/**
 * 行为系统，控制居民日常作息、就医就餐决策、建筑容量管控与流向分流
 * @author hubin
 */

import { Agent, AgentState } from '../engine/Agent';
import { World, Location } from '../engine/World';
import { buildJevContext, requestJevDecision, JevAction } from './JevDecisionProvider';
import { planFinances } from './FinancialPlanner';

export class BehaviorSystem {
    world: World;
    priceMultiplier: number = 1.0;
    wageMultiplier: number = 1.0;
    riskMultiplier: number = 1.0; // Control probability of accidents/illness
    private jevEnabled = false;
    private localAiEnabled = true;
    private jevPending = new Set<string>();
    private jevLastDecision = new Map<string, number>();
    private jevFailures = new Map<string, number>();
    private localLastDecision = new Map<string, number>();
    /** Game minutes between JEV decisions per resident. */
    private jevCooldownMinutes = 30;

    constructor(world: World) {
        this.world = world;
    }

    setEconomicLevels(price: number, wage: number, risk: number) {
        this.priceMultiplier = price;
        this.wageMultiplier = wage;
        this.riskMultiplier = risk;
    }

    setJevEnabled(enabled: boolean) { this.jevEnabled = enabled; }

    setLocalAiEnabled(enabled: boolean) { this.localAiEnabled = enabled; }

    setJevCooldownMinutes(minutes: number) {
        this.jevCooldownMinutes = Math.max(1, minutes);
    }

    getLocalCooldownMinutes(): number {
        // 本地规则常规决策频次设定为 JEV 频次的 1/3（即冷却时间为 JEV 的 3 倍）
        // 默认 JEV 30 分钟时，本地规则决策冷却为 90 分钟
        return this.jevEnabled ? Math.max(60, this.jevCooldownMinutes * 3) : 60;
    }

    update(agents: Agent[], time: number) {
        // Police checking for criminals
        const police = agents.filter(a => a.role === 'Police');
        const criminals = agents.filter(a => a.state === 'CRIMINAL');

        police.forEach(officer => {
            criminals.forEach(criminal => {
                const dist = Math.abs(officer.position.x - criminal.position.x) +
                    Math.abs(officer.position.y - criminal.position.y);
                if (dist <= 1) {
                    criminal.state = 'ARRESTED';
                    criminal.conversation = "Oh no! I'm caught!";
                    criminal.conversationTTL = 50;
                    officer.conversation = "You're under arrest!";
                    officer.conversationTTL = 50;
                }
            });
        });

        agents.forEach((agent, index) => {
            if (agent.state === 'DEAD') return;

            // Track visits
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

            // Earn money if working
            if (agent.state === 'WORKING') {
                const grossIncome = this.getIncome(agent);
                let actualIncome = grossIncome;

                // Loan repayment: 20% of income goes to repaying the loan
                if (agent.loanBalance > 0) {
                    const repayment = Math.min(agent.loanBalance, grossIncome * 0.2);
                    agent.loanBalance -= repayment;
                    actualIncome -= repayment;
                    agent.sessionLoan = (agent.sessionLoan || 0) + repayment;

                    // Log to bank building immediately for its revenue tracker (if you want real-time bank stats)
                    const bank = this.world.locations.find(l => l.name === 'Bank');
                    if (bank) {
                        bank.stats.revenue += repayment;
                    }
                }
                agent.cash += actualIncome;

                if (!agent.sessionFinance || agent.sessionFinance.type !== 'income') {
                    agent.sessionFinance = { amount: 0, description: `Work (${agent.role})`, type: 'income' };
                }
                agent.sessionFinance.amount += grossIncome; // Store gross income in session
            } else {
                // End of Work session logging
                if (agent.sessionFinance && agent.sessionFinance.type === 'income') {
                    agent.logTransaction(agent.sessionFinance.amount, agent.sessionFinance.description, 'income', time);
                    agent.sessionFinance = undefined;

                    if (agent.sessionLoan && agent.sessionLoan > 0) {
                        agent.logTransaction(agent.sessionLoan, "Loan repayment (Automatic)", 'loan', time);
                        const bank = this.world.locations.find(l => l.name === 'Bank');
                        if (bank) this.logBuildingTransaction(bank, agent.sessionLoan, `Loan repayment from ${agent.name}`, time);
                        agent.sessionLoan = 0;
                    }
                }
            }

            // Hunger logic: increases over time, decreases when eating
            if (agent.state === 'EATING') {
                agent.hunger = Math.max(0, agent.hunger - 6.0); // Faster recovery
                agent.health = Math.min(100, agent.health + 0.2); // Recover health while eating

                let cost = 0.05 * this.priceMultiplier; // Default: Restaurant
                if (locAt?.name === 'Bakery') cost = 0.03 * this.priceMultiplier;
                if (locAt?.name === 'My House') cost = 0.01 * this.priceMultiplier;

                let hasPaid = false;
                if (agent.cash >= cost) {
                    agent.cash -= cost;
                    hasPaid = true;
                } else if (agent.bankBalance >= cost) {
                    agent.bankBalance -= cost;
                    hasPaid = true;
                }

                if (hasPaid) {
                    if (locAt) {
                        locAt.stats.revenue += cost;
                        this.logBuildingTransaction(locAt, cost, `Food purchase from ${agent.name}`, time);
                    }

                    // Keep the exact venue in the ledger so Bakery purchases are
                    // recorded separately from Restaurant and home meals.
                    const foodVenue = locAt?.name || 'Local Area';
                    if (!agent.sessionFinance || agent.sessionFinance.type !== 'expense' || agent.sessionFinance.description !== `Food at ${foodVenue}`) {
                        agent.sessionFinance = { amount: 0, description: `Food at ${locAt?.name || 'Local Area'}`, type: 'expense' };
                    }
                    agent.sessionFinance.amount -= cost;
                }

                if (agent.cash < cost && agent.bankBalance < cost) {
                    // Fallback logic: If too broke for here, try a cheaper place
                    if (locAt?.name === 'Restaurant' || locAt?.name === 'Bakery') {
                        agent.state = 'IDLE'; // Force re-decision in decideAction
                        agent.conversation = "Too expensive here! I need something cheaper.";
                        agent.conversationTTL = 30;
                        if (locAt.entry) {
                            agent.moveTo({ x: locAt.entry.x, y: locAt.entry.y + 1 }, this.world);
                        }
                    } else {
                        agent.state = 'IDLE';
                        agent.conversation = "I'm completely broke and starving!";
                        agent.conversationTTL = 50;
                    }
                } else if (agent.hunger === 0) {
                    agent.state = 'IDLE';
                    agent.conversation = "I'm full!";
                    agent.conversationTTL = 40;
                    // 吃饱后主动迈步移向门外，腾出室内空位给其他顾客
                    if (locAt && locAt.entry) {
                        agent.moveTo({ x: locAt.entry.x, y: locAt.entry.y + 1 }, this.world);
                    }
                }
            } else {
                if (agent.sessionFinance && agent.sessionFinance.type === 'expense' && agent.sessionFinance.description.startsWith('Food')) {
                    agent.logTransaction(agent.sessionFinance.amount, agent.sessionFinance.description, 'expense', time);
                    // Log to building too
                    const lastLocName = agent.sessionFinance.description.split(' at ')[1];
                    if (lastLocName && lastLocName !== 'Local Area') {
                        const building = this.world.locations.find(l => l.name === lastLocName);
                        if (building && building.stats.sessionRevenue && building.stats.sessionRevenue[agent.id]) {
                            this.logBuildingTransaction(building, building.stats.sessionRevenue[agent.id], `Food purchase from ${agent.name}`, time);
                            delete building.stats.sessionRevenue[agent.id];
                        }
                    }
                    agent.sessionFinance = undefined;
                }
                const hungerRate = agent.state === 'READING' && locAt?.name === 'Library' ? 0.04 : 0.02;
                agent.hunger = Math.min(100, agent.hunger + hungerRate);
            }

            if (agent.state === 'READING' && locAt?.name === 'Library') {
                agent.increaseLibraryCharm(0.03);
            }

            // Shopping logic: High-end consumption at the Mall
            if (agent.state === 'SHOPPING') {
                const luxuryCost = Math.max(5.0, 0.5 * this.priceMultiplier); // Minimum $5.00 spending
                let hasPaid = false;
                if (agent.cash >= luxuryCost) {
                    agent.cash -= luxuryCost;
                    hasPaid = true;
                } else if (agent.bankBalance >= luxuryCost) {
                    agent.bankBalance -= luxuryCost;
                    hasPaid = true;
                }

                if (hasPaid) {
                    agent.health = Math.min(100, agent.health + 0.5); // Luxury care
                    if (locAt) {
                        locAt.stats.revenue += luxuryCost;
                        if (!locAt.stats.sessionRevenue) locAt.stats.sessionRevenue = {};
                        locAt.stats.sessionRevenue[agent.id] = (locAt.stats.sessionRevenue[agent.id] || 0) + luxuryCost;
                    }
                    if (!agent.sessionFinance || agent.sessionFinance.type !== 'expense' || agent.sessionFinance.description !== 'Luxury Shopping') {
                        agent.sessionFinance = { amount: 0, description: 'Luxury Shopping', type: 'expense' };
                    }
                    agent.sessionFinance.amount -= luxuryCost;

                    // Charm system: increase charm based on shopping amount
                    agent.increaseCharm(luxuryCost, time);
                    
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
                if (agent.sessionFinance && agent.sessionFinance.type === 'expense' && agent.sessionFinance.description === 'Luxury Shopping') {
                    agent.logTransaction(agent.sessionFinance.amount, agent.sessionFinance.description, 'expense', time);
                    const building = this.world.locations.find(l => l.name === 'Mall');
                    if (building && building.stats.sessionRevenue && building.stats.sessionRevenue[agent.id]) {
                        this.logBuildingTransaction(building, building.stats.sessionRevenue[agent.id], `Sales to ${agent.name}`, time);
                        delete building.stats.sessionRevenue[agent.id];
                    }
                    agent.sessionFinance = undefined;
                }
            }

            // Health decay from hunger: ONLY at absolute starvation
            if (agent.hunger >= 100) {
                agent.health = Math.max(0, agent.health - 0.1); // Faster decay when actually starving
            }

            // Health and Sickness logic
            if (agent.state === 'TREATING') {
                agent.health = Math.min(100, agent.health + 1.0);
                const cost = 0.2 * this.priceMultiplier;
                let hasPaid = false;
                if (agent.cash >= cost) {
                    agent.cash -= cost;
                    hasPaid = true;
                } else if (agent.bankBalance >= cost) {
                    agent.bankBalance -= cost;
                    hasPaid = true;
                }

                if (hasPaid) {
                    const hospital = this.world.locations.find(l => l.name === 'Hospital');
                    if (hospital) {
                        hospital.stats.revenue += cost;
                        this.logBuildingTransaction(hospital, cost, `Treatment consumption from ${agent.name}`, time);
                    }

                    if (!agent.sessionFinance || agent.sessionFinance.description !== 'Hospital Treatment') {
                        agent.sessionFinance = { amount: 0, description: 'Hospital Treatment', type: 'expense' };
                    }
                    agent.sessionFinance.amount -= cost;
                }

                if (agent.cash < cost && agent.bankBalance < cost) {
                    agent.state = 'IDLE';
                    agent.conversation = "I can't afford treatment anymore!";
                    agent.conversationTTL = 50;
                } else if (agent.health === 100) {
                    agent.state = 'IDLE';
                    agent.conversation = "I feel much better now!";
                    agent.conversationTTL = 50;
                }
            } else {
                if (agent.sessionFinance && agent.sessionFinance.description === 'Hospital Treatment') {
                    agent.logTransaction(agent.sessionFinance.amount, agent.sessionFinance.description, 'expense', time);
                    const hospital = this.world.locations.find(l => l.name === 'Hospital');
                    if (hospital && hospital.stats.sessionRevenue && hospital.stats.sessionRevenue[agent.id]) {
                        this.logBuildingTransaction(hospital, hospital.stats.sessionRevenue[agent.id], `Treatment consumption from ${agent.name}`, time);
                        delete hospital.stats.sessionRevenue[agent.id];
                    }
                    agent.sessionFinance = undefined;
                }
                // Chance to get sick (Infection, Flu, etc.) - Reduced 10x and use multiplier
                if (agent.health === 100 && Math.random() < 0.00002 * this.riskMultiplier) {
                    agent.health = 30;
                    const illnesses = ["Severe Infection", "Respiratory Flu", "Food Poisoning"];
                    const illness = illnesses[Math.floor(Math.random() * illnesses.length)];
                    agent.memory.lastDiagnosis = illness;
                    agent.conversation = `I think I have ${illness}...`;
                    agent.conversationTTL = 50;
                }

                // Rare chance of a sudden critical health event (Heart Attack, Stroke) - Reduced 10x and use multiplier
                if (agent.health > 80 && Math.random() < 0.000005 * this.riskMultiplier) {
                    agent.health = 5;
                    agent.memory.lastDiagnosis = "Cardiac Event";
                    agent.conversation = "My chest... it hurts!";
                    agent.conversationTTL = 80;
                }

                // Chronic health decay if not being treated
                if (agent.health < 100) {
                    agent.health = Math.max(0, agent.health - 0.02);
                }
            }

            // Rare Sudden Accident (Immediate death, very low probability)
            // Safety: No lightning/accidents inside buildings
            // Reduced 10x and use multiplier
            if (!locAt && Math.random() < 0.000002 * this.riskMultiplier) {
                const accidents = ["Traffic Accident", "Industrial Mishap", "Struck by Lightning"];
                agent.state = 'DEAD';
                agent.emoji = '🪦';
                agent.deathTime = time;
                agent.deathCause = accidents[Math.floor(Math.random() * accidents.length)];
                agent.conversation = `Tragedy: ${agent.deathCause}`;
                agent.conversationTTL = 999999;
                console.log(`TRAGEDY: Agent ${agent.name} died in a ${agent.deathCause}.`);
                return;
            }

            // Death logic
            if (agent.health <= 0) {
                agent.health = 0;
                // Reduce death chance to give more time for hospital treatment
                if (Math.random() < 0.001) { // 0.1% chance per tick at 0 health
                    agent.state = 'DEAD';
                    agent.emoji = '🪦';
                    agent.deathTime = time;
                    // Death Cause logic: Priority check. Use safe threshold for hunger.
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
                    return;
                }
            }

            // Interest logic: Once per game hour (60 ticks)
            if (time % 60 === 0 && agent.bankBalance > 0) {
                const interestRate = 0.0001; // 0.01% per hour
                const interest = agent.bankBalance * interestRate;
                if (interest >= 0.01) { // Minimum $0.01 interest payout
                    agent.bankBalance += interest;
                    agent.logTransaction(interest, "Bank Interest Earned", 'bank', time);
                    const bank = this.world.locations.find(l => l.name === 'Bank');
                    if (bank) this.logBuildingTransaction(bank, -interest, `Interest Paid to ${agent.name}`, time);
                }
            }

            // Loan Interest logic: Once per game hour (60 ticks)
            if (time % 60 === 0 && agent.loanBalance > 0) {
                const loanInterestRate = 0.0005; // 0.05% per hour (higher than deposit rate)
                const loanInterest = agent.loanBalance * loanInterestRate;
                if (loanInterest >= 0.01) {
                    agent.loanBalance += loanInterest;
                    agent.logTransaction(-loanInterest, "Loan Interest Accrued", 'loan', time);
                    const bank = this.world.locations.find(l => l.name === 'Bank');
                    if (bank) this.logBuildingTransaction(bank, loanInterest, `Loan Interest from ${agent.name}`, time);
                }
            }

            // Banking logic: Move cash to/from bank
            if (agent.state === 'BANKING') {
                const bank = this.world.locations.find(l => l.name === 'Bank');
                if (bank && this.isAt(agent, bank.interior || bank.entry)) {
                    const needsEmergencyLoan = (agent.health < 70 || agent.hunger > 80) && agent.cash < 10 && agent.bankBalance < 20;

                    if (needsEmergencyLoan) {
                        // Take a life-saving loan
                        const loanAmount = 50;
                        agent.loanBalance += loanAmount;
                        agent.cash += loanAmount;
                        agent.logTransaction(loanAmount, "Emergency Bank Loan", 'loan', time);
                        this.logBuildingTransaction(bank, loanAmount, `Emergency Loan to ${agent.name}`, time);
                        agent.conversation = agent.health < 70 ? "Bank gave me a life-saving loan for health!" : "Bank gave me a loan so I don't starve!";
                        if (bank.stats.extra) {
                            if (!bank.stats.extra.loans) bank.stats.extra.loans = 0;
                            bank.stats.extra.loans += loanAmount;
                        }
                    } else if (agent.health < 70 && agent.cash < 10 && agent.bankBalance >= 20) {
                        // Withdraw for treatment
                        agent.bankBalance -= 20;
                        agent.cash += 20;
                        agent.logTransaction(20, "Withdraw for bills", 'bank', time);
                        this.logBuildingTransaction(bank, -20, `Withdrawal (Health) by ${agent.name}`, time);
                        bank.stats.extra!.withdrawals += 20;
                        agent.conversation = "Withdrew money for medical bills!";
                    } else if (agent.bankBalance >= 50 && agent.cash < 5 && Math.random() < 0.05) {
                        // Regular Withdraw: Rare and only if nearly out of cash
                        const amount = 50;
                        agent.bankBalance -= amount;
                        agent.cash += amount;
                        agent.logTransaction(amount, "Bank Withdrawal", 'bank', time);
                        this.logBuildingTransaction(bank, -amount, `Regular Withdrawal by ${agent.name}`, time);
                        if (!bank.stats.extra) bank.stats.extra = { deposits: 0, withdrawals: 0, loans: 0 };
                        bank.stats.extra.withdrawals += amount;
                        agent.conversation = "Withdrew some cash for future needs.";
                    } else {
                        // Deposit surplus cash while preserving the financial safety reserve.
                        const hour = Math.floor(time / 60) % 24;
                        const finances = planFinances(agent, this.priceMultiplier, hour);
                        const depositAmount = Math.max(0, Math.floor((agent.cash - finances.safeReserve) * 100) / 100);
                        if (depositAmount >= 1) {
                            agent.cash -= depositAmount;
                            agent.bankBalance += depositAmount;
                            agent.logTransaction(-depositAmount, "Deposit to Savings", 'bank', time);
                            this.logBuildingTransaction(bank, depositAmount, `Deposit from ${agent.name}`, time);
                            if (!bank.stats.extra) bank.stats.extra = { deposits: 0, withdrawals: 0, loans: 0 };
                            bank.stats.extra.deposits = (bank.stats.extra.deposits || 0) + depositAmount;
                            agent.conversation = `Deposited $${depositAmount.toFixed(2)} for a safer future.`;
                        }
                    }
                    agent.state = 'IDLE';
                    agent.conversationTTL = 50;
                }
            }

            this.decideAction(agent, index, time, agents);
        });
    }

    private canMakeLocalDecision(agent: Agent, time: number, isEmergency: boolean = false): boolean {
        if (!this.localAiEnabled) return false;
        if (isEmergency) return true;
        const cooldown = this.getLocalCooldownMinutes();
        const lastTime = this.localLastDecision.get(agent.id) ?? -Infinity;
        return (time - lastTime) >= cooldown;
    }

    private recordLocalDecision(agent: Agent, type: string, location: string | undefined, reason: string, time: number, isEmergency: boolean = false) {
        if (!this.localAiEnabled) return;
        if (agent.jevIntent &&
            agent.jevIntent.type === type &&
            agent.jevIntent.location === location &&
            (time - agent.jevIntent.time) < 30) {
            return;
        }
        if (!isEmergency) {
            this.localLastDecision.set(agent.id, time);
        }
        agent.recordDecision({
            type,
            location,
            reason: isEmergency ? `[紧急自救] ${reason}` : reason,
            time,
            status: 'planned'
        }, 'LOCAL_RULE');
    }

    decideAction(agent: Agent, agentIndex: number, time: number, allAgents: Agent[]) {
        const hour = Math.floor(time / 60) % 24;
        const totalWealth = agent.cash + agent.bankBalance;
        const finances = planFinances(agent, this.priceMultiplier, hour);
        const isBankOpen = hour >= 9 && hour < 17;

        // Arrest logic: Criminals caught by police
        if (agent.state === 'ARRESTED') {
            this.ensureAtLocation(agent, agentIndex, 'Police Station', 'SLEEPING', allAgents);
            if (Math.random() < 0.005) {
                agent.state = 'IDLE';
                agent.conversation = "I've served my time.";
                agent.conversationTTL = 50;
            }
            return;
        }

        // 1. 紧急生命线判定：仅在启用本地决策且危及生命时（健康 < 45 或 饥饿 > 75），本地紧急自救规则立即介入防止死亡
        const isHungerEmergency = agent.hunger > 75;
        const isHealthEmergency = agent.health < 45;

        if (this.localAiEnabled && isHungerEmergency && agent.state !== 'SLEEPING') {
            const restaurantCost = 0.05 * this.priceMultiplier;
            const bakeryCost = 0.03 * this.priceMultiplier;
            const homeCost = 0.01 * this.priceMultiplier;

            const foodLocation = this.getAvailableFoodLocation(agent, allAgents, finances.liquidFunds, restaurantCost, bakeryCost, homeCost);
            if (foodLocation) {
                this.recordLocalDecision(agent, 'EAT', foodLocation, `严重饥饿濒临绝境 (饥饿度 ${agent.hunger.toFixed(0)})，紧急前往 ${foodLocation} 用餐。`, time, true);
                this.ensureAtLocation(agent, agentIndex, foodLocation, 'EATING', allAgents);
                return;
            } else if (isBankOpen && (agent.bankBalance >= (5 * this.priceMultiplier) || agent.loanBalance < 200)) {
                agent.state = 'BANKING';
                agent.conversation = "I'm hungry but broke. Need a loan!";
                agent.conversationTTL = 50;
                this.recordLocalDecision(agent, 'BANK', 'Bank', `极度饥饿且身无分文，紧急前往银行申请贷款购买食物。`, time, true);
                this.ensureAtLocation(agent, agentIndex, 'Bank', 'BANKING', allAgents);
                return;
            }
        }

        if (this.localAiEnabled && isHealthEmergency && agent.state !== 'SLEEPING') {
            const hospitalCost = 0.2 * this.priceMultiplier;
            if (finances.liquidFunds >= hospitalCost) {
                this.recordLocalDecision(agent, 'TREAT', 'Hospital', `生命垂危 (健康值 ${agent.health.toFixed(0)})，紧急前往医院急救。`, time, true);
                this.ensureAtLocation(agent, agentIndex, 'Hospital', 'TREATING', allAgents);
                return;
            }
            const restaurantCost = 0.05 * this.priceMultiplier;
            if (finances.liquidFunds >= restaurantCost) {
                this.recordLocalDecision(agent, 'EAT', 'Restaurant', `健康极度虚弱且就医资金紧张，紧急就餐补充体力。`, time, true);
                this.ensureAtLocation(agent, agentIndex, 'Restaurant', 'EATING', allAgents);
                return;
            }
            if (isBankOpen && (agent.bankBalance >= 20 || agent.loanBalance < 200)) {
                agent.state = 'BANKING';
                agent.conversation = "I need money for medical treatment. To the bank!";
                agent.conversationTTL = 50;
                this.recordLocalDecision(agent, 'BANK', 'Bank', `急需抢救医疗资金，前往银行取款或贷款。`, time, true);
                this.ensureAtLocation(agent, agentIndex, 'Bank', 'BANKING', allAgents);
                return;
            }
        }

        // 2. JEV 核心智能决策入口：
        // 若启用本地决策，日常生理区间（健康 >= 45 且 饥饿 <= 75）由 JEV 决策；
        // 若关闭本地决策，所有决策均只由 JEV 提供（解除健康与饥饿安全区间限制，全部交由 JEV 决策）
        const failures = this.jevFailures.get(agent.id) ?? 0;
        const effectiveCooldown = this.jevCooldownMinutes + Math.min(60, failures * 15);
        const jevHealthHungerCondition = this.localAiEnabled ? (agent.health >= 45 && agent.hunger <= 75) : true;

        if (this.jevEnabled && agent.state === 'IDLE' && jevHealthHungerCondition &&
            !this.jevPending.has(agent.id) &&
            (this.jevLastDecision.get(agent.id) ?? -Infinity) <= time - effectiveCooldown) {
            if (typeof window === 'undefined') console.log(`[JEV] trigger for ${agent.name} (state=${agent.state} hp=${agent.health} hunger=${agent.hunger})`);
            this.jevPending.add(agent.id);
            agent.jevIntent = { type: 'THINKING', reason: 'JEV 正在分析下一步行动…', time, status: 'thinking' };
            const context = buildJevContext(agent, this.world, time, this.priceMultiplier, this.wageMultiplier, this.riskMultiplier);
            void requestJevDecision(context).then(action => {
                this.jevPending.delete(agent.id);
                this.jevLastDecision.set(agent.id, time);
                if (action) {
                    this.jevFailures.delete(agent.id);
                    this.applyJevAction(agent, action, agentIndex, allAgents, time);
                } else {
                    const nextFailures = (this.jevFailures.get(agent.id) ?? 0) + 1;
                    this.jevFailures.set(agent.id, nextFailures);
                    if (this.localAiEnabled) {
                        agent.recordDecision({ type: 'LOCAL_RULE', reason: 'JEV 暂无可用结果，转由本地规则接管。', time, status: 'fallback' }, 'LOCAL_RULE');
                    }
                    if (agent.state === 'IDLE' && Math.random() < 0.6) {
                        this.wander(agent);
                    }
                }
            });
            return;
        }

        // 3. 本地常规决策频次控制与开关检查
        // 若关闭本地AI，则不执行任何本地常规决策，小人行动只由 JEV 驱动
        const canLocalDecide = this.canMakeLocalDecision(agent, time, false);

        if (!canLocalDecide) {
            // 如果处于非紧急状态且在本地决策冷却期内，或本地AI已关闭（此时只由 JEV 提供决策）：
            if (agent.state === 'MOVING' || agent.state === 'WORKING' || agent.state === 'EATING' || 
                agent.state === 'SHOPPING' || agent.state === 'READING' || agent.state === 'TREATING' || agent.state === 'BANKING') {
                return; // 保持正在进行的行为
            }
            if (this.localAiEnabled && (hour >= 22 || hour < 8)) {
                // 夜间静默就寝（不重复写决策日志）
                if (agent.state !== 'SLEEPING') {
                    this.ensureAtLocation(agent, agentIndex, 'My House', 'SLEEPING', allAgents);
                }
                return;
            }
            if (agent.state === 'IDLE') {
                if (Math.random() < 0.05) this.wander(agent);
                return;
            }
            return;
        }

        // 4. 允许生成常规本地决策（已脱离 90 分钟冷却期）
        // 银行处理
        if (agent.state === 'BANKING') {
            if (!isBankOpen) {
                agent.state = 'IDLE';
                agent.conversation = "Bank's closed. I'll come back tomorrow.";
                agent.conversationTTL = 50;
            } else {
                this.ensureAtLocation(agent, agentIndex, 'Bank', 'BANKING', allAgents);
                return;
            }
        }

        // 轻微犯罪
        if (agent.role !== 'Police' && agent.state === 'IDLE' && Math.random() < 0.001) {
            agent.state = 'CRIMINAL';
            agent.conversation = "Time for some mischief...";
            agent.conversationTTL = 50;
        }

        // 中度饥饿（hunger > 50）：按常理前往就餐
        if (agent.hunger > 50 && agent.state !== 'SLEEPING') {
            const restaurantCost = 0.05 * this.priceMultiplier;
            const bakeryCost = 0.03 * this.priceMultiplier;
            const homeCost = 0.01 * this.priceMultiplier;
            const foodLocation = this.getAvailableFoodLocation(agent, allAgents, finances.liquidFunds, restaurantCost, bakeryCost, homeCost);
            if (foodLocation) {
                this.recordLocalDecision(agent, 'EAT', foodLocation, `感到腹中饥饿 (饥饿度 ${agent.hunger.toFixed(0)})，前往 ${foodLocation} 用餐补充体力。`, time);
                this.ensureAtLocation(agent, agentIndex, foodLocation, 'EATING', allAgents);
                return;
            }
        }

        // 中度健康欠佳（health < 65）：按常理就医
        if (agent.health < 65 && agent.state !== 'SLEEPING') {
            const hospitalCost = 0.2 * this.priceMultiplier;
            if (finances.liquidFunds >= hospitalCost) {
                this.recordLocalDecision(agent, 'TREAT', 'Hospital', `身体不适健康偏低 (健康值 ${agent.health.toFixed(0)})，前往医院接受医生治疗。`, time);
                this.ensureAtLocation(agent, agentIndex, 'Hospital', 'TREATING', allAgents);
                return;
            }
        }

        // 魅力购物
        const isWealthy = finances.disposableFunds >= 100 * this.priceMultiplier;
        const hasBasicNeedsMet = agent.hunger < 30 && agent.health > 80;
        const isCharmSeeker = finances.canShop && isWealthy && hasBasicNeedsMet && agent.charm < 100;
        if (isCharmSeeker && agent.state !== 'WORKING' && agent.state !== 'SLEEPING' && Math.random() < 0.2) {
            agent.state = 'SHOPPING';
            agent.conversation = "Time to shop and increase my charm!";
            agent.conversationTTL = 50;
            this.recordLocalDecision(agent, 'SHOP', 'Mall', `手头资产充裕且生理需求满足，前往商场选购品质好物提升个人魅力。`, time);
            this.ensureAtLocation(agent, agentIndex, 'Mall', 'SHOPPING', allAgents);
            return;
        }

        // 银行存款
        const depositThreshold = isWealthy ? 50 : 100;
        if (isBankOpen && finances.shouldBank && agent.cash >= depositThreshold && agent.hunger < 20 && agent.health > 90 &&
            agent.state !== 'WORKING' && agent.state !== 'SLEEPING') {
            agent.state = 'BANKING';
            agent.conversation = isWealthy ? "Need to manage my growing capital." : "Better deposit this extra cash.";
            agent.conversationTTL = 50;
            this.recordLocalDecision(agent, 'BANK', 'Bank', isWealthy ? `资产不断积累，前往银行存入流动多余资金。` : `随身现金较多，前往银行存款以保障资金安全。`, time);
            this.ensureAtLocation(agent, agentIndex, 'Bank', 'BANKING', allAgents);
            return;
        }

        // 日常日程计划：睡觉、上班、午餐、下午工作、晚间休闲
        if (hour >= 22 || hour < 8) {
            if (agent.state !== 'SLEEPING') {
                this.recordLocalDecision(agent, 'SLEEP', 'My House', `夜幕深沉，返回家中就寝安歇。`, time);
                this.ensureAtLocation(agent, agentIndex, 'My House', 'SLEEPING', allAgents);
            }
        } else if (hour >= 8 && hour < 12) {
            if (agent.state !== 'WORKING') {
                const workLoc = this.getWorkLocation(agent);
                this.recordLocalDecision(agent, 'WORK', workLoc, `上午工作时间已到，前往 ${workLoc} 履行职责。`, time);
                this.ensureAtLocation(agent, agentIndex, workLoc, 'WORKING', allAgents);
            }
        } else if (hour >= 12 && hour < 13) {
            if (agent.state !== 'IDLE' && agent.state !== 'EATING') {
                const restaurantCost = 0.05 * this.priceMultiplier;
                const bakeryCost = 0.03 * this.priceMultiplier;
                const homeCost = 0.01 * this.priceMultiplier;
                const lunchLocation = this.getAvailableFoodLocation(agent, allAgents, finances.liquidFunds, restaurantCost, bakeryCost, homeCost) || 'Restaurant';
                this.recordLocalDecision(agent, 'EAT', lunchLocation, `午餐时间到了，前往 ${lunchLocation} 享用午餐。`, time);
                this.ensureAtLocation(agent, agentIndex, lunchLocation, 'EATING', allAgents);
            }
        } else if (hour >= 13 && hour < 17) {
            if (agent.state !== 'WORKING') {
                const workLoc = this.getWorkLocation(agent);
                this.recordLocalDecision(agent, 'WORK', workLoc, `下午工作时段，前往 ${workLoc} 坚守岗位努力工作。`, time);
                this.ensureAtLocation(agent, agentIndex, workLoc, 'WORKING', allAgents);
            }
        } else if (hour >= 17 && hour < 22) {
            if (agent.state !== 'IDLE' && agent.state !== 'SHOPPING' && agent.state !== 'READING') {
                const loc = this.getLeisureLocation(agentIndex, agent);
                const desState = loc === 'Mall' ? 'SHOPPING' : loc === 'Library' ? 'READING' : 'IDLE';
                const actType = desState === 'SHOPPING' ? 'SHOP' : desState === 'READING' ? 'LIBRARY' : 'WANDER';
                const actDesc = desState === 'SHOPPING' ? '前往商场购物消费以提升魅力' : desState === 'READING' ? '前往图书馆静心研读以增长知识魅力' : '前往休闲地点散步放松';
                this.recordLocalDecision(agent, actType, loc, `下班休闲时段，${actDesc}。`, time);
                this.ensureAtLocation(agent, agentIndex, loc, desState, allAgents);
            }
        } else {
            if (agent.state !== 'IDLE' && agent.state !== 'TALKING' && agent.state !== 'EATING' && agent.state !== 'SHOPPING' && agent.state !== 'READING') {
                const loc = this.getLeisureLocation(agentIndex + 1, agent);
                this.recordLocalDecision(agent, 'WANDER', loc, `空闲时光，前往 ${loc} 随意走走。`, time);
                this.ensureAtLocation(agent, agentIndex, loc, 'IDLE', allAgents);
            } else if (agent.state === 'IDLE' && Math.random() < 0.02) {
                this.recordLocalDecision(agent, 'WANDER', 'Park', `闲暇时刻，在小镇公园与街头悠闲漫步。`, time);
                this.wander(agent);
            }
        }
    }

    private applyJevAction(agent: Agent, action: JevAction, agentIndex: number, allAgents: Agent[], time: number) {
        // Never let an asynchronous JEV response violate the health/charm objective.
        const finances = planFinances(agent, this.priceMultiplier, Math.floor(time / 60) % 24);
        if (action.type === 'SHOP' && (!finances.canShop || agent.health < 55 || agent.hunger > 60 || agent.charm >= 100)) {
            if (this.localAiEnabled) {
                agent.recordDecision({ type: 'LOCAL_RULE', reason: '健康或饥饿未达安全线，暂缓购物。', time, status: 'fallback' }, 'LOCAL_RULE');
            }
            return;
        }
        if (action.type === 'LIBRARY' && (agent.health < 55 || agent.hunger > 60 || agent.charm >= 100)) {
            if (this.localAiEnabled) {
                agent.recordDecision({ type: 'LOCAL_RULE', reason: '健康或饥饿未达安全线，暂缓低成本魅力活动。', time, status: 'fallback' }, 'LOCAL_RULE');
            }
            return;
        }
        agent.recordDecision({ type: action.type, location: action.location, reason: action.reason, time, status: 'planned' }, 'JEV');
        const destinations: Record<string, [string, AgentState]> = {
            WORK: [action.location || this.getWorkLocation(agent), 'WORKING'],
            EAT: [action.location || 'Restaurant', 'EATING'],
            SLEEP: [action.location || 'My House', 'SLEEPING'],
            SHOP: [action.location || 'Mall', 'SHOPPING'],
            LIBRARY: [action.location || 'Library', 'READING'],
            TREAT: [action.location || 'Hospital', 'TREATING'],
            BANK: [action.location || 'Bank', 'BANKING'],
            WANDER: [action.location || 'Park', 'IDLE']
        };
        if (action.type === 'WANDER') {
            const wanderTarget = action.location || 'Park';
            this.ensureAtLocation(agent, agentIndex, wanderTarget, 'IDLE', allAgents);
            return;
        }
        if (action.type === 'WAIT') return;
        let destination = destinations[action.type];
        if (action.type === 'EAT') {
            const finances = planFinances(agent, this.priceMultiplier, Math.floor(time / 60) % 24);
            const requested = action.location || 'Restaurant';
            const food = this.hasAvailableSlot(requested, allAgents)
                ? requested
                : this.getAvailableFoodLocation(agent, allAgents, finances.liquidFunds, 0.05 * this.priceMultiplier, 0.03 * this.priceMultiplier, 0.01 * this.priceMultiplier);
            if (!food) {
                if (this.localAiEnabled) {
                    agent.recordDecision({ type: 'LOCAL_RULE', reason: '餐厅和面包房暂时拥挤，等待可用座位。', time, status: 'fallback' }, 'LOCAL_RULE');
                }
                return;
            }
            destination = [food, 'EATING'];
        }
        if (!destination || !this.world.locations.some(location => location.name === destination[0])) return;
        this.ensureAtLocation(agent, agentIndex, destination[0], destination[1], allAgents);
        if (agent.state === 'IDLE' && !this.isAt(agent, this.world.locations.find(location => location.name === destination[0])!.entry)) {
            // Path creation failed; keep the decision visible but allow a later retry.
            if (this.localAiEnabled) {
                agent.recordDecision({ ...(agent.jevIntent || { type: 'LOCAL_RULE', time }), reason: `${action.reason || ''} 正在重新规划路线。`, status: 'fallback' }, 'LOCAL_RULE');
            }
        }
        if (action.reason) {
            agent.conversation = action.reason;
            agent.conversationTTL = 30;
        }
    }

    private hasAvailableSlot(locationName: string, allAgents: Agent[]): boolean {
        const location = this.world.locations.find(item => item.name === locationName);
        if (!location || !location.interior || !location.width || !location.height) return true;
        // 餐厅等高频进出建筑，将舒适容量严格限制为 3 人，避免小人扎堆死锁
        const maxComfort = locationName === 'Restaurant' ? 3 : Math.min(4, Math.max(1, (location.width - 2) * (location.height - 2)));
        const occupants = allAgents.filter(other => {
            if (other.state === 'DEAD') return false;
            const at = other.position;
            const target = other.targetPosition;
            const inside = (point: { x: number; y: number }) => point.x >= location.x! + 1 && point.x < location.x! + location.width! - 1 && point.y >= location.y! + 1 && point.y < location.y! + location.height! - 1;
            return inside(at) || Boolean(target && inside(target));
        }).length;
        return occupants < maxComfort;
    }

    private getAvailableFoodLocation(agent: Agent, allAgents: Agent[], funds: number, restaurantCost: number, bakeryCost: number, homeCost: number): string | null {
        // 如果小人当前已在某个就餐场所内，优先在当前地点进食
        const currentLoc = this.world.locations.find(l => 
            l.x !== undefined && l.y !== undefined && l.width !== undefined && l.height !== undefined &&
            agent.position.x >= l.x + 1 && agent.position.x < l.x + l.width - 1 &&
            agent.position.y >= l.y + 1 && agent.position.y < l.y + l.height - 1
        );
        if (currentLoc && (currentLoc.name === 'Restaurant' || currentLoc.name === 'Bakery' || currentLoc.name === 'My House')) {
            const cost = currentLoc.name === 'Restaurant' ? restaurantCost : currentLoc.name === 'Bakery' ? bakeryCost : homeCost;
            if (funds >= cost) return currentLoc.name;
        }

        // 优先根据容量与预算分流
        if (funds >= restaurantCost && this.hasAvailableSlot('Restaurant', allAgents)) return 'Restaurant';
        if (funds >= bakeryCost && this.hasAvailableSlot('Bakery', allAgents)) return 'Bakery';
        if (funds >= homeCost && this.hasAvailableSlot('My House', allAgents)) return 'My House';

        // 若热门餐厅客满但急需进食，分流至面包店或家
        if (funds >= bakeryCost && this.hasAvailableSlot('Bakery', allAgents)) return 'Bakery';
        if (funds >= homeCost) return 'My House';

        return null;
    }

    getWorkLocation(agent: Agent): string {
        if (agent.role === 'Baker') return 'Bakery';
        if (agent.role === 'Librarian') return 'Library';
        if (agent.role === 'Police') return 'Police Station';
        return 'Library';
    }

    getIncome(agent: Agent): number {
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

    getLeisureLocation(index: number, agent?: Agent): string {
        const totalWealth = agent ? (agent.cash + agent.bankBalance) : 0;
        const isWealthy = totalWealth > 100 * this.priceMultiplier;

        const locations = ['Park', 'Library', 'Bakery', 'Restaurant'];
        if (isWealthy && Math.random() < 0.7) return 'Mall'; // Wealthy agents love the Mall

        return locations[index % locations.length];
    }

    ensureAtLocation(agent: Agent, agentIndex: number, locationName: string, desiredState: AgentState, allAgents: Agent[]) {
        const location = this.world.locations.find(l => l.name === locationName || l.type === locationName.toLowerCase())
            || this.world.locations[0];

        if (!location) return;
        // Do not replace a live path with a new random interior target every tick.
        // Re-targeting was causing JEV-planned residents to appear frozen.
        if (agent.state === 'MOVING' && agent.targetPosition) return;
        const alreadyInside = location.x !== undefined && location.y !== undefined && location.width !== undefined && location.height !== undefined &&
            agent.position.x >= location.x + 1 && agent.position.x < location.x + location.width - 1 &&
            agent.position.y >= location.y + 1 && agent.position.y < location.y + location.height - 1;
        if (!alreadyInside && !this.hasAvailableSlot(location.name, allAgents)) {
            agent.state = 'IDLE';
            agent.arrivalState = undefined;
            agent.conversation = `${location.name} is full. I'll try another place.`;
            agent.conversationTTL = 25;
            return;
        }

        let target = location.interior || location.entry;

        // If it's a building with interior, find a good spot
        if (location.interior && location.width && location.height) {
            // Priority: Try to find a FREE tile in the interior first
            let foundFree = false;
            const innerX = location.x! + 1;
            const innerY = location.y! + 1;
            const innerW = location.width - 2;
            const innerH = location.height - 2;

            const isDoorTile = (px: number, py: number) => {
                if (px === location.entry.x && py === location.entry.y) return true;
                if (location.doors && location.doors.some(d => d.x === px && d.y === py)) return true;
                return false;
            };

            // Spiral or random search for a free tile inside
            for (let attempt = 0; attempt < 12; attempt++) {
                const tx = innerX + Math.floor(Math.random() * innerW);
                const ty = innerY + Math.floor(Math.random() * innerH);

                // Don't stand on any door tile inside
                if (isDoorTile(tx, ty)) continue;

                const occupies = this.world.grid[ty][tx] === 'floor';
                const isOccupied = allAgents.some(a => a.id !== agent.id && a.position.x === tx && a.position.y === ty);

                if (occupies && !isOccupied) {
                    target = { x: tx, y: ty };
                    foundFree = true;
                    break;
                }
            }

            // Fallback: If no free spot found, use index-based distribution but ensure it's not on the doors
            if (!foundFree) {
                const offsetX = (agentIndex % innerW);
                const offsetY = (Math.floor(agentIndex / innerW) % innerH);
                target = { x: innerX + offsetX, y: innerY + offsetY };
                if (isDoorTile(target.x, target.y)) {
                    target.y = Math.max(innerY, target.y - 1);
                }
            }
        }

        if (this.isAt(agent, target)) {
            agent.state = desiredState;
        } else {
            agent.arrivalState = desiredState;
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

    logBuildingTransaction(loc: Location, amount: number, description: string, timestamp: number) {
        loc.stats.transactions.unshift({ amount, description, timestamp });
        if (loc.stats.transactions.length > 100) {
            loc.stats.transactions.pop();
        }
    }
}
