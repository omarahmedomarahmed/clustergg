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
  "Explore": "استكشف",
  "Planets": "الكواكب",
  "Request a new planet": "اطلب كوكبًا جديدًا",
  "Each game has its own planet — leaderboards, challenges, players and a community feed, all in one world.": "لكل لعبة كوكبها الخاص — لوحات الصدارة والتحديات واللاعبون وخلاصة المجتمع، في عالم واحد.",
  "All planets": "كل الكواكب",
  "Explore the planet": "استكشف الكوكب",
  "Full →": "المزيد →",
  // Quests
  "Quests": "المهام",
  "All quests": "كل المهام",
  "Play the Cluster.": "العب في كلاستر.",
  "Earn your legend.": "اصنع أسطورتك.",
  "Each quest is a guided path across the galaxy. Tap a quest to open its map, track your Cluster Points, and see who's leading the way.": "كل مهمة هي مسار موجّه عبر المجرّة. اضغط على مهمة لفتح خريطتها وتتبّع نقاط كلاستر ومعرفة من يتصدّر.",
  "Sign in with Discord to start earning quest badges.": "سجّل الدخول عبر ديسكورد لبدء كسب أوسمة المهام.",
  "Your total Cluster Points": "إجمالي نقاط كلاستر لديك",
  "Quests are being forged — check back shortly.": "يجري إعداد المهام — تحقق قريبًا.",
  "Your complete CP history": "سجل نقاطك الكامل",
  // Challenges
  "Live Challenges": "التحديات المباشرة",
  "Live standings & scoring log": "الترتيب المباشر وسجل النقاط",
  "Prize pool": "مجموع الجوائز",
  "Winners display this trophy on their profile forever.": "يعرض الفائزون هذه الكأس على ملفهم للأبد.",
  "How scoring works": "كيف تُحتسب النقاط",
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
  "All quiet on the cosmic front.": "كل شيء هادئ في الكون.",
  // Profile
  "Your": "ملفك",
  "profile": "الشخصي",
  "Make this page yours, then connect your games.": "خصّص هذه الصفحة ثم اربط ألعابك.",
  "Everything saves to your public link.": "كل شيء يُحفظ في رابطك العام.",
  "View live profile": "عرض الملف المباشر",
  "Your game accounts": "حسابات ألعابك",
  "Followers": "المتابعون",
  "Following": "يتابع",
  "Follow": "متابعة",
  "views": "مشاهدات",
  // Leaderboards
  "Leaderboards": "لوحات الصدارة",
  "No leaderboards configured yet.": "لا توجد لوحات صدارة بعد.",
  "Galaxy": "المجرّة",
  "Real, API-verified rankings across every game. Pick a planet.": "تصنيفات حقيقية موثّقة عبر واجهات الألعاب لكل لعبة. اختر كوكبًا.",
  "leaderboards": "لوحات الصدارة",
  "Visit planet →": "زيارة الكوكب →",
  // Search
  "Scan the": "امسح",
  "galaxy": "المجرّة",
  "Search gamers, spaces, posts…": "ابحث عن لاعبين وكواكب ومنشورات…",
  "Gamers": "اللاعبون",
  "Posts": "المنشورات",
  "No gamers found.": "لم يُعثر على لاعبين.",
  "No planets found.": "لم يُعثر على كواكب.",
  "No posts found.": "لم يُعثر على منشورات.",
  // Messages
  "Messages": "الرسائل",
  "No transmissions yet. Visit a": "لا توجد رسائل بعد. زُر",
  "gamer's profile": "ملف لاعب",
  "and hit Message.": "واضغط على مراسلة.",
  "New conversation": "محادثة جديدة",
  "Transmit a message…": "أرسل رسالة…",
  "Send": "إرسال",
  // Settings
  "Account": "الحساب",
  "Email": "البريد الإلكتروني",
  "Member since": "عضو منذ",
  "Role": "الدور",
  "Danger zone": "منطقة الخطر",
  "Deleting your account removes your profile, linked accounts, posts and messages. This cannot be undone.": "حذف حسابك يزيل ملفك الشخصي والحسابات المرتبطة والمنشورات والرسائل. لا يمكن التراجع عن ذلك.",
  "Delete my account": "حذف حسابي",
  "Game accounts": "حسابات الألعاب",
  "Privacy": "الخصوصية",
  "Email digests": "ملخصات البريد الإلكتروني",
  "Challenge results, badge awards and moderation notices.": "نتائج التحديات وأوسمة الإنجاز وإشعارات الإشراف.",
  "In-app notifications for follows, badges and challenges are always on — they're how the galaxy talks to you.": "إشعارات التطبيق للمتابعات والأوسمة والتحديات مفعّلة دائمًا — فهي كيف تتحدث إليك المجرّة.",
  "Profile visibility": "ظهور الملف الشخصي",
  "Who can see": "من يمكنه رؤية",
  "Public — anyone with the link": "عام — أي شخص لديه الرابط",
  "Followers only": "المتابعون فقط",
  "Private — only me": "خاص — أنا فقط",
  "Who can message me": "من يمكنه مراسلتي",
  "Everyone": "الجميع",
  "Only people I follow": "الأشخاص الذين أتابعهم فقط",
  "Nobody": "لا أحد",
  // Common
  "See all": "عرض الكل",
  "Save": "حفظ",
  "Save changes": "حفظ التغييرات",
  "Loading…": "جارٍ التحميل…",
};

