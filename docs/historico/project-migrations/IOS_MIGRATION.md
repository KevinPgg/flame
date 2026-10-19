# iOS Migration & Mobile App Development

**Status:** In Progress
**Target Date:** March 5, 2026

## 1. Overview

This document tracks the migration and development of the new Project Flame iOS app (`apps/mobile`) within the monorepo structure.

## 2. Architecture

- **Framework:** Expo Managed Workflow (SDK 54)
- **Navigation:** Expo Router (File-based routing) + custom persistent tab bar + role switching (attendee/organizer views)
- **Styling:** NativeWind (Tailwind CSS for Native)
- **Data Fetching:** TanStack Query + Supabase Client ("Load Once, Cache Locally")
- **State Management:** Zustand (Global UI state)

## 3. Completed Milestones

### Phase 1: Foundation (Week 1)
- [x] Initialize `apps/mobile` with Expo Router.
- [x] Configure Metro bundler for monorepo (pnpm workspace).
- [x] Setup `packages/ui` sharing via NativeWind.

### Phase 2: Home Screen (Week 2)
- [x] **UI Implementation:** Built Header, Hero Carousel, Featured Events, Categories, Spotlight, Upcoming Events, and Footer components.
- [x] **Data Integration:** Connected to Supabase via `useAppEvents` hook.
- [x] **Performance:** Implemented "Load Once" strategy to eliminate waterfall loading.
- [x] **Mock Data:** Created SQL seed scripts for testing (`supabase/seed_mock_events.sql`).

### Phase 3: Events Listing & Event Details (Week 3)
- [x] **Events Listing Screen:** Search bar, category filter pills, vertical `EventListCard` list with Figma-matched layout.
- [x] **Navigation:** Stack navigator with native iOS swipe-back gesture (`Slot` → `Stack`). Events list → Event details via `router.push(/event/${id})`.
- [x] **Event Details Screen UI:** Back navigation, event image, organizer name, title/description, info rows (RSVP indicator, date/time, location), ticket tier selection with dynamic states (available/sold_out/not_available_yet/sales_ended), "Continue to Checkout" CTA, footer.
- [x] **TicketTierCard Component:** 4 visual states from Figma (available=green, sold_out=salmon, not_available_yet=gold, sales_ended=salmon).

### Phase 4: UI Design First - Mobile Screens (Weeks 3-4)
- [x] **Ticket Selection UI:** Quantity selector, checkout bottom sheet UI, promo code input UI.
- [x] **User Dashboard UI:** Ticket Wallet (QR Codes) UI, Profile Settings UI. _(Completed Feb 23, 2026.)_
- [x] **Organizer Dashboard UI:** Event Management UI, Stats UI. _(Completed Feb 23, 2026.)_ Scanner (Camera) screen completed in Phase 5B (Feb 26, 2026 — merged Mar 3).
- [x] **Authentication UI:** Sign-in/Sign-up screens UI. _(Completed Feb 18, 2026.)_

### Phase 5A: Audit Existing Logic Against Web (Week 5)

**Goal:** Review all already-integrated mobile logic against the web source-of-truth. These features were built before the Logic Porting Protocol was established and may have drift from the working web implementation. Fix any discrepancies.

**Timing:** The Checkout audit is the highest-priority item and SHOULD begin immediately — it does not depend on Phase 4 UI completion.

**All audits MUST follow the Logic Porting Protocol** (see `project-flame-master.mdc` Section 9). Read the corresponding web files first, then compare mobile implementation line-by-line.

- [x] **Home Screen Data Integration:** Connected to Supabase, "Load Once" pattern, RLS recursion fix. **Audit complete (Feb 24, 2026) — see FEB_2026_FIXES.md #186.** Two issues fixed: (1) `isEventActive`/`filterActiveEvents`/`filterPastEvents`/`separateEventsByDate` extracted to `@project-flame/lib`; (2) `description` field added to `EventCardData` and search filter in `events.tsx`. No other drift found.
- [x] **Event Details Logic (built):** `get_event_with_tiers` RPC, `useEventDetails` hook, dynamic states logic.
- [x] **Checkout Logic (built):** Clerk auth, Stripe PaymentSheet, `useCheckout` hook (direct purchase + RSVP + free flows), promo code validation, authenticated API client.

#### Checkout Audit Checklist (HIGHEST PRIORITY) — **COMPLETE (Feb 24, 2026) — see FEB_2026_FIXES.md #190**

**Mobile:** `hooks/useCheckout.ts`, `components/event-details/CheckoutMainSheet.tsx`, `CheckoutSuccessState.tsx`, `CheckoutProcessingState.tsx`, `lib/api.ts`
**Web:** `components/EventDetail.tsx` (RSVP submission flow), `components/modals/RsvpPaymentModal.tsx` (RSVP paid authorization), `components/StripePaymentForm.tsx`, `lib/stripe/fees.ts`, `lib/utils/purchase-calculations.ts`, `lib/utils/purchase-data.ts`, `api/holds/create/route.ts`, `api/purchase/create-payment-intent/route.ts`, `api/purchase/complete-hold-free/route.ts`, `api/purchase/validate-promo-code/route.ts`

> **Note:** `StripePurchaseFlow.tsx` is a **legacy** path for token-based post-approval RSVP payment (organizer approves → user receives email with payment link). That flow is no longer active — no email is sent to trigger it. The current RSVP payment source-of-truth is `EventDetail.tsx` → `RsvpPaymentModal.tsx` (same-session inline payment). Do not reference `StripePurchaseFlow.tsx` for RSVP logic going forward.

