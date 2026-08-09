import Link from "next/link";
import Icon from "@/components/Icon";
import { STAGES, STAGE_ORDER } from "@/lib/challenge-stage";
import { BRACKETS, PARTICIPATION_SHARE } from "@/lib/server-score";
import { quotePrivate, PRIVATE_FEE_PCT } from "@/lib/private-quote";
import { MIN_WITHDRAWAL } from "@/lib/server-wallet";

// The product, shown rather than described. B92.
//
// ===== WHY THIS EXISTS =====
//
// The marketing pages described a version of Cluster that stopped being true
// three sprints ago. They talked about tiers and per-challenge percentages;
// the product has a status ladder, a bracketed weekly pool, a wallet an owner
// spends from, and two separate gates on a challenge. None of it was on a
// public page, so the only way to find out how the thing works was to install
// it.
//
// ===== SHOWN, NOT DESCRIBED =====
//
// Every panel below renders the SAME vocabulary the product uses, from the same
// modules: `STAGES` is the admin's ladder, `BRACKETS` is what the weekly close
// divides by, `quotePrivate` is the function that charges a wallet. A marketing
// page that paraphrases the product drifts from it within a month; one that
// imports it cannot.
//
// That is also why there are no invented numbers here. The only literals are
// the illustrative dollar amounts in the wallet panel, and they are labelled as
// an example.

const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export default function ProductAtlas({ compact = false }: { compact?: boolean }) {
  return (
    <section className="mx-auto max-w-6xl px-4 py-16">
      <div className="max-w-2xl">
        <div className="text-[11px] uppercase tracking-[0.2em] text-cyan-300">How it actually works</div>
        <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
          The whole mechanism, on one page.
        </h2>
        <p className="mt-3 text-muted leading-relaxed">
          Not a diagram of what we intend to build. These are the same components the product runs
          on — the ladder an operator sees, the split the weekly close divides by, the arithmetic
          on a server owner&apos;s balance. If we change one, this page changes with it.
        </p>
      </div>

      <div className="mt-10 grid gap-5 lg:grid-cols-2">
        <LadderPanel />
        <GatesPanel />
        <PoolPanel />
        {!compact && <WalletPanel />}
        {!compact && <PrivatePanel />}
        <TransparencyPanel />
      </div>
    </section>
  );
}

function Panel({ title, lede, children, wide }: {
  title: string; lede: string; children: React.ReactNode; wide?: boolean;
}) {
  return (
    <div className={`glass p-6 ${wide ? "lg:col-span-2" : ""}`}>
      <h3 className="text-lg font-bold">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-muted">{lede}</p>
      <div className="mt-5">{children}</div>
    </div>
  );
}

