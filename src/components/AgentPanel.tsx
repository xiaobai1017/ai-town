
import React from 'react';
import { Agent } from '@/engine/Agent';
import { X, Landmark, History, ChevronRight, ChevronDown, PlusCircle, MinusCircle } from 'lucide-react';

interface AgentPanelProps {
    agent: Agent | null;
    allAgents: Agent[];
    onClose: () => void;
    onShowHistory: (a: Agent, b: Agent) => void;
}

export function AgentPanel({ agent, allAgents, onClose, onShowHistory }: AgentPanelProps) {
    const [showFinHistory, setShowFinHistory] = React.useState(false);
    if (!agent) return null;

    const relationshipEntries = Object.entries(agent.relationships)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3); // Top 3 friends

    return (
        <div className="fixed right-4 top-20 w-80 bg-white p-4 rounded-lg shadow-xl border border-slate-200 max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold flex items-center gap-2">
                    <span className="text-2xl">{agent.emoji}</span> {agent.name}
                </h2>
                <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded">
                    <X size={20} />
                </button>
            </div>

            <div className="space-y-4">
                <div>
                    <span className="font-semibold text-slate-500 text-sm">Role</span>
                    <p className="text-lg">{agent.role}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <span className="font-semibold text-slate-500 text-sm">Status</span>
                        <p className="text-md capitalize flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${agent.state === 'IDLE' ? 'bg-green-500' : agent.state === 'DEAD' ? 'bg-slate-900' : 'bg-yellow-500'}`}></span>
                            {agent.state.toLowerCase()}
                        </p>
                        {agent.state === 'DEAD' && agent.deathCause && (
                            <p className="text-[10px] font-bold text-rose-500 mt-1 uppercase tracking-tighter">Cause: {agent.deathCause}</p>
                        )}
                    </div>
                    <div>
                        <span className="font-semibold text-slate-500 text-sm">Location</span>
                        <p className="text-md">({agent.position.x}, {agent.position.y})</p>
                    </div>
                </div>

                <div>
                    <span className="font-semibold text-slate-500 text-sm">Hunger</span>
                    <div className="w-full bg-slate-100 rounded-full h-2 mt-1">
                        <div
                            className={`h-full rounded-full transition-all ${agent.hunger > 80 ? 'bg-red-500' : 'bg-orange-400'}`}
                            style={{ width: `${agent.hunger}%` }}
                        ></div>
                    </div>
                </div>

                <div>
                    <span className="font-semibold text-slate-500 text-sm">Health</span>
                    <div className="w-full bg-slate-100 rounded-full h-2 mt-1">
                        <div
                            className={`h-full rounded-full transition-all ${agent.health < 60 ? 'bg-red-500' : 'bg-green-500'}`}
                            style={{ width: `${agent.health}%` }}
                        ></div>
                    </div>
                </div>

                <div className="space-y-3">
                    <div className="flex justify-between items-center">
                        <span className="font-semibold text-slate-500 text-sm italic tracking-tight uppercase">Economy & Finance</span>
                        <button
                            onClick={() => setShowFinHistory(!showFinHistory)}
                            className="text-xs flex items-center gap-1 text-indigo-600 font-bold hover:underline"
                        >
                            <History size={14} />
                            {showFinHistory ? 'Hide Ledger' : 'View Ledger'}
                        </button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl shadow-sm">
                            <p className="text-[10px] font-bold text-slate-400 uppercase">Cash on Hand</p>
                            <p className="text-xl font-black text-slate-700">${agent.cash.toFixed(2)}</p>
                        </div>
                        <div className="bg-indigo-50 border border-indigo-100 p-3 rounded-xl shadow-sm">
                            <p className="text-[10px] font-bold text-indigo-400 uppercase">Bank Balance</p>
                            <p className="text-xl font-black text-indigo-600">${agent.bankBalance.toFixed(2)}</p>
                        </div>
                    </div>

                    {showFinHistory && (
                        <div className="bg-slate-900 text-slate-300 p-4 rounded-xl space-y-2 max-h-60 overflow-y-auto border border-slate-700 font-mono text-[11px] animate-in slide-in-from-top duration-200">
                            <h3 className="text-[10px] uppercase font-black text-slate-500 border-b border-slate-800 pb-1 mb-2 tracking-widest">Transaction Ledger</h3>
                            {agent.transactions.length === 0 ? (
                                <p className="text-slate-600 italic">No recent transactions recorded.</p>
                            ) : (
                                agent.transactions.map((t, i) => (
                                    <div key={i} className="flex justify-between items-start gap-2 border-b border-slate-800/50 pb-1 last:border-0 text-left">
                                        <div className="flex-1">
                                            <p className="text-slate-100 font-bold break-words">{t.description}</p>
                                        </div>
                                        <div className={`text-right font-black ${t.amount >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                            {t.amount >= 0 ? '+' : ''}{t.amount.toFixed(2)}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}

                    {agent.loanBalance > 0 && (
                        <div className="bg-rose-50 border-2 border-rose-200 p-4 rounded-2xl animate-pulse">
                            <div className="flex justify-between items-center">
                                <div>
                                    <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest">Outstanding Loan</p>
                                    <p className="text-2xl font-black text-rose-600">${agent.loanBalance.toFixed(2)}</p>
                                </div>
                                <div className="p-2 bg-rose-200 rounded-full">
                                    <Landmark size={24} className="text-rose-600" />
                                </div>
                            </div>
                            <p className="text-[10px] text-rose-400 font-bold mt-2 italic">※ 20% salary deduction applies until settled</p>
                        </div>
                    )}
                </div>

                {relationshipEntries.length > 0 && (
                    <div>
                        <span className="font-semibold text-slate-500 text-sm">Relationships</span>
                        <div className="space-y-2 mt-1">
                            {relationshipEntries.map(([otherId, intimacy]) => {
                                const other = allAgents.find(a => a.id === otherId);
                                if (!other) return null;
                                const status = intimacy > 80 ? "Best Friend" : intimacy > 40 ? "Friend" : "Acquaintance";
                                return (
                                    <div
                                        key={otherId}
                                        onClick={() => onShowHistory(agent, other)}
                                        className="flex justify-between items-center text-sm bg-slate-50 p-2 rounded border border-slate-100 hover:bg-slate-100 cursor-pointer transition-colors"
                                    >
                                        <div className="flex items-center gap-2">
                                            <span>{other.emoji}</span>
                                            <span className="font-medium">{other.name}</span>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-xs text-slate-400">{status}</div>
                                            <div className="font-mono text-indigo-600">{intimacy}%</div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                <div>
                    <span className="font-semibold text-slate-500 text-sm">Description</span>
                    <p className="text-sm text-slate-600">{agent.description}</p>
                </div>
            </div>
        </div>
    );
}
