# Version Gate — Future Improvements

Deferred items from the May 2026 version-gating implementation. The shipped v1
covers the four Tier-1 correctness items (a11y, OTA suppression by updateId,
offline-lockout fix via cache TTL, lower `s-maxage` for fast incident recovery)
plus the three Tier-3 near-zero-cost niceties (`itms-apps://` scheme,
`minimum_os_version` schema field, semver coerce warning).

Everything below was identified during the second-pass plan review as legitimate
post-v1 improvements but explicit scope creep for the first cut.

See `docs/guias/EAS_OTA_UPDATES.md` "Version Gating" for the operator runbook
and `docs/historico/fixes/MAY_2026_FIXES.md` for the original implementation entry.

---

## 1. Analytics event taxonomy on the gate

**Why deferred:** v1 derives gate visibility from server-side request counts to
`/api/mobile/app-config` and from Datafast event drop-off when a new
`minimum_version` is flipped. That's enough to monitor a single rollout. For
ongoing visibility we want client-side events.

**What to add:**

- `force_update_shown` — fired once per session when `<ForceUpdateScreen />`
  mounts.
- `force_update_cta_tapped` — fired when the user taps "Update on App Store".
- `soft_banner_shown` — fired once per session when `<UpdateAvailableBanner />`
  becomes visible.
- `soft_banner_cta_tapped` — "Update" tapped from the banner.
- `soft_banner_dismissed` — close button tapped.
- `ota_restart_prompted` — fired when `<OtaRestartSheet />` becomes visible.
- `ota_restart_tapped` — "Restart now" tapped.
- `ota_restart_postponed` — "Later" tapped.

Each event should carry `{ current_version, minimum_version, latest_version,
update_id? }`. Pipe to whatever the rest of the app uses for product analytics
(Datafast, Sentry breadcrumbs, or a dedicated stream).

## 2. Grace-period / countdown state (`soft → "X days left" → hard`)

**Why deferred:** v1 is binary — soft banner OR hard block. Industry leaders
(Duolingo, Chase, BofA) often add a middle state: "you have 7 days to update".

**Considerations before building:**

- Where does the "first seen on outdated version" timestamp live? Device-local
  storage means a reinstall resets the clock. Server-side means a new `users`
  column and a write on every gate check — overkill.
- What's the right grace window? Banking is typically 7–14 days. Ticketmaster
  uses ~21 days. We're closer to Eventbrite/Dice — likely 7 days.
- UI: a new `soft-with-deadline` state for `<UpdateAvailableBanner />` that
  shows the countdown, transitioning to `<ForceUpdateScreen />` when the clock
  hits zero.

## 3. Staged rollout of the gate flip itself

**Why deferred:** Flame's scale (~25 orgs, ~2700 users today) doesn't justify
% rollouts. The natural rollout is: ship binary → wait ~1 week for App Store
organic adoption → flip `minimum_version`. Manual staging is good enough.

**When to revisit:** When the user count climbs an order of magnitude OR when
the first gate flip causes meaningful support pain.

**Implementation sketch:** hash `clerk_user_id` → 0–99 bucket, store
`rollout_percent` in `app_config.config.ios.gate_rollout_percent`, only gate
when bucket < rollout_percent.

## 4. Deep-link / pending-intent preservation across the hard block

**Why deferred:** Most apps lose the deep link too. Universal Links queue
naturally on iOS, so the user re-tapping after updating usually works. Real
edge case.

**Fix when prioritized:** Capture the current router path in
`<ForceUpdateScreen>` on mount → store in SecureStore → after the user
returns from the App Store update and re-launches, redirect to the stored
path in `useAppVersionGate` once `status === "ok"`.

## 5. Admin UI for editing version config

**Why deferred:** SQL/MCP edits are sufficient for current scale. The operator
runbook in `EAS_OTA_UPDATES.md` documents the exact `UPDATE` statements for
common flows.

**When to revisit:** When non-engineers need to flip the gate (e.g. growth
team during a security incident on a weekend).

**Sketch:** New page at `/admin/app-config` gated by `INTERNAL_ORG_IDS` from
`@project-flame/lib`. Form bound to `app_config.config.ios` and `.android`.
Calls a new `POST /api/admin/app-config` endpoint using `supabaseAdmin` with
client-side semver validation + server-side clamp (already implemented).

## 6. i18n on `ForceUpdateScreen`

**Why deferred:** Flame is currently English-only across web and mobile. No
i18n infrastructure to bolt onto.

**When to revisit:** Whenever broader i18n work happens. The hard-block screen
is the highest-leverage target (every user sees it) so it should be one of the
first surfaces translated.

## 7. Optional `POST /api/mobile/app-config/revalidate` admin endpoint

**Why deferred:** Tier-1 already lowered `Cache-Control: s-maxage=30`, which
caps incident recovery to ~30 seconds. That's fast enough for nearly all
scenarios.

**When to revisit:** If we ever need sub-30s recovery (e.g. zero-day security
incident) OR if we want to surface a "purge CDN" button to non-engineers.

**Sketch:** `revalidatePath('/api/mobile/app-config')` after a successful
update, guarded by Clerk-auth + internal-org check.

## 8. Read + apply `minimum_os_version` on the client

