
/**
 * 游戏循环状态管理与控制器 Hook
 * @author hubin
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { World } from '@/engine/World';
import { Agent } from '@/engine/Agent';
import { BehaviorSystem } from '@/ai/BehaviorSystem';
import { DialogueSystem, DialoguePacket } from '@/ai/DialogueSystem';
import { initializeWorld } from '@/data/townScript';
import { clearReplay, loadReplay, makeReplayFrame, restoreFrame, saveReplay, downsampleFrames, ReplayRecord, ReplayFrame } from '@/replay/SimulationReplay';

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
    localAiEnabled: boolean;
    jevCooldown: number; // Game minutes between JEV decisions per resident
    isReplaying: boolean;
}

export function useGameLoop() {
    const serverMode = process.env.NEXT_PUBLIC_SIMULATION_MODE === 'server';
    const [gameState, setGameState] = useState<GameState>({
        world: null,
        agents: [],
        time: 480, // Start at 8:00 AM
        isRunning: false,
        dialogueLog: [],
        priceLevel: 1.0,
        wageLevel: 1.0,
        riskLevel: 1.0,
        jevEnabled: false,
        localAiEnabled: true,
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

    const hydrateServerState = useCallback((raw: any): GameState => {
        const world = Object.assign(new World(raw.world.width, raw.world.height), raw.world);
        const agents = raw.agents.map((item: any) => Object.assign(new Agent(item.id, item.name, item.role, item.position, item.color, item.emoji, item.description), item));
        return { ...raw, world, agents } as GameState;
    }, []);

    const sendServerCommand = useCallback(async (type: string, value?: number | boolean) => {
        if (!serverMode) return;
        await fetch('/api/simulation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, value }) });
        // Re-arm polling so the UI reflects the new server state immediately.
        void pollRef.current?.();
    }, [serverMode]);

    // Speed factor: 1 real second = X game minutes
    const [speed, setSpeed] = useState(1);

    const pollRef = useRef<(() => Promise<void>) | null>(null);

    useEffect(() => {
        // 无论何种模式，挂载时优先检查本地历史录制记录并恢复，保证 Day 1 开局历史不被空白覆盖
        const existingRecord = loadReplay();
        if (existingRecord && Array.isArray(existingRecord.frames) && existingRecord.frames.length > 0) {
            recordingRef.current = existingRecord;
            setReplayAvailable(true);
        } else {
            setReplayAvailable(false);
        }

        if (serverMode) {
            let active = true;
            let timer: ReturnType<typeof setTimeout>;
            const poll = async () => {
                if (!active) return;
                try {
                    const response = await fetch('/api/simulation', { cache: 'no-store' });
                    if (active) {
                        const next = hydrateServerState(await response.json());
                        // 重放播放期间，不让轮询覆盖回放状态
                        if (!stateRef.current.isReplaying) {
                            stateRef.current = next;
                            setGameState(next);

                            // 在服务端仿真运行时，按时间推进自动录制帧供前端重放
                            if (next.isRunning && next.world && next.agents) {
                                if (!recordingRef.current) {
                                    recordingRef.current = { version: 1, createdAt: new Date().toISOString(), frames: [] };
                                }
                                const frames = recordingRef.current.frames;
                                const lastFrame = frames[frames.length - 1];

                                // 检测服务端是否重置回第一天或时间倒退（若倒退则重置录制帧）
                                if (lastFrame && next.time < lastFrame.time) {
                                    recordingRef.current.frames = [];
                                }

                                // 初始帧必录，之后每 5 个游戏分钟录制一帧
                                const shouldRecord = recordingRef.current.frames.length === 0 || 
                                    (next.time - recordingRef.current.frames[recordingRef.current.frames.length - 1].time >= 5);

                                if (shouldRecord) {
                                    recordingRef.current.frames.push(makeReplayFrame({ ...next, world: next.world, agents: next.agents }));
                                    // 内存缓冲区超额时通过等距降采样平滑控制在 240 帧内，始终严格保留 Day 1 初始帧与最新帧
                                    if (recordingRef.current.frames.length > 300) {
                                        recordingRef.current.frames = downsampleFrames(recordingRef.current.frames, 240);
                                    }
                                    saveReplay(recordingRef.current);
                                    setReplayAvailable(true);
                                }
                            }
                        }
                    }
                } catch { /* server may still be starting */ }
                if (!active) return;
                // Only keep polling while the simulation is running and not in replay.
                if (stateRef.current.isRunning && !stateRef.current.isReplaying) {
                    timer = setTimeout(poll, 250);
                }
            };
            pollRef.current = poll;
            void poll();
            return () => { active = false; pollRef.current = null; clearTimeout(timer); };
        }
        // Initialize
        const { world, agents } = initializeWorld();
        const behaviorSystem = new BehaviorSystem(world);
        behaviorSystem.setIsRunning(false);
        const dialogueSystem = new DialogueSystem();

        const initialState = {
            world,
            agents,
            time: 480,
            isRunning: false,
            dialogueLog: [],
            priceLevel: 1.0,
            wageLevel: 1.0,
            riskLevel: 1.0,
            jevEnabled: false,
            localAiEnabled: true,
            jevCooldown: 30,
            isReplaying: false
        };

        setGameState(initialState);
        stateRef.current = initialState;
        behaviorSystemRef.current = behaviorSystem;
        dialogueSystemRef.current = dialogueSystem;
    }, [hydrateServerState, serverMode]);

    const tick = useCallback((timestamp: number) => {
        // 1. 如果正在进行回放，无论是否为 serverMode，均由客户端逐帧驱动播放历史画面
        if (replayRef.current) {
            if (timestamp - lastTimeRef.current >= 100) {
                const replay = replayRef.current;
                replay.index += 1;
                if (replay.index >= replay.frames.length) {
                    replayRef.current = null;
                    stateRef.current = { ...stateRef.current, isRunning: false, isReplaying: false };
                    setGameState({ ...stateRef.current });
                    if (serverMode) {
                        void pollRef.current?.();
                    }
                } else {
                    const frame = restoreFrame(replay.frames[replay.index]);
                    const nextState = { ...frame, isRunning: false, isReplaying: true, jevCooldown: stateRef.current.jevCooldown, localAiEnabled: frame.localAiEnabled ?? stateRef.current.localAiEnabled ?? true };
                    stateRef.current = nextState;
                    setGameState(nextState);
                    lastTimeRef.current = timestamp;
                }
            }
            requestRef.current = setTimeout(() => tick(performance.now()), 50);
            return;
        }

        // 2. 非回放状态下：若是 serverMode，仿真由服务端主导，客户端不执行本地物理仿真
        if (serverMode) return;
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
                if (recordingRef.current.frames.length > 300) {
                    recordingRef.current.frames = downsampleFrames(recordingRef.current.frames, 240);
                }
                saveReplay(recordingRef.current);
                setReplayAvailable(true);
            }

            stateRef.current = newState;
            setGameState({ ...newState }); // Trigger render
            lastTimeRef.current = timestamp;
        }

        requestRef.current = setTimeout(() => tick(performance.now()), 50);
    }, [serverMode, speed]);

    useEffect(() => {
        requestRef.current = setTimeout(() => tick(performance.now()), 50);
        return () => {
            if (requestRef.current) clearTimeout(requestRef.current);
        };
    }, [tick]);

    const togglePause = () => {
        if (serverMode) { void sendServerCommand('toggle'); return; }
        if (!stateRef.current.isRunning && !stateRef.current.isReplaying && !recordingRef.current && stateRef.current.world) {
            clearReplay();
            const initialFrame = makeReplayFrame({ ...stateRef.current, world: stateRef.current.world!, agents: stateRef.current.agents });
            recordingRef.current = { version: 1, createdAt: new Date().toISOString(), frames: [initialFrame] };
            saveReplay(recordingRef.current);
            setReplayAvailable(true);
        }
        stateRef.current.isRunning = !stateRef.current.isRunning;
        behaviorSystemRef.current?.setIsRunning(stateRef.current.isRunning);
        setGameState(prev => ({ ...prev, isRunning: !prev.isRunning }));
    };

    const startReplay = () => {
        const record = loadReplay();
        if (!record || !record.frames || record.frames.length === 0) return;
        if (serverMode) {
            void sendServerCommand('pause');
        }
        replayRef.current = { frames: record.frames, index: 0 };
        const frame = restoreFrame(record.frames[0]);
        const nextState = { ...frame, isRunning: false, isReplaying: true, jevCooldown: stateRef.current.jevCooldown, localAiEnabled: frame.localAiEnabled ?? stateRef.current.localAiEnabled ?? true };
        stateRef.current = nextState;
        setGameState(nextState);
        lastTimeRef.current = performance.now();
        if (requestRef.current) clearTimeout(requestRef.current);
        requestRef.current = setTimeout(() => tick(performance.now()), 50);
    };

    const stopReplay = () => {
        replayRef.current = null;
        stateRef.current.isReplaying = false;
        setGameState(prev => ({ ...prev, isReplaying: false }));
        if (serverMode) {
            void pollRef.current?.();
        }
    };

    const addAgent = () => {
        if (serverMode) { void sendServerCommand('addAgent'); return; }
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
        if (serverMode) { void sendServerCommand('removeAgent'); return; }
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
        if (serverMode) { void sendServerCommand('price', val); return; }
        stateRef.current.priceLevel = val;
        setGameState(prev => ({ ...prev, priceLevel: val }));
    };

    const setWageLevel = (val: number) => {
        if (serverMode) { void sendServerCommand('wage', val); return; }
        stateRef.current.wageLevel = val;
        setGameState(prev => ({ ...prev, wageLevel: val }));
    };

    const setRiskLevel = (val: number) => {
        if (serverMode) { void sendServerCommand('risk', val); return; }
        stateRef.current.riskLevel = val;
        setGameState(prev => ({ ...prev, riskLevel: val }));
    };

    const setJevEnabled = (enabled: boolean) => {
        stateRef.current.jevEnabled = enabled;
        behaviorSystemRef.current?.setJevEnabled(enabled);
        if (serverMode) void sendServerCommand('jev', enabled);

        // 如果关闭 JEV 且当前本地决策也是关闭状态，为保证城镇有决策驱动，自动开启本地决策
        let nextLocalAi = stateRef.current.localAiEnabled;
        if (!enabled && !nextLocalAi) {
            nextLocalAi = true;
            stateRef.current.localAiEnabled = true;
            behaviorSystemRef.current?.setLocalAiEnabled(true);
            if (serverMode) void sendServerCommand('localAi', true);
        }

        setGameState(prev => ({
            ...prev,
            jevEnabled: enabled,
            localAiEnabled: nextLocalAi
        }));
    };

    const setLocalAiEnabled = (enabled: boolean) => {
        stateRef.current.localAiEnabled = enabled;
        behaviorSystemRef.current?.setLocalAiEnabled(enabled);
        if (serverMode) void sendServerCommand('localAi', enabled);

        // 关闭本地AI决策后，自动开启 JEV 决策开关，确保由 JEV 提供决策
        let nextJev = stateRef.current.jevEnabled;
        if (!enabled) {
            nextJev = true;
            stateRef.current.jevEnabled = true;
            behaviorSystemRef.current?.setJevEnabled(true);
            if (serverMode) void sendServerCommand('jev', true);
        }

        setGameState(prev => ({
            ...prev,
            localAiEnabled: enabled,
            jevEnabled: nextJev
        }));
    };

    const setJevCooldown = (minutes: number) => {
        const clamped = Math.max(1, Math.round(minutes));
        if (serverMode) { void sendServerCommand('jevCooldown', clamped); return; }
        stateRef.current.jevCooldown = clamped;
        behaviorSystemRef.current?.setJevCooldownMinutes(clamped);
        setGameState(prev => ({ ...prev, jevCooldown: clamped }));
    };

    const restartSimulation = useCallback(async (autoStart: boolean = true) => {
        clearReplay();
        setReplayAvailable(false);
        recordingRef.current = null;
        replayRef.current = null;

        if (serverMode) {
            try {
                const response = await fetch('/api/simulation', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ type: 'reset', autoStart })
                });
                if (response.ok) {
                    const freshData = await response.json();
                    const freshState = hydrateServerState(freshData);
                    stateRef.current = freshState;
                    setGameState(freshState);
                    if (freshState.world && freshState.agents) {
                        const initialFrame = makeReplayFrame({ ...freshState, world: freshState.world, agents: freshState.agents });
                        recordingRef.current = { version: 1, createdAt: new Date().toISOString(), frames: [initialFrame] };
                        saveReplay(recordingRef.current);
                        setReplayAvailable(true);
                    }
                    void pollRef.current?.();
                    return freshState;
                }
            } catch (err) {
                console.error("Failed to reset server simulation:", err);
            }
        }

        const { world, agents } = initializeWorld();
        const behaviorSystem = new BehaviorSystem(world);
        behaviorSystem.setIsRunning(autoStart);
        const dialogueSystem = new DialogueSystem();

        const resetState: GameState = {
            world,
            agents,
            time: 480,
            isRunning: autoStart,
            dialogueLog: [],
            priceLevel: 1.0,
            wageLevel: 1.0,
            riskLevel: 1.0,
            jevEnabled: stateRef.current.jevEnabled,
            localAiEnabled: stateRef.current.localAiEnabled,
            jevCooldown: stateRef.current.jevCooldown,
            isReplaying: false
        };

        if (autoStart) {
            const initialFrame = makeReplayFrame({ ...resetState, world, agents });
            recordingRef.current = { version: 1, createdAt: new Date().toISOString(), frames: [initialFrame] };
            saveReplay(recordingRef.current);
            setReplayAvailable(true);
        }

        stateRef.current = resetState;
        behaviorSystemRef.current = behaviorSystem;
        dialogueSystemRef.current = dialogueSystem;
        setGameState(resetState);
        return resetState;
    }, [serverMode, hydrateServerState]);

    return {
        gameState,
        togglePause,
        setSpeed: (value: number) => { setSpeed(value); if (serverMode) void sendServerCommand('speed', value); },
        speed,
        addAgent,
        removeAgent,
        setPriceLevel,
        setWageLevel,
        setRiskLevel,
        setJevEnabled,
        setLocalAiEnabled,
        setJevCooldown,
        replayAvailable,
        startReplay,
        stopReplay,
        restartSimulation
    };
}
