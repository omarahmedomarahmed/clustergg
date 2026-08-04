import Icon from "@/components/Icon";

/**
 * A Cluster Points amount, written the way money is written.
 *
 * ```tsx
 * <Cp amount={4120} />              // 🪙 4,120
 * <Cp amount={500} size="sm" />
 * <Cp amount={-250} />              // a spend, in the negative tone
 * ```
 *
 * **The coin goes before the number, like a currency symbol, and the word "CP"
 * does not appear.** That is the entire point of this component. A balance
 * written "4,120 CP" reads as a score with a unit on it; "🪙 4,120" reads as
 * money, and CP is money — it buys trophies that redeem for dollars.
 *
 * The word survives in *prose* that explains what Cluster Points are, because a
 * currency symbol nobody has ever had named for them is a puzzle. What it must
 * never be again is a unit suffix stuck on the end of a figure.
 *
 * The mark is the admin's uploaded coin when one is set (`brand.cpIcon`, via the
 * `--cp-icon` CSS variable on `<body>`), and the built-in `cpCoin` glyph
 * otherwise. Both, layered — so the coin is never missing, and an admin who
 * uploads one gets it everywhere without a deploy.
 */
export default function Cp({
  amount,
  size = "md",
  className = "",
  /** Show a leading `+` on a credit. Off by default — a balance is not a change. */
  signed = false,
  /** Muted styling, for a figure that is context rather than the subject. */
  muted = false,
}: {
  amount: number;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
  signed?: boolean;
  muted?: boolean;
}) {
  const px = { xs: 11, sm: 13, md: 16, lg: 22, xl: 30 }[size];
  const text = { xs: "text-[11px]", sm: "text-xs", md: "text-sm", lg: "text-lg", xl: "text-3xl" }[size];
  const spend = amount < 0;
  const shown = Math.abs(amount).toLocaleString("en-US");
  const sign = spend ? "−" : signed ? "+" : "";
  return (
    <span
      className={`inline-flex items-center gap-1 font-bold tabular-nums align-middle ${text} ${
        muted ? "text-muted" : spend ? "text-rose-300" : ""
      } ${className}`}
      // The figure alone is meaningless to a screen reader once the word is gone
      // from the visible text, so the accessible name puts it back.
      title={`${sign}${shown} Cluster Points`}
    >
      <CpMark size={px} />
      <span aria-hidden>{sign}{shown}</span>
      <span className="sr-only">{sign}{shown} Cluster Points</span>
    </span>
  );
}

/**
 * The coin on its own, for a label or a header that needs the mark without a
 * figure beside it.
 *
 * Two layers on purpose. The built-in glyph is always drawn; an admin's uploaded
 * art is painted over it when `--cp-icon` is set. Before this, `CpIcon` rendered
 * only the uploaded image — so on any install where nobody had uploaded one, the
 * currency had no mark at all and every `<Cp>` would have been a bare number.
 */
export function CpMark({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <span className={`relative inline-block shrink-0 align-[-0.15em] ${className}`} style={{ width: size, height: size }}>
      <Icon name="cpCoin" size={size} className="absolute inset-0 text-amber-300" />
      <span
        aria-hidden
        className="absolute inset-0 bg-contain bg-center bg-no-repeat"
        style={{ backgroundImage: "var(--cp-icon)" }}
      />
    </span>
  );
}
