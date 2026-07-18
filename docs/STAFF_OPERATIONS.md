# Cluster — Staff Operations & Training

For staff and admins who run the platform. **No coding required.** This is your manual for Mission Control — the admin area at `clustergg.com/admin`. It explains what every section does, how to edit it safely, and the rules to follow.

If you're a developer, you want [`ENGINEERING_HANDOVER.md`](./ENGINEERING_HANDOVER.md) instead.

---

## 1. Getting in

- Sign in at `/login` with your Cluster account, then go to `/admin`. You'll see the **Mission Control** sidebar on the left.
- What you can see depends on your **role**:
  - **Staff** — everyday content: planets, games, challenges, quests, trophies, leaderboards, site content, backgrounds, partners.
  - **Admin** — all of the above **plus** ads & brands, image storage, the audit log, roles, and settings.
  - An admin can **grant** staff extra areas (see §11). If your sidebar is missing something you expect, ask an admin to grant it.
- Everything you change is **live immediately** and **logged** (see the Audit log).

---

## 2. The golden rules

1. **Images: always upload, never paste giant links.** Every image field has an **Upload** button that optimizes the file and lets you zoom/drag to frame it. Uploading keeps the site fast and the database lean. (There's a "paste a link" escape hatch — only use it for images already hosted on our storage.)
2. **Frame with the zoom slider + drag.** The crop you set is exactly what visitors see — logos, planet globes, quest maps, covers, favicon.
3. **Save each editor before moving on.** Editors save independently; there's no global "save all."
4. **When in doubt, don't delete.** Deletes (games, planets, challenges) can remove linked data. Prefer toggling something **inactive**.

---

## 3. Design & content

- **Site content** — all the words on the public pages (hero headline, section titles, footer tagline, CTA buttons) and the rotating loading-screen phrases (one per line, cycles every second). Change copy here, not in code.
- **Page backgrounds** — the background art behind each page (landing, feed, planets, leaderboards, etc.). Upload + frame per page.
- **Card backgrounds** — the art behind card types across the site (feed rails like "My planets" / "Explore planets", etc.). A dark overlay is applied automatically so text stays readable.
- **Logos & brand kit** — the square logo mark, the wide wordmark, nav/footer background, the **favicon** (with zoom), the Cluster Points (CP) coin icon, the floating quest-orb icon & color, and the quest "rocket" marker. All uploads, all framed.
- **Partners** — the "Trusted by" logos row.

---

## 4. Games & planets

- **Games catalog** — the master list of games. Each game has a logo, cover, planet globe art, planet background, accent colors, tracked metrics, and a **sort order** (which also sets the order of the planet globes and the default game). Add a new game here at any time.
- **Connect providers** — which account providers show in the onboarding "connect your accounts" flow; hide ones you don't want offered.
- **Planets** — one planet per catalog game. Set each planet's layout, page background, card art, theme, and drag the **region pins** on the globe to place them; live gamer counts per region are shown.
- **Planet requests** — approve/decline requests for new planets.

---

## 5. Competition

- **Challenges** — time-boxed competitions on real game data. Set the game, rules/format, cover & hero art, start/end (weekday + hour + date, with a live countdown), the trophy awarded, and any entry gate. No JSON — it's all form fields.
- **Quests** — progression tracks that pay **Cluster Points (CP)**. For each quest set the name, story, colors, emblem, the treasure-map art, and CP-per-action. Add **tier badges** (milestones), each with badge art, a CP threshold, and a story. Place milestones on the map by **dragging** them in the "Milestone map placement" editor.
- **Leaderboards** — per-game standings. Pick the game and the metric (the metric list filters to that game), the title, unit, and sort direction.
- **Trophies** — the prize art awarded by challenges.

> A "metrics guide" is shown inside the challenge and leaderboard builders so you know exactly what we track per game.

---

## 6. Community

- **Users** — find any user, reset their password (for people who lost access), and suspend/ban.
- **Roles & staff access** — see who has elevated roles. **Admins** grant staff extra areas here (§11). Only **superadmins** can change people's roles.
- **Linked accounts** — see and manage users' connected game accounts (unlink / re-sync).

---

## 7. Ads & brands (admin, or staff if granted)

This is the revenue side. The flow is **Brand → Campaign → Creatives → Placements → Launch**.

- **Brands** — create a brand with an uploaded logo + portal cover. Each brand gets a shareable **access key** and a `/brands/<slug>` portal the brand can open **without an account**. There's a shared inbox to message them.
- **Creatives** — the ad images/videos. Filter by brand/status, expand a creative to review (approve/reject) it, and **link it to any placement**. Bulk-upload many at once. A placement loops every creative linked to it.
- **Placements** — the ad slots across the site. Edit each slot's size, device and **rotation interval**, and see which creatives are assigned.
- **Campaign page** (open a campaign from a brand or the master dashboard) — per-campaign cover/logo, collapsed creative slots (one per placement, turns green when filled), **Launch** (only enabled once every placement has a creative), and analytics that refresh in place.
- **Ad schedule / Ad analytics** — assign creatives and see deep analytics.

**The brand's own view**: send them their `/brands/<slug>` link and access key. They see animated totals, trends, marketing intelligence, per-campaign analytics, and can upload their own creatives — all without logging in.

---

## 8. Platform (admin)

- **Image storage** — the health check for media. Lists every stored image, whether it's on our storage (✓) or still on an external CDN (⚠️) or inline (❌), and its **file size**. Anything ≥ 0.5 MB is flagged to compress (re-upload a smaller version from its editor). The **Re-host all → Blob** button moves any stray external/inline images onto our storage in one click.
- **Settings** — platform settings (admin-only).

---

## 9. Overview

- **Dashboard** — the admin landing summary.
- **Audit log** (admin/granted) — a record of every admin/staff action: who changed what, when. Check here first when something looks off.

---

## 10. Common tasks (quick recipes)

- **Change the homepage headline** → Design & content → Site content → edit the hero fields → Save.
- **Add a new game** → Games & planets → Games catalog → add the game (logo, cover, planet art, sort order) → its planet appears automatically.
- **Launch a brand campaign** → Brands → create/open the brand → create a campaign → open the campaign → upload one creative per placement (each turns green) → **Launch**.
- **Fix a slow/heavy image** → Platform → Image storage → find the flagged (≥0.5 MB) image → open its editor → re-upload a compressed version.
- **Swap the favicon** → Design & content → Logos & brand kit → upload + zoom the favicon → Save.

---

## 11. Delegating access to staff (admins only)

Go to **Community → Roles & staff access**. Under **Staff role access**, tick the sensitive areas you want the staff role to have:

- **Ads & brands** — the full revenue tools.
- **Image storage** — the media audit + re-host.
- **Audit log** — read the action history.

Save. Staff will see those sections immediately. **Roles and Settings can never be delegated** — they stay admin-only by design. Everyday content areas (planets, games, challenges, etc.) are always available to staff and aren't listed here.

---

## 12. Who to call

- Something's broken, a page errors, or a change won't stick → an engineer (point them at [`ENGINEERING_HANDOVER.md`](./ENGINEERING_HANDOVER.md)).
- A security concern (someone has access they shouldn't, a suspicious login) → an admin/superadmin; see [`SECURITY.md`](../SECURITY.md).