- [x] **API Endpoints:** `POST /api/holds/create` request shape matches web schema exactly (`event_id`, `ticket_tier_id`, `quantity`, `stage_id?`). `POST /api/purchase/create-payment-intent` request shape confirmed (hold flow: `holdId` only; RSVP flow: `flow`, `eventId`, `ticketTierId`, `quantity`, `stageId?`, `promoCode?`). `POST /api/purchase/complete-hold-free` uses correct `holdSessionId` + `promotional_code_id?` body.
- [x] **Shared Functions:** `calculateFee` and `DEFAULT_PLATFORM_FEE_PERCENT`/`DEFAULT_FIXED_FEE_CENTS` from `@project-flame/lib` used for client-side estimates. `formatCentsAsPrice` from `@project-flame/lib` used in `CheckoutMainSheet`. No manual division by 100. No local fee reimplementations.
- [x] **State Machine:** Mobile `CheckoutStep` enum (`idle→creating_hold→creating_payment_intent→presenting_sheet→success/error`) maps directly to web's boolean state flags. Server amounts ALWAYS override client estimates once available.
- [x] **Edge Cases:** Free-tier (no promo), promo-discounted, 100%-promo (free path), RSVP-free, RSVP-paid, payment cancellation/retry — all flows verified.
- [x] **Bug Fix #1 (Critical):** Added `stageId` to RSVP paid PI creation request — without it, staged-tier RSVP events authorized the wrong amount (base tier price instead of current stage price).
- [x] **Bug Fix #2 (Medium):** Hold cancelled via `POST /api/holds/cancel` on PaymentSheet dismissal (Canceled) and on any error after hold creation — mirrors web's `handleCancelPurchase`. Prevents 30-minute inventory lock after user cancels checkout.
- **Edge cases deferred:** `EDGE_CASES_TODOS.md` #41–44 (promoter_code not passed in hold creation, hold expiry pre-flight not checked before PaymentSheet, RSVP paid cancellation creates orphaned PI without rsvpId link, post-complete-hold-free transient error leaves partial state).

#### Event Details Audit Checklist — **COMPLETE (Feb 24, 2026) — see FEB_2026_FIXES.md #188**

**Mobile:** `hooks/useEventDetails.ts`, `app/event/[id].tsx`, `components/event-details/TicketSelection.tsx`, `components/event-details/TicketTierCard.tsx`
**Web:** `events/[slug]/page.tsx`, `components/EventDetail.tsx`, `lib/hooks/useTicketAvailability.ts`, `lib/utils/quantity-validation.ts`

- [x] **RPC Parity:** `get_event_with_tiers` RPC is mobile's equivalent of web's server-side select + enrichment. Zod validation on response.
- [x] **Tier Status Computation:** Mobile `getTierStatus` maps correctly to 4 states (`available`/`sold_out`/`not_available_yet`/`sales_ended`) using same logic as web's `isTierAvailable`+`isTierNotStarted`+`isTierExpired` trio, including `quantity_reserved` in sold-out check.
- [x] **Pricing Display:** `findFirstAvailableStage` from `@project-flame/lib` used for `displayPrice`. `formatCentsAsPrice` from `@project-flame/lib` used in `TicketTierCard`. No local reimplementations.
- [x] **Quantity Limits:** `maxQuantity = min(available, per_user_limit)` where `available = quantity_total - quantity_sold - quantity_reserved`. Matches web exactly.
- [x] **Quantity Clamping:** `useEffect` in `event/[id].tsx` clamps quantity when `maxQuantity` shrinks.
- [x] **Error Handling:** RPC error → React Query error state → retry button shown. Matches web's `notFound()` equivalent behavior.
- [x] **Shared lib fix:** `isTierAvailable` in `@project-flame/lib` updated to include `quantity_reserved` in sold-out check. 4 new tests added (89 total passing).
- **Edge cases deferred:** `EDGE_CASES_TODOS.md` #37–40 (per_user_limit=0 web divergence, real-time polling gap, stage selection UI, sort order).

#### Auth Audit Checklist — **COMPLETE (Feb 24, 2026) — see FEB_2026_FIXES.md #194**

**Mobile:** `hooks/useSignInHandlers.ts`, `hooks/useOptionalAuth.ts`, `lib/token-cache.ts`, `app/sign-in.tsx`, `app/_layout.tsx`
**Web:** `sign-in/[[...sign-in]]/page.tsx`, `lib/auth.ts`, `lib/user-sync.ts`, `api/auth/sync-current-user/route.ts`, `layout.tsx`

