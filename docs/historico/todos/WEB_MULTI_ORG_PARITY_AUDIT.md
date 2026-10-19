# Web Multi-Org Parity Audit

Tracks web bugs and missing features that correspond to mobile multi-org fixes shipped in APRIL_2026_FIXES.md entries #14, #14a, #14b, #32, #33. These mobile fixes addressed a systematic bug class where organizer screens defaulted to the user's first-joined org instead of the selected org.

**Status:** Full audit completed. Critical fixes applied Apr 14, 2026.

---

## Context

On mobile, organizer screens use `MemberRoleContext.selectedOrgId` → `useOrgData(selectedOrgId)` to scope all queries to the correct org. Before the April 2026 fixes, 9+ files called `useOrgData()` with no argument, always resolving to the oldest org membership.

On web, the equivalent mechanism is:

- **Server-side:** `selectOrganization(userId, selectedOrgSlug)` in `apps/web/app/lib/utils/organization-selection.ts` — reads `?org=` from URL
- **Client-side:** `useOrganizerData()` in `apps/web/app/lib/hooks/useOrganizerData.ts` — fetches `/api/organizer/data` (with or without `?org=`)
- **Dashboard:** `OrganizerDashboard` correctly threads `?org=` through to the API call

The web has a **partially correct** multi-org implementation: the main dashboard page and settings correctly use `?org=`, but several sub-pages and hooks do not.

---

## Confirmed Bugs

### 1. `OrgEventDetailClient` — "Event not found" for non-primary org events — FIXED

**Mobile equivalent:** APRIL_2026_FIXES.md #14, #14a

**File:** `apps/web/app/organizer/event/[id]/OrgEventDetailClient.tsx`

**Bug:** `useOrganizerData()` fetched `/api/organizer/data` with **no `?org=` param**. The API defaults to `selectOrganization(userId, null)` which returns the first approved org. For multi-org users, events belonging to any non-primary org were not found → "Event not found" UI.

**Fix (Apr 14, 2026):** `OrgEventDetailClient` now reads `?org=` from URL via `useSearchParams()` and passes it to `useOrganizerData(orgSlug)`. `DashboardView` already passes `?org=` when navigating to event detail.

### 2. `useOrganizerData()` hook has no org-scoping parameter — FIXED

**Mobile equivalent:** APRIL_2026_FIXES.md #33 (systematic `useOrgData()` missing `selectedOrgId`)

**File:** `apps/web/app/lib/hooks/useOrganizerData.ts`

**Bug:** The hook always fetched `/api/organizer/data` with no query params. The query key was `["organizer-data"]` — it didn't include the org, so switching orgs didn't invalidate the cache.

**Fix (Apr 14, 2026):** Hook now accepts optional `orgSlug?: string | null`. When provided, appends `?org=` to the fetch URL. Query key is now `["organizer-data", orgSlug ?? null]`. Mutation invalidation uses `{ exact: false }` to cover all org variants.

### 3. Co-hosted events not visible in web organizer dashboard

**Mobile equivalent:** APRIL_2026_FIXES.md #14b

**File:** `apps/web/app/organizer/page.tsx`, `apps/web/app/api/organizer/data/route.ts`

**Bug:** The web organizer page loads events with `.eq("organization_id", organization.id)`. Co-hosted events (where the org is in `event_assignments.cohost_organization_id` but not the event owner) are not included. Mobile fixed this by querying `event_assignments` and merging co-hosted events.

**Fix approach:**

1. In `/api/organizer/data`, after fetching owned events, also query `event_assignments WHERE cohost_organization_id = org.id` to get co-hosted event IDs
2. Fetch those events and merge with owned events (deduplicating)
3. Mark co-hosted events so the UI can show a "Co-host with ..." badge

---

## Audit Results (Apr 14, 2026)

Full audit of all organizer pages and navigation paths for `?org=` threading.

### 4. RSVP management sub-route — OK

**File:** `apps/web/app/organizer/rsvps/[id]/page.tsx`

**Result:** Correctly reads `?org=` from `searchParams`, uses it for org resolution, and redirects multi-org users to canonical `?org=` URL when missing. `RsvpManagement.tsx` back button now also preserves `?org=` (was missing — fixed).

### 5. Stripe Connect onboarding from non-primary org — FIXED

**Files:** `apps/web/app/components/PaymentAccountBanner.tsx`, `apps/web/app/components/StripeConnectStatus.tsx`

