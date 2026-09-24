/**
 * 城镇模拟器主页面
 * @author hubin
 */
"use client";

import { useGameLoop } from "@/hooks/useGameLoop";
import { GameCanvas } from "@/components/GameCanvas";
import { ChatLog } from "@/components/ChatLog";
import { AgentPanel } from "@/components/AgentPanel";
import { HistoryModal } from "@/components/HistoryModal";
import { LocationPanel } from "@/components/LocationPanel";
import { useState, useEffect } from "react";
import { Agent } from "@/engine/Agent";
import { Location as TownLocation } from "@/engine/World";
import { Play, Pause, User, Plus, Minus, Skull, Banknote, Coins, ShieldAlert, RotateCcw, RotateCw, Square, Settings, X, Trophy, Languages } from "lucide-react";
import { SettingsModal } from "@/components/SettingsModal";
import { loadModelSettings, AppModelSettings, SETTINGS_CHANGE_EVENT } from "@/lib/modelSettings";
import { useI18n } from "@/lib/i18n";
import { WEATHER_CONFIGS, WeatherType } from "@/engine/Weather";
import { getOriginalAgentEmoji } from "@/data/townScript";

export default function Home() {
  const { language, setLanguage, t } = useI18n();
  const {
    gameState, togglePause, setSpeed, speed, addAgent, removeAgent,
    setPriceLevel, setWageLevel, setRiskLevel, setJevEnabled, setLocalAiEnabled,
    setJevCooldown, setWeatherInterval, setWeather, replayAvailable, startReplay,
    stopReplay, restartSimulation
  } = useGameLoop();
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<TownLocation | null>(null);
  const [historyPair, setHistoryPair] = useState<[Agent, Agent] | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [currentSettings, setCurrentSettings] = useState<AppModelSettings>(loadModelSettings());
  const [isGameOverDismissed, setIsGameOverDismissed] = useState<boolean>(false);

  const isGameOver = gameState.agents.length > 0 && (
    gameState.agents.every(a => a.state === 'DEAD') || 
    gameState.agents.some(a => a.charm >= 100)
  );

  useEffect(() => {
    const initialSettings = loadModelSettings();
    setCurrentSettings(initialSettings);
    // 首次加载时同步至服务端 Node.js 运行时
    fetch('/api/model/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(initialSettings),
    }).catch(() => {});

    const handleSettingsChange = (e: Event) => {
      const customEvent = e as CustomEvent<AppModelSettings>;
      if (customEvent.detail) {
        setCurrentSettings(customEvent.detail);
      }
    };
    window.addEventListener(SETTINGS_CHANGE_EVENT, handleSettingsChange);
    return () => window.removeEventListener(SETTINGS_CHANGE_EVENT, handleSettingsChange);
  }, []);

  // Always read the latest agent snapshot from gameState so the panel
  // updates in real time without relying on stale object references.
  const selectedAgent = selectedAgentId ? gameState.agents.find(a => a.id === selectedAgentId) ?? null : null;

  const handleShowHistory = (nameA: string, nameB: string) => {
    const a = gameState.agents.find(ag => ag.name === nameA);
    const b = gameState.agents.find(ag => ag.name === nameB);
    if (a && b) setHistoryPair([a, b]);
  };

  const handleRestart = async () => {
    if (window.confirm(t('header.restartConfirm'))) {
      if (gameState.isReplaying) {
        stopReplay();
      }
      await restartSimulation();
      setIsGameOverDismissed(false);
      setSelectedAgentId(null);
      setSelectedLocation(null);
    }
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
    <main className="h-screen w-screen max-w-full max-h-screen overflow-hidden bg-slate-50 p-3 lg:p-4 font-sans text-slate-900 flex flex-col">

      {/* Header / Controls */}
      <header className="flex flex-wrap xl:flex-nowrap justify-between items-center mb-3 bg-white px-4 py-2 rounded-xl shadow-xs border border-slate-200 shrink-0 gap-3">
        {/* 左侧：标题、小镇时间与模拟运行控制器 */}
        <div className="flex items-center gap-3 shrink-0">
          <div>
            <h1 className="text-xl font-black bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent leading-tight">
              {t('header.title')}
            </h1>
            <p className="text-slate-400 text-xs font-medium">
              {t('common.day', { day: Math.floor(gameState.time / (24 * 60)) + 1 })}, {formatTime(gameState.time)}
            </p>
          </div>

          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
            <button
              onClick={gameState.isReplaying ? stopReplay : togglePause}
              className={`p-1.5 rounded-md hover:shadow-xs transition ${gameState.isRunning ? 'bg-white text-indigo-600' : 'bg-indigo-600 text-white'}`}
              title={gameState.isRunning ? 'Pause' : 'Play'}
            >
              {gameState.isRunning ? <Pause size={18} /> : <Play size={18} />}
            </button>
            {gameState.isReplaying ? (
              <button onClick={stopReplay} title="Stop replay" className="p-1.5 rounded-md hover:shadow-xs text-rose-600">
                <Square size={16} />
              </button>
            ) : (
              <button onClick={startReplay} disabled={!replayAvailable} title="Replay latest simulation" className="p-1.5 rounded-md hover:shadow-xs disabled:opacity-30 text-purple-600">
                <RotateCcw size={16} />
              </button>
            )}
            <button
              onClick={handleRestart}
              title={t('header.restartTip')}
              className="p-1.5 rounded-md hover:shadow-xs text-slate-500 hover:text-indigo-600 hover:bg-white transition"
            >
              <RotateCw size={16} />
            </button>
          </div>
        </div>

        {/* 右侧控制与数据区 */}
        <div className="flex items-center gap-2.5 flex-wrap xl:flex-nowrap">
          {/* 天气状态显示与变换周期调节 */}
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg">
            <div
              className="flex items-center gap-1.5 px-2 border-r border-slate-200 text-xs font-bold text-slate-700 select-none"
              title={`${t('header.weather')}: ${t(`weather.${gameState.weather || 'SUNNY'}`)} - ${WEATHER_CONFIGS[gameState.weather || 'SUNNY']?.descriptionZh || ''}`}
            >
              <span className="text-base leading-none">{WEATHER_CONFIGS[gameState.weather || 'SUNNY']?.emoji || '☀️'}</span>
              <span className="text-slate-800">{t(`weather.${gameState.weather || 'SUNNY'}`)}</span>
            </div>
            <div className="flex items-center gap-1 px-1.5" title={t('header.weatherIntervalTip')}>
              <div className="flex flex-col leading-tight">
                <span className="text-[9px] text-slate-500 uppercase font-bold">{t('header.weatherInterval')}</span>
                <span className="text-xs font-black text-sky-700">{gameState.weatherIntervalHours || 4}h</span>
              </div>
              <div className="flex flex-col ml-0.5">
                <button
                  onClick={() => setWeatherInterval((gameState.weatherIntervalHours || 4) + 1)}
                  title="增加变换间隔 (+1h)"
                  className="hover:text-sky-600 p-0.5"
                >
                  <Plus size={9} />
                </button>
                <button
                  onClick={() => setWeatherInterval(Math.max(1, (gameState.weatherIntervalHours || 4) - 1))}
                  title="缩短变换间隔 (-1h)"
                  className="hover:text-rose-600 p-0.5"
                >
                  <Minus size={9} />
                </button>
              </div>
            </div>
          </div>

          {/* 居民人数控制 */}
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg">
            <div className="flex items-center gap-1 px-2 border-r border-slate-200 text-xs font-medium text-slate-600">
              <User size={15} className="text-slate-500" />
              <span>{gameState.agents.length} {t('header.residents')}</span>
            </div>
            <div className="flex gap-0.5">
              <button
                onClick={removeAgent}
                title={t('header.removeResident')}
                className="p-1 hover:bg-white hover:shadow-xs rounded transition text-slate-500 hover:text-red-500"
              >
                <Minus size={14} />
              </button>
              <button
                onClick={addAgent}
                title={t('header.addResident')}
                className="p-1 hover:bg-white hover:shadow-xs rounded transition text-slate-500 hover:text-indigo-600"
              >
                <Plus size={14} />
              </button>
            </div>
          </div>

          {/* JEV 智能、本地决策与经济参数调节 */}
          <div className="flex items-center gap-2.5 bg-slate-100 p-1 rounded-lg">
            <label className="flex items-center gap-1.5 px-2 border-r border-slate-200 text-xs font-bold text-indigo-700 cursor-pointer" title={t('header.jevAiTip')}>
              <input type="checkbox" checked={gameState.jevEnabled} onChange={(event) => setJevEnabled(event.target.checked)} className="cursor-pointer rounded text-indigo-600" />
              {t('header.jevAi')}
            </label>
            <label className="flex items-center gap-1.5 px-2 border-r border-slate-200 text-xs font-bold text-slate-700 cursor-pointer" title={t('header.localAiTip')}>
              <input type="checkbox" checked={gameState.localAiEnabled} onChange={(event) => setLocalAiEnabled(event.target.checked)} className="cursor-pointer rounded text-indigo-600" />
              {t('header.localAi')}
            </label>
            <div className="flex items-center gap-1 px-1.5 border-r border-slate-200" title={t('header.jevIntervalTip')}>
              <div className="flex flex-col leading-tight">
                <span className="text-[9px] text-slate-500 uppercase font-bold">{t('header.jevInterval')}</span>
                <span className="text-xs font-black text-indigo-700">{gameState.jevCooldown}m</span>
              </div>
              <div className="flex flex-col ml-0.5">
                <button onClick={() => setJevCooldown(gameState.jevCooldown + 5)} className="hover:text-indigo-600 p-0.5"><Plus size={9} /></button>
                <button onClick={() => setJevCooldown(Math.max(1, gameState.jevCooldown - 5))} className="hover:text-rose-600 p-0.5"><Minus size={9} /></button>
              </div>
            </div>
            <div className="flex items-center gap-1.5 px-1.5 border-r border-slate-200">
              <Banknote size={15} className="text-emerald-600" />
              <div className="flex flex-col leading-tight">
                <span className="text-[9px] text-slate-500 uppercase font-bold">{t('header.wages')}</span>
                <span className="text-xs font-black text-slate-700">{gameState.wageLevel.toFixed(1)}x</span>
              </div>
              <div className="flex flex-col ml-0.5">
                <button onClick={() => setWageLevel(Math.min(5, gameState.wageLevel + 0.1))} className="hover:text-emerald-600 p-0.5"><Plus size={9} /></button>
                <button onClick={() => setWageLevel(Math.max(0.1, gameState.wageLevel - 0.1))} className="hover:text-rose-600 p-0.5"><Minus size={9} /></button>
              </div>
            </div>

            <div className="flex items-center gap-1.5 px-1.5 border-r border-slate-200">
              <Coins size={15} className="text-amber-600" />
              <div className="flex flex-col leading-tight">
                <span className="text-[9px] text-slate-500 uppercase font-bold">{t('header.prices')}</span>
                <span className="text-xs font-black text-slate-700">{gameState.priceLevel.toFixed(1)}x</span>
              </div>
              <div className="flex flex-col ml-0.5">
                <button onClick={() => setPriceLevel(Math.min(5, gameState.priceLevel + 0.1))} className="hover:text-amber-600 p-0.5"><Plus size={9} /></button>
                <button onClick={() => setPriceLevel(Math.max(0.1, gameState.priceLevel - 0.1))} className="hover:text-rose-600 p-0.5"><Minus size={9} /></button>
              </div>
            </div>

            <div className="flex items-center gap-1.5 px-1.5">
              <ShieldAlert size={15} className="text-indigo-600" />
              <div className="flex flex-col leading-tight">
                <span className="text-[9px] text-slate-500 uppercase font-bold">{t('header.accidentRisk')}</span>
                <span className="text-xs font-black text-slate-700">{gameState.riskLevel.toFixed(1)}x</span>
              </div>
              <div className="flex flex-col ml-0.5">
                <button onClick={() => setRiskLevel(Math.min(10, gameState.riskLevel + 0.5))} className="hover:text-indigo-600 p-0.5"><Plus size={9} /></button>
                <button onClick={() => setRiskLevel(Math.max(0, gameState.riskLevel - 0.5))} className="hover:text-rose-600 p-0.5"><Minus size={9} /></button>
              </div>
            </div>
          </div>

          {/* 魅力榜 TOP3 */}
          <div className="flex items-center gap-1.5 text-xs text-slate-600 bg-purple-50 px-2.5 py-1.5 rounded-lg border border-purple-100 shrink-0">
            <span className="text-purple-700 font-bold">{t('header.charmRankings')}:</span>
            {gameState.agents
              .sort((a, b) => b.charm - a.charm)
              .slice(0, 3)
              .map((agent, index) => (
                <span 
                  key={agent.id} 
                  onClick={() => setSelectedAgentId(agent.id)}
                  className="flex items-center gap-1 bg-white px-2 py-0.5 rounded shadow-xs cursor-pointer hover:shadow-sm hover:text-purple-700 transition-all font-medium"
                >
                  <span className="text-[10px] font-black text-purple-600">#{index + 1}</span>
                  <span>{agent.state === 'DEAD' ? '🪦' : (agent.emoji === '🪦' ? (agent.originalEmoji || getOriginalAgentEmoji(agent)) : agent.emoji)}</span>
                  <span>{agent.name}</span>
                  <span className="font-bold text-purple-600 font-mono">{agent.charm.toFixed(1).replace(/\.0$/, '')}</span>
                </span>
              ))
            }
          </div>

          {/* 结算榜单唤醒按钮（当弹窗被用户关闭后显示） */}
          {isGameOver && isGameOverDismissed && (
            <button
              onClick={() => setIsGameOverDismissed(false)}
              className="flex items-center gap-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 px-2.5 py-1.5 rounded-lg shadow-xs font-bold text-xs transition shrink-0"
              title="重新打开胜利结算榜单窗口"
            >
              <Trophy size={15} className="text-amber-600" />
              <span>{t('header.winnerBadge')}</span>
            </button>
          )}

          {/* 语言切换按钮 */}
          <button
            onClick={() => setLanguage(language === 'zh' ? 'en' : 'zh')}
            className="flex items-center gap-1 bg-white hover:bg-slate-100 border border-slate-200 hover:border-indigo-300 px-2.5 py-1.5 rounded-lg shadow-xs transition text-slate-700 hover:text-indigo-600 font-bold text-xs shrink-0 cursor-pointer"
            title={language === 'zh' ? '切换为英文 (Switch to English)' : 'Switch to Chinese (切换为中文)'}
          >
            <Languages size={15} className="text-indigo-600" />
            <span>{language === 'zh' ? 'EN' : '中文'}</span>
          </button>

          {/* 模型设置按钮（仅图标） */}
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 bg-white hover:bg-slate-100 border border-slate-200 hover:border-indigo-300 rounded-lg shadow-xs transition text-slate-600 hover:text-indigo-600 group shrink-0 flex items-center justify-center cursor-pointer"
            title={`${t('settings.title')} (${currentSettings.llm.enabled ? (currentSettings.llm.model || 'Default') : t('common.disabled')})`}
          >
            <Settings size={17} className="text-indigo-600 group-hover:rotate-45 transition-transform duration-200" />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 min-h-0 flex gap-4 items-stretch w-full">

        {/* Game Map */}
        <div className="relative flex-1 min-w-0 h-full flex flex-col">
          <div className="bg-white p-2 rounded-lg shadow-sm border border-slate-200 w-full flex-1 min-h-0 flex flex-col">
            <GameCanvas
              world={gameState.world}
              agents={gameState.agents}
              onSelectAgent={(agent) => {
                if (agent) setSelectedAgentId(agent.id);
                setSelectedLocation(null);
              }}
              onSelectLocation={(loc) => {
                setSelectedLocation(loc);
                setSelectedAgentId(null);
              }}
              time={gameState.time}
              weather={gameState.weather}
            />
          </div>
          <p className="mt-1 text-center text-slate-400 text-xs shrink-0">Click on an agent or building for details</p>
        </div>

        {/* Sidebar / Chat */}
        <div className="flex flex-col w-80 2xl:w-96 shrink-0 h-full">
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
          onClose={() => setSelectedAgentId(null)}
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

      {/* Model Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onSaved={(newSettings) => {
          setCurrentSettings(newSettings);
          if (newSettings.jev.enabled !== gameState.jevEnabled) {
            setJevEnabled(newSettings.jev.enabled);
          }
        }}
      />

      {/* Game Over Overlay - Charm Winner or Extinction */}
      {isGameOver && !isGameOverDismissed && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="relative bg-slate-900 border-2 border-purple-500/50 p-10 pt-12 rounded-3xl shadow-[0_0_50px_rgba(124,58,237,0.3)] text-center max-w-md mx-4 transform animate-in zoom-in duration-300">
            {/* 关闭按钮 */}
            <button
              onClick={() => setIsGameOverDismissed(true)}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white hover:bg-slate-800/80 rounded-xl transition"
              title={t('gameOver.stay')}
            >
              <X size={20} />
            </button>

            <div className="w-20 h-20 bg-purple-500/20 rounded-full flex items-center justify-center mx-auto mb-5 border border-purple-500/30">
              {gameState.agents.some(a => a.charm >= 100) ? (
                <span className="text-3xl">👑</span>
              ) : (
                <Skull size={40} className="text-purple-500 animate-pulse" />
              )}
            </div>
            <h2 className="text-3xl font-black text-white mb-2 tracking-tighter uppercase italic">
              {gameState.agents.some(a => a.charm >= 100) ? t('gameOver.championTitle') : t('gameOver.rankingTitle')}
            </h2>
            <p className="text-slate-400 text-xs font-medium leading-relaxed mb-5">
              {gameState.agents.some(a => a.charm >= 100) ? (
                t('gameOver.championDesc')
              ) : (
                t('gameOver.allDeadDesc')
              )}
            </p>

            <div className="bg-slate-950/50 rounded-2xl border border-slate-800 p-4 max-h-60 overflow-y-auto mb-6 text-left">
              <h3 className="text-[10px] font-black text-purple-500 uppercase tracking-widest mb-3 sticky top-0 bg-slate-900/90 py-1 backdrop-blur-sm border-b border-slate-800">
                {t('gameOver.rankings')}
              </h3>
              <div className="space-y-2.5">
                {gameState.agents
                  .sort((a, b) => b.charm - a.charm)
                  .map((a, index) => (
                  <div
                    key={a.id}
                    onClick={() => {
                      setSelectedAgentId(a.id);
                      setIsGameOverDismissed(true);
                    }}
                    className="flex justify-between items-center gap-4 text-xs border-b border-slate-800/50 pb-2 last:border-0 last:pb-0 cursor-pointer hover:bg-white/5 p-1 rounded transition-colors group"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-lg group-hover:scale-110 transition-transform">
                        {index === 0 ? '👑' : index === 1 ? '🥈' : index === 2 ? '🥉' : a.state === 'DEAD' ? '🪦' : (a.emoji === '🪦' ? (a.originalEmoji || getOriginalAgentEmoji(a)) : a.emoji)}
                      </span>
                      <div>
                        <p className={`font-bold leading-none group-hover:text-white ${a.charm >= 100 ? 'text-yellow-400' : 'text-slate-200'}`}>
                          {a.name}{a.charm >= 100 ? ` (${t('gameOver.winner')}!)` : ''}
                        </p>
                        <p className="text-[10px] text-slate-500 mt-1 uppercase font-bold">
                          {t('agent.roles.' + a.role) !== 'agent.roles.' + a.role ? t('agent.roles.' + a.role) : a.role}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`font-black text-xs ${a.charm >= 100 ? 'text-yellow-400' : 'text-purple-400'}`}>
                        {t('agent.charm')}: {a.charm.toFixed(2).replace(/\.00$/, '')}
                      </p>
                      {a.state === 'DEAD' && (
                        <p className="text-rose-400 font-bold text-[10px]">
                          {a.deathCause ? (t('agent.deaths.' + a.deathCause) !== 'agent.deaths.' + a.deathCause ? t('agent.deaths.' + a.deathCause) : a.deathCause) : ''}
                        </p>
                      )}
                      <p className="text-[10px] text-slate-500 font-mono italic">
                        {t('gameOver.survived', { hours: (a.livingTicks / 60).toFixed(1) })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800 flex flex-col gap-2.5">
              <button
                onClick={async () => {
                  await restartSimulation();
                  setIsGameOverDismissed(false);
                  setSelectedAgentId(null);
                  setSelectedLocation(null);
                }}
                className="bg-slate-100 hover:bg-white text-slate-950 font-black py-3 px-8 rounded-xl transition-all hover:scale-105 active:scale-95 shadow-xl w-full text-xs"
              >
                {t('gameOver.restart')}
              </button>
              <button
                onClick={() => setIsGameOverDismissed(true)}
                className="bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white font-bold py-2 px-6 rounded-xl transition text-xs w-full"
              >
                {t('gameOver.stay')}
              </button>
            </div>
          </div>
        </div>
      )}

    </main>
  );
}
