// `/settings/profile` — the profile builder. `13-DESIGN` §5, `14-EDITABLE` §5.
//
// ===== E19 — THE PREVIEW IS THEIR OWN PAGE, NOT AN ABSTRACT FORM =====
//
// The preview below renders `ProfileView` — **the same component `/u/[slug]`
// renders** — with their real trophies, their real entries and their real
// linked accounts. Not a swatch, not a mock, not a list of the values they
// chose.
//
// That is the same rule as `14-EDITABLE` E8 one audience along, and for the
// same reason: a preview drawn by a second implementation agrees with the page
// until the day it does not, and the day it does not is the day somebody
// publishes something they never saw.
//
// ===== D16/E18 — EVERY FIELD DEGRADES =====
//
// Nothing on this form is required and no combination of answers can produce a
// broken page. `resolveTheme` bounds every value on the way in and again on the
// way out, so the worst a gamer can do to themselves is choose something they
// do not like — which they can undo with the button at the bottom.

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "../../../lib/db/index.ts";
import { currentGamer } from "../../../lib/auth/current.ts";
import { profileBySlug } from "../../../lib/site/queries.ts";
import { themeFor } from "../../../lib/profile/store.ts";
import {
  AVATAR_SHAPES,
  CURSOR_KEYS,
  FONTS,
  SECTIONS,
  TEMPLATES,
} from "../../../lib/profile/theme.ts";
import { ProfileView, type ProfileSections } from "../../u/[slug]/profile-view.tsx";

export const dynamic = "force-dynamic";

const FIELD =
  "rounded-md border border-line bg-ink px-3 py-1.5 text-sm outline-none focus:border-white/30";
const SWATCH = "h-9 w-16 rounded-md border border-line bg-ink";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-mute">{label}</span>
      {children}
    </label>
  );
}

