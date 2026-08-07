import Link from "next/link";
import Icon from "@/components/Icon";
import AgeBandPicker from "@/components/AgeBandPicker";

// The ask. B72.4.
//
// The band gate is worth nothing unless somebody is ACTUALLY asked, and until
// this file existed nothing asked: `/settings/earning` held the picker and
// `/onboarding` is skippable, so a gamer could link accounts, run challenges and
// earn nothing while never seeing the question. A gate whose question is
// optional is a gate that only fires on people who went looking for it.
//
// So the layout renders this for any signed-in gamer with no band, on every
// page. Not a modal: a modal on every page is a product people bounce off, and
// this must be answerable, ignorable for the length of one page view, and
// impossible to permanently dismiss — because dismissing it forever is the same
// as never asking.
//
// It is deliberately blunt about the cost. "Nothing is earning" is the true and
// motivating fact; "help us comply" is neither.
export default function AgeGate() {
  return (
    <div className="mx-auto max-w-4xl px-4 pt-4">
      <div className="glass border border-amber-400/30 bg-amber-500/[0.06] p-4">
        <div className="mb-1 flex items-center gap-2 text-sm font-black">
          <Icon name="alert" size={15} className="text-amber-300" />
          One question before you can earn
        </div>
        <p className="mb-3 text-xs leading-relaxed text-muted">
          Until you answer, <b className="text-ink">nothing is earning</b> — your actions are
          recorded but pay no points, and they are not backdated. We ask for a range, never your
          date of birth, and it is never shown on your profile.
        </p>
        <AgeBandPicker current={null} locked={false} left={0} compact />
        <p className="mt-2 text-[11px] text-muted">
          You can change it later in{" "}
          <Link href="/settings/earning" className="text-cyan-300 hover:underline">
            Settings → Earning
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
