# Sign in with Apple — Setup Guide

This guide walks through the **dashboard configuration** required to enable
Sign in with Apple on the Flame iOS app. The code changes are already in
the repo (see `apps/mobile/hooks/useSignInHandlers.ts` `onAppleAuth`,
`apps/mobile/components/sign-in/AppleOAuthButton.tsx`,
`apps/mobile/app.json` `ios.usesAppleSignIn: true`).

Apple requires this feature per App Store Review Guideline 4.8 when an app
offers third-party login services (we already offer Google).

---

## Status

**Last updated:** Apr 17, 2026

| Step | Status |
| ---- | ---- |
| Code changes (mobile) | ✅ Complete |
| 1.1 — App ID capability | ✅ Complete |
| 1.2 — Services ID | ✅ Complete |
| 1.3 — Signing key | ✅ Complete |
| 1.4 — Team ID noted | ✅ Complete |
| 1.5 — Email Communication (Hide My Email relay) | ✅ Complete |
| 2 — Clerk Dashboard credentials | ✅ Complete |
| 3 — Build & smoke test | ⏳ Pending (next EAS build: 1.0.12) |

---

## Overview

The flow involves **three systems**:

1. **Apple Developer Portal** — enable "Sign in with Apple" on the App ID,
   create a Services ID, generate a signing key, and register email
   sources for the Hide My Email relay.
2. **Clerk Dashboard** — enable Apple as a social connection and paste the
   credentials from Apple.
3. **EAS / code** — already done:
   - `apps/mobile/app.json` → `ios.usesAppleSignIn: true` (adds the
     `com.apple.developer.applesignin` entitlement when EAS builds the app).
   - `useSSO({ strategy: "oauth_apple" })` via Clerk handles the rest.

You do **not** need `expo-apple-authentication` — Clerk's `useSSO` hook
handles the Apple auth flow end-to-end (it opens a system web view that
transitions into the native Sign in with Apple sheet on iOS).

---

## Step 1 — Apple Developer Portal

### 1.1 Enable "Sign in with Apple" capability on the App ID ✅

Applied Apr 2026 for `com.projectflame.app`.

