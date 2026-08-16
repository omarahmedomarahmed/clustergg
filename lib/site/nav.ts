// The nav, in four states, and the context switcher.
//
// 12 §10:
//
// | Surface | Nav |
// |---|---|
// | Gamer | Site nav + a **context switcher** |
// | Server manager | The same switcher. Selecting a server **changes the homepage to that server's portal** |
// | Brand | **No site nav.** A SaaS dashboard with a side nav |
// | Brand browsing the public site | Guest nav + a **"Back to dashboard"** button |
//
// ===== A BRAND IS NEVER IN THE SWITCHER, AND THIS IS WHY =====
//
// I4 — a gamer is never linked to a brand, never represents one, never sees a
// brand nav. I2 — separate tables, separate routes, because one email could
// otherwise be both. The switcher is a list of things *this person* is, and a
// brand is not something a person is; it is a company with its own login.
//
// Putting a brand in the switcher would be the single most natural-looking
// mistake on this surface — it is another portal they can reach — and it is
// the one that quietly merges two account systems that 07 keeps apart on
// purpose.
//
// Pure, and taking facts rather than reading a session, so the four states can
// be asserted without a request.

export type NavState = "guest" | "gamer" | "server_manager" | "brand";

export type SwitcherEntry =
  | { kind: "gamer"; label: string; href: string }
  /** A server they manage, with the bot installed. */
  | { kind: "server"; guildId: string; label: string; href: string }
  /** 12 §9 — a server they admin that has never had Cluster. */
  | { kind: "install"; guildId: string; label: string; href: string };

export type NavFacts = {
  /** A signed-in gamer, or null. */
  gamer: { displayName: string; slug: string } | null;
  /** A signed-in brand session, or null. Never both — separate routes. */
  brand: { id: string; name: string } | null;
  /** Servers this Discord identity manages **and** Cluster is installed on. */
  managedGuilds: { guildId: string; name: string }[];
  /** Servers they admin that have never had Cluster (12 §9). */
  installableGuilds: { guildId: string; name: string }[];
  /** Whether they are currently looking at a public page. */
  onPublicSite: boolean;
  /** Which server portal is selected, if any. */
  selectedGuildId?: string | null;
};

/**
 * Which of the four.
 *
 * A brand is decided **first and unconditionally**. If a brand session and a
 * gamer session somehow coexist in one browser — two tabs, one machine, which
 * is entirely normal — the brand surface must win on brand pages and the gamer
 * must not be offered a brand anywhere. Deciding gamer-first would put a brand
 * nav on a gamer's screen the moment somebody logged into both.
 */
export function navStateFor(facts: NavFacts): NavState {
  if (facts.brand) return facts.onPublicSite ? "guest" : "brand";
  if (!facts.gamer) return "guest";
  return facts.managedGuilds.length > 0 ? "server_manager" : "gamer";
}

/**
 * The switcher: *Playing as \<name\>* · each server they manage · *Add Cluster
 * to \<server\>* for servers they admin without the bot. **Never a brand.**
 *
 * The brand is not filtered out at the end — it is never a source. A filter is
 * a line somebody deletes while tidying; an absent input cannot be restored by
 * accident.
 */
export function switcherFor(facts: NavFacts): SwitcherEntry[] {
  if (!facts.gamer) return [];

  const entries: SwitcherEntry[] = [
    {
      kind: "gamer",
      label: `Playing as ${facts.gamer.displayName}`,
      href: "/profile",
    },
  ];

  for (const guild of facts.managedGuilds) {
    entries.push({
      kind: "server",
      guildId: guild.guildId,
      label: guild.name,
      // 12 §10 — selecting a server **changes the homepage to that server's
      // portal**, so this is the portal itself and not a settings page about it.
      href: `/portal/server/${guild.guildId}`,
    });
  }

  for (const guild of facts.installableGuilds) {
    entries.push({
      kind: "install",
      guildId: guild.guildId,
      label: `Add Cluster to ${guild.name}`,
      // The round trip that captures the installer (G1). One route, both ends.
      href: `/api/auth/discord/install?guildId=${encodeURIComponent(guild.guildId)}`,
    });
  }

  return entries;
}

/**
 * A brand browsing the public site gets the guest nav plus a way home.
 *
 * Without it they are stranded: the brand portal has no site nav by design, so
 * a brand who clicks through to `/pool` from an email has no link back and no
 * reason to believe they are still signed in.
 */
export function backToDashboardHref(facts: NavFacts): string | null {
  if (!facts.brand || !facts.onPublicSite) return null;
  return `/portal/brand/${facts.brand.id}`;
}

/**
 * Does this nav state show the site nav at all?
 *
 * The brand dashboard does not (12 §10) — it is a SaaS product with its own
 * side nav, and a site nav on it would offer a brand user the gamer surfaces
 * I4 says they never see.
 */
export function showsSiteNav(state: NavState): boolean {
  return state !== "brand";
}
