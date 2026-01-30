import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef } from 'react';
export function ChatLog({ logs, onShowHistory }) {
    const scrollRef = useRef(null);
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [logs]);
    return (_jsxs("div", { className: "w-80 h-[600px] border border-slate-200 rounded-lg bg-white flex flex-col shadow-sm", children: [_jsx("div", { className: "p-3 bg-slate-100 border-b border-slate-200 font-semibold text-slate-700", children: "Town Chatter" }), _jsx("div", { ref: scrollRef, className: "flex-1 overflow-y-auto p-3 space-y-3", children: logs.length === 0 ? (_jsx("p", { className: "text-slate-400 text-sm italic text-center mt-10", children: "Quiet in town..." })) : (logs.map((log, i) => (_jsxs("div", { className: "text-sm border-l-2 border-indigo-200 pl-2", children: [_jsxs("div", { className: "flex justify-between text-xs text-slate-500 mb-1", children: [_jsxs("button", { onClick: () => onShowHistory(log.speaker, log.listener), className: "font-medium text-indigo-600 hover:underline cursor-pointer", children: [log.speaker, " to ", log.listener] }), _jsx("span", { children: log.timestamp })] }), _jsxs("p", { className: "text-slate-800", children: ["\"", log.text, "\""] })] }, i)))) })] }));
}
