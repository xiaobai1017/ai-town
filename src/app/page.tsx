
"use client";

import { useGameLoop } from "@/hooks/useGameLoop";
import { GameCanvas } from "@/components/GameCanvas";
import { ChatLog } from "@/components/ChatLog";
import { AgentPanel } from "@/components/AgentPanel";
import { useState } from "react";
import { Agent } from "@/engine/Agent";
import { Play, Pause, FastForward, User } from "lucide-react";

export default function Home() {
  const { gameState, togglePause, setSpeed, speed } = useGameLoop();
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);

  const formatTime = (minutes: number) => {
    const h = Math.floor(minutes / 60) % 24;
    const m = minutes % 60;
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
  };

  if (!gameState.world) return <div className="flex items-center justify-center h-screen">Loading town...</div>;

  return (
    <main className="min-h-screen bg-slate-50 p-8 font-sans text-slate-900">

      {/* Header / Controls */}
      <header className="flex justify-between items-center mb-6 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
            AI Town Simulation
          </h1>
          <p className="text-slate-500 text-sm">
            Day {Math.floor(gameState.time / (24 * 60)) + 1}, {formatTime(gameState.time)}
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-lg">
            <button
              onClick={togglePause}
              className={`p-2 rounded hover:shadow-sm transition ${gameState.isRunning ? 'bg-white text-indigo-600' : 'bg-indigo-600 text-white'}`}
            >
              {gameState.isRunning ? <Pause size={20} /> : <Play size={20} />}
            </button>
          </div>

          <div className="flex items-center gap-2 text-sm text-slate-600 bg-slate-100 p-1 rounded-lg">
            <span className="px-2 font-medium">Speed: {speed}x</span>
            <button onClick={() => setSpeed(1)} className={`p-1 px-3 rounded ${speed === 1 ? 'bg-white shadow-sm' : ''}`}>1x</button>
            <button onClick={() => setSpeed(5)} className={`p-1 px-3 rounded ${speed === 5 ? 'bg-white shadow-sm' : ''}`}>5x</button>
            <button onClick={() => setSpeed(20)} className={`p-1 px-3 rounded ${speed === 20 ? 'bg-white shadow-sm' : ''}`}>20x</button>
          </div>

          <div className="ml-4 flex items-center gap-2 text-slate-500">
            <User size={16} />
            <span>{gameState.agents.length} Residents</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex gap-6 items-start justify-center">

        {/* Game Map */}
        <div className="relative">
          <div className="bg-white p-2 rounded-lg shadow-lg border border-slate-200 inline-block">
            <GameCanvas
              world={gameState.world}
              agents={gameState.agents}
              onSelectAgent={setSelectedAgent}
              time={gameState.time}
            />
          </div>
          <p className="mt-2 text-center text-slate-400 text-sm">Click on an agent to inspect details</p>
        </div>

        {/* Sidebar / Chat */}
        <div className="flex flex-col gap-6">
          <ChatLog logs={gameState.dialogueLog} />
        </div>

      </div>

      {/* Agent Inspector Modal/Panel */}
      {selectedAgent && (
        <AgentPanel
          agent={selectedAgent}
          onClose={() => setSelectedAgent(null)}
        />
      )}

    </main>
  );
}
