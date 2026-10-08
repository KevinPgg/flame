# EAS OTA Updates (Over-the-Air)

EAS Update lets us push JavaScript changes to the Flame iOS app **without going through Apple App Review**. This is set up and active as of April 2026.

---

## How it works

The Flame app has two layers:

- **Native shell** — compiled iOS binary, reviewed by Apple, installed from the App Store
- **JavaScript bundle** — the actual app logic and UI, loaded at runtime

Apple's guidelines allow us to silently replace the JS bundle without a new review. EAS Update hosts the new bundle on Expo's CDN and the app downloads it automatically on next launch.

---

## When to use OTA vs a full build

| Change type                                    | Use OTA? | Why                        |
| ---------------------------------------------- | -------- | -------------------------- |
| Bug fix in JS/TypeScript                       | ✅ Yes   | No native code touched     |
| UI/copy/styling change                         | ✅ Yes   | JS-only                    |
| New screen or feature (JS only)                | ✅ Yes   | No new native dependencies |
| New native module or library                   | ❌ No    | Requires recompile         |
| Changes to `app.json` native fields            | ❌ No    | Baked into binary          |
| Expo SDK upgrade                               | ❌ No    | Native code changes        |
| Adding camera/notification/payment permissions | ❌ No    | Info.plist / native config |

**Rule of thumb:** if it doesn't touch `ios/`, `android/`, or add a new package with native code — it's safe to OTA.

---

## Pushing an OTA update

```bash
cd apps/mobile

# Push to production (what App Store users get)
# ALWAYS pass --platform ios — without it eas update tries to bundle for web
# too, which fails because @stripe/stripe-react-native is native-only.
# ALWAYS prefix with EXPO_APPLE_ID — we have multiple Apple accounts.
# ALWAYS pass --environment production — see the NEVER-OMIT rule below.
EXPO_APPLE_ID=hello@flme.co eas update --branch production --platform ios --environment production --message "Fix: describe what changed"

# Push to preview (internal testers only) — same rule, use --environment preview
EXPO_APPLE_ID=hello@flme.co eas update --branch preview --platform ios --environment preview --message "Test: new feature"
```

Users receive the update **on their next app open**. There's no notification — it's silent and automatic.

---

## CRITICAL: `--environment <channel>` is mandatory (never omit it)

`eas update` does NOT read `eas.json`'s `build.<profile>.env` block. Without `--environment`, it falls back to loading your **local `apps/mobile/.env`** — which contains your dev machine's LAN IP, test Stripe keys, and other non-production values. Those will get bundled into the JS and shipped to every App Store user.

**Always verify the env load line at the top of the `eas update` output.** A correct production push loads `.env.production` (or pulls vars from the EAS remote `production` environment), not your local `.env`.

If you see `[expo-cli] env: load .env` anywhere in the output of a production push, **the bundle is poisoned with your local dev values** — unpublish it immediately and re-push with `--environment production`.

**Required env vars in EAS remote `production` environment** (keep this list in sync — missing vars fall back to `.env`):

- `EAS_PROJECT_ID`
- `EXPO_PUBLIC_API_URL` → `https://www.flme.co`
- `EXPO_PUBLIC_APP_URL` → `https://www.flme.co`
- `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` → `pk_live_...`
- `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` → `pk_live_...`
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_GOOGLE_PLACES_API_KEY`

Manage them at https://expo.dev/accounts/wagnerona27/projects/project-flame/environment or via `eas env:list --environment production`.

See APRIL_2026_FIXES.md #129 for the postmortem that established this rule.

---

## Channels

Each build profile maps to a channel. Updates are only delivered to builds on the matching channel.

| Build profile                        | Channel       | Who gets it                 |
| ------------------------------------ | ------------- | --------------------------- |
| `production`                         | `production`  | All App Store users         |
| `preview`                            | `preview`     | Internal TestFlight testers |
| `development` / `development-device` | `development` | Local dev builds            |

---

## Runtime version policy

We use `"policy": "appVersion"` — this means OTA updates are only delivered to users on the **same app version** (e.g. `1.0.11`). If you release `1.0.12` to the App Store, those users get a fresh binary and won't receive OTA updates targeted at `1.0.11`.

This prevents pushing a JS update that's incompatible with an older native binary.

**Critical gotcha — OTA only works if the binary already has OTA infrastructure baked in.** If an App Store binary was built _before_ `expo-updates` was added to `app.json` (i.e. before the PR #225 merge in April 2026), it has no concept of OTA and will silently ignore any `eas update` you push. In that case, users only get updates by installing the new binary from the App Store.

**After releasing a new binary version, always run a baseline OTA sync:**

```bash
EXPO_APPLE_ID=hello@flme.co eas update --branch production --platform ios --environment production --message "Sync OTA baseline for vX.X.XX"
```

This ensures future JS-only patches are delivered to users on the new binary version.

---

## When you still need a full build + App Store submission

```bash
cd apps/mobile