/** The five rungs, exactly as the console draws them. */
function LadderPanel() {
  return (
    <Panel
      title="Every challenge climbs the same five rungs"
      lede="A brand, a server owner and an operator all use these five words for the same five states. There is no second vocabulary."
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {STAGE_ORDER.map((k, i) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${
              k === "live"
                ? "border-emerald-400/50 bg-emerald-500/10 text-emerald-200"
                : "border-white/12 text-muted"
            }`}>
              {STAGES[k].label}
            </span>
            {i < STAGE_ORDER.length - 1 && <span className="text-[10px] text-muted/50">→</span>}
          </span>
        ))}
      </div>
      <dl className="mt-4 space-y-2.5">
        {STAGE_ORDER.map((k) => (
          <div key={k} className="flex gap-3 text-xs">
            <dt className="w-20 shrink-0 font-bold">{STAGES[k].label}</dt>
            <dd className="text-muted leading-relaxed">{STAGES[k].blurb}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

/** The two gates — the least obvious thing in the product. */
function GatesPanel() {
  return (
    <Panel
      title="Two gates, not one"
      lede="A challenge becomes visible days before it starts, and nothing you play counts until it does. Those are deliberately separate."
    >
      <div className="space-y-3">
        <Gate
          icon="zap" tone="cyan" when="When it is announced"
          what="It appears, and anyone can enter."
          why="Entering early is how a competition gets a field. A challenge nobody knew about until the morning it started is one with the entrants who happened to be online."
        />
        <Gate
          icon="clock" tone="emerald" when="When it starts"
          what="Scoring begins — for everybody at once."
          why="Everyone is measured from the same moment, whenever they joined. Somebody who entered on announcement day has no head start on somebody who entered at the gun."
        />
      </div>
    </Panel>
  );
}

function Gate({ icon, tone, when, what, why }: {
  icon: string; tone: "cyan" | "emerald"; when: string; what: string; why: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/25 p-4">
      <div className="flex items-center gap-2">
        <Icon name={icon} size={14} className={tone === "cyan" ? "text-cyan-300" : "text-emerald-300"} />
        <span className="text-[11px] uppercase tracking-widest text-muted">{when}</span>
      </div>
      <p className="mt-1.5 font-semibold">{what}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted">{why}</p>
    </div>
  );
}

/** The weekly pool, drawn from the shares the close actually uses. */
function PoolPanel() {
  const total = BRACKETS.reduce((a, b) => a + b.share, 0);
  return (
    <Panel
      title="A weekly pool, split by size bracket"
      lede="Every Monday the servers that carried a public challenge share what brands paid that week. A bracket decides who you are compared against — nothing else."
      wide
    >
      <div className="flex h-10 w-full overflow-hidden rounded-xl border border-white/10">
        {BRACKETS.map((b, i) => (
          <div
            key={b.key}
            style={{ width: `${(b.share / total) * 100}%` }}
            className={`flex items-center justify-center text-[11px] font-bold ${
              i === 0 ? "bg-cyan-500/25 text-cyan-100"
                : i === 1 ? "bg-violet-500/25 text-violet-100"
                  : "bg-white/10 text-muted"
            }`}
          >
            {b.share}%
          </div>
        ))}
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {BRACKETS.map((b) => (
          <div key={b.key} className="rounded-xl border border-white/10 bg-black/25 px-3 py-2.5">
            <div className="text-sm font-bold">{b.label} servers</div>
            <div className="text-[11px] text-muted">
              {b.floor === 0 ? "Under 500 qualified members" : `${b.floor.toLocaleString("en-US")}+ qualified members`}
            </div>
            <div className="mt-1 text-[11px] text-cyan-200">{b.share}% of the pool</div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-muted">
        <b className="text-ink">{PARTICIPATION_SHARE}% of the pool is split evenly</b> between everybody
        who carried a challenge, placed or not — turning up is worth something. The rest is shared in
        proportion to score, inside your bracket, so four large servers can never take the share set
        aside for small ones. There are no places and no cliff.
      </p>
    </Panel>
  );
}

/** The owner's balance, with the arithmetic written out. */
function WalletPanel() {
  const example = { earned: 420, paid: 150, pending: 0, spent: 105 };
  const available = example.earned - example.paid - example.pending - example.spent;
  return (
    <Panel
      title="What a server earns is a balance, not a promise"
      lede="Every term is summed from things that already happened. There is no stored number for anything to drift from."
    >
      <div className="rounded-xl border border-emerald-400/25 bg-emerald-500/[0.06] p-4">
        <div className="text-[10px] uppercase tracking-widest text-muted">Example balance</div>
        <div className="mt-1 text-3xl font-black tabular-nums text-emerald-300">{usd(available)}</div>
        <p className="mt-2 text-xs leading-relaxed text-muted">
          {usd(example.earned)} earned − {usd(example.paid)} paid − {usd(example.pending)} on its way
          − {usd(example.spent)} spent on their own challenge = <b className="text-ink">{usd(available)}</b>
        </p>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-muted">
        Withdraw it from {usd(MIN_WITHDRAWAL)} up — below that a transfer spends most of itself in
        fees, so it keeps sitting there. The moment it is requested it stops being spendable, so it
        can never go out twice.
      </p>
    </Panel>
  );
}

/** The private challenge, priced by the same function that charges the wallet. */
function PrivatePanel() {
  const q = quotePrivate(200);
  return (
    <Panel
      title="Or spend it back into your own server"
      lede="A competition only your members can enter, with real prize money, bought out of your balance."
    >
      <div className="rounded-xl border border-white/10 bg-black/25 p-4 text-sm">
        <div className="flex justify-between"><span className="text-muted">Prizes for your members</span><b className="tabular-nums">{usd(q.prizePool)}</b></div>
        <div className="mt-1 flex justify-between"><span className="text-muted">Our {q.feePct}% for running it</span><b className="tabular-nums">${q.fee}</b></div>
        <div className="mt-2 flex justify-between border-t border-white/10 pt-2">
          <span>Out of your balance</span><b className="tabular-nums">{usd(q.total)}</b>
        </div>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-muted">
        The {PRIVATE_FEE_PCT}% is the point, not a hidden charge: it makes this something we sell you
        rather than us moving your money around, which is what lets us owe your members the prize
        directly. It does not count toward the weekly pool — a private challenge grows you, it does
        not pay you twice.
      </p>
    </Panel>
  );
}

function TransparencyPanel() {
  return (
    <Panel
      title="Every rule, with the reason it exists"
      lede="Three pages, one per audience. Every figure on them is read from the code that enforces it, so none of them can quote a number we no longer use."
      wide
    >
      <div className="flex flex-wrap gap-3">
        {[
          ["/rules/gamer", "If you play"],
          ["/rules/owner", "If you run a server"],
          ["/rules/brand", "If you buy"],
        ].map(([href, label]) => (
          <Link
            key={href}
            href={href}
            className="ghost-btn pressable inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm"
          >
            <Icon name="spark" size={13} className="text-violet-300" /> {label}
          </Link>
        ))}
      </div>
    </Panel>
  );
}