- [x] **OAuth Flow:** `useSSO` + `startSSOFlow({ strategy: "oauth_google" })` with `WebBrowser.warmUpAsync()` / `coolDownAsync()` is the correct Clerk-recommended Expo equivalent of web's hosted `<SignIn />` OAuth. Net behavior is identical (session created, user navigated home).
- [x] **Email Sign-In:** Double-submission guard (`if (loading) return`), `isSignInLoaded` guard, email/password presence check, `signIn.create({ identifier, password })`, `status === "complete"` check, and post-auth navigation all confirmed correct.
- [x] **Email Sign-Up:** `signUp.create({ emailAddress, password })`, incomplete status handling (email verification pending → "check your email" + switch to sign-in mode) all confirmed correct.
- [x] **Error Extraction:** `getClerkErrorMessage` correctly reads `err.errors[0].message` from Clerk's SDK error structure. Platform-specific to mobile — not extractable to `@project-flame/lib` (no business logic, must not depend on Clerk SDK).
- [x] **Bearer Token:** `lib/api.ts` attaches `Authorization: Bearer ${token}` to all authenticated API calls via `getToken()` from Clerk's `useAuth`. No drift found.
- [x] **`useOptionalAuth`:** Module-level IIFE resolves hook reference once (Rules of Hooks compliant). `isConfigured` flag correctly derived. Fallback returns safe defaults.
- [x] **Token Cache:** `expo-secure-store` backed `TokenCache` is the correct Clerk-recommended approach for native. Acceptable platform divergence from web's cookie-based auth.
- [x] **ClerkProvider:** Conditionally rendered (only when env key is set). `ClerkLoaded` defers rendering until Clerk hydrates. `tokenCache` injected. Matches web's `ClerkProvider` in `layout.tsx` (acceptable divergence: web reads key implicitly, no tokenCache needed).
- [x] **`POST /api/auth/sync-current-user`:** Fully implemented (MARCH_2026_FIXES.md #285). Route now upserts the Clerk user to Supabase via `supabaseAdmin`. Primary sync still happens via JIT in `resolveDbUserFromClerkId` (`lib/auth.ts`) on first authenticated API call; this route serves as an explicit trigger for edge cases (e.g., users who signed up before the webhook was configured).
- [x] **Shared business logic extraction:** Nothing to extract — auth flow contains no pricing, validation, or formatting logic.

### Phase 5B: New Logic Integration (Weeks 5-6)

**Goal:** Integrate logic for remaining screens. **Every implementation MUST follow the Logic Porting Protocol** — read the web source files (see Reference Mapping Table in Section 7 below), document the flow, then port methodically. Never write from scratch.

**Merge rule for all Phase 5 PRs:** Include Phase 5 PR Parity Gate evidence from `project-flame-master.mdc` Section 9.1 (web source mapping, API parity, calculation parity, edge-case verification, web-vs-mobile check).

- [x] **User Dashboard Logic:** Fetch tickets, display real QR codes, update profile data. _(Web source: `UserDashboard.tsx`, `useUserTickets.ts`, `useUserProfile.ts`)_ **Complete Feb 24, 2026 — see FEB_2026_FIXES.md #196.**
- [x] **Organizer Dashboard Logic (events, stats, scanner, RSVP, CRUD):** Wire org-dashboard with `useOrgEvents`, real stats from ticket tiers, loading/error/empty states, pull-to-refresh. QR Scanner, RSVP Management, Event CRUD + Stripe Connect all complete. _(Web source: `DashboardView.tsx`, `api/organizer/data/route.ts`, `QRScannerApp.tsx`, `useQRScanner.ts`)_ **Complete — dashboard Feb 27 #271–#281, RSVP Feb 25 #213, QR Scanner Feb 26 (merged Mar 3), Event CRUD Feb 26 #247–#265.**
- [x] **Authentication Logic:** Connect remaining Clerk auth flows. _(Web source: `lib/auth.ts`, `middleware.ts`. `api/auth/sync-current-user/route.ts` now fully implemented (MARCH_2026_FIXES.md #285) — upserts Clerk user to Supabase. JIT sync via `resolveDbUserFromClerkId` remains the primary path. Auth-gate completion uses `lib/auth.ts` and middleware as source of truth.)_ **Complete Mar 3, 2026 — see FEB_2026_FIXES.md #290.**

### Phase 6: iOS App Polish (Mar 2026) — Complete

**Goal:** UX consistency, error resilience, pull-to-refresh unification, role-based UI, interactive element wiring. Full changelog in `docs/historico/fixes/MARCH_2026_FIXES.md`. Summary reference in that file's appendix (fixes #1–7, #25, #27) with migration patterns for `onEventPress`, `openExternalLink`, sign-out flow, and `SettingsTabs` role gating.

### Phase 7: Production Readiness (Mar 6–7, 2026) — Complete

**Goal:** Fix all web parity gaps, production-blocking issues, and visual polish needed before TestFlight/App Store submission. Full audit results and task prompts in `docs/prompts/prompts_phases.md` (Phase 7 section). Fixes logged in `docs/historico/fixes/MARCH_2026_FIXES.md`.

**Completed (all 3 branches):**
- `p7-critical` — RSVP `stage_id` in all flows, access code (`secret_code`) support + UI, registration form data collection + UI, `oldPaymentIntentId` tracking, push token deregistration on sign-out, EAS config + `.env.example` + dark theme.
- `p7-high` — Promo code & promoter link delete CRUD, promoter link full URL copy + stats, deep link slug routing (`/events/[slug]`), primary red audit (reserved for RSVP tags/badges/brand only), RSVP detail layout (scrollable stats + filters, truncated grid), Force Sign Out removed, auth logs `__DEV__`-gated, notification swipe-to-dismiss rewritten with `Gesture.Pan()` + row height collapse, notification error state, promo Apply loading state, Change Password removed.
- `p7-low` — 10 items deferred to `EDGE_CASES_TODOS.md` (#77–#86), 4 items to `NITPICKS_TODOS.md`.

For features with a web equivalent, follow the Logic Porting Protocol (`project-flame-master.mdc` Section 9) and Web Parity Gate (Section 9.1). For mobile-only features, add an entry to `docs/historico/todos/CRUCIAL_IOS_TO_WEB_TODOS.md`.

#### P7-1: Critical — Checkout Parity & Build Setup (MARCH_2026_FIXES.md #247–#254)

**P7-1a: RSVP `stage_id` parity (MARCH_2026_FIXES #247)**
- `useCheckout` now computes `stageId` once via `getStageId(tier)` at the top of `checkout()`. `stage_id` is included in all three RSVP body variants (free, 100%-promo, post-PaymentSheet) and the direct-purchase hold body.
- **Web source:** `EventDetail.tsx` (`submitRsvpToBackend` sends `stage_id: selectedStageId`), `api/rsvp/route.ts` (validates `metadata.stageId`).
- **Files:** `apps/mobile/hooks/useCheckout.ts`

**P7-1b: Access code (`secret_code`) support (MARCH_2026_FIXES #248)**
- Added `secretCode`/`setSecretCode` state and `errorCode`/`setErrorCode` tracking to `useCheckout`. `secret_code` included in all RSVP variants and direct-purchase hold. On `INVALID_SECRET_CODE`, `secretCode` auto-clears. Access code `TextInput` added to `CheckoutMainSheet` — shown when `errorCode` is `MISSING_SECRET_CODE`/`INVALID_SECRET_CODE` or when a code is already entered.
- **Web source:** `EventDetail.tsx` (`verifiedSecretCode` state, `TicketCodeModal`), `api/holds/create/route.ts`.
- **Files:** `apps/mobile/hooks/useCheckout.ts`, `CheckoutMainSheet.tsx`, `CheckoutSheet.tsx`, `app/event/[id].tsx`

**P7-1c: Registration form data for RSVP (MARCH_2026_FIXES #249)**
- Added `registrationData`/`setRegistrationData` state to `useCheckout`. `registration_data` included in all three RSVP body variants. `CheckoutMainSheet` reads `event.registration_form_config` (passed through from RPC via `.passthrough()`), renders `TextInput` for text/email/number/date fields and checkbox toggles for checkbox fields. Data flows: form inputs → `onRegistrationDataChange` → hook state → RSVP body.
- **Web source:** `EventDetail.tsx` (`registrationData` state, `RegistrationFormModal`), `components/modals/RegistrationFormModal.tsx` (`FormField` interface), `api/rsvp/route.ts`.
- **Files:** `apps/mobile/hooks/useCheckout.ts`, `CheckoutMainSheet.tsx`, `CheckoutSheet.tsx`, `app/event/[id].tsx`

**P7-1d: RSVP promo `oldPaymentIntentId` (MARCH_2026_FIXES #250)**
- Added `activeRsvpPiRef` to `useCheckout` to track the current RSVP PaymentIntent ID. On RSVP PI creation, passes `oldPaymentIntentId: activeRsvpPiRef.current` to `create-payment-intent` (server cancels the old PI). Ref is cleared on RSVP success and `resetCheckout`.
- **Web source:** `RsvpPaymentModal.tsx` (sends `oldPaymentIntentId` on `handleApplyPromoCode`/`handleRemovePromoCode`).
- **Files:** `apps/mobile/hooks/useCheckout.ts`

**P7-1e: Push token deregistration on sign-out (MARCH_2026_FIXES #251, #253b)**
- Created `POST /api/push-tokens/deregister` endpoint (Clerk auth, resolves DB user, deletes `push_tokens` row). `deregisterPushToken` in `notifications.ts` tracks the last registered token; calls deregister endpoint on sign-out. Both `settings.tsx` and `PersonalSettingsTab.tsx` call `deregisterPushToken(getToken)` before `signOut()`. Call is wrapped in a best-effort inner `try/catch` in both files so a deregistration failure never blocks sign-out.
- **Files:** `apps/web/app/api/push-tokens/deregister/route.ts` (new), `apps/mobile/lib/notifications.ts`, `apps/mobile/app/(tabs)/settings.tsx`, `apps/mobile/components/settings/PersonalSettingsTab.tsx`

**P7-1f: Production build setup (MARCH_2026_FIXES #252)**
- Created `apps/mobile/eas.json` with development (simulator, localhost), preview (internal, staging), and production (auto-increment, production) profiles. Created `apps/mobile/.env.example` with all `EXPO_PUBLIC_*` variable names. Cleaned `.env` (removed duplicate Stripe key). Updated `app.json`: `userInterfaceStyle` → `"dark"`, splash `backgroundColor` → `"#000B12"`, added `extra.eas.projectId` placeholder (populate after `eas init`).
- **Files:** `apps/mobile/eas.json` (new), `apps/mobile/.env.example` (new), `apps/mobile/.env`, `apps/mobile/app.json`

**P7-2 env var: `EXPO_PUBLIC_APP_URL` (MARCH_2026_FIXES #271)**
- Added `EXPO_PUBLIC_APP_URL` to `.env.example` and `.env` (default: `https://flme.co`). Consumed by `APP_BASE_URL` in `apps/mobile/app/org-event-detail.tsx` to build shareable promoter links (`promoterLinksDisplay`). **For non-production builds** (staging, local dev), set this to your staging URL or local tunnel so promoter link copy produces the correct domain. Code falls back to `https://flme.co` if the variable is unset.
- **Files:** `apps/mobile/.env.example`, `apps/mobile/.env`, `apps/mobile/app/org-event-detail.tsx`

**P7-1c follow-ups (MARCH_2026_FIXES #253, #254)**
- **#253 — Zod-based form validation:** `CheckoutMainSheet` imports `FormFieldSchema` from `useRsvpManagement.ts` and validates `event.registration_form_config` via `z.array(FormFieldSchema).safeParse(raw)`. Parse failure falls back to `null` so `hasForm` stays `false` and the form block is skipped cleanly.
- **#253b — Best-effort deregistration in `PersonalSettingsTab`:** `deregisterPushToken` wrapped in inner `try/catch`; `signOut`/`queryClient.clear`/`router.replace` always execute regardless of deregistration outcome.
- **#254 — Reset `localFormData` on modal open:** `useEffect([visible, registrationData])` in `CheckoutMainSheet` calls `setLocalFormData(registrationData ?? {})` when the modal becomes visible, ensuring stale form values are cleared between checkouts.

**P7-1 follow-ups (MARCH_2026_FIXES #255, #256)**
- **`app.config.ts` EAS project ID injection:** `apps/mobile/app.config.ts` injects `extra.eas.projectId` from `process.env.EAS_PROJECT_ID` at build time. `app.json` keeps `extra.eas` as an empty object (overridden at build time). `registerForPushNotificationsAsync` reads the value via `Constants.expoConfig?.extra?.eas?.projectId`; a missing env var bails out with a warning instead of sending an invalid ID to the Expo push service.
- **`requiresSecretCode?: boolean` prop:** Optional prop added to `CheckoutMainSheetProps` and `CheckoutSheetProps` (defaults `false`). When set to `true` by the caller (tier flag known upfront), the access code `TextInput` is surfaced before any server round-trip, matching Ticketmaster/Eventbrite pre-checkout code-entry patterns.
- **`registration_form_config` runtime validation:** `CheckoutMainSheet` validates `event.registration_form_config` via `z.array(FormFieldSchema).safeParse(raw)` (importing `FormFieldSchema` from `useRsvpManagement.ts`). The `FormField` type is derived as `z.infer<typeof FormFieldSchema>`, keeping TypeScript and runtime schema in sync.
- **`localFormData` reset on modal reopen:** `useEffect([visible, registrationData])` in `CheckoutMainSheet` calls `setLocalFormData(registrationData ?? {})` when the modal becomes visible, clearing stale form values between checkouts.
- **Files:** `apps/mobile/app.config.ts`, `apps/mobile/hooks/useEventDetails.ts`, `apps/mobile/hooks/useRsvpManagement.ts`, `apps/mobile/components/event-details/CheckoutMainSheet.tsx`, `apps/mobile/components/event-details/CheckoutSheet.tsx`, `apps/mobile/lib/notifications.ts`, `apps/mobile/app/(tabs)/settings.tsx`, `apps/web/app/api/push-tokens/deregister/route.ts`, `apps/mobile/app.json`, `docs/historico/project-migrations/IOS_MIGRATION.md`

## 4. Known Issues & Fixes

### Metro Resolution
- **Issue:** Metro couldn't find `@tanstack/react-query` or `react` due to pnpm symlinks.
- **Fix:** Added explicit `extraNodeModules` mapping in `metro.config.js`.

### RLS Recursion
- **Issue:** Infinite recursion in `organization_members` policy blocked data fetching.
- **Fix:** Implemented `get_user_organizations()` SECURITY DEFINER function to bypass RLS safely.

### expo/virtual/env Resolution
- **Issue:** After `npx expo prebuild`, Metro failed to resolve `expo/virtual/env` (virtual module for `EXPO_PUBLIC_*` env vars).
- **Fix:** Added `expo` to `extraNodeModules` in `metro.config.js`.

### Clerk useAuth Outside ClerkProvider
- **Issue:** `useAuth` hook crashed when `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` was empty (provider not rendered).
- **Fix:** Conditional `require` gated on env var presence. Returns safe defaults when Clerk is not configured.

### Stripe Config Plugin merchantIdentifier
- **Issue:** `npx expo prebuild` failed because `@stripe/stripe-react-native` plugin requires `merchantIdentifier`.
- **Fix:** Changed plugin entry in `app.json` from bare string to array with config object.

## 5. Mobile Data Fetching Strategy: "Load Once, Cache Locally"

**Context:** Mobile App Performance Optimization (Feb 10, 2026)

### The Problem with "Fetch-on-Render"
Previously, the mobile app fetched data separately for each section ("Upcoming", "Featured", "Spotlight"). This caused:
- **Waterfall Loading:** Different parts of the screen popped in at different times.
- **Network Chatter:** Multiple redundant requests for the same underlying data (events).
- **Data Drift:** The "Featured" list might show an event that was missing from the "Upcoming" list if they synced at slightly different times.
- **Slow Navigation:** Filtering or switching views required waiting for a new network request.

### The Solution: Unified Fetching

We now fetch **all relevant public data** (e.g., all published events for the next 3 months) in a **single network request** at app startup or screen load.

#### Key Components

1.  **Unified Hook (`useAppEvents`):**
    -   Replaces individual hooks like `useUpcomingEvents` or `useFeaturedEvents`.
    -   Performs one Supabase query to get all `published` events.
    -   Uses **TanStack Query** to cache this result for a set time (e.g., 5 minutes).

2.  **In-Memory Derivation:**
    -   Once the data is in memory, we derive specific lists (Featured, Upcoming, Spotlight) using standard JavaScript array operations (`filter`, `sort`, `map`).
    -   **Benefit:** Filtering is instantaneous (zero latency).

3.  **Single Source of Truth:**
    -   The "Spotlight" event is guaranteed to be the same object reference as the one in the "Featured" list.
    -   This prevents UI inconsistencies.

#### Implementation Details

**File:** `apps/mobile/hooks/useAppEvents.ts`

```typescript
export const useAppEvents = () => {
  return useQuery({
    queryKey: ["events", "all"],
    queryFn: async () => {
      // 1. Fetch ALL relevant events in a single round-trip
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .eq("status", "published")
        .gt("ends_at", new Date().toISOString())
        .order("starts_at", { ascending: true });

      if (error) throw error;

      const rawEvents = data as Event[];

      // 2. Process & Filter in memory (Zero Latency)
      const allEvents = rawEvents.map(mapEventToCardData);
      
      const featuredEvents = rawEvents
        .filter((e) => e.is_featured)
        .map(mapEventToCardData);

      const upcomingEvents = allEvents.slice(0, 6);

      // 3. Derive Spotlight
      const spotlightSource = rawEvents.find((e) => e.is_featured) || rawEvents[0];
      const spotlightEvent = spotlightSource ? mapEventToSpotlightData(spotlightSource) : null;

      return {
        allEvents,
        featuredEvents,
        upcomingEvents,
        spotlightEvent,
      };
    },
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
  });
};
```

#### Best Practices for Mobile

1.  **Prefetching:** Trigger the `useAppEvents` query as early as possible (e.g., in the root layout) so data is ready when the user navigates.
2.  **Optimistic Updates:** For user actions (like bookmarking), update the local cache immediately while sending the request to the server.
3.  **Background Refresh:** TanStack Query handles refetching in the background when the app comes into focus, ensuring data stays fresh without blocking the UI.

### Phase 4: Ticket Purchase & Checkout (Week 4) -> Refactored into Phase 4 and 5
- [x] **Clerk Authentication:** `@clerk/clerk-expo` + `expo-secure-store` for token caching. `ClerkProvider` wraps app (optional, gracefully degrades when key not set). Authenticated API client (`lib/api.ts`) passes Bearer tokens to existing web API routes. Clerk hooks conditionally loaded only when env key is present.
- [x] **Sign-In Screen UI:** Google OAuth via Clerk's `useSSO` hook (`expo-web-browser` + `expo-auth-session`), email/password sign-in, and sign-up mode toggle. Browser warm-up for faster OAuth redirects.
- [x] **Stripe React Native:** `@stripe/stripe-react-native` with conditional import (Expo Go compatible). `StripeProvider` in layout. Config plugin in `app.json` with `merchantIdentifier`. Requires dev build (`npx expo prebuild`) for native PaymentSheet.
- [x] **Quantity Selection UI:** `TicketTierCard` updated with `isSelected` state (red border), inline `QuantitySelector` (+/- buttons, 36px circles), and `maxQuantity` constraint (min of available, `per_user_limit`). Single tier selection at a time.
- [x] **Checkout Bottom Sheet UI:** `CheckoutSheet` modal with order summary, promo code input/validation, price breakdown (subtotal/discount/service fee/total), and dynamic pay button. Uses `formatCentsAsPrice` and `calculateFee` from `@project-flame/lib`.
- [x] **useCheckout Hook:** Full checkout flow state machine:
  - Direct purchase: hold → PaymentIntent → PaymentSheet → success (webhook creates order)
  - RSVP paid: PaymentIntent (manual capture) → PaymentSheet → submit RSVP → awaiting approval
  - Free (promo): hold → PI → complete-hold-free → success
  - Free RSVP: submit RSVP directly
- [x] **Shared Lib Refactor:** Replaced custom `formatPrice` with `formatCentsAsPrice` from `@project-flame/lib`. Fixed import paths.
- [x] **Dev Build Setup:** `app.json` config plugins (Stripe + SecureStore), `npx expo prebuild` for native modules, `.gitignore` updated for `ios/`/`android/` directories.
- [x] **Metro Fixes:** Added `expo`, `expo-web-browser`, `expo-auth-session`, `@clerk/clerk-expo`, `@stripe/stripe-react-native`, `expo-secure-store` to `extraNodeModules`. Fixed `expo/virtual/env` virtual module resolution.

## 6. Next Steps

### Completed — Phase 4 UI (Feb 2026)

All Phase 4 UI screens built from Figma: User Dashboard, Organizer Dashboard (including Scanner), Authentication. All replaced with real data in Phase 5.

### Completed — Phase 5A Audits (Feb 24, 2026)

All audits complete: Home Screen, Checkout (highest priority), Event Details, Auth. See FEB_2026_FIXES.md #186–#194.

### Completed — Phase 5B New Logic (Feb 25 – Mar 3, 2026)

All logic integration complete:
1. **User Dashboard Logic** — Feb 25 (#196, #206–#208)
2. **Organizer Dashboard Logic** — Dashboard wiring Feb 27 (#271–#281), RSVP Feb 25 (#213), QR Scanner Feb 26 (merged Mar 3), Event CRUD Feb 26 (#247–#265)
3. **Authentication Logic** — Mar 3 (#290)

### Completed — Push Notifications (Mar 4, 2026)

Full push notification system implemented via Expo Push Service:
- **DB:** `push_tokens` and `notifications` tables with RLS, `notification_preferences` column on `users`.
- **Mobile:** `expo-notifications` + `expo-device` installed, token registration on sign-in, deep link handling on tap, real data in `NotificationsOverlay` with unread badge.
- **Web:** `/api/push-tokens/register` endpoint, `lib/push-notifications.ts` utility (sendPushNotification, sendPushToOrgMembers, sendPushToEventTicketHolders), preference check before send.
- **Triggers wired:** `rsvp_approved`, `rsvp_rejected`, `rsvp_pending`, `new_rsvp_request`, `event_date_changed`, `ticket_sold`, `auth_expiry_warning` (replaced stub + added Brevo email), `event_reminder` (cron every 6h).
- **User settings:** Notification preference toggles in PersonalSettingsTab.

### Completed — Navigation Restructuring + Role Switching (Mar 5, 2026)

Major navigation architecture change:
- **Persistent custom tab bar** in root layout (visible on all screens except sign-in/scanner).
- **View mode switching:** Org users can toggle between "Attending" and "Hosting" via header pill + bottom sheet.
- **Attendee tabs:** Home, My Tickets, [+] Create, Search/Discover, Settings. Search tab routes to `/discover` (hero carousel, partner logos, "Discover Events").
- **Organizer tabs:** Dashboard, Create Event, RSVP, Settings.
- **Attendee Home behavior (Mar 5):** Home now opens the all-events feed (search/filter + vertical list). Legacy discovery content moved to `/discover` and is reachable from in-feed CTA ("Featured events, organizer and more").
- **"Become an Organizer" form:** Non-org users can apply via bottom sheet (calls `POST /api/organizations`).
- **Events Management merged into Dashboard** drill-down: Dashboard → org-event-detail → Edit button → `/edit-event`.
- **Home scroll-to-top** on re-tap of Home tab.
- See MARCH_2026_FIXES.md #163.

### Remaining

1. **Testing + buffer** (~0.5 day)
2. **App Store Submission:** Screenshots, metadata, TestFlight beta.

## 7. Web-to-Mobile Reference Mapping

This table maps every mobile feature to its web source-of-truth files. **Read the "Web Source Files" column BEFORE writing any mobile logic.** For the full Logic Porting Protocol (7-step process) and PR Parity Gate, see `project-flame-master.mdc` Section 9 and Section 9.1.

**Data Access column key (updated Feb 25, 2026):**
- **Direct Supabase** — Mobile queries Supabase directly via `lib/supabase-auth.ts` (Clerk JWT + RLS). Port the query shape from the web route, not the API call.
- **Web API** — Mobile calls the web API via `lib/api.ts` (for writes needing server secrets: Stripe, email, admin ops).

All web paths are relative to `apps/web/app/`. All mobile paths are relative to `apps/mobile/`.

### Authentication

| Mobile File | Web Source Files (Read These First) | API Endpoints Used |
| --- | --- | --- |
| `hooks/useSignInHandlers.ts` | `sign-in/[[...sign-in]]/page.tsx`, `lib/auth.ts`, `lib/user-sync.ts` | `POST /api/auth/sync-current-user` (optional explicit sync; primary sync is JIT via `resolveDbUserFromClerkId` on first authenticated API call) |
| `hooks/useOptionalAuth.ts` | `layout.tsx` (ClerkProvider setup), `lib/auth.ts` | — |
| `lib/token-cache.ts` | N/A (mobile-only, uses `expo-secure-store`) | — |

### Home & Events Listing

| Mobile File | Web Source Files (Read These First) | API Endpoints Used |
| --- | --- | --- |
| `hooks/useAppEvents.ts` | `lib/hooks/useEvents.ts` (`useHomepageEvents`, `useEvents`), `lib/utils/event-filters.ts` | Direct Supabase query |
| `app/events.tsx` + `components/events/*` | `events/page.tsx`, `components/EventsCatalog.tsx`, `lib/utils/event-filters.ts` | Direct Supabase query |

### Event Details & Ticket Selection

| Mobile File | Web Source Files (Read These First) | API Endpoints Used |
| --- | --- | --- |
| `hooks/useEventDetails.ts` | `events/[slug]/page.tsx`, `components/EventDetail.tsx`, `lib/hooks/useTicketAvailability.ts`, `lib/utils/quantity-validation.ts` | RPC `get_event_with_tiers` |
| `components/event-details/TicketTierCard.tsx` | `components/EventDetail.tsx` (tier rendering section) | — |
| `components/event-details/TicketSelection.tsx` | `components/EventDetail.tsx` (quantity selection), `lib/utils/quantity-validation.ts` | — |

### Checkout & Payment

| Mobile File | Web Source Files (Read These First) | API Endpoints Used |
| --- | --- | --- |
| `hooks/useCheckout.ts` | `components/EventDetail.tsx` (RSVP: `handleRsvpSubmit` + `submitRsvpToBackend`), `components/modals/RsvpPaymentModal.tsx` (RSVP paid authorization), `components/StripePaymentForm.tsx`, `lib/stripe/fees.ts`, `lib/utils/purchase-calculations.ts`, `lib/utils/purchase-data.ts`. **Legacy (do not use for new work):** `components/StripePurchaseFlow.tsx` (token-based post-approval payment — inactive, no email sends to trigger it). | `POST /api/holds/create`, `POST /api/purchase/create-payment-intent`, `POST /api/purchase/complete-hold-free`, `POST /api/rsvp` |
| `components/event-details/CheckoutMainSheet.tsx` | `components/PriceBreakdownDisplay.tsx`, `components/PromotionsSection.tsx` | `POST /api/purchase/validate-promo-code` |
| `lib/api.ts` | `lib/stripe/stripe-client.ts`, `lib/auth.ts` (auth headers pattern) | — |

### User Dashboard (COMPLETE — Phase 5B, Feb 25, 2026)

| Mobile File | Web Source Files (Read These First) | Data Access |
| --- | --- | --- |
| `hooks/useUserTickets.ts` | `api/user/tickets/route.ts` (query shape), `components/UserDashboard.tsx` | Direct Supabase (tickets, rsvps, promotional_tickets + stage enrichment + dedup) |
| `hooks/useUserProfile.ts` | `api/user/profile/route.ts`, `api/user/update-cedula/route.ts` | Direct Supabase (read profile); Web API (write cedula via `/api/user/update-cedula`) |
| `hooks/useUserRole.ts` | `lib/roles.ts` (getUserRole, getUserOrganization) | Direct Supabase (users + organization_members) |
| Ticket QR display (`app/ticket/[id].tsx`) | `components/UserDashboard.tsx` (QR modal + promotional ticket generation), `lib/orders.ts` (qrData structure) | Uses `useUserTickets` cache |

### Organizer Dashboard (COMPLETE — Phase 5B, Feb 25–Mar 3, 2026)

| Mobile File (Target) | Web Source Files (Read These First) | Data Access |
| --- | --- | --- |
| `hooks/useOrganizerData.ts` | `lib/hooks/useOrganizerData.ts`, `components/OrganizerDashboard.tsx`, `components/organizer/DashboardView.tsx`, `api/organizer/data/route.ts` | Direct Supabase (events, orders, ticket_tiers — org member RLS) |
| Event management | `components/organizer/EventsTiersView.tsx`, `components/organizer/TierInlineForm.tsx` | Direct Supabase for reads; Web API for writes |
| Per-tier registration form picker (`components/create-event/TierRegistrationFormSheet.tsx`) | `components/organizer/RegistrationFormFieldsModal.tsx` (web sibling); attendee filter in `components/EventDetail.tsx` (RSVP modal) + `app/api/rsvp/route.ts` (server validation). Shared helper: `filterFieldsForTier` in `@project-flame/lib`. | Web API (`POST /api/ticket-tiers`, `PATCH /api/ticket-tiers/:tierId`, `POST /api/events`) — payload includes `registration_form_fields?: string[] \| null` with `null` = inherit, `[]` = none, `[ids]` = subset |
| RSVP management | `components/organizer/RsvpsView.tsx`, `components/RsvpManagement.tsx` | Direct Supabase for reads; Web API for approve/reject (`POST .../[id]/approve`, `POST .../[id]/reject` — may trigger emails) |
| QR Scanner | `components/QRScannerApp.tsx`, `lib/hooks/useQRScanner.ts` | Web API (`POST /api/qr-scanner/verify`, `POST /api/qr-scanner/checkin` — writes) |
| Stripe Connect status | `components/StripeConnectStatus.tsx`, `lib/stripe/connect.ts` | Web API (`POST /api/stripe/connect/onboard`, `GET /api/stripe/connect/status`) |

### Push Notifications (COMPLETE — Mar 4, 2026)

| Mobile File | Web Source Files (Read These First) | Data Access |
| --- | --- | --- |
| `lib/notifications.ts` | `lib/push-notifications.ts` (server dispatch utility) | Web API (`POST /api/push-tokens/register`) |
| `hooks/useNotificationRegistration.ts` | — (mobile-only, registers token on sign-in) | Web API |
| `hooks/useNotifications.ts` | — (mobile-only, reads `notifications` table) | Direct Supabase |
| `hooks/useNotificationPreferences.ts` | — (mobile-only, reads/writes `notification_preferences` on `users`) | Direct Supabase |
| `components/notifications/NotificationsOverlay.tsx` | — (mobile-only UI) | Uses `useNotifications` |
| `components/notifications/NotificationCard.tsx` | — (mobile-only UI) | — |
| `components/home/Header.tsx` (unread badge) | — | Uses `useNotifications` via `_layout.tsx` |

---

## 8. Deployment Prerequisites

### Universal Links (apple-app-site-association)

iOS Universal Links (deep links from `flme.co` for promoter codes, event pages, organizer pages) require the `apple-app-site-association` file to be deployed to `flme.co/.well-known/apple-app-site-association` **with the actual Apple Developer Team ID**.

**Before production deployment:**

1. Open `apps/web/public/.well-known/apple-app-site-association`.
2. Replace `REPLACE_WITH_TEAM_ID` in the `appIDs` entry with your 10-character Apple Developer Team ID (alphanumeric, e.g. `ABC1234DEF`). Find it in [Apple Developer Membership](https://developer.apple.com/account).
3. The final value must be exactly `<TEAM_ID>.com.projectflame.app` (e.g. `ABC1234DEF.com.projectflame.app`).
4. Commit and deploy. Without this, Universal Links will not open the iOS app.
5. **Build-time check:** The web build runs `scripts/verify-apple-app-site-association.js` — it fails **only for production deploys** if `REPLACE_WITH_TEAM_ID` is still present. Previews and local dev skip. Bypass: `SKIP_AASA_VERIFY=1`.

**Post-deploy verification:** Run `curl -i https://flme.co/.well-known/apple-app-site-association` — confirm 200, `Content-Type: application/json`, and the body contains your `<TEAM_ID>.com.projectflame.app` (not `REPLACE_WITH_TEAM_ID`).

---

## 9. Behavioral Changes & Migration Notes (Mar 2026)

This section documents behavioral changes from MARCH_2026_FIXES (#114–#232) that may require developer action or post-deploy verification.

### Scanner org scoping

- **`useQRScanner`** accepts `{ orgId }`. When the user belongs to multiple orgs, the scanner passes `effectiveOrgId = selectedOrgId ?? userOrgs?.[0]?.organizationId ?? null`. All three API calls (`validate-code`, `verify`, `checkin`) include `orgId` when provided.
- **`OrgSelector`** (`components/scanner/OrgSelector.tsx`) renders when the user has 2+ orgs; `selectedOrgId` is threaded from scanner state into `useQRScanner({ orgId })`.
- **API validation:** All three qr-scanner routes reject malformed `orgId` (non-string or empty) with 400. Org-scoping logic runs only when `orgId` is a non-empty string.
- **Session reset:** When `orgId` changes, `useQRScanner` clears `accessCode`, `activeEventId`, and scanner state via `clearEventSession()` so verification/check-in cannot use stale session data from a different org.

### Ticket visibility scoping (`useUserTickets`)

- **Change:** `useUserTickets` now explicitly scopes tickets to the user's own orders: (1) resolve user's DB id from `clerk_id`, (2) fetch user's order IDs, (3) filter tickets with `.in("order_id", userOrderIds)`.
- **Rationale:** The `tickets` table RLS policy "Organization members can view tickets for their events" returns ALL tickets for ALL events in the user's orgs. Without explicit scoping, org members saw inflated quantities (e.g., 329 tickets) on their personal dashboard. The new filter ensures only personal purchases appear.
- **Legacy behavior:** If you relied on org members seeing org-wide tickets on the attendee dashboard, that behavior is removed. Use the organizer dashboard for org-wide ticket views.

### Auth cooldown (`useNotifications`)

- **Change:** When `getToken({ template: "supabase" })` returns null (e.g., Clerk dev rate limit, template misconfiguration), `useNotifications` previously entered an infinite error loop — hundreds of `getToken` calls per second, exhausting Clerk and breaking all auth.
- **Fix:** Token-failure cooldown: after 3 consecutive `getToken` failures, the hook pauses for 60 seconds before retrying. Token errors are logged once as a warning. The failure counter resets when `isSignedIn` changes.
- **Post-deploy:** If users report "app freezes after sign-in" or "all API calls fail", verify Clerk JWT template "supabase" is configured and the Supabase JWT secret matches.

### Navigation & tab changes

- **`CustomTabBar`:** Persistent custom tab bar in root layout; occluded only on `/sign-in` and `/scanner` (presented as fullScreenModal).
- **`useViewMode`:** Role switching (Attendee/Hosting) via header pill + `RoleSwitcherDropdown`. Tab defs and `requiresAuth` gate which tabs are visible.
- **Search tab:** Routes to `/discover` (hero carousel, partner logos, "Discover Events" title).

### Promoter deep-linking & AASA

- **`apple-app-site-association`:** Must be deployed to `flme.co/.well-known/` with the actual Team ID (see Section 8). Without it, promoter links and event/organizer deep links will not open the app.
- **`promoter_code` enrichment:** `event/[id].tsx` parses `promoter` from `useLocalSearchParams` and passes to `useCheckout`. `validatePromoter` in checkout flow enriches the purchase with promoter attribution.
- **Post-deploy:** Run `curl -i https://flme.co/.well-known/apple-app-site-association` to confirm Team ID is present.

### RSVP approvals — past event guard

- **Change:** `useEventRsvps` fetches `ends_at` and computes `isPastEvent`. `rsvp-detail.tsx` passes `isPastEvent` to `RsvpRequestCard`, which hides Approve/Reject buttons when the event has ended.
- **Rationale:** Approving RSVPs for past events could trigger payment flows or ticket issuance for events that already occurred. Web equivalent logged in `CRUCIAL_IOS_TO_WEB_TODOS.md` #10.
