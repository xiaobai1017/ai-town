/**
 * 模型配置数据模型与持久化管理（支持客户端 localStorage 与服务端同步）
 * @author hubin
 */

export type LLMProviderType = 'ollama' | 'openai';

export interface LLMConfig {
  provider: LLMProviderType;
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
}

export interface JevConfig {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface AppModelSettings {
  llm: LLMConfig;
  jev: JevConfig;
}

export const STORAGE_KEY = 'ai_town_model_settings';
export const SETTINGS_CHANGE_EVENT = 'ai_town_model_settings_changed';

export const DEFAULT_MODEL_SETTINGS: AppModelSettings = {
  llm: {
    provider: 'ollama',
    baseUrl: process.env.NEXT_PUBLIC_LLM_ENDPOINT || 'http://localhost:11434/api/generate',
    apiKey: process.env.NEXT_PUBLIC_LLM_API_KEY || '',
    model: process.env.NEXT_PUBLIC_LLM_MODEL || 'qwen3:0.6b',
    temperature: 0.4,
  },
  jev: {
    enabled: false,
    baseUrl: process.env.NEXT_PUBLIC_TYPESAFE_BASE_URL || 'https://api.typesafe.ai',
    apiKey: process.env.NEXT_PUBLIC_TYPESAFE_API_KEY || '',
    model: process.env.NEXT_PUBLIC_TYPESAFE_DEFAULT_MODEL || 'jev-latest',
  },
};

const globalForModelSettings = globalThis as typeof globalThis & {
  aiTownServerModelSettings?: AppModelSettings;
};

export function setServerModelSettings(settings: AppModelSettings): void {
  globalForModelSettings.aiTownServerModelSettings = settings;
}

export function getServerModelSettings(): AppModelSettings {
  return globalForModelSettings.aiTownServerModelSettings || DEFAULT_MODEL_SETTINGS;
}

/**
 * 加载配置（客户端优先读取 localStorage，服务端读取内存缓存或默认值）
 */
export function loadModelSettings(): AppModelSettings {
  if (typeof window === 'undefined') {
    return getServerModelSettings();
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return DEFAULT_MODEL_SETTINGS;
    }
    const parsed = JSON.parse(raw) as Partial<AppModelSettings>;
    return {
      llm: {
        ...DEFAULT_MODEL_SETTINGS.llm,
        ...(parsed.llm || {}),
      },
      jev: {
        ...DEFAULT_MODEL_SETTINGS.jev,
        ...(parsed.jev || {}),
      },
    };
  } catch (err) {
    console.error('Failed to parse model settings from localStorage:', err);
    return DEFAULT_MODEL_SETTINGS;
  }
}

/**
 * 保存配置至 localStorage 并分发全局事件，同时同步至服务端
 */
export function saveModelSettings(settings: AppModelSettings): void {
  if (typeof window === 'undefined') {
    setServerModelSettings(settings);
    return;
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    window.dispatchEvent(new CustomEvent(SETTINGS_CHANGE_EVENT, { detail: settings }));

    // 同步给服务端 Node.js 运行时
    fetch('/api/model/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    }).catch(() => {
      // 忽略同步网络异常
    });
  } catch (err) {
    console.error('Failed to save model settings to localStorage:', err);
  }
}

/**
 * 重置配置为系统默认配置
 */
export function resetModelSettings(): AppModelSettings {
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(STORAGE_KEY);
      window.dispatchEvent(new CustomEvent(SETTINGS_CHANGE_EVENT, { detail: DEFAULT_MODEL_SETTINGS }));
      fetch('/api/model/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(DEFAULT_MODEL_SETTINGS),
      }).catch(() => {});
    } catch (err) {
      console.error('Failed to reset model settings in localStorage:', err);
    }
  } else {
    setServerModelSettings(DEFAULT_MODEL_SETTINGS);
  }
  return DEFAULT_MODEL_SETTINGS;
}
