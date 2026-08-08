// BETA, on the logo. B90.6.
//
// It sits on the lockup rather than in a banner because a banner is dismissed
// once and never seen again, and what it is saying is true on every page: the
// prize money is real, the challenges are real, and some of the product is
// three weeks old. A gamer who knows that forgives a rough edge. One who finds
// out from the rough edge does not.
//
// Small, low-contrast and never a link. It is a statement of fact, not a
// promotion — and the day it comes off should be one deletion.

export default function BetaBadge({ size = "md" }: { size?: "sm" | "md" }) {
  return (
    <span
      className={`select-none rounded-full border border-cyan-300/35 bg-cyan-400/10 font-black uppercase tracking-[0.14em] text-cyan-200/90 ${
        size === "sm" ? "px-1.5 py-[1px] text-[8px]" : "px-2 py-0.5 text-[9px]"
      }`}
      title="Cluster is in beta. The money is real; some of the product is very new."
    >
      Beta
    </span>
  );
}
