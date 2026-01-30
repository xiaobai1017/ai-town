import { useState, useEffect, useRef, useCallback } from 'react';
import { CompatibleOptimizedWorld } from '@/engine/CompatibleOptimizedWorld';
import { AntiDeadlockOptimizedAgent } from '@/engine/AntiDeadlockOptimizedAgent';
import { OptimizedBehaviorSystem } from '@/ai/OptimizedBehaviorSystem';
import { DialogueSystem } from '@/ai/DialogueSystem';
import { initializeWorld } from '@/data/townScript';
export function useOptimizedGameLoop() {
    const [gameState, setGameState] = useState({
        world: null,
        agents: [],
        time: 480, // Start at 8:00 AM
        isRunning: false,
        dialogueLog: [],
        priceLevel: 1.0,
        wageLevel: 1.0,
        riskLevel: 1.0
    });
    const stateRef = useRef(gameState);
    const behaviorSystemRef = useRef(null);
    const dialogueSystemRef = useRef(null);
    const requestRef = useRef(undefined);
    const lastTimeRef = useRef(0);
    // Speed factor: 1 real second = X game minutes
    const [speed, setSpeed] = useState(1);
    useEffect(() => {
        // Initialize
        const { world: originalWorld, agents: originalAgents } = initializeWorld();
        // Create optimized versions
        const world = new CompatibleOptimizedWorld(originalWorld.width, originalWorld.height);
        const agents = originalAgents.map(agent => {
            const optimizedAgent = new AntiDeadlockOptimizedAgent(agent.id, agent.name, agent.role, agent.position, agent.color, agent.emoji, world, // 添加对世界的引用
            agent.description);
            // Copy additional properties
            optimizedAgent.hunger = agent.hunger;
            optimizedAgent.health = agent.health;
            optimizedAgent.cash = agent.cash;
            optimizedAgent.bankBalance = agent.bankBalance;
            optimizedAgent.loanBalance = agent.loanBalance;
            optimizedAgent.charm = agent.charm;
            optimizedAgent.state = agent.state;
            return optimizedAgent;
        });
        const behaviorSystem = new OptimizedBehaviorSystem(world);
        const dialogueSystem = new DialogueSystem();
        const initialState = {
            world,
            agents,
            time: 480,
            isRunning: false,
            dialogueLog: [],
            priceLevel: 1.0,
            wageLevel: 1.0,
            riskLevel: 1.0
        };
        setGameState(initialState);
        stateRef.current = initialState;
        behaviorSystemRef.current = behaviorSystem;
        dialogueSystemRef.current = dialogueSystem;
    }, []);
    const tick = useCallback((timestamp) => {
        var _a;
        if (!stateRef.current.isRunning) {
            lastTimeRef.current = timestamp;
            requestRef.current = requestAnimationFrame(tick);
            return;
        }
        const deltaTime = timestamp - lastTimeRef.current;
        // Update every ~100ms or based on speed?
        // Let's say 1 tick = 1 game minute.
        // At speed 1, 1 game minute = 100ms real time.
        const tickDuration = 1000 / (10 * speed);
        if (deltaTime >= tickDuration) {
            const currentState = stateRef.current;
            const world = currentState.world;
            if (!world)
                return;
            // Update Time
            const newTime = currentState.time + 1;
            // Update AI - 使用优化后的行为系统
            if (behaviorSystemRef.current) {
                behaviorSystemRef.current.setEconomicLevels(currentState.priceLevel, currentState.wageLevel, currentState.riskLevel);
                behaviorSystemRef.current.update(currentState.agents, newTime);
            }
            // Update Agents (Movement) - 使用优化后的代理
            currentState.agents.forEach(agent => agent.updateOptimized(currentState.agents));
            // Update Dialogue
            if (dialogueSystemRef.current) {
                dialogueSystemRef.current.update(currentState.agents, newTime);
            }
            // Check if all agents are dead
            const allDead = currentState.agents.length > 0 && currentState.agents.every(a => a.state === 'DEAD');
            // Check if any agent has reached maximum charm
            const charmWinner = currentState.agents.find(a => a.charm >= 100);
            let isRunning = currentState.isRunning;
            if (allDead && isRunning) {
                console.log("All residents have passed away. Stopping simulation.");
                isRunning = false;
            }
            else if (charmWinner && isRunning) {
                console.log(`Charm winner: ${charmWinner.name} reached maximum charm!`);
                isRunning = false;
            }
            // Update State
            const newState = Object.assign(Object.assign({}, currentState), { time: newTime, isRunning, dialogueLog: [...(((_a = dialogueSystemRef.current) === null || _a === void 0 ? void 0 : _a.dialogueLog) || [])] });
            stateRef.current = newState;
            setGameState(Object.assign({}, newState)); // Trigger render
            lastTimeRef.current = timestamp;
        }
        requestRef.current = requestAnimationFrame(tick);
    }, [speed]);
    useEffect(() => {
        requestRef.current = requestAnimationFrame(tick);
        return () => {
            if (requestRef.current)
                cancelAnimationFrame(requestRef.current);
        };
    }, [tick]);
    const togglePause = () => {
        stateRef.current.isRunning = !stateRef.current.isRunning;
        setGameState(prev => (Object.assign(Object.assign({}, prev), { isRunning: !prev.isRunning })));
    };
    const addAgent = () => {
        if (!stateRef.current.world)
            return;
        const newId = (stateRef.current.agents.length + 1).toString();
        const names = ['Grace', 'Hank', 'Ivy', 'Jack', 'Kate', 'Leo', 'Mia', 'Noah', 'Olivia', 'Paul'];
        const roles = ['Chef', 'Writer', 'Student', 'Artist', 'Engineer', 'Musician', 'Dancer', 'Pilot'];
        const colors = ['#ffc6ff', '#bdb2ff', '#a0c4ff', '#9bf6ff', '#fdffb6', '#ffd6a5', '#ffadad', '#ff85a1'];
        const emojis = ['🍳', '✍️', '🎓', '🎨', '🔧', '🎸', '💃', '👨‍✈️'];
        const randomName = names[Math.floor(Math.random() * names.length)];
        const randomRole = roles[Math.floor(Math.random() * roles.length)];
        const randomColor = colors[Math.floor(Math.random() * colors.length)];
        const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
        const descriptions = [
            `A talented ${randomRole.toLowerCase()} with a passion for excellence.`,
            `The new ${randomRole.toLowerCase()} in town, ready to contribute.`,
            `An experienced ${randomRole.toLowerCase()} looking for new adventures.`,
            `Always dreamed of being a ${randomRole.toLowerCase()}, and now here they are.`,
        ];
        const randomDescription = descriptions[Math.floor(Math.random() * descriptions.length)];
        const newAgent = new AntiDeadlockOptimizedAgent(newId, randomName, randomRole, { x: Math.floor(Math.random() * 20) + 5, y: Math.floor(Math.random() * 10) + 5 }, randomColor, randomEmoji, stateRef.current.world, // 添加对世界的引用
        randomDescription);
        stateRef.current.agents = [...stateRef.current.agents, newAgent];
        setGameState(prev => (Object.assign(Object.assign({}, prev), { agents: [...prev.agents, newAgent] })));
    };
    const removeAgent = () => {
        const currentAgents = stateRef.current.agents;
        if (currentAgents.length <= 1)
            return;
        // Find the index of the last agent that is NOT a 'Police'
        let indexToRemove = -1;
        for (let i = currentAgents.length - 1; i >= 0; i--) {
            if (currentAgents[i].role !== 'Police') {
                indexToRemove = i;
                break;
            }
        }
        if (indexToRemove !== -1) {
            const newAgents = currentAgents.filter((_, i) => i !== indexToRemove);
            stateRef.current.agents = newAgents;
            setGameState(prev => (Object.assign(Object.assign({}, prev), { agents: newAgents })));
        }
    };
    const setPriceLevel = (val) => {
        stateRef.current.priceLevel = val;
        setGameState(prev => (Object.assign(Object.assign({}, prev), { priceLevel: val })));
    };
    const setWageLevel = (val) => {
        stateRef.current.wageLevel = val;
        setGameState(prev => (Object.assign(Object.assign({}, prev), { wageLevel: val })));
    };
    const setRiskLevel = (val) => {
        stateRef.current.riskLevel = val;
        setGameState(prev => (Object.assign(Object.assign({}, prev), { riskLevel: val })));
    };
    return {
        gameState,
        togglePause,
        setSpeed,
        speed,
        addAgent,
        removeAgent,
        setPriceLevel,
        setWageLevel,
        setRiskLevel
    };
}
