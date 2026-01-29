
import { Agent, AgentState } from '../engine/Agent';
import { World, Location } from '../engine/World';

export class BehaviorSystem {
    world: World;
    priceMultiplier: number = 1.0;
    wageMultiplier: number = 1.0;
    riskMultiplier: number = 1.0; // Control probability of accidents/illness

    constructor(world: World) {
        this.world = world;
    }

    setEconomicLevels(price: number, wage: number, risk: number) {
        this.priceMultiplier = price;
        this.wageMultiplier = wage;
        this.riskMultiplier = risk;
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
                        if (!locAt.stats.sessionRevenue) locAt.stats.sessionRevenue = {};
                        locAt.stats.sessionRevenue[agent.id] = (locAt.stats.sessionRevenue[agent.id] || 0) + cost;
                    }

                    if (!agent.sessionFinance || agent.sessionFinance.type !== 'expense' || !agent.sessionFinance.description.startsWith('Food')) {
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
                if (agent.sessionFinance && agent.sessionFinance.type === 'expense' && agent.sessionFinance.description.startsWith('Food')) {
                    agent.logTransaction(agent.sessionFinance.amount, agent.sessionFinance.description, 'expense', time);
                    // Log to building too
                    const lastLocName = agent.sessionFinance.description.split(' at ')[1];
                    if (lastLocName && lastLocName !== 'Local Area') {
                        const building = this.world.locations.find(l => l.name === lastLocName);
                        if (building && building.stats.sessionRevenue && building.stats.sessionRevenue[agent.id]) {
                            this.logBuildingTransaction(building, building.stats.sessionRevenue[agent.id], `Sales to ${agent.name}`, time);
                            delete building.stats.sessionRevenue[agent.id];
                        }
                    }
                    agent.sessionFinance = undefined;
                }
                agent.hunger = Math.min(100, agent.hunger + 0.02); // Reduced hunger rate - takes about 3 days to reach maximum
            }

            // Shopping logic: High-end consumption at the Mall
            if (agent.state === 'SHOPPING') {
                const luxuryCost = 0.5 * this.priceMultiplier;
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
                        if (!hospital.stats.sessionRevenue) hospital.stats.sessionRevenue = {};
                        hospital.stats.sessionRevenue[agent.id] = (hospital.stats.sessionRevenue[agent.id] || 0) + cost;
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
                        this.logBuildingTransaction(hospital, hospital.stats.sessionRevenue[agent.id], `Treatment fee from ${agent.name}`, time);
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
                if (Math.random() < 0.01) { // 1% chance per tick at 0 health
                    agent.state = 'DEAD';
                    agent.emoji = '🪦';
                    agent.deathTime = time;
                    // Death Cause logic: Priority check. Use safe threshold for hunger.
                    if (agent.hunger >= 99.9) {
                        agent.deathCause = "Starvation";
                    } else if (agent.memory.lastDiagnosis) {
                        agent.deathCause = agent.memory.lastDiagnosis;
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
                    }
                    agent.state = 'IDLE';
                    agent.conversationTTL = 50;
                }
            }

