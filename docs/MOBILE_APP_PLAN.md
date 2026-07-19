# Cluster — Mobile App Execution Plan

A complete, build-ready plan to ship the **Cluster** mobile app for iOS + Android, reusing the existing Next.js backend and migrating current users with zero disruption. Written so a developer (or an agent) can execute it end to end.

> Status today: the web app is already mobile-responsive with a native-style bottom tab bar (`components/BottomNav.tsx`) and "coming soon" App Store / Google Play badges (`components/AppStoreBadges.tsx`) shown site-wide. This doc is the plan to turn that into real native apps.

---

## 1. Strategy — the fastest credible path

**Recommendation: Expo (React Native) + a thin shared API layer**, not a WebView wrapper.

Why not a WebView wrapper (Capacitor around the site)? It ships fastest but gets rejected/again-reviewed by Apple for "just a website", has janky scroll/gestures, and can't do real push notifications cleanly. We already have the cosmic design system in Tailwind; we re-implement the *screens* natively but keep the *backend untouched*.

Why Expo:
- One TypeScript codebase → iOS + Android + (optional) web.
- **EAS Build/Submit** handles native builds + store uploads without a Mac for CI.
- Over-the-air updates (EAS Update) for JS-only fixes without a store review.
- First-class push (Expo Notifications), secure storage, deep links, camera/image picker (for avatar/cover uploads).

**Phasing**
- **Phase 0 (done):** responsive web + bottom nav + store badges (coming soon).
- **Phase 1 (MVP app, ~4–6 wks):** auth, feed, profile view/edit, planets, quests, leaderboards, messages, push notifications.
- **Phase 2:** live challenge notifications, deep links from Discord, in-app account linking (OAuth), offline cache.
- **Phase 3:** widgets (home-screen CP/rank), share cards, App Clips / Instant App.

---

## 2. Backend readiness (mostly done — small additions)

The Next.js app already exposes what the mobile app needs. Do this to make it a clean mobile API:

