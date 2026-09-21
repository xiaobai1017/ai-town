/**
 * 建筑地点详情面板
 * @author hubin
 */

import React from 'react';
import { Location as TownLocation } from '@/engine/World';
import { X, TrendingUp, Users, Wallet, Landmark, History, Info } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

interface LocationPanelProps {
    location: TownLocation | null;
    onClose: () => void;
}

export function LocationPanel({ location, onClose }: LocationPanelProps) {
    const { t, isZh } = useI18n();
    const [showHistory, setShowHistory] = React.useState(false);
    if (!location) return null;

    const displayName = t(`building.${location.name}`) || location.name;
    const displayDesc = t(`buildingDesc.${location.name}`) || '';

    return (
        <div className="fixed top-20 right-8 w-80 bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-white/50 animate-in slide-in-from-right duration-300 z-40 overflow-hidden">
            <div className="p-4 bg-slate-800 text-white flex justify-between items-center">
                <div className="flex items-center gap-2">
                    <Landmark size={18} className="text-indigo-400" />
                    <h2 className="text-lg font-bold">{displayName}</h2>
                </div>
                <button onClick={onClose} className="p-1 hover:bg-slate-700 rounded-full transition-colors" title={t('common.close')}>
                    <X size={20} />
                </button>
            </div>

            <div className="p-5 space-y-5">
                {displayDesc && (
                    <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl text-xs text-slate-600 leading-relaxed">
                        {displayDesc}
                    </div>
                )}

                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-slate-500">
                        <Users size={18} />
                        <span className="text-sm font-semibold">{t('locationPanel.visits')}</span>
                    </div>
                    <span className="text-2xl font-bold text-slate-800">
                        {location.stats.visits} <span className="text-xs font-normal text-slate-400">{t('locationPanel.times')}</span>
                    </span>
                </div>

                {(location.stats.revenue > 0 || location.stats.transactions.length > 0) && (
                    <div className="space-y-3">
                        <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100">
                            <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-2 text-emerald-700">
                                    <TrendingUp size={18} />
                                    <span className="text-xs font-bold uppercase tracking-wider">{t('locationPanel.revenue')}</span>
                                </div>
                                <button
                                    onClick={() => setShowHistory(!showHistory)}
                                    className="text-[10px] font-black uppercase text-emerald-600 hover:underline flex items-center gap-1"
                                >
                                    <History size={12} />
                                    {showHistory ? (isZh ? '收起' : 'Hide') : (isZh ? '明细' : 'View Details')}
                                </button>
                            </div>
                            <div className="text-3xl font-black text-emerald-600">
                                ${location.stats.revenue.toFixed(2)}
                            </div>
                        </div>

                        {showHistory && (
                            <div className="bg-slate-900 text-slate-300 p-4 rounded-xl space-y-2 max-h-48 overflow-y-auto border border-slate-700 font-mono text-[10px] animate-in slide-in-from-top duration-200 shadow-inner">
                                <h3 className="text-[9px] uppercase font-black text-slate-500 border-b border-slate-800 pb-1 mb-2 tracking-widest">
                                    {isZh ? '交易记录流水' : (location.name === 'Bakery' || location.name === 'Hospital' ? 'Consumption Ledger' : 'Revenue Ledger')}
                                </h3>
                                {location.stats.transactions.length === 0 ? (
                                    <p className="text-slate-600 italic">{isZh ? '暂无交易记录' : 'No transaction records found.'}</p>
                                ) : (
                                    location.stats.transactions.map((tr, i) => (
                                        <div key={i} className="flex justify-between items-start gap-2 border-b border-slate-800/50 pb-1 last:border-0 text-left">
                                            <div className="flex-1">
                                                <p className="text-slate-100 font-bold break-all">{tr.description}</p>
                                            </div>
                                            <div className={`text-right font-black ${tr.amount >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                {tr.amount >= 0 ? '+' : ''}{tr.amount.toFixed(2)}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}
                    </div>
                )}

                {location.stats.extra && (
                    <div className="grid grid-cols-2 gap-3">
                        {location.stats.extra.deposits !== undefined && (
                            <div className="bg-indigo-50 p-3 rounded-xl border border-indigo-100 text-center">
                                <div className="text-[10px] uppercase font-bold text-indigo-400 mb-1">{isZh ? '总储蓄金额' : 'Total Deposits'}</div>
                                <div className="text-lg font-bold text-indigo-600">${location.stats.extra.deposits.toFixed(2)}</div>
                            </div>
                        )}
                        {location.stats.extra.withdrawals !== undefined && (
                            <div className="bg-amber-50 p-3 rounded-xl border border-amber-100 text-center">
                                <div className="text-[10px] uppercase font-bold text-amber-400 mb-1">{isZh ? '总取现金额' : 'Total Withdrawals'}</div>
                                <div className="text-lg font-bold text-amber-600">${location.stats.extra.withdrawals.toFixed(2)}</div>
                            </div>
                        )}
                        {location.stats.extra.loans !== undefined && (
                            <div className="bg-rose-50 p-3 rounded-xl border border-rose-100 text-center col-span-2">
                                <div className="text-[10px] uppercase font-bold text-rose-400 mb-1">{isZh ? '发放借贷总额' : 'Total Loans Issued'}</div>
                                <div className="text-lg font-bold text-rose-600">${location.stats.extra.loans.toFixed(2)}</div>
                            </div>
                        )}
                    </div>
                )}

                <div className="pt-3 border-t border-slate-100">
                    <div className="text-[10px] text-slate-400 font-bold uppercase mb-2">{isZh ? '建筑基本属性' : 'Location Info'}</div>
                    <div className="flex justify-between text-sm mt-1">
                        <span className="text-slate-500">{t('locationPanel.type')}</span>
                        <span className="capitalize font-medium text-slate-700">
                            {location.type === 'public' ? t('locationPanel.public') : t('locationPanel.private')}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}
