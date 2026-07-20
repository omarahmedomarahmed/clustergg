import type { Locale } from "./locale";

// Two ways to reference a UI string:
//  • t("nav.home")  — stable dotted keys for chrome (built-in en + ar below).
//  • tr("Live Challenges") — the ENGLISH TEXT is the key. Built-in Arabic (when
//    provided) lives in AR_TEXT; every wrapped string is registered in
//    PAGE_STRINGS so the admin can edit BOTH its English and Arabic.
//
// Admin overrides (ui.overrides.en / ui.overrides.ar maps, passed in as `ov`)
// win over everything, so every word on every page is editable in both langs.

export const STRINGS = {
  en: {
    "nav.home": "Home", "nav.planets": "Planets", "nav.allPlanets": "All planets",
    "nav.quests": "Quests", "nav.ranks": "Ranks", "nav.leaderboards": "Leaderboards",
    "nav.messages": "Messages", "nav.you": "You", "nav.login": "Log in",
    "nav.signIn": "Sign in with", "nav.myProfile": "My profile", "nav.customize": "Customize profile",
    "nav.signOut": "Sign out", "nav.join": "Join the Cluster",
    "common.notifications": "Notifications", "common.markAllRead": "Mark all read",
    "common.seeAll": "See all", "common.search": "Search", "common.save": "Save",
    "common.saving": "Saving…", "common.saved": "Saved", "common.cancel": "Cancel",
    "common.close": "Close", "common.edit": "Edit", "common.delete": "Delete",
    "common.loading": "Loading…", "common.viewProfile": "View live profile",
    "common.findGamers": "Find gamers", "common.connectGame": "Connect a game",
    "common.explorePlanets": "Explore planets", "common.live": "Live", "common.ended": "Ended",
    "common.endsIn": "Ends in", "common.prize": "Prize", "common.howToWin": "How to win",
    "common.topStandings": "Top standings", "common.caughtUp": "You're all caught up.",
    "footer.product": "Product", "footer.company": "Company", "footer.legal": "Legal",
    "footer.about": "About", "footer.contact": "Contact", "footer.privacy": "Privacy",
    "footer.terms": "Terms", "footer.cookies": "Cookies", "footer.rights": "All rights reserved.",
    "feed.explore": "Explore planets & quests", "feed.liveChallenges": "Live challenges",
    "feed.yourFeed": "Your feed", "feed.myPlanets": "My planets", "feed.tapGame": "Tap a game to explore its planet",
    "planets.title": "The Game Galaxy", "planets.explore": "Explore the planet",
    "leaderboards.title": "Leaderboards", "quests.title": "Quests", "quests.allQuests": "All quests",
    "challenges.title": "Live Challenges", "challenges.join": "Join challenge", "challenges.fullPage": "Full challenge page",
    "profile.yourProfile": "Your profile", "profile.customizeTab": "Customize", "profile.accountsTab": "Game accounts",
    "profile.flagLanguage": "Flag & language", "profile.countryFlag": "Country flag", "profile.language": "Language",
  },
  ar: {
    "nav.home": "الرئيسية", "nav.planets": "الكواكب", "nav.allPlanets": "كل الكواكب",
    "nav.quests": "المهام", "nav.ranks": "التصنيفات", "nav.leaderboards": "لوحات الصدارة",
    "nav.messages": "الرسائل", "nav.you": "حسابك", "nav.login": "تسجيل الدخول",
    "nav.signIn": "سجّل الدخول عبر", "nav.myProfile": "ملفي الشخصي", "nav.customize": "تخصيص الملف",
    "nav.signOut": "تسجيل الخروج", "nav.join": "انضم إلى كلاستر",
    "common.notifications": "الإشعارات", "common.markAllRead": "تحديد الكل كمقروء",
    "common.seeAll": "عرض الكل", "common.search": "بحث", "common.save": "حفظ",
    "common.saving": "جارٍ الحفظ…", "common.saved": "تم الحفظ", "common.cancel": "إلغاء",
    "common.close": "إغلاق", "common.edit": "تعديل", "common.delete": "حذف",
    "common.loading": "جارٍ التحميل…", "common.viewProfile": "عرض الملف المباشر",
    "common.findGamers": "ابحث عن لاعبين", "common.connectGame": "اربط لعبة",
    "common.explorePlanets": "استكشف الكواكب", "common.live": "مباشر", "common.ended": "انتهى",
    "common.endsIn": "ينتهي خلال", "common.prize": "الجائزة", "common.howToWin": "كيف تفوز",
    "common.topStandings": "أفضل الترتيب", "common.caughtUp": "لا يوجد جديد.",
    "footer.product": "المنتج", "footer.company": "الشركة", "footer.legal": "قانوني",
    "footer.about": "من نحن", "footer.contact": "تواصل معنا", "footer.privacy": "الخصوصية",
    "footer.terms": "الشروط", "footer.cookies": "ملفات الارتباط", "footer.rights": "جميع الحقوق محفوظة.",
    "feed.explore": "استكشف الكواكب والمهام", "feed.liveChallenges": "التحديات المباشرة",
    "feed.yourFeed": "خلاصتك", "feed.myPlanets": "كواكبي", "feed.tapGame": "اضغط على لعبة لاستكشاف كوكبها",
    "planets.title": "مجرّة الألعاب", "planets.explore": "استكشف الكوكب",
    "leaderboards.title": "لوحات الصدارة", "quests.title": "المهام", "quests.allQuests": "كل المهام",
    "challenges.title": "التحديات المباشرة", "challenges.join": "انضم إلى التحدي", "challenges.fullPage": "صفحة التحدي كاملة",
    "profile.yourProfile": "ملفك الشخصي", "profile.customizeTab": "تخصيص", "profile.accountsTab": "حسابات الألعاب",
    "profile.flagLanguage": "العلم واللغة", "profile.countryFlag": "علم الدولة", "profile.language": "اللغة",
  },
} as const;

