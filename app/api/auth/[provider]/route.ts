// `/api/auth/[provider]` — ownership proof via a provider's own OAuth.
//
// ===== THE STRONGEST FORM OF PROOF WE HAVE, AND IT IS OPTIONAL =====
//
// O1 — proof is required **where the game's API supports it**. O2/G5 — where
// it cannot, entry is allowed with an unproven account and there is **no
// badge, no warning, no second class.** It is not the gamer's fault the
// publisher has no endpoint, and they must not be punished for it.
//
// So this route exists for the providers that *can* prove, and a provider that
// cannot is answered with a plain explanation rather than an error: the gamer
// did nothing wrong and there is nothing for them to fix.
//
// L3 — only `icon`, `oauth`, `openid` and `admin` are proof. `exists` means
// the account exists, which is a different claim, and C5 forbids calling it
// verified anywhere a human reads.

import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "../../../../lib/db/index.ts";
import { getProvider, proofMethodFor } from "../../../../lib/providers/registry.ts";
import { currentGamer } from "../../../../lib/auth/current.ts";

export const dynamic = "force-dynamic";

function back(request: NextRequest, params: Record<string, string>) {
  const url = new URL("/settings/connections", request.url);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return NextResponse.redirect(url, 303);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
): Promise<NextResponse> {
  const { provider: providerId } = await params;

  const gamer = await currentGamer();
  if (!gamer) {
    return NextResponse.redirect(
      new URL(`/login?next=${encodeURIComponent(`/api/auth/${providerId}`)}`, request.url),
      303,
    );
  }

  const provider = getProvider(providerId);
  if (!provider) {
    return back(request, { error: `We do not run challenges on ${providerId}.` });
  }

  // O2 in one branch. Not an error — a fact about the publisher.
  //
  // `proofMethodFor` is derived from what the provider actually offers rather
  // than from a list here, and that direction matters: a hand-kept list fails
  // open on the provider somebody forgot, which is how an unproven account
  // ends up looking proven.
  const method = proofMethodFor(providerId);
  if (!method) {
    return back(request, {
      note:
        `${provider.name} has no way for us to check ownership, so there is nothing ` +
        `to prove here. Your account works exactly like anybody else's — you can ` +
        `enter, score, win and redeem.`,
    });
  }

  // The exchange itself needs each provider's client credentials, which arrive
  // through 10-SETUP. Until they do, this says so rather than starting a round
  // trip that cannot finish.
  await getDb();
  return back(request, {
    note:
      `${provider.name} proves ownership by ${method}, and that is not configured ` +
      `on this deployment yet. Your account still works — proof is what removes ` +
      `doubt, not what grants entry.`,
  });
}
