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

  return (
    <figure className={`relative ${className}`} data-shot-key={shotKey}>
      <div
        className="relative overflow-hidden rounded-2xl border border-violet-400/20 bg-black/30"
        style={{ aspectRatio: shot.width && shot.height ? `${shot.width} / ${shot.height}` : ratio }}
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
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-violet-400/30 px-6 text-center">
            <Icon name="image" size={22} className="text-violet-300/70" />
            <div className="text-[11px] font-mono uppercase tracking-widest text-violet-300/70">{shotKey}</div>
            {shot.claim && <div className="max-w-sm text-xs text-muted">Screenshot pending — this space proves: “{shot.claim}”</div>}
            {staff && (
              <Link href={`/admin/shots?key=${encodeURIComponent(shotKey)}`}
                className="mt-1 rounded-full border border-violet-400/40 px-3 py-1 text-[11px] font-semibold text-violet-200 hover:border-cyan-400/60">
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
