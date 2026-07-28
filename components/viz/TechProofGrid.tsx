import Icon from "@/components/Icon";
import { techProof } from "@/lib/positioning";
import type { PricingConfig } from "@/lib/pricing";

// The engineering, for the call where somebody asks what we actually built.
//
// A brand never reads this. A technical diligence conversation opens with it,
// and until now the answer lived in a founder's head. Each claim is paired with
// a number that can be checked against the running product rather than an
// adjective.

const ICONS: Record<string, "grid" | "check" | "spark" | "rocket"> = {
  renderer: "grid",
  verify: "check",
  rotation: "spark",
  ops: "rocket",
};

export default function TechProofGrid({
  cfg, title, subtitle,
}: { cfg: PricingConfig; title?: string; subtitle?: string }) {
  const items = techProof(cfg);
  return (
    <div>
      {(title || subtitle) && (
        <div className="mx-auto mb-8 max-w-2xl text-center">
          {title && <h2 className="text-3xl md:text-4xl font-bold">{title}</h2>}
          {subtitle && <p className="mt-3 leading-relaxed text-muted">{subtitle}</p>}
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {items.map((t) => (
          <div key={t.key} className="glass rounded-3xl p-5 sm:p-6">
            <div className="flex items-start gap-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-sky-500/12 text-sky-300">
                <Icon name={ICONS[t.key] ?? "spark"} size={19} />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="font-bold">{t.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{t.body}</p>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-3xl font-bold leading-none grad-text">{t.metric}</div>
                <div className="mt-1 max-w-[92px] text-[10px] uppercase leading-tight tracking-widest text-muted">{t.metricLabel}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
