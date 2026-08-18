// `/rules/[who]` — the published rules, per audience. 04 §1.
//
// Three audiences, one page, and **not one figure typed here.** Everything it
// renders comes from `lib/content/rules.ts`, which composes each sentence from
// the module that enforces the number in it. C1/C2 — a document that quotes a
// rate is a rate we are held to by whoever read it, and the failure that
// produced this branch was a document quoting a floor at twice its real value.

import Link from "next/link";
import { notFound } from "next/navigation";
import {
  rulesFor,
  isRuleAudience,
  AUDIENCE_LABEL,
  RULE_AUDIENCES,
} from "../../../lib/content/rules.ts";
import { Nav } from "../../components.tsx";

export const dynamic = "force-dynamic";

export default async function Rules({ params }: { params: Promise<{ who: string }> }) {
  const { who } = await params;
  if (!isRuleAudience(who)) notFound();
  const rules = rulesFor(who);

  return (
    <>
      <Nav />
      <main className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-12">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{AUDIENCE_LABEL[who]}</h1>
          <nav className="mt-3 flex gap-4 text-sm">
            {RULE_AUDIENCES.map((a) => (
              <Link
                key={a}
                href={`/rules/${a}`}
                data-testid={`rules-${a}`}
                className={a === who ? "font-medium" : "text-mute hover:text-white"}
              >
                {AUDIENCE_LABEL[a]}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex flex-col gap-6">
          {rules.map((rule) => (
            <section key={rule.heading} data-rule={rule.heading}>
              <h2 className="font-medium">{rule.heading}</h2>
              <p className="mt-1 text-sm text-mute">{rule.body}</p>
            </section>
          ))}
        </div>

        <p className="text-xs text-mute">
          Every figure on this page is read from the code that enforces it. If one of
          them changes, this page changes with it — there is no second copy to go stale.{" "}
          <Link href="/legal/terms" className="underline">
            Terms
          </Link>{" "}
          ·{" "}
          <Link href="/legal/privacy" className="underline">
            Privacy
          </Link>
        </p>
      </main>
    </>
  );
}
