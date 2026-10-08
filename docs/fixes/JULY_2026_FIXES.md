# July 2026 Fixes

Continuing from `JUNE_2026_FIXES.md`. All entries follow the same format.

---

## Entries

### 1. Stripe Connect — revert Mexico full-service workaround to recipient (web + mobile, Jul 1, 2026)

**Context.** June #15 worked around `You cannot request the 'recipient' service agreement for v2 Accounts` by creating Mexican connected accounts under the **full** service agreement (explicitly requesting `card_payments` + `transfers`). Those accounts onboarded successfully, but **checkout then failed** with:

> `Stripe doesn't currently support application fees for platforms in US with connected accounts in MX.`

Root cause: our funds flow is a **destination charge** (`transfer_data[destination]` = connected account, `transfer_data[amount]` = organizer net, platform fee = the difference — an implicit application fee). Stripe blocks application fees on US-platform → MX-connected-account charges under the full service agreement. Ecuador does not hit this because it uses the **recipient** service agreement.

**Resolution (Stripe support, Jul 1, 2026).** Stripe enabled the **recipient (transfers-only)** service agreement for our platform's Mexican accounts on the **V1 Accounts API** (confirmation on case `sco_UlQgH4Nnf1aDop`). With recipient, `card_payments` is not applicable — the account only receives transfers, which is exactly our model. Mexico now behaves **identically to Ecuador**, so the workaround is reverted and the existing destination-charge checkout works unchanged.