**Bug found:** `PaymentAccountBanner` navigated to `/organizer/settings?org=${organizationId}` using the **UUID**, but `selectOrganization()` on the settings page expects a **slug**. The UUID never matched any slug, causing fallback to the first approved org → wrong org got onboarded.

**Fix:** `PaymentAccountBanner` now accepts `organizationSlug` prop and uses it for navigation. `DashboardView` passes `currentOrganization.slug`. `OrgSettingsClient` "Go Back" button now preserves `?org=` from URL.

### 6. Create Event from non-primary org — FIXED

**File:** `apps/web/app/components/forms/CreateEventForm.tsx`

**Bug found:** Post-create success redirect used `router.push("/organizer")` without `?org=`. Users landed on their default org, not the one they created the event for.

**Fix:** Success redirect now uses `orgSlug` from `searchParams` (already available in the component). Cancel button was already correct.

### 7. Event export / ticket management — OK (scoped by event)

Event-level tools (ticket lists, orders, promo codes) are scoped by `eventId`, not org directly. As long as the event detail page loads the correct org's events (Bug #1 — now fixed), these tools work correctly.

### 8. Webhook `account.updated` handler — OK

Already uses the correct mechanism (Stripe account ID → org lookup). No org context needed.

### 9. Navbar "MY ACCOUNT" link — Acceptable

**File:** `apps/web/app/components/Navbar.tsx`

Links to `/organizer` without `?org=`. This is acceptable because `organizer/page.tsx` has server-side redirect logic that forces multi-org users to `?org=<slug>`. The Navbar is a global element that doesn't know the current org context. Users will always land on a valid org page.

### 10. Mobile: PayoutsSettingsTab race condition — FIXED

**File:** `apps/mobile/components/settings/PayoutsSettingsTab.tsx`

**Bug:** Used `orgData?.organizationId` (from async `useOrgData`) for `useStripeConnect` instead of `selectedOrgId` directly from context. If `useOrgData` query was stale after an org switch, the old org's ID could be used for onboarding.

**Fix:** Now uses `selectedOrgId ?? undefined` directly from `useMemberRoleContext()` for `useStripeConnect`, bypassing the async `orgData` indirection.

### Low-priority items (deferred)

These navigation paths go to `/organizer` without `?org=` but are non-critical because the server redirect catches them:

- `CreateOrganizationForm.tsx` — redirects to `/organizer` after creating a new org (server redirect selects the new org)
- `HostBanner.tsx`, `HomeContent.tsx` — public-facing "create event" CTAs (user hasn't selected an org yet)
- `OnboardingModal.tsx`, `onboarding/page.tsx` — post-onboarding redirect (single org at this point)
- `QRScannerApp.tsx`, `EnterCodeModal.tsx` — scanner exit links (server redirect handles it)
- `api/stripe/connect/return/route.ts` error paths — edge cases where auth was lost (require re-auth anyway)
- `maintenance/page.tsx` — admin-only page

---

## Stripe Connect Improvements (Shipped)

### 9. Pass org name to Stripe Express account (business_profile.name)

**Status:** Code fix prepared (not yet deployed).

**Files changed:**

- `apps/web/app/lib/stripe/connect.ts` — `createExpressAccount` now accepts `options.businessName` and sets `business_profile.name`
- `apps/web/app/api/stripe/connect/onboard/route.ts` — passes `org.name` to `createExpressAccount`

**Result:** New connected accounts will show the org name in the Stripe Dashboard "Connected accounts" list alongside the email, making it easier to identify which account belongs to which org.

---

## Stripe Account Cleanup (Apr 14, 2026)

Cleared 4 incomplete (Restricted) Stripe Express accounts that were created before cross-border payments were activated. These accounts could never complete onboarding.

| Org              | Old Stripe Account          | Action                                      |
| ---------------- | --------------------------- | ------------------------------------------- |
| Kora Experiences | `[STRIPE_ACCOUNT_REDACTED]` | DB cleared, Stripe account pending deletion |
| Zulu Beach Club  | `[STRIPE_ACCOUNT_REDACTED]` | DB cleared, Stripe account pending deletion |
| Hush Experiences | `[STRIPE_ACCOUNT_REDACTED]` | DB cleared, Stripe account pending deletion |
| Casa Famita      | `[STRIPE_ACCOUNT_REDACTED]` | DB cleared, Stripe account pending deletion |

**DB cleanup:** `stripe_account_id`, `stripe_charges_enabled`, `stripe_payouts_enabled` all reset to NULL/false.

**Stripe Dashboard cleanup:** The 4 Express accounts need to be deleted from the Stripe Dashboard manually:

1. Go to [Connected Accounts](https://dashboard.stripe.com/connect/accounts/overview)
2. Click each account → Actions → Delete account
3. Confirm deletion

These orgs can now re-initiate Stripe onboarding and it will work with cross-border payments enabled.

---

## Verification Note: Zulu/Kora Code Cross-Contamination

**User report:** When onboarding Kora, verification codes were sent to the phone/email used during Zulu's onboarding.

**Root cause:** Both orgs are owned by the same person. Stripe Express onboarding sends verification codes to the **individual**, not the business entity. This is expected Stripe behavior — not a code bug.

---

## Full Audit (Apr 14, 2026)

Exhaustive audit of every organizer feature on both web and mobile platforms.

### Additional Bugs Found & Fixed

#### 11. Settings page missing canonical URL redirect — FIXED

**File:** `apps/web/app/organizer/settings/page.tsx`

**Bug:** Unlike `organizer/page.tsx`, the settings page had no redirect for multi-org users without `?org=`. Deep-linking or navigating without `?org=` silently loaded the first approved org's settings — user could unknowingly edit the wrong org's branding or initiate Stripe setup for the wrong org.

**Fix:** Added `approvedMemberships.length > 1` canonical redirect mirroring `organizer/page.tsx`. Preserves `?tab=` param. Error redirect also preserves org slug.

#### 12. ExploreOrganizers broken link (404) — FIXED

**File:** `apps/web/app/components/ExploreOrganizers.tsx`

**Bug:** Organizer circles on the home page linked to `/organizer/${org.slug}` — a route that does not exist (no `app/organizer/[slug]/page.tsx`). Clicking any organizer produced a 404.

**Fix:** Changed to `/events?org=${slug}` (events listing filtered by org). Public organizer profile page can be built later.

#### 13. Org event detail missing URL canonicalization — FIXED

**File:** `apps/web/app/organizer/event/[id]/page.tsx`

**Bug:** For multi-org users, navigating to `/organizer/event/[id]` without `?org=` caused `useOrganizerData()` to load the default org's data. If the event belongs to a different org, it would show "Event not found."

**Fix:** Server page now looks up the event's `organization_id` → org slug and redirects to `?org=<event_org_slug>` for multi-org users without `?org=`.

#### 14. Mobile co-host assignment sheet wrong org — FIXED

**File:** `apps/mobile/app/org-event-detail.tsx`

**Bug:** `useEventAssignments(selectedOrgId)` and `CoHostAssignmentSheet orgId={selectedOrgId}` used the active org from context. When the active org is a co-host (not the event owner), this queries/mutates with the wrong `organization_id` — assignments appear empty or create broken records.

**Fix:** Now uses `ownerOrgId` (`event.organization_id ?? selectedOrgId`) for both `useEventAssignments` and `CoHostAssignmentSheet`. `useCohostEvents` still correctly uses `selectedOrgId` (finds events where *this* org is co-host).

### Confirmed Clean (No Issues)

**Mobile:**
- Event creation — uses `selectedOrgId` → `useOrgData` → `orgData.organizationId` ✓
- Org dashboard — all hooks use `effectiveOrgId`, query keys include org, refresh works ✓
- RSVP management — `useRsvpEvents` scoped by `selectedOrgId` ✓
- QR scanner — uses `effectiveOrgId`, clears session on org change ✓
- Org members — route param from dashboard ✓
- Organization settings tab — `useOrgData(selectedOrgId)` ✓
- All `useOrgData` calls — no bare calls found in codebase ✓
- All `useStripeConnect` calls — correct org IDs ✓
- `MemberRoleContext` — state transitions are synchronous for `effectiveOrgId` ✓

**Web:**
- Event creation — server validates membership on `organization_id` ✓
- OrganizerDashboard — full page reload on org switch, `?org=` threaded to API ✓
- RSVP management — server redirect for multi-org, membership checks on actions ✓
- QR scanner — scoped by dashboard events ✓
- All API routes — server-side membership validation ✓
- Ticket tier CRUD — event → org → membership validation ✓
- Promoter links — event-scoped, membership validated ✓
- Send tickets — event-scoped, server validates ✓
- Exports — use in-memory data from correctly scoped queries ✓
