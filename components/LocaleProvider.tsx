"use client";

import { createContext, useContext } from "react";
import { t as translate, tr as translateText, type StringKey } from "@/lib/i18n/strings";
import type { Locale } from "@/lib/i18n/locale";

type Ctx = { locale: Locale; overrides: Record<string, string> };
const LocaleCtx = createContext<Ctx>({ locale: "en", overrides: {} });

// Seeds the active locale + admin string overrides from the server so client
// chrome can translate with useT()/useTr() without prop-drilling.
export function LocaleProvider({ locale, overrides = {}, children }: { locale: Locale; overrides?: Record<string, string>; children: React.ReactNode }) {
  return <LocaleCtx.Provider value={{ locale, overrides }}>{children}</LocaleCtx.Provider>;
}

export function useLocale(): Locale {
  return useContext(LocaleCtx).locale;
}
// Dotted-key translator (chrome).
export function useT(): (key: StringKey) => string {
  const { locale, overrides } = useContext(LocaleCtx);
  return (key: StringKey) => translate(locale, key, overrides);
}
// English-text-as-key translator (page bodies). Every wrapped string is editable
// (both languages) from Admin → Language.
export function useTr(): (text: string) => string {
  const { locale, overrides } = useContext(LocaleCtx);
  return (text: string) => translateText(locale, text, overrides);
}
