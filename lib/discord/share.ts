import { getContent } from "@/lib/cms";

// The share copy, in one place so the website's share button and the bot's
// `/cluster share` say exactly the same thing. Editable from the CMS without a
// deploy (`share.profile.message`, and `@ar` for Arabic).
//
// The ask matters: "vote for me" is what turns a shared link into a vote on the
// Best Profile board, which is what makes sharing worth doing.
export const SHARE_KEY = "share.profile.message";
export const SHARE_DEFAULT = "Check out my profile on Cluster — and vote for me";

export async function shareCopy(locale?: "en" | "ar"): Promise<string> {
  try {
    const c = await getContent([SHARE_KEY], locale);
    return c[SHARE_KEY]?.trim() || SHARE_DEFAULT;
  } catch {
    return SHARE_DEFAULT;
  }
}

// `{name}` and `{url}` are substituted so staff can rewrite the sentence
// entirely and still keep the link.
export async function shareMessage(name: string, url: string, locale?: "en" | "ar"): Promise<string> {
  const raw = await shareCopy(locale);
  const withVars = raw.includes("{url}")
    ? raw.replace(/\{name\}/g, name).replace(/\{url\}/g, url)
    : `${raw.replace(/\{name\}/g, name)}\n${url}`;
  return withVars.slice(0, 1900);
}