- Capability: **Sign In with Apple** → enabled as a **primary App ID**.
- **Server-to-Server Notification Endpoint:** left blank. Not required for
  App Store review. See [Optional / Future Reference](#optional--future-reference)
  for when to add it.

> EAS regenerates provisioning profiles automatically on the next build
> because `usesAppleSignIn: true` is set in `apps/mobile/app.json`. No
> manual Xcode work needed.

### 1.2 Create a Services ID ✅

Applied Apr 2026. Services ID: `com.projectflame.app.clerk`.

- Primary App ID: `com.projectflame.app`
- Domains/Return URLs: pulled from Clerk Dashboard → SSO connections → Apple.

### 1.3 Generate a signing key ✅

Applied Apr 2026.

- `.p8` file stored securely (password manager / shared secrets vault).
- Key ID and Team ID recorded in Clerk Dashboard (Step 2).

> `.p8` can only be downloaded **once**. If lost, generate a new key and
> update Clerk — the old key can be revoked.

### 1.4 Team ID ✅

10-character Team ID recorded in Clerk Dashboard (Step 2).

### 1.5 Configure Email Communication (Hide My Email relay) ✅

Required so transactional emails (ticket confirmations, RSVP approvals,
password resets) actually reach users who choose "Hide My Email" on the
Sign in with Apple sheet. Without this, Apple's private relay silently
drops mail from unregistered senders.

**Applied Apr 2026.**

**Apple Developer Portal:**

1. Certificates, Identifiers & Profiles → **Services** (top-left dropdown)
   → **More** → **Sign in with Apple for Email Communication** → **Configure**.
2. **Email Sources → `+`** → add:
   - Domain: `flme.co`
   - Email address: `noreply@flme.co`
3. Both show **✓ SPF** status — verified.

**DNS (Cloudflare → `flme.co` → DNS → Records):**

Single root TXT record covers all three senders:

```txt
Type:    TXT
Name:    @
Content: v=spf1 include:_spf.google.com include:spf.brevo.com include:_spf.apple.com ~all
TTL:     Auto
Proxy:   DNS only
```

**Verified email auth posture:**

| Record | Status |
| ---- | ---- |
| SPF | ✅ Live (Google + Brevo + Apple) |
| Brevo DKIM | ✅ CNAMEs `brevo1._domainkey` / `brevo2._domainkey` → `b{1,2}.flme-co.dkim.brevo.com` |
| DMARC | ✅ `v=DMARC1; p=none; rua=mailto:rua@dmarc.brevo.com` |

No code changes needed — Brevo sends from `noreply@flme.co` (see
`apps/web/app/lib/email/ticket-notifications.ts`) and all three senders
are now SPF-authorized.

---

## Step 2 — Clerk Dashboard ✅

Applied Apr 2026. Credentials pasted into production Clerk instance
(Services ID, Team ID, Key ID, `.p8` private key). Authorized redirect
URI confirmed to match Apple Developer Portal return URL.

### 2.1 Reference — re-setup steps

If you ever need to reconfigure (e.g. rotate the signing key, set up a
dev instance):

1. <https://dashboard.clerk.com> → select the Flame project → **production**
   instance.
2. **Configure** → **SSO connections** → **Apple** → **Enable** (or edit).
3. Toggle **Use custom credentials** on.
4. Paste:
   - **Apple Services ID:** `com.projectflame.app.clerk`
   - **Apple Team ID:** 10-char Team ID
   - **Apple Key ID:** Key ID for the `.p8`
   - **Apple Private Key:** full contents of the `.p8` (including
     `-----BEGIN PRIVATE KEY-----` / `-----END PRIVATE KEY-----`)
5. **Save**.

The "Authorized redirect URI" Clerk shows at the top of the Apple panel
**must** exactly match the Return URL in Apple Developer Portal
(Services ID config). Mismatch → `invalid_redirect_uri`.

### 2.2 Dev / preview instance (optional)

If you use a separate Clerk instance for `pk_test_...` dev builds, create
a **different Services ID** (e.g. `com.projectflame.app.clerk.dev`) with
the dev Clerk's redirect URL. Same `.p8` signing key works across both.

---

## Step 3 — Build & Verify

1. Bump the version in `apps/mobile/app.json` (already done: `1.0.12`).
2. Run an EAS production build using the project-scoped script (sets
   `EXPO_NO_CAPABILITY_SYNC=1` and `EXPO_APPLE_ID` for you — see
   Troubleshooting section on why the bare `eas build` command fails):

   ```sh
   cd apps/mobile
   pnpm build:ios:prod
   ```

3. Install on a physical iOS device (the simulator also works, but must be
   signed into iCloud).
4. Open the app → tap **Sign in** → tap **Sign in with Apple**.
5. You should see the native Sign in with Apple sheet. Choose "Share My
   Email" or "Hide My Email", then Face ID / Touch ID to confirm.
6. The app should land on the home tab, signed in.
7. Verify in the Clerk Dashboard → **Users** that a new user record was
   created with `apple_id` as the linked OAuth provider.
8. Verify in Supabase → `users` table that the corresponding row was
   created (via the Clerk webhook at `/api/webhooks/clerk`).

---

## Troubleshooting

### "invalid_client" / "invalid_request" on Apple's side

Means the Services ID, Team ID, Key ID, or private key doesn't match what
Apple has registered. Double-check each value in Clerk Dashboard.

### Native Apple sheet never appears, just a web view

Happens when the app is built without the Sign in with Apple entitlement.
Fix: confirm `ios.usesAppleSignIn: true` is in `app.json` and re-run the
EAS build. Verify in the EAS build logs that the entitlement was added
automatically.

### EAS build fails with `Failed to patch capabilities: [{ capabilityType: 'APPLE_ID_AUTH', option: 'OFF' }]`

The misleading error message from Apple is:

> _"The bundle '\<ID\>' cannot be deleted. Delete all the Apps related to this bundle to proceed."_

It has nothing to do with deletion — it's Apple's catch-all for refusing
a capability toggle. The real issue: EAS CLI's capability auto-sync
detects Apple capabilities primarily from your `plugins` array in
`app.json`. Because we use Clerk's `useSSO` instead of the
`expo-apple-authentication` plugin (intentional — Clerk handles the
full flow end-to-end), EAS thinks SIWA isn't needed and tries to toggle
the capability OFF on the bundle ID. Apple refuses because the
capability is already in use on submitted builds of the live app.

**Fix:** set `EXPO_NO_CAPABILITY_SYNC=1` in the **local shell**
environment (not `eas.json`). The capability sync step runs in the
local EAS CLI process on your Mac *before* the build is queued to EAS
servers — env vars declared in `eas.json`'s `env` block only reach the
remote build VM, which is too late. The env var must be visible to the
local CLI.

**Project-scoped fix (recommended — already wired up for this repo):**
`apps/mobile/package.json` defines build/submit scripts that inline both
`EXPO_NO_CAPABILITY_SYNC=1` and `EXPO_APPLE_ID` so you never have to
remember them:

```sh
# From apps/mobile/ (or pnpm --filter @project-flame/mobile <script>)
pnpm build:ios:prod   # eas build --profile production --platform ios
pnpm build:ios:dev    # eas build --profile development-device --platform ios
pnpm submit:ios       # eas submit --platform ios --latest
```

Both `build:ios:*` scripts set `EXPO_NO_CAPABILITY_SYNC=1` to skip the
EAS CLI's capability reconciliation step (which fails because Apple
refuses to toggle off `APPLE_ID_AUTH` while it's in use on submitted
builds). `submit:ios` does **not** set it — submit never touches
capabilities. Keeping capability-sync disabled only for this repo means
EAS still auto-reconciles capabilities for any unrelated Expo projects
you work on elsewhere.

