import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import SettingsNav from "@/components/SettingsNav";
import AgeBandPicker from "@/components/AgeBandPicker";
import Icon from "@/components/Icon";
import { myAgeBand } from "@/app/actions/age";
import { BAND_RULES } from "@/lib/age";
import { MIN_REDEEM_AGE } from "@/lib/eligibility";

export const dynamic = "force-dynamic";

// Earning settings. B72.4.
//
// This page exists because the age band is asked in one click with no confirm
// step, which makes a mis-tap inevitable — and a mis-tap onto "Under 16" turns
// off earning, prizes and cash-out with no way back. A gate with no correction
// path is a support queue.
//
// It is its own settings tab rather than a row on the account page because the
// band decides whether the whole economy applies to a gamer, and burying that
// next to "member since" would understate it.

export default async function EarningSettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const age = await myAgeBand();
  const rules = age?.band ? BAND_RULES[age.band] : null;

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <SettingsNav active="earning" />
      <h1 className="mb-1 text-2xl font-bold">Earning</h1>
      <p className="mb-6 text-sm text-muted">
        What you can earn, and the one thing we need to know before you can.
      </p>

      <section className="glass mb-6 p-6">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <Icon name="shield" size={18} className="text-cyan-300" /> Your age range
        </h2>
        <p className="mt-1 mb-4 text-sm text-muted">
          We ask for a range, never your date of birth. It decides whether you can earn points and
          whether you can cash trophies out — nothing else, and it is never shown on your profile.
        </p>

        <AgeBandPicker
          current={age?.band ?? null}
          locked={!!age?.locked}
          left={age?.left ?? 0}
        />

        {age?.setAt && (
          <p className="mt-3 text-[11px] text-muted">
            Set {age.setAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
            {age.changes > 0 && ` · changed ${age.changes} ${age.changes === 1 ? "time" : "times"}`}
          </p>
        )}
      </section>

      <section className="glass p-6">
        <h2 className="text-lg font-bold">What that means for you right now</h2>
        {!age?.band ? (
          <p className="mt-2 text-sm text-amber-200">
            <Icon name="alert" size={14} className="mr-1 inline" />
            You have not picked one yet, so <b>nothing is earning</b>. Actions you take are recorded,
            but they pay no points until you answer — and they are not backdated, so the sooner the better.
          </p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {[
              ["Play — challenges, game accounts, trophies", rules!.play],
              ["Earn Cluster Points", rules!.earn],
              [`Cash trophies out for money (${MIN_REDEEM_AGE}+)`, rules!.redeem],
            ].map(([label, on]) => (
              <li key={String(label)} className="flex items-center gap-2">
                <Icon
                  name={on ? "check" : "x"}
                  size={14}
                  className={on ? "text-emerald-300" : "text-rose-300"}
                />
                <span className={on ? "" : "text-muted"}>{label as string}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
