import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { X } from 'lucide-react';
export function HistoryModal({ agentA, agentB, onClose }) {
    const history = agentA.conversationHistory[agentB.id] || [];
    return (_jsx("div", { className: "fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4", children: _jsxs("div", { className: "bg-white w-full max-w-md rounded-2xl shadow-2xl flex flex-col max-h-[70vh] animate-in fade-in zoom-in duration-200", children: [_jsxs("div", { className: "p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-2xl", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsxs("div", { className: "flex -space-x-2", children: [_jsx("span", { className: "text-2xl z-10", children: agentA.emoji }), _jsx("span", { className: "text-2xl", children: agentB.emoji })] }), _jsxs("h3", { className: "font-bold text-slate-800", children: [agentA.name, " & ", agentB.name] })] }), _jsx("button", { onClick: onClose, className: "p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-500", children: _jsx(X, { size: 20 }) })] }), _jsx("div", { className: "flex-1 overflow-y-auto p-4 space-y-4", children: history.length === 0 ? (_jsx("div", { className: "text-center py-10", children: _jsx("p", { className: "text-slate-400 italic text-sm", children: "No shared history yet..." }) })) : (history.map((line, idx) => {
                        const isAgentA = line.startsWith(agentA.name + ":");
                        const speakerEmoji = isAgentA ? agentA.emoji : agentB.emoji;
                        const speakerName = isAgentA ? agentA.name : agentB.name;
                        const content = line.split(': ').slice(1).join(': ');
                        return (_jsxs("div", { className: `flex flex-col ${isAgentA ? 'items-start' : 'items-end'}`, children: [_jsxs("div", { className: "flex items-center gap-1.5 mb-1 px-1", children: [_jsx("span", { className: "text-lg", children: speakerEmoji }), _jsx("span", { className: "text-[10px] font-bold text-slate-400 uppercase tracking-wider", children: speakerName })] }), _jsx("div", { className: `max-w-[90%] p-3 rounded-2xl text-sm shadow-sm ${isAgentA
                                        ? 'bg-indigo-50 text-indigo-900 rounded-tl-none border border-indigo-100'
                                        : 'bg-slate-100 text-slate-800 rounded-tr-none border border-slate-200'}`, children: content })] }, idx));
                    })) }), _jsx("div", { className: "p-4 bg-slate-50 border-t border-slate-100 rounded-b-2xl", children: _jsxs("p", { className: "text-xs text-center text-slate-400", children: ["Showing last ", history.length, " exchanges"] }) })] }) }));
}
