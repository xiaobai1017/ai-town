/**
 * 居民详细信息抽屉面板
 * @author hubin
 */

import React from 'react';
import { Agent } from '@/engine/Agent';
import { X, Landmark, History, ChevronRight, ChevronDown, PlusCircle, MinusCircle, Sparkles } from 'lucide-react';
import { useI18n, formatGameTime as formatGameTimeUtil } from '@/lib/i18n';

interface AgentPanelProps {
    agent: Agent | null;
    allAgents: Agent[];
    onClose: () => void;
    onShowHistory: (a: Agent, b: Agent) => void;
}

export function AgentPanel({ agent, allAgents, onClose, onShowHistory }: AgentPanelProps) {
    const { t, language, isZh } = useI18n();
    const [showFinHistory, setShowFinHistory] = React.useState(false);
    const [showCharmHistory, setShowCharmHistory] = React.useState(false);
    if (!agent) return null;

    // Format game minutes as "Day N HH:MM"
    const formatGameTime = (minutes: number): string => formatGameTimeUtil(minutes, language);

    const relationshipEntries = Object.entries(agent.relationships)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3); // Top 3 friends

    // Calculate daily wage based on role
    const getDailyWage = (role: string): number => {
        let baseWagePerFrame = 0.1;
        switch (role) {
            case 'Mayor': baseWagePerFrame = 0.5; break;
            case 'Doctor': baseWagePerFrame = 0.4; break;
            case 'Police': baseWagePerFrame = 0.3; break;
            case 'Librarian': baseWagePerFrame = 0.2; break;
            case 'Baker': baseWagePerFrame = 0.2; break;
            case 'Gardener': baseWagePerFrame = 0.1; break;
            default: baseWagePerFrame = 0.1; break;
        }
        const workFramesPerDay = 8 * 60;
        return baseWagePerFrame * workFramesPerDay;
    };

    const displayRole = t(`agent.roles.${agent.role}`) || agent.role;
    const displayDesc = t(`agent.descriptions.${agent.name}`) || agent.description;
    const displayState = t(`agent.states.${agent.state}`) || agent.state;
    const displayDeath = agent.deathCause ? (t(`agent.deaths.${agent.deathCause}`) || agent.deathCause) : '';

    return (
        <div className="fixed right-4 top-20 w-80 bg-white p-4 rounded-lg shadow-xl border border-slate-200 max-h-[80vh] overflow-y-auto z-[60]">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold flex items-center gap-2">
                    <span className="text-2xl">{agent.emoji}</span> {agent.name}
                </h2>
                <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded" title={t('common.close')}>
                    <X size={20} />
                </button>
            </div>

            <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <span className="font-semibold text-slate-500 text-sm">{t('agent.roleLabel')}</span>
                        <p className="text-lg font-bold text-slate-800">{displayRole}</p>
                    </div>
                    <div>
                        <span className="font-semibold text-slate-500 text-sm">{t('agent.dailyWage')}</span>
                        <p className="text-lg font-mono text-emerald-600 font-bold">${getDailyWage(agent.role).toFixed(2)}</p>
                    </div>
                </div>

                <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3">
                    <div className="flex items-center justify-between">
                        <span className="font-semibold text-indigo-700 text-sm">{t('agent.jevDecision')}</span>
                        {agent.jevIntent?.status === 'thinking' && <span className="text-[10px] font-bold text-indigo-500 animate-pulse">{t('agent.thinking')}</span>}
                    </div>
                    {agent.jevIntent ? (
                        <>
                            <p className="mt-1 text-sm font-bold text-slate-800">
                                {agent.jevIntent.type}{agent.jevIntent.location ? ` → ${t('building.' + agent.jevIntent.location) || agent.jevIntent.location}` : ''}
                            </p>
                            {agent.jevIntent.reason && <p className="mt-1 text-xs text-slate-600">{agent.jevIntent.reason}</p>}
                        </>
                    ) : (
                        <p className="mt-1 text-xs text-slate-500">{t('agent.waitingJev')}</p>
                    )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <span className="font-semibold text-slate-500 text-sm">{t('agent.status')}</span>
                        <p className="text-md capitalize flex items-center gap-2 font-medium text-slate-700">
                            <span className={`w-2 h-2 rounded-full ${agent.state === 'IDLE' ? 'bg-green-500' : agent.state === 'DEAD' ? 'bg-slate-900' : 'bg-yellow-500'}`}></span>
                            {displayState}
                        </p>
                        {agent.state === 'DEAD' && displayDeath && (
                            <p className="text-[10px] font-bold text-rose-500 mt-1 uppercase tracking-tighter">{t('agent.deathCauseLabel')}: {displayDeath}</p>
                        )}
                    </div>
                    <div>
                        <span className="font-semibold text-slate-500 text-sm">{t('agent.livingHours')}</span>
                        <p className="text-md font-mono text-slate-700">{(agent.livingTicks / 60).toFixed(1)} {t('agent.hours')}</p>
                    </div>
                </div>

                <div>
                    <span className="font-semibold text-slate-500 text-sm">{t('agent.hunger')}</span>
                    <div className="w-full bg-slate-100 rounded-full h-2 mt-1">
                        <div
                            className={`h-full rounded-full transition-all ${agent.hunger > 80 ? 'bg-red-500' : 'bg-orange-400'}`}
                            style={{ width: `${agent.hunger}%` }}
                        ></div>
                    </div>
                </div>

                <div>
                    <span className="font-semibold text-slate-500 text-sm">{t('agent.health')}</span>
                    <div className="w-full bg-slate-100 rounded-full h-2 mt-1">
                        <div
                            className={`h-full rounded-full transition-all ${agent.health < 60 ? 'bg-red-500' : 'bg-green-500'}`}
                            style={{ width: `${agent.health}%` }}
                        ></div>
                    </div>
                </div>

                <div>
                    <div className="flex justify-between items-center">
                        <span className="font-semibold text-slate-500 text-sm">{t('agent.charm')}</span>
                        <button
                            onClick={() => setShowCharmHistory(!showCharmHistory)}
                            className="text-xs flex items-center gap-1 text-purple-600 font-bold hover:underline"
                        >
                            <Sparkles size={14} />
                            {showCharmHistory ? (isZh ? '收起账单' : 'Hide Ledger') : (isZh ? '查看明细' : 'View Ledger')}
                        </button>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2 mt-1">
                        <div
                            className={`h-full rounded-full transition-all bg-purple-500`}
                            style={{ width: `${agent.charm}%` }}
                        ></div>
                    </div>
                    <div className="flex justify-between items-center mt-1">
                        <span className="text-xs text-slate-400">{isZh ? '小镇名望' : 'Social Status'}</span>
                        <span className="text-xs font-bold text-purple-600">{agent.charm.toFixed(2).replace(/\.00$/, '')}/100</span>
                    </div>

                    {showCharmHistory && (
                        <div className="bg-slate-900 text-slate-300 p-4 rounded-xl space-y-2 mt-2 max-h-60 overflow-y-auto border border-slate-700 font-mono text-[11px] animate-in slide-in-from-top duration-200">
                            <h3 className="text-[10px] uppercase font-black text-purple-400 border-b border-slate-800 pb-1 mb-2 tracking-widest">{t('agent.charmHistory')}</h3>
                            {agent.charmHistory.length === 0 ? (
                                <p className="text-slate-600 italic">{t('agent.noHistory')}</p>
                            ) : (
                                agent.charmHistory.map((e, i) => (
                                    <div key={i} className="flex justify-between items-start gap-2 border-b border-slate-800/50 pb-1 last:border-0 text-left">
                                        <div className="flex-1">
                                            <p className="text-slate-100 font-bold">
                                                {e.source === 'shopping' ? '🛍️' : '📖'} {e.description}
                                            </p>
                                            <p className="text-slate-500 text-[10px]">
                                                {formatGameTime(e.timestamp)}
                                                {e.lastTimestamp > e.timestamp ? ` – ${formatGameTime(e.lastTimestamp).split(' ').slice(1).join(' ')}` : ''}
                                            </p>
                                            <p className="text-slate-400 text-[10px]">
                                                +{e.baseGain.toFixed(2)} {isZh ? '基础' : 'base'}{` · `}+{e.friendBonus.toFixed(2)} {isZh ? '好友加成' : 'friends'}
                                                {e.spent > 0 && ` · ${isZh ? '消费' : 'spent'} $${e.spent.toFixed(2)}`}
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-purple-400 font-black">+{e.gain.toFixed(2)}</p>
                                            <p className="text-slate-500 text-[10px]">→ {e.charmAfter.toFixed(2)}</p>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>

                <div className="space-y-3">
                    <div className="flex justify-between items-center">
                        <span className="font-semibold text-slate-500 text-sm italic tracking-tight uppercase">{isZh ? '个人资产与财务' : 'Economy & Finance'}</span>
                        <button
                            onClick={() => setShowFinHistory(!showFinHistory)}
                            className="text-xs flex items-center gap-1 text-indigo-600 font-bold hover:underline"
                        >
                            <History size={14} />
                            {showFinHistory ? (isZh ? '收起账单' : 'Hide Ledger') : (isZh ? '收支明细' : 'View Ledger')}
                        </button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl shadow-sm">
                            <p className="text-[10px] font-bold text-slate-400 uppercase">{t('agent.cash')}</p>
                            <p className="text-xl font-black text-slate-700">${agent.cash.toFixed(2)}</p>
                        </div>
                        <div className="bg-indigo-50 border border-indigo-100 p-3 rounded-xl shadow-sm">
                            <p className="text-[10px] font-bold text-indigo-400 uppercase">{t('agent.bankBalance')}</p>
                            <p className="text-xl font-black text-indigo-600">${agent.bankBalance.toFixed(2)}</p>
                        </div>
                    </div>

                    {showFinHistory && (
                        <div className="bg-slate-900 text-slate-300 p-4 rounded-xl space-y-2 max-h-60 overflow-y-auto border border-slate-700 font-mono text-[11px] animate-in slide-in-from-top duration-200">
                            <h3 className="text-[10px] uppercase font-black text-slate-500 border-b border-slate-800 pb-1 mb-2 tracking-widest">{t('agent.finHistory')}</h3>
                            {agent.transactions.length === 0 ? (
                                <p className="text-slate-600 italic">{t('agent.noHistory')}</p>
                            ) : (
                                agent.transactions.map((tr, i) => (
                                    <div key={i} className="flex justify-between items-start gap-2 border-b border-slate-800/50 pb-1 last:border-0 text-left">
                                        <div className="flex-1">
                                            <p className="text-slate-100 font-bold break-words">{tr.description}</p>
                                        </div>
                                        <div className={`text-right font-black ${tr.amount >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                            {tr.amount >= 0 ? '+' : ''}{tr.amount.toFixed(2)}
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
                                    <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest">{t('agent.loanBalance')}</p>
                                    <p className="text-2xl font-black text-rose-600">${agent.loanBalance.toFixed(2)}</p>
                                </div>
                                <div className="p-2 bg-rose-200 rounded-full">
                                    <Landmark size={24} className="text-rose-600" />
                                </div>
                            </div>
                            <p className="text-[10px] text-rose-400 font-bold mt-2 italic">※ {isZh ? '每笔工作报酬自动扣减20%用于还贷' : '20% salary deduction applies until settled'}</p>
                        </div>
                    )}
                </div>

                {relationshipEntries.length > 0 && (
                    <div>
                        <span className="font-semibold text-slate-500 text-sm">{t('agent.topFriends')}</span>
                        <div className="space-y-2 mt-1">
                            {relationshipEntries.map(([otherId, intimacy]) => {
                                const other = allAgents.find(a => a.id === otherId);
                                if (!other) return null;
                                const status = intimacy > 80 
                                    ? (isZh ? '挚友' : 'Best Friend') 
                                    : intimacy > 40 
                                    ? (isZh ? '朋友' : 'Friend') 
                                    : (isZh ? '熟人' : 'Acquaintance');
                                return (
                                    <div
                                        key={otherId}
                                        onClick={() => onShowHistory(agent, other)}
                                        className="flex justify-between items-center text-sm bg-slate-50 p-2 rounded border border-slate-100 hover:bg-slate-100 cursor-pointer transition-colors"
                                        title={t('agent.viewHistory')}
                                    >
                                        <div className="flex items-center gap-2">
                                            <span>{other.emoji}</span>
                                            <span className="font-medium text-slate-800">{other.name}</span>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-xs text-slate-400">{status}</div>
                                            <div className="font-mono text-indigo-600 font-bold">{intimacy}%</div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                <div>
                    <span className="font-semibold text-slate-500 text-sm">{isZh ? '人物简介' : 'Description'}</span>
                    <p className="text-sm text-slate-600 mt-0.5">{displayDesc}</p>
                </div>
            </div>
        </div>
    );
}
