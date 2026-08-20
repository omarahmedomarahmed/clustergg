// Reading and writing a gamer's theme.
//
// Two functions and a fence. The fence is the point: `/u/[slug]` is a public
// page and a theme is a decoration on it, so a theme that cannot be read
// produces the default profile rather than a 500. D16/E18, one level up from
// the field-by-field degradation in `resolveTheme`.

import { eq } from "drizzle-orm";
import type { DB } from "../db/index.ts";
import { schema } from "../db/index.ts";
import { DEFAULT_THEME, resolveTheme, type ProfileTheme } from "./theme.ts";

/** One gamer's theme, resolved. Never throws, never null. */
export async function themeFor(db: DB, userId: string): Promise<ProfileTheme> {
  try {
    const [row] = await db
      .select({ theme: schema.profileThemes.theme })
      .from(schema.profileThemes)
      .where(eq(schema.profileThemes.userId, userId));
    return resolveTheme(row?.theme);
  } catch (e) {
    console.error("[profile] theme unreachable; rendering the default", e);
    return { ...DEFAULT_THEME };
  }
}

/**
 * Save a theme.
 *
 * Stored **resolved**, not raw. A blob that has been through `resolveTheme` has
 * no key that is not a real field, no colour that is not a colour and no URL
 * that could close a CSS rule — so the value in the database is one the page
 * can render, rather than one the page has to survive. It is resolved again on
 * read anyway, because a row written by an older deploy is exactly what D20 is
 * about.
 */
export async function saveTheme(db: DB, userId: string, raw: unknown): Promise<ProfileTheme> {
  const theme = resolveTheme(raw);
  const values = { userId, theme: theme as unknown as Record<string, unknown>, updatedAt: new Date() };
  await db
    .insert(schema.profileThemes)
    .values(values)
    .onConflictDoUpdate({
      target: schema.profileThemes.userId,
      set: { theme: values.theme, updatedAt: values.updatedAt },
    });
  return theme;
}
