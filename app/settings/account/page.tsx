import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import SettingsNav from "@/components/SettingsNav";
import { getT } from "@/lib/i18n/t-server";
import Link from "next/link";
import { getDb } from "@/lib/db";
import { deletionImpact, deletionAllowed } from "@/lib/account-deletion";
import Cp from "@/components/Cp";
import Icon from "@/components/Icon";
import DeleteAccountForm from "@/components/DeleteAccountForm";

export const dynamic = "force-dynamic";

export default async function AccountSettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const db = await getDb();
  const impact = await deletionImpact(db, user.id);
  const guard = deletionAllowed(impact);
  const { tr } = await getT();

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <SettingsNav active="account" />
      <h1 className="text-2xl font-bold mb-6">{tr("Account")}</h1>
      <div className="glass p-6 space-y-4 mb-6">
        <div>
          <div className="text-xs uppercase tracking-widest text-muted">{tr("Email")}</div>
          <div className="mt-1">{user.email ?? "—"}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-widest text-muted">{tr("Member since")}</div>
          <div className="mt-1">{user.createdAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-widest text-muted">{tr("Role")}</div>
          <div className="mt-1 capitalize">{user.role}</div>
        </div>
      </div>
      <div className="glass p-6 !border-rose-400/30">
        <h2 className="font-bold text-rose-300">{tr("Danger zone")}</h2>
        <p className="text-sm text-muted mt-1 mb-4">
          {tr("Deleting your account removes your profile, linked accounts, posts and messages. This cannot be undone.")}
        </p>

        {/* What it costs, before the button (B40).
            Deletion took one click with no mention of the money, and
            db.delete(users) cascades — so a gamer holding real value could lose
            it by misclicking. The number goes in front of the decision, with
            the obvious alternative next to it: redeem first, then delete. */}
        {impact.anythingAtStake && (
          <div className="mb-5 rounded-2xl border border-amber-400/40 bg-amber-500/5 p-5">
            <div className="flex items-center gap-2 font-bold text-amber-200">
              <Icon name="alert" size={16} /> {tr("You would be giving up")}
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {impact.balance > 0 && (
                <div className="rounded-xl border border-white/10 p-3">
                  <div className="text-[11px] uppercase tracking-widest text-muted">{tr("Cluster Points")}</div>
                  <div className="mt-1 text-cyan-200"><Cp amount={impact.balance} /></div>
                  <div className="text-lg font-black text-emerald-300">${impact.balanceUsd.toFixed(2)}</div>
                </div>
              )}
              {impact.trophies.length > 0 && (
                <div className="rounded-xl border border-white/10 p-3">
                  <div className="text-[11px] uppercase tracking-widest text-muted">
                    {impact.trophies.length} {impact.trophies.length === 1 ? tr("trophy") : tr("trophies")}
                  </div>
                  <div className="mt-1 text-lg font-black text-amber-200">${impact.trophyValue.toFixed(2)}</div>
                  <div className="text-[11px] text-muted">{tr("redeemable for cash")}</div>
                </div>
              )}
              {impact.pending.length > 0 && (
                <div className="rounded-xl border border-white/10 p-3">
                  <div className="text-[11px] uppercase tracking-widest text-muted">{tr("Being paid out")}</div>
                  <div className="mt-1 text-lg font-black text-rose-200">${impact.pendingValue.toFixed(2)}</div>
                  <div className="text-[11px] text-muted">
                    {impact.pending.map((p) => p.status).join(", ")}
                  </div>
                </div>
              )}
            </div>

            <p className="mt-3 text-sm">
              <b className="text-ink">${impact.totalUsd.toFixed(2)}</b>{" "}
              <span className="text-muted">
                {tr("is forfeited the moment this account is deleted. It cannot be recovered afterwards.")}
              </span>
            </p>

            {/* The alternative, offered rather than buried. */}
            <Link href="/wallet"
              className="glow-btn mt-4 inline-block rounded-full px-5 py-2 text-sm font-semibold text-white">
              {tr("Cash it out first")}
            </Link>
          </div>
        )}

        {!guard.ok && (
          <div className="mb-5 rounded-2xl border border-rose-400/40 bg-rose-500/5 p-4 text-sm text-rose-200">
            {guard.reason}
          </div>
        )}

        <DeleteAccountForm canDelete={guard.ok} atStake={impact.totalUsd} />
      </div>
    </div>
  );
}
