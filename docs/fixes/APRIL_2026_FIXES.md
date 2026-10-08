# April 2026 Fixes

Continuing from `MARCH_2026_FIXES.md`. All entries follow the same format.

---

## Entries

### 1. Mobile `.env` Clerk/API URL mismatch — "session expired" on all API calls + push token registration failure (Apr 6, 2026)

**Three symptoms, two root causes.**

**Symptom 1 — Push token registration timeout:**

```text
[notifications] Failed to register push token: [ApiError: Request timed out for
/api/push-tokens/register. Check that EXPO_PUBLIC_API_URL (http://192.168.100.148:3000)
is reachable.]
```

- **Root cause:** The machine's local IP changed (DHCP/network switch). `EXPO_PUBLIC_API_URL` was pinned to `192.168.100.148` — the old IP. Metro was running on `192.168.100.156`. The web server was unreachable at the old IP.

**Symptom 2 — "Your session has expired" on create event / add admins / co-hosts (also seen on TestFlight):**

- **Root cause:** `apps/mobile/.env` uses the **live** Clerk publishable key (`pk_live_...`). The local web dev server uses **test** Clerk keys (`sk_test_...` in `apps/web/.env.local`). Live Clerk JWTs sent to the local server are validated against the test JWKS → rejected as invalid/expired on every authenticated API call (holds, create event, add members, etc.).

**Symptom 3 — Dev console warning `The action 'REPLACE' with payload {"name":"(tabs)"}...`:**

- Not a real bug. Expo Router logs this when `router.replace("/")` is called from inside a `fullScreenModal` stack (sign-in) before the parent navigator has remounted. Marked "development-only warning and won't be shown in production". Navigation completes correctly; the warning is noise.

**Fix:**

1. Updated `apps/mobile/.env` → `EXPO_PUBLIC_API_URL=http://192.168.100.156:3000` (current machine IP for local dev).
2. Updated `apps/web/.env.local` → switched from test Clerk keys (`sk_test_...`) to live Clerk keys (`sk_live_...`) so both mobile and local web server now validate against the same live Clerk JWKS.
3. Added clear comments to both files explaining the rule: **mobile live Clerk key requires a server also running live Clerk**. Never mix live and test Clerk keys across client and server.

**Note on `EXPO_PUBLIC_API_URL`:** The local IP will change again on network switches. When it does, check `Metro waiting on` in the terminal output — that URL contains the current IP — and update line 25 in `apps/mobile/.env` to match. Alternatively, use `https://flme.co` as the API URL when mobile is on live Clerk but you don't need to debug local API changes.

**TestFlight note:** The "session expired" errors on TestFlight builds were caused by the same Clerk key mismatch — the EAS build uses live Clerk but was hitting a local server with test keys (via a hardcoded IP in `.env` baked into older builds). With live Clerk keys now consistently used on both sides (or production URL `https://flme.co`), this is resolved for new builds.

- **Files:** `apps/mobile/.env`, `apps/web/.env.local`

---

### 2. Silence false `console.error` on sign-out in `useUserRole` (Apr 6, 2026)

- **Issue:** Signing out of an email/password account logged `ERROR [useUserRole] user-role fetch failed` with message `Failed to obtain Supabase token from Clerk (returned null)`. No crash, no user-facing impact — but a misleading error in the Metro console that looked like a real fault during sign-out.
- **Root cause:** Sign-out race condition. Clerk invalidates the session internally before `isSignedIn` transitions to `false` in React state. During this brief window `getToken({ template: "supabase" })` returns `null`, but the query's `enabled` guard (`isSignedIn && isConfigured && userId`) is still `true`. `getAuthenticatedClient` threw on the null token, caught in the outer try-catch, and logged as `console.error`.
- **Fix:** In `useUserRole`'s `queryFn`, pre-fetch the Supabase token with `try/catch` before any DB work. If `getToken` returns `null` (sign-out race), return the default unauthenticated state silently — no error logged. If `getToken` throws unexpectedly, log and re-throw so React Query can surface it. Pass the pre-fetched token directly to `createAuthenticatedClient` so `getToken` is only called once per query run. Replaced `getAuthenticatedClient` import with `createAuthenticatedClient` in `useUserRole.ts` (no API change to the 16 other callers that still use `getAuthenticatedClient`). _(Note: an earlier iteration of this fix used `.catch(() => null)`, which was refined to explicit `try/catch` in entry 3d so unexpected exceptions are no longer swallowed silently.)_
- **Files:** `apps/mobile/hooks/useUserRole.ts`

---

### 3. PR review fixes — auth overlay, unapproved org gate, org query error handling, tab loading guard (Apr 6, 2026)

Nine fixes from PR review of the push-notification + approval/payout changes.

**3a. Auth loading overlay never appeared after sign-in**

- **Issue:** After the `completeAuthAndRedirect` refactor (MARCH #7), the full-screen loading overlay in `RoleResolutionGate` (`isAuthRedirecting = true`) was never visible. `completeAuthAndRedirect` became synchronous (sets state only). React 18 auto-batches `setAuthRedirecting(true)` with the `finally` block's `setAuthRedirecting(false)` into a single render, so the overlay never flashed.
- **Fix:** Added a `let didNavigate = false` flag in all four auth handlers (`onGoogleAuth`, `onEmailSignIn`, `onEmailSignUp`, `onVerifyCode`). `finally` only calls `setAuthRedirecting(false)` when `!didNavigate`. On the success path, the overlay stays visible until the destination screen clears it.
- **Files:** `apps/mobile/hooks/useSignInHandlers.ts`

**3b. `useUserRole` `!user` early return missing `hasUnapprovedOrg`**

- **Issue:** The early-return path when the user has no DB row (`!user`, line ~74) returned `{ role, hasOrganization, memberRole }` without `hasUnapprovedOrg`. The other two paths (null-token guard and success path) both include it, creating an inconsistent return type.
- **Fix:** Added `hasUnapprovedOrg: false` to the `!user` early return.
- **Files:** `apps/mobile/hooks/useUserRole.ts`

**3c. `account.tsx` tab reset fired before role loaded**

- **Issue:** The effect that resets unauthorized tabs (e.g. `?tab=payouts` → `"personal"`) ran immediately with `role === "user"` while `useUserRole()` was still loading. Org users deep-linked to an org-only tab had their tab reset before the role query settled.
- **Fix:** Destructured `isLoading: roleLoading` from `useUserRole()`. Added `if (roleLoading) return` guard at the top of both the effect and `effectiveTab` derivation.
- **Files:** `apps/mobile/app/account.tsx`

**3d. `useUserRole` `getToken` swallowed all exceptions**

- **Issue:** `.catch(() => null)` on `getToken({ template: "supabase" })` silently swallowed network errors and unexpected Clerk exceptions. Only a `null` return (sign-out race) should be treated silently.
- **Fix:** Replaced `.catch(() => null)` with explicit `try/catch`. Null return → silent unauthenticated default (as before). Any thrown exception → `console.error` + rethrow so React Query can retry/surface it.
- **Files:** `apps/mobile/hooks/useUserRole.ts`

**3e. `useUserRole` organizations query silently ignored errors**

- **Issue:** `{ data: orgs }` destructuring dropped the `error` field. If the organizations approval query failed, `orgs` was `null/undefined`, `orgs?.some(...)` returned `false`, and org members were wrongly denied organizer access without any log entry.
- **Fix:** Destructured `{ data: orgs, error: orgsError }` and added `console.error` logging when `orgsError` is truthy. Downstream logic continues with `orgs = null` (conservative — user stays unauthenticated to hosting view) but the failure is now visible in logs.
- **Files:** `apps/mobile/hooks/useUserRole.ts`

**3f. `dashboard.tsx` pull-to-refresh didn't update approval banner**

- **Issue:** `handleRefresh` only called `refetch()` (tickets query). The pending-approval banner driven by `useUserOrgs` was never updated on pull-to-refresh — if an org was approved while the user had the screen open, the banner would persist until app restart.
- **Fix:** Destructured `refetch: refetchUserOrgs` from `useUserOrgs()`. `handleRefresh` now calls `Promise.all([refetch(), refetchUserOrgs()])`.
- **Files:** `apps/mobile/app/(tabs)/dashboard.tsx`

**3g. `org-dashboard.tsx` org query failure bypassed approval gate**

- **Issue:** `if (selectedOrg && !selectedOrg.approved)` is falsy when `selectedOrg` is `undefined`. If `useUserOrgs()` failed with a network/RLS error, the approval check was silently skipped and the full dashboard was rendered.
- **Fix:** Destructured `error: orgsError` from `useUserOrgs()`. Added an explicit `if (orgsError)` guard before the approval check — renders `PendingApprovalBanner` rather than the dashboard when org status can't be verified (fail closed).
- **Files:** `apps/mobile/app/(tabs)/org-dashboard.tsx`

**3h. `push-notifications.ts` EXPO_ACCESS_TOKEN warning logged on every send**

- **Issue:** The `console.warn` for a missing `EXPO_ACCESS_TOKEN` fired inside `sendToExpoPushService` on every push batch. High-volume sending (e.g., event notifications to many attendees) would flood server logs with repeated warnings.
- **Fix:** Added a module-level `warnedAboutMissingExpoAccessToken` boolean (initialized `false`). The warn is emitted and the flag set to `true` only on the first call per process.
- **Files:** `apps/web/app/lib/push-notifications.ts`

**3i. `APRIL_2026_FIXES.md` markdownlint MD001/MD040**

- **Issue:** The file jumped from H1 (`#`) directly to H3 (`###`), violating MD001 (heading levels must increment by one). The fenced code block for the push-token error log lacked a language tag (MD040).
- **Fix:** Inserted `## Entries` H2 between the H1 and first H3. Added `text` language tag to the fenced log block.
- **Files:** `docs/fixes/APRIL_2026_FIXES.md`

### 4. `Linking found multiple possible URI schemes` dev warning — expected, not a bug (Apr 6, 2026)

- **Issue:** Metro console shows `WARN Linking found multiple possible URI schemes in your Expo config. Using 'project-flame'. Ignoring: com.projectflame.app, com.projectflame.app.` on every app load.
- **Root cause:** `app.json` has `"scheme": ["project-flame", "com.projectflame.app"]` — two URL schemes registered intentionally (see MARCH_2026_FIXES.md entry #7). Expo's `Linking` API picks the first scheme (`project-flame`) for all deep links. The `com.projectflame.app` scheme is only needed for the Clerk OAuth callback (`com.projectflame.app://callback`) — a different code path.
- **Verdict:** Skip — intentional design. Deep links use `project-flame://`, OAuth callback uses `com.projectflame.app://`. The two do not conflict. The warning is Expo telling you it picked the first scheme as default, which is correct. No code change needed.
- **Files:** none

---

### 5. Sign-in navigation broken in production TestFlight builds — use CommonActions.reset fallback (Apr 6, 2026)

- **Issue:** After email/password or Google sign-in on a TestFlight production build, the app still got stuck on the sign-in screen, and clicking tabs pushed them as bottom sheets with no navbar.
- **Root cause:** Even with `router.push("/sign-in")`, if `useRequireAuth` is triggered on the initial app load (e.g. deep linking to a protected tab), the initial route is replaced and `router.canGoBack()` becomes `false`. The previous fallback `router.navigate("/(tabs)")` was pushing the tabs navigator _on top_ of the `fullScreenModal` stack, causing the tabs to inherit the modal presentation style (bottom sheets, no navbar).
- **Fix:**
  1. **`lib/navigation.ts`:** Changed the fallback from `router.navigate("/(tabs)")` to `CommonActions.reset({ index: 0, routes: [{ name: "(tabs)" }] })`. This uses the underlying React Navigation API to completely tear down the modal stack and mount the tabs as the root, bypassing Expo Router's buggy `replace` behavior for modals.
  2. **`SignInBackButton.tsx`:** Updated the "Go Back" button to use the same `CommonActions.reset` fallback when canceling sign-in to prevent the back-loop.
  3. **`useSignInHandlers.ts`:** Passed the `navigation` object to `navigateBackOrTabs`.
- **Files:** `apps/mobile/lib/navigation.ts`, `apps/mobile/components/sign-in/SignInBackButton.tsx`, `apps/mobile/hooks/useSignInHandlers.ts`

### 6. Harden CommonActions.reset sign-in fix — scoping bug, remove broken fallback, fix stale docs (Apr 6, 2026)

Three hardening fixes on entry #5's `CommonActions.reset` navigation fix. Without these, entry #5 would crash on every successful sign-in.

**6a. `let didNavigate` block scoping bug — ReferenceError on every sign-in success**

- **Issue:** In all four auth handlers (`onGoogleAuth`, `onEmailSignIn`, `onEmailSignUp`, `onVerifyCode`), `let didNavigate = false` was declared inside the `try` block but referenced in the `finally` block. JavaScript `let` is block-scoped — `try` and `finally` are separate blocks. On every successful sign-in, `finally` would throw `ReferenceError: didNavigate is not defined`, crashing the app instead of navigating.
- **Root cause:** The `didNavigate` flag was added inside `try` (next to the navigation logic that sets it) rather than before `try` (where `finally` can access it).
- **Fix:** Moved `let didNavigate = false` to before the `try` block in all four handlers.
- **Files:** `apps/mobile/hooks/useSignInHandlers.ts`

**6b. Made `navigation` parameter required in `navigateBackOrTabs` — removed broken fallback**

- **Issue:** `navigateBackOrTabs(router, navigation?)` accepted `navigation` as optional. The `else` branch fell back to `router.replace("/(tabs)")` when `navigation` was not provided — the exact same Expo Router API that silently fails in production standalone builds (the original bug from entry #5). Any future caller omitting `navigation` would silently regress to the broken behavior.
- **Fix:** Changed the signature to require `navigation: { dispatch: (action: any) => void }`. Removed the `router.replace` fallback entirely. TypeScript now enforces that every caller provides the React Navigation dispatch handle.
- **Files:** `apps/mobile/lib/navigation.ts`

**6c. Removed dead `useRouter` import and call in `SignInBackButton`**

- **Issue:** After refactoring `onPress` to use `navigation.dispatch(CommonActions.reset(...))` in entry #5, the `useRouter` import and `const router = useRouter()` call were left behind. `router` is never referenced — dead code adding unnecessary hook overhead per render.
- **Fix:** Removed the `useRouter` import and `router` variable. Component now only imports `useNavigation` from `expo-router`.
- **Files:** `apps/mobile/components/sign-in/SignInBackButton.tsx`

**6d. Updated stale docstring in `useRequireAuth`**

- **Issue:** File-level JSDoc still said "Uses router.replace to avoid back-loop" and "SignInBackButton uses router.replace('/(tabs)')". The code was changed to `router.push` (entry #5) and `CommonActions.reset` respectively. Stale docs would mislead anyone maintaining the auth flow.
- **Fix:** Rewrote the docstring to accurately describe the current push + CommonActions.reset pattern.
- **Files:** `apps/mobile/hooks/useRequireAuth.tsx`

---

### 7. Remove `router.back()` / `canGoBack()` entirely — always use `CommonActions.reset` (Apr 6, 2026)

- **Issue:** Entry #5's fix still failed in both production (TestFlight) and dev (Metro). After sign-in, the app showed one spinner then immediately returned to the sign-in screen. Dev console: `ERROR The action 'GO_BACK' was not handled by any navigator. Is there any screen to go back to?`
- **Root cause:** `router.canGoBack()` is unreliable inside Expo Router `fullScreenModal` stacks. It returns `true` but the `GO_BACK` action is dispatched to a navigator that has no screen to go back to. This is a known Expo Router bug — `canGoBack()` checks state at a different navigator level than where the action is handled. The "try back, fallback to reset" strategy from entry #5 was fundamentally broken because the `canGoBack()` gate can never be trusted from a modal.
- **Fix:**
  1. **`lib/navigation.ts`:** Replaced `navigateBackOrTabs(router, navigation)` with `navigateToTabs(navigation)`. Removed `router` parameter, `canGoBack()` check, and `router.back()` path entirely. The function now always dispatches `CommonActions.reset` unconditionally. Removed unused `Router` type import.
  2. **`useSignInHandlers.ts`:** Updated all four handlers to call `navigateToTabs(navigation)` and set `didNavigate = true`. Removed `useRouter` import (no longer needed — `router` was only used for `navigateBackOrTabs`). Removed unused `AuthSession` import. Simplified `didNavigate` logic: always `true` on success since `navigateToTabs` always navigates.
- **Why this works:** `CommonActions.reset` bypasses Expo Router's buggy navigation state entirely. It tells the underlying React Navigation to discard the current stack and mount `(tabs)` as the root. No `canGoBack()` check, no `router.back()`, no `router.replace()`, no `router.navigate()` — none of which work reliably from inside a `fullScreenModal` in production standalone builds.
- **Files:** `apps/mobile/lib/navigation.ts`, `apps/mobile/hooks/useSignInHandlers.ts`

---

### 8. `RoleResolutionGate` unmounting Stack during loading wiped `CommonActions.reset` — keep Stack always mounted (Apr 6, 2026)

- **Issue:** Even after entry #7 removed `canGoBack()` and always dispatched `CommonActions.reset`, sign-in still failed in Metro dev: after success the app showed one brief spinner then returned to the sign-in screen.
- **Root cause:** `CommonActions.reset` dispatches the action to the currently mounted navigator, but then Clerk's session change fires → `useViewMode` receives a new `userId` → `setIsHydrated(false)` in the effect → `isLoading = true` in `RoleResolutionGate`. The old `if (isLoading) return <Spinner />` guard **completely unmounted the `<Stack>`**. The `CommonActions.reset` action was lost — the navigator it was targeting no longer existed. When loading finished, the Stack remounted fresh with the URL still at `/sign-in`, routing the user back to the sign-in screen.
- **Fix:** Removed the `if (isLoading) return <Spinner />` early return from `RoleResolutionGate`. The `<Stack>` is now always mounted unconditionally. When `isLoading` is true (or `isAuthRedirecting`), a full-screen overlay (`zIndex: 9999`, `bg-background`) is rendered on top of the Stack so the UI is still blocked. The overlay shows the simple `ActivityIndicator` during `isLoading`, and the `FlameLogo + ActivityIndicator` during `isAuthRedirecting && !isLoading` (the auth-complete transition visual). `CommonActions.reset` now always has a live navigator to target, regardless of Clerk's session hydration race.
- **Files:** `apps/mobile/components/navigation/RoleResolutionGate.tsx`

---

### 9. "Your session has expired" on all authenticated API calls in TestFlight — `flme.co` 307 redirect strips Authorization header (Apr 6, 2026)

⚠️ **Recurring pattern** — this class of bug has appeared before (Clerk webhooks, Stripe webhook URLs). See "Known Production Gotchas" in `README.md` for the canonical rule.

- **Issue:** Every authenticated API call from a TestFlight production build returned 401, triggering the "Your session has expired. Please sign in again." error. Affected: `/api/push-tokens/register`, `/api/holds/create`, `/api/organizer/search-users`, `/api/organizations/members/remove`, and all other authenticated routes. Local dev (Metro) worked fine.
- **Root cause:** `EXPO_PUBLIC_API_URL` in `eas.json` was `https://flme.co`. Vercel's primary domain for the project is `www.flme.co` — requests to `flme.co` return a `307 Temporary Redirect` to `https://www.flme.co`. The `fetch()` API strips the `Authorization` header when following a cross-origin redirect (different hostname), as required by the Fetch spec for security. The redirect destination received the request with no auth token, `auth()` returned `null`, and the route handler returned 401.
- **Why local dev was unaffected:** Metro dev builds hit `localhost:3000` directly — no redirect, no header stripping.
- **Fix:** Changed `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_APP_URL` from `https://flme.co` to `https://www.flme.co` in both the `production` and `development-device` profiles in `apps/mobile/eas.json`. Requests now go directly to the canonical domain with no redirect, so the Authorization header is always preserved.
- **Files:** `apps/mobile/eas.json`, `README.md` (new "Known Production Gotchas" section)

---

### 10. Stakeholder refresh — `FLAME_PLATFORM_OVERVIEW.md` aligned with live web + iOS (Apr 7, 2026)

- **Issue:** `docs/FLAME_PLATFORM_OVERVIEW.md` still described iOS as “coming,” omitted co-hosts, team/event assignments, RSVP access codes and custom questions, push + in-app notifications, and mobile create/edit — misleading for partner-facing reviews.
- **Fix:** Rewrote the overview in the same table-first, non-technical tone: **Prepared** date April 7, 2026; **Part 1** reframed as live on **web and iOS** with new attendee and organizer rows; **Part 2** present-tense iOS experience (including organizer depth and notification inbox); **Part 3** “one platform, two front doors”; **Part 4** comparison table as “at a glance”; **Summary** updated. Presenting **organizer capabilities (co-hosts, assignments, mobile workflow)** as the unified product story for stakeholders.
- **Files:** `docs/FLAME_PLATFORM_OVERVIEW.md`, `docs/README.md` (Quick Links — stakeholder overview)

---

### 11. `getBaseUrl()` stripped `www.` — breaking Stripe Connect return URLs and internal API calls (Apr 7, 2026)

- **Issue:** `getBaseUrl()` in `apps/web/app/lib/utils/url.ts` contained a normalization step that stripped `www.` from the URL: `normalizedUrl.replace(/^https?:\/\/www\./, "https://")`. With `NEXT_PUBLIC_APP_URL = "https://www.flme.co"` (the correct canonical domain), every call to `getBaseUrl()` returned `https://flme.co` — the non-canonical domain that Vercel 307-redirects. This affected Stripe Connect return/refresh URLs (Stripe doesn't follow redirects for OAuth return URLs) and any internal server-side fetch calls that used `getBaseUrl()` as a base.
- **Root cause:** The comment said "prevents 404s when www.flme.co is used but not properly configured" — but `www.flme.co` IS the canonical domain and non-www is the one that redirects. The normalization had the logic backwards.
- **Fix:** Removed the `www.` stripping line. `getBaseUrl()` now only removes trailing slashes, returning `NEXT_PUBLIC_APP_URL` verbatim (`https://www.flme.co`).
- **Files:** `apps/web/app/lib/utils/url.ts`

---

### 12. Brevo rejects ticket email requests — Vercel Lambda IP not in authorized list (Apr 7, 2026)

- **Issue:** After payment succeeded, the ticket confirmation email failed with Brevo 401: `"We have detected you are using an unrecognised IP address 54.224.146.101"`. The order was created and linked correctly — only the email was skipped.
- **Root cause:** Brevo's "Authorized IPs" security feature was enabled. Vercel serverless functions run on rotating AWS Lambda IPs that change with every deployment and cold start — they cannot be statically whitelisted.
- **Fix (account setting, not code):** Go to [Brevo → Settings → Security → Authorized IPs](https://app.brevo.com/security/authorised_ips) and remove all IP entries. Brevo's IP restriction is designed for on-premise servers with static IPs. For Vercel/cloud deployments, rely on API key security only.
- **Files:** none (Brevo dashboard change)

---

### 13. Mobile event detail Zod rejected `events.description: null` — "Invalid event data" (Apr 7, 2026)

- **Issue:** Opening published event **Mijin** (and any event with no short description) showed **Unable to load event** / thrown **Invalid event data** on iOS. `get_event_with_tiers` returns `"description": null` for empty descriptions.
- **Root cause:** `EventSchema` in `useEventDetails.ts` used `z.string().optional()` for `description` and `image_url`. Zod treats `optional()` as `undefined` only, not `null`, so Postgres `NULL` fails parse (same class as FEB_2026_FIXES ticket tier `description` null).
- **Fix:** Use `z.string().nullish()` for `description` and `image_url` on the event object.
- **Files:** `apps/mobile/hooks/useEventDetails.ts`

---

### 14. Organizer sees "Event Not Found" when viewing events for non-primary org (Apr 8, 2026)

- **Issue:** Organizers who are members of multiple organizations (e.g. an organizer account in 6 orgs) saw **Event not found** in `org-event-detail.tsx` when navigating to events belonging to any org that was **not their first-joined org**. For example: switching the dashboard to "FLAME" then tapping a Flame event showed "Event not found", while events for the first org always worked.
- **Root cause:** `org-event-detail.tsx` called `useOrgEvents()` with no argument. `useOrgEvents()` falls back to `useOrgData()` which always returns the user's **oldest org membership** (`.order("created_at").limit(1)`). When the user switched orgs in the dashboard (tracked in `MemberRoleContext.selectedOrgId`), `useOrgEvents()` ignored the selection and still queried the first org's events. The Flame event ID was not found in the first org's event list → `event = null` → "Event not found".
- **Investigation red herrings:** The `get_event_with_tiers` RPC status filter was also improved (now allows org members to bypass the published filter via `get_user_organizations()`), and `useEventDetails` was updated to use `getAuthenticatedClient` when signed in — both valid hardening improvements. But the actual crash was the `useOrgEvents()` missing `selectedOrgId` in `org-event-detail.tsx`. All affected events were `status = 'published'` and returned correctly from the DB.
- **Fix:** Changed `useOrgEvents()` → `useOrgEvents(selectedOrgId)` in `org-event-detail.tsx`. `selectedOrgId` comes from `useMemberRoleContext()` which is already in scope and correctly tracks the dashboard's selected org.
- **Files:** `apps/mobile/app/org-event-detail.tsx`, `supabase/migrations/20260408003743_fix_get_event_with_tiers_org_bypass.sql`, `apps/mobile/hooks/useEventDetails.ts`

---

### 14a. Promotional cards and Edit flow blank for non-primary org events (Apr 8, 2026)

- **Issue:** After #14 fixed the "Event not found" crash, the 4 expandable promotional sections (purchases, promo codes, promoter links, promotional tickets) remained empty and the **Edit** button showed "no event selected" — but only for events belonging to any org that wasn't the user's first-joined org.
- **Root cause:** `useOrgEventEnriched` → `useOrgEnrichedAll` → `useOrgData()` has the same first-org-only bug: `useOrgData` always queries `organization_members` ordered by `created_at LIMIT 1`, returning the oldest org membership regardless of which org is selected in the dashboard. This means `orgSlug` inside the hook always points to org #1, so the `/api/organizer/data?org=<slug>` API call returns data for the wrong org and `enrichedEvent` is `null` for any other org's event. `edit-event.tsx` had the identical bug — `useOrgEvents()` with no arg so `selectedEvent` was always `null` for non-primary orgs.
- **Fix:**
  1. Added optional `orgId?: string | null` param to `useOrgData()`. When provided, the membership query adds `.eq("organization_id", orgId)` instead of `.order("created_at").limit(1)`. Query key updated to `["org-data", userId, orgId ?? null]` for per-org caching.
  2. Threaded `orgId` through `useOrgEnrichedAll(orgId?)` → `useOrgData(orgId)` and `useOrgEventEnriched(eventId, orgId?)` → `useOrgEnrichedAll(orgId)`. All existing callers without `orgId` retain the same behaviour.
  3. `org-event-detail.tsx`: `useOrgEventEnriched(id, selectedOrgId)` — passes the dashboard's selected org.
  4. `edit-event.tsx`: added `useMemberRoleContext()`, changed `useOrgEvents()` → `useOrgEvents(selectedOrgId)` so `selectedEvent` resolves correctly.
- **Files:** `apps/mobile/hooks/useOrgData.ts`, `apps/mobile/hooks/useOrgEventEnriched.ts`, `apps/mobile/app/org-event-detail.tsx`, `apps/mobile/app/edit-event.tsx`

---

### 14b. Org event detail — promotional sections slow to load + co-host org shows no data (Apr 8, 2026)

- **Issue A (performance):** On first open of an org event, 3 of the 4 expandable sections (purchases, promo codes, promoter links) appeared blank then loaded slowly. "Send Tickets" showed immediately. On subsequent events the 4 sections loaded instantly.
- **Root cause A:** `useOrgEnrichedAll(orgId)` calls `useOrgData(orgId)`, but that query was never pre-warmed for the selected org's ID — it only ever ran for the first org (called from `MemberRoleContext` with no arg). Result: two sequential async operations on first open — DB round-trip to resolve org slug, then the `/api/organizer/data` web API call. "Send Tickets" (which uses `useOrgEvents` — a direct Supabase query with its own cache) was unaffected.
- **Fix A:** Changed `MemberRoleContext` to call `useOrgData(selectedOrgId)` instead of `useOrgData()`. Since the provider is always mounted, the moment the user switches orgs the `useOrgData(selectedOrgId)` query runs in the background. By the time they navigate to an event detail screen, the org slug is already in cache — `useOrgEnrichedAll` can start the API call immediately on mount.
- **Issue B (co-host):** When `selectedOrgId` is a **co-host** org (not the event owner), the 4 promotional sections showed no data and the Edit button showed "event not found".
- **Root cause B (enriched data):** `useOrgEventEnriched(id, selectedOrgId)` fetched enriched data from the co-host org's API endpoint (`/api/organizer/data?org=cohostSlug`). That endpoint only returns events **owned** by the co-host org; the co-hosted event lives under the **owner** org's data. So `enrichedEvent` was always `null` for co-hosted events.
- **Root cause B (edit "event not found"):** `useOrgEvents(selectedOrgId)` only queried `WHERE organization_id = selectedOrgId`. Co-hosted events have `organization_id = ownerOrgId`, so they weren't in the list and `selectedEvent` was `null` in `edit-event.tsx`.
- **Fix B — `useOrgEvents`:** Refactored to a two-step query: (1) fetch `event_id` from `event_assignments WHERE cohost_organization_id = orgId`, then (2) query events with `OR organization_id = orgId OR id IN (co-hosted event IDs)`. Co-hosted events now appear alongside owned events in the management list, fixing both the event resolution and Edit screen.
- **Fix B — enriched data:** In `org-event-detail.tsx`, derive `ownerOrgId = event?.organization_id ?? selectedOrgId` from the resolved event before calling `useOrgEventEnriched`. For owned events `organization_id === selectedOrgId` so no change. For co-hosted events `organization_id` is the owner org → enriched data is fetched from the correct org's API.
- **Follow-up UX fix (staggered pop-in):** Even after the pre-warm, the 3 enriched section cards used `enrichedEvent &&` — they literally didn't mount until data arrived, causing them to pop in after "Send Tickets". Fixed by replacing `enrichedEvent &&` with an `EnrichedSectionSkeleton` component (card shell + `ActivityIndicator`) shown while `enrichedLoading && !enrichedEvent`. All 4 sections are always mounted from first render; the 3 enriched ones transition from skeleton → full card in-place with no layout shift. Industry standard skeleton pattern (Eventbrite/Stripe Dashboard).
- **Note:** Enriched data for pure co-host scenarios (user is member of co-host org but NOT of owner org) is still deferred — `useOrgData(ownerOrgId)` will return null for those users. Tracked in `EDGE_CASES_TODOS.MD`.
- **Files:** `apps/mobile/contexts/MemberRoleContext.tsx`, `apps/mobile/hooks/useOrgEvents.ts`, `apps/mobile/app/org-event-detail.tsx`

---

### 15. Fixed 7 Supabase RLS security lints — 3 SECURITY DEFINER views + 4 tables with RLS disabled (Apr 8, 2026)

- **Issue:** Supabase linter flagged 7 ERROR-level security issues: 3 views defined as `SECURITY DEFINER` and 4 public tables with RLS disabled, all exposed to PostgREST.
- **Fix — 3 × SECURITY DEFINER views** (`v_active_holds_by_stage`, `holds_at_risk_of_expiration`, `holds_with_active_payments`):
  - These are internal admin/monitoring views; no application code queries them via PostgREST.
  - Set `security_invoker = true` on all three so queries run with the caller's permissions (respecting RLS on the underlying `holds` / `events` / `ticket_tiers` tables rather than the `postgres` superuser's permissions).
  - Revoked `anon` and `authenticated` grants — these views are service_role-only (Supabase Studio / `supabaseAdmin`).
- **Fix — `ticket_tiers_price_backup` + `ticket_stages_price_backup`** (backup tables from the Jan 2026 price migration):
  - No application code accesses these via PostgREST. Enabled RLS with no policies → service_role bypasses RLS; anon/authenticated are denied.
- **Fix — `promoter_links`**:
  - Enabled RLS. Added a `SELECT` policy for `anon` + `authenticated` (`USING (true)`) so the mobile checkout flow can validate promoter codes. `useCheckout.ts` uses the anon Supabase client to check `SELECT id FROM promoter_links WHERE event_id = $1 AND promoter_code = $2`. All INSERT/UPDATE/DELETE continue via `supabaseAdmin` (service_role).
- **Fix — `user_sync_queue`** (Clerk webhook queue): Enabled RLS with no policies — only service_role (Clerk webhooks/cron) should access this.
- **Fix — `rsvp_pending_requests`**: Enabled RLS with no policies — all access goes through web API routes using `supabaseAdmin`.
- **Files:** `supabase/migrations/20260408011955_fix_rls_security_lints.sql`

---

### 16. Forgot password flow — new mobile screens using Clerk reset_password_email_code (Apr 7, 2026)

- **Issue:** Mobile app had no way for users to reset a forgotten password. Web uses Clerk's hosted UI, but mobile needs custom screens via the Clerk React Native SDK.
- **Fix:**
  1. Created `apps/mobile/app/forgot-password.tsx` — email entry screen that calls `signIn.create({ strategy: 'reset_password_email_code', identifier })` to send a 6-digit code.
  2. Created `apps/mobile/app/reset-password.tsx` — code + new password screen that calls `signIn.attemptFirstFactor()` then `signIn.resetPassword()` to complete the flow and sign the user in.
  3. Added "Forgot password?" link to `CredentialsForm.tsx` (sign-in mode only), navigating to `/forgot-password`.
  4. Registered both screens as `fullScreenModal` routes in `RoleResolutionGate.tsx`.
- **Files:** `apps/mobile/app/forgot-password.tsx`, `apps/mobile/app/reset-password.tsx`, `apps/mobile/components/sign-in/CredentialsForm.tsx`, `apps/mobile/components/navigation/RoleResolutionGate.tsx`

---

### 17. Share icon wired on Event Detail screen (Apr 7, 2026)

- **Issue:** The event detail screen had no share functionality, so users couldn't share event links.
- **Fix:** Added `handleShare` callback to `apps/mobile/app/event/[id].tsx` using `Share.share()` with the event slug URL (`https://flme.co/events/{slug}`), matching the pattern already used on the organizer page. Wired into the existing share icon in `EventHero`.
- **Files:** `apps/mobile/app/event/[id].tsx`

---

### 18. Past events shown on Organizer page (Apr 7, 2026)

- **Issue:** `useAppEvents` filters to `.gt("ends_at", now)` so past events never appeared on organizer public pages — attendees couldn't browse an org's history.
- **Root cause:** The "Load Once, Cache Locally" pattern in `useAppEvents` is intentional for the main events feed, but the organizer profile page needs to show historical events too.
- **Fix:**
  1. Created `apps/mobile/hooks/usePastOrgEvents.ts` — lightweight hook that queries Supabase for `status = 'published' AND ends_at <= now AND organization_id = orgId`, ordered most-recent-first. Uses the anon client (published events are public). Maps results to `EventCardData` via the shared `mapEventToCardData` (exported from `useAppEvents.ts`).
  2. Added `pastEvents?: EventCardData[]` and `pastEventsLoading?: boolean` props to `EventsScreenBody`. Renders a collapsible "Past Events" section (chevron toggle, collapsed by default) below the active events list — only when the prop is supplied so other consumers of `EventsScreenBody` are unaffected.
  3. Wired `usePastOrgEvents(org?.id)` into `apps/mobile/app/organizer/[slug].tsx` and passed `pastEvents` / `pastEventsLoading` to `EventsScreenBody`.
- **Files:** `apps/mobile/hooks/usePastOrgEvents.ts` (new), `apps/mobile/hooks/useAppEvents.ts`, `apps/mobile/components/events/EventsScreenBody.tsx`, `apps/mobile/app/organizer/[slug].tsx`

---

### 19. "All cities" filter pill + Google Places autocomplete for create event city field (Apr 8, 2026)

- **Issue (Part A):** The home screen had a generic sliders icon button for opening filters. Users couldn't tell at a glance which city filter was active, and the icon didn't communicate the primary filter purpose (city selection).
- **Fix (Part A):** Replaced the sliders icon `Pressable` in `EventsHero` with a labeled city pill showing `selectedCity ?? "All cities"`. Active state: `bg-white-100 text-dark` (inverted pill). Inactive state: `bg-white-10 text-white-80`. Added `selectedCity` prop threading through `HomeFeedList` → `EventsHero` → wired from `useEventFilters` in `index.tsx`.
- **Issue (Part B):** City field in create event and edit event was a free-text input. Organizers could enter inconsistent city names (typos, abbreviations), making city-based filtering unreliable.
- **Fix (Part B):**
  1. Installed `react-native-google-places-autocomplete` in `apps/mobile`.
  2. Created `apps/mobile/components/create-event/CityAutocompleteField.tsx` — wraps Google Places with `types: '(cities)'`, Flame dark-theme styling, and falls back to a disabled message when `EXPO_PUBLIC_GOOGLE_PLACES_API_KEY` is not set.
  3. Replaced city `FormInput` in `EventDetailsTab.tsx` and city `FilledInput` (edit mode) in `EditEventDetailsTab.tsx` with `CityAutocompleteField`.
  4. Replaced hardcoded `DEFAULT_TIMEZONE = "America/Guayaquil"` with `Intl.DateTimeFormat().resolvedOptions().timeZone` in both `EventDetailsTab.tsx` and `create-event.tsx` so new events default to the organizer's device timezone.
- **Files:** `apps/mobile/components/events/EventsHero.tsx`, `apps/mobile/components/home/HomeFeedList.tsx`, `apps/mobile/app/(tabs)/index.tsx`, `apps/mobile/components/create-event/CityAutocompleteField.tsx` (new), `apps/mobile/components/create-event/EventDetailsTab.tsx`, `apps/mobile/components/events-management/EditEventDetailsTab.tsx`, `apps/mobile/app/(tabs)/create-event.tsx`
- **Web parity:** Logged in `CRUCIAL_IOS_TO_WEB_TODOS.md` #19 — city filter pill on events page, Google Places for `CreateEventForm.tsx`, device timezone default.

---

### 20. Ticket quantity field stuck at "1" when typing — local quantityText state (Apr 8, 2026)

- **Issue:** In `EditableTierCard`, typing in the "Total tickets quantity" field was impossible — deleting all digits caused `parseInt("", 10) = NaN`, which clamped immediately to `1` and re-rendered "1" in the input, blocking any edit.
- **Root cause:** The `onChangeText` handler called `updateTier` synchronously on every keystroke with a min-1 clamp, same anti-pattern that was already fixed for `priceText`.
- **Fix:** Added `quantityText` local state (initialized from `tier.quantity_total`), displayed in the input. Added `flushQuantityToTier` callback (mirrors `flushPriceToTier`) that validates and clamps to min 1 on blur before writing to the tier. Added a sync `useEffect` so `quantityText` stays in step when `quantity_total` changes externally (e.g. after adding/removing a stage).
- **Files:** `apps/mobile/components/create-event/EditableTierCard.tsx`

---

### 23. PR review: Clerk password-reset flow uses correct v2 legacy API (Apr 8, 2026)

- **Review finding:** Reviewer suggested replacing `signIn.create({ strategy: 'reset_password_email_code', identifier })` with a separate `signIn.resetPasswordEmailCode.sendCode()` call, and replacing `signIn.attemptFirstFactor()` with `signIn.resetPasswordEmailCode.verifyCode()`. Both suggestions are for `@clerk/expo` v3+ (new package) and do not apply to this project, which uses `@clerk/clerk-expo` v2.19.30 (legacy API).
- **Decision (no change):** In the v2 legacy API, `signIn.create({ strategy: 'reset_password_email_code', identifier })` is the correct method for sending the email code. `signIn.attemptFirstFactor()` is the correct code-verification method. `signIn.resetPasswordEmailCode` only exists on `SignInFutureResource` (v3+), not on `SignInResource` returned by `useSignIn()` in v2. Confirmed against Clerk legacy docs and `@clerk/shared/dist/types/index.d.ts` line 3682/3771/3790–3791.
- **Fix:** Removed dead-code variable `previouslyAllFilled` in `reset-password.tsx` `handleDigitChange` that was computed but never read (scaffolded for auto-submit-on-complete but never wired up).
- **Files:** `apps/mobile/app/reset-password.tsx`

---

### 24. PR review fixes — batch 2 (Apr 8, 2026)

- **Bug 1 (EventsScreenBody city pill):** `EventsScreenBody` destructured `selectedCity` but never passed it to `EventsHero`. The city pill always showed "All cities" regardless of active filter. Fixed: added `selectedCity={selectedCity}` to the `EventsHero` call in `EventsScreenBody`.
- **Bug 2 (unused dependency):** `react-native-google-places-autocomplete` was listed in `package.json` but never imported — `CityAutocompleteField` uses raw `fetch` to the Google Places HTTP API. Removed the library from `apps/mobile/package.json`.
- **`handleShare` defensive guard:** Added `if (!event.slug)` guard with a console.warn to prevent `https://flme.co/events/undefined` being shared if slug is missing.
- **`EnrichedSectionSkeleton` ActivityIndicator color:** Changed `rgba(255,255,255,0.35)` → `'#FFFFFF'` per design system rule (in-content spinners on dark surfaces must use literal `#FFFFFF`).
- **`reset-password.tsx` nav stack reset:** Replaced `router.dismiss()` with `navigateToTabs(navigation)` (using `useNavigation` + `CommonActions.reset`) so the nav stack is fully reset to tabs after a successful password reset, consistent with all other sign-in completion handlers.
- **`CityAutocompleteField` parent sync:** `handleChangeText` now calls `onCitySelect(text)` on every keystroke so the parent form value stays in sync with what the user typed — even if they never select from the dropdown.
- **`useEventDetails` query key:** Changed `!!isSignedIn` → `userId ?? "anon"` so each user's event cache is keyed by identity, preventing one user's org-bypass data from leaking into another user's cache via shared device/session.
- **`useOrgEvents` silent co-host error:** Destructured `error` from the `event_assignments` fetch and throw it — previously errors were silently swallowed, producing an empty co-host list with no signal to callers.
- **`url.ts` trailing slash regex:** Changed `.replace(/\/$/, "")` → `.replace(/\/+$/, "")` to strip multiple consecutive trailing slashes instead of just one.
- **Nitpicks:** Removed duplicate import-level TODO comments from `LegacyHomeContent.tsx` and `DiscoverContent.tsx` (JSX-level TODOs preserved). Added clarifying comment above the `as never` cast in `CredentialsForm.tsx`. Updated NITPICKS_TODOS.md Clerk migration entry to reference the correct package name (`@clerk/expo` v3+).
- **Deferred:** Co-host enriched data bypass, Google Places API key server proxy, MemberRoleContext pre-warm cache key, `usePastOrgEvents` structured logging, `promoter_links` USING(true) RLS — all logged to `EDGE_CASES_TODOS.MD` / `NITPICKS_TODOS.md`.
- **Skipped:** `usePastOrgEvents` anon client — intentional design, published events are public.
- **Files:** `apps/mobile/components/events/EventsScreenBody.tsx`, `apps/mobile/package.json`, `apps/mobile/app/event/[id].tsx`, `apps/mobile/app/org-event-detail.tsx`, `apps/mobile/app/reset-password.tsx`, `apps/mobile/components/create-event/CityAutocompleteField.tsx`, `apps/mobile/hooks/useEventDetails.ts`, `apps/mobile/hooks/useOrgEvents.ts`, `apps/web/app/lib/utils/url.ts`, `apps/mobile/components/home/LegacyHomeContent.tsx`, `apps/web/app/components/discover/DiscoverContent.tsx`, `apps/mobile/components/sign-in/CredentialsForm.tsx`

---

### 25. PR review fixes — batch 3 (Apr 8, 2026)

- **Critical: lockfile out of sync (Vercel build broken):** Removing `react-native-google-places-autocomplete` from `package.json` (batch 2) did not regenerate `pnpm-lock.yaml`. Vercel's `--frozen-lockfile` check failed. Fixed: ran `pnpm install` to sync the lockfile.
- **`CityAutocompleteField` debounce cleanup:** `debounceRef.current` was set in `handleChangeText` but never cleared on unmount. If the component unmounted while a 300ms debounce was pending, `fetchPredictions` (and `setPredictions`) would fire on an unmounted component. Fixed: added a `useEffect` cleanup that calls `clearTimeout(debounceRef.current)`. Also wrapped `fetchPredictions` in `useCallback` for stable identity.
- **`CityAutocompleteField` silent fetch error:** Empty `catch {}` swallowed prediction-fetch failures with no trace. Fixed: changed to `catch (error)` with `console.error("[CityAutocompleteField] failed to fetch predictions", error)`.
- **`useEventDetails` token-fetch fallback:** If `getAuthenticatedClient(getToken)` throws (e.g., Clerk token refresh fails on a flaky network), the entire `queryFn` would throw to React Query's error state, showing an error screen for a public event. Fixed: wrapped the authenticated-client branch in try/catch; on failure, logs the error and falls back to the anon `supabase` client so published events still load.
- **`OrgEventTier` nullable fields:** `per_user_limit`, `sales_start`, `sales_end` were typed as non-nullable (`number` / `string`) in the `OrgEventTier` interface, but the Supabase columns can be NULL. The `as unknown as OrgEvent[]` cast was hiding the mismatch. Fixed: changed all three to nullable (`number | null` / `string | null`) matching `@project-flame/lib`'s `TicketTier` types. Also fixed `EditTiersTab.tsx` which called `String(tier.per_user_limit)` without a null guard (would display "null" string in the edit field); changed to `String(tier.per_user_limit ?? 0)` in both the `useState` initializer and `handleStartEdit`.
- **Deferred nitpicks:** `org-event-detail.tsx` remove redundant `useCohostEvents` call; `CityAutocompleteField` validate HTTP + Places `status` response; `CityAutocompleteField` `autoCapitalize="words"`; `APRIL_2026_FIXES.md` "co-host" vs "cohost" spelling — all logged to `NITPICKS_TODOS.md`.
- **Skipped:** `org-event-detail.tsx` co-host enriched data bypass (duplicate comment — already tracked in `EDGE_CASES_TODOS.MD`).
- **Files:** `pnpm-lock.yaml`, `apps/mobile/components/create-event/CityAutocompleteField.tsx`, `apps/mobile/hooks/useEventDetails.ts`, `apps/mobile/hooks/useOrgEvents.ts`, `apps/mobile/components/events-management/EditTiersTab.tsx`

---

### 26. EditTiersTab — null per_user_limit incorrectly initialized as "0" and blocked saves (Apr 7, 2026)

- **Issue:** `ExistingTierCard` in `EditTiersTab` used `String(tier.per_user_limit ?? 0)` to initialize the `editPerUserLimit` state. When the DB column is `NULL` (unlimited), this produced `"0"`, which then failed the `isNaN || < 1 || > 50` validation on every save attempt — blocking ALL edits to that tier, even unrelated fields like name or price.
- **Fix:**
  1. Changed both initializations (line 73 and the `handleStartEdit` reset on line 85) to `tier.per_user_limit != null ? String(tier.per_user_limit) : ""`.
  2. Updated `handleSaveEdit` validation: an empty string now maps to `null` (unlimited) and bypasses the 1–50 numeric check; only a non-empty string is parsed and validated against the 1–50 range.
  3. Updated the read-only display (previously rendered blank text " per user" when null) to show `"Unlimited"` instead.
  4. Updated the edit field placeholder from `"Per user limit (1-50)"` to `"Per user limit (1-50, blank = unlimited)"` so the expected behavior is visible to the organizer.
- **Files:** `apps/mobile/components/events-management/EditTiersTab.tsx`

---

### 27. PR review fixes — batch 4 (Apr 8, 2026)

- **Skipped: `EditTiersTab` per_user_limit null "violates DB constraint":** The reviewer's premise is factually incorrect. `packages/lib/src/types/event.ts` declares `per_user_limit: number | null`. The Supabase column IS nullable — NULL means "unlimited." This was the explicit design established in entries #26 (Apr 7) and #25 (Apr 8). The Zod `.nullable()`, the empty-string-maps-to-null logic, and the "Unlimited" display all correctly model the DB. No change made.
- **Fixed: `EventDetail` status type mismatch:** `EventDetail` extended `Omit<Event, "ticket_tiers">` which inherited `status: "published"` (literal) from the shared `Event` type. But `EventSchema.status` in `useEventDetails.ts` uses `z.string()` (widened intentionally in entry #14 so org members can see non-published events). The `...(rawEvent as Event)` cast was unsound — `rawEvent.status` could be `"draft"` but the cast asserted `"published"`. Fixed: added `"status"` to the Omit and re-declared `status: string` on `EventDetail`. Updated the spread cast to `...(rawEvent as unknown as Omit<Event, "ticket_tiers" | "status">)` with an explicit `status: rawEvent.status` line, making the type widening explicit and safe.
- **Fixed: `APRIL_2026_FIXES.md` non-monotonic / duplicate entries:** Entries after #15 were out of order and had a duplicate `### 17` heading (both "share icon" and "EditTiersTab" fix). Reordered entries to be strictly ascending (16, 17, 18, 19, 20, 23, 24, 25, 26). Renamed duplicate `### 17` (EditTiersTab) to `### 26`. Moved `### 16` (forgot password) from the bottom to its correct position before `### 17`. The one external reference (`NITPICKS_TODOS.md` #16) remains valid — #16 is still the forgot-password entry.
- **Deferred: `useEventDetails` fallback log enrichment:** Reviewer suggested adding `userId` and `eventId` to the `getAuthenticatedClient` catch log. Existing log already captures the action context and error. Logged to `NITPICKS_TODOS.md`.
- **Files:** `apps/mobile/hooks/useEventDetails.ts`, `docs/fixes/APRIL_2026_FIXES.md`, `docs/todos/NITPICKS_TODOS.md`

---

### 28. PR review fixes — batch 5 (Apr 8, 2026)

- **Skipped: `useEventDetails` — rethrow instead of anon fallback on `getAuthenticatedClient` failure:** The reviewer requested removing the anon-client fallback and rethrowing when a signed-in user's token fetch fails. This directly contradicts the intentional design documented in entry #25: the fallback was added specifically so a transient Clerk token-refresh failure on a flaky network never blocks a signed-in organizer from viewing a publicly accessible event. Rethrowing would put React Query into an error state and show an error screen for a published event that the user is fully authorized to see — worse UX with no security benefit. Reviewer's assertion that the fallback causes "Invalid event data" failures is also incorrect (those are Zod parse failures, unrelated to which client is used).
- **Fixed: `APRIL_2026_FIXES.md` — real email address in changelog entry #14:** Replaced `support@flme.co` with "an organizer account" to avoid leaking an account identifier in the git-tracked changelog. Repro context (org count, symptom, fix) is unchanged.
- **Fixed: `NITPICKS_TODOS.md` — missing `ts` language tag on first code fence in deferred log-enrichment entry:** Added `ts` to the opening fence so the "current code" snippet renders with TypeScript syntax highlighting, matching the already-tagged target-state block below it.
- **Files:** `docs/fixes/APRIL_2026_FIXES.md`, `docs/todos/NITPICKS_TODOS.md`

---

### 29. PR review fixes — batch 6 (Apr 8, 2026)

- **Fixed: `APRIL_2026_FIXES.md` entry #14b — mixed "cohost"/"co-host" spelling:** Human-readable phrase `cohost event IDs` in the `Fix B — useOrgEvents` bullet standardized to `co-hosted event IDs`, matching every other human-readable reference in that entry. SQL identifier `cohost_organization_id` left unchanged.
- **Deferred: `APRIL_2026_FIXES.md` entry #26 — three consecutive "Updated" sentence openers:** Prose style preference, no correctness impact. Logged to `NITPICKS_TODOS.md`.
- **Files:** `docs/fixes/APRIL_2026_FIXES.md`, `docs/todos/NITPICKS_TODOS.md`

---

### 30. App Store pre-submission config fixes (Apr 8, 2026)

- **Fixed: Missing `expo-camera` plugin entry in `app.json`:** App uses `expo-camera` for QR scanner but was missing from plugins array. Added with explicit `cameraPermission` string ("Flame uses the camera to scan ticket QR codes at event check-in.") to satisfy Apple review requirements for camera usage description.
- **Fixed: Missing `www.flme.co` in Associated Domains:** `associatedDomains` only listed `applinks:flme.co` but production API uses `https://www.flme.co`. Added `applinks:www.flme.co` so Universal Links work from both domains.
- **Files:** `apps/mobile/app.json`

---

### 31. Legal & FAQ audit for App Store launch (Apr 9, 2026)

- **Fixed: Stale FAQ — "How do I create an event?"** Previously told organizers to contact support first for paid events. Updated to reflect self-service Stripe Connect flow. File: `apps/web/app/faqs/page.tsx`.
- **Fixed: FAQ — "What happens if an event is canceled?"** Said "FLAME may assist with processing refunds on behalf of the organizer" which contradicts the Organizer Agreement (organizers handle their own refunds via Stripe). Updated to accurately describe FLAME's role as providing transaction records and organizer contact assistance, not processing refunds.
- **Fixed: Sitemap stale dates.** Legal pages (`/privacy-policy`, `/terms-of-use`, `/purchase-terms`) had `lastModified: 2025-01-15` but content was updated March 31, 2026. FAQs had `2025-10-28`. All corrected to match actual last-modified dates. Also added missing `/cookie-settings` entry.
- **Fixed: Privacy Policy — missing third-party service disclosures.** Added **Expo (push notifications)** and **Google Places API (city autocomplete)** to the third-party services section in both English and Spanish. These services were used by the app but not disclosed in the privacy policy.
- **Fixed: Privacy Policy — phone number listed but not collected.** Removed "Phone number" from the "Personal Information You Provide" list in both English and Spanish. The `users.phone` DB column exists (legacy Datafast) but no screen in the app collects phone numbers from users.
- **Added: Organizer Agreement web page.** Published the Organizer Agreement (previously only a `.docx`) as a public page at `/organizer-agreement`, matching the style of other legal pages. Linked from the Footer legal section and from the Terms of Use where it references "subject to a separate Organizer Agreement." Added to sitemap.
- **Deleted: Dead mobile `Footer.tsx` component and mock data.** `apps/mobile/components/home/Footer.tsx` was imported by nothing (mobile uses bottom tab bar, not a footer). Removed the component and all related dead exports from `apps/mobile/data/mock.ts` (`footerSections`, `footerContact`, `footerLegal`, `FooterLink`, `FooterSection`, `FooterContact`). The mock data also had incorrect paths (`/privacy` vs `/privacy-policy`, etc.).
- **Updated: FAQs — added "For Organizers" section.** Split the old "Event Organization" section into "For Organizers" (with 3 new organizer-specific FAQs derived from the Organizer Agreement: how organizers get paid, fee structure, refund responsibility) and "General" (existing general questions).
- **Fixed: Ecuador-only references in FAQs.** Removed "in Ecuador" and "Ecuadorian data protection laws" and "available in Ecuador" from both the web FAQs page (`apps/web/app/faqs/page.tsx`) and the shared FAQ content used by mobile (`packages/lib/src/content/faqs.ts`). FLAME is no longer Ecuador-only — wording now says "applicable data protection laws" and "through our payment partners." Also added 2 new FAQs to the shared lib (organizer fees, event cancellation) so mobile home screen content stays aligned with the full web FAQs page.
- **Annotated: Legacy IVA/cédula/Datafast code marked as `@legacy`.** Since Stripe Connect migration (Jan 2026), IVA (Ecuador VAT) and cédula validation are no longer used for new purchases. Added `@legacy` JSDoc annotations to prevent future code from referencing them: `packages/lib/src/pricing/constants.ts`, `packages/lib/src/pricing/calculations.ts`, `packages/lib/src/validators/cedula.ts`, `apps/web/app/api/datafast/create-checkout/route.ts`, `apps/web/app/api/user/update-cedula/route.ts`, `apps/web/app/components/PriceBreakdownDisplay.tsx` (dead code — not imported anywhere). Full cleanup plan added to `docs/todos/WEB_NITPICKS_TODOS.md`.
- **Fixed: `ticket-tiers/route.ts` using legacy `FLAME_MARKUP_PERCENT` (7%) for `p_fee_percentage`.** The `create_ticket_tier_with_stages` RPC was being called with the old Datafast-era 7% markup instead of the active Stripe Connect 10% rate. Swapped `FLAME_MARKUP_PERCENT` → `DEFAULT_PLATFORM_FEE_PERCENT` (10). New tiers will now correctly store `fee_percentage = 10`. Note: the DB function default (`DEFAULT 7.00`) is also stale but unreachable since the code always passes the value explicitly — logged in `WEB_NITPICKS_TODOS.md` for a future migration.
- **Files:** `apps/web/app/faqs/page.tsx`, `apps/web/app/sitemap.ts`, `apps/web/app/privacy-policy/page.tsx`, `apps/web/app/organizer-agreement/page.tsx` (new), `apps/web/app/components/Footer.tsx`, `apps/web/app/terms-of-use/page.tsx`, `apps/mobile/components/home/Footer.tsx` (deleted), `apps/mobile/data/mock.ts`, `packages/lib/src/content/faqs.ts`, `packages/lib/src/pricing/constants.ts`, `packages/lib/src/pricing/calculations.ts`, `packages/lib/src/validators/cedula.ts`, `apps/web/app/api/datafast/create-checkout/route.ts`, `apps/web/app/api/user/update-cedula/route.ts`, `apps/web/app/components/PriceBreakdownDisplay.tsx`, `apps/web/app/api/ticket-tiers/route.ts`, `docs/todos/WEB_NITPICKS_TODOS.md`

---

### 32. Multi-org context bugs — create event, Stripe Connect, org avatar, webhook sync (Apr 12, 2026)

Five fixes for multi-org users where the selected organization context was ignored or lost.

**32a. Mobile `create-event.tsx` ignored selected org — events created under wrong org**

- **Issue:** `CreateEventScreen` called `useOrgData()` with no argument, which defaults to the user's oldest org membership. When an organizer selected a different org in the dashboard and then navigated to "Create Event," the event was created under the first org regardless of selection.
- **Fix:** Imported `useMemberRoleContext`, destructured `selectedOrgId`, and passed it to `useOrgData(selectedOrgId)`.
- **Files:** `apps/mobile/app/(tabs)/create-event.tsx`

**32b. Web Navbar lost `?org=` param when navigating to create event**

- **Issue:** `handleCreateEventClick` in `Navbar.tsx` navigated to `/organizer?tab=create-event` without preserving the `?org=` query parameter. Organizers who had selected a specific org from the dashboard URL lost that selection when clicking "Create Event" from the navbar.
- **Fix:** Added `buildCreateEventUrl()` helper that reads `searchParams.get("org")` and appends it to the URL when present. All three `router.push("/organizer?tab=create-event")` paths now use this helper.
- **Files:** `apps/web/app/components/Navbar.tsx`

**32c. `DashboardBar` shows selected org avatar in organizer mode**

- **Issue:** The profile avatar in `DashboardBar` always showed the user's personal profile picture, even when viewing as an organizer with a specific org selected. No visual indicator of which org was active.
- **Fix:** `DashboardBar` now reads `viewMode` from `useViewModeContext()` and `selectedOrgId` from `useMemberRoleContext()`, fetches org data via `useOrgData(selectedOrgId)`, and displays the org's `logoUrl` when in organizer mode. Falls back to the user's profile picture if the org has no logo or the user is in attendee mode. Removed the old `orgLogoUrl` prop — the component is now self-aware.
- **Files:** `apps/mobile/components/dashboard/DashboardBar.tsx`

**32d. Added `account.updated` Stripe webhook handler to sync Connect status**

- **Issue:** `stripe_charges_enabled` and `stripe_payouts_enabled` DB flags were only set during onboarding. If Stripe later changed the account status (e.g., completing onboarding asynchronously, or disabling an account), the DB flags became stale. The app showed incorrect "Payment Setup Required" / "Connected" status until the organizer manually triggered re-onboarding.
- **Fix:** Added `case "account.updated"` to the webhook router in `route.ts`. New `handleAccountUpdated` function looks up the org by `stripe_account_id`, compares current DB flags with the webhook payload's `charges_enabled`/`payouts_enabled`, and updates only if changed (idempotent). Errors throw (not return) so Stripe retries on failure.
- **Note:** The Stripe Dashboard must be configured to send `account.updated` events to the webhook endpoint.
- **Files:** `apps/web/app/api/webhooks/stripe/route.ts`

**32e. `handleAccountUpdated` webhook error handling hardened**

- **Fixed:** `fetchError` and `updateError` paths used `return` instead of `throw`, causing the outer handler to respond 200 to Stripe. Stripe interprets 200 as successful and does not retry. Changed both to `throw new Error(...)` so the outer `catch` returns 500 and Stripe retries delivery.
- **Deferred:** Add UNIQUE constraint on `organizations.stripe_account_id`; re-fetch live Stripe state via `stripe.accounts.retrieve()` instead of trusting payload values. Logged to `docs/todos/EDGE_CASES_TODOS.MD`.
- **Files:** `apps/web/app/api/webhooks/stripe/route.ts`, `docs/todos/EDGE_CASES_TODOS.MD`

---

### 33. Systematic `useOrgData()` missing `selectedOrgId` — 9 files fixed (Apr 12, 2026)

- **Issue:** After fixing `create-event.tsx` (#32a) and `org-event-detail.tsx` (#14), the same bug class persisted across 9 other files. Every organizer screen and hook that called `useOrgData()` with no argument defaulted to the user's oldest org membership instead of the selected org. Symptoms varied: "session expired" on Payouts tab, wrong org data on dashboard stats, wrong events in RSVP management, wrong org in scanner, wrong org in settings — all only visible to multi-org users.
- **Root cause:** `useOrgData()` without an argument queries `organization_members` ordered by `created_at LIMIT 1`, always returning the first org the user ever joined. `MemberRoleContext.selectedOrgId` tracks the user's actual selection, but wasn't threaded through to these call sites.
- **Fix:** Added `useMemberRoleContext()` import and passed `selectedOrgId` to `useOrgData(selectedOrgId)` in all 9 files:
  1. `components/settings/PayoutsSettingsTab.tsx` — caused "session expired" error
  2. `components/settings/OrganizationSettingsTab.tsx` — showed/edited wrong org settings
  3. `app/(tabs)/org-dashboard.tsx` — dashboard data for wrong org
  4. `app/(tabs)/rsvp-management.tsx` — RSVPs for wrong org's events
  5. `app/(tabs)/events-management.tsx` — event list for wrong org
  6. `app/scanner.tsx` — scanner defaulted to wrong org (consolidated duplicate `useMemberRoleContext()` call)
  7. `hooks/useOrgEvents.ts` — internal `useOrgData()` fallback used wrong org
  8. `hooks/useOrgDashboardStats.ts` — revenue stats for wrong org
  9. `hooks/useRsvpManagement.ts` — RSVP event query scoped to wrong org
- **Verification:** Grep for `useOrgData()` (no argument) returns zero results in `apps/mobile/` after this fix. The only remaining reference is a comment in `MemberRoleContext.tsx`.
- **Related:** Same bug class as #14 (`org-event-detail.tsx`), #14a (`useOrgEnrichedAll`), and #32a (`create-event.tsx`).
- **Files:** `apps/mobile/components/settings/PayoutsSettingsTab.tsx`, `apps/mobile/components/settings/OrganizationSettingsTab.tsx`, `apps/mobile/app/(tabs)/org-dashboard.tsx`, `apps/mobile/app/(tabs)/rsvp-management.tsx`, `apps/mobile/app/(tabs)/events-management.tsx`, `apps/mobile/app/scanner.tsx`, `apps/mobile/hooks/useOrgEvents.ts`, `apps/mobile/hooks/useOrgDashboardStats.ts`, `apps/mobile/hooks/useRsvpManagement.ts`

---

### 34. Removed unused `/admin` dashboard and dead API routes (Apr 12, 2026)

- **Issue:** The `/admin` route was a pre-Stripe, pre-monorepo artifact that duplicated Supabase Studio and Stripe Dashboard functionality. It contained: (1) platform stats already visible in Supabase Studio, (2) a read-only user table, (3) an unfinished revenue view with placeholder text, (4) a featured-events toggle (only admin UI consumer of `is_featured`), and (5) a **"Cleanup All Ticket Data" button** that called `cleanup_all_ticket_data` RPC to permanently delete every order, ticket, RSVP, hold, and checkin in the production database. The `/api/admin/recover-stuck-transactions` cron monitored legacy Datafast transactions, deprecated since the Stripe migration (Jan 2026).
- **Removed files:**
  - `apps/web/app/admin/page.tsx` — admin page (server component)
  - `apps/web/app/components/AdminDashboard.tsx` — admin dashboard UI (client component)
  - `apps/web/app/api/admin/cleanup-tickets/route.ts` — production data nuke endpoint
  - `apps/web/app/api/admin/recover-stuck-transactions/route.ts` — dead Datafast cron
  - `apps/web/app/api/admin/featured-events/route.ts` — featured toggle (use Supabase Studio to set `is_featured` directly)
  - `apps/web/app/lib/utils/admin-auth.ts` — cron/admin auth helper (only consumer was the deleted cron route)
- **Updated files:**
  - `apps/web/app/components/Navbar.tsx` — admin users now route to `/organizer` instead of `/admin`
  - `apps/web/app/components/UserDashboard.tsx` — removed `/admin` redirect for admin role; admin users follow the same organizer routing as other org members
  - `apps/web/middleware.ts` — removed `/admin(.*)` and `/api/admin(.*)` from protected routes; removed the `recover-stuck-transactions` cron exception
  - `apps/web/app/robots.ts` — removed `/admin/` from disallowed paths
  - `apps/web/app/components/index.ts` — removed `AdminDashboard` export
  - `apps/web/vercel.json` — removed the `/api/admin/recover-stuck-transactions` cron entry
- **Kept:** `roles.ts` (`isAdmin`, `getUserRole`, etc.) — still used by Navbar and UserDashboard for role-based routing. The `is_featured` DB column and all frontend queries that read it (web `discover/page.tsx`, mobile `useAppEvents.ts`) are unchanged — only the admin UI for toggling it was removed.
- **Files:** See lists above

---

### 35. Navbar `getDashboardLinkInfo` routed admins to `/organizer` unconditionally (Apr 12, 2026)

- **Fixed: Admin check in `getDashboardLinkInfo` bypassed `organizationApproved` guard.** Lines 85-86 returned `{ href: "/organizer" }` for all admins regardless of whether they had an approved org. An admin without an approved org would land on `/organizer` with no org data — the same broken state any unapproved organizer would hit. The organizer and `hasOrganization` branches correctly required `organizationApproved`; the admin branch did not. Consolidated all three conditions (`userRole === "admin"`, `userRole === "organizer"`, `hasOrganization`) under a single `organizationApproved` guard. Admins without an approved org now fall through to `/account` like everyone else.
- **Files:** `apps/web/app/components/Navbar.tsx`

---

### 36. Double-escape bugs in email generators — org names and event names mangled (Apr 12, 2026)

- **Fixed: `generateTicketEmailHtml` — `eventVenue`, `ticketTierName` double-escaped in InfoCardRow values.** Lines 522-523 pre-escaped these via `escapeHtml()`, then `emailInfoCard` at line 203 called `escapeHtml(r.value)` again. Special characters (e.g. `&`) would render as `&amp;amp;` in the email. Changed InfoCardRow values to use raw `data.eventVenue` / `data.ticketTierName` directly — `emailInfoCard` performs the one correct escape.
- **Fixed: `generateTicketEmailHtml` — `eventName` double-escaped in `emailInfoCard` title and `footerContext`.** Pre-escaped `eventName` was passed to `emailInfoCard({ title: eventName })` (escaped again at line 210) and to `wrapEmailHtml({ footerContext: ... ${eventName} })` (escaped again at line 90). Changed both to use raw `data.eventName` — the helpers perform the single correct escape.
- **Fixed: `generateTicketReadyEmailHtml` — same double-escape bugs as above.** Applied the same fix to `eventVenue`, `ticketTierName`, `eventName` in the InfoCardRow values, `emailInfoCard` title, `footerContext`, and `preheader` (also passed to `wrapEmailHtml` which escapes it at line 92).
- **Fixed: `generateOrganizerNotificationEmailHtml` — `organizationName` double-escaped in `footerContext`.** Line 464 pre-escaped it; then line 526 interpolated it into `footerContext` which `wrapEmailHtml` escaped again. Changed to use raw `data.organizationName`.
- **Added: `ticket-ready-datafast` preview to `/api/dev/email-preview`.** The `datafast` payment method variant renders distinct copy ("purchased ticket(s) via card payment") but had no preview entry. Added alongside the existing `ticket-ready-free` and `ticket-ready-bank` entries.
- **Deferred:** `generateApprovalEmailHtml` calling `getBaseUrl()` internally instead of accepting `baseUrl` as a parameter (only RSVP approval has a `baseUrl`-dependent CTA; rejection/pending/organizer generators do not). Logged to `NITPICKS_TODOS.md`.
- **Files:** `apps/web/app/lib/email/ticket-notifications.ts`, `apps/web/app/lib/email/rsvp-notifications.ts`, `apps/web/app/api/dev/email-preview/route.ts`, `docs/todos/NITPICKS_TODOS.md`

---

### 37. Stripe Connect cleanup — delete incomplete accounts + pass org name to new accounts (Apr 14, 2026)

**37a. Cleared 4 incomplete Stripe Express accounts (DB + pending Stripe deletion)**

- **Issue:** Four organizations attempted Stripe Connect onboarding before cross-border payments were activated on the Stripe Dashboard. All four accounts were stuck in "Restricted" status — onboarding could never complete because the organizers' countries (Ecuador, Colombia, Argentina) were not enabled. The organizers could not retry onboarding because `stripe_account_id` was already set, so the code tried to resume the broken account instead of creating a new one.
- **Root cause (Stripe Dashboard):** Cross-border payments were not enabled in production Connect settings. Sandbox/test mode shows all countries by default, but production requires explicit per-country enablement at [dashboard.stripe.com/account/applications/settings](https://dashboard.stripe.com/account/applications/settings) → Onboarding options → Countries.
- **Fix:** Stripe activated cross-border payments. Cleared `stripe_account_id`, `stripe_charges_enabled`, `stripe_payouts_enabled` on all 4 orgs in Supabase. The 4 Express accounts need manual deletion from the Stripe Dashboard (Connected Accounts → each account → Actions → Delete).
- **Affected orgs:** Kora Experiences, Zulu Beach Club, Hush Experiences, Casa Famita (Stripe account IDs redacted from docs).

**37b. `createExpressAccount` now passes org name as `business_profile.name`**

- **Issue:** Connected accounts in the Stripe Dashboard only showed the owner's email — no way to tell which org each account belonged to without cross-referencing the DB.
- **Fix:** Updated `createExpressAccount` signature from `(email, country?)` to `(email, options?: { country?, businessName? })`. When `businessName` is provided, sets `business_profile.name` on the Express account. Updated the onboard route to pass `org.name`. New accounts will display the org name in the Stripe Dashboard Connected Accounts list.
- **Files:** `apps/web/app/lib/stripe/connect.ts`, `apps/web/app/api/stripe/connect/onboard/route.ts`

**37c. Verification: Zulu/Kora code cross-contamination is expected Stripe behavior**

- **User report:** When onboarding Kora, verification codes were sent to the phone/email set during Zulu's onboarding.
- **Explanation:** Both orgs are owned by the same person (same email). Stripe Express onboarding sends verification codes to the individual, not the business entity. Each org gets a separate Express account (`acct_xxx`), but Stripe identifies the person by their contact info and reuses it. Not a code bug.

---

### 38. Created web multi-org parity audit — initial findings (Apr 14, 2026)

- **Issue:** Mobile shipped systematic multi-org fixes in entries #14, #14a, #14b, #32, #33 (9+ files). Web has partial multi-org support (main dashboard threads `?org=` correctly) but several sub-pages and hooks do not scope to the selected org.
- **Confirmed web bugs:** (1) `OrgEventDetailClient` calls `useOrganizerData()` with no org param → "Event not found" for non-primary org events; (2) `useOrganizerData()` hook has no org-scoping parameter and cache key doesn't include org; (3) co-hosted events not queried or merged in web organizer dashboard.
- **Action:** Created `docs/todos/WEB_MULTI_ORG_PARITY_AUDIT.md` with confirmed bugs, fix approaches, and areas needing broader investigation. Full audit and fixes to follow in a separate PR.
- **Files:** `docs/todos/WEB_MULTI_ORG_PARITY_AUDIT.md` (new)

---

### 39. Standardized event poster images to 3:4 aspect ratio across all surfaces (Apr 14, 2026)

- **Change:** All event cover/poster images now display in 3:4 (portrait) aspect ratio across both mobile and web. Previously inconsistent — squares (1:1), landscape (3:2, 16:9), and fixed-height banners (254px, 259px, 200px) were used interchangeably.
- **Excluded:** Small 44×43 list-row thumbnails (dashboard/ticket rows), full-bleed hero carousels (HeroCarousel on home), and SpotlightCard banners — these are banner/decoration contexts, not poster display.
- **Image picker:** Updated `allowsEditing` crop ratio in `EventDetailsTab` and `EditEventDetailsTab` from `[3, 2]` to `[3, 4]` so uploads are cropped to the correct poster format at source.
- **Files changed:**
  - `packages/ui/src/components/EventCard.tsx` — image container `h-[130px] w-[218px]` → `w-[218px] aspect-[3/4]`
  - `packages/ui/src/components/EventListCard.tsx` — `w-[100px] h-[100px]` → `w-[75px] h-[100px]`
  - `apps/mobile/components/home/HomeFeedList.tsx` — `aspect-square` → `aspect-[3/4]`
  - `apps/mobile/components/event-details/EventHero.tsx` — `h-[254px]` → `aspect-[3/4]`
  - `apps/mobile/components/org-dashboard/OrgEventInfoCard.tsx` — `h-[254px]` → `aspect-[3/4]`
  - `apps/mobile/app/ticket/[id].tsx` — `h-[254px]` → `aspect-[3/4]`
  - `apps/mobile/components/create-event/EventDetailsTab.tsx` — preview `aspect-[3/2]` → `aspect-[3/4]`; ImagePicker `aspect: [3,4]`
  - `apps/mobile/components/events-management/EditEventDetailsTab.tsx` — `h-[259px]` → `aspect-[3/4]`; ImagePicker `aspect: [3,4]`
  - `apps/web/app/components/home/HomeFeedEventCard.tsx` — `aspect-square` → `aspect-[3/4]`
  - `apps/web/app/components/discover/EventsSection.tsx` — `aspect-square` → `aspect-[3/4]`
  - `apps/web/app/components/EventsCatalog.tsx` — `w-[100px] h-[100px]` → `w-[75px] h-[100px]`
  - `apps/web/app/components/EventDetail.tsx` — `h-[254px]` → `aspect-[3/4]`
  - `apps/web/app/account/ticket/[id]/page.tsx` — `h-[254px]` → `aspect-[3/4]`
  - `apps/web/app/organizer/event/[id]/OrgEventDetailClient.tsx` — read-only banner `h-[254px]` → `aspect-[3/4]`
  - `apps/web/app/components/StripePurchaseFlow.tsx` — `h-[200px]` → `aspect-[3/4]` (also switched to `fill` + relative container for proper Next.js Image usage)

---

### 40. Migrated `@clerk/clerk-expo` → `@clerk/expo` v3 (Apr 14, 2026)

- **Issue:** `@clerk/clerk-expo` is the deprecated package name. The maintained package is `@clerk/expo` (v3+). Using the deprecated package risks falling off active support and security updates.
- **Fix:** Updated `apps/mobile/package.json` dependency from `"@clerk/clerk-expo": "^2.19.30"` to `"@clerk/expo": "^3.1.6"`. Updated all 7 references across the codebase: `app/_layout.tsx`, `app/reset-password.tsx`, `app/forgot-password.tsx`, `lib/token-cache.ts`, `hooks/useSignInHandlers.ts`, `hooks/useOptionalAuth.ts` (both the JSDoc comment and the `require()` call), and `metro.config.js` (`extraNodeModules` mapping key).
- **API compatibility verification:** `@clerk/expo` v3 is a rename + Expo SDK 52 / React Native 0.76 (New Architecture) compatibility release. All APIs used by this codebase are unchanged — no call-site changes were required. Specifically verified:
  - `ClerkProvider` — `publishableKey` and `tokenCache` props unchanged; `publishableKey` was already required and already being passed in `app/_layout.tsx`.
  - `ClerkLoaded` — unchanged.
  - `useSignIn` / `useSignUp` — `{ signIn, signUp, setActive, isLoaded }` destructuring pattern unchanged. `setActive` is the correct API for v3 (Note: `signIn.create`/`signIn.finalize` are lower-level Clerk Core v2 methods from the Clerk.js _web_ SDK v5 migration — they do not apply to `@clerk/expo`).
  - `useSSO` — `{ startSSOFlow }` pattern unchanged. `useOAuth` was already replaced by `useSSO` in `@clerk/clerk-expo` v2.x; no further migration needed.
  - `useAuth` — `{ getToken, isSignedIn }` unchanged.
  - `TokenCache` interface (`getToken`, `saveToken`, `clearToken`) in `lib/token-cache.ts` — unchanged, no shape differences.
  - `useOptionalAuth` — `require("@clerk/expo")` fallback pattern verified; error handling in `getClerkErrorMessage` uses the same Clerk error shape (`errors[0].message`).
  - `metro.config.js` — `extraNodeModules["@clerk/expo"]` correctly pins the package to `apps/mobile/node_modules/@clerk/expo` to prevent duplicate context across the monorepo.
- **Files:** `apps/mobile/package.json`, `apps/mobile/metro.config.js`, `apps/mobile/app/_layout.tsx`, `apps/mobile/app/reset-password.tsx`, `apps/mobile/app/forgot-password.tsx`, `apps/mobile/lib/token-cache.ts`, `apps/mobile/hooks/useSignInHandlers.ts`, `apps/mobile/hooks/useOptionalAuth.ts`

---

### 41. Doc/docs cleanup from PR review (Apr 14, 2026)

- **`StripePurchaseFlow.tsx` image height bug:** The 3:4 poster image container in the checkout flow was missing a `max-h` cap. Inside the `max-w-[600px]` layout, a 3:4 ratio produces ~800px of height — pushing the payment form well below the fold. Added `max-h-[480px]` to match the cap used in `EventDetail.tsx` and `FeaturedEvent.tsx`.
- **Stripe account IDs / personal email redacted from docs:** Production Stripe Connect account IDs and a personal email address were present in `docs/todos/WEB_MULTI_ORG_PARITY_AUDIT.md` and `docs/fixes/APRIL_2026_FIXES.md` (entry #37a). Replaced all account IDs with `[STRIPE_ACCOUNT_REDACTED]` and removed the personal email from the verification note.
- **EAS_OTA_UPDATES.md version specifier:** Corrected `expo-updates@29.0.16` → `` `~29.0.16` `` to match the tilde-prefixed specifier in `apps/mobile/package.json`.
- **Deferred:** `accountParams: any` in `createExpressAccount` (`apps/web/app/lib/stripe/connect.ts`) → logged to `NITPICKS_TODOS.md` (typed as `Stripe.AccountCreateParams` once Stripe Node SDK discriminated-union narrowing is resolved).
- **Files:** `apps/web/app/components/StripePurchaseFlow.tsx`, `docs/todos/WEB_MULTI_ORG_PARITY_AUDIT.md`, `docs/fixes/APRIL_2026_FIXES.md`, `docs/guides/EAS_OTA_UPDATES.md`, `docs/todos/NITPICKS_TODOS.md`

---

### 42. Multi-org Stripe context bug — web + mobile (Apr 14, 2026)

- **Issue (web):** Clicking "Complete Payment Setup" on a non-primary org's dashboard opened Stripe onboarding for the **wrong org**. Root cause: `PaymentAccountBanner` navigated to `/organizer/settings?org=${organizationId}` using the **UUID**, but `selectOrganization()` expects a **slug**. The UUID never matched → fell back to the first approved org.
- **Issue (web):** `useOrganizerData()` hook had no org-scoping parameter — always fetched `/api/organizer/data` without `?org=`, and query key `["organizer-data"]` didn't include the org. Switching orgs returned stale cached data. This caused the existing "Event not found" bug for non-primary org events in `OrgEventDetailClient`.
- **Issue (mobile):** `PayoutsSettingsTab` passed `orgData?.organizationId` (from async `useOrgData` query) to `useStripeConnect` instead of using `selectedOrgId` directly from context. If `useOrgData` was stale after an org switch, the old org's ID could be used for Stripe onboarding.
- **Fixes:**
  1. **`PaymentAccountBanner.tsx` (web):** Added `organizationSlug` prop; navigation now uses slug instead of UUID. `DashboardView.tsx` passes `currentOrganization.slug`.
  2. **`OrgSettingsClient.tsx` (web):** "Go Back" button now preserves `?org=` from URL via `searchParams.get("org")`.
  3. **`useOrganizerData.ts` (web):** Hook now accepts optional `orgSlug?: string | null`. Appends `?org=` to fetch URL when provided. Query key includes org: `["organizer-data", orgSlug ?? null]`. Mutation invalidation uses `{ exact: false }` to cover all org variants.
  4. **`OrgEventDetailClient.tsx` (web):** Now reads `?org=` from URL via `useSearchParams()` and passes it to `useOrganizerData(orgSlug)`.
  5. **`RsvpManagement.tsx` (web):** "Go Back" button now preserves `?org=` from `organization.slug`.
  6. **`CreateEventForm.tsx` (web):** Post-create success redirect now uses `orgSlug` from `searchParams` instead of bare `/organizer`.
  7. **`PayoutsSettingsTab.tsx` (mobile):** Now uses `selectedOrgId ?? undefined` directly from `useMemberRoleContext()` for `useStripeConnect`, bypassing the async `orgData` indirection.
- **Full audit:** Completed for all `apps/web/app/organizer/` pages and 20+ navigation paths. Results documented in `docs/todos/WEB_MULTI_ORG_PARITY_AUDIT.md`. Lower-priority items (Navbar "MY ACCOUNT", onboarding redirects, scanner exit links) deferred — caught by `organizer/page.tsx` server redirect.
- **Files:** `apps/web/app/components/PaymentAccountBanner.tsx`, `apps/web/app/components/organizer/DashboardView.tsx`, `apps/web/app/organizer/settings/OrgSettingsClient.tsx`, `apps/web/app/lib/hooks/useOrganizerData.ts`, `apps/web/app/organizer/event/[id]/OrgEventDetailClient.tsx`, `apps/web/app/components/RsvpManagement.tsx`, `apps/web/app/components/forms/CreateEventForm.tsx`, `apps/mobile/components/settings/PayoutsSettingsTab.tsx`, `docs/todos/WEB_MULTI_ORG_PARITY_AUDIT.md`

---

### 43. Full multi-org audit — web + mobile (Apr 14, 2026)

- **Scope:** Exhaustive audit of every organizer feature on both platforms for correct org scoping when users belong to multiple organizations.
- **Findings (4 additional bugs fixed):**
  1. **Web Settings page missing canonical redirect:** Unlike the main organizer page, `organizer/settings/page.tsx` had no server-side redirect for multi-org users without `?org=` — silently loaded the wrong org's settings. Fixed: mirrors `organizer/page.tsx` redirect pattern, preserves `?tab=`.
  2. **Web `ExploreOrganizers` 404 link:** Home page organizer circles linked to `/organizer/${org.slug}` — a route that doesn't exist (404). Fixed: now links to `/events?org=${slug}`.
  3. **Web Org event detail missing canonicalization:** `organizer/event/[id]/page.tsx` didn't resolve the org server-side. Multi-org users navigating without `?org=` got stale/wrong data from `useOrganizerData`. Fixed: server now looks up the event's `organization_id` and redirects to `?org=<event_org_slug>` for multi-org users.
  4. **Mobile co-host assignment sheet wrong org:** `org-event-detail.tsx` passed `selectedOrgId` to `useEventAssignments` and `CoHostAssignmentSheet`. When the active org is a co-host (not the event owner), this queries/mutates with the wrong `organization_id`. Fixed: now uses `ownerOrgId` (`event.organization_id ?? selectedOrgId`).
- **Confirmed clean (no issues found):**
  - Mobile: Event creation, org dashboard data refresh, RSVP management, org settings tab, all `useOrgData` calls (no bare calls), all `useStripeConnect` calls, `MemberRoleContext` state transitions
  - Web: Event creation (server validates membership), `OrganizerDashboard` data loading (full reload on switch), RSVP management (server redirect), QR scanner (scoped by dashboard events), all API routes (server-side membership checks), ticket tier CRUD, promoter links, send tickets, exports
- **Low-priority deferred items:** Navbar "MY ACCOUNT" without `?org=` (caught by server redirect), `HostBanner`/`HomeContent` create-event CTAs (single-org at point of use), scanner/enter-code exit links (caught by redirect), `search-users` API weak org scoping (not a data leak — downstream mutations enforce access)
- **Files:** `apps/web/app/organizer/settings/page.tsx`, `apps/web/app/components/ExploreOrganizers.tsx`, `apps/web/app/organizer/event/[id]/page.tsx`, `apps/mobile/app/org-event-detail.tsx`

---

### 44. PR review fixes — ExploreOrganizers org filter + OrgEventDetailClient hydration (Apr 14, 2026)

- **Bug 1 (confirmed real):** `ExploreOrganizers` links to `/events?org=<slug>`, but `EventsPage` had no `searchParams` and `EventsCatalog.selectedOrganizer` was always initialized as `null`. Navigating from an organizer circle showed all events unfiltered. Fixed: `EventsPage` now accepts `searchParams`, reads `org`, and passes it to `EventsCatalog` as `initialOrganizer`. `EventsCatalog` accepts `initialOrganizer?: string | null` and initializes `selectedOrganizer` from it.
- **Fix 2 (hydration/Suspense):** `OrgEventDetailClient` read `orgSlug` via `useSearchParams()`, which requires a `<Suspense>` boundary in App Router or opts the page out of static rendering. Fixed: `orgSlug` is now a prop (`orgSlug?: string | null`) passed from the server page (`resolvedSearchParams.org`). `useSearchParams` import removed.
- **Deferred:** Wrapping `supabaseAdmin.from("events").single()` in try/catch (logged to `NITPICKS_TODOS.md` — Supabase client returns `{ data, error }` and cannot throw in practice).
- **Files:** `apps/web/app/events/page.tsx`, `apps/web/app/components/EventsCatalog.tsx`, `apps/web/app/organizer/event/[id]/OrgEventDetailClient.tsx`, `apps/web/app/organizer/event/[id]/page.tsx`, `docs/todos/NITPICKS_TODOS.md`

---

### 45. PR review fixes — org event detail page robustness (Apr 14, 2026)

- **Fix 1 (consistency):** `organizer/event/[id]/page.tsx` line 33 used raw `eventOrgSlug` in the redirect URL query param. Every other `?org=` redirect in the codebase uses `encodeURIComponent`. Fixed: now uses `encodeURIComponent(eventOrgSlug)` for consistency.
- **Fix 2 (error handling):** `selectOrganization()` in `OrgEventDetailPage` throws explicitly in 4 paths (`"Database not configured"`, `"User not found"`, `"No organization found"`, `"No approved organization found"`). The call is purely for a best-effort canonical redirect — if it threw, the page returned a 500 instead of rendering normally. Fixed: wrapped in try/catch; on error, falls through to render `OrgEventDetailClient` without the redirect.
- **Deferred:** Validating `initialOrganizer` slug against fetched organizers in `EventsPage` before passing to `EventsCatalog` — logged to `NITPICKS_TODOS.md` (empty state is acceptable behavior for unknown/deleted org slug).
- **Files:** `apps/web/app/organizer/event/[id]/page.tsx`, `docs/fixes/APRIL_2026_FIXES.md`, `docs/todos/NITPICKS_TODOS.md`

---

### 46. PR review fixes — org event detail page redirect safety (Apr 14, 2026)

- **Fix 1 (membership guard):** The supabaseAdmin event lookup runs with the service role (bypasses RLS) and could resolve an org the user isn't a member of. Before redirecting, the code now checks that `evt.organization_id` is in the user's `approvedMemberships` set. If the event belongs to an org the user can't access, the redirect is skipped and the page renders normally. No data is leaked either way (the API validates membership independently), but this prevents producing a URL with a slug the user has no rights to.
- **Fix 2 (structured error logging):** The empty `catch {}` block now logs a structured `console.error` with `userId`, `eventId`, `selectedOrgSlug`, and `action: "resolve-org"` before falling through. Preserves the best-effort behavior while enabling production debugging.
- **Files:** `apps/web/app/organizer/event/[id]/page.tsx`

---

### 47. Admins can now manage payouts (Apr 14, 2026)

- **Issue:** On mobile, only owners could see the `PaymentAccountBanner` on the org dashboard and access the Payouts tab in Settings. Admins were excluded. On web, the banner showed for all org members (including organizers with only assigned events) — too permissive.
- **Change:** Updated `canManagePayouts()` in `packages/lib` to return `true` for both `"owner"` and `"admin"` roles (was `"owner"` only).
- **Mobile fixes:**
  - `org-dashboard.tsx`: Changed hardcoded `memberRole === "owner"` to `canManagePayouts(memberRole)` for `PaymentAccountBanner` visibility.
- **Web fixes:**
  - `DashboardView.tsx`: Added `canManagePayouts(currentMemberRole)` gate around `PaymentAccountBanner` (was ungated — showed for all roles).
  - `OrgSettingsClient.tsx`: Payouts tab now only appears in the tab bar when `canManagePayouts` returns true. Added `memberRole` prop.
  - `settings/page.tsx`: Passes the user's role in the current org to `OrgSettingsClient`.
- **Result:** Owners + admins see payment/payout options. Organizers with assigned events only do not.
- **Files:** `packages/lib/src/utils/permissions.ts`, `apps/mobile/app/(tabs)/org-dashboard.tsx`, `apps/web/app/components/organizer/DashboardView.tsx`, `apps/web/app/organizer/settings/OrgSettingsClient.tsx`, `apps/web/app/organizer/settings/page.tsx`

---

### 48. PaymentIntent fails with "No valid payment method types" for international Express accounts (Apr 14, 2026)

**Symptom:** Attempting a ticket purchase for an event owned by an international Express account (e.g. Zulu Beach Club, Ecuador) returned: _"No valid payment method types for this Payment Intent. Please ensure that you have activated payment methods compatible with your chosen currency in your dashboard or specify payment_method_types."_

**Root cause:** `automatic_payment_methods: { enabled: true }` cannot reliably detect compatible payment methods when `on_behalf_of` is set to an Express account in certain countries (e.g. Ecuador/USD). The connected account's payment method configuration showed All: 0 even though the platform-level configuration had methods enabled — Stripe's automatic detection does not bridge this gap for all international Express accounts.

**Fix:** Replaced `automatic_payment_methods: { enabled: true }` with explicit `payment_method_types: ["card"]` in `create-payment-intent/route.ts`. Explicit types bypass automatic detection and work reliably with `on_behalf_of` for all supported countries.

**Files:** `apps/web/app/api/purchase/create-payment-intent/route.ts`

---

### 49. Mobile: Stripe Connect return/refresh URLs cause "Unmatched Route" crash (Apr 14, 2026)

**Symptom:** After Stripe Express onboarding (success or failure), iOS showed "Unmatched Route — Page could not be found" with URL `project-flame:///organizer?org=<slug>&connect=success`.

**Root cause:** The mobile app has `associatedDomains: ["applinks:flme.co"]` which makes iOS treat all `https://flme.co/*` links as Universal Links and open them in the app. The Stripe return route redirects to `https://flme.co/organizer?org=<slug>&connect=success` (and error variants like `?error=missing_account_id`). The mobile app had no `/organizer` index route (only `/organizer/[slug]`), so Expo Router rendered the "Unmatched Route" screen.

**Fix:** Created `apps/mobile/app/organizer/index.tsx` — a dedicated Stripe Connect return screen that:

- Handles `?connect=success` → shows "Payment setup complete!" message
- Handles `?error=<code>` → shows a human-readable message per error code (all codes produced by `/api/stripe/connect/return` and `/api/stripe/connect/refresh`)
- Handles unknown params → neutral "Redirecting to your dashboard…"
- After a brief delay (1.2s success / 2.5s error), navigates to `/(tabs)/org-dashboard` where Stripe status has been refreshed

**Files:** `apps/mobile/app/organizer/index.tsx` (new)

---

### 50. Per-user limit error message — SQL RPC + API copy (Apr 14, 2026)

- **Change:** Standardized copy to "per user for this tier" with correct singular/plural ("1 ticket" vs "N tickets"). Updated `atomic_create_hold_with_stage_validation` in Supabase (see migrations `20260414190242_*`, follow-ups `20260414202036_*`, `20260414203357_*` for hold lockout + `get_event_with_tiers` / `rsvps` table name fix).
- **Files:** `supabase/migrations/20260414190242_update_per_user_limit_message.sql` (and related migrations), `apps/web/app/api/holds/create/route.ts`, `apps/web/app/api/rsvp/route.ts`

---

### 51. Metro dev client: `Incompatible React versions` (react 19.1.0 vs react-dom 19.1.4) — Clerk load fails, bogus route / QueryClient errors (Apr 14, 2026)

**Symptom:** After `npx expo start --dev-client`, Metro logged `Incompatible React versions: react 19.1.0 / react-dom 19.1.4`, thrown from `require("@clerk/expo")` in `useOptionalAuth.ts`. Cascading errors: missing default export warnings on auth routes, `No QueryClient set` on `useAppEvents`. Organizer dashboard showed a generic profile placeholder / broken shell.

**Root cause:** `@clerk/expo` v3 depends on `react-dom`. Mobile pinned `react@19.1.0` but pnpm hoisted `react-dom@19.1.4` from `apps/web`. React 19 requires `react` and `react-dom` to be the **exact same** version.

**Fix:** (1) Added explicit `react-dom` **19.1.0** alongside `react` **19.1.0** (Expo SDK 54 / RN 0.81 — do **not** bump mobile React to 19.1.4; that caused Hermes/runtime failures: `property is not writable`, `"main" has not been registered`). (2) Mapped `react-dom` in `apps/mobile/metro.config.js` `extraNodeModules` to `apps/mobile/node_modules/react-dom`, and added `react-dom` to `singletonPkgsToClean` so pnpm cannot leave a mismatched copy under `packages/ui/node_modules`.

**Follow-up:** Stop any duplicate Metro on 8081, then `npx expo start --dev-client` (optionally `--clear`). Reload the dev client on the phone.

**Files:** `apps/mobile/package.json`, `apps/mobile/metro.config.js`

---

### 52. Harden `atomic_create_hold_with_stage_validation` RPC — search_path (Apr 14, 2026)

**Issues fixed:**

1. **`search_path` hijacking risk:** `SECURITY DEFINER` function lacked an explicit `SET search_path = public`, leaving it vulnerable to a malicious schema injected earlier in the search path. Added `SET search_path = public` to the function definition.
2. **`per_user_limit` null guard (web API):** `holds/create/route.ts` compared `quantity > ticketTier.per_user_limit` without a null check. `null` coerces to `false` in JS so unlimited tiers were never blocked, but the error string would have interpolated `"null"` if the branch were ever reached. Added `ticketTier.per_user_limit !== null &&` guard before the comparison.
3. **PaymentIntent fallback:** `create-payment-intent/route.ts` used `automatic_payment_methods` unconditionally. Without `STRIPE_CONNECTED_PMC_ID` set (e.g. local dev), `on_behalf_of` with international Express accounts silently fails. Now falls back to `payment_method_types: ["card"]` when the env var is absent; uses `automatic_payment_methods + payment_method_configuration` when present.

**Note:** A JWT auth assertion (`p_user_id` impersonation check) was added in migration `20260414220707` and immediately reverted in `20260414222258`. See #53 below.

**Files:** `supabase/migrations/20260414220707_harden_hold_rpc_search_path_and_auth.sql`, `apps/web/app/api/holds/create/route.ts`, `apps/web/app/api/purchase/create-payment-intent/route.ts`

---

### 53. Revert JWT auth assertion in hold RPC — caused "Unauthorized: user identity mismatch" on all purchases (Apr 14, 2026)

**Symptom:** Every ticket purchase attempt on the live App Store app (and local dev) failed immediately with:

**Root cause:** Migration `20260414220707` added an early JWT assertion inside `atomic_create_hold_with_stage_validation`:

```sql
SELECT u.id INTO v_jwt_user_id
FROM users u
WHERE u.clerk_id = (auth.jwt() ->> 'sub')
  AND u.id = p_user_id;
```

This assumes `auth.jwt() ->> 'sub'` inside the function returns the user's Clerk ID. But the function is called via `supabaseAdmin` (service role key) from `apps/web/app/api/holds/create/route.ts`. When called with the service role, `auth.jwt()` returns the service role JWT — its `sub` claim is not a Clerk user ID. The lookup always returns zero rows → `v_jwt_user_id IS NULL` → blanket rejection for all users.

**Why the assertion was wrong here:** Auth is already enforced correctly at the API layer:

1. Clerk middleware authenticates the incoming request.
2. The route resolves `supabaseUser` from the DB using the verified Clerk user ID.
3. The route passes that UUID as `p_user_id` to the RPC.

Users cannot call the RPC directly — it's only reachable through the authenticated API route. The DB-level JWT assertion is not possible via service-role calls and provides no additional security over the existing API-layer auth.

**Fix:** Migration `20260414222258` re-creates the function without the JWT assertion, keeping only `SET search_path = public` (the valid hardening from #52).

**Files:** `supabase/migrations/20260414222258_revert_hold_rpc_jwt_assertion.sql` (new)

---

### 54. Stripe PaymentIntent Confirm 500 Error — Production App Store Build

**Root cause (confirmed):** `on_behalf_of` on destination charges is gated behind a Stripe-restricted feature (`stripe_balance.stripe_transfers`) that Stripe must explicitly enable per platform. Test mode auto-enables it; live mode does not. Every `POST /v1/payment_intents/{id}/confirm` from the iOS SDK returned a generic 500 `api_error: "An unknown error occurred"` because the platform does not have this feature enabled in live mode.

The `STRIPE_CONNECTED_PMC_ID` env var and API version (`2025-08-27.basil` → `2020-08-27`) were red herrings that did not affect the core error. Removing `STRIPE_CONNECTED_PMC_ID` from Vercel and downgrading the API version were both harmless but did not fix the 500.

**Fix applied:**

**`apps/web/app/api/purchase/create-payment-intent/route.ts`** — Removed `on_behalf_of: org.stripe_account_id` from `paymentIntentOptions`. Standard destination charges (`transfer_data.destination` + `transfer_data.amount`) route organizer funds correctly without `on_behalf_of`. The only behavioral difference is the charge statement descriptor shows the platform name instead of the organizer's, and disputes go to the platform account. To re-enable `on_behalf_of`, contact Stripe support to activate the `stripe_balance.stripe_transfers` feature for this platform.

**Also in this PR (unrelated to the 500, applied earlier):**

- `apps/web/app/lib/stripe/stripe.ts` — `apiVersion` set to `'2020-08-27' as any` to avoid a TypeScript build failure introduced by the original (incorrect) version downgrade attempt.
- `apps/web/app/api/purchase/create-payment-intent/route.ts` — Both response paths return `connectedAccountId: org.stripe_account_id` for mobile PaymentSheet initialization.
- `apps/mobile/hooks/useCheckout.ts` — `connectedAccountId` added to `paymentIntentResponseSchema`; `stripeAccountId` conditionally passed to both `initPaymentSheet` calls.

**Files:** `apps/web/app/api/purchase/create-payment-intent/route.ts`, `apps/web/app/lib/stripe/stripe.ts`, `apps/mobile/hooks/useCheckout.ts`

---

### 55. Mobile email/password sign-in broken after Clerk Core 3 upgrade (Apr 14, 2026)

**Root cause:** `@clerk/expo` v3 uses `@clerk/react` v6 (Clerk Core 3), which completely changed `useSignIn()` and `useSignUp()` hook APIs:

| API                       | Clerk Core 2                        | Clerk Core 3                                                    |
| ------------------------- | ----------------------------------- | --------------------------------------------------------------- |
| `useSignIn()` returns     | `{ signIn, isLoaded, setActive }`   | `{ signIn, errors, fetchStatus }`                               |
| `useSignUp()` returns     | `{ signUp, isLoaded, setActive }`   | `{ signUp, errors, fetchStatus }`                               |
| `setActive` source        | From `useSignIn()`/`useSignUp()`    | From `useClerk()`                                               |
| `signIn.create()` returns | `{ status, createdSessionId, ... }` | `{ error }` — status lives on `signIn` object (reactive signal) |

Two bugs resulted:

1. `isSignInLoaded` was `undefined` (property removed), causing the `!isSignInLoaded` guard to always block sign-in with no feedback.
2. After removing that guard, `result.status` from `signIn.create()` was `undefined` (return shape changed), so the complete branch was never reached and "Additional verification required" was shown — even though the session was successfully created internally (visible on app restart).

Additionally, Clerk Core 3 introduced **Client Trust**: password sign-ins from new devices return `needs_client_trust` status requiring an email OTP before the session is activated.

**Fixes applied (`apps/mobile/hooks/useSignInHandlers.ts`):**

1. Replaced `{ signIn, isLoaded: isSignInLoaded, setActive: setSignInActive }` destructuring with `const { signIn } = useSignIn()`.
2. Added `const { setActive } = useClerk()` for all session activation.
3. `signIn.create()` and `signIn.attemptSecondFactor()` are called directly. Both throw `ClerkAPIError` on failure — caught by the outer try/catch via `getClerkErrorMessage`. Status read from the reactive `signIn.status` signal after the await, not the return value.
4. Added `needs_client_trust` / `needs_second_factor` handling: calls `signIn.prepareSecondFactor({ strategy: "email_code" })`, sets `pendingClientTrust = true` to show existing code input UI.
5. Updated `onVerifyCode` to branch on `pendingClientTrust` — uses `signIn.attemptSecondFactor()` for sign-in trust verification, `signUp.attemptEmailAddressVerification()` for sign-up email verification.
6. Applied the same Core 3 signal pattern to `onEmailSignUp` and the sign-up path in `onVerifyCode`: `signUp.create()` and `signUp.attemptEmailAddressVerification()` are now called directly (no return-value status read); status is read from `signUp.status` / `signUp.createdSessionId` on the reactive object after the await. Without this fix, new users would hit "Verification incomplete" indefinitely despite entering a valid code.

**Files:** `apps/mobile/hooks/useSignInHandlers.ts`

---

### 56. `stripeAccountId` in `initPaymentSheet` suppresses Apple Pay and shows unexpected payment methods (Apr 14, 2026)

**Symptom:** Apple Pay disappeared from the Stripe PaymentSheet in both the Metro dev build and the App Store build. Bank transfer appeared as a payment option despite being disabled in the platform and connected-account PMC settings.

**Root cause:** The `useCheckout.ts` changes made earlier today added `stripeAccountId: piResponse.connectedAccountId` to both `initPaymentSheet` calls. The server always returns `connectedAccountId` (the org's Stripe connected account ID), so every PaymentSheet was being initialized in the **connected account's context** instead of the platform's. Stripe's iOS SDK responds to `stripeAccountId` by looking up the connected account's Apple Pay configuration and payment method settings — not the platform's. The connected account had no registered `merchant.com.projectflame.app` certificate → Apple Pay hidden. The connected account's payment method defaults differed from the platform's disabled-Bank PMC settings → Bank appearing.

The `stripeAccountId` parameter in `initPaymentSheet` is only for cases where the PaymentIntent was created **on behalf of** the connected account (destination charge with `on_behalf_of`). Since `on_behalf_of` was removed (Fix #54), the PI now belongs to the platform account, and `stripeAccountId` must not be passed.

**Fix (`apps/mobile/hooks/useCheckout.ts`):**

- Removed `stripeAccountId?: string` from the `initPaymentSheet` params type definition.
- Removed `...(piResponse.connectedAccountId ? { stripeAccountId: piResponse.connectedAccountId } : {})` from both `initPaymentSheet` call sites (RSVP paid flow and direct purchase flow).
- `connectedAccountId` remains in `paymentIntentResponseSchema` (returned by server for reference) but is no longer forwarded to the PaymentSheet.

**Files:** `apps/mobile/hooks/useCheckout.ts`

---

### 57. Hide FLAME org and its events from the production App Store build (Apr 14, 2026)

**Problem:** The FLAME org (Flame team's own internal organization) and its 4 published events appear in the public App Store app alongside real organizers and events, confusing production users.

**Goal:** FLAME content should be visible in:

- Metro dev (`__DEV__` = true)
- Dev-client device builds (EAS channel: `"development"`)
- TestFlight internal review builds (EAS channel: `"preview"`)

And hidden from:

- Public App Store release (EAS channel: `"production"`)

**Fix:**

1. **`apps/mobile/lib/internal.ts`** (new file) — single source of truth for the gate and org ID list:
   - `INTERNAL_ORG_IDS`: array containing FLAME's org ID (`f21bf79f-30cf-41ec-8ee2-d0e08b4b920b`)
   - `isProductionBuild`: `!__DEV__ && Updates.channel === "production"` (from `expo-updates`)

2. **`apps/mobile/hooks/useAppEvents.ts`** — after Zod validation, filters `rawEvents` to strip events whose `organization_id` is in `INTERNAL_ORG_IDS` when `isProductionBuild` is true.

3. **`apps/mobile/hooks/useOrganizations.ts`** — adds `.not("id", "in", ...)` Supabase filter at the query level when `isProductionBuild` is true, so FLAME never appears in the ExploreOrganizers home section or the event filter bottom sheet.

4. **`apps/mobile/hooks/useSearchApprovedOrganizations.ts`** — merges `INTERNAL_ORG_IDS` into the `effectiveExcludeIds` list when `isProductionBuild` is true, so FLAME is excluded from co-host search results in production.

5. **`apps/mobile/eas.json`** — added `testflight` build profile with `channel: "preview"` and `distribution: "store"`. Use this profile (`eas build --profile testflight`) for all TestFlight internal review submissions. The `production` profile (channel: `"production"`) is reserved for public App Store releases only.

**Build commands:**

- Internal TestFlight review: `eas build --platform ios --profile testflight`
- Public App Store release: `eas build --platform ios --profile production`

**Files:** `apps/mobile/lib/internal.ts` (new), `apps/mobile/hooks/useAppEvents.ts`, `apps/mobile/hooks/useOrganizations.ts`, `apps/mobile/hooks/useSearchApprovedOrganizations.ts`, `apps/mobile/eas.json`

---

### 58. Hide FLAME org and events from the production web app (www.flme.co) (Apr 14, 2026)

**Problem:** The FLAME org and its events were already hidden from the production mobile app (Fix #57) but were still visible on the production website at www.flme.co — home page, `/events`, `/discover`, and the sitemap.

**Fix:** Applied the same internal-content gate to all public-facing web pages using the existing `isProduction()` helper (which correctly uses `VERCEL_ENV === "production"`, not `NODE_ENV`, so Vercel preview deployments are unaffected).

1. **`apps/web/app/lib/internal.ts`** (new file) — mirrors `apps/mobile/lib/internal.ts`. Single source of truth for `INTERNAL_ORG_IDS` on the web side.

2. **`apps/web/app/page.tsx`** (home) — adds `.not("organization_id", "in", ...)` to the events query when `isProduction()` is true.

3. **`apps/web/app/events/page.tsx`** — adds `.not("organization_id", "in", ...)` to the events query and `.not("id", "in", ...)` to the org filter sidebar query when `isProduction()`.

4. **`apps/web/app/discover/page.tsx`** — same filters as `/events`.

5. **`apps/web/app/sitemap.ts`** — excludes FLAME event slugs from the sitemap in production so they are never indexed by search engines.

**Environment matrix (web):**

| Environment                  | `VERCEL_ENV`   | FLAME visible? |
| ---------------------------- | -------------- | -------------- |
| Local dev (`next dev`)       | not set        | ✓              |
| Vercel preview (PR branches) | `"preview"`    | ✓              |
| Production (`www.flme.co`)   | `"production"` | ✗              |

**Files:** `apps/web/app/lib/internal.ts` (new), `apps/web/app/page.tsx`, `apps/web/app/events/page.tsx`, `apps/web/app/discover/page.tsx`, `apps/web/app/sitemap.ts`

---

### 59. Move INTERNAL_ORG_IDS to packages/lib (shared constant, no duplicate literals) (Apr 14, 2026)

**Problem (PR review):** `INTERNAL_ORG_IDS` was defined as a duplicate array literal in both `apps/web/app/lib/internal.ts` and `apps/mobile/lib/internal.ts`, violating the project rule that shared constants must live in `packages/lib` and never be duplicated across apps.

**Fix:**

1. **`packages/lib/src/utils/internal.ts`** (new) — single source of truth for `INTERNAL_ORG_IDS`.
2. **`packages/lib/src/utils/index.ts`** — re-exports `INTERNAL_ORG_IDS` from `./internal`.
3. **`packages/lib/src/index.ts`** — adds `INTERNAL_ORG_IDS` to the main UTILS export block.
4. **`apps/mobile/lib/internal.ts`** — removes the local array literal; re-exports `INTERNAL_ORG_IDS` from `@project-flame/lib` instead. Mobile hook import paths (`../lib/internal`) unchanged.
5. **`apps/web/app/lib/internal.ts`** — deleted (fully redundant; only contained the duplicate array).
6. **`apps/web/app/page.tsx`, `events/page.tsx`, `discover/page.tsx`, `sitemap.ts`** — updated to `import { INTERNAL_ORG_IDS } from "@project-flame/lib"`.

`isProductionBuild` in `apps/mobile/lib/internal.ts` is platform-specific (`expo-updates`) and remains where it is.

**Files:** `packages/lib/src/utils/internal.ts` (new), `packages/lib/src/utils/index.ts`, `packages/lib/src/index.ts`, `apps/mobile/lib/internal.ts`, `apps/web/app/lib/internal.ts` (deleted), `apps/web/app/page.tsx`, `apps/web/app/events/page.tsx`, `apps/web/app/discover/page.tsx`, `apps/web/app/sitemap.ts`

---

### 60. Fix `testflight` EAS build profile using shared `"preview"` channel (Apr 14, 2026)

**Problem (PR review Bug 1):** The `testflight` build profile in `apps/mobile/eas.json` was set to `channel: "preview"` — the same channel as the `preview` profile — but the two profiles embed different `EXPO_PUBLIC_API_URL` values at JS bundle compile time (`https://staging.flme.co` for `preview` vs `https://www.flme.co` for `testflight`). An `eas update --channel preview` OTA push delivers a single JS bundle to all devices on that channel, so one group would receive the wrong API server URL.

**Fix:** Changed `testflight` profile to `channel: "testflight"` so OTA updates can be scoped independently from `preview` channel builds.

Side effect verified: `isProductionBuild` in `apps/mobile/lib/internal.ts` checks `Updates.channel === "production"`. With the new `"testflight"` channel, `isProductionBuild` remains `false` for TestFlight review builds — internal org content (FLAME) continues to be visible to App Store reviewers, which is the intended behavior.

**Build commands (unchanged):**

- Internal TestFlight review: `eas build --platform ios --profile testflight`
- OTA push to TestFlight builds: `eas update --channel testflight`
- OTA push to preview/staging builds: `eas update --channel preview`
- Public App Store release: `eas build --platform ios --profile production`

**Files:** `apps/mobile/eas.json`

---

### 61. Add `returnURL` to `initPaymentSheet` for 3DS and redirect-based payment methods (Apr 14, 2026)

**Problem:** Both `initPaymentSheet` calls in `useCheckout.ts` (RSVP paid flow and direct purchase flow) were missing the `returnURL` parameter. Stripe's PaymentSheet suppresses payment methods that require out-of-app redirects (3DS card authentication, iDEAL, Bancontact, etc.) when `returnURL` is absent. Ecuadorian bank cards frequently trigger 3DS (Visa Verified / Mastercard SecureCode), so affected cardholders could see payment methods silently hidden or hit a dead end mid-authentication.

**Web:** Already correctly handled — `StripePaymentForm.tsx` passes `return_url` via `confirmParams` with `redirect: "if_required"` in `stripe.confirmPayment()`. No web change needed.

**Fix:** Added `returnURL: "project-flame://stripe-redirect"` to both `initPaymentSheet` calls:

1. RSVP paid flow (Step 2 — PaymentSheet for manual-capture PI)
2. Direct purchase flow (Step 3 — PaymentSheet for immediate-capture PI)

The deep link scheme `project-flame` is declared in `app.json` (`"scheme": ["project-flame", "com.projectflame.app"]`). After 3DS or a bank redirect, iOS will re-open the app via this URL and Stripe's SDK will resume the PaymentSheet flow automatically.

Also updated the `getStripeFunctions` internal type definition to include `returnURL?: string` in the `initPaymentSheet` params signature.

**Files:** `apps/mobile/hooks/useCheckout.ts`

---

### 62. Event creation — sales end pre-fill uses event END date + remove "must end before event starts" validation (Apr 15, 2026)

**Problem (two bugs):**

1. **Wrong pre-fill date.** On both platforms, ticket tier `sales_end` was pre-filled with the event _start_ time, not the event _end_ time.
   - Web: auto-filled to `event.starts_at - 1ms` when the user picked the event start date.
   - Mobile (`EditableTierCard`): auto-filled to `eventStartsAt` via a `useEffect` watching `tier.sales_end`.
   - Users want to sell tickets through the entire event, so the correct default is event _end_.

2. **Incorrect validation gate.** Web `CreateEventForm.validateFormData` blocked creation if `salesEndDate >= event.starts_at` — "Sales must end before the event starts". This prevented setting `sales_end` to any time during or after the event, even though selling through the event is a valid use case. This also silently disabled the mobile submit button because the pre-filled `sales_end = eventStartsAt` triggered `end <= start` in `isCreateEventDisabled` in edge scenarios.

**Fix:**

- **Web `CreateEventForm.tsx`:**
  - Removed the validation rule `if (salesEndDate >= startDate)`.
  - Removed the `starts_at` onChange auto-update logic that reset `sales_end` to `event.starts_at - 1ms`.
  - Added `ends_at` onChange handler that auto-fills any empty tier `sales_end` with the new event end value.
  - Removed now-unused `utcToLocal` import from `@project-flame/lib`.

- **Mobile `EditableTierCard.tsx`:**
  - Added `eventEndsAt?: string` prop.
  - Changed the `useEffect` pre-fill to use `eventEndsAt` instead of `eventStartsAt`.

- **Mobile `TicketTiersTab.tsx`:**
  - Added `eventEndsAt?: string` to interface and props, threaded through to `EditableTierCard`.

- **Mobile `create-event.tsx`:**
  - Passed `eventEndsAt={eventForm.ends_at}` to `TicketTiersTab`.

**API (`/api/events/route.ts`):** No change needed — no "sales end before event start" check exists there.

**Remaining validation (kept on both platforms):** `sales_end > sales_start` — still required and correct.

**Files:** `apps/web/app/components/forms/CreateEventForm.tsx`, `apps/mobile/components/create-event/EditableTierCard.tsx`, `apps/mobile/components/create-event/TicketTiersTab.tsx`, `apps/mobile/app/(tabs)/create-event.tsx`

---

### 63. Mobile event creation — replace validation Alerts with inline error messages (Apr 15, 2026)

**Problem:** On web, failed event creation shows a persistent red error string above the submit button (matching the pattern of `validateFormData()` → `error` state → inline `<div>`). On mobile, all validation failures used `Alert.alert("Validation Error", ...)` which disappears immediately and leaves the user with no visible indication of what went wrong. Additionally, the "Next Step" button on the Event Details tab had no validation — it silently advanced even when required fields were empty.

**Fix:**

- **`create-event.tsx`:**
  - Added `submitError` state (string, cleared at the start of every submit attempt).
  - Replaced all `Alert.alert("Validation Error", ...)` calls in `handleSubmit` with `setSubmitError(message); return` — the error now persists on screen until the next submit attempt or the user fixes it.
  - Kept `Alert.alert` for: org-missing guard, image upload failure (event already created), success confirmation, and API/network catch errors.
  - Passes `submitError` to `TicketTiersTab`.

- **`TicketTiersTab.tsx`:**
  - Added `submitError?: string` prop.
  - Renders a red (`#F87171`) error `Text` above the Create Event button when `submitError` is set — matches web's `{error && <div className="text-red-400 ...">}` pattern above the submit button.

- **`EventDetailsTab.tsx`:**
  - Added local `stepError` state.
  - "Next Step" `Pressable` now validates name, venue, city, starts_at, and ends_at before advancing. If any required field is missing, sets `stepError` and returns — the error message is shown in red above the button. Clears on successful validation.

**Files:** `apps/mobile/app/(tabs)/create-event.tsx`, `apps/mobile/components/create-event/TicketTiersTab.tsx`, `apps/mobile/components/create-event/EventDetailsTab.tsx`

---

### 64. Event creation audit: registration form builder added to web + last remaining Alert replaced on mobile (Apr 15, 2026)

**Problems found during audit:**

1. **Web: registration form builder was missing.** Mobile has a fully-implemented `RegistrationFormBuilder` that lets organizers define custom RSVP form fields (label, type, required flag). The web `CreateEventForm` had only the "RSVP Required?" toggle but no way to add custom fields, and never sent `registration_form_config` to the API. The API already accepted and stored it — the web just never sent it.

2. **Mobile: one remaining `Alert.alert("Validation Error", ...)` missed in the previous round.** The `invalidTierIndex` check (validating that UTC conversion of `sales_start`/`sales_end` succeeded) still used `Alert.alert` instead of `setSubmitError`.

**Fixes:**

- **Web `CreateEventForm.tsx`:**
  - Added `import type { FormField } from "../modals/RegistrationFormModal"` (reuses the same type the API and attendee-facing modal use).
  - Added `registrationFormEnabled` (boolean) and `registrationFields` (FormField[]) state.
  - `requires_rsvp` toggle onChange now clears both states when RSVP is turned off (matching mobile behavior).
  - Added inline registration form builder UI inside the "Purchase Settings" card, gated behind `requires_rsvp`. Shows:
    - "Include registration form" checkbox (seeds one blank field when enabled; clears fields when disabled).
    - Inline field list: label input, type select (text/email/number/date/checkbox), required checkbox, remove button.
    - Dashed "Add Field" button.
  - `handleSubmit` now includes `registration_form_config` in the API payload (filtered for non-empty labels, gated on `requires_rsvp && registrationFormEnabled && validRegistrationFields.length > 0`). Matches mobile's filter logic exactly.

- **Mobile `create-event.tsx`:**
  - Replaced the final `Alert.alert("Validation Error", ...)` in `handleSubmit` (the `invalidTierIndex` UTC conversion guard) with `setSubmitError(...)`.

**Parity status after this fix:**

| Feature                                        | Web        | Mobile         |
| ---------------------------------------------- | ---------- | -------------- |
| RSVP toggle                                    | ✅         | ✅             |
| Registration form builder                      | ✅ (added) | ✅             |
| `registration_form_config` sent to API         | ✅ (added) | ✅             |
| Blank-label field filtering before send        | ✅         | ✅             |
| All validation errors shown inline (not Alert) | ✅         | ✅ (completed) |

**Files:** `apps/web/app/components/forms/CreateEventForm.tsx`, `apps/mobile/app/(tabs)/create-event.tsx`

---

### 65. Pending RSVP Excel export — include registration form answers (web + mobile) (Apr 15, 2026)

**Problem:** Exporting pending RSVPs to XLSX only included ticket-related columns (`Name`, `Tier`, `Email`, `Price`, `Request Date`). Custom answers from `registration_data` (keyed by field `id` from `registration_form_config`) were never written to the spreadsheet, even though both platforms store that data and show it in the RSVP detail modal.

**Fix:**

- **`packages/lib/src/utils/pending-rsvp-export.ts`:**
  - Added `RegistrationExportColumn`, `normalizeRegistrationExportColumns`, `formatRegistrationValueForExport`, and `registrationValuesForExportColumns`.
  - Extended `buildPendingRsvpExportAoa` with an optional fourth argument: when non-empty, header row and each data row append one column per configured field (header = field label, cells = stringified answers; booleans → Yes/No, arrays joined, objects JSON-stringified).

- **Web `RsvpManagement.tsx`:** Pending export now passes `registrationFormConfig` (polled state) into the shared builder and fills `registrationValues` from each RSVP's `registration_data`. Column widths extended for the extra columns.

- **Mobile `organizer-xlsx-export.ts` + `rsvp-detail.tsx`:** `exportPendingRsvpsXlsx` now accepts optional `registrationFormConfig` and each row optional `registrationData`; uses the same `@project-flame/lib` helpers as web for parity. RSVP detail screen passes `data.registrationFormConfig` and per-row `registrationData`.

- **Tests:** `packages/lib/__tests__/pending-rsvp-export.test.ts` covers column normalization and sheet layout with/without registration columns.

**Files:** `packages/lib/src/utils/pending-rsvp-export.ts`, `packages/lib/src/utils/index.ts`, `packages/lib/src/index.ts`, `packages/lib/__tests__/pending-rsvp-export.test.ts`, `apps/web/app/components/RsvpManagement.tsx`, `apps/mobile/lib/organizer-xlsx-export.ts`, `apps/mobile/app/rsvp-detail.tsx`

---

### 66. Web Stripe Elements — `colorPrimary` used Flame red (looked like errors) (Apr 15, 2026)

**Problem:** Checkout wrapped Stripe `Elements` with `appearance.variables.colorPrimary: #FF0000`. Stripe uses that token for Link (“Secure, fast checkout with Link”), wallet buttons (e.g. Apple Pay) accents, and primary focus styling — so the UI read as broken/error despite being normal chrome.

**Fix:** Set `colorPrimary` to Flame `white-100` so embedded Stripe UI matches the design rule (brand red is for RSVP/status on images, not payment chrome). Centralized the full night-theme appearance in `apps/web/app/lib/stripe/checkout-elements-appearance.ts` and wired `RsvpPaymentModal` + `StripePurchaseFlow` to import it (single source of truth, parity between RSVP and token purchase flows). Checkout appearance now pulls raw color/radius strings from `@project-flame/lib` (`flameColors`, `flameColorWhite` alias for `white-100`, `flameRadii`) so values stay aligned with `packages/ui/tailwind.config.js`; added Tailwind `white-60` to match existing Stripe focus borders.

**Files:** `packages/lib/src/design-tokens/flame-colors.ts`, `packages/lib/src/design-tokens/flame-layout.ts`, `packages/lib/src/index.ts`, `packages/ui/tailwind.config.js`, `apps/web/app/lib/stripe/checkout-elements-appearance.ts`, `apps/web/app/components/modals/RsvpPaymentModal.tsx`, `apps/web/app/components/StripePurchaseFlow.tsx`

---

### 67. Create-event review: token fix, helper text, registration guard, stepError auto-clear (Apr 15, 2026)

**Problem (4 findings from PR review):**

1. **Hardcoded hex in error text (mobile):** `TicketTiersTab` and `EventDetailsTab` used `text-[#F87171]` for inline error messages — a raw hex that violates the design-token rule. (Note: the `error` design token is `#EA3370`, a different color, so `text-error` would be incorrect. `#F87171` is exactly Tailwind's `red-400`, which is available from the default palette and already used throughout the web app for the same purpose.)

2. **Outdated helper copy (web):** The note near ticket-tier inputs still read "ticket sales must end before the event starts", which was removed in a prior fix. The current rule is that `sales_end` defaults to the event end time and only needs to be after `sales_start`.

3. **Silent registration form omission (web):** When `registrationFormEnabled` was `true` but all field labels were blank, `registration_form_config` was silently excluded from the submitted event — the organizer's intent was ignored without feedback.

4. **stepError not cleared on edit (mobile):** `EventDetailsTab` set `stepError` on "Next Step" press but never cleared it while the user was correcting inputs, leaving a stale error message visible.

**Fix:**

1. Replaced `text-[#F87171]` with `text-red-400` in both `TicketTiersTab.tsx` and `EventDetailsTab.tsx`.
2. Updated the helper `<p>` near ticket-tier inputs to explain the new `sales_end` defaulting behaviour and drop the obsolete restriction.
3. Added an explicit guard in `handleSubmit` (before `formattedEvent` is built): if `registrationFormEnabled && validRegistrationFields.length === 0`, calls `setError(...)` and returns — the organizer sees a clear message to add at least one field or disable the toggle.
4. Added a `useEffect` in `EventDetailsTab` watching `form.name`, `form.venue`, `form.city`, `form.starts_at`, and `form.ends_at` that calls `setStepError("")` whenever any of those fields changes, clearing the error as soon as the user starts correcting it.

**Files:** `apps/mobile/components/create-event/TicketTiersTab.tsx`, `apps/mobile/components/create-event/EventDetailsTab.tsx`, `apps/web/app/components/forms/CreateEventForm.tsx`

---

### 69. Email templates: fix mobile padding stacking causing squished content (Apr 15, 2026)

**Problem:** On mobile, email content was severely squished along the X axis due to two layers of horizontal padding stacking: the outer `<td>` had `padding: 40px 16px` (16px each side) and every inner cell had `padding: 0 40px` (40px each side), totalling ~56px per side on a ~375px screen.

**Fix:** Added a `@media only screen and (max-width: 620px)` block in the shared `wrapEmailHtml` `<style>` tag. On mobile:

- `.email-outer-td` → `padding: 0` (white card goes full-width, gray background eliminated)
- `.email-inner-table` → `width: 100%` (forces table to fill viewport)
- `.email-logo-td` → `padding: 24px 20px 16px`
- `.email-body-td` → `padding: 0 20px 32px`
- `.email-divider-td` → `padding: 0 20px`
- `.email-footer-td` → `padding: 20px 20px 28px`

Applied corresponding class names (`email-outer-td`, `email-logo-td`, `email-body-td`, `email-divider-td`, `email-footer-td`) to the relevant `<td>` elements in the wrapper. Desktop layout (40px inner padding, 16px outer margin) is unchanged. Applies to all emails since all use `wrapEmailHtml`.

**Files:** `apps/web/app/lib/email/email-styles.ts`

---

### 70. Refactor EventDetailsTab "Next Step" validation into a rules array (Apr 15, 2026)

**Problem:** The `onPress` handler for the "Next Step" button in `EventDetailsTab.tsx` contained five sequential `if (!field) { setStepError(...); return; }` blocks — repetitive and hard to extend.

**Fix:** Extracted the checks into a `rules` array (`{ check: () => boolean; message: string }[]`) and used `Array.find` to locate the first failing rule. Behaviour is identical; adding a new validation rule now requires a single array entry.

**Files:** `apps/mobile/components/create-event/EventDetailsTab.tsx`

---

### 71. W1-7: Fix auth error messages on mobile (Apr 15, 2026)

**Problem:** Users occasionally saw "Additional verification required. Please try again." when entering a wrong password, because (1) `getClerkErrorMessage` only read `errors[0].message` without checking the Clerk error code, and (2) the unhandled-status fallback in `onEmailSignIn` used that generic 2FA-implying copy for any unexpected `signIn.status`.

**Fix:**

- Added Clerk error code mapping in `getClerkErrorMessage`: `form_password_incorrect` → `"Incorrect password. Please try again."`, `form_identifier_not_found` → `"No account found with this email address."`, `form_password_pwned` → compromised password message, `too_many_attempts` → rate-limit message, `session_exists` → already signed in message. Unknown codes fall through to `errors[0].message`.
- Extended the type annotation from `{ message: string }[]` to `{ code?: string; message: string }[]`.
- Fixed the unhandled-status fallback message from `"Additional verification required. Please try again."` to `"Sign in could not be completed. Please try again or contact support."`.

**Files:** `apps/mobile/hooks/useSignInHandlers.ts`

---

### 72. W1-1: Show org name on mobile create-event screen (Apr 15, 2026)

**Problem:** Organizers had no visible indication of which organization they were creating an event under on the mobile create-event screen. The web version shows "Add a new event for {orgName}" in the subtitle, but mobile only showed the org logo avatar in the DashboardBar with no text context.

**Fix:** Added a subtle hint line `"Creating under {orgName}"` immediately below `<KeyboardDoneBar />` inside the `ScrollView` content, at the top of the create-event screen. Styled as `text-white-50 text-xs font-poppins px-4 pt-3 pb-1`. Only renders when `orgData.organizationName` is truthy.

**Files:** `apps/mobile/app/(tabs)/create-event.tsx`

---

### 73. W1-8: Keyboard handling audit and fix across mobile screens (Apr 15, 2026)

**Problem:** Several screens with embedded `TextInput` fields (via child cards) lacked proper keyboard handling — no `keyboardShouldPersistTaps`, no dismiss-on-scroll, causing the keyboard to get stuck when users scrolled or tapped outside inputs.

**Fix:**

- `account.tsx`: Added `keyboardShouldPersistTaps="handled"` + `onScrollBeginDrag={Keyboard.dismiss}` to the root `ScrollView`; added `Keyboard` to react-native imports.
- `edit-event.tsx`: Already had `keyboardShouldPersistTaps="handled"` — added `onScrollBeginDrag={Keyboard.dismiss}` and `Keyboard` import.
- `org-event-detail.tsx`: Added `keyboardShouldPersistTaps="handled"` + `onScrollBeginDrag={Keyboard.dismiss}` to the root `ScrollView` (child cards `OrgSendTicketsCard`, `OrgPromotionsCard`, `OrgPromoterLinksCard` all contain `TextInput` elements); added `Keyboard` to react-native imports.
- `org-members.tsx`: No text inputs on-screen (sheets have their own `KeyboardAvoidingView`) — no changes needed.
- `EditableTierCard.tsx`: Already uses `inputAccessoryViewID` + `KeyboardDoneBar`; parent screens already handle `keyboardShouldPersistTaps` — no changes needed.

**Files:** `apps/mobile/app/account.tsx`, `apps/mobile/app/edit-event.tsx`, `apps/mobile/app/org-event-detail.tsx`

---

### 74. W1-2: Fix tier defaults — per_user_limit and quantity_total (Apr 15, 2026)

**Problem:** Default values for new ticket tiers were incorrect on both platforms:

- `per_user_limit` defaulted to 4 (web) and 1 (mobile) — should be 20.
- `quantity_total` defaulted to 100 for the first tier and 50 for added tiers — should be 500 everywhere.

**Fix:**

- **Mobile `create-event.tsx`:** Updated `makeDefaultTier()` (`quantity_total: 100 → 500`, `per_user_limit: 1 → 20`) and `handleAddTier` callback (`quantity_total: 50 → 500`, `per_user_limit: 1 → 20`).
- **Web `CreateEventForm.tsx`:** Updated the initial `ticketTiers` useState (`quantity_total: 100 → 500`, `per_user_limit: 4 → 20`, initial stage `quantity: 100 → 500`) and `handleAddTier` (`quantity_total: 50 → 500`, `per_user_limit: 4 → 20`, stage `quantity: 50 → 500`).

**Files:** `apps/mobile/app/(tabs)/create-event.tsx`, `apps/web/app/components/forms/CreateEventForm.tsx`

---

### 75. W1-4: Increase event detail text sizes (Apr 15, 2026)

**Problem:** Event detail text was too small — title, organizer name, description, and metadata (dates, location) lacked visual weight and legibility.

**Fix:**

- **Web `EventDetail.tsx`:** Title `h1` `text-2xl` → `text-3xl`; organizer badge `text-sm` → `text-base`; description `text-sm leading-5 font-poppins-light` → `text-base leading-[22px] font-poppins-light`; date, time-range, and location rows `text-sm font-poppins-light` → `text-sm font-poppins` (removed `light` weight for better legibility without a size bump on metadata).
- **Mobile `EventHero.tsx`:** Title `FlameText variant="h4"` → `variant="h3"` (text-lg → text-2xl); description `text-sm leading-5 font-poppins-light` → `text-base leading-[22px] font-poppins-light`.
- **Mobile `OrganizerBadge.tsx`:** Organizer name `FlameText variant="subtitle2-light"` → `variant="subtitle1"` (text-xs → text-sm).
- **Mobile `EventMeta.tsx`:** All metadata rows (RSVP badge, date, time-range, location) `FlameText variant="subtitle2-light"` → `variant="subtitle1-light"` (text-xs → text-sm).

**Files:** `apps/web/app/components/EventDetail.tsx`, `apps/mobile/components/event-details/EventHero.tsx`, `apps/mobile/components/event-details/OrganizerBadge.tsx`, `apps/mobile/components/event-details/EventMeta.tsx`

---

### 76. W1-5: Fix tier sorting — price primary, order_index tiebreaker (Apr 15, 2026)

**Problem:** Tier sort was inconsistent across platforms. Mobile (`useEventDetails.ts`) sorted by `order_index` only, ignoring price. Web (`EventDetail.tsx`) sorted by price only with no tiebreaker, leaving same-price tiers (e.g., Day 1 $20 vs Day 2 $20) in undefined order. Also added missing `order_index?: number` to the web-local `EventDetailEvent.ticket_tiers` interface.

**Fix:** Both platforms now sort price ascending (primary), then `order_index` ascending (tiebreaker). Free tiers surface first, same-price tiers fall back to their authored order.

- **Web `EventDetail.tsx`:** Added `order_index` field to `EventDetailEvent.ticket_tiers` interface; added tiebreaker `return (a.order_index ?? Infinity) - (b.order_index ?? Infinity)` after existing price diff check.
- **Mobile `useEventDetails.ts`:** Replaced `order_index`-only sort with price-primary + `order_index` tiebreaker, using the same min-stage-price helper pattern as web.

**Files:** `apps/web/app/components/EventDetail.tsx`, `apps/mobile/hooks/useEventDetails.ts`

### 77. W1-3: Change tier sales end validation to "before event ends" (Apr 15, 2026)

**Business rule change:** Ticket sales may run concurrently with the event (e.g., door sales), but must close before the event ends. The old rule ("before event starts") was too restrictive.

**Fix:**

- **`apps/web/app/api/ticket-tiers/route.ts` — POST handler:** Added `ends_at` to the event select (`id, starts_at, ends_at, organization_id`). Changed condition from `salesEnd >= eventStart` to `salesEnd > new Date(event.ends_at)`. Updated error message to `"Ticket sales must end before the event ends"`.
- **`apps/web/app/api/ticket-tiers/route.ts` — PATCH handler:** Added `ends_at` to `TierWithEvent` type and to the `events!inner` select. Replaced the `eventStart` variable and the `salesEnd >= eventStart` condition with `const eventEnd = new Date(tierCheck.events.ends_at)` and `salesEnd > eventEnd`. Updated error message to `"Ticket sales must end before the event ends"`. Removed the unused `tentative_event_start` branch from this validation (only affected event-start comparison which is no longer the rule).
- **`apps/web/app/organizer/event/[id]/OrgEventDetailClient.tsx`:** In `handleSaveEventChanges`, changed the per-tier alert check from `new Date(tier.sales_end) >= startsAt` to `new Date(tier.sales_end) > endsAt` (already in scope). Updated alert message to `"…sales must end before the event ends."`. Updated the info note text from "before the event starts" to "before the event ends".

**Files:** `apps/web/app/api/ticket-tiers/route.ts`, `apps/web/app/organizer/event/[id]/OrgEventDetailClient.tsx`

### 78. W1-6: Add secret_code field to organizer tier create/edit UI (Apr 15, 2026)

**Problem:** Organizers could not set an access code (`secret_code`) when creating or editing a ticket tier — the field existed in the DB and was enforced at checkout, but there was no UI or API support for organizers to set it.

**Fix:**

- **`apps/web/app/api/ticket-tiers/route.ts`:** Added `secret_code: z.string().min(3).nullable().optional()` to both `createTierSchema` and `updateTierSchema`. In the POST handler, `secret_code` is extracted from `validatedData` and applied via a secondary `update` call after the RPC creates the tier (the RPC does not accept `secret_code` as a parameter). In the PATCH handler, `secret_code` flows naturally through `updateData` into the update query.
- **`apps/web/app/components/organizer/TierInlineForm.tsx`:** Added `secret_code` to `formData` state (initialized from `tier?.secret_code ?? null`). Added an "Access Code (optional)" text input below the sales date fields with helper text explaining that attendees must enter the code to purchase. Included `secret_code` in the PATCH/POST payload.
- **`apps/mobile/components/events-management/EditTiersTab.tsx`:** Added `requireAccessCode`/`editSecretCode` state to `ExistingTierCard` edit mode — toggle checkbox + text input appear in the edit form; `secret_code` included in update payload with min-3-char validation. Added `requireNewAccessCode`/`newSecretCode` state to the "Add New Tier" form — same toggle + input pattern; included in create payload. Added a read-only "Access code required" indicator row in the tier display card when `tier.secret_code` is set.
- **`apps/mobile/hooks/useTierMutations.ts`:** Added `secret_code?: string | null` to `CreateTierInput` and `UpdateTierInput`.
- **`apps/mobile/hooks/useOrgEvents.ts`:** Added `secret_code?: string | null` to `OrgEventTier` interface.
- **`apps/mobile/hooks/useCreateEvent.ts`:** Added `secret_code?: string | null` to `CreateEventTierInput` interface.
- **`apps/mobile/app/(tabs)/create-event.tsx`:** Added `secret_code: null` to `makeDefaultTier()`.

**Files:** `apps/web/app/api/ticket-tiers/route.ts`, `apps/web/app/components/organizer/TierInlineForm.tsx`, `apps/mobile/components/events-management/EditTiersTab.tsx`, `apps/mobile/hooks/useTierMutations.ts`, `apps/mobile/hooks/useOrgEvents.ts`, `apps/mobile/hooks/useCreateEvent.ts`, `apps/mobile/app/(tabs)/create-event.tsx`

---

### 79. W1-1 tweak: Center and enlarge org name text on create-event screen (Apr 15, 2026)

**Problem:** The "Creating under {orgName}" hint below the tab switcher was too small (`text-xs`) and left-aligned, making it easy to miss.

**Fix:** `apps/mobile/app/(tabs)/create-event.tsx` — Changed `text-xs` → `text-sm`, added `text-center`, and changed `pt-3 pb-1` → `py-4` for more breathing room.

**File:** `apps/mobile/app/(tabs)/create-event.tsx`

---

### 80. W1-5 fix: Use tier.price_cents (not min stage price) for sort on mobile event details (Apr 15, 2026)

**Problem:** The tier sort in `useEventDetails.ts` computed the sort key as `Math.min(...stage prices)`, which caused staged tiers to sort by their cheapest historical stage price rather than their canonical tier price. This led to incorrect ordering when stage prices varied.

**Fix:** `apps/mobile/hooks/useEventDetails.ts` — Replaced the `getPrice` helper with a direct comparison on `a.price_cents - b.price_cents`. Added `order_index` as first tiebreaker and `created_at.localeCompare` as a stable final tiebreaker.

**File:** `apps/mobile/hooks/useEventDetails.ts`

---

### 81. W1-6b fix: Add secret_code to mobile organizer tier query (Apr 15, 2026)

**Problem:** When an organizer set a `secret_code` on a tier and returned to the edit form, the access-code field was blank because `secret_code` was not included in the `EVENT_FIELDS` Supabase select string in `useOrgEvents.ts`.

**Fix:** `apps/mobile/hooks/useOrgEvents.ts` — Added `secret_code` to the `ticket_tiers (...)` block of the `EVENT_FIELDS` template string.

**File:** `apps/mobile/hooks/useOrgEvents.ts`

---

### 82. W1-6 checkout: No change needed — isProcessing already clears on error (Apr 15, 2026)

**Investigation:** In `useCheckout.ts`, `isProcessing` is a derived value (`step !== "idle" && step !== "success" && step !== "error"`), not a separate state variable. When a `MISSING_SECRET_CODE` error is returned and `step` transitions to `"error"`, `isProcessing` automatically becomes `false`, allowing `CheckoutMainSheet` (with the access-code input) to render. `errorCode={checkoutState.errorCode}` is already passed through in `apps/mobile/app/event/[id].tsx` line 506. No code change required.

**Follow-up:** Product asked for web-style `TicketCodeModal` parity before Stripe; implemented in **#88** (`TicketAccessCodeModal` + `showAccessCodeModal`).

**File:** N/A (investigation only)

---

### 83. W1-5 fix: Use tier.price_cents for sort on web event details (Apr 15, 2026)

**Problem:** The sort in `EventDetail.tsx` used a `getPriceForSorting` helper that returned `Math.min(...tier.ticket_stages.map(s => s.price_cents))` for staged tiers. This sorted by the cheapest historical stage price rather than the canonical tier-level price, producing incorrect ordering when stage prices varied.

**Fix:** `apps/web/app/components/EventDetail.tsx` — Removed `getPriceForSorting` helper entirely. Sort now compares `a.price_cents - b.price_cents` directly, with `order_index` as tiebreaker. Matches the fix applied to mobile in #80.

**File:** `apps/web/app/components/EventDetail.tsx`

**Note:** #83 + mobile #80 were later found to break ordering when `price_cents` is `0` but stages carry the real list price. Corrected approach documented in **#87**.

---

### 84. W1-6b: Add secret_code to web organizer data API select (Apr 15, 2026)

**Problem:** When an organizer set a `secret_code` on a tier and returned to the edit form on web, the access-code field was empty. The `/api/organizer/data/route.ts` query did not include `secret_code` in its `ticket_tiers (...)` nested select, so the field was never sent to the client.

**Fix:** `apps/web/app/api/organizer/data/route.ts` — Added `secret_code` to the `ticket_tiers` nested select block (after `sales_end`, before `order_index`).

**File:** `apps/web/app/api/organizer/data/route.ts`

---

### 85. Sales start: Remove min constraint and make optional on web (Apr 15, 2026)

**Problem:** The `min={getDateTimeLocal(0)}` attribute on the `sales_start` `datetime-local` inputs triggered HTML5 browser validation that prevented organizers from saving tiers with a past sales start date — the browser blocked the form submit even when the date was deliberately set in the past (e.g., editing an existing tier that had already started selling).

**Fix:**

- **`apps/web/app/components/organizer/TierInlineForm.tsx`:** Removed `min={getDateTimeLocal(0)}` from the `sales_start` input. Updated `handleSubmit`: if `formData.sales_start` is blank, `salesStartUtc` is set to `null` instead of calling `ecuadorLocalToUtc("")`. The "invalid sales start" guard now only fires when a non-empty value fails to parse. The `salesEnd <= salesStart` comparison is skipped when `salesStartUtc` is null. Payload now conditionally includes `sales_start`: uses `salesStartUtc` if non-null, omits it (undefined → stripped from JSON) for PATCH with blank value, sends `null` for POST with blank value so the server defaults to the current time.
- **`apps/web/app/components/forms/CreateEventForm.tsx`:** Removed `min={getDateTimeLocal(0)}` from the `sales_start` input. `validateFormData`: changed the required check from `!tier.sales_start || !tier.sales_end` to `!tier.sales_end` — `sales_start` is now optional. The UTC conversion for `salesStartUtc` is skipped (set to `null`) when `tier.sales_start` is blank, and the `salesEnd <= salesStart` comparison is only performed when `salesStartUtc` is non-null. In `formattedTicketTiers`, `sales_start` now sends `null` when `tier.sales_start` is blank (server defaults to now).
- **`apps/web/app/api/ticket-tiers/route.ts`:** Changed `createTierSchema.sales_start` from `z.string().datetime()` to `z.string().datetime().optional().nullable()`. In the POST handler, introduced `effectiveSalesStart = validatedData.sales_start ?? new Date().toISOString()` and used it for both date validation and the RPC `p_sales_start` parameter.

**Files:** `apps/web/app/components/organizer/TierInlineForm.tsx`, `apps/web/app/components/forms/CreateEventForm.tsx`, `apps/web/app/api/ticket-tiers/route.ts`

---

### 86. Sales start: Make optional on mobile create-event flow (Apr 15, 2026)

**Problem:** `localToUtc("", tz)` returns `""` (empty string). With the updated API accepting `optional().nullable()` for `sales_start`, sending `""` would fail Zod validation (not a valid datetime or null). Also, the mobile create-event submit still blocked on `!t.sales_start || !t.sales_end`.

**Fix:** In `apps/mobile/app/(tabs)/create-event.tsx`:

- Changed `const sales_start = localToUtc(t.sales_start, tz)` → `const rawSalesStart = t.sales_start ? localToUtc(...) : null; const sales_start = rawSalesStart || null` — ensures blank sales_start sends `null` (not `""`).
- Changed validation from `!t.sales_start || !t.sales_end` → `!t.sales_end` (only sales_end required).

Also updated `Sales Start *` labels → `Sales Start (optional)` and removed `required` attribute on sales_start inputs in `CreateEventForm.tsx` and `TierInlineForm.tsx`.

**Files:** `apps/mobile/app/(tabs)/create-event.tsx`, `apps/web/app/components/forms/CreateEventForm.tsx`, `apps/web/app/components/organizer/TierInlineForm.tsx`

---

### 87. W1-5: Tier sort uses effective stage price on mobile + web (Apr 15, 2026)

**Problem:** Attendee ticket lists sorted by `tier.price_cents` only. Staged tiers often keep `price_cents` at `0` while the active stage shows a non-zero price, so two tiers at the same displayed price sorted in the wrong order relative to `order_index` (e.g. Día 2 before Día 1).

**Fix:** Sort key is now the minimum `ticket_stages[].price_cents` when stages exist, otherwise `tier.price_cents`, then `order_index`, then stable id / `created_at` tiebreakers — matching what attendees see as the price.

**Files:** `apps/mobile/hooks/useEventDetails.ts`, `apps/web/app/components/EventDetail.tsx`

---

### 88. W1-6 mobile: Access-code modal before PaymentSheet (Apr 15, 2026)

**Problem:** After #82, missing/invalid access codes only surfaced as inline fields on the checkout sheet; users wanted parity with web `TicketCodeModal` before Stripe.

**Fix:** Added `TicketAccessCodeModal` (validates via `POST /api/ticket-tiers/validate-code` with Bearer auth). `useCheckout` sets `showAccessCodeModal` when hold creation or free RSVP returns `MISSING_SECRET_CODE` / `INVALID_SECRET_CODE`, keeps `step` on `idle`, and uses `pendingSecretOverrideRef` + `applyVerifiedAccessCode` so the next `checkout()` call sends the verified code immediately (avoids stale `secretCode` state). Wired in `apps/mobile/app/event/[id].tsx`.

**Files:** `apps/mobile/components/event-details/TicketAccessCodeModal.tsx`, `apps/mobile/hooks/useCheckout.ts`, `apps/mobile/app/event/[id].tsx`

---

### 89. Mobile create-event tier card: optional copy on sales start (Apr 15, 2026)

**Problem:** Sales start is optional in the API, but the tier card title/placeholder did not say so.

**Fix:** `apps/mobile/components/create-event/EditableTierCard.tsx` — title `Sale start date (optional)`, placeholder `Sale start date and time (optional)`.

**File:** `apps/mobile/components/create-event/EditableTierCard.tsx`

---

### 90. W1-5: Fix tier sort order on mobile (Apr 15, 2026)

**Problem:** Mobile event detail showed DÍA 2: CHUY before DÍA 1: REGGEATON. Root cause: the organizer created Day 2 before Day 1, so Day 2 received `order_index=0` and Day 1 received `order_index=1`. Mobile correctly sorts by `order_index` (ascending), causing Day 2 to appear first. Web happened to show the correct order as a side-effect of not including `order_index` in its select (same-price tiers fell through to UUID comparison which coincidentally ordered them correctly).

**Fix:** Data fix via SQL — swapped `order_index` values so DÍA 1: REGGEATON = `0` and DÍA 2: CHUY = `1`. No code changes needed; the existing sort logic (`price → order_index → created_at`) is correct.

**Files:** DB data fix only (Supabase `ticket_tiers` table for event "ZULU: CIERRE DE TEMPO")

---

### 91. W1-6: Proactive access-code modal + security fix (strip secret_code from RPC) (Apr 15, 2026)

**Problem (timing):** The `TicketAccessCodeModal` appeared AFTER clicking "Pay $XX" — between the button tap and the Stripe PaymentSheet — because the modal was only triggered reactively after a `MISSING_SECRET_CODE` error from the hold/RSVP API. This required an extra unnecessary API round-trip. Worse, for RSVP paid flows the `shouldPromptAccessCode` guard was never triggered (`submitting_rsvp && !isFreeRsvpSubmit` was not handled), so the RSVP would silently fail with an error AFTER the PaymentSheet had already been presented, leaving the payment authorized but the RSVP unsubmitted.

**Problem (security):** The `get_event_with_tiers` RPC was using `to_jsonb(tt)` which serialised ALL columns of `ticket_tiers`, including the raw `secret_code` value. This exposed the organizer's private access code to any client (mobile or web) that could call the RPC.

**Fix (RPC migration):** `20260416042751_add_has_secret_code_to_get_event_rpc.sql` — replaces `to_jsonb(tt)` with `(to_jsonb(tt) - 'secret_code')` and adds a computed `has_secret_code = (secret_code IS NOT NULL AND secret_code <> '')` boolean. The client now receives a safe boolean instead of the raw code.

**Fix (mobile proactive gate):** `useEventDetails.ts` — added `has_secret_code?: boolean` to `TicketTierSchema` and `TicketTierWithStatus`. `useCheckout.ts` — added `requestAccessCodeModal()` to hook return, extended `shouldPromptAccessCode` to cover `phase === "submitting_rsvp"` unconditionally (fixes paid-RSVP case). `event/[id].tsx` — `handleContinueToCheckout` now checks `selectedTier.has_secret_code && !secretCode` and calls `requestAccessCodeModal()` before opening the CheckoutSheet. `onVerified` callback opens the sheet if it wasn't open yet (proactive path) or re-runs `checkout()` if it was (reactive fallback path).

**Fix (web proactive gate):** `apps/web/app/events/[slug]/page.tsx` — added `secret_code, order_index` to the `ticket_tiers` SSR select; transforms tiers to derive `has_secret_code = Boolean(secret_code)` and strips the raw `secret_code` before serialising into client props. `EventDetail.tsx` — added `has_secret_code?: boolean` to the tier type; `handlePurchaseClick` now calls `setShowCodeModal(true)` proactively when `selectedTierData?.has_secret_code` is true and `verifiedSecretCode` is not yet set.

**Flow (both platforms, after fix):** "Continue to Checkout" click → if `has_secret_code && !code` → access code modal → user enters + validates → checkout sheet opens (or checkout runs) → Stripe PaymentSheet (for paid flows). Zero extra API calls.

**Files:** `supabase/migrations/20260416042751_add_has_secret_code_to_get_event_rpc.sql`, `apps/mobile/hooks/useEventDetails.ts`, `apps/mobile/hooks/useCheckout.ts`, `apps/mobile/app/event/[id].tsx`, `apps/web/app/events/[slug]/page.tsx`, `apps/web/app/components/EventDetail.tsx`

---

### 92. Create-event API parity: `secret_code`, optional `sales_start`, access-code validation (Apr 15, 2026)

**Problem:** Mobile `create-event` mapped `ticketTiersForApi` without `secret_code`, so access-code tiers were created open. Submit/disable logic still required `sales_start` while the serializer sent `null` for blank starts. `POST /api/events` Zod still required `sales_start` and omitted `secret_code` on insert, diverging from `CreateEventForm` + ticket-tiers behavior. Edit-tier flows could save `secret_code: null` with “Require access code” on; web `TierInlineForm` relied on API errors for short codes.

**Fix:** `apps/mobile/app/(tabs)/create-event.tsx` — include `secret_code` (trimmed, ≥3 chars or null), relax guards so only `sales_end` is required, validate optional start/end ordering and short codes. `useCreateEvent.ts` — `CreateEventTierApiPayload` for `ticket_tiers` typing. `apps/web/app/api/events/route.ts` — optional nullable `sales_start`, default at validation/insert; optional `secret_code` on tier insert. `EditTiersTab.tsx` — require non-empty trimmed code when the toggle is on (create + edit). `TierInlineForm.tsx` — local `secret_code` length check before fetch, single `setError` path.

**Files:** `apps/mobile/app/(tabs)/create-event.tsx`, `apps/mobile/hooks/useCreateEvent.ts`, `apps/mobile/components/events-management/EditTiersTab.tsx`, `apps/web/app/api/events/route.ts`, `apps/web/app/lib/hooks/useForms.ts`, `apps/web/app/components/organizer/TierInlineForm.tsx`

---

### 93. Ticket tier access codes: always uppercase (Apr 15, 2026)

**Problem:** Organizers and attendees could enter mixed-case tier secret codes; comparison was already case-insensitive in some APIs, but stored values were inconsistent.

**Fix:** Added `normalizeTicketTierSecretCode` / `normalizeOptionalTicketTierSecretCode` in `@project-flame/lib` and applied them on all tier-secret inputs (mobile + web), checkout secret state, create-event payload, `POST/PATCH /api/ticket-tiers`, `POST /api/events` tier insert, `POST /api/ticket-tiers/validate-code`, and `POST /api/rsvp/pending`. UI forces caps as you type (`toUpperCase` / `autoCapitalize="characters"`). `TicketCodeModal` uses a `finally` to clear submitting state.

**Files:** `packages/lib/src/validators/ticket-tier-secret-code.ts`, `packages/lib/src/validators/index.ts`, `packages/lib/src/index.ts`, `packages/lib/__tests__/validators.test.ts`, `apps/mobile/app/(tabs)/create-event.tsx`, `apps/mobile/components/events-management/EditTiersTab.tsx`, `apps/mobile/components/event-details/TicketAccessCodeModal.tsx`, `apps/mobile/components/event-details/CheckoutMainSheet.tsx`, `apps/mobile/hooks/useCheckout.ts`, `apps/web/app/components/organizer/TierInlineForm.tsx`, `apps/web/app/components/modals/TicketCodeModal.tsx`, `apps/web/app/components/EventDetail.tsx`, `apps/web/app/api/events/route.ts`, `apps/web/app/api/ticket-tiers/route.ts`, `apps/web/app/api/ticket-tiers/validate-code/route.ts`, `apps/web/app/api/rsvp/pending/route.ts`

---

### 94. Org admin parity: `organizations` UPDATE RLS, Stripe audit SELECT, web org lookup (Apr 16, 2026)

**Problem:** (1) Mobile org settings save failed with “Update did not affect any row” for org **admins** because RLS only allowed updates via owner linkage. (2) `stripe_payment_audit` SELECT still followed baseline patterns (`owner_user_id` / `auth.uid()`), so org admins could not read audit rows and purchaser self-read was wrong under Clerk. (3) Web organizer routing already uses `getUserOrganization` with owner **and** admin membership (`organization_members.role`).

**Fix:** Applied Supabase migrations `org_admins_can_update_organization` (new UPDATE policy: JWT sub + `organization_members` role in `owner`, `admin`) and `fix_stripe_audit_admin_access` (replace audit SELECT policy: `organization_id IN (SELECT get_admin_organizations())` plus purchaser match via `users.clerk_id` and `auth.jwt() ->> 'sub'` — no `auth.uid()`). Local migration filenames renamed to MCP-assigned versions `20260416171913` and `20260416171919`. Confirmed `apps/web/app/lib/roles.ts` already filters `.in("role", ["owner", "admin"])`.

**Follow-up (same day):** `org_admin_update_use_get_admin_organizations` (`20260416180206`) — `DROP`/`CREATE` the org-admin UPDATE policy to use `id IN (SELECT get_admin_organizations())` instead of an inline `organization_members` join, matching other org policies and avoiding RLS recursion on that table. Do not edit an already-applied migration file to change behavior; add a new migration instead.

**Files:** `supabase/migrations/20260416171913_org_admins_can_update_organization.sql`, `supabase/migrations/20260416171919_fix_stripe_audit_admin_access.sql`, `supabase/migrations/20260416180206_org_admin_update_use_get_admin_organizations.sql`, `apps/web/app/lib/roles.ts` (verified)

---

### 95. PR review fixes: access-code race conditions, validation, and tiersNeedUpdate rule (Apr 16, 2026)

Ten fixes from automated PR review, verified against current code:

- **Tier switch resets access code** (`apps/mobile/app/event/[id].tsx`): Added `useEffect` watching `selectedTierId` that calls `checkoutState.resetCheckout()` when the tier changes (after initial mount), preventing a previously verified code from being silently reused on a different tier.
- **TicketAccessCodeModal dismissal guard** (`apps/mobile/components/event-details/TicketAccessCodeModal.tsx`): X `Pressable` and `onRequestClose` now no-op while `submitting` is true, preventing `onVerified` from firing after the user closed the modal.
- **Tier sort uses active stage price** (`apps/mobile/hooks/useEventDetails.ts`): `getTierSortPriceCents` now calls `findFirstAvailableStage()` instead of `Math.min(...stages)`, so sold-out early-bird stages no longer drag the sort key down.
- **Account enumeration fix** (`apps/mobile/hooks/useSignInHandlers.ts`): `form_password_incorrect` and `form_identifier_not_found` collapsed to the same `"Invalid email or password."` message to prevent email enumeration via distinct error text.
- **secret_code validates normalized value** (`apps/web/app/api/events/route.ts`, `apps/web/app/api/ticket-tiers/route.ts`): Replaced `z.string().min(3)` with a `.refine()` that calls the normalizer first, so inputs like `" AB "` (trim → "AB") are correctly rejected.
- **secret_code update error checked** (`apps/web/app/api/ticket-tiers/route.ts`): The `supabaseAdmin.update()` that stores `secret_code` after RPC tier creation now destructures `{ error }` and returns a 500 on failure, preventing silent open-access tiers.
- **sales_start null on PATCH** (`apps/web/app/components/organizer/TierInlineForm.tsx`, `apps/web/app/api/ticket-tiers/route.ts`): Clearing the `sales_start` field now sends `sales_start: null` (not `undefined`) in the payload so `JSON.stringify` includes it and the server clears the column. `updateTierSchema.sales_start` updated to `.nullable().optional()`.
- **EditTiersTab default fix** (`apps/mobile/components/events-management/EditTiersTab.tsx`): `tierPerUserLimit` initial state and `resetForm` changed from `"1"` to `"20"`. Required `salesStart` guard removed — only `salesEnd` is required; `salesStart` defaults to null (start now).
- **tiersNeedUpdate uses endsAt** (`apps/web/app/organizer/event/[id]/OrgEventDetailClient.tsx`): `handleEditEvent` now compares `tier.sales_end > ev.ends_at` (was `>= starts_at`). `handleEventDataChange` now rebuilds the list when `field === "endsAt"` (was `startsAt`), matching the save-time check and the W1-3 business rule.
- **isFreeRsvpSubmit dead store removed** (`apps/mobile/hooks/useCheckout.ts`): Dead variable in the catch block was computed but never read; removed.

**Files:** `apps/mobile/app/event/[id].tsx`, `apps/mobile/components/event-details/TicketAccessCodeModal.tsx`, `apps/mobile/hooks/useEventDetails.ts`, `apps/mobile/hooks/useSignInHandlers.ts`, `apps/mobile/hooks/useCheckout.ts`, `apps/mobile/components/events-management/EditTiersTab.tsx`, `apps/web/app/api/events/route.ts`, `apps/web/app/api/ticket-tiers/route.ts`, `apps/web/app/components/organizer/TierInlineForm.tsx`, `apps/web/app/organizer/event/[id]/OrgEventDetailClient.tsx`

---

### 96. PR review fixes: fail-closed has_secret_code, sales_start drift, RLS recursion, multi-org admin (Apr 16, 2026)

Four fixes from a second automated PR review pass, verified against current code:

- **has_secret_code fails closed** (`apps/mobile/hooks/useEventDetails.ts`): `TicketTierSchema.has_secret_code` changed from `z.boolean().optional()` to `z.boolean()` (required). The `?? false` coercion in the tier-mapping `.map()` was removed. If the RPC contract regresses and omits the field, the Zod parse now throws rather than silently treating all tiers as open.
- **sales_start drift fixed** (`apps/web/app/api/events/route.ts`): The validation loop and insertion array both called `new Date().toISOString()` independently, risking slightly different timestamps for the same tier. Now `resolvedSalesStarts` is computed once before the loop (`validatedData.ticket_tiers.map(t => t.sales_start ?? new Date().toISOString())`), and both the validation loop (indexed `for`) and `tierInserts.map` reference the same pre-computed value.
- **RLS recursion risk fixed** (`supabase/migrations/20260416180206_org_admin_update_use_get_admin_organizations.sql`): The UPDATE policy on `organizations` was joining `organization_members` and `users` inline — the exact pattern that triggered RLS recursion before `get_admin_organizations()` was introduced. Replaced inline join with `id IN (SELECT get_admin_organizations())`, matching all other org/member policies.
- **Multi-org admin fix** (`apps/web/app/lib/roles.ts`): `getUserOrganization` used `.maybeSingle()` on a query that can return multiple rows for admins belonging to more than one organization. Supabase errors (not null) when multiple rows are found. Changed to an array query with `.limit(1)` and `memberships?.[0]?.organization`.

**Files:** `apps/mobile/hooks/useEventDetails.ts`, `apps/web/app/api/events/route.ts`, `supabase/migrations/20260416180206_org_admin_update_use_get_admin_organizations.sql`, `apps/web/app/lib/roles.ts`

---

### 97. PR review fixes: changelog migration reference + event-create sales_end validation (Apr 16, 2026)

- **Changelog correction** (`docs/fixes/APRIL_2026_FIXES.md`): Entry #96 incorrectly attributed the RLS recursion fix to `20260416171913_org_admins_can_update_organization.sql`; corrected to `20260416180206_org_admin_update_use_get_admin_organizations.sql` (the actual migration that applied the `get_admin_organizations()` rewrite).
- **Create-event sales_end ≤ event end enforced** (`apps/web/app/api/events/route.ts`): The tier-date validation loop (POST /api/events) was missing the check that `salesEnd > endsAt`. The PATCH /api/ticket-tiers handler (W1-3) already enforced this, but create-event did not. Added `if (salesEnd > endsAt)` after the `salesEnd <= salesStart` check, using the already-computed `endsAt` variable, returning a 400 with the tier name in the error message.

**Files:** `docs/fixes/APRIL_2026_FIXES.md`, `apps/web/app/api/events/route.ts`

---

### 98. RSVP capture audit — all Stripe fixes confirmed propagated (Apr 16, 2026)

Audit confirming RSVP paid captures are production-ready after the Stripe direct-purchase fix series:

- Fixes #48 (`payment_method_types: ["card"]`), #54 (remove `on_behalf_of`), #56 (remove `stripeAccountId` from `initPaymentSheet`), and #61 (`returnURL`) all apply to the RSVP paid flow via shared code paths in `useCheckout.ts`.
- RSVP-specific fixes (#91 proactive access-code gate, #93 uppercase code normalization, #94 org admin RLS) confirmed in place.
- No gaps found. Free RSVP (direct DB write) and paid RSVP (PI manual capture → organizer approve → capture → webhook) both fully wired.

**Files:** audit only — no code changes.

---

### 99. Mobile event management: price stages support added to EditTiersTab (Apr 16, 2026)

The "Use Price Stages" checkbox was missing from the mobile event-management tier editor (post-publish). Ported the web parity behavior from `TierInlineForm.tsx` to `EditTiersTab.tsx`, matching the existing `EditableTierCard` UI pattern exactly:

- **Checkbox top-right** — uses `Ionicons checkbox` / `square-outline` in the card header row, identical to event-creation style.
- **New tiers** — checkbox freely toggleable. When enabled, quantity/price/per-user-limit fields are hidden and a "Price Stages" section appears with the same add-stage form (name + price + qty + "Add Stage" button) and `StageCard` collapsible list used in event creation.
- **Existing staged tiers** — checkbox shown checked but disabled (locked after creation, web parity). The add-stage form is shown so organizers can append new stages; existing stages render as `StageCard` with delete allowed if not yet sold.
- **Existing non-staged tiers** — checkbox shown unchecked and disabled. No stage section rendered.
- Reuses `StageCard` from `create-event/` — no new components created.

**Files:** `apps/mobile/components/events-management/EditTiersTab.tsx`

---

### 100. Mobile ticket selection: expand staged tiers into per-stage cards (Apr 16, 2026)

- **Issue:** Mobile event detail screen only showed the first stage of each ticket tier. Web correctly rendered one card per stage (e.g., "Free Cover", "$10 Consumables").
- **Root cause:** `useEventDetails.ts` used `.map()` — one `TicketTierWithStatus` entry per tier — so stages 2+ were never surfaced. Web's `EventDetail.tsx` calls `getStageDisplayData(tier)` and flatmaps stages into separate cards.
- **Fix:**
  - `useEventDetails.ts`: Changed `.map()` → `.flatMap()`. Tiers with `ticket_stages` now expand into one `TicketTierWithStatus` entry per stage with: synthetic composite `id` (`${tierId}::${stageId}`) for unique selection state, `tierId`/`stageId` fields for API calls, `name: "${tier.name} - ${stage.name}"`, `displayPrice: stage.price_cents`, stage-level `quantity_total`/`quantity_sold`, and per-stage status (current stage → `available`; future stage → `not_available_yet`; sold out → `sold_out`; tier date gates propagated to all stages).
  - `useCheckout.ts`: `getStageId()` now returns `tier.stageId` directly for stage-expanded entries (no need to re-run waterfall). Added `realTierId = tier.tierId ?? tier.id` used in all 5 API payload `ticket_tier_id` fields so the real DB tier ID is sent (not the synthetic composite key).
  - `event/[id].tsx`: `TicketAccessCodeModal ticketTierId` uses `selectedTier.tierId ?? selectedTier.id` so `/api/ticket-tiers/validate-code` receives the real DB tier ID.
- **Files:** `apps/mobile/hooks/useEventDetails.ts`, `apps/mobile/hooks/useCheckout.ts`, `apps/mobile/app/event/[id].tsx`

### 101. Mobile & web ticket cards: stage name as primary title, tier name as subtitle, limit inline with price (Apr 16, 2026)

- **Stage name promoted to primary title** — stage name now renders at `text-2xl` (the main heading); tier name renders directly below at `text-lg`, same color and weight. Previously both were concatenated into one truncated string (`"Tier - Stage"`).
- **Limit per person moved inline with price** — "Limit X per person" now sits on the right of the price row (mirrors web). The redundant inner "Select" button was removed; the whole card is already a `Pressable`. When selected, the quantity selector replaces the limit text in that slot. `per_user_limit === 1` is hidden (matches web's `> 1` check). `description` falls back as a subtitle row only when there is no `per_user_limit`.
- **Web parity** — `EventDetail.tsx` updated to match: stage name is the `<h3>`, tier name rendered below as `text-base`. Previously the heading was `"Tier - Stage"` which also truncated on long names.
- **Files:** `apps/mobile/components/event-details/TicketTierCard.tsx`, `apps/web/app/components/EventDetail.tsx`

---

### 102. Mobile event share: URL only, no marketing prefix (Apr 16, 2026)

- **Issue:** System share sheet showed text like `Check out {event name} on Flame!` before the link because `Share.share` used a separate `message` and `url`, which platforms concatenate.
- **Fix:** Pass a single `message` containing only `https://flme.co/events/{slug}`.

**Files:** `apps/mobile/app/event/[id].tsx`

---

### 103. Mobile staged-tier create: quantity_total must satisfy schema min(1) (Apr 16, 2026)

- **Issue:** When creating a new staged tier via `EditTiersTab`, `createTier.mutateAsync` sent `quantity_total: 0`. The API's `createTierSchema` enforces `quantity_total: z.number().int().min(1)`, so Zod parse rejected the request with a validation error before the RPC could run.
- **Fix:** Replaced the hardcoded `quantity_total: 0` with `newStages.reduce((sum, s) => sum + s.quantity, 0)`, which reflects the actual total capacity and is always ≥ 1 (each stage requires `quantity ≥ 1` before it can be added).

**Files:** `apps/mobile/components/events-management/EditTiersTab.tsx`

---

### 104. Mobile staged-tier expansion: propagate tier-level sold_out to all stages (Apr 16, 2026)

- **Issue:** The stage expansion logic in `useEventDetails.ts` propagated `not_available_yet` and `sales_ended` from tier-level status to all stages, but omitted `sold_out`. If the tier was sold out via aggregate quantity exhaustion, the condition fell through to per-stage waterfall logic and individual stages could incorrectly appear as `available`.
- **Fix:** Added `|| tierStatus === "sold_out"` to the tier-level gate condition so all stages inherit `sold_out` when the tier-level status is sold out.

**Files:** `apps/mobile/hooks/useEventDetails.ts`

---

### 105. Mobile staged-tier edit: skip save when no stage changes detected (Apr 16, 2026)

- **Issue:** In `EditTiersTab`, the `handleSaveEdit` function unconditionally set `hasChanges = true` whenever `hasExistingStages` was true, regardless of whether stage data was actually modified. This meant opening an existing staged tier's edit form and immediately tapping "Save" always triggered an API call and skipped the "No changes detected" alert.
- **Fix:** Added a comparison between `managedStages` and `initManagedStages()` (the original stage data from props) before setting `updates.stages` and flipping `hasChanges`. Checks length, `id`, `name`, `price_cents`, and `quantity` field-by-field; only marks the tier dirty if a real difference is found.

**Files:** `apps/mobile/components/events-management/EditTiersTab.tsx`

---

### 106. App Store review response: Sign in with Apple added (Guideline 4.8) (Apr 17, 2026)

- **Issue:** Apple rejected submission `5f5ab59a-dad6-4165-a067-10af1689467e` (v1.0.11) under Review Guideline 4.8 — _Design - Login Services_. The app offered Google OAuth + email/password but no equivalent login option that (1) limits data collection to name + email, (2) allows users to keep their email private, (3) doesn't track interactions for ads. Sign in with Apple satisfies all three.
- **Root cause:** The mobile sign-in flow only wired `strategy: "oauth_google"` into Clerk's `useSSO` hook. Apple requires SIWA whenever any third-party login is offered.
- **Fix:**
  1. **Shared SSO runner in `useSignInHandlers.ts`** — extracted `runSSOFlow(strategy, providerLabel, handlerName)` so Google and Apple share the same state machine (loading, error, didNavigate, completeAuthAndRedirect). `onGoogleAuth` and `onAppleAuth` are now thin wrappers over it. No change to the Google flow's behaviour.
  2. **New `AppleOAuthButton` component** — black background, white Apple logo (Ionicons `logo-apple`), "Sign in with Apple" label, matches Apple HIG. Placed **above** the Google button per HIG (at least as prominent as other OAuth options).
  3. **`apps/mobile/app.json`** — added `ios.usesAppleSignIn: true` so EAS adds the `com.apple.developer.applesignin` entitlement at build time. Version bumped to `1.0.12`.
  4. **Setup guide** — `docs/guides/APPLE_SIGN_IN_SETUP.md` walks through the required Apple Developer Portal (App ID capability, Services ID, signing key, Team ID) and Clerk Dashboard (social connection with custom credentials) configuration. Guide also covers first-sign-in name-release behaviour, private relay emails, and common errors (`invalid_redirect_uri`, missing entitlement).
  5. **Hide My Email relay configured (Apr 17, 2026)** — registered `flme.co` + `noreply@flme.co` as Email Sources in Apple Developer Portal → Services → Sign in with Apple for Email Communication. Apple verifies ownership via SPF (no separate TXT verification step in the current flow). Added root SPF record to Cloudflare: `v=spf1 include:_spf.google.com include:spf.brevo.com include:_spf.apple.com ~all`. Both domain and address show ✓ SPF in Apple dashboard. Verified end-to-end: SPF live in DNS, Brevo DKIM CNAMEs (`brevo1._domainkey` / `brevo2._domainkey`) already in place, DMARC `p=none` reporting to Brevo aggregator. Transactional emails from Brevo (`noreply@flme.co`) will now reach users who choose "Hide My Email" during SIWA — Apple's private relay would otherwise drop mail from unregistered senders. Setup guide updated with Step 1.5 capturing the DNS changes + email auth posture table.
- **Notes:**
  - No new package dependencies. Clerk's `useSSO` handles Apple natively when the entitlement is present — `expo-apple-authentication` would be needed only if we wanted to bypass Clerk's flow, which would lose JWT template integration.
  - Error path: Clerk returns the same `ClerkAPIError` shape for Apple failures as Google, so the existing `getClerkErrorMessage` helper handles them without changes.
  - Apple first-sign-in quirk: name is only released once. The existing `/api/webhooks/clerk` handler upserts `first_name` / `last_name` on `user.created`, which covers the first-release case; subsequent sign-ins will not re-send the name, which is expected Apple behaviour.

- **PR review markdownlint fixes (Apr 17, 2026):** Added `txt` language tag to two previously-unlabelled code fences in `APPLE_SIGN_IN_SETUP.md` (the DNS TXT block in Step 1.5 and the DMARC `rua` example in the Optional / Future Reference section) to satisfy MD040.
- **EAS build fix — disabled capability auto-sync (Apr 17, 2026):** First EAS build attempt after enabling SIWA failed with `Failed to patch capabilities: [{ capabilityType: 'APPLE_ID_AUTH', option: 'OFF' }]` and Apple's misleading generic error `"The bundle cannot be deleted. Delete all the Apps related to this bundle to proceed."` Root cause: EAS CLI's capability auto-sync detects "needed" Apple capabilities primarily from the plugins list in `app.json`, not from the `ios.usesAppleSignIn: true` flag. Because we use Clerk's `useSSO({ strategy: "oauth_apple" })` instead of the `expo-apple-authentication` plugin (deliberate — Clerk handles the full flow end-to-end and issues JWTs via our `supabase` template), EAS incorrectly concluded the SIWA capability was unused and tried to toggle it OFF on the bundle ID. Apple's API refused (the capability is already in use on submitted builds of 1.0.10 live on the App Store). **Fix:** set `EXPO_NO_CAPABILITY_SYNC=1` in the **local shell environment** (e.g. `export EXPO_NO_CAPABILITY_SYNC=1` in `~/.zshrc`). First attempt put the var in `eas.json`'s per-profile `env` block, but that injects it into the remote build VM — the capability sync runs in the local EAS CLI _before_ the build is queued, so the remote-only var never reaches it (confirmed by rerun: sync still ran and failed even with the var loaded remotely). Shell-level export is the correct location. This freezes EAS from modifying Apple Portal capabilities on every build — the portal state is already correct (manually configured during the SIWA rollout: SIWA, Apple Pay merchant ID, Push Notifications, Associated Domains all ON). Entitlements baked into the build binary (via `ios.usesAppleSignIn: true`, `ios.associatedDomains`, `expo-notifications`, `@stripe/stripe-react-native`) are unaffected — the env var only disables the portal-side reconciliation, not build-time entitlement generation. Trade-off: if we add a brand-new capability in the future we'll need to enable it manually in the Apple Developer Portal instead of relying on EAS auto-detection — acceptable because (a) new capabilities are rare, (b) EAS's auto-detection logic is unreliable for non-plugin-based entitlements. Documented in `docs/guides/APPLE_SIGN_IN_SETUP.md` Troubleshooting.
- **PR review items explicitly rejected (documented for future reviewers):**
  - `AppleOAuthButton.tsx` hardcoded `bg-black` / `border-black` / `#FFFFFF` / `text-white-100` — **intentional**. Apple HIG mandates pure-black background with pure-white logo/text for the Sign in with Apple button. Replacing with Flame tokens (`white-100` is `#F9FBFE`, not pure white) would move us further from Apple's brand spec and risk a Guideline 4.8 rejection. The file has a code comment at the top documenting this.
  - Destructive `#FF4444` / `rgba(255,0,0,0.5)` colors on the Delete Account buttons (mobile `PersonalSettingsTab.tsx` and web `UserDashboard.tsx`) — **deferred** to `docs/todos/NITPICKS_TODOS.md`. Requires a new `destructive` design token across `packages/ui/tailwind.config.js` and `packages/lib/src/design-tokens/flame-colors.ts`; not blocking compliance. The existing `primary: #FF0000` token is reserved for RSVP/status badges only and is not reusable here.

**Files:** `apps/mobile/hooks/useSignInHandlers.ts`, `apps/mobile/components/sign-in/AppleOAuthButton.tsx` (new), `apps/mobile/app/sign-in.tsx`, `apps/mobile/app.json`, `docs/guides/APPLE_SIGN_IN_SETUP.md` (new; updated Apr 17 with Step 1.5 email relay + status table + MD040 fences + capability-sync troubleshooting). DNS: Cloudflare root TXT (SPF) updated. Shell: `export EXPO_NO_CAPABILITY_SYNC=1` in `~/.zshrc`.

---

### 107. App Store review response: Account deletion flow added (Guideline 5.1.1(v)) (Apr 17, 2026)

- **Issue:** Apple rejected submission `5f5ab59a-dad6-4165-a067-10af1689467e` (v1.0.11) under Review Guideline 5.1.1(v) — _Data Collection and Storage_. The app supports account creation (Clerk email/password + Google OAuth) but had no option to initiate account deletion.
- **Root cause:** Only a "Manage" link in `PersonalSettingsTab` that deep-linked out to `flme.co`, which is insufficient under Apple's rules — account deletion must be initiated from within the app itself. No API endpoint existed to trigger deletion either.
- **Fix (backend):**
  1. **New `DELETE /api/user/delete` route** (`apps/web/app/api/user/delete/route.ts`) — authenticated via Clerk's `auth()`. Calls `clerkClient.users.deleteUser(userId)`, which fires the `user.deleted` webhook at `/api/webhooks/clerk`. That existing webhook handler already hard-deletes the Supabase `users` row when possible, and falls back to anonymization (email/name wiped, `deleted_{timestamp}_{clerk_id}@deleted.user`) when the user has dependent records (e.g. an organizer with published events or an attendee with tickets) — Postgres FK violation code `23503`. Both paths satisfy Apple's rule that personal data must be deleted, while preserving transaction records that Ecuador tax law requires retaining for ~7 years.
  2. **Idempotency:** If Clerk returns 404 (user already deleted), the route returns `{ success: true, alreadyDeleted: true }` so retries after a network blip don't confuse the client.
- **Fix (mobile UI):** Added "Delete Account" button to `PersonalSettingsTab.tsx` below the Sign-out button. Two-step native `Alert` confirmation:
  1. First Alert: describes what will happen ("profile, tickets, RSVPs will be removed; organizer events will have your name removed but tickets remain valid for attendees"). Destructive "Delete Account" button.
  2. Second Alert: "Are you absolutely sure? This action cannot be undone." Destructive "Yes, delete forever" button.
  3. On confirm: deregister push token (non-blocking), call `apiDelete("/api/user/delete")`, call Clerk `signOut()`, clear React Query cache, `router.replace("/")`. Errors surface as a native `Alert`.
- **Fix (web UI):** Added parity "Delete Account" button to `UserDashboard.tsx` settings tab, using browser `confirm()` for the two-step pattern (same copy as mobile). Same backend call, same post-delete flow (Clerk signOut + cache clear + redirect).
- **PR review copy fix (Apr 17, 2026):** Second `confirm()` string on the web flow previously said "All your data will be deleted", which contradicted the more accurate first dialog explaining attendee-ticket and event-record retention. Updated to mirror the real retention model: "personal information (name, email) will be permanently removed. Event, ticket, and RSVP records may be retained in anonymized form where required for other users (attendees) or tax/compliance." Mobile copy was already correct.
- **Industry benchmarking:** Matches Eventbrite's pattern (allow deletion, anonymize historical records to preserve buyer receipts) and Airbnb's (instant deactivate + full delete anonymizes past reservations). Avoids blocking-until-cancel-all-events flows that would require a bulk cancel UX we don't have yet — and that Apple could reject as "requires users to visit a website to finish deleting their account."
- **Notes:**
  - Confirmation UX: two-step Alert rather than typed "DELETE" confirmation. Apple's guideline explicitly permits "confirmation steps to prevent users from accidentally deleting their account" — two destructive native Alerts clear that bar without the friction of a typed confirmation.
  - The existing Clerk webhook handler (unchanged in this PR) is what actually performs Supabase cleanup. This is correct because the webhook is the single source of truth for user deletion — it also handles admin-initiated deletions from the Clerk Dashboard, GDPR right-to-erasure requests, and other future paths.
  - Local `signOut()` may throw after the server-side delete succeeds (the Clerk session is already invalidated). This is expected — we swallow the error and continue with cache clearing and redirect.

**Files:** `apps/web/app/api/user/delete/route.ts` (new), `apps/mobile/components/settings/PersonalSettingsTab.tsx`, `apps/web/app/components/UserDashboard.tsx`

---

### 108. Block organizers with live events / sold tickets from self-serve deletion + scope EAS capability-sync override (Apr 17, 2026)

- **Issue A — self-serve deletion is unsafe for active organizers:** The delete flow from #107 correctly anonymized attendee rows (their tickets keep working, personal info is removed), but for **organizers with an active org** the silent anonymization path left a landmine. `organizations.owner_user_id → users.id` is `ON DELETE CASCADE`, but when dependent rows elsewhere (e.g. `payout_logs.requested_by = RESTRICT`) block the delete, the webhook falls back to anonymizing the users row. The org is then owned by a tombstone: name wiped, no one can log in as the owner, Stripe payouts keep flowing to a Connect account with no reachable admin, and attendees see events run by "Deleted User". Unacceptable for a ticketing platform.
- **Fix — server-side pre-check in `DELETE /api/user/delete`:** Before calling `clerkClient.users.deleteUser`, resolve the Clerk user to their Supabase `users.id`, look up `organizations.owner_user_id = <id>`, then parallel-query:
  1. `events` where `organization_id IN (...)` AND `status = 'published'` AND `ends_at > now()` → `hasUpcomingEvents`.
  2. `orders` where `organization_id IN (...)` AND `status IN ('paid', 'completed')` → `hasSoldTickets`.

  If either is true, return **HTTP 409** with `{ code: "ACTIVE_ORGANIZER_DATA", reason, supportEmail: "support@flme.co", error: "...email support@flme.co..." }`. Clerk deletion is never attempted, so there's nothing to roll back.

- **Fail-safe behaviour (updated per PR review Apr 17, 2026):** The guard now distinguishes three outcomes — `ok`, `blocked`, and `error`. On any Supabase query error (user lookup, owned-orgs lookup, events count, orders count) the route returns **HTTP 503** with `code: "GUARD_UNAVAILABLE"` rather than silently proceeding. The original design fail-opened on query errors, but reviewer flagged that this defeats the whole blocker: a transient Supabase blip on an organizer-with-active-data account would let Clerk deletion through, the webhook would FK-violate, and the row would be anonymized — exactly the orphaned-org state we designed the guard to prevent. 503 is retryable; the client surfaces the server's user-friendly "couldn't verify your account state right now, please try again in a moment" message via the existing `ApiError.message` path. Only `supabaseAdmin === null` (Supabase not configured locally) still fails open — in production that branch is unreachable.
- **Fix — client UX:**
  - **Mobile (`PersonalSettingsTab.tsx`):** Catches `ApiError` with `status === 409` OR `code === "ACTIVE_ORGANIZER_DATA"`. Shows a native `Alert` titled "Can't Delete Right Now" with an "Email Support" action that opens `mailto:support@flme.co?subject=Account%20deletion%20request`. No generic "Delete Failed" message — the user gets a clear next step.
  - **Web (`UserDashboard.tsx`):** Same branch, uses browser `confirm()` ("Open your email client now?") that routes to the same `mailto:` URL.
- **Why route to support instead of forcing bulk-cancel UX?** Apple 5.1.1(v) explicitly permits routing to customer support "for legal or regulatory reasons" when the constraint is clearly displayed. Ticket buyers have a contractual right to their tickets and the organizer has Ecuador tax retention obligations (7 years) — both qualify. A self-serve "cancel all events + refund everyone" flow would be a multi-week UX build and higher risk than a support-handled close-out. The in-app alert clearly surfaces the support email, so the path is visible (Apple's main complaint with "contact support" flows is when they're hidden or require the user to already know where to write).
- **Scenarios (unchanged from #107 unless noted):**
  - **User with no data:** hard delete of users row + cascaded `push_tokens` / `notifications`. ✓
  - **Attendee with tickets:** anonymize users row; orders / tickets / RSVPs retained with anonymized buyer name. ✓
  - **Organizer with active data (NEW):** blocked — 409 with support email. No Clerk call, no Supabase write. They contact support → support cancels/refunds events, then admin-deletes via Clerk Dashboard, which fires the same webhook with the attendee-anonymization path.
  - **Organizer with only past events and no unrefunded orders:** treated as a regular user — deletion proceeds; attendee rows already anonymized via the webhook. ✓
- **Issue B — `APPLE_SIGN_IN_SETUP.md` capability-sync guidance was global-first:** Guide recommended `export EXPO_NO_CAPABILITY_SYNC=1` in `~/.zshrc` as the "permanent fix". That silently disables EAS capability auto-sync for **every Expo project** on the dev machine, which can mask entitlement drift in unrelated apps.
- **Fix — wire the env vars into pnpm scripts, not the shell:** Added three scripts to `apps/mobile/package.json` matching the exact commands we actually run:
  - `build:ios:prod` → `EXPO_NO_CAPABILITY_SYNC=1 EXPO_APPLE_ID=hello@flme.co eas build --profile production --platform ios`
  - `build:ios:dev` → `EXPO_NO_CAPABILITY_SYNC=1 EXPO_APPLE_ID=hello@flme.co eas build --profile development-device --platform ios`
  - `submit:ios` → `EXPO_APPLE_ID=hello@flme.co eas submit --platform ios --profile production`
    `submit:ios` omits `EXPO_NO_CAPABILITY_SYNC` because submit never reconciles capabilities. `hello@flme.co` is the shared Apple Developer account for Flame. Global `~/.zshrc` export was removed (`sed -i '' '/EXPO_NO_CAPABILITY_SYNC/d' ~/.zshrc && source ~/.zshrc`). Setup guide updated: project-scoped pnpm scripts are now the primary recommendation; global export reframed as "NOT recommended" opt-in. APPLE_SIGN_IN_SETUP.md Step 3 updated to point at `pnpm build:ios:prod` instead of bare `eas build --platform ios --profile production` so first-time readers don't hit the capability-sync error. PR reviewer feedback acknowledged and applied.
- **Submit safety (updated per PR review Apr 17, 2026):** `submit:ios` originally used `--latest`, which picks whatever build finished most recently — including `testflight` builds (also `distribution: "store"`) or accidental re-builds of dev profiles. Replaced with `--profile production`: binds credentials from `eas.json`'s `submit.production` block (ASC App ID `6761443120`, Team ID `6LD6F5HM59`, Apple ID `hello@flme.co`) and lets the EAS CLI interactively prompt for the specific build to submit. One extra confirmation step eliminates the "submitted the wrong build" failure mode entirely.
- **Confirmation copy updated (Apr 17, 2026):** First/second native `Alert` (mobile) and `confirm()` (web) copy still referenced the pre-blocker reality ("If you're an organizer with active events, attendees will keep their tickets but your name will be removed from your events"). That language is now misleading: organizers with any upcoming published events or any paid/completed orders never reach these dialogs — the server returns 409 and routes them to support. Only users with no data, attendees with past tickets, and organizers whose events are entirely past now see the dialogs. Rewrote both steps to describe what actually happens for them:
  - First step: "This will permanently delete your Flame account. Your name, email, and profile will be removed. Past ticket purchases and event records are kept in anonymized form for attendee ticket validity and tax compliance. This cannot be undone."
  - Second step: "Your name and email will be permanently removed from Flame. This cannot be undone."
    Same copy on mobile and web.
- **Notes:**
  - The 409 status code matches the Stripe Dashboard pattern for "has active sub-resources, cannot delete parent" (Connect account deletion). Industry-standard.
  - Pre-check is a single user-row lookup + (orgs × 2) count queries. All indexed — `users.clerk_id` (unique), `organizations.owner_user_id` (index idx_organizations_owner_user_id), `events.organization_id` (idx_events_organization_id), `orders.organization_id` (standard). Adds <50ms to the deletion path.
  - **Failure mode: fail-closed with 503.** On any Supabase query error (user lookup, owned-orgs lookup, events count, orders count), the route returns `503 GUARD_UNAVAILABLE`. The client surfaces the user-friendly message via `ApiError.message` and the user retries. This replaces the original fail-open design (which was flagged in PR review) — a transient Supabase blip on an organizer-with-active-data account must not let Clerk deletion through, because that would FK-violate the webhook and leave an orphaned-org tombstone, which is the exact state this guard exists to prevent. The sole exception is `supabaseAdmin === null` (Supabase not configured locally), which still fails open — unreachable in production.

**Files:** `apps/web/app/api/user/delete/route.ts`, `apps/mobile/components/settings/PersonalSettingsTab.tsx`, `apps/web/app/components/UserDashboard.tsx`, `apps/mobile/package.json`, `docs/guides/APPLE_SIGN_IN_SETUP.md`

---

### 109. RSVP rejection email now surfaces payment outcome (amount + card brand/last4) (Apr 17, 2026)

- **Issue:** The RSVP rejection email (`generateRejectionEmailHtml`) rendered the same generic "Unfortunately, we're unable to approve your RSVP" copy in every case, regardless of whether (a) the user's auth-hold was cancelled (nothing was actually charged, but their bank may show a pending authorization for 5–10 business days), (b) a captured payment was refunded, or (c) the payment was stuck in `processing` and flagged for manual follow-up. The reject route (`apps/web/app/api/organizer/rsvps/[id]/reject/route.ts`) already distinguished all three outcomes, but none of that state made it into the email — users had no information about their money and no support contact to follow up with. Benchmarked against Ticketmaster/Eventbrite/StubHub/Stripe Dashboard transactional emails, which universally name the exact amount, the card brand + last 4 when available, and the bank timing window in the same email as the denial.
- **Fix (email template — `apps/web/app/lib/email/rsvp-notifications.ts`):**
  1. Exported a new `RejectionPaymentOutcome` discriminated union: `{ kind: "none" } | { kind: "auth_released"; amount; currency; cardBrand?; cardLast4? } | { kind: "refunded"; amount; currency; cardBrand?; cardLast4? } | { kind: "follow_up" }`. Added optional `paymentOutcome` field to `RsvpEmailData`.
  2. Added `renderPaymentOutcomeBlock(outcome)` — renders a blue-accent status block above the "Common reasons for RSVP rejection" list. Inlined (rather than using `emailStatusBox`) because the shared helper escapes its `text` field, and we need `<strong>` around the amount and card label per industry convention so users can cross-check their card statement.
  3. Copy ladder (falls back gracefully when card details are unavailable):
     - `auth_released` with card: *"Your authorization hold of **$50.00** on your **Visa ending in 4242** will be released by your bank within **5–10 business days**."*
     - `auth_released` without card: *"Your authorization hold of **$50.00** will be released by your bank within **5–10 business days**."*
     - `refunded` with card: *"A full refund of **$50.00** on your **Visa ending in 4242** has been issued. Refunds typically appear within **5–10 business days** depending on your bank."*
     - `refunded` without card: *"A full refund of **$50.00** has been issued to your original payment method. …"*
     - `follow_up`: *"Your payment is still settling with your bank. Our team will review and follow up within **1–2 business days** — no action needed from you."*
     - `none`: block is omitted entirely.
  4. Added `CARD_BRAND_LABEL` map (`visa → Visa`, `amex → American Express`, `mastercard → Mastercard`, etc.) so the brand renders as a user-readable label rather than Stripe's lowercase `card.brand` enum. Unknown brands title-case automatically.
  5. When `paymentOutcome` is present and not `"none"`, a support line is appended: *"Questions about your payment? Reply to this email or contact **support@flme.co**."*
  6. Backward-compatible: `paymentOutcome` is optional; existing callers (and the old `rsvp-rejection` email preview) render exactly the same as before.
- **Fix (reject route — `apps/web/app/api/organizer/rsvps/[id]/reject/route.ts`):**
  1. Added `expand: ["latest_charge"]` to the existing `stripe.paymentIntents.retrieve` call. No extra network round-trip, no client changes, no new secrets. **Important:** do NOT write `expand: ["latest_charge.payment_method_details"]` — `payment_method_details` is NOT an expandable field on `Charge` (always inline; typed as `PaymentMethodDetails | null` in `stripe/types/Charges.d.ts`), and Stripe returns `invalid_request_error` when you try to expand a non-expandable field. Expanding `latest_charge` alone returns the full Charge with `payment_method_details` already populated. _(PR review catch, Apr 17 — an earlier iteration used the invalid path; would have thrown on every rejection with a PI and silently set every rejection to `paymentOutcome = "follow_up"` via the Stripe catch block, while also skipping the `stripe.paymentIntents.cancel` / `stripe.refunds.create` branches entirely. Users would have been stuck with auth holds or uncaptured refunds. Caught before merge.)_
  2. Added `extractCardDetails(pi)` helper that safely reads `pi.latest_charge.payment_method_details.card.{brand,last4}` and returns `{}` for any pre-charge state (`requires_confirmation`, `requires_payment_method`) or string-only `latest_charge`.
  3. Each Stripe status branch now also builds a `RejectionPaymentOutcome`:
     - `requires_capture` → `auth_released` with PI amount + card.
     - `requires_action` → `auth_released` if a card is attached (3DS flow may have a `pending` charge); otherwise `none`.
     - `requires_confirmation` / `requires_payment_method` / `canceled` → `none` (no money ever touched the user's card).
     - `succeeded` → `refunded`, using `refund.amount` (authoritative for the actual amount returned to the customer) over `paymentIntent.amount`.
     - Refund failure, `processing`, unknown status, or Stripe exception → `follow_up` (which also still flips the existing `payment_requires_follow_up` DB flag).
  4. Passes `paymentOutcome` into `sendRsvpRejectionEmail({...})`. When the RSVP was free (no `stripe_payment_intent_id`), `paymentOutcome` stays as the default `{ kind: "none" }` and the email renders identically to the pre-fix version.
- **Dev preview (`apps/web/app/api/dev/email-preview/route.ts`):** Added three new preview variants for QA: `rsvp-rejection-auth-released`, `rsvp-rejection-refunded`, `rsvp-rejection-follow-up`. The original `rsvp-rejection` variant still renders the free-RSVP / `kind: "none"` case. All four listed in `TEMPLATE_NAMES`.
- **Industry benchmarking:** Matches Ticketmaster/Eventbrite/StubHub/Stripe Dashboard conventions documented in `project-flame-master.mdc` Section 3 — any transactional email that denies or cancels a charged transaction must state in-line (a) whether the user was actually charged, (b) the exact amount, (c) the card used when available, (d) the bank timing window (5–10 business days is the Visa/MC/Amex standard for both refunds and auth holds — we deliberately do not say "up to 30 days" because that overstates the window and erodes trust), and (e) a support contact. Server-authoritative: every amount and card value is read directly off the Stripe PaymentIntent/Refund object, never computed or cached on the client, satisfying the `flame-design-system.mdc` rule about price display.
- **Notes:**
  - No schema changes, no migrations, no new dependencies.
  - `latest_charge` is safely narrowed against `string | Stripe.Charge | null`; the helper returns empty when it's a string (unexpanded) or null. This means a future refactor that drops the `expand` option degrades gracefully to the fallback "amount-only" copy.
  - Rolling back any of this to the pre-fix state is safe — the email template ignores the new prop when omitted, and `Stripe.paymentIntents.retrieve` accepts the `expand` option with no side effects on billing.

**Files:** `apps/web/app/lib/email/rsvp-notifications.ts`, `apps/web/app/api/organizer/rsvps/[id]/reject/route.ts`, `apps/web/app/api/dev/email-preview/route.ts`

---

### 110. Terms & Conditions acceptance on sign-up (Apr 17, 2026)

- **Issue (plan W2-3 / Issue 7):** No Terms of Use / Privacy Policy acceptance checkpoint existed before account creation on either platform. Required for App Store compliance and general disclosure best practice; also surfaced in the issue triage list as a user-reported gap.
- **Industry benchmark:** Luma, Eventbrite, Airbnb, Vercel, OpenAI, and Linear all show T&C disclosure only on **account creation** — never on returning sign-in. Two patterns dominate: (a) an **active checkbox** above the primary CTA on fully custom auth screens, and (b) **enforced legal-consent checkbox inside the hosted auth component** for Clerk/Auth0 setups. We adopt pattern (a) on mobile (custom UI) and pattern (b) on web (Clerk-hosted `<SignUp>` served both as a modal from the navbar and as a page), matching each platform's native norm.
- **Fix — Mobile (active checkbox, error-on-interaction pattern):**
  - New `TermsCheckbox` component (`apps/mobile/components/sign-in/TermsCheckbox.tsx`): 20×20 box with checkmark on `bg-white-100`, unchecked state `bg-white-5 border-white-30`, inline underlined links to `https://flme.co/terms-of-use` and `https://flme.co/privacy-policy` opened via `WebBrowser.openBrowserAsync`. Accessibility role `checkbox` with `accessibilityState.checked`; 8px `hitSlop` for tap target. Wrapped in a container that always renders a 1px border (transparent by default, `border-primary` = `#FF0000` when `hasError=true`) so toggling the error state doesn't cause layout shift.
  - `sign-in.tsx`: added `termsAccepted` (default `false`) and `termsError` (default `false`) state. Checkbox is rendered **inside the `CredentialsForm` footer slot, immediately above the Create Account button** (was above the OAuth buttons in the first iteration — moved per UX request). Rendered only when `mode === "sign-up"`. All three auth buttons (Apple, Google, Create Account) **remain clickable**; their handlers are wrapped with a `termsGuard` helper that, if `mode === "sign-up" && !termsAccepted`, sets `termsError=true` and aborts the real handler. Toggling the checkbox clears the error. Switching sign-in/sign-up tabs resets both `termsAccepted` and `termsError` so state can't carry over.
  - **Pending-state dim cue:** In addition to the click-to-reveal error, all three auth buttons render at 50% opacity while `termsPending = mode === "sign-up" && !termsAccepted`. `AppleOAuthButton` and `OAuthButton` both gained a new `dimmed?: boolean` prop (distinct from `disabled` — dimmed is visually faded but still fires `onPress`). Opacity resolution order: `disabled=true → 0.6` (existing loading behaviour), else `dimmed=true → 0.5`, else `1`. `CredentialsForm` gained a `submitDimmed?: boolean` prop that applies the same 0.5 opacity to the `PillButton` via `style={{ opacity: 0.5 }}`. The moment the user checks the box, all three buttons go fully opaque — combined with the red-border-on-click behaviour this gives both a passive "something's incomplete" affordance and an active "here's specifically what" affordance without disabling the buttons.
  - `CredentialsForm.tsx`: replaced the earlier `submitDisabled` prop with a generic `footerSlot: ReactNode` prop that renders immediately above the submit button, plus a `submitDimmed: boolean` prop for the pending-state visual cue. Keeps the component agnostic to the T&C concern — it just owns a layout hook and a dim flag. The `loading` branch is unchanged (spinner replaces the Create Account button while auth is in flight).
  - **Why clickable-with-dim-and-red-border instead of disabled buttons:** Disabled buttons give no feedback on why they're unresponsive — users tap, nothing happens, they get confused. This hybrid gives three layers of signal: (1) passive dim opacity tells the user "something's pending" before they tap; (2) tapping still works and surfaces the red border on the exact element that needs attention; (3) checking the box clears both the dim and the border, giving immediate positive feedback. No error text is rendered — the visual affordances alone are unambiguous.
  - **Why sign-up tab only:** Clerk OAuth buttons authenticate either new or existing users with the same call. Gating in sign-in mode would force returning users to re-accept terms every login — unusual and user-hostile. On the sign-up tab, tapping Apple/Google creates a new account if none exists, which is exactly the moment acceptance is legally meaningful. Email sign-up obviously needs gating here too.
- **Fix — Web (Clerk Dashboard Legal Consent):** This is a **Dashboard config step, not a code change.** Web sign-up happens almost entirely through Clerk's modal (triggered by `<SignInButton mode="modal">` in `Navbar.tsx` × 4 occurrences — the navbar LOGIN button and its mobile-menu equivalents). The `/sign-up` catchall route exists but nothing in the app links to it; it only serves Clerk's email-verification and password-reset return URLs. That means any solution that sits _outside_ Clerk's component (passive text below a `<SignUp>`, a pre-auth gate screen wrapping the page) is invisible to ~100% of real sign-ups.
  - **What to do in Clerk Dashboard:** **Configure → Restrictions → Legal compliance** → enable it and set **Terms of Service URL = `https://flme.co/terms-of-use`** and **Privacy Policy URL = `https://flme.co/privacy-policy`**. Save. Clerk then injects an enforced checkbox into every `<SignUp>` render surface — the navbar modal, the `/sign-up` page, any future embed — with the Continue button disabled until it's checked. Acceptance is recorded on the Clerk user (`legal_accepted_at`) so we get an auditable timestamp for free.
  - **Scope:** Affects **new account creation only**. Returning sign-ins (both via modal and email/OAuth) skip the checkbox — same semantic as mobile. Matches Luma/Eventbrite/Vercel behaviour.
  - **Why not passive "By signing up you agree to…" text under `<SignUp>`:** Initial implementation added that text to `apps/web/app/sign-up/[[...sign-up]]/page.tsx`, but the navbar modal doesn't render that page — it mounts Clerk's `<SignUp>` inside Clerk's own modal DOM, which doesn't expose a sibling text slot. Since almost no user reaches the full page, the passive text was effectively unreachable. Reverted in the same session.
  - **Why not wrap the navbar buttons:** Replacing `<SignInButton mode="modal">` with a link to `/sign-up` would surface our consent text, but loses the modal UX and bounces users off whatever page they were on. Clerk's native checkbox inside the modal is the right layer.
- **Database:** Not tracked by us — Clerk now records acceptance timestamp on its own user object (Dashboard Legal Consent). No custom `users.terms_accepted_at` column needed. If we ever need the timestamp in Supabase for reporting, it's available via Clerk API on `user.publicMetadata.legal_accepted_at` (or equivalent field — check Clerk docs for the exact key when needed).
- **Action required from maintainer:** Flip the Clerk Dashboard toggle described above in both the **Development** and **Production** Clerk instances before this is considered shipped. Code is merge-ready; Dashboard change is a manual step.
- Plan: Marks W2-3 complete in the issue triage plan.

**Files:** `apps/mobile/components/sign-in/TermsCheckbox.tsx` (new), `apps/mobile/app/sign-in.tsx`, `apps/mobile/components/sign-in/CredentialsForm.tsx`, `apps/web/app/sign-up/[[...sign-up]]/page.tsx` (doc comment only; web enforcement is Clerk Dashboard config)

---

### 111. Allow users to re-apply for RSVP after rejection (Apr 17, 2026)

- **Issue:** A user whose RSVP was rejected by the organizer could not submit a new RSVP for the same event, even if the rejection was due to an honest mistake in their registration form data (wrong cedula, misspelled name, etc.). The only way to retry was to contact support and have the organizer manually intervene. Reported as a UX papercut — legitimate use case, no recovery path.
- **Root cause:** The `rsvps` table had an unconditional unique constraint `rsvps_event_id_user_id_key UNIQUE (event_id, user_id)` which blocked any second INSERT for the same user+event pair, regardless of the prior row's `status`. This was stricter than the application logic: `create_rsvp_atomic` already only guards against active statuses (`status IN ('pending','approved','purchased')`) and would have permitted a re-apply after a row moved to `rejected`. The constraint fired first and returned `DUPLICATE_RSVP` → "You already have an RSVP for this event."
- **Fix — one migration (`20260418004323_allow_rsvp_reapply_after_rejection`):** Dropped the full unique constraint and replaced it with a **partial unique index** scoped to active statuses only:

  ```sql
  ALTER TABLE public.rsvps DROP CONSTRAINT IF EXISTS rsvps_event_id_user_id_key;

  CREATE UNIQUE INDEX IF NOT EXISTS rsvps_one_active_per_user_event
    ON public.rsvps (event_id, user_id)
    WHERE status IN ('pending', 'approved', 'purchased');
  ```

  The invariant "one active RSVP per user per event" is preserved at the DB level — a user with a pending or approved RSVP still gets `23505` on a duplicate attempt. But rejected and expired rows are excluded from the index, so they no longer block a fresh attempt.

- **Defense in depth:** The status-aware guard inside `create_rsvp_atomic` (lines 1670–1680 of baseline) is unchanged. The partial index mirrors it, so both layers agree: active RSVP exists → reject; rejected/expired row exists → allow.
- **UI already correct on both platforms:**
  - `apps/web/app/components/EventDetail.tsx` line 819–835 filters the "already RSVP'd" modal gate to `pending / approved / issued / checked_in` only.
  - `apps/mobile/app/event/[id].tsx` line 180–186 uses the same filter.
    Both files have already been written with this behaviour in mind — the web file even has a code comment anticipating this exact change ("Filter out rejected/cancelled/void statuses if we want to allow re-applying"). No client code change needed.
- **Email tweak (`apps/web/app/lib/email/rsvp-notifications.ts`):** Added one line to `generateRejectionEmailHtml` explicitly telling rejected users they can submit a new request: _"If you believe your registration details were incorrect or incomplete, you're welcome to submit a new RSVP request for [Event] from the event page."_ Gives users an actionable path instead of implying the rejection is terminal.
- **Side-effects considered:**
  - **Payment/refund:** The reject route (`apps/web/app/api/organizer/rsvps/[id]/reject/route.ts`) already cancels (pre-capture) or refunds (post-capture) the original PaymentIntent, so a retry creates a fresh PaymentIntent with zero Stripe conflict.
  - **Organizer view:** `RsvpsView.tsx` groups RSVPs by status and renders each row independently. A user who was rejected and re-applied will appear in both "Rejected" and "Pending" sections — desired behaviour for audit/history.
  - **Notifications:** Each new RSVP fires fresh pending-confirmation + organizer-notification emails + push notifications. Correct — organizers need to know a re-application happened.
  - **Abuse:** Theoretical loop of reject → reapply → reject → reapply. Not a real problem today; if needed, a `retry_count` column or per-user cooldown can be added later. Orthogonal feature, not blocking.
- **Industry benchmarking:** Eventbrite, Luma, and Partiful all allow re-applying after rejection for gated/RSVP events (Eventbrite exposes it via "Request access" button re-appearing; Luma lets you resubmit from the event page). Aligns with expected convention.
- **Verification:** `SELECT conname FROM pg_constraint WHERE conrelid = 'public.rsvps'::regclass AND conname = 'rsvps_event_id_user_id_key'` returns 0 rows (constraint dropped). `pg_indexes` shows `rsvps_one_active_per_user_event` with the correct `WHERE status = ANY(ARRAY['pending','approved','purchased'])` predicate.

**Files:** `supabase/migrations/20260418004323_allow_rsvp_reapply_after_rejection.sql` (new), `apps/web/app/lib/email/rsvp-notifications.ts`

---

### 112. Raise image upload limit from 1MB → 4.5MB across all flows (Apr 17, 2026)

- **Symptom:** Organizers repeatedly blocked from uploading event banners, org logos, and profile pictures because the limit was 1MB. Typical phone photos (2–4MB unprocessed) were rejected, forcing users to compress externally before upload.
- **Root cause:** Historical 1MB cap chosen conservatively when storage buckets were first provisioned (Jan–Mar 2026). Never revisited. Client validators, API route validators, and Supabase bucket `file_size_limit` were all pinned to `1048576` bytes.
- **Fix:** Raised the cap to **4.5MB** (`4718592` bytes) at every layer:
  - **Client validators:** `CreateEventForm.tsx`, `OrgEventDetailClient.tsx`, and the shared `image-upload.client.ts` default.
  - **API routes:** `/api/upload-image`, `/api/upload-org-image`, `/api/upload-profile-image` — `MAX_FILE_SIZE` and error messages updated.
  - **Supabase buckets:** `event-images`, `organization-images`, `profile-images` — `file_size_limit` raised via migration `20260418005751_raise_image_bucket_size_limits_to_4_5mb.sql`.
- **Why 4.5MB specifically (not 5MB as originally proposed):** The uploads flow through Next.js API routes deployed as Vercel serverless functions. Vercel enforces an infrastructure-level **4.5MB request body cap** that cannot be raised via config. Setting a client limit of 5MB would result in files between 4.5–5MB failing with an opaque HTTP 413 at the Vercel edge before our validation or Supabase could run. 4.5MB is the highest value we can safely enforce while keeping the existing server-proxied upload architecture.
- **Future path to 10MB (industry standard for Eventbrite / Luma / Ticketmaster):** Refactor uploads to use Supabase signed URLs (client → storage directly, bypassing our API). The Vercel cap no longer applies in that topology. Deferred — not blocking. Logged here for reference.
- **Mobile:** No separate changes needed. `apps/mobile` uploads go through the same three web API routes, so the server validation + bucket limit automatically applies on both platforms.
- **Verification:** `SELECT id, file_size_limit FROM storage.buckets WHERE id IN ('event-images','organization-images','profile-images')` returns `4718592` for all three.
- **Follow-up (same day):** UI helper copy ("PNG, JPG, GIF up to 1MB…") was stale across 4 spots (`CreateEventForm` line 1033, `OrgEventDetailClient` line 1784, `EventsTiersView` lines 505 and 1163) and in two docs (`STORAGE_SECURITY_TESTING.md` test expectation, `ORGANIZER_DASHBOARD_REFACTOR_PLAN.md` max-size line). Updated all to 4.5MB so validation error messages, helper copy, and reference docs are consistent.

**Files:** `apps/web/app/api/upload-image/route.ts`, `apps/web/app/api/upload-org-image/route.ts`, `apps/web/app/api/upload-profile-image/route.ts`, `apps/web/app/lib/utils/image-upload.client.ts`, `apps/web/app/components/forms/CreateEventForm.tsx`, `apps/web/app/organizer/event/[id]/OrgEventDetailClient.tsx`, `apps/web/app/components/organizer/EventsTiersView.tsx`, `docs/security/STORAGE_SECURITY_TESTING.md`, `docs/features/ORGANIZER_DASHBOARD_REFACTOR_PLAN.md`, `supabase/migrations/20260418005751_raise_image_bucket_size_limits_to_4_5mb.sql` (new)

---

### 113. PR review cleanup — W2-3 (T&C acceptance) + stale image/guard docs (Apr 17, 2026)

Six small fixes from the automated PR review of W2-3. Triaged verify-first per `docs/prompts/starter-pr-prompt.md`: verified each comment against current code before acting. One deferred as premature abstraction.

- **TermsCheckbox — silent WebBrowser rejections:** `apps/mobile/components/sign-in/TermsCheckbox.tsx` called `void WebBrowser.openBrowserAsync(...)` for both Terms and Privacy links. A `void`-annotated promise swallows rejections entirely, so any failure (SafariViewController init error, malformed URL, private-mode edge case) would leave the user tapping a link that does nothing with zero signal in the logs. Wrapped both calls in a shared `openUrl(url)` async helper that `await`s and catches, logging `[TermsCheckbox] Failed to open external URL: <url>` with the error object so crash reporting / `adb`/Xcode console surface the failure. User-facing behaviour unchanged on success; failures now leave a diagnostic trail.
- **Misleading "PNG, JPG, GIF" upload hint (WebP accepted but not advertised):** Backend `apps/web/app/api/upload-image/route.ts` accepts `image/webp` (line 16 MIME map + line 264 filename regex `jpg|jpeg|png|webp|gif`), and the HTML `<input accept="image/*">` already lets the file picker surface WebP files. But the user-facing allowed-formats helper text omitted it, misleading organizers into thinking WebP uploads would be rejected. Updated the string to `"PNG, JPG, GIF, WebP up to 4.5MB. Image will be fitted to 3:4 aspect ratio."` in both `apps/web/app/components/forms/CreateEventForm.tsx` (line 1033) and `apps/web/app/organizer/event/[id]/OrgEventDetailClient.tsx` (line 1784).
- **`ORGANIZER_DASHBOARD_REFACTOR_PLAN.md` internal contradiction on image size:** Line 467 (Image Processing flow) said `"Validate file size (< 1MB) and type"` while line 865 (Image Handling section) correctly said `"Max size: 4.5MB"`. Code is 4.5MB — verified in `apps/web/app/api/upload-image/route.ts:6`, inline checks in `CreateEventForm.tsx:452` and `OrgEventDetailClient.tsx:1207`, and shared `validateImageFile` default in `image-upload.client.ts:95`. Updated line 467 to `"Validate file size (≤ 4.5MB, Vercel serverless body limit) and type"` so the doc is internally consistent and matches code. (Note: entry #112 already fixed most of the 1MB→4.5MB stale copy across docs; this one was missed.)
- **`APRIL_2026_FIXES.md` entry #108 Notes contradicted the actual guard behaviour:** The "Fail-safe behaviour" paragraph at line 1637 correctly describes the PR-review-updated guard (fails closed with 503 `GUARD_UNAVAILABLE` on any Supabase query error, surfaced via `ApiError.message`). But the Notes bullet below said `"Fail-open on query error is deliberate"` — stale copy from the original pre-review design that was never updated. Code verified fails closed (`apps/web/app/api/user/delete/route.ts:44` `"fail-SAFE with 503"`, line 61 `code: "GUARD_UNAVAILABLE"`, line 63 `status: 503`, JSDoc at line 144 explicitly warns against fail-open). Rewrote the Notes bullet to describe the actual 503 fail-closed behaviour and the single exception (`supabaseAdmin === null` in local dev), removing the contradictory fail-open language while keeping the unreachable-in-production caveat.
- **`STORAGE_SECURITY_TESTING.md` stale "< 1MB" good-path test prerequisite:** Line 20 said to `"Select an image file (< 1MB, JPEG/PNG)"` as the happy-path setup, while lines 118-119 correctly tested the `> 4.5MB` reject case. Updated line 20 to `"Select an image file (< 4.5MB, JPEG/PNG/WebP/GIF)"` — consistent with the actual 4.5MB limit and the wider MIME acceptance list.
- **Deferred: consolidate client-side image validation into shared `validateImageFile`.** There are three copies of the "MIME starts with `image/` + size ≤ 4.5MB" logic — the exported-but-unused `validateImageFile` in `image-upload.client.ts`, plus inline duplicates in `CreateEventForm.tsx:446-462` and `OrgEventDetailClient.tsx:1203-1210`. The duplicates exist intentionally: they render a richer error message (`"Image size must be less than 4.5MB. Your file is 7.23MB."`) while the shared util returns only the generic `"Image size must be less than 4.5MB"`. A straight swap to the shared util would regress UX by losing the "Your file is X MB" detail. Correct consolidation requires (1) extending the shared util to surface the offending file size or accept a message formatter, (2) migrating both call sites, (3) collapsing OrgEventDetailClient's bare `alert()` calls into its existing error UI pattern. Out of scope for a PR-review cleanup pass (all three copies enforce the same 4.5MB limit correctly today — it's cosmetic duplication). Logged in `docs/todos/NITPICKS_TODOS.md` with the full remediation plan.

**Files:** `apps/mobile/components/sign-in/TermsCheckbox.tsx`, `apps/web/app/components/forms/CreateEventForm.tsx`, `apps/web/app/organizer/event/[id]/OrgEventDetailClient.tsx`, `docs/features/ORGANIZER_DASHBOARD_REFACTOR_PLAN.md`, `docs/security/STORAGE_SECURITY_TESTING.md`, `docs/fixes/APRIL_2026_FIXES.md` (#108 Notes), `docs/todos/NITPICKS_TODOS.md` (deferral entry)

---

### 114. Event image ratio switched 3:4 → 4:5 + upload-image route "Event not found" false negative (Apr 20, 2026)

Two independent issues surfaced by the same test: uploading a 1080×1350 photo to an existing event. Fixed together because (a) the second blocked verification of the first, and (b) both touch the same image-upload flow.

**Issue A — Silent center-crop on "3:4" uploads.**

- **Symptom:** Organizer uploads a 1080×1350 portrait (their assumption: "this is 3:4") and the resulting poster appears zoomed/cropped on the sides.
- **Root cause 1 — aspect-ratio confusion:** 1080×1350 = 0.800 ratio = **4:5** (Instagram portrait default), not 3:4 (0.750). The user's export pipeline (Instagram, Photoshop "Instagram Portrait" preset) produces 4:5 by default. True 3:4 at 1080 wide is 1080×1440.
- **Root cause 2 — canvas math did COVER, not CONTAIN:** `resizeImageTo3x4` in `apps/web/app/lib/utils/image-upload.client.ts` (and two inline duplicates, see below) painted a white background and comments said "fit within 3:4 bounds while maintaining aspect ratio" — but the `drawImage` math overflowed the canvas in both branches (`drawHeight = targetHeight; drawWidth = drawHeight * imgAspect`), so the image was always cover-cropped. The white fill was dead code. For a 1080×1350 → 600×800 canvas, this meant 20px of the image (after scaling to 800 tall) was shaved off each horizontal side. Intent and implementation had drifted.
- **Decision — adopt 4:5 instead of "fixing" to 3:4:** 4:5 is the Instagram feed portrait standard; most event posters organizers already have are 4:5 (DJ promos, Luma/Eventbrite exports, phone-shot portraits). Making 4:5 the canonical ratio means zero crop for the overwhelming majority of real uploads, and matches the pattern benchmarked against reference apps (Eventbrite, Luma) per `project-flame-master.mdc` Section 3. 3:4 was an internal assumption with no external forcing function.
- **Fix — end-to-end 4:5:**
  - **Canvas** (`apps/web/app/lib/utils/image-upload.client.ts`): `resizeImageTo3x4` → `resizeImageTo4x5`, target 600×800 → **1080×1350** (canonical Instagram 4:5 export; JPEG 0.8 is ~150–350 KB, well under the 4.5 MB cap raised in #112). Cover-crop math preserved (any non-4:5 source is center-cropped, as expected). White fill → `#000000` (matches `bg-background`, avoids the old white-seam glitch).
  - **Two inline canvas duplicates removed** (pre-existing tech debt flagged in this session's audit): `apps/web/app/components/forms/CreateEventForm.tsx` had its own byte-identical copy of `resizeImageTo3x4`; `apps/web/app/organizer/event/[id]/OrgEventDetailClient.tsx` had `resizeEditingImageTo3x4`. Both now import `resizeImageTo4x5` from the shared module. One source of truth.
  - **Mobile ImagePicker crop UI**: `aspect: [3, 4]` → `aspect: [4, 5]` in `apps/mobile/components/create-event/EventDetailsTab.tsx` and `apps/mobile/components/events-management/EditEventDetailsTab.tsx`. Native iOS crop sheet now matches the canonical ratio.
  - **Mobile resize target bumped 600w → 1080w** in both mobile ImagePicker flows so mobile uploads match the new canvas resolution. Old 600-wide limit would have produced low-res posters on iPhone screens after the canvas bump.
  - **Display containers** `aspect-[3/4]` → `aspect-[4/5]` (13 hits across 9 files): `apps/mobile/components/event-details/EventHero.tsx`, `apps/mobile/components/create-event/EventDetailsTab.tsx`, `apps/mobile/components/events-management/EditEventDetailsTab.tsx` (×2), `apps/web/app/components/EventCard.tsx`, `apps/web/app/components/EventDetail.tsx` (×2), `apps/web/app/components/FeaturedEvent.tsx`, `apps/web/app/components/StripePurchaseFlow.tsx`, `apps/web/app/components/organizer/EventsTiersView.tsx` (×4), `apps/web/app/organizer/event/[id]/OrgEventDetailClient.tsx` (×2, also fixed the pre-existing malformed `aspect-3/4` to `aspect-[4/5]` for bracket-form consistency).
  - **Helper copy**: "fitted to 3:4 aspect ratio" → "fitted to 4:5 aspect ratio" in `CreateEventForm.tsx` (×2), `EventsTiersView.tsx` (×2), `OrgEventDetailClient.tsx` (×1).
- **Not changed (deferred, pre-existing drift):** Several surfaces display event images at fixed heights or different ratios (`aspect-square` in `HomeFeedList.tsx`, `HomeFeedEventCard.tsx`, `discover/EventsSection.tsx`; `h-[254px]` in mobile `ticket/[id].tsx`, web `account/ticket/[id]/page.tsx`, `OrgEventInfoCard.tsx`, `SettingsPhotoSection.tsx`; `h-[130px] w-[218px]` in `packages/ui/EventCard.tsx`). APRIL_2026_FIXES.md #581–595 records these were unified to 3:4 but have since drifted back to platform-specific shapes. Intentionally left alone for this PR — reconciling them is a broader visual-design pass, not a same-day image-upload fix. Logged separately in `docs/todos/NITPICKS_TODOS.md` (new entry).
- **`max-h-[480px]` caps retained** on `EventDetail.tsx`, `FeaturedEvent.tsx`, `StripePurchaseFlow.tsx`. With 4:5, at the 600–800px max container width the natural height would be 750–1000px — still above the 480px cap, so behaviour is unchanged: the cap clamps, `object-cover` handles the mild ratio mismatch at the cap. The cap was originally added in APRIL_2026_FIXES #618 specifically to keep the checkout payment form above the fold; still valid.

**Issue B — `/api/upload-image` returns 404 "Event not found" for a valid event.**

```text
[EditEventDetailsTab] upload image failed {"error":[ApiError: Event not found],
 "eventId":"f02a39ed-a941-4ea6-9fac-9b20ea79423e", "eventSlug":"dtmf-darty"}
```

- **Root cause:** `apps/web/app/api/upload-image/route.ts` looked up the event with `supabaseAdmin.from("events").select("id, organization_id").eq("slug", eventSlug).single()`. Database check: `pg_constraint` shows `events_organization_id_slug_key UNIQUE (organization_id, slug)` — slugs are unique **per organization**, not globally. Two different orgs can own events with the same slug, and in this tenant's DB two events named "DTMF DARTY" existed across orgs: draft `4830c547-…` in org `d47f8bf3-…` and the one the user was uploading to, published `f02a39ed-…` in org `fdfba10e-…`. `.single()` returns an error (not data) when more than one row matches, so `data` was `null` → route returned 404 even though the correct event existed and the caller had permission. The DELETE handler at the bottom of the same file had the identical bug. Pre-existing since the route was written (Feb 2026).
- **Fix — scope slug lookup to caller's org memberships** (defense in depth: combines existence check and authorization in one query):

```ts
const { data: memberships } = await supabaseAdmin
  .from("organization_members")
  .select("organization_id")
  .eq("user_id", supabaseUser.id);

const orgIds = (memberships ?? []).map(m => m.organization_id);
if (orgIds.length === 0) return 403;

const { data: event } = await supabaseAdmin
  .from("events")
  .select("id, organization_id")
  .eq("slug", eventSlug)
  .in("organization_id", orgIds)
  .maybeSingle();
```

`.maybeSingle()` returns `null` on 0 rows (no error), errors only on >1 rows — but >1 is now impossible because within a single user's orgs the `UNIQUE (organization_id, slug)` constraint guarantees at most one match. Also switched the membership+event lookups to surface explicit errors (previously swallowed by destructure-without-error) so genuine Supabase failures return a 500 instead of masquerading as 404/403.

- **Applied symmetrically** to both POST (upload) and DELETE handlers in the same file.

**Test plan run (both issues):**
- [x] Upload 1080×1350 photo to existing event (the failing repro) — no longer returns "Event not found"; poster saves and renders without cropping (canvas and source now match at 4:5).
- [x] Upload 1080×1080 square — center-cropped to 4:5 (top/bottom trimmed), as expected.
- [x] Upload 1080×1440 (true 3:4) — mild top/bottom crop to 4:5 (90 px combined), acceptable.
- [x] Mobile ImagePicker crop sheet now shows 4:5 outline.
- [x] Duplicate-slug scenario (two events same slug, different orgs) — each org's users can only upload to their own event. No cross-org leakage (authorization stays correct because lookup is scoped by membership).
- [x] Delete path — same behaviour as POST for duplicate-slug orgs.
- [x] Linter: new warnings are stylistic Tailwind v4 shorthand suggestions (`aspect-[4/5]` → `aspect-4/5`), identical in character to the warnings the prior `aspect-[3/4]` usages already produced. Keeps the bracket convention the rest of the codebase uses.

**Files:** `apps/web/app/api/upload-image/route.ts`, `apps/web/app/lib/utils/image-upload.client.ts`, `apps/web/app/lib/utils/image-upload.ts` (re-export rename), `apps/web/app/components/forms/CreateEventForm.tsx`, `apps/web/app/organizer/event/[id]/OrgEventDetailClient.tsx`, `apps/web/app/components/EventDetail.tsx`, `apps/web/app/components/EventCard.tsx`, `apps/web/app/components/FeaturedEvent.tsx`, `apps/web/app/components/StripePurchaseFlow.tsx`, `apps/web/app/components/organizer/EventsTiersView.tsx`, `apps/mobile/components/create-event/EventDetailsTab.tsx`, `apps/mobile/components/events-management/EditEventDetailsTab.tsx`, `apps/mobile/components/event-details/EventHero.tsx`

---

### 115. Scope 4:5 to event detail only + enforce globally-unique published slugs (Apr 20, 2026)

Two follow-ups to #114:

**Part A — Walk back the 4:5 change on every display surface except the event detail hero.**

- **Why:** Reviewing #114 end-to-end, the visual refresh to 4:5 was only needed where the full poster is the centerpiece (web + mobile event detail). On cards, featured carousels, organizer preview boxes, and checkout thumbnails, 3:4 is a tighter list-scan shape and is what the rest of the product was built around. Making those surfaces taller broke rhythm with adjacent content without any UX win.
- **Kept at 4:5** (exactly 2 files, 3 container sites): `apps/web/app/components/EventDetail.tsx` (×2 — loaded hero + empty-state placeholder), `apps/mobile/components/event-details/EventHero.tsx` (×1). This is the one screen where the poster IS the content.
- **Reverted to 3:4**: `apps/web/app/components/EventCard.tsx`, `apps/web/app/components/FeaturedEvent.tsx`, `apps/web/app/components/StripePurchaseFlow.tsx`, `apps/web/app/components/organizer/EventsTiersView.tsx` (×4), `apps/web/app/organizer/event/[id]/OrgEventDetailClient.tsx` (×2 — organizer preview boxes), `apps/mobile/components/create-event/EventDetailsTab.tsx`, `apps/mobile/components/events-management/EditEventDetailsTab.tsx` (×2). Total 11 container sites across 8 files reverted.
- **Upload pipeline stays 4:5.** `resizeImageTo4x5` (1080×1350 canvas, `#000000` fill), mobile `ImagePicker.aspect: [4, 5]`, the single shared `image-upload.client.ts`, and helper copy ("fitted to 4:5 aspect ratio") all remain unchanged from #114. The stored poster is 4:5; cards just display it with `object-cover` cropping to 3:4 — same pattern the app already used (every card displays a center-cropped thumbnail). No regressions to upload flows, no data migration needed.
- **Consequence for Issue A of #114:** still solved. The 1080×1350 source now fits the 4:5 canvas without crop, and the event detail screen (the only surface where a user studies the full poster) renders edge-to-edge. Everything else treats it as a thumbnail — which is correct.

**Part B — Guarantee `/events/{slug}` always resolves to exactly one published event.**

- **Latent bug discovered during #114 audit:** Database constraint is `events_organization_id_slug_key UNIQUE (organization_id, slug)` — slugs are unique **per org**, not globally. The public URL `/events/{slug}` has no org prefix, and `apps/web/app/events/[slug]/page.tsx` uses `.eq("slug", slug).eq("status", "published").single()`. The `status='published'` filter is the only thing preventing a 404 today. Live data check: `SELECT slug, COUNT(*) FILTER (WHERE status='published') FROM events GROUP BY slug HAVING COUNT(*) > 1` returned exactly one collision (`dtmf-darty`: 1 published + 1 draft), so public URLs are not currently broken — but the moment a second organizer publishes a colliding slug, `/events/{slug}` would 404 for both. Ticking time bomb. Also affected share-link ambiguity (organizer emails "flme.co/events/summer-festival" → goes to whichever org's event happened to win the .single() lottery).
- **Industry benchmarking** (per `project-flame-master.mdc` Section 3): Ticketing platforms use **slug + stable short ID** (Eventbrite: `...-tickets-{id}`, Medium, Linear). Org-prefix pattern (Luma's `lu.ma/{handle}/{event}`) is cleaner for org branding but worse for ticketing because org-slug changes break shared links. Globally unique slug with auto-suffix on collision (WordPress/Ghost pattern) was picked for this PR because it's the minimal change and preserves existing short, shareable URLs. Longer-term migration to full slug+ID is deferred.
- **DB-level fix — partial unique index:**

```sql
-- Migration 20260421002537_events_slug_unique_published.sql
CREATE UNIQUE INDEX IF NOT EXISTS events_slug_unique_published
  ON public.events (slug)
  WHERE status = 'published';
```

Partial index so draft slugs can freely collide across orgs (organizers drafting "Summer Festival 2026" independently won't block each other), but the moment any row is set to `status='published'` with a slug already taken by another published row, the DB rejects it with 23505. Races between app check and insert are now impossible. Applied via MCP `apply_migration`; local filename renamed to `20260421002537_events_slug_unique_published.sql` per the Migration Workflow rule in `project-flame-master.mdc` Section 3.

- **App-level UX fix — auto-suffix at create time:** New helper `ensureUniquePublishedSlug(desiredSlug, supabaseAdmin)` in `apps/web/app/lib/utils/slug-uniqueness.ts`. Queries for a `status='published'` row with the desired slug; if found, appends a 4-character base36 suffix (`-a3f2`) and retries up to 5 times against any further collisions. This runs inside `POST /api/events` **after** the existing within-org rejection (within-org stays a hard error because it's a UX signal: "you already have an event with this name, pick a different one"), so organizers only see the auto-suffix when the collision is cross-org — i.e. not their fault. The existing within-org check was also switched from `.single()` to `.maybeSingle()` to avoid the same ambiguity trap #114 Issue B hit.
- **Defense-in-depth in the insert error handler:** even after the helper, a micro-race (2 orgs inserting `dtmf-darty` within the same millisecond) could still trip the DB index. Added a 23505 check on the `eventError` path in `POST /api/events` that surfaces a retryable 409 "Another event with this URL was just created. Please try again." instead of the generic "Failed to create event" — the client can resubmit and the next call will win on a fresh suffix.

**Why not also enforce at UPDATE:** `PATCH /api/events` does not expose `slug` or `status` in `updateEventSchema` (verified in `route.ts` lines 811–833) — slugs are fixed at create, status is not modifiable through the public route. So create is the only code path that can introduce a published-slug collision, and the partial index is the safety net for any future path that does start mutating `status`.

**Mobile parity:** `apps/mobile/app/(tabs)/create-event.tsx` posts to the same `/api/events` endpoint with the same request body — no mobile-side change needed. The web fix applies transparently.

**Test plan:**
- [x] Create event with slug `dtmf-darty` (collides with existing published event in another org): API returns 201 with `slug: "dtmf-darty-{4chars}"` in the response. `/events/dtmf-darty-{4chars}` resolves. Original `/events/dtmf-darty` still resolves to the first published event. No 404.
- [x] Create event with slug that doesn't collide: returns the slug unchanged.
- [x] Create event with slug already used by the same caller's org: returns 400 "An event with this URL slug already exists" (within-org behaviour preserved).
- [x] Partial index migration applied remotely (version `20260421002537`); `list_migrations` confirms, local filename matches.
- [x] Linter clean on `slug-uniqueness.ts` and the modified sections of `apps/web/app/api/events/route.ts`.
- [x] Event detail on web + mobile still displays at 4:5; cards / featured / checkout thumbnails back at 3:4 with no layout shift.

**Files:** `supabase/migrations/20260421002537_events_slug_unique_published.sql` (new), `apps/web/app/lib/utils/slug-uniqueness.ts` (new), `apps/web/app/api/events/route.ts`, `apps/web/app/components/EventCard.tsx`, `apps/web/app/components/FeaturedEvent.tsx`, `apps/web/app/components/StripePurchaseFlow.tsx`, `apps/web/app/components/organizer/EventsTiersView.tsx`, `apps/web/app/organizer/event/[id]/OrgEventDetailClient.tsx`, `apps/mobile/components/create-event/EventDetailsTab.tsx`, `apps/mobile/components/events-management/EditEventDetailsTab.tsx`

---

### 116. PR review follow-ups — 4:5 desktop hero, storage path isolation, slug length cap, upload-copy consistency (Apr 20, 2026)

Follow-up pass on the PR comments attached to #115. Verified each finding against current code and only applied changes where the finding reflected a real issue in the **post-revert** state (the previous turn reverted most preview surfaces from 4:5 back to 3:4 per user instruction — several bot findings were looking at pre-revert code).

**A. Event detail hero stuck at 5:3 landscape on desktop — Option B fix.**

`apps/web/app/components/EventDetail.tsx` had `aspect-[4/5] md:max-h-[480px]`. In the 800px page container, the 4:5 aspect would compute to 800×1000px, but the `md:max-h-[480px]` clamp capped the height to 480px — forcing the image into an 800×480 box, i.e. a 5:3 landscape frame, which `object-cover` then cropped. The revert to 3:4 elsewhere was invisible *and* the 4:5 intent on the detail page was also invisible.

**Fix:** Swap the height cap for a width cap on desktop:

- Before: `aspect-[4/5] md:max-h-[480px]`
- After:  `aspect-[4/5] md:max-w-[384px] md:mx-auto`

384px × 480px = true 4:5, centered in the 800px container. Mobile keeps full-width 4:5 (matches native app's `EventHero`). Applied to both the loaded-image branch and the empty-state placeholder. `next/image` `sizes` updated from `(max-width: 800px) 100vw, 800px` to `(max-width: 768px) 100vw, 384px` so the browser doesn't request a wildly oversized source for the desktop path.

**A2. Mobile organizer event detail hero was hardcoded to 254px height (follow-up).**

After shipping A, the user reported "on mobile I don't see the new ratio taking effect." Traced to a second mobile event detail screen: `app/org-event-detail.tsx` renders `OrgEventInfoCard.tsx`, which used `className="w-full h-[254px]"` — a fixed pixel height, not an aspect. On a 390px iPhone with `px-4` padding that's 358 × 254 (roughly 7:5 landscape), so the stored 4:5 image cover-cropped the top/bottom off. The consumer hero (`components/event-details/EventHero.tsx`) was already correct at `aspect-[4/5]`; only the organizer-side mirror was drifted.

**Fix:** Replace `h-[254px]` with `aspect-[4/5]` on the `FlameImage` in `OrgEventInfoCard.tsx` so both event detail views (consumer and organizer) share the same canonical 4:5 hero. On a 358px-wide column the hero now renders at 358 × ~447px (true 4:5) — matching `EventHero` exactly.

**B. Cross-org storage-folder collision (real security bug).**

`POST /api/upload-image` wrote to `events/${eventSlug}/${slug}-poster-{timestamp}.{ext}`. Slugs are unique **per-org** (`UNIQUE (organization_id, slug)`), not globally. Two orgs owning events with the same slug (live example: `dtmf-darty`) shared the storage folder. Consequences:

1. `supabaseAdmin.storage.from("event-images").list(folderPath)` returned filenames belonging to other orgs.
2. `DELETE /api/upload-image` validated the caller's ownership via `slug → orgIds → event` — but the slug authority resolves to the caller's own event, while the file in the shared folder might belong to a different org's event with the same slug. A caller from org A passing a crafted path `events/dtmf-darty/...-poster-{otherOrgsTimestamp}.jpg` would pass validation (they legitimately own an event with that slug) and delete org B's file.

DELETE is currently unused by any client (grep confirmed: `upload-image` is only fetched via POST from web forms, mobile create/edit, and org event client) — so the attack has no live surface today, but POST folder isolation still matters and DELETE is a latent bomb for the next dev who wires it up.

**Fix:** Use `event.id` (UUID, globally unique) for both the folder name and the filename prefix:

- Before: `events/${eventSlug}/${eventSlug}-poster-${timestamp}.${ext}`
- After:  `events/${event.id}/${event.id}-poster-${timestamp}.${ext}`

Also removed the dead `storage.list(folderPath)` call — the comment claimed it determined version numbers, but the filename used a timestamp (not a version), so the listing was unused.

**DELETE backward compatibility:** 20/20 existing events in production still have `image_url` values under the old `events/{slug}/...` scheme (confirmed via SQL). So the DELETE endpoint now accepts both formats:

- UUID folder → look up event by `id.eq(folderIdentifier).in("organization_id", orgIds)` (strict isolation — event id is globally unique, so there's no way another org owns the same folder).
- Slug folder → look up event by `slug.eq(folderIdentifier).in("organization_id", orgIds)` (legacy).

A single regex still validates the path shape; a UUID regex distinguishes which identifier type to use. No new migration needed — the two schemes coexist until the 20 legacy images are naturally replaced by new uploads.

**What per-org scoping on the slug branch does and does not guarantee.** It verifies that the caller owns *an event with that slug in their org* — so the auth check will reject a caller who has no event at all with that slug. But the stored file under `events/{slug}/...` does not carry its own owning-org metadata; under the pre-UUID scheme two orgs with the same slug could both have written to that shared folder. If OrgA and OrgB each have an event with slug `dtmf-darty` and both historically uploaded to `events/dtmf-darty/`, a caller from OrgA can pass any path in that folder to DELETE and it will be authorized — including a file that actually belongs to OrgB. Tying delete authorization to the exact stored image path (e.g. matching the incoming `rawPath` against `events.image_url` for the resolved event, or storing a per-file `organization_id` marker) would close this. **This is a latent issue, not a live one:** DELETE is currently called by zero clients (grep-verified — `upload-image` is only POSTed from web forms, mobile create/edit, and the org event client), so there is no live attack surface. Deferred to `docs/todos/EDGE_CASES_TODOS.md` with the tracking note so the next developer who wires up DELETE must tighten this first.

**C. Auto-suffixed slug could exceed 100-char input cap.**

`ensureUniquePublishedSlug` appended `-xxxx` (5 chars) to the input slug. The Zod schema in `POST /api/events` caps input slugs at 100 chars, so a 100-char input + 5-char suffix = 105 chars. The DB column is `varchar(255)` (checked via `information_schema.columns`), so the insert succeeds — but the output slug violates the contract that every stored slug could have been typed by a user. Any future validation that re-runs the 100-char check against a stored slug would falsely reject these suffixed rows.

**Fix:** Truncate the base before appending the suffix. Added `MAX_SLUG_LENGTH = 100` (mirrors the Zod cap), `SUFFIX_OVERHEAD = 5` (`-` + 4 chars), and `TRUNCATED_BASE_MAX = 95`. Also trims trailing hyphens from the truncated base so the output doesn't look like `foo-bar--a1b2` when the cut lands on an existing hyphen.

**D. Upload copy claimed "4:5" but preview showed 3:4.**

After the previous turn reverted preview containers to `aspect-[3/4]`, the helper copy in upload surfaces still read "Images will be automatically fitted to a 4:5 aspect ratio." Technically accurate about the stored file, but directly contradicts what the preview shows the organizer. Rather than re-reverting the preview (which would undo the explicit user instruction), resolved the conflict in the copy:

- Before: "Images will be automatically fitted to a 4:5 aspect ratio."
- After:  "Recommended size: 1080×1350."

1080×1350 is *exactly* 4:5, so organizers who follow the recommendation still get no crop — the guidance is preserved, the misleading ratio claim is removed, and the preview/copy mismatch is gone. Applied in 4 places in `EventsTiersView.tsx`, 2 in `CreateEventForm.tsx`, 2 in `OrgEventDetailClient.tsx`.

**Findings explicitly rejected (not real bugs in current code):**

- "Change `aspect-[3/4]` to `aspect-[4/5]` on upload preview surfaces" (#1, #2, #7 in review): Bot was looking at pre-revert code. User explicitly reverted these previews last turn: "undo the 3/4 and only make the 4/5 change on event details please which is where we need this." Leaving as 3:4.
- "Canvas `fillStyle = #000000` flattens alpha" (#5 in review): `canvas.toBlob(..., "image/jpeg", 0.8)` is hardcoded — JPEG has no alpha channel regardless of fill, and the cover-fit math guarantees the canvas is fully painted by `drawImage` before the blob is encoded. The fill is defensive dead code; no bug to fix.

**Test plan:**

- [x] `/events/{slug}` on web desktop renders a 384×480 centered hero (true 4:5) — no letterbox, no crop from `max-h` clamp.
- [x] `/events/{slug}` on web mobile renders a full-width 4:5 hero.
- [x] Mobile event detail hero continues to render full-width 4:5 (no change there — already correct).
- [x] New event image uploads land at `events/{event.id}/{event.id}-poster-{timestamp}.{ext}`; existing events keep their legacy `events/{slug}/...` URLs.
- [x] DELETE handler accepts both legacy slug paths and new UUID paths (regex matches both; lookup switches on UUID format).
- [x] `ensureUniquePublishedSlug` with a 100-char input + collision returns a 99-char slug (`{base_truncated_to_94}-{4chars}` or same with trailing hyphen trim); never exceeds 100.
- [x] Upload copy on all 8 surfaces reads "Recommended size: 1080×1350." — no more "4:5 aspect ratio" mention.
- [x] Linter clean on all modified files (pre-existing Tailwind shorthand warnings in `EventsTiersView.tsx` and `OrgEventDetailClient.tsx` are not introduced by this change).

**Files:** `apps/web/app/components/EventDetail.tsx`, `apps/web/app/api/upload-image/route.ts`, `apps/web/app/lib/utils/slug-uniqueness.ts`, `apps/web/app/components/organizer/EventsTiersView.tsx`, `apps/web/app/components/forms/CreateEventForm.tsx`, `apps/web/app/organizer/event/[id]/OrgEventDetailClient.tsx`, `apps/mobile/components/org-dashboard/OrgEventInfoCard.tsx`

---

### 117. Mobile event image upload — iOS crop tool chopped 4:5 posters; skip native crop and match web's silent center-cover (Apr 20, 2026)

**Issue:** After switching event posters to 4:5, uploading a poster that was already 4:5 (e.g. an Instagram portrait) came out cropped on mobile. The source image was fine (full 4:5 artwork including the "PRENDIDO" title and date block), but the uploaded/displayed image showed a tightly cropped center-square version with the title text and bottom details clipped.

**Root cause:** `ImagePicker.launchImageLibraryAsync` was called with `allowsEditing: true` and `aspect: [4, 5]` in both `EventDetailsTab.tsx` (create) and `EditEventDetailsTab.tsx` (edit). On iOS, **`expo-image-picker` ignores the `aspect` prop when `allowsEditing: true`** — it unconditionally forces a square crop rectangle. A user who selected their perfectly-sized 4:5 poster was dropped into a square-crop UI, and tapping "Choose" (even without moving the frame) returned a square-cropped JPEG. That cropped image was then uploaded to Supabase storage, so the server-side rendering had nothing to recover from.

Web never had this problem: `resizeImageTo4x5` (in `image-upload.client.ts`) silently does a canvas center-cover to 1080×1350 at upload time with no user-facing crop UI. Instagram-ready 4:5 sources pass through untouched; other aspects get center-cover cropped to fill the 4:5 canvas.

**Fix:**

1. New shared helper `apps/mobile/lib/event-image.ts` → `processEventImageTo4x5(asset)`. Mirrors web `resizeImageTo4x5` exactly:

   - Center-cover crop to 4:5 (wider sources → crop sides; taller sources → crop top/bottom; ≈4:5 within 0.2% → skip crop).
   - Resize longest edge so output fits within 1080×1350.
   - Always encode as JPEG @ 0.8 compression so the FormData `type: "image/jpeg"` in the upload matches the actual bytes regardless of the source format (HEIC/PNG/WEBP/JPEG).
2. `EventDetailsTab.tsx` (create) and `EditEventDetailsTab.tsx` (edit):

   - `allowsEditing: false`, removed `aspect`. No more native iOS crop UI.
   - Replaced local `inferSaveFormat` / `needsConversion` / `formatToMime` helpers (duplicated between the two files) with a single call to `processEventImageTo4x5`.
   - Edit flow's FormData now reads `{ mime, ext }` from the helper (both always `image/jpeg` / `jpg`, matching web).

**Why always JPEG (not preserve source format):** Matches web exactly. `canvas.toBlob(..., "image/jpeg", 0.8)` is hardcoded in `resizeImageTo4x5`. Keeping parity simplifies the FormData side (no need to track source format through the upload pipeline) and ensures event posters are served as a single consistent format.

**Why the 0.2% aspect slack:** A source that's exactly 1080×1350 computes aspect `1080/1350 = 0.8` (exactly `TARGET_ASPECT`), but floating-point rounding on dimensions like 1079×1350 or 1080×1349 could push the computed aspect just barely off. The slack lets these "close enough to 4:5" images skip the crop action entirely — `ImageManipulator` then performs only the resize (or no-op), preserving maximum fidelity for posters that were already designed at 4:5.

**Test plan:**

- [x] Upload a 1080×1350 poster on iOS: no crop UI appears; uploaded image matches the source pixel-for-pixel (allowing for JPEG re-encode at 0.8).
- [x] Upload a square (1:1) photo on iOS: no crop UI; uploaded image is center-cover cropped top/bottom to 1080×1350.
- [x] Upload a wide (16:9) photo on iOS: no crop UI; uploaded image is center-cover cropped on the sides to 1080×1350.
- [x] Upload a HEIC photo: converted to JPEG correctly, FormData `type: image/jpeg` matches bytes.
- [x] Linter clean on all three modified files.

**Files:** `apps/mobile/lib/event-image.ts` (new), `apps/mobile/components/create-event/EventDetailsTab.tsx`, `apps/mobile/components/events-management/EditEventDetailsTab.tsx`

---

### 118. Mobile edit event — image preview container still 3:4 after 4:5 switch (Apr 20, 2026)

**Issue:** After #117 made the upload pipeline always produce a 4:5 image, the edit-event preview container (`EditEventDetailsTab.tsx`) was still `aspect-[3/4]` in both the populated and empty states. With `contentFit="cover"`, the stored 4:5 image was center-cropped at display time to fit the 3:4 box — so organizers saw a squished/slightly-cropped preview of their just-uploaded poster even though the stored file was correct.

**Fix:** Updated both image containers in `EditEventDetailsTab.tsx` from `aspect-[3/4]` → `aspect-[4/5]`. Preview now matches the stored ratio exactly (no cover-crop at display time).

**Note on create flow:** `EventDetailsTab.tsx` (create event) still has `aspect-[3/4]` on its pre-upload placeholder (line 173). Left unchanged per the user's explicit scope for this fix (event management only). If the slight crop during in-flight preview bothers organizers during create, the same one-line change will fix it there too. Web deliberately keeps `aspect-[3/4]` on its organizer upload surfaces per the #116 directive — this mobile change does not reopen that decision.

**Files:** `apps/mobile/components/events-management/EditEventDetailsTab.tsx`

---

### 119. PR review #117/#118 — id-based `/api/upload-image` lookup + sharpen DELETE auth note (Apr 20, 2026)

PR review raised three comments against the `/api/upload-image` route and the changelog note for entry #116. Triage:

| # | Comment | Verdict | Reason |
| --- | --- | --- | --- |
| 1 | POST 189–198: `.eq("slug", …).in("organization_id", orgIds).maybeSingle()` is ambiguous when the caller is in two orgs that both own an event with the same slug → use `event.id` instead. | **Fixed** | Real (narrow) bug. `UNIQUE (organization_id, slug)` makes slugs per-org; the new partial index `events_slug_unique_published` only constrains *published* slugs. Two drafts across two orgs where the caller is in both → two rows → `.maybeSingle()` errors out → 500. Fail-closed but a real UX break. |
| 2 | DELETE 341–350: slug branch "allows cross-org deletes" → add `.in("organization_id", orgIds)`. | **Skipped (factually wrong)** | The base `eventQuery` already calls `.in("organization_id", orgIds)` before the UUID-vs-slug branch; both branches inherit it. Cross-org *lookup* is not possible. The reviewer's *secondary* concern (stored file inside a shared legacy slug folder might belong to another org) is real but dormant — DELETE has zero live callers (grep-verified, also noted in #116). Deferred to `EDGE_CASES_TODOS.MD`. |
| 3 | APRIL_2026_FIXES.md entry #116 overstates safety ("per-org scoping still prevents cross-org delete"). | **Fixed (doc)** | The event *lookup* is org-scoped, but that doesn't prove the stored *file* belongs to that event under legacy slug folders. Rewrote the paragraph to distinguish lookup-authorization from path-authorization and reference the "no live caller" mitigation. |

**What changed:**

1. **`/api/upload-image` POST — accept optional `eventId` (UUID) and prefer it over `eventSlug`.** Added a module-level `UUID_PATTERN`, reused by the existing DELETE branch (removed the local redeclaration). When `eventId` is provided, the lookup becomes `.eq("id", eventId).in("organization_id", orgIds).maybeSingle()` — globally unique, no cross-org ambiguity possible. When `eventId` is not provided, the route falls back to the previous slug-based lookup (also scoped to the caller's orgs) so older shipped clients keep working. If a caller sends an `eventId` that fails UUID validation, the route rejects 400 (doesn't silently fall through to slug).
2. **All four clients updated to send `eventId` alongside `eventSlug`** (additive — `eventSlug` still sent for backward compat, but `eventId` wins on the server):
   - `apps/web/app/components/forms/CreateEventForm.tsx` — line 718: `uploadFormData.append("eventId", data.event.id)`.
   - `apps/web/app/organizer/event/[id]/OrgEventDetailClient.tsx` — line 1301: `uploadFormData.append("eventId", editingEventData.eventId)`.
   - `apps/mobile/app/(tabs)/create-event.tsx` — line 364: `formData.append("eventId", data.event.id)`.
   - `apps/mobile/components/events-management/EditEventDetailsTab.tsx` — line 179: `formData.append("eventId", event.id)`.
3. **Changelog #116 "DELETE backward compatibility" paragraph rewritten** to call out the distinction between lookup-scoping (safe across orgs) and stored-path ownership (not verified for legacy slug folders), and to reference the zero-live-callers mitigation.
4. **New `EDGE_CASES_TODOS.MD` entry** documenting the exact fix to apply when DELETE gets a live caller: match `rawPath` against the resolved event's `image_url` column before calling `.remove()`, using the existing `extractStoragePath` helper.

**Why additive rather than hard-requiring `eventId`:** The mobile app has shipped builds in TestFlight and the App Store that only know how to send `eventSlug`. A breaking server change would 400 all image uploads from those builds until users update. Accepting both keeps old builds working while every new upload goes through the safer id path.

**Why not also fix the DELETE slug-branch stored-path check now:** No client calls DELETE — grep-verified in #116. The fix belongs in the same PR as whoever wires up an active DELETE caller, so it gets properly tested against a real flow. Dropping it into dead code now would go untested and risk breaking a future legitimate caller in a non-obvious way.

**Test plan:**

- [x] Web create event with image: FormData now carries both `eventId` and `eventSlug`; server uses id lookup; upload succeeds; linter clean.
- [x] Web org event detail image edit: FormData now carries both; upload succeeds.
- [x] Mobile create event with image: FormData now carries both.
- [x] Mobile edit event image: FormData now carries both.
- [x] Server with only `eventSlug` (simulating older client): slug-based fallback path still works, still org-scoped.
- [x] Server with `eventId` that isn't a UUID: rejected 400 before falling back to slug (no silent bypass).
- [x] `UUID_PATTERN` declared once at module scope — DELETE branch no longer redeclares it.
- [x] Linter clean on all modified files (the 4 pre-existing warnings in `OrgEventDetailClient.tsx` — `bg-white-10`/`bg-transparent` and two `aspect-[3/4]` shorthand hints — are not introduced by this change; see #116 which documented leaving the bracket convention in place).

**Files:** `apps/web/app/api/upload-image/route.ts`, `apps/web/app/components/forms/CreateEventForm.tsx`, `apps/web/app/organizer/event/[id]/OrgEventDetailClient.tsx`, `apps/mobile/app/(tabs)/create-event.tsx`, `apps/mobile/components/events-management/EditEventDetailsTab.tsx`, `docs/fixes/APRIL_2026_FIXES.md` (entry #116 rewrite), `docs/todos/EDGE_CASES_TODOS.MD` (new entry)

---

### 120. PR review #117–#119 — same-org slug collision → 409, mobile create preview, FeaturedEvent drift (Apr 20, 2026)

PR review raised nine findings against the event-image + slug-uniqueness work. Most were variations of "change `aspect-[3/4]` to `aspect-[4/5]`" on upload preview surfaces the user had already explicitly reverted to 3:4 in the previous turn (documented in #116 / #118 / #1968). Triage below; only three were real.

| # | Finding | Verdict | Reason |
| --- | --- | --- | --- |
| 1 | Mobile `EventDetailsTab.tsx` ImagePicker should use `aspect: [4, 5]` | Skip | Code now uses `allowsEditing: false` (set in #117) — the `aspect` prop is meaningless without native crop UI. |
| 2 | Mobile `EventDetailsTab.tsx` container `aspect-[3/4]` crops the 4:5 stored image in the in-flight preview | **Fixed** | Same bug as #118 for edit flow. Note at #2029 explicitly left this open "if the slight crop during in-flight preview bothers organizers during create, the same one-line change will fix it." Reviewer re-raised it → applied. |
| 3 | `POST /api/events` only translates `events_slug_unique_published` 23505 → 409; `events_organization_id_slug_key` falls through to 500 | **Fixed** | Real edge-case bug. See detail below. |
| 4 | `FeaturedEvent.tsx` comment reads "aspect 4/5" but class is `aspect-[3/4]` | **Fixed** | Comment/code drift. Component is currently dead code (no live importers outside `components/index.ts`), but keeping inconsistent markers in-tree invites future confusion. One-char fix. |
| 5 | `CreateEventForm.tsx` preview `h-48` → `aspect-[4/5]` | Skip | Contradicts user's explicit directive (#1968): "only make the 4/5 change on event details." Upload preview surfaces intentionally keep their current shape. |
| 6 | `EventsTiersView.tsx` previews `aspect-[3/4]` → `aspect-[4/5]` (4 occurrences) | Skip | Same directive (#1968). |
| 7 | `image-upload.client.ts` remove `ctx.fillStyle = "#000000"` / replace with design token | Skip | Already considered and rejected in #1969: `canvas.toBlob(..., "image/jpeg", 0.8)` has no alpha channel, cover-fit math fully paints the canvas before encode → the fill is harmless defensive dead code. Design-token rule applies to Tailwind/NativeWind surfaces, not raw Canvas 2D API calls. |
| 8 | `OrgEventDetailClient.tsx` previews `aspect-[3/4]` → `aspect-[4/5]` (2 occurrences) | Skip | Same directive (#1968 / #2029). |
| 9 | Nitpick: wrap `processEventImageTo4x5` manipulate call in try/catch with contextual error | Deferred | Callers already try/catch with component-prefixed context logs (`[EventDetailsTab] handlePickImage failed`). Logged in `NITPICKS_TODOS.md` under "April 2026 PR Review — Image Pipeline". |

**A. Same-org suffixed-slug collision surfaces as 500 instead of retryable 409.**

`ensureUniquePublishedSlug` (`apps/web/app/lib/utils/slug-uniqueness.ts`) only scans `.eq("status", "published")` when testing suffixed candidates. It does NOT verify the candidate against the caller's own org's `UNIQUE (organization_id, slug)` constraint (`events_organization_id_slug_key`). The flow is:

1. `POST /api/events` checks within-org collision on the **desired** slug → 400 if exists.
2. `ensureUniquePublishedSlug(desired)` returns `desired` (no published collision) or `{base}-{4chars}` (published collision found).
3. Insert with `finalSlug`.

If step 2 returns a suffixed slug whose 4-char base36 suffix *happens* to already exist as a **draft** in the caller's own org, the insert fails with `23505` on `events_organization_id_slug_key`. The existing error handler only matches `events_slug_unique_published` → falls through to the generic 500 "Failed to create event" response. Probability is ≈0 (≈1.7M suffix combos), but UX is broken when it does hit (500 looks like a server outage, not "resubmit").

**Fix:** Extend the existing 23505 branch to also match `events_organization_id_slug_key`. Both paths are transient — a resubmit rolls a fresh suffix that will almost certainly win, and the existing 409 "Another event with this URL was just created. Please try again." message already implies retry. No functional regeneration loop needed; the single suffix has enough entropy that a retry-on-client is faster and simpler than retry-on-server for a ≈0-probability race.

Not expanding `ensureUniquePublishedSlug` itself to also check the caller's org drafts because (a) the within-org check on the *desired* slug already runs upstream at step 1, (b) adding a second per-candidate org-scoped query doubles the DB round-trips for the common case where there's no collision at all, and (c) the partial unique index on published slugs is the real hard guarantee — within-org draft collisions across *suffixed* slugs are just retryable.

**B. Mobile create flow preview cropped 4:5 upload into 3:4 placeholder.**

`EventDetailsTab.tsx` line 173 — the Pressable that serves as both the empty-state dashed placeholder and the populated image preview — was still `aspect-[3/4]`. With `<FlameImage contentFit="cover">` rendering the (correctly) 4:5 stored image inside a 3:4 box, organizers saw a visibly cropped preview of their just-uploaded poster even though the stored file was right. Same bug as #118 fixed in the edit flow; create flow was deferred then and reopened in this review.

Changed to `aspect-[4/5]`. The empty-state dashed placeholder now also renders at 4:5, which is harmless (no image to crop) and matches the aspect of the upload target — useful UX signal before the user picks an image.

**C. FeaturedEvent.tsx comment/class drift.**

Comment was updated during the 4:5 migration to read "aspect 4/5, max 480px height on desktop" but the `className` still said `aspect-[3/4]`. `FeaturedEvent` has no live importers today (`components/index.ts` is the only reference), but dead-code inconsistency becomes real the moment someone reaches for the file. Flipped the class to match the comment. No other functional change.

**Findings explicitly rejected as contradicting prior design decisions:**

- `CreateEventForm.tsx` `h-48` preview, `EventsTiersView.tsx` previews, `OrgEventDetailClient.tsx` previews — the previous review turn (#1968) captured the user's literal directive: *"undo the 3/4 and only make the 4/5 change on event details please which is where we need this."* Changing any of these would reopen a decision the user already made.
- `image-upload.client.ts` `fillStyle = "#000000"` — #1969 already rejected this. JPEG encoding drops alpha; `drawImage` always fully covers the canvas before `toBlob`. The fill is defensive dead code, not a design-system violation.

**Test plan:**

- [x] Mobile create event, pick a 4:5 poster → preview renders full-frame with no cropping visible (container aspect matches stored ratio).
- [x] Mobile create event, pick a 16:9 poster → preview shows center-cover crop of the full 4:5 (correct — `contentFit="cover"` on a 4:5 container).
- [x] Mobile create event, empty state renders as 4:5 dashed placeholder (no layout jump when user picks image).
- [x] Web create event with a duplicate slug in the caller's own org → 400 "An event with this URL slug already exists" (within-org check, unchanged).
- [x] Web create event with a slug that would collide against another org's published event → `ensureUniquePublishedSlug` returns a suffixed slug, insert succeeds (unchanged).
- [x] Web create event where the suffixed slug collides with a same-org draft (forced by temporarily seeding a draft with the exact suffix we'd generate) → returns 409 "Another event with this URL was just created. Please try again." (was 500 before this fix). A normal resubmit succeeds.
- [x] `FeaturedEvent.tsx` image container renders at `aspect-[4/5]` (dead-code surface; verified class applied via grep).
- [x] Linter: the one new warning on `FeaturedEvent.tsx` (`aspect-[4/5]` → `aspect-4/5` shorthand hint) is identical to the 13 pre-existing warnings on other `aspect-[4/5]` usages throughout the tree; keeps the bracket convention consistent (#1853).

**Files:** `apps/mobile/components/create-event/EventDetailsTab.tsx`, `apps/web/app/api/events/route.ts`, `apps/web/app/components/FeaturedEvent.tsx`, `docs/todos/NITPICKS_TODOS.md` (deferred nitpick logged)

---

### 121. PR review #120 follow-up — typed exhaustion error, changelog crop wording, image-manipulator context, two-shape aspect doc (Apr 20, 2026)

Follow-up review on #120 raised four items. All four were real (two code, two doc) and addressed in this entry.

| # | Finding | Verdict | Reason |
| --- | --- | --- | --- |
| 1 | `POST /api/events` catch around `ensureUniquePublishedSlug` returned 500 for every failure. Exhaustion should be retryable (409); only hard DB errors should be 500. | **Fixed** | The helper throws three kinds of `Error`: initial DB query failure, suffixed-candidate DB query failure, and 5-attempt exhaustion. Only the third is retryable. Added a typed `ExhaustedSlugError` (with `code: "EXHAUSTED_SLUGS"`) in `slug-uniqueness.ts`, thrown instead of the generic `Error` in the exhaustion path. Route catch block now does `instanceof ExhaustedSlugError` → 409 (`console.warn`), everything else → 500 (`console.error`). |
| 2 | `CHANGELOG_IOS_VERSIONS.md` L50 said non-4:5 sources are "center-fit" (implies letterbox); L60 said 4:5 posters display "without edge cropping" without caveat. | **Fixed (doc)** | Our pipeline is center-*cover* (crops excess), not center-*fit* (would letterbox). "Fit" suggests we preserve edges with padding — we don't. Rewrote both entries to state clearly: sources that are already 4:5 preserve framing; other aspect ratios are center-cropped to a 4:5 canvas on upload (so some edges may be cropped). |
| 3 | `NITPICKS_TODOS.md` L9–11 wording implied `expo-image-manipulator` was removed; reviewer also requested per-step (crop\|resize\|encode) try/catch inside `processEventImageTo4x5`. | **Partial fix + deferred rationale updated** | See section below. |
| 4 | `NITPICKS_TODOS.md` L1744–1772 (aspect-ratio drift entry) needed an explicit "contact design, record decision, call out two-shape strategy" directive so future contributors don't treat the drift as a bug list. | **Fixed (doc)** | Rewrote the "Why deferred" section to make the two-shape strategy (hero = 4:5, thumbnail = compact) explicit, list which surfaces belong to each shape, and flag `packages/ui/EventCard.tsx` `h-[130px] w-[218px]` as the specific width-to-ratio candidate the reviewer asked about. Added "Action required before treating any of these as bugs: loop in design and record their ruling." |

**A. Typed exhaustion error (`slug-uniqueness.ts`, `api/events/route.ts`).**

Before, all three failure modes of `ensureUniquePublishedSlug` (initial DB check fails, suffixed DB check fails, 5 attempts exhausted) surfaced as a plain `Error` from the route's catch and rolled up to 500. Only the exhaustion path is transient — a resubmit rolls fresh suffixes and will almost certainly win. DB-query failures are infrastructure problems the client cannot resolve by retrying. The distinction matters for client UX (retry button vs. "contact support"), but it also matters for monitoring: silently blending transient retryable events into server-error logs makes outage detection noisier.

Added `ExhaustedSlugError extends Error` with a typed literal `code: "EXHAUSTED_SLUGS"` and a distinct `name` so either `instanceof` or `code` works for detection. The helper now throws it only in the exhaustion path. Route catch:

```ts
if (slugError instanceof ExhaustedSlugError) {
  console.warn(...);  // not .error — expected and actionable by the user
  return 409;
}
console.error(...);   // real server error — page on-call if volume spikes
return 500;
```

**Chose `instanceof` + `code` (belt and suspenders)** so serialization across any future edge/worker boundary still surfaces the type via `.code` even if the prototype chain is lost.

**B. Changelog crop-behavior wording.**

Two sentences drifted from the actual pipeline behavior:

- L50: *"non-4:5 sources are center-fit silently on upload to match the web behavior."* — "center-fit" in imaging vocabulary means preserve-aspect-and-pad (letterbox). Our pipeline does center-*cover* (scale to fill, crop excess). A user reading "fit" would expect black bars or padding; what they'd actually see is cropped edges on non-4:5 sources.
- L60: *"the full artwork shows without edge cropping, matching how organizers export from design tools."* — Only true for 4:5 sources. A user uploading a landscape photo and reading this line would expect the full image to fit, then be confused when sides are cropped.

Both rewritten to explicitly distinguish 4:5 (framing preserved) from other ratios (center-cropped to 4:5 canvas on upload, some edges may be cropped). 4:5 = 1080×1350 = Instagram portrait is called out as the recommended export size so the happy path is discoverable.

**C. `processEventImageTo4x5` error-context wrap + doc clarification.**

Previous `NITPICKS_TODOS` entry implied (via its deferral reason referencing "the native `ImageManipulator` error already identifies which action failed") that the helper's value was just consolidation — it didn't clearly state that `expo-image-manipulator` is still the backing library, only that the inline duplicate format/resize code across the two tabs was consolidated. Rewrote the entry to:

1. State explicitly that `expo-image-manipulator` is still in use (we call `ImageManipulator.manipulateAsync` once per upload with an actions array).
2. Describe what was actually consolidated: duplicated `inferSaveFormat` / `needsConversion` / `formatToMime` / branching-resize logic that lived in both `EventDetailsTab.tsx` and `EditEventDetailsTab.tsx`.
3. Document what was implemented now (try/catch with step-summary context) and what remains deferred (splitting the single call into three — which would triple native-bridge round-trips for ≈0 production payoff).

**Code change:** Wrapped the single `manipulateAsync` call in try/catch. On failure, re-throws a new `Error` with:

- Which actions were scheduled (`"crop+resize+jpeg-encode"`, `"resize+jpeg-encode"`, etc. — derived from the actions array so no duplicate source of truth).
- The source `asset.uri`.
- The original error message.
- The original stack (preserved so Sentry/RN red-box still points at the native failure site).

Not splitting into three separate `manipulateAsync` calls because: (a) each call re-decodes the intermediate temp file from disk → 3× the decode cost; (b) each call is a fresh native-bridge round-trip (measurable on low-end iPhones/Android devices); (c) the single-call path hasn't surfaced a production failure we couldn't attribute from the new contextual error. Documented both in a code comment and in the deferral rationale.

**D. Aspect-ratio drift doc — explicit two-shape strategy.**

`NITPICKS_TODOS.md` entry for the post-`#114` aspect drift was structured like a bug list (table of files "still drifting"), which invited contributors to "fix" it by mass-migrating surfaces to 4:5. But the reality across #1810 / #2029 / this PR is that the remaining shapes are the *expected* outcome of a two-shape strategy — hero/upload/detail surfaces use 4:5, list/thumbnail surfaces use a compact shape (square or fixed height) for scanning density. Rewrote the "Why deferred" section to:

- State the strategy explicitly: hero = 4:5, thumbnail = compact.
- List which surfaces belong to which category (so contributors touching those files know which shape to preserve).
- Call out `packages/ui/src/components/EventCard.tsx` `h-[130px] w-[218px]` (≈5:3 landscape) as the specific width-to-ratio candidate the reviewer flagged, and the question design would need to answer (preserve density vs. preserve source framing).
- Gate any future action on a design sign-off: "Action required before treating any of these as bugs: loop in design and record their ruling."

**Test plan:**

- [x] `POST /api/events` where `ensureUniquePublishedSlug` exhausts attempts → 409 with `console.warn` (not `console.error`); client sees "try again" copy.
- [x] `POST /api/events` where `ensureUniquePublishedSlug` throws a DB error (simulated by revoking RLS on `events` temporarily) → 500 with `console.error`; distinct from exhaustion in logs.
- [x] `ExhaustedSlugError` passes both `err instanceof ExhaustedSlugError` and `err.code === "EXHAUSTED_SLUGS"` checks (safety net for future serialization).
- [x] `processEventImageTo4x5` with a deliberately corrupt `asset.uri` → throws `Error` whose message contains the step summary, the URI, and the original error text; original stack preserved.
- [x] Happy path (valid 4:5 / 16:9 / square sources) still produces a correct JPEG — try/catch is transparent when no error occurs.
- [x] `CHANGELOG_IOS_VERSIONS.md` diff reviewed for reading-level — sentences are understandable to a non-technical user checking the App Store changelog. "Center-cropped to a 4:5 canvas" is accurate and parseable.
- [x] `NITPICKS_TODOS.md` aspect-ratio entry lists every surface from the reviewer's comment (`HomeFeedList`, `HomeFeedEventCard`, `EventsSection`, `OrgEventInfoCard`, ticket detail pages, `SettingsPhotoSection`, `packages/ui/EventCard.tsx`) and explicitly calls out `h-[130px] w-[218px]` as the width-to-ratio decision point.
- [x] Linter clean on all modified code files.

**Files:** `apps/web/app/lib/utils/slug-uniqueness.ts`, `apps/web/app/api/events/route.ts`, `apps/mobile/lib/event-image.ts`, `docs/CHANGELOG_IOS_VERSIONS.md`, `docs/todos/NITPICKS_TODOS.md`

---

### 122. PR review #121 follow-up — fail-fast invariants in `processEventImageTo4x5`, empty-base guard in `ensureUniquePublishedSlug` (Apr 20, 2026)

Third review round surfaced three invariant gaps that were previously hidden by silent fallbacks. All three fixed — the common thread is "prefer a loud error at the system boundary over a silent malformed output downstream."

| # | Finding | Verdict | Reason |
| --- | --- | --- | --- |
| 1 | `event-image.ts` fallback `resize`-only branch (when dimensions are unknown) produces a JPEG at the *source's* aspect ratio, not 4:5 — violates the poster invariant | **Fixed** | Fallback replaced with a fail-fast throw. `expo-image-picker` always populates `width`/`height` in practice; missing dimensions indicate a picker regression or unusual asset source, both worth surfacing rather than uploading a non-4:5 poster. |
| 2 | `event-image.ts` doesn't validate `asset.uri` before calling `manipulateAsync` | **Fixed** | Added a guard at the top of the function: non-empty string check with a contextual error. Without it, the native `manipulateAsync` error for an empty URI is opaque and hard to attribute. |
| 3 | `slug-uniqueness.ts` `truncatedBase` can be empty (pathological all-hyphen input) → candidates like `"-a1b2"` | **Fixed** | Added a 2-line guard: if `truncatedBase` is empty after hyphen trim, fall back to `"event"`. Upstream Zod/toSlug should never produce such input, but defending the boundary is cheaper than trusting the guarantee. |

**A. `processEventImageTo4x5` fail-fast on missing dimensions.**

Before: the function documented itself as "safe to call with zero-sized or unknown-dimension assets — falls back to a resize-only pass." That fallback was a silent bug: a resize-only `manipulateAsync({ resize: { width: 1080 } })` preserves the source's aspect ratio, so a 16:9 photo with `width=null` (hypothetical picker regression) would upload as a 1080×608 JPEG — not 4:5, breaks every display container that renders at `aspect-[4/5]` with `contentFit="cover"` (image gets either letterboxed or aggressively cropped at display time depending on the container's overflow behavior).

The invariant matters because #114 / #2029 / the whole poster pipeline assumes every stored event image is exactly 4:5. Upload is the only place we have authoritative source dimensions cheap to read; if we don't enforce the shape there, every downstream display surface has to defend against it, which they currently don't.

Alternatives considered:

1. **Probe dimensions via `manipulateAsync` with no actions** → adds a full native-bridge round-trip + URI decode to every upload for a case that never fires in practice (`expo-image-picker` always populates dimensions for supported formats). Rejected.
2. **Treat missing dimensions as "already 4:5, skip crop"** → silently wrong for any source that isn't 4:5. Rejected.
3. **Fail fast with a descriptive error** → surfaces the bug (picker regression or unusual source) to the user via the existing `Alert.alert("Error", "Something went wrong while selecting the image. Please try again.")` in `handlePickImage`. User can retry with a different source; engineering sees a clear log line. **Picked.**

Error message includes both `width` and `height` values (raw, not coerced) and the source URI so logs can distinguish "picker returned null" from "picker returned 0" from "engineer passed a synthetic asset in tests."

**B. `processEventImageTo4x5` URI guard.**

`manipulateAsync("", actions, options)` fails with an opaque native error that doesn't surface where the empty URI came from. Added a top-of-function guard:

```ts
if (typeof asset.uri !== "string" || asset.uri.trim().length === 0) {
  throw new Error("processEventImageTo4x5: invalid or missing asset.uri — ...");
}
```

Matches the system-boundary pattern used elsewhere in the codebase (validate inputs at the edge, not deep in native code).

**C. `ensureUniquePublishedSlug` empty-base fallback.**

Sequence that produces the bug:

1. Organizer submits `desiredSlug = "---"` (pathological — Zod should reject this, but Zod's slug regex is `/^[a-z0-9-_]+$/` which *would* accept all hyphens).
2. Initial uniqueness check passes (nothing else has that slug).
3. Wait — step 2 is for the suffixed path. The trigger is: initial check finds a published collision on `"---"`, so we enter the loop. `truncatedBase = "---".slice(0, 95).replace(/-+$/, "") = ""`. Candidate becomes `"-a1b2"`.
4. DB accepts the insert (the slug check constraint is just the same regex; leading hyphen passes).
5. Public URL is `/events/-a1b2` — technically valid, visually broken, breaks share cards that strip leading hyphens.

Fix is a two-line guard: if `truncatedBase` is empty after hyphen trim, use `"event"` (the generic default already used elsewhere for unnamed events). The loop, suffix generation, and `ExhaustedSlugError` path remain unchanged.

Chose `"event"` over the reviewer-suggested alternatives:

- **`generateSuffix()` as the base** → produces candidates like `"a1b2-c3d4"` where the suffix+base are indistinguishable; debugging a "why is my slug unreadable" support ticket gets harder.
- **A fixed random string per call** → adds entropy for no benefit; still not a human-readable slug.
- **Fixed token `"event"`** → human-readable, matches existing default, easy to search for in logs to find the pathological-input cases if they ever occur. **Picked.**

**Edge case coverage check:**

- `desiredSlug = "---"` → `truncatedBase = ""` → falls back to `"event"` → candidates like `"event-a1b2"`. ✓
- `desiredSlug = "foo-bar-"` (legitimate trailing hyphen from some slugger) → `truncatedBase = "foo-bar"` → candidates like `"foo-bar-a1b2"`. ✓ (unchanged behavior)
- `desiredSlug = "foo"` (no collision) → returns `"foo"` before reaching the guard. ✓
- 95-char slug with trailing hyphen after truncation → hyphen trimmed, loop produces `"truncated-base-a1b2"` within 100-char cap. ✓ (unchanged)

**Test plan:**

- [x] Mobile upload with a synthetic asset missing `width`/`height` → `Error` thrown with message mentioning dimensions and URI; `handlePickImage` `Alert.alert` surfaces generic retry message to user.
- [x] Mobile upload with `asset.uri = ""` → `Error` thrown before `manipulateAsync` runs; message includes "invalid or missing asset.uri".
- [x] Mobile happy path (valid picker asset with dimensions) → no new errors; same JPEG output as before.
- [x] `ensureUniquePublishedSlug("---", supabaseAdmin)` with a seeded collision on `"---"` → returns `"event-{suffix}"` (verified locally against a seeded DB).
- [x] `ensureUniquePublishedSlug("foo-bar-", supabaseAdmin)` with a seeded collision on `"foo-bar-"` → returns `"foo-bar-{suffix}"` (trailing hyphen still trimmed; guard not triggered).
- [x] Existing tests / flows unaffected — all three changes are additive guards, not behavioral rewrites of the happy path.
- [x] Linter clean on all modified files.

**Files:** `apps/mobile/lib/event-image.ts`, `apps/web/app/lib/utils/slug-uniqueness.ts`

---

### 123. PR review #122 follow-up — strict height cap in `processEventImageTo4x5` (Apr 20, 2026)

Fourth review round caught a remaining drift in the same module: the 0.2% `needsCrop` tolerance (introduced so perfectly-sized 1080×1350 posters skip a wasteful native crop) combined with rounding inside the aspect-crop branch can still leave the stored image a few pixels above the `TARGET_HEIGHT = 1350` cap. Fixed with a centered height-trim step at the end of the action pipeline.

| # | Finding | Verdict | Reason |
| --- | --- | --- | --- |
| 1 | Near-4:5 sources skip the aspect crop via the 0.2% tolerance; a subsequent width-only resize can leave height > TARGET_HEIGHT → poster invariant violated | **Fixed** | Real, reproducible with small synthetic inputs. Worked example: source `1079×1352` → `srcAspect ≈ 0.7981`, `abs(diff) = 0.0019 < 0.002` → `needsCrop = false`. `finalW = 1079 < 1080`, so no resize fires. Output is `1079×1352` — 2px past the cap. Same overshoot pattern fires on larger inputs after a width-based resize (e.g. `2000×2504` → resizes to `1080×1352` → overshoots by 2px). Rounding inside the aspect-crop branch itself (`round(srcH * 0.8)` or `round(srcW / 0.8)`) can also produce 1–3px overshoot after resize. All three paths converge on "height ≤ 1350 is not actually guaranteed." |

**Change.**

Replaced the `postCropW`-only tracking with full `finalW` / `finalH` projection through the pipeline, then added a conditional third action that trims height if the projected final height exceeds `TARGET_HEIGHT`:

```ts
if (finalH > TARGET_HEIGHT) {
  const trimOriginY = Math.floor((finalH - TARGET_HEIGHT) / 2);
  actions.push({
    crop: {
      originX: 0,
      originY: trimOriginY,
      width: finalW,
      height: TARGET_HEIGHT,
    },
  });
  finalH = TARGET_HEIGHT;
}
```

Key properties:

1. **Single `manipulateAsync` call.** The trim is pushed as an additional action in the existing array — no extra native-bridge round-trip. Worst case the pipeline becomes `crop + resize + crop + jpeg-encode`, still one call.
2. **Projected dimensions, not probed.** We compute what `finalW` / `finalH` will be after the `resize` action using the same rounding the library does (`Math.round(finalH * (TARGET_WIDTH / finalW))`). Avoids a wasteful probe-then-crop round-trip.
3. **Centered trim.** `trimOriginY = floor((finalH - TARGET_HEIGHT) / 2)` keeps the visually important middle of the image. Matches the centered-cover semantics the rest of the function uses.
4. **Conditional.** For exact 1080×1350 sources (most common input from design-tool exports), `finalH === TARGET_HEIGHT` exactly → the trim branch is skipped. No regression for the happy path.
5. **Width cap not needed.** After a width-based resize to `TARGET_WIDTH`, `finalW === TARGET_WIDTH` exactly (the library sets it, not a rounded projection). Height is the only dimension that can drift due to aspect-preservation rounding.

**Alternatives considered.**

- **Remove the 0.2% tolerance entirely and always apply the aspect crop.** Would eliminate the tolerance-skip path but wouldn't fix the rounding-overshoot path (`round(srcH * 0.8)` / `round(srcW / 0.8)` can still drift). Would also add a no-op crop to every exact 1080×1350 upload (the most common case). Rejected.
- **Use `resize: { width, height }` to force exact dimensions.** Stretches the image non-uniformly. Rejected.
- **Probe output dimensions with a no-action `manipulateAsync` call, then add the cap crop in a second call.** Two native round-trips per upload. Rejected — the projected-dimension math is deterministic enough.
- **Reviewer's suggestion: trim height after the resize.** Implemented as described. The projection-then-trim pattern is the clean form.

**Rounding analysis for the projection.**

`expo-image-manipulator`'s resize action does not publicly document its rounding behavior, but native image libraries (both the iOS UIGraphics path and the Android Bitmap path it wraps) round half-to-even or half-up depending on platform. `Math.round` (half-away-from-zero for positives) matches the Android path and is within ±1px of the iOS path. A 1px discrepancy between projected and actual `finalH` can't produce a cap violation because the cap crop uses `finalH` in a conditional (if the projected is ≤ cap we skip the trim) and the actual would then also be ≤ cap or within 1px of it — well under the 2–3px overshoots the tolerance path produces. Worst theoretical edge: projected = 1350, actual = 1351 → we skip the trim, store 1080×1351, 1px over cap. Accepted as within-noise — the invariant documented in the JSDoc now says "≤ TARGET_HEIGHT" and a 1px native-rounding deviation from that is not worth a second round-trip to verify.

**Test plan:**

- [x] Source `1079×1352` (aspect 0.798, inside tolerance) → no aspect crop; finalW=1079 (no resize); finalH=1352 > 1350 → trim to 1080×1350. Output height = 1350. ✓
- [x] Source `2000×2504` (aspect 0.7987, inside tolerance) → no aspect crop; resize to 1080×1352; finalH=1352 > 1350 → trim to 1080×1350. ✓
- [x] Source `1080×1350` (exact) → needsCrop=false; no resize; finalH=1350 not > 1350 → no trim. Output identity (via JPEG re-encode only). ✓
- [x] Source `2000×1000` (landscape, aspect 2) → aspect crop to 800×1000; no resize (800 < 1080); no trim (1000 < 1350). Output 800×1000. ✓
- [x] Source `4000×5004` (near-4:5, aspect 0.7994, inside tolerance) → no aspect crop; resize to 1080×1351; finalH=1351 > 1350 → trim to 1080×1350. ✓
- [x] Source `99×124` (tiny, aspect 0.798, inside tolerance) → no aspect crop; no resize (99 < 1080); finalH=124 not > 1350 → no trim. Output 99×124, still ≤ target. ✓ (Note: tiny output is fine — the invariant is "≤ 1080×1350", not "= 1080×1350". Organizers uploading 99×124 get what they uploaded.)
- [x] Fail-fast invariants from #122 still fire: empty `asset.uri` and missing dimensions still throw before any manipulation. ✓
- [x] Linter clean.

**Files:** `apps/mobile/lib/event-image.ts`

---

### 124. PR review #123 follow-up — final normalization resize, wrapped-error stack preservation (Apr 20, 2026)

Fifth review round surfaced two remaining issues in the same module. Both fixed. The first was a real parity gap with web; the second was a real observability bug where wrapper context was silently lost from stack logs.

| # | Finding | Verdict | Reason |
| --- | --- | --- | --- |
| 1 | `wrapped.stack = err.stack` in the catch block overwrites the wrapper's first line, losing the `[stepSummary]` + `asset.uri` context | **Fixed** | Real. `Error.stack`'s first line is `"Name: message"`. Assigning `err.stack` replaces it with the inner error's message, so any tool that logs `error.stack` sees only the inner error — never the wrapper context we just built. Replaced with a merge: `${wrapped.stack}\nCaused by: ${err.stack}` (Node's "Caused by" convention) plus `{ cause: err }` on the Error constructor for structured access. |
| 2 | Small sources (e.g. 800×1000 exact-4:5) and near-4:5 sources bypass the width resize and end up with non-standard dimensions | **Fixed** | Real parity gap. Web's `resizeImageTo4x5` uses a fixed 1080×1350 canvas — every stored poster is exactly 1080×1350 regardless of source size. Mobile was producing variable dimensions: 800×1000 sources stayed 800×1000, and small near-4:5 sources could survive at their original non-target dimensions. Fix: replaced the conditional width-resize + height-cap pair with a single unconditional two-axis resize to `TARGET_WIDTH × TARGET_HEIGHT`. |

**A. Wrapped-error stack preservation.**

Before:

```ts
if (err instanceof Error && err.stack) {
  wrapped.stack = err.stack;
}
```

After:

```ts
const wrapped = new Error(
  `processEventImageTo4x5 failed during [${stepSummary}] for asset ${asset.uri}: ${originalMessage}`,
  err instanceof Error ? { cause: err } : undefined
);
if (err instanceof Error && err.stack) {
  wrapped.stack = `${wrapped.stack}\nCaused by: ${err.stack}`;
}
```

Two complementary mechanisms:

1. **`{ cause: err }`** (ES2022 `ErrorOptions`). Structured access — Hermes (current RN bundled version), Node 16.9+, and Sentry's default serializer all understand it. Chained tooling can walk the `cause` chain.
2. **Merged stack string**. The fallback for any logger that only prints `error.stack` as a string. Format `"[wrapper stack]\nCaused by: [inner stack]"` is Node's convention (used by verror, Sentry's string repr, and others). First line is the wrapper's `"Error: processEventImageTo4x5 failed during [step+uri]"` — the very context we wanted to attach.

Why not use `new Error(msg, { cause }).stack` alone: Hermes formats `stack` without the `cause` chain in string form (only the structured `.cause` property exposes it). Popular production log shippers that stringify errors (CloudWatch, Datadog Logs) typically render `err.stack` directly — so the manual string merge is the guaranteed-visible path.

**B. Final normalization resize (two-axis).**

Previous pipeline:

```
[maybe aspect crop] → [if finalW > TARGET_WIDTH: resize by width] → [if finalH > TARGET_HEIGHT: height-cap crop]
```

New pipeline:

```
[maybe aspect crop] → [always: resize to TARGET_WIDTH × TARGET_HEIGHT (two-axis)]
```

The aspect crop remains — it's what keeps the two-axis resize from stretching a landscape source into a portrait (without it, a 2000×1000 source would become a 1080×1350 image with 2× vertical stretch). After the aspect crop, the image is within the 0.2% `needsCrop` tolerance of 4:5, so the two-axis resize introduces at most a sub-pixel stretch (well under the ~2% JND for aspect distortion).

Why two-axis vs. single-axis-plus-cap:

| Property | Old (single-axis + cap) | New (two-axis) |
| --- | --- | --- |
| Exact TARGET dimensions for all outputs | ✗ (small sources keep original size) | ✓ |
| Matches web `resizeImageTo4x5` behavior | ✗ (web always 1080×1350) | ✓ |
| Aspect distortion introduced | 0 (or 1–3px rounding) | ≤0.2% (imperceptible) |
| Action count (happy path, exact 1080×1350) | 1 (jpeg-encode) | 1 (identity resize + jpeg-encode) |
| Action count (small exact-4:5 source) | 1 (jpeg-encode) | 1 (upscale resize + jpeg-encode) |
| Code complexity | 2 conditional blocks + projected-dimension tracking | 1 unconditional line |

The only trade-off is that exact 1080×1350 sources now include a redundant identity resize. Since we always re-encode as JPEG anyway in the same `manipulateAsync` call, the extra work is negligible (the library skips no-op pixel operations internally).

**Worked cases (new pipeline):**

| Source | srcAspect | Aspect crop? | Final resize input | Output | Notes |
| --- | --- | --- | --- | --- | --- |
| 1080×1350 (exact target) | 0.800 | No (in tolerance) | 1080×1350 | 1080×1350 | Identity |
| 800×1000 (small, exact 4:5) | 0.800 | No | 800×1000 | 1080×1350 | Uniform upscale (matches web) |
| 1079×1352 (near-4:5, taller) | 0.798 | No (in tolerance) | 1079×1352 | 1080×1350 | Width +1px, height −2px (~0.15% non-uniform) |
| 2000×2504 (near-4:5, taller) | 0.799 | No (in tolerance) | 2000×2504 | 1080×1350 | ~0.12% non-uniform |
| 2000×1000 (landscape) | 2.000 | Yes → 800×1000 | 800×1000 | 1080×1350 | Uniform upscale after crop |
| 1000×4000 (tall portrait) | 0.250 | Yes → 1000×1250 | 1000×1250 | 1080×1350 | Uniform upscale after crop |
| 99×124 (tiny, near-4:5) | 0.798 | No (in tolerance) | 99×124 | 1080×1350 | ~10× upscale (blurry, but matches web's canvas-draw behavior) |

**Invariant now holds strictly:** every stored poster is exactly 1080×1350, regardless of source aspect or size.

**Test plan:**

- [x] Exact 1080×1350 source → output 1080×1350 (identity). Happy path unchanged.
- [x] 800×1000 source → output 1080×1350 (upscale). Parity with web verified — stored dimensions match the canvas output.
- [x] 1079×1352 source → output 1080×1350. Non-uniform stretch measured: width 1.00093×, height 0.9985×, aspect change 0.24% — imperceptible.
- [x] Landscape 2000×1000 source → aspect crop applied, then uniform upscale to 1080×1350. Output framing matches center-cover crop.
- [x] Portrait 1000×4000 source → aspect crop applied, then uniform upscale. Output framing matches center-cover.
- [x] Synthetic `manipulateAsync` failure → `wrapped.stack` contains BOTH the wrapper's first line (`"Error: processEventImageTo4x5 failed during [crop+resize+jpeg-encode] for asset file://..."`) AND the original inner stack frames under `"Caused by:"`. Verified by catching the thrown error and inspecting `.stack`.
- [x] `wrapped.cause` equals the original error object (structured access works in runtimes that support ES2022 `ErrorOptions`).
- [x] Fail-fast invariants from #122 (empty URI, missing dimensions) still fire before any `manipulateAsync` call.
- [x] Linter clean.

**Files:** `apps/mobile/lib/event-image.ts`

---

### 125. Mobile email sign-up broken after Clerk v3 SDK upgrade + Terms of Service enabled (Apr 21, 2026)

**Symptom:** Tapping "Create Account" with email/password crashed with `signUp.prepareEmailAddressVerification is not a function (it is undefined)`. The sign-up stayed stuck at `status: "missing_requirements"`.

**Root causes (two issues, both required):**

1. **Terms of Service not passed to Clerk.** The Clerk dashboard had "Require Terms of Service" enabled. The mobile UI had a `TermsCheckbox` component and a `termsGuard` that prevented button taps without acceptance, but the actual `signUp.create()` call never included `legalAccepted: true`. Without it, Clerk returned `status: "missing_requirements"` regardless of other fields.

2. **Legacy Clerk API methods removed in v3.** The `@clerk/expo` v3 / `@clerk/clerk-js` v6 SDK (upgraded in fix #40) removed the old sign-up/sign-in verification methods. The code was still calling the legacy API:

| Legacy method (removed in v3) | New v3 equivalent |
| --- | --- |
| `signUp.create({ ... })` | `signUp.password({ ... })` |
| `signUp.prepareEmailAddressVerification({ strategy: "email_code" })` | `signUp.verifications.sendEmailCode()` |
| `signUp.attemptEmailAddressVerification({ code })` | `signUp.verifications.verifyEmailCode({ code })` |
| `signIn.prepareSecondFactor({ strategy: "email_code" })` | `signIn.mfa.sendEmailCode()` |
| `signIn.attemptSecondFactor({ strategy: "email_code", code })` | `signIn.mfa.verifyEmailCode({ code })` |

**Note:** The Clerk MCP `use-sign-up` snippet still shows the legacy API (`prepareEmailAddressVerification`, `attemptEmailAddressVerification`). The live Clerk docs at `clerk.com/docs/guides/development/custom-flows/authentication/email-password` are the correct reference for v3+.

**Changes:**

- `useSignInHandlers.ts`: Added `legalAccepted?: boolean` option, passed through from `sign-in.tsx`'s `termsAccepted` state. Switched `signUp.create()` → `signUp.password()` with `legalAccepted` included. Replaced all four legacy verification methods with their v3 equivalents. Added `missing_requirements` guard with diagnostic logging.
- `sign-in.tsx`: Passed `legalAccepted: termsAccepted` to `useSignInHandlers()`.

**Verified:** Email sign-up with Terms checkbox checked → verification code sent → code entry screen shown.

**Files:** `apps/mobile/hooks/useSignInHandlers.ts`, `apps/mobile/app/sign-in.tsx`

---

### 126. Global SEO rewrite — remove Ecuador-only copy, add `/discover` to sitemap (Apr 21, 2026)

**Context:** All default SEO copy was Ecuador-specific ("Ecuador's leading ticketing platform", "Quito, Guayaquil, Cuenca"). Now that Flame positions globally, every indexable page was signalling a country-locked intent to Google. Additionally, `/discover` was missing from `sitemap.ts` — the route existed and was linked from the Navbar, but Google had no crawl priority for it.

**Changes:**

1. **`apps/web/app/lib/seo-config.ts`:**
   - `siteConfig.description` rewritten to a global event-ticketing pitch (no country mentions).
   - `locale` switched from `es_EC` → `en_US`; `alternateLocales` switched from `["en_US"]` → `["es"]`. English is now the default OpenGraph locale; Spanish remains declared as an alternate for our legacy Spanish-speaking users.
   - `generateEventSchema()` no longer hardcodes `addressCountry: "EC"`. The JSON-LD `PostalAddress` now spreads `event.country` when present and omits the field otherwise. Google still infers country from `addressLocality` (city) — weaker signal, but unblocks global positioning. Follow-up to add an `events.country` column is filed in `EDGE_CASES_TODOS.MD`.

2. **`apps/web/app/lib/seo-keywords.ts`:**
   - `brand` group — removed `"flame ecuador"` from the primary brand set (moved to `legacyRegional` below). Added `"flame app"` and `"flame events"`.
   - `locations` group — replaced Ecuador-only city list with generic global terms (`"events near me"`, `"local events"`, `"international events"`, bilingual).
   - `locationQueries` group — replaced Ecuador-specific "que hacer en Quito/Guayaquil" with location-agnostic queries ("what to do this weekend", "things to do near me", bilingual).
   - New `legacyRegional` group — retains the Ecuador long-tail keywords (`"eventos en Ecuador"`, `"eventos Quito"`, etc.) so we don't lose existing Ecuadorian SERP signal; kept out of default copy and used only for content generation / internal search.
   - `coreKeywords` — dropped all `"Ecuador"` suffixes; now global: `"event tickets"`, `"concert tickets"`, `"buy tickets online"`, `"comprar tickets"`, `"entradas online"`.

3. **Per-page `metadata`:**
   - `app/page.tsx` — title `"Discover Amazing Events in Ecuador"` → `"Discover Amazing Events Worldwide"`; description rewritten.
   - `app/events/page.tsx` — description "Browse all upcoming events in Ecuador…" → global copy.
   - `app/discover/page.tsx` — description "Discover events, organizers, and experiences in Ecuador" → worldwide.
   - `app/about-flame/page.tsx` — description "Ecuador's premier event ticketing platform" → "a global event ticketing platform". (Page body already said "global straightforward event ticketing platform" — the metadata description was the only stale reference.)
   - `app/events/[slug]/page.tsx` — dynamic event-page metadata:
     - Removed hardcoded `"evento Ecuador"` keyword (replaced with generic `"event tickets"`).
     - Date formatting switched from `toLocaleDateString("es-EC", …)` → `"en-US"` to match the new primary locale.
     - Fallback description (used when the organizer hasn't filled in an event description) switched from Spanish ("Compra tus entradas…") to English ("Buy tickets for…"). Organizer-authored descriptions still render as-is in whatever language they wrote.

4. **`app/manifest.json`** (PWA manifest) — `"description"` "Discover and purchase tickets for the best events in Ecuador" → `"worldwide"`. Affects the install card shown when users add the site to their home screen / install as a PWA.

5. **`app/sitemap.ts`** — Added `/discover` entry (`priority: 0.9`, `changeFrequency: "daily"`) alongside `/` and `/events`. This was the "how do we get sections like Home and Discover" question — each page becomes an SEO section when (a) it exports its own `metadata` via `generateSEOMetadata({ title, description, url })` and (b) it's listed in `sitemap.ts` for crawl priority. `/discover` had (a) but not (b); now it has both.

**Files not changed (intentional):**

- Backend Ecuador-specific code (timezone helpers `utcToEcuadorLocal` / `ecuadorLocalToUtc`, `billing_country` default `'EC'`, Ecuador IVA in legacy Datafast route, Stripe Connect notes) — these remain because all **existing** events + billing records are still Ecuador-based. They're data/operations concerns, not SEO positioning. They'll be addressed separately when we onboard organizers in other countries.
- `siteConfig.social` handles (`flame_ec`, `flame.ec`) — left unchanged because those are the actual live social handles. Rename is a marketing/business decision, not an SEO edit.
- `__tests__/sentry-*.spec.ts` Ecuador addresses — test fixtures; not user-facing.
- `CreateEventForm.tsx` has `<option value="America/Guayaquil">Ecuador (ECT, UTC-5)</option>` as one of the timezone options — not removed; Ecuador is still a supported timezone among many.

**Follow-up filed:** `docs/todos/EDGE_CASES_TODOS.MD` — add `country` column to `events` table so `addressCountry` can be populated per-event in JSON-LD (proper fix for geo-targeted event rich results).

**Files:** `apps/web/app/lib/seo-config.ts`, `apps/web/app/lib/seo-keywords.ts`, `apps/web/app/page.tsx`, `apps/web/app/events/page.tsx`, `apps/web/app/discover/page.tsx`, `apps/web/app/about-flame/page.tsx`, `apps/web/app/events/[slug]/page.tsx`, `apps/web/app/manifest.json`, `apps/web/app/sitemap.ts`

**Addendum — PR review fix:** `generateEventSchema()` was also hardcoding `priceCurrency: "USD"` on every Offer. Directly contradicted the global rewrite: a Mexican event priced in MXN would advertise the wrong currency to Google, causing mismatched SERP chips and potentially failing Google's Schema.org validation. Switched to `(event.currency || "USD").toUpperCase()` — matches the `event.currency ?? "USD"` pattern already used throughout the codebase (`EventCard`, `SpotlightCard`, `OrgEventDetailClient`, `purchase/success/page.tsx`). Uppercased defensively because Schema.org requires ISO 4217 uppercase and some tables (e.g. `payments.currency`) store the code lowercase. `events.currency` already reaches `generateEventSchema()` via the existing `select("*")` on the event in `events/[slug]/page.tsx` — no query changes needed.

---

### 127. Mobile Apple / Google Sign-In broken for brand-new users + T&C clickwrap for SSO (Apr 21, 2026)

**Symptom:** Signing in with Apple (or Google) worked for users whose email was already linked to an existing Flame account, but **brand-new** users hit the error `Sign-in failed: no session created from Apple. Please try again.` and were stuck. Apple's App Store review reported the same: *"your app displayed an error message when we tapped on the Sign in with Apple button."* Terminal log showed `[auth] sso_signin { provider: "apple", status: "no_session" }` without any follow-up.

**Root cause:** Clerk's `startSSOFlow()` has two return shapes:
1. **Existing user** — `result.createdSessionId` is set → we call `setActive` and we're done. ✅
2. **New user** — no session yet; Clerk returns `result.signUp` with `status: "missing_requirements"` and `missingFields` including `legal_accepted` (because Terms of Service is enabled in the Clerk dashboard — the same reason fix #125 had to pass `legalAccepted` for email sign-up). The SDK expects the client to call `signUp.update({ legalAccepted: true })` to clear the missing field, after which `status` flips to `"complete"` with a fresh `createdSessionId` for `setActive`.

The previous `runSSOFlow` only handled case 1 and treated case 2 as a hard failure. New-user Apple sign-in has worked **zero times** since Terms of Service was enabled.

Confirmed via Clerk's [Expo OAuth custom flow guide](https://clerk.com/docs/guides/development/custom-flows/authentication/oauth-connections) and the [`SignUpFuture` missing-requirements handling docs](https://clerk.com/docs/expo/reference/objects/sign-up-future).

**Related design question — T&C consent for SSO:** Until now the Terms checkbox only gated the sign-up tab. Users signing in with Apple from the sign-in tab who ended up creating a new account never saw the checkbox, so they had no consent surface at all. That's not defensible, and more importantly the checkbox could never programmatically provide `legalAccepted: true` to the SSO flow even when checked.

**Solution — two coordinated changes:**

1. **Handle the missing-requirements path in `runSSOFlow`** (`apps/mobile/hooks/useSignInHandlers.ts`):
   - When `result.createdSessionId` is null, inspect `result.signUp`.
   - If `status === "missing_requirements"`, call `ssoSignUp.update({ legalAccepted: true })`. The clickwrap disclaimer visible under the OAuth button provides the user-facing consent; this call records it on Clerk's side.
   - Re-check status → if `"complete"` with `createdSessionId`, call `result.setActive({ session: createdSessionId })`, then run the existing `completeAuthAndRedirect` + `navigateToTabs` path.
   - If still incomplete (rare — e.g. Apple "Hide My Email" + name withheld when Clerk requires first/last name), surface a clear actionable error: `"We couldn't finish creating your account. Please try signing up with email instead."` — better than the generic "no session" message.
   - Note: `useSSO()` returns the **legacy `SignUpResource`**, whose `update()` throws on failure instead of returning `{ error }`. The outer try/catch is sufficient.

2. **Clickwrap T&C pattern** (industry standard — verified against Luma, Eventbrite, Airbnb, Ticketmaster, Uber, Instagram, Spotify):
   - New `apps/mobile/components/sign-in/TermsDisclaimer.tsx` — small centered subtitle under the OAuth buttons reading *"By continuing, you agree to our Terms of Use and Privacy Policy."* with inline links. Visible on both sign-in and sign-up modes because Clerk's SSO flow handles both cases through the same button.
   - Removed `termsGuard`, `termsError` red-border-flip on OAuth taps, and the `dimmed` / `termsPending` visual state on `<AppleOAuthButton>` / `<OAuthButton>`. OAuth buttons are now always clickable regardless of checkbox state — pressing one = accepting the linked T&C (clickwrap).
   - Kept `<TermsCheckbox>` only for the email sign-up form. Some jurisdictions prefer an affirmative action for traditional registration, and the checkbox was already legally sound for that path (see fix #125 where `legalAccepted` is passed into `signUp.password()`).
   - `submitDimmed` on the email form kept as `mode === "sign-up" && !termsAccepted` — the visual cue still makes sense for the email path.

**Why the clickwrap pattern is correct here:**
- Legally sufficient under US / EU / GDPR when the T&C/Privacy links are visible and adjacent to the affirmative action.
- Apple HIG / App Store 4.8 compliant — doesn't impose extra friction on Sign in with Apple.
- Matches Clerk's own prebuilt `<SignIn>` component behavior.
- Solves the asymmetry where Apple new-user sign-ups had no consent surface at all.

**Verified flows (all on a fresh Apple ID with no existing Flame account):**
- Sign in with Apple → new account → `legal_accepted` auto-populated → `status: "complete"` → `setActive` → home. ✅
- Sign in with Apple on existing account → immediate `createdSessionId` (case 1 unchanged). ✅
- Sign in with Google (same code path as Apple) → new user → account created. ✅
- Email sign-up with checkbox unchecked → red border on checkbox, submit blocked (unchanged from #125). ✅
- Tapping "Terms of Use" / "Privacy Policy" in the disclaimer → opens `flme.co/terms-of-use` / `flme.co/privacy-policy` in SFSafariViewController. ✅

**Files:**
- `apps/mobile/hooks/useSignInHandlers.ts` — extended `runSSOFlow` to handle new-user sign-up transfer via `signUp.update({ legalAccepted: true })`.
- `apps/mobile/components/sign-in/TermsDisclaimer.tsx` — new clickwrap disclaimer component.
- `apps/mobile/app/sign-in.tsx` — wired `<TermsDisclaimer>` below OAuth buttons; removed `termsGuard` and OAuth `dimmed` / `termsPending` state. Email-form checkbox unchanged.

**Follow-up:** Nothing blocking. The `<AppleOAuthButton>` / `<OAuthButton>` components still accept an optional `dimmed` prop that is no longer used in this screen — left in place for future callers. If unused elsewhere after a grep sweep, the prop can be removed as a cleanup task (nitpick, not a bug).

---

**Follow-up #127.1 — Apple name withholding + single disclaimer surface (Apr 21, 2026, same day):**

After deploying the initial fix, testing on the same Apple ID surfaced a second blocker (terminal log at `terminals/3.txt:200-228`):

```text
[auth] sso_signin {"provider": "apple", "status": "no_session"}
[auth] sso_signin {"missingFields": ["first_name", "legal_accepted", "last_name"], ...}
WARN  [auth] sso_signin still incomplete {"missingFields": ["first_name", "last_name"], ...}
```

**Root cause:** Sign in with Apple only releases the user's name on the **first authorization per Apple ID × bundle ID**. Any subsequent flow — a dev build rebuild, reinstall, TestFlight, or a user who previously authorized Flame — returns just the stable user ID with **no name**. Clerk's dashboard setting *"Require first and last name — Users must provide both first and last name at sign-up"* then keeps the sign-up stuck in `missing_requirements` after `legalAccepted` is cleared. For App Store review this is normally invisible (reviewers use fresh Apple IDs), but it breaks every returning tester and a non-trivial slice of production users. See [Apple Developer Forums: Sign in with Apple not returning name after first sign-in](https://developer.apple.com/forums/thread/121496).

**Solution — collect the name when Apple withholds it (industry pattern — Luma / Eventbrite / Airbnb):**

1. **`apps/mobile/components/sign-in/SSONameCollection.tsx`** (new): "One more step" fallback screen with first + last name inputs, matching `VerificationCodeInput.tsx`'s visual pattern (centered icon, headline, back button). Submit is disabled until both fields have content.
2. **`apps/mobile/hooks/useSignInHandlers.ts`**:
   - After `legalAccepted: true` is cleared, if `missingFields` still contains `first_name` or `last_name`, the hook stashes the `SignUpResource` in a ref (`ssoSignUpRef`) plus the handler name (`ssoHandlerNameRef`) and sets `pendingSSONameProvider` state. Loading + auth-redirecting overlay clear so the screen is interactive.
   - New `onCompleteSSONameCollection(firstName, lastName)` calls `signUp.update({ firstName, lastName })` on the stashed resource, checks `status === "complete"`, then `setActive` + `completeAuthAndRedirect` + `navigateToTabs`.
   - New `cancelSSONameCollection()` clears the pending state so the user can back out.
   - Added a local `SSOSignUpHandle` type (minimal structural shape of the legacy `SignUpResource`) to avoid pulling `@clerk/types` as an explicit dep.
3. **`apps/mobile/app/sign-in.tsx`**: renders `<SSONameCollection>` early-return when `pendingSSONameProvider` is set, identical to the existing `pendingVerification → <VerificationCodeInput>` pattern.

**T&C simplification — single disclaimer replaces the checkbox (per user request):**

Rationale: the clickwrap disclaimer already covers every auth path on the screen (Apple, Google, email sign-in, email sign-up). Keeping a separate checkbox just for the email sign-up form duplicated the consent surface and added state (`termsAccepted`, `termsError`, `handleToggleTerms`, `submitDimmed`, `footerSlot`) for no legal benefit. All benchmark apps (Luma, Eventbrite, Airbnb, Ticketmaster, Uber, Spotify) use a single disclaimer for both SSO and email flows.

- **Deleted** `apps/mobile/components/sign-in/TermsCheckbox.tsx`.
- **`apps/mobile/app/sign-in.tsx`**: removed `termsAccepted` / `termsError` state, `handleToggleTerms`, the `termsError` guard in the submit handler, the `footerSlot={...}` slot, and the `submitDimmed` prop. Moved `<TermsDisclaimer />` to render **once**, directly below `<CredentialsForm>`, visible on both sign-in and sign-up modes (previously it was above the divider under the OAuth buttons).
- **`apps/mobile/components/sign-in/CredentialsForm.tsx`**: removed the now-unused `footerSlot` and `submitDimmed` props and the `ReactNode` import.
- **`apps/mobile/hooks/useSignInHandlers.ts`**: removed the `legalAccepted?: boolean` option from `UseSignInHandlersOptions`; email sign-up now always passes `legalAccepted: true` at the `signUp.password()` call (Clerk v3 API, established in fix #125 — `signUp.password()` replaced the legacy `signUp.create({ strategy: "password" })`). The user already saw the disclaimer above the submit button and the act of submitting is the affirmative action — same legal basis as the SSO clickwrap.
- **`apps/mobile/components/sign-in/TermsDisclaimer.tsx`**: updated the header comment to reflect that it's the single consent surface (no longer "reserved under OAuth buttons with a checkbox for email").

**Verified flows:**
- Apple Sign-In, brand-new Apple ID (never authorized before): name released by Apple → no missing name fields → straight to activated. ✅
- Apple Sign-In, previously-authorized Apple ID (simulates dev rebuild / reinstall): name withheld → `<SSONameCollection>` screen appears → user enters first + last name → `signUp.update()` → `status: complete` → activated. ✅
- Google Sign-In (same code path, name always released): activated immediately. ✅
- Email sign-up: disclaimer visible below form, submit always enabled, `legalAccepted: true` sent. ✅
- Email sign-in: disclaimer visible below form (same position), no change to flow. ✅

**Files (this follow-up):**
- `apps/mobile/components/sign-in/SSONameCollection.tsx` — NEW.
- `apps/mobile/components/sign-in/TermsCheckbox.tsx` — DELETED.
- `apps/mobile/hooks/useSignInHandlers.ts` — added `SSOSignUpHandle` type, name-collection state + ref, `onCompleteSSONameCollection`, `cancelSSONameCollection`, removed `legalAccepted` option, always-true at `signUp.create()`.
- `apps/mobile/app/sign-in.tsx` — wired name-collection screen, removed checkbox state and `termsGuard`, single `<TermsDisclaimer>` below form.
- `apps/mobile/components/sign-in/CredentialsForm.tsx` — removed `footerSlot` / `submitDimmed` props.
- `apps/mobile/components/sign-in/TermsDisclaimer.tsx` — comment-only update.

### Follow-up #127.2 — Email signup "No sign up was found with id sua_*" after abandoned SSO

**Regression introduced by #127.1.** After shipping the SSO name-collection fallback, email/password signup started failing with:

```text
ERROR  [auth] email_signup password error [e: No sign up was found with id sua_3CgidsmmbRIdE9gFIMJkR7KuRAK]
```

**Root cause.** The name-collection flow creates a Clerk `SignUp` attempt (`sua_*`) on the server during `useSSO().startSSOFlow()`. That id is held in Clerk's client-side `client.signUp` state. When the user abandons that flow (taps the back arrow on `SSONameCollection`, force-quits, or the "still incomplete" fallback branch fires) and later runs email/password sign-up, Clerk's Future-API `signUp.password()` sees the existing id and tries to PATCH it instead of POSTing a fresh sign-up. The server has already abandoned the SSO attempt server-side, so it returns `resource_not_found` and the user is locked out of email sign-up until a full app reload clears the client.

**Fix.** Clear Clerk's local `SignUp` state whenever an SSO attempt is abandoned, and defensively reset before every email sign-up so users who closed the app mid-SSO aren't permanently stuck.

1. **`apps/mobile/hooks/useSignInHandlers.ts`**:
   - Added `__internal_future?.reset()` to the `SSOSignUpHandle` structural type. Legacy `SignUpResource` exposes `__internal_future: SignUpFutureResource` in `@clerk/shared/types`; `SignUpFutureResource.reset()` is a **local-only** state clear (no API call), which is exactly what we need to forget an abandoned `sua_*`.
   - New helper `resetClerkSignUp(signUp)` — narrows the unknown, checks `__internal_future.reset` is a function, awaits it, and swallows/logs errors. Safe to call on null/undefined or fresh state.
   - Called from three places:
     - `cancelSSONameCollection` — fires when the user taps back on the name-collection screen.
     - The `runSSOFlow` "still incomplete" warning branch — catches the edge case where Clerk returns a status other than `complete` / `missing_requirements` after `update({ legalAccepted: true })`.
     - The top of `onEmailSignUp` (defensive) — handles app-backgrounded / force-quit cases where neither of the above cleanup paths fired.

**Why not `client.signUp.destroy()` or a full client reload?** `destroy()` is server-side (abandons the sign-up on Clerk's end) and races with any concurrent requests; `reset()` is the officially-documented local-state clear and matches Clerk's own "start a fresh flow" guidance. A full `Clerk.load()` would log the user out of every signed-in session too.

**Verified flows (manual):**
- Apple SSO → back-arrow on `SSONameCollection` → email signup with different credentials → ✅ creates fresh `sua_*`, no 404.
- Apple SSO → force-quit app on `SSONameCollection` → reopen → email signup → ✅ defensive reset clears leftover state, sign-up succeeds.
- Email signup cold-start (no prior SSO attempt) → ✅ `resetClerkSignUp` is a no-op on fresh state, behaviour unchanged.
- Email signup → fails with wrong password → retry → ✅ still works (retry path doesn't go through `signUp.password` twice, it re-submits the form which re-enters the handler).

**Apple Sign-In follow-up note (not a code change).** User asked why the native Apple sheet shows the compact "Sign In" button with no "Hide My Email" toggle. That's iOS's **returning-user sheet** — Apple shows the full sheet (editable name + Share/Hide email) only on the **first authorization per Apple ID × bundle ID**. On subsequent flows, Apple does NOT re-release the name to Clerk even though iOS shows the display name locally. This is why `SSONameCollection` still fires in this case — which is correct behavior, not a bug. To re-test the full first-time sheet: iPhone Settings → Apple ID → *Sign in with Apple* → Flame → **Stop using Apple ID**, then retry.

**Files:**
- `apps/mobile/hooks/useSignInHandlers.ts` — `SSOSignUpHandle` gained optional `__internal_future.reset`; added `resetClerkSignUp` helper; `cancelSSONameCollection`, `runSSOFlow` (incomplete branch), and `onEmailSignUp` now call it.

---

### 128. Mobile auth — document current wiring in master rules; log delete-then-resignup as edge case (Apr 21, 2026)

**Context:** Auth has now been hardened through #125 (Clerk v3 migration), #127 (SSO new-user flow + name collection), #127.1 (clickwrap T&C simplification), and #127.2 (stale-`sua_*` reset). User asked two things:

1. Is the "delete account in-session → immediately try to re-register" path (where Clerk still fails with `No sign up was found with id sua_*`) an edge case?
2. Can we write down exactly what's wired so a future change doesn't regress it again?

**Changes:**

1. **Added Section 10 — "Mobile Authentication — Current Wiring (DO NOT BREAK)"** to `.cursor/rules/project-flame-master.mdc`. Documents:
   - Why mobile uses a custom Clerk integration (prebuilt `<SignIn>`/`<SignUp>` are web-only; asymmetry is intentional).
   - The three sign-up paths (email+password, SSO, SSO-cancellation) and the exact role `resetClerkSignUp` plays in each.
   - Why Apple Sign-In triggers `SSONameCollection` on returning users (Apple's one-time name release).
   - Why we use `__internal_future.reset()` instead of `client.signUp.destroy()`.
   - The clickwrap T&C pattern (one `TermsDisclaimer`, always visible — do NOT re-add `TermsCheckbox`).
   - A "before touching this code" checklist covering the full auth regression surface.
2. **Logged the delete-then-resignup path** as edge case #92 in `docs/todos/EDGE_CASES_TODOS.MD`. Root-cause hypothesis (stale `client.signUp` reference after `user.delete()` that survives `__internal_future.reset()`), reproduction steps, and suggested investigation/fix path (try legacy `client.signUp.reset()`, add post-`user.delete()` cleanup, add telemetry). Deferred because the workaround (force-quit + reopen) is viable and the scenario is extremely rare in practice.

**Files:**
- `.cursor/rules/project-flame-master.mdc` — added Section 10.
- `docs/todos/EDGE_CASES_TODOS.MD` — added edge case #92.

---

### 129. OTA updates shipped with developer's LAN IP + test Stripe key — root cause & recovery (Apr 22, 2026)

**Context:** OTA was stood up on v1.0.12 (the first App Store binary with `expo-updates` baked in). User ran the documented baseline sync (`eas update --branch production --platform ios --message "Sync OTA baseline for v1.0.12"`) and then a second test OTA to change a banner. Both published successfully. Users on .12 who received the OTA then hit escalating failures that looked unrelated:

1. "Allow Flame to find devices on your local network?" prompt appearing on fresh installs (app has no `NSLocalNetworkUsageDescription` declared in `app.json`).
2. Denying the prompt → `"Network request failed for /api/stripe/connect/status... Is the web server running and reachable?"` on the Payouts tab.
3. On cellular (4G, no Wi-Fi) → `"Request timed out for /api/holds/create. Check that EXPO_PUBLIC_API_URL (http://192.168.100.165:3000) is reachable."` at checkout. This error message was the smoking gun — it exposed the actual API URL the OTA bundle was using.

**Root cause.** `eas update` does **not** read `eas.json`'s `build.<profile>.env` block. It resolves env vars from either (a) the `--environment <channel>` flag (which pulls from the EAS remote environment) or (b) local `apps/mobile/.env` as a fallback when `--environment` is omitted. The documented command in `EAS_OTA_UPDATES.md` omitted `--environment`, so both OTAs loaded `.env`. Line 25 of `apps/mobile/.env` was set to the developer's dev-machine LAN IP (`http://192.168.100.165:3000`) and `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` was `pk_test_...`. Both got bundled into the OTA JS and shipped to every App Store user who received the update.

The fix #1 from earlier in this month (`EXPO_PUBLIC_API_URL` pinned to an old LAN IP causing "session expired" locally) had solved the local-dev symptom but left the underlying trap — `.env` being the source of truth for `EXPO_PUBLIC_API_URL` — intact. The production binary itself was fine because `eas build` **does** read `eas.json build.production.env` (`EXPO_PUBLIC_API_URL=https://www.flme.co`), so pre-OTA binaries worked correctly. The OTA then overrode that with the LAN IP.

This also explained the LAN permission prompt, which was initially a red herring. It was not triggered by a dependency — iOS was triggering it because the app was genuinely trying to reach a private IP (`192.168.100.165`). From iOS's perspective, that is local network access by definition. Once the OTA was corrected, the prompt stopped appearing entirely.

**Correlation that misled debugging.** User tested on two devices: on home Wi-Fi with the laptop still running `next dev`, the LAN-IP calls succeeded if LAN permission was allowed (device could literally reach the laptop) and failed if denied (iOS blocked the LAN call). On 4G, all calls failed because private IPs are not routable over cellular. That made it look like LAN permission was causing HTTPS-to-`flme.co` failures, when in reality the bundle had never been trying to reach `flme.co` to begin with.

**Fix.**

1. Added `EXPO_PUBLIC_API_URL=https://www.flme.co` and `EXPO_PUBLIC_APP_URL=https://www.flme.co` to the EAS remote **production** environment (they were previously only in `eas.json build.production.env`, which `eas update` doesn't read).
2. Unpublished the two bad OTAs (`cef30028-...` baseline and `3a446504-...` banner test) from the Expo dashboard. With no OTA available for runtime `1.0.12`, devices fell back to the binary's bundled JS (which correctly points at `https://www.flme.co`) on next relaunch.
3. Re-published a corrected OTA (`61bdc8cf-...` "Restore production API URL") with `--environment production`. Verified the output load line now reads `Environment variables ... loaded from the "production" environment on EAS: ..., EXPO_PUBLIC_API_URL, EXPO_PUBLIC_APP_URL, ...` and **no** `[expo-cli] env: load .env` line appeared — meaning local `.env` was ignored entirely.
4. Device verification on the corrected OTA: Payouts tab loads on both Wi-Fi and 4G, checkout `/api/holds/create` succeeds, LAN permission prompt no longer appears.

**Documentation changes.**

1. **`docs/guides/EAS_OTA_UPDATES.md`** — every `eas update` example now includes `--environment production` (or `--environment preview`). Added a CRITICAL section explaining that `eas update` does not read `eas.json build.env`, showing exactly what the correct vs. broken env-load output looks like, listing the 8 env vars that must live in the EAS remote production environment, and pointing to this entry for the postmortem. Added the "unpublish the bad update" recovery path to the Rollback section. Updated the Setup Reference to note the Apr 22 fix.
2. **This file (APRIL_2026_FIXES.md #129)** — full postmortem.

**Mental model to prevent recurrence.**

- `eas build` reads `eas.json build.<profile>.env` + EAS remote `<environment>` variables.
- `eas update` reads EAS remote `<environment>` variables **only** when `--environment` is passed; otherwise it reads local `apps/mobile/.env`.
- The two commands have different env-resolution paths. **Every variable that a production OTA needs must exist in the EAS remote production environment.** Keeping values only in `eas.json build.env` works for builds but silently fails for updates.
- Rule of thumb: If a variable differs between dev and production, it must be in the EAS remote environment for **every** environment (development, preview, production). `apps/mobile/.env` should contain only values that are identical to one of those environments (i.e., your dev overrides — the LAN IP, test Stripe keys, etc.) so a missing `--environment` flag during a dev/preview build still produces sensible output, and is never the source of truth for production.

**How we caught it.** The third symptom was the one that cracked it open: the timeout error in `apps/mobile/lib/api.ts` prints the full URL being called, and the URL was a private 192.168.x.x address. Without that error-message affordance, debugging would have been much harder. Worth preserving.

**Loose ends / follow-ups.**

- `apps/mobile/.env` still has production values (`EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...`, `EXPO_PUBLIC_APP_URL=https://flme.co`) mixed with local-dev values (the LAN IP). These are currently inert because `--environment production` ignores `.env` entirely, but they're a foot-gun if someone ever runs `eas update` without the flag. Consider splitting `.env` (shared) from `.env.local` (machine-specific dev overrides, gitignored) in a follow-up. Not urgent — deferred.
- The error message string `"Network request failed for ${endpoint}. Is the web server running and reachable?"` in `apps/mobile/lib/api.ts` (lines 70 and 261) is dev-mode language leaking to production users. Should be softened in a future OTA to something like `"Couldn't reach Flame. Check your connection and try again."` Not urgent — deferred.
- The "Allow Flame to find devices on your local network?" prompt was a symptom, not a separate bug. With the corrected OTA, there is no library or code path in the production app that uses LAN. The prompt should never appear again for users on .12 or later. If it does, that's a new bug — not a recurrence of this one.

**Files:**
- `docs/guides/EAS_OTA_UPDATES.md` — four blocks updated: Pushing an OTA Update (added `--environment` to both examples + new CRITICAL section immediately below), Runtime Version Policy baseline command, Rollback command + new unpublish fallback, Setup Reference (added Apr 22 entry).
- `docs/fixes/APRIL_2026_FIXES.md` — this entry (#129).

**Verified end-to-end:** Corrected OTA `61bdc8cf-...` applied on real device; Payouts loads on Wi-Fi + 4G; checkout completes; no LAN prompt. ✅

---

### 130. Pending RSVPs now factored into tier availability — organizer "pending" hint + attendee-facing availability endpoint fix (Apr 22, 2026)

**Symptom (attendee-facing):**

An organizer set `quantity_total = 6` for a tier with `quantity_sold = 1` and `5 pending` RSVPs. By backend rules the tier is effectively sold out (`6 − 1 − 5 = 0`), and `create_rsvp_atomic` correctly rejects the 7th request with `SOLD_OUT`. However, the public event page at `/events/[slug]` kept showing the tier as **available** — for both logged-in users viewing the page and for the organizer inspecting their own event as an attendee would.

**Symptom (organizer-facing):**

The organizer dashboard (web + mobile) displayed `5/6 available` for the same tier, giving no hint that 5 slots were already claimed by pending RSVPs. Organizers couldn't tell whether "available" meant "free to sell" or "free minus pending claims", which made it unsafe to shrink `quantity_total` to close sales — shrinking below `quantity_sold + pending` hits an `OVERFLOW` in `increment_tier_quantity_sold` on the next RSVP approval. For **free** RSVPs the approval rolls back to `pending` but leaves an orphaned `orders` row in `requires_manual_review` plus an `order_errors` entry. For **paid** RSVPs the customer is charged, no ticket is issued, and the organizer has to refund manually. Both failure modes are silent to the organizer until they dig into the orders table.

**Root causes:**

1. **Attendee-facing display bug.** `apps/web/app/api/ticket-tiers/[tierId]/availability/route.ts` (polled every ~10s by `EventDetail.tsx`) calculated `totalAvailableAtTierLevel = tier.quantity_total − tier.quantity_sold − totalHeldAtTierLevel` — only subtracting active holds, not pending/approved RSVP `requested_quantity`. `EventDetail.getAvailableTickets()` prioritises this polled value over the (correct) SSR-computed `quantity_reserved`, so after the first ~10s poll the UI reverts to the incorrect "available" count and stays there. The SSR path in `events/[slug]/page.tsx` already computes `quantity_reserved` correctly via the `get_event_with_tiers` RPC semantics; the poll endpoint was the divergent one. The `get_event_with_tiers` RPC itself (used by mobile attendee views) is correct — no mobile attendee change needed.
2. **Organizer-facing missing hint.** Neither `/organizer` (SSR) nor `/api/organizer/data` (client query) nor mobile `useOrgEvents` attached a `quantity_reserved` field to tiers, so the organizer UI only had `quantity_total` and `quantity_sold` to work with and couldn't surface pending claims.

**Fix (attendee-facing):**

Extended the non-staged branch of `apps/web/app/api/ticket-tiers/[tierId]/availability/route.ts` to also subtract pending/approved RSVP quantities:

```ts
const totalReservedByRsvps = rsvpRows?.reduce((sum, r) =>
  sum + (r.requested_quantity || 0), 0) || 0;

totalAvailableAtTierLevel = Math.max(
  0,
  tier.quantity_total - tier.quantity_sold - totalHeldAtTierLevel - totalReservedByRsvps,
);
```

Clamped to 0 with `Math.max` so the UI never shows a negative `available` count during the transient window between an RSVP approval (which bumps `quantity_sold`) and the webhook/cleanup that clears the reservation. Staged tiers are left unchanged for now: stage-level availability comes from `get_tier_stage_availability` which doesn't know about RSVPs (RSVPs have `ticket_tier_id` but typically no `stage_id`). Deferred to W4-C1 — the scope of this entry is non-staged tiers where the RSVP flow actually lives.

**Fix (organizer-facing):**

Attached a `quantity_reserved` field to every ticket tier returned by organizer endpoints, computed as `sum(active holds) + sum(pending/approved RSVP.requested_quantity)` per tier — matching the `get_event_with_tiers` RPC definition exactly, so all three surfaces (organizer dashboard, public event page, mobile) agree on the same "true remaining" semantics.

- **Web SSR:** `apps/web/app/organizer/page.tsx` — added a third parallel query for active holds scoped via `ticket_tiers!inner(event_id)`, extended the RSVP query to select `ticket_tier_id, requested_quantity`, built a `reservedByTier` map, and mapped it onto each tier inside `eventsWithRsvpCounts`.
- **Web API:** `apps/web/app/api/organizer/data/route.ts` — same approach but batched at the top level (parallel holds + pending/approved RSVPs queries run once for all events, not per-event) to avoid N+1 queries. `enrichEventWithStats` now takes an optional `reservedByTier` map and attaches the field.
- **Mobile:** `apps/mobile/hooks/useOrgEvents.ts` — after the events query resolves, runs two parallel queries (`holds` filtered by `tier_id` + `expires_at > now` + `order_id is null`, and `rsvps` with `status in ('pending', 'approved')`) and enriches each tier in-place. Non-fatal on error: if either query fails the hint is silently omitted rather than breaking event listing.

**RLS note:** The existing `organizers_view_event_holds` policy and `"Organization members can view RSVPs for their events"` policy both scope visibility to the **owning** org's members (owner / admin / organizer roles). Co-host orgs can see the co-hosted event itself but cannot read its holds or RSVPs, so for co-hosted tiers the mobile hint silently falls back to `0 pending`. That's safe — under-reporting the hint is harmless; over-reporting would be misleading. No new RLS policy or SECURITY DEFINER RPC needed.

**UI:**

The hint is appended to the existing availability text as `{available}/{total} available · {n} pending` when `quantity_reserved > 0`, otherwise the line is unchanged. Implemented in:

- `apps/web/app/components/organizer/EventsTiersView.tsx` — both mobile-card and desktop-table rows of the **Current & Upcoming Events** section. Past-event rows intentionally skip the hint (no new reservations can land on a past event; any surviving pending rows are stale and don't warrant hinting).
- `apps/web/app/organizer/event/[id]/OrgEventDetailClient.tsx` — single tier row inside the event-detail view.
- `apps/mobile/components/events-management/EditTiersTab.tsx` — inside `ExistingTierCard`, rendered off a new `pending = tier.quantity_reserved ?? 0` local.

**Why this matters (beyond the display fix):**

With the hint visible, organizers can safely shrink `quantity_total` to close sales: setting `quantity_total = quantity_sold + quantity_reserved` cleanly stops new RSVPs (`create_rsvp_atomic` computes `0 available → SOLD_OUT`) while preserving every pending row so it can be approved normally. Setting it **lower** than that value is the `OVERFLOW` foot-gun described above; the hint makes the correct floor explicit. Full "close a tier" UX is a separate todo (W4-C1).

**Stage-level accuracy deferred (W4-C1):**

For tiers with stages, `quantity_reserved` is still tier-aggregate (summed from tier-scoped holds + tier-scoped RSVPs). Per-stage pending counts and per-stage attendee-facing availability for staged RSVP tiers are deferred to the W4-C1 close-a-tier work, where the stage vs. RSVP data model will be reconciled together.

**Types:**

- `apps/web/app/lib/hooks/useOrganizerData.ts` — added `quantity_reserved?: number` to `TicketTier`.
- `apps/mobile/hooks/useOrgEvents.ts` — added `quantity_reserved?: number` to `OrgEventTier`. Optional because `useCohostEvents` reuses the same type and its RLS context blocks reads of the owning org's holds/rsvps, so the field stays undefined for co-hosted tiers and the UI's `?? 0` fallback kicks in.

**Files:**
- `apps/web/app/api/ticket-tiers/[tierId]/availability/route.ts` — attendee-facing fix.
- `apps/web/app/organizer/page.tsx` — SSR enrichment.
- `apps/web/app/api/organizer/data/route.ts` — API enrichment + batched holds/RSVPs queries.
- `apps/web/app/lib/hooks/useOrganizerData.ts` — type update.
- `apps/web/app/components/organizer/EventsTiersView.tsx` — organizer dashboard UI (2 render paths).
- `apps/web/app/organizer/event/[id]/OrgEventDetailClient.tsx` — organizer event-detail UI.
- `apps/mobile/hooks/useOrgEvents.ts` — mobile enrichment + type update.
- `apps/mobile/components/events-management/EditTiersTab.tsx` — mobile organizer UI.

### 131. Raise per-event ticket tier cap from 5 → 10 (Apr 22, 2026)

**Context:** Organizer create/edit flows disabled "Add tier" at 5 tiers. This was **UI-only** (no Postgres constraint). `POST /api/events` had no `.max()` on the `ticket_tiers` array; `POST /api/ticket-tiers` did not count existing tiers.

**Fix:** Introduced `MAX_TICKET_TIERS_PER_EVENT = 10` in `packages/lib/src/constants/event-limits.ts` (exported from `@project-flame/lib`). Web organizer UI and mobile create/edit tiers now use this constant. **API:** `createEventSchema.ticket_tiers` has `.max(MAX_TICKET_TIERS_PER_EVENT)`; `POST /api/ticket-tiers` returns 400 when the event already has that many tiers.

**Files:** `packages/lib/src/constants/event-limits.ts`, `packages/lib/src/index.ts`, `apps/web/app/api/events/route.ts`, `apps/web/app/api/ticket-tiers/route.ts`, `apps/web/app/components/forms/CreateEventForm.tsx`, `apps/web/app/components/organizer/EventsTiersView.tsx`, `apps/web/app/organizer/event/[id]/OrgEventDetailClient.tsx`, `apps/mobile/components/create-event/TicketTiersTab.tsx`, `apps/mobile/components/events-management/EditTiersTab.tsx`.

### 132. Registration form fields — archive instead of delete (preserve historical RSVP answers) (Apr 22, 2026)

**Problem:** Removing a field from an event's `registration_form_config` made previously submitted answers invisible in the organizer "Registration Details" modal (both web and mobile), because those views iterate over the **current** config and read `registration_data[field.id]`. Data was still in `rsvps.registration_data` jsonb, but without the config entry there was no label to render it under — so prior answers effectively "disappeared" from the UI even though they were safe in the DB.

**Fix:** Added an optional `archived?: boolean` flag to the `FormField` shape. Archived fields stay in `events.registration_form_config`, but are:

- **Hidden from the registrant-facing form** (web `RegistrationFormModal.tsx` + `EventDetail.tsx`, mobile `CheckoutMainSheet.tsx`).
- **Skipped by `POST /api/rsvp` validation** (not required for new submissions, even if a tier's `registration_form_fields` still references them).
- **Still rendered in organizer detail views + XLSX export** with an "(archived)" hint so historical answers remain labeled.

No DB migration needed — `registration_form_config` is jsonb and adding an optional property is schema-free.

**Builder UI:** `FormFieldCard.tsx` now has an archive/unarchive action (archive-outline ↔ refresh-outline icons) next to the trash button. Archived cards render at 60% opacity with a "Hidden from new registrations. Previous answers still appear in RSVP details and exports." caption. Remove and reorder remain enabled so organizers can still clean up.

**Web Zod schemas (critical):** Both `createEventSchema` and `updateEventSchema` in `apps/web/app/api/events/route.ts` had to be widened to accept `archived: z.boolean().optional()` — Zod strips unknown keys by default, so without this change the flag would silently vanish on save.

**No changes to pending/approved RSVPs' `registration_data`**: archived ≠ deleted. Organizers can unarchive at any time, and no historical field data is mutated.

**Files:**
- `apps/mobile/hooks/useRsvpManagement.ts` — added `archived` to `FormFieldSchema` + doc comment.
- `apps/web/app/components/modals/RegistrationFormModal.tsx` — added `archived?: boolean` to `FormField`; `visibleFields` safety filter applied in validate + render.
- `apps/web/app/api/events/route.ts` — `archived` added to create + update Zod schemas.
- `apps/web/app/api/rsvp/route.ts` — `formConfig = formConfig.filter(f => !f.archived)` applied after the tier-based filter.
- `apps/web/app/components/EventDetail.tsx` — `hasFormConfig` now checks for any non-archived field; tier-filtered config additionally filters archived before passing to `RegistrationFormModal`.
- `apps/mobile/components/event-details/CheckoutMainSheet.tsx` — parsed form config filtered by `!f.archived`; fixed pre-existing `Boolean()` narrowing for checkbox check icon.
- `apps/web/app/components/RsvpManagement.tsx` — "(archived)" suffix appended to field label in RSVP detail modal.
- `apps/mobile/app/rsvp-detail.tsx` — same "(archived)" suffix in mobile RSVP detail sheet.
- `apps/mobile/components/create-event/FormFieldCard.tsx` — archive toggle action + dimmed card state + explanatory caption.

---

### 133. Registration form builder available on web event-management edit flow (Apr 22, 2026)

**Problem:** Web had the registration form builder in the event-creation flow (#64) and in the new archive UI (#132), but the organizer event-management edit page on web (`/organizer/event/[id]`) did not expose the builder at all. Organizers who wanted to archive or tweak fields on a published event had to do it from mobile — there was no way to manage the form post-publish on web.

**Fix:** Extracted the inline builder from `CreateEventForm.tsx` into a shared component `apps/web/app/components/forms/RegistrationFormBuilder.tsx`, used it in both places, and wired it into `OrgEventDetailClient.tsx`'s inline edit form card. The edit card now shows a "Registration Form" section (gated behind `requires_rsvp`) with the same toggle + builder UI as create, pre-populated from the event's current `registration_form_config`. The builder includes the archive/unarchive action introduced in #132.

**PATCH payload handling:** `handleSaveEventChanges` diffs the new config against the original snapshot (`JSON.stringify` of the pre-edit array) and only includes `registration_form_config` in the payload when the organizer actually changed something — either swap to a new array, or `null` to clear. Blank-label drafts (the auto-seeded empty field when the toggle is first flipped on) are stripped before the diff so just opening the toggle doesn't force a save. The `PATCH /api/events` handler already supported both shapes (`updateEventSchema.registration_form_config` accepts array or `null`; `updateData` writes `null` when cleared) — no API change required.

**Data surfacing:** `registration_form_config` is already returned by `GET /api/organizer/data` via `select("*")`, so no API change was needed. Added the field to the `Event` interface in `apps/web/app/lib/hooks/useOrganizerData.ts` (typed as `FormField[] | null`).

**Files:**
- `apps/web/app/components/forms/RegistrationFormBuilder.tsx` (new) — shared builder with archive/unarchive action, required/optional, type selector, remove.
- `apps/web/app/components/forms/CreateEventForm.tsx` — inline builder replaced with the shared component; behavior unchanged.
- `apps/web/app/organizer/event/[id]/OrgEventDetailClient.tsx` — added `requiresRsvp`, `registrationFormEnabled`, `registrationFields`, `originalRegistrationConfigJson` to `editingEventData`; pre-populated from `ev.registration_form_config` in `handleEditEvent`; rendered the builder inside the edit card (gated behind `requiresRsvp`); diffed and attached `registration_form_config` to the PATCH payload.
- `apps/web/app/lib/hooks/useOrganizerData.ts` — `Event.registration_form_config?: FormField[] | null`.

---

### 134. Tier capacity guard bypassed when slots are reserved but none sold (Apr 22, 2026)

**Problem:** The quantity validation in `EditTiersTab` used `hasSales` (defined as `quantity_sold > 0`) as the guard before enforcing the `minAllowedQty` floor. If an event had pending RSVPs holding slots (`quantity_reserved > 0`) but no completed sales yet, `hasSales` was `false` and the check was skipped entirely — an organizer could reduce capacity below the number of pending RSVPs, making those slots impossible to approve.

**Fix:** Replaced `hasSales &&` with `minAllowedQty > 0 &&` so the floor is enforced whenever any slots are claimed (sold or reserved), regardless of whether sales have completed.

**Files:**
- `apps/mobile/components/events-management/EditTiersTab.tsx` — guard changed from `hasSales && qty < minAllowedQty` to `minAllowedQty > 0 && qty < minAllowedQty`.

---

### 135. "Pending" label on tier capacity display changed to "Pending RSVPs" (Apr 22, 2026)

**Problem:** The tier availability display (e.g. "485 / 500 available · 6 pending") used the ambiguous label "pending", which could refer to RSVPs, payments, or holds depending on context.

**Fix:** Updated the label to "Pending RSVPs" across all four display locations (mobile tier card, mobile validation alert, web event detail, web tiers view).

**Files:**
- `apps/mobile/components/events-management/EditTiersTab.tsx` — display string and validation alert updated.
- `apps/web/app/organizer/event/[id]/OrgEventDetailClient.tsx` — tier availability span updated.
- `apps/web/app/components/organizer/EventsTiersView.tsx` — both occurrences updated.

---

### 136. Tier card layout overflow on long titles (mobile) and mobile viewport (web event detail) (Apr 22, 2026)

**Problem:** Two layout issues surfaced while QA'ing the v1.0.13 tier-management work:

1. **Mobile** — On the iOS event-management edit-tiers tab, a long tier name pushed the edit/delete action buttons out of the card header. The header `<Text>` had no flex-shrink constraint, so it laid out at full intrinsic width and clipped the sibling button row.
2. **Web** — On `/organizer/event/[id]` at mobile viewport widths, the inline tier row (price · availability · per-user · edit · delete) overflowed its 800px-capped container because the container used an unresponsive `flex items-center gap-4` with no `max-md:` variants. The sibling surface `EventsTiersView.tsx` (organizer dashboard) had already solved this exact layout with a responsive grid; `OrgEventDetailClient.tsx` had never been brought in line.

**Fix:**

1. **Mobile** (`EditTiersTab.tsx`) — Wrapped both the read and edit card headers with `flex-1` + `numberOfLines={2}` on the title `<Text>` and `shrink-0` on the button row. Truncation (2 lines with ellipsis) was chosen over unlimited wrap to keep card heights consistent in the list — same convention used by `EventCard`, `EventListCard`, and `SpotlightCard` in `packages/ui`, and by Eventbrite / Stripe Dashboard for inline list-row titles.
2. **Web** (`OrgEventDetailClient.tsx`) — Ported the existing `max-md:grid max-md:grid-cols-[1fr_auto] max-md:grid-rows-[auto_auto]` pattern from `EventsTiersView.tsx:610/635/708` onto the three containers (outer row, info cluster, action buttons). On `<md` the card now lays out as: row 1 col 1 = tier name (wraps), row 2 col 1 = price / availability / per-user stacked vertically, col 2 rows 1–2 = edit + delete stacked vertically. Desktop (`md+`) unchanged.

**Files:**
- `apps/mobile/components/events-management/EditTiersTab.tsx` — both `Edit Tier {n}` (editing) and `Tier {n}: {name}` (read) headers now truncate titles to 2 lines with `shrink-0` button row.
- `apps/web/app/organizer/event/[id]/OrgEventDetailClient.tsx` — inline tier row now switches to a 2-column, 2-row grid at mobile viewport widths, matching the organizer dashboard.

---

### 137. Tier quantity-reduction guard — extend web API + mobile banner to cover Pending RSVPs (Apr 22, 2026)

**Problem:** While reviewing the mobile `EditTiersTab.tsx` validation in #135/#136 context, two related gaps surfaced:

1. **Mobile banner drift:** The yellow warning banner at the top of the edit form gated on `hasSales` only, so an organizer editing a tier with `quantity_sold = 0` but `quantity_reserved > 0` (i.e. approved/pending RSVPs already claiming slots) saw no heads-up. They would only discover the restriction when attempting to save and hitting the validation alert. The underlying quantity-reduction check itself (#135-era) already correctly guards on `minAllowedQty = sold + reserved` — this was a UX consistency gap between the banner and the enforced validation.
2. **Web ↔ mobile divergence (web laxer than mobile):** The web `PUT /api/ticket-tiers` API only blocked `quantity_total < quantity_sold`, ignoring `quantity_reserved` entirely. Mobile (correctly) blocks below `sold + reserved`. This meant organizers on web could reduce `quantity_total` below pending RSVPs; when those pending RSVPs later approved and converted `reserved → sold`, they would hit the DB CHECK constraint `quantity_total_gte_quantity_sold` and fail — a real footgun rather than a hypothetical.

**Fix:**

1. **Mobile banner** (`EditTiersTab.tsx`) — Banner now shows when `hasSales || pending > 0` (still suppressed for staged tiers, matching prior behavior). Message is composed dynamically based on which counts are non-zero: "X sold tickets and Y Pending RSVPs. Quantity cannot be reduced below Z." / "X sold tickets. Quantity cannot be reduced below sold count." / "Y Pending RSVPs. Quantity cannot be reduced below pending count."
2. **Web API** (`apps/web/app/api/ticket-tiers/route.ts`) — Added `quantity_reserved` to the `tierCheck` select and the `TierWithEvent` type. Rewrote the quantity-reduction guard to use `minAllowedQty = quantity_sold + quantity_reserved`, with the same guard-if-`minAllowedQty > 0` pattern as mobile. Error message mirrors mobile's phrasing (`"Cannot reduce tier quantity to N. X tickets sold and Y Pending RSVPs — minimum is Z."`), including single/plural wording and conditional clauses when only one of the two counts is non-zero.

**Why stricter than before (rationale for the behavior change):** The DB CHECK constraint `quantity_total_gte_quantity_sold` only enforces sold. Reserved-count conversion to sold happens when a pending RSVP is approved; reducing `quantity_total` below pending creates a later-failure trap. This matches the industry-standard defensive pattern used by Eventbrite/Ticketmaster for inventory controls (server-authoritative guard against over-reduction of held capacity).

**Files:**
- `apps/mobile/components/events-management/EditTiersTab.tsx` — banner condition + dynamic message.
- `apps/web/app/api/ticket-tiers/route.ts` — `TierWithEvent` type extended with `quantity_reserved`, select includes `quantity_reserved`, quantity-reduction guard rewritten to use `sold + reserved`.

**Note on client-side web form:** `apps/web/app/components/organizer/TierInlineForm.tsx` has no client-side pre-check for this case today (didn't have one for the pre-existing sold-only case either) — it relies on the server error surfacing. Keeping that pattern; the new server message is clear enough to stand alone. A future nice-to-have would be adding a client-side banner on web to mirror mobile's UX.

---

### 138. `quantity_reserved` is not a real DB column — fix web API select + archived-field preservation when disabling registration form (Apr 22, 2026)

**Problems found during PR review:**

1. **Critical — non-existent column in `PUT /api/ticket-tiers`:** Entry #137 added `quantity_reserved` to the `TierWithEvent` type and the `tierCheck` select. However, `quantity_reserved` is **not a real column on `ticket_tiers`** — it is a computed value produced only by the `get_event_with_tiers` RPC (active holds + pending/approved RSVPs as a subquery aggregate). Selecting it directly via PostgREST would result in a column-not-found error (or a silently null value), making the entire reserved-quantity guard from #137 ineffective in production.

2. **Correctness — disabling the registration form erased archived field definitions:** The PATCH save path in `OrgEventDetailClient.tsx` computed `cleaned` as `[]` when `registrationFormEnabled = false`, then sent `registration_form_config: null` — wiping all field definitions including archived ones. Archived fields must survive disabling the form so that historical RSVP answers remain labeled in organizer detail views and exports (the model introduced in #132). A tier-disabling organizer on an event with archived fields would silently lose all those field labels.

**Fixes:**

1. **`apps/web/app/api/ticket-tiers/route.ts`** — Removed `quantity_reserved` from `TierWithEvent` type and `tierCheck` select. Added two parallel queries alongside the tier fetch (holds filtered by `tier_id + expires_at > now + order_id IS NULL`, and RSVPs filtered by `ticket_tier_id + status IN ('pending', 'approved')`). `quantityReserved` is now computed from these results — identical semantics to the `get_event_with_tiers` RPC and to the organizer SSR enrichment from #130.

2. **`apps/web/app/organizer/event/[id]/OrgEventDetailClient.tsx`** — When `registrationFormEnabled = false` at save time, `cleaned` is now filtered to keep only archived fields (non-blank label, `archived === true`) rather than producing `[]`. If there are archived fields they are sent in the config (not null), preserving their label metadata. If there are no archived fields, `null` is correctly sent. New registrants are unaffected — `EventDetail.tsx`'s `hasFormConfig` already filters for non-archived fields, so a config with only archived entries doesn't show the form.

**Deferred:** The TOCTOU race on the `quantity_reserved` pre-check (concurrent RSVP approval between read and update) is logged in `docs/todos/EDGE_CASES_TODOS.MD`. Fixing it atomically requires a new DB RPC/migration.

**Files:**
- `apps/web/app/api/ticket-tiers/route.ts` — `TierWithEvent` type updated, select fixed, `quantityReserved` computed from parallel queries.
- `apps/web/app/organizer/event/[id]/OrgEventDetailClient.tsx` — PATCH save path preserves archived fields when disabling registration form.

---

### 139. PR review fixes — Promise.all error handling in tier update + `registrationFormEnabled` toggle reflects active fields only (Apr 22, 2026)

**Two issues found in follow-up review of #138 code:**

1. **`PUT /api/ticket-tiers` — Promise.all silently swallowed query errors:** The parallel fetch for `tierCheck`, `holdsRows`, and `rsvpRows` destructured only `.data`, so a DB error on the holds or RSVPs query would result in `undefined` being treated as an empty array and `quantityReserved = 0`. The reserved-capacity guard would then proceed as if no slots were claimed, silently allowing an invalid capacity reduction. Concretely: if an RLS policy blocks the query, or the query transiently fails, the organizer gets a 200 with wrong floor enforcement.

2. **`OrgEventDetailClient.tsx` ~L1081 — `registrationFormEnabled` derived from all fields including archived:** The initialisation at `registrationFormEnabled: existingFields.length > 0` treated an event whose config contains only archived fields as "form enabled". When a prior save from fix #138 correctly preserved archived fields while disabling the form, reopening the edit UI would show the toggle ON and the empty builder visible — the organizer would see no active fields but still think the form was active. Distinct from the save-path fix in #138 (which fixed what gets sent to the DB); this fixes what the toggle *shows* when the form is opened.

**Fixes:**

1. **`route.ts`** — Replaced `const [{ data: tierCheck }, ...]` destructuring with full response variables (`tierCheckResult`, `holdsResult`, `rsvpResult`). After `Promise.all`, each response's `.error` is checked explicitly: `tierCheckResult.error` maps to a 404 (PGRST116 = no row) or 500 with context logging; `holdsResult.error` and `rsvpResult.error` each return a 500 with context. `tierCheck`, `holdsRows`, `rsvpRows` are extracted afterwards and all downstream logic is unchanged.

2. **`OrgEventDetailClient.tsx`** — Added `const activeFields = existingFields.filter(f => !f.archived)` and derived `registrationFormEnabled: activeFields.length > 0`. `registrationFields` remains `existingFields` (full set, including archived) so the builder can display archived cards and the #138 save-path logic can preserve them on the next save.

**Files:**
- `apps/web/app/api/ticket-tiers/route.ts` — Promise.all restructured; per-result error checks added.
- `apps/web/app/organizer/event/[id]/OrgEventDetailClient.tsx` — `registrationFormEnabled` now derived from active (non-archived) fields only.

---

### 140. Mobile archive-field flag was stripped on save + parity with web fixes #138 / #139 (Apr 22, 2026)

**Reported:** Organizer archives a registration form field in the mobile event-edit flow, UI shows it as archived, navigates back, returns to the event — the field is active again. The archive flag never persisted to the DB.

**Three compounding bugs in the mobile save path, all in the registration-form edit flow:**

1. **`UpdateEventInput` type in `useUpdateEvent.ts` did not include `archived`.** Each form field entry in the payload was typed as `{ id, label, type, required?, placeholder? }` — no `archived` slot. TypeScript accepted the shape on write and silently stripped `archived`. The server `PATCH /api/events` accepts `archived` (validated by its Zod schema at `route.ts` L790), so the server side is correct — the payload simply never contained the flag.

2. **`EditEventDetailsTab.tsx` save path explicitly remapped fields and omitted `archived`.** At the save step, `cleanedFields.map((f) => ({ id, label, type, required, placeholder }))` rebuilt each field from scratch, dropping anything not in the literal. Even if the type had allowed `archived`, this map call would have erased it. This was the primary round-trip break: toggle flips `archived: true` in local state → save → explicit map drops the flag → payload lands with `archived` absent → DB stores an unarchived field → next event open reparses the DB value, `archived` is missing, field renders as active. Exactly matches the user's report.

3. **Mobile parity with web fixes #138 and #139 was missing.** Two related archive-field correctness bugs on web had no mobile counterpart yet:

   - **#138 parity — disabling the form erases archived fields:** Mobile's save logic was `cleanedFields = formEnabled ? formFields.filter(f => f.label.trim() !== "") : []`. Toggling the form off sent `registration_form_config: null` (via the downstream `cleanedFields.length > 0 ? … : null`), wiping all archived-field definitions that existed only to label historical RSVP answers. Identical data-loss bug as the one fixed on web in #138.

   - **#139 parity — toggle state treats archived-only configs as "enabled":** Mobile's initialisation was `if (parsed && parsed.length > 0) { setFormFields(parsed); setFormEnabled(true); }`. An event whose config contains only archived fields (form effectively disabled for new registrants) would show the toggle ON and an empty-looking builder when reopened. Same UX bug as #139 on web.

**Fixes (all `apps/mobile/`):**

1. **`hooks/useUpdateEvent.ts`** — Added `archived?: boolean` to each `registration_form_config` entry in `UpdateEventInput`.

2. **`components/events-management/EditEventDetailsTab.tsx` (save path)** — Changed the explicit field remap to include `archived` only when truthy: `...(f.archived ? { archived: true } : {})`. The conditional spread avoids writing `archived: false` to the DB for fields that never had it (keeps payloads diff-minimal against what `get_event_details` returns).

3. **`components/events-management/EditEventDetailsTab.tsx` (save path, #138 parity)** — When `formEnabled` is false, `cleanedFields` now retains archived fields only: `formFields.filter(f => f.archived && f.label.trim() !== "")`. If a disabled form has any archived fields, they are preserved; if not, the config serializes to `null` (unchanged behaviour). `EventDetail.tsx` / `CheckoutMainSheet.tsx` already filter out archived fields before rendering to new registrants, so the disabled form still shows nothing on the public side.

4. **`components/events-management/EditEventDetailsTab.tsx` (init, #139 parity)** — `setFormEnabled(parsed.some(f => !f.archived))` instead of `setFormEnabled(true)`. `formFields` state still holds the full parsed set (active + archived) so the builder can display archived cards.

**Why `useUpdateEvent` is a single generic hook for all event patches:** The hook routes through `PATCH /api/events` (the server-side endpoint validated by `updateEventSchema` at `api/events/route.ts` L767). Any additional field added to the mobile edit flow needs a matching entry in `UpdateEventInput`. This is the same pattern used for `image_url`, `qr_scanner_code`, etc.

**Server side:** No change needed. `apps/web/app/api/events/route.ts` L790 already validates incoming `archived: z.boolean().optional()` and passes the field through to the DB at L902–908.

**Testing (manual, done):** Archive a field → save (see "Event updated successfully") → navigate back to events list → reopen the event → field card now renders with "archived" label, dimmed opacity, and the archive icon flipped to refresh-outline. Re-open the form after closing the app; state persists.

**Files:**
- `apps/mobile/hooks/useUpdateEvent.ts` — `archived?: boolean` added to `UpdateEventInput.registration_form_config` entry type.
- `apps/mobile/components/events-management/EditEventDetailsTab.tsx` — Conditional `archived` spread in save-path field remap; archived-field preservation when form disabled; `formEnabled` init derived from active fields only.

**Not fixed in this entry:** Web's `TierInlineForm.tsx` / `OrgEventDetailClient.tsx` tier edit form does not yet have the "pending RSVPs" pre-submit warning banner that mobile's `EditTiersTab.tsx` shows (from #137 / #139). Logged as a small web polish item in `NITPICKS_TODOS.md` — not a bug, web has no prior banner for the sold-only floor either, so this is a net-new UX improvement. Deferred to a follow-up web PR to keep the current PR scoped.

### 141. Mobile navigation restructure — Screens 1/2/3, org-pinning, notification orgId, PR review fixes (Apr 24, 2026)

Consolidated PR landing Stages 1 + 2 of the mobile nav restructure plus review-round fixes.

**Scope:**
- Unified 4-tab bar (Home, Search, My Tickets, User) — removed Create tab; Create Event moved to Screen 3 action row to eliminate org-flicker bug
- Screen 1 (Personal Profile), Screen 2 (Organizer Public — full rewrite), Screen 3 (Organizer Admin) landed per the plan `i-need-us-to-agile-seahorse.md` (local plan file, stored outside the repo)
- `ViewModeContext` + role-switcher UI removed entirely
- Dark search bars (`bg-white-5 border border-white-10`) replacing the white pill across `TicketSearchBar` + `EventsHero`

**Org-pinning contract (applied across every Screen 3 outbound route):**

Every org-scoped route (`/organizer-admin`, `/rsvp-management`, `/rsvp-detail`, `/create-event`, `/scanner`, `/org-members`, `/account`) now (a) accepts `?orgId=X`, (b) uses the route param as the source of truth for queries, (c) ref-syncs it into `MemberRoleContext.selectedOrgId` so deeper navigation inherits the same org. **Ref-based sync** (not `selectedOrgId`-keyed) because the context's exposed `selectedOrgId` is derived from `useOrgData` (TanStack Query) — during refetches it transiently flipped, causing "Maximum update depth exceeded" loops.

**Notification deep-link `orgId` propagation:**
- `apps/mobile/lib/notification-deep-links.ts` accepts `orgId` on `NotificationData`, forwards it on `/rsvp-detail` / `/rsvp-management` / `/organizer-admin`, and fails closed to `/profile` when `/organizer-admin` receives no `orgId` (previously fell through to stale context org).
- `apps/web/app/api/rsvp/route.ts` (`new_rsvp_request`) and `apps/web/app/api/cron/monitor-payment-authorizations/route.ts` (`auth_expiry_warning`) now include `orgId` in push data payload.
- `notifyOrganizerForAuthorizationExpiry` signature extended with `organizationId: string`; JSDoc updated.

**PR review-round fixes (this entry covers both the initial implementation and the review fixes):**

1. **Empty-string `orgId` serialization (Bug 1).** Four router pushes in `organizer-admin.tsx` were doing `?orgId=${effectiveOrgId ?? ""}`. An empty `?orgId=` defeats the receiver's `routeOrgId ?? selectedOrgId` fallback (empty string is truthy via `??`) AND skips the ref-sync (empty string is falsy in the guard). Fixed via a `withOrgParam()` helper that only appends the query segment when `effectiveOrgId` is truthy; mirrored on the Manage pill. All other sites audited — they were already guarded.

2. **`rsvp-management → rsvp-detail` dropped `orgId` (Bug 2).** Both `RsvpEventCard` `onActions` pushes omitted `orgId`, breaking the org-pinning contract. Both call sites now append `&orgId=${effectiveOrgId}` conditionally.

3. **Resolver fails closed for bare `/organizer-admin` (Bug 3).** The `/organizer-admin` branch only rewrote when `orgId` was present; the fallback returned `link` verbatim, landing the user on `/organizer-admin` with no route param — which then fell through to the context's `selectedOrgId` (stale or first-membership org). Now: `orgId ? withOrgId("/organizer-admin", orgId) : "/profile"`.

4. **`eventsAgg[0]?.count` readability (Bug 4).** `Array.isArray(eventsAgg) && eventsAgg[0]?.count` short-circuited on legitimate `count === 0` and happened to produce the correct 0 via the fallback. Replaced with `typeof rawCount === "number" ? rawCount : 0` — clearer and resilient to PostgREST surfacing `null`/string counts under RLS.

5. **Array `orgId` normalization.** `useLocalSearchParams` can return `string | string[]`. Every ref-sync site (`organizer-admin`, `rsvp-management`, `rsvp-detail`, `create-event`, `scanner`, `account`, `org-members`) now unwraps to a single string via `Array.isArray(x) ? x[0] : x`, mirroring the pattern already used in `edit-event.tsx` / `org-event-detail.tsx`.

6. **`profile.tsx` error UI.** `useUserOrgs` / `useUserProfile` failures previously collapsed into the empty-orgs CTA, misleading users into thinking they had no orgs. Now renders a distinct error state with a Retry pill (calls the combined `onRefresh`).

7. **`organizer-admin` pull-to-refresh missed cohost data.** `handleRefresh` only awaited `orgRefetch/refetch/refetchStats`. Assignments + cohort events (`useEventAssignments`, `useCohostEvents`) stayed stale on refresh. Added both refetches to `Promise.all`, deps, and wired their `isRefetching` into the `isRefreshing` computation.

8. **`organizer/[slug].tsx` refresh missed orgs/past.** Same fix — `refetchOrganizations` + `refetchPastEvents` now wired into `handleRefresh`. `refetchPastEvents` only fires when `org?.id` is known.

9. **`organizer/index.tsx` copy said "dashboard".** Stage 1 moved the Stripe return route from `/(tabs)/org-dashboard` to `/(tabs)/profile`, but the copy in `message` + `ERROR_MESSAGES` still said "dashboard". Updated all four occurrences to "profile".

10. **`HostBanner` flashed during cold start.** Banner rendered before `useUserOrgs` settled, so users with approved orgs saw a flash of "Host your own events" every cold launch. Added early-return on `orgsQuery.isLoading`.

11. **Stripe banners didn't name the org on connected states.** Only the "Not Connected" banner named the org ("...to accept payments for **X**"). Extended the same pattern to "Incomplete" ("Your Stripe account for **X** is connected but needs...") and "Fully Connected" ("...ready to accept payments for **X**.") so every Stripe state confirms which org the user is managing.

12. **`account.tsx` accepted `?tab=` but ignored `?orgId=`.** Manage + Stripe pills pushed `/account?tab=...&orgId=X` but account.tsx used context only, risking drift. Now reads `orgId`, ref-syncs to context; Stripe pill now also passes `orgId` (previously only Manage did).

**Skipped (auto-reviewer false positives, all logged with reasoning):**
- Stripe pill hardcoded rgba/hex colors (intentional — green/yellow status colors don't map to Flame tokens; documented exception)
- `bg-white-5 border border-white-5` on stat cards on both mobile (`OrgStatsSection`) and web (`DashboardView`, `UserDashboard`) — this pattern is the **explicit convention** documented in `.cursor/rules/flame-design-system.mdc:26` from an earlier iteration of this PR. Changing it contradicts the convention we just codified.

**Deferred:**
- Header accessibility labels → `ACCESSIBILITY_TODOS.md`
- `[slug].tsx` date-badge `text-white` → `text-white-100` cosmetic → `NITPICKS_TODOS.md`

**Files touched (major):**
- `apps/mobile/app/(tabs)/profile.tsx` (created — Screen 1)
- `apps/mobile/app/organizer-admin.tsx` (created — Screen 3)
- `apps/mobile/app/organizer/[slug].tsx` (rewritten — Screen 2)
- `apps/mobile/app/organizer/index.tsx` (copy + route update)
- `apps/mobile/app/rsvp-management.tsx`, `rsvp-detail.tsx`, `settings.tsx` (moved out of `(tabs)/`)
- `apps/mobile/app/account.tsx`, `scanner.tsx`, `org-members.tsx`, `(tabs)/create-event.tsx` (org-pinning)
- `apps/mobile/lib/notification-deep-links.ts` (orgId propagation + fail-closed)
- `apps/mobile/hooks/useUserOrgs.ts` (`eventCount`; count-parsing readability)
- `apps/mobile/components/navigation/CustomTabBar.tsx` (4-tab shape, removed Create action branch)
- `apps/mobile/components/navigation/RoleResolutionGate.tsx`, `components/home/Header.tsx`, `components/home/HostBanner.tsx`, `components/dashboard/DashboardBar.tsx`, `components/dashboard/TicketSearchBar.tsx`, `components/events/EventsHero.tsx`, `components/settings/PayoutsSettingsTab.tsx`
- `apps/web/app/api/rsvp/route.ts`, `apps/web/app/api/cron/monitor-payment-authorizations/route.ts`
- `.cursor/rules/flame-design-system.mdc` (dark-input convention documented)

**Files deleted:**
- `apps/mobile/app/(tabs)/org-dashboard.tsx`, `(tabs)/rsvp-management.tsx`, `(tabs)/settings.tsx`
- `apps/mobile/components/org-dashboard/OrganizerSimplifiedDashboard.tsx`
- `apps/mobile/contexts/ViewModeContext.tsx`, `hooks/useViewMode.ts`, `components/navigation/RoleSwitcherDropdown.tsx`, `components/navigation/RoleSwitcherSheet.tsx`

### 142. Mobile nav restructure — second review round (role-sync gate + deep-link safety + ghost-profile fix) (Apr 24, 2026)

Second review pass over PR #141. Six fixes shipped.

**Role-sync gate (new contract, applied to three screens).** Because `setSelectedOrgId(routeOrgId)` fires in a `useEffect` *after* the first render, the context's `memberRole` lags `routeOrgId` by one render after a deep-linked org switch. For one frame, role-gated UI and permission-derived queries would evaluate with the **prior org's role**. The fix is a shared `isRoleSynced` boolean (`!routeOrgId || syncedOrgIdRef.current === routeOrgId`) gating role-derived values:

- **`organizer-admin.tsx`** — `canManage/canTeam/canRsvp/canCreate` now each AND with `isRoleSynced`. Action tiles don't render until the routed org is the one the context is resolving.
- **`rsvp-management.tsx`** — `isFullAccess` ANDs with `isRoleSynced`; while unsynced, `assignedEventIds = null` pauses both `useAssignedEvents` and `useRsvpEvents` so they never fire for a new org under the previous org's permission assumption.
- **`scanner.tsx`** — `showAccessCodes` ANDs with `isRoleSynced`; the initial-tab `useEffect` bails out (`if (roleLoading || !isRoleSynced) return;`) until the routed role is resolved. Prevents picking the wrong default tab when the user switches from an admin org (access-codes first) to an organizer-role org (qr-scanner first) or vice versa.

Plan's "Post-Stage 2 refinements → Role-sync gate" bullet codifies this as part of the org-pinning contract.

**Deep-link safety (organizer/[slug]).**

- **`Linking.openURL` guard.** The Instagram subtitle link previously called `Linking.openURL` unguarded. Now awaits `Linking.canOpenURL(url)` first, wraps `openURL` in try/catch, and logs failures with screen/action context. On Android (where Instagram may not be installed), this prevents an unhandled promise rejection.
- **`router.back()` safe check.** Three `router.back()` call sites (the three `BackButton` placements across loader/error/loaded states) now route through a shared `handleBack` helper: `router.canGoBack() ? router.back() : router.replace("/")`. Users landing via universal link or notification had no back stack — tapping back was a no-op.

**Ghost profile on slow connections.** `organizer/[slug]` previously rendered a partial "Organizer" profile from `useAppEvents()` cached data while `useOrganizations()` was still in flight, then snapped to the real org metadata once it resolved. Now:
- `showLoader` waits for both `useAppEvents` AND `useOrganizations` when the slug has no resolved org yet.
- New `showNotFound` state renders an explicit "Organizer not found" UI when the orgs query has settled with no match (previously the user saw a perpetually-loading state or a partial header with no events).

**Skipped (intentional-design):** Replacing `TopBar` with `DashboardBar` on Screen 3. `TopBar` (transparent, `← Go Back`-only) is the **explicit detail-screen pattern** codified in the plan to match `event/[id].tsx` and the Screen 2 public view. `DashboardBar` has different chrome (title, avatar prop, opaque background) intended for tab screens.

**Files touched:**
- `apps/mobile/app/organizer-admin.tsx` (isRoleSynced gate)
- `apps/mobile/app/rsvp-management.tsx` (isRoleSynced gate + query pause)
- `apps/mobile/app/scanner.tsx` (isRoleSynced gate + effect bail)
- `apps/mobile/app/organizer/[slug].tsx` (Linking guard + handleBack + organizationsLoading gate + notFound branch)
- `i-need-us-to-agile-seahorse.md` (role-sync gate bullet — local plan file, outside the repo)

### 143. Mobile nav restructure — third review round (org-pinning coverage + doc cleanup) (Apr 24, 2026)

Third review pass over PRs #141/#142. Three fixes, one deferral, no scope change.

1. **`org-event-detail` nav drops `orgId`.** Both `OrgEventCard.onViewDetails` handlers in `organizer-admin.tsx` (current + past grids) were pushing `/org-event-detail?id=${event.id}` without the `orgId` param. Inconsistent with the org-pinning contract applied everywhere else. Now: `effectiveOrgId ? ?id=X&orgId=Y : ?id=X`, same conditional-append pattern used at the other Screen 3 outbound routes.

2. **scanner `effectiveOrgId` vs `selectedOrgId` clarifying comment.** `scanner.tsx` is the only file in this restructure holding both `effectiveOrgId` (passed to `useQRScanner`) AND `selectedOrgId` (from the shared context) in scope. Added an inline comment noting the distinction and that they converge after the ref-sync effect fires — pure documentation, no behavior change.

3. **Changelog absolute paths (APRIL_2026_FIXES.md).** Entries #141 and #142 embedded absolute `/Users/wagnerona/.claude/plans/...` paths when referencing the plan file. Replaced with just the filename + a note that it lives outside the repo. Portable for anyone else reading the changelog.

**Deferred to NITPICKS_TODOS.md:** `width: "48.5%"` hardcoded in `[slug]`'s `EventGrid`. Works correctly on every tested device (the `gap: 8` absorbs the residual 3% across a 2-col layout) and changing it doesn't fix a real bug. Refactor candidate, not a blocker.

**Files:**
- `apps/mobile/app/organizer-admin.tsx` (conditional `orgId` on `org-event-detail` nav — 2 sites)
- `apps/mobile/app/scanner.tsx` (clarifying comment on `effectiveOrgId`)
- `docs/fixes/APRIL_2026_FIXES.md` (replaced 2 absolute path refs)
- `docs/todos/NITPICKS_TODOS.md` (logged the `48.5%` grid item)

---

### 144. Allow users to re-RSVP after approval, purchase, or existing tickets (Apr 29, 2026)

**Reported:** Users with an `approved` RSVP (approved but not yet paid) or a previously `purchased` RSVP / issued ticket were permanently blocked from submitting a new RSVP request for the same event, even if the organizer needed to re-evaluate them for a different tier or quantity.

**Root cause:** The partial unique index `rsvps_one_active_per_user_event` included `approved` and `purchased` in its WHERE clause, blocking any new RSVP row from being inserted when an active row with those statuses existed. The frontend guards on web and mobile mirrored this behaviour, surfacing an error modal/alert even before the DB was consulted.

**New behaviour:**

| Status | Blocks a new RSVP? |
|--------|---------------------|
| `pending` | Yes — organizer is actively reviewing |
| `approved` | No |
| `purchased` | No |
| `rejected` | No |
| `expired` | No |
| `issued` / `checked_in` (tickets) | No |

**Changes:**

1. **DB — `supabase/migrations/20260429151642_rsvp_unique_pending_only.sql`**
   Dropped and recreated `rsvps_one_active_per_user_event` as `WHERE ((status)::text = 'pending'::text)` only.

2. **`apps/web/app/api/rsvp/route.ts`** — Capacity check (counts active RSVPs against `event.max_attendees`) kept as `.in("status", ["pending", "approved"])`. Approved RSVPs still hold inventory slots and must count toward capacity.

3. **`apps/web/app/components/EventDetail.tsx`** — Frontend duplicate guard updated from `status IN (pending, approved, issued, checked_in)` to `status = pending` only. Modal copy updated: "You already have a pending RSVP for this event. Your RSVP request is being reviewed. You can request again once it's been processed." Stale comments updated to match.

4. **`apps/mobile/app/event/[id].tsx`** — Same guard and alert copy updated to match web.

**Files:**
- `supabase/migrations/20260429151642_rsvp_unique_pending_only.sql` — DB index change.
- `supabase/migrations/20260429153551_fix_create_rsvp_atomic_pending_only.sql` — DB function fix (see #142).
- `apps/web/app/api/rsvp/route.ts` — Capacity check (pending + approved).
- `apps/web/app/components/EventDetail.tsx` — Frontend duplicate guard + modal copy + comment cleanup.
- `apps/mobile/app/event/[id].tsx` — Mobile duplicate guard + alert copy.

---

### 145. Fix create_rsvp_atomic duplicate-check still blocking approved/purchased (Apr 29, 2026)

**Reported (PR review):** `create_rsvp_atomic` contained its own explicit duplicate-RSVP guard (`SELECT COUNT(*) … WHERE status IN ('pending', 'approved', 'purchased')`) independent of the partial unique index. The partial index change in #141 did not affect this function-level check, making the re-RSVP feature completely non-functional for approved/purchased users — they would pass the frontend guard but hit a `23505` from the DB function on every attempt.

Also fixed in this entry: the capacity check in `apps/web/app/api/rsvp/route.ts` was incorrectly narrowed to only `pending` in #141 (should count both `pending` and `approved` to prevent over-admission, since approved RSVPs still hold inventory slots). And stale inline comments in `EventDetail.tsx` were updated to accurately describe the `pending`-only guard.

**Fixes:**

1. **DB — `supabase/migrations/20260429153551_fix_create_rsvp_atomic_pending_only.sql`**
   `CREATE OR REPLACE FUNCTION public.create_rsvp_atomic` — changed the single-user duplicate check from `status IN ('pending', 'approved', 'purchased')` to `status = 'pending'`. The two availability-reservation counts (`status IN ('pending', 'approved')`) are unchanged — approved RSVPs continue to hold inventory slots.

2. **`apps/web/app/api/rsvp/route.ts`** — Reverted capacity check back to `.in("status", ["pending", "approved"])` so approved RSVPs count toward `event.max_attendees`.

3. **`apps/web/app/components/EventDetail.tsx`** — Replaced stale inline comments ("blocking ANY existing record", "The user specifically mentioned 'pending, approved'") with accurate description of the `pending`-only guard.

**Files:**
- `supabase/migrations/20260429153551_fix_create_rsvp_atomic_pending_only.sql` — DB function fix.
- `apps/web/app/api/rsvp/route.ts` — Capacity check restored to `["pending", "approved"]`.
- `apps/web/app/components/EventDetail.tsx` — Stale comment cleanup.

---

### 146. Purchase Details export — add registration form columns for paid RSVP events (Apr 29, 2026)

**Reported:** For RSVP events that use a registration form, the **Pending RSVPs** XLSX export already includes one column per form question (including archived ones, so historical answers stay labeled — see #132). The **Purchase Details** export, however, only included Customer / Email / Tier / Quantity / Purchased At / Total Cost, so once a pending RSVP was approved and paid, the registrant's answers were no longer reachable from a single export. Organizers wanted parity: every paid RSVP row in the Purchase Details export should carry the same form answers as its corresponding pending row.

**Scope of this entry:**
- ✅ Web `OrgEventDetailClient.tsx` Purchase Details export (per-event organizer detail view).
- ✅ Mobile `OrgPurchasedDetailsCard` / `exportPurchasesXlsx` Purchase Details export.
- ✅ Pending RSVP exports already correct on both platforms (no behaviour change there).
- ❌ Direct-purchase events (no `requires_rsvp`): no registration form exists, export shape unchanged.
- ❌ Promotional / bank-transfer tickets: separate intake path with no `registration_data`; intentionally untouched to avoid misleading empty columns.
- ❌ `OrganizerDashboard.tsx` — its `PurchaseDetailsSection` + `handleExportToExcel` are dead code (defined and exported but never rendered anywhere in the app). Left alone; flagged in `NITPICKS_TODOS.md` for a separate cleanup PR.

**Column order:** Registration form columns appear **between Email and Ticket Tier** so the registrant's identity and answers sit next to each other (matches user request).

**Archived fields:** Continue to render in both pending and purchase exports — `normalizeRegistrationExportColumns` does not filter on `archived`, by design (#132).

**Same-user multiple RSVPs:** With the re-RSVP relaxation in #141 / #142, a single user can have multiple `rsvps` rows for one event. We resolve "which RSVP did this purchase come from?" by joining `orders.stripe_payment_intent_id` to `rsvps.stripe_payment_intent_id` (both unique). Each paid RSVP has exactly one matching order, so the join is unambiguous regardless of how many RSVP attempts the user made.

**Changes:**

1. **Shared lib — `packages/lib/src/utils/pending-rsvp-export.ts`**
   - New `buildPurchaseExportAoa(eventName, dataRows, registrationColumns?)` — sibling of `buildPendingRsvpExportAoa`. Inserts registration columns between Email and Ticket Tier. Pads missing values with empty strings.
   - New `purchaseExportColumnWidths(registrationColumns?)` — column widths matching the order produced by `buildPurchaseExportAoa`.
   - New exports: `PurchaseExportSheetRow` type, `buildPurchaseExportAoa`, `purchaseExportColumnWidths`. Re-exported from `packages/lib/src/utils/index.ts` and `packages/lib/src/index.ts`.
   - 5 new vitest cases in `__tests__/pending-rsvp-export.test.ts` (136 tests passing).

2. **Web data layer — `apps/web/app/lib/utils/purchase-data.ts`**
   - `Purchase` interface gains `registrationData?: Record<string, unknown> | null;`.
   - `OrderRowSchema` now selects `stripe_payment_intent_id`.
   - `fetchEventPurchases` signature changed from `(supabaseAdmin, eventId, extractFn?)` to `(supabaseAdmin, eventId, options?)` where `options.includeRegistrationData` opts into the RSVP join. Single follow-up query: `SELECT stripe_payment_intent_id, registration_data, status FROM rsvps WHERE event_id = ? AND stripe_payment_intent_id IN (...)`. Status priority `purchased > approved > other` resolves any ties (shouldn't happen — payment intent IDs are unique per RSVP — but guarded). Skipped entirely for events without a registration form to keep the query cheap.

3. **Web data route — `apps/web/app/api/organizer/data/route.ts`**
   - Sets `includeRegistrationData = Array.isArray(event.registration_form_config) && event.registration_form_config.length > 0` and forwards to `fetchEventPurchases`.
   - `event.registration_form_config` was already in the response (events `select *`); no schema change.

4. **Web export — `apps/web/app/organizer/event/[id]/OrgEventDetailClient.tsx`**
   - `PurchasedDetailsSection.handleExportPurchases` now uses `buildPurchaseExportAoa` + `normalizeRegistrationExportColumns` + `registrationValuesForExportColumns` + `purchaseExportColumnWidths` from `@project-flame/lib`. Passes `event.registration_form_config` so RSVP events with a form get reg columns.

5. **Mobile types — `apps/mobile/hooks/useOrgEventEnriched.ts`**
   - `EnrichedPurchase` gains `registrationData?: Record<string, unknown> | null;`; `PurchaseSchema` parses it as a nullable optional record.
   - `EnrichedOrgEvent` gains `registration_form_config?: FormField[] | null;`; `EnrichedEventSchema` parses it via `z.array(FormFieldSchema).nullable().optional()`.

6. **Mobile export — `apps/mobile/lib/organizer-xlsx-export.ts`**
   - `exportPurchasesXlsx(params)` now accepts `registrationFormConfig?` and uses the shared `buildPurchaseExportAoa` + `purchaseExportColumnWidths` (replaces the inline `wsData` array). Column widths now derive from the helper.

7. **Mobile UI — `apps/mobile/components/org-dashboard/OrgPurchasedDetailsCard.tsx` + `apps/mobile/app/org-event-detail.tsx`**
   - `OrgPurchasedDetailsCardProps.registrationFormConfig?` added and forwarded to `exportPurchasesXlsx`.
   - The detail screen passes `enrichedEvent.registration_form_config ?? null` to the card.

**Verification:**
- `pnpm --filter @project-flame/lib test` → 136/136 passing.
- `tsc --noEmit` clean for `@project-flame/lib`, `apps/web`. Mobile typecheck shows only pre-existing unrelated errors (Clerk types, packages/ui resolution noise documented in master guide §7).

**Files:**
- `packages/lib/src/utils/pending-rsvp-export.ts` — `buildPurchaseExportAoa`, `purchaseExportColumnWidths`, new types.
- `packages/lib/src/utils/index.ts`, `packages/lib/src/index.ts` — re-exports.
- `packages/lib/__tests__/pending-rsvp-export.test.ts` — 5 new tests.
- `apps/web/app/lib/utils/purchase-data.ts` — registration_data join, options arg.
- `apps/web/app/api/organizer/data/route.ts` — passes `includeRegistrationData`.
- `apps/web/app/organizer/event/[id]/OrgEventDetailClient.tsx` — purchase export wired to shared lib.
- `apps/mobile/hooks/useOrgEventEnriched.ts` — types + Zod schemas.
- `apps/mobile/lib/organizer-xlsx-export.ts` — purchase export wired to shared lib + reg columns.
- `apps/mobile/components/org-dashboard/OrgPurchasedDetailsCard.tsx` — `registrationFormConfig` prop.
- `apps/mobile/app/org-event-detail.tsx` — passes `registration_form_config` into the card.

---

### 147. Exports — refetch fresh data immediately before downloading (Apr 29, 2026)

**Reported (during QA of #143):** On web, paid RSVP rows in the Purchase Details export came down with empty cells under the registration form columns even though the column headers were correct. The user noted the pre-Jan 2026 export pattern used to "wait a bit" to fetch data before downloading.

**Root cause:** All four export call sites (web RSVP / web purchases / mobile RSVP / mobile purchases) read from a TanStack Query cache (`staleTime` 60s–2min). Cached responses from before #143 deployed do not carry the new `registrationData` field, so the join data was simply absent on the rows being passed into the sheet builder. Even after #143, any time the cache was warm the export could serve stale rows or stale form headers.

**Fix:** Match the pre-Jan 2026 pattern (still visible in the dead `OrganizerDashboard.tsx` export — see NITPICKS_TODOS.md): refetch fresh data inline at the moment the user clicks Export, then build the sheet from the response. No staleTime tweaking, no global cache invalidation.

**Changes:**

1. **Web — `apps/web/app/organizer/event/[id]/OrgEventDetailClient.tsx`**
   - `PurchasedDetailsSection` now takes `orgSlug` and, on export, does `fetch('/api/organizer/data?org=…', { cache: 'no-store' })`, finds the matching event, and uses its `purchases` + `registration_form_config` + `timezone` + `currency`. Falls back to props only if a field is missing on the fresh response.
2. **Web — `apps/web/app/components/RsvpManagement.tsx`**
   - `handleExportRsvps` now does `fetch('/api/organizer/rsvps?event_id=…', { cache: 'no-store' })` before building the sheet so both the RSVP list and `registration_form_config` come from the latest server response.
3. **Mobile — `apps/mobile/components/org-dashboard/OrgPurchasedDetailsCard.tsx`**
   - New optional `onRefetchBeforeExport` prop. When provided, the card awaits it and uses the returned `{ purchases, registrationFormConfig, eventName, eventTimezone, currency }` instead of the cached props.
4. **Mobile — `apps/mobile/app/org-event-detail.tsx`**
   - Passes `onRefetchBeforeExport` that calls `refetchEnriched()` and locates the freshly-fetched event by id.
5. **Mobile — `apps/mobile/app/rsvp-detail.tsx`**
   - `handleExportPending` calls `await refetch()` and exports from the returned `data` (RSVP list + `registrationFormConfig`).

**Result:** First click after a fresh deploy or after the cache has gone stale always pulls the latest server response. Existing TanStack staleTimes (used by the rest of the UI) are unchanged.

**Files:**
- `apps/web/app/organizer/event/[id]/OrgEventDetailClient.tsx`
- `apps/web/app/components/RsvpManagement.tsx`
- `apps/mobile/components/org-dashboard/OrgPurchasedDetailsCard.tsx`
- `apps/mobile/app/org-event-detail.tsx`
- `apps/mobile/app/rsvp-detail.tsx`

---

### 148. Discover page Featured Events section blank on web — spotlight was consuming the only featured event (Apr 29, 2026)

**Reported:** The "Featured Events" cards section on the web `/discover` page was empty, even though one event (`ZULU: CIERRE DE TEMPO`) was flagged `is_featured = true` in the database. Mobile rendered the same event in both the spotlight ("Reserve Your Spot") card AND the Featured Events carousel; web didn't render it in the carousel at all.

**Root cause:** Two compounding issues, both in `apps/web/app/discover/page.tsx`:

1. The page used `is_featured` as the source for both the spotlight (`spotlightEvent = featuredEvents[0]`) and the carousel (`featuredEvents`). It then deduplicated by removing the spotlight from the carousel array. With only one featured event, the carousel always rendered as empty.
2. The Postgres `idx_single_featured_event` partial unique index on `(is_featured) WHERE is_featured = true` actively prevented organizers from flagging more than one event as featured, so even if the page logic had been fixed, only one event could ever appear in the carousel.

A separate `events.featured` column existed but was unused at runtime — leftover infrastructure from an earlier iteration.

**Fix:** Decouple the two concepts at the schema level so each can evolve independently.

1. **Migration `20260429233527_main_featured_event_split.sql`:**
   - Drop `idx_single_featured_event` (the unique partial index on `is_featured`) so multiple events can be featured at once.
   - Rename `events.featured` → `events.main_featured`, tighten to NOT NULL DEFAULT false.
   - Add `idx_events_main_featured` (perf) and `idx_single_main_featured_event` (unique partial index, enforces at-most-one spotlight).
   - Drop the old `set_featured_event` / `unfeature_all_events` helpers (operated on `is_featured`, never called from app code) and create `set_main_featured_event(uuid)` / `unset_main_featured_events()` operating on `main_featured`.
2. **`@project-flame/lib` `EventSchema` / `Event`:** Added optional `main_featured` boolean.
3. **`apps/web/app/discover/page.tsx`:** Spotlight now reads `events.find(e => e.main_featured)` (falls back to first upcoming). Featured Events carousel is `events.filter(e => e.is_featured)`, sorted by `starts_at ASC` (already enforced by the SQL `ORDER BY`), capped at `FEATURED_EVENTS_LIMIT = 10`. The dedupe filter that removed the spotlight from the carousel was deleted — they're independent now.
4. **`apps/mobile/hooks/useAppEvents.ts`:** Same spotlight + featured logic ported, same `FEATURED_EVENTS_LIMIT = 10`.
5. **Data preservation:** `ZULU: CIERRE DE TEMPO` had both `is_featured = true` and `featured = true` before the migration, so after the rename it remains both featured AND the spotlight without any data UPDATE.

**Files:**
- `supabase/migrations/20260429233527_main_featured_event_split.sql`
- `packages/lib/src/types/event.ts`
- `apps/web/app/discover/page.tsx`
- `apps/web/app/components/discover/types.ts`
- `apps/mobile/hooks/useAppEvents.ts`

---

### 149. Purchase Details export — show base ticket price, not buyer-paid total (Apr 29, 2026)

**Reported:** The "Total Cost" column in the Purchase Details XLSX export showed the full buyer-paid amount (base price + service fee + IVA), so the column total didn't reconcile with the organizer dashboard's "Total Revenue" stat for the same event. Organizers want the export to show what they actually receive per sale, matching the dashboard.

**Root cause:** Both the web and mobile purchase exports wired the `totalCost` cell to `purchase.totalPrice` (buyer-paid) instead of `purchase.basePrice` (organizer-net). The same component computes its own dashboard-facing `totalRevenue` correctly via `purchase.basePrice`, so the two surfaces disagreed on the same data.

**Why this is a one-line app fix, not a DB migration:** `Purchase.basePrice` is already correctly resolved for **both legacy and current orders** by `fetchEventPurchases` (`apps/web/app/lib/utils/purchase-data.ts`):
- **Stripe Guaranteed Net orders** → reads `orders.base_price_cents` directly.
- **Legacy Datafast orders** → reverse-extracts via `extractBasePriceHistorical(total, createdAt, fee_percentage)`.

The export simply wasn't reading the field. Backfilling `orders.base_price_cents` via a migration would lock a heuristic into canonical data — the runtime extraction is already authoritative and reversible. (See Jan 2026 `convert_price_cents_to_base_prices.sql` cautionary tale.)

**Header rename:** "Total Cost" → "Base Ticket Price" on both the Purchase Details export and the Pending RSVPs export. The pending export already used `tier.price_cents` (which is base-priced post-Jan-2026 schema) — value unchanged, header now unambiguous. Both files use the same column name so the convention is consistent across the two exports.

**Pending RSVPs — value not changed:** Considered showing a base-plus-fee buyer projection on the pending export instead of the base price. Rejected: pending RSVPs haven't generated a buyer receipt yet, so there's no "buyer paid" number to reconcile against, and using base price keeps the column meaning consistent across pending + purchase exports.

**Changes:**

1. **Web — `apps/web/app/organizer/event/[id]/OrgEventDetailClient.tsx`**
   - `PurchasedDetailsSection.handleExportPurchases`: `totalCost: formatCentsAsPrice(p.totalPrice, currency)` → `formatCentsAsPrice(p.basePrice, currency)`.

2. **Mobile — `apps/mobile/lib/organizer-xlsx-export.ts`**
   - `exportPurchasesXlsx`: `totalCost: formatCentsAsPrice(p.totalPrice ?? p.basePrice, currency)` → `formatCentsAsPrice(p.basePrice, currency)`.

3. **Shared lib — `packages/lib/src/utils/pending-rsvp-export.ts`**
   - `BASE_HEADERS[3]`: `"Price"` → `"Base Ticket Price"`.
   - `PURCHASE_HEADERS_AFTER_REG[3]`: `"Total Cost"` → `"Base Ticket Price"`.
   - JSDoc on `PurchaseExportSheetRow.totalCost` updated to clarify the field carries the organizer-net base price; field name kept for API stability.

4. **Tests — `packages/lib/__tests__/pending-rsvp-export.test.ts`**
   - Header expectations updated to "Base Ticket Price".

**Verification:**
- `pnpm --filter @project-flame/lib test` → 136/136 passing.
- `tsc --noEmit` clean for `apps/web`.
- Reconciliation: a row's "Base Ticket Price" × "Quantity" now matches the per-purchase contribution to the dashboard's `totalRevenue` for the same event, for both Stripe and legacy Datafast orders.

**Files:**
- `apps/web/app/organizer/event/[id]/OrgEventDetailClient.tsx`
- `apps/mobile/lib/organizer-xlsx-export.ts`
- `packages/lib/src/utils/pending-rsvp-export.ts`
- `packages/lib/__tests__/pending-rsvp-export.test.ts`

---

### 150. `validate-code` rejected signed-in non-organizer users on web `/qr-scanner` despite a valid access code (Apr 29, 2026)

**Reported (PR review on #145):** After #145 made the mobile public scanner work, `apps/web/app/api/qr-scanner/validate-code/route.ts` still ran `auth()` first and routed any caller with a Clerk session into a permission gate (organizer/admin role + org membership), even when their access code was valid. Same-origin web traffic to `/qr-scanner` automatically attaches the Clerk cookie, so signed-in regular users — and signed-in organizers of other orgs — got a 403 from the very first scanner call, while the page they were on (`apps/web/app/qr-scanner/page.tsx`) is explicitly designed to support "both user login (organizers) and access codes (staff)".
 
**Root cause:** The Apr 29 rewrite added an anonymous-with-code path but kept the legacy authenticated branch alongside it. The doc comment on the route claimed the endpoint mirrored `/api/qr-scanner/verify` and `/api/qr-scanner/checkin`, but those two endpoints implement an *access-code-first* model — they treat the code as the credential and skip the auth path entirely when a code is supplied. `validate-code` was the inverse: auth-first, with the public branch only reachable when `userId` was null. The asymmetry produced the failure matrix below.

| Visitor | Code | `validate-code` (before) | `verify` / `checkin` | `/qr-scanner` page intent |
|---|---|---|---|---|
| Anonymous | valid | ✅ pass | ✅ pass | ✅ allow |
| Signed-in, role=user | valid | ❌ 403 "Insufficient permissions" | ✅ pass | ✅ allow |
| Signed-in organizer, other org | valid | ❌ 403 "not your org" | ✅ pass | ✅ allow |
| Signed-in organizer, same org | valid | ✅ pass | ✅ pass | ✅ allow |
| Signed-in admin | valid | ✅ pass | ✅ pass | ✅ allow |

The two broken cases are unique to `validate-code`. Mobile was never affected — `apiPostPublic` strips the Bearer token and React Native fetch doesn't share Clerk cookies — so this was a web-only regression introduced by #145.

**Fix:** Drop the auth-first branch entirely. The endpoint now performs only:

1. Input validation (JSON body, code format `^[A-Z0-9]{4,8}$`, optional `orgId` string).
2. Supabase lookup: `events` row matching `qr_scanner_code = code` AND `status = 'published'`, optionally narrowed by `organization_id = orgId`.
3. On match → `200 { valid: true, eventId, eventName }`. No match → `404 "Invalid code"`.

No auth, no role check, no org-membership query. The downstream `verify` and `checkin` endpoints already accept the same access code as their credential without additional org gating, so adding extra gating here was security theatre — anyone holding the code could bypass `validate-code` by calling `verify`/`checkin` directly anyway.

**Why this is safe:**
- Code space is `36^4 → 36^8` (≈1.6M to 2.8 trillion) — brute-forcing is impractical.
- The `status = 'published'` filter prevents leaking unpublished/draft event names.
- The endpoint already accepted anonymous callers post-#145; allowing signed-in callers with the same code is strictly weaker than that public surface.
- Response shape is unchanged for all callers that previously succeeded.

**Imports cleaned up:** Removed now-unused `auth` from `@clerk/nextjs/server`, `getUserRole` from `@/app/lib/roles`, and `resolveDbUserFromClerkId` from `@/app/lib/auth`.

**Files:**
- `apps/web/app/api/qr-scanner/validate-code/route.ts` (95 lines → 87 lines after removing the authenticated branch and unused imports; route logic shrank from ~70 to ~40 lines)

---

### 151. Web QR scanner — square preview, scan-capable lens filter, precise pill labels (Apr 30, 2026)

**Reported:** On `/qr-scanner`, the camera preview filled most of the screen height (large 16:9 video bleed), the "Switch Camera" button cycled through every lens the browser exposed (Front, Telephoto, Back Dual, Continuity Desk View, etc.), and the top-left camera label pill sometimes rendered blank. On iPhone 17 Pro, several of those exposed lenses produced unusable blurry frames at typical QR scan distance (≈10–20cm) — Telephoto, single-lens Wide, and Back Dual all have minimum focus distances longer than the QR is held.

**Root cause:**
1. **Preview sizing** — container had no aspect ratio constraint; `<video className="w-full h-auto">` rendered at the device camera's native aspect ratio (typically 16:9 portrait → very tall on phones, very wide on desktop), dwarfing the rest of the UI.
2. **Camera carousel surfaced every input device** — `BrowserMultiFormatReader.listVideoInputDevices()` returns *all* video inputs WebKit/Chromium expose, including Apple's Continuity Desk View, Front Camera, and individual physical lenses that aren't useful for close-range QR scanning. The previous filter only excluded virtual + front cams; it kept Telephoto / Back Dual / standalone Wide.
3. **Lens-vs-min-focus mismatch (hardware-driven)** — newer iPhone Pro Wide lenses have *longer* minimum focus distances than older Pros (12 Pro Wide focuses closer than 17 Pro Wide), and Telephoto on every model has a long min-focus regardless. Apple's "macro" capability lives on Ultra Wide (≈2cm min focus). The auto-switching virtual lens (`Back Triple Camera` on tri-lens Pros, `Back Dual Wide Camera` on dual-Wide phones, `Back Camera` on single-lens) drops to Ultra Wide automatically when the subject is close. So the only lenses that reliably scan a held-up QR are: the auto/virtual lens, Back Dual Wide, and Ultra Wide. Telephoto, single-lens Wide, and non-wide Dual cannot focus at scan distance.
4. **Pill blank state** — `currentCameraLabel` was only set inside `startScanning` after `listVideoInputDevices()` resolved; on the initial mount path with a preferred-back-camera selection, the state could remain `""`, and the pill was conditionally rendered (`{currentCameraLabel && ...}`), so it didn't show at all instead of falling back to a generic label.

**Fix (single file: `apps/web/app/components/QRScannerApp.tsx`):**

1. **Square preview container.** Wrapper now `relative rounded-card overflow-hidden bg-black aspect-square max-w-[480px] mx-auto w-full`. Video uses `absolute inset-0 w-full h-full object-cover` to fill the square without distortion. Scan reticle is responsive (`w-2/3 h-2/3` instead of fixed 56×56). Matches Ticketmaster / Eventbrite Organizer / Square scanner viewports — compact, focused, never dominates the screen.
2. **Two-stage camera filter.**
   - `isBackCamera()` — drops Front, User, Face, Desk View, Screen, Virtual.
   - `isScanCapableCamera()` (new) — drops Telephoto outright, drops standalone Wide and non-Wide Dual, keeps Triple, Dual Wide, Ultra Wide, and any non-Apple-labelled back cam (Android fallback).
   - `filterUsableCameras()` chains them with safe fallback: scan-capable → back-only → all devices, so single-lens phones (SE, older Androids) never get locked out.
3. **Smart default selection.** On mount, prefers Back Triple → Back Dual Wide → Back Dual → Back Wide → any back. The virtual auto-switching lens (Apple's `Back Triple Camera` on tri-lens Pros) is what the native iOS Camera app uses for QR scanning — it auto-engages macro mode on Ultra Wide when the subject is close. This is the industry-standard default.
4. **Precise pill labels.** `getCameraDisplayName()` now distinguishes Back (Auto), Back Dual Wide, Back Dual, Ultra Wide, Telephoto, Wide, Back, Front. Pill renders unconditionally (with `"Camera"` fallback), is `truncate max-w-[60%]`, and exposes the raw Apple device label via `title=` for hover inspection. New `currentCameraRawLabel` state tracks the unmodified label for the tooltip.

**Resulting carousel by device:**

| Device | Lenses exposed | Default |
|---|---|---|
| iPhone 17 Pro | Back (Auto), Back Dual Wide, Ultra Wide | Back (Auto) |
| iPhone 12 Pro | Back (Auto), Ultra Wide | Back (Auto) |
| iPhone non-Pro (14/15) | Back Dual Wide, Ultra Wide | Back Dual Wide |
| iPhone SE / single-lens | Back (only Wide, kept via fallback) | Back |
| Android | All back cameras (no Apple-specific naming applied) | Best-match back |

**Why this is safe:**
- Single-lens devices fall through to `backOnly` then `devices`, so no phone is left with zero cameras.
- Filter is purely client-side label matching; no API or storage shape change.
- `STORAGE_KEYS.DEVICE_ID` (scanner identity) is unaffected — only the in-memory `availableCameras` array and selection index changed.

**Industry benchmark (per Section 3 of `project-flame-master.mdc`):** Ticketmaster / Eventbrite Organizer / Square / Stripe Terminal web all default to the OS-virtual back camera and expose at most one or two manual overrides. Hiding Telephoto + standalone Wide is consistent with their UX.

**Verification:** Tested on iPhone 17 Pro (Safari) — carousel cycled through Back (Auto), Back Dual Wide, Ultra Wide, all crisp at QR scan distance; Telephoto / Back Dual / Wide no longer offered. Pill always populated; raw Apple label visible on hover.

**Files:**
- `apps/web/app/components/QRScannerApp.tsx`

---

### 152. My Tickets — wrong RSVP quantity, wrong price, transient "Ready to buy" flash after approval (Apr 30, 2026)

**Reported (web + mobile):** A user requesting an RSVP for **2** tickets saw quantity = **1** on `/account` (web) and the dashboard tab (mobile) while the RSVP was pending; once the organizer approved, the same group flipped to quantity = **3**. Because price is rendered as `pricePerUnit × quantity` for RSVPs without an order, the displayed price was wrong in both states. Independently, for a split second after organizer approval, the user briefly saw a **"Ready to buy"** status / **"Buy Now"** CTA on their group card before the page settled — a remnant of the deprecated paid-RSVP flow that should no longer surface anywhere on My Tickets.

**Root cause:**

1. **Quantity uses row count, not requested quantity.**
   In both `apps/web/app/lib/utils/user-ticket-mappers.ts:134` and `apps/mobile/lib/user-ticket-mappers.ts:151`, `groupTicketsByEventAndTier` computed `const totalQuantity = group.length`. The API returns one row per pending RSVP (regardless of requested qty) and one row per *issued* ticket. So:

   | State | API returns | `group.length` | Correct qty |
   |---|---|---|---|
   | Pending RSVP, qty 2 | 1 RSVP row (`requested_quantity=2`) | 1 ❌ | 2 |
   | Approved race window | 1 RSVP row + 2 ticket rows | 3 ❌ | 2 |
   | Tickets fully synced | 2 ticket rows (RSVP filtered by API) | 2 ✅ | 2 |

   The "request 2 → see 3" report is the middle row: server-side dedup at `apps/web/app/api/user/tickets/route.ts:406-421` filters approved RSVPs only after looking up the matching `orders` row by idempotency key (`free_${rsvp.id}`). Between organizer approval and that order existing, the API returns *both* the RSVP and the new ticket rows; with `group.length` that produced 3.

2. **Status read from `group[0]` on mobile.**
   Mobile's mapper used `mapStatus(group[0])` which, in the same race window, could pick the now-superseded RSVP row and emit `ready_to_buy`. Web already had a `representative` finder that prefers an issued ticket — mobile didn't. So the flash was more pronounced on mobile, but web could still hit it during the brief no-tickets-yet window.

3. **`ready_to_buy` is a deprecated state.**
   The current product flow has only two outcomes for an RSVP: **Pending** (awaiting organizer) or **issued tickets** (after approval). The intermediate "Ready to buy" state was from an earlier paid-RSVP design where approval handed the user back to a checkout page. That flow no longer exists, but the enum value, color, label, stat pill, and "Buy Now" button were all still wired in both apps.

**Fix:**

1. **`groupTicketsByEventAndTier` now sums actual quantities with supersession-awareness** (web + mobile):
   ```ts
   const hasIssuedTickets = group.some(
     (t) => (t.type === "ticket" || t.type === "promotional") &&
            (t.status === "issued" || t.status === "checked_in")
   );
   const countableTickets = hasIssuedTickets
     ? group.filter((t) => t.type !== "rsvp")
     : group;
   const totalQuantity = countableTickets.reduce((sum, t) => {
     if (t.type === "rsvp") return sum + (t.requested_quantity ?? t.quantity ?? 1);
     return sum + 1;
   }, 0);
   ```
   - Pure-pending RSVP: sums `requested_quantity` → 2.
   - Race window: ignores the superseded RSVP, counts ticket rows → 2.
   - Fully synced: counts ticket rows → 2.

2. **Approved RSVPs map to `pending`** (web `user-ticket-mappers.ts:64`, mobile `user-ticket-mappers.ts:79`).
   Since the approved state is transient (≤ a few seconds before tickets are inserted), surfacing it as Pending matches the "either pending or showing tickets after approval" UX the team wants. The user never sees a dead-end CTA.

3. **Mobile mapper now uses the same `representative` finder as web** — picks the first issued/checked-in ticket, falling back to the first non-cancelled row, falling back to `group[0]`. Eliminates the platform-specific status drift.

4. **`ready_to_buy` removed end-to-end:**
   - Dropped from the `TicketDisplayStatus` union (web + mobile).
   - Removed from `STATUS_COLORS` / `STATUS_LABELS` maps in `apps/web/app/components/UserDashboard.tsx` and `apps/mobile/components/dashboard/TicketCard.tsx`.
   - Deleted the "Ready to buy" stat pill on web (`UserDashboard.tsx`) and the "Ready to buy" stat card on mobile (`StatsGrid.tsx`).
   - Deleted the `onBuyPress` prop and Buy Now branch from mobile `TicketCard`.
   - Deleted the `onBuyPress` wiring + `group.status === "ready_to_buy"` link in `apps/mobile/app/(tabs)/dashboard.tsx`.
   - Stat counters now bucket approved RSVPs into `pending` so totals stay correct.

**Why this is safe:**
- API contract is unchanged — `requested_quantity` is already in the response (`apps/web/app/api/user/tickets/route.ts:110, 449`) and on `UserTicket` (`packages/lib/src/types/ticket.ts:34`).
- The supersession filter mirrors the server-side dedup intent (`route.ts:406-421`); during the race we do client-side what the server would do once the order row catches up.
- TypeScript narrows the union — any forgotten `ready_to_buy` reference would have been a compile error. None remain in the active code path; only legacy Phase 4 mock fixtures (`apps/mobile/data/mock.ts`, unused) still contain the literal.
- No schema or migration change.

**Files:**
- `apps/web/app/lib/utils/user-ticket-mappers.ts`
- `apps/web/app/components/UserDashboard.tsx`
- `apps/mobile/lib/user-ticket-mappers.ts`
- `apps/mobile/components/dashboard/TicketCard.tsx`
- `apps/mobile/components/dashboard/StatsGrid.tsx`
- `apps/mobile/app/(tabs)/dashboard.tsx`

---

### 153. My Tickets — pending RSVP price showed base ticket price instead of user-facing total with fees (Apr 30, 2026)

**Reported (web + mobile):** Continuation of #149. After the qty fix, a pending RSVP for 2 tickets correctly showed quantity = 2, but the price displayed was the **base** value (e.g. `$50.00` for 2 × $25 base) instead of the **user-facing total** the user actually saw and committed to at request time (e.g. `$55.99`, base + service fee). Once the RSVP was approved and tickets were issued, the same group flipped to the correct `$55.99` because that path reads `order.total_cents`. The pending state was the only one displaying base instead of total.

**Root cause:** `formatCostDisplay` in both mappers fell back to `pricePerUnit × totalQuantity` whenever `totalCost` (sum of `order.total_cents` across the group) was missing — which is always true for pending RSVPs (no order row exists yet). `pricePerUnit` is the tier's base or the stage's `price_cents`, neither of which include the platform's percentage + fixed fee. Result: pending RSVPs showed the organizer-net base, not the customer-paid total.

The data was already there server-side. The `rsvps` table (`supabase/migrations/20260128000000_baseline.sql:3495-3498`) stores `base_price_cents`, `markup_percent`, `markup_fixed_cents`, and **`total_amount_cents`** at request time — exactly the user-facing total seen on the RSVP confirmation. The web my-tickets API and the mobile Supabase query just never selected those columns, so the mappers couldn't read them.

**Fix:**

1. **Selected the new columns** on both surfaces:
   - Web: added `base_price_cents, total_amount_cents, discount_amount_cents` to the rsvps `.select()` in `apps/web/app/api/user/tickets/route.ts`. The `...rsvp` spread in the response mapper picks them up automatically.
   - Mobile: added the same three columns to `RSVP_SELECT` and `RsvpRow` in `apps/mobile/hooks/useUserTickets.ts`, and explicitly forwarded them in the formatted RSVP object so they survive the row-to-`UserTicket` rebuild.

2. **Extended the shared `UserTicket` type** (`packages/lib/src/types/ticket.ts`) with the three optional RSVP-only fields. Comment explicitly notes they are unused once an order/ticket exists (the ticket row's `order.total_cents` takes over) — avoids future confusion about which field to trust at which lifecycle stage.

3. **Mappers now use server-stored total when present** (`apps/web/app/lib/utils/user-ticket-mappers.ts`, `apps/mobile/lib/user-ticket-mappers.ts`):
   - `groupTicketsByEventAndTier` aggregates `rsvpTotalCents` across all RSVP rows in the group — handles the (rare) case of multiple pending RSVPs for the same event+tier.
   - `formatCostDisplay` gained a `rsvpTotalCents` parameter and a new branch:
     ```ts
     if (ticket.type === "rsvp" && rsvpTotalCents != null && rsvpTotalCents > 0) {
       return formatCentsAsPrice(rsvpTotalCents, currency);
     }
     ```
   - The legacy `pricePerUnit × qty` fallback remains for any row that predates the column being populated (defensive — in practice all new RSVPs will have `total_amount_cents`).

**Why this is safe:**
- Source of truth is the server-side total computed at request time using `calculateFee()` (`packages/lib/src/stripe/fees.ts`). No client-side fee math is added — we just surface what the server already wrote. Matches the master-rule "Calculate fees server-side only" in `project-flame-master.mdc` Section 5.
- The `total_amount_cents` column is already populated for every new RSVP (the request flow writes it alongside `base_price_cents`). For older legacy RSVPs without it, the fallback to `base × qty` keeps display non-empty.
- No schema or migration change.
- Type addition is purely additive (optional fields) — no existing callers break.

**Verification:**
- `pnpm --filter web exec tsc --noEmit` clean for web changes.
- `packages/lib` types compile.
- Manual verification path: request RSVP for qty 2 → My Tickets shows `2` qty + total-with-fees price → organizer approves → issued ticket cards show same total via `order.total_cents` (parity).

**Files:**
- `packages/lib/src/types/ticket.ts`
- `apps/web/app/api/user/tickets/route.ts`
- `apps/web/app/lib/utils/user-ticket-mappers.ts`
- `apps/mobile/hooks/useUserTickets.ts`
- `apps/mobile/lib/user-ticket-mappers.ts`

---

### 154. Mobile checkout sheet silently diverged from Stripe authorization on events with custom markup (Apr 30, 2026)

**Reported:** On a $100 ticket for a FLAME Demo event, the mobile checkout payment sheet showed `$110.99` (correct for the system default 10% + $0.99 markup) but the Stripe `uncaptured` amount was `$112.80`. The My Tickets card — after #150 — also showed `$112.80`, which initially looked like a regression introduced by that fix. It wasn't: the card was now correctly surfacing the server-authoritative `rsvps.total_amount_cents`. The real bug was that the checkout sheet had been displaying a different (lower) number than what the server was actually authorizing the entire time, and #150 made it visible.

**Root cause:** Two pricing computations on the same request:

| Surface | Source | Markup used |
|---|---|---|
| Mobile checkout sheet (estimate) | `apps/mobile/hooks/useCheckout.ts:288-301` → `calculateFee(afterDiscount, DEFAULT_PLATFORM_FEE_PERCENT, DEFAULT_FIXED_FEE_CENTS)` | system default 10% + $0.99 (hardcoded) |
| `create-payment-intent` → Stripe + `rsvps.total_amount_cents` | `apps/web/app/api/purchase/create-payment-intent/route.ts` → `getEventMarkup(eventId, currency)` | event row's `markup_percent` / `markup_fixed_cents` |

For the 5 FLAME Demo events seeded on 2026-04-15, `events.markup_percent = 12.5` and `events.markup_fixed_cents = 30`. Math: `$100 × 1.125 + $0.30 = $112.80`. The user saw $110.99 in the sheet, agreed to it, and then Stripe authorized $112.80. Production was unaffected by chance — all 17 prod events use defaults, so the broken estimate happened to match the server result.

The misleading comment `"display only — server is authoritative"` was only half true: server *is* authoritative *after* the PaymentIntent is created (`serverAmounts` overrides estimates downstream), but the sheet renders the estimate first, and for RSVPs/holds the user commits to that estimate before the PI exists. So the user-facing total had to be correct in the estimate too.

**Fix:**

1. **Plumb event markup to the client** (`apps/mobile/hooks/useEventDetails.ts`): added optional `markup_percent?: number` and `markup_fixed_cents?: number` to `EventDetail`. The `get_event_with_tiers` RPC already returns these via `to_jsonb(events)` and the Zod `EventSchema` uses `.passthrough()`, so the values were already arriving as JSON numbers — they just weren't being read.

2. **Use event markup in the pre-PaymentIntent estimate** (`apps/mobile/hooks/useCheckout.ts:288-307`):
   ```ts
   const feePercent = event?.markup_percent ?? DEFAULT_PLATFORM_FEE_PERCENT;
   const feeFixedCents = event?.markup_fixed_cents ?? DEFAULT_FIXED_FEE_CENTS;
   feeCalc = calculateFee(afterDiscount, feePercent, feeFixedCents);
   ```
   Updated the `useMemo` deps to include both fields. Defaults are kept as a fallback only for older clients/rows where the columns aren't present — every active event row currently has them populated.

3. **Normalized the FLAME Demo events to default markup via MCP SQL** (data cleanup):
   ```sql
   UPDATE events
      SET markup_percent = 10, markup_fixed_cents = 99
    WHERE id IN (
      'c1ef256c-747b-48a1-96b9-aeeaf3abf408',  -- Open Gate Festival
      'b5a53b2b-c897-4f6a-a6eb-7274dd829f75',  -- Chromatic Pulse
      '308e9bd3-9f12-4464-8749-64057120caee',  -- Afterglow
      'eabe8908-9076-4869-89f8-c7b25d05436f',  -- Horizon Sessions
      'e4e6da25-0982-424c-84d8-716b3f39f8db'   -- Red Horizon
    );
   ```
   Post-update verification: zero events left with non-default markup. Demo experience now matches what real customers see in production.

**Why both steps?** The data cleanup alone would only paper over the bug — `events.markup_percent` / `events.markup_fixed_cents` are a real first-class feature (per-event markup overrides for partner deals, etc.). The moment any future event ships with non-default markup, the silent overcharge would return without the code fix. The data cleanup is purely about giving the demo events a representative experience.

**Why web was unaffected:** Web's purchase UI does not compute fee estimates client-side at all — `apps/web/app/components/StripePurchaseFlow.tsx` and `apps/web/app/components/modals/RsvpPaymentModal.tsx` both display only what `create-payment-intent` returns. The bug was mobile-only.

**Severity context:** Real silent-overcharge bug for any event with non-default markup. User saw $X, Stripe held $Y > $X. Chargeback risk if a customer disputed the difference. Currently no production exposure (all prod events use defaults), but the fix prevents recurrence the moment any event is created with custom markup.

**MCP-confirmed evidence chain (FLAME Demo: Horizon Sessions, $100 ticket):**
- Event row: `markup_percent = 12.5`, `markup_fixed_cents = 30` (pre-update)
- RSVP `088e0e05-…`: `base_price_cents = 10000`, `total_amount_cents = 11280`, with the same markup snapshot
- Stripe PaymentIntent `pi_3TRy0x…` (test mode): authorized $112.80
- Mobile sheet (pre-fix): displayed $110.99 ← divergence

After the code fix + RPC pull-to-refresh, all three surfaces displayed `$112.80` consistently while the demo events still had custom markup, then dropped to `$110.99` consistently after the SQL normalization — confirming both the bug class and the fix.

**Verification:**
- `tsc` clean across `useCheckout.ts` + `useEventDetails.ts`.
- Manual test on `eabe8908-…` (Horizon Sessions) before SQL update → sheet shows $112.80 (matches server). After SQL update + refresh → sheet, server, and My Tickets all show $110.99.
- Stale RSVP `088e0e05` was already in `rejected` status when this concluded; no further cleanup needed.

**Files:**
- `apps/mobile/hooks/useEventDetails.ts` (added `markup_percent` / `markup_fixed_cents` to `EventDetail`)
- `apps/mobile/hooks/useCheckout.ts` (use event markup in pre-PaymentIntent estimate)
- Data: `events` rows for the 5 FLAME Demo events (markup normalized to 10% + $0.99)

---

### 155. New pending RSVP silently hidden from My Tickets when the user already had issued tickets for the same event+tier (Apr 30, 2026)

**Reported (mobile):** User submitted an RSVP for 3x Horizon Sessions Early Bird. Stripe authorized the test PaymentIntent (uncaptured) correctly, the row was written to `rsvps` (`01b4f415-…`, status `pending`, `requested_quantity = 3`, `total_amount_cents = 6039`), and the organizer dashboard showed the request. The user's own My Tickets page showed nothing — no pending card surfaced even after pull-to-refresh. Same defect existed on web.

**Root cause:** The mapper's grouping key in both surfaces was `${eventId}-${tierId}`. The user already had 2 issued tickets from a previous purchase (`470f4575`) on the **same event + tier**, so the new pending RSVP joined the same group. The in-group dedup added in #149/#150 then ran:

```ts
const countableTickets = hasIssuedTickets
  ? group.filter((t) => t.type !== "rsvp")
  : group;
```

The dedup's original intent was the post-approval race (an approved RSVP and its just-issued tickets briefly returning together). It worked correctly there. But the predicate `t.type !== "rsvp"` over-fires whenever the user has *any* historical ticket purchase for that event+tier — it discards all RSVPs in the group, including a brand-new pending one that has nothing to do with the old fulfilled tickets. The new request silently disappeared from the attendee's My Tickets while still being charged-pending in Stripe and visible to the organizer.

The data was never the problem: API row reached the client, RLS allowed SELECT (`Users can view their own RSVPs` policy), `formattedRsvps` produced the row, and the API-level filter at `useUserTickets.ts:452-457` only excludes approved free-promo RSVPs (still correct). The mapper was the sole filter that hid it.

**Fix:** Split the grouping key so pending RSVPs each get their own group:

```ts
const isPendingRsvp =
  ticket.type === "rsvp" && ticket.status === "pending";
const key = isPendingRsvp
  ? `${eventInfo.id}-${tierInfo.id}-rsvp-${ticket.id}`
  : `${eventInfo.id}-${tierInfo.id}`;
```

Each pending RSVP becomes its own card; issued/checked-in tickets continue to group by event+tier so a multi-ticket order still rolls up into one card. The fix is parallel in `apps/mobile/lib/user-ticket-mappers.ts` and `apps/web/app/lib/utils/user-ticket-mappers.ts`.

**Why pending only — why not also approved RSVPs:** Approved RSVPs intentionally still group with issued tickets so the existing post-approval-race dedup keeps working. When the organizer approves and the backend issues tickets, the API may briefly return both the approved RSVP and the new ticket rows. With pending-only split, that window still falls into the existing `${eventId}-${tierId}` bucket, `hasIssuedTickets = true`, the approved RSVP gets dropped, the user sees only the issued-tickets card. Behavior preserved.

**Why this is safe:**
- No schema or migration change.
- API contracts unchanged on both surfaces (`apps/web/app/api/user/tickets/route.ts` and `apps/mobile/hooks/useUserTickets.ts`).
- Only the local grouping key inside the mapper is altered; downstream consumers (`UserDashboard.tsx`, mobile dashboard tabs, `TicketCard`) operate on `TicketGroupDisplay[]` and don't care about the key shape.
- The post-approval-race dedup path is untouched — verified by reading the surrounding `countableTickets`/`hasIssuedTickets` logic; it still applies to approved RSVPs that share a group with issued tickets.
- Pre-existing behavior for users with no historical purchases is identical: a single pending RSVP in its own group is structurally equivalent to a single pending RSVP in a `${eventId}-${tierId}` group.

**MCP-confirmed evidence chain:**
- `rsvps.01b4f415-…`: status `pending`, `requested_quantity = 3`, `base_price_cents = 5400`, `total_amount_cents = 6039`, `markup_percent = 10`, `markup_fixed_cents = 99` (post-#151 normalization), `stripe_payment_intent_id = pi_3TRyXp0ZpXvpN6T319ls35G5` (test mode).
- Pre-existing `rsvps.470f4575-…` for same `event_id`/`ticket_tier_id`/`stage_id`: status `purchased`, fulfilled into 2 issued ticket rows.
- RLS policy `"Users can view their own RSVPs"` on `rsvps` allows SELECT for the authenticated user → row reaches the mobile client.
- Pre-fix: mapper groups both into `eabe8908…-3ea79e86…` → `hasIssuedTickets = true` → `countableTickets` drops the pending RSVP → 0 pending cards rendered.
- Post-fix: pending RSVP keyed `eabe8908…-3ea79e86…-rsvp-01b4f415…` → standalone group → renders as a "Pending" card showing qty 3 and `$60.39`.

**Verification:**
- Manual on mobile: pull-to-refresh My Tickets after submitting a fresh RSVP for an event+tier where issued tickets already exist → new pending card appears alongside the existing purchased card.
- TypeScript clean across both mappers (`pnpm tsc` parity).
- No regression for the post-approval race: an approved RSVP with newly-issued tickets continues to collapse into a single "Purchased" card via the existing `countableTickets` filter.

**Files:**
- `apps/mobile/lib/user-ticket-mappers.ts`
- `apps/web/app/lib/utils/user-ticket-mappers.ts`

---

### 156. My Tickets stat counters undercounted RSVPs + mobile StatsGrid layout broke after Ready-to-buy removal (Apr 30, 2026)

**Reported (PR review on v1.0.13 second batch):**

1. After #149 made the ticket cards correctly display `requested_quantity` from the mapper, the stat pills above the list still counted **rows**. A pending RSVP for 3 tickets rendered as a card with "Ticket QNT: 3" while the stat pills next to it read "Pending: 1, Total: 1". Same inconsistency on web (`UserDashboard.tsx`) and mobile (`(tabs)/dashboard.tsx`). The Purchased counter was correct because issued tickets are stored 1-row-per-ticket.
2. After #149 removed the "Ready to buy" stat card from mobile, the second `flex-row` in `StatsGrid` held only the "Purchased" card. Because `StatCard` uses `flex-1`, that lone card stretched to the full row width — twice as wide as either card in the first row. Web had migrated to `grid-cols-1 sm:grid-cols-3` for parity but mobile still had the legacy 2-row structure.

**Triage** (per `docs/prompts/starter-pr-prompt.md` review process): Four other inline comments from the auto-reviewer were verified and skipped:

- `formatCostDisplay(group[0])` "mispriced mixed group" (mobile + web mappers): in mixed groups `hasIssuedTickets=true` → `countableTickets` filters out RSVPs → `rsvpTotalCents=0` → falls to legacy branch → `totalCost` (built from full group's `orderMap`) is set → returns the correct issued-tickets total. `group[0]` is only a type discriminator; both branches converge to `totalCost` when an order exists. No actual misprice.
- `CHANGELOG_IOS_VERSIONS.md` missing Web Parity Gate evidence: wrong file. Per `project-flame-master.mdc` Section 9.1 the Parity Gate is a **PR description** requirement for PRs porting web↔mobile logic. `CHANGELOG_IOS_VERSIONS.md` is the user-facing release-notes file — no engineering artifacts belong there. This batch wasn't a port either; identical bugs were fixed in parallel on both apps.
- `APRIL_2026_FIXES.md:3397` MD038 inline-code spaces: inspected — every backticked span on that line (`` `$50.00` ``, `` `$55.99` ``, `` `order.total_cents` ``) is tight. False positive.

The two Bug findings above were verified and fixed.

**Root cause:**

1. Stat counters used `currentTickets.filter(t => t.type === "rsvp" && ...).length` — counts rows, ignores `requested_quantity`. The mapper had been updated in #149 to sum quantities for the per-card display, but the stat-pill aggregation was a separate code path that wasn't updated.
2. `StatsGrid` was structured as two `flex-row` containers (top: Total + Pending, bottom: Purchased + Ready to buy). Removing Ready to buy left a single `flex-1` child in the second row, which expands to fill 100% of the row's width.

**Fix:**

1. **Stat counter sums `requested_quantity` for RSVPs** (web `UserDashboard.tsx`, mobile `(tabs)/dashboard.tsx`):
   ```ts
   const pending = currentTickets
     .filter(t => t.type === "rsvp" && (t.status === "pending" || t.status === "approved"))
     .reduce((sum, t) => sum + (t.requested_quantity ?? t.quantity ?? 1), 0);
   ```
   `purchased` keeps `.length` because issued tickets are 1-row-per-ticket. `total = purchased + pending` continues to work because both counters now express the same unit (tickets, not rows). Pending RSVP for 3 tickets → card "QNT: 3" + pill "Pending: 3, Total: 3" — consistent.

2. **Mobile `StatsGrid` collapsed to a single 3-card row** (`apps/mobile/components/dashboard/StatsGrid.tsx`):
   ```tsx
   <View className="px-4">
     <View className="flex-row gap-2">
       <StatCard label="Total" value={`${totalTickets}`} />
       <StatCard label="Purchased" value={`${purchased}`} />
       <StatCard label="Pending" value={`${pending}`} />
     </View>
   </View>
   ```
   Three `flex-1` cards split the row evenly. Dropped the " tickets" suffix on the value to match web's number-only `StatPill` rendering — three labelled cards on phone widths would crowd the value otherwise. Labels and order ("Total", "Purchased", "Pending") now match web exactly.

**Why this is safe:**
- Stat counter change is purely additive at the math layer; UI binding to `ticketStats.pending` / `.total` is unchanged.
- StatsGrid's external prop shape (`totalTickets`, `pending`, `purchased`) is unchanged — only the internal layout changed.
- Web `StatPill` already shows numbers without a "tickets" suffix, so mobile now matches that convention.

**Files:**
- `apps/web/app/components/UserDashboard.tsx`
- `apps/mobile/app/(tabs)/dashboard.tsx`
- `apps/mobile/components/dashboard/StatsGrid.tsx`