**Why deferred:** Field already exists in the schema (added to the May 2026
migration as nullable, unread). Client-side wiring is a follow-up.

**What to add:**

- Read `Platform.Version` (iOS) / `Platform.constants.Release` (Android) and
  compare to `platform_config.minimum_os_version` using the same
  `compareVersions` helper.
- If `current_os_version < minimum_os_version`, render a variant of
  `ForceUpdateScreen` whose CTA points to Settings → General → Software Update
  instead of the App Store. Copy adjusted accordingly.

**Why we built the field now:** Avoids a follow-up schema migration when we
need this for the first time. Cost was one extra JSON key.

## 9. Android store-name localization

**Why deferred:** Flame is iOS-only at the time of writing (no Android binary
in the field, no Android target in `apps/mobile/app.json`). All user-facing
gate strings hardcode "App Store" because that's the only correct value
today, and shipping a `Platform.OS === "android" ? ... : ...` ternary just to
read iOS-only paths is dead code on every device that exists.

**What to change when Android ships (one-time sweep):**

Replace the literal "App Store" with a platform-aware label in these exact
call sites — there are only six, all in two files:

1. `apps/mobile/components/system/ForceUpdateScreen.tsx`:
   - The `Alert.alert` title + message for the "store URL unavailable" branch.
   - The `Alert.alert` title + message for the "failed to open store URL"
     branch.
   - The `accessibilityLabel` + `accessibilityHint` on the primary CTA.
   - The CTA label `Update on App Store`.
2. `apps/mobile/components/system/UpdateAvailableBanner.tsx`:
   - The `accessibilityLabel` on the "Update" pressable.

The two files already carry a `NOTE` comment at the top pointing at this todo,
so future-you should find them via grep on `"App Store"` or by following the
NOTE comments. Add a single shared constant (e.g.
`const STORE_NAME = Platform.OS === "android" ? "Google Play Store" : "App Store";`)
per file or, better, hoist to a tiny helper in `@project-flame/ui` if the same
copy pattern shows up elsewhere by then.

**Also verify when Android ships:** the Android `store_url` placeholder in
`supabase/migrations/20260512021503_add_app_config_for_version_gating.sql`
(currently `https://play.google.com/store/apps/details?id=YOUR_ANDROID_PACKAGE_NAME`)
is updated in the live `app_config` row before the first Android binary hits
the Play Store. See the SQL comment in the migration for the operator action.

## 10. Extract shared version-config types + validators to `@project-flame/lib`

**Why deferred:** v1 has two independent copies of the same shapes/helpers — one
on the mobile client (`apps/mobile/lib/version-check.ts`) and one on the web API
route (`apps/web/app/api/mobile/app-config/route.ts`). The pair drifting silently
is a real risk: if a future PR adds a field on the server (say `release_notes`)
and forgets to mirror the type on the client, mobile silently strips the field;
if the server tightens validation but the client doesn't, mobile accepts a payload
that the server would have rejected. The reviewer flagged this correctly.

Not fixed in the gating PR because (a) `@project-flame/lib` extraction touches
two apps + a shared package + likely tests, (b) the duplication is contained
(one type, one safe-default, one type-guard, one `safeSemver` wrapper, ~40 lines
each side), and (c) the duplicated code is well-tested by the gate behavior
itself (any drift would surface as a 500 from the API or a fail-open on the
client) — risk of silent breakage is bounded.

**What to extract (single PR, scope-tight):**

1. **Types** — `PlatformConfig`, `AppConfigResponse`, `GateStatus` →
   `packages/lib/src/version-gate/types.ts`.
2. **Validator** — the Zod schema (web has Zod already, mobile would adopt it
   for free here) → `packages/lib/src/version-gate/schema.ts`. Replaces the
   client-side `isRawPlatformConfig` type-guard AND the route's manual coercion
   path with a single `safeParse` shared by both.
3. **Safe default** — `SAFE_DEFAULT_PLATFORM` (currently `{ minimum_version:
   "0.0.0", latest_version: "0.0.0", store_url: "", … }`) → same module. Both
   server (DB read failure) and client (fetch failure + stale cache) read from
   the same constant so fail-open behavior is provably identical.
4. **Helpers** — `safeSemver`, `compareVersions`, `resolveGateStatus`,
   `getPlatformConfig` → `packages/lib/src/version-gate/index.ts`. Pure
   functions, no platform deps, trivially testable.

**What stays in each app:**

- `apps/mobile/lib/version-check.ts` keeps the SecureStore caching layer +
  `__DEV__` override (mobile-only, platform-specific I/O).
- `apps/web/app/api/mobile/app-config/route.ts` keeps the Supabase fetch +
  cache-control headers + server-side clamping (server-only, depends on
  `supabaseAdmin`).

**Drift-prevention test (must add):** a snapshot test in `packages/lib` that
ensures `SAFE_DEFAULT_PLATFORM` has every key the schema requires, so adding a
required field without updating the safe-default fails CI loudly.

**No web behavior change required from this work.** The web app already has a
working update mechanism (the browser auto-refreshes the JS bundle on next nav;
no force-update screen exists on web because there's no "old binary in the
field" problem). This task is strictly about preventing the mobile-client ↔
web-server contract from silently drifting.