Need a different profile (e.g. `testflight`)? Run `eas` directly with
the env vars inlined:

```sh
EXPO_NO_CAPABILITY_SYNC=1 EXPO_APPLE_ID=hello@flme.co eas build --profile testflight --platform ios
```

**Global shell export (explicit opt-in, NOT recommended):** only if you
*only* use your machine for this Flame repo. Add one line to `~/.zshrc`
(or `~/.bashrc` on bash):

```sh
export EXPO_NO_CAPABILITY_SYNC=1
```

Then `source ~/.zshrc` or open a new terminal. Applies forever, to
**every** Expo project on this machine — which means EAS will also stop
auto-syncing capabilities for unrelated Expo apps you work on. Prefer
the pnpm scripts above.

To remove a previously-set global export:

```sh
sed -i '' '/EXPO_NO_CAPABILITY_SYNC/d' ~/.zshrc && source ~/.zshrc
```

Either way, the capability sync step is skipped and the build proceeds
straight to credential validation. Apple Developer Portal state is
untouched.

This is safe because:

- Portal state is already correct (all capabilities were configured
  during initial rollout and 1.0.10 shipped successfully).
- Build-time entitlements are driven separately by `app.json` plugins
  (e.g. `expo-notifications` → push entitlement,
  `@stripe/stripe-react-native` → Apple Pay merchant entitlement,
  `ios.usesAppleSignIn: true` → SIWA entitlement,
  `ios.associatedDomains` → Universal Links entitlement).

Trade-off: new capabilities added in the future must be toggled
manually in <https://developer.apple.com>. Acceptable because capability
changes are rare and EAS's auto-detection is unreliable for
non-plugin-based entitlements anyway.

### "invalid_redirect_uri"

