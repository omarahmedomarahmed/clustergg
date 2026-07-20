import type { Locale } from "./locale";

// UI string dictionary for hard-coded chrome (nav, footer, buttons, common
// labels). Arabic overlays English; a missing Arabic key falls back to English
// so nothing is ever blank. This is the seed set — extend it wave by wave; the
// admin can also override any string via the Language page (future work).

export const STRINGS = {
  en: {
    "nav.home": "Home",
    "nav.planets": "Planets",
    "nav.allPlanets": "All planets",
    "nav.quests": "Quests",
    "nav.ranks": "Ranks",
    "nav.leaderboards": "Leaderboards",
    "nav.messages": "Messages",
    "nav.you": "You",
    "nav.login": "Log in",
    "nav.signIn": "Sign in with",
    "nav.myProfile": "My profile",
    "nav.customize": "Customize profile",
    "nav.signOut": "Sign out",
    "nav.join": "Join the Cluster",
    "common.notifications": "Notifications",
    "common.markAllRead": "Mark all read",
    "common.seeAll": "See all",
    "common.search": "Search",
    "common.save": "Save",
    "common.loading": "Loading…",
  },
  ar: {
    "nav.home": "الرئيسية",
    "nav.planets": "الكواكب",
    "nav.allPlanets": "كل الكواكب",
    "nav.quests": "المهام",
    "nav.ranks": "التصنيفات",
    "nav.leaderboards": "لوحات الصدارة",
    "nav.messages": "الرسائل",
    "nav.you": "حسابك",
    "nav.login": "تسجيل الدخول",
    "nav.signIn": "سجّل الدخول عبر",
    "nav.myProfile": "ملفي الشخصي",
    "nav.customize": "تخصيص الملف",
    "nav.signOut": "تسجيل الخروج",
    "nav.join": "انضم إلى كلاستر",
    "common.notifications": "الإشعارات",
    "common.markAllRead": "تحديد الكل كمقروء",
    "common.seeAll": "عرض الكل",
    "common.search": "بحث",
    "common.save": "حفظ",
    "common.loading": "جارٍ التحميل…",
  },
} as const;

export type StringKey = keyof typeof STRINGS["en"];

export function t(locale: Locale, key: StringKey): string {
  return (STRINGS[locale] as Record<string, string>)[key] || STRINGS.en[key] || key;
}