// Registry of editable page strings, grouped by page, for the admin editor.
export const PAGE_STRINGS: { page: string; strings: string[] }[] = [
  { page: "Planets", strings: ["Explore", "Planets", "Request a new planet", "Each game has its own planet — leaderboards, challenges, players and a community feed, all in one world."] },
  { page: "Quests", strings: ["Quests", "Play the Cluster.", "Earn your legend.", "Each quest is a guided path across the galaxy. Tap a quest to open its map, track your Cluster Points, and see who's leading the way.", "Sign in with Discord to start earning quest badges.", "Your total Cluster Points", "Quests are being forged — check back shortly.", "Your complete CP history"] },
  { page: "Challenges", strings: ["Live standings & scoring log", "Prize pool", "Winners display this trophy on their profile forever.", "How scoring works", "How to win", "Prize", "Top standings", "No competitors yet — be the first to join.", "Full challenge page", "Ended", "Live now"] },
  { page: "Notifications", strings: ["Notifications", "Mark all read", "All quiet on the cosmic front."] },
  { page: "Profile", strings: ["Your", "profile", "Make this page yours, then connect your games.", "Everything saves to your public link.", "View live profile", "Your game accounts"] },
  { page: "Public profile", strings: ["Follow", "Following", "views"] },
  { page: "Leaderboards", strings: ["Leaderboards", "No leaderboards configured yet.", "Galaxy", "Real, API-verified rankings across every game. Pick a planet.", "leaderboards", "Visit planet →"] },
  { page: "Search", strings: ["Scan the", "galaxy", "Search gamers, spaces, posts…", "Gamers", "Planets", "Posts", "No gamers found.", "No planets found.", "No posts found."] },
  { page: "Messages", strings: ["Messages", "No transmissions yet. Visit a", "gamer's profile", "and hit Message.", "New conversation", "Transmit a message…", "Send"] },
  { page: "Settings", strings: ["Account", "Email", "Member since", "Role", "Danger zone", "Deleting your account removes your profile, linked accounts, posts and messages. This cannot be undone.", "Delete my account", "Game accounts", "Notifications", "Privacy", "Email digests", "Challenge results, badge awards and moderation notices.", "In-app notifications for follows, badges and challenges are always on — they're how the galaxy talks to you.", "Profile visibility", "Who can see", "Public — anyone with the link", "Followers only", "Private — only me", "Who can message me", "Everyone", "Only people I follow", "Nobody", "Save"] },
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