export default async function ProfileBuilder({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const str = (k: string) => (typeof query[k] === "string" ? (query[k] as string) : null);

  const gamer = await currentGamer();
  if (!gamer) redirect("/login?next=/settings/profile");

  const db = await getDb();
  const theme = await themeFor(db, gamer.id);

  // Their real page's data, so the preview is their page rather than a picture
  // of a page. An empty profile previews as an empty profile, which is exactly
  // what a new gamer needs to see before they start decorating it.
  const found = await profileBySlug(gamer.slug);
  const accounts = await db
    .select({
      provider: schema.linkedGameAccounts.provider,
      handle: schema.linkedGameAccounts.inGameName,
    })
    .from(schema.linkedGameAccounts)
    .where(eq(schema.linkedGameAccounts.userId, gamer.id));

  const data: ProfileSections = {
    accounts: accounts
      .filter((a) => a.handle)
      .map((a) => ({ provider: a.provider, handle: a.handle as string })),
    trophies: (found?.holdings ?? []).map(({ holding, trophy }) => ({
      id: trophy.id,
      name: trophy.name,
      valueCents: trophy.valueCents,
      redeemed: holding.redeemedAt !== null,
    })),
    challenges: (found?.entries ?? []).map(({ participant, challenge }) => ({
      id: challenge.id,
      title: challenge.title,
      placement: participant.placement,
    })),
    standings: (found?.entries ?? [])
      .filter((e) => e.participant.placement !== null || e.participant.frozenScore !== null)
      .map(({ participant, challenge }) => ({
        title: challenge.title,
        placement: participant.placement,
        points: participant.frozenScore ?? 0,
      })),
    // Rank history needs a provider read per challenge and the builder is a
    // form somebody is typing into. The section still previews — with its real
    // empty state, which is what most gamers will see on it anyway.
    rank: [],
  };

  const { saveProfileThemeAction, resetProfileThemeAction } = await import("./actions.ts");

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-12">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Your profile</h1>
        <p className="mt-1 text-sm text-mute">
          Everything here changes your public page at{" "}
          <code className="text-xs">/u/{gamer.slug}</code>. Nothing here can break it.
        </p>
      </div>

      {str("error") ? (
        <p className="rounded-lg border border-line bg-ink px-4 py-3 text-sm" data-testid="theme-error">
          {str("error")}
        </p>
      ) : null}
      {str("saved") ? (
        <p className="rounded-lg border border-line bg-ink px-4 py-3 text-sm text-mute" data-testid="theme-saved">
          Saved. Your page looks like the preview.
        </p>
      ) : null}
      {str("reset") ? (
        <p className="rounded-lg border border-line bg-ink px-4 py-3 text-sm text-mute" data-testid="theme-reset">
          Back to the default look.
        </p>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <form
          action={saveProfileThemeAction}
          encType="multipart/form-data"
          className="flex flex-col gap-5"
          data-testid="theme-form"
        >
          <fieldset className="flex flex-col gap-3">
            <legend className="text-sm font-medium">Start from</legend>
            <Field label="Template">
              <select name="template" defaultValue={theme.template} className={FIELD} data-testid="theme-template">
                {TEMPLATES.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.name}
                  </option>
                ))}
              </select>
            </Field>
          </fieldset>

          <fieldset className="flex flex-col gap-3">
            <legend className="text-sm font-medium">Page</legend>
            <div className="flex flex-wrap gap-3">
              <Field label="Background">
                <input type="color" name="bg" defaultValue={theme.bg} className={SWATCH} />
              </Field>
              <Field label="Cards">
                <input type="color" name="panel" defaultValue={theme.panel} className={SWATCH} />
              </Field>
              <Field label="Text">
                <input type="color" name="text" defaultValue={theme.text} className={SWATCH} />
              </Field>
              <Field label="Muted">
                <input type="color" name="muted" defaultValue={theme.muted} className={SWATCH} />
              </Field>
            </div>
            <Field label="Background image">
              <input type="file" name="bgFile" accept="image/*" className="text-xs text-mute" data-testid="theme-bg-file" />
            </Field>
            <div className="flex flex-wrap gap-3">
              <Field label="Blur (0–20px)">
                <input type="number" name="bgBlur" min={0} max={20} defaultValue={theme.bgBlur} className={FIELD} />
              </Field>
              <Field label="Darken (0–90%)">
                <input
                  type="number"
                  name="bgOverlay"
                  min={0}
                  max={90}
                  defaultValue={theme.bgOverlay}
                  className={FIELD}
                  data-testid="theme-bg-overlay"
                />
              </Field>
              {theme.bgImage ? (
                <label className="flex items-center gap-2 self-end text-sm">
                  <input type="checkbox" name="clearBg" />
                  <span className="text-mute">Remove it</span>
                </label>
              ) : null}
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-3">
            <legend className="text-sm font-medium">Cover and avatar</legend>
            <Field label="Cover image">
              <input type="file" name="coverFile" accept="image/*" className="text-xs text-mute" />
            </Field>
            <div className="flex flex-wrap gap-3">
              <Field label="Cover height">
                <input type="number" name="coverHeight" min={0} max={480} defaultValue={theme.coverHeight} className={FIELD} />
              </Field>
              <Field label="Cover darken">
                <input type="number" name="coverOverlay" min={0} max={90} defaultValue={theme.coverOverlay} className={FIELD} />
              </Field>
              {theme.coverUrl ? (
                <label className="flex items-center gap-2 self-end text-sm">
                  <input type="checkbox" name="clearCover" />
                  <span className="text-mute">Remove it</span>
                </label>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-3">
              <Field label="Avatar shape">
                <select name="avatarShape" defaultValue={theme.avatarShape} className={FIELD} data-testid="theme-avatar-shape">
                  {AVATAR_SHAPES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Avatar size">
                <input type="number" name="avatarSize" min={48} max={240} defaultValue={theme.avatarSize} className={FIELD} />
              </Field>
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-3">
            <legend className="text-sm font-medium">Style</legend>
            <div className="flex flex-wrap gap-3">
              <Field label="Accent">
                <input type="color" name="accent" defaultValue={theme.accent} className={SWATCH} data-testid="theme-accent" />
              </Field>
              <Field label="Second accent">
                <input type="color" name="accent2" defaultValue={theme.accent2} className={SWATCH} />
              </Field>
              <Field label="Corner radius">
                <input type="number" name="radius" min={0} max={40} defaultValue={theme.radius} className={FIELD} />
              </Field>
            </div>
            <div className="flex flex-wrap gap-3">
              <Field label="Cards">
                <select name="cardStyle" defaultValue={theme.cardStyle} className={FIELD} data-testid="theme-card-style">
                  {["glass", "solid", "outline", "flat"].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Buttons">
                <select name="buttonStyle" defaultValue={theme.buttonStyle} className={FIELD}>
                  {["neon", "solid", "outline", "glass", "pill"].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Font">
                <select name="font" defaultValue={theme.font} className={FIELD}>
                  {Object.keys(FONTS).map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="flex flex-wrap gap-3">
              <Field label="Cursor">
                <select name="cursor" defaultValue={theme.cursor} className={FIELD}>
                  {CURSOR_KEYS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Cursor tint">
                <input type="color" name="cursorColor" defaultValue={theme.cursorColor} className={SWATCH} />
              </Field>
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-3">
            <legend className="text-sm font-medium">Sections</legend>
            <div className="flex flex-col gap-1.5">
              {SECTIONS.map((s) => (
                <label key={s.key} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name={`section:${s.key}`}
                    defaultChecked={theme.sections[s.key] !== false}
                    data-testid={`theme-section-${s.key}`}
                  />
                  <span>{s.label}</span>
                </label>
              ))}
            </div>
            <Field label="Order (keys, in the order you want them)">
              <input name="order" defaultValue={theme.order.join(" ")} className={FIELD} data-testid="theme-order" />
            </Field>
          </fieldset>

          <div className="flex gap-3">
            <button
              type="submit"
              className="rounded-md border border-line px-4 py-2 text-sm hover:bg-white/5"
              data-testid="theme-save"
            >
              Save
            </button>
          </div>
        </form>

        {/*
          E19 — their actual page. The same component `/u/[slug]` renders, with
          their real trophies and entries. A preview built from a second
          implementation agrees with the page until the day it does not, and
          that is the day somebody publishes something they never saw.
        */}
        <div>
          <p className="mb-2 text-xs text-mute">
            This is your page. It is the same component <code>/u/{gamer.slug}</code> renders.
          </p>
          <div
            className="overflow-hidden rounded-xl border border-line"
            data-testid="theme-preview"
          >
            <ProfileView
              theme={theme}
              displayName={found?.user.displayName ?? gamer.slug}
              slug={gamer.slug}
              data={data}
            />
          </div>
          <form action={resetProfileThemeAction} className="mt-3">
            <button
              type="submit"
              className="text-xs text-mute underline hover:text-white"
              data-testid="theme-reset-button"
            >
              Back to the default look
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