# Build
EXPO_APPLE_ID=hello@flme.co eas build --platform ios --profile production

# Submit to App Store Connect
EXPO_APPLE_ID=hello@flme.co eas submit --platform ios --latest
```

Do this when:

- Adding a new native package
- Upgrading the Expo SDK
- Changing `app.json` native config (bundle ID, permissions, entitlements)
- Bumping the version number in `app.json`

---

## Rollback

If a bad update goes out, you can roll back by pointing the `production` branch at a previous update in the [Expo dashboard](https://expo.dev) under **Updates → Branches**, or by re-publishing the last known good commit:

```bash
# Re-publish from a specific commit
git checkout <last-good-commit>
EXPO_APPLE_ID=hello@flme.co eas update --branch production --platform ios --environment production --message "Rollback to stable"
git checkout main
```

Alternative for rollbacks when the bad bundle has poisoned env values: **unpublish** the bad updates from the Expo dashboard (**Updates → Branches → production**). Devices on that runtime version will fall back to the JS bundled into the App Store binary, which always uses the `eas.json` production env and cannot be poisoned by local `.env`. This is the fastest recovery path for "I pushed an OTA with my dev values in it."

---

## Setup reference

The one-time setup that was done (April 2026):

- Installed `expo-updates` (`~29.0.16`)
- Added `runtimeVersion` and `updates.url` to `app.json`
- Added `channel` to all build profiles in `eas.json`
- Project ID: `5558474d-83a3-41fb-bb90-3c652ce37885`
- Added `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_APP_URL` to the EAS remote `production` environment (Apr 22, 2026 — see APRIL_2026_FIXES.md #129). Previously these only lived in `eas.json build.production.env`, which `eas update` does not read — the omission caused the first two production OTAs to ship with the developer's LAN IP baked in.

---

## Version Gating

Version gating is the layer **above** OTA. OTA pushes JS bundles silently to the matching native version; version gating tells the app whether the user's **native** version is too old for the current JS bundle to support. Three distinct UI surfaces:

- **Hard block** (`<ForceUpdateScreen />`) when `current_native_version < minimum_version`. Non-dismissible. Opens the App Store via `itms-apps://`.
- **Soft banner** (`<UpdateAvailableBanner />`) when `minimum_version <= current_native_version < latest_version`. Dismissible per-version.
- **OTA restart prompt** (`<OtaRestartSheet />`) layered on top whenever a new JS bundle has been silently downloaded. Independent of the binary version.

Implemented May 2026. Source of truth: the `public.app_config` table in Supabase. Schema, RLS, and seed values are in `supabase/migrations/20260512021503_add_app_config_for_version_gating.sql`.

### Where the config lives

A single row in `app_config` keyed by `platform_key = 'mobile'`:

```text
{
  "ios": {
    "minimum_version":  "1.0.13",   // < this → hard block
    "latest_version":   "1.0.13",   // < this but >= minimum → soft banner
    "store_url":        "itms-apps://apps.apple.com/app/flame/idREPLACE_ME",
    "force_update_title":   "Update Flame to continue",
    "force_update_message": "We've made important improvements...",
    "minimum_os_version":   null     // reserved for future, unread today
  },
  "android": { ... }
}
```

Public-read RLS. Service-role writes only — there is intentionally NO write policy. Adding one would let any anon client remotely brick the app.

### Operator runbook — flipping the gate

| Scenario                                                                   | SQL                                                                                                                                                       |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ship binary v1.0.14 → optionally nudge users** (~1 week after release)   | `UPDATE app_config SET config = jsonb_set(config, '{ios,latest_version}', '"1.0.14"') WHERE platform_key='mobile';`                                       |
| **Force-update everyone below v1.0.13** (security incident or hard cutoff) | `UPDATE app_config SET config = jsonb_set(config, '{ios,minimum_version}', '"1.0.13"') WHERE platform_key='mobile';`                                      |
| **Roll back the gate** (you bumped values by mistake)                      | `UPDATE app_config SET config = jsonb_set(config, '{ios,minimum_version}', '"1.0.0"') WHERE platform_key='mobile';`                                       |
| **Update the App Store URL after first App Store listing**                 | `UPDATE app_config SET config = jsonb_set(config, '{ios,store_url}', '"itms-apps://apps.apple.com/app/flame/id1234567890"') WHERE platform_key='mobile';` |

