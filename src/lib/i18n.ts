/**
 * 国际化多语言 React Hook 与客户端状态管理
 * @author hubin
 */
"use client";

import { useState, useEffect } from 'react';
import {
  Language,
  getLanguage,
  setLanguage,
  t,
  LANGUAGE_STORAGE_KEY,
  LANGUAGE_CHANGE_EVENT,
  dictionaries,
} from './i18nCore';

export * from './i18nCore';

/**
 * React 国际化 Hook
 */
export function useI18n() {
  const [lang, setLangState] = useState<Language>(getLanguage());

  useEffect(() => {
    const handleLanguageChange = (e: Event) => {
      const customEvent = e as CustomEvent<Language>;
      if (customEvent.detail) {
        setLangState(customEvent.detail);
      } else {
        setLangState(getLanguage());
      }
    };

    window.addEventListener(LANGUAGE_CHANGE_EVENT, handleLanguageChange);
    return () => {
      window.removeEventListener(LANGUAGE_CHANGE_EVENT, handleLanguageChange);
    };
  }, []);

  const changeLanguage = (newLang: Language) => {
    setLanguage(newLang);
    setLangState(newLang);
  };

  const translate = (path: string, params?: Record<string, string | number>) => {
    return t(path, params, lang);
  };

  return {
    language: lang,
    isZh: lang === 'zh',
    setLanguage: changeLanguage,
    t: translate,
  };
}