The Return URL in Apple Developer Portal (Services ID configuration) does
not exactly match the Authorized Redirect URI in Clerk. Copy the Clerk
value character-for-character — trailing slashes matter.

### User has a private-relay `@privaterelay.appleid.com` email

Expected — the user chose "Hide My Email" on the Apple sheet. Apple
forwards mail from our registered sender (`noreply@flme.co` via Brevo) to
their real inbox. See Step 1.5 — email relay is configured, so delivery
works. The Supabase `users.email` column stores the relay email.

If you ever see bounces on these addresses, check:

1. SPF still includes `_spf.apple.com` (see Step 1.5).
2. Apple dashboard: `flme.co` and `noreply@flme.co` both show ✓ SPF.
3. Brevo's delivery log — Apple's relay will 5xx the message if the
   sender isn't registered as an Email Source.

### First-time Apple sign-in creates user without `first_name` / `last_name`

Apple only releases the user's real name on **the very first** sign-in.
On subsequent sign-ins, only the Apple user ID is returned. If you want
to capture the name, make sure the Clerk webhook (already configured) is
firing and writing `first_name` / `last_name` into Supabase on the first
`user.created` event.

If a user accidentally revokes access from
`Settings → Apple ID → Password & Security → Apps Using Apple ID → Flame →
Stop Using Apple ID` and re-signs in, Apple treats it as a fresh account
(new Apple user ID, no name on the second "first" sign-in). This is an
Apple platform constraint and affects all SIWA-using apps.

---

## Optional / Future Reference

Items not required for App Store review. Log in backlog and revisit post-launch.

### Server-to-Server Notification Endpoint

Apple webhook that fires when a user:

- Revokes Sign in with Apple access
- Deletes their Apple ID
- Changes "Hide My Email" forwarding preferences

Useful for auto-deleting Flame accounts when a user revokes SIWA (rather
than leaving orphaned accounts they can't log back into).

**Implementation sketch:**

1. Build `/api/webhooks/apple-signin/route.ts` that verifies Apple's JWT
   (signed with Apple's public keys at `https://appleid.apple.com/auth/keys`).
2. On `event_type = "consent-revoked"` or `"account-delete"`, call the
   existing account-delete logic (`apps/web/app/api/user/delete/route.ts`)
   using the `sub` (Apple user ID) mapped back to a Clerk user.
3. In Apple Developer Portal → App ID → Sign in with Apple config, paste
   the webhook URL into **Server-to-Server Notification Endpoint**.

Tracked in `docs/historico/todos/EDGE_CASES_TODOS.MD`.

### Tighten DMARC policy

Current: `p=none` (observe only).

After 2–4 weeks of clean DMARC reports via Brevo's aggregator:

1. `p=quarantine` — suspicious mail → spam folder.
2. Eventually `p=reject` — suspicious mail dropped outright.

Protects the `flme.co` domain from spoofing / phishing impersonation.

### Add our own DMARC report destination

Right now aggregate reports only go to Brevo. To get independent visibility:

```txt
v=DMARC1; p=none; rua=mailto:rua@dmarc.brevo.com,mailto:dmarc@flme.co
```

Create `dmarc@flme.co` as a Google Workspace alias or forwarder first.

### End-to-end smoke test on Hide My Email users

After 1.0.12 ships, log one sign-up with "Hide My Email", purchase a
ticket, and confirm the Brevo send log shows delivery to the
`@privaterelay.appleid.com` relay + the user actually received it at
their real inbox. Worth checking once post-launch.

---

## Reference

- Apple HIG — Sign in with Apple: <https://developer.apple.com/design/human-interface-guidelines/sign-in-with-apple>
- App Store Review Guideline 4.8: <https://developer.apple.com/app-store/review/guidelines/#login-services>
- Clerk docs — Apple social connection: <https://clerk.com/docs/authentication/social-connections/apple>
- Expo docs — `usesAppleSignIn`: <https://docs.expo.dev/versions/latest/config/app/#usesapplesignin>
