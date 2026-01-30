import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React from 'react';
import { X, Landmark, History } from 'lucide-react';
export function AgentPanel({ agent, allAgents, onClose, onShowHistory }) {
    const [showFinHistory, setShowFinHistory] = React.useState(false);
    if (!agent)
        return null;
    const relationshipEntries = Object.entries(agent.relationships)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3); // Top 3 friends
    // Calculate daily wage based on role
    const getDailyWage = (role) => {
        let baseWagePerFrame = 0.1;
        switch (role) {
            case 'Mayor':
                baseWagePerFrame = 0.5;
                break;
            case 'Doctor':
                baseWagePerFrame = 0.4;
                break;
            case 'Police':
                baseWagePerFrame = 0.3;
                break;
            case 'Librarian':
                baseWagePerFrame = 0.2;
                break;
            case 'Baker':
                baseWagePerFrame = 0.2;
                break;
            case 'Gardener':
                baseWagePerFrame = 0.1;
                break;
            default:
                baseWagePerFrame = 0.1;
                break;
        }
        // Game time: 1 day = 24 hours = 24 * 60 = 1440 frames
        // Assuming 8 hours of work per day
        const workFramesPerDay = 8 * 60;
        return baseWagePerFrame * workFramesPerDay;
    };
    return (_jsxs("div", { className: "fixed right-4 top-20 w-80 bg-white p-4 rounded-lg shadow-xl border border-slate-200 max-h-[80vh] overflow-y-auto z-[60]", children: [_jsxs("div", { className: "flex justify-between items-center mb-4", children: [_jsxs("h2", { className: "text-xl font-bold flex items-center gap-2", children: [_jsx("span", { className: "text-2xl", children: agent.emoji }), " ", agent.name] }), _jsx("button", { onClick: onClose, className: "p-1 hover:bg-slate-100 rounded", children: _jsx(X, { size: 20 }) })] }), _jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "grid grid-cols-2 gap-4", children: [_jsxs("div", { children: [_jsx("span", { className: "font-semibold text-slate-500 text-sm", children: "Role" }), _jsx("p", { className: "text-lg", children: agent.role })] }), _jsxs("div", { children: [_jsx("span", { className: "font-semibold text-slate-500 text-sm", children: "Daily Wage" }), _jsxs("p", { className: "text-lg", children: ["$", getDailyWage(agent.role).toFixed(2)] })] })] }), _jsxs("div", { className: "grid grid-cols-2 gap-4", children: [_jsxs("div", { children: [_jsx("span", { className: "font-semibold text-slate-500 text-sm", children: "Status" }), _jsxs("p", { className: "text-md capitalize flex items-center gap-2", children: [_jsx("span", { className: `w-2 h-2 rounded-full ${agent.state === 'IDLE' ? 'bg-green-500' : agent.state === 'DEAD' ? 'bg-slate-900' : 'bg-yellow-500'}` }), agent.state.toLowerCase()] }), agent.state === 'DEAD' && agent.deathCause && (_jsxs("p", { className: "text-[10px] font-bold text-rose-500 mt-1 uppercase tracking-tighter", children: ["Cause: ", agent.deathCause] }))] }), _jsxs("div", { children: [_jsx("span", { className: "font-semibold text-slate-500 text-sm", children: "Survived" }), _jsxs("p", { className: "text-md font-mono", children: [(agent.livingTicks / 60).toFixed(1), " hrs"] })] })] }), _jsxs("div", { children: [_jsx("span", { className: "font-semibold text-slate-500 text-sm", children: "Hunger" }), _jsx("div", { className: "w-full bg-slate-100 rounded-full h-2 mt-1", children: _jsx("div", { className: `h-full rounded-full transition-all ${agent.hunger > 80 ? 'bg-red-500' : 'bg-orange-400'}`, style: { width: `${agent.hunger}%` } }) })] }), _jsxs("div", { children: [_jsx("span", { className: "font-semibold text-slate-500 text-sm", children: "Health" }), _jsx("div", { className: "w-full bg-slate-100 rounded-full h-2 mt-1", children: _jsx("div", { className: `h-full rounded-full transition-all ${agent.health < 60 ? 'bg-red-500' : 'bg-green-500'}`, style: { width: `${agent.health}%` } }) })] }), _jsxs("div", { children: [_jsx("span", { className: "font-semibold text-slate-500 text-sm", children: "Charm" }), _jsx("div", { className: "w-full bg-slate-100 rounded-full h-2 mt-1", children: _jsx("div", { className: `h-full rounded-full transition-all bg-purple-500`, style: { width: `${agent.charm}%` } }) }), _jsxs("div", { className: "flex justify-between items-center mt-1", children: [_jsx("span", { className: "text-xs text-slate-400", children: "Social Status" }), _jsxs("span", { className: "text-xs font-bold text-purple-600", children: [agent.charm, "/100"] })] })] }), _jsxs("div", { className: "space-y-3", children: [_jsxs("div", { className: "flex justify-between items-center", children: [_jsx("span", { className: "font-semibold text-slate-500 text-sm italic tracking-tight uppercase", children: "Economy & Finance" }), _jsxs("button", { onClick: () => setShowFinHistory(!showFinHistory), className: "text-xs flex items-center gap-1 text-indigo-600 font-bold hover:underline", children: [_jsx(History, { size: 14 }), showFinHistory ? 'Hide Ledger' : 'View Ledger'] })] }), _jsxs("div", { className: "grid grid-cols-2 gap-3", children: [_jsxs("div", { className: "bg-slate-50 border border-slate-200 p-3 rounded-xl shadow-sm", children: [_jsx("p", { className: "text-[10px] font-bold text-slate-400 uppercase", children: "Cash on Hand" }), _jsxs("p", { className: "text-xl font-black text-slate-700", children: ["$", agent.cash.toFixed(2)] })] }), _jsxs("div", { className: "bg-indigo-50 border border-indigo-100 p-3 rounded-xl shadow-sm", children: [_jsx("p", { className: "text-[10px] font-bold text-indigo-400 uppercase", children: "Bank Balance" }), _jsxs("p", { className: "text-xl font-black text-indigo-600", children: ["$", agent.bankBalance.toFixed(2)] })] })] }), showFinHistory && (_jsxs("div", { className: "bg-slate-900 text-slate-300 p-4 rounded-xl space-y-2 max-h-60 overflow-y-auto border border-slate-700 font-mono text-[11px] animate-in slide-in-from-top duration-200", children: [_jsx("h3", { className: "text-[10px] uppercase font-black text-slate-500 border-b border-slate-800 pb-1 mb-2 tracking-widest", children: "Transaction Ledger" }), agent.transactions.length === 0 ? (_jsx("p", { className: "text-slate-600 italic", children: "No recent transactions recorded." })) : (agent.transactions.map((t, i) => (_jsxs("div", { className: "flex justify-between items-start gap-2 border-b border-slate-800/50 pb-1 last:border-0 text-left", children: [_jsx("div", { className: "flex-1", children: _jsx("p", { className: "text-slate-100 font-bold break-words", children: t.description }) }), _jsxs("div", { className: `text-right font-black ${t.amount >= 0 ? 'text-emerald-400' : 'text-rose-400'}`, children: [t.amount >= 0 ? '+' : '', t.amount.toFixed(2)] })] }, i))))] })), agent.loanBalance > 0 && (_jsxs("div", { className: "bg-rose-50 border-2 border-rose-200 p-4 rounded-2xl animate-pulse", children: [_jsxs("div", { className: "flex justify-between items-center", children: [_jsxs("div", { children: [_jsx("p", { className: "text-[10px] font-black text-rose-500 uppercase tracking-widest", children: "Outstanding Loan" }), _jsxs("p", { className: "text-2xl font-black text-rose-600", children: ["$", agent.loanBalance.toFixed(2)] })] }), _jsx("div", { className: "p-2 bg-rose-200 rounded-full", children: _jsx(Landmark, { size: 24, className: "text-rose-600" }) })] }), _jsx("p", { className: "text-[10px] text-rose-400 font-bold mt-2 italic", children: "\u203B 20% salary deduction applies until settled" })] }))] }), relationshipEntries.length > 0 && (_jsxs("div", { children: [_jsx("span", { className: "font-semibold text-slate-500 text-sm", children: "Relationships" }), _jsx("div", { className: "space-y-2 mt-1", children: relationshipEntries.map(([otherId, intimacy]) => {
                                    const other = allAgents.find(a => a.id === otherId);
                                    if (!other)
                                        return null;
                                    const status = intimacy > 80 ? "Best Friend" : intimacy > 40 ? "Friend" : "Acquaintance";
                                    return (_jsxs("div", { onClick: () => onShowHistory(agent, other), className: "flex justify-between items-center text-sm bg-slate-50 p-2 rounded border border-slate-100 hover:bg-slate-100 cursor-pointer transition-colors", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { children: other.emoji }), _jsx("span", { className: "font-medium", children: other.name })] }), _jsxs("div", { className: "text-right", children: [_jsx("div", { className: "text-xs text-slate-400", children: status }), _jsxs("div", { className: "font-mono text-indigo-600", children: [intimacy, "%"] })] })] }, otherId));
                                }) })] })), _jsxs("div", { children: [_jsx("span", { className: "font-semibold text-slate-500 text-sm", children: "Description" }), _jsx("p", { className: "text-sm text-slate-600", children: agent.description })] })] })] }));
}
