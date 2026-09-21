/**
 * 大模型与 JEV 模型设置弹窗组件
 * @author hubin
 */

"use client";

import React, { useState, useEffect } from 'react';
import { 
  X, 
  Settings, 
  Bot, 
  BrainCircuit, 
  Eye, 
  EyeOff, 
  CheckCircle2, 
  XCircle, 
  Loader2, 
  RotateCcw, 
  Save, 
  Sparkles,
  ExternalLink
} from 'lucide-react';
import { 
  AppModelSettings, 
  LLMProviderType, 
  loadModelSettings, 
  saveModelSettings, 
  resetModelSettings 
} from '@/lib/modelSettings';
import { useI18n } from '@/lib/i18n';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: (newSettings: AppModelSettings) => void;
}

export function SettingsModal({ isOpen, onClose, onSaved }: SettingsModalProps) {
  const { t, isZh } = useI18n();
  const [activeTab, setActiveTab] = useState<'llm' | 'jev'>('llm');
  const [settings, setSettings] = useState<AppModelSettings>(loadModelSettings());
  const [showApiKey, setShowApiKey] = useState(false);
  const [showJevKey, setShowJevKey] = useState(false);

  // 测试状态管理
  const [testingLLM, setTestingLLM] = useState(false);
  const [llmTestResult, setLlmTestResult] = useState<{ success: boolean; message: string; latency?: number } | null>(null);

  const [testingJev, setTestingJev] = useState(false);
  const [jevTestResult, setJevTestResult] = useState<{ success: boolean; message: string; latency?: number } | null>(null);

  const [saveToast, setSaveToast] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSettings(loadModelSettings());
      setLlmTestResult(null);
      setJevTestResult(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // 预设模板
  const applyPreset = (preset: 'ollama' | 'deepseek' | 'openai' | 'qwen') => {
    setLlmTestResult(null);
    if (preset === 'ollama') {
      setSettings(prev => ({
        ...prev,
        llm: {
          ...prev.llm,
          provider: 'ollama',
          baseUrl: 'http://localhost:11434',
          model: 'qwen3:0.6b',
        }
      }));
    } else if (preset === 'deepseek') {
      setSettings(prev => ({
        ...prev,
        llm: {
          ...prev.llm,
          provider: 'openai',
          baseUrl: 'https://api.deepseek.com/v1',
          model: 'deepseek-chat',
        }
      }));
    } else if (preset === 'openai') {
      setSettings(prev => ({
        ...prev,
        llm: {
          ...prev.llm,
          provider: 'openai',
          baseUrl: 'https://api.openai.com/v1',
          model: 'gpt-4o-mini',
        }
      }));
    } else if (preset === 'qwen') {
      setSettings(prev => ({
        ...prev,
        llm: {
          ...prev.llm,
          provider: 'openai',
          baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
          model: 'qwen-turbo',
        }
      }));
    }
  };

  // 测试 LLM 连接
  const handleTestLLM = async () => {
    setTestingLLM(true);
    setLlmTestResult(null);
    try {
      const response = await fetch('/api/model/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'llm',
          llmConfig: settings.llm,
        }),
      });
      const data = await response.json();
      if (data.success) {
        setLlmTestResult({
          success: true,
          message: `连接成功！响应样例: "${data.sample}"`,
          latency: data.latencyMs,
        });
      } else {
        setLlmTestResult({
          success: false,
          message: data.error || '测试连接失败',
          latency: data.latencyMs,
        });
      }
    } catch (err: any) {
      setLlmTestResult({
        success: false,
        message: err.message || '网络请求错误',
      });
    } finally {
      setTestingLLM(false);
    }
  };

  // 测试 JEV 连接
  const handleTestJev = async () => {
    setTestingJev(true);
    setJevTestResult(null);
    try {
      const response = await fetch('/api/model/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'jev',
          jevConfig: settings.jev,
        }),
      });
      const data = await response.json();
      if (data.success) {
        setJevTestResult({
          success: true,
          message: data.sample || 'JEV 决策服务连接正常',
          latency: data.latencyMs,
        });
      } else {
        setJevTestResult({
          success: false,
          message: data.error || 'JEV 连接测试失败',
          latency: data.latencyMs,
        });
      }
    } catch (err: any) {
      setJevTestResult({
        success: false,
        message: err.message || '网络请求错误',
      });
    } finally {
      setTestingJev(false);
    }
  };

  // 保存设置
  const handleSave = () => {
    saveModelSettings(settings);
    onSaved?.(settings);
    setSaveToast(true);
    setTimeout(() => {
      setSaveToast(false);
      onClose();
    }, 600);
  };

  // 恢复默认值
  const handleReset = () => {
    if (confirm('确定要恢复为初始推荐模型设置吗？当前填写的 API Key 等参数将被清空。')) {
      const def = resetModelSettings();
      setSettings(def);
      setLlmTestResult(null);
      setJevTestResult(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white border border-slate-200 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
              <Settings size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">{t('settings.title')}</h2>
              <p className="text-xs text-slate-500">{t('settings.subtitle')}</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition"
            title={t('common.close')}
          >
            <X size={20} />
          </button>
        </div>

        {/* 标签栏 */}
        <div className="flex border-b border-slate-200 px-6 pt-2 bg-slate-50/30 gap-4">
          <button
            onClick={() => setActiveTab('llm')}
            className={`flex items-center gap-2 pb-3 px-2 text-sm font-semibold border-b-2 transition ${
              activeTab === 'llm' 
                ? 'border-indigo-600 text-indigo-600' 
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Bot size={18} />
            {t('settings.tabLlm')}
          </button>
          <button
            onClick={() => setActiveTab('jev')}
            className={`flex items-center gap-2 pb-3 px-2 text-sm font-semibold border-b-2 transition ${
              activeTab === 'jev' 
                ? 'border-indigo-600 text-indigo-600' 
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <BrainCircuit size={18} />
            {t('settings.tabJev')}
          </button>
        </div>

        {/* 内容区域 */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {activeTab === 'llm' && (
            <div className="space-y-4">
              {/* 协议类型选择 */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  API 协议类型
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setSettings(s => ({ ...s, llm: { ...s.llm, provider: 'ollama' } }))}
                    className={`flex flex-col items-start p-3 rounded-xl border text-left transition ${
                      settings.llm.provider === 'ollama'
                        ? 'border-indigo-500 bg-indigo-50/40 text-indigo-900 shadow-sm'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="font-bold text-sm">Ollama 原生协议</span>
                      {settings.llm.provider === 'ollama' && <span className="w-2 h-2 rounded-full bg-indigo-600"></span>}
                    </div>
                    <span className="text-xs text-slate-500 mt-1">适用于本地 Ollama 实例（支持 /api/generate）</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSettings(s => ({ ...s, llm: { ...s.llm, provider: 'openai' } }))}
                    className={`flex flex-col items-start p-3 rounded-xl border text-left transition ${
                      settings.llm.provider === 'openai'
                        ? 'border-indigo-500 bg-indigo-50/40 text-indigo-900 shadow-sm'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="font-bold text-sm">OpenAI 兼容协议</span>
                      {settings.llm.provider === 'openai' && <span className="w-2 h-2 rounded-full bg-indigo-600"></span>}
                    </div>
                    <span className="text-xs text-slate-500 mt-1">支持 DeepSeek、ChatGPT、通义千问、vLLM 等</span>
                  </button>
                </div>
              </div>

              {/* 快捷预设 */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600 mb-2">
                  <Sparkles size={14} className="text-amber-500" />
                  <span>快捷填入推荐预设：</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => applyPreset('ollama')}
                    className="text-xs bg-white border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/30 px-2.5 py-1 rounded-lg text-slate-700 transition"
                  >
                    🦙 本地 Ollama (qwen3:0.6b)
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset('deepseek')}
                    className="text-xs bg-white border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/30 px-2.5 py-1 rounded-lg text-slate-700 transition"
                  >
                    🐋 DeepSeek (deepseek-chat)
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset('openai')}
                    className="text-xs bg-white border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/30 px-2.5 py-1 rounded-lg text-slate-700 transition"
                  >
                    ⚡ OpenAI (gpt-4o-mini)
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset('qwen')}
                    className="text-xs bg-white border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/30 px-2.5 py-1 rounded-lg text-slate-700 transition"
                  >
                    ☁️ 通义千问 (qwen-turbo)
                  </button>
                </div>
              </div>

              {/* API 接口地址 */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  API 端点地址 (Base URL)
                </label>
                <input
                  type="text"
                  value={settings.llm.baseUrl}
                  onChange={(e) => setSettings(s => ({ ...s, llm: { ...s.llm, baseUrl: e.target.value } }))}
                  placeholder={settings.llm.provider === 'ollama' ? 'http://localhost:11434' : 'https://api.openai.com/v1'}
                  className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition font-mono"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  {settings.llm.provider === 'ollama' 
                    ? '输入 Ollama 服务的基地址，系统将自动调用 /api/generate 接口' 
                    : '输入兼容 OpenAI 的 API 基地址，系统将自动调用 /chat/completions 接口'}
                </p>
              </div>

              {/* API Key */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  API Key (访问密钥)
                </label>
                <div className="relative">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={settings.llm.apiKey}
                    onChange={(e) => setSettings(s => ({ ...s, llm: { ...s.llm, apiKey: e.target.value } }))}
                    placeholder={settings.llm.provider === 'ollama' ? '本地 Ollama 通常无需填写' : 'sk-...'}
                    className="w-full pl-3.5 pr-10 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                    title={showApiKey ? '隐藏密钥' : '显示密钥'}
                  >
                    {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* 模型名称 */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  模型名称 (Model Identifier)
                </label>
                <input
                  type="text"
                  value={settings.llm.model}
                  onChange={(e) => setSettings(s => ({ ...s, llm: { ...s.llm, model: e.target.value } }))}
                  placeholder="如 qwen3:0.6b, deepseek-chat, gpt-4o-mini"
                  className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition font-mono"
                />
              </div>

              {/* 测试连接按钮与反馈 */}
              <div className="pt-2 border-t border-slate-100 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={handleTestLLM}
                    disabled={testingLLM}
                    className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100/80 rounded-lg transition disabled:opacity-50"
                  >
                    {testingLLM ? <Loader2 size={14} className="animate-spin" /> : <Bot size={14} />}
                    {testingLLM ? '正在测试连接...' : '测试大模型连接'}
                  </button>
                  {llmTestResult?.latency && (
                    <span className="text-xs text-slate-400 font-mono">
                      响应耗时: {llmTestResult.latency} ms
                    </span>
                  )}
                </div>

                {llmTestResult && (
                  <div className={`p-3 rounded-lg text-xs flex items-start gap-2 ${
                    llmTestResult.success 
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' 
                      : 'bg-rose-50 text-rose-800 border border-rose-200'
                  }`}>
                    {llmTestResult.success ? (
                      <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <XCircle size={16} className="text-rose-600 shrink-0 mt-0.5" />
                    )}
                    <span className="break-all">{llmTestResult.message}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'jev' && (
            <div className="space-y-4">
              {/* JEV 开关 */}
              <div className="flex items-center justify-between p-3.5 bg-purple-50/60 rounded-xl border border-purple-100">
                <div>
                  <h4 className="text-sm font-bold text-purple-900">启用 JEV 自主行为决策</h4>
                  <p className="text-xs text-purple-600/80 mt-0.5">居民将使用 JEV 驱动安全规划与行动决策</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.jev.enabled}
                    onChange={(e) => setSettings(s => ({ ...s, jev: { ...s.jev, enabled: e.target.checked } }))}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                </label>
              </div>

              {/* JEV API 地址 */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  JEV API 基础地址 (Base URL)
                </label>
                <input
                  type="text"
                  value={settings.jev.baseUrl}
                  onChange={(e) => setSettings(s => ({ ...s, jev: { ...s.jev, baseUrl: e.target.value } }))}
                  placeholder="https://api.typesafe.ai"
                  className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition font-mono"
                />
              </div>

              {/* JEV API Key */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  JEV API Key (TypeSafe Key)
                </label>
                <div className="relative">
                  <input
                    type={showJevKey ? 'text' : 'password'}
                    value={settings.jev.apiKey}
                    onChange={(e) => setSettings(s => ({ ...s, jev: { ...s.jev, apiKey: e.target.value } }))}
                    placeholder="ts-..."
                    className="w-full pl-3.5 pr-10 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowJevKey(!showJevKey)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                    title={showJevKey ? '隐藏密钥' : '显示密钥'}
                  >
                    {showJevKey ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  若未提供有效密钥，游戏将自动回退至规则决策系统。
                </p>
              </div>

              {/* JEV 模型名称 */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  JEV 模型名称
                </label>
                <input
                  type="text"
                  value={settings.jev.model}
                  onChange={(e) => setSettings(s => ({ ...s, jev: { ...s.jev, model: e.target.value } }))}
                  placeholder="jev-latest"
                  className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition font-mono"
                />
              </div>

              {/* 测试 JEV 连接 */}
              <div className="pt-2 border-t border-slate-100 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={handleTestJev}
                    disabled={testingJev}
                    className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-purple-600 bg-purple-50 hover:bg-purple-100/80 rounded-lg transition disabled:opacity-50"
                  >
                    {testingJev ? <Loader2 size={14} className="animate-spin" /> : <BrainCircuit size={14} />}
                    {testingJev ? '正在测试连接...' : '测试 JEV 连接'}
                  </button>
                  {jevTestResult?.latency && (
                    <span className="text-xs text-slate-400 font-mono">
                      响应耗时: {jevTestResult.latency} ms
                    </span>
                  )}
                </div>

                {jevTestResult && (
                  <div className={`p-3 rounded-lg text-xs flex items-start gap-2 ${
                    jevTestResult.success 
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' 
                      : 'bg-rose-50 text-rose-800 border border-rose-200'
                  }`}>
                    {jevTestResult.success ? (
                      <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <XCircle size={16} className="text-rose-600 shrink-0 mt-0.5" />
                    )}
                    <span className="break-all">{jevTestResult.message}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 底部按钮栏 */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-slate-50">
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 rounded-lg transition"
          >
            <RotateCcw size={14} />
            {t('settings.resetDefaults')}
          </button>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200/60 rounded-lg transition"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm hover:shadow transition"
            >
              <Save size={14} />
              {saveToast ? (isZh ? '已保存！' : 'Saved!') : t('settings.saveConfig')}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
