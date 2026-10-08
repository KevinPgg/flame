# February 2026 Fixes

## Fixes

### 1. Merchant Identifier Mismatch

- **Issue:** `apps/mobile/app/_layout.tsx` used `merchant.com.projectflame` while `app.json` used `merchant.com.projectflame.app`.
- **Fix:** Updated `_layout.tsx` to use `merchant.com.projectflame.app` to match the plugin configuration.

### 2. Clerk Configuration Crash

- **Issue:** When `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` was missing, the app would crash when navigating to the sign-in screen because `ClerkProvider` was not in the tree.
- **Fix:** Updated `apps/mobile/app/event/[id].tsx` to check for Clerk configuration before allowing navigation to the sign-in screen. If Clerk is not configured, an alert is shown instead of crashing.

### 3. Duplicate GlowBlob Component

- **Issue:** `GlowBlob` was copy-pasted in `index.tsx`, `events.tsx`, and `event/[id].tsx`.
- **Fix:** Extracted `GlowBlob` to `packages/ui/src/components/GlowBlob.tsx` and exported it from `packages/ui`. Updated all consumers to use the shared component.

### 4. Unused Props in CheckoutSheet

- **Issue:** `CheckoutSheet` accepted `onPromoCodeChange` and `promoDiscount` but did not use them correctly (using local state and calculated values instead).
- **Fix:** Removed unused props from `CheckoutSheet` interface and component, and updated the usage in `event/[id].tsx`.

---

## PR Review Fixes (Feb 18, 2026)

### 5. Rules of Hooks Violations

- **Issue:** `event/[id].tsx` and `useCheckout.ts` both called Clerk's `useAuth` hook conditionally
  (`if (useAuthHook) return useAuthHook()`), violating React's Rules of Hooks.
- **Fix:** Resolved the module-level nullable variable into a stable constant (`useAuth = clerkUseAuth ?? useFallbackAuth`) so the same hook reference is always called unconditionally every render. The fallback function (`useFallbackAuth`) returns a no-op auth object when Clerk is not configured.

### 6. HomeScreen Error State Missing

- **Issue:** `apps/mobile/app/index.tsx` only handled `isLoading` and ignored `isError`, allowing the
  screen to silently render with empty/undefined data when the Supabase fetch failed.
- **Fix:** Added an explicit error fallback `View` with a "Retry" button wired to `refetch()`. Also
  added safe defaults (`upcomingEvents = [], featuredEvents = [], spotlightEvent = null`) to the
  destructuring so no prop receives `undefined`.

### 7. Non-Functional CategoryPill onPress

- **Issue:** `ExploreCategories.tsx` passed `onPress={() => {}}` to `CategoryPill`, creating a
  visually interactive element with no behaviour.
- **Fix:** Removed the empty `onPress` prop so `CategoryPill` relies on its optional prop default
  (renders as non-interactive when no handler is provided).

### 8. Non-Functional Hero CTA Button

- **Issue:** `HeroCarousel.tsx` rendered a `PillButton` with no `onPress`, making the "Explore Events"
  CTA a dead button.
- **Fix:** Injected `useRouter` into `HeroCarousel` and wired `onPress={() => router.push("/events")}`.

### 9. Stale `isToday` Flag on Mock Spotlight Event

- **Issue:** `spotlightEvent` in `apps/mobile/data/mock.ts` had `isToday: true` but a date in the
  past ("Friday, 06 Feb, 2026").
- **Fix:** Set `isToday: false` to match the actual date.
- **Note:** Same `spotlightEvent` record updated in Fix #58 (weekday text correction).

### 10. API Client Returns null on Successful Response with Unparseable Body

- **Issue:** `apps/mobile/lib/api.ts` swallowed JSON parse errors (`response.json().catch(() => null)`)
  and returned `null` cast to `T` when the parse failed on a 2xx response, passing bad data silently
  to callers.
- **Fix:** Added an explicit `data === null` check after `response.ok`; throws a descriptive
  `ApiError` instead of returning `null`.

### 11. Token Cache Deletes Token on Transient Errors

- **Issue:** `apps/mobile/lib/token-cache.ts` called `SecureStore.deleteItemAsync(key)` inside the
  `getToken` catch block, wiping valid stored tokens on any I/O error (e.g., temporary device lock).
- **Fix:** Removed the unconditional deletion; the catch block now only logs the error and returns
  `null`, preserving the token for the next attempt.

### 12. Dead `expo-asset` Entry in Metro Config

- **Issue:** `apps/mobile/metro.config.js` mapped `"expo-asset"` in `extraNodeModules` even though
  the package is neither declared in `package.json` nor imported anywhere.
- **Fix:** Removed the dead mapping.

### 13. `activeCategory` in useMemo Deps with No Effect

- **Issue:** `apps/mobile/app/events.tsx` included `activeCategory` in the `filteredEvents` `useMemo`
  dependency array even though the category filter is not yet implemented, causing unnecessary
  re-computation on every category selection.
- **Fix:** Removed `activeCategory` from the deps array; added a TODO comment for when the Event
  type gains a category field.

### 14. Unused Import in `useEventDetails`

- **Issue:** `isTierAvailable` was imported from `@project-flame/lib` in `useEventDetails.ts` but
  never used (the hook uses a custom `getTierStatus` function instead).
- **Fix:** Removed the unused import.

### 15. Type Assertion for `requires_rsvp`

- **Issue:** `apps/mobile/app/event/[id].tsx` cast `event` to `Record<string, unknown>` to access
  `requires_rsvp`, even though `EventDetail` already declares `requires_rsvp?: boolean`.
- **Fix:** Replaced the cast with a direct optional-chained access (`event?.requires_rsvp`).

### 16. Bookmark Always Rendered in EventListCard

- **Issue:** `packages/ui/src/components/EventListCard.tsx` always rendered the bookmark `Pressable`
  even when `onBookmark` was `undefined`, creating a non-functional interactive element — inconsistent
  with `EventCard` which guards the same button.
- **Fix:** Wrapped the bookmark button in `{onBookmark && (...)}` to match `EventCard`'s pattern.

### 17. QueryClient Has No Default Options

- **Issue:** `apps/mobile/app/_layout.tsx` created `QueryClient` with no configuration, leaving
  `staleTime`, `gcTime`, and `retry` at their defaults — suboptimal for a mobile app on flaky
  connections.
- **Fix:** Added `staleTime: 5 min`, `gcTime: 30 min`, `retry: 2`, and `refetchOnWindowFocus: false`.

### 18. Hardcoded Copyright Year in Footer

- **Issue:** `apps/mobile/components/home/Footer.tsx` hardcoded "FLAME 2025" which will become
  stale every year.
- **Fix:** Replaced with `FLAME {new Date().getFullYear()}`.

### 19. Clerk Error Casting Without Type Guard

- **Issue:** `apps/mobile/app/sign-in.tsx` cast caught errors with `err as { errors?: ... }[]` in
  three places with no runtime validation, risking silent failures if Clerk's error shape changes.
- **Fix:** Extracted a `getClerkErrorMessage(err, fallback)` type guard helper and replaced all three
  raw casts.

### 20. Double-Tap on Google OAuth Button

- **Issue:** `onGoogleAuth` in `sign-in.tsx` had no guard against a second tap before the async
  flow settled, potentially launching two concurrent OAuth sessions.
- **Fix:** Added `if (loading) return;` at the top of `onGoogleAuth` and added `loading` to the
  `useCallback` dependency array.

### 21. CheckoutSheet Promo Input Not Cleared After Apply

- **Issue:** `CheckoutSheet.tsx`'s `localPromo` input retained the entered code after a promo was
  successfully applied (`promoApplied` became `true`), making it confusing to apply a second code.
- **Fix:** Added a `useEffect` that clears `localPromo` whenever `promoApplied` transitions to `true`.

### 22. Silent Fee Calculation Errors in useCheckout

- **Issue:** The fee estimate `try/catch` in `useCheckout.ts` had an empty catch block, hiding
  potential calculation bugs during development.
- **Fix:** Added `if (__DEV__) console.warn(...)` in the catch block so errors surface in dev builds.

### 23. Expo SDK Version Mismatch in Docs

- **Issue:** `docs/project-migrations/PHASE_1_to_5_MONOREPO_FOUNDATION.md` listed "SDK 51" while
  the iOS migration doc and `app.json` referenced SDK 54.
- **Fix:** Updated the doc to read "SDK 54 — upgraded from initial SDK 51 setup".

### 24. Accessibility TODOs Captured

- Created `docs/todos/ACCESSIBILITY_TODOS.md` to track all deferred accessibility improvements
  surfaced in the PR review.

---

## PR Review Fixes (Feb 18, 2026 — Round 2)

### 25. Misleading " GMT" Suffix on Time Range

- **Issue:** `formatEventTime` uses `toLocaleTimeString()` (local device timezone) but the timeRange string appended " GMT", misleading users.
- **Fix:** Removed " GMT" from timeRange in `event/[id].tsx` and `useAppEvents.ts` (`mapEventToCardData`, `mapEventToSpotlightData`).

### 26. Shared Date/Time Formatting in packages/lib

- **Issue:** `formatEventDate` and `formatEventTime` were duplicated in `useEventDetails.ts` and `useAppEvents.ts`.
- **Fix:** Added `formatEventDate` and `formatEventTime` to `packages/lib` utils; both hooks now import from `@project-flame/lib`.

### 27. useAuth Mutable let and Module Syntax

- **Issue:** `event/[id].tsx` and `useCheckout.ts` used mutable `let clerkUseAuth` and had executable code before imports in useCheckout.
- **Fix:** Created shared `useOptionalAuth` hook (`apps/mobile/hooks/useOptionalAuth.ts`) that resolves auth via IIFE at module load. Both consumers now use `useOptionalAuth()`. All imports moved to top of `useCheckout.ts`.

### 28. handleContinueToCheckout Dependency Array

- **Issue:** `checkoutState` in deps caused `useCallback` to recreate every render.
- **Fix:** Narrowed deps to `checkoutState.resetCheckout` (stable callback with empty deps).

### 29. EventsScreen Error Fallback Missing

- **Issue:** `events.tsx` ignored `isError`, allowing silent failure when fetch failed.
- **Fix:** Destructured `isError`, `error`, `refetch` from `useAppEvents`; added error view with user-friendly message, `error?.message`, and Retry button. Logs error with context.

### 30. useCheckout Zod Validation for API Responses

- **Issue:** HoldResponse, PaymentIntentResponse, PromoValidationResponse were assumed but not validated.
- **Fix:** Added Zod schemas; parse API responses with `schema.parse(raw)` at call sites. Added `zod` to `apps/mobile` dependencies.

### 31. useEventDetails RPC Response Validation

- **Issue:** `get_event_with_tiers` response was used without runtime shape check.
- **Fix:** Added `validateGetEventWithTiersResponse()` helper; validates `data` is object, `event` exists with required fields, `ticket_tiers` is array with valid `order_index`.

### 32. Phase 4 Documentation Update

- **Issue:** Phase 4 status was "In Progress".
- **Fix:** Updated `docs/project-migrations/PHASE_1_to_5_MONOREPO_FOUNDATION.md` to "Completed", added Date Completed: February 18, 2026.

### 33. EventDetailScreen Component Extraction

- **Issue:** EventDetailScreen exceeded 100-line guideline.
- **Fix:** Extracted `EventHero`, `TicketSelection`, `CheckoutCTA` to `apps/mobile/components/event-details/`.

### 34. SignInScreen Component Extraction

- **Issue:** SignInScreen was overlong.
- **Fix:** Extracted `BrandingHeader`, `OAuthButton`, `CredentialsForm`, `ToggleMode` to `apps/mobile/components/sign-in/`.

### 35. CheckoutSheet Component Extraction

- **Issue:** CheckoutSheet mixed success, processing, and main UI in one component.
- **Fix:** Extracted `CheckoutSuccessState`, `CheckoutProcessingState`, `CheckoutMainSheet`; CheckoutSheet is now a thin coordinator.

### 36. HeroCarousel SCREAM_CASE to camelCase

- **Issue:** Module-level constants used SCREAM_CASE (TypeScript style prefers camelCase).
- **Fix:** Renamed `SCREEN_WIDTH` → `screenWidth`, `CARD_WIDTH` → `cardWidth`, `CARD_GAP` → `cardGap`, `VIEWABILITY_CONFIG` → `viewabilityConfig`.

---

## PR Review Fixes (Feb 18, 2026 — Round 3)

### 37. maxQuantity Allows 1 for Sold-Out Tier

- **Issue:** `event/[id].tsx` computed `maxQuantity` with `Math.max(1, available)`, allowing quantity=1 for sold-out tiers.
- **Fix:** When `available <= 0` return `0`. Apply `Math.max(0, ...)` clamp. Added `useEffect` to sync quantity to 0 when tier sells out; updated `handleQuantityChange` to allow minQty 0 when maxQuantity is 0.

### 38. ticket_tiers Non-Null Assertion

- **Issue:** `TicketSelection` received `event.ticket_tiers!` despite `hasTicketTiers` guard.
- **Fix:** Replaced with `event.ticket_tiers ?? []` for a defensive fallback.

### 39. CheckoutProcessingState SCREAM_CASE

- **Issue:** Constant `STEP_LABELS` used SCREAM_CASE.
- **Fix:** Renamed to `stepLabels` (camelCase).

### 40. useCheckout Catch Block Missing Context

- **Issue:** Error logging lacked eventId, tierId, step for diagnosability.
- **Fix:** Assemble `context` object with `eventId`, `tierId`, `tierName`, `actionName` and log `{ err, context }` in the catch block.

### 41. validatePromo Leaves Stale State on valid: false

- **Issue:** When API returns `valid: false`, old promo data (discount/totals) remained.
- **Fix:** Added `else` branch to clear `setPromoValidation(null)`, `setPromoCode("")`, `setServerAmounts(null)`.

### 42. useEventDetails RPC Error & Validation

- **Issue:** RPC error log lacked eventId; manual runtime checks instead of Zod.
- **Fix:** Replaced `validateGetEventWithTiersResponse` with `GetEventWithTiersResponseSchema` (Zod); added `eventId` and `action` to all error logs; parse and rethrow with context.

### 43. Production Supabase IDs in Public Docs

- **Issue:** `PHASE_1_to_5_MONOREPO_FOUNDATION.md` exposed production project ID and URL.
- **Fix:** Replaced with `PROD_SUPABASE_PROJECT_ID` and `PROD_SUPABASE_URL` env var references.

### 44. EventsScreen Error Replaces Cached Content

- **Issue:** Error UI showed whenever `isError`, replacing valid cached content during background refetches.
- **Fix:** Only show error when `isError && !data`; extracted `EventsScreenStatus` and `EventsScreenBody` components.

### 45. CheckoutCTA Unused selectedTier Prop

- **Issue:** `selectedTier` prop declared but never used (`_selectedTier`).
- **Fix:** Removed from interface and all call sites.

### 46. CheckoutSuccessState Optional result.message

- **Issue:** `result.message` is optional; could render empty/awkward UI.
- **Fix:** Conditional render: show `FlameText` only when `result.message?.trim()` has content.

### 47. Sign-In ToggleMode Form Preservation

- **Issue:** Unclear if preserving email/password on mode switch was intentional.
- **Fix:** Added inline comment clarifying form values are intentionally preserved.

### 48. Sign-In Clerk Hooks Crash When Not Configured

- **Issue:** When `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` is unset, navigating to sign-in (e.g., deep link) crashed because Clerk hooks ran outside `ClerkProvider`.
- **Fix:** Split into `SignInScreen` (gate) and `SignInContent` (Clerk hooks). When `!isConfigured`, show "Authentication not configured" with Go Back; only mount `SignInContent` when Clerk is configured.

### 49. apiGet Dead Code Removal

- **Issue:** `apiGet` exported from `apps/mobile/lib/api.ts` but never imported or used anywhere in the mobile app. Previously deferred with a "Reserved for future use" JSDoc comment, but shipping unused exports adds unnecessary surface area.
- **Fix:** Removed the `apiGet` function entirely. The generic `apiClient` remains available if a GET helper is needed in the future.

### 50. formatEventDate/formatEventTime JSDoc Misleading

- **Issue:** JSDoc said "Uses device locale (en-GB)" implying dynamic locale.
- **Fix:** Updated to "Locale is hardcoded to en-GB" in `packages/lib/src/utils/format.ts`.

### 51. expo-env.d.ts in Version Control

- **Issue:** Generated file committed; can cause merge conflicts.
- **Fix:** Added `expo-env.d.ts` to `.gitignore`.

### 52. useOptionalAuth Fallback Causes Re-renders

- **Issue:** `useFallbackAuth()` returned fresh object every call.
- **Fix:** Module-level `FALLBACK_AUTH` constant; `useFallbackAuth` returns stable reference.

### 53. EventHero & HeroCarousel Size Guideline

- **Issue:** Both exceeded 100-line guideline.
- **Fix:** Extracted `OrganizerBadge` and `EventMeta` from EventHero; extracted `CarouselCard` and `DotsIndicator` from HeroCarousel.

### 54. Stripe Custom Dev Build Documentation

- **Issue:** `@stripe/stripe-react-native` 0.58 requires native rebuild; no doc guidance.
- **Fix:** Added "Stripe & Custom Dev Build" section to `PHASE_1_to_5_MONOREPO_FOUNDATION.md`: use `expo run:ios` or EAS build; app degrades gracefully in Expo Go.

### 55. Accessibility TODOs Added

- Added 4 items to `docs/todos/ACCESSIBILITY_TODOS.md`: OAuthButton, CheckoutMainSheet (close + clear promo), CredentialsForm password toggle.

---

## PR Review Fixes (Feb 18, 2026 — Round 4)

### 56. EventsScreen Status Early-Return Logic

- **Issue:** `if (status) return status` always returned because `status` is a JSX element (always truthy). EventsScreenBody never rendered even with valid data.
- **Fix:** Replaced with conditional `shouldShowStatus = !hasData && (isLoading || isError)`. Only show status UI when loading or error and no cached data.

### 57. useCheckout Error Logging Placeholder userId

- **Issue:** Error context used `userId: "(from token)"` instead of actual user ID.
- **Fix:** Added `userId` to `AuthResult` and `useOptionalAuth`; `useCheckout` now destructures `userId` and logs `userId ?? null` in error context.

### 58. Mock Date Weekday Correction

- **Issue:** Mock spotlight date "Thursday, 06 Feb, 2026" was incorrect (Feb 6, 2026 is Friday).
- **Fix:** Updated `apps/mobile/data/mock.ts` and doc quote to "Friday, 06 Feb, 2026".
- **Note:** Same `spotlightEvent` record as Fix #9 (isToday flag correction).

### 59. EventDetailScreen Error vs Not-Found Split

- **Issue:** Combined `if (error || !event)` rendered same "Event not found" for both fetch errors and true not-found.
- **Fix:** Split into two branches: error branch shows "Unable to load event" with Retry button (wired to `refetch()`) and Go Back; not-found branch shows "Event not found" with Go Back only.

### 60. onBookmark Handler — Deferred

- **Issue:** Handler was TODO; only logged eventId.
- **Fix:** Added deferred doc entry; TODO comment references FEB_2026_FIXES #56. Implement when bookmark feature is scoped.

### 61. SignInContent Refactor

- **Issue:** SignInContent was too large (~175 lines) with inline OAuth, email handlers, and UI pieces.
- **Fix:** Extracted `useSignInHandlers` hook (onGoogleAuth, onEmailSignIn, onEmailSignUp, loading, error, setError), `SignInBackButton`, and `SignInDivider` subcomponents. SignInContent now composes BrandingHeader, OAuthButton, CredentialsForm, ToggleMode with the hook.

### 62. HeroCarousel Module-Level Dimensions

- **Issue:** `Dimensions.get("window")` at module load made cardWidth static; carousel did not respond to device rotation.
- **Fix:** Switched to `useWindowDimensions()` inside the component; `cardWidth` recomputes on rotation.

### 63. HeroCarousel renderItem Memoization

- **Issue:** `renderItem` recreated every render, hurting performance for larger carousels.
- **Fix:** Wrapped in `useCallback` with `[cardWidth, router]` deps.

### 64. useEventDetails & useCheckout order_index Sort NaN

- **Issue:** `tiers.sort((a, b) => a.order_index - b.order_index)` produces NaN when `order_index` is undefined.
- **Fix:** Normalized with nullish coalescing: `(a.order_index ?? Infinity) - (b.order_index ?? Infinity)` in both hooks (and getStageId in useCheckout).

### 65. useOptionalAuth Explicit Type Annotation

- **Issue:** IIFE that picks useAuth lacked explicit type; used broad `as typeof useFallbackAuth` cast.
- **Fix:** Declared `AuthHookResult` and `AuthHook` types; annotated `const useAuth: AuthHook`; `useFallbackAuth` returns `AuthHookResult`; Clerk hook cast to `AuthHook`.

### 66. Accessibility TODOs (CarouselCard, DotsIndicator)

- Added 2 items to `docs/todos/ACCESSIBILITY_TODOS.md`: CarouselCard Image a11y, DotsIndicator tablist/tab a11y. Deferred per PR review.

---

## PR Review Fixes (Feb 18, 2026 — Round 5)

### 68. activeCategory Not Used in filteredEvents

- **Issue:** `activeCategory` was tracked and reflected in `CategoryFilterPills`, but `filteredEvents`
  memo ignored it. Users could tap category pills and see them highlight, but the event list never
  changed.
- **Fix:** Added category filter logic to `filteredEvents` useMemo. Events table has no `category_id`
  yet — using heuristic: match category id against title/location (e.g. "concert" → events with
  "concert" in title/location). "other" excludes concert, celebration, performance. Added
  `activeCategory` to dependency array.

### 69. useCheckout Catch Block Stale step

- **Issue:** In the catch block, `actionName: step` captured the closure's stale `step` value (typically
  `"idle"`). The `step` state is not in the `useCallback` dependency array, so intermediate
  `setStep()` calls during the async flow did not update the value visible to the error handler.
- **Fix:** Added `stepInProgressRef` (useRef) updated synchronously before each `setStep()` that
  precedes an await. Catch block now uses `stepInProgressRef.current` for accurate error context.

### 70. Dead formatPrice Re-export in useEventDetails

- **Issue:** `export { formatCentsAsPrice as formatPrice }` was defined but never imported anywhere.
  All other files import `formatCentsAsPrice` directly from `@project-flame/lib`. Dead export added
  confusion about which function name consumers should use.
- **Fix:** Removed the dead re-export and the unused `formatCentsAsPrice` import from useEventDetails.ts.

---

## PR Review Fixes (Feb 18, 2026 — Round 6)

### 71. HeroCarousel Auto-Scroll Error Logging

- **Issue:** Empty catch in auto-scroll effect swallowed useful failures without context.
- **Fix:** Catch block now logs error with context (action, activeIndex, eventsLength, eventId) via
  `console.error`; preserves recovery behavior (reset activeIndexRef to 0).

### 72. HeroCarousel onEventPress Callback Injection

- **Issue:** HeroCarousel hard-wired `useRouter` and `/events` navigation, reducing testability.
- **Fix:** Added optional `onEventPress?: (event: EventCardData) => void` prop; default handler uses
  `router.push("/events")` when not provided; renderItem uses injected or default handler.

### 73. useEventDetails Supabase Non-Null Assertion

- **Issue:** `supabase!` non-null assertion used without guarantee.
- **Fix:** apps/mobile/lib/supabase.ts now throws if `createSupabaseClient` returns null; removed
  assertion from useEventDetails.

### 74. useEventDetails Zod Validation & Unsafe Casts

- **Issue:** Double casts on rawEvent/rawTiers bypassed Zod validation.
- **Fix:** Expanded GetEventWithTiersResponseSchema with full EventSchema, TicketTierSchema,
  TicketStageSchema; validateGetEventWithTiersResponse returns properly typed values; removed unsafe
  casts when building EventDetail.

### 75. useSignInHandlers Double-Submission Guard

- **Issue:** onEmailSignIn and onEmailSignUp could fire twice before setLoading(true) took effect.
- **Fix:** Added `if (loading) return` as first statement in both callbacks; added `loading` to
  dependency arrays.

### 76. CheckoutCTA Rendered When quantity === 0

- **Issue:** CTA rendered when selectedTier existed even if quantity was 0; handleContinueToCheckout
  could theoretically be invoked with quantity 0.
- **Fix:** Changed conditional to `{selectedTier && quantity > 0 && (<CheckoutCTA ... />)}`.

### 77. mock.ts FooterContact Interface & FilterCategory Import

- **Issue:** footerContact lacked explicit interface; FilterCategory import was mid-file.
- **Fix:** Added `FooterContact` interface; annotated `footerContact: FooterContact`; moved
  FilterCategory import to top of module with other type imports.

### 78. Shared findFirstAvailableStage Helper

- **Issue:** getStageId (useCheckout) and getCurrentStagePrice (useEventDetails) duplicated
  "first non-sold-out stage" waterfall logic.
- **Fix:** Extracted `findFirstAvailableStage` to `@project-flame/lib` (packages/lib/src/utils/availability.ts);
  both useCheckout and useEventDetails now call the shared helper. Added unit tests in
  `packages/lib/__tests__/utils.test.ts`.

### 79. useOptionalAuth isConfigured Inference Comment

- **Issue:** isConfigured conditional relied on FALLBACK_AUTH vs Clerk behavior; unclear to maintainers.
- **Fix:** Added inline comment explaining FALLBACK_AUTH sets isConfigured: false; real Clerk omits
  it so we default to true.

### 80. FEB_2026_FIXES Cross-Reference Fix #9 and #58

- **Issue:** Fix #9 and #58 both touched spotlightEvent in mock.ts; readers could miss the relation.
- **Fix:** Added cross-reference notes to both fix entries.

### 81. mapEventToCardData Location Field

- **Issue:** `event.venue || event.city` discarded city when venue existed; events listing search
  (which filters on location) couldn't find events by city name (e.g. "Guayaquil").
- **Fix:** Switched to defensive `[event.venue, event.city].filter(Boolean).join(", ")` pattern
  to match mapEventToSpotlightData and event detail screen.

### 82. token-cache getToken Production Logging

- **Issue:** console.log on successful SecureStore read fired in production; included partial token
  key. Other logging guarded with `__DEV__`.
- **Fix:** Guarded log with `if (item && __DEV__)`.

### 83. validate-promo-code Route — False Alarm

- **Issue:** Review comment claimed `/api/purchase/validate-promo-code` does not exist in the web app and that all promo code validation from mobile would 404.
- **Finding:** The route **does exist** at `apps/web/app/api/purchase/validate-promo-code/route.ts` (143 lines). It is fully implemented with Clerk auth, input validation, Supabase lookup, discount calculation, and usage-limit checks. The response shape matches the mobile app's `PromoValidationResponseSchema` in `useCheckout.ts`.
- **Fix:** No code change needed. Documented to prevent future confusion.

---

## Header Redesign & Persistence (Feb 19, 2026)

### 84. Header Redesign — Figma-Matched Layout

- **Issue:** Header had a hamburger menu on the left and a "Log In" PillButton on the right, using a placeholder logo image URL. Did not match the Figma design (`389-7917`).
- **Fix:** Rewrote `apps/mobile/components/home/Header.tsx` to match Figma:
  - **Left:** Flame logo rendered via new `FlameLogo` component (react-native-svg, paths from `assets/flame-white.svg`).
  - **Right:** Notification bell icon (44×44, `bg-white-5`, `rounded-full`) + hamburger menu (42×40, `bg-white-10`, `rounded-[8px]`), 8px gap.
  - Removed `PillButton` and remote `Image` imports.

### 85. FlameLogo SVG Component

- **Issue:** No local logo component; Header used a remote placeholder URL.
- **Fix:** Created `apps/mobile/components/FlameLogo.tsx` using `react-native-svg` (Svg, Path, G). Accepts `width`, `height`, `color` props. Installed `react-native-svg@15.12.1` and added it to `metro.config.js` `extraNodeModules`.

### 86. Header Moved to Root Layout — Persistent Across Navigation

- **Issue:** `<Header />` was rendered inside each screen (`index.tsx`, `event/[id].tsx`, `EventsScreenBody.tsx`), causing it to transition/animate with page changes.
- **Fix:** Moved `<Header />` into `apps/mobile/app/_layout.tsx` above the `<Stack />` navigator. Removed `<Header />` and its import from all three screens. Header now persists across all screen transitions.

### 87. Header Height Fixed to Figma 92px

- **Issue:** Header height was implicit (content-driven), causing inconsistent spacing.
- **Fix:** Set explicit `height: insets.top + 60` (Figma: 32px status bar + 44px content + 16px bottom = 92px). Changed from absolute positioning to normal document flow (`bg-background`) so the Stack content starts immediately below.

### 88. Removed Legacy Header Offset Margins

- **Issue:** Three screens had manual `mt-[81px]` or `mt-[87px]` margins to offset content below the old absolute-positioned header. After moving Header to the layout flow, these created a double gap.
- **Fix:** Removed top margins from:
  - `apps/mobile/components/home/HeroCarousel.tsx` (`mt-[87px]`)
  - `apps/mobile/components/events/EventsScreenBody.tsx` (`mt-[81px]`)
  - `apps/mobile/app/event/[id].tsx` (`mt-[81px]`)

---

## Deferred (PR Review — Feb 18, 2026)

### 67. onBookmark Handler Placeholder

- **Location:** `apps/mobile/app/events.tsx` onBookmark callback.
- **Issue:** Handler is a TODO; only logs eventId. Needs API integration and optimistic updates when scoped.
- **Status:** Deferred. TODO comment references this doc; implement when bookmark feature is scoped.

---

## PR Review Fixes (Feb 19, 2026 — Round 7)

### 89. Test Isolation — vi.clearAllMocks() in utils.test.ts

- **Issue:** `isTierAvailable` and `hasNotStartedTiers` `beforeEach` blocks lacked `vi.clearAllMocks()`, violating the project's Mocking Best Practices guideline.
- **Fix:** Added `vi.clearAllMocks()` as the first call in both `beforeEach` hooks.

### 90. GlowBlob Props Interface Extraction

- **Issue:** `GlowBlob` used an inline type annotation for props instead of a named interface.
- **Fix:** Extracted `GlowBlobProps` interface; component signature now references the named type.

### 91. Supabase Import — Use Public API

- **Issue:** `apps/mobile/lib/supabase.ts` imported `createSupabaseClient` via deep path (`@project-flame/lib/src/supabase/client`) instead of the package's public API.
- **Fix:** Changed import to `@project-flame/lib` per Import Guidelines.

### 92. FEB_2026_FIXES.md — Duplicate Separator

- **Issue:** Two consecutive `---` separators between Round 4 and Round 5 sections.
- **Fix:** Removed the duplicate.

### 93. useAppEvents Redundant staleTime

