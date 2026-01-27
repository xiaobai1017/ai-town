
import React from 'react';
import { Agent } from '@/engine/Agent';
import { X } from 'lucide-react';

interface AgentPanelProps {
    agent: Agent | null;
    onClose: () => void;
}

export function AgentPanel({ agent, onClose }: AgentPanelProps) {
    if (!agent) return null;

    return (
        <div className="fixed right-4 top-20 w-80 bg-white p-4 rounded-lg shadow-xl border border-slate-200">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold flex items-center gap-2">
                    <span className="text-2xl">{agent.emoji}</span> {agent.name}
                </h2>
                <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded">
                    <X size={20} />
                </button>
            </div>

            <div className="space-y-2">
                <div>
                    <span className="font-semibold text-slate-500 text-sm">Role</span>
                    <p className="text-lg">{agent.role}</p>
                </div>
                <div>
                    <span className="font-semibold text-slate-500 text-sm">Status</span>
                    <p className="text-lg capitalize flex items-center gap-2">
                        <span className={`w-3 h-3 rounded-full ${agent.state === 'IDLE' ? 'bg-green-500' : 'bg-yellow-500'}`}></span>
                        {agent.state.toLowerCase()}
                    </p>
                </div>
                <div>
                    <span className="font-semibold text-slate-500 text-sm">Current Location</span>
                    <p>({agent.position.x}, {agent.position.y})</p>
                </div>
                <div>
                    <span className="font-semibold text-slate-500 text-sm">Description</span>
                    <p className="text-sm text-slate-600">A resident of AI Town.</p>
                </div>
            </div>
        </div>
    );
}
