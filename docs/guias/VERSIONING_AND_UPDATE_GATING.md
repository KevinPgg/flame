# Versioning & Update Gating — Portable Playbook

How app versioning works end to end: what the version number means, when a change can ship over-the-air (OTA) vs. requires App Store review, and how the remote **hard gate** / **soft nudge** forces users off old binaries.

Written from the Flame implementation (Expo + EAS Update + Next.js API + Supabase), but structured so you can port it to another app. Anything app-specific is marked `<PLACEHOLDER>`.

---

## 1. The mental model — three independent layers

There are **two versions** of your app on a user's phone, and **three** control surfaces on top of them.

| Layer                    | What it is                                                       | Who controls it            | How it changes                          |
| ------------------------ | ---------------------------------------------------------------- | -------------------------- | --------------------------------------- |
| **Native binary**        | Compiled shell (Info.plist `CFBundleShortVersionString`)          | Apple / Play review        | User installs a new build from the store |
| **JS bundle**            | Your React Native app logic + UI                                  | You                        | OTA push, silent, no review             |
| **Remote config**        | `minimum_version` / `latest_version` thresholds in your DB        | You                        | One SQL `UPDATE`, live in ~30s          |

Everything else follows from this:

- **OTA** replaces the JS bundle **within one native version**. It cannot fix native code, and it cannot force anyone off an old binary.
- **Version gating** is the layer *above* OTA. It reads the **native** version (unaffected by OTA) and decides whether to block, nudge, or do nothing.
- The two are independent and can fire in the same session (user gets a new JS bundle *and* is told their binary is too old).

```text
┌─────────────────────────────────────────────────────────┐
│  ForceUpdateScreen   (hard block — native < minimum)    │  ← replaces the whole app
├─────────────────────────────────────────────────────────┤
│  UpdateAvailableBanner (soft — minimum ≤ native < latest)│  ← floats over the app
├─────────────────────────────────────────────────────────┤
│  OtaRestartSheet     (new JS bundle downloaded)         │  ← bottom sheet, dismissible
├─────────────────────────────────────────────────────────┤
│  Your app                                               │
└─────────────────────────────────────────────────────────┘
```

---

## 2. Version numbering

Two numbers, different jobs:

| Field                                   | Example  | Purpose                                                                 |
| --------------------------------------- | -------- | ----------------------------------------------------------------------- |
| `expo.version` in `app.json` (semver)   | `1.0.13` | **User-facing / gating version.** This is what the gate compares.        |
| `buildNumber` / `versionCode`           | `42`     | Store-internal uniqueness. Auto-incremented by EAS, never compared by you. |

Set `appVersionSource: "remote"` in `eas.json` + `autoIncrement: true` on store profiles so EAS owns build numbers and you only ever hand-edit the semver:

```jsonc
// eas.json
{
  "cli": { "version": ">= 14.0.0", "appVersionSource": "remote" },
  "build": {
    "production":  { "autoIncrement": true, "channel": "production" },
    "testflight":  { "autoIncrement": true, "channel": "testflight", "distribution": "store" },
    "preview":     { "channel": "preview",  "distribution": "internal" },
    "development": { "channel": "development", "developmentClient": true }
  }
}
```

**Bump `expo.version` only when you ship a new binary.** OTA pushes must NOT change it — see runtime version below.

---

## 3. OTA updates (EAS Update)

### 3.1 Config

```jsonc
// app.json
{
  "expo": {
    "version": "1.0.13",
    "runtimeVersion": { "policy": "appVersion" },
    "updates": { "url": "https://u.expo.dev/<EAS_PROJECT_ID>" }
  }
}
```

`"policy": "appVersion"` means **the runtime version equals the semver**. Consequence: an OTA published while `app.json` says `1.0.13` is delivered *only* to binaries built at `1.0.13`. This is the safety property that stops you shipping JS that calls a native module the old binary doesn't have.

Each build profile declares a `channel`; updates are delivered only to builds on the matching channel.

| Build profile | Channel       | Audience                          |
| ------------- | ------------- | --------------------------------- |
| `production`  | `production`  | All store users                   |
| `testflight`  | `testflight`  | TestFlight testers (store distro) |
| `preview`     | `preview`     | Internal/ad-hoc testers           |
| `development` | `development` | Local dev builds                  |

