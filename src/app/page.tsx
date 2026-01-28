
"use client";

import { useGameLoop } from "@/hooks/useGameLoop";
import { GameCanvas } from "@/components/GameCanvas";
import { ChatLog } from "@/components/ChatLog";
import { AgentPanel } from "@/components/AgentPanel";
import { HistoryModal } from "@/components/HistoryModal";
import { LocationPanel } from "@/components/LocationPanel";
import { useState } from "react";
import { Agent } from "@/engine/Agent";
import { Location as TownLocation } from "@/engine/World";
import { Play, Pause, FastForward, User, Plus, Minus, Skull } from "lucide-react";

export default function Home() {
  const { gameState, togglePause, setSpeed, speed, addAgent, removeAgent } = useGameLoop();
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<TownLocation | null>(null);
  const [historyPair, setHistoryPair] = useState<[Agent, Agent] | null>(null);

  const handleShowHistory = (nameA: string, nameB: string) => {
    const a = gameState.agents.find(ag => ag.name === nameA);
    const b = gameState.agents.find(ag => ag.name === nameB);
    if (a && b) setHistoryPair([a, b]);
  };

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

          <div className="ml-4 flex items-center gap-3 bg-slate-100 p-1 rounded-lg">
            <div className="flex items-center gap-1 px-2 border-r border-slate-200">
              <User size={16} className="text-slate-500" />
              <span className="text-sm font-medium text-slate-600">{gameState.agents.length} Residents</span>
            </div>
            <div className="flex gap-1">
              <button
                onClick={removeAgent}
                title="Remove resident"
                className="p-1 px-2 hover:bg-white hover:shadow-sm rounded transition text-slate-500 hover:text-red-500"
              >
                <Minus size={16} />
              </button>
              <button
                onClick={addAgent}
                title="Add resident"
                className="p-1 px-2 hover:bg-white hover:shadow-sm rounded transition text-slate-500 hover:text-indigo-600"
              >
                <Plus size={16} />
              </button>
            </div>
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
              onSelectAgent={(agent) => {
                setSelectedAgent(agent);
                setSelectedLocation(null);
              }}
              onSelectLocation={(loc) => {
                setSelectedLocation(loc);
                setSelectedAgent(null);
              }}
              time={gameState.time}
            />
          </div>
          <p className="mt-2 text-center text-slate-400 text-sm">Click on an agent or building for details</p>
        </div>

        {/* Sidebar / Chat */}
        <div className="flex flex-col gap-6">
          <ChatLog
            logs={gameState.dialogueLog}
            onShowHistory={handleShowHistory}
          />
        </div>

      </div>

      {/* Agent Inspector Modal/Panel */}
      {selectedAgent && (
        <AgentPanel
          agent={selectedAgent}
          allAgents={gameState.agents}
          onClose={() => setSelectedAgent(null)}
          onShowHistory={(a, b) => setHistoryPair([a, b])}
        />
      )}

      {/* Location Inspector Panel */}
      {selectedLocation && (
        <LocationPanel
          location={selectedLocation}
          onClose={() => setSelectedLocation(null)}
        />
      )}

      {/* History Conversation List Modal */}
      {historyPair && (
        <HistoryModal
          agentA={historyPair[0]}
          agentB={historyPair[1]}
          onClose={() => setHistoryPair(null)}
        />
      )}

      {/* Extinction Overlay */}
      {gameState.agents.length > 0 && gameState.agents.every(a => a.state === 'DEAD') && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-sm animate-in fade-in duration-1000">
          <div className="bg-slate-900 border-2 border-rose-500/50 p-12 rounded-3xl shadow-[0_0_50px_rgba(225,29,72,0.3)] text-center max-w-md mx-4 transform animate-in zoom-in duration-500">
            <div className="w-24 h-24 bg-rose-500/20 rounded-full flex items-center justify-center mx-auto mb-6 border border-rose-500/30">
              <Skull size={48} className="text-rose-500 animate-pulse" />
            </div>
            <h2 className="text-4xl font-black text-white mb-4 tracking-tighter uppercase italic">Extinction</h2>
            <p className="text-slate-400 font-medium leading-relaxed mb-6">
              Every resident of AI Town has passed away. The simulation has ended in silence.
            </p>

            <div className="bg-slate-950/50 rounded-2xl border border-slate-800 p-4 max-h-64 overflow-y-auto mb-8 text-left">
              <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4 sticky top-0 bg-slate-900/90 py-1 backdrop-blur-sm border-b border-slate-800">Final Census</h3>
              <div className="space-y-3">
                {gameState.agents.map((a) => (
                  <div key={a.id} className="flex justify-between items-center gap-4 text-sm border-b border-slate-800/50 pb-2 last:border-0 last:pb-0">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{a.emoji}</span>
                      <div>
                        <p className="font-bold text-slate-200 leading-none">{a.name}</p>
                        <p className="text-[10px] text-slate-500 mt-1 uppercase font-bold">{a.role}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-rose-400 font-black text-xs">{a.deathCause}</p>
                      <p className="text-[10px] text-slate-500 font-mono italic">Survived: {(a.livingTicks / 60).toFixed(1)} hrs</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800">
              <button
                onClick={() => window.location.reload()}
                className="bg-slate-100 hover:bg-white text-slate-950 font-black py-4 px-10 rounded-2xl transition-all hover:scale-105 active:scale-95 shadow-xl w-full"
              >
                Restart Simulation
              </button>
            </div>
          </div>
        </div>
      )}

    </main>
  );
}
