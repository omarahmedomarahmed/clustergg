"use client";

import { createContext, useContext } from "react";
import { t as translate, type StringKey } from "@/lib/i18n/strings";
import type { Locale } from "@/lib/i18n/locale";

const Ctx = createContext<Locale>("en");

// Seeds the active locale from the server so client chrome can translate with
// useT() without prop-drilling.
export function LocaleProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <Ctx.Provider value={locale}>{children}</Ctx.Provider>;
}

export function useLocale(): Locale {
  return useContext(Ctx);
}
export function useT(): (key: StringKey) => string {
  const locale = useContext(Ctx);
  return (key: StringKey) => translate(locale, key);
}
