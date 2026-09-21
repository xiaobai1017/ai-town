/**
 * 游戏画布渲染组件
 * @author hubin
 */

import React, { useEffect, useRef, useState } from 'react';
import { World, TileType, Location as TownLocation } from '@/engine/World';
import { Agent } from '@/engine/Agent';
import { ZoomIn, ZoomOut, Move, ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

interface GameCanvasProps {
    world: World;
    agents: Agent[];
    onSelectAgent: (agent: Agent | null) => void;
    onSelectLocation: (location: TownLocation | null) => void;
    time: number;
}

export function GameCanvas({ world, agents, onSelectAgent, onSelectLocation, time }: GameCanvasProps) {
    const { t, language } = useI18n();
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const TILE_SIZE = 32;

    const [canvasSize, setCanvasSize] = useState({ width: 1100, height: 720 });
    const [view, setView] = useState({ x: 0, y: 0, zoom: 1 });
    const [isDragging, setIsDragging] = useState(false);
    const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });
    const [showControls, setShowControls] = useState(false);

    useEffect(() => {
        if (!containerRef.current) return;
        const updateSize = () => {
            if (containerRef.current) {
                const w = Math.floor(containerRef.current.clientWidth);
                const h = Math.floor(containerRef.current.clientHeight);
                if (w > 0 && h > 0) {
                    setCanvasSize(prev => (prev.width === w && prev.height === h ? prev : { width: w, height: h }));
                }
            }
        };

        updateSize();
        const ro = new ResizeObserver(() => {
            updateSize();
        });
        ro.observe(containerRef.current);
        window.addEventListener('resize', updateSize);

        return () => {
            ro.disconnect();
            window.removeEventListener('resize', updateSize);
        };
    }, []);

    const getTileColor = (type: TileType) => {
        switch (type) {
            case 'grass': return '#e2e8f0'; // slate-200
            case 'road': return '#94a3b8'; // slate-400
            case 'wall': return '#475569'; // slate-600
            case 'floor': return '#f1f5f9'; // slate-100
            default: return '#fff';
        }
    };

    const drawSentiment = (ctx: CanvasRenderingContext2D, x: number, y: number, sentiment: 'POS' | 'NEG' | 'NEU') => {
        let icon = '💬';
        let color = '#94a3b8';
        if (sentiment === 'POS') { icon = '❤️'; color = '#ef4444'; }
        if (sentiment === 'NEG') { icon = '💢'; color = '#3b82f6'; }
        if (sentiment === 'NEU') { icon = '✨'; color = '#f59e0b'; }

        ctx.font = '16px serif';
        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        ctx.fillText(icon, x + 18, y - 18);
    };

    const drawBubble = (ctx: CanvasRenderingContext2D, x: number, y: number, text: string) => {
        ctx.font = '12px "Microsoft YaHei", "SimHei", sans-serif'; // Support Chinese
        const textWidth = ctx.measureText(text).width;
        const padding = 5;
        const boxWidth = textWidth + padding * 2;
        const boxHeight = 20;

        // Bubble background
        ctx.fillStyle = 'white';
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1;

        ctx.beginPath();
        // @ts-ignore
        if (ctx.roundRect) {
            ctx.roundRect(x - boxWidth / 2, y - boxHeight - 5, boxWidth, boxHeight, 5);
        } else {
            ctx.rect(x - boxWidth / 2, y - boxHeight - 5, boxWidth, boxHeight);
        }
        ctx.fill();
        ctx.stroke();

        // Pointer
        ctx.beginPath();
        ctx.moveTo(x, y - 5);
        ctx.fill();

        // Text
        ctx.fillStyle = 'black';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, x, y - boxHeight / 2 - 5);
    };

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Clear
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Apply View Transform
        ctx.translate(view.x, view.y);
        ctx.scale(view.zoom, view.zoom);

        // Draw Map
        for (let y = 0; y < world.height; y++) {
            for (let x = 0; x < world.width; x++) {
                const tile = world.grid[y][x];
                ctx.fillStyle = getTileColor(tile);
                ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
            }
        }

        // Draw Locations
        world.locations.forEach(loc => {
            ctx.fillStyle = '#1e293b';
            ctx.font = 'bold 14px "Microsoft YaHei", "SimHei", sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            const displayName = t(`building.${loc.name}`) || loc.name;
            ctx.fillText(displayName, loc.entry.x * TILE_SIZE + TILE_SIZE / 2, loc.entry.y * TILE_SIZE - 2);
        });

        // Draw Agents
        agents.forEach(agent => {
            const ax = agent.position.x * TILE_SIZE;
            const ay = agent.position.y * TILE_SIZE;

            ctx.beginPath();
            ctx.arc(ax + TILE_SIZE / 2, ay + TILE_SIZE / 2, TILE_SIZE / 2 - 2, 0, 2 * Math.PI);
            ctx.fillStyle = agent.color;
            ctx.fill();
            ctx.stroke();

            ctx.font = '20px serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(agent.emoji, ax + TILE_SIZE / 2, ay + TILE_SIZE / 2 + 2);

            ctx.fillStyle = 'black';
            ctx.font = '10px sans-serif';
            ctx.fillText(agent.name, ax + TILE_SIZE / 2, ay - 5);

            if (agent.conversation) {
                const otherAgent = agent.state === 'TALKING' ? agents.find(a =>
                    a.id !== agent.id &&
                    a.state === 'TALKING' &&
                    Math.abs(a.position.x - agent.position.x) + Math.abs(a.position.y - agent.position.y) <= 2
                ) : null;

                const displayText = otherAgent ? `${agent.name} ➡️ ${otherAgent.name}: ${agent.conversation}` : agent.conversation;
                drawBubble(ctx, ax + TILE_SIZE / 2, ay - 10, displayText);
            }

            if (agent.lastSentiment) {
                drawSentiment(ctx, ax + TILE_SIZE / 2, ay, agent.lastSentiment);
            }
        });

    }, [world, agents, time, view, canvasSize, language]);

    const [cursor, setCursor] = useState<'grab' | 'grabbing' | 'pointer'>('grab');

    const getGridPos = (clientX: number, clientY: number) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        const screenX = clientX - rect.left;
        const screenY = clientY - rect.top;
        const worldX = (screenX - view.x) / view.zoom;
        const worldY = (screenY - view.y) / view.zoom;
        return {
            x: Math.floor(worldX / TILE_SIZE),
            y: Math.floor(worldY / TILE_SIZE)
        };
    };

    const isInteractable = (gridX: number, gridY: number) => {
        const agent = agents.find(a => a.position.x === gridX && a.position.y === gridY);
        if (agent) return true;
        const loc = world.locations.find(l =>
            l.x !== undefined && l.y !== undefined && l.width !== undefined && l.height !== undefined &&
            gridX >= l.x && gridX < l.x + l.width &&
            gridY >= l.y && gridY < l.y + l.height
        );
        return !!loc;
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        setIsDragging(true);
        setCursor('grabbing');
        setLastMousePos({ x: e.clientX, y: e.clientY });
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (isDragging) {
            const dx = e.clientX - lastMousePos.x;
            const dy = e.clientY - lastMousePos.y;
            setView(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
            setLastMousePos({ x: e.clientX, y: e.clientY });
        } else {
            const { x, y } = getGridPos(e.clientX, e.clientY);
            setCursor(isInteractable(x, y) ? 'pointer' : 'grab');
        }
    };

    const handleMouseUp = () => {
        setIsDragging(false);
        setCursor('grab');
    };

    const handleWheel = (e: React.WheelEvent) => {
        const zoomSpeed = 0.001;
        const newZoom = Math.max(0.2, Math.min(3, view.zoom - e.deltaY * zoomSpeed));

        // Zoom relative to mouse position
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Calculate world coordinates before zoom
        const worldX = (mouseX - view.x) / view.zoom;
        const worldY = (mouseY - view.y) / view.zoom;

        // Calculate new offset to keep world coordinates under mouse
        const newX = mouseX - worldX * newZoom;
        const newY = mouseY - worldY * newZoom;

        setView({ x: newX, y: newY, zoom: newZoom });
    };

    const handleClick = (e: React.MouseEvent) => {
        // If it was a meaningful drag, don't trigger click
        // const dx = Math.abs(e.clientX - lastMousePos.x);
        // const dy = Math.abs(e.clientY - lastMousePos.y);
        // We use a small threshold to differentiate click from drag
        // But since we track dx/dy during move, we need to know if we actually dragged. 
        // For simplicity, let's just use the world coordinate matching.

        const { x: gridX, y: gridY } = getGridPos(e.clientX, e.clientY);

        const clickedAgent = agents.find(a => a.position.x === gridX && a.position.y === gridY);
        if (clickedAgent) {
            onSelectAgent(clickedAgent);
        } else {
            // Check for buildings
            const clickedLocation = world.locations.find(loc =>
                loc.x !== undefined && loc.y !== undefined && loc.width !== undefined && loc.height !== undefined &&
                gridX >= loc.x && gridX < loc.x + loc.width &&
                gridY >= loc.y && gridY < loc.y + loc.height
            );
            if (clickedLocation) {
                onSelectLocation(clickedLocation);
            } else {
                // Clicked empty ground: clear selections
                onSelectAgent(null);
                onSelectLocation(null);
            }
        }
    };

    return (
        <div ref={containerRef} className="relative group overflow-hidden rounded-xl shadow-2xl border-4 border-white w-full h-full flex-1">
            <canvas
                ref={canvasRef}
                width={canvasSize.width}
                height={canvasSize.height}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onWheel={handleWheel}
                onClick={handleClick}
                style={{ cursor: cursor, width: `${canvasSize.width}px`, height: `${canvasSize.height}px` }}
                className="bg-slate-200 block"
            />
            {/* Legend / Overlay Controls */}
            <div className={`absolute top-4 left-4 bg-white/95 backdrop-blur-md rounded-xl border border-white/60 shadow-2xl transition-all duration-300 overflow-hidden z-10 ${showControls ? 'w-52 p-3' : 'w-11 h-11 flex items-center justify-center p-0'}`}>
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        setShowControls(!showControls);
                    }}
                    className={`flex items-center justify-between w-full hover:bg-slate-100 rounded-lg transition-colors ${showControls ? 'mb-2.5 pb-2 border-b border-slate-100' : 'h-full w-full flex items-center justify-center'}`}
                    title={showControls ? "Collapse Controls" : "Show Controls"}
                >
                    {showControls ? (
                        <>
                            <span className="text-[10px] uppercase font-black text-slate-500 tracking-widest">Map Controls</span>
                            <ChevronUp size={16} className="text-slate-500" />
                        </>
                    ) : (
                        <Move size={18} className="text-slate-600" />
                    )}
                </button>

                {showControls && (
                    <div className="space-y-2.5 animate-in fade-in slide-in-from-top-2 duration-300">
                        <div className="flex items-center gap-2.5 text-xs font-bold text-slate-600">
                            <div className="p-1.5 bg-indigo-50 rounded-lg text-indigo-500">
                                <Move size={13} />
                            </div>
                            <span>{t('map.dragToPan')}</span>
                        </div>
                        <div className="flex items-center gap-2.5 text-xs font-bold text-slate-600">
                            <div className="p-1.5 bg-amber-50 rounded-lg text-amber-500">
                                <ZoomIn size={13} />
                            </div>
                            <span>{t('map.wheelToZoom')}</span>
                        </div>

                        <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">{t('map.currentZoom')}</span>
                            <span className="text-xs font-black text-indigo-600">{(view.zoom * 100).toFixed(0)}%</span>
                        </div>

                        <div className="flex gap-1.5 pt-1">
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setView(prev => ({ ...prev, zoom: Math.min(3, prev.zoom + 0.15) }));
                                }}
                                className="flex-1 flex items-center justify-center gap-1 p-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-bold transition"
                                title={t('map.zoomIn')}
                            >
                                <ZoomIn size={12} />
                                <span>{t('map.zoomIn')}</span>
                            </button>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setView(prev => ({ ...prev, zoom: Math.max(0.3, prev.zoom - 0.15) }));
                                }}
                                className="flex-1 flex items-center justify-center gap-1 p-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-bold transition"
                                title={t('map.zoomOut')}
                            >
                                <ZoomOut size={12} />
                                <span>{t('map.zoomOut')}</span>
                            </button>
                        </div>

                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setView({ x: 0, y: 0, zoom: 1 });
                            }}
                            className="w-full flex items-center justify-center gap-1.5 p-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded text-xs font-bold transition"
                            title={t('map.resetView')}
                        >
                            <RotateCcw size={12} />
                            <span>{t('map.resetView')}</span>
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
