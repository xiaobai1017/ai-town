
import React, { useEffect, useRef } from 'react';
import { World, TileType } from '@/engine/World';
import { Agent } from '@/engine/Agent';

interface GameCanvasProps {
    world: World;
    agents: Agent[];
    onSelectAgent: (agent: Agent) => void;
    time: number;
}

export function GameCanvas({ world, agents, onSelectAgent, time }: GameCanvasProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const TILE_SIZE = 32;

    const getTileColor = (type: TileType) => {
        switch (type) {
            case 'grass': return '#e2e8f0'; // slate-200
            case 'road': return '#94a3b8'; // slate-400
            case 'wall': return '#475569'; // slate-600
            case 'floor': return '#f1f5f9'; // slate-100
            default: return '#fff';
        }
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
        ctx.lineTo(x - 5, y - boxHeight - 5 + boxHeight); // bottom left of box
        // simplify pointer
        ctx.moveTo(x, y);
        ctx.lineTo(x - 3, y - 5);
        ctx.lineTo(x + 3, y - 5);
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
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw Map
        for (let y = 0; y < world.height; y++) {
            for (let x = 0; x < world.width; x++) {
                const tile = world.grid[y][x];
                ctx.fillStyle = getTileColor(tile);
                ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);

                // Grid lines (optional)
                ctx.strokeStyle = '#rgba(0,0,0,0.1)';
                ctx.strokeRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
            }
        }

        // Draw Locations (overlay names)
        world.locations.forEach(loc => {
            // Simple label at entry
            ctx.fillStyle = 'white';
            ctx.font = '10px sans-serif';
            // Check if name fits, maybe draw building center
            ctx.fillText(loc.name, loc.entry.x * TILE_SIZE, loc.entry.y * TILE_SIZE);
        });

        // Draw Agents
        agents.forEach(agent => {
            const ax = agent.position.x * TILE_SIZE;
            const ay = agent.position.y * TILE_SIZE;

            // Draw Circle for agent
            ctx.beginPath();
            ctx.arc(ax + TILE_SIZE / 2, ay + TILE_SIZE / 2, TILE_SIZE / 2 - 2, 0, 2 * Math.PI);
            ctx.fillStyle = agent.color;
            ctx.fill();
            ctx.stroke();

            // Draw Emoji
            ctx.font = '20px serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(agent.emoji, ax + TILE_SIZE / 2, ay + TILE_SIZE / 2 + 2);

            // Name Tag
            ctx.fillStyle = 'black';
            ctx.font = '10px sans-serif';
            ctx.fillText(agent.name, ax + TILE_SIZE / 2, ay - 5);

            // Speech Bubble
            if (agent.conversation) {
                drawBubble(ctx, ax + TILE_SIZE / 2, ay - 10, agent.conversation);
            }
        });

    }, [world, agents, time]);

    const handleClick = (e: React.MouseEvent) => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const gridX = Math.floor(x / TILE_SIZE);
        const gridY = Math.floor(y / TILE_SIZE);

        // Find clicked agent
        const clickedAgent = agents.find(a => a.position.x === gridX && a.position.y === gridY);
        if (clickedAgent) {
            onSelectAgent(clickedAgent);
        }
    };

    return (
        <canvas
            ref={canvasRef}
            width={world.width * TILE_SIZE}
            height={world.height * TILE_SIZE}
            onClick={handleClick}
            className="border border-slate-300 shadow-md rounded cursor-pointer"
        />
    );
}