            this.decideAction(agent, index, time, agents);
        });
    }

    decideAction(agent: Agent, agentIndex: number, time: number, allAgents: Agent[]) {
        const totalWealth = agent.cash + agent.bankBalance;

        // High Priority: If arrested, force to Police Station (can interrupt moving)
        if (agent.state === 'ARRESTED') {
            this.ensureAtLocation(agent, agentIndex, 'Police Station', 'SLEEPING', allAgents); // Use sleeping as "in jail"
            if (Math.random() < 0.005) { // Chance to be released
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
                this.ensureAtLocation(agent, agentIndex, 'Bank', 'BANKING', allAgents);
                return;
            }
        }

        // Low chance to commit crime if not police
        if (agent.role !== 'Police' && agent.state === 'IDLE' && Math.random() < 0.001) {
            agent.state = 'CRIMINAL';
            agent.conversation = "Time for some mischief...";
            agent.conversationTTL = 50;
        }

        // Starving logic: HIGHEST PRIORITY - always prioritize eating when hungry (Interrupts moving)
        const starvationThreshold = totalWealth >= (1.0 * this.priceMultiplier) ? 20 : 70;
        if (agent.hunger > starvationThreshold && agent.state !== 'SLEEPING') {
            const restaurantCost = 0.05 * this.priceMultiplier;
            const bakeryCost = 0.03 * this.priceMultiplier;
            const homeCost = 0.01 * this.priceMultiplier;

            if (totalWealth >= restaurantCost) {
                this.ensureAtLocation(agent, agentIndex, 'Restaurant', 'EATING', allAgents);
                return;
            } else if (totalWealth >= bakeryCost) {
                this.ensureAtLocation(agent, agentIndex, 'Bakery', 'EATING', allAgents);
                return;
            } else if (totalWealth >= homeCost) {
                this.ensureAtLocation(agent, agentIndex, 'My House', 'EATING', allAgents);
                return;
            } else if (isBankOpen && (agent.bankBalance >= (5 * this.priceMultiplier) || agent.loanBalance < 200)) {
                // Last resort: If too poor for any food, MUST go to bank for a loan
                agent.state = 'BANKING';
                agent.conversation = "I'm hungry but broke. Need a loan!";
                agent.conversationTTL = 50;
                this.ensureAtLocation(agent, agentIndex, 'Bank', 'BANKING', allAgents);
                return;
            }
        }

        // Health Priority Logic: If health is low, prioritize recovery over work/leisure
        if (agent.health < 70 && agent.state !== 'SLEEPING') {
            const hospitalCost = 0.2 * this.priceMultiplier;
            // Priority 1: Hospital (Fastest recovery)
            if (totalWealth >= hospitalCost) {
                this.ensureAtLocation(agent, agentIndex, 'Hospital', 'TREATING', allAgents);
                return;
            }
            // Priority 2: Eating (Moderate recovery + prevents decay)
            const restaurantCost = 0.05 * this.priceMultiplier;
            if (totalWealth >= restaurantCost) {
                this.ensureAtLocation(agent, agentIndex, 'Restaurant', 'EATING', allAgents);
                return;
            }

            // Priority 3: Bank (Get money or loan for health) - MUST go if too poor for care
            if (isBankOpen && (agent.bankBalance >= 20 || agent.loanBalance < 200)) {
                agent.state = 'BANKING';
                agent.conversation = "I need money for medical treatment. To the bank!";
                agent.conversationTTL = 50;
                this.ensureAtLocation(agent, agentIndex, 'Bank', 'BANKING', allAgents);
                return;
            }
        }

        // Charm system: Wealthy agents prioritize shopping to increase charm
        const isWealthy = totalWealth >= 100 * this.priceMultiplier;
        const hasBasicNeedsMet = agent.hunger < 30 && agent.health > 80;
        const isCharmSeeker = isWealthy && hasBasicNeedsMet && agent.charm < 100;
        
        if (isCharmSeeker && agent.state !== 'WORKING' && agent.state !== 'SLEEPING' && Math.random() < 0.1) {
            agent.state = 'SHOPPING';
            agent.conversation = "Time to shop and increase my charm!";
            agent.conversationTTL = 50;
            this.ensureAtLocation(agent, agentIndex, 'Mall', 'SHOPPING', allAgents);
            return;
        }

        // Financial Management: Only deposit if very wealthy to reduce frequency
        const depositChance = isWealthy ? 0.05 : 0.001;
        const depositThreshold = isWealthy ? 50 : 100;

        if (isBankOpen && agent.cash >= depositThreshold && agent.hunger < 20 && agent.health > 90 &&
            Math.random() < depositChance && agent.state !== 'WORKING' && agent.state !== 'SLEEPING') {
            agent.state = 'BANKING';
            agent.conversation = isWealthy ? "Need to manage my growing capital." : "Better deposit this extra cash.";
            agent.conversationTTL = 50;
            this.ensureAtLocation(agent, agentIndex, 'Bank', 'BANKING', allAgents);
            return;
        }

        // Low Priority check: If already moving to a routine destination, don't interrupt
        if (agent.state === 'MOVING') return;

        if (hour >= 22 || hour < 8) {
            // SLEEP TIME
            if (agent.state !== 'SLEEPING') {
                this.ensureAtLocation(agent, agentIndex, 'My House', 'SLEEPING', allAgents);
            }
        } else if (hour >= 8 && hour < 12) {
            // WORK TIME
            if (agent.state !== 'WORKING') {
                this.ensureAtLocation(agent, agentIndex, this.getWorkLocation(agent), 'WORKING', allAgents);
            }
        } else if (hour >= 12 && hour < 13) {
            // LUNCH - staggered start based on index (up to 15 mins)
            const minuteOffset = (agentIndex * 3) % 15;
            const currentMinute = time % 60;

            if (currentMinute >= minuteOffset && agent.state !== 'IDLE') {
                this.ensureAtLocation(agent, agentIndex, this.getLeisureLocation(agentIndex), 'IDLE', allAgents);
            }
        } else if (hour >= 13 && hour < 17) {
            // WORK TIME (AFTERNOON)
            if (agent.state !== 'WORKING') {
                this.ensureAtLocation(agent, agentIndex, this.getWorkLocation(agent), 'WORKING', allAgents);
            }
        } else if (hour >= 17 && hour < 22) {
            // LEISURE
            if (agent.state !== 'IDLE' && agent.state !== 'SHOPPING') {
                const loc = this.getLeisureLocation(agentIndex, agent);
                const desState = loc === 'Mall' ? 'SHOPPING' : 'IDLE';
                this.ensureAtLocation(agent, agentIndex, loc, desState, allAgents);
            }
        } else {
            // FREE TIME (Catch-all for remaining hours, e.g., 22-23, 0-7 if not sleeping)
            if (agent.state !== 'IDLE' && agent.state !== 'TALKING' && agent.state !== 'EATING' && agent.state !== 'SHOPPING') {
                this.ensureAtLocation(agent, agentIndex, this.getLeisureLocation(agentIndex + 1, agent), 'IDLE', allAgents);
            } else if (agent.state === 'IDLE' && Math.random() < 0.02) {
                this.wander(agent);
            }
        }
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

        let target = location.interior || location.entry;

        // If it's a building with interior, find a good spot
        if (location.interior && location.width && location.height) {
            // Priority: Try to find a FREE tile in the interior first
            let foundFree = false;
            const innerX = location.x! + 1;
            const innerY = location.y! + 1;
            const innerW = location.width - 2;
            const innerH = location.height - 2;

            // Spiral or random search for a free tile inside
            for (let attempt = 0; attempt < 10; attempt++) {
                const tx = innerX + Math.floor(Math.random() * innerW);
                const ty = innerY + Math.floor(Math.random() * innerH);

                // Don't stand on the door tile inside
                if (tx === location.entry.x && ty === location.entry.y) continue;

                const occupies = this.world.grid[ty][tx] === 'floor';
                const isOccupied = allAgents.some(a => a.id !== agent.id && a.position.x === tx && a.position.y === ty);

                if (occupies && !isOccupied) {
                    target = { x: tx, y: ty };
                    foundFree = true;
                    break;
                }
            }

            // Fallback: If no free spot found, use the old index-based distribution but ensure it's not the door
            if (!foundFree) {
                const offsetX = (agentIndex % innerW);
                const offsetY = (Math.floor(agentIndex / innerW) % innerH);
                target = { x: innerX + offsetX, y: innerY + offsetY };
                if (target.x === location.entry.x && target.y === location.entry.y) {
                    target.y = Math.max(innerY, target.y - 1);
                }
            }
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

    logBuildingTransaction(loc: Location, amount: number, description: string, timestamp: number) {
        loc.stats.transactions.unshift({ amount, description, timestamp });
        if (loc.stats.transactions.length > 100) {
            loc.stats.transactions.pop();
        }
    }
}
