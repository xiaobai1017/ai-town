/**
 * 城镇聊天动态记录组件
 * @author hubin
 */

import React, { useEffect, useRef } from 'react';
import { DialoguePacket } from '@/ai/DialogueSystem';
import { useI18n, formatGameTime } from '@/lib/i18n';

interface ChatLogProps {
    logs: DialoguePacket[];
    onShowHistory: (speakerName: string, listenerName: string) => void;
}

export function ChatLog({ logs, onShowHistory }: ChatLogProps) {
    const { t, language } = useI18n();
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [logs]);

    return (
        <div className="w-full h-full border border-slate-200 rounded-lg bg-white flex flex-col shadow-sm">
            <div className="p-3 bg-slate-100 border-b border-slate-200 font-semibold text-slate-700 shrink-0">
                {t('chat.title')}
            </div>
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
                {logs.length === 0 ? (
                    <p className="text-slate-400 text-sm italic text-center mt-10">{t('chat.quiet')}</p>
                ) : (
                    logs.map((log, i) => (
                        <div key={i} className="text-sm border-l-2 border-indigo-200 pl-2">
                            <div className="flex justify-between text-xs text-slate-500 mb-1">
                                <button
                                    onClick={() => onShowHistory(log.speaker, log.listener)}
                                    className="font-medium text-indigo-600 hover:underline cursor-pointer"
                                >
                                    {log.speaker} {t('chat.to')} {log.listener}
                                </button>
                                <span>
                                    {typeof log.gameTime === 'number'
                                        ? formatGameTime(log.gameTime, language)
                                        : log.timestamp}
                                </span>
                            </div>
                            <p className="text-slate-800">"{log.text}"</p>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