**Changes (revert of the June #15 full-service path; the country selector + `default_currency` logic is retained):**

- **[`packages/lib/src/stripe/connect-countries.ts`](../../packages/lib/src/stripe/connect-countries.ts):** removed `FULL_SERVICE_AGREEMENT_COUNTRIES` and `requiresFullServiceAgreement()`; rewrote the module doc to state all served countries (incl. MX) use the recipient/transfers-only model. Barrel exports updated in [`packages/lib/src/stripe/index.ts`](../../packages/lib/src/stripe/index.ts) and [`packages/lib/src/index.ts`](../../packages/lib/src/index.ts).
- **[`createExpressAccount`](../../apps/web/app/lib/stripe/connect.ts):** removed the `requiresFullServiceAgreement` import and the per-account `capabilities: { card_payments, transfers }` block. Capabilities are again omitted so Stripe applies the platform default (recipient). `country` + `default_currency` are still set when provided.
- **Web UI — [`StripeConnectStatus.tsx`](../../apps/web/app/components/StripeConnectStatus.tsx):** removed the `requiresFullServiceAgreement`-gated "additional business details" heads-up note (no longer accurate for recipient MX) and the now-unused `FiInfo` import.
- **Mobile UI — [`PayoutsSettingsTab.tsx`](../../apps/mobile/components/settings/PayoutsSettingsTab.tsx):** removed the same heads-up note and the now-unused `requiresFullServiceAgreement` and `colors` imports.
- **Tests — [`connect-countries.test.ts`](../../packages/lib/__tests__/connect-countries.test.ts):** removed the `requiresFullServiceAgreement` suite and the "every full-service country" assertion; added a test asserting MX is a supported recipient market with `mxn` default currency.

**Operational note (existing MX account).** The Mexican connected account created during testing under the **full** service agreement (`acct_1Tk5ze193DZl972l`) cannot be converted — the service agreement is locked once accepted. That org must **disconnect and re-onboard** to get a fresh recipient account (or have its `stripe_account_id` cleared) before checkout will work for it.

**Parity.** Web and mobile share the same `@project-flame/lib` helpers and the same (now simplified) onboarding flow. Destination-charge checkout (`create-payment-intent`) is unchanged and identical across MX/EC/all recipient markets.

---

### 2. W8-M1 — False "signed-out on app resume" (mobile, OTA, no backend, Jul 1, 2026)

**Symptom.** After backgrounding the app and resuming, users were sometimes wrongly bounced to `/sign-in` (or saw "session expired") despite still being logged in. Non-deterministic; a force-quit + relaunch always fixed it.

**Root cause (verified).** There was **no `AppState` foreground listener** that refreshed the Clerk session/token before an auth gate read it (`AppState` was only wired into the version gate, OTA prompt, and Stripe Connect return). On resume Clerk can briefly report `isSignedIn: false` before the SecureStore token rehydrates, and [`useRequireAuth`](../../apps/mobile/hooks/useRequireAuth.tsx) pushed `/sign-in` **synchronously** the instant it saw `false`. Force-quit re-ran full hydration, hiding the race. Related: the [`api.ts`](../../apps/mobile/lib/api.ts) 401 retry re-called `getToken()` **without** `{ skipCache: true }`, so it just replayed the same stale cached token.

**Changes (session-resume/gate hardening only — the §10-protected sign-in handlers are untouched):**

- **New [`useForegroundSessionRefresh`](../../apps/mobile/hooks/useForegroundSessionRefresh.ts):** an `AppState` `"active"` handler that calls `getToken({ skipCache: true })` on every foreground so Clerk rehydrates the session *before* any gate reads `isSignedIn`. Mounted once in [`_layout.tsx`](../../apps/mobile/app/_layout.tsx)'s `AppShell` (inside `ClerkProvider`). Mirrors the existing `AppState`-refetch pattern in `useAppVersionGate`.
- **[`useRequireAuth`](../../apps/mobile/hooks/useRequireAuth.tsx):** `isSignedIn === undefined` still means loading (spinner). On a *freshly-`false`* value it no longer redirects immediately — it waits a short grace period (`REDIRECT_GRACE_MS = 1200`) then probes `getToken({ skipCache: true })`; if a token comes back the session is fine and it stays put, otherwise the sign-out is real and it pushes `/sign-in`. `getToken` is held in a ref so the grace timer isn't reset by Clerk re-renders.
- **[`api.ts`](../../apps/mobile/lib/api.ts):** the 401 retry in both `apiClient` and `apiUploadFormData` now calls `getToken({ skipCache: true })` to mint a fresh token instead of the cached one that just 401'd. Introduced a `GetTokenFn` type (optional `{ skipCache }`) — zero-arg callers remain assignable.

**Audit (item #4).** `getAuthenticatedClient` throwing on a transient null token is a *data-fetch* race, not the redirect race — it already self-heals via React Query's `retry: 2` (and now also benefits from the foreground token refresh warming Clerk's cache). Left untouched to avoid rippling across every hook that consumes it; the redirect symptom is fully addressed by the gate + foreground refresh above.

**Validate.** Background >30s and resume repeatedly: the user stays signed in (no `/sign-in` redirect, no "session expired"). Mobile `tsc` unchanged at the ~109 baseline with zero new errors.

**Follow-up (Jul 1, 2026) — three-state auth in direct-read UI spots.** The redirect gate above was hardened, but a few components still read `isSignedIn` with a falsy check (`!isSignedIn` / `!!isSignedIn`), collapsing Clerk's *not-loaded* state (`isSignedIn === undefined`, e.g. on a cold relaunch when iOS has evicted the backgrounded app and restores onto a screen) into "signed out". That is the source of the "app looks signed out on older/low-RAM devices" report — those devices cold-relaunch far more often than newer phones, so they hit the hydration window. Industry standard (Clerk's own `isLoaded` / `<ClerkLoading>` model) is to treat auth as three states — *loading / signed-in / signed-out* — and never render the signed-out variant while loading. Aligned the direct-read spots:

- **[`CustomTabBar`](../../apps/mobile/components/navigation/CustomTabBar.tsx):** the `requiresAuth` tabs (My Tickets, Profile) now pre-empt to `/sign-in` only on an *explicit* `isSignedIn === false`. While resolving (`undefined`) the tap goes through to the protected route, where the now-hardened `RequireAuthGate` handles the transient window.
- **[`CheckoutCTA`](../../apps/mobile/components/event-details/CheckoutCTA.tsx):** prop widened to `boolean | undefined`. The "Sign In to Continue" label shows only on explicit `false`; while resolving it shows "Continue to Checkout" but is disabled so a tap can't be mis-routed before Clerk rehydrates. `event/[id].tsx` now passes the raw tri-state value instead of `!!isSignedIn`.
- **[`settings.tsx`](../../apps/mobile/app/settings.tsx):** the Sign In / Sign Out button renders a neutral `ActivityIndicator` while auth resolves instead of flashing a misleading "Sign In".

Mobile `tsc`: 103 errors (baseline), **zero** in any touched file.

---

### 3. Cohost dashboard event cards show revenue $0 (web + mobile, OTA, no backend, Jul 1, 2026)

**Symptom.** For a co-hosted event, the cohost org's **event cards** (Past / Current lists) showed revenue `$0`, even though the org-level dashboard widget (correctly) omits cohost revenue and the event **detail** view already shows the correct total.

**Root cause (verified).** Cohost events were intentionally enriched with `totalAttendees` + RSVP counts only. Web [`api/organizer/data/route.ts`](../../apps/web/app/api/organizer/data/route.ts) ("Fetch events where THIS org is a cohost" block) never attached `totalRevenue`, so `cohost_events[].event.totalRevenue` was `undefined` → the web card rendered `$0`. On mobile the cohost cards fell back to a *gross* tier estimate (`computeTierRevenueCents`), inconsistent with the net figure everywhere else.

**Changes:**

- **Web [`api/organizer/data/route.ts`](../../apps/web/app/api/organizer/data/route.ts):** the cohost enrichment loop now also computes `totalRevenue` per event via the **same** `fetchEventPurchases` path owner events use (`enrichEventWithStats`) — net base price through the shared `calculateOrganizerBasePrice` logic, excluding `payment_provider = 'bank_transfer'` — so a cohost card matches its detail view exactly. The org-level `revenueByCurrency` aggregate in [`OrganizerAdminView`](../../apps/web/app/components/organizer/OrganizerAdminView.tsx) still sums **owner** events only, so cohost revenue appears on cards but not the org total (as intended). Loop converted to `Promise.all`; comments updated.
- **Mobile:** cohost revenue can't be derived client-side (RLS hides the owner org's `orders` from the cohost's client), so it must come from the server. New [`useCohostRevenueMap`](../../apps/mobile/hooks/useOrgEventEnriched.ts) reads `cohost_events[].event.totalRevenue` from `/api/organizer/data` and returns an `eventId → cents` map. [`organizer-admin.tsx`](../../apps/mobile/app/organizer-admin.tsx) feeds that map into the cohost cards' `mapOrgEventToCardData` (was `undefined` → gross estimate) and refetches it on pull-to-refresh.

**Parity.** Web owner, web cohost, mobile owner, mobile cohost, and both detail views now all derive revenue from `calculateOrganizerBasePrice` over completed non-bank-transfer orders → identical numbers.

---

### 4. Rename buyer-facing "Promo Code" → "Discount Code" (web + mobile, OTA, no backend, Jul 1, 2026)

**Scope.** Only **buyer-visible** copy (labels, placeholders, error strings shown during checkout). No code identifiers, props, state, API fields, or DB columns were touched — `promoCode`, `promo_code`, `promotional_code_id`, etc. all stay. Organizer-facing "Promo Codes" management copy is out of scope (not buyer-facing).

**Changes:**

- **Web active checkout — [`RsvpPaymentModal.tsx`](../../apps/web/app/components/modals/RsvpPaymentModal.tsx):** section label, `aria-label`, the "free with your discount code" line, and the apply/remove/invalid error fallbacks.
- **Web legacy — [`StripePurchaseFlow.tsx`](../../apps/web/app/components/StripePurchaseFlow.tsx):** same label + error strings for consistency.
- **Mobile checkout — [`CheckoutMainSheet.tsx`](../../apps/mobile/components/event-details/CheckoutMainSheet.tsx):** section label; [`useCheckout.ts`](../../apps/mobile/hooks/useCheckout.ts) error fallbacks ("Discount code is not valid" / "Invalid discount code").
- **Server error copy returned to buyers during checkout:** [`create-payment-intent/route.ts`](../../apps/web/app/api/purchase/create-payment-intent/route.ts), [`validate-promo-code/route.ts`](../../apps/web/app/api/purchase/validate-promo-code/route.ts), and [`rsvp/route.ts`](../../apps/web/app/api/rsvp/route.ts) — "Invalid/This … promotional code …" → "… discount code …". Dev-only `console.error` strings were left as-is (not user-visible).

**Done.** Every buyer-facing occurrence now reads "Discount Code"; no identifier renamed; web `tsc` clean.

---

### 5. INVESTIGATION + guard — Stripe "destination account needs transfers capability" at checkout (web, OTA, no backend, Jul 1, 2026)

**Symptom (intermittent).** Some checkouts failed with the raw Stripe error: *"your destination account needs to have at least one of the following capabilities enabled: transfers, crypto_transfers, legacy_payments."* Thrown at PaymentIntent creation for the destination charge.

**Root cause (verified).** [`create-payment-intent/route.ts`](../../apps/web/app/api/purchase/create-payment-intent/route.ts) builds a destination charge (`transfer_data.destination = org.stripe_account_id`) with **no pre-check** that the connected account is chargeable — it only null-checks `stripe_account_id`. The org row caches `stripe_charges_enabled` / `stripe_payouts_enabled` (synced by the `account.updated` webhook), but **nothing anywhere reads or stores `capabilities.transfers`**. So when an organizer's `transfers` capability is `pending`/`inactive`/`restricted` (onboarding incomplete, verification pending, or a country/agreement mismatch), Stripe rejects PI creation and the buyer sees the raw 500. It's intermittent because it only affects accounts in that not-yet-active state.

**Why we must NOT gate on `charges_enabled`.** Our LATAM markets use the **recipient/transfers-only** service agreement (Ecuador, Mexico, etc. — see #1). Those accounts have `charges_enabled = false` **by design** (they never process card charges themselves; the platform charges and transfers to them). Gating on `charges_enabled`/`payouts_enabled` would wrongly block **every** LATAM org. The only correct readiness signal for a destination charge is `capabilities.transfers === "active"`.

**Fix (low-risk, verified against live Stripe rather than stale cache):**

- **[`connect.ts`](../../apps/web/app/lib/stripe/connect.ts) — `getAccountStatus`:** additively returns `transfersActive: account.capabilities?.transfers === "active"` (existing callers unaffected).
- **[`create-payment-intent/route.ts`](../../apps/web/app/api/purchase/create-payment-intent/route.ts):** after the `stripe_account_id` check and before building the PI, a readiness guard calls `getAccountStatus` and, if `transfersActive` is false, returns a clear `409 { code: "ORGANIZER_PAYOUTS_NOT_READY" }` with a buyer-friendly message instead of letting Stripe throw the raw error. Verified **live** (not via the cached `stripe_*_enabled` columns, which don't track capabilities and can be stale). **Best-effort:** if the live status read itself throws, we log and proceed, so a flaky Stripe call never blocks an otherwise-healthy checkout.

**Follow-up data to confirm affected orgs (for the Supabase/Stripe MCP window):**
1. Supabase: `select id, name, stripe_account_id, stripe_charges_enabled, stripe_payouts_enabled from organizations where stripe_account_id is not null;` — to see which orgs are linked and how stale the cached flags look.
2. Stripe dashboard: for any org that reported the error, check the connected account's **Capabilities → transfers** status (`active` vs `pending`/`inactive`). Expect the failing ones to be non-`active`.
3. Optional hardening (future, needs a migration — not done here): extend the `account.updated` webhook to also persist a `stripe_transfers_enabled` column so the readiness state is cached, avoiding a live Stripe read per checkout. Deferred as it requires a schema change.

### 6. PR review follow-ups to #3 and #5 (web + mobile, OTA, no backend, Jul 1, 2026)

Two auto-reviewer findings verified against current code and fixed; the rest of the review triaged out.

**6a — Transfers readiness guard blocked free / 100%-off checkouts (fixes #5).** The guard added in #5 was placed right after the `stripe_account_id` null-check, *before* the `totalAmountCents === 0` early return in [`create-payment-intent/route.ts`](../../apps/web/app/api/purchase/create-payment-intent/route.ts). A 100%-off discount code drives `discountedBasePriceCents === 0` → the route returns a `free_promo_*` result with **no PaymentIntent and no `transfer_data`** — yet the guard would still reject it with `409 ORGANIZER_PAYOUTS_NOT_READY`, blocking a free ticket for any org whose `transfers` capability wasn't active even though no transfer occurs. **Fix:** moved the guard (unchanged try/catch + `transfersActive` check + `ORGANIZER_PAYOUTS_NOT_READY` behavior) to immediately before `stripe.paymentIntents.create`, i.e. after the `totalAmountCents === 0` early return, so it only gates the paid destination-charge path.

**6b — Cohost cards silently showed a gross estimate on revenue-fetch failure (fixes #3).** [`organizer-admin.tsx`](../../apps/mobile/app/organizer-admin.tsx) fed `cohostRevenueMap` into `mapOrgEventToCardData`, which falls back to the gross `computeTierRevenueCents` tier estimate when the map is `undefined`. On a `useCohostRevenueMap` **error** that fallback rendered with no disclaimer — unlike owner events, which show the `statsFailed` "Revenue estimates shown — live data unavailable." banner. So a cohost could read a gross estimate as if it were actual net payout. **Fix:** destructure `error`/`isLoading` from `useCohostRevenueMap`, derive `cohostStatsFailed` (gated on cohost cards actually being shown so the banner isn't meaningless when there are none), and extend the existing banner condition to `statsFailed || cohostStatsFailed`. Reuses the same banner copy — no new UI.

**Validation.** Web `tsc --noEmit` 0 errors; mobile `tsc --noEmit` 103 (unchanged baseline, 0 in touched files).

### 7. Second review pass on #6 — cohost revenue error/loading parity + probe observability (mobile, OTA, no backend, Jul 1, 2026)

Follow-up review of the #6 changes. Three findings fixed, one deferred.

**7a — `useCohostRevenueMap` swallowed schema-validation failures as `$0` (fixes a gap in 6b).** On `CohostRevenueResponseSchema.safeParse` failure, [`useOrgEventEnriched.ts`](../../apps/mobile/hooks/useOrgEventEnriched.ts) logged and **returned an empty `Map`**. React Query treats that as *success*, so `cohostRevenueError` stayed unset, `cohostStatsFailed` never fired, and `mapOrgEventToCardData` (map defined but key absent) rendered **$0** on every cohost card with no disclaimer. **Fix:** throw after logging so the query enters its error state (data `undefined`) — cards fall back to the gross estimate AND the 6b `cohostStatsFailed` banner surfaces. Now consistent with a network failure (which already throws via `apiGet`).

**7b — No loading affordance for cohost revenue (loading parity).** While `useCohostRevenueMap` loads, `cohostRevenueMap` is `undefined` so cohost cards show gross `computeTierRevenueCents` estimates. Owner events show "Loading live revenue…" via `statsLoadingBanner`; there was no cohost equivalent. **Fix:** added `cohostStatsLoading` (gated on cohost cards being shown + `cohostRevenueLoading && !cohostRevenueMap`) and extended the banner to `statsLoadingBanner || cohostStatsLoading`. Reuses the same copy.

**7c — `useRequireAuth` token-probe failure was silently swallowed.** The grace-period probe's `catch` fell through to the `/sign-in` redirect with no log, so a signed-in user bounced on a probe failure left no trace. **Fix:** added a `__DEV__` `console.warn` (same pattern as `useForegroundSessionRefresh`) with `userId` (via a ref, so it doesn't reset the grace timer) + `isConfigured` + the caught error.

**7d — DEFERRED: N+1 `fetchEventPurchases` fan-out in the web cohost enrichment.** Logged in [`EDGE_CASES_TODOS.MD`](../todos/EDGE_CASES_TODOS.MD). The owner path (`enrichEventWithStats`) has the identical per-event pattern; calls run in parallel with small N; and a DB-side SUM can't replicate the shared per-order base-price logic without diverging. Should be batched for owner + cohost together via a shared `fetchEventPurchasesForEvents` when warranted.

**Validation.** Web `tsc --noEmit` 0 errors; mobile `tsc --noEmit` 103 (unchanged baseline, 0 in touched files).

### 8. ACTUAL root cause of cohost card $0 — co-hosted events render in the OWNED bucket (mobile, OTA, no backend, Jul 1, 2026)

**Symptom (persisted after #3/#6/#7).** On the cohost org's dashboard (Numa Experiences), the co-hosted event card (NUMA, owned by Salinas Yacht Club) still showed `$0.00`, even though the detail view showed the correct `$15,542.00` and server restarts / cache clears didn't help.

**Diagnosis (runtime, via temporary `__DEV__` logs on the device).** The logs proved the data pipeline was fine but pointed at the wrong bucket:
- `useCohostRevenueMap` returned a **correct** map — `mapSize: 2`, `205be5f8 → 1554200`, `eba88e74 → 944100` (confirmed against `orders` in Supabase via MCP: `sum(base_price_cents)` = `1554200` / `944100`).
- But `cohostCurrentIds: []` and `cohostPastIds: []` — **there were no cards in the cohost bucket at all.**

**Root cause (verified).** [`useOrgEvents`](../../apps/mobile/hooks/useOrgEvents.ts) fetches events where the org is **owner OR co-host** (its `.or(organization_id.eq.<org>, id.in.(<cohostEventIds>))` query), so co-hosted events land in `orgEvents` → `currentEvents`/`pastEvents`. The separate `cohostCurrentEvents`/`cohostPastEvents` (from `useCohostEvents`) are then **deduped against `orgEvents` ids** and come out **empty**. So the co-hosted cards actually render in the **owned** bucket via `mapOrgEventToCardData(e, revenueMap)` — and `revenueMap` ([`useOrgDashboardStats`](../../apps/mobile/hooks/useOrgDashboardStats.ts)) is computed from `orders` under the **cohost's** RLS scope, which cannot see the **owner's** orders → no entry → `$0`. The `cohostRevenueMap` added in #3 was correct but was only wired into the (always-empty) cohost bucket, so it was never consulted for the card the user actually sees. #6/#7 refined that empty-bucket path and so couldn't move the number.

**Fix (mobile [`organizer-admin.tsx`](../../apps/mobile/app/organizer-admin.tsx)).** Pick the revenue source per event by **ownership**, not by bucket:
- New `revenueMapForEvent(e)` → returns `cohostRevenueMap` when `effectiveOrgId && e.organization_id !== effectiveOrgId` (a co-hosted event), else the local `revenueMap`. Both card lists now map owned events with `revenueMap` and co-hosted events with `cohostRevenueMap` (server-authoritative net). Loading → gross tier estimate + "Loading live revenue…"; error → gross + "Revenue estimates shown…"; resolved → exact net (`$15,542`).
- `hasCohostCards` now derives from `orgEvents` (`some(e => e.organization_id !== effectiveOrgId)`), not the empty cohost bucket, so the #6/#7 loading/failed banners actually gate correctly.
- **Headline total hardened:** the `stats` reducer now forces co-hosted events to contribute `0` to the org total (previously they contributed `0` only because `revenueMap` happened to miss them; during the `revenueMap`-loading window they'd have leaked a gross estimate via `computeTierRevenueCents`). Co-host revenue stays **only on the card**, never in the headline total — per the requirement.

**Parity.** Co-hosted card now equals the co-hosted detail view (`$15,542`), both sourced from the same server `totalRevenue` (`calculateOrganizerBasePrice` over completed non-bank-transfer orders). Owner dashboards unaffected (owned events still use `revenueMap`). Temporary debug logs removed.

**Validation.** Mobile `tsc --noEmit` / lint clean in touched files. Verified on device: NUMA cohost card renders `$15,542.00`; org headline total excludes it.

### 9. Web parity for #8 — cohost card $0 on SSR first paint (web, Jul 1, 2026)

**Web equivalent of #8, checked after the mobile fix.** The web organizer dashboard UI needed **no** logic change: co-hosted events are fetched into a separate `cohost_events[]` array (never merged into the owned `events[]`), [`OrganizerAdminView.tsx`](../../apps/web/app/components/organizer/OrganizerAdminView.tsx) reads `event.totalRevenue` straight from the API on every card, and its headline `revenueByCurrency` already sums **owned `scopedEvents` only** — so cohost revenue was already excluded from the total and shown per-card. No web analogue of the mobile "renders in the owned bucket" routing bug exists.

**The one real gap — SSR first paint.** [`organizer/page.tsx`](../../apps/web/app/organizer/page.tsx) server-enriched cohost events with `totalAttendees` + RSVP counts but **not** `totalRevenue`. The client query is seeded with this SSR `initialData` and uses `refetchOnMount: false`, so a co-hosted card rendered **Revenue: $0.00** until the 15s `/api/organizer/data` poll (or a window-focus refetch) replaced it — the web twin of the mobile cohost-$0 symptom.

**Fix.** Added the same `totalRevenue` enrichment to the SSR cohost loop (now a `Promise.all` map, mirroring the `/api/organizer/data` route): `fetchEventPurchases(supabaseAdmin, event.id)` → sum `basePrice` (net of service fee/IVA via `calculateOrganizerBasePrice`, excludes `bank_transfer`). First paint now matches the poll and the cohost detail view exactly; no UI change.

**Note.** This adds the same per-event `fetchEventPurchases` fan-out already logged as the #7d deferred N+1 (now on both the API route and SSR) — same rationale (small N, runs in parallel, shared per-order base-price logic a DB SUM can't replicate). To batch when warranted, do owner + cohost together via a shared `fetchEventPurchasesForEvents`.

**Validation.** Web `tsc --noEmit` 0 errors; lint clean in touched file.

### 10. Review pass on #8 — headline currency bucket + pull-to-refresh parity (mobile, OTA, no backend, Jul 1, 2026)

Follow-up review of the #8 mobile changes. Two findings fixed, one deferred.

**10a — Co-hosted events leaked a zero-value currency bucket into the headline stats.** #8 forced a co-hosted event's `rev` to `0` in the [`organizer-admin.tsx`](../../apps/mobile/app/organizer-admin.tsx) `stats` reducer, but the loop still ran `perCurrency.set(e.currency, … + 0)` for it. A co-hosted event in a different currency (e.g. EUR) than the org's owned events (all USD) would add a spurious `{ EUR: 0 }` bucket, flipping `perCurrency.size` to 2 and mislabeling the headline currency (it falls back to `orgEvents[0].currency` when size ≠ 1). **Fix:** `continue` past co-hosted events entirely in the reducer so they contribute to neither `totalRevenueCents` nor `perCurrency`. The `totalEvents` count still includes them (matches the card list, and mirrors web's `OrganizerAdminView` where Total Events counts cohost but Total Revenue doesn't).

**10b — Pull-to-refresh indicator dropped before the cohost revenue refetch finished.** `handleRefresh` already awaited `refetchCohostRevenue()`, but `isRefreshing` (which drives the `RefreshControl`) didn't include that query's `isRefetching`, so the spinner could hide while cohost revenue was still in flight. **Fix:** destructure `isRefetching: cohostRevenueRefetching` from `useCohostRevenueMap` and OR it into `isRefreshing`, alongside the other five queries.

**10c — DEFERRED (nitpick): extract the cohost revenue/card derivation into a hook.** Logged in [`NITPICKS_TODOS.md`](../todos/NITPICKS_TODOS.md). Pure structural refactor, single-use, would require threading many screen-local values into a hook — indirection without reuse. Revisit as part of a broader `organizer-admin.tsx` decomposition.

**Validation.** Mobile `tsc --noEmit` unchanged baseline (0 in touched files); lint clean.

### 11. Cohost card revenue flashed a gross estimate before the net value (mobile, OTA, no backend, Jul 1, 2026)

**Symptom.** On first load the co-hosted card briefly showed **$15,600**, then corrected down to the right **$15,542**.

**Cause.** While `useCohostRevenueMap` is still loading, `cohostRevenueMap` is `undefined`, so `mapOrgEventToCardData` fell through to `computeTierRevenueCents` — the **gross** tier estimate ($15,600 = `quantity_sold × price`). When the server's net revenue arrived the card jumped to $15,542. A value that visibly corrects *downward* reads as a glitch (looks like revenue dropped) — the opposite of the Stripe/Airbnb convention of showing a skeleton/placeholder for an authoritative metric until it loads.

**Fix ([`OrgEventCard.tsx`](../../apps/mobile/components/org-dashboard/OrgEventCard.tsx) + [`organizer-admin.tsx`](../../apps/mobile/app/organizer-admin.tsx)).** Added an optional `revenueLoading` flag to `OrgEventCardData`; when set, the card renders a **`<Skeleton>`** shimmer for the revenue value instead of the gross estimate — the exact per-metric pattern the "Total Revenue" `StatCard` already uses (`loading={!orgEvents || (!revenueMap && !statsError)}` → `<Skeleton>`). The rest of the card (name/date/attendees) still renders immediately. A new `revenueLoadingForEvent(e)` selector (the loading mirror of `revenueMapForEvent`) marks a card as loading when its source query is loading and hasn't produced a map yet — `cohostRevenueLoading && !cohostRevenueMap` for co-hosted events, `statsLoading && !revenueMap` for owned. Applied symmetrically to owned and co-hosted cards so neither flashes a gross-then-net correction.

**Why per-metric skeleton, not a full-dashboard gate.** Holding the whole card list until cohost revenue resolves would block the event cards — whose primary content (name/date/attendees) is already available from `useOrgEvents` — on a *separate, slower* web-API call (`/api/organizer/data`) that runs even for pure-owner orgs with zero co-hosted events. The screen's established convention (and the card list's own `orgLoading || isLoading` gate) is to reveal cards as soon as events are ready and skeleton each not-yet-ready metric independently — which is what the `StatCard` already does for the headline total. This fix brings the per-event revenue in line with that.

**Degraded state unchanged.** On **error** (query settled, no map) `revenueLoading` is false, so the card still falls back to the gross tier estimate alongside the existing "Revenue estimates shown — live data unavailable." banner. The "Loading live revenue…" banner still appears during the loading window and now explains the "—" placeholders.

**Validation.** Mobile `tsc --noEmit` 109 (unchanged baseline, 0 in touched files); lint clean.
