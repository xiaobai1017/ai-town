
import { useState, useEffect, useRef, useCallback } from 'react';
import { World } from '@/engine/World';
import { Agent } from '@/engine/Agent';
import { BehaviorSystem } from '@/ai/BehaviorSystem';
import { DialogueSystem, DialoguePacket } from '@/ai/DialogueSystem';
import { initializeWorld } from '@/data/townScript';

export interface GameState {
    world: World | null;
    agents: Agent[];
    time: number; // in minutes
    isRunning: boolean;
    dialogueLog: DialoguePacket[];
}

export function useGameLoop() {
    const [gameState, setGameState] = useState<GameState>({
        world: null,
        agents: [],
        time: 480, // Start at 8:00 AM
        isRunning: false,
        dialogueLog: []
    });

    const stateRef = useRef<GameState>(gameState);
    const behaviorSystemRef = useRef<BehaviorSystem | null>(null);
    const dialogueSystemRef = useRef<DialogueSystem | null>(null);
    const requestRef = useRef<number>(undefined);
    const lastTimeRef = useRef<number>(0);

    // Speed factor: 1 real second = X game minutes
    const [speed, setSpeed] = useState(1);

    useEffect(() => {
        // Initialize
        const { world, agents } = initializeWorld();
        const behaviorSystem = new BehaviorSystem(world);
        const dialogueSystem = new DialogueSystem();

        const initialState = {
            world,
            agents,
            time: 480,
            isRunning: false,
            dialogueLog: []
        };

        setGameState(initialState);
        stateRef.current = initialState;
        behaviorSystemRef.current = behaviorSystem;
        dialogueSystemRef.current = dialogueSystem;
    }, []);

    const tick = useCallback((timestamp: number) => {
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
            if (!world) return;

            // Update Time
            const newTime = currentState.time + 1;

            // Update AI
            if (behaviorSystemRef.current) {
                behaviorSystemRef.current.update(currentState.agents, newTime);
            }

            // Update Agents (Movement)
            currentState.agents.forEach(agent => agent.update(world, currentState.agents));

            // Update Dialogue
            if (dialogueSystemRef.current) {
                dialogueSystemRef.current.update(currentState.agents);
            }

            // Check if all agents are dead
            const allDead = currentState.agents.length > 0 && currentState.agents.every(a => a.state === 'DEAD');
            let isRunning = currentState.isRunning;
            if (allDead && isRunning) {
                console.log("All residents have passed away. Stopping simulation.");
                isRunning = false;
            }

            // Update State
            const newState = {
                ...currentState,
                time: newTime,
                isRunning,
                dialogueLog: [...(dialogueSystemRef.current?.dialogueLog || [])]
            };

            stateRef.current = newState;
            setGameState({ ...newState }); // Trigger render
            lastTimeRef.current = timestamp;
        }

        requestRef.current = requestAnimationFrame(tick);
    }, [speed]);

    useEffect(() => {
        requestRef.current = requestAnimationFrame(tick);
        return () => {
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
        };
    }, [tick]);

    const togglePause = () => {
        stateRef.current.isRunning = !stateRef.current.isRunning;
        setGameState(prev => ({ ...prev, isRunning: !prev.isRunning }));
    };

    const addAgent = () => {
        if (!stateRef.current.world) return;
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

        const newAgent = new Agent(
            newId,
            randomName,
            randomRole,
            { x: Math.floor(Math.random() * 20) + 5, y: Math.floor(Math.random() * 10) + 5 },
            randomColor,
            randomEmoji,
            randomDescription
        );

        stateRef.current.agents = [...stateRef.current.agents, newAgent];
        setGameState(prev => ({ ...prev, agents: [...prev.agents, newAgent] }));
    };

    const removeAgent = () => {
        const currentAgents = stateRef.current.agents;
        if (currentAgents.length <= 1) return;

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
            setGameState(prev => ({ ...prev, agents: newAgents }));
        }
    };

    return {
        gameState,
        togglePause,
        setSpeed,
        speed,
        addAgent,
        removeAgent
    };
}