**Channel names are not interchangeable.** `testflight` and `preview` are *separate* channels in `eas.json`, so `eas update --branch preview` reaches ad-hoc `preview` builds and **not** TestFlight. Publish to `--branch testflight` for TestFlight testers.

### 3.2 Can I OTA this change?

| Change                                        | OTA? | Why                        |
| --------------------------------------------- | ---- | -------------------------- |
| JS/TS bug fix                                 | ✅   | No native code touched     |
| UI / copy / styling                           | ✅   | JS only                    |
| New screen or feature with no new native dep  | ✅   | JS only                    |
| New package containing native code            | ❌   | Requires recompile         |
| Expo SDK upgrade                              | ❌   | Native change              |
| Native fields in `app.json` (bundle ID, perms) | ❌  | Baked into the binary      |
| New permission (camera, notifications, …)     | ❌   | Info.plist / entitlements  |

**Rule of thumb:** OTA-safe means **JavaScript-only**. A change needs a new binary if it touches native config in `app.json` (permissions, bundle ID, `plugins`), the Expo SDK version, or any dependency that ships native code.

> Do **not** decide this by looking at `ios/` and `android/`. This project uses continuous native generation — both directories are gitignored build output (`apps/mobile/.gitignore`), regenerated by `expo prebuild`. They can be untouched in your diff and still be about to change.

### 3.3 Publishing

```bash
cd apps/mobile

# Production
EXPO_APPLE_ID=<apple-id> eas update \
  --branch production --platform ios \
  --environment production \
  --message "Fix: <what changed>"

# Ad-hoc / internal `preview` builds
EXPO_APPLE_ID=<apple-id> eas update \
  --branch preview --platform ios \
  --environment preview \
  --message "Test: <what changed>"

# TestFlight testers — separate channel, separate branch (see §3.1)
EXPO_APPLE_ID=<apple-id> eas update \
  --branch testflight --platform ios \
  --environment preview \
  --message "Test: <what changed>"
```

Three flags that are **not optional**. Behaviour below is as observed on this repo's toolchain — **Expo SDK 54**, `eas-cli >= 14`:

- `--platform ios` — **intentionally iOS-only.** Flame ships an iOS binary only, so there is nothing to publish for Android today. Omitting the flag makes EAS export every platform the project resolves, which can fail on native-only deps. When Android ships, use `--platform all` (or a second `--platform android` push); nothing else in this section changes.
- `--environment <env>` — **the big one.** `eas update` does *not* read `eas.json`'s `build.<profile>.env`. Omit this flag and it loads your local `.env`, baking your dev LAN IP and test API keys into the bundle every store user downloads. Always check the env-load line at the top of the output; if a production push logs `env: load .env`, the bundle is poisoned — unpublish it and re-push. EAS has changed its `.env` precedence between SDK releases, so treat the env-load line — not your memory of the rules — as the source of truth, and always pass the flag explicitly regardless of version.
- `EXPO_APPLE_ID=` — only if you have multiple Apple accounts on the machine.

Keep every `EXPO_PUBLIC_*` var mirrored into the EAS remote environment (`eas env:list --environment production`), because anything missing there silently falls back to your local `.env`.

### 3.4 Two gotchas that will bite you

1. **A binary built before `expo-updates` existed will never receive OTAs.** It has no updater at all and silently ignores every push. Those users only move forward via a store install.
2. **After every new binary release, publish a baseline OTA for that version:**
   ```bash
   eas update --branch production --platform ios --environment production \
     --message "Sync OTA baseline for v1.0.14"
   ```
   Because runtime version = app version, the new binary starts with *zero* updates on its channel. The baseline push establishes the branch so later JS-only patches actually reach it.

### 3.5 Rollback

Fastest first:

1. **Unpublish** the bad update in the Expo dashboard (Updates → Branches → production). Devices fall back to the JS baked into the store binary — which was built from `eas.json` env and therefore cannot be poisoned.
2. Or re-point the branch at a previous update in the dashboard.
3. Or re-publish from the last good commit:
   ```bash
   git checkout <last-good-sha>
   eas update --branch production --platform ios --environment production --message "Rollback to stable"
   git checkout main
   ```

### 3.6 The restart prompt

