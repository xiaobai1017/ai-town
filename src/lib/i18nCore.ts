/**
 * 国际化多语言纯逻辑核心（无 React 依赖，支持服务端与客户端通用）
 * @author hubin
 */

import { zh } from '@/locales/zh';
import { en } from '@/locales/en';

export type Language = 'zh' | 'en';

export const LANGUAGE_STORAGE_KEY = 'ai_town_language';
export const LANGUAGE_CHANGE_EVENT = 'ai_town_language_changed';

export const dictionaries = { zh, en };

const globalForI18n = globalThis as typeof globalThis & {
  aiTownLanguage?: Language;
};

/**
 * 获取当前语言（默认为中文 'zh'）
 */
export function getLanguage(): Language {
  if (typeof window !== 'undefined') {
    try {
      const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY) as Language | null;
      if (saved === 'zh' || saved === 'en') {
        return saved;
      }
    } catch {}
  }
  return globalForI18n.aiTownLanguage || 'zh';
}

/**
 * 设置语言并持久化与广播
 */
export function setLanguage(lang: Language): void {
  globalForI18n.aiTownLanguage = lang;
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
      window.dispatchEvent(new CustomEvent(LANGUAGE_CHANGE_EVENT, { detail: lang }));
    } catch {}
  }
}

/**
 * 字典翻译查找函数
 * @param path 形如 'header.title' 或 'building.Restaurant'
 * @param params 插值替换对象，如 { day: 1 }
 * @param lang 指定语言，默认取当前语言
 */
export function t(path: string, params?: Record<string, string | number>, lang?: Language): string {
  const currentLang = lang || getLanguage();
  const dict = dictionaries[currentLang] || dictionaries.zh;

  const parts = path.split('.');
  let current: any = dict;

  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = current[part];
    } else {
      // 降级尝试中文
      let fallback: any = dictionaries.zh;
      for (const fPart of parts) {
        if (fallback && typeof fallback === 'object' && fPart in fallback) {
          fallback = fallback[fPart];
        } else {
          fallback = null;
          break;
        }
      }
      current = fallback ?? path;
      break;
    }
  }

  if (typeof current !== 'string') {
    return path;
  }

  if (params) {
    return Object.entries(params).reduce((str, [k, v]) => {
      return str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }, current);
  }

  return current;
}
