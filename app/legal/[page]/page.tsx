// `/legal/*` — terms, privacy, cookies. 04 §1.
//
// One dynamic segment rather than three files, because the three are the same
// page with different sections and three copies is three places a sentence
// drifts. `isLegalPage` is what keeps the segment from being a catch-all —
// trap 17: a dynamic segment says yes to anything, so anything it should not
// serve has to be refused by name.

import Link from "next/link";
import { notFound } from "next/navigation";
import {
  legalSections,
  isLegalPage,
  LEGAL_PAGES,
  LEGAL_TITLE,
} from "../../../lib/content/legal.ts";
import { Nav } from "../../components.tsx";

export const dynamic = "force-dynamic";

export default async function Legal({ params }: { params: Promise<{ page: string }> }) {
  const { page } = await params;
  if (!isLegalPage(page)) notFound();
  const sections = legalSections(page);

  return (
    <>
      <Nav />
      <main className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-12">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{LEGAL_TITLE[page]}</h1>
          <nav className="mt-3 flex gap-4 text-sm">
            {LEGAL_PAGES.map((p) => (
              <Link
                key={p}
                href={`/legal/${p}`}
                data-testid={`legal-${p}`}
                className={p === page ? "font-medium" : "text-mute hover:text-white"}
              >
                {LEGAL_TITLE[p]}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex flex-col gap-6">
          {sections.map((s) => (
            <section key={s.heading} data-section={s.heading}>
              <h2 className="font-medium">{s.heading}</h2>
              <p className="mt-1 text-sm text-mute">{s.body}</p>
            </section>
          ))}
        </div>

        <p className="text-xs text-mute">
          The rules that decide your money are on the{" "}
          <Link href="/rules/gamer" className="underline">
            rules pages
          </Link>
          , and every figure on them is read from the code that enforces it.
        </p>
      </main>
    </>
  );
}
