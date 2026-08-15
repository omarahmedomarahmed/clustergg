// `/api/auth/gamer` — the email door into a `users` row.
//
// ===== THE EMAIL IS VERIFIED HERE, AT SIGNUP, AND NEVER ASKED AGAIN =====
//
// I7a. It is the credential, and a password reset is impossible without it —
// so verifying it later is verifying it never. And that same verification is
// the one redemption requires (G2), which means an email gamer can be paid
// without `/redeem` ever asking for an address.
//
// The Discord door asks for none of this (G2/I1b), and neither door is second
// class (I1). What they do *not* share is a parent server: an email gamer has
// none until they press a bot button, and no server earns from them until
// then (I1a/A7).

import { NextResponse, type NextRequest } from "next/server";
import { getDb, isDemoMode } from "../../../../lib/db/index.ts";
import { createGamer } from "../../../../lib/identity/gamers.ts";
import {
  hashPassword,
  passwordMatches,
  checkPasswordStrength,
  normaliseEmail,
  emailIsFree,
  gamerByEmail,
  CredentialRefused,
} from "../../../../lib/identity/credentials.ts";
import { beginReset, completeReset } from "../../../../lib/identity/reset.ts";
import { signIn, currentGamer } from "../../../../lib/auth/current.ts";
import { beginEmailVerification, confirmEmailVerification } from "../../../../lib/identity/verify.ts";

export const dynamic = "force-dynamic";

function back(request: NextRequest, path: string, params: Record<string, string>) {
  const url = new URL(path, request.url);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return NextResponse.redirect(url, 303);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const form = await request.formData();
  const action = String(form.get("action") ?? "signin");
  const db = await getDb();

  try {
    if (action === "signup") {
      const email = normaliseEmail(String(form.get("email") ?? ""));
      const password = String(form.get("password") ?? "");
      const displayName = String(form.get("displayName") ?? "").trim();

      checkPasswordStrength(password);
      if (!displayName) {
        return back(request, "/signup", { error: "Pick a display name." });
      }
      if (!(await emailIsFree(db, email))) {
        // ===== A ROUTE, NOT A REFUSAL (I1c1, U4b) =====
        //
        // They may well be the same person who already has an account. Two
        // accounts for one person are permitted and permanent, so this does
        // not offer to merge, transfer or reconcile anything — it points at
        // the door that opens the account they are looking for.
        return back(request, "/login", {
          routed:
            "You already have a Cluster account with that email. Sign in with it " +
            "to reach it — we never combine two accounts, so nothing is lost either way.",
        });
      }

      // The address is verified before the account is usable. In a real
      // deployment that is a code in an email; in the demo the code comes
      // back in the URL so the screenshot record can walk the flow.
      const userId = await createGamer(db, {
        displayName,
        email,
        passwordHash: await hashPassword(password),
      });
      const code = await beginEmailVerification(db, userId, email);
      await signIn(userId);
      return back(request, "/signup/verify", isDemoMode ? { code } : {});
    }

    if (action === "verify") {
      const code = String(form.get("code") ?? "");
      const gamer = await currentGamer();
      if (!gamer) return back(request, "/login", { error: "Sign in first." });
      const result = await confirmEmailVerification(db, gamer.id, code);
      if (!result.ok) return back(request, "/signup/verify", { error: result.reason });
      // I7a — this is the verification redemption later requires. Recorded on
      // the user row, and never asked for a second time.
      return back(request, "/onboarding", { verified: "1" });
    }

    if (action === "signin") {
      const email = String(form.get("email") ?? "");
      const password = String(form.get("password") ?? "");
      const user = await gamerByEmail(db, email);
      if (!user || !(await passwordMatches(user.passwordHash, password))) {
        return back(request, "/login", {
          error: "That email and password do not match an account.",
        });
      }
      await signIn(user.id);
      const next = String(form.get("next") ?? "");
      return NextResponse.redirect(
        new URL(next.startsWith("/") && !next.startsWith("//") ? next : "/profile", request.url),
        303,
      );
    }

    if (action === "reset-begin") {
      const token = await beginReset(db, { kind: "gamer", email: String(form.get("email") ?? "") });
      const demo: Record<string, string> = isDemoMode && token ? { token } : {};
      return back(request, "/reset", { kind: "gamer", sent: "1", ...demo });
    }

    if (action === "reset-complete") {
      const result = await completeReset(db, {
        kind: "gamer",
        token: String(form.get("token") ?? ""),
        password: String(form.get("password") ?? ""),
      });
      if (!result.ok) return back(request, "/reset", { kind: "gamer", error: result.reason });
      return back(request, "/login", { reset: "1" });
    }
  } catch (e) {
    if (e instanceof CredentialRefused) {
      const path =
        action === "signup" ? "/signup" : action.startsWith("reset") ? "/reset" : "/login";
      return back(request, path, { error: e.message });
    }
    throw e;
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
