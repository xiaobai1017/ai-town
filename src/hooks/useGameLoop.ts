
import { useState, useEffect, useRef, useCallback } from 'react';
import { World } from '@/engine/World';
import { Agent } from '@/engine/Agent';
import { BehaviorSystem } from '@/ai/BehaviorSystem';
import { DialogueSystem, DialoguePacket } from '@/ai/DialogueSystem';
import { initializeWorld } from '@/data/townScript';
import { clearReplay, loadReplay, makeReplayFrame, restoreFrame, saveReplay, ReplayRecord, ReplayFrame } from '@/replay/SimulationReplay';

export interface GameState {
    world: World | null;
    agents: Agent[];
    time: number; // in minutes
    isRunning: boolean;
    dialogueLog: DialoguePacket[];
    priceLevel: number;
    wageLevel: number;
    riskLevel: number;
    jevEnabled: boolean;
    jevCooldown: number; // Game minutes between JEV decisions per resident
    isReplaying: boolean;
}

export function useGameLoop() {
    const [gameState, setGameState] = useState<GameState>({
        world: null,
        agents: [],
        time: 480, // Start at 8:00 AM
        isRunning: false,
        dialogueLog: [],
        priceLevel: 1.0,
        wageLevel: 1.0,
        riskLevel: 1.0
        ,jevEnabled: false,
        jevCooldown: 30,
        isReplaying: false
    });

    const stateRef = useRef<GameState>(gameState);
    const behaviorSystemRef = useRef<BehaviorSystem | null>(null);
    const dialogueSystemRef = useRef<DialogueSystem | null>(null);
    // Simulation is timer-driven instead of RAF-driven. RAF is throttled or
    // paused by browsers when the tab is in the background.
    const requestRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const lastTimeRef = useRef<number>(0);
    const recordingRef = useRef<ReplayRecord | null>(null);
    const replayRef = useRef<{ frames: ReplayFrame[]; index: number } | null>(null);
    const [replayAvailable, setReplayAvailable] = useState(false);

    // Speed factor: 1 real second = X game minutes
    const [speed, setSpeed] = useState(1);

    useEffect(() => {
        // Initialize
        setReplayAvailable(Boolean(loadReplay()));
        const { world, agents } = initializeWorld();
        const behaviorSystem = new BehaviorSystem(world);
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
            ,jevEnabled: false,
            jevCooldown: 30,
            isReplaying: false
        };

        setGameState(initialState);
        stateRef.current = initialState;
        behaviorSystemRef.current = behaviorSystem;
        dialogueSystemRef.current = dialogueSystem;
    }, []);

    const tick = useCallback((timestamp: number) => {
        if (replayRef.current) {
            if (timestamp - lastTimeRef.current >= 100) {
                const replay = replayRef.current;
                replay.index += 1;
                if (replay.index >= replay.frames.length) {
                    replayRef.current = null;
                    stateRef.current = { ...stateRef.current, isRunning: false, isReplaying: false };
                    setGameState({ ...stateRef.current });
                } else {
                    const frame = restoreFrame(replay.frames[replay.index]);
                    const nextState = { ...frame, isRunning: false, isReplaying: true, jevCooldown: stateRef.current.jevCooldown };
                    stateRef.current = nextState;
                    setGameState(nextState);
                    lastTimeRef.current = timestamp;
                }
            }
            requestRef.current = setTimeout(() => tick(performance.now()), 50);
            return;
        }
        if (!stateRef.current.isRunning) {
            lastTimeRef.current = timestamp;
            requestRef.current = setTimeout(() => tick(performance.now()), 50);
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
                behaviorSystemRef.current.setEconomicLevels(currentState.priceLevel, currentState.wageLevel, currentState.riskLevel);
                behaviorSystemRef.current.update(currentState.agents, newTime);
            }

            // Update Agents (Movement)
            currentState.agents.forEach(agent => agent.update(world, currentState.agents));

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
            } else if (charmWinner && isRunning) {
                console.log(`Charm winner: ${charmWinner.name} reached maximum charm!`);
                isRunning = false;
            }

            // Update State
            const newState = {
                ...currentState,
                time: newTime,
                isRunning,
                dialogueLog: [...(dialogueSystemRef.current?.dialogueLog || [])]
            };

            if (recordingRef.current && newTime % 5 === 0) {
                recordingRef.current.frames.push(makeReplayFrame({ ...newState, world, agents: currentState.agents }));
                if (recordingRef.current.frames.length > 240) {
                    recordingRef.current.frames.splice(0, recordingRef.current.frames.length - 240);
                }
                saveReplay(recordingRef.current);
                setReplayAvailable(true);
            }

            stateRef.current = newState;
            setGameState({ ...newState }); // Trigger render
            lastTimeRef.current = timestamp;
        }

        requestRef.current = setTimeout(() => tick(performance.now()), 50);
    }, [speed]);

    useEffect(() => {
        requestRef.current = setTimeout(() => tick(performance.now()), 50);
        return () => {
            if (requestRef.current) clearTimeout(requestRef.current);
        };
    }, [tick]);

    const togglePause = () => {
        if (!stateRef.current.isRunning && !stateRef.current.isReplaying && !recordingRef.current && stateRef.current.world) {
            clearReplay();
            const initialFrame = makeReplayFrame({ ...stateRef.current, world: stateRef.current.world!, agents: stateRef.current.agents });
            recordingRef.current = { version: 1, createdAt: new Date().toISOString(), frames: [initialFrame] };
            saveReplay(recordingRef.current);
            setReplayAvailable(true);
        }
        stateRef.current.isRunning = !stateRef.current.isRunning;
        setGameState(prev => ({ ...prev, isRunning: !prev.isRunning }));
    };

    const startReplay = () => {
        const record = loadReplay();
        if (!record) return;
        replayRef.current = { frames: record.frames, index: 0 };
        const frame = restoreFrame(record.frames[0]);
        const nextState = { ...frame, isRunning: false, isReplaying: true, jevCooldown: stateRef.current.jevCooldown };
        stateRef.current = nextState;
        setGameState(nextState);
        lastTimeRef.current = performance.now();
    };

    const stopReplay = () => {
        replayRef.current = null;
        stateRef.current.isReplaying = false;
        setGameState(prev => ({ ...prev, isReplaying: false }));
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

    const setPriceLevel = (val: number) => {
        stateRef.current.priceLevel = val;
        setGameState(prev => ({ ...prev, priceLevel: val }));
    };

    const setWageLevel = (val: number) => {
        stateRef.current.wageLevel = val;
        setGameState(prev => ({ ...prev, wageLevel: val }));
    };

    const setRiskLevel = (val: number) => {
        stateRef.current.riskLevel = val;
        setGameState(prev => ({ ...prev, riskLevel: val }));
    };

    const setJevEnabled = (enabled: boolean) => {
        stateRef.current.jevEnabled = enabled;
        behaviorSystemRef.current?.setJevEnabled(enabled);
        setGameState(prev => ({ ...prev, jevEnabled: enabled }));
    };

    const setJevCooldown = (minutes: number) => {
        const clamped = Math.max(1, Math.round(minutes));
        stateRef.current.jevCooldown = clamped;
        setGameState(prev => ({ ...prev, jevCooldown: clamped }));
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
        ,setJevEnabled
        ,setJevCooldown,
        replayAvailable,
        startReplay,
        stopReplay
    };
}
