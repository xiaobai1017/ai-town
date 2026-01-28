
import React from 'react';
import { Agent } from '@/engine/Agent';
import { X } from 'lucide-react';

interface HistoryModalProps {
    agentA: Agent;
    agentB: Agent;
    onClose: () => void;
}

export function HistoryModal({ agentA, agentB, onClose }: HistoryModalProps) {
    const history = agentA.conversationHistory[agentB.id] || [];

    return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl flex flex-col max-h-[70vh] animate-in fade-in zoom-in duration-200">
                <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-2xl">
                    <div className="flex items-center gap-3">
                        <div className="flex -space-x-2">
                            <span className="text-2xl z-10">{agentA.emoji}</span>
                            <span className="text-2xl">{agentB.emoji}</span>
                        </div>
                        <h3 className="font-bold text-slate-800">
                            {agentA.name} & {agentB.name}
                        </h3>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-500"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {history.length === 0 ? (
                        <div className="text-center py-10">
                            <p className="text-slate-400 italic text-sm">No shared history yet...</p>
                        </div>
                    ) : (
                        history.map((line, idx) => {
                            const isAgentA = line.startsWith(agentA.name + ":");
                            const speakerEmoji = isAgentA ? agentA.emoji : agentB.emoji;
                            const speakerName = isAgentA ? agentA.name : agentB.name;
                            const content = line.split(': ').slice(1).join(': ');

                            return (
                                <div
                                    key={idx}
                                    className={`flex flex-col ${isAgentA ? 'items-start' : 'items-end'}`}
                                >
                                    <div className="flex items-center gap-1.5 mb-1 px-1">
                                        <span className="text-lg">{speakerEmoji}</span>
                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{speakerName}</span>
                                    </div>
                                    <div className={`max-w-[90%] p-3 rounded-2xl text-sm shadow-sm ${isAgentA
                                            ? 'bg-indigo-50 text-indigo-900 rounded-tl-none border border-indigo-100'
                                            : 'bg-slate-100 text-slate-800 rounded-tr-none border border-slate-200'
                                        }`}>
                                        {content}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                <div className="p-4 bg-slate-50 border-t border-slate-100 rounded-b-2xl">
                    <p className="text-xs text-center text-slate-400">
                        Showing last {history.length} exchanges
                    </p>
                </div>
            </div>
        </div>
    );
}