1. **Token auth alongside the cookie session.** Today auth is a `jose` JWT in an httpOnly cookie (`lib/auth.ts`). Add a **Bearer-token** path: the same signed JWT returned in a JSON body from `POST /api/auth/mobile/login` and accepted from an `Authorization: Bearer <jwt>` header in `getSession()`. No new user model — same `AUTH_SECRET`, same claims (`uid`, `role`).
2. **Stable JSON endpoints** under `/api/mobile/*` (thin wrappers over existing `lib/*` functions so web and app never diverge):
   - `GET /api/mobile/me` → profile + theme + linked accounts.
   - `GET /api/mobile/feed` → dashboard widgets + sources (reuse the feed page's data build).
   - `GET /api/mobile/planets`, `/planets/:slug` → `lib/planets.ts`.
   - `GET /api/mobile/quests`, `/quests/:key` → `lib/quests.ts`.
   - `GET /api/mobile/leaderboards?game=` → `lib/*`.
   - `GET /api/mobile/messages`, `/messages/:id`, `POST /messages/:id` → `app/actions/social.ts` logic.
   - `POST /api/mobile/push/register` → store an Expo push token per device (`user_push_tokens` table).
3. **OAuth for game/identity providers** must accept a mobile redirect (`clustergg://oauth/callback`) in addition to the web callback — the existing `/api/auth/[provider]` flow with a `platform=mobile` flag.
4. **Rate limits / CORS**: allow the app origin; keep the same server-side guards (`requireUser`, `requireArea`).
5. **Image uploads** already go to Vercel Blob via `/api/upload`; the app posts a base64/data-URL exactly like the web `ImageUpload` does.

New tables (add to `schema.ts` + `COLUMN_MIGRATIONS`):
```
user_push_tokens(id, user_id, expo_token, platform, created_at)   -- push targeting
mobile_sessions(id, user_id, device, last_seen)                    -- optional: session mgmt
```

---

## 3. App architecture (Expo)

```
cluster-app/
  app/                      expo-router (file-based, mirrors the web routes)
    (tabs)/index.tsx        Home / feed
    (tabs)/quests.tsx
    (tabs)/planets.tsx      center tab, glorified globe
    (tabs)/leaderboards.tsx
    (tabs)/you.tsx          profile
    messages/[id].tsx
    u/[slug].tsx            public profile
  lib/
    api.ts                  typed fetch client (Bearer token, base URL)
    auth.ts                 SecureStore token + refresh
    theme.ts                port of lib/theme.ts (colors/vars)
  components/               native ports of the key cards (QuestMap, Globe, Leaderboard row…)
```

- **State/data:** TanStack Query against `/api/mobile/*`. Optimistic updates for messages/follows.
- **Navigation:** `expo-router` with a bottom tab bar identical in spirit to `BottomNav` (Planets center, raised).
- **Auth storage:** `expo-secure-store` for the JWT; auto-attach `Authorization` header in `lib/api.ts`.
- **Push:** `expo-notifications` → register token → `POST /api/mobile/push/register`. Server sends via Expo Push API on: new message, challenge start/end, quest tier unlocked, someone follows you.
- **Deep links:** `clustergg://u/<slug>`, `clustergg://quests/<key>`, universal links from `https://clustergg.com/...` so Discord/web links open the app when installed.
- **Theming:** reuse the profile theme JSON (already stored on `users.theme`) to render each gamer's custom profile natively.

---

## 4. Screen parity checklist (MVP)

| Web | App screen | Data source |
|---|---|---|
| `/feed` | Home (dashboard widgets) | `/api/mobile/feed` |
| `/u/[slug]` | Public profile (themed) | `/api/mobile/... ` + `users.theme` |
| `/profile` | Edit profile + linked accounts | `/api/mobile/me`, `/api/upload` |
| `/planets`, `/planets/[slug]` | Planet globe + region pins + leaderboards | `/api/mobile/planets` |
| `/quests`, `/quests/[key]` | Quest map + milestones + astronaut marker | `/api/mobile/quests` |
| `/leaderboards` | Game rank list (image · tag · rank) | `/api/mobile/leaderboards` |
| `/messages`, `/messages/[id]` | Inbox + thread + push | `/api/mobile/messages` |
| onboarding | Connect accounts (OAuth) | `/api/auth/[provider]?platform=mobile` |

---

## 5. Migrating existing users (zero-friction)

Users already exist in Neon; **there is no data migration** — the app talks to the same DB. The "migration" is account continuity:

1. **Same login, everywhere.** Discord OAuth + email/password both work in-app via the token endpoint. A user installs the app, taps "Sign in with Discord" (or email), and lands on *their* existing profile, quests, CP, linked accounts and messages — nothing to re-create.
2. **Deep-link handoff.** Logged-in web users see an in-app-install banner and store badges; tapping a `https://clustergg.com/u/<slug>` link opens the app to that profile once installed (universal links / app links).
3. **Push opt-in on first launch**, tied to the existing `user_id`.
4. **No breaking changes to the web** — web keeps its cookie session; the app uses Bearer tokens. Both are the same JWT claims, so a user can be signed in on web and app simultaneously.
5. **Announce** via the loading screen badges (already live), a feed banner, and an email/Discord blast when the apps go live; flip the badges from "coming soon" to real store links (a one-line CMS change — see §7).

---

## 6. Build & release — exact steps

```bash
# 0. Prereqs: Node LTS, an Expo account, Apple Developer ($99/yr) + Google Play ($25 once)
npm i -g eas-cli && eas login

# 1. Scaffold
npx create-expo-app@latest cluster-app -e with-router
cd cluster-app && npx expo install expo-secure-store expo-notifications expo-image-picker \
  @tanstack/react-query expo-linking

# 2. Configure app.json: name "Cluster", scheme "clustergg", bundle ids
#    ios.bundleIdentifier = com.clustergg.app, android.package = com.clustergg.app
#    icon/splash from lib/assets (the cosmic mark), notification icon

# 3. Point the API client at production
echo 'EXPO_PUBLIC_API_BASE=https://clustergg.com' > .env

# 4. Build the screens (see §3/§4), run locally
npx expo start            # scan QR with Expo Go for fast iteration

# 5. Native builds
eas build --platform ios
eas build --platform android

# 6. Submit to stores
eas submit --platform ios        # fills App Store Connect
eas submit --platform android    # uploads to Play Console

# 7. OTA JS updates after launch (no store review)
eas update --branch production --message "…"
```

**Store listing assets** (generate from the brand kit): 1024² icon, feature graphic, 6–8 screenshots per platform (feed, planet globe, quest map, leaderboard, profile), privacy policy URL (`/legal/privacy`), support URL, and the data-safety form (we collect: account handle, game stats via OAuth, no location, no ads SDK tracking beyond first-party).

---

## 7. Flipping the badges live (when the apps ship)

The store badges (`components/AppStoreBadges.tsx`) render "coming soon". When the apps are live, add two CMS keys and turn the badges into real links:
- `mobile.appstore.url`, `mobile.googleplay.url` (empty = "coming soon"; set = live link).
- Update `AppStoreBadges` to read them (via a server wrapper) and drop the "Soon" pill when both are set.

No redeploy of the app is needed to switch the marketing badges — it's a content change.

---

## 8. Cost & timeline (lean team)

| Item | Cost |
|---|---|
| Apple Developer Program | $99 / yr |
| Google Play registration | $25 one-time |
| Expo EAS (free tier ok to start; Production ~$99/mo for more builds) | $0–99 / mo |
| Push (Expo) | free |
| Timeline to MVP in stores | ~4–6 weeks, 1 mobile dev |

---

## 9. Risks & mitigations

- **Apple "minimum functionality" rejection** → we ship native screens (not a WebView), real push, and account features; low risk.
- **OAuth in-app** → use `expo-web-browser` `openAuthSessionAsync` with the `clustergg://` redirect; already supported by the provider flow with a `platform=mobile` flag.
- **Theme fidelity** → the profile theme is plain JSON; port `themeToVars` to RN styles; verify a few complex profiles.
- **Backend divergence** → the `/api/mobile/*` layer is a *thin* wrapper over the same `lib/*` used by the web, so there's a single source of truth.

See also [`ENGINEERING_HANDOVER.md`](./ENGINEERING_HANDOVER.md) for the backend internals the mobile API wraps.