`expo-updates` downloads the new bundle in the background; it only takes effect after a reload. Rather than surprise-reloading mid-session, prompt:

- On mount and on every `AppState → "active"`: `checkForUpdateAsync()` → `fetchUpdateAsync()`.
- If `isNew`, read `manifest.id` (the `updateId`) and show a bottom sheet: **Restart now** / **Later**.
- **Restart** calls `Updates.reloadAsync()`.
- **Later** persists `{ updateId, suppressedAt }` for 24h. Suppression is keyed by `updateId`, so a *newer* OTA defeats it and prompts again immediately — you can never get stuck unable to reach a user who tapped Later.
- Every call is `try/catch`ed. This prompt is additive UX and must never crash the app.

Reference: [useOtaUpdatePrompt.ts](../../apps/mobile/hooks/useOtaUpdatePrompt.ts), [OtaRestartSheet.tsx](../../apps/mobile/components/system/OtaRestartSheet.tsx)

---

## 4. Version gating (hard block + soft nudge)

### 4.1 The decision rule

Compare the **native** version against two remote thresholds:

```ts
if (current < minimum_version)  return "hard";   // ForceUpdateScreen, non-dismissible
if (current < latest_version)   return "soft";   // dismissible banner
return "ok";
```

Read the native version from `expo-application`'s `nativeApplicationVersion` — **not** from `app.json` bundled into the JS, which an OTA could have changed. Compare with `semver`, and if either side fails to parse, treat them as equal so garbage input can never gate anyone.

Reference: [version-check.ts](../../apps/mobile/lib/version-check.ts), [useAppVersionGate.ts](../../apps/mobile/hooks/useAppVersionGate.ts)

### 4.2 Where the config lives (Supabase)

**One row for the whole mobile app** — `platform_key = 'mobile'` — whose `config` JSONB holds *every* platform's thresholds under `ios` / `android` keys. `platform_key` identifies the client family, **not** the OS; there is no `ios` row and no `android` row. Every lookup and every `UPDATE` in this guide therefore filters on `platform_key = 'mobile'` and addresses the OS through the JSON path (`'{ios,minimum_version}'`).

```sql
create table public.app_config (
  platform_key text primary key,
  config       jsonb not null,
  updated_at   timestamptz not null default now()
);

alter table public.app_config enable row level security;

-- Public read is intentional: the endpoint is unauthenticated public config.
create policy "app_config_public_read" on public.app_config for select using (true);

-- NO insert/update/delete policy. Service-role writes bypass RLS.
-- Adding a write policy would let any anon client remotely brick your app.
```

Seed shape:

```json
{
  "ios": {
    "minimum_version": "1.0.13",
    "latest_version": "1.0.13",
    "store_url": "itms-apps://apps.apple.com/app/<slug>/id<ASC_APP_ID>",
    "force_update_title": "Update <App> to continue",
    "force_update_message": "We've made important improvements. Please update to keep using <App>.",
    "minimum_os_version": null
  },
  "android": { "…same shape, store_url = https://play.google.com/store/apps/details?id=<pkg>" }
}
```

Both platforms live in that single row's `config`, so the endpoint reads one row and picks the sub-object matching the caller's OS.

Seed `minimum == latest == currently shipped version` so **nobody is gated until you deliberately bump a value**.

Reference: [20260512021503_add_app_config_for_version_gating.sql](../../supabase/migrations/20260512021503_add_app_config_for_version_gating.sql)

### 4.3 The public endpoint

`GET /api/mobile/app-config` — unauthenticated, no PII, edge-cacheable:

```ts
const CACHE_HEADER = "public, s-maxage=30, stale-while-revalidate=120";
```

This header defines your blast-radius recovery time, and **both** numbers count. After `s-maxage=30` the cached response is stale, but `stale-while-revalidate=120` lets the CDN keep serving that stale copy for up to a further 120s while it refreshes in the background. Worst case a client can therefore see pre-fix config for **~150 seconds** after the corrective SQL, not 30.

In practice the first request past the 30s mark triggers the background refresh, so most clients recover in well under that. But when you are timing an incident rollback, plan against ~150s. If you need a hard 30s bound, drop `stale-while-revalidate` — at the cost of origin hits on every expiry.

Two safety behaviors live here, not on the client:

