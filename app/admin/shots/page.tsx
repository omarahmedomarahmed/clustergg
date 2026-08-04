import { requireSystemFor } from "@/lib/departments";
import { allShots } from "@/lib/shots-data";
import { SHOT_GROUPS } from "@/lib/shots";
import ShotEditor, { type EditableShot } from "@/components/ShotEditor";
import Icon from "@/components/Icon";
import FeatureShot from "@/components/FeatureShot";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Screenshots" };

/**
 * Every screenshot on the site, in one place, all of them replaceable.
 *
 * The promise this console makes: **there is no image anywhere on this product
 * that an admin cannot replace, and no caption they cannot rewrite.** A shot
 * that was captured before its artwork existed, or before the copy was
 * rewritten, is not a problem to escalate — it is one upload on this page.
 *
 * Keys with no image yet are listed exactly like the captured ones, because the
 * useful question is "what is missing" and a console that only lists what
 * already exists can never answer it.
 */
export default async function AdminShotsPage({ searchParams }: { searchParams: Promise<{ key?: string }> }) {
  await requireSystemFor("/admin/shots");
  const { key: focus } = await searchParams;
  const shots = await allShots();
  const captured = shots.filter((s) => s.imageUrl).length;

  const asEditable = (s: typeof shots[number]): EditableShot => ({
    key: s.key, imageUrl: s.imageUrl, altText: s.altText, caption: s.caption,
    claim: s.claim, capturedFrom: s.capturedFrom ?? s.def?.capturedFrom ?? null,
    capturedAt: s.capturedAt ? s.capturedAt.toISOString().slice(0, 10) : null,
  });

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Screenshots</h1>
      <p className="text-sm text-muted mb-6 max-w-3xl">
        One row per component worth proving. Every page that shows that component reads this row —
        so <b className="text-ink">changing an image here changes it everywhere the component appears</b>.
        The caption and the alt text live here too, because the picture is the evidence and the words are the claim it supports.
      </p>

      <div className="glass p-4 mb-6 flex flex-wrap items-center gap-6 text-sm">
        <div className="flex items-center gap-2">
          <Icon name="image" size={15} className="text-cyan-300" />
          <b className="text-ink">{captured}</b> of <b className="text-ink">{shots.length}</b> captured
        </div>
        <div className="text-muted">
          {shots.length - captured > 0
            ? `${shots.length - captured} still render a labelled placeholder on the page — visible, on purpose, so a missing screenshot cannot hide.`
            : "Every registered shot has an image."}
        </div>
      </div>

      {/* The component itself, live, so an admin can see exactly what a slot
          looks like on a page before they upload anything into one — including
          what the placeholder looks like when a shot is missing. */}
      <section className="glass p-4 mb-8">
        <h2 className="font-bold mb-1 text-sm">What a slot looks like on a page</h2>
        <p className="text-xs text-muted mb-3 max-w-2xl">
          This is a real <code className="text-cyan-300">&lt;FeatureShot&gt;</code>, reading a real row.
          Upload an image to <code className="text-cyan-300">admin.shots.console</code> below and this changes —
          along with every other page that claims the same component.
        </p>
        <div className="max-w-md">
          <FeatureShot shotKey="admin.shots.console" />
        </div>
      </section>

      {SHOT_GROUPS.map((g) => {
        const rows = shots.filter((s) => s.def?.group === g.key);
        if (!rows.length) return null;
        const done = rows.filter((r) => r.imageUrl).length;
        return (
          <section key={g.key} className="mb-8">
            <h2 className="font-bold mb-3 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-cyan-400" /> {g.label}
              <span className="text-xs font-normal text-muted">{done}/{rows.length}</span>
            </h2>
            <div className="space-y-2">
              {rows.map((s) => <ShotEditor key={s.key} shot={asEditable(s)} defaultOpen={focus === s.key} />)}
            </div>
          </section>
        );
      })}
    </div>
  );
}