export type StringKey = keyof typeof STRINGS["en"];
export const STRING_KEYS = Object.keys(STRINGS.en) as StringKey[];

// Built-in Arabic for tr() strings, keyed by the exact English text.
export const AR_TEXT: Record<string, string> = {
  // Planets
  "The Game Galaxy": "مجرّة الألعاب",
  "Every world we track — pick yours and claim your standing.": "كل عالم نتتبعه — اختر عالمك وثبّت مكانتك.",
  "All planets": "كل الكواكب",
  "Explore the planet": "استكشف الكوكب",
  "Full →": "المزيد →",
  // Quests
  "Quests": "المهام",
  "All quests": "كل المهام",
  "Chart your quests": "خطط مهامك",
  "Your Cluster Points": "نقاط كلاستر الخاصة بك",
  "Total CP": "إجمالي النقاط",
  // Challenges
  "Live Challenges": "التحديات المباشرة",
  "Join challenge": "انضم إلى التحدي",
  "How to win": "كيف تفوز",
  "Prize": "الجائزة",
  "Top standings": "أفضل الترتيب",
  "No competitors yet — be the first to join.": "لا يوجد متنافسون بعد — كن أول من ينضم.",
  "Full challenge page": "صفحة التحدي كاملة",
  "Ended": "انتهى",
  "Live now": "مباشر الآن",
  // Notifications
  "Notifications": "الإشعارات",
  "Mark all read": "تحديد الكل كمقروء",
  "You're all caught up.": "لا يوجد جديد.",
  "No notifications yet.": "لا توجد إشعارات بعد.",
  // Profile
  "Your profile": "ملفك الشخصي",
  "Make this page yours, then connect your games.": "خصّص هذه الصفحة ثم اربط ألعابك.",
  "View live profile": "عرض الملف المباشر",
  "Customize": "تخصيص",
  "Game accounts": "حسابات الألعاب",
  "Your game accounts": "حسابات ألعابك",
  "Followers": "المتابعون",
  "Following": "يتابع",
  "views": "مشاهدات",
  // Common
  "See all": "عرض الكل",
  "Save": "حفظ",
  "Save changes": "حفظ التغييرات",
  "Loading…": "جارٍ التحميل…",
};

// Registry of editable page strings, grouped by page, for the admin editor.
export const PAGE_STRINGS: { page: string; strings: string[] }[] = [
  { page: "Planets", strings: ["The Game Galaxy", "Every world we track — pick yours and claim your standing.", "All planets", "Explore the planet", "Full →"] },
  { page: "Quests", strings: ["Quests", "All quests", "Chart your quests", "Your Cluster Points", "Total CP"] },
  { page: "Challenges", strings: ["Live Challenges", "Join challenge", "How to win", "Prize", "Top standings", "No competitors yet — be the first to join.", "Full challenge page", "Ended", "Live now"] },
  { page: "Notifications", strings: ["Notifications", "Mark all read", "You're all caught up.", "No notifications yet."] },
  { page: "Profile", strings: ["Your profile", "Make this page yours, then connect your games.", "View live profile", "Customize", "Game accounts", "Your game accounts"] },
  { page: "Public profile", strings: ["Followers", "Following", "views"] },
];

// t(): dotted-key lookup for chrome.
export function t(locale: Locale, key: StringKey, ov?: Record<string, string> | null): string {
  const o = ov?.[key]; if (o) return o;
  return (STRINGS[locale] as Record<string, string>)[key] || STRINGS.en[key] || key;
}

// tr(): English-text-as-key lookup for page bodies. Admin override wins; then the
// built-in Arabic (ar only); else the original English.
export function tr(locale: Locale, text: string, ov?: Record<string, string> | null): string {
  const o = ov?.[text]; if (o) return o;
  if (locale === "ar") return AR_TEXT[text] || text;
  return text;
}