1. **Sanity clamp** — if `minimum_version > latest_version` (a typo that would lock out *everyone*), clamp `minimum` down to `latest` and log a structured warning you can grep for in production logs.
2. **Fail open** — on any DB error, missing row, malformed JSON, or unhandled exception, return `min = latest = "0.0.0"`, which gates nobody. Never let a 5xx brick the app.

Reference: [route.ts](../../apps/web/app/api/mobile/app-config/route.ts)

### 4.4 Client fetch & caching policy

```text
1. Network fetch succeeds            → use it, write to secure storage with a timestamp
2. Fetch fails, cache < 1h old       → use the cache
3. Fetch fails, cache stale/missing  → SAFE_DEFAULT (0.0.0 — gates nobody)
```

Rule 3 is the **offline-lockout fix**. Without it, a user who was hard-blocked by a misconfig and then went offline stays blocked forever even after you roll the config back. The 1h TTL bounds that window.

Trade-off, accepted deliberately: a determined user can extend their grace period by staying offline for under an hour. They cannot bypass the next online launch.

Other client rules:

- Fetch on mount **and** on every `AppState → "active"`, using `refetchQueries` (not `invalidateQueries`) so existing data stays rendered while the new fetch is in flight — this avoids a visible flash of `ok → hard`.
- `retry: false`. The fetch already fails open; retrying only delays reaching the safe default.
- While data is `undefined` on first load, render `"ok"`. Never flash the block screen before you know.

### 4.5 Where to mount the gate

At the **root of the layout, above the router and above your auth provider**:

```tsx
<GestureHandlerRootView>
  <QueryClientProvider client={queryClient}>
    <SafeAreaProvider>
      <VersionGate>{clerkWrappedApp}</VersionGate>
    </SafeAreaProvider>
  </QueryClientProvider>
</GestureHandlerRootView>
```

Two reasons this ordering is load-bearing:

- **Above the router** — the hard block must cover deep links, modal stacks, and tab bars. Anything mounted inside a navigator can be routed around.
- **Above the auth provider** — if your auth SDK hangs or never resolves `isLoaded`, an inner gate never renders. The whole point of a hard block is to be non-bypassable *during* an incident.

