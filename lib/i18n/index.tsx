"use client";

/**
 * i18n 骨架 (§6.8)。首版只做中英两种界面文案。
 * 其余语言的界面可先上、回落到英文——这比用劣质翻译好。
 */
import { createContext, useContext, useMemo, type ReactNode } from "react";
import zh, { type Dict } from "./zh-CN";
import en from "./en";

export type Locale = "zh-CN" | "en";

const DICTS: Record<Locale, Dict> = { "zh-CN": zh, en };

/** 界面语言选项（§6.1 步骤 4）。未做界面文案的语言回落到英文。 */
export const LOCALE_OPTIONS: { value: Locale; label: string }[] = [
  { value: "zh-CN", label: "简体中文" },
  { value: "en", label: "English" },
];

/** 步骤 4 展示的完整语言列表；未翻译者回落 en（界面）。 */
export const UI_LANGUAGE_CHOICES: { value: string; label: string; locale: Locale }[] = [
  { value: "zh-CN", label: "简体中文", locale: "zh-CN" },
  { value: "en", label: "English", locale: "en" },
  { value: "ja", label: "日本語", locale: "en" },
  { value: "zh-TW", label: "繁體中文", locale: "zh-CN" },
  { value: "de", label: "Deutsch", locale: "en" },
  { value: "fr", label: "Français", locale: "en" },
];

export const SEARCH_LANGUAGE_CHOICES: { value: string; label: string }[] = [
  { value: "en", label: "English" },
  { value: "zh", label: "中文" },
  { value: "ja", label: "日本語" },
  { value: "de", label: "Deutsch" },
  { value: "fr", label: "Français" },
];

/** 把任意界面语言代码映射到已实现的 locale（回落英文）。 */
export function resolveLocale(uiLang: string | undefined): Locale {
  const found = UI_LANGUAGE_CHOICES.find((c) => c.value === uiLang);
  return found?.locale ?? "en";
}

const I18nContext = createContext<{ locale: Locale; t: Dict }>({
  locale: "zh-CN",
  t: zh,
});

export function I18nProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ locale, t: DICTS[locale] }), [locale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