Recovery time after any flip: at most **~30 seconds** thanks to `Cache-Control: s-maxage=30, stale-while-revalidate=120` on the public endpoint. Clients pick up the new value on next launch / next AppState-active transition.

### Release recipe (recommended)

1. Ship the new binary (`eas build` + `eas submit`) — App Store review.
2. **Wait ~1 week** for organic App Store auto-update adoption before bumping `minimum_version` to the new version. Use `latest_version` (soft banner) to gently nudge in the meantime.
3. After the wait, flip `minimum_version` to the new version. Users still below get the hard block on next launch.

Skip the 1-week wait only for actual security incidents.

### Safety guarantees

The implementation has several non-negotiable safety properties — do not regress these in future changes.

1. **Server sanity guard** — if you typo `minimum_version > latest_version`, the API clamps `minimum_version` down to `latest_version` and logs a structured warning. Search Vercel logs for `[app-config] minimum_version > latest_version`.
2. **Fail-open** — on any DB / endpoint / network error, the system returns `min = latest = "0.0.0"` which never gates anyone. Better to leave the app open than to brick everyone because of a 5xx.
3. **Client-side cache TTL (1 hour)** — the mobile app caches the last successful fetch in SecureStore. If a subsequent fetch fails AND the cache is older than 1 hour, the client falls back to safe-default (not the stale value). This prevents indefinite offline lockout after you've already rolled back a misconfig. Trade-off: a malicious user could "extend their grace period" by going offline for less than an hour, but they can't bypass the next online launch.
4. **`isProductionBuild` short-circuit** — the gate is OFF in dev/preview channels by default. TestFlight internal testers never get force-updated mid-test.
5. **OTA suppression keyed by `Updates.updateId`** — "Later" on the OTA sheet stores `{ updateId, suppressedAt }`. A new OTA (new `updateId`) defeats the 24h suppression so the user sees the second prompt.

### Local testing

Three `__DEV__`-gated env flags let you exercise every gate state in a Metro dev build without rebuilding the binary or affecting production users. In `apps/mobile/.env`:

```bash
# Pretend to be on a specific native version (overrides Info.plist value)
EXPO_PUBLIC_DEV_VERSION_OVERRIDE=1.0.11

# Force-enable the gate in dev (gate is OFF in dev by default for safety)
EXPO_PUBLIC_DEV_FORCE_GATE=1

# Force-show the OTA prompt with a fake updateId (no real OTA needed)
EXPO_PUBLIC_DEV_FORCE_OTA_PROMPT=1

# Optionally override the fake updateId to test suppression-by-updateId
EXPO_PUBLIC_DEV_FAKE_UPDATE_ID=dev-fake-update-2
```

**Restart Metro fully** after editing `.env` — Ctrl+C the running dev server and run `npx expo start --dev-client --clear` again. Hitting `r` in the Metro terminal (or Cmd+R in the simulator) only reloads the JS bundle; `process.env.EXPO_PUBLIC_*` is baked in at Metro startup, so env changes do not apply until you restart the dev server. All three flags are `__DEV__`-gated in source — production bundles cannot read them.

**Gate decision rule** (use this to pick the right `EXPO_PUBLIC_DEV_VERSION_OVERRIDE`):

| Want                 | Set `override` to                                                                           | Why                                     |
| -------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------- |
| Hard block           | `< minimum_version` (e.g. `1.0.11` when `min=1.0.13`)                                       | `current < min` triggers hard.          |
| Soft banner          | `≥ minimum_version` AND `< latest_version` (e.g. `1.0.13` when `min=1.0.13, latest=1.0.14`) | `min ≤ current < latest` triggers soft. |
| Normal app (no gate) | `≥ latest_version` (or omit the override entirely)                                          | `current ≥ latest` → no gate.           |

**Test matrix:**