Reference: [VersionGate.tsx](../../apps/mobile/components/system/VersionGate.tsx), [_layout.tsx](../../apps/mobile/app/_layout.tsx#L173-L189)

### 4.6 Three surfaces, three dismissal rules

| Surface                  | Trigger                          | Dismissible?                | Persistence key                |
| ------------------------ | -------------------------------- | --------------------------- | ------------------------------ |
| `ForceUpdateScreen`      | `current < minimum_version`      | ❌ never                    | —                              |
| `UpdateAvailableBanner`  | `minimum ≤ current < latest`     | ✅ per `latest_version`     | `dismissedForVersion`          |
| `OtaRestartSheet`        | new JS bundle downloaded         | ✅ 24h, per `updateId`      | `{ updateId, suppressedAt }`   |

Keying the banner dismissal to `latest_version` (not a boolean) means the nudge reappears the moment you ship a *newer* version, but only nags once per version per device.

The force-update CTA opens `itms-apps://…` for an instant native App Store handoff, falling back to the `https://` equivalent when `Linking.canOpenURL` says no (old iOS, simulators). Trap VoiceOver focus with `accessibilityViewIsModal` — a blocker that screen-reader users can navigate past isn't a blocker.

### 4.7 Gate off in dev and TestFlight

```ts
export const isProductionBuild = !__DEV__ && Updates.channel === "production";
```

Gate the gate on this. Internal testers should never be force-updated mid-test session, and you should never hard-block yourself in Metro. Provide `__DEV__`-only escape hatches to exercise it:

| Env var                             | Effect                                                |
| ----------------------------------- | ----------------------------------------------------- |
| `EXPO_PUBLIC_DEV_VERSION_OVERRIDE`  | Pretend to be on an older native version              |
| `EXPO_PUBLIC_DEV_FORCE_GATE=1`      | Turn the gate on in dev                               |
| `EXPO_PUBLIC_DEV_FORCE_OTA_PROMPT=1`| Show the OTA sheet with a fake `updateId`             |
| `EXPO_PUBLIC_DEV_FAKE_UPDATE_ID`    | Change the fake id to test suppression-by-updateId    |

All are behind `__DEV__`, so production bundles dead-code them.

**Restart Metro fully after editing `.env`** (`npx expo start --dev-client --clear`). `process.env.EXPO_PUBLIC_*` is inlined at Metro startup — pressing `r` or Cmd+R only reloads JS and will not pick up your change.

Picking an override value:

| Want                 | Set override to                        |
| -------------------- | -------------------------------------- |
| Hard block           | `< minimum_version`                    |
| Soft banner          | `≥ minimum_version` and `< latest_version` |
| No gate              | `≥ latest_version` (or omit)           |

---

## 5. Release runbook

### Shipping a new binary

```bash
cd apps/mobile
# 1. Bump expo.version in app.json (e.g. 1.0.13 → 1.0.14)
# 2. Build + submit
EXPO_APPLE_ID=<apple-id> eas build  --platform ios --profile production
EXPO_APPLE_ID=<apple-id> eas submit --platform ios --latest
# 3. After it's live, publish the OTA baseline for the new version (§3.4)
```

### Flipping the gate

| Scenario                                 | SQL                                                                                                          |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Nudge users to the new version           | `UPDATE app_config SET config = jsonb_set(config,'{ios,latest_version}','"1.0.14"') WHERE platform_key='mobile';` |
| Force everyone below 1.0.14              | `UPDATE app_config SET config = jsonb_set(jsonb_set(config,'{ios,latest_version}','"1.0.14"'),'{ios,minimum_version}','"1.0.14"') WHERE platform_key='mobile';` |
| Undo a mistaken flip                     | `UPDATE app_config SET config = jsonb_set(jsonb_set(config,'{ios,minimum_version}','"0.0.0"'),'{ios,latest_version}','"1.0.13"') WHERE platform_key='mobile';` |
| Set the store URL after first listing    | `UPDATE app_config SET config = jsonb_set(config,'{ios,store_url}','"itms-apps://apps.apple.com/app/x/id123"') WHERE platform_key='mobile';` |

> **Why the force row writes both values.** The endpoint clamps `minimum` down to `latest` when `minimum > latest` (§4.3). Bumping `minimum` to `1.0.14` while `latest` still reads `1.0.13` therefore silently cancels your own gate — the clamp cannot tell a deliberate force from a typo. Raise `latest` to at least the same version in the same statement. If you follow the cadence below, `latest` is already there and the extra `jsonb_set` is a harmless no-op.
>
> **Why the undo reverses both too.** `minimum_version = 0.0.0` is the part that actually unblocks people — do that first and alone if you are mid-incident. But the force row above raises `latest_version` as well, so leaving it high strands every user on a soft banner nagging them toward a version that may not exist yet. Restore `latest_version` to the version genuinely live in the store (`1.0.13` here); skip that half only if the force never raised it past what shipped.

### Recommended cadence

1. Ship the binary → App Store review.
2. Bump **`latest_version`** immediately (soft banner nudges, blocks nobody).
3. **Wait ~1 week** for organic auto-update adoption.
4. Then bump **`minimum_version`**. Stragglers get the hard block on next launch.

Skip the wait only for genuine security incidents. Bumping `minimum_version` the day you ship means every user who hasn't auto-updated yet — including users mid-task, offline, or on metered data — hits a wall.

### Choosing the right tool

| Situation                                         | Action                                  |
| ------------------------------------------------- | --------------------------------------- |
| JS bug, all versions affected                     | OTA to `production`                     |
| JS bug, only old binaries affected                | OTA — it targets that runtime version   |
| Native crash / SDK bug                            | New binary → wait → bump `minimum`      |
| Security incident, old clients must die           | New binary → bump `minimum` immediately |
| New feature, old clients degrade gracefully       | New binary → bump `latest` only         |
| Backend contract change old clients can't survive | New binary → bump `minimum` after adoption |

---

## 6. Porting checklist for a new app

**Mobile**

- [ ] `npx expo install expo-updates expo-application expo-secure-store`, add `semver`
- [ ] `app.json`: `version`, `runtimeVersion: { policy: "appVersion" }`, `updates.url`
- [ ] `eas.json`: `appVersionSource: "remote"`, a `channel` on every profile, `autoIncrement` on store profiles
- [ ] Port `lib/version-check.ts` (semver helpers, native-version read, cached fail-open fetch, `resolveGateStatus`)
- [ ] Port `hooks/useAppVersionGate.ts` + `hooks/useOtaUpdatePrompt.ts`
- [ ] Port the three UI surfaces, restyled to your design system
- [ ] Mount `<VersionGate>` above the router **and** above your auth provider
- [ ] Define `isProductionBuild` from `Updates.channel`
- [ ] Wire the four `__DEV__` env flags

**Backend**

- [ ] `app_config` table + public-read RLS, **no write policy**
- [ ] Seed with `minimum == latest == current shipped version`
- [ ] `GET /api/mobile/app-config` with the 30s cache header, sanity clamp, and fail-open
- [ ] Mirror all `EXPO_PUBLIC_*` vars into the EAS remote `production` environment

**Verify before you trust it**

- [ ] Force `minimum_version` above `latest_version` → confirm the clamp fires and logs
- [ ] Point the client at a dead API → confirm it fails open instead of blocking
- [ ] Hard-block, roll the config back, go offline → confirm unlock after the TTL
- [ ] TestFlight build with `minimum_version` above it → confirm **not** blocked (`isProductionBuild`)
- [ ] Publish two preview OTAs, tap "Later" on the first → confirm the second prompts anyway

---

## 7. Non-negotiables

Do not regress these when refactoring:

1. **Fail open everywhere.** Server error, network error, malformed JSON, unparseable semver → nobody gets gated. A bug that blocks all users is far worse than one that blocks none.
2. **No write RLS policy on `app_config`.** Service-role only. A write policy is a remote kill switch for anyone with your anon key.
3. **Server-side clamp of `minimum > latest`.** One fat-fingered SQL statement otherwise locks out 100% of users.
4. **Bounded cache TTL on the client.** Unbounded caching turns a rolled-back misconfig into a permanent offline lockout.
5. **Gate mounted above auth.** Otherwise an auth outage disables your incident-response tool.
6. **Gate disabled outside the production channel.** Internal testers and dev builds stay unblocked.
7. **OTA suppression keyed by `updateId`, not time alone.** A newer bundle must always be able to defeat an earlier "Later".
8. **Never omit `--environment` on `eas update`.** It ships your local `.env` to every user.

---

## 8. This repo's implementation

| Concern              | File                                                                                                                          |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Version primitives   | [apps/mobile/lib/version-check.ts](../../apps/mobile/lib/version-check.ts)                                                           |
| Gate hook            | [apps/mobile/hooks/useAppVersionGate.ts](../../apps/mobile/hooks/useAppVersionGate.ts)                                               |
| OTA hook             | [apps/mobile/hooks/useOtaUpdatePrompt.ts](../../apps/mobile/hooks/useOtaUpdatePrompt.ts)                                             |
| Composition root     | [apps/mobile/components/system/VersionGate.tsx](../../apps/mobile/components/system/VersionGate.tsx)                                 |
| Hard block UI        | [apps/mobile/components/system/ForceUpdateScreen.tsx](../../apps/mobile/components/system/ForceUpdateScreen.tsx)                     |
| Soft banner UI       | [apps/mobile/components/system/UpdateAvailableBanner.tsx](../../apps/mobile/components/system/UpdateAvailableBanner.tsx)             |
| OTA sheet UI         | [apps/mobile/components/system/OtaRestartSheet.tsx](../../apps/mobile/components/system/OtaRestartSheet.tsx)                         |
| Channel flag         | [apps/mobile/lib/internal.ts](../../apps/mobile/lib/internal.ts)                                                                     |
| Public endpoint      | [apps/web/app/api/mobile/app-config/route.ts](../../apps/web/app/api/mobile/app-config/route.ts)                                     |
| Migration            | [supabase/migrations/20260512021503_add_app_config_for_version_gating.sql](../../supabase/migrations/20260512021503_add_app_config_for_version_gating.sql) |
| Operator runbook     | [docs/guides/EAS_OTA_UPDATES.md](EAS_OTA_UPDATES.md)                                                               |
| Per-version notes    | [docs/ios-versions/](../ios-versions/)                                                                                       |
| Backlog              | [docs/todos/VERSION_GATE_TODOS.md](../todos/VERSION_GATE_TODOS.md)                                                           |
