
import { Agent, AgentState } from '../engine/Agent';
import { World, Location } from '../engine/World';

export class BehaviorSystem {
    world: World;

    constructor(world: World) {
        this.world = world;
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
                let income = this.getIncome(agent);
                // Loan repayment: 20% of income goes to repaying the loan
                if (agent.loanBalance > 0) {
                    const repayment = Math.min(agent.loanBalance, income * 0.2);
                    agent.loanBalance -= repayment;
                    income -= repayment;
                    agent.logTransaction(repayment, "Auto-loan repayment", 'loan', time);
                    // Log to bank if possible (though bank revenue doesn't increase from loan repayment usually, but let's track)
                    const bank = this.world.locations.find(l => l.name === 'Bank');
                    if (bank) this.logBuildingTransaction(bank, repayment, `Loan repayment from ${agent.name}`, time);
                }
                agent.cash += income;

                if (!agent.sessionFinance || agent.sessionFinance.type !== 'income') {
                    agent.sessionFinance = { amount: 0, description: `Work (${agent.role})`, type: 'income' };
                }
                agent.sessionFinance.amount += income;
            } else if (agent.sessionFinance && agent.sessionFinance.type === 'income') {
                agent.logTransaction(agent.sessionFinance.amount, agent.sessionFinance.description, 'income', time);
                agent.sessionFinance = undefined;
            }