- **Issue:** `staleTime: 1000 * 60 * 5` in `useAppEvents` duplicated the QueryClient default set in `_layout.tsx` (Fix #17), adding maintenance overhead.
- **Fix:** Removed the per-query `staleTime`; added a comment referencing the inherited default.

### 94. SpotlightCard — Simplified Conditional Rendering

- **Issue:** `isToday` / `!isToday` conditionals duplicated the wrapper `<View className="border-r border-white-30 pr-[6px]">`.
- **Fix:** Consolidated into a single `<View>` with a ternary for the inner `<FlameText>`.

### 95. EventsScreen — const Pipeline (No let Reassignment)

- **Issue:** `filteredEvents` `useMemo` used mutable `let events` with multiple reassignments.
- **Fix:** Refactored to `const afterCategory` intermediate variable and early return, eliminating `let` per coding guidelines.

### 96. HeroCarousel — Redundant useEffect Dependency

- **Issue:** `useEffect` deps included both `events.length` and `events`; the former is redundant since `events` changing implies length changing.
- **Fix:** Removed `events.length` from the dependency array.

### 97. Edge Cases & Accessibility Deferred

- Logged 23 edge case/optimization items to `docs/todos/EDGE_CASES_TODOS.md`.
- Verified 2 accessibility items (PillButton, OAuthButton) were already tracked in `docs/todos/ACCESSIBILITY_TODOS.md`.

### 98. useEffect Quantity Clamp — Incomplete maxQuantity Sync

- **Issue:** The `useEffect` syncing `quantity` with `maxQuantity` only reset quantity to 0 when
  `maxQuantity` dropped to zero or below. It did not clamp `quantity` when `maxQuantity` decreased to
  a positive value still below the current `quantity`. For example, if a user selected quantity 5 and
  a data refetch showed only 3 tickets remaining, `quantity` stayed at 5 while `maxQuantity` became 3.
  The `QuantitySelector` would display "5" (exceeding max), and proceeding to checkout would fail at
  the server hold-creation step.
- **Fix:** Replaced the narrow `maxQuantity <= 0 && quantity > 0` check with a general clamp:
  `if (quantity > maxQuantity) setQuantity(maxQuantity)`. This handles both sell-out (maxQuantity → 0)
  and partial inventory reduction (e.g. maxQuantity 10 → 3) in a single condition.

### 99. HeroCarousel — activeIndex Out-of-Range on Shrinking Events

- **Issue:** When the `events` array shrank (e.g., real-time refetch returning fewer events),
  `activeIndex` could exceed `events.length - 1`, causing the `DotsIndicator` and auto-scroll to
  reference a nonexistent index.
- **Fix:** Added a `useEffect` keyed on `events.length` inside the new `useHeroCarousel` hook that
  clamps both `activeIndex` (state) and `activeIndexRef.current` when the array shrinks, and resets
  both to 0 when events is empty.

### 100. HeroCarousel — Extract useHeroCarousel Hook

- **Issue:** `HeroCarousel` component mixed viewability tracking, auto-scroll interval logic, and
  rendering concerns in a single file, making it harder to test and reason about.
- **Fix:** Extracted `activeIndex`, `activeIndexRef`, `onViewableItemsChanged`, the index-sync
  `useEffect`, the clamping `useEffect`, and the auto-scroll `useEffect` into a new
  `apps/mobile/hooks/useHeroCarousel.ts` hook. `HeroCarousel` now calls
  `useHeroCarousel(flatListRef, events)` and uses the returned `activeIndex` and
  `onViewableItemsChanged`.

### 101. supabase.ts — Dependency-Injectable Factory

- **Issue:** `apps/mobile/lib/supabase.ts` used a module-level singleton with manual `if` checks for
  env vars, no structured validation, and no error logging with context. Made unit testing impossible
  without mocking module internals.
- **Fix:** Replaced with `getSupabaseClient({ logger?, createClient? })` factory that validates
  `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` via Zod, wraps client creation in
  try/catch with contextual logging via an injectable logger, and exports both the factory and the
  default singleton (`export const supabase = getSupabaseClient()`).

### 102. FEB_2026_FIXES.md — Unescaped `__tests__` Markdown (`MD050`)

- **Issue:** Raw `__tests__` in fix #78 text was interpreted as bold emphasis by Markdown renderers.
- **Fix:** Wrapped `__tests__` in backticks to render as inline code.

### 103. useCheckout — Dead `formatCentsAsPrice` Import

- **Issue:** `formatCentsAsPrice` was imported from `@project-flame/lib` in `useCheckout.ts` but
  never used; all price formatting happens in component files with their own imports.
- **Fix:** Removed the unused import.

### 104. mock.ts — Dead Home Screen Mock Data

- **Issue:** `HeroBanner` interface, `heroBanners`, `featuredEvents`, `upcomingEvents`, and
  `spotlightEvent` exports were never imported by any consumer. The home screen uses `useAppEvents()`
  for real Supabase data. These were remnants of the pre-integration mock approach.
- **Fix:** Removed the dead exports and their associated `EventCardData`/`SpotlightData` type imports
  that became unused.

---

## PR Review Fixes (Feb 19, 2026 — Round 8)

### 105. HeroCarousel — defaultOnEventPress Signature Mismatch

- **Issue:** `defaultOnEventPress` had signature `() => void` while `onEventPress` was
  `(event: EventCardData) => void`. The union `onEventPress ?? defaultOnEventPress` produced an
  incompatible function type, causing a type error when `renderItem` called `handleEventPress(item)`.
- **Fix:** Changed `defaultOnEventPress` to accept `(_event: EventCardData)` and ignore the argument,
  making both branches of the union share the same `(event: EventCardData) => void` type.

### 106. HeroCarousel — flatListRef Nullable Type

- **Issue:** `useRef<FlatList<EventCardData>>(null)` conflicted with `useHeroCarousel`'s expected
  `React.RefObject<FlatList<EventCardData> | null>` under strict null checks.
- **Fix:** Changed generic to `useRef<FlatList<EventCardData> | null>(null)`.

### 107. useCheckout — Paid RSVP Uses Client-Side Promo ID

- **Issue:** The paid RSVP submission (step 3 after PaymentSheet) used
  `promoValidation?.promotional_code?.id` (client-side) while the free-via-promo flow used
  `piResponse.promotionalCodeId` (server-resolved). Inconsistent source of truth for promo ID.
- **Fix:** Replaced `promoValidation?.promotional_code?.id` with `piResponse.promotionalCodeId`
  in the paid RSVP `apiPost("/api/rsvp", ...)` payload. Removed stale `promoValidation` from
  the `checkout` dependency array.

### 108. project-flame-master.mdc — API Test Glob Pattern

- **Issue:** API test glob was `**/tests/api/**/*.test.ts`, inconsistent with the `__tests__/` prefix
  convention used by unit and component test patterns.
- **Fix:** Updated to `**/__tests__/api/**/*.test.ts`.

### 109. useCheckout — validatePromo Error Handling

- **Issue:** `validatePromo` didn't clear prior errors before starting, didn't set a user-facing
  error when `response.valid === false`, and the catch block lacked contextual logging.
- **Fix:** Added `setError(null)` at the start; `else` branch now calls `setError(response.error ??
"Promo code is not valid")`; catch block logs `{ action, userId, eventId, code, err }` via
  `console.error` with structured context.

### 110. useCheckout — PromoValidationResponseSchema Discriminated Union

- **Issue:** Schema required `promotional_code`, `discount_amount_cents`, and `final_total_cents`
  unconditionally, failing to parse `{ valid: false }` responses from the server.
- **Fix:** Refactored to `z.discriminatedUnion("valid", [...])` with a `valid: true` branch
  requiring all promo fields and a `valid: false` branch with optional `error` string and nullable
  promo fields.

### 111. mock.ts — FilterCategory Type Decoupled

- **Issue:** `mock.ts` imported `FilterCategory` from `CategoryFilterPills` component, coupling
  the data layer to a specific UI component.
- **Fix:** Extracted `FilterCategory` interface to `packages/ui/src/types/events.ts`; exported from
  `packages/ui` barrel. Updated `CategoryFilterPills` to import and re-export from the shared type.
  Updated `mock.ts` and `EventsScreenBody.tsx` to import from `@project-flame/ui`.

### 112. useAppEvents — formatDay/formatMonth Moved to packages/lib

- **Issue:** `formatDay` and `formatMonth` were defined locally in `useAppEvents.ts`, duplicating
  the same pattern used by `formatEventDate`/`formatEventTime` in `packages/lib`.
- **Fix:** Added `formatDay(dateString)` and `formatMonth(dateString)` to
  `packages/lib/src/utils/format.ts`; exported from utils and main barrel. Removed local
  definitions from `useAppEvents.ts`; imports from `@project-flame/lib`.

### 113. useAppEvents — Error Log Missing Context

- **Issue:** The `console.error("Error fetching events:", error)` call lacked an `action` field
  for structured debugging.
- **Fix:** Changed to `console.error("[useAppEvents] fetchEvents failed:", { action: "useAppEvents:fetchEvents", error })`.

### 114. findFirstAvailableStage — Additional Unit Tests

- **Issue:** No test coverage for empty `ticket_stages` array or stages with missing `order_index`.
- **Fix:** Added two tests: (1) `ticket_stages: []` returns tier `price_cents` with undefined
  stageId/stageName (same as `undefined`); (2) stages with `order_index: undefined` are treated
  as Infinity, confirming the `?? Infinity` fallback sorts them after indexed stages.

### 115. useCheckout — validatePromo Catch Block Stale promoCode

- **Issue:** The `catch` block in `validatePromo` cleared `promoValidation` but not `promoCode` or
  `serverAmounts`. If a prior successful validation set `promoCode` and a subsequent validation
  threw (e.g., Zod parse error), `promoCode` retained the stale value. The `checkout` callback
  then sent this stale code to the server even though the UI showed no promo applied.
- **Fix:** Added `setPromoCode("")` and `setServerAmounts(null)` to the catch block, matching the
  `else` branch cleanup for `valid: false` responses.

---

## PR Review Fixes (Feb 19, 2026 — Round 9)

### 116. `NITPICKS_TODOS.md` Created

- **Issue:** The rules referenced a non-existent `NITPICKS_TODOS.md` file.
- **Fix:** Created `docs/todos/NITPICKS_TODOS.md` and added 4 deferred items from PR review: Supabase client injection, `checkout` callback dependencies, Stripe load error logging, and `FilterPill` component export.

### 117. `useAppEvents` Supabase Error Handling and Validation

- **Issue:** Lacked a top-level `try/catch` around `queryFn`, and bypassed type safety by casting the Supabase response without validation.
- **Fix:** Wrapped `queryFn` in `try/catch` with structured error logging. Added `EventSchema` to `@project-flame/lib` and used `z.array(EventSchema).safeParse(data)` to validate the Supabase response before mapping, returning safe empty arrays on validation failure.

### 118. `useCheckout` free-checkout Response Validation

- **Issue:** The free-checkout API call assigned an inline-typed response without Zod validation.
- **Fix:** Added `freeCheckoutResponseSchema` and replaced the inline cast with `.parse()`.

### 119. `useCheckout` Promo Discount Re-computation

- **Issue:** The `estimates` useMemo used a fixed `discount_amount_cents` from validation time, leading to stale totals when quantity changed.
- **Fix:** Changed the calculation to dynamically apply `promotional_code.discount_percentage` against the current subtotal.

### 120. `EventDetailScreen` Error Fallback Blank Page Fix

- **Issue:** The screen checked `if (error)` without `!event`, causing transient background refetch errors to wipe out the already-loaded UI with an error screen.
- **Fix:** Changed condition to `if (error && !event)`.

### 121. `useEventDetails` and `event/[id].tsx` Tier Limit 0 Logic

- **Issue:** `getTierStatus` treated `per_user_limit === 0` as available, and `maxQuantity` treated `0` as falsy (no limit) instead of zero tickets allowed.
- **Fix:** Added `if (tier.per_user_limit === 0) return "sold_out"` in `getTierStatus`. Updated `maxQuantity` condition to `selectedTier.per_user_limit != null`.

---

## PR Review Fixes (Feb 19, 2026 — Round 10)

### 122. `useCheckout` Callback Stale Closures

- **Issue:** `validatePromo` and `checkout` callbacks in `useCheckout.ts` captured injected dependencies (`injectedApiPost`, `injectedGetStripeFunctions`) but omitted them from dependency arrays.
- **Fix:** Added `injectedApiPost` and `injectedGetStripeFunctions` to the `useCallback` dependency arrays.

### 123. `Event` Interface Missing `requires_rsvp`

- **Issue:** The TypeScript `Event` interface in `packages/lib/src/types/event.ts` was missing the `requires_rsvp` property validated by `EventSchema`.
- **Fix:** Added `requires_rsvp?: boolean;` to the `Event` interface.

### 124. `useAppEvents` Silent Array Validation Failure

- **Issue:** When Zod `safeParse` failed for the events array, `queryFn` returned empty arrays instead of throwing, causing React Query to cache the silent failure.
- **Fix:** Changed `queryFn` to `throw new Error("Failed to validate events data")` on validation failure instead of returning empty fallback data.

### 125. `seed_mock_events.sql` Unique Index Conflict

- **Issue:** The seed script's `UPDATE` statement only cleared `is_featured` on mock events, violating the `idx_single_featured_event` unique index if a real event was already featured.
- **Fix:** Changed the `UPDATE` statement to clear the `is_featured` flag globally (`WHERE is_featured = true`) before inserting the new mock featured event.

### 126. `EventDetailScreen` Refactoring — Deferred

- **Issue:** `EventDetailScreen` is over 100 lines and needs splitting into smaller components.
- **Fix:** Deferred to `docs/todos/NITPICKS_TODOS.md` as an optional refactor.

### 127. `useAppEvents` Supabase Injection — Deferred

- **Issue:** `useAppEvents` imports a module-level supabase singleton instead of accepting an injected client.
- **Fix:** Deferred to `docs/todos/NITPICKS_TODOS.md` as an optional refactor.

---

## PR Review Fixes (Feb 20, 2026)

### 128. `seed_mock_events.sql` Blast Radius

- **Issue:** The seed script unconditionally cleared `is_featured` on all events (including real ones) to satisfy the unique partial index `idx_single_featured_event`.
- **Fix:** Updated the script to only clear `is_featured` on mock events, and conditionally feature the first mock event only if no real event is currently featured.

### 129. `useCheckout` Double-Tap Guard

- **Issue:** A rapid double-tap before React's state batch flushes could invoke the checkout function twice, potentially creating duplicate hold sessions or payment intents.
- **Fix:** Added an early return using `stepInProgressRef.current !== "idle"` (checking for non-terminal states) to prevent re-entry. Ensured `stepInProgressRef` is correctly updated to `"success"`, `"error"`, and `"idle"` throughout the flow to accurately track the state synchronously.

### 130. `useCheckout` Cancel Branch Missing `stepInProgressRef` Reset (Direct Purchase)

- **Issue:** In the direct purchase flow, when the user cancels the Stripe PaymentSheet, `setStep("idle")` was called but `stepInProgressRef.current` was not reset to `"idle"`. Because the double-submission guard checks `stepInProgressRef.current`, the ref staying as `"presenting_sheet"` caused all subsequent `checkout()` calls to silently bail out — the Pay button became permanently non-functional. The RSVP paid flow already reset the ref correctly; this was inconsistent.
- **Fix:** Added `stepInProgressRef.current = "idle"` before `setStep("idle")` in the direct purchase cancel branch (line 533), matching the pattern already used in the RSVP paid flow (line 420).

### 131. `EventSchema` Rejecting Supabase NULLs and Containing Non-Existent Field

- **Issue:** `EventSchema` in `packages/lib/src/types/event.ts` used `z.string().optional()` for `description` and `image_url`, which only accepts `string | undefined` — not `null`. Supabase returns `null` for empty nullable columns, causing Zod validation failures in `useAppEvents.ts`. Additionally, the schema included an `organizations` property that doesn't exist in the `events` table (it's a joined relation, not a column).
- **Fix:** Changed `description` and `image_url` to `z.string().nullable().optional()` to accept `string | null | undefined`. Removed the `organizations` property from the schema. Left `is_featured` and `requires_rsvp` unchanged (they use `.optional()` correctly since they have defaults in the DB but aren't guaranteed in every query).

### 132. `useCheckout` Unconditional `promotional_code_id` in RSVP Free-via-Promo Flow

- **Issue:** In the RSVP paid flow's free-via-promo branch (100% discount, no PaymentSheet), `promotional_code_id: piResponse.promotionalCodeId` was included unconditionally in the `/api/rsvp` request body. When `promotionalCodeId` is `undefined`, this sends `promotional_code_id: undefined` to the API. The other two flows (RSVP paid with sheet at line 437, and direct purchase free at line 495) correctly used conditional spreading.
- **Fix:** Changed to conditional spread `...(piResponse.promotionalCodeId ? { promotional_code_id: piResponse.promotionalCodeId } : {})` to match the pattern used in the other flows.

### 133. `useCheckout` Dead Promo Validation Schema — Deferred

- **Issue:** `promoValidationInvalidSchema` and the discriminated union are dead code — the API returns HTTP 400/404 for invalid codes (thrown as exceptions by `apiClient`), never a 200 with `valid: false`.
- **Fix:** Deferred to `docs/todos/NITPICKS_TODOS.md` as an optional cleanup.

### 134. `useAppEvents` Supabase Client DI — Deferred (Duplicate)

- **Issue:** `useAppEvents` hard-depends on the global supabase client, making it difficult to test.
- **Fix:** Already tracked in `docs/todos/NITPICKS_TODOS.md` and changelog entry #127. No additional action needed.

### 135. `NITPICKS_TODOS.md` Duplicate Heading (MD024)

- **Issue:** Two identical `## apps/mobile/hooks/useCheckout.ts` headings existed in `docs/todos/NITPICKS_TODOS.md` (lines 11 and 14), violating MD024 (no duplicate headings).
- **Fix:** Merged both entries under a single heading.

### 136. `useCheckout` Stripe Error Logging & Dead Promo Schema — Re-raised, Already Deferred

- **Issue:** Two nitpick items were re-raised: (1) `getStripeFunctions` catch swallowing errors, (2) dead `promoValidationInvalidSchema` code.
- **Fix:** Both already tracked in `docs/todos/NITPICKS_TODOS.md` (entries from prior review). No additional action.

### 137. `useCheckout` Error Handler Not Clearing `serverAmounts`

- **Issue:** The `catch` block in `checkout()` set the error state but never called `setServerAmounts(null)`. If the payment-intent step succeeded (populating `serverAmounts`) but a later step failed (e.g., Stripe `initPaymentSheet`), `displayAmounts` continued using the stale server values. On retry, the checkout sheet could show a line item based on `tier.displayPrice * quantity` while the subtotal/total showed a different server-derived amount — a price mismatch.
- **Fix:** Added `setServerAmounts(null)` to the `catch` block so `displayAmounts` falls back to client-side estimates after any error, keeping the UI consistent on retry.

### 138. `EventsScreenStatus` `console.error` in Render Body

- **Issue:** `console.error` was called directly in the render path of `EventsScreenStatus` (inside the `if (isError && !hasData)` branch). This caused the log to fire on every re-render while the error state was active, including React Strict Mode double-renders and parent state changes, spamming the console with duplicates.
- **Fix:** Moved the `console.error` into a `useEffect` with `[isError, hasData, error]` dependencies so it logs once per error change.

---

## PR Review Fixes — Phase 4 Dashboard/Ticket/Notifications UI (Feb 23, 2026)

### 139. Dashboard Stats vs Ticket List Mismatch

- **Issue:** `dashboardStats.totalTickets` was 3 while `dashboardTickets` had 4 items; `readyToBuy: 1` plus others summed to 4, causing StatsGrid to show counts that didn't match the rendered ticket list.
- **Fix:** Updated `dashboardStats.totalTickets` to 4 in `apps/mobile/data/mock.ts`.

### 140. Notification Price Units & formatCurrency

- **Issue:** `NotificationCard` used `formatCurrency(item.price)` but `formatCurrency` expects dollars; mock had `price: 80` with unclear units. Per project convention (cents), this would have displayed $80.00 incorrectly if 80 were cents.
- **Fix:** Updated mock `notifications` to use `price: 8000` (cents for $80.00); updated `NotificationCard` to use `formatCentsAsCurrency(item.price)`; added comment in mock clarifying units.

### 141. Settings Profile Photo Pressables Missing onPress

- **Issue:** The edit and delete profile photo `Pressable` components in `settings.tsx` had no `onPress` handlers, making taps unhandled.
- **Fix:** Added `handleEditProfilePhoto` and `handleDeleteProfilePhoto` TODO-stub functions and wired them to the respective `Pressable` components with `onPress` props.

### 142. Ticket Detail Screen Layout — Gap & Header Overlay

- **Issue:** (1) Main container used `gap-6` instead of required 70px section spacing; (2) `DashboardBar` was inline; (3) ScrollView didn't have `flex-1 bg-background`.
- **Fix:** Changed main `View` gap to `gap-[70px]`; moved `DashboardBar` to absolute overlay via new `className` prop; applied `flex-1 bg-background` to ScrollView; added `paddingTop: 54` so content clears the overlay header.

### 143. DashboardBar Avatar Rounding Token

- **Issue:** Avatar used `rounded-[20px]` instead of design-system `rounded-[9999px]` for circular avatars.
- **Fix:** Updated `DashboardBar` Image `className` from `rounded-[20px]` to `rounded-[9999px]`.

### 144. DashboardBar className Prop for Overlay

- **Issue:** Ticket detail screen needed `DashboardBar` as absolute overlay but component had no way to pass positioning classes.
- **Fix:** Added optional `className` prop to `DashboardBarProps` and applied it to the root View for overlay use.

### 145. StatsGrid StatCard — Wrong Background Token

- **Issue:** StatCard used `bg-white-10` instead of the card token (`rgba(255,255,255,0.06)`).
- **Fix:** Replaced `bg-white-10` with `bg-card` in StatCard root View.

### 146. StatsGrid StatCard — Inline Props Type

- **Issue:** StatCard used inline `{ label: string; value: string }` instead of a named interface.
- **Fix:** Created and exported `StatCardProps` interface; updated StatCard to use it.

### 147. TicketCard — Wrong Background Token & Loose Status Types

- **Issue:** (1) Card used `bg-white-5` instead of `bg-card`; (2) `STATUS_COLORS` and `STATUS_LABELS` were `Record<string,string>` instead of `Record<TicketStatus, string>`.
- **Fix:** Replaced `bg-white-5` with `bg-card`; tightened maps to `Record<TicketStatus, string>`.

### 148. HistoryCard — Inline Props & Wrong Background

- **Issue:** (1) Used inline type instead of `HistoryCardProps`; (2) Card used `bg-white-5` instead of `bg-card`.
- **Fix:** Created and exported `HistoryCardProps` interface; replaced `bg-white-5` with `bg-card`.

### 149. NotificationCard — Wrong Background Token & Loose Status Types

- **Issue:** (1) Card used `bg-white-5` instead of `bg-card`; (2) `STATUS_COLORS` and `STATUS_LABELS` were `Record<string,string>` instead of `Record<NotificationStatus, string>`.
- **Fix:** Replaced `bg-white-5` with `bg-card`; tightened maps to `Record<NotificationStatus, string>`.

### 150. MenuOverlay Log Out Missing onPress

- **Issue:** Log Out `Pressable` had no `onPress` handler, making it non-functional.
- **Fix:** Added `onPress` with inline TODO comment for Phase 5 sign-out implementation.

### 151. ticket/[id].tsx — Reverted Incorrect gap-[70px]

- **Issue:** A previous fix pass changed `gap-6` to `gap-[70px]`, misapplying the home screen "70px between major sections" rule to the ticket detail screen. The Figma design uses tight spacing between elements on this screen.
- **Fix:** Reverted to `gap-6` (24px) matching the original Figma-derived implementation.

### 152. ticket/[id].tsx — Reverted Incorrect Absolute DashboardBar

- **Issue:** A previous fix pass made `DashboardBar` an absolute overlay (`absolute top-0 left-0 right-0 z-10`). DashboardBar is a solid `bg-white-10` bar — not a transparent header — so content would visibly scroll behind it. All other inner screens (dashboard, history, settings) use DashboardBar inline.
- **Fix:** Reverted to inline DashboardBar with `paddingTop: 14` on the ScrollView, matching all other inner screens.

### 153. NotificationCard — formatCentsAsCurrency With Wrong Units + Invalid Icon

- **Issue:** (1) `formatCentsAsCurrency(item.price)` was called with `price: 80` (dollars, not cents), displaying "$0.80" instead of "$80". Figma shows "80$". (2) Icon name `coin-outline` is not a valid `MaterialCommunityIcons` glyph.
- **Fix:** Reverted to `{item.price}$` to match Figma for Phase 4 mock data; changed icon to `currency-usd`. Real currency formatting deferred to Phase 5.

### 154. MenuOverlay & NotificationsOverlay — Rapid Toggle Animation Bug

- **Issue:** The close-animation `.start()` callback unconditionally called `setShouldRender(false)` without checking `{ finished }`. When a close animation is interrupted by a rapid reopen, the callback fires with `finished: false`, setting `shouldRender` to `false` after the open path already set it to `true`. The overlay becomes permanently invisible until `visible` toggles again.
- **Fix:** Added `({ finished }) => { if (finished) setShouldRender(false); }` in both `MenuOverlay.tsx` and `NotificationsOverlay.tsx` so interrupted animations don't clobber state.

### 155. Org Dashboard Screens — DashboardBar Absolute Overlay Pattern

- **Issue:** DashboardBar was rendered in normal layout flow across 6 screens (create-event, org-dashboard, org-event-detail, rsvp-detail, rsvp-management, settings), preventing content from scrolling under it.
- **Fix:** Made DashboardBar (and co-located tab bars in create-event/settings) absolutely positioned with `z-10`, added `paddingTop` to each ScrollView's `contentContainerStyle` to offset the header height (~62px for DashboardBar, ~42px for tab bars).

### 156. org-event-detail — Multiple UI Fixes

- **Issue:** (1) Hardcoded "Event name details" string instead of dynamic `event.eventName`. (2) Major section gap was `gap-6` instead of `gap-[70px]`. (3) "Event not found" view had no back button and wrong typography (missing `leading-[22px]`). (4) OrgSendTicketsCard and OrgPurchasedDetailsCard lacked `onClose` handlers.
- **Fix:** Replaced hardcoded title with `event.eventName ?? "Untitled event"`. Changed outer gap to `gap-[70px]`. Added back button and `leading-[22px]` to not-found view. Added `onClose` prop to both card components and forwarded to OrgSectionCard. Passed `onClose={() => toggleSection(...)}` from org-event-detail.

### 157. Currency Symbol Placement — StageCard, TierCard, RsvpRequestCard

- **Issue:** Currency symbol was rendered after the amount (e.g., "10$") instead of before ("$10").
- **Fix:** Moved `$` before the numeric value in StageCard, TierCard, and RsvpRequestCard.

### 158. Design Token Corrections

- **Issue:** (1) OrgEventInfoCard used `bg-white-5` instead of `bg-card` token. (2) Event name Text used `text-white` instead of `text-white-100`. (3) SettingsField used hardcoded `rounded-[30px]` instead of `rounded-pill` token.
- **Fix:** Replaced with correct design tokens: `bg-card`, `text-white-100`, `rounded-pill`.

### 159. OrgSectionCard — Android Elevation & React Import

- **Issue:** (1) iOS-only shadow props with no Android `elevation`. (2) Multiple components referenced `React.ReactNode` without importing the React namespace.
- **Fix:** Added `elevation: 4` to OrgSectionCard style. Added explicit `import { type ReactNode } from "react"` and replaced `React.ReactNode` with `ReactNode` in OrgSectionCard, RsvpRequestCard, StageCard, TierCard, EventDetailsTab, TicketTiersTab, SettingsField, OrgActionButtons, NotificationCard, and EventMeta.

### 160. Layout & Text Fixes

- **Issue:** (1) OrgPromoterLinksCard pills had no gap. (2) OrgPromotionsCard pills could overflow without wrapping. (3) RsvpEventCard/RsvpRequestCard lacked pluralization for "request"/"ticket". (4) RsvpRequestCard Approve button mixed Subtitle1 size with Body line height (`leading-[22px]` instead of `leading-5`). (5) OrgPurchasedDetailsCard revenue not formatted as currency.
- **Fix:** Added `gap-2` to promoter links container. Added `flex-wrap` to promotions container. Added conditional pluralization. Corrected Approve button to `leading-5`. Formatted revenue with `toLocaleString`.

### 161. Misc UI Fixes

- **Issue:** (1) StageCard rendered delete button even when `onDelete` was undefined. (2) OrgSendTicketsCard tabs toggled state but never branched content. (3) rsvp-management used `as never` cast on router.push. (4) Mock data `createEventTiers` had two identical entries. (5) OrgSendTicketsCard "Find user by email" text used `text-white` instead of `text-white-100`.
- **Fix:** Wrapped delete button in `{onDelete && ...}` conditional. Added tab content branching (sendFree shows email search, bankTransfer shows placeholder). Replaced `as never` cast with string-based URL. Made second tier distinct (General Admission, $25, 200 total, etc.). Fixed text token.

### 162. OrgActionButtons — Button Order Mismatch With Section Order

- **Issue:** Action buttons rendered `purchasedDetails` (ticket icon) 3rd and `promoterLinks` (link icon) 4th, while expandable sections in `org-event-detail.tsx` display `promoterLinks` 3rd and `purchasedDetails` 4th. The 3rd button’s toggle affected the 4th section and vice versa, creating confusing UX.
- **Fix:** Reordered buttons in `OrgActionButtons` to match section order: promoterLinks (link) 3rd, purchasedDetails (ticket) 4th.

### 163. Phase 4 PR Review — Design Tokens, Layout, Navigation (Feb 23, 2026)

- **Header logo navigation:** Replaced `router.replace("/")` with `router.dismissAll()` + `router.replace("/")` so the logo tap fully resets the stack and Back does not return to a prior org screen.
- **Card background token:** Replaced `bg-white-5` / `bg-white-10` with `bg-card` in OrgStatsSection (StatCard, QR scanner), RsvpRequestCard, StageCard, OrgSectionCard.
- **RsvpRequestCard:** View Details button now uses `rounded-pill` and `border-white-30` instead of hardcoded values.
- **OrgPromotionsCard:** Replaced non-functional close Pressable with View (removed affordance); changed `*` separator to `·`; fixed text-[10px] → text-xs (design system minimum).
- **Spacing:** org-dashboard gap-[30px] → gap-[70px]; rsvp-management and rsvp-detail use gap-[70px] between major sections with proper nesting. _(Reverted in Fix #165 — incorrect application of home screen spacing rule to dashboard screens.)_
- **Design tokens:** Added `accent` (#59B2FF) for link/action text; PersonalSettingsTab and OrganizationSettingsTab Save buttons use `bg-white-100` and `text-dark`; RsvpEventCard View Details uses `text-accent`.
- **ScrollView bg-background:** Added to settings, rsvp-management, create-event, rsvp-detail, org-event-detail.
- **Route params guard:** org-event-detail normalizes `id` from useLocalSearchParams (handles string | string[] | undefined).
- **MenuOverlay:** Removed duplicate "Events Management" item (both Dashboard and Events Management navigated to /org-dashboard).
- **Typography:** TicketTiersTab Note text-[10px] → text-xs.
- **OrgEventCard revenue:** Formatted with toLocaleString (min/max 2 fraction digits) for consistency with OrgPurchasedDetailsCard.

### 164. Phase 4 PR Review — Deferred to Phase 5 / Todos (Feb 23, 2026)

The following PR comments were triaged and deferred per project-flame-master.mdc (Phase 4 is UI only; no state management, handlers, or business logic):

- **EventDetailsTab:** TextInput editable/state and Pressable handlers (onPickImage, onConfirm) → EDGE_CASES #27 (expanded).
- **TicketTiersTab:** FormInput controlled inputs, QuantityStepper onChange, CTA onPress handlers → EDGE_CASES #32.
- **TicketTiersTab:** createEventTiers/createEventStages as props (DI) → NITPICKS.
- **OrganizationSettingsTab:** Editable fields with local state and onChangeText → EDGE_CASES #33.
- **RsvpRequest.price:** Cents vs dollars convention and documentation → EDGE_CASES #34.

### 165. Reverted Incorrect gap-[70px] on Dashboard Screens

- **Issue:** Fix #163 changed section gaps to `gap-[70px]` on org-dashboard (was `gap-[30px]`), rsvp-detail (was `gap-[14px]`), and rsvp-management (was `gap-6`). The 70px rule is from the _home screen_ pattern for distinct, unrelated major sections. Dashboard screens have tightly-coupled content (stats bar + cards, header + event list) that requires compact spacing. Figma verification confirmed the original values were correct. This is the same mistake documented in Fix #151 (`ticket/[id].tsx`).
- **Fix:** Reverted org-dashboard to `gap-[30px]`, rsvp-detail to `gap-[14px]`, rsvp-management to `gap-6`. Restored original flat layout in rsvp-detail (removed unnecessary nested View wrapper).

### 166. Reverted OrgStatsSection bg-card → bg-white-10

- **Issue:** Fix #163 changed stat card and QR scanner backgrounds from `bg-white-10` to `bg-card`. The design system defines `card` as rgba(255,255,255,0.06) and `white-10` as rgba(255,255,255,0.1). Figma shows stat cards with a visibly stronger background than regular content cards, consistent with the higher opacity `bg-white-10` token.
- **Fix:** Reverted StatCard and QR Scanner Pressable to `bg-white-10`.

### 167. Phase 4 PR Review — Safe Area, Title, Design Token, Cents Convention (Feb 23, 2026)

- **org-event-detail.tsx:** Back button in "event not found" fallback used `top-4`, hiding behind notches on devices with safe areas. Replaced with `style={{ top: Math.max(16, insets.top) }}`.
- **rsvp-detail.tsx:** DashboardBar title "RSVP Management" conflicted with rsvp-management.tsx. Changed to "RSVP Detail".
- **RsvpEventCard.tsx:** Card background used `bg-white-5` instead of glass token. Replaced with `bg-card`.
- **mock.ts + RsvpRequestCard.tsx:** rsvpRequests price values were dollar-like (80); updated to cents (8000). RsvpRequestCard now uses `formatCentsAsPrice` from `@project-flame/lib` for display.

### 168. Bottom Tab Navigation — Replace Hamburger Menu (Feb 23, 2026)

- **Architecture:** Converted from flat Stack navigator to Tabs + Stack using Expo Router's `(tabs)` group. Tab screens live inside `app/(tabs)/`; detail screens (event/[id], ticket/[id], org-event-detail, rsvp-detail, events, sign-in) stay outside and push over the tabs.
- **New file:** `app/(tabs)/_layout.tsx` — Tab navigator with role-conditional visibility (`href: null` to hide tabs per role). Visual design: `surface` background, `primary` (#FF0000) active state, `white-50` inactive, Poppins Medium 10px labels, Ionicons 28px with outline/filled variants.
- **User tabs (4):** Home, My Tickets, History, Settings.
- **Org tabs (5):** Dashboard, Create Event, Events Management, RSVP, Settings. _(Updated from 4 → 5 in Fix #170)_
- **Moved screens:** `index.tsx`, `dashboard.tsx`, `history.tsx`, `org-dashboard.tsx`, `create-event.tsx`, `rsvp-management.tsx`, `settings.tsx` — all moved into `app/(tabs)/` with relative import paths updated (`../` → `../../`).
- **Root layout (`_layout.tsx`):** Removed MenuOverlay state (`menuOpen`, `setMenuOpen`) and `<MenuOverlay>` component. Removed `onMenuPress` prop from Header.
- **Header (`Header.tsx`):** Removed hamburger menu button and `onMenuPress` prop. Now renders only FlameLogo + notification bell.
- **MenuOverlay:** No longer triggered from any component. File retained for potential future use; can be deleted in Phase 5.
- **Navigation paths:** All existing `router.push`/`router.replace` calls continue to work — Expo Router's `(tabs)` group is transparent in URL resolution.
- **Role state:** Phase 4 uses `useState<"user" | "org">("org")` in tab layout. Real role detection deferred to Phase 5.

---

## Events Management Screen (Feb 23, 2026)

### 169. Events Management Screen — Figma-Matched Implementation

- **Figma nodes:** `5612:7849` (main list view), `5536:8476` (Event Details tab), `5536:8306` (Ticket Tiers tab), `5536:8383` (Price Stage tab).
- **Architecture:** Two-view screen within a single tab: (1) **List view** showing "Current & Upcoming Events" with search bar, filter/sort buttons, and event cards with "Manage" links, and (2) **Edit view** with tabbed forms. Tapping "Manage" switches to edit view; "Go Back" returns to list. Reuses existing Create Event components with edit-specific additions. The Figma shows 3 tabs (Event Details, Ticket Tiers, Price Stage), but per prior decision, the app uses 2 tabs with price stages merged into the Ticket Tiers tab — matching the Create Event screen structure.
- **New files:**
  - `apps/mobile/app/(tabs)/events-management.tsx` — Two-view screen: list view (`EventsListView`) and edit view (Go Back + "Edit Event name" + `CreateEventTabs` + tab content). State toggle between views.
  - `apps/mobile/components/events-management/EventsListView.tsx` — Main list view: "CURRENT & UPCOMING EVENTS" heading, reuses `TicketSearchBar` for search/filter, maps `manageEvents` to `ManageEventCard` components.
  - `apps/mobile/components/events-management/ManageEventCard.tsx` — Event card: reuses `EventInfoHeader` from org-dashboard, footer shows "Attendees: X/Y", "Ticket tiers: N/GA", and "Manage" link (`text-primary`).
  - `apps/mobile/components/events-management/EditEventDetailsTab.tsx` — Edit-mode event details: pre-filled image with edit/delete overlay, event name with red accent bar, description textarea, start/end date fields, inline `CalendarPicker`, inline `TimeSelector`, address field, RSVP checkbox, Save button, Delete Event section.
  - `apps/mobile/components/events-management/CalendarPicker.tsx` — Month calendar grid matching Figma layout (weekday headers, day grid, month/year nav arrows).
  - `apps/mobile/components/events-management/TimeSelector.tsx` — Time picker with hour/minute inputs and PM/AM toggle buttons matching Figma design.
- **Reused components (no modification):** `CreateEventTabs`, `TicketTiersTab`, `TierCard`, `StageCard`, `DashboardBar`, `TicketSearchBar`, `EventInfoHeader`.
- **Mock data:** Added `ManageEvent` interface + `manageEvents` array, `EditEventData` interface + `editEventMock` to `apps/mobile/data/mock.ts`.

### 170. Events Management Tab Added to Bottom Navigator

- **Issue:** Events Management was missing from the bottom tab bar for org users.
- **Fix:** Added `events-management` tab to `app/(tabs)/_layout.tsx` with `clipboard-outline`/`clipboard` Ionicons (28px), visible only to org role. Positioned between Create Event and RSVP tabs.
- **Org tabs updated (5):** Dashboard, Create Event, Events Management, RSVP, Settings.

### 171. Design System — Navigation Architecture Documentation

- **Issue:** The design system rules (`flame-design-system.mdc`) did not document the switch from hamburger menu to bottom tab navigation. Figma files may still show the hamburger icon, which could cause new implementations to incorrectly add a menu button.
- **Fix:** Added "Navigation Architecture" section to `flame-design-system.mdc` documenting: bottom tab navigator structure, role-conditional tabs, tab bar visual design, user/org tab lists, and instruction to ignore hamburger menu in Figma. Updated "Screen Structure Pattern" to reflect `Header` in `_layout.tsx` and `DashboardBar` overlay pattern.

### 172. Events Management — Figma 3-Tab vs Implementation 2-Tab Decision

- **Context:** Figma designs (`5536:8306`, `5536:8383`) show a 3-tab layout for event editing (Event Details, Ticket Tiers, Price Stage). The prior architectural decision was to merge Price Stage functionality into the Ticket Tiers tab, resulting in 2 tabs. This matches the Create Event screen which already implements this 2-tab design with `TicketTiersTab` containing both tier management and price stage controls.
- **No code change needed:** The `CreateEventTabs` component already defines 2 tabs, and `TicketTiersTab` already includes the "Use Price Stages" checkbox, add stage form, and collapsible stages list. Events Management reuses these directly.

---

## PR Review Fixes (Feb 23, 2026)

### 173. Design System — Remove Stale Header Overlay Guidance

- **Issue:** Step 3 in `flame-design-system.mdc` told implementors to add `mt-[81px]` for a "transparent Header overlay", but the Header is a persistent, non-overlay component in the root `_layout.tsx` that occupies space in normal layout flow.
- **Fix:** Rewrote the "Header offset" bullet to state that the Header is persistent in `_layout.tsx`, no per-screen `mt-[81px]` offset is required, and referenced the Screen Structure Pattern for layout flow.

### 174. Tab Bar — Safe Area Insets for Notched Devices

- **Issue:** `app/(tabs)/_layout.tsx` tab bar used a hardcoded `height: 90` with no bottom padding, causing the tab icons to overlap the home indicator on notched iPhones.
- **Fix:** Added `useSafeAreaInsets()`, set `paddingBottom: insets.bottom`, and changed height to `TAB_BAR_BASE_HEIGHT + insets.bottom`. Reduced `TAB_BAR_BASE_HEIGHT` from 90 → 60 so the total (60 + ~34 safe area ≈ 94px) stays compact on notched devices instead of ballooning to 124px.

### 175. Events Management — Wire selectedEventId Through Edit View

- **Issue:** `onManageEvent` callback in `events-management.tsx` discarded the `eventId` parameter passed by `EventsListView`, so the edit view could not identify which event to load.
- **Fix:** Added `selectedEventId` state via `useState`. Updated `onManageEvent` handler to store the id before switching views. Added `eventId` prop to `EditEventDetailsTab` interface and passed `selectedEventId` when rendering it.

### 176. HomeScreen — Keep useAppEvents (Supabase Integration Already Agreed)

- **Context:** PR comment suggested replacing `useAppEvents` with mock data for Phase 4 compliance, but the Home Screen's Supabase integration was already completed and agreed upon as a Phase 5A item in an earlier iteration.
- **Outcome:** Reverted mock-data swap. `useAppEvents` with real Supabase calls retained in `index.tsx`. Mock event data (`mockEventCards`, `mockFeaturedEvents`, `mockUpcomingEvents`, `mockSpotlightEvent`) added to `data/mock.ts` remains available for future use by other screens.

### 177. ManageEventCard — Typo Fix and Design Token Correction

- **Issue:** (a) Label text read "Ticket ties:" instead of "Ticket tiers:". (b) "Manage" link used undocumented `text-accent` token instead of `text-primary`.
- **Fix:** Corrected "Ticket ties:" → "Ticket tiers:" and `text-accent` → `text-primary` in `ManageEventCard.tsx`.

### 178. Docs — Fix Typos in FEB_2026_FIXES.md

- **Issue:** (a) Fix #168 incorrectly stated "Ionicons 24px" — actual `TAB_ICON_SIZE` is 28. (b) Fix #169 had "Ticket ties: N/ GA" (typo + stray space) and referenced `text-accent` instead of corrected `text-primary`.
- **Fix:** Updated Fix #168 to "Ionicons 28px". Updated Fix #169 to "Ticket tiers: N/GA" and `text-primary`.

### 179. PR Review — Phase 4 Events Management / Tab Bar Consistency (Feb 24, 2026)

- **TAB_BAR_BASE_HEIGHT:** Updated `_layout.tsx` constant from 45 to 60 to match FEB_2026_FIXES.md Fix #174; height computation `TAB_BAR_BASE_HEIGHT + insets.bottom` unchanged.
- **events-management.tsx:** Replaced hardcoded `#F9FBFE` with `colors["white-100"]` for back arrow icon; replaced literal "Edit Event name" with `manageEvents.find(e => e.id === selectedEventId)?.eventName ?? "Edit Event"` so edit title shows mock event name.
- **CalendarPicker.tsx:** Replaced chevron `#F9FBFE` with `colors["white-100"]`; added `clampMonth` bounds guard (0–11) and prop comment documenting 0-based month convention.
- **EditEventDetailsTab.tsx:** Replaced `#292D32` → `colors.dark`, `rgba(255,255,255,0.5)` → `colors["white-50"]`, `#F9FBFE` → `colors["white-100"]` for icons and RSVP checkbox.
- **TimeSelector.tsx:** Replaced `text-[#3E4247]` → `text-dark`, `border-[#BFC0C2]` → `border-white-30` for hours/minutes display.
- **ManageEventCard.tsx:** Removed space in ticket tier display (`{ticketTierCount}/{ticketTierName}`) to match attendees style.
- **editEventMock:** Changed `startDate`/`endDate` to date-only strings ("04 Dec, 2025"); kept times in `startTime`/`endTime` ("16:00"/"18:00").
- **Header.tsx:** Replaced `rounded-full` → `rounded-circle` on notification button per design system.
- **Accessibility deferred:** ManageEventCard "Manage" Pressable and TimeSelector PM/AM toggles → `ACCESSIBILITY_TODOS.md`.
- **Nitpicks deferred:** New "Phase 4 Bottom Tab Navigation / Event Management" section in `NITPICKS_TODOS.md` with entries for `_layout.tsx`, `settings.tsx`, `events-management.tsx`, `history.tsx`, `org-dashboard.tsx`, `CreateEventTabs.tsx`, `CalendarPicker.tsx`, `EditEventDetailsTab.tsx`, `ManageEventCard.tsx`, `EventsListView.tsx`, `TimeSelector.tsx`, `Header.tsx`.

### 180. ManageEventCard — Use bg-card Design Token (Feb 24, 2026)

- **Issue:** Card container used `bg-white-5` instead of the standardized `bg-card` token used by other card components.
- **Fix:** Replaced `bg-white-5` with `bg-card` on the ManageEventCard container View.
- **Accessibility deferred:** CalendarPicker (day cells, arrows, month/year header) and bottom tab bar (icon-only tabs) → `ACCESSIBILITY_TODOS.md`. TimeSelector entry updated to recommend `accessibilityRole="radio"` for AM/PM toggles (mutually-exclusive semantics, consistent with CategoryFilterPills).

### 181. Org Tab Order — Create Event Before Events Management (Feb 24, 2026)

- **Issue:** `events-management` tab was declared before `create-event` in `app/(tabs)/_layout.tsx`. Expo Router renders tabs in declaration order, so org users saw Events Management as the 2nd tab and Create Event as 3rd — opposite of the documented order (Dashboard, Create Event, Events Management, RSVP, Settings).
- **Fix:** Swapped declaration order so `create-event` is declared before `events-management`.

### 182. CalendarPicker Month Mismatch With editEventMock (Feb 24, 2026)

- **Issue:** `EditEventDetailsTab` rendered `<CalendarPicker month={10} />` (November, 0-indexed) but `editEventMock.startDate` is "04 Dec, 2025". The calendar showed the wrong month.
- **Fix:** Changed to `month={11}` (December).

### 183. Dead Mock Home Screen Exports Removed (Feb 24, 2026)

- **Issue:** `mockEventCards`, `mockFeaturedEvents`, `mockUpcomingEvents`, and `mockSpotlightEvent` were exported from `data/mock.ts` but never imported anywhere. The HomeScreen uses `useAppEvents` for real Supabase data; these were remnants from Fix #176.
- **Fix:** Removed the four dead exports and their unused `EventCardData`/`SpotlightData` type imports.

### 184. CalendarPicker Chevron Handlers — Deferred (Feb 24, 2026)

- **Issue:** PR comment noted `CalendarPicker` renders prev/next month chevrons as `Pressable` without `onPress`, so tapping has no effect.
- **Outcome:** No code change. Adding month navigation state (`useState` for currentMonth/currentYear) and handler logic is functional behavior that belongs in Phase 5, not Phase 4 (UI only). Already tracked in `NITPICKS_TODOS.md` under CalendarPicker "Month navigation state."

### 186. Phase 5A Audit — Home & Events Listing Logic (Feb 24, 2026)

**Scope:** `apps/mobile/hooks/useAppEvents.ts`, `apps/mobile/app/events.tsx`, `apps/mobile/app/(tabs)/index.tsx`, `packages/lib`, `apps/web/app/lib/utils/event-filters.ts`

**Web source files audited:** `apps/web/app/lib/hooks/useEvents.ts`, `apps/web/app/lib/utils/event-filters.ts`, `apps/web/app/events/page.tsx`, `apps/web/app/components/EventsCatalog.tsx`

#### Issue A: `event-filters` business logic was web-local, not in `@project-flame/lib`

- **Issue:** `isEventActive`, `filterActiveEvents`, `filterPastEvents`, and `separateEventsByDate` lived exclusively in `apps/web/app/lib/utils/event-filters.ts`. Per the Logic Porting Protocol (Section 9, Step 3): "If you find business logic in `apps/web` that _should_ be shared but isn't in `@project-flame/lib` yet, **STOP**. Extract it to `packages/lib` first." Both platforms need this logic — web uses it in OrganizerDashboard, EventsTiersView, DashboardView, and UserDashboard; mobile needs it for past-ticket filtering (Phase 5B User Dashboard).
- **Fix:**
  1. Created `packages/lib/src/utils/event-filters.ts` with all four functions.
  2. Added 14 tests in `packages/lib/__tests__/event-filters.test.ts` (85 total passing).
  3. Exported from `packages/lib/src/utils/index.ts` and `packages/lib/src/index.ts`.
  4. Replaced `apps/web/app/lib/utils/event-filters.ts` with a re-export shim → `@project-flame/lib`. All existing web imports (`separateEventsByDate from "../../lib/utils/event-filters"`) continue to work with zero changes.

#### Issue B: Mobile event search was missing `description` field (drift from web)

- **Issue:** Web's `EventsCatalog.tsx` searches events by `name + description + venue`. Mobile's `events.tsx` only searched by `title + location` (both mapped `EventCardData` fields). The `description` field was stripped during `mapEventToCardData` and never reached the search filter, so mobile users could not find events by description.
- **Fix:**
  1. Added `description?: string` to `EventCardData` interface (`packages/ui/src/components/EventCard.tsx`).
  2. Populated `description` in `mapEventToCardData` in `apps/mobile/hooks/useAppEvents.ts`.
  3. Updated `filteredEvents` memo in `apps/mobile/app/events.tsx` to include `description` search — now matches web: `title || location || description`.

#### Non-issues confirmed (no changes needed):

- **`select("*")` vs explicit fields:** Mobile uses wildcard for event columns only (no nested relations). This is correct — `EventCardData` for list/home cards does not need `ticket_tiers` or `organizations`. Validated that `EventSchema` allows these as optional (`.passthrough()`).
- **No `quantity_reserved` enrichment:** Web API enriches tiers with RSVPs + holds for checkout. Mobile correctly skips this in `useAppEvents` — it is only needed in `useEventDetails` (RPC) for the ticket selection screen.
- **Active-event DB filter matches web:** Mobile's `.gt("ends_at", new Date().toISOString())` is functionally identical to web's `shouldFilterActive` check. Both exclude ended events at the database level.
- **`upcomingEvents = allEvents.slice(0, 6)` matches `useHomepageEvents`:** Web returns first 6 events for homepage; mobile does the same. ✓
- **Category filter is mobile-specific UX (not drift):** Web uses city filter; mobile uses category pills. Mobile's category filter is a platform-appropriate enhancement with no web equivalent to port.

### 187. Phase 5A PR Review — `packages/lib` Event Filters (Feb 24, 2026)

**Scope:** `packages/lib/__tests__/event-filters.test.ts`, `packages/lib/src/utils/event-filters.ts`, `packages/lib/src/utils/index.ts`, `packages/lib/src/index.ts`, `apps/web/app/lib/utils/event-filters.ts`

#### Fix A — Test: camelCase constants, `vi` import, `beforeEach(vi.clearAllMocks())`

- **Issue:** Test-file constants `PAST`, `FUTURE`, `REF` used SCREAM_CASE (reserved for module-level immutable config/env constants). `vi` was missing from the vitest import. No `beforeEach` to clear mocks between tests (violates testing best practices in master guide Section 6).
- **Fix:** Renamed constants to `past`, `future`, `ref`. Added `vi` to the import. Added top-level `beforeEach(() => vi.clearAllMocks())`. All 85 tests still pass.

#### Fix B — Security: limit error diagnostic to safe fields

- **Issue:** `isEventActive` threw `JSON.stringify(event)` on missing `ends_at`, serializing the entire event object. Depending on how callers construct events, this could log PII (event name, organizer details, descriptions) to error monitoring systems.
- **Fix:** Changed to `JSON.stringify({ starts_at: event.starts_at })` — the only field from the `ActiveEvent` interface that is safe and useful for diagnosis. Added inline comment explaining the intentional minimal whitelist.

#### Fix C — Export `ActiveEvent` interface through all public surfaces

- **Issue:** `ActiveEvent` was the generic constraint for all four exported functions (`T extends ActiveEvent`) but was not itself exported. Consumers who wanted to extend or reference the type (e.g. to write typed wrappers) had to duplicate the interface definition or use `Parameters<typeof isEventActive>[0]` workarounds.
- **Fix:** Added `export` to the `ActiveEvent` interface declaration in `event-filters.ts`. Propagated `export type { ActiveEvent }` through `packages/lib/src/utils/index.ts`, `packages/lib/src/index.ts`, and the web re-export shim `apps/web/app/lib/utils/event-filters.ts`.

#### Deferred (Nitpicks) — see NITPICKS_TODOS.md

- `isEventActive` semantics change ("not-ended" → "currently running"): deferred. Existing semantics are correct per web source-of-truth; changing them would break organizer/user dashboard views.
- Web shim barrel re-export bundle risk: deferred pending bundle-analyzer measurement. No regression observed.

### 188. Phase 5A Audit — Event Details & Ticket Selection Logic (Feb 24, 2026)

**Scope:** `apps/mobile/hooks/useEventDetails.ts`, `apps/mobile/app/event/[id].tsx`, `apps/mobile/components/event-details/TicketSelection.tsx`, `apps/mobile/components/event-details/TicketTierCard.tsx`, `packages/lib/src/utils/availability.ts`, `packages/lib/__tests__/utils.test.ts`

**Web source files audited:** `apps/web/app/events/[slug]/page.tsx`, `apps/web/app/components/EventDetail.tsx`, `apps/web/app/lib/hooks/useTicketAvailability.ts`, `apps/web/app/lib/utils/quantity-validation.ts`

#### Issue A: `isTierAvailable` in `@project-flame/lib` did not include `quantity_reserved`

- **Issue:** `isTierAvailable` in `packages/lib/src/utils/availability.ts` computed sold-out as `quantity_total - (quantity_sold ?? 0) > 0`, omitting `quantity_reserved`. The web's authoritative `isTierAvailable` (in `EventDetail.tsx`) correctly uses `quantity_sold + (quantity_reserved || 0)` vs. `quantity_total`. A tier with 10 tickets, 9 sold, 1 reserved would return `isTierAvailable = true` from the shared lib, while the web (source of truth) treats it as sold out.
- **Fix:**
  1. Added `quantity_reserved?: number | null` to the internal `Tier` interface in `packages/lib/src/utils/availability.ts`.
  2. Updated the sold-out guard to `const totalClaimed = (tier.quantity_sold ?? 0) + (tier.quantity_reserved ?? 0); return tier.quantity_total - totalClaimed > 0`.
  3. Added 4 new tests to `packages/lib/__tests__/utils.test.ts`: (a) returns false when reserved fills remaining capacity, (b) returns false when reserved alone exhausts capacity, (c) returns true when sold + reserved < total, (d) treats missing `quantity_reserved` as zero. All 89 tests pass.
- **Mobile impact:** `apps/mobile/hooks/useEventDetails.ts::getTierStatus` was already correct — it computes `totalClaimed = tier.quantity_sold + (tier.quantity_reserved || 0)` independently. The shared lib fix closes a latent bug for any future caller of `isTierAvailable` that passes a tier with holds.

#### Non-issues confirmed (no changes needed):

- **RPC call shape:** Mobile calls `supabase.rpc("get_event_with_tiers", { p_event_id })` and Zod-validates the response. Web uses a direct Supabase select with server-side RSVP+hold enrichment. Mobile's RPC is the equivalent server-side path — architectural parity confirmed.
- **Tier status computation:** Mobile's `getTierStatus` correctly maps to 4 states (`available`, `sold_out`, `not_available_yet`, `sales_ended`) using the same logic as the web's `isTierAvailable` + `isTierNotStarted` + `isTierExpired` trio, including `quantity_reserved` in the sold-out check.
- **`findFirstAvailableStage` import:** Correctly imported from `@project-flame/lib`. Used to compute `displayPrice` (current stage price) and `currentStageName` — matches web's `getTierPriceDisplay` intent.
- **`formatCentsAsPrice` import:** Correctly imported from `@project-flame/lib` in `TicketTierCard.tsx`. Web uses a local `formatPrice(cents)` shim — functionally identical output.
- **`maxQuantity` computation:** `event/[id].tsx` computes `available = quantity_total - quantity_sold - (quantity_reserved || 0)` and caps at `per_user_limit` using `Math.min`. Matches web's `getMaxQuantityForTier` logic exactly.
- **Quantity clamping on inventory shrink:** Mobile's `useEffect` clamps `quantity` when `maxQuantity` decreases. Web does the same via controlled input `max` attribute. ✓
- **Zod validation:** Mobile validates RPC response via `GetEventWithTiersResponseSchema`. Web uses TypeScript types only (server-side trusted data). Mobile's validation is strictly more defensive. ✓
- **Error handling:** Mobile throws on RPC error; React Query exposes `error` and provides a retry button. Web's SSR returns `notFound()`. Equivalent user-facing behavior on each platform. ✓
- **Sort order:** Mobile sorts tiers by `order_index` (organizer intent). Web sorts by price (low to high). This is a product-level design decision, not a logic bug — `order_index` is more semantically correct. Deferred to edge cases.

#### Deferred items:

- **`per_user_limit === 0` web UX divergence:** Web's `isTierAvailable` doesn't check `per_user_limit`, so a disabled tier (limit=0) shows as "Available" but maxQuantity=0. Mobile marks it "Sold Out" (aligns with shared lib). Deferred to EDGE_CASES_TODOS.md.
- **Real-time availability polling:** Web polls `/api/ticket-tiers/{id}/availability` every 10 s. Mobile has `staleTime: 2 min` — no per-stage hold data. Deferred to EDGE_CASES_TODOS.md.
- **Stage selection UI:** Web renders each stage as a separate selectable card. Mobile shows the tier with current stage price injected. UI-only architectural difference — not a logic bug. Deferred to EDGE_CASES_TODOS.md.
- **Sort order divergence (price vs. order_index):** Deferred to EDGE_CASES_TODOS.md.

---

### 189. `TicketTierSchema.description` Rejects Null from DB (Feb 24, 2026)

- **Issue:** `TicketTierSchema` in `apps/mobile/hooks/useEventDetails.ts` declared `description: z.string().optional()`. Zod `.optional()` accepts `undefined` but not `null`. The database returns `null` for tiers with no description, causing Zod validation to throw and the entire event detail screen to fail with "Invalid event data".
- **Fix:** Changed to `z.string().nullish()` (accepts `string | null | undefined`), matching the `description?: string` optional field on the shared `TicketTier` type in `@project-flame/lib`.

---

### 190. Phase 5A Audit — Checkout & Payment Logic (Feb 24, 2026)

**Scope:** `apps/mobile/hooks/useCheckout.ts`, `apps/mobile/components/event-details/CheckoutMainSheet.tsx`, `apps/mobile/components/event-details/CheckoutSuccessState.tsx`, `apps/mobile/components/event-details/CheckoutProcessingState.tsx`, `apps/mobile/lib/api.ts`

**Web source files audited:** `apps/web/app/components/EventDetail.tsx` (RSVP submission + `handleRsvpSubmit`), `apps/web/app/components/modals/RsvpPaymentModal.tsx` (RSVP paid authorization modal), `apps/web/app/components/StripePaymentForm.tsx`, `apps/web/app/lib/stripe/fees.ts`, `apps/web/app/lib/utils/purchase-calculations.ts`, `apps/web/app/lib/utils/purchase-data.ts`, `apps/web/app/api/holds/create/route.ts`, `apps/web/app/api/purchase/create-payment-intent/route.ts`, `apps/web/app/api/purchase/complete-hold-free/route.ts`, `apps/web/app/api/purchase/validate-promo-code/route.ts`

> **Note:** `StripePurchaseFlow.tsx` was also read during the audit but is a **legacy** code path for token-based post-approval RSVP payment (user arrives via email link after organizer approval). That flow is no longer active — no email is sent to trigger it. The current RSVP payment flow on web is `EventDetail.tsx` → `RsvpPaymentModal.tsx` → `POST /api/rsvp` (same session, no pre-existing RSVP record), which is identical to what mobile does.

#### Fix A (Critical) — RSVP Paid Flow: Missing `stageId` in `create-payment-intent` Request

- **Issue:** The mobile RSVP paid flow called `POST /api/purchase/create-payment-intent` with `{ flow: "rsvp", eventId, ticketTierId, quantity }` but omitted `stageId`. On the server, when no `stageId` is provided and no `holdId` exists (RSVP path), the route falls back to `tier.price_cents * quantity` as the base price — ignoring the current stage price. For any RSVP event with staged tiers (e.g. Early Bird → Regular), the payment authorization would use the base tier price instead of the correct current stage price (from `findFirstAvailableStage`), causing the wrong amount to be authorized on the user's card.
- **Fix (intermediate — later superseded by #192 Fix A):** Added `...(tier.currentStageName ? { stageId: getStageId(tier) } : {})` to the RSVP paid PI creation request body, using the same `getStageId` helper already used for direct-purchase hold creation. This matched `RsvpPaymentModal.tsx` / `EventDetail.tsx` behavior of always passing `stageId` for staged tiers. The guard `tier.currentStageName` was a truthy string check — a stage with an empty-string name would still be treated as "no stage". See #192 Fix A for the replacement that fixes that edge case.

#### Fix B (Medium) — Hold Not Cancelled on PaymentSheet Dismissal or Post-Hold Error

- **Issue:** When a user dismissed the PaymentSheet (presentError.code === "Canceled") or when any error occurred after hold creation (e.g. PI creation failure, PaymentSheet error), the hold record remained active for up to 30 minutes. This locked inventory unnecessarily — e.g., a tier with 2 tickets left where the user created 2 holds for the same quantity would appear completely sold out to other users for 30 minutes. The web's `handleCancelPurchase` explicitly calls `POST /api/holds/cancel` in this scenario.
- **Fix:**
  1. Added `activeHoldIdRef = useRef<string | null>(null)` to track the current hold session ID.
  2. After hold creation: `activeHoldIdRef.current = holdResponse.hold_session_id`.
  3. On PaymentSheet `Canceled`: fire-and-forget `POST /api/holds/cancel` before resetting to idle.
  4. In the `catch` block: fire-and-forget `POST /api/holds/cancel` for any active hold before setting error state.
  5. On success (paid or free): `activeHoldIdRef.current = null` without cancelling — hold is consumed by webhook (paid) or `complete-hold-free` (free).
  6. In `resetCheckout`: clear `activeHoldIdRef.current = null`. (See #193 Fix A for the follow-up that also cancels the hold here.)
  - The hold cancel was initially fire-and-forget (`.catch(() => {})`) because it is non-fatal — holds expire automatically after 30 minutes as a safety net. See #192 for the follow-up fix that replaced the silent catch with a logged error.

#### Non-issues confirmed (no changes needed):

- **Fee calculations:** Client-side estimates use `calculateFee(afterDiscount, DEFAULT_PLATFORM_FEE_PERCENT, DEFAULT_FIXED_FEE_CENTS)` from `@project-flame/lib`. Server amounts always override estimates once PI is created (`serverAmounts` state). No local fee reimplementation. ✓
- **`formatCentsAsPrice`:** Used in `CheckoutMainSheet.tsx` — imported from `@project-flame/lib`. No `/ 100` conversions. ✓
- **Promo code validation flow:** Mobile uses a two-phase approach: `POST /api/purchase/validate-promo-code` (pre-flight) then the validated code is passed inline to `create-payment-intent`. Web re-calls `create-payment-intent` with `promoCode + oldPaymentIntentId` to cancel the old PI. Mobile's approach is architecturally different but functionally correct — the PI is always created fresh with the discount applied, so no `oldPaymentIntentId` is needed.
- **`validate-promo-code` response schema:** Mobile's `promoValidationResponseSchema` matches server's `{ valid: true, promotional_code: { id, code, discount_percentage, usage_remaining }, discount_amount_cents, final_total_cents }` response exactly. Non-200 responses correctly throw `ApiError` and are caught by `validatePromo`'s catch block. ✓
- **`complete-hold-free` request shape:** `{ holdSessionId, promotional_code_id? }` matches server expectation exactly. ✓
- **Promo discount math:** `Math.round((subtotal * discount_percentage) / 100)` in client estimate matches server's same formula (`Math.round((basePriceCents * discount_percentage) / 100)`). ✓
- **`paymentIntentResponseSchema` shape:** `amounts.discount` is `z.number()` (required) — server always returns it (0 if no promo). `promotionalCodeId` and `promoCode` are `.optional()` — server only returns them on the free-promo path. ✓
- **State machine:** Mobile's `CheckoutStep` enum provides a cleaner state machine than web's boolean flags (`loading`, `processingComplete`, `isFreePurchase`). All transitions (`idle → creating_hold → creating_payment_intent → presenting_sheet → success/error`) correctly mirror web's flows. ✓
- **RSVP flow parity:** Web and mobile use the same RSVP paid flow: PI creation (manual capture) → payment authorization → `POST /api/rsvp` to create the RSVP record with `paymentIntentId` attached. Web does this via `RsvpPaymentModal.tsx` (opened inline from `EventDetail.tsx`); mobile does it via `useCheckout` → PaymentSheet. Both compute `stageId` from the user's live UI selection at checkout time — neither reads from a pre-existing RSVP DB record. The legacy `StripePurchaseFlow.tsx` token-based post-approval payment path is no longer active (no email is sent to trigger it). ✓
- **Hold creation request shape:** Mobile sends `{ event_id, ticket_tier_id, quantity, stage_id? }` — matches web's `createHoldSchema`. Server returns `{ hold_session_id, expires_at, ticket_tier, quantity, stage_name, stage_price_cents, promoter_code }` — matches `holdResponseSchema`. ✓
- **PaymentSheet vs. Elements:** Mobile uses Stripe PaymentSheet SDK (`initPaymentSheet` → `presentPaymentSheet`). Web uses Stripe Elements (`confirmPayment` with 3DS handling). This is the ONLY accepted platform divergence — both result in a confirmed PI with the correct amount. ✓
- **`apiPost` authenticated client:** All API calls use `apiPost` from `lib/api.ts` which attaches `Authorization: Bearer <clerk-token>`. Matches web's Clerk session cookie authentication. ✓
- **Server-authoritative amounts:** `displayAmounts` prefers `serverAmounts` over client `estimates` once PI is created. Displayed total always reflects what Stripe will charge. ✓

#### Deferred items:

- `promoter_code` not passed in hold creation → `EDGE_CASES_TODOS.md` #41
- No hold-expiry pre-flight before PaymentSheet → `EDGE_CASES_TODOS.md` #42
- RSVP paid cancellation creates orphaned PI without `rsvpId` link → `EDGE_CASES_TODOS.md` #43
- `complete-hold-free` transient failure after partial ticket creation → `EDGE_CASES_TODOS.md` #44

---

### 191. Documentation Correction — RSVP Payment Web Source-of-Truth (Feb 24, 2026)

- **Issue:** The checkout audit (#190) incorrectly listed `StripePurchaseFlow.tsx` as the web source-of-truth for the RSVP payment flow and described the web and mobile RSVP flows as having different lifecycles ("web handles approved RSVP payment via email token" vs "mobile handles new RSVP submission"). In reality, both platforms use the same flow: create PaymentIntent → authorize payment → create RSVP record with `paymentIntentId` — all in one user session, with no pre-existing RSVP record.
- **Root cause:** `StripePurchaseFlow.tsx` is a **legacy** code path for a deprecated token-based post-approval RSVP payment flow (organizer approves → user receives email with `?token=...` link → lands on `/purchase` page → pays). That flow is no longer active — no email is sent to trigger it, and users never see a "Buy Tickets" button in their dashboard for approved RSVPs. The code still exists but is dead.
- **Correct web source files for RSVP payment:**
  - `components/EventDetail.tsx` — `handleRsvpSubmit` (decides free vs paid), `handleRsvpPaymentSuccess` callback, `submitRsvpToBackend` (calls `POST /api/rsvp` with `paymentIntentId`).
  - `components/modals/RsvpPaymentModal.tsx` — inline modal that creates PI with `flow: "rsvp"` + `stageId` from current UI selection, shows Stripe Elements, returns `paymentIntentId` on success.
- **Fix:** Updated `FEB_2026_FIXES.md` #190 (web source list, Fix A description, RSVP lifecycle bullet), `IOS_MIGRATION.md` (checkout audit checklist, Section 7 reference mapping), `PHASE_1_to_5_MONOREPO_FOUNDATION.md` (audit table), and `EDGE_CASES_TODOS.md` #41 to reference the correct web files and mark `StripePurchaseFlow.tsx` as legacy/do-not-use for RSVP logic.

---

### 192. Phase 5A Checkout PR Review — Three Follow-up Fixes (Feb 24, 2026)

**Scope:** `apps/mobile/hooks/useCheckout.ts`

**Web source files:** `apps/web/app/components/modals/RsvpPaymentModal.tsx`, `apps/web/app/components/EventDetail.tsx` (same source files as #190)

#### Fix A (Critical) — `stageId` Guard Amended: `tier.currentStageName` → `rsvpStageId !== undefined`

- **What changed in #190:** The intermediate fix in #190 Fix A used `tier.currentStageName` as the guard: `...(tier.currentStageName ? { stageId: getStageId(tier) } : {})`. `tier.currentStageName` is the string name of the active stage (e.g. `"Early Bird"`), set by `useEventDetails` via `findFirstAvailableStage`. This correctly handles tiers with no stages (name is `undefined`) but fails when a stage exists and its name is an empty string — that stage has a valid UUID but `""` is falsy, so the guard omits `stageId` and the server falls back to the base tier price.
- **Fix:** Amended #190's guard in-place for both affected sites:
  - **RSVP paid PI** (`RsvpPaymentModal.tsx` / `EventDetail.tsx` parity): replaced with `const rsvpStageId = getStageId(tier); ...(rsvpStageId !== undefined ? { stageId: rsvpStageId } : {})`.
  - **Direct-purchase hold creation:** same pattern — `const directStageId = getStageId(tier); ...(directStageId !== undefined ? { stage_id: directStageId } : {})`.
- **Why this guard is correct:** `getStageId(tier)` calls `findFirstAvailableStage(tier).stageId`, which returns `string | undefined`. It is `undefined` only when the tier has no `ticket_stages` array (i.e. it is a non-staged tier). For any staged tier — regardless of the stage's `name` value — `stageId` is a non-`undefined` UUID, so the `!== undefined` predicate is the precise boundary.

#### Fix B (Standard) — Stale `serverAmounts` Not Cleared on PaymentSheet Cancellation

- **Issue:** On both the RSVP paid `Canceled` path and the direct-purchase `Canceled` path, `serverAmounts` was left in state after the user dismissed the PaymentSheet. On subsequent re-open attempts, `displayAmounts` would show the server-authoritative amounts from the cancelled PI (which may have had a promo applied or a different quantity) until a new PI was created, showing stale totals in the UI.
- **Fix:** Added `setServerAmounts(null)` immediately before `setStep("idle")` in both `Canceled` branches (RSVP paid: line ~430; direct-purchase: line ~568). This mirrors the `catch` block which already cleared `serverAmounts` on error.

#### Fix C (Standard) — Silent `.catch(() => {})` on Hold Cancel Calls

- **Issue:** Both hold cancel fire-and-forget calls (on PaymentSheet dismiss and in the error `catch` block) used `.catch(() => {})`, which swallowed all failures silently. Network errors or server-side 4xx/5xx from `/api/holds/cancel` were invisible in logs, making it impossible to diagnose inventory-lock incidents.
- **Fix:** Replaced both silent catches with `.catch((err: unknown) => { console.error("[useCheckout] hold cancel failed ...", { action: "hold_cancel", userId, eventId, holdSessionId, err }) })`. The calls remain fire-and-forget (non-fatal) since holds auto-expire after 30 minutes, but failures are now visible in the log stream.

---

### 193. Phase 5A Checkout PR Review — Second Round Follow-up (Feb 24, 2026)

**Scope:** `apps/mobile/hooks/useCheckout.ts`, `docs/fixes/FEB_2026_FIXES.md`, `docs/todos/NITPICKS_TODOS.md`

#### Fix A (Standard) — `resetCheckout` Clears Hold Ref Without Cancelling the Hold

- **Issue:** `resetCheckout` (called when the user navigates away from the checkout sheet) set `activeHoldIdRef.current = null` without firing `POST /api/holds/cancel`. If the user opened the checkout sheet, progressed past hold creation, and then navigated away, the hold would remain live for up to 30 minutes — locking inventory for other buyers. The error `catch` block and the `Canceled` dismiss path both cancel the hold correctly; `resetCheckout` was the only path that didn't.
- **Fix:** Added the same fire-and-forget cancel pattern to `resetCheckout`:
  ```typescript
  const holdToCancel = activeHoldIdRef.current;
  activeHoldIdRef.current = null;
  if (holdToCancel) {
    injectedApiPost("/api/holds/cancel", { holdSessionId: holdToCancel }, getToken)
      .catch((cancelErr) => console.error("[useCheckout] hold cancel failed on reset", { ... }));
  }
  ```
  Updated `useCallback` deps from `[]` to `[injectedApiPost, getToken, userId, event]` to give the callback access to the API client, token, and log context.

#### Fix B (Docs) — #190 Fix A and #192 Fix A Described Contradictory Final States

- **Issue:** After #192 amended the `stageId` guard in-place, #190 Fix A was updated to show the final code (`rsvpStageId !== undefined`), while #192 Fix A also described replacing `tier.currentStageName` with `rsvpStageId !== undefined`. Readers couldn't tell which entry described what was actually shipped in each PR, and the cross-references were ambiguous.
- **Fix (Option A):** Restored #190 Fix A to describe the intermediate state that was shipped in that PR — the `tier.currentStageName` truthy guard with a note that it was "later superseded by #192 Fix A." Rewrote #192 Fix A to explicitly describe amending the `tier.currentStageName` guard to `rsvpStageId !== undefined` (via `getStageId(tier)` / `findFirstAvailableStage`), referencing both affected call sites (`RsvpPaymentModal.tsx` RSVP PI and direct-purchase hold creation) and explaining why `!== undefined` is the correct predicate.

#### Deferred (Nitpick) — `err` Variable Shadowing in Hold-Cancel Catch Callbacks

- **Item:** Inner `.catch((err: unknown) => { ... })` callbacks inside hold-cancel fire-and-forget calls shadow the outer `catch (err: unknown)`. Rename inner parameter to `cancelErr`.
- **Deferred to:** `docs/todos/NITPICKS_TODOS.md` → `apps/mobile/hooks/useCheckout.ts` section (Feb 24, 2026).

#### Deferred (Edge Case) — `resetCheckout` Races with In-Progress `checkout` Run

- **Item:** `resetCheckout` cancels `activeHoldIdRef` and resets `stepInProgressRef` unconditionally, even if a `checkout` async run is still in flight (e.g. during `creating_payment_intent`). If the user back-navigates while a hold creation API call is in-flight, the hold could be cancelled before the in-progress checkout run has a chance to use it, leading to a paid-but-unfulfilled state. The risk during `presenting_sheet` is mitigated by the native PaymentSheet modal blocking underlying navigation.
- **Deferred to:** `docs/todos/EDGE_CASES_TODOS.md` #46 (Feb 24, 2026).

---

### 194. Phase 5A Auth Audit — No Drift Found (Feb 24, 2026)

**Scope:** `apps/mobile/hooks/useSignInHandlers.ts`, `apps/mobile/hooks/useOptionalAuth.ts`, `apps/mobile/lib/token-cache.ts`, `apps/mobile/app/sign-in.tsx`, `apps/mobile/app/_layout.tsx` (ClerkProvider)

**Web source files read:** `apps/web/app/sign-in/[[...sign-in]]/page.tsx`, `apps/web/app/lib/auth.ts`, `apps/web/app/lib/user-sync.ts`, `apps/web/app/api/auth/sync-current-user/route.ts`, `apps/web/app/layout.tsx`

**Outcome:** No code changes needed. All mobile auth logic correctly mirrors the web's behavior with only the accepted platform divergences (token cache, OAuth redirect mechanism). Full line-by-line comparison documented below.

#### Google OAuth Flow — ✅ Correct

Mobile uses `useSSO` + `startSSOFlow({ strategy: "oauth_google", redirectUrl: AuthSession.makeRedirectUri() })` with `WebBrowser.warmUpAsync()` / `coolDownAsync()` in `useEffect`. Web uses Clerk's hosted `<SignIn />` component which handles OAuth internally. These are the canonical Clerk-recommended approaches for each platform. The net behavior is identical: the user authenticates with Google, a Clerk session is created, and the app/page becomes authenticated. This is the accepted platform divergence.

#### Email Sign-In Flow — ✅ Correct

- Double-submission guard: `if (loading) return` present in all three handlers.
- `isSignInLoaded` / `isSignUpLoaded` guards: present before calling Clerk SDK.
- Email/password presence validation before API call: `if (!email.trim() || !password)`.
- `signIn.create({ identifier: email.trim(), password })` — correct Clerk SDK call.
- Status check `result.status === "complete" && result.createdSessionId` — correct.
- Navigation: `router.canGoBack() ? router.back() : router.replace("/")` — correct.

#### Email Sign-Up Flow — ✅ Correct

- `signUp.create({ emailAddress: email.trim(), password })` — correct Clerk SDK call.
- Handles incomplete status (email verification pending): shows "check your email" message and switches to sign-in mode. This is correct — Clerk returns `status: "missing_requirements"` when email verification is pending.

#### Error Extraction (`getClerkErrorMessage`) — ✅ Correct, Platform-Specific

`getClerkErrorMessage` reads `err.errors[0].message` from Clerk's SDK error structure. This is correct — Clerk errors always carry `{ errors: ClerkAPIError[] }` where `ClerkAPIError.message` is the human-readable short message. The web uses Clerk's hosted UI which handles errors internally; `getClerkErrorMessage` is mobile-only UI handling, not shared business logic. It does NOT belong in `@project-flame/lib` (the function has no business logic, and `packages/lib` must not depend on Clerk SDK).

#### `useOptionalAuth` — ✅ Correct

- Module-level IIFE resolves `useAuth` to either Clerk's real hook or `useFallbackAuth` at startup — not conditionally per render. Rules of Hooks compliant.
- `isConfigured` flag correctly derived from presence of `isConfigured: false` on the fallback auth object.
- Fallback returns `{ getToken: async () => null, isSignedIn: false, userId: null }`.

#### `lib/token-cache.ts` — ✅ Correct (Accepted Platform Divergence)

`expo-secure-store` is the Clerk-recommended token cache for React Native. Web uses HTTP-only cookies managed by Clerk's Next.js middleware. Platform guard (`Platform.OS !== "web"`) prevents `SecureStore` calls on web (not applicable since this is a native-only file, but defensive). `getToken`/`saveToken`/`clearToken` error handling logs but does not throw — correct, matches Clerk's `TokenCache` contract.

#### `app/_layout.tsx` ClerkProvider — ✅ Correct

- `ClerkProvider` renders conditionally only when `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` is set — graceful degradation mirrors `useOptionalAuth`'s behavior.
- `ClerkLoaded` defers child rendering until Clerk has hydrated — equivalent to web's SSR behavior where Clerk middleware runs before React rendering.
- `tokenCache` injected into `ClerkProvider` — correct for native, required so Clerk persists the session across app restarts.
- Web `ClerkProvider` in `layout.tsx` has no explicit `publishableKey` (reads `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` automatically) and no `tokenCache` (uses HTTP cookies). Acceptable divergence.

#### `POST /api/auth/sync-current-user` — ✅ No Action Required (Stub Route)

The IOS_MIGRATION.md checklist had this as open: "Mobile triggers `POST /api/auth/sync-current-user` same way web handles it on login." After reading the web source, this item was based on a misconception:

1. **The web sign-in page does not call this endpoint on login.** `sign-in/[[...sign-in]]/page.tsx` renders Clerk's hosted `<SignIn />` with no post-auth callbacks whatsoever.
2. **The route itself is an incomplete stub.** `api/auth/sync-current-user/route.ts` validates auth, constructs `userData`, and returns `{ success: true, userData }` — but has a TODO comment and does NOT write to Supabase. It would be a no-op to call it.
3. **Actual user sync happens via JIT sync.** `resolveDbUserFromClerkId` in `lib/auth.ts` performs just-in-time user creation on the first server-side API call that needs to resolve a user (e.g., `POST /api/holds/create`). This is the real sync mechanism for both web and mobile.

**Result:** Mobile behavior (no explicit sync call after sign-in) exactly matches web behavior. Both rely on JIT sync via `resolveDbUserFromClerkId`. Deferred edge case: if the `sync-current-user` route is ever fully implemented, it should be called from both web (via `afterSignIn` callback) and mobile (after `setActive`). See `EDGE_CASES_TODOS.md` #47.

#### Shared Business Logic Extraction — ✅ Nothing to Extract

`getClerkErrorMessage` is platform-specific Clerk SDK error handling, not business logic. No pricing, validation, or formatting functions were identified in the auth flow. Nothing qualifies for extraction to `@project-flame/lib`.

---

### 195. Phase 5A Auth Audit PR Review — Reference Mapping Table Correction (Feb 24, 2026)

**Scope:** `docs/project-migrations/IOS_MIGRATION.md` Section 7 (Authentication reference mapping table)

#### Fix (Standard Bug) — Remove Incorrect `POST /api/auth/sync-current-user` Endpoint from `useSignInHandlers.ts` Row

- **Issue:** The Section 7 reference mapping table listed `POST /api/auth/sync-current-user` as an API endpoint used by `hooks/useSignInHandlers.ts`. The auth audit (#194) confirmed that mobile never calls this endpoint: (a) the web sign-in page doesn't call it either, (b) the route is an incomplete stub that doesn't write to Supabase, and (c) real user sync is handled by JIT via `resolveDbUserFromClerkId`. A Phase 5B developer consulting the table would have incorrectly implemented a call to a no-op stub, adding dead code.
- **Fix:** Changed the "API Endpoints Used" cell for `hooks/useSignInHandlers.ts` from `POST /api/auth/sync-current-user` to `—` with an inline note: "mobile never calls the stub; user sync is JIT via `resolveDbUserFromClerkId` on first authenticated API call — see `EDGE_CASES_TODOS.md` #47 for the planned implementation."

#### Docs Improvement — Edge Case #47 Fire-and-Forget Logging Pattern

- **Context:** PR comment on `EDGE_CASES_TODOS.md` #47 noted that the "Fix when ready" section should specify the project's established fire-and-forget error-logging pattern (per FEB_2026_FIXES.md #192 Fix C: log with `console.error(...)`, do not swallow errors silently) rather than leaving the caller pattern implicit.
- **Fix:** Amended edge case #47's "Fix when ready" to include the concrete `apiPost(...).catch((err: unknown) => console.error("[useSignInHandlers] sync-current-user fire-and-forget failed", err))` pattern. Also expanded the upsert snippet to show `{ onConflict: "clerk_id" }` for idempotency.

#### Deferred (Nitpick) — IOS_MIGRATION.md Compound-Modifier Hyphenation

- **Item:** "expo-secure-store backed `TokenCache`" → "A `TokenCache` backed by `expo-secure-store`" (QB_NEW_EN_HYPHEN).
- **Deferred to:** `docs/todos/NITPICKS_TODOS.md` → Phase 5A Auth Audit section (Feb 24, 2026).

#### Deferred (Nitpick) — EDGE_CASES_TODOS.md Numerical Sequence Restoration

- **Item:** Item #36 (`rsvp-management.tsx` route param) is positioned after #46 and #47 rather than between #35 and #37. Reorder for ascending numerical sequence.
- **Deferred to:** `docs/todos/NITPICKS_TODOS.md` → Phase 5A Auth Audit section (Feb 24, 2026).

---

### 185. DashboardBar Safe Area on Notched Devices — False Alarm (Feb 24, 2026)

- **Issue:** PR comment noted `DashboardBar` in `events-management.tsx` is positioned `absolute` without `insets.top`, suggesting content could render under the status bar on notched devices.
- **Outcome:** No code change needed. The persistent `<Header />` in the root `_layout.tsx` already occupies the safe area (`paddingTop: insets.top, height: insets.top + 60`) and sits above the `<Stack />` navigator in normal document flow. All tab screens — including events-management — render below the Header. An absolute `DashboardBar` at `top: 0` within a tab screen is already below the notch. All other org screens (`org-dashboard`, `create-event`, `rsvp-management`, `settings`) use the identical pattern without `insets.top` on DashboardBar.

---

### 196. Phase 5B — User Dashboard Logic Integration (Feb 24, 2026)

- **Context:** Implement User Dashboard Logic per prompts_phases.md: fetch tickets, display real QR codes, update profile data. Follow Web-to-Mobile Logic Porting Protocol.
- **Web Source Files:** `UserDashboard.tsx`, `useUserTickets.ts`, `useUserProfile.ts`, `api/user/tickets/route.ts`, `api/user/profile/route.ts`, `api/user/update-cedula/route.ts`, `api/orders/[id]/route.ts`.
- **Changes:**
  - **apiGet helper:** Added `apiGet<T>()` to `lib/api.ts` for authenticated GET requests.
  - **useUserTickets:** Created `hooks/useUserTickets.ts` — mirrors web's hook, calls `GET /api/user/tickets` via `apiGet` with Bearer token. Returns `{ tickets: UserTicket[] }`. TanStack Query, 5min stale, enabled when signed in.
  - **useUserProfile:** Created `hooks/useUserProfile.ts` — mirrors web's hook, calls `GET /api/user/profile` and `POST /api/user/update-cedula` (body: `{ document_id }`). Handles 404 → null for new users. Mutation for cedula update with cache invalidation.
  - **user-ticket-mappers:** Created `lib/user-ticket-mappers.ts` — `groupTicketsByEventAndTier`, `separateTicketGroupsByDate`, `getFirstTicketIdForGroup`. Uses `formatCentsAsPrice`, `separateEventsByDate` from `@project-flame/lib`. Status mapping: issued/checked_in → purchased, approved → ready_to_buy, pending → pending.
  - **Dashboard screen:** Replaced mock with `useUserTickets` + `separateTicketGroupsByDate`. StatsGrid now accepts props (`totalTickets`, `pending`, `purchased`, `readyToBuy`). TicketCard supports `TicketGroupDisplay` with `priceDisplay`. QR press navigates to `/ticket/[firstTicketId]`. Buy Now for ready_to_buy navigates to event.
  - **History screen:** Replaced mock with `useUserTickets` + `pastGroups`. Sorted by date desc. HistoryCard supports `TicketGroupDisplay`. Press navigates to ticket detail.
  - **Ticket detail screen:** Fetches from `useUserTickets` cache. Finds ticket by id, siblings by event+tier. Displays QR: regular tickets use `Image` with server `qr_code`; promotional use `react-native-qrcode-svg` with generated `qrData` (orderId, eventId, userId, tierName, eventName, ticketNumber, qrToken, timestamp) — matches web `UserDashboard` pattern. Prev/next nav for multi-ticket groups.
  - **PersonalSettingsTab:** Uses `useUserProfile`. Displays fullName, email, document_id (editable). ID number validated with `validateCedula`/`cleanCedula` from `@project-flame/lib`. Save calls `updateCedula(document_id)` via POST.
  - **SettingsEditableField:** New component for editable ID number with validation error display.
- **API Parity:** GET /api/user/tickets, GET /api/user/profile, POST /api/user/update-cedula — request/response shapes match web. Mobile uses `apiGet`/`apiPost` with Bearer token.
- **Dependencies:** Added `react-native-qrcode-svg` for promotional ticket QR generation.

---

### 197. Phase 5B — User Dashboard Logic Review Fixes (Feb 24, 2026)

- **Context:** Post-implementation review of #196. Applied triage rules from `project-flame-master.mdc`.
- **Changes:**
  - **Hardcoded color literals → design tokens:** Replaced all `#F9FBFE` with `colors["white-100"]`, `#FF0000` with `colors.primary`, `#041C2B` with `colors.dark`, and `#666` with `colors["white-30"]` in `ticket/[id].tsx`, `dashboard.tsx`, `history.tsx`, `PersonalSettingsTab.tsx`. Imported `colors` from `@project-flame/ui` in all affected files.
  - **Mock type cleanup in TicketCard.tsx:** Removed `DashboardTicket` and `TicketStatus` mock type imports. `TicketCardData` now uses `TicketGroupDisplay` as primary type, `TicketDisplayStatus` from `user-ticket-mappers.ts` for status records. Simplified `priceText` to use `ticket.priceDisplay` directly.
  - **Mock type cleanup in HistoryCard.tsx:** Removed `HistoryTicket` mock type import. `HistoryCardTicket` now uses `TicketGroupDisplay & { priceDisplay: string }`. Simplified price display to `ticket.priceDisplay`.
  - **PersonalSettingsTab.tsx:** Added TODO comment on `settingsProfile` mock import clarifying it needs replacement with real profile photo URL.
- **Accessibility deferred:** `ticket/[id].tsx` prev/next buttons, dashboard/history empty states, `SettingsEditableField` TextInput — see `ACCESSIBILITY_TODOS.md`.
- **Nitpicks deferred:** `user-ticket-mappers.ts` dual-field comment, `SettingsEditableField` placeholder color token, `disabled:opacity-50` NativeWind support — see `NITPICKS_TODOS.md`.

---

### 198. Phase 5B — User Dashboard Logic PR Review: Bug Fixes (Feb 24, 2026)

- **Context:** Addressed PR inline and outside-diff comments for the User Dashboard Logic implementation (#196/#197). Applied triage rules: all functional bugs and type duplication fixed; nitpicks deferred to `NITPICKS_TODOS.md`.

- **Changes:**

  **`packages/lib/src/types/ticket.ts` (new file):**
  - Created shared `RSVPStatus`, `TicketStatus`, `UserTicket`, `UserTicketsResponse`, and `UserProfile` types.
  - `UserProfile` includes optional billing/document fields (`document_id`, `document_type`, `billing_address`, `billing_city`, `billing_country`) that the `/api/user/profile` endpoint returns and both web/mobile consume.
  - Exported from `packages/lib/src/types/index.ts` and `packages/lib/src/index.ts`.

  **`apps/mobile/hooks/useUserTickets.ts`:**
  - Removed local `RSVPStatus`, `TicketStatus`, `UserTicket` type definitions.
  - Now imports from `@project-flame/lib` and re-exports for consumers.

  **`apps/web/app/lib/hooks/useUserTickets.ts`:**
  - Same — removed local type definitions, imports from `@project-flame/lib`.
  - Both apps now use the single shared source of truth.

  **`apps/mobile/hooks/useUserProfile.ts`:**
  - Removed local `UserProfile` interface, imports from `@project-flame/lib`.

  **`apps/mobile/lib/user-ticket-mappers.ts`:**
  - **`mapStatus` fallthrough bug fixed:** RSVP `rejected`/`auto_cancelled`/`payment_failed` and ticket `refunded`/`void` previously fell through to `"purchased"`, showing them as purchased. Now explicitly mapped to new `"cancelled"` display status.
  - **`TicketDisplayStatus` extended:** Added `"cancelled"` variant.
  - **`timeRange` bug fixed:** Was showing only the start time (e.g., `"9:00 PM"`). Now shows the full range `"9:00 PM - 11:00 PM"`, with graceful fallback to start-only when `ends_at` is absent. Matches `ticket/[id].tsx` display.
  - **`formatCostDisplay` type assertion removed:** `ticket.stage_price_cents` is now accessed directly without `(ticket as { stage_price_cents?: number })` cast — field already exists on `UserTicket`.
  - **`getFirstTicketIdForGroup` returns `string | null`:** Previously returned composite `group.id` (e.g., `"eventId-tierId"`) when no tickets were present — a non-existent ticket ID that would silently break `/ticket/[id]` navigation. Now returns `null`; all callers updated to guard against null.
  - `formatDate`, `formatTime`, `getOrganizerName` exported (prep for use in `ticket/[id].tsx` — see NITPICKS_TODOS.md for follow-up).
  - Imports `UserTicket` from `@project-flame/lib` (no longer from local hook).

  **`apps/mobile/app/(tabs)/dashboard.tsx`:**
  - Wrapped `separateTicketGroupsByDate` + `ticketStats` computations in `useMemo` depending on `data?.tickets` to prevent recomputation on every render.
  - **`onBuyPress` navigation guard fixed:** Was checking `eventSlug` (could be undefined even when `eventId` is valid) before calling `router.push`. Now guards on `group.eventId` — navigation runs whenever an event ID is present, which is the correct condition.
  - Updated all callers of `getFirstTicketIdForGroup` to handle `null` return (skip QR press handler and navigation when null).

  **`apps/mobile/app/(tabs)/history.tsx`:**
  - Wrapped `separateTicketGroupsByDate` + sort into `useMemo` depending on `data?.tickets`.
  - Updated `getFirstTicketIdForGroup` caller to handle `null` (pass `onPress={undefined}` when null).
  - Removed redundant `priceDisplay` spread in `HistoryCard` props (now passes `group` directly).

  **`apps/mobile/app/ticket/[id].tsx`:**
  - **Filter consistency fix:** `currentTicket` was found with no status filter while `siblings` applied `issued`/`checked_in` filter — making `currentIndex` always `-1` for tickets outside that filter. Fixed by applying identical `isQRViewable` predicate to locate the current ticket in siblings; if the navigated ticket doesn't pass the filter (e.g., refunded), it's prepended to the group so navigation still works with `currentIndex = 0`.
  - **`qrValue` QRCodeData conformance:** Imported `QRCodeData` from `@project-flame/lib`. Typed `qrData` as `QRCodeData`. Changed `orderId: null` → `orderId: ""` (field is `string`, not `string | null`). Matches web `UserDashboard.tsx` QR generation exactly (`attendee_email` as `userId` value — same as web source).

  **`apps/mobile/components/settings/PersonalSettingsTab.tsx`:**
  - Replaced `disabled:opacity-50` NativeWind className (pseudo-class variants are not supported on React Native `Pressable`) with `style={updateCedulaStatus === "pending" ? { opacity: 0.5 } : undefined}` — follows `OAuthButton.tsx` pattern.

  **`apps/mobile/hooks/useUserRole.ts` (new file):**
  - Ported from `apps/web/app/lib/hooks/useUserRole.ts`. Calls `GET /api/user/role` via `apiGet` with Bearer auth.
  - Maps web roles (`"organizer"` / `"admin"`) → mobile `UserRole` (`"org"`).
  - TanStack Query with 5min stale, `retry: false`, enabled when signed in.

  **`apps/mobile/app/(tabs)/_layout.tsx`:**
  - **Hardcoded `const [role] = useState<UserRole>("user")` replaced** with `const { role } = useUserRole()`. Org users now see org tabs (Dashboard, Create Event, Events Management, RSVP) instead of always seeing user tabs.

  **`apps/mobile/components/dashboard/TicketCard.tsx`:**
  - **Empty image URI guard:** `Image` no longer receives an empty string as `uri` — renders a placeholder `View` with an `image-outline` icon when `ticket.eventImageUrl` is falsy.
  - **"pending" status no longer shows "Buy Now":** Pending tickets now render a non-interactive, muted `"Pending"` button (disabled, `pointerEvents="none"`, 0.6 opacity). Active "Buy Now" only renders for `ready_to_buy`. QR button only renders for `purchased`. `cancelled` status shows no action button.
  - Added `"cancelled"` to `STATUS_COLORS` and `STATUS_LABELS` records.

  **`apps/mobile/components/history/HistoryCard.tsx`:**
  - Simplified `HistoryCardTicket` type alias to `TicketGroupDisplay` (the `& { priceDisplay: string }` intersection was redundant since `TicketGroupDisplay` already declares `priceDisplay`).

- **Nitpicks deferred:** `getOrganizerName` API normalization, `ticket/[id].tsx` inline date/time helpers, history redundant spread — see `NITPICKS_TODOS.md`.

- **Phase 5 PR Parity Gate:**
  - **Web source references:** `apps/web/app/lib/hooks/useUserTickets.ts`, `apps/web/app/lib/hooks/useUserProfile.ts`, `apps/web/app/lib/hooks/useUserRole.ts`, `apps/web/app/components/UserDashboard.tsx`.
  - **API parity:** `GET /api/user/tickets`, `GET /api/user/profile`, `POST /api/user/update-cedula`, `GET /api/user/role` — same methods, paths, and response shapes. `getFirstTicketIdForGroup` null handling keeps navigation path consistent with web (web navigates to ticket detail by real ticket ID).
  - **Calculation parity:** `formatCentsAsPrice` from `@project-flame/lib` used throughout; no custom formatting introduced. `stage_price_cents` accessed directly on `UserTicket` (no cast).
  - **Type parity:** `RSVPStatus`, `TicketStatus`, `UserTicket`, `UserProfile` now single shared definitions in `@project-flame/lib`; web and mobile both import from there.
  - **QR parity:** `qrData` shape matches `QRCodeData` type and web `UserDashboard.tsx` exactly.

---

### 199. Phase 5B — User Dashboard Logic PR Review: Follow-up Fixes (Feb 24, 2026)

- **Context:** Second round of PR comments on User Dashboard Logic (#196/#198). Two of the four reported issues were already resolved in #198 (`onBuyPress` guard and `timeRange` range format); the remaining two fixed here.

- **Changes:**

  **`apps/mobile/lib/user-ticket-mappers.ts`:**
  - **Dead code removed:** `getStageName` and `getQuantity` were private functions never referenced outside their definition. `stageName` was assigned at line 136 but never read. All three removed — no callers, no side effects. `getOrganizerName` is kept as an exported helper (used by `ticket/[id].tsx`, see `NITPICKS_TODOS.md`).
  - **Free-ticket zero-cost bug fixed:** `formatCostDisplay` was passed `totalCost > 0 ? totalCost : undefined`, causing free tickets (`order.total_cents = 0`) to display `"—"` instead of `"$0.00"`. The `> 0` check conflated zero cost with absent cost data. Fixed to `orderMap.size > 0 ? totalCost : undefined` — passes `0` when order records exist (correctly renders `"$0.00"`) and `undefined` only when no order data was collected at all (correctly renders `"—"`).

- **Already resolved (no change needed):**
  - `onBuyPress` guard: already checks `group.eventId` (fixed in #198).
  - `timeRange` range format: already builds `"start - end"` (fixed in #198).

---

### 200. Phase 5B — User Dashboard Logic PR Review Round 2: Follow-up Fixes (Feb 24, 2026)

- **Context:** Third round of PR comments on User Dashboard Logic (Phase 5B). Six standard bugs fixed; two nitpicks deferred to `NITPICKS_TODOS.md`.

- **Changes:**

  **`apps/mobile/app/ticket/[id].tsx`:**
  - **Split combined error/not-found condition:** The single `if (error || !currentTicket)` branch was replaced with two separate branches. `if (error)` renders a "Failed to load ticket" UI with a **Retry** button (calls `refetch()`) and a **Go Back** button; if `error.status === 404` it falls through to the `!currentTicket` branch instead. `if (!currentTicket)` renders the original "Ticket not found" + Go Back UI. `refetch` is now destructured from `useUserTickets()`.

  **`apps/mobile/hooks/useUserProfile.ts`:**
  - **Added Zod runtime validation:** `UserProfileSchema` and `CedulaUpdateResponseSchema` (both `z.object(...)`) added above `useUserProfile`. In the `queryFn`, the raw API response is now run through `UserProfileSchema.safeParse()` before being returned; an invalid shape throws with a descriptive error message. The `updateCedulaMutation.mutationFn` now calls `apiPost<unknown>` and validates the response with `CedulaUpdateResponseSchema.safeParse()` before returning — preventing malformed server responses from silently corrupting state. No `any` types introduced.

  **`apps/mobile/app/(tabs)/_layout.tsx`:**
  - **`isLoading` guard on `isOrg`:** `const { role } = useUserRole()` updated to `const { role, isLoading } = useUserRole()`. `isOrg` changed from `role === "org"` to `!isLoading && role === "org"`. Org-only tabs remain hidden until the role query resolves, preventing user tabs from briefly appearing for org users on cold start.

  **`apps/mobile/hooks/useUserTickets.ts`:**
  - **User-scoped query cache key:** Destructured `userId` from `useOptionalAuth()`. Query key changed from `["user-tickets"]` to `["user-tickets", userId]` so each user's tickets are cached independently. Added `userId` to the `enabled` condition — the query will not fire before Clerk resolves a `userId`, preventing a newly signed-in user from ever reading a prior user's stale cache entry. Mirrors the `["user-role", userId]` pattern in `useUserRole.ts`.

  **`packages/lib/src/types/ticket.ts`:**
  - **`"cancelled"` added to `RSVPStatus`:** The union type was missing `"cancelled"` even though the API can return that value for RSVPs. Adding it makes the type complete and unblocks the `mapStatus` fix below.
  - **`organizations` plural key added to `ticket_tier.event`:** `organization?: { name: string }` was the only typed join field. Supabase can return the plural form (`organizations`) depending on the query shape. Added `organizations?: { name: string } | { name: string }[]` so callers can safely read from either join key without type assertions.

  **`apps/mobile/lib/user-ticket-mappers.ts`:**
  - **`mapStatus` — `"cancelled"` RSVP branch added:** RSVPs with `status === "cancelled"` were falling through all `rsvp` branches and returning the default `"purchased"` status. Added `ticket.status === "cancelled"` to the terminal-state check alongside `"rejected"`, `"auto_cancelled"`, and `"payment_failed"`. Now correctly returns `"cancelled"` for all RSVP terminal statuses.

- **Deferred:**
  - `UserRoleResponse` export — see `NITPICKS_TODOS.md`.
  - `stage_*` fields duplicated at top-level and in `metadata` on `UserTicket` — see `NITPICKS_TODOS.md`.

- **Phase 5 PR Parity Gate:**
  - **Web source references:** `apps/web/app/lib/hooks/useUserTickets.ts`, `apps/web/app/lib/hooks/useUserProfile.ts` (bug: web `useUserTickets` query key is also `["user-tickets"]` without userId — this is a web-side risk noted; mobile fix is a superset). Mobile `useUserRole.ts` already used `["user-role", userId]`; tickets now mirrors that pattern.
  - **API parity:** All API calls unchanged (same methods, paths, request shapes). No new endpoints introduced.
  - **Calculation parity:** No pricing or formatting logic changed. `formatCentsAsPrice` from `@project-flame/lib` still used throughout.
  - **Edge case verification:** `mapStatus("cancelled")` → `"cancelled"` (previously fell through to `"purchased"`). `error.status === 404` treated as not-found (falls through to `!currentTicket` branch). `isOrg` while `isLoading` → `false` (tabs deferred until role resolves). Stale cross-user ticket cache → prevented by `userId` in query key.
  - **Cross-platform behavior:** Web `useUserTickets` does not scope the cache key by user (web uses server-side auth; each browser session is inherently single-user). Mobile adds the scoping because the Clerk session can change between sign-outs/sign-ins within the same app session.

---

### 201. Phase 5B — User Dashboard Logic PR Review Round 3: Follow-up Fixes (Feb 24, 2026)

- **Context:** Third round of follow-up comments on Phase 5B User Dashboard Logic. Three standard functional bugs fixed.

- **Changes:**

  **`apps/mobile/app/(tabs)/_layout.tsx`:**
  - **User-only tab flicker fully eliminated:** The previous fix (`isOrg = !isLoading && role === "org"`) correctly deferred org-only tabs, but user-only tabs (`dashboard`, `history`) still used `isOrg ? null : "/dashboard"`, which evaluated to the active href while `isLoading` was true. For org users this caused home + My Tickets + History to render briefly before switching to the org tab set. Fixed by adding an explicit `isLoading` guard to both user-only tab hrefs: `isLoading ? null : isOrg ? null : "/dashboard"` (and same for history). All role-conditional tabs are now suppressed during the role query, leaving only the Home tab visible until the role resolves.

  **`apps/mobile/app/ticket/[id].tsx`:**
  - **QR placeholder icon visible on white background:** The fallback `MaterialCommunityIcons` (`name="qrcode"`) was rendered with `colors["white-100"]` (`#F9FBFE`) inside a `bg-white` container, making it invisible when `hasValidQR` is false (e.g., pending RSVP, cancelled ticket). Changed icon color to `colors.dark` (`#041C2B`) so the placeholder renders clearly on the white QR container background.

  **`apps/mobile/components/history/HistoryCard.tsx`:**
  - **Empty image URI guard:** `Image` was unconditionally rendered with `source={{ uri: ticket.eventImageUrl }}`, which can be an empty string when `image_url` is falsy (set in `groupTicketsByEventAndTier`). Passing `source={{ uri: "" }}` produces a blank/broken image area. Replaced with the same conditional pattern used by `TicketCard`: renders the `Image` when `ticket.eventImageUrl` is truthy, otherwise renders a `View` placeholder (`bg-white-10`, `rounded-[8px]`) containing an `image-outline` Ionicon at `colors["white-30"]`.

---

### 202. Phase 5B — User Dashboard Logic PR Review Round 4: Follow-up Fixes (Feb 24, 2026)

- **Context:** Fourth round of PR comments on Phase 5B User Dashboard Logic. Three standard bugs fixed; two nitpicks deferred to `NITPICKS_TODOS.md`.

- **Changes:**

  **`apps/mobile/app/ticket/[id].tsx`:**
  - **`organizerName` handles `organizations` as array or object:** The previous cast `(eventInfo as { organizations?: { name: string } })?.organizations?.name` silently returned `undefined` when Supabase returned the join as an array. Replaced with: `const orgs = eventInfo?.organizations; const organizerName = eventInfo?.organization?.name ?? (Array.isArray(orgs) ? orgs.find((o) => o.name)?.name : orgs?.name) ?? "Unknown Organizer"`. Now correctly handles the plural join key in both object and array forms.

  **`apps/mobile/components/history/HistoryCard.tsx`:**
  - **Dead-end Pressable when `onPress` is undefined:** The bottom section unconditionally rendered a `Pressable` with a chevron icon, implying the card was always expandable. When `onPress` is `undefined` the tap had no effect and the chevron was a false affordance. Replaced with a conditional: when `onPress` is provided, renders the full interactive `Pressable` with chevron; when absent, renders a plain `View` with the same quantity/price content and no chevron.

  **`apps/mobile/hooks/useUserProfile.ts`:**
  - **User-scoped profile cache key:** Destructured `userId` from `useOptionalAuth()`. Changed `queryKey` from `["user-profile"]` to `["user-profile", userId]`. Added `userId` to the `enabled` condition. Updated `queryClient.invalidateQueries` in `onSuccess` to target `["user-profile", userId]` so the invalidation hits the correct per-user cache entry. Mirrors the `useUserTickets` pattern — prevents cross-account stale profile exposure when a user signs out and a different user signs in within the same app session.

- **Deferred (nitpicks):**
  - `_layout.tsx` user tabs `isLoading` guard vs. optimistic render — see `NITPICKS_TODOS.md`.
  - `useUserTickets.ts` missing Zod runtime validation — see `NITPICKS_TODOS.md`.

---

### 203. Phase 5B — User Dashboard Logic PR Review Round 5: Verification (Feb 24, 2026)

- **Context:** Fifth and final round of PR comments on Phase 5B User Dashboard Logic. One duplicate comment verified against web source — no code change needed. Two nitpicks deferred.

- **No code changes.**

- **Duplicate comment — verified as already correct:**

  **`apps/mobile/app/ticket/[id].tsx` — `userId: currentTicket.attendee_email` in QR payload**

  Reviewer suggested replacing `attendee_email` with an internal `user_id`/`userId` on `UserTicket`, citing PII concerns. **Verified against web source-of-truth (`apps/web/app/components/UserDashboard.tsx` line 191):**

  ```ts
  userId: ticket.attendee_email || "", // Use email as identifier
  ```

  The web implementation intentionally uses `attendee_email` as the value for the `userId` field in the `QRCodeData` payload, with an explicit comment documenting this. The `UserTicket` type does not have a `user_id` or `userId` field. The mobile code (`userId: currentTicket.attendee_email ?? ""`) is a direct, correct port of the web source. Additionally, `validateQRCodeFormat` in `qr-code.ts` flags `attendee_email` as an old-format _key name_ (not value) — the mobile code correctly uses `userId` as the key name and `attendee_email` as its value, which is valid. **No change made.**

- **Deferred (nitpicks):**
  - `apps/mobile/app/ticket/[id].tsx` — structured error logging before fallback UI — see `NITPICKS_TODOS.md`.
  - `apps/mobile/app/ticket/[id].tsx` — custom `useMemo` grouping vs. shared mapper — see `NITPICKS_TODOS.md`.

---

### 204. Phase 5B — User Dashboard Logic PR Review Round 6: Follow-up Fixes (Feb 24, 2026)

- **Context:** Sixth round of PR comments on Phase 5B User Dashboard Logic. Three standard bugs fixed.

- **Changes:**

  **`apps/mobile/app/ticket/[id].tsx`:**
  - **`hasValidQR` missing status check:** `hasValidQR` only checked ticket type and presence of the `qr_code`/`qr_token` field, not ticket status. A refunded or void ticket with a QR field set would display the scannable code alongside "Present this QR code at the event entrance". Added `currentTicket.status === "issued" || currentTicket.status === "checked_in"` to `hasValidQR`, matching the `isQRViewable` predicate used for sibling navigation. Also gated the instruction text behind `{hasValidQR && ...}` so it no longer renders for revoked tickets.

  **`apps/mobile/app/(tabs)/dashboard.tsx`:**
  - **`ticketStats` scoped to current groups:** All four stats (`total`, `purchased`, `pending`, `readyToBuy`) were computed from every ticket the user ever had (`data?.tickets`), while the card list below shows only `currentGroups` (upcoming/current events). A user with 15 total tickets (10 past, 5 upcoming) would see "Total Tickets: 15" with 5 cards visible. Fixed by deriving stats from `currentGroups.flatMap((g) => g.tickets)` so all four numbers are consistent with the displayed content.

  **`apps/mobile/lib/user-ticket-mappers.ts`:**
  - **`getOrganizerName` array bug fixed:** The parameter type declared `organizations?: { name: string }` (object only), so `organizations?.name` returned `undefined` when Supabase returned an array. Updated the parameter type to `organizations?: { name: string } | { name: string }[]` and replaced the type-cast access with the same `Array.isArray` + `find` pattern already used in `ticket/[id].tsx`. The function now correctly handles both Supabase join shapes without type assertions. `NITPICKS_TODOS.md` entry updated: the inline-to-helper consolidation suggestion is now safe (no regression risk).

- **No deferred items.** No nitpicks in this round.

---

### 205. Phase 5B — User Dashboard Logic PR Review Round 7: Follow-up Fixes (Feb 24, 2026)

- **Context:** Seventh round of PR comments on Phase 5B User Dashboard Logic. Three standard bugs fixed.

- **Changes:**

  **`apps/mobile/app/(tabs)/dashboard.tsx`:**
  - **Stats grid inconsistency — `total` included inactive tickets:** `ticketStats.total` was `currentTickets.length`, which counts every ticket in current groups regardless of status (including cancelled, refunded, void, and RSVP-purchased records). Breakdown stats (`purchased`, `pending`, `readyToBuy`) only cover specific active statuses, so the three numbers could sum to less than `total` — e.g., "Total Tickets: 5" with "Purchased: 3, Pending: 1, Ready to Buy: 0". Fixed by computing the three breakdown counts first and deriving `total` as their sum (`purchased + pending + readyToBuy`). Inactive records are now excluded from all four stats.
  - **`navigationId` dead prop removed:** The `ticket` prop was constructed as `{ ...group, navigationId: ticketId ?? undefined }` even though `navigationId` is never read inside `TicketCard` — the parent handles navigation directly via `onQRPress`/`onBuyPress` callbacks using `ticketId`. Removed the spread/extension; `ticket={group}` is passed directly.

  **`apps/mobile/lib/user-ticket-mappers.ts`:**
  - **RSVP `"purchased"` status — explicit branch added:** RSVPs with `status === "purchased"` fell through all explicit checks in `mapStatus` and returned the default `"purchased"` display status. This caused `TicketCard` to render a tappable QR icon (action for display-`"purchased"`), which navigated to `ticket/[id].tsx` where `hasValidQR` is `false` for RSVPs — a dead end. Added an explicit `if (ticket.status === "purchased") return "cancelled"` branch in the RSVP block with a comment explaining that `"purchased"` on an RSVP means payment was completed and the actual ticket is a separate record — the RSVP itself has no further action.

  **`apps/mobile/components/dashboard/TicketCard.tsx`:**
  - **`navigationId` dead field removed from `TicketCardData` type:** `type TicketCardData = TicketGroupDisplay & { navigationId?: string }` simplified to `type TicketCardData = TicketGroupDisplay`. The field was never consumed inside the component.

---

### 206. Phase 5B — User Dashboard: Post-login Tab Visibility & Fast Error Feedback (Feb 25, 2026)

- **Context:** After logging in with a Clerk account, the "My Tickets" and "History" tabs were inaccessible — tapping them did nothing. Additionally, when the web API server is not running, the loading spinner persisted for several seconds before an error state appeared.

- **Root cause (tab visibility):** `apps/mobile/app/(tabs)/_layout.tsx` guarded both user tabs behind `isLoading ? null : ...`. This was added to prevent a brief "flash" of user tabs for organizer accounts while the role query resolved. However, the side-effect was that immediately after sign-in, `useUserRole` becomes enabled and `isLoading` flips to `true` — causing both "My Tickets" and "History" tabs to vanish from the tab bar while the role query is in-flight. Regular users could not tap the tabs because they were hidden. The fix defaults user tabs to visible during loading (`isOrg ? null : "/dashboard"`) and accepts the negligible flash for org users, which is a far better UX trade-off.

- **Root cause (slow error):** `useUserTickets` had no `retry: false`, so TanStack Query retried the API call 3 times with exponential backoff (~7 seconds total) before displaying the error state. Added `retry: false` to match `useUserRole`'s pattern.

- **Type fix:** `UserTicket.order.id` was typed as `string` but the `/api/user/tickets` route explicitly sets `order.id = null` for promotional tickets (no order record exists). Updated `packages/lib/src/types/ticket.ts` to `id: string | null`. All web usages of `ticket.order?.id` already use truthy checks or `|| null`, so no web code needed changes.

- **Changes:**

  **`apps/mobile/app/(tabs)/_layout.tsx`:**
  - Removed `isLoading ? null :` from `dashboard` and `history` tab `href` conditions. User tabs now default to visible during role loading.

  **`apps/mobile/hooks/useUserTickets.ts`:**
  - Added `retry: false` so API failures surface immediately instead of retrying 3× with backoff.

  **`packages/lib/src/types/ticket.ts`:**
  - `UserTicket.order.id` updated from `string` to `string | null` to match the actual API response for promotional tickets.

- **No deferred items.**

---

### 207. Phase 5B — User Dashboard: Network Error on Physical Device (Feb 25, 2026)

- **Context:** After the User Dashboard logic integration (#196, #206), testing on a physical iOS device with Expo Go produced a "network error" when navigating to My Tickets or History. The error appeared after sign-in when `useUserTickets` and `useUserRole` attempted to call the web API.

- **Root cause 1 (web server not reachable from LAN):** The web app's dev script was `next dev --turbopack`, which since Next.js 13.5+ defaults to binding on `127.0.0.1` (localhost only). A physical device on the same LAN at `192.168.100.140` could not reach the server — connection refused. Fix: added `-H 0.0.0.0` to the dev script so the server listens on all network interfaces.

- **Root cause 2 (trailing slash producing double-slash URLs):** `EXPO_PUBLIC_API_URL` was set to `http://192.168.100.140:3000/` (trailing `/`). The API client concatenated `${API_URL}${endpoint}` producing `http://192.168.100.140:3000//api/user/tickets`. While most servers tolerate double slashes, this is fragile. Fix: removed trailing slash from `.env` and added `.replace(/\/+$/, "")` in `api.ts` as a safety net.

- **Root cause 3 (silent network failures):** `api.ts` did not catch or log `fetch()` network errors (connection refused, DNS failure, timeout). The raw error bubbled up as `TypeError: Network request failed` with no indication of which URL was called. Fix: wrapped `fetch()` in try/catch, added `console.error` in `__DEV__` mode with the full URL and error message, and rethrows a descriptive `ApiError`.

- **Changes:**

  **`apps/mobile/.env`:**
  - Removed trailing slash from `EXPO_PUBLIC_API_URL` (`http://192.168.100.140:3000/` → `http://192.168.100.140:3000`).

  **`apps/mobile/lib/api.ts`:**
  - `API_URL` initialization now strips trailing slashes via `.replace(/\/+$/, "")`.
  - `fetch()` wrapped in try/catch — network errors are logged in dev mode (`[api] Network error: GET http://...`) and rethrown as `ApiError(0, "Network request failed for /api/...").

  **`apps/web/package.json`:**
  - Dev script changed from `next dev --turbopack` to `next dev --turbopack -H 0.0.0.0` to bind on all interfaces, enabling physical device access over LAN.

- **No deferred items.**

---

### 208. Architecture Fix — Mobile Reads Query Supabase Directly (Feb 25, 2026)

- **Context:** `useUserTickets` and `useUserRole` were calling web API endpoints (`GET /api/user/tickets`, `GET /api/user/role`), making the mobile app dependent on the web server running. This defeated the purpose of an independent mobile app. Meanwhile, `useAppEvents` already queried Supabase directly and worked without the web server.

- **Root cause:** The Phase 5B porting protocol instructed "call the same API endpoints as web", but the web's API routes are server-to-server calls using `supabaseAdmin` (service role). Mobile should instead use an authenticated Supabase client with Clerk JWTs, leveraging the existing RLS policies that already scope data by `users.clerk_id = auth.jwt() ->> 'sub'`.

- **Architecture decision:** Read operations (tickets, profile, role) query Supabase directly from mobile. Write operations (checkout, holds, RSVP creation) remain on the web API since they need server-side Stripe, email, and admin DB writes.

- **Changes:**

  **`apps/mobile/hooks/useOptionalAuth.ts`:**
  - `getToken` type updated to accept `(options?: { template?: string })` so hooks can request Clerk JWT templates (e.g., `getToken({ template: 'supabase' })`).

  **`apps/mobile/lib/supabase-auth.ts` (new):**
  - Factory function `getAuthenticatedClient(getToken)` — obtains a Supabase-compatible JWT from Clerk's "supabase" template and returns an authenticated `SupabaseClient`.
  - Used by any hook that needs user-scoped Supabase queries with RLS.

  **`apps/mobile/hooks/useUserRole.ts`:**
  - Refactored from web API call (`apiGet("/api/user/role")`) to direct Supabase queries.
  - Queries `users` table (RLS: own profile by clerk_id) and `organization_members` + `organizations` join.

  **`apps/mobile/hooks/useUserTickets.ts`:**
  - Refactored from web API call (`apiGet("/api/user/tickets")`) to direct Supabase queries.
  - Queries `tickets`, `rsvps`, `promotional_tickets` with same select/join shapes as web route.
  - Includes stage enrichment and approved-RSVP dedup logic (ported from web route).
  - Promotional tickets query wrapped in try/catch — existing RLS uses `auth.uid()` which may not resolve for Clerk JWTs (see migration below).

  **`supabase/migrations/20260225200000_fix_promotional_tickets_rls_clerk.sql` (new, renamed to `20260225164007_fix_promotional_tickets_rls_clerk.sql` in fix #212):**
  - Adds parallel SELECT policy `"Users can view own promotional tickets via clerk_id"` using `auth.jwt() ->> 'sub'` pattern, matching all other user-scoped policies.
  - The existing `auth.uid()`-based policy is preserved for backward compatibility.

- **Prerequisite — Clerk Dashboard configuration:**
  1. Go to Clerk Dashboard → JWT Templates → Create template.
  2. Name: `supabase`.
  3. Signing key: Your Supabase project's JWT Secret (Supabase Dashboard → Settings → API → JWT Secret).
  4. Leave default claims (`sub` = Clerk user ID).
  5. Apply the Supabase migration (`20260225164007_fix_promotional_tickets_rls_clerk.sql`) for promotional ticket visibility.

- **Edge case deferred:** Promotional tickets may return empty until the migration is applied and the Clerk JWT template is configured. Logged warning in dev mode.

---

### 209. Architecture — useUserProfile Refactored to Direct Supabase (Feb 25, 2026)

- **Context:** Continuation of #208. `useUserProfile` was still calling web API endpoints (`GET /api/user/profile`, `POST /api/user/update-cedula`). Both are simple `users` table operations that RLS supports.

- **Changes:**

  **`apps/mobile/hooks/useUserProfile.ts`:**
  - Read: queries `users` table directly via `getAuthenticatedClient(getToken)`. RLS "Users can view their own profile" scopes to own row.
  - Write (cedula): validates with shared `validateCedula`/`cleanCedula` from `@project-flame/lib`, then updates `users` table directly. RLS "Users can update their own profile" scopes the update.
  - No longer imports `apiGet`/`apiPost` from `lib/api.ts`.

- **No deferred items.**

---

### 210. Architecture — Updated Porting Protocol & Prompts (Feb 25, 2026)

- **Context:** The mobile architecture was documented as "thin client calling web API endpoints", which created an unnecessary dependency on the web server. Updated all project documentation to reflect the correct architecture: mobile is an independent client querying Supabase directly for reads, using web API only for writes needing server secrets.

- **Changes:**

  **`.cursor/rules/project-flame-master.mdc`:**
  - Section 7 "Mobile Architecture": renamed from "Thin Client" to "Independent Client". Updated table to show `lib/supabase-auth.ts` for reads. Added Clerk + Supabase Auth note.
  - Section 9 Step 3: replaced "API Calls → Use `lib/api.ts` to call the SAME web API routes" with split guidance for reads (direct Supabase) vs writes (web API).
  - Section 9 Step 4: updated to reflect "same data access" approach (port query shape, not API call).
  - Section 9 Step 5: split into "Verify Query Parity" (for Supabase reads) and "Verify API Parity" (for web API writes).
  - Section 9 Failure Conditions: updated to include RLS incompatibility as a stop condition.

  **`docs/prompts/prompts_phases.md`:**
  - Added architecture note at top explaining reads vs writes approach.
  - Phase 5B #1 (User Dashboard): marked COMPLETED with references.
  - Phase 5B #2 (Organizer Dashboard): updated to specify which operations are direct Supabase (reads) vs web API (writes).
  - Phase 5B #3 (Auth): updated to reference `lib/supabase-auth.ts` and note that `useUserRole` is already refactored.
  - PR Review prompt updated.

  **`docs/project-migrations/IOS_MIGRATION.md`:**
  - Section 7: added "Data Access" column key explaining Direct Supabase vs Web API.
  - User Dashboard table: updated from "API Endpoints Used" to "Data Access" with correct values.
  - Organizer Dashboard table: updated with read/write distinction.

- **No deferred items.**

---

### 211. RLS Infinite Recursion — organizations & organization_members (Feb 25, 2026)

- **Context:** After migrating mobile hooks (`useUserTickets`, `useUserRole`, `useUserProfile`) to query Supabase directly with Clerk-issued JWTs (entry #207–209), all ticket queries failed with `infinite recursion detected in policy for relation "organizations"` (code: 42P17). The web API never hit this because it uses `supabaseAdmin` which bypasses RLS entirely.

- **Root Cause:** The previous RLS recursion fix (migration `20260211212924`) only fixed 2 of 4 recursive policies. Two policies still created a circular loop:
  1. `"Organization owners can manage memberships"` on `organization_members` → queried `organizations` table
  2. `"Users can view organizations they belong to"` on `organizations` → queried `organization_members` table

  When `useUserTickets` queried `tickets`, the `"Organization members can view tickets for their events"` policy on `tickets` joined `organization_members`, triggering the circular evaluation. Postgres evaluates ALL SELECT policies (OR'd together) for a table, so even though `"Users can view their own tickets"` would have been sufficient, the org-scoped policy was also evaluated — and it recursed.

- **Fix (migration `20260225170114_fix_remaining_rls_recursion.sql`):**
  1. Created `get_owned_organizations()` SECURITY DEFINER function — safely looks up orgs owned by the current Clerk user, bypassing RLS.
  2. Replaced `"Organization owners can manage memberships"` to use `get_owned_organizations()` instead of querying `organizations` directly.
  3. Replaced `"Users can view organizations they belong to"` to use `get_user_organizations()` (existing SECURITY DEFINER helper) instead of querying `organization_members` directly.

  Applied directly to remote Supabase via MCP `apply_migration`. Migration file saved locally with matching timestamp.

- **Additional mobile code changes:**

  **`apps/mobile/hooks/useUserTickets.ts`:**
  - Removed `organizations(name)` from `TICKET_SELECT`, `RSVP_SELECT`, and `PROMO_SELECT` queries. No mobile component displays org name from these queries; `getOrganizerName()` in `user-ticket-mappers.ts` is defined but unused. Removing the join prevents the query from touching the `organizations` table at all, providing defense-in-depth beyond the RLS fix.

  **`apps/mobile/hooks/useUserRole.ts`:**
  - Replaced `.select("organization:organizations(id, name, slug, approved)")` with `.select("organization_id, role")` in the org membership check. Only `role` and `isLoading` are consumed by `_layout.tsx`; the full org details were unused. Avoids the `organizations` table join.

- **`useUserRole` returning `user=null`:** The Clerk user (`user_39Zni...`) doesn't have a row in the `users` table. On web, `resolveDbUserFromClerkId` in `apps/web/app/lib/auth.ts` creates the row JIT using `supabaseAdmin`. On mobile, since the user never purchased tickets on web, no DB row exists. The hook already handles this gracefully (defaults to `role: "user"`, `hasOrganization: false`), which is correct for a fresh account. User sync from mobile is a Phase 5B concern (tracked separately).

- **Debug logging added:** `__DEV__`-gated `console.debug` logs added to `lib/supabase-auth.ts`, `useUserRole.ts`, and `useUserTickets.ts` with `[supabase-auth]`, `[useUserRole]`, `[useUserTickets]` prefixes. Logs env variable presence, token retrieval, query results/errors, and `enabled` condition values.

---

### 217. PR Review — Structured Error Logs, rawRsvps Null Guard, Docs Annotation (Feb 25, 2026)

- **`apps/mobile/hooks/useUserRole.ts` — Added structured context to membership error logs:**
  Both `console.error` calls in the `organization_members` fetch block passed raw errors with no context, making it impossible to associate a log line with a specific user or action. Both calls now log `{ action: "fetch_organization_membership", userId, error }` so failures are immediately traceable in production logs.

- **`apps/mobile/hooks/useUserTickets.ts` — Null guard on `rawRsvps` before `.map()`:**
  `rawRsvps` is the raw Supabase response for the `rsvps` query. Although Supabase JS v2 typically returns `[]` on zero rows, it can return `null` in certain edge cases (e.g. RLS returns no rows on some versions). Casting `null` directly to `RsvpRow[]` and calling `.map()` throws at runtime. Changed `(rawRsvps as RsvpRow[])` to `((rawRsvps ?? []) as RsvpRow[])` to safely treat null as empty.

- **`docs/fixes/FEB_2026_FIXES.md` — Fix #208 migration filename annotated:**
  The file list entry for `20260225200000_fix_promotional_tickets_rls_clerk.sql` now notes "(renamed to `20260225164007_fix_promotional_tickets_rls_clerk.sql` in fix #212)". The prerequisite step's `apply the migration` reference now points to the current filename `20260225164007_fix_promotional_tickets_rls_clerk.sql` so readers don't try to apply a file that no longer exists at the original path.

---

### 222. Runtime — Fix Organizer Policies on `promotional_tickets` for Clerk JWT (Feb 25, 2026)

- **`supabase/migrations/20260225205612_fix_promo_tickets_organizer_policies_clerk.sql` — Replaced `auth.uid()` in all three organizer policies:**
  After dropping the legacy user-scoped `auth.uid()` policy in #221, the `22P02` error persisted because three organizer-scoped policies (`"Organizers can view/create/update promotional tickets for their events"`) also used `om.user_id = auth.uid()`. Since Postgres OR's all active SELECT policies together, the organizer SELECT policy evaluated `auth.uid()` on every query — including regular user queries — and failed the UUID cast for Clerk IDs. Replaced all three with `e.organization_id IN (SELECT get_owned_organizations())` (SECURITY DEFINER helper, consistent with `organization_members` policies). Applied via Supabase MCP (remote version `20260225205612`); matching local file created.

- **No deferred items.**

---

### 221. Runtime — Drop Legacy `auth.uid()` Policy on `promotional_tickets` (Feb 25, 2026)

- **`supabase/migrations/20260225204923_drop_promo_tickets_auth_uid_policy.sql` — Dropped old auth.uid() SELECT policy:**
  The original policy `"Users can view their own promotional tickets by email"` (baseline migration, line 5086) used `WHERE users.id = auth.uid()`. Because Clerk JWTs set `sub` to a non-UUID string (`user_39Zn...`), `auth.uid()` triggers a `22P02: invalid input syntax for type uuid` error at runtime. PostgreSQL evaluates all active SELECT policies with OR, so even though the Clerk-compatible replacement (`"Users can view own promotional tickets via clerk_id"`, added in `20260225164007` + updated in `20260225171100`) existed, the old policy still ran on every query and failed. Applied migration via Supabase MCP (remote version `20260225204923`); matching local file created.

- **No deferred items.**

---

### 220. PR Review — API Route Boundary, stagesError Context, and Duplicate Entry Fix (Feb 25, 2026)

Fixes applied from PR review pass. All items verified against current code before applying.

- **`apps/mobile/hooks/useUserProfile.ts` — Route cedula write through web API (supersedes #218):**
  `updateCedulaMutation` was writing directly to Supabase via `getAuthenticatedClient`, violating the server-side write boundary (only reads and RLS-scoped queries should hit Supabase directly from mobile; writes with server-owned logic go through the web API). Replaced the `client.from("users").update(...)` block with `apiPost("/api/user/update-cedula", { document_id: cleanedCedula }, getToken)`. The PGRST116 guard added in #218 is removed — `apiClient` already reads `data.error` from the 404 response (`"User not found"`) and throws `ApiError(404, "User not found")`, achieving the same parity. Client-side `validateCedula`/`cleanCedula` are retained before the API call (same as the web route).

- **`apps/mobile/hooks/useUserTickets.ts` — Add `userId` to `ticket_stages` enrichment error log:**
  The `stagesError` console.error was logging `{ action, tierIds, error }` but omitting `userId`, making it impossible to triage which user triggered the failure. Added `userId` to the logged object, consistent with every other error log in the file.

- **`docs/fixes/FEB_2026_FIXES.md` — Renamed duplicate entry `### 217.`:**
  Two entries were labelled `217.` (line ~1700 and ~1722). The newer one (DbRole Narrowing, added in the prior review round) was renamed to `### 219.` to restore unique numbering. No cross-references to the old 217 existed in the file.

- **No deferred items.**

---

### 218. PR Review — PGRST116 Parity in `updateCedulaMutation` (Feb 25, 2026)

- **`apps/mobile/hooks/useUserProfile.ts` — Handle PGRST116 in `updateCedulaMutation`:**
  When a user has no row in the `users` table (mobile-only signup edge case), `.update().single()` returns PostgREST error `PGRST116` ("The result contains 0 rows"). Mobile was rethrowing the raw Supabase error, surfacing `"The result contains 0 rows"` to the caller. The web route (`apps/web/app/api/user/update-cedula/route.ts` line 68) explicitly checks `updateError.code === "PGRST116"` and returns a `404` with `"User not found"`. Fixed mobile to match: check `updateError.code === "PGRST116"` before the general rethrow and throw `new Error("User not found")` instead.

- **No deferred items.**

---

### 219. PR Review — DbRole Narrowing and Contextual Error Wrapping (Feb 25, 2026)

Fixes applied from PR review pass. All items verified against current code before applying.

- **`apps/mobile/hooks/useUserRole.ts` — Eliminated `dbRole` string widening:**
  `dbRole` was typed as `string` and then cast back to `"user" | "organizer" | "admin"` at the return site, allowing unexpected DB values to flow through unchecked. Replaced with a `DbRole = "user" | "organizer" | "admin"` union type and a `normalizeDbRole(raw: unknown): DbRole` guard that returns the raw value only if it matches a known role, otherwise falling back to `"user"`. The return site now uses `dbRole` directly with no cast.

- **`apps/mobile/hooks/useUserRole.ts` — try/catch around primary user-role fetch:**
  The `getAuthenticatedClient` call and the `client.from("users")` query inside `queryFn` had no contextual error wrapping (unlike the `organization_members` query below, which already had one). Raw errors thrown from these calls gave no indication of which hook or action failed. Wrapped both in an async IIFE with a `try/catch` that logs `{ action: "fetch-user-role", userId, error: stack }` before rethrowing, consistent with the pattern used for `organization_members`.

- **`apps/mobile/hooks/useUserTickets.ts` — Top-level try/catch in queryFn:**
  The `queryFn` had no outer error boundary — any unhandled throw from `getAuthenticatedClient`, the tickets/rsvps/dedup queries, or the stage enrichment path would surface in TanStack Query's error state with no contextual log. Wrapped the entire `queryFn` body in `try { ... } catch (err) { console.error("[useUserTickets]", { action: "queryFn_failed", userId, error: err.stack }); throw err; }`. Existing internal `throw` statements (for `ticketsError`, `rsvpsError`, `dedupeError`) are unaffected — they propagate to this outer catch, which adds context and rethrows.

- **Deferred:**
  - Parallel execution of `rawTickets`/`rawRsvps`/`rawPromo` queries → `NITPICKS_TODOS.md` (explicitly categorized as nitpick in PR).

---

### 216. PR Review — Partial Event Object in `enrichedTickets` (Feb 25, 2026)

- **`apps/mobile/hooks/useUserTickets.ts` — Extended null guard to `event` in `enrichedTickets`:**
  The `formattedPromo` and `formattedRsvps` mappers were fixed in round #215 to use `tier && event ?` before building `ticket_tier`. The `enrichedTickets` mapper still guarded only on `ticketTier`, not `event`. When `ticketTier` is non-null but `event` is null (orphaned tier, deleted event, malformed data), `{ ...event }` spreads nothing and produces `{ organization: undefined, organizations: undefined }` — missing required fields (`id`, `name`, `slug`, `starts_at`, `ends_at`, etc.). Downstream, `groupTicketsByEventAndTier` keys on `eventInfo.id` (which would be `undefined`), producing grouping keys like `"undefined-{tierId}"`, and `formatDate`/`formatTime` receive `undefined`, showing "Invalid Date" in the UI. Fixed by applying the same `ticketTier && event ?` guard used in the other two mappers.

- **Stale comment (no fix applied):**
  Reviewer comment about case-sensitive email comparison in `20260225164007_fix_promotional_tickets_rls_clerk.sql` — already fixed by migration `20260225171100_fix_promo_email_case_insensitive.sql` (round #214), which drops the old policy and recreates it with `LOWER()` on both sides. The old migration file is immutable.

---

### 215. PR Review — Null Guards, Error Visibility, and Migration Idempotency (Feb 25, 2026)

Fixes applied from third PR review pass. All items verified against current code before applying.

- **`apps/mobile/hooks/useUserTickets.ts` — Removed `event!` non-null assertions in `formattedPromo` and `formattedRsvps`:**
  Both mappers asserted `event!` when spreading inside the `ticket_tier.event` construction. If the joined event row is null (deleted event, join failure), this would throw at runtime and reject the entire `queryFn`. Fixed by guarding both `tier` and `event` together (`tier && event ? { ... } : undefined`). When event is null, `ticket_tier` is set to `undefined` — consistent with how a missing tier is already handled.

- **`apps/mobile/hooks/useUserTickets.ts` — Log `ticket_stages` enrichment query errors:**
  The stage enrichment query (`ticket_stages`) did not destructure or check its `error` return value. A failed enrichment silently produced stubs with no stage metadata, making the failure invisible in logs. Now destructures `stagesError`, logs it with `{ action: "ticket_stages", tierIds, error }`, and skips the enrichment loop on failure (stage metadata enrichment is non-critical — tickets still display without it).

- **`apps/mobile/hooks/useUserTickets.ts` — Log Supabase-level error in promotional tickets fetch:**
  The `catch` branch logged thrown exceptions (network errors), but the `if (!error)` pattern silently discarded Supabase-returned errors (RLS rejection, policy misconfiguration, etc.). Restructured to an explicit `if (error) { console.error(...) } else { rawPromo = data }` pattern so both error paths are logged consistently.

- **`supabase/migrations/20260225171000_explicit_manage_memberships_rls.sql` — Added idempotent DROP guards for new policy names:**
  The migration dropped the old `"Organization owners can manage memberships"` policy but did not guard the four new policy names. Re-running the migration (or applying it to an environment where those policies already exist) would fail with duplicate-name errors. Added `DROP POLICY IF EXISTS` for each of the four new policies before their `CREATE POLICY` statements.

- **Stale comment (no fix applied):**
  Reviewer comment requesting `.limit(1)` before `.maybeSingle()` in `useUserRole.ts` — already fixed in round #214. Current code uses `.limit(1)` with no `.maybeSingle()`.

- **Deferred:**
  - Double `get_owned_organizations()` evaluation in the UPDATE policy → `NITPICKS_TODOS.md` (PR explicitly categorized as nitpick).

---

### 214. PR Review — Email Case Bug, Dedup Error Handling, and Multi-Org Role Fix (Feb 25, 2026)

Fixes applied from second PR review pass of Phase 5B User Dashboard Logic. All items verified against current code before applying.

- **`supabase/migrations/20260225171100_fix_promo_email_case_insensitive.sql` — Case-insensitive promo email RLS:**
  The `"Users can view own promotional tickets via clerk_id"` policy used `=` (case-sensitive) to compare `promotional_tickets.email` against `users.email`. The web route normalizes to lowercase (`user.email.toLowerCase()`) before querying, so mixed-case `users.email` values (e.g. `"John@Example.com"`) would block promotional tickets on mobile even though they appear on web. Replaced both sides of the comparison with `LOWER()` to make it case-insensitive. **Applied to remote Feb 25, 2026 (remote version `20260225205112`; local file renamed to match — see fix #212 pattern).**

- **`apps/mobile/hooks/useUserTickets.ts` — Propagate orders dedup query error:**
  The dedup query (`orders.idempotency_key IN (...)`) did not destructure or check `error`. On failure, `existingOrders` is null, so no keys are added and all approved RSVPs pass the filter — producing duplicate ticket entries alongside fulfilled ticket records. Now destructures `dedupeError` and throws it immediately, surfacing the failure instead of silently showing duplicates.

- **`apps/mobile/hooks/useUserRole.ts` — Replace `.maybeSingle()` with `.limit(1)` for multi-org owners:**
  A user can own multiple organizations (one `organization_members` row per org). `.maybeSingle()` throws PostgREST error PGRST116 when more than one row is returned, causing the hook to log an error and return `hasOrganization: false` even when the user genuinely owns orgs. Switched to `.limit(1)` and check `memberships.length > 0` — correctly handles 0, 1, or many org memberships.

- **Deferred:**
  - Batching the orders dedup `.in()` query in chunks of 50 (web's `BATCH_SIZE`) to avoid PostgREST URI length limits on users with many approved RSVPs → `EDGE_CASES_TODOS.md` #50. With the dedup error now thrown rather than swallowed, the impact is a visible query error rather than silent data corruption.

---

### 213. PR Review — Type Safety, Error Handling, and RLS Explicitness (Feb 25, 2026)

Fixes applied from PR review of Phase 5B User Dashboard Logic. All items verified against current code before applying.

- **`apps/mobile/hooks/useOptionalAuth.ts` — Expanded `GetTokenOptions` type:**
  Added `skipCache`, `leewayInSeconds`, `organizationId`, and `throwOnError` fields to `GetTokenOptions` so callers can pass the full set of Clerk SDK token options through `getToken`. Both `AuthHookResult` and `AuthResult` now accept the expanded type.

- **`apps/mobile/hooks/useUserTickets.ts` — Multiple fixes:**
  1. **Defined explicit Supabase row interfaces** (`EventRow`, `TicketTierRow`, `OrderRow`, `TicketRow`, `PromoRow`, `RsvpRow`, `StageRow`, `OrderDedupeRow`) and removed all `any` casts in `.map()` callbacks. Replaced `null as any` for `qr_code` with omitting the optional field. Fixed `(ticketTier as any)?.event` → properly typed via `unwrapSingle<TicketTierRow>`.

  2. **Logged promotional ticket fetch errors:** The `catch` block around the `promotional_tickets` query previously swallowed errors silently. Now calls `console.error("[useUserTickets] fetch promotional_tickets failed", { action, userId, error })` so failures are observable in dev/prod logs. `rawPromo` still defaults to `[]` (non-critical path).

  3. **Added `created_at` to `RSVP_SELECT`:** The field was missing, causing `UserTicket.created_at` (required `string`) to be `undefined` for RSVPs. Added `created_at` to the select string and explicitly mapped `created_at: r.created_at || r.requested_at` in `formattedRsvps` for backward compatibility with rows that may have a null `created_at`.

- **`apps/mobile/hooks/useUserRole.ts` — Error handling and role resolution:**
  1. **Wrapped `organization_members` query in `try/catch`:** Previously, if the membership query threw, the entire `queryFn` would throw and the role would remain in a loading/error state indefinitely. Now catches both Supabase errors (logs via `console.error`) and thrown exceptions, defaulting `hasOrganization` to `false` on failure.

  2. **Included `hasOrganization` in role resolution:** The final `UserRole` computation was `data?.role === "organizer" || data?.role === "admin"`, which ignored the `hasOrganization` flag returned by the query. An org owner whose `users.role` is still `"user"` would incorrectly see the user tab bar. Fixed to: `data?.role === "organizer" || data?.role === "admin" || data?.hasOrganization`.

- **`docs/todos/EDGE_CASES_TODOS.md` — Fixed markdown heading artifact:**
  The token `#211` at the start of line 274 was being parsed as an ATX heading. Wrapped in backticks → `` `#211` ``.

- **`supabase/migrations/20260225171000_explicit_manage_memberships_rls.sql` — Explicit RLS per-operation policies:**
  Replaced the single `FOR ALL` `"Organization owners can manage memberships"` policy (which had an implicit `WITH CHECK`) with four explicit per-operation policies (`FOR SELECT`, `FOR INSERT WITH CHECK`, `FOR UPDATE USING + WITH CHECK`, `FOR DELETE`). Functionally equivalent — PostgreSQL already uses the `USING` expression as the implicit `WITH CHECK` — but explicit policies make intent auditable and prevent future maintainer confusion. **Applied to remote Feb 25, 2026 (remote version `20260225205102`; local file renamed to match — see fix #212 pattern).**

- **Deferred:**
  - `apps/mobile/lib/supabase-auth.ts` non-null assertion on env vars → `NITPICKS_TODOS.md` (PR explicitly categorized as nitpick).

---

### 212. Migration Timestamp Sync — Local Files Matched to Remote Versions (Feb 25, 2026)

- **Context:** Two local migration files had timestamps that didn't match their remote Supabase `version` column (both were applied via MCP `apply_migration` which auto-assigns timestamps). This would cause `supabase db push` to see them as unapplied and try to re-apply them, likely failing on duplicate policies/functions.

- **Fix:** Renamed local files to match remote versions:
  - `20260225200000_fix_promotional_tickets_rls_clerk.sql` → `20260225164007_fix_promotional_tickets_rls_clerk.sql`
  - `20260226000000_fix_remaining_rls_recursion.sql` → `20260225170114_fix_remaining_rls_recursion.sql`

- **No deferred items.**

---

### 223. RSVP Management Logic Integration — Phase 5B Task #2 (Feb 25, 2026)

- **Context:** Integrated real functionality into the RSVP management screens (`rsvp-management.tsx` and `rsvp-detail.tsx`), replacing all mock data with live Supabase queries and web API mutations. This is Phase 5B Task #2 from the migration roadmap.

- **Web source-of-truth files:**
  - `apps/web/app/api/organizer/rsvps/route.ts` (GET query shape)
  - `apps/web/app/api/organizer/rsvps/[id]/approve/route.ts` (PATCH approve)
  - `apps/web/app/api/organizer/rsvps/[id]/reject/route.ts` (PATCH reject)
  - `apps/web/app/components/RsvpManagement.tsx` (component logic, polling, optimistic updates, registration modal)
  - `apps/web/app/components/organizer/RsvpsView.tsx` (events list with RSVP counts, current/past split)

- **New files:**
  - `supabase/migrations/20260225212511_org_members_view_rsvp_users.sql` — RLS policy allowing org members to view profiles of users who RSVPed to their events. Required because the `users` table only allowed self-reads, but the mobile direct-Supabase RSVP query needs user details (the web bypasses RLS via `supabaseAdmin`).
  - `apps/mobile/hooks/useRsvpManagement.ts` — Three hooks:
    - `useRsvpEvents()`: Fetches org events with pending RSVP counts via two parallel Supabase queries (events + rsvps), groups client-side, splits current/past via `separateEventsByDate()`.
    - `useEventRsvps(eventId)`: Fetches all RSVPs for a specific event with user/tier joins (exact query shape from web route) + event's `registration_form_config`. Polls every 15s via `refetchInterval`.
    - `useRsvpActions(eventId)`: TanStack mutations for approve/reject via `PATCH` to web API. Optimistic cache updates with rollback. Error handling: 409 (already processed), 400 (bad request), 500 (server error) — all shown via `Alert.alert`.

- **Modified files:**
  - `apps/mobile/lib/api.ts` — Added `apiPatch` helper (web routes use PATCH, not POST).
  - `apps/mobile/app/(tabs)/rsvp-management.tsx` — Replaced mock `rsvpEvents` with `useRsvpEvents()`. Added loading/error/empty states, pull-to-refresh, client-side search filtering by event name, current/past event sections.
  - `apps/mobile/app/rsvp-detail.tsx` — Replaced mock data with `useEventRsvps(eventId)` and `useRsvpActions(eventId)`. Reads `eventId` from `useLocalSearchParams`. Added status filter tabs (all/pending/approved/rejected), confirmation Alerts before approve/reject, registration data modal ported from web's view modal logic (handles form config + raw data fallback), pull-to-refresh.
  - `apps/mobile/components/org-dashboard/RsvpEventCard.tsx` — Updated type import from `data/mock` to `hooks/useRsvpManagement`.
  - `apps/mobile/components/org-dashboard/RsvpRequestCard.tsx` — Updated type import. Added `onReject` and `isProcessing` props. Added Reject button for pending status with disabled state during processing.
  - `apps/mobile/components/org-dashboard/RsvpStatsBar.tsx` — Updated type import from `data/mock` to `hooks/useRsvpManagement`.
  - `apps/mobile/components/dashboard/TicketSearchBar.tsx` — Made functional: accepts optional `value`, `onChangeText`, `placeholder` props. When `onChangeText` is provided, renders a `TextInput` instead of static `Text`. Backward-compatible (no props = original static behavior).

- **Query/API parity:**
  - RSVP detail SELECT matches web's `route.ts` lines 69–104 exactly (same columns, same joins, same ordering).
  - `stage_id` included in SELECT (web includes it).
  - Approve/reject use `PATCH` method matching web route handlers.
  - Price display: `base_price_cents ?? stage_price_cents ?? tier.price_cents ?? 0` (same as web).
  - `formatCedula()` from `@project-flame/lib` used for document_id display (matches web).
  - `formatCentsAsPrice()` from `@project-flame/lib` used for price display (already was).

- **No deferred items.**

---

### 224. Fix Infinite RLS Recursion on `users` Table (Feb 25, 2026)

- **Context:** The RLS policy added in #223 ("Org members can view RSVP requestor profiles" on `public.users`) caused `42P17: infinite recursion detected in policy for relation "users"`. The recursion path: `users` policy queries `rsvps` → `rsvps` policy "Organization members can view RSVPs for their events" queries `users` (inline `WHERE users.clerk_id = auth.jwt() ->> 'sub'`) → back to `users` policies.

  The `rsvps` RLS policies were never updated in the earlier `20260211212924_fix_rls_recursion.sql` migration (which only fixed `events` and `organization_members`). They still used inline subqueries on `users` from the baseline migration.

- **Fix:** `supabase/migrations/20260225213536_fix_rsvp_users_rls_recursion.sql`:
  1. Created `get_rsvp_user_ids()` SECURITY DEFINER function that returns user IDs who RSVPed to the current user's org events (bypasses RLS on `rsvps` and `events`).
  2. Recreated the `users` policy using `get_rsvp_user_ids()` instead of a direct `rsvps` subquery.
  3. Updated `rsvps` SELECT and UPDATE policies to use `get_user_organizations()` instead of inline `users` subqueries (consistent with the events/organization_members policies fixed in `fix_rls_recursion`).

  This breaks the recursion at both ends: `users` no longer directly queries `rsvps`, and `rsvps` no longer directly queries `users`.

- **No deferred items.**

---

### 225. Fix `PGRST116` in `useUserRole` and `useUserProfile` for Organizers (Feb 25, 2026)

- **Context:** After the RLS policy "Org members can view RSVP requestor profiles" was added (#223) and fixed (#224), organizers could now see multiple user rows (their own profile + all RSVP requestors). Both `useUserRole` and `useUserProfile` queried `.from("users").select(...).maybeSingle()` with **no explicit filter**, relying on RLS to return a single row. For organizers, RLS now returns multiple rows, causing `PGRST116: JSON object requested, multiple (or no) rows returned`.

- **Fix:**
  - `apps/mobile/hooks/useUserRole.ts` — Added `.eq("clerk_id", userId!)` filter before `.maybeSingle()`. The `userId` from `useOptionalAuth()` is the Clerk user ID, which matches `users.clerk_id`.
  - `apps/mobile/hooks/useUserProfile.ts` — Same fix: added `.eq("clerk_id", userId!)` filter.

  Both queries now always return exactly one row regardless of how many user records are visible via RLS.

- **No deferred items.**

---

### 226. Settings — Sign In / Sign Out Button (Feb 25, 2026)

- **Context:** Added a full-width Sign in/Sign out button to the Settings screen per design system and Phase 5B Auth Logic requirements. Button matches the Save button design (`bg-white-100 border border-white-50 rounded-pill`, `text-dark text-sm font-poppins-medium`) but spans full width and labels based on auth state.

- **Changes:**
  - `apps/mobile/hooks/useOptionalAuth.ts` — Extended `AuthResult` to include `signOut`. Real Clerk `useAuth` provides `signOut`; fallback auth provides a no-op `signOut` when Clerk is not configured.
  - `apps/mobile/components/settings/PersonalSettingsTab.tsx` — Added full-width Sign in/Sign out `Pressable` below the Save button. Uses `useOptionalAuth` and `useRouter`/`useQueryClient`. When signed in: calls `signOut()`, clears TanStack Query cache, and replaces to home. When signed out: navigates to `/sign-in`.
  - `apps/mobile/components/settings/OrganizationSettingsTab.tsx` — Same button added for consistency so org users can sign out from either tab.

- **No deferred items.**

---

### 227. PR Review — useUserTickets: formattedRsvps Leak & orders RLS Verification (Feb 25, 2026)

- **Context:** Two PR comments on the User Dashboard / useUserTickets implementation:
  1. **formattedRsvps mapper:** The mapper used `...r` to spread the raw `RsvpRow`, which includes `ticket_tiers` (Supabase nested relation). The explicit `ticket_tier` key didn't remove `ticket_tiers` from the spread, so `UserTicket` objects carried extraneous data not in the interface. The `formattedPromo` mapper builds from scratch.

  2. **orders dedup RLS:** The dedup query on `orders` relies on RLS (mobile uses authenticated client; web uses supabaseAdmin). If `orders` lacked a Clerk-compatible SELECT policy, the query would silently return empty and produce duplicate approved RSVPs alongside fulfilled tickets.

- **Fix:**
  1. **formattedRsvps:** Rebuilt the mapper to construct the object from scratch (like `formattedPromo`), explicitly listing each `UserTicket` field instead of spreading `...r`. No `ticket_tiers` or other raw Supabase relation data is passed through.
  2. **orders RLS:** Verified the baseline migration `20260128000000_baseline.sql` — the policy "Users can view their own orders" uses `auth.jwt() ->> 'sub'` via `users.clerk_id` (Clerk-compatible). No migration needed. Added an inline comment in the hook documenting this so future PR reviewers and maintainers know the dedup query is safe.

- **No deferred items.**

---

### 228. PR Review — Organizer RSVP Hook & UI: 6 Bugs Fixed (Feb 25, 2026)

- **Context:** PR review of Phase 5B Organizer Dashboard Logic (RSVP management). Six functional bugs fixed across `useRsvpManagement.ts`, `RsvpRequestCard.tsx`, `OrganizationSettingsTab.tsx`, and the migration files.

- **Fixes:**
  1. **`RsvpRequestCard` — buttons not disabled when callbacks undefined** (`apps/mobile/components/org-dashboard/RsvpRequestCard.tsx` ~lines 145–164): Reject and Approve `Pressable`s were only disabled by `isProcessing`. When `onReject`/`onApprove` were `undefined`, buttons remained tappable but silently did nothing. Changed `disabled` and `style` opacity to use combined `isProcessing || !onReject` / `isProcessing || !onApprove` conditions.

  2. **`RsvpRequestCard` — trailing `/` when tier has no stage** (`apps/mobile/components/org-dashboard/RsvpRequestCard.tsx` ~lines 83–96): The component unconditionally rendered `tierName.split("/")[0]` followed by a hardcoded `/`, producing `"General Admission/"` when `displayTier` has no stage component. Fixed to only render the `/` and secondary stage text when `stageName` is non-empty.

  3. **`RsvpRequestCard` — `expired` status missing from `STATUS_CONFIG`** (same file): The `RsvpStatus` type now includes `"expired"`, but `STATUS_CONFIG` didn't have an entry. Added `expired: { color: "rgba(255,255,255,0.5)", label: "Expired" }`.

  4. **`OrganizationSettingsTab` — unhandled rejection on `signOut` failure** (`apps/mobile/components/settings/OrganizationSettingsTab.tsx` ~lines 20–28): `signOut()` was awaited without a `try/catch`. Wrapped in `try/catch`; `queryClient.clear()` and `router.replace("/")` now only execute on success. The `catch` block logs `console.error` and shows an `Alert` to the user.

  5. **`useRsvpManagement` — `getDisplayPrice` showed unit price for multi-ticket RSVPs** (`apps/mobile/hooks/useRsvpManagement.ts`): The fallback path returned `stage_price_cents ?? tier.price_cents ?? 0` (single-unit price) instead of multiplying by `requested_quantity`. Ported from web's `getRsvpDisplayPrice` in `RsvpManagement.tsx`: if `base_price_cents` is set, return it directly (already total × quantity with discount); otherwise use `getBasePriceFromTicket(unitPrice, requested_at, fee_percentage) * requested_quantity`. Added `getBasePriceFromTicket` import from `@project-flame/lib`.

  6. **`useRsvpManagement` — `expired` status mapped to `"approved"`; stats total exceeded subtotals** (`apps/mobile/hooks/useRsvpManagement.ts`): The catch-all `else status = "approved"` mapped every non-pending, non-rejected RSVP (including `"expired"`) to `"approved"`. Added explicit `"expired"` branch. `RsvpStatus` type extended to `"pending" | "approved" | "rejected" | "expired"`. `RsvpDetailStats` extended with `expired: number` field. Stats loop now counts `expired` RSVPs, so `total === pending + approved + rejected + expired` is always true.

  7. **`useRsvpManagement` — PII fields (`email`, `date_of_birth`) unnecessarily selected** (`apps/mobile/hooks/useRsvpManagement.ts` `RSVP_DETAIL_SELECT`): Removed `email` and `date_of_birth` from the `users!rsvps_user_id_fkey(...)` projection. Only `first_name`, `last_name`, and `document_id` are used by the hook. Updated `RsvpDetailRow.user` interface accordingly.

  8. **Migrations — combine broken-then-fixed pair into single correct file** (`supabase/migrations/`): `20260225212511_org_members_view_rsvp_users.sql` originally created a broken `users` policy that caused infinite RLS recursion. A follow-up migration `20260225213536_fix_rsvp_users_rls_recursion.sql` dropped it and recreated it correctly. Merged both into the first file so the broken policy is never created in a fresh deployment. Added `GRANT EXECUTE ON FUNCTION public.get_rsvp_user_ids() TO authenticated` (was missing). Deleted the now-redundant `20260225213536_...` file.

- **Parity evidence:**
  - `getDisplayPrice` now mirrors `getRsvpDisplayPrice` in `apps/web/app/components/RsvpManagement.tsx` exactly: `base_price_cents` fast-path (total already), then `getBasePriceFromTicket(...) * requested_quantity` fallback.
  - `getBasePriceFromTicket` imported from `@project-flame/lib` — no local reimplementation.
  - PII fields `email` and `date_of_birth` are fetched by the web route (which uses `supabaseAdmin` for display), but the mobile only needs `first_name`, `last_name`, `document_id` — removing the extra fields aligns with data minimization without changing any displayed UI.

- **Deferred items:**
  - Nitpicks (extract `RegistrationModal`, `TicketSearchBar` token classes, shared sign-in/out hook, structured mutation `onError` logging) → `docs/todos/NITPICKS_TODOS.md` (Phase 5B Round 2 section).
  - Replace manual `as` casts with generated Supabase types → `docs/todos/EDGE_CASES_TODOS.md` #51.

---

### 229. PR Review — Organizer RSVP Hook & Migration: 3 More Fixes (Feb 25, 2026)

- **Context:** Follow-up PR review round on the same Phase 5B RSVP implementation (#228). Three functional/security bugs fixed.

- **Fixes:**
  1. **`useRsvpManagement` — `eventDate` field contained request date, not event date** (`apps/mobile/hooks/useRsvpManagement.ts`): `RsvpRequestData.eventDate` was set from `r.requested_at` but named as though it held the event's start date. Verified against web source (`RsvpManagement.tsx` row: `"Requested {formatDate(rsvp.requested_at)}"`): the web displays the **request date**, not the event date. Renamed `eventDate` → `requestDate` in the `RsvpRequestData` interface, the mapper, and the `RsvpRequestCard` consumer. No data change — only a semantic rename to match the web's intent.

  2. **`useRsvpManagement` — `optimisticUpdate` could decrement `pending` below zero** (`apps/mobile/hooks/useRsvpManagement.ts`): The stats update unconditionally decremented `pending` whenever `newStatus !== "pending"`, regardless of the RSVP's actual previous status. If the RSVP was already approved/rejected (e.g. double-tap, race condition), `pending` would go negative. Rewrote to look up `prev = old.rsvps.find(r => r.id === rsvpId)` and compute all deltas based on `prevStatus` (decrement the old bucket, increment the new one). Added `Math.max(0, ...)` guard on `pending` as a safety net. All four stat buckets (`pending`, `approved`, `rejected`, `expired`) now update correctly for any transition, not just pending → something.

  3. **Migration — `get_rsvp_user_ids()` callable by PUBLIC** (`supabase/migrations/20260225212511_org_members_view_rsvp_users.sql`): The `GRANT EXECUTE TO authenticated` was present, but the PostgreSQL default leaves `EXECUTE` granted to `PUBLIC`. Added `REVOKE ALL ON FUNCTION public.get_rsvp_user_ids() FROM PUBLIC` immediately before the `GRANT` so only `authenticated` users can invoke the SECURITY DEFINER function.

  4. **`FEB_2026_FIXES.md` — headings out of order** (doc quality): Multiple heading swaps across review rounds restored ascending order. Titles unchanged.

- **Parity evidence:** `requestDate` matches the web's `"Requested {formatDate(rsvp.requested_at)}"` label. `optimisticUpdate` delta logic now mirrors a correct general-case stats state machine rather than assuming all transitions start from `"pending"`.

- **Deferred items:**
  - Redundant `split("/")` calls and `View Details` disabled guard in `RsvpRequestCard` → `docs/todos/NITPICKS_TODOS.md` (Phase 5B Round 3 section).

---

### 230. PR Review — Organizer RSVP Hook & UI: 3 More Fixes (Feb 25, 2026)

- **Context:** Third follow-up PR review round on Phase 5B RSVP implementation. Three functional bugs fixed.

- **Fixes:**
  1. **`useRsvpManagement` — stats and visible cards could fall out of sync** (`apps/mobile/hooks/useRsvpManagement.ts`): The stats loop ran over `rawRsvps` using raw `r.status` strings (including `"purchased"` and any unknown DB statuses) while the card mapper ran its own separate normalization. An unknown status would increment `total` without landing in any named bucket, breaking `total === pending + approved + rejected + expired`. Moved the stats computation to run **after** the `rsvps.map()`, deriving counts from the already-normalized `RsvpRequestData` array. Now both visible cards and stats use the same normalized status value, so they are always in sync.

  2. **`useRsvpManagement` — `optimisticUpdate` incremented a bucket without decrementing when RSVP not in cache** (`apps/mobile/hooks/useRsvpManagement.ts`): When `prev` was `undefined` (RSVP not found in the cached list), `prevStatus` was `undefined` so all decrement conditions were `false`, but increment conditions for `newStatus` were still applied — causing the bucket sum to exceed `total`. Added an explicit `hasPrev = Boolean(prev)` flag; stats updates are now entirely skipped when `hasPrev` is false, leaving them unchanged until the `onSettled` invalidation corrects them from the server.

  3. **`RsvpRequestCard` — "View Details" Pressable had no disabled guard** (`apps/mobile/components/org-dashboard/RsvpRequestCard.tsx` ~line 141): Unlike the Approve/Reject buttons (fixed in #228), the "View Details" `Pressable` remained tappable when `onViewDetails` was `undefined` or while another action was processing. Added `disabled={isProcessing || !onViewDetails}` and the matching `style` opacity so the button behaves consistently with the other action buttons.

- **Deferred items:**
  - Redundant `split("/")` calls in `RsvpRequestCard` tier name IIFE → already in `docs/todos/NITPICKS_TODOS.md` (Phase 5B Round 3).
  - Structured `onError` logging in `useRsvpManagement` mutations → already in `docs/todos/NITPICKS_TODOS.md` (Phase 5B Round 2).

---

### 231. PR Review — Organizer RSVP Hook: Zod Validation + Doc Reorder (Feb 25, 2026)

- **Context:** Final follow-up PR review round on Phase 5B RSVP implementation. One functional fix and one doc reorder.

- **Fixes:**
  1. **`useRsvpManagement` — unsafe `as` cast on `registration_form_config`** (`apps/mobile/hooks/useRsvpManagement.ts` ~line 335): `eventResult.data?.registration_form_config` was cast directly to `FormField[] | null` with no runtime validation. If the DB returns an unexpected shape (e.g. after a schema migration), the cast silently passes corrupt data to callers. Added `FormFieldSchema` (Zod schema mirroring the `FormField` interface) and replaced the cast with `z.array(FormFieldSchema).nullable().safeParse(...)`. On parse failure, logs a `console.warn` with `eventId` and the Zod error message, and returns `null` as a safe default. Follows the same Zod pattern used in `useEventDetails.ts`.

  2. **`FEB_2026_FIXES.md` — entries 227–230 in wrong order** (doc quality): Entries appeared as 230 → 229 → 228 → 227 instead of ascending 227 → 228 → 229 → 230. Reordered all four blocks to restore ascending sequence matching the rest of the changelog.

- **Deferred items:**
  - Redundant `split("/")` calls in `RsvpRequestCard` → already in `docs/todos/NITPICKS_TODOS.md` (Phase 5B Round 3).
  - Structured `onError` logging in `useRsvpManagement` → already in `docs/todos/NITPICKS_TODOS.md` (Phase 5B Round 2).

---

### 233. PR Review — Settings: Fix Unhandled `signOut()` Rejection in `PersonalSettingsTab` (Feb 25, 2026)

- **Context:** `handleSignInOutPress` in `PersonalSettingsTab` awaited `signOut()` without a `try/catch`, unlike the identical handler in `OrganizationSettingsTab` which properly wraps in `try/catch` with an error `Alert`. If `signOut()` threw, the promise rejection was unhandled — the user saw no feedback, and `queryClient.clear()` / `router.replace("/")` never executed, leaving the app in an inconsistent state.

- **Fix:**
  - `apps/mobile/components/settings/PersonalSettingsTab.tsx`: Added `Alert` to the `react-native` import. Wrapped the `signOut()` + `queryClient.clear()` + `router.replace("/")` sequence in a `try/catch` with `console.error` logging and `Alert.alert("Sign Out Failed", ...)` — matching the `OrganizationSettingsTab` pattern exactly.

---

### 234. PR Review — RSVP Stats Loop: `total` Now Derived From Known Bucket Sum (Feb 25, 2026)

- **Context:** The stats loop in `useRsvpManagement` initialised `total` from `rsvps.length`, but only incremented `pending`, `approved`, `rejected`, and `expired` buckets. Any RSVP with `"unknown"` status incremented `total` without being reflected in any sub-bucket, causing `total > pending + approved + rejected + expired`. The `RsvpStatsBar` "All" count would exceed the visible breakdown sum.

- **Fix:**
  - `apps/mobile/hooks/useRsvpManagement.ts` (~line 400): Changed initial `total` from `rsvps.length` to `0`. After the loop, set `stats.total = stats.pending + stats.approved + stats.rejected + stats.expired`. Any `"unknown"` RSVP is now excluded from both the total and all sub-buckets, keeping `total === pending + approved + rejected + expired` invariant always true.

---

### 232. PR Review — Organizer RSVP Hook: Fix `unknown` Status Catch-All (Feb 25, 2026)

- **Context:** Final PR review comment on Phase 5B RSVP implementation. The `else status = "approved"` catch-all in `useRsvpManagement` incorrectly mapped any DB status that wasn't `"pending"`, `"rejected"`, or `"expired"` — including truly unknown values like `"auto_cancelled"` or `"payment_failed"` — to the green "Approved" badge.

- **Fix:**
  - `apps/mobile/hooks/useRsvpManagement.ts`: Added an explicit `else if (r.status === "approved" || r.status === "purchased") status = "approved"` branch, and changed the final catch-all to `else status = "unknown"`. `RsvpStatus` type extended to include `"unknown"`.
  - `apps/mobile/components/org-dashboard/RsvpRequestCard.tsx`: Added `unknown` entry to `STATUS_CONFIG` (`color: "rgba(255,255,255,0.3)"`, `label: "Unknown"`) so the `Record<RsvpStatus, ...>` type check remains exhaustive.

- **Deferred items:**
  - Structured `onError` logging in `useRsvpManagement` mutations → already in `docs/todos/NITPICKS_TODOS.md` (Phase 5B Round 2).

---

### 235. PR Review — `rsvp-detail.tsx`: Missing `expired` in Fallback Stats Object (Feb 25, 2026)

- **Context:** The component-level fallback `data?.stats ?? { total: 0, pending: 0, approved: 0, rejected: 0 }` was missing `expired: number`, which is a required field in `RsvpDetailStats`. If the fallback was ever reached (e.g., during optimistic cache updates referencing `old.stats.expired`), `stats.expired` would be `undefined` instead of `0`, producing `NaN` in arithmetic.

- **Fix:**
  - `apps/mobile/app/rsvp-detail.tsx` (line 251): Added `expired: 0` to the fallback object so it satisfies the full `RsvpDetailStats` interface.

---

### 236. PR Review — `RsvpStatsBar`: Add `Expired` to Breakdown So Sum Always Equals "All" (Feb 25, 2026)

- **Context:** `stats.total` is computed as `pending + approved + rejected + expired`, but `RsvpStatsBar` only displayed Pending, Approved, and Rejected. Whenever any RSVPs had `"expired"` status, the visible sub-counts would not sum to the displayed "All" total — a visible numerical inconsistency for organizers. The old mock data had no `expired` field, so the gap was never exposed.

- **Fix:**
  - `apps/mobile/components/org-dashboard/RsvpStatsBar.tsx`: Added an `Expired` count tile to the breakdown row (after Rejected), matching the same style as the other tiles. The breakdown now always sums to the "All" total and gives organizers visibility into expired RSVPs.

---

### 237. Phase 5B — QR Scanner (UI + Logic): Camera Integration & Ticket Check-In (Feb 26, 2026)

- **Context:** Phase 4 deferred the QR scanner screen because it requires native camera integration. This implements the full scanner flow for mobile, porting the web's `QRScannerApp.tsx` + `useQRScanner.ts` logic to React Native using `expo-camera`.

- **Web source files ported:**
  - `apps/web/app/components/QRScannerApp.tsx` — scanner UI, state machine, validate/verify/checkin flow
  - `apps/web/app/lib/hooks/useQRScanner.ts` — `useTicketVerification` + `useTicketCheckIn` mutations
  - `apps/web/app/api/qr-scanner/verify/route.ts` (POST) — ticket verification
  - `apps/web/app/api/qr-scanner/checkin/route.ts` (POST) — ticket check-in
  - `apps/web/app/api/qr-scanner/validate-code/route.ts` (POST) — scanner access code validation

- **New files created:**
  - `apps/mobile/hooks/useQRScanner.ts` — mirrors web's state machine (`idle → scanning → verifying → verified → checking_in → checked_in / error`). Uses TanStack Query mutations calling web API endpoints via `apiPost` from `lib/api.ts`. Handles access code validation, ticket verification, check-in confirmation, and scanner reset. Imports `QRCodeData` from `@project-flame/lib`.
  - `apps/mobile/app/scanner.tsx` — Full scanner screen using `expo-camera`'s `CameraView` with `onBarcodeScanned` (QR only). Includes: camera permission handling with settings link, access code entry (mirrors web's `EnterCodeModal`), live camera view with scanner overlay, camera flip + torch toggle, manual code entry fallback, ticket details display, confirm check-in flow, already-checked-in warning, error states.

- **Modified files:**
  - `apps/mobile/components/org-dashboard/OrgStatsSection.tsx` — Scanner button now navigates to `/scanner` on press. Accepts optional `eventId` prop to pass event context. Added `expo-router` import.
  - `apps/mobile/metro.config.js` — Added `expo-camera` to `extraNodeModules` mapping per monorepo resolution rules.
  - `apps/mobile/package.json` — Added `expo-camera@55.0.9` dependency.

- **API parity (all via `apiPost` → web API routes):**
  - `POST /api/qr-scanner/validate-code` — body: `{ code }` — matches web exactly
  - `POST /api/qr-scanner/verify` — body: `{ qrData, deviceId, accessCode }` — matches web exactly
  - `POST /api/qr-scanner/checkin` — body: `{ ticketId, deviceId, isPromotionalTicket, accessCode }` — matches web exactly

- **Shared lib imports confirmed:** `QRCodeData` from `@project-flame/lib`, `colors` from `@project-flame/ui`.

- **Edge cases handled:** valid ticket, already checked-in, invalid QR data (silently ignored), wrong event, manual code entry, camera permission denied (with open-settings link), network errors via `ApiError`.

- **Deferred items:**
  - Torch may not work on all devices (expo-camera limitation) → `docs/todos/EDGE_CASES_TODOS.md` #52
  - Offline scanning queue for poor connectivity → `docs/todos/EDGE_CASES_TODOS.md` #53

---

### 238. PR Review — QR Scanner: Fix expo-camera Version, Vibration Timing, Dead Code, Duplicate EDGE_CASE IDs (Feb 26, 2026)

- **Context:** Post-implementation PR review of Fix #237 (QR Scanner). Applied triage rules; fixed confirmed bugs; deferred edge cases and nitpicks.

- **Fixes applied:**

  1. **`apps/mobile/package.json` — `expo-camera` incompatible version corrected** (`^55.0.9` → `~17.0.10`). `expo-camera@55.x` targets Expo SDK 55; the project uses `expo: ~54.0.33`. `npx expo install expo-camera` confirmed `~17.0.10` as the SDK 54–compatible version.

  2. **`apps/mobile/hooks/useQRScanner.ts` — Vibration moved after `validateQRData`** (web parity fix). The mobile hook was not vibrating at all — `Vibration.vibrate(200)` lived in `scanner.tsx`'s `handleBarcodeScanned` and fired on every camera frame that entered `handleBarcodeScan`, including frames where `validateQRData` returned `null` (non-ticket QR codes, URLs, app links). The web source (`QRScannerApp.tsx` line 494) vibrates only after `validateQRData` passes. Fixed by importing `Vibration` into `useQRScanner.ts` and calling it inside `handleBarcodeScan` immediately after `validateQRData` succeeds, matching the web gate exactly.

  3. **`apps/mobile/app/scanner.tsx` — Premature `Vibration.vibrate(200)` and unused `Vibration` import removed.** Vibration is now handled by `useQRScanner.ts` (see fix 2).

  4. **`apps/mobile/app/scanner.tsx` — Unused `params` variable and `useLocalSearchParams` import removed.** `useLocalSearchParams<{ eventId?: string }>()` was declared but never referenced. The URL-based event pre-selection feature it was intended for has no web equivalent and requires new server-side ownership-check logic; deferred to `EDGE_CASES_TODOS.md` #56.

  5. **`docs/todos/EDGE_CASES_TODOS.md` — Duplicate IDs 37 and 38 renumbered to 52 and 53.** The scanner items added in Fix #237 reused IDs already assigned to "Event Details — `per_user_limit === 0`" (#37) and "Event Details — Real-Time Availability Polling" (#38). Renamed scanner items to continue the current sequence. Cross-reference in `FEB_2026_FIXES.md` #237 updated accordingly.

- **Deferred items:**
  - Zod runtime validation for `ValidateCodeResponse`, `TicketVerificationResponse`, `TicketCheckInResponse` → `docs/todos/EDGE_CASES_TODOS.md` #54
  - Event-mismatch branch `processingRef` not explicitly reset (functionally equivalent to web via `resetScanner`) → `docs/todos/EDGE_CASES_TODOS.md` #55
  - URL `eventId` param ignored; scanner always requires manual access code entry → `docs/todos/EDGE_CASES_TODOS.md` #56

---

### 239. PR Review — QR Scanner: Turbo Build Error, Lockfile Sync, Torch Reset Parity (Feb 26, 2026)

- **Context:** Second-round PR review of the QR scanner implementation (Fix #237/#238). Three actionable fixes applied; three comments deferred.

- **Fixes applied:**

  1. **`pnpm-workspace.yaml` — Root package added to workspace** (`"."` entry added). `turbo-ignore` generates the filter `--filter=project-flame-monorepo...[hash]` using the root `package.json` `"name"` field. Turborepo could not resolve `project-flame-monorepo` because the root was excluded from `pnpm-workspace.yaml` (`apps/*` + `packages/*` only). Adding `"."` makes the root a workspace member so Turbo's package lookup succeeds. Fix verified: `npx turbo run build --filter=project-flame-monorepo...[hash]` resolves correctly.

  2. **`pnpm-lock.yaml` — Lockfile synced after `expo-camera` specifier correction** (Fix #238 changed `^17.0.10` → `~17.0.10` in `package.json` without re-running `pnpm install`). The lockfile retained `specifier: ^17.0.10`, which would cause CI `--frozen-lockfile` failures. Ran `pnpm install` to regenerate; lockfile now shows `specifier: ~17.0.10`.

  3. **`apps/mobile/app/scanner.tsx` — Torch state reset on scanner reset** (web parity fix). The web's `resetScanner` function calls `setTorchEnabled(false)` because both live in the same component scope. On mobile, `torchEnabled` lives in `scanner.tsx` while `resetScanner` is in the hook — so the hook couldn't reset torch directly. Added a `handleReset` wrapper that calls `resetScanner()` followed by `setTorchEnabled(false)`, and replaced all three `resetScanner` call sites that trigger an idle transition ("Cancel" in VerifiedState, "Scan Next Ticket" in checked-in, "Try Again" in error) with `handleReset`. The "Cancel Scanning" button already called `setTorchEnabled(false)` inline and was not changed.

- **Deferred items:**
  - Hardcoded `"#F9FBFE"` on Ionicons in camera controls (same value as `colors["white-100"]`, no bug) → `docs/todos/NITPICKS_TODOS.md`
  - Local `formatDate`/`formatTime` helpers vs `@project-flame/lib`'s `formatEventDate`/`formatEventTime` (different locales, not drop-in) → `docs/todos/NITPICKS_TODOS.md`
  - Zod runtime validation for scanner API responses → already deferred to `docs/todos/EDGE_CASES_TODOS.md` #54 in Fix #238; comment is a duplicate

---

### 240. PR Review — QR Scanner: Access Code try/catch, Changelog Order, Docs Example (Feb 26, 2026)

- **Context:** Third-round PR review of the QR scanner (Fix #237–#239). Two code fixes and one docs correction.

- **Fixes applied:**

  1. **`apps/mobile/app/scanner.tsx` — Added try/catch around `onValidate` in `AccessCodeEntry.handleSubmit`.** `validateAccessCode` in `useQRScanner.ts` already catches all errors internally and returns `{ valid: false, error }`, so a throw is unlikely in practice. However, the async `handleSubmit` had no outer guard — any unexpected rejection would be unhandled. Wrapped the `await onValidate(trimmed)` call in a try/catch that calls `setError(err.message ?? "Validation failed. Please try again.")` in the catch branch, surfacing a safe user-facing message instead of a silent rejection.

  2. **`docs/fixes/FEB_2026_FIXES.md` — Fix #238 and #239 entries swapped to restore ascending numeric order.** Fix #239 had been written before #238, leaving the changelog out of order. Entries are now #238 followed by #239.

  3. **`docs/todos/NITPICKS_TODOS.md` — Example output updated to weekday-neutral form.** The `formatDate`/`formatTime` helpers nitpick showed `"Mon, Jan 6"` as a sample output. Updated to `"Jan 6"` (weekday omitted) to avoid implying the weekday is always included in the output.

---

### 241. `scanner.tsx` — Fix `"camera-off-outline"` Type Error and Remove Dead Imports (Feb 26, 2026)

- **Context:** `"camera-off-outline"` is a valid Ionicons v7 icon (present in the underlying font bundled with `@expo/vector-icons 15.0.3`) but is absent from the package's TypeScript type definitions, causing a hard TypeScript error. This was the sole remaining red error in the file, deferred across three previous PR review rounds. Resolved now alongside cleanup of unused imports and destructured values.

- **Fixes applied:**

  1. **`apps/mobile/app/scanner.tsx` — `"camera-off-outline"` cast to resolve type error.** Applied `name={"camera-off-outline" as keyof typeof Ionicons.glyphMap}`, matching the identical cast pattern already used for `MaterialCommunityIcons` on line 109. Icon renders correctly at runtime; the cast suppresses the stale type-definition error without changing behaviour.

  2. **`apps/mobile/app/scanner.tsx` — Unused imports removed.** `useEffect` (React) and `Alert` (react-native) were imported but never referenced. Both removed.

  3. **`apps/mobile/app/scanner.tsx` — Unused destructured values removed.** `justCheckedIn` and `isVerifying` were destructured from `useQRScanner()` but never used in the component. Both removed from the destructuring. The hook still returns them for future consumers.

  4. **`apps/mobile/app/scanner.tsx` — Unused `ScannerState` type import removed.** `ScannerState` was re-exported from `useQRScanner` and imported here but never used as a type annotation. Removed; `scannerState` values are still inferred correctly from the hook's return type.

---

### 242. PR Review — QR Scanner: Cancel Scanning Leaves Manual Entry Open (Feb 26, 2026)

- **Context:** Fourth-round PR review of the QR scanner (Fix #237–#241). One standard bug fixed; three comments deferred or already addressed.

- **Fix applied:**

  1. **`apps/mobile/app/scanner.tsx` — "Cancel Scanning" now closes the manual entry panel.** The "Cancel Scanning" `Pressable` handler reset `scannerState` to `"idle"` and cleared `torchEnabled`, but did not call `setShowManualEntry(false)`. The `ManualCodeEntry` UI is only rendered inside the `scannerState === "scanning"` block, so it is visually hidden when the state changes — but `showManualEntry` remained `true`. On the next scan session ("Activate Camera" → `startScanning()`), the manual entry would immediately reappear, which is unexpected. Added `setShowManualEntry(false)` to the cancel handler.

- **Deferred:**
  - Icon-only camera controls (flip, torch, manual entry) lack `accessibilityRole` and `accessibilityLabel` → `docs/todos/ACCESSIBILITY_TODOS.md`

- **Already addressed (duplicate comments):**
  - `eventId` route param not wired → already deferred to `docs/todos/EDGE_CASES_TODOS.md` #56 in Fix #238
  - Hardcoded `"#F9FBFE"` on Ionicons → already deferred to `docs/todos/NITPICKS_TODOS.md` in Fix #239

---

### 243. PR Review — QR Scanner: `Linking.openSettings()` Unhandled Rejection (Feb 26, 2026)

- **Context:** Fifth-round PR review of the QR scanner (Fix #237–#242). One standard bug fixed; three comments deferred or already addressed.

- **Fix applied:**

  1. **`apps/mobile/app/scanner.tsx` — `Linking.openSettings()` wrapped in try/catch with user feedback.** `Linking.openSettings()` returns a Promise that can reject on certain Android devices or restricted environments. The call site was a bare inline arrow function with no error handling — any rejection would be silently dropped as an unhandled Promise. Replaced with an `async` handler that `await`s the call inside a try/catch; the catch branch logs the error and shows an `Alert` instructing the user to open Settings manually. Re-added `Alert` import (removed in Fix #241 when it had no use site).

- **Deferred:**
  - Split `ScannerScreen` into per-state-branch view subcomponents → `docs/todos/NITPICKS_TODOS.md` (opinionated refactor, no functional bug)

- **Already addressed (duplicate comments):**
  - Icon-only Pressables lack accessibility attributes → already deferred to `docs/todos/ACCESSIBILITY_TODOS.md` in Fix #242
  - `eventId` route param not wired → already deferred to `docs/todos/EDGE_CASES_TODOS.md` #56 in Fix #238

---

### 244. PR Review — QR Scanner: `handleReset` Missing `setShowManualEntry(false)` (Feb 26, 2026)

- **Fix applied:**

  1. **`apps/mobile/app/scanner.tsx` — `handleReset` now closes the manual entry panel.** Fix #242 added `setShowManualEntry(false)` to the "Cancel Scanning" inline handler but missed `handleReset`, which is used by "Try Again" (error state), "Scan Next Ticket" (checked-in state), and the "Cancel" button in the verified state. The scenario: user opens the manual entry panel during a scan session; a background camera scan fires and transitions the state to verifying/error/checked-in; the user taps one of those reset buttons. `showManualEntry` remained `true`, causing the panel to reappear immediately on the next scan session. Added `setShowManualEntry(false)` to `handleReset` alongside the existing `resetScanner()` and `setTorchEnabled(false)` calls. Now all three reset paths (Cancel Scanning, handleReset, and the hook's `clearEventSession`) properly clean up all local UI state.

---

### 245.Phase 5B — Task 2D: Event Management CRUD + Stripe Connect (Feb 26, 2026)

- **Context:** Phase 5B Organizer Dashboard Logic — wire create/edit event forms, tier management, org-event-detail actions (promo codes, send tickets, promoter links), and Stripe Connect status display. All mock data replaced with real Supabase queries and web API calls.

- **Web Source References:**
  - `apps/web/app/api/events/route.ts` (GET, POST, PATCH)
  - `apps/web/app/api/ticket-tiers/route.ts` (GET, POST, PATCH, DELETE)
  - `apps/web/app/api/organizer/promotional-codes/route.ts` (GET, POST)
  - `apps/web/app/api/organizer/promotional-tickets/route.ts` (POST)
  - `apps/web/app/api/organizer/promoter-links/route.ts` (GET, POST)
  - `apps/web/app/api/organizer/search-users/route.ts` (GET)
  - `apps/web/app/components/StripeConnectStatus.tsx`
  - `apps/web/app/api/stripe/connect/status/route.ts` (GET)
  - `apps/web/app/api/stripe/connect/onboard/route.ts` (POST)

- **Hooks Created (10 new):**
  - `hooks/useOrgData.ts` — Fetches current user's org (id, name, stripeAccountId, memberRole) via Supabase directly.
  - `hooks/useStripeConnect.ts` — Stripe Connect status fetch via `GET /api/stripe/connect/status` + onboarding via `POST /api/stripe/connect/onboard` → `Linking.openURL()`.
  - `hooks/useOrgEvents.ts` — Fetches org's events with ticket tiers + stages via Supabase directly.
  - `hooks/useCreateEvent.ts` — Create event mutation via `POST /api/events`.
  - `hooks/useUpdateEvent.ts` — Update event mutation via `PATCH /api/events`.
  - `hooks/useTierMutations.ts` — Tier CRUD via `POST/PATCH/DELETE /api/ticket-tiers`.
  - `hooks/usePromoCodes.ts` — Fetch + create promo codes via `GET/POST /api/organizer/promotional-codes`.
  - `hooks/usePromoterLinks.ts` — Fetch + create promoter links via `GET/POST /api/organizer/promoter-links`.
  - `hooks/useSearchUsers.ts` — Search users by email via `GET /api/organizer/search-users`.
  - `hooks/useSendTickets.ts` — Send promotional tickets via `POST /api/organizer/promotional-tickets`.

- **UI Changes:**
  - `app/(tabs)/settings.tsx` + `components/settings/SettingsTabs.tsx`: Added "Payouts" tab (third tab after Personal, Organization).
  - `components/settings/PayoutsSettingsTab.tsx` (new): Displays Stripe Connect status (not connected / incomplete / fully connected) with onboarding button. Ported 1:1 from web's `StripeConnectStatus.tsx`.
  - `app/(tabs)/create-event.tsx` + `components/create-event/EventDetailsTab.tsx`: All form inputs now editable and wired. Form state managed at screen level, submitted via `useCreateEvent` → `POST /api/events`.
  - `components/create-event/TicketTiersTab.tsx`: Tier + stage forms fully functional. Add/remove tiers and stages with validation. Uses same validation as web (tier name, quantity, price, sales dates, stage quantity sum).
  - `app/(tabs)/events-management.tsx`: Replaced mock data with `useOrgEvents`. Shows loading/error states. Edit flow uses real `OrgEvent` data.
  - `components/events-management/EditEventDetailsTab.tsx`: Wired to `useUpdateEvent` → `PATCH /api/events`. Editable fields: starts_at, ends_at, venue, city.
  - `components/events-management/EditTiersTab.tsx` (new): Shows existing tiers with stats. Add new tiers via `useCreateTier` → `POST /api/ticket-tiers`. Delete tiers (if no sold tickets) via `useDeleteTier` → `DELETE /api/ticket-tiers`.
  - `components/events-management/EventsListView.tsx`: Now accepts `events` prop (from real data) instead of importing mock.
  - `app/org-event-detail.tsx`: Replaced `getOrgEventDetail()` mock with `useOrgEvents` + `usePromoCodes` + `usePromoterLinks`. All action cards wired.
  - `components/org-dashboard/OrgPromotionsCard.tsx`: Create promo code form with validation (3-20 alphanumeric uppercase, discount 5-100 in 5% increments, usage limit). Ported from web's POST handler.
  - `components/org-dashboard/OrgSendTicketsCard.tsx`: Email search wired to `useSearchUsers`. Send button wired to `useSendTickets`. Shows real user results with name/email.
  - `components/org-dashboard/OrgPromoterLinksCard.tsx`: Create promoter link form with validation (3-50 alphanumeric uppercase). Copy-to-clipboard (simplified to Alert for now — `expo-clipboard` not installed).
  - `components/org-dashboard/OrgEventInfoCard.tsx`: Updated interface to accept real data shape (no longer depends on mock `OrgEventDetail` type).
  - `lib/api.ts`: Added `apiDelete` helper.

- **API Parity Evidence:**
  - All write operations use `lib/api.ts` → web API endpoints (same methods, paths, request bodies).
  - All read operations use Supabase directly via `lib/supabase-auth.ts` with same select shapes as web routes.
  - Request body shapes match web Zod schemas (field names, types, units).
  - Error responses parsed identically (ApiError with status + message).

- **Calculation Parity Evidence:**
  - **Project standard:** Use raw `price_cents / 100` division only for numeric calculations and aggregations (e.g., revenue totals, stat values) where the result remains a number for further math. Use `formatCentsAsPrice` from `@project-flame/lib` for all user-facing currency strings (e.g., `RsvpRequestCard` price display). Never format a number with ad-hoc string interpolation when `formatCentsAsPrice` is available.
  - In this implementation: event revenue total is `sum(tier.quantity_sold * tier.price_cents) / 100` — a numeric dollar value passed as a prop to the stat card. `formatCentsAsPrice` is used in `RsvpRequestCard` for user-visible prices.
  - `formatEventDate`, `formatEventTime` imported from `@project-flame/lib` for all date/time display.

- **Deferred Items:**
  - Image upload for create/edit event → deferred (requires backend image upload endpoint).
  - Date/time picker UI (currently uses ISO string text input) → deferred to UI polish pass.
  - `expo-clipboard` integration for promoter link copy → deferred (package not installed, using Alert fallback).
  - Tier edit (PATCH) from Edit Tiers tab → deferred (create + delete wired, inline editing is complex).
  - QR scanner code field in edit event → deferred.
  - Delete event functionality → deferred.

---

### 246.PR Review: Organizer Dashboard Logic (Feb 26, 2026)

PR review of Phase 5B Organizer Dashboard implementation. All items triaged per decision tree. 11 bugs fixed; all nitpicks/non-critical items deferred to `NITPICKS_TODOS.md`.

#### Fixes Applied

**246a — `create-event.tsx`: Validate sanitized slug, not raw input**

- **File:** `apps/mobile/app/(tabs)/create-event.tsx`
- **Bug:** `!eventForm.slug.trim()` passed slugs like `"@@@"` (non-empty after trim but empty after `.replace(/[^a-z0-9-]/g, "")`) causing an opaque server-side Zod error.
- **Fix:** Compute `sanitizedSlug` before validation; check `!sanitizedSlug` instead of `!eventForm.slug.trim()`; use `sanitizedSlug` in the `mutateAsync` call.

**246b — `create-event.tsx`: Date validity and ordering check**

- **File:** `apps/mobile/app/(tabs)/create-event.tsx`
- **Bug:** `starts_at` / `ends_at` were only checked for presence, not for valid Date values or chronological ordering. An `ends_at <= starts_at` input reached the API silently.
- **Fix:** After presence checks, parse both values with `new Date(...)`, reject if `isNaN`, and reject if `endsAtDate <= startsAtDate` with "End date must be after start date.".

**246c — `TicketTiersTab.tsx`: Chronology validation using `eventStartsAt`**

- **File:** `apps/mobile/components/create-event/TicketTiersTab.tsx`
- **Bug:** `handleSaveTier` checked only that `salesStart` / `salesEnd` were non-empty strings. The `eventStartsAt` prop was declared but never read, leaving the "sales must end 30 min before event starts" rule unenforced.
- **Fix:** Added `Date.parse` validity checks for `salesStart` and `salesEnd`, `salesStart < salesEnd` ordering check, and `salesEnd <= eventStartsAt - 30 min` enforcement when `eventStartsAt` is set.

**246d — `TierCard.tsx` / `TicketTiersTab.tsx`: Remove no-op edit handler**

- **Files:** `apps/mobile/components/create-event/TicketTiersTab.tsx`, `apps/mobile/components/create-event/TierCard.tsx`
- **Bug:** `TierCard` was rendered with `onEdit={() => {}}` — the pencil button was visible and tappable but did nothing.
- **Fix:** Removed the `onEdit` prop from the `TicketTiersTab` call site. Updated `TierCard` to conditionally render the edit `Pressable` only when `onEdit` is defined.

**246e — `OrgSendTicketsCard.tsx`: Platform-aware `ActivityIndicator` size**

- **File:** `apps/mobile/components/org-dashboard/OrgSendTicketsCard.tsx`
- **Bug:** `ActivityIndicator size={24}` (numeric) is ignored on Android; renders default large spinner regardless.
- **Fix:** Added `Platform` import; set `size={Platform.OS === "ios" ? 24 : "small"}` on the search-button spinner.

**246f — Web: Stripe account link uses correct type for fully-connected accounts**

- **Files:** `apps/web/app/lib/stripe/connect.ts`, `apps/web/app/api/stripe/connect/onboard/route.ts`
- **Bug:** `createAccountLink` always used `"account_onboarding"`, causing fully-connected accounts to restart onboarding instead of opening the Stripe account update flow.
- **Fix:** Added optional `type: "account_onboarding" | "account_update"` parameter to `createAccountLink` (default `"account_onboarding"`). Updated the onboard route to call `stripe.accounts.retrieve(accountId)` and pass `"account_update"` when `charges_enabled && payouts_enabled`, `"account_onboarding"` otherwise. (`"account_management"` is not a valid Stripe AccountLink type — the correct SDK value is `"account_update"`.)

**246g — `useOrgData.ts`: Propagate query errors; stable membership ordering**

- **File:** `apps/mobile/hooks/useOrgData.ts`
- **Bug (1):** `memberError` and `orgError` were swallowed (`console.error` + `return null`), making real DB failures indistinguishable from "no org".
- **Bug (2):** `.limit(1).maybeSingle()` on the membership query returned an arbitrary row when a user had multiple memberships.
- **Fix:** Added `.order("created_at", { ascending: true })` for deterministic selection. Changed `console.error + return null` to `throw` for both errors, with structured log context (`{ userId, organizationId, error }`).
- **UI Impact:** `useOrgData` now throws on real query errors. The hook's `isError` flag will be `true` on failure. Known consumers: `apps/mobile/app/(tabs)/create-event.tsx`, `apps/mobile/app/org-event-detail.tsx`, `apps/mobile/components/settings/PayoutsSettingsTab.tsx`. These screens currently do not have dedicated `isError` handling for org-data failures (they rely on `orgData` being `null`). The recommended pattern is to check `isError` and render an error message + retry button, following the pattern in `apps/mobile/app/(tabs)/dashboard.tsx`. Wrapping org screens in an error boundary is also advisable for unhandled throws. This is deferred as a follow-up UX improvement (see `NITPICKS_TODOS.md`).

**246h — `useOrgEvents.ts`: Return all events, not just published**

- **File:** `apps/mobile/hooks/useOrgEvents.ts`
- **Bug:** `.eq("status", "published")` hid draft, paused, and cancelled events from the organizer dashboard, making newly-created events invisible until published.
- **Fix:** Removed the status filter. Events are returned in `starts_at ASC` order regardless of status.

**246i — `useSendTickets.ts`: Invalidate org-events cache on success**

- **File:** `apps/mobile/hooks/useSendTickets.ts`
- **Bug:** No `onSuccess` callback — every other write mutation (`useCreateTier`, `useDeleteTier`, `useUpdateEvent`, `useCreateEvent`) invalidates `["org-events"]`, but `useSendTickets` did not. `quantity_sold` remained stale after sending a promotional ticket.
- **Fix:** Added `useQueryClient` + `onSuccess: () => queryClient.invalidateQueries({ queryKey: ["org-events"] })`.

**246j — `useStripeConnect.ts`: Validate URL before `Linking.openURL`**

- **File:** `apps/mobile/hooks/useStripeConnect.ts`
- **Bug:** The server-provided `data.url` was opened without any validation, creating an open-redirect risk if the API response was tampered with or the server returned an unexpected URL.
- **Fix:** Parse `data.url` with `new URL(...)` and verify `protocol === "https:"` and `hostname === "stripe.com" || hostname.endsWith(".stripe.com")` before calling `Linking.openURL`. Note: `endsWith("stripe.com")` alone would allow typosquatting domains like `badstripe.com`; the correct check requires the hostname to be exactly `stripe.com` or a proper subdomain (`.stripe.com` prefix). Throws an error with a clear message if validation fails.

**246k — `EDGE_CASES_TODOS.md`: Renumber duplicate section IDs**

- **File:** `docs/todos/EDGE_CASES_TODOS.md`
- **Bug:** Tasks at lines 315–338 reused section numbers `### 37`–`### 41`, which conflicted with earlier entries carrying the same IDs.
- **Fix:** Renumbered the duplicated block to `### 52`–`### 56` (continuing from the previous highest, `### 51`).

#### Deferred Items

All deferred to `NITPICKS_TODOS.md` (Feb 26, 2026):

- Zod schema validation to replace manual field checks in `handleSubmit` (create-event.tsx)
- Replace `placehold.co` fallback with local asset in `events-management.tsx`
- Error UI retry control in `events-management.tsx`
- `purchaseStats.requestedTickets` hardcoded to `0` in `org-event-detail.tsx` (TODO comment)
- ISO date format validation in `EditTiersTab.handleCreateTier`
- `handleCreateTier` `useCallback` memoization (EditTiersTab)
- `ManageEvent` type imported from `data/mock` in `EventsListView`
- `PromoCodeDisplay` interface duplication (OrgPromotionsCard / org-event-detail)
- `handleSendTicket` always uses `tiers[0]` — requires tier selection UI (OrgSendTicketsCard) _(partially fixed in #198 — now picks first non-sold-out tier)_
- `apiPost` untyped body cast in `useCreateEvent`
- Untyped mutation response in `usePromoterLinks`
- Onboarding error log missing org context in `useStripeConnect`

---

### 247.PR Review: Organizer Dashboard Logic Follow-up (Feb 26, 2026)

Second-pass PR review on the same implementation. 4 bugs fixed (3 code, 1 security); 2 changelog corrections; 7 nitpicks deferred.

#### Fixes Applied

**247a — `OrgSendTicketsCard.tsx`: Concurrent send tracking via `Set<string>`**

- **File:** `apps/mobile/components/org-dashboard/OrgSendTicketsCard.tsx`
- **Bug:** `useState<string | null>(sendingUserId)` meant a second in-flight send would overwrite the first's loading state, making the UI flicker incorrectly.
- **Fix:** Replaced with `useState<Set<string>>(new Set())`. Sends add the user ID to the set on start and delete it in `finally`. The UI checks `sendingUserIds.has(user.id)`.

**247b — `OrgSendTicketsCard.tsx`: Choose first non-sold-out tier**

- **File:** `apps/mobile/components/org-dashboard/OrgSendTicketsCard.tsx`
- **Bug:** `handleSendTicket` always used `tiers[0]`, which could be sold out. For multi-tier events this silently sends to a full tier.
- **Fix:** Use `tiers.find((t) => t.quantity_sold < t.quantity_total)` as `chosenTier`. Alert and return early if all tiers are sold out. Use `chosenTier.id` in the `mutateAsync` payload.

**247c — `onboard/route.ts`: URLSearchParams encoding for return URL**

- **File:** `apps/web/app/api/stripe/connect/onboard/route.ts`
- **Bug:** The return path was built with raw template-string interpolation (`?organizationId=${organizationId}&accountId=${accountId}`). Any reserved character in those values would produce a malformed URL.
- **Fix:** `const returnParams = new URLSearchParams({ organizationId, accountId }); ... \`/api/stripe/connect/return?${returnParams.toString()}\``

**247d — `useStripeConnect.ts`: Tighten Stripe hostname validation**

- **File:** `apps/mobile/hooks/useStripeConnect.ts`
- **Bug:** `hostname.endsWith("stripe.com")` permits typosquatting domains like `badstripe.com`.
- **Fix:** `hostname === "stripe.com" || hostname.endsWith(".stripe.com")` — only exact match or legitimate subdomain passes.

### Changelog Corrections (Fix #246)

- **238g** updated: documented that `useOrgData` now throws on errors; known consumers (`create-event.tsx`, `org-event-detail.tsx`, `PayoutsSettingsTab`) do not yet have dedicated `isError` handling — deferred as follow-up nitpick.
- **238j** updated: clarified why `endsWith("stripe.com")` alone is insufficient (allows typosquatting).
- **#196 Calculation Parity**: Updated to accurately describe `formatCentsAsPrice` availability and where raw `price_cents / 100` is used for stat values vs. formatted display strings.

#### Deferred Items

All deferred to `NITPICKS_TODOS.md` (Feb 26, 2026):

- `TicketTiersTab.tsx` — index-based keys; prefer stable IDs in edit flows
- `TierCard.tsx` — guard `onDelete` button the same way `onEdit` is guarded
- `OrgSendTicketsCard.tsx` — add error context (`eventId`, `userId`) to catch-block log
- `OrgSendTicketsCard.tsx` — replace raw radius classes with design tokens (`rounded-full` → `rounded-circle`, `rounded-[20px]` → `rounded-pill`)
- `useStripeConnect.ts` — add `organizationId` context to error log
- `onboard/route.ts` — replace inline `stripe.accounts.retrieve` with `getAccountStatus` helper
- `useOrgData` consumers — add `isError` handling following `dashboard.tsx` pattern

---

### 248.`handleSaveTier` stale closure + `useUpdateTier` dead code (Feb 26, 2026)

**248a — `TicketTiersTab.tsx`: `eventStartsAt` missing from `handleSaveTier` dep array**

- **File:** `apps/mobile/components/create-event/TicketTiersTab.tsx`
- **Bug:** `handleSaveTier` reads `eventStartsAt` to enforce the "sales must end 30 min before event starts" rule (Fix #246c), but `eventStartsAt` was absent from the `useCallback` dependency array. If the user filled in Ticket Tiers before setting the event start time on the Event Details tab, the callback held a stale empty string and the validation was silently skipped.
- **Fix:** Added `eventStartsAt` to the `useCallback` dependency array.

**248b — `useTierMutations.ts`: Remove `useUpdateTier` and `UpdateTierInput` dead exports**

- **File:** `apps/mobile/hooks/useTierMutations.ts`
- **Bug:** `useUpdateTier` (hook) and `UpdateTierInput` (interface) were exported but have zero importers. Tier inline editing is intentionally deferred (EDGE_CASES_TODOS.md #59). Dead exported code adds maintenance burden without current consumers.
- **Fix:** Removed `UpdateTierInput` interface, `useUpdateTier` function, and the now-unused `apiPatch` import. EDGE_CASES_TODOS.md #59 already notes that the hook must be re-added when implementing the feature.

---

### 249.`TicketTiersTab.tsx`: Pre-existing type errors (Feb 26, 2026)

Two pre-existing TypeScript errors in `TicketTiersTab.tsx` that had been present since the initial implementation were surfaced as IDE errors and fixed.

**249a — `StageCard` price prop: `string` instead of `number`**

- **File:** `apps/mobile/components/create-event/TicketTiersTab.tsx`
- **Bug:** `price: (stage.price_cents / 100).toFixed(2)` passed a `string` to `CreateEventStage.price: number`.
- **Fix:** Removed `.toFixed(2)` — value is now `stage.price_cents / 100` (a `number`). `StageCard` renders it with `${}` interpolation which handles formatting at the display layer.

**249b — `TierCard` missing required `hasPriceStages` field**

- **File:** `apps/mobile/components/create-event/TicketTiersTab.tsx`
- **Bug:** The inline `tier` object passed to `TierCard` omitted `hasPriceStages`, which is a required field on `CreateEventTier` (from `data/mock.ts`).
- **Fix:** Added `hasPriceStages: tier.useStages ?? false` — `useStages` is the flag set when the user enables staged pricing in the tier form, making this the correct source of truth.

---

### 250. PR Review — Renumber Fix #197–200 → #246–249; re-entry guard; docs cleanup (Feb 26, 2026)

**250a — `FEB_2026_FIXES.md`: Renumber Fix #197–200 → Fix #246–249**

- **Bug:** Fixes added in the current session used `## Fix #197`–`#200` headings, conflicting with existing entries numbered 197–237 in the `### NNN.` sequence.
- **Fix:** Renamed all headings, subsection labels (`197a`…`197k`, `198a`…`198d`, `199a`–`199b`, `200a`–`200b`), and every cross-reference across `FEB_2026_FIXES.md`, `NITPICKS_TODOS.md`, and `EDGE_CASES_TODOS.md` to `238`–`241` respectively.

**250b — `FEB_2026_FIXES.md`: Clarify Calculation Parity standard**

- **Fix:** Updated the Calculation Parity Evidence section in Fix #245 to state the project standard explicitly: `price_cents / 100` for numeric calculations/aggregations; `formatCentsAsPrice` from `@project-flame/lib` for all user-facing currency strings.

**250c — `OrgSendTicketsCard.tsx`: Add re-entry guard to `handleSendTicket`**

- **File:** `apps/mobile/components/org-dashboard/OrgSendTicketsCard.tsx`
- **Bug:** `sendingUserIds` was only checked via the disabled button UI. A second concurrent call to `handleSendTicket` for the same user (e.g., rapid double-tap) could still proceed past the guards and issue a duplicate send.
- **Fix:** Added `if (sendingUserIds.has(user.id)) return;` as the first line of the handler. The `setSendingUserIds` call now also uses a functional updater with an idempotency check (`if (prev.has(user.id)) return prev`) to prevent any race between the early guard and the state setter.

**250d — `NITPICKS_TODOS.md`: Consolidate duplicate `useStripeConnect` logging entry**

- **Bug:** Two identical TODO entries described adding `organizationId` context to the `useStripeConnect` error log (Phase 5B Round 1 and Round 2 sections).
- **Fix:** Removed the Round 2 duplicate; expanded the canonical Round 1 entry with the full structured log format (`{ organizationId, action: "stripe_onboarding", error: err }`).

**250e — `NITPICKS_TODOS.md` / `EDGE_CASES_TODOS.md`: Defer remaining nitpicks**

- Added `tierPriceCents` rename to `NITPICKS_TODOS.md` (misleading variable name — holds dollar string not cents integer).
- Moved `Linking.canOpenURL` guard to `EDGE_CASES_TODOS.md` #57 (graceful degradation edge case, not a nitpick).

---

### 251.PR Review — Heading levels, `canOpenURL` guard, nitpick deferrals (Feb 26, 2026)

**251a — `FEB_2026_FIXES.md`: Promote duplicate `### Fixes Applied` / `### Deferred Items` to `####`**

- **Bug:** Four H3 subsection headings titled "Fixes Applied" and "Deferred Items" (under Fix #246 and Fix #247) were identical, causing MD024 duplicate-heading lint warnings.
- **Fix:** Changed all four occurrences from `### ` to `#### ` so they are proper H4 subheadings scoped beneath their parent H2/H3 fix entries.

**251b — `useStripeConnect.ts`: Implement `Linking.canOpenURL` guard before `openURL`**

- **File:** `apps/mobile/hooks/useStripeConnect.ts`
- **Previously:** Deferred to EDGE_CASES_TODOS.md #57. Promoted to inline fix after explicit reviewer request.
- **Bug:** After URL validation, `Linking.openURL(data.url)` was called unconditionally. On devices where no handler is registered for the URL scheme, `openURL` throws an unhandled error outside the existing `try/catch`.
- **Fix:** Added `if (!(await Linking.canOpenURL(data.url))) { throw new Error("This device cannot open the Stripe URL."); }` immediately before `Linking.openURL`. The `canOpenURL` check is already inside the existing `try/catch`, so any failure surfaces cleanly through `setOnboardError`.
- **EDGE_CASES_TODOS.md #57** marked as implemented.

#### Deferred Items

- Unused `Image` import in `OrgSendTicketsCard.tsx` → `NITPICKS_TODOS.md`
- Sort tiers by `order_index` before `chosenTier` selection → `NITPICKS_TODOS.md`

---

### 252.Critical: Express accounts cannot use `account_update` AccountLinks (Feb 26, 2026)

- **Files:** `apps/web/app/lib/stripe/connect.ts`, `apps/web/app/api/stripe/connect/onboard/route.ts`
- **Severity:** Critical — broke the "Manage Stripe Account" button for every fully-connected organization.
- **Root cause:** Fix #246f introduced `"account_update"` as the AccountLink `type` for fully-connected accounts. However, Stripe's API explicitly restricts `account_update` AccountLinks to **Custom accounts only**. All accounts in this project are created as `type: "express"` (see `createExpressAccount`). Calling `stripe.accountLinks.create({ type: "account_update" })` on an Express account throws a `StripeInvalidRequestError`, making the onboard route fail for any organization that has completed setup.
- **Correct approach for Express accounts:** Use `stripe.accounts.createLoginLink(accountId)`, which generates a short-lived URL redirecting the account holder to their Stripe Express Dashboard. This is the Stripe-documented path for Express account management.
- **Fix:**
  - `connect.ts`: Removed the `type` parameter from `createAccountLink` (hardcoded to `"account_onboarding"` — the only valid type for Express accounts). Added a new `createExpressDashboardLoginLink(accountId)` helper that calls `stripe.accounts.createLoginLink`. Updated JSDoc to document the Express/Custom distinction explicitly.
  - `onboard/route.ts`: When `charges_enabled && payouts_enabled`, now calls `createExpressDashboardLoginLink` and returns its URL directly (no return URL needed — the Express Dashboard manages its own navigation). For incomplete accounts, still calls `createAccountLink` with `"account_onboarding"`.

---

### 253.Task 2D-v1: Create Event Form UX Enhancements (Feb 26, 2026)

Extensions to Task 2D (Event Management CRUD). See `docs/prompts/prompts_phases.md` 2D-v1.

- **Image upload:** `expo-image-picker` with `allowsEditing: true`, `aspect: [3, 4]`; `expo-image-manipulator` resize to 600×800, JPEG compress 0.8. Supported types per web: JPEG, JPG, PNG, WEBP, GIF. Upload after event create via `POST /api/upload-image`, then `PATCH /api/events` with `image_url`.
- **URL slug:** Auto-generated from event name via `generateSlug` from `@project-flame/lib`. Slug field is read-only/display-only.
- **Date/time picker:** `@react-native-community/datetimepicker` with `timeZoneOffsetInMinutes: -300` (Ecuador). `DateTimePickerField` component for event start/end and tier sales_start/sales_end. Ecuador timezone conversion via `ecuadorLocalToUtc` / `utcToEcuadorLocal` from `@project-flame/lib`.
- **Event Details tab flow:** Button changed from "Create Event" to "Next Step"; switches to Ticket Tiers tab. "Create Event" button added to Ticket Tiers tab.
- **iOS keyboard Done button:** `InputAccessoryView` with nativeID `numericKeyboardDone` for numeric fields; `KeyboardDoneBar` component. Applied to quantity, price, and stage fields in create-event forms.
- **`packages/lib`:** Extracted `generateSlug` to `packages/lib/src/utils/slug.ts` with tests.
- **`lib/api.ts`:** Added `apiUploadFormData` for FormData file uploads.

**Web source parity:** `CreateEventForm.tsx` (generateSlug, resizeImageTo3x4, datetime-local), `upload-image/route.ts` (MIME types, 1MB limit).

---

### 254.PR Review: KeyboardDoneBar, apiUploadFormData, Expo SDK 54 deps (Feb 26, 2026)

- **KeyboardDoneBar:** `InputAccessoryView` is iOS-only; added `Platform.OS !== "ios"` guard to return `null` on non-iOS (Android, web). Keeps `NUMERIC_KEYBOARD_DONE_ID` exported and `Keyboard.dismiss()` on Done press unchanged.
- **apiUploadFormData:** Wrapped `fetch` in try/catch; on network failure rethrows `ApiError` with status `0` and message `"Network request failed for ${endpoint}. Is the web server running and reachable?"` to match `apiClient` error shape for callers.
- **package.json:** Updated Expo SDK 54–compatible versions: `@react-native-community/datetimepicker` ^8.6.0 → ^8.4.4; `expo-image-manipulator` ^55.0.9 → ~14.0.8; `expo-image-picker` ^55.0.9 → ~17.0.10.

- **create-event.tsx (Fix #254b):** FormData.append for file upload used `{ uri, name, type }` — valid in React Native but not in the TS lib's FormData overloads. Added `as unknown as Blob` type assertion so it type-checks while preserving correct runtime behavior.

---

### 255.PR Review: Create Event UTC Validation, DateTimePicker Android, ImagePicker, apiUploadFormData, DateTime Constraints (Feb 26, 2026)

Per `docs/prompts/prompts_phases.md` triage. Standard bugs fixed; nitpick deferred to NITPICKS_TODOS.md.

- **UTC validation (create-event.tsx):** Added validation after each `ecuadorLocalToUtc` call. If `startsAtUtc` or `endsAtUtc` is empty, show Alert and abort before API call. For `ticketTiersForApi`, validate each tier's `sales_start`/`sales_end`; if any conversion fails, show tier name in error and abort.
- **DateTimePicker Android two-step (DateTimePickerField.tsx):** `mode="datetime"` is unsupported on Android. Implemented two-step flow: on Android, use `DateTimePickerAndroid.open` with `mode: "date"` first; on date confirm, open `mode: "time"` with the selected date; merge and call `onChange`. iOS branch unchanged (Modal + mode="datetime").
- **ImagePicker error handling (EventDetailsTab.tsx):** Wrapped `handlePickImage` in top-level try/catch. On any thrown error, log via `console.error` and show `Alert.alert` with a friendly message. Permission and result early-returns remain inside the try block.
- **apiUploadFormData null guard (lib/api.ts):** When `response.ok` is true but `data` is null/undefined (unparseable or empty JSON), now throws `ApiError` with status and message `"Empty or unparseable response body"` instead of returning `null as T`. Prevents callers from destructuring `{ url }` and getting TypeError.
- **package.json datetimepicker version:** Changed `^8.4.4` to `~8.4.4` for patch-only versioning aligned with Expo SDK 54.
- **End date minimumDate (EventDetailsTab.tsx):** End DateTimePickerField now uses `form.starts_at` (converted to Date) as `minimumDate` when present, so end cannot be selected before start.
- **Sales end minimumDate (TicketTiersTab.tsx):** salesEnd DateTimePickerField now receives `minimumDate={salesStart ? new Date(ecuadorLocalToUtc(salesStart)) : undefined}` so sales end cannot be before sales start.
- **MAX_FILE_SIZE pre-resize check removed (EventDetailsTab.tsx):** The 1MB check ran on pre-resize `asset.fileSize`; mobile camera photos (3–15 MB) were rejected even though post-resize (600×800 JPEG 0.8) is well under 1MB. Removed the pre-resize gate; resize runs first, server enforces actual limit.
- **Deferred (NITPICKS_TODOS.md):** Structured error logging in create-event image upload catch (userId, eventId in log) — deferred as nitpick.

---

### 256.Ticket Tiers: Hide Quantity When Use Price Stages; Web Parity (Feb 26, 2026)

Per Phase 5 PR review and web source-of-truth (`CreateEventForm.tsx`).

- **UI:** When "Use Price Stages" is checked, the quantity field is now hidden (matching web). On web, `{!tier.useStages && (` wraps both price and quantity — when stages are enabled, both are hidden; quantity is derived from the sum of stage quantities.
- **Logic:** When `usePriceStages` is true, `quantity_total` is now derived from `stages.reduce((sum, s) => sum + s.quantity, 0)` at save time instead of requiring the user to enter a tier-level quantity. Removed the "stage quantities must equal tier quantity" validation (redundant when quantity is derived).
- **Validation parity:** Mobile already had tier name, sales dates, per_user_limit (1–50), price (when !usePriceStages), at least one stage (when usePriceStages), stage name/price/quantity. (30-min-before-event validation removed in Fix #257.)

---

### 257.Create Event: Copy Event Start to Sale End; Remove 30-Min Validation (Feb 26, 2026)

Per user request — simplify ticket sales UX.

- **Copy event date to sale end:** When the user selects the event start date in Event Details, it is now copied to the ticket tier "Sale end date" as a convenience default. `TicketTiersTab` uses a `useEffect` that runs when `eventStartsAt` changes: `setSalesEnd((prev) => prev || eventStartsAt)`.
- **Remove 30-min validation:** Removed the validation that ticket sales must end at least 30 minutes before the event starts. Organizers can now set sale end to match event start (or any time).
- **Note text:** Updated the Note in `TicketTiersTab` to remove the 30-minute requirement.
- **CRUCIAL IOS → WEB todo:** Added `docs/todos/CRUCIAL_IOS_TO_WEB_TODOS.md` with a task for the **web** codebase to mirror the new mobile behavior: (1) Remove the 30-minute sale-end validation in `apps/web/app/components/forms/CreateEventForm.tsx` (see `validateFormData` / helper text); (2) Optionally add event-start-to-sale-end default for UX parity. Readers can reference `docs/todos/CRUCIAL_IOS_TO_WEB_TODOS.md` and `CreateEventForm.tsx` for the exact action items.

---

### 258.Create Event: Explicit Ticket Tiers Payload for Stages (Feb 26, 2026)

- **Issue:** When adding price stages and saving a tier, stages were not being persisted. The payload construction relied on object spread, which may have dropped or mis-serialized nested `stages` in some cases.
- **Fix:** Replaced the spread-based `ticketTiersForApi` mapping with an explicit construction that ensures each tier field (including `useStages` and `stages`) is correctly passed to the API. When `useStages` is true and `stages` exists with length > 0, `stages` is explicitly included in the payload. Matches web `formattedTicketTiers` pattern: explicit field mapping with stages preserved for staged tiers.

---

### 259.Create Event: Mobile Ticket Tiers Match Web — No Save Tier (Feb 26, 2026)

- **Goal:** Align mobile Create Event flow with web: inline tier editing, single Create Event submit.
- **Changes:**
  - **Remove Save Tier:** Removed the "Add Tier" form + "Save Tier" button. Tiers are now added inline and edited in place, like web.
  - **Add Tier button:** Adds a new tier with defaults (`Tier N`, 50 qty, $0, etc.) to the list immediately.
  - **Editable tier cards:** New `EditableTierCard` component — each tier is an editable card with name, quantity/price (or stages), sale dates, per user limit, Use Price Stages toggle. Changes update parent state via `onUpdateTier`.
  - **Default tier:** Screen starts with one "General Admission" tier (matching web initial state).
  - **Create Event:** Single submit at the bottom; validation runs before API call (tier name, dates, quantity/stages).
- **Parent updates:** `handleAddTier()` now takes no arg; `handleUpdateTier(index, tier)` added; success reset restores one default tier.

### 260.Create Event Button Disabled Until Form Valid (Feb 26, 2026)

- **Issue:** Create Event button was only disabled during `isCreating`; users could tap it with incomplete event details or tiers, leading to validation errors on submit. Web disables the submit button until required fields are filled.
- **Fix:** Added `isCreateEventDisabled` computed in `create-event.tsx` (event: name, city, venue, starts_at, ends_at; tiers: at least one, each with name, sales_start, sales_end, and quantity_total ≥ 1 or stages when `useStages`). Passed to `TicketTiersTab`; button uses `disabled={isCreating || isCreateEventDisabled}` and `opacity-60` when disabled. Behavior matches web `apps/web/app/components/forms/CreateEventForm.tsx` — see its submit-button disabled logic and `validateFormData` for parity verification.

### 261.Create Event: No Default Stages; Per User Limit Default 1 (Feb 26, 2026)

- **Issue:** (1) Enabling "Use Price Stages" created 2 default stages (Early Bird, Standard) that could not be edited on mobile (StageCard is display-only). (2) Default `per_user_limit` was 4; user wanted 1 to match prior mobile behavior.
- **Fix:** (1) `EditableTierCard.handleUseStagesToggle`: when enabling useStages, now sets `stages: []` instead of 2 pre-populated stages. User adds stages explicitly via "Add Stage" with full control over name, price, quantity. (2) Set `per_user_limit: 1` for initial tier, `handleAddTier`, and success reset in `create-event.tsx`.

### 262.Events API: Remove 30-Minute Sales-End-Before-Event Validation (Feb 26, 2026)

- **Issue:** Mobile create event failed with "Ticket sales must end at least 30 minutes before the event starts" despite mobile copying event start to sale end (per fix #257). The server-side validation in `POST /api/events` blocked this.
- **Fix:** Removed the 30-minute validation block from `apps/web/app/api/events/route.ts`. Organizers can now set sale end to match event start (or any time before/after). Aligns API with mobile UX; web CreateEventForm and ticket-tiers API still have client-side/route validation — see `docs/todos/CRUCIAL_IOS_TO_WEB_TODOS.md` for remaining web updates.

### 263.Create Event: Loading Spinner Until Success (Image Upload Phase) (Feb 26, 2026)

- **Issue:** When creating an event with an image, the loading spinner disappeared as soon as the event creation API returned, then 1–2 seconds passed (image upload) with no feedback before the success alert. Users could think the action failed. Web uses `isUploadingImage` to keep the button in loading state through the image upload phase.
- **Fix:** Added `isUploadingImage` state in `create-event.tsx`. Set true when starting the deferred image upload (after event creation succeeds), set false in a finally block. Pass `isCreating={createEvent.isPending || isUploadingImage}` to `TicketTiersTab` so the spinner remains visible until the success alert. Matches web pattern from `CreateEventForm.tsx`.

---

### 264.Create Event: Image Upload Error Handling (Feb 26, 2026)

- **Issue:** The image-upload catch block in `create-event.tsx` swallowed errors with `console.warn`, causing the UI to reset and claim full success despite a missing image.
- **Fix:** (1) Log errors with structured context (`action`, `userId`, `eventId`, `err`) via `console.error`; (2) Surface user-facing `Alert.alert` when upload fails; (3) Only show success alert and reset form when both event creation and image upload succeed. On partial failure, show "Image Upload Failed" alert and do not reset.

### 265.EditableTierCard: Local Price Input State (Feb 26, 2026)

- **Issue:** Price input was forced to `(tier.price_cents / 100).toFixed(2)` each keystroke, causing awkward reformatting while typing.
- **Fix:** Added local `priceText` state in `EditableTierCard`; bind `FormInput.value` to `priceText`, update on `onChangeText`, and persist to `tier.price_cents` on blur via `flushPriceToTier`. Added `onBlur` prop to `FormInput`.

### 266.TicketTiersTab: Stable Tier IDs for Keys and Mutations (Feb 26, 2026)

- **Issue:** Tier list used array indices for keys and comparisons, causing state rebind after deletes.
- **Fix:** Added `id` (optional) to `CreateEventTierInput`; `makeTierId()` generates stable ids. `handleAddTier` and `makeDefaultTier` assign ids. `tiers.map` uses `key={tier.id ?? "tier-${index}"}`. `handleUpdateTier` and `handleRemoveTier` now use `tierId` instead of index. API payload excludes `id`.

### 267.Create Event: Per-Tier sales_start < sales_end Validation (Feb 26, 2026)

- **Issue:** The `sales_end <= sales_start` validation was dropped during refactor. Users could submit and receive a confusing API 400 instead of a client-side alert.
- **Fix:** Added validation in `handleSubmit` and `isCreateEventDisabled`: sale end must be after sale start for each tier. Matches web `CreateEventForm.tsx` line 689.

### 268.Create Event: Extract makeDefaultTier Factory (Feb 26, 2026)

- **Issue:** Default tier object was duplicated in `useState` initializer and success-reset callback, risking silent divergence.
- **Fix:** Extracted `makeDefaultTier()` factory and `makeTierId()` helper. Both call sites now use `makeDefaultTier()`.

---

## PR Review Fixes (Feb 26, 2026 — Create Event Phase 5)

### 269.Create Event: Falsy Image Upload URL Treated as Failure (Feb 26, 2026)

- **Issue:** When `apiUploadFormData` returned a null/undefined/empty `url`, the handler silently skipped `apiPatch` and proceeded as success, leaving the UI to report success despite no image being saved.
- **Fix:** Added explicit check: if `!url`, throw `new Error("Image upload failed: no URL returned")`. The existing catch block then sets `imageUploadSucceeded = false` and shows the "Image Upload Failed" alert.

### 270.Create Event: Structured Error Log in Main Catch (Feb 26, 2026)

- **Issue:** The main submit catch block showed `Alert.alert` without structured logging, making debugging difficult.
- **Fix:** Added `console.error("[create-event] createEvent failed", { userId, eventId, action: "createEvent", err })` before `Alert.alert`. Uses `err.stack ?? err.message` for Error instances. `eventId` is undefined when create fails (error occurs during `mutateAsync`).

### 271.useCreateEvent: Strip Client-Only `id` from Payload (Feb 26, 2026)

- **Issue:** `CreateEventTierInput.id` is a client-only field for React keys; the web API schema does not expect it. Sending it could cause schema mismatches or confusion.
- **Fix:** In `mutationFn`, map `ticket_tiers` to omit `id` before posting: `ticket_tiers.map(({ id: _id, ...tier }) => tier)`. Ensures server-allowed fields only are sent.

### 272.Create Event: Re-Entry Guard for handleSubmit (Feb 26, 2026)

- **Issue:** Double-tap on Create Event could trigger duplicate submissions (two events created).
- **Fix:** Added `isSubmittingRef`; check at top of `handleSubmit` and return early if already true; set to true immediately before `createEvent.mutateAsync`; clear in `finally` block.

### 273.Header: Remove Invalid `router.dismissAll()` on Logo Tap (Feb 26, 2026)

- **Issue:** Tapping the Flame logo header from a pushed stack screen (e.g., event detail) triggered `router.dismissAll()`, which dispatches a `POP_TO_TOP` action. Because the event detail screen is a regular pushed screen (not a modal), no navigator could handle the action, producing a dev-mode console error: "The action 'POP_TO_TOP' was not handled by any navigator."
- **Fix:** Replaced `router.dismissAll(); router.replace("/")` with `router.replace("/(tabs)")` in `apps/mobile/components/home/Header.tsx`. This correctly navigates back to the home tab root without attempting a modal dismiss.

---

## Phase 5B: Organizer Dashboard Screen Wiring (Feb 27, 2026)

### 274.Org Dashboard: Wire Real Data (Feb 27, 2026)

- **Issue:** `org-dashboard.tsx` and `OrgStatsSection` used mock data (`orgEvents`, `orgDashboardStats` from `data/mock`). OrgEventCard used mock `OrgEvent` type.
- **Fix (per Task 2A, prompts_phases.md):**
  1. **org-dashboard.tsx:** Replaced mock `orgEvents` with `useOrgEvents()`. Added loading, error, empty states and pull-to-refresh (`RefreshControl`). Used `separateEventsByDate()` from `@project-flame/lib` for current/past split; renders current events only in main list. Wired event card press to `router.push(/org-event-detail?id=${event.id})`. Added search filter via `TicketSearchBar` value/onChangeText — filters by event name. Retry button on error state.
  2. **OrgStatsSection:** Replaced mock `orgDashboardStats` with real stats from `useOrgEvents()`: `totalEvents = events.length`, `totalRevenueCents` = sum over all events of (sum over tiers of `quantity_sold * price_cents`). Component now accepts `totalEvents`, `totalRevenueCents`, `onScanPress` props. Uses `formatCentsAsPrice` from `@project-flame/lib`.
  3. **OrgEventCard:** Updated to use `OrgEventCardData` display shape (mapped from useOrgEvents `OrgEvent`). Uses `formatCentsAsPrice` from `@project-flame/lib`. Removed mock `OrgEvent` import.
- **Web source references:** `apps/web/app/api/organizer/data/route.ts`, `apps/web/app/components/organizer/DashboardView.tsx`.
- **Query parity:** Mobile uses direct Supabase via `useOrgEvents` (same as events-management, org-event-detail). Web uses GET `/api/organizer/data` which enriches events with `totalRevenue`, `totalAttendees` from server-side purchases. Mobile computes stats client-side from `ticket_tiers` (quantity_sold, price_cents) — revenue is gross ticket sales approximation; exact organizer net would require web API. Deferred to `EDGE_CASES_TODOS.md` if exact parity needed.
- **Calculation parity:** `formatCentsAsPrice` from `@project-flame/lib` used throughout. Cents-to-display conversion consistent.
- **Scanner:** QR Scanner button exists; camera integration deferred to Phase 5B per project-flame-master.mdc.

### 276.Events Management & RSVP: Current vs Past, Read-Only Past, RSVP Events (Feb 27, 2026)

- **Issue:** (1) Events Management mixed current and past events in one list; (2) Past events were editable (should be view-only); (3) RSVP Management showed only past events (events with RSVPs), not upcoming RSVP-required events.
- **Fix:**
  1. **Events Management:** Use `separateEventsByDate()`; render "Current & upcoming events" and "Past events" as separate sections in `EventsListView`. Past events pass `readOnly={true}` to `EditEventDetailsTab` and `EditTiersTab`.
  2. **Past event read-only:** `EditEventDetailsTab` and `EditTiersTab` accept `readOnly` prop. When true: inputs display-only (no TextInput), Save button hidden, Add Tier form hidden, Delete tier button hidden. Added "View only (past event)" badge in header.
  3. **RSVP Management:** Match web `RsvpsView` — filter to `requires_rsvp === true` and `organization_id`, not "events that have RSVPs". Added `useOrgData` for org scope. Now shows both current and upcoming RSVP-required events (including those with 0 pending).
- **Files:** `events-management.tsx`, `EventsListView.tsx`, `EditEventDetailsTab.tsx`, `EditTiersTab.tsx`, `useRsvpManagement.ts`

### 275.ticket_stages RLS: Fix auth.uid() for Clerk — Organizer Events Load (Feb 27, 2026)

- **Issue:** Org Dashboard and Events Management showed "Failed to load events. Please try again." RSVP Management loaded (past events) because it queries only `events` + `rsvps`; useOrgEvents queries `events` with nested `ticket_tiers` and `ticket_stages`.
- **Root cause:** `ticket_stages` RLS policies ("Organization members can manage ticket stages", "Users can view ticket stages for accessible events") used `auth.uid()`, which fails with Clerk JWTs — Clerk `sub` is a string like `user_abc123`, not a UUID; casting raises 22P02.
- **Fix:** Migration `20260227182604_fix_ticket_stages_rls_clerk.sql` — replaced `auth.uid()` with `get_user_organizations()` (Clerk-compatible). Applied via Supabase MCP (user-supabase-all-flame).
- **Files:** `supabase/migrations/20260227182604_fix_ticket_stages_rls_clerk.sql`

### 277.RefreshControl: Visible spinner on pull-to-refresh (Feb 27, 2026)

- **Issue:** RSVP Detail (and RSVP Management) showed an empty gap when pulling down to refresh — no visible loading spinner where one was expected. Native iOS `RefreshControl` spinner sometimes fails to render (known RN issue).
- **Fix:**
  1. Changed `tintColor` from `#FF0000` to `#F9FBFE` (white) on RSVP Detail and RSVP Management for better visibility on dark background; matches org-dashboard.
  2. Added custom refresh overlay on RSVP Detail: when `isRefetching` is true, display an `ActivityIndicator` in a fixed position below the header as a fallback for when the native spinner doesn't show.
- **Files:** `apps/mobile/app/rsvp-detail.tsx`, `apps/mobile/app/(tabs)/rsvp-management.tsx`

### 278.ticket_stages RLS: Add FOR clause to prevent unintended INSERTs (Feb 27, 2026)

- **Issue:** The policy "Organization members can manage ticket stages" had no FOR clause, allowing unintended INSERTs by clients. Only UPDATE, DELETE, SELECT should be permitted for org members.
- **Fix:** Migration `20260227202927_ticket_stages_policy_for_clause.sql` — DROP the all-command policy and replace with three policies: `FOR SELECT`, `FOR UPDATE`, `FOR DELETE` (PostgreSQL requires one policy per command). Applied via Supabase MCP; local file renamed to match remote version `20260227202927`.
- **Files:** `supabase/migrations/20260227202927_ticket_stages_policy_for_clause.sql`

### 279.Org screens: Show loading while useOrgData is resolving (Feb 27, 2026)

- **Issue:** `useOrgEvents` and `useRsvpEvents` depend on `orgData?.organizationId` for their `enabled` condition. While `useOrgData` is still loading, these queries are disabled, so `isLoading` is false (React Query v5: disabled queries don't fetch). Consumers fell through to "No events" / "No events with RSVPs yet" before org data arrived — incorrect UX.
- **Fix:** Match `PayoutsSettingsTab` pattern: add `useOrgData()` and destructure `isLoading: orgLoading`. Gate loading UI with `orgLoading || isLoading` in both `org-dashboard.tsx` and `rsvp-management.tsx`.
- **Files:** `apps/mobile/app/(tabs)/org-dashboard.tsx`, `apps/mobile/app/(tabs)/rsvp-management.tsx`

### 280.Migration parity: Restore local file for 20260225213536 (Feb 27, 2026)

- **Issue:** Remote had `20260225213536_fix_rsvp_users_rls_recursion` applied, but the local file was deleted during Fix #228 (content merged into 20260225212511). Local and remote migration lists were out of sync.
- **Fix:** Recreated `supabase/migrations/20260225213536_fix_rsvp_users_rls_recursion.sql` with the fix SQL (get_rsvp_user_ids, users policy, rsvps policies) for documentation parity. All operations are idempotent; the merged 20260225212511 already contains this content, so fresh deploys work either way.
- **Files:** `supabase/migrations/20260225213536_fix_rsvp_users_rls_recursion.sql`

### 281.org-dashboard: Stage-level revenue/attendees + OrgEvent type (Feb 27, 2026)

- **Issue:** `mapOrgEventToCardData` used a flat tier type and tier-level `quantity_sold * price_cents` only. When tiers have `ticket_stages`, revenue and attendees should use stage-level data (each stage can have different prices).
- **Fix:** Added `computeTierRevenueCents` and `computeTierAttendees` helpers that sum stage-level `(sold_quantity * price_cents)` / `sold_quantity` when `ticket_stages` present, else fall back to tier-level. Updated `mapOrgEventToCardData` to accept `OrgEvent` and use these helpers. Stats memo uses `computeTierRevenueCents` for consistency.
- **Files:** `apps/mobile/app/(tabs)/org-dashboard.tsx`

### 282.RLS: Add TO authenticated to users/rsvp policies (Feb 27, 2026)

- **Issue:** Policies "Org members can view RSVP requestor profiles" and the rsvps SELECT/UPDATE policies had no TO clause, applying to all roles (PUBLIC). Helper functions require authenticated JWT.
- **Fix:** Migration `20260227203747_rsvp_users_policies_to_authenticated.sql` — DROP and CREATE all three policies with `TO authenticated`. Also updated local `20260225213536` for fresh-deploy parity. Applied via MCP.
- **Files:** `supabase/migrations/20260227203747_rsvp_users_policies_to_authenticated.sql`, `supabase/migrations/20260225213536_fix_rsvp_users_rls_recursion.sql`

### 283.org-dashboard: Shared refresh handler with error handling (Feb 27, 2026)

- **Issue:** `onRefresh` and Retry button both called `refetch()` directly with no error handling or contextual logs.
- **Fix:** Added `handleRefresh(action: string)` async handler with try/catch, structured `console.error` including `action`, `userId`, and error. Both pull-to-refresh (`handleRefresh("pull_to_refresh")`) and Retry button (`handleRefresh("retry_button")`) use it. Query error state already surfaces failures to the existing error UI.
- **Files:** `apps/mobile/app/(tabs)/org-dashboard.tsx`

### 284.NITPICKS_TODOS: Reorder Round 3 before Round 4 (Feb 27, 2026)

- **Issue:** "Phase 5B Organizer Dashboard PR — Deferred Nitpicks Round 4 (Feb 27)" appeared before Round 3 (Feb 26) in the document.
- **Fix:** Reordered so Round 3 section precedes Round 4, preserving each block's content.
- **Files:** `docs/todos/NITPICKS_TODOS.md`

### 285.org-dashboard: useOrgData error/refresh parity (Feb 27, 2026)

- **Issue:** Screen only surfaced `useOrgEvents.error` and refreshed only `useOrgEvents.refetch`. Failures from `useOrgData` (org resolution, membership) were not shown, and retry did not re-fetch org data.
- **Fix:** Destructured `error: orgError`, `refetch: orgRefetch`, `isRefetching: orgRefetching` from `useOrgData()`. Error UI shows when `orgError || error`. `handleRefresh` calls both `orgRefetch()` and `refetch()` with try/catch and contextual logging (`userId`, `orgId`, `action`). Combined `isRefreshing = orgRefetching || isRefetching` for RefreshControl. Loading gate remains `orgLoading || isLoading`.
- **Files:** `apps/mobile/app/(tabs)/org-dashboard.tsx`

### 286.NITPICKS_TODOS: Resolve computeTierRevenueCents + spelling (Feb 27, 2026)

- **Issue:** TODO claimed "Extract computeTierRevenueCents" but the helper already exists in `org-dashboard.tsx` and is used by `mapOrgEventToCardData` and the stats memo. Document also mixed "centralized" and "centralises".
- **Fix:** Marked tier-revenue TODO as resolved with cross-reference. Standardized spelling to "centralized" (replaced "centralises").
- **Files:** `docs/todos/NITPICKS_TODOS.md`

### 287.org-dashboard: handleRefresh refetch error handling (Feb 27, 2026)

- **Issue:** TanStack Query v5 `refetch()` resolves on error; try/catch never caught failures. Also, org events refetch was called even when orgData/organizationId was absent.
- **Fix:** Check `result.error` after `await orgRefetch()` and `await refetch()` instead of try/catch. Guard second refetch: only run when `orgId = orgRes.data?.organizationId ?? orgData?.organizationId` is present; otherwise log and return.
- **Files:** `apps/mobile/app/(tabs)/org-dashboard.tsx`

### 288.NITPICKS_TODOS: MD049 emphasis + Pressable onRefresh (Feb 27, 2026)

- **Issue:** Asterisk-based `*Resolved:*` violated markdownlint MD049. TODO about replacing `onPress={() => refetch()}` with `onPress={onRefresh}` was stale — current code uses `handleRefresh("retry_button")` and memoized `onRefresh`.
- **Fix:** Changed `*Resolved:*` to `_Resolved:_`. Marked Pressable/onRefresh TODO as resolved with note on current implementation.
- **Files:** `docs/todos/NITPICKS_TODOS.md`

### 289. events-management: Gate loading on useOrgData (Fix #279 parity) (Feb 27, 2026)

- **Issue:** `events-management.tsx` uses `useOrgEvents()` but did not gate on `useOrgData()` loading state. As Fix #279 noted, `useOrgEvents` depends on `orgData?.organizationId` for `enabled`; while `useOrgData` is loading, disabled queries yield `isLoading: false`, causing a flash of "No events found."
- **Fix:** Added `useOrgData()` and `isLoading: orgLoading`. Updated loading gate to `orgLoading || isLoading`.
- **Files:** `apps/mobile/app/(tabs)/events-management.tsx`

### 290. Auth: useRequireAuth hook + protected routes + sign-in back flow (Mar 3, 2026)

- **Context:** Phase 5B Authentication Logic — complete remaining auth flows per `docs/prompts/prompts_phases.md`.
- **Web source:** `apps/web/app/lib/auth.ts` (`requireAuth`, `resolveDbUserFromClerkId`), `apps/web/middleware.ts` (protected route redirect via `auth.protect()`).
- **Changes:**
  1. **`useRequireAuth` hook** — Mirrors web's `requireAuth`. When not signed in, redirects via `router.replace("/sign-in")` (replace avoids back-loop: going "back" from sign-in would otherwise return to protected screen which redirects again). Exports `RequireAuthGate` wrapper component. File is `.tsx` (contains JSX).
  2. **Tab bar** — My Tickets and History tabs stay visible for non-org users; when unauthenticated user taps them, `RequireAuthGate` redirects to sign-in. Tabs are not hidden.
  3. **Protected screens** — Added `RequireAuthGate` to: dashboard, history, settings, org-dashboard, create-event, events-management, rsvp-management, org-event-detail, rsvp-detail, ticket/[id], scanner.
  4. **SignInBackButton** — "Go Back" uses `router.replace("/(tabs)")` to always navigate to home. Prevents getting stuck when coming from protected tab (dashboard/history) and ensures consistent UX.
  5. **Sign-out flow** — Already correct in `PersonalSettingsTab`: `signOut()`, `queryClient.clear()`, `router.replace("/")`.
  6. **Session persistence** — Verified: `tokenCache` (expo-secure-store) + `ClerkLoaded` defer render until Clerk hydrates. Cold start restores auth state.
  7. **sync-current-user** — Skipped (web route is stub; JIT sync via `resolveDbUserFromClerkId` on first API call).
- **Phase 5 Parity Gate evidence:**
  - **Web source references:** `lib/auth.ts` (requireAuth, resolveDbUserFromClerkId), `middleware.ts` (isProtectedRoute, auth.protect). `api/auth/sync-current-user/route.ts` is explicitly a stub (returns userData but does not write to Supabase).
  - **API parity:** Mobile does not call auth-specific endpoints; auth is client-side via Clerk hooks. Authenticated API calls (e.g., `/api/holds/create`, `/api/purchase/validate-promo-code`, `/api/purchase/complete-hold-free`) use Bearer token via `lib/api.ts`. Web API routes call `resolveDbUserFromClerkId(userId)` server-side for JIT user sync — mobile's token is passed in Authorization header, and web middleware validates it. Confirmed: mobile and web share the same API contract; mobile never calls sync-current-user (web sign-in does not either).
  - **Auth/session parity:** `useRequireAuth` mirrors web's `requireAuth`: both gate protected content on `userId` / `isSignedIn`. Web uses server-side `auth()` in API routes and `auth.protect()` in middleware; mobile uses `useOptionalAuth().isSignedIn` + client-side redirect. Both rely on Clerk for session state. `useOptionalAuth` wraps Clerk's `useAuth` and returns `isConfigured` for graceful degradation when Clerk env is missing.
  - **Edge-case verification:** (1) **Cold start:** tokenCache restores session from expo-secure-store; ClerkLoaded defers render until hydrated — verified no flash of unauthenticated state. (2) **Token expiry:** Clerk SDK refreshes tokens; `apiClient` passes `getToken()` on each call. (3) **Sign-in back-flow:** SignInBackButton uses `router.replace("/(tabs)")` so "Go Back" always lands on home, avoiding return to protected screen. (4) **Protected-route back-loop:** `router.replace("/sign-in")` (not push) ensures back from sign-in does not re-enter protected route. (5) **SignInBackButton behavior:** Consistent navigation to tabs root regardless of entry path.
  - **Cross-platform behavior:** iOS and Android use same Clerk + expo-secure-store flow; web uses cookies. tokenCache + ClerkLoaded hydration verified on simulator. No platform-specific auth logic divergence.
- **Files:** `apps/mobile/hooks/useRequireAuth.tsx` (new), `apps/mobile/components/sign-in/SignInBackButton.tsx`, `apps/mobile/app/(tabs)/_layout.tsx`, `apps/mobile/app/(tabs)/dashboard.tsx`, `apps/mobile/app/(tabs)/history.tsx`, `apps/mobile/app/(tabs)/settings.tsx`, `apps/mobile/app/(tabs)/org-dashboard.tsx`, `apps/mobile/app/(tabs)/create-event.tsx`, `apps/mobile/app/(tabs)/events-management.tsx`, `apps/mobile/app/(tabs)/rsvp-management.tsx`, `apps/mobile/app/org-event-detail.tsx`, `apps/mobile/app/rsvp-detail.tsx`, `apps/mobile/app/ticket/[id].tsx`, `apps/mobile/app/scanner.tsx`

---
