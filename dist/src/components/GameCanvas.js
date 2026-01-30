import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { ZoomIn, Move, ChevronUp } from 'lucide-react';
export function GameCanvas({ world, agents, onSelectAgent, onSelectLocation, time }) {
    const canvasRef = useRef(null);
    const TILE_SIZE = 32;
    const VIEWPORT_WIDTH = 800;
    const VIEWPORT_HEIGHT = 600;
    const [view, setView] = useState({ x: 0, y: 0, zoom: 1 });
    const [isDragging, setIsDragging] = useState(false);
    const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });
    const [showControls, setShowControls] = useState(false);
    const getTileColor = (type) => {
        switch (type) {
            case 'grass': return '#e2e8f0'; // slate-200
            case 'road': return '#94a3b8'; // slate-400
            case 'wall': return '#475569'; // slate-600
            case 'floor': return '#f1f5f9'; // slate-100
            default: return '#fff';
        }
    };
    const drawSentiment = (ctx, x, y, sentiment) => {
        let icon = '💬';
        let color = '#94a3b8';
        if (sentiment === 'POS') {
            icon = '❤️';
            color = '#ef4444';
        }
        if (sentiment === 'NEG') {
            icon = '💢';
            color = '#3b82f6';
        }
        if (sentiment === 'NEU') {
            icon = '✨';
            color = '#f59e0b';
        }
        ctx.font = '16px serif';
        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        ctx.fillText(icon, x + 18, y - 18);
    };
    const drawBubble = (ctx, x, y, text) => {
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
        }
        else {
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
        if (!canvas)
            return;
        const ctx = canvas.getContext('2d');
        if (!ctx)
            return;
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
            ctx.fillText(loc.name, loc.entry.x * TILE_SIZE + TILE_SIZE / 2, loc.entry.y * TILE_SIZE - 2);
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
                const otherAgent = agent.state === 'TALKING' ? agents.find(a => a.id !== agent.id &&
                    a.state === 'TALKING' &&
                    Math.abs(a.position.x - agent.position.x) + Math.abs(a.position.y - agent.position.y) <= 2) : null;
                const displayText = otherAgent ? `${agent.name} ➡️ ${otherAgent.name}: ${agent.conversation}` : agent.conversation;
                drawBubble(ctx, ax + TILE_SIZE / 2, ay - 10, displayText);
            }
            if (agent.lastSentiment) {
                drawSentiment(ctx, ax + TILE_SIZE / 2, ay, agent.lastSentiment);
            }
        });
    }, [world, agents, time, view]);
    const [cursor, setCursor] = useState('grab');
    const getGridPos = (clientX, clientY) => {
        const canvas = canvasRef.current;
        if (!canvas)
            return { x: 0, y: 0 };
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
    const isInteractable = (gridX, gridY) => {
        const agent = agents.find(a => a.position.x === gridX && a.position.y === gridY);
        if (agent)
            return true;
        const loc = world.locations.find(l => l.x !== undefined && l.y !== undefined && l.width !== undefined && l.height !== undefined &&
            gridX >= l.x && gridX < l.x + l.width &&
            gridY >= l.y && gridY < l.y + l.height);
        return !!loc;
    };
    const handleMouseDown = (e) => {
        setIsDragging(true);
        setCursor('grabbing');
        setLastMousePos({ x: e.clientX, y: e.clientY });
    };
    const handleMouseMove = (e) => {
        if (isDragging) {
            const dx = e.clientX - lastMousePos.x;
            const dy = e.clientY - lastMousePos.y;
            setView(prev => (Object.assign(Object.assign({}, prev), { x: prev.x + dx, y: prev.y + dy })));
            setLastMousePos({ x: e.clientX, y: e.clientY });
        }
        else {
            const { x, y } = getGridPos(e.clientX, e.clientY);
            setCursor(isInteractable(x, y) ? 'pointer' : 'grab');
        }
    };
    const handleMouseUp = () => {
        setIsDragging(false);
        setCursor('grab');
    };
    const handleWheel = (e) => {
        const zoomSpeed = 0.001;
        const newZoom = Math.max(0.2, Math.min(3, view.zoom - e.deltaY * zoomSpeed));
        // Zoom relative to mouse position
        const canvas = canvasRef.current;
        if (!canvas)
            return;
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
    const handleClick = (e) => {
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
        }
        else {
            // Check for buildings
            const clickedLocation = world.locations.find(loc => loc.x !== undefined && loc.y !== undefined && loc.width !== undefined && loc.height !== undefined &&
                gridX >= loc.x && gridX < loc.x + loc.width &&
                gridY >= loc.y && gridY < loc.y + loc.height);
            if (clickedLocation) {
                onSelectLocation(clickedLocation);
            }
            else {
                // Clicked empty ground: clear selections
                onSelectAgent(null);
                onSelectLocation(null);
            }
        }
    };
    return (_jsxs("div", { className: "relative group overflow-hidden rounded-xl shadow-2xl border-4 border-white", children: [_jsx("canvas", { ref: canvasRef, width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT, onMouseDown: handleMouseDown, onMouseMove: handleMouseMove, onMouseUp: handleMouseUp, onMouseLeave: handleMouseUp, onWheel: handleWheel, onClick: handleClick, style: { cursor: cursor }, className: `bg-slate-200 transition-transform duration-75` }), _jsxs("div", { className: `absolute top-4 left-4 bg-white/90 backdrop-blur-md rounded-xl border border-white/50 shadow-2xl transition-all duration-300 overflow-hidden ${showControls ? 'w-48 p-4' : 'w-12 h-12 flex items-center justify-center p-0'}`, children: [_jsx("button", { onClick: (e) => {
                            e.stopPropagation();
                            setShowControls(!showControls);
                        }, className: `flex items-center justify-between w-full hover:bg-slate-100 rounded-lg transition-colors ${showControls ? 'mb-3 pb-2 border-b border-slate-100' : 'h-full w-full flex items-center justify-center'}`, title: showControls ? "Collapse Controls" : "Show Controls", children: showControls ? (_jsxs(_Fragment, { children: [_jsx("span", { className: "text-[10px] uppercase font-black text-slate-400 tracking-widest", children: "Map Controls" }), _jsx(ChevronUp, { size: 16, className: "text-slate-500" })] })) : (_jsx(Move, { size: 20, className: "text-slate-600" })) }), showControls && (_jsxs("div", { className: "space-y-3 animate-in fade-in slide-in-from-top-2 duration-300", children: [_jsxs("div", { className: "flex items-center gap-3 text-xs font-bold text-slate-600", children: [_jsx("div", { className: "p-2 bg-indigo-50 rounded-lg text-indigo-500", children: _jsx(Move, { size: 14 }) }), _jsx("span", { children: "Drag to Pan" })] }), _jsxs("div", { className: "flex items-center gap-3 text-xs font-bold text-slate-600", children: [_jsx("div", { className: "p-2 bg-amber-50 rounded-lg text-amber-500", children: _jsx(ZoomIn, { size: 14 }) }), _jsx("span", { children: "Wheel to Zoom" })] }), _jsxs("div", { className: "pt-2 border-t border-slate-100 flex items-center justify-between", children: [_jsx("span", { className: "text-[10px] font-black text-slate-400 uppercase tracking-tighter", children: "Current Zoom" }), _jsxs("span", { className: "text-xs font-black text-indigo-600", children: [(view.zoom * 100).toFixed(0), "%"] })] })] }))] })] }));
}