| Scenario                            | `.env`                                                                                  | Supabase `app_config` row         | Expected                                                                                                                                                                                                                                                                      |
| ----------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Normal app (control)                | (none)                                                                                  | `min=1.0.13, latest=1.0.13`       | App renders normally, no gate                                                                                                                                                                                                                                                 |
| Soft banner                         | `EXPO_PUBLIC_DEV_VERSION_OVERRIDE=1.0.13` + `EXPO_PUBLIC_DEV_FORCE_GATE=1`              | `min=1.0.13, latest=1.0.14`       | Dismissible banner anchored ABOVE the floating tab bar (not at the top — see `UpdateAvailableBanner.tsx` for the placement rationale). **Rule:** `min ≤ override < latest`. If `override < min`, you'll get the hard block instead — that's correct gate behavior, not a bug. |
| Soft banner persists                | (same — dismiss then reload)                                                            | (same)                            | Banner does NOT reappear                                                                                                                                                                                                                                                      |
| Soft banner reappears on new latest | (same)                                                                                  | bump `latest_version` to `1.0.15` | Banner appears again (per-version dismissal — dismissal is keyed by `latest_version`)                                                                                                                                                                                         |
| Hard block                          | `EXPO_PUBLIC_DEV_VERSION_OVERRIDE=1.0.11` + `EXPO_PUBLIC_DEV_FORCE_GATE=1`              | `min=1.0.13, latest=1.0.13`       | `ForceUpdateScreen` covers entire app — no tab bar, no back                                                                                                                                                                                                                   |
| Hard block CTA                      | (same)                                                                                  | (same)                            | Tap "Update on App Store" → `itms-apps://` opens (or fallback `https://`)                                                                                                                                                                                                     |
| Offline-lockout fix                 | (hard block, then roll back SQL, then go offline, clear cache or wait 1h)               | rolled back to `min=1.0.0`        | Within 1h: still blocked (correct — security). After TTL + offline: safe-default unlocks                                                                                                                                                                                      |
| `isProductionBuild` short-circuit   | `EXPO_PUBLIC_DEV_VERSION_OVERRIDE=1.0.11` ONLY (no `EXPO_PUBLIC_DEV_FORCE_GATE`)        | `min=1.0.13`                      | Gate disabled in dev — confirms TestFlight not gated                                                                                                                                                                                                                          |
| OTA prompt UI                       | `EXPO_PUBLIC_DEV_FORCE_OTA_PROMPT=1`                                                    | n/a                               | Bottom sheet appears with Restart + Later                                                                                                                                                                                                                                     |
| OTA suppression by updateId         | dismiss with Later, then set `EXPO_PUBLIC_DEV_FAKE_UPDATE_ID=dev-fake-update-2`, reload | n/a                               | Sheet reappears (new updateId defeats suppression)                                                                                                                                                                                                                            |

Helper SQL to clear the on-device suppression cache without rebuilding (run from a SecureStore-aware test surface, or just delete the simulator's app data).

**Local API smoke test** (run `pnpm dev` in `apps/web` first):

```bash
# 1. Verify response shape and Cache-Control header
curl -i http://localhost:3000/api/mobile/app-config | head -20

# 2. Verify the sanity guard fires when you intentionally typo
#    (run in Supabase SQL editor)
UPDATE app_config SET config = jsonb_set(config, '{ios,minimum_version}', '"9.9.9"') WHERE platform_key='mobile';
curl http://localhost:3000/api/mobile/app-config | jq '.ios.minimum_version'
# Expected: returns the latest_version (clamped), AND a [app-config] minimum_version > latest_version warning appears in your Next.js dev server logs.

# 3. Roll back the test value
UPDATE app_config SET config = jsonb_set(config, '{ios,minimum_version}', '"1.0.13"') WHERE platform_key='mobile';
```

### End-to-end OTA prompt verification (TestFlight)

The local dev mock proves the UI. The real `expo-updates` flow can only be validated against a real published bundle:

```bash
cd apps/mobile
EXPO_APPLE_ID=hello@flme.co eas update --branch preview --platform ios --environment preview --message "Test OTA prompt"
```

Open the TestFlight build, foreground the app, wait ~10s — the prompt should appear. Tap "Later", then push a second `--branch preview` OTA. Re-foreground — confirm the prompt re-appears (new `updateId` defeats the 24h suppression).

### Deferred improvements

See `docs/todos/VERSION_GATE_TODOS.md` for the post-v1 backlog (analytics event taxonomy, grace-period / countdown UI, % rollout of the gate flip itself, deep-link preservation across the hard block, admin UI, i18n, dedicated revalidate endpoint, client-side `minimum_os_version` enforcement).