            // Hunger logic: increases over time, decreases when eating
            if (agent.state === 'EATING') {
                agent.hunger = Math.max(0, agent.hunger - 5.0);
                agent.health = Math.min(100, agent.health + 0.2); // Recover health while eating

                let cost = 0.05; // Default: Restaurant
                if (locAt?.name === 'Bakery') cost = 0.03;
                if (locAt?.name === 'My House') cost = 0.01;

                let hasPaid = false;
                if (agent.cash >= cost) {
                    agent.cash -= cost;
                    hasPaid = true;
                } else if (agent.bankBalance >= cost) {
                    agent.bankBalance -= cost;
                    hasPaid = true;
                    if (time % 10 === 0) { // Log occasionally to not spam
                        agent.logTransaction(-cost, `Direct bank payment for food at ${locAt?.name || 'Local'}`, 'bank', time);
                    }
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
                    agent.state = 'IDLE';
                    agent.conversation = "I'm completely broke and starving!";
                    agent.conversationTTL = 50;
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
                agent.hunger = Math.min(100, agent.hunger + 0.05);
            }

            // Health decay from hunger: ONLY at absolute starvation
            if (agent.hunger >= 100) {
                agent.health = Math.max(0, agent.health - 0.1); // Faster decay when actually starving
            }

            // Health and Sickness logic
            if (agent.state === 'TREATING') {
                agent.health = Math.min(100, agent.health + 1.0);
                const cost = 0.2;
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
                // Chance to get sick (Infection, Flu, etc.)
                if (agent.health === 100 && Math.random() < 0.0002) {
                    agent.health = 30;
                    const illnesses = ["Severe Infection", "Respiratory Flu", "Food Poisoning"];
                    const illness = illnesses[Math.floor(Math.random() * illnesses.length)];
                    agent.memory.lastDiagnosis = illness;
                    agent.conversation = `I think I have ${illness}...`;
                    agent.conversationTTL = 50;
                }

                // Rare chance of a sudden critical health event (Heart Attack, Stroke)
                if (agent.health > 80 && Math.random() < 0.00005) {
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
            if (!locAt && Math.random() < 0.00002) {
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
                    } else if (agent.cash >= 10) {
                        // Deposit
                        const amount = agent.cash;
                        bank.stats.extra!.deposits += amount;
                        agent.bankBalance += amount;
                        agent.cash = 0;
                        agent.logTransaction(-amount, "Deposit to Bank", 'bank', time);
                        this.logBuildingTransaction(bank, amount, `Deposit from ${agent.name}`, time);
                        agent.conversation = "Money safely deposited!";
                    } else if (agent.bankBalance >= 20) {
                        // Regular Withdraw
                        agent.bankBalance -= 20;
                        agent.cash += 20;
                        agent.logTransaction(20, "Bank Withdrawal", 'bank', time);
                        this.logBuildingTransaction(bank, -20, `Regular Withdrawal by ${agent.name}`, time);
                        bank.stats.extra!.withdrawals += 20;
                        agent.conversation = "Withdrew $20 for spending!";
                    }
                    agent.state = 'IDLE';
                    agent.conversationTTL = 50;
                }
            }

            this.decideAction(agent, index, time);
        });
    }

    decideAction(agent: Agent, agentIndex: number, time: number) {
        // High Priority: If arrested, force to Police Station (can interrupt moving)
        if (agent.state === 'ARRESTED') {
            this.ensureAtLocation(agent, agentIndex, 'Police Station', 'SLEEPING'); // Use sleeping as "in jail"
            if (Math.random() < 0.005) { // Chance to be released
                agent.state = 'IDLE';
                agent.conversation = "I've served my time.";
                agent.conversationTTL = 50;
            }
            return;
        }

        const hour = Math.floor(time / 60) % 24;
        const isBankOpen = hour >= 9 && hour < 18;

        // If has enough cash, priorize going to the bank
        if (isBankOpen && agent.cash >= 10 && agent.state !== 'BANKING' && agent.state !== 'WORKING' && agent.state !== 'SLEEPING') {
            agent.state = 'BANKING';
        }

        if (agent.state === 'BANKING') {
            if (!isBankOpen) {
                agent.state = 'IDLE';
                agent.conversation = "Bank's closed. I'll come back tomorrow.";
                agent.conversationTTL = 50;
            } else {
                this.ensureAtLocation(agent, agentIndex, 'Bank', 'BANKING');
                return;
            }
        }

        // Low chance to commit crime if not police
        if (agent.role !== 'Police' && agent.state === 'IDLE' && Math.random() < 0.001) {
            agent.state = 'CRIMINAL';
            agent.conversation = "Time for some mischief...";
            agent.conversationTTL = 50;
        }

        // Health Priority Logic: If health is low, prioritize recovery over work/leisure
        if (agent.health < 70 && agent.state !== 'SLEEPING') {
            // Priority 1: Hospital (Fastest recovery)
            if (agent.cash >= 10) {
                this.ensureAtLocation(agent, agentIndex, 'Hospital', 'TREATING');
                return;
            }
            // Priority 2: Eating (Moderate recovery + prevents decay)
            else if (agent.cash >= 5 || agent.hunger > 50) {
                if (agent.cash >= 5) {
                    this.ensureAtLocation(agent, agentIndex, 'Restaurant', 'EATING');
                    return;
                }
            }

            // Priority 3: Bank (Get money or loan for health)
            if (isBankOpen && (agent.bankBalance >= 20 || agent.loanBalance < 200)) {
                agent.state = 'BANKING';
                agent.conversation = "I'm not feeling well, need money for care!";
                agent.conversationTTL = 50;
                this.ensureAtLocation(agent, agentIndex, 'Bank', 'BANKING');
                return;
            }
        }

        // Starving logic: High priority if hunger is dangerous (Interrupts moving)
        // Wealthy agents start caring MUCH earlier (hunger > 20) to prevent any risk
        const totalWealth = agent.cash + agent.bankBalance;
        const hungerThreshold = totalWealth >= 10 ? 20 : 70;
        if (agent.hunger > hungerThreshold && agent.state !== 'SLEEPING') {
            if (agent.cash >= 10 || agent.bankBalance >= 10) {
                this.ensureAtLocation(agent, agentIndex, 'Restaurant', 'EATING');
                return;
            } else if (agent.cash >= 5) {
                this.ensureAtLocation(agent, agentIndex, 'Bakery', 'EATING');
                return;
            } else if (agent.cash >= 2) {
                this.ensureAtLocation(agent, agentIndex, 'My House', 'EATING');
                return;
            } else if (isBankOpen && (agent.bankBalance >= 20 || agent.loanBalance < 200)) {
                // Can't afford house food? Go to bank
                agent.state = 'BANKING';
                agent.conversation = "I'm hungry but broke. Need to go to the bank!";
                agent.conversationTTL = 50;
                this.ensureAtLocation(agent, agentIndex, 'Bank', 'BANKING');
                return;
            }
        }

        // Low Priority check: If already moving to a routine destination, don't interrupt
        if (agent.state === 'MOVING') return;

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
            // LUNCH - staggered start based on index (up to 15 mins)
            const minuteOffset = (agentIndex * 3) % 15;
            const currentMinute = time % 60;

            if (currentMinute >= minuteOffset && agent.state !== 'IDLE') {
                this.ensureAtLocation(agent, agentIndex, this.getLeisureLocation(agentIndex), 'IDLE');
            }
        } else if (hour >= 13 && hour < 17) {
            // WORK TIME
            if (agent.state !== 'WORKING') {
                this.ensureAtLocation(agent, agentIndex, this.getWorkLocation(agent), 'WORKING');
            }
        } else if (hour >= 17 && hour < 19) {
            // DINNER TIME
            const isBankOpen = hour >= 9 && hour < 18;

            // If too poor to eat but has money in bank, go withdraw during banking hours
            if (agent.cash < 5 && agent.bankBalance >= 20 && isBankOpen) {
                agent.state = 'BANKING';
                agent.conversation = "Going to the bank to get some cash for dinner.";
                agent.conversationTTL = 50;
            }

            if (agent.state !== 'EATING') {
                if (agent.cash >= 5) {
                    this.ensureAtLocation(agent, agentIndex, 'Restaurant', 'EATING');
                } else {
                    // Too poor and can't withdraw
                    if (agent.state !== 'IDLE') {
                        agent.state = 'IDLE';
                        agent.conversation = "I don't have enough money for a restaurant...";
                        agent.conversationTTL = 50;
                    }
                }
            }
        } else {
            // FREE TIME
            if (agent.state !== 'IDLE' && agent.state !== 'TALKING' && agent.state !== 'EATING') {
                this.ensureAtLocation(agent, agentIndex, this.getLeisureLocation(agentIndex + 1), 'IDLE');
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
        switch (agent.role) {
            case 'Mayor': return 0.5;
            case 'Doctor': return 0.4;
            case 'Police': return 0.3;
            case 'Librarian': return 0.2;
            case 'Baker': return 0.2;
            case 'Gardener': return 0.1;
            default: return 0.1;
        }
    }

    getLeisureLocation(index: number): string {
        const locations = ['Park', 'Library', 'Bakery', 'Restaurant'];
        return locations[index % locations.length];
    }

    ensureAtLocation(agent: Agent, agentIndex: number, locationName: string, desiredState: AgentState) {
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

            let tx = location.interior.x + offsetX;
            let ty = location.interior.y + offsetY;

            // Prevent blocking the entry door tile
            if (tx === location.entry.x && ty === location.entry.y) {
                ty -= 1; // Move at least one tile inside
            }

            target = { x: tx, y: ty };
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
