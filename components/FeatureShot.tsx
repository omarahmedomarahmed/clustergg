import Link from "next/link";
import Icon from "@/components/Icon";
import { getShot } from "@/lib/shots-data";
import { getCurrentUser, isStaff } from "@/lib/auth";
import { optImg } from "@/lib/img";

/**
 * A screenshot of a real feature, standing next to the claim it proves.
 *
 * ```tsx
 * <FeatureShot shotKey="server.earnings.ledger" />
 * ```
 *
 * The row behind the key holds the image, the caption and the alt text, so an
 * admin changing that one row changes this everywhere the component appears —
 * which is the requirement the whole system exists for.
 *
 * **An uncaptured shot renders a visible, labelled placeholder**, not nothing.
 * A missing screenshot should be obvious to whoever is looking at the page,
 * because the alternative is a marketing claim standing on its own with a gap
 * where its evidence was meant to be, and nobody notices a gap.
 *
 * A dead image URL degrades to that same placeholder rather than a broken-image
 * icon — handled in CSS-free fashion by the `onError` on the client shim below.
 */
export default async function FeatureShot({
  shotKey,
  /** Overrides the stored caption for this one placement. Rarely right — prefer editing the row. */
  caption,
  className = "",
  /** Reserve this aspect ratio before the image loads, so the page never shifts. */
  ratio = "16 / 9",
  priority = false,
}: {
  shotKey: string;
  caption?: string;
  className?: string;
  ratio?: string;
  priority?: boolean;
}) {
  const [shot, user] = await Promise.all([getShot(shotKey), getCurrentUser()]);
  const staff = isStaff(user);
  const text = caption ?? shot.caption;

  // ===== AN EMPTY SLOT IS INVISIBLE TO EVERYBODY BUT STAFF. G4 =====
  //
  // The placeholder is deliberately loud — dashed, labelled with the key, and
  // stating the claim it stands in for — and that is right for the person who
  // has to go and capture it. It was rendered to EVERYONE, so a signed-in gamer
  // opening /wallet read
  //
  //     GAMER.WALLET
  //     Screenshot pending — proves: "Your points, your trophies, what they
  //     are worth"
  //
  // twice, on the page that shows them their money. Internal tooling, in a
  // customer's face, on the surface where looking unfinished costs the most.
  //
  // Nothing is rendered rather than an empty frame: a bordered box with nothing
  // in it is still a hole in the page, and the slots are empty by design until
  // they are captured.
  if (!shot.imageUrl && !staff) return null;

  return (
    <figure className={`relative ${className}`} data-shot-key={shotKey}>
      {/* An EMPTY slot does not reserve a hero.
          `ratio` is what a real screenshot needs so the page does not shift when
          it loads. A placeholder needs none of that — it has nothing to shift —
          and reserving 16:9 for one pushed the whole wallet below the fold with
          a wall of nothing. Slots stay empty until V1.R by design, so the empty
          state has to be a state somebody can live with, not a hole. */}
      <div
        className={`relative overflow-hidden rounded-2xl border border-violet-400/20 bg-black/30 ${shot.imageUrl ? "" : "py-6"}`}
        style={shot.imageUrl ? { aspectRatio: shot.width && shot.height ? `${shot.width} / ${shot.height}` : ratio } : undefined}
      >
        {shot.imageUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={optImg(shot.imageUrl, 1600) ?? shot.imageUrl}
            alt={shot.altText || shot.claim || shotKey}
            loading={priority ? "eager" : "lazy"}
            className="h-full w-full object-cover object-top"
          />
        ) : (
          /* The placeholder. Deliberately loud: dashed, labelled with the key,
             and it states the claim it is standing in for — so anybody reading
             the page can see both that a picture is missing and exactly what it
             was supposed to show. */
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-2xl border-2 border-dashed border-violet-400/30 px-6 text-center">
            <Icon name="image" size={16} className="text-violet-300/70" />
            <div className="text-[11px] font-mono uppercase tracking-widest text-violet-300/70">{shotKey}</div>
            {shot.claim && <div className="text-xs text-muted">Screenshot pending — proves: “{shot.claim}”</div>}
            {staff && (
              <Link href={`/admin/shots?key=${encodeURIComponent(shotKey)}`}
                className="rounded-full border border-violet-400/40 px-3 py-0.5 text-[11px] font-semibold text-violet-200 hover:border-cyan-400/60">
                Upload it
              </Link>
            )}
          </div>
        )}

        {/* Staff get an edit affordance on a captured shot too — replace the
            image, rewrite the caption. Visitors never see it. */}
        {staff && shot.imageUrl && (
          <Link href={`/admin/shots?key=${encodeURIComponent(shotKey)}`}
            className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-semibold text-violet-200 opacity-0 transition-opacity hover:opacity-100 focus:opacity-100 group-hover:opacity-100"
            title={`Edit ${shotKey}`}>
            <Icon name="edit" size={11} /> Edit
          </Link>
        )}
      </div>

      {text && <figcaption className="mt-2 text-xs text-muted">{text}</figcaption>}
    </figure>
  );
}
