
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
    const requestRef = useRef<number>();
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
            currentState.agents.forEach(agent => agent.update(world));

            // Update Dialogue
            if (dialogueSystemRef.current) {
                dialogueSystemRef.current.update(currentState.agents);
            }

            // Update State
            const newState = {
                ...currentState,
                time: newTime,
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

    return {
        gameState,
        togglePause,
        setSpeed,
        speed
    };
}
