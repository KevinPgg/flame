# March 2026 Fixes

## Phase 6: iOS App Polish Audit (Mar 3, 2026)

Full audit of the mobile app covering navigation consistency, loading states, pull-to-refresh unification, role-based UI, clickable item functionality, and general polish.

---

### 1. Home screen EventCards not tappable (Mar 3, 2026)

- **Issue:** `FeaturedEvents` and `UpcomingEvents` sections on Home don't pass `onEventPress` to `EventsSection`. Cards look tappable but do nothing.
- **Fix:** Pass `onEventPress` from `index.tsx` through section components to navigate to `/event/${event.id}`.
- **Files:** `apps/mobile/app/(tabs)/index.tsx`, `apps/mobile/components/home/FeaturedEvents.tsx`, `apps/mobile/components/home/UpcomingEvents.tsx`

### 2. Spotlight CTA does nothing (Mar 3, 2026)

- **Issue:** `SpotlightSection` renders a `SpotlightCard` but no `onPress` is passed from `index.tsx`.
- **Fix:** Pass `onPress` to navigate to the spotlight event's detail page.
- **Files:** `apps/mobile/app/(tabs)/index.tsx`

### 3. HeroCarousel taps navigate to events list, not event detail (Mar 3, 2026)

- **Issue:** `HeroCarousel` default `onEventPress` navigates to `/events` (the listing page) instead of the specific event's detail page.
- **Fix:** Pass `onEventPress` from `index.tsx` to navigate to `/event/${event.id}`.
- **Files:** `apps/mobile/app/(tabs)/index.tsx`

### 4. ExploreCategories pills not tappable (Mar 3, 2026)

- **Issue:** `CategoryPill` in `ExploreCategories` has no `onPress` — pills look tappable but do nothing.
- **Fix:** Pass `onPress` to navigate to `/events` (category filtering is in-memory on Events screen; deep-link category param deferred to edge cases).
- **Files:** `apps/mobile/components/home/ExploreCategories.tsx`

### 5. Footer links are TODO stubs (Mar 3, 2026)

- **Issue:** Footer section links and legal links have empty `onPress` handlers (`/* TODO: Navigate to link.href */`).
- **Fix:** Wire `Linking.openURL(link.href)` for links that have URLs; no-op for placeholder hrefs.
- **Files:** `apps/mobile/components/home/Footer.tsx`

### 6. MenuOverlay "Log Out" button does nothing (Mar 3, 2026) **[Canonical MenuOverlay sign-out]**

- **Issue:** MenuOverlay Log Out had a TODO comment and empty handler.
- **Fix:** Wire `signOut()` + `queryClient.clear()` + `router.replace("/(tabs)")` (matches PersonalSettingsTab pattern). Error handling with Alert on failure. Re-entrant guard (#36) prevents concurrent sign-out.
- **Files:** `apps/mobile/components/menu/MenuOverlay.tsx`

### 7. Settings shows Organization/Payouts tabs to non-org users (Mar 3, 2026)

- **Issue:** `SettingsTabs` always renders Personal, Organization, and Payouts tabs regardless of user role. Non-org users see org-only settings.
- **Fix:** Accept `isOrg` prop in `SettingsTabs`; filter tabs array to only show Organization and Payouts when `isOrg === true`. Call site: `isOrg={role === "org"}` from `useUserRole()`.
- **Files:** `apps/mobile/components/settings/SettingsTabs.tsx`, `apps/mobile/app/(tabs)/settings.tsx`

### 8. Pull-to-refresh added to Home screen (Mar 3, 2026)

- **Issue:** Home screen fetches data but has no pull-to-refresh.
- **Fix:** Added `RefreshControl` with `refetch()` from `useAppEvents`.
- **Files:** `apps/mobile/app/(tabs)/index.tsx`

### 9. Pull-to-refresh added to Events listing (Mar 3, 2026)

- **Issue:** Events listing fetches data but has no pull-to-refresh.
- **Fix:** Added `RefreshControl` to the events screen body.
- **Files:** `apps/mobile/app/events.tsx`, `apps/mobile/components/events/EventsScreenBody.tsx`

### 10. Pull-to-refresh added to Event Detail (Mar 3, 2026)

- **Issue:** Event detail fetches data but has no pull-to-refresh.
- **Fix:** Added `RefreshControl` with `refetch()` from `useEventDetails`.
- **Files:** `apps/mobile/app/event/[id].tsx`

### 11. Pull-to-refresh added to My Tickets / Dashboard (Mar 3, 2026)

- **Issue:** Dashboard fetches tickets but has no pull-to-refresh.
- **Fix:** Added `RefreshControl` with `refetch()` from `useUserTickets`.
- **Files:** `apps/mobile/app/(tabs)/dashboard.tsx`

### 12. Pull-to-refresh added to History (Mar 3, 2026)

- **Issue:** History fetches tickets but has no pull-to-refresh.
- **Fix:** Added `RefreshControl` with `refetch()` from `useUserTickets`.
- **Files:** `apps/mobile/app/(tabs)/history.tsx`

### 13. Pull-to-refresh added to Ticket Detail (Mar 3, 2026)

- **Issue:** Ticket detail fetches data but has no pull-to-refresh.
- **Fix:** Added `RefreshControl` with `refetch()` from `useUserTickets`.
- **Files:** `apps/mobile/app/ticket/[id].tsx`

### 14. Pull-to-refresh added to Events Management (Mar 3, 2026)

- **Issue:** Events Management list view has no pull-to-refresh.
- **Fix:** Added `RefreshControl` with `refetch()` from `useOrgEvents`.
- **Files:** `apps/mobile/app/(tabs)/events-management.tsx`

### 15. Pull-to-refresh added to Org Event Detail (Mar 3, 2026)

- **Issue:** Org Event Detail has no pull-to-refresh.
- **Fix:** Added `RefreshControl` with `refetch()` from `useOrgEvents`.
- **Files:** `apps/mobile/app/org-event-detail.tsx`

### 16. Dashboard error state missing Retry button (Mar 3, 2026)

- **Issue:** Dashboard error state shows message but no way to retry.
- **Fix:** Added `refetch` from `useUserTickets` and a Retry button.
- **Files:** `apps/mobile/app/(tabs)/dashboard.tsx`

### 17. History error state missing Retry button (Mar 3, 2026)

- **Issue:** History error state shows message but no way to retry.
- **Fix:** Added `refetch` from `useUserTickets` and a Retry button.
- **Files:** `apps/mobile/app/(tabs)/history.tsx`

### 18. Events Management error state missing Retry button (Mar 3, 2026)

- **Issue:** Events Management error state shows message but no Retry.
- **Fix:** Added Retry button with `refetch()` from `useOrgEvents`.
- **Files:** `apps/mobile/app/(tabs)/events-management.tsx`

### 19. Org Event Detail: fetch error shown as "Event not found" (Mar 3, 2026)

- **Issue:** When `useOrgEvents` has an error, the screen shows "Event not found" instead of a fetch error message. Misleading to users.
- **Fix:** Check `error` from `useOrgEvents` separately; show fetch error with Retry before the not-found check.
- **Files:** `apps/mobile/app/org-event-detail.tsx`

### 20. PersonalSettingsTab: no error UI for failed profile load (Mar 3, 2026)

- **Issue:** If `useUserProfile` fails, `profile` is null and the form renders with "—" values. No indication of error, no retry.
- **Fix:** Added error state with Retry button using `useUserProfile().error` and `refetch()`.
- **Files:** `apps/mobile/components/settings/PersonalSettingsTab.tsx`

### 21. Create Event: no loading gate for useOrgData (Mar 3, 2026)

- **Issue:** Create Event form renders before `useOrgData` finishes loading. Submit validates org exists but form is briefly usable without org context.
- **Fix:** Added loading spinner while `orgData` is loading.
- **Files:** `apps/mobile/app/(tabs)/create-event.tsx`

### 22. TicketSearchBar: remove non-functional calendar/options buttons (Mar 3, 2026)

- **Issue:** Calendar and options filter buttons in `TicketSearchBar` have no `onPress` handlers — dead UI.
- **Fix:** Removed the buttons. Filtering can be re-added when backend supports date/category filtering.
- **Files:** `apps/mobile/components/dashboard/TicketSearchBar.tsx`

### 23. CalendarPicker: wire month navigation (Mar 3, 2026)

- **Issue:** CalendarPicker prev/next month buttons have no `onPress` handlers.
- **Fix:** Added `onMonthChange` callback prop; prev/next buttons adjust month/year.
- **Files:** `apps/mobile/components/events-management/CalendarPicker.tsx`

### 24. MenuOverlay: add sign-out functionality and error handling (Mar 3, 2026)

- **Cross-reference:** See #6 (canonical). Implemented `signOut()` + `queryClient.clear()` + `router.replace("/(tabs)")`, error handling with Alert, `isSigningOut` guard (#36). `organizerMenuItems` mock retained for rendering.
- **Files:** `apps/mobile/components/menu/MenuOverlay.tsx`

### 25. NotificationsOverlay: replace mock data with empty state (Mar 3, 2026)

- **Issue:** Notifications overlay displays fake notification cards from mock data. No real notifications backend exists.
- **Fix:** Replaced mock data with a "No notifications yet" empty state. Bell icon still opens the panel for future use.
- **Files:** `apps/mobile/components/notifications/NotificationsOverlay.tsx`

### 26. Home screen: add empty state for zero events (Mar 3, 2026)

- **Issue:** When there are no events, Home shows PartnerLogos, FAQ, Footer but no message indicating no events.
- **Fix:** Added "No events available" message when all event arrays are empty.
- **Files:** `apps/mobile/app/(tabs)/index.tsx`

### 27. OrgPromoterLinksCard: copy to clipboard instead of Alert (Mar 3, 2026)

- **Issue:** `LinkPill` shows promoter URL in `Alert.alert` — should copy to clipboard for usability.
- **Fix:** Use `expo-clipboard` to copy URL and show a brief toast/alert confirming copy.
- **Files:** `apps/mobile/components/org-dashboard/OrgPromoterLinksCard.tsx`

### 28. Bookmark button deferred (Mar 3, 2026)

- **Issue:** Events screen bookmark button is a placeholder (console.log only). Requires bookmark backend.
- **Deferred:** Added to `EDGE_CASES_TODOS.md`.

### 29. Pull-to-refresh: try/finally guard on all handleRefresh callbacks (Mar 3, 2026)

- **Issue:** All `handleRefresh` callbacks using `setRefreshing(true) → await refetch() → setRefreshing(false)` would leave the refresh spinner stuck if `refetch()` threw an error.
- **Fix:** Wrapped `await refetch()` in `try/finally` so `setRefreshing(false)` always runs regardless of success or failure. Applied to all 8 screens: Home, Dashboard, History, Events listing, Event Detail, Ticket Detail, Events Management, and Org Event Detail.
- **Files:** `apps/mobile/app/(tabs)/index.tsx`, `apps/mobile/app/(tabs)/dashboard.tsx`, `apps/mobile/app/(tabs)/history.tsx`, `apps/mobile/app/events.tsx`, `apps/mobile/app/event/[id].tsx`, `apps/mobile/app/ticket/[id].tsx`, `apps/mobile/app/(tabs)/events-management.tsx`, `apps/mobile/app/org-event-detail.tsx`

### 30. OrgPromoterLinksCard: add error handling to clipboard copy (Mar 3, 2026)

- **Issue:** `handleCopy` in `LinkPill` called `Clipboard.setStringAsync` without error handling; a failure would crash silently.
- **Fix:** Wrapped the clipboard call in try/catch — success shows the existing "Copied" alert, failure logs the error and shows a user-friendly "Copy failed" alert.
- **Files:** `apps/mobile/components/org-dashboard/OrgPromoterLinksCard.tsx`

### 31. MARCH_2026_FIXES.md entry #24: correct changelog description (Mar 3, 2026)

- **Issue:** Entry #24 incorrectly stated MenuOverlay was removed; it was actually updated with sign-out functionality.
- **Fix:** Corrected the entry to reflect that MenuOverlay was updated with `signOut()`, cache cleanup, and error handling, and that the `organizerMenuItems` mock import is retained.
- **Files:** `docs/fixes/MARCH_2026_FIXES.md`

### 32. Create Event: useOrgData error and loading states (Mar 3, 2026)

- **Issue:** Org fetch may fail but only `orgLoading` was checked; no error UI or retry; ActivityIndicator used hardcoded `#F9FBFE`.
- **Fix:** Added `isError`, `refetch` from `useOrgData`; early-render branch for `orgError` with generic message and Retry button; guard for missing `orgData?.organizationId`; replaced ActivityIndicator color with `colors["white-100"]`.
- **Files:** `apps/mobile/app/(tabs)/create-event.tsx`

### 33. Settings: clamp activeTab when role switches to non-org (Mar 3, 2026)

- **Issue:** When `isOrg` transitions to `false`, `activeTab` could remain "organization" or "payouts", causing org-only content to render for non-org users.
- **Fix:** Added `useEffect` watching `isOrg` and `activeTab`; when `isOrg` is false and `activeTab` is org-only, reset to `"personal"`.
- **Files:** `apps/mobile/app/(tabs)/settings.tsx`

### 34. Org Event Detail: generic error message and design tokens (Mar 3, 2026)

- **Issue:** Raw `eventsError.message` shown to users; hardcoded hex colors for ActivityIndicator and RefreshControl.
- **Fix:** Replaced error display with "Unable to load events. Please try again."; added contextual `console.error` in error branch; replaced `#F9FBFE` with `colors["white-100"]`.
- **Files:** `apps/mobile/app/org-event-detail.tsx`

### 35. Footer: openExternalLink helper with error handling (Mar 3, 2026)

- **Issue:** `Linking.openURL` called directly with `.catch(() => {})` — no user feedback on failure, no `canOpenURL` check.
- **Fix:** Added `openExternalLink` helper wrapping `Linking.canOpenURL` and `Linking.openURL` in try/catch; logs errors with URL context; shows user-facing Alert on failure. Replaced both call sites.
- **Files:** `apps/mobile/components/home/Footer.tsx`

### 36. MenuOverlay: re-entrant sign-out guard (Mar 3, 2026)

- **Issue:** Rapid taps on Log Out could trigger concurrent sign-out sequences.
- **Fix:** Added `isSigningOut` state; early-return when true; set before async work, reset in `finally`. Prevents multiple simultaneous sign-out flows.
- **Files:** `apps/mobile/components/menu/MenuOverlay.tsx`

### 37. Pull-to-refresh: design tokens for tintColor and ActivityIndicator (Mar 3, 2026)

- **Issue:** `RefreshControl` used hardcoded `#FF0000` (user screens) and `#F9FBFE` (org screens); `ActivityIndicator` used hardcoded `#F9FBFE` in create-event and events-management.
- **Fix:** Replaced with design tokens. _Superseded by #147 for RefreshControl: canonical tintColor is `#FFFFFF`._
- **Files:** `apps/mobile/app/(tabs)/index.tsx`, `apps/mobile/app/(tabs)/dashboard.tsx`, `apps/mobile/app/(tabs)/history.tsx`, `apps/mobile/app/event/[id].tsx`, `apps/mobile/app/ticket/[id].tsx`, `apps/mobile/components/events/EventsScreenBody.tsx`, `apps/mobile/app/org-event-detail.tsx`, `apps/mobile/app/(tabs)/events-management.tsx`, `apps/mobile/app/(tabs)/create-event.tsx`

### 38. Retry buttons: unified to call handleRefresh (Mar 3, 2026)

- **Issue:** Dashboard, History, Home, and Event Detail Retry buttons called `refetch()` directly, bypassing `handleRefresh` (divergent behavior, no refresh state).
- **Fix:** Updated Retry handlers to call `handleRefresh()` for consistent behavior and proper try/finally flow.
- **Files:** `apps/mobile/app/(tabs)/index.tsx`, `apps/mobile/app/(tabs)/dashboard.tsx`, `apps/mobile/app/(tabs)/history.tsx`, `apps/mobile/app/event/[id].tsx`, `apps/mobile/app/events.tsx`

### 39. Events Management and Org Event Detail: Retry calls handleRefresh (Mar 3, 2026)

- **Issue:** Retry Pressables in events-management and org-event-detail called `refetch()` directly, bypassing `handleRefresh` and the component's refreshing state.
- **Fix:** Updated Retry handlers to call `handleRefresh()` so the refreshing indicator is used and behavior matches other screens.
- **Files:** `apps/mobile/app/(tabs)/events-management.tsx`, `apps/mobile/app/org-event-detail.tsx`

### 40. Events Management: remove dead isRefetching (Mar 3, 2026)

- **Issue:** `isRefetching` destructured from `useOrgEvents()` but never used; refresh state managed by local `refreshing` useState. Dead code.
- **Fix:** Removed `isRefetching` from destructuring.
- **Files:** `apps/mobile/app/(tabs)/events-management.tsx`

### 41. Phase 6 UX reference consolidated into changelog (Mar 3, 2026)

- **Issue:** PR requested documentation for Phase 6 UX fixes (#1–7, #25, #27). Per workflow rules, we must not create new MD files — update existing docs and note changelog.
- **Fix:** Added Phase 6 UX Fixes Reference section to this changelog (see appendix below). Added Phase 6 entry to `docs/project-migrations/IOS_MIGRATION.md` referencing this file. Did not create a new doc file.
- **Files:** `docs/fixes/MARCH_2026_FIXES.md`, `docs/project-migrations/IOS_MIGRATION.md`

### 42. Documentation workflow rule clarified (Mar 3, 2026)

- **Issue:** Rule "do not create new scratchpad files" did not explicitly require updating existing docs instead of creating new ones.
- **Fix:** Updated `project-flame-master.mdc` Phase 2: "Prefer updating existing docs over creating new ones. Do NOT create new MD files for feature summaries, polish lists, or reference materials — consolidate into existing docs." Updated Phase 3 Completion Gate: "No new MD files created — updates applied to existing docs only?" Updated `prompts_phases.md` Phase 6 PR Review to include this.
- **Files:** `.cursor/rules/project-flame-master.mdc`, `docs/prompts/prompts_phases.md`

### 43. handleRefresh: catch block with contextual logging (Mar 3, 2026)

- **Issue:** handleRefresh used try/finally but swallowed refetch errors; no logging for debugging/monitoring.
- **Fix:** Added explicit catch block in handleRefresh for index.tsx and org-event-detail.tsx; log with contextual fields (action, userId/eventId, err). Replaced org-event-detail Ionicons alert icon hardcoded `rgba(255,255,255,0.3)` with `colors["white-30"]`.
- **Files:** `apps/mobile/app/(tabs)/index.tsx`, `apps/mobile/app/org-event-detail.tsx`

### 44. Settings: render-time effectiveTab guard (Mar 3, 2026)

- **Issue:** useEffect only resets activeTab after render; one-frame org panel exposure when isOrg switches to false.
- **Fix:** Derived `effectiveTab` at render time: if `!isOrg` and activeTab is org-only, use "personal" else activeTab. Pass effectiveTab to renderTab. Kept useEffect for state correction.
- **Files:** `apps/mobile/app/(tabs)/settings.tsx`

### 45. events.tsx handleRefresh: re-entrant guard (Mar 3, 2026)

- **Issue:** handleRefresh could start overlapping refetch() calls on rapid pull-to-refresh.
- **Fix:** Added `isRefreshingRef` (useRef); early-return when true; set before async work, clear in finally.
- **Files:** `apps/mobile/app/events.tsx`

### 46. project-flame-master: align checklist with doc guidance (Mar 3, 2026)

- **Issue:** Checklist "No new MD files created" contradicted guidance that permits new docs when no suitable file exists.
- **Fix:** Updated checklist to "No new MD files created unless no suitable existing document exists — new docs must be justified and approved?" Added "justified and approved" to Phase 2 guidance for consistency.
- **Files:** `.cursor/rules/project-flame-master.mdc`

### 47. NITPICKS_TODOS: add reproduction steps to deferred items (Mar 3, 2026)

- **Issue:** Deferred nitpick list items lacked explicit reproduction steps for future triage.
- **Fix:** Added structured repro blocks (preconditions, actions, observed, expected) to each Phase 6 deferred item. Added SpotlightSection inline handler nitpick with repro.
- **Files:** `docs/todos/NITPICKS_TODOS.md`

### 48. handleRefresh: handle TanStack Query result.error; hasEvents boolean; EDGE_CASES_TODOS casing (Mar 3, 2026)

- **Issue:** TanStack Query refetch returns result with error field instead of throwing; handleRefresh catch never ran on failure. hasEvents could be object when spotlightEvent was truthy. MARCH_2026_FIXES referenced EDGE_CASES_TODOS.md (uppercase).
- **Fix:** Check `result.error` after refetch and log if present; keep catch for thrown errors. Coerced `spotlightEvent` with `!!` so hasEvents is strictly boolean. Normalized MARCH_2026_FIXES reference to `EDGE_CASES_TODOS.md`.
- **Files:** `apps/mobile/app/(tabs)/index.tsx`, `docs/fixes/MARCH_2026_FIXES.md`

### 49. RefreshControl Android colors; handleRefresh user feedback; MenuOverlay docs (Mar 3, 2026)

- **Issue:** RefreshControl only set tintColor (iOS); Android needs `colors`. handleRefresh logged errors but did not surface to user. MenuOverlay had duplicate doc entries (#6, #24).
- **Fix:** Added `colors` prop for Android; handleRefresh alerts; consolidated MenuOverlay. _Superseded by #147 for RefreshControl: canonical tintColor is `#FFFFFF`; use `colors={["#FFFFFF"]}` for Android if needed._
- **Files:** `apps/mobile/app/(tabs)/index.tsx`, `docs/fixes/MARCH_2026_FIXES.md`

### 50. handleRefresh alert text; SettingsTabs isOrg docs; navigateToEvent extraction (Mar 3, 2026)

- **Issue:** handleRefresh alert always said "Showing cached data" even when no cached data. MARCH_2026_FIXES #7 said "role prop" but code uses `isOrg`. Duplicate route construction in handleEventPress and SpotlightSection inline.
- **Fix:** handleRefresh uses `hasCachedData` to choose alert: "No data available. Please try again." vs "Showing cached data. Pull to refresh again." Updated #7 and appendix to document `isOrg` consistently. Extracted `navigateToEvent(id)`; handleEventPress and SpotlightSection both use it.
- **Files:** `apps/mobile/app/(tabs)/index.tsx`, `docs/fixes/MARCH_2026_FIXES.md`

### 51. OrgEventDetail: move eventsError log into useEffect (Mar 3, 2026)

- **Issue:** console.error in the eventsError render block ran on every re-render while error was truthy, flooding logs.
- **Fix:** Moved log into useEffect with [eventsError, id] deps so it runs only when error state changes.
- **Files:** `apps/mobile/app/org-event-detail.tsx`

### 52. Replace RN Image with expo-image across all event poster components (Mar 3, 2026)

- **Issue:** All event poster images used React Native's built-in `Image` component which has no loading states, no placeholders, no transition animations, and no aggressive caching. Users saw empty containers while images loaded over the network.
- **Fix:** Installed `expo-image` and created a `FlameImage` wrapper component in `packages/ui` that provides: (1) 300ms cross-fade transition so images fade in smoothly instead of popping; (2) `memory-disk` cache policy for aggressive caching (subsequent views load from cache); (3) optional per-image `blurhash` placeholder prop (ready for future DB column). Replaced `Image` from `react-native` with `FlameImage` in 19 components across shared UI and mobile-specific code. Migrated `resizeMode` to `contentFit` (expo-image API). Replaced `ImageBackground` in `EventsHero` with absolute-positioned `FlameImage` + overlay. Added `expo-image` to `metro.config.js` `extraNodeModules` and `packages/ui` `peerDependencies`. Cleaned up dead `Image` import in `OrgSendTicketsCard`.
- **Components updated:**
  - **packages/ui:** `EventCard`, `SpotlightCard`, `EventListCard`, `CategoryPill`
  - **mobile/components:** `CarouselCard`, `EventHero`, `TicketCard`, `HistoryCard`, `OrgEventInfoCard`, `EventInfoHeader`, `DashboardBar`, `SettingsPhotoSection`, `EventsHero`, `PartnerLogos`, `Footer`, `EditEventDetailsTab`, `EventDetailsTab`
  - **mobile/app:** `ticket/[id].tsx` (event poster only; QR code Image kept as-is)
- **Files:** `packages/ui/src/components/FlameImage.tsx` (new), `packages/ui/src/index.tsx`, `packages/ui/package.json`, `apps/mobile/package.json`, `apps/mobile/metro.config.js`, and all 19 component files listed above.

### 53. PR review: design system rule, imports, accessibility, SettingsPhotoSection, expo-image range (Mar 3, 2026)

- **Issue:** Post–#52 PR comments: (1) flame-design-system.mdc still said "Use React Native Image" — docs out of sync with FlameImage migration; (2) EditEventDetailsTab had separate FlameImage/colors imports; (3) PartnerLogos lacked `accessibilityRole="image"` for screen readers; (4) SettingsPhotoSection rendered Edit/Delete buttons when handlers undefined (tappable no-ops) and icon-only Pressables lacked accessibility metadata; (5) expo-image peerDep too loose (`>=3.0.0`); (6) FlameImageProps lacked explicit `className`. Build error: lockfile specifiers didn't match packages/ui peerDeps (expo-image added).
- **Fix:** Updated flame-design-system.mdc to prescribe FlameImage (300ms cross-fade, memory-disk cache, blurhash, contentFit). Combined imports in EditEventDetailsTab. Added `accessibilityRole="image"` to PartnerLogos. For SettingsPhotoSection: guarded Edit/Delete buttons on `onEdit`/`onDelete` presence; added `accessibilityLabel` ("Edit photo" / "Delete photo"), `accessibilityRole="button"`, and `accessible={true}` to each Pressable so screen readers announce the actions. Tightened expo-image to `>=3.0.0 <4.0.0`. Added `className?: string` to FlameImageProps. Run `pnpm install` to refresh lockfile.
- **Files:** `.cursor/rules/flame-design-system.mdc`, `apps/mobile/components/events-management/EditEventDetailsTab.tsx`, `apps/mobile/components/home/PartnerLogos.tsx`, `apps/mobile/components/settings/SettingsPhotoSection.tsx`, `packages/ui/package.json`, `packages/ui/src/components/FlameImage.tsx`, `pnpm-lock.yaml`

### 54. expo-image in Metro singletonPkgsToClean (Mar 3, 2026)

- **Issue:** `expo-image` was added to `extraNodeModules` and as a peerDep of `packages/ui` but not to `singletonPkgsToClean`. pnpm auto-installs it as a symlink in `packages/ui/node_modules/`; Metro's hierarchical lookup finds that copy before `extraNodeModules`, potentially resolving against React 19.1.4 (web) instead of 19.1.0 (mobile), causing "Invalid hook call" crashes.
- **Fix:** Added `expo-image` to `singletonPkgsToClean` so Metro startup deletes the duplicate symlink from `packages/ui/node_modules/`, mirroring the `@expo/vector-icons` pattern.
- **Files:** `apps/mobile/metro.config.js`

### 55. PartnerLogos FlameImage className+style merge (Mar 3, 2026)

- **Issue:** PartnerLogos passed both `className="h-4"` and `style={{ width: item.width }}` to FlameImage. NativeWind cssInterop components have known merge issues (GH #957, #680) where `style` and `className` can be dropped, potentially causing invisible/zero-sized logos.
- **Fix:** Wrapped FlameImage in a View with explicit `style={{ height: 16, width: item.width }}`; FlameImage uses only `className="w-full h-full"` to fill the parent. Dimensions live on the parent, avoiding the cssInterop merge entirely.
- **Files:** `apps/mobile/components/home/PartnerLogos.tsx`

### 56. NotificationsOverlay: Reanimated spring animation (Mar 3, 2026)

- **Issue:** NotificationsOverlay used basic `Animated` API with a simple slide-down transition. Not polished or interruptible.
- **Fix:** Rewrote with `react-native-reanimated` using `withSpring` for a Revolut-style expand-from-icon animation. Spring config: `damping: 22, stiffness: 250, mass: 0.8` for open; `damping: 24, stiffness: 300` for close. Scales from top-right (`transformOrigin: "right top"`) with interpolated opacity and border-radius. Existing `shouldRender` pattern preserved via `runOnJS`.
- **Files:** `apps/mobile/components/notifications/NotificationsOverlay.tsx`

### 57. FAQItem: animated accordion with Reanimated (Mar 3, 2026)

- **Issue:** FAQ items in the home screen expanded/collapsed with no animation — content appeared/disappeared instantly.
- **Fix:** Created `AnimatedFAQItem` component in `apps/mobile/components/home/` using `react-native-reanimated`. Smooth height animation (`withTiming`, 300ms cubic bezier) with invisible measurer for content height. Chevron rotates 180° on expand. Base `FAQItem` in `packages/ui` kept unchanged (Reanimated is RN-only). Updated `FAQSection` to use `AnimatedFAQItem`.
- **Files:** `apps/mobile/components/home/AnimatedFAQItem.tsx` (new), `apps/mobile/components/home/FAQSection.tsx`

### 58. FAQSection: "View All" link + curated web-matching FAQ content (Mar 3, 2026)

- **Issue:** Mobile FAQs were 4 placeholder items with Lorem ipsum text. Web has 26 real Q&As. No way to see full FAQ list.
- **Fix:** Updated `data/mock.ts` FAQ array with 6 curated items matching web source-of-truth (`apps/web/app/faqs/page.tsx`): What is FLAME?, How do I purchase tickets?, How do I use my digital ticket?, What payment methods?, Refund policy, Service fee explanation. Added "View all FAQs" link to FAQSection that opens `flme.co/faqs` via `expo-web-browser` in-app browser.
- **Files:** `apps/mobile/data/mock.ts`, `apps/mobile/components/home/FAQSection.tsx`

### 59. Footer removed from all mobile screens (Mar 3, 2026)

- **Issue:** Footer component used relative URLs (`/faqs`, `/privacy`, etc.) which can't be opened with `Linking.openURL` on mobile — causing runtime errors. Footer duplicated information now available in Settings.
- **Fix:** Removed Footer import and usage from Home screen, Event Details screen, and Events Listing screen. Footer links (legal, support) relocated to the new Settings menu (see #60). Footer component file retained for now (dead code — cleanup deferred).
- **Files:** `apps/mobile/app/(tabs)/index.tsx`, `apps/mobile/app/event/[id].tsx`, `apps/mobile/components/events/EventsScreenBody.tsx`

### 60. Settings: restructured as menu hub with Account + Support sub-screens (Mar 3, 2026)

- **Issue:** Settings was a tabbed interface (Personal / Organization / Payouts) that only showed profile editing. Legal links (privacy, terms) were buried in the now-removed Footer. No centralized support access.
- **Fix:** Rewrote `settings.tsx` as a clean menu list with icons: Account (navigates to new `/account` stack screen), Support (navigates to new `/support` stack screen), Privacy Policy / Terms of Use / Purchase Terms / Cookie Settings (each opens `flme.co/*` via `expo-web-browser` in-app browser). Sign Out button at bottom. Created `app/account.tsx` — wraps existing `PersonalSettingsTab` + `OrganizationSettingsTab` + `PayoutsSettingsTab` with the existing `SettingsTabs` component (org tabs only visible for org role). Created `app/support.tsx` — "Fan Support" section with FAQs and Contact Us links (both open in-app browser), plus contact info (phone + email).
- **Files:** `apps/mobile/app/(tabs)/settings.tsx` (rewritten), `apps/mobile/app/account.tsx` (new), `apps/mobile/app/support.tsx` (new)

### 61. FAQSection: wrap WebBrowser.openBrowserAsync in try/catch (Mar 3, 2026)

- **Issue:** `handleViewAll` called `WebBrowser.openBrowserAsync(FAQS_URL)` without error handling. If the browser fails to open, the error is unhandled.
- **Fix:** Made `handleViewAll` async, wrapped the call in try/catch. Logs error with URL context and shows `Alert.alert` on failure. Follows the project's `openExternalLink` error resilience pattern.
- **Files:** `apps/mobile/components/home/FAQSection.tsx`

### 62. NotificationsOverlay: complete useEffect dependency array (Mar 3, 2026)

- **Issue:** `useEffect` on line 37 reads `shouldRender` and calls `hide` but dependency array only listed `[visible]`. Incomplete deps could cause stale closure reads.
- **Fix:** Added `shouldRender` and `hide` to the dependency array. `hide` is a stable `useCallback` with empty deps. The extra effect execution when `shouldRender` transitions is harmless (no-op setState + innocuous spring restart).
- **Files:** `apps/mobile/components/notifications/NotificationsOverlay.tsx`

### 63. Settings & Support: wrap WebBrowser.openBrowserAsync in try/catch (Mar 3, 2026)

- **Issue:** `handlePress` in `settings.tsx` and `SupportRow` in `support.tsx` called `WebBrowser.openBrowserAsync` fire-and-forget without error handling. Unhandled promise rejections if the browser fails to open.
- **Fix:** Made both handlers async, wrapped `WebBrowser.openBrowserAsync` in try/catch. On failure: `console.error` with URL context, `Alert.alert("Link Failed", "...")` for user feedback. Navigate branch (router.push) unchanged.
- **Files:** `apps/mobile/app/(tabs)/settings.tsx`, `apps/mobile/app/support.tsx`

### 64. Settings: structured error logs + public menu layout (Mar 3, 2026)

- **Issue:** Sign-out error log lacked contextual fields (userId, action). RequireAuthGate wrapped the entire Settings screen, preventing unauthenticated users from seeing the public menu (legal links, support, Sign In).
- **Fix:** Added structured context to error handlers: `{ userId, action: "signOut" | "openBrowser", url?, error }` for supportability. Removed RequireAuthGate from Settings; public menu rows (Account, Support, legal links) and Sign In/Out button now render for all users. Unauthenticated users see Sign In and can access legal links and support.
- **Files:** `apps/mobile/app/(tabs)/settings.tsx`

### 65. Support: ScrollView for small screens (Mar 3, 2026)

- **Issue:** Root View caused content clipping on small devices. Fan Support list and Contact Information were not scrollable.
- **Fix:** Replaced root View with ScrollView (`className="flex-1 bg-background"`, `contentContainerStyle` with `paddingBottom: insets.bottom + 16`). Header, FAN_SUPPORT_LINKS map, and Contact Information unchanged inside ScrollView.
- **Files:** `apps/mobile/app/support.tsx`

### 66. Documentation: Phase 7, Web Parity Gate, PR template (Mar 3, 2026)

- **Issue:** Phase 5 and Phase 6 complete; project in Phase 7 (Extra Features). Parity gate and templates still referenced "Phase 5" only.
- **Fix:** Renamed "Phase 5 PR Parity Gate" → "Web Parity Gate" in `project-flame-master.mdc` Section 9.1; clarified it applies when porting logic from web (Phase 7+). Updated Phase 3 Completion Gate to reference "Web Parity Gate" instead of "Phase 5". Added Phase 7 to `IOS_MIGRATION.md`. Added Phase 6 and Phase 7 options to `.github/pull_request_template.md`. Updated `prompts_phases.md` header and `MARCH_2026_FIXES.md` parity block. For mobile-only Phase 7 features, add entry to `CRUCIAL_IOS_TO_WEB_TODOS.md`.
- **Files:** `.cursor/rules/project-flame-master.mdc`, `docs/project-migrations/IOS_MIGRATION.md`, `.github/pull_request_template.md`, `docs/prompts/prompts_phases.md`, `docs/fixes/MARCH_2026_FIXES.md`

### 67. Phase labels, Phase 6 parity wording, settings try/catch indentation (Mar 3, 2026)

- **Issue:** flame-design-system.mdc used "Phase 5" at line 123 vs "Phase 5 / Phase 7 (logic porting)" at line 205 — inconsistent. Phase 6 PR checklist had absolute "No web parity required" — should be conditional when business logic is touched. settings.tsx `handleSignInOut` try/catch was mis-indented; catch block did not align with try.
- **Fix:** Unified phase label to "Phase 5 / Phase 7 (logic porting)" in flame-design-system.mdc. Updated Phase 6 checklist: "Generally no web parity required for UI/UX polish; if this PR changes business logic or calculations, include... Web Parity Gate." Fixed handleSignInOut brace alignment so try and catch pair correctly inside the if (isSignedIn) branch.
- **Files:** `.cursor/rules/flame-design-system.mdc`, `.github/pull_request_template.md`, `apps/mobile/app/(tabs)/settings.tsx`

### 68. Phase 5 PR template non-interactive, sign-out re-entry guard (Mar 3, 2026)

- **Issue:** Phase 5 checklist in PR template was still a selectable checkbox; contributors could incorrectly check it for active ports. handleSignInOut could be re-entered by rapid taps.
- **Fix:** Replaced Phase 5 checkbox with plain bullet and non-interactive note ("Do not check — use Phase 7 for active logic ports"); added mandatory PR description requirement text. Added `isSigningOut` mutex to handleSignInOut: short-circuit on re-entry, set true before signOut, reset in `finally`; disabled Sign In/Out Pressable and applied `opacity-70` while signing out.
- **Files:** `.github/pull_request_template.md`, `apps/mobile/app/(tabs)/settings.tsx`

### 69. Parity template: canonical sign-out route (Mar 3, 2026)

- **Issue:** Web Parity Gate ready-to-paste block documented `router.replace("/")` for sign-out; canonical flow uses `router.replace("/(tabs)")` (per #6, MenuOverlay, migration patterns).
- **Fix:** Updated parity template sign-out flow to `router.replace("/(tabs)")`.
- **Files:** `docs/fixes/MARCH_2026_FIXES.md`

### 70. Explore Organizers: replace categories with organizers on home screen (Mar 4, 2026)

- **Feature:** Replaced "Explore Categories" section on the home screen with "Explore Organizers". Shows up to 10 approved organizations in a horizontal scroll with a "See All" pill. Tapping an organizer navigates to a new `/organizer/[slug]` page showing that organizer's events.
- **Files:** `apps/mobile/components/home/ExploreOrganizers.tsx` (new), `apps/mobile/app/(tabs)/index.tsx` (replaced import)

### 71. Organizer events page: /organizer/[slug] (Mar 4, 2026)

- **Feature:** New screen at `apps/mobile/app/organizer/[slug].tsx`. Reuses `EventsScreenBody` with the hero showing the organizer name (no subtitle), same background image. Events filtered by organization slug using shared lib `filterEventsByOrganizer`. City-only filter via `FilterBottomSheet`.
- **Files:** `apps/mobile/app/organizer/[slug].tsx` (new)

### 72. Events page: filter bottom sheet replaces category pills (Mar 4, 2026)

- **Feature:** Removed `CategoryFilterPills` from the Discover Events page. Replaced with a `FilterBottomSheet` (opened via the existing filter icon button) containing city and organizer filter options. Filter logic uses `filterEventsByCity` and `filterEventsByOrganizer` from `@project-flame/lib`.
- **Files:** `apps/mobile/components/events/FilterBottomSheet.tsx` (new), `apps/mobile/components/events/EventsScreenBody.tsx` (updated), `apps/mobile/components/events/EventsHero.tsx` (updated, configurable title/subtitle), `apps/mobile/app/events.tsx` (updated)

### 73. Shared lib: event filter functions + OrganizationPublic type (Mar 4, 2026)

- **Feature:** Added `OrganizationPublic` type, `OrgFilterableEvent` interface, and four pure filter functions (`filterEventsByCity`, `filterEventsByOrganizer`, `extractUniqueCities`, `extractUniqueOrganizers`) to `@project-flame/lib`. 14 new tests (30 total in event-filters.test.ts). Web can import the same functions when adding organizer filtering.
- **Files:** `packages/lib/src/types/organization.ts` (new), `packages/lib/src/utils/event-filters.ts` (extended), `packages/lib/src/index.ts`, `packages/lib/src/types/index.ts`, `packages/lib/src/utils/index.ts`, `packages/lib/__tests__/event-filters.test.ts`

### 74. useAppEvents: organization join + EventCardData org fields (Mar 4, 2026)

- **Feature:** Extended the `useAppEvents` Supabase query to join `organizations(name, slug)`. Added optional `city`, `organizationSlug`, and `organizationName` fields to `EventCardData` (backward-compatible). Populates these from the org join in the data mapper.
- **Files:** `apps/mobile/hooks/useAppEvents.ts`, `packages/ui/src/components/EventCard.tsx` (interface extended)

### 75. useOrganizations hook for approved orgs (Mar 4, 2026)

- **Feature:** New `useOrganizations` hook querying all approved organizations with `id`, `name`, `slug`, `logo_url`, `cover_image_url`. Public read (no auth needed). Used by `ExploreOrganizers` on home screen.
- **Files:** `apps/mobile/hooks/useOrganizations.ts` (new)

#### Web Parity Gate (entries 70–75)

- **Web equivalents:** `EventsCatalog` (`apps/web/app/components/EventsCatalog.tsx`) and `events/page.tsx` — web has city filter only; no Explore Organizers or `/organizer/[slug]` yet (see `CRUCIAL_IOS_TO_WEB_TODOS.md` #5 for port-back).
- **API / Supabase parity:** `useAppEvents` joins `organizations(name, slug)`; web `getEvents()` in `events/page.tsx` also joins `organizations(name, slug)`. Both use the same event shape. `useOrganizations` reads approved orgs directly from Supabase (RLS); web `/api/organizations` is auth-scoped user memberships — different purpose.
- **Calculation parity:** `filterEventsByCity` and `filterEventsByOrganizer` from `@project-flame/lib` are used on mobile; web `EventsCatalog` uses inline city filter — shared lib can be adopted on web when organizer filter is added.
- **Edge cases verified:** Empty organizer list → Explore Organizers hides; falsy/whitespace slug → orgEvents `[]`; missing `logo_url`/`cover_image_url` → placeholder; slug collisions not applicable (unique per org).
- **Cross-platform behavior:** Mobile `FilterBottomSheet` (city + organizer) vs web city dropdown; `EventsHero` title/subtitle configurable for organizer page vs events list.

### 76. Database: organization image columns + storage bucket (Mar 4, 2026)

- **Feature:** Added `logo_url` and `cover_image_url` nullable text columns to `organizations` table. Created `organization-images` public storage bucket (1MB limit, standard image MIME types) with public read policy.
- **Migrations:** `20260304005737_add_org_image_columns.sql`, `20260304005830_org_images_storage_bucket.sql`

### 76a. RLS: public read policy for approved organizations (Mar 4, 2026)

- **Bug:** ExploreOrganizers section was blank because the `organizations` table only had a SELECT policy for members (`get_user_organizations()`). Anonymous/unauthenticated users and non-members could not see any orgs.
- **Fix:** Added permissive SELECT policy "Anyone can view approved organizations" with `USING (approved = true)`. This ORs with the existing membership policy so unapproved orgs remain hidden from non-members.
- **Migration:** `20260304012250_public_approved_orgs_policy.sql`

### 77. API route: /api/upload-org-image (Mar 4, 2026)

- **Feature:** New web API route for uploading and deleting organization images (logo or cover).
- **POST:** FormData fields `file`, `organizationSlug`, and `type` (logo|cover). `type` is used only for upload to determine which column to update.
- **DELETE:** Clients should omit the legacy `type` query param and rely solely on `path`. `path` is the only required query param. The handler infers whether to clear `logo_url` or `cover_image_url` from the path pattern (e.g. `organizations/{slug}/logo-*.{ext}` vs `organizations/{slug}/cover-*.{ext}`). Both verify org membership.
- **Files:** `apps/web/app/api/upload-org-image/route.ts` (new)

### 78. OrganizationSettingsTab: wired org logo upload (Mar 4, 2026)

- **Feature:** Replaced mock data with real org data from `useOrgData()` (extended to include `logoUrl`, `coverImageUrl`, `organizationSlug`). Wired up `handleEditOrgPhoto` (expo-image-picker + `apiUploadFormData`) and `handleDeleteOrgPhoto` (confirm dialog + `apiDelete`). Shows loading overlay during upload.
- **Files:** `apps/mobile/components/settings/OrganizationSettingsTab.tsx`, `apps/mobile/hooks/useOrgData.ts` (extended)

---

## PR Review Triage (Mar 4, 2026)

### 79. organizer/[slug].tsx: guard falsy slug in useMemo (Mar 4, 2026)

- **Issue:** When `slug` is falsy (e.g. during route resolution), `filterEventsByOrganizer(data?.allEvents ?? [], slug)` returns all events (lib behavior for null/undefined). Organizer page should show empty array, not all events.
- **Fix:** Return `[]` when `slug` is falsy; only call `filterEventsByOrganizer` when slug is truthy.
- **Files:** `apps/mobile/app/organizer/[slug].tsx`

### 80. ExploreOrganizers: gap 16 → 8 per design spec (Mar 4, 2026)

- **Issue:** Horizontal list used `gap: 16`; design spec requires `gap: 8` for mobile horizontal lists.
- **Fix:** Updated `contentContainerStyle` to `{ paddingHorizontal: 16, gap: 8 }`.
- **Files:** `apps/mobile/components/home/ExploreOrganizers.tsx`

### 81. OrganizationSettingsTab: Save button coming soon (Mar 4, 2026)

- **Issue:** Save button had empty handler; misleading UX.
- **Fix:** Replaced no-op with `Alert.alert("Coming soon", "Organization details editing will be available in a future update.")`. Added "Coming soon" label above the button.
- **Files:** `apps/mobile/components/settings/OrganizationSettingsTab.tsx`

### 82. upload-org-image: MIME allowlist, rollback, path-based DELETE (Mar 4, 2026)

- **Issue:** (1) MIME validation used `file.type.startsWith("image/")` and defaulted unknown to `image/jpeg` — insecure. (2) On DB update failure, uploaded file was left orphaned in storage. (3) DELETE trusted `rawType` query param and ignored update errors.
- **Fix:** (1) Strict allowlist `image/png`, `image/jpeg`, `image/jpg`, `image/webp`, `image/gif`; reject missing or unknown MIME; `getExtensionFromMimeType` returns `null` for unknown. (2) On `updateError`, rollback by deleting uploaded object from storage before returning 500. (3) Extract image type from path via `pathPattern.exec(rawPath)` capture group; remove reliance on `rawType`; surface and return 500 if DB update fails.
- **Files:** `apps/web/app/api/upload-org-image/route.ts`

### 83. Deferred nitpicks (Mar 4, 2026)

- **useOrganizations.ts:** Structured error log with `action` field → `docs/todos/NITPICKS_TODOS.md`
- **EventsScreenBody / FilterBottomSheet:** OrgOption type duplication → `docs/todos/NITPICKS_TODOS.md`

### 84. organizer/[slug].tsx: handleRefresh try/catch, slug normalization (Mar 4, 2026)

- **Issue:** (1) handleRefresh used try/finally without catch; failures were unhandled. (2) Raw `slug` from useLocalSearchParams was used directly; undefined or whitespace-only slug could cause inconsistent behavior vs org-event-detail.
- **Fix:** (1) Added try/catch/finally; in catch, log `{ action: "refresh", slug, error }` then let finally reset state. (2) Derived `trimmedSlug = slug?.trim() || null` (handling string | string[]), used in orgEvents guard, filterEventsByOrganizer, and orgName fallback.
- **Files:** `apps/mobile/app/organizer/[slug].tsx`

### 85. MARCH_2026_FIXES.md: DELETE API docs update (Mar 4, 2026)

- **Issue:** Entry #77 stated DELETE accepts `path` + `type`; after fix #82, `type` is ignored and image type is inferred from path.
- **Fix:** Updated docs to state DELETE only requires `path`, `type` is legacy/ignored, handler infers column from path.
- **Files:** `docs/fixes/MARCH_2026_FIXES.md`

### 86. Deferred nitpick (Mar 4, 2026)

- **OrganizationSettingsTab:** Structured error logs (action, organizationSlug, userId) → `docs/todos/NITPICKS_TODOS.md`

### 87. upload-org-image DELETE: case-insensitive pathMatch column bug (Mar 4, 2026)

- **Bug:** `pathPattern` uses the `i` flag, so `Logo` or `COVER` match the regex. But `imageTypeFromPath === "logo"` was case-sensitive; `pathMatch[1]` for `Logo-*.jpg` yields `"Logo"`, so the check failed and the handler incorrectly cleared `cover_image_url` instead of `logo_url`.
- **Fix:** Normalize `imageTypeFromPath` with `.toLowerCase()` before the column comparison.
- **Files:** `apps/web/app/api/upload-org-image/route.ts`

### 88. MARCH_2026_FIXES.md: DELETE parameter docs refinement (Mar 4, 2026)

- **Fix:** Updated entry #77 to explicitly instruct clients to omit legacy `type` and rely solely on `path`; clarified POST uses `type` only for upload; added path pattern examples for DELETE.
- **Files:** `docs/fixes/MARCH_2026_FIXES.md`

### 89. MARCH_2026_FIXES.md: Web Parity Gate for entries 70–75 (Mar 4, 2026)

- **Fix:** Added compact Web Parity Gate subsection under entries 70–75: web equivalents (EventsCatalog, events/page), API/Supabase parity (useAppEvents vs getEvents, useOrganizations vs /api/organizations), calculation parity (shared lib filters), edge-case verifications, cross-platform behavior (FilterBottomSheet vs web city dropdown).
- **Files:** `docs/fixes/MARCH_2026_FIXES.md`

### 90. Database: profile_image_url column on users table (Mar 4, 2026)

- **Feature:** Added nullable `profile_image_url` text column to `users` table for storing user profile photos.
- **Migration:** `20260304021421_add_profile_image_url_to_users.sql`
- **Files:** `supabase/migrations/20260304021421_add_profile_image_url_to_users.sql`

### 91. Storage: profile-images bucket (Mar 4, 2026)

- **Feature:** Created `profile-images` public storage bucket (1MB limit, standard image MIME types) with public read SELECT policy. Folder convention: `personal/{clerk_id}/` for user photos, `company/{org_slug}/` for company photos. Same security pattern as `event-images` and `organization-images` — no direct INSERT/UPDATE/DELETE policies; uploads go through API routes with admin client.
- **Migration:** `20260304021432_profile_images_storage_bucket.sql`
- **Files:** `supabase/migrations/20260304021432_profile_images_storage_bucket.sql`

### 92. API route: /api/upload-profile-image (Mar 4, 2026)

- **Feature:** New web API route for uploading and deleting profile images (personal user photos and company org photos).
- **POST:** FormData fields `file`, `type` (personal|company), and `organizationSlug` (required for company type). Personal uploads go to `profile-images/personal/{clerk_id}/photo-{timestamp}.{ext}` and update `users.profile_image_url`. Company uploads go to `profile-images/company/{org_slug}/photo-{timestamp}.{ext}` and update `organizations.logo_url`.
- **DELETE:** Query params `path` + `type`. Personal deletes verify the requesting user owns the file (clerk_id match). Company deletes verify org membership. Both clear the corresponding DB column on success. Rollback: if DB update fails after upload, the uploaded file is deleted from storage.
- **Security:** MIME allowlist (jpeg/png/webp/gif), 1MB size limit, path validation with regex, sanitization with `path.basename()`, auth via Clerk + org membership check for company type.
- **Files:** `apps/web/app/api/upload-profile-image/route.ts` (new)

### 93. PersonalSettingsTab: wired profile photo upload + delete (Mar 4, 2026)

- **Feature:** Replaced mock photo URL with real `profile_image_url` from `useUserProfile`. Wired `handleEditProfilePhoto` with expo-image-picker (1:1 aspect ratio) and `apiUploadFormData` to `/api/upload-profile-image`. Wired `handleDeleteProfilePhoto` with confirmation dialog and `apiDelete`. Shows loading overlay during upload/delete. Delete button only appears when the user has an existing photo. Error handling with `ApiError` message extraction and user-facing alerts.
- **Files:** `apps/mobile/components/settings/PersonalSettingsTab.tsx`

### 94. Shared lib: UserProfile.profile_image_url (Mar 4, 2026)

- **Feature:** Added optional `profile_image_url` field to `UserProfile` interface in `@project-flame/lib`. Updated `useUserProfile` hook to include `profile_image_url` in the Supabase select query and Zod schema.
- **Files:** `packages/lib/src/types/ticket.ts`, `apps/mobile/hooks/useUserProfile.ts`

### 95. Web parity TODO: profile image management (Mar 4, 2026)

- **Feature:** Added entry #6 to `CRUCIAL_IOS_TO_WEB_TODOS.md` documenting that web needs to implement profile photo upload (currently relies on Clerk avatars). Mobile files, API routes, DB columns, and storage bucket documented for web team reference.
- **Files:** `docs/todos/CRUCIAL_IOS_TO_WEB_TODOS.md`

### 96. PersonalSettingsTab: fail fast when storage path cannot be extracted (Mar 5, 2026)

- **Issue:** When `profile.profile_image_url` could not be parsed to extract a storage path (e.g., malformed URL, different bucket format), the delete handler silently skipped the API call but still invalidated the cache, leaving the user without feedback.
- **Fix:** Detect when `storagePath` is falsy after parsing the URL and throw an explicit `Error("Invalid profile image URL; cannot extract storage path")` before calling `apiDelete`. The surrounding catch surfaces the error message to the user via `Alert.alert`.
- **Files:** `apps/mobile/components/settings/PersonalSettingsTab.tsx`

### 97. upload-profile-image: inspect Supabase query errors, return 500 (Mar 5, 2026)

- **Issue:** Supabase query results in `resolveUserFromClerk` and `verifyOrgMembership` ignored the returned `error` field. DB failures could be misreported as 404/403 instead of 500.
- **Fix:** For each query (users, organizations, organization_members), inspect the returned `error`. When present, log structured context (`clerkUserId`, `organizationSlug`, `action`, `error`) and return `{ ok: false, error: "Database error", status: 500 }` instead of proceeding.
- **Files:** `apps/web/app/api/upload-profile-image/route.ts`

### 98. upload-profile-image: validate path match before nulling DB on delete (Mar 5, 2026)

- **Issue:** DELETE handler unconditionally set `profile_image_url`/`logo_url` to null after removing the file. If the client supplied a stale path (e.g., user uploaded a new photo in another tab), this could erase the newer photo reference.
- **Fix:** Before updating the DB, fetch the current `profile_image_url`/`logo_url`, extract the storage path from the URL, and only null when the stored path exactly matches the path being deleted. If no match (stale client state), skip the DB update; storage file is already removed.
- **Files:** `apps/web/app/api/upload-profile-image/route.ts`

### 99. SettingsPhotoSection: icon-based placeholder instead of placehold.co (Mar 4, 2026)

- **Issue:** Placeholder used `placehold.co` URL which rendered huge "Add Photo" / "Add Logo" text. Looked broken and unprofessional. Also, `photoUrl` prop required a string, forcing callers to always provide a URL even when no photo existed.
- **Fix:** Changed `photoUrl` prop type to `string | null | undefined`. When falsy, renders a camera icon (`Ionicons camera-outline`, 48px, `white-30` color) on a `bg-white-5` background instead of attempting to load a remote placeholder image. Removed `PLACEHOLDER_PHOTO` and `PLACEHOLDER_LOGO` constants from `PersonalSettingsTab` and `OrganizationSettingsTab`; both now pass `profile?.profile_image_url` / `orgData?.logoUrl` directly (null when no image).
- **Files:** `apps/mobile/components/settings/SettingsPhotoSection.tsx`, `apps/mobile/components/settings/PersonalSettingsTab.tsx`, `apps/mobile/components/settings/OrganizationSettingsTab.tsx`

### 100. DashboardBar: real profile image instead of mock avatar (Mar 4, 2026)

- **Issue:** `DashboardBar` imported `dashboardUser.avatarUrl` from mock data — always showed the same stock Unsplash woman photo. Profile picture next to screen titles (Settings, Dashboard, History, etc.) never reflected the actual user.
- **Fix:** Replaced mock import with `useUserProfile()` hook. When `profile_image_url` exists, shows the real photo via `FlameImage`. When null, shows a person icon (`Ionicons person`, 20px, `white-50` color) on a `bg-white-10` circular background. Since `useUserProfile` is a TanStack Query with 5min staleTime and `DashboardBar` is rendered on many screens, the profile data is shared from cache — no redundant fetches.
- **Files:** `apps/mobile/components/dashboard/DashboardBar.tsx`

### 101. API client: fetch timeout with AbortController (Mar 4, 2026)

- **Issue:** `apiClient` and `apiUploadFormData` had no fetch timeout. When `EXPO_PUBLIC_API_URL` pointed to an unreachable IP (e.g., stale LAN address after DHCP change), requests hung for 60–75 seconds (OS-level TCP timeout) with no user feedback — spinner displayed indefinitely with no error alert.
- **Fix:** Added `AbortController` with `setTimeout` to both functions. Regular API calls abort after 15 seconds (`DEFAULT_TIMEOUT_MS`); file uploads abort after 30 seconds (`UPLOAD_TIMEOUT_MS`). On abort, throws `ApiError` with message including `API_BASE` URL for debugging. Timeout is cleaned up in `finally` block.
- **Root cause note:** User's `.env` had `EXPO_PUBLIC_API_URL=http://192.168.100.140:3000` but machine's current IP was `192.168.100.142`. Updated `.env` to correct IP.
- **Files:** `apps/mobile/lib/api.ts`, `apps/mobile/.env`

### 102. RoleSwitcherDropdown: try/catch guard on role switch handlers (Mar 5, 2026)

- **Issue:** `handleSwitchToAttendee` and `handleSwitchToOrganizer` had no try/catch. If `switchToAttendee()` or `switchToOrganizer()` threw, the promise rejection was unhandled; `onClose()` and `router.replace()` ran anyway, leaving the UI in an inconsistent state (dropdown closed, view not switched).
- **Fix:** Wrapped each handler's async call in try/catch. On success: call `onClose()` and `router.replace(...)` as before. On failure: log via `console.error`, surface via `Alert.alert`, and do not call `onClose()` so the dropdown remains open for retry.
- **Files:** `apps/mobile/components/navigation/RoleSwitcherDropdown.tsx`

### 103. BecomeOrganizerSheet: getToken fail-fast before apiPost (Mar 5, 2026)

- **Issue:** `handleSubmit` called `apiPost` with `getToken` without checking token upfront. When token was falsy, the API client threw a generic "Not authenticated" error and the user saw a poor UX.
- **Fix:** Await `getToken()` at the start of `handleSubmit`; if falsy, call `setError("You must be signed in to create an organization.")` and return before calling `apiPost`. Pass a stable token resolver to `apiPost`.
- **Files:** `apps/mobile/components/navigation/BecomeOrganizerSheet.tsx`

### 104. CustomTabBar: expand HIDDEN_ROUTES, re-tap active tab no-op (Mar 5, 2026)

- **Issue:** `HIDDEN_ROUTES` only contained `/sign-in` and `/scanner`, so tab bar still showed on detail screens (`/event/`, `/ticket/`, `/org-event-detail`, etc.). Re-tapping an already-active non-home tab pushed a duplicate route onto the stack.
- **Fix:** Split into `HIDDEN_PREFIXES` (pathname.startsWith) and `HIDDEN_EXACT` (pathname === `/events`) so `/events` does not match `/events-management`. Added `/event/`, `/ticket/`, `/org-event-detail`, `/rsvp-detail`, `/edit-event`, `/organizer/`. Changed `handleTabPress` so re-tapping any active tab is a no-op (scroll-to-top only for home).
- **Files:** `apps/mobile/components/navigation/CustomTabBar.tsx`

### 105. RoleSwitcherDropdown: structured logs, isSwitching guard, remove dead upsell (Mar 5, 2026)

- **Issue:** Error logs lacked structured context (action, userId). No guard against concurrent role-switches. The `!canSwitchToOrg` upsell branch was dead — the header pill that opens the dropdown is only rendered when `canSwitchToOrg` is true.
- **Fix:** Added `action`, `userId` (from `useOptionalAuth`) to `console.error` payloads. Introduced `isSwitching` state with early return and `finally` reset; disabled option Pressables while switching. Removed dead upsell, `handleBecomeOrganizer`, and `BecomeOrganizerSheet` from the component.
- **Files:** `apps/mobile/components/navigation/RoleSwitcherDropdown.tsx`

### 106. useViewMode: structured logging in SecureStore catch blocks (Mar 5, 2026)

- **Issue:** Read catch block swallowed errors without logging. Write catch blocks logged a plain message; lacked action, key, and userId for traceability.
- **Fix:** Read catch now logs `{ action: "readViewMode", key: viewModeKey, userId, err }` and still calls `setIsHydrated(true)`. Write catches log `{ action: "writeViewMode", key: viewModeKey, value, userId, err }`. Key is the per-user runtime value `flame_view_mode_${userId}` (see #109).
- **Files:** `apps/mobile/hooks/useViewMode.ts`

### 107. RoleSwitcherSheet: try/catch on role switch handlers (Mar 5, 2026)

- **Issue:** Same as RoleSwitcherDropdown #102 — `handleSwitchToAttendee` and `handleSwitchToOrganizer` had no try/catch; unhandled promise rejections, `onClose()` and `router.replace()` ran on failure.
- **Fix:** Wrapped both handlers in try/catch; on error, log with structured context and show `Alert.alert`; do not close the sheet.
- **Files:** `apps/mobile/components/navigation/RoleSwitcherSheet.tsx`

### 108. Home screen: fix scroll-to-top ref registration when ScrollView mounts late (Mar 5, 2026)

- **Issue:** `registerScrollRef(scrollRef.current)` was called in `useEffect` at mount. When Home initially renders a loading spinner, no `ScrollView` exists, so `scrollRef.current` is null. When data loads and `ScrollView` mounts, the effect does not re-run, so the context permanently held null — tap-on-Home never scrolled to top.
- **Fix:** Pass `registerScrollRef` as the ScrollView's `ref` (callback ref). When ScrollView mounts, React invokes it with the instance; when it unmounts, with null. Added `useEffect` to clear the ref when in loading/error state.
- **Files:** `apps/mobile/app/(tabs)/index.tsx`

### 109. useViewMode: per-user storage key and re-hydration on auth change (Mar 5, 2026)

- **Issue:** View mode key was global (`flame_view_mode`), hydrated once. Account switches inherited the previous user's mode (e.g., user A sets organizer, signs out, user B signs in and saw organizer).
- **Fix:** Introduced `getViewModeKey(userId)` returning `flame_view_mode_${userId}` when signed in, null when signed out. All SecureStore reads/writes use the per-user key. Hydration effect depends on `viewModeKey` (and `userId`) so it re-runs on sign-in/sign-out; when signed out (`viewModeKey` null), `viewMode` is reset to null and `effectiveViewMode` defaults to attendee. On key change, reset `viewMode` and `isHydrated` immediately (before async read) so stale values from the previous key don't flash. Switch handlers no-op when `viewModeKey` is null.
- **Files:** `apps/mobile/hooks/useViewMode.ts`

### 110. MARCH_2026_FIXES.md #163: CustomTabBar visibility rules (Mar 5, 2026)

- **Fix:** Updated the changelog entry (#163) describing the CustomTabBar to reflect actual visibility rules: built-in tab bar is hidden via `tabBarStyle: { display: 'none' }` in `(tabs)/_layout.tsx`; CustomTabBar additionally hides on `/sign-in`, `/scanner`, and detail routes (`/event/`, `/ticket/`, `/org-event-detail`, etc.).
- **Files:** `docs/fixes/MARCH_2026_FIXES.md`

### 111. useViewMode: propagate SecureStore write failures to callers (Mar 5, 2026)

- **Issue:** Catch blocks around `SecureStore.setItemAsync` in `switchToAttendee` and `switchToOrganizer` only logged errors and swallowed them; callers could not react to persistence failures.
- **Fix:** After logging, added `throw e` in both catch blocks so the promise rejects. Callers updated to handle: RoleSwitcherDropdown and RoleSwitcherSheet already had try/catch; CustomTabBar now awaits `switchToOrganizer()` in try/catch and shows Alert on failure instead of navigating. On write failure, revert in-memory `viewMode` via `setViewMode(prev)` before rethrowing so the UI does not show a mode that was not persisted.
- **Files:** `apps/mobile/hooks/useViewMode.ts`, `apps/mobile/components/navigation/CustomTabBar.tsx`

### 112. useViewMode: remove dead branch in effectiveViewMode (Mar 5, 2026)

- **Issue:** Line 77's ternary `canSwitchToOrg ? "organizer" : "attendee"` was dead — when reached, `canSwitchToOrg` is always true (early return on line 75 when false).
- **Fix:** Replaced with `return "organizer"`.
- **Files:** `apps/mobile/hooks/useViewMode.ts`

### 113. RoleSwitcherDropdown: prevent touch passthrough to backdrop (Mar 5, 2026)

- **Issue:** The dropdown was a `View` inside the backdrop `Pressable`. Tapping non-Pressable areas (separators, padding, card border) propagated to the backdrop's `onPress`, closing the dropdown.
- **Fix:** Wrapped the dropdown in a `Pressable` with `onPress={() => {}}` so it intercepts touches and prevents propagation to the backdrop.
- **Files:** `apps/mobile/components/navigation/RoleSwitcherDropdown.tsx`

### 114. Scanner: thread selectedOrgId into validate/verify/checkin flows (Mar 6, 2026)

- **Issue:** `selectedOrgId` only drove OrgSelector UI; backend never received org context for multi-org users.
- **Fix:** `useQRScanner` accepts `{ orgId }`. Scanner passes `effectiveOrgId = selectedOrgId ?? userOrgs?.[0]?.organizationId ?? null`. All three API calls (validate-code, verify, checkin) include `orgId` when provided. Web routes accept optional `orgId` and enforce event belongs to selected org when provided.
- **Files:** `apps/mobile/hooks/useQRScanner.ts`, `apps/mobile/app/scanner.tsx`, `apps/web/app/api/qr-scanner/validate-code/route.ts`, `apps/web/app/api/qr-scanner/verify/route.ts`, `apps/web/app/api/qr-scanner/checkin/route.ts`

### 115. useNotifications: reset tokenFailCount on successful fetch (Mar 6, 2026)

- **Issue:** `tokenFailCount.current` never cleared after successful token fetch, causing immediate re-entry to 60s cooldown.
- **Fix:** On success path (when `items` returned and `requestVersion` matches), set `tokenFailCount.current = 0` and `lastTokenFailTime.current = 0` so transient errors can recover.
- **Files:** `apps/mobile/hooks/useNotifications.ts`

### 116. useUserTickets: .single() → .maybeSingle() for users query (Mar 6, 2026)

- **Issue:** `.single()` on `users` table throws 406 when no row exists, preventing fallback to `{ tickets: [] }`.
- **Fix:** Replaced `.single()` with `.maybeSingle()` so missing users return `data: null, error: null`. Existing checks for `userError` and `!currentUser` still return `{ tickets: [] }` as intended.
- **Files:** `apps/mobile/hooks/useUserTickets.ts`

### 117. Settings: Force Sign Out — gate on isSignedIn, use shared handleSignOut (Mar 6, 2026)

- **Issue:** Force Sign Out Pressable rendered for signed-out users and duplicated sign-out logic inline. No shared handler; duplicated flows.
- **Fix:** Extracted `handleSignOut` (setIsSigningOut, signOut, queryClient.clear, router.replace, error logging, finally setIsSigningOut). Both Sign Out and Force Sign Out call it. Force Sign Out only renders when `isSignedIn`. `disabled` tied to `isSigningOut` on both.
- **Files:** `apps/mobile/app/(tabs)/settings.tsx`

### 118. PR review batch: timezone, currency, validation, formatting (Mar 6, 2026)

- **Issue:** Multiple PR review findings: EventDetailsTab/EditEventDetailsTab/CreateEventForm used Ecuador-only timezone helpers; currency labels hardcoded "USD"; events API zod schema used loose string validation; OrganizationSettingsTab update flow did not verify row returned; useSignInHandlers sync-current-user fire-and-forget; purchase/success reconstructed fees instead of using server values; create-payment-intent lacked validateMinimumAmount; format.ts UGX mishandled; migration lacked description length CHECK; payouts hardcoded USD minimum; EventCard/EventDetail type and formatPrice issues.
- **Fix:** EventDetailsTab uses `localToUtc`/`getNowInTimezone` with `form.timezone`. EventsHero normalizes instagramHandle (trim, strip @). OrganizationSettingsTab chains `.select("id").maybeSingle()` and verifies row before success. useSignInHandlers awaits sync-current-user before router.replace. events/route.ts uses `z.enum()` from SUPPORTED_CURRENCIES/SUPPORTED_TIMEZONES. CreateEventForm uses timezone-aware conversions and dynamic currency labels. event.ts: currency/timezone required. format.ts: UGX special-cased in centsToAmount. Migration: CHECK (description <= 500). payouts/create: SUPPORTED_CURRENCIES validation, currency-aware minimum. EventsCatalog/purchase/success: formatCentsAsPrice, server fee values. create-payment-intent: validateMinimumAmount before stripe.paymentIntents.create. EditEventDetailsTab: useMemo before early return, handleSave intentional clear, TODO for timezone-aware. EventCard: toAvailability helper for isTierAvailable/hasNotStartedTiers. EventDetail: EventDetailEvent extends Event (currency/timezone required). purchase/complete: log currency fetch error.
- **Files:** `apps/mobile/components/create-event/EventDetailsTab.tsx`, `apps/mobile/components/events/EventsHero.tsx`, `apps/mobile/components/settings/OrganizationSettingsTab.tsx`, `apps/mobile/hooks/useSignInHandlers.ts`, `apps/web/app/api/events/route.ts`, `apps/web/app/components/forms/CreateEventForm.tsx`, `packages/lib/src/types/event.ts`, `packages/lib/src/utils/format.ts`, `supabase/migrations/20260307022037_add_org_profile_fields.sql`, `apps/web/app/api/organizer/payouts/create/route.ts`, `apps/web/app/components/EventsCatalog.tsx`, `apps/web/app/purchase/success/page.tsx`, `apps/web/app/api/purchase/create-payment-intent/route.ts`, `apps/mobile/components/events-management/EditEventDetailsTab.tsx`, `apps/web/app/components/EventCard.tsx`, `apps/web/app/components/EventDetail.tsx`, `apps/web/app/api/purchase/complete/route.ts`
- **Web Parity Gate (multi-currency/payment):** Web source: `apps/web/app/api/events/route.ts`, `apps/web/app/api/purchase/create-payment-intent/route.ts`, `apps/web/app/api/organizer/payouts/create/route.ts`, `apps/web/app/components/EventDetail.tsx`, `apps/web/app/purchase/success/page.tsx`. API parity: create-payment-intent uses reservation snapshot currency (hold.ticket_tiers.currency ?? hold.events.currency; rsvp tier.currency ?? event.currency). Calculation parity: format.ts centsToAmount, validateMinimumAmount, SUPPORTED_CURRENCIES. Edge cases: UGX rounding, minimum amount validation, missing currency fallback. Cross-platform: EventDetailsTab, EventDetail, purchase/success use shared lib formatCentsAsPrice and server fee values.

### 119. Vercel build: EventCard type compatibility for isTierAvailable/hasNotStartedTiers (Mar 6, 2026)

- **Issue:** EventCard passed `EventCardTicketTier[]` to `isTierAvailable` and `hasNotStartedTiers`; `per_user_limit: number | null` incompatible with lib's `number | undefined`. Build failed with type error.
- **Fix:** Added `toAvailability` helper mapping tiers to `TicketTierAvailability` (per_user_limit: t.per_user_limit ?? undefined). Both `isTierAvailable` and `hasNotStartedTiers` receive properly typed arrays.
- **Files:** `apps/web/app/components/EventCard.tsx`

### 121. VerificationCodeInput: larger OTP digit boxes with internal padding (Mar 9, 2026) **[Phase 8 / Auth P8-4]**

- **Issue:** 6-digit OTP input boxes appeared tiny and cramped; digits lacked sufficient padding, making them hard to read and tap. Design system spacing (P8-10) not met.
- **Fix:** Increased digit box height (56px → 64px), added internal padding (`px-2 py-3`), widened boxes (48px → 50px), and reduced gap (gap-2 → gap-1) to fit narrow screens. Layout remains within 327px content width on 375pt devices.
- **Files:** `apps/mobile/components/sign-in/VerificationCodeInput.tsx`

---

## Web Parity Gate (Ready-to-Paste for PR Description)

Use for any PR that ports or changes mobile logic with a web equivalent (Phase 5 complete; applies to Phase 7+ extra features). Include the following block so the PR satisfies the gate:

```md
## Web Parity Gate

### Web Source References

- **Settings menu hub:** No direct web equivalent — web uses sidebar/navigation patterns. Mobile Settings is a menu list (Account, Support, legal links) with navigation to sub-screens.
- **account.tsx (Personal/Org/Payouts tabs):** Web source: `apps/web/app/settings/page.tsx`, `UserSettings.tsx`, `OrganizerSettings.tsx`, `PayoutsSettingsTab` components. Same tab structure, same data flows.
- **support.tsx:** Web has `/faqs`, `/contact` pages; mobile opens flme.co/faqs, flme.co/contact via expo-web-browser. No API parity — static links only.
- **Sign-out flow:** Web: `lib/auth.ts` signOut + cache clear. Mobile: `signOut()` + `queryClient.clear()` + `router.replace("/(tabs)")` — same pattern.

### API Parity Evidence

- **Account tabs:** PersonalSettingsTab, OrganizationSettingsTab, PayoutsSettingsTab query Supabase directly (via useUserProfile, useOrgData, useStripeConnect) — same as web. No web API routes for these; RLS policies scope data.
- **External links (legal, support):** Web uses `<a href="...">` or `Linking`. Mobile uses `WebBrowser.openBrowserAsync(url)` — platform-appropriate; URLs match (flme.co/\*).

### Calculation Parity Evidence

- No pricing or fee calculations in Settings/Account/Support screens. PersonalSettingsTab and PayoutsSettingsTab display profile/payout data; formatting uses existing shared lib where applicable.

### Edge Case Verification

- Standard: signed-in user → Settings → Account/Support, legal links, sign out. ✓
- Free/paid flows: N/A (no checkout in these screens).
- Cancellation: N/A.

### Cross-Platform Behavior Check

- **iOS:** Settings menu → Account → tabs; Support → FAQs/Contact links; legal links open in-app browser; sign out clears and redirects. ✓
- **Android:** Same flows. ✓
- **Changed mobile artifacts:** `apps/mobile/app/(tabs)/settings.tsx`, `apps/mobile/app/account.tsx`, `apps/mobile/app/support.tsx`. Components/flows: SettingsTabs, PersonalSettingsTab, OrganizationSettingsTab, PayoutsSettingsTab, sign-out flow, route wiring to /account and /support, expo-web-browser external-link behavior.
```

---

## Appendix: Phase 6 UX Fixes Reference (#1–7, #25, #27)

Quick reference for code reviewers and developers. Full details in the numbered entries above.

| Fix | Component(s)                   | Behavioral impact                                                                                    |
| --- | ------------------------------ | ---------------------------------------------------------------------------------------------------- |
| #1  | FeaturedEvents, UpcomingEvents | EventCards navigate to `/event/[id]` via `onEventPress`                                              |
| #2  | SpotlightSection               | Spotlight CTA navigates to event detail via `onPress`                                                |
| #3  | HeroCarousel                   | Carousel taps navigate to event detail via `onEventPress`                                            |
| #4  | ExploreCategories              | Category pills navigate to `/events` via `onPress`                                                   |
| #5  | Footer                         | Links open via `openExternalLink` helper (Linking.canOpenURL + try/catch)                            |
| #6  | MenuOverlay                    | Log Out: `signOut()` + `queryClient.clear()` + `router.replace("/(tabs)")` with `isSigningOut` guard |
| #7  | SettingsTabs, settings         | Role-gated tabs (`isOrg`); `activeTab` clamped when role switches to non-org                         |
| #25 | NotificationsOverlay           | Empty state instead of mock data                                                                     |
| #27 | OrgPromoterLinksCard           | Clipboard copy instead of Alert display                                                              |

**Migration patterns:** Wire `onEventPress`/`onPress` from parent screens. Use `openExternalLink` for external links. Sign-out: `signOut()` + `queryClient.clear()` + `router.replace("/(tabs)")`. SettingsTabs: pass `isOrg={role === "org"}` (from `useUserRole()`) and clamp `activeTab` when `isOrg` becomes false.

---

### #102 — Fix: Profile image upload "Database error" due to missing JIT user sync

**Problem:** Upload route's `resolveUserFromClerk` used a manual `.single()` query that returned `PGRST116` ("0 rows") for Clerk users not yet synced to the `users` table, surfacing as a generic "Database error" on mobile.

**Root cause:** The route duplicated user lookup logic instead of using the shared `resolveDbUserFromClerkId()` from `auth.ts`, which has JIT sync (fetches Clerk user details and inserts into Supabase if missing).

**Fix:**

- `apps/web/app/api/upload-profile-image/route.ts`: Replaced custom lookup with `resolveDbUserFromClerkId()` import — now auto-creates DB user on first upload if not synced yet.
- Changed `.single()` → `.maybeSingle()` in `verifyOrgMembership` helper queries to prevent the same `PGRST116` false-positive errors.

---

## PR Review Triage (Mar 5, 2026)

### #103. upload-profile-image & upload-org-image: magic byte validation (security)

- **Issue:** Upload validation relied solely on client-controlled `file.type`, which can be spoofed. Malicious files could be stored in the public bucket.
- **Triage:** Critical (security) → Fix immediately.
- **Fix:** Added `detectMimeFromBuffer()` that validates actual file content via magic bytes (JPEG, PNG, GIF, WebP). Reject if detected type doesn't match client MIME or if content is not a valid image. Applied to both `upload-profile-image` and `upload-org-image` routes.
- **Files:** `apps/web/app/api/upload-profile-image/route.ts`, `apps/web/app/api/upload-org-image/route.ts`

### #104. PersonalSettingsTab: explicit error handling when getToken is falsy

- **Issue:** `handleEditProfilePhoto` and `handleDeleteProfilePhoto` silently returned when `getToken` was falsy; no user feedback, UI appeared broken.
- **Triage:** Standard bugs & code quality (error resilience) → Fix in current PR.
- **Fix:** Both handlers now check `getToken` at the top; when falsy, log with `{ reason: "missing auth token" }` and show `Alert.alert("Authentication Required", "...")` instead of silently returning.
- **Files:** `apps/mobile/components/settings/PersonalSettingsTab.tsx`

### #105. split/pop pattern ineffective for malformed profile image URLs

- **Issue:** `url.split("/object/public/profile-images/").pop()` always returns a truthy string when the delimiter is absent (split returns single-element array, pop returns that full path). The `if (!storagePath)` guard was dead; bogus paths could be sent to the server; server's `?? null` was dead code.
- **Triage:** Standard bug (logic error) → Fix in current PR.
- **Fix:** Check `parts.length >= 2` before using `pop()` — if delimiter wasn't found, treat as invalid. Client: throw "Invalid profile image URL; cannot extract storage path" before API call. Server: set `storedPath = null` when extraction fails, so DB match logic correctly skips update.
- **Files:** `apps/mobile/components/settings/PersonalSettingsTab.tsx`, `apps/web/app/api/upload-profile-image/route.ts`

---

## PR Review Triage (Mar 5, 2026 — continued)

### #106. PersonalSettingsTab: normalize fallback MIME (ext/mimeType)

- **Issue:** Fallback MIME `image/${ext}` could produce inconsistent casing (e.g., `image/JPG`) or `image/jpg`; strict servers expect `image/jpeg`.
- **Triage:** Standard bug & code quality → Fix in current PR.
- **Fix:** Lowercase extracted extension (`match[1].toLowerCase()`), map both `jpg` and `jpeg` to canonical `jpeg` for MIME, set `mimeType = asset.mimeType ?? image/${normalizedExt}`.
- **Files:** `apps/mobile/components/settings/PersonalSettingsTab.tsx`

### #107. upload-profile-image: wrap rollback remove in try/catch

- **Issue:** `supabaseAdmin.storage.from("profile-images").remove([data.path])` on DB update failure could throw or return errors; orphaned files were not surfaced in logs.
- **Triage:** Standard bugs & code quality → Fix in current PR.
- **Fix:** Wrapped both remove calls (personal and company branches) in try/catch; log `{ path, action, error }` when remove fails or throws so orphaned files are visible.
- **Files:** `apps/web/app/api/upload-profile-image/route.ts`

### #108. upload-profile-image & upload-org-image: image/jpg alias rejection

- **Issue:** `detectMimeFromBuffer` returns canonical `image/jpeg`; clients may send `image/jpg`. Strict equality `mimeType !== clientMime` rejected valid JPEG uploads.
- **Triage:** Standard bug → Fix in current PR.
- **Fix:** Added `normalizeMimeToCanonical()` mapping `image/jpg` → `image/jpeg`. Use normalized values for equality check and for `ALLOWED_MIME_TYPES.includes(clientMimeLower)` so both aliases pass validation.
- **Files:** `apps/web/app/api/upload-profile-image/route.ts`, `apps/web/app/api/upload-org-image/route.ts`

### #109. Deferred nitpick (Mar 5, 2026)

- **IMAGE_SIGNATURES and detectMimeFromBuffer duplication:** Extract to shared utility → `docs/todos/NITPICKS_TODOS.md`

### #110. Push Notifications: Database schema (Mar 4, 2026)

- **Feature:** Created `push_tokens` table (Expo push token storage, multi-device per user, unique constraint on user_id+token) and `notifications` table (notification history for in-app display, with type/title/body/data/read fields). Added `notification_preferences` jsonb column to `users` table (per-type opt-in/opt-out, defaults all enabled). Full RLS policies using `auth.jwt() ->> 'sub'` pattern.
- **Migration:** `20260304155846_add_push_tokens_and_notifications.sql`
- **Files:** `supabase/migrations/20260304155846_add_push_tokens_and_notifications.sql`

### #111. Push Notifications: Mobile infrastructure (Mar 4, 2026)

- **Feature:** Installed `expo-notifications` + `expo-device`. Added `expo-notifications` plugin to `app.json`. Created `lib/notifications.ts` (permission request, Expo push token retrieval, foreground handler, server registration). Created `hooks/useNotificationRegistration.ts` (auto-registers on sign-in, handles deep link navigation on tap). Wired into `_layout.tsx` via `AppShell` inner component (inside ClerkProvider).
- **Files:** `apps/mobile/lib/notifications.ts`, `apps/mobile/hooks/useNotificationRegistration.ts`, `apps/mobile/app/_layout.tsx`, `apps/mobile/app.json`, `apps/mobile/metro.config.js`

### #112. Push Notifications: Web token registration API (Mar 4, 2026)

- **Feature:** Created `POST /api/push-tokens/register` endpoint. Validates `expoPushToken` (required), optional `deviceId`/`platform`. Authenticates via Clerk, resolves DB user, upserts into `push_tokens` table.
- **Files:** `apps/web/app/api/push-tokens/register/route.ts`

### #113. Push Notifications: Server-side dispatch utility (Mar 4, 2026)

- **Feature:** Created `lib/push-notifications.ts` with `sendPushNotification` (single user, all devices), `sendPushToOrgMembers` (all org members), `sendPushToEventTicketHolders` (all ticket holders, deduplicated). Each function checks user notification preferences before sending, inserts into `notifications` table for in-app history, and sends via Expo Push Service API with batching (100/request) and optional `EXPO_ACCESS_TOKEN` auth.
- **Files:** `apps/web/app/lib/push-notifications.ts`

### #114. Push Notifications: Wired to email trigger points (Mar 4, 2026)

- **Feature:** Added push notification calls alongside existing email sends:
  - `rsvp_approved` → `api/organizer/rsvps/[id]/approve/route.ts`
  - `rsvp_rejected` → `api/organizer/rsvps/[id]/reject/route.ts`
  - `rsvp_pending` + `new_rsvp_request` → `api/rsvp/route.ts`
  - `event_date_changed` → `api/events/route.ts` (PATCH)
  - `ticket_sold` → `lib/orders.ts`
- All push calls are fire-and-forget (`.catch()`) to not block the HTTP response. **Known limitation:** Push failures are caught and logged to `console.error` (prefixed `[push]`) but not retried. No retry/backoff, queueing, or external alerting is implemented yet. For production observability, consider adding structured logging to a monitoring service and/or implementing an outbox table + worker pattern for guaranteed delivery. Current approach is acceptable for launch — email remains the primary delivery channel and push is supplementary.
- **Files:** `apps/web/app/api/organizer/rsvps/[id]/approve/route.ts`, `apps/web/app/api/organizer/rsvps/[id]/reject/route.ts`, `apps/web/app/api/rsvp/route.ts`, `apps/web/app/api/events/route.ts`, `apps/web/app/lib/orders.ts`

### #115. Push Notifications: Authorization expiry notification (Mar 4, 2026)

- **Feature:** Replaced `notifyOrganizerForAuthorizationExpiry` stub in `monitor-payment-authorizations` cron with real implementation. Sends `auth_expiry_warning` push notification to org owner + Brevo email with HTML template showing event name, hours remaining, and review CTA link.
- **Files:** `apps/web/app/api/cron/monitor-payment-authorizations/route.ts`

### #116. Push Notifications: Mobile overlay with real data (Mar 4, 2026)

- **Feature:** Created `hooks/useNotifications.ts` (fetches from `notifications` table via Supabase, mark as read, mark all as read). Rewrote `NotificationsOverlay.tsx` with real data (FlatList, pull-to-refresh, "Mark all read" button, empty state). Rewrote `NotificationCard.tsx` to handle all 8 notification types with per-type icons/colors and time-ago formatting. Added unread badge (red dot with count) to `Header.tsx` bell icon.
- **Files:** `apps/mobile/hooks/useNotifications.ts`, `apps/mobile/components/notifications/NotificationsOverlay.tsx`, `apps/mobile/components/notifications/NotificationCard.tsx`, `apps/mobile/components/home/Header.tsx`, `apps/mobile/app/_layout.tsx`

### #117. Push Notifications: Event reminders cron (Mar 4, 2026)

- **Feature:** Created `api/cron/event-reminders/route.ts` — runs every 6 hours, finds events starting within 24h, sends `event_reminder` push to all ticket holders. Deduplicates via `notifications` table (skips users who already received a reminder for the same event). Added to `vercel.json` crons.
- **Files:** `apps/web/app/api/cron/event-reminders/route.ts`, `apps/web/vercel.json`

### #118. Push Notifications: User notification preferences (Mar 4, 2026)

- **Feature:** Created `hooks/useNotificationPreferences.ts` (reads/writes `notification_preferences` on `users` table). Added "Notifications" section to `PersonalSettingsTab.tsx` with per-type toggle switches (8 types: RSVP received/approved/rejected, date changes, event reminders, new RSVP requests, ticket sales, payment expiry). Server-side `sendPushNotification` checks preferences before sending.
- **Files:** `apps/mobile/hooks/useNotificationPreferences.ts`, `apps/mobile/components/settings/PersonalSettingsTab.tsx`

### #119. Push Notifications: Post-implementation hardening (Mar 4, 2026)

- **Issue:** Multiple defensive-coding issues in the push notification code from #110–#118.
- **Triage:** Standard bugs & code quality → Fix in current PR.
- **Fixes:**
  1. `NotificationCard.tsx` `formatTimeAgo`: Added `Number.isNaN` guard for invalid date strings and `Math.max(0, ...)` clamp on diff to handle future timestamps.
  2. `PersonalSettingsTab.tsx`: Added `?? true` fallback on `Switch` value prop to prevent uncontrolled-component warning if DB returns `null` for a preference key.
  3. `useNotificationPreferences.ts`: Captured `prevPreferences` into a local variable before optimistic update so the rollback in `catch` always references the correct pre-update value. Added RLS-reliance comments on SELECT/UPDATE.
  4. `useNotifications.ts` `markAsRead`: Only decrement `unreadCount` when the targeted notification was previously unread (checked via `wasUnread` flag inside `setNotifications` updater).
  5. `package.json`: Downgraded `expo-device` from `^55.0.9` to `~8.0.10` and `expo-notifications` from `^55.0.10` to `~0.32.16` for SDK 54 compatibility.
  6. `push-tokens/register/route.ts`: Replaced `supabaseAdmin!` non-null assertion with explicit null guard returning 500 response, matching other API routes.
  7. `MARCH_2026_FIXES.md` #114: Expanded fire-and-forget documentation with known-limitation callout, logging details, and future mitigation guidance.
- **Files:** `apps/mobile/components/notifications/NotificationCard.tsx`, `apps/mobile/components/settings/PersonalSettingsTab.tsx`, `apps/mobile/hooks/useNotificationPreferences.ts`, `apps/mobile/hooks/useNotifications.ts`, `apps/mobile/package.json`, `apps/web/app/api/push-tokens/register/route.ts`, `docs/fixes/MARCH_2026_FIXES.md`

### #120. PR Review: Notifications & Push Hardening (Mar 5, 2026)

- **Triage:** Standard bugs & code quality per `project-flame-master.mdc` Section 2.
- **Fixes:**
  1. **AppShell/NotificationsOverlay unsynced state:** AppShell and NotificationsOverlay each called `useNotifications()` separately, causing header badge to stay stale after marking notifications read. Single source: call `useNotifications()` once in AppShell, pass `notificationsState` to NotificationsOverlay via props.
  2. **NotificationCard timestamp typography:** Replaced `text-[10px]` with design token `text-xs leading-4 font-poppins-light` (Subtitle2).
  3. **PersonalSettingsTab Switch design tokens:** Replaced hardcoded `#FF0000`, `rgba(255,255,255,0.1)`, `#F9FBFE` with `colors.primary`, `colors["white-10"]`, `colors["white-100"]`. Added `white-10` to `packages/ui/theme/colors.ts`.
  4. **NotificationsOverlay & useNotificationRegistration deepLink validation:** Added `isInternalPath` guard (string, startsWith("/")) before `router.push` to restrict routing to internal paths and avoid external/malformed URLs.
  5. **useNotificationRegistration hasRegistered:** Set `hasRegistered.current = true` only after `registerForPushNotificationsAsync` resolves successfully; on failure keep false so retries can occur.
  6. **useNotifications sign-out state clearing:** Early-return in `fetchNotifications` when `!isSignedIn` now clears `notifications`, `unreadCount`, `error`, `isLoading` to avoid stale data.
  7. **useNotifications Supabase update errors:** Both `markAsRead` and `markAllAsRead` now capture `{ error }` from Supabase update, check for error before applying optimistic state, and log on failure.
  8. **notifications.ts apiPost propagation:** On registration failure, rethrow so `useNotificationRegistration` can retry. Wrapped permission/channel setup in try/catch with clear error logging.
  9. **monitor-payment-authorizations events query:** Check and log `eventError` from events fetch; wrapped `sendPushNotification` in try/catch and rethrow so caller can rollback `last_notified_at` on failure.
  10. **event-reminders dedupe query:** Capture `dedupeError`, log and `continue` to skip event on query failure.
  11. **events route date change push:** Moved `sendPushToEventTicketHolders` outside `orders.length > 0` so all ticket holders (from tickets table) receive push when date changes, not just those with completed orders.
  12. **push-tokens register Expo validation:** Added `expo-server-sdk`; `registerSchema` now uses `z.refine(Expo.isExpoPushToken)` for token validation.
  13. **push-notifications.ts:** `isNotificationEnabled` wrapped in try/catch, checks `{ error }` from Supabase query, returns false on error (fail closed). Insert captures `{ error }`, logs and throws on failure. `sendPushNotification` rethrows in catch so callers can react.
- **Deferred to EDGE_CASES_TODOS.md:** migration `read`/`created_at` NOT NULL; migration `expo_push_token` globally unique.
- **Deferred to NITPICKS_TODOS.md:** NotificationType extraction to shared lib; useNotificationPreferences updatePreference functional update (stale closure); event-reminders bounded parallelism; rsvp currentUser() removal; migration composite index.
- **Files:** `apps/mobile/app/_layout.tsx`, `apps/mobile/components/notifications/NotificationsOverlay.tsx`, `apps/mobile/components/notifications/NotificationCard.tsx`, `apps/mobile/components/settings/PersonalSettingsTab.tsx`, `apps/mobile/hooks/useNotificationRegistration.ts`, `apps/mobile/hooks/useNotifications.ts`, `apps/mobile/lib/notifications.ts`, `apps/web/app/api/cron/monitor-payment-authorizations/route.ts`, `apps/web/app/api/cron/event-reminders/route.ts`, `apps/web/app/api/events/route.ts`, `apps/web/app/api/push-tokens/register/route.ts`, `apps/web/app/lib/push-notifications.ts`, `packages/ui/src/theme/colors.ts`

### #121. PR Review: Push notifications & NotificationsOverlay (Mar 5, 2026)

- **Triage:** Standard bugs & code quality; design system compliance; edge case (fetch hardening).
- **Fixes:**
  1. **push-notifications token lookup:** Log before early return when `tokenError` or `!tokens?.length`; include `userId`, `type`, `eventId`, `tokenError`, `tokenCount` for debugging.
  2. **Promise.allSettled rejections:** Both `sendPushToOrgMembers` and `sendPushToEventTicketHolders` now iterate settled results, log detailed errors for rejections (user_id/eventId, type, reason).
  3. **sendToExpoPushService:** Added AbortController with 10s timeout; parse JSON response even when `response.ok`; iterate `data[]` to detect `status === "error"` per-ticket and log `message`/`details`; wrap JSON parse in try/catch; clear timeout on completion/error.
  4. **NotificationsOverlay design tokens:** Replaced hardcoded `#F9FBFE`, `#FF0000`, `rgba(255,255,255,0.3)` with `colors["white-100"]`, `colors.primary`, `colors["white-30"]` for close icon, ActivityIndicator, notifications-off icon, RefreshControl.
- **Files:** `apps/web/app/lib/push-notifications.ts`, `apps/mobile/components/notifications/NotificationsOverlay.tsx`

### #122. PR Review: Cron GET, hasRegistered, error handling (Mar 5, 2026)

- **Triage:** Critical (hasRegistered sign-out); Standard (error handling, Vercel cron); Nitpick (subcomponent extraction deferred).
- **Fixes:**
  1. **useNotificationRegistration hasRegistered sign-out reset:** When `isSignedIn` transitions to `false`, reset `hasRegistered.current = false` so a different user signing in gets their push token registered. Root layout never unmounts, so ref previously persisted forever.
  2. **event-reminders Vercel Cron GET:** Vercel Cron invokes with GET. Added `GET` export alongside `POST`; both validate CRON_SECRET and call shared `runEventReminders()`.
  3. **NotificationsOverlay unhandled rejections:** Wrapped `refresh()`, `markAsRead()`, `markAllAsRead()` in try/catch or `.catch()` in useEffect, handleNotificationPress, Mark-all-read Pressable, and RefreshControl onRefresh.
  4. **push-notifications fanout query errors:** Both `organization_members` and `tickets` fanout queries now log with context (orgId/eventId, type) before returning on error.
  5. **push-notifications token lookup:** Separated `tokenError` (log as error) from `!tokens?.length` (log as info: "no registered devices") with distinct log levels.
- **Deferred to NITPICKS_TODOS.md:** NotificationsOverlay extract NotificationHeader, NotificationList, animation wrapper subcomponents.
- **Files:** `apps/mobile/hooks/useNotificationRegistration.ts`, `apps/web/app/api/cron/event-reminders/route.ts`, `apps/mobile/components/notifications/NotificationsOverlay.tsx`, `apps/web/app/lib/push-notifications.ts`

### #123. PR Review: Tickets error log, fail closed, design token, NotificationType (Mar 5, 2026)

- **Triage:** Standard bugs (error logging, fail closed); design system compliance; nitpick (NotificationType extraction — implemented).
- **Fixes:**
  1. **event-reminders tickets query:** Log `ticketsError` with event.id and event.name before `continue`; separate error branch from empty-result branch.
  2. **push-notifications isNotificationEnabled:** When `supabaseAdmin` is missing, return false (fail closed) instead of true; add warning log.
  3. **NotificationsOverlay bg:** Replaced hardcoded `bg-[#292D32]` with design token `bg-surface`.
  4. **NotificationType extraction:** Added `packages/lib/src/types/notification.ts`; exported from `@project-flame/lib`; updated `push-notifications.ts` and `useNotificationPreferences.ts` to import from shared package.
- **Files:** `apps/web/app/api/cron/event-reminders/route.ts`, `apps/web/app/lib/push-notifications.ts`, `apps/mobile/components/notifications/NotificationsOverlay.tsx`, `apps/mobile/hooks/useNotificationPreferences.ts`, `packages/lib/src/types/notification.ts`, `packages/lib/src/types/index.ts`, `packages/lib/src/index.ts`

### #124. PR Review: Bounded parallelism, supabaseAdmin log, structured errors (Mar 5, 2026)

- **Triage:** Standard (bounded parallelism, observability); Nitpick (structured logs — implemented).
- **Fixes:**
  1. **push-notifications bounded parallelism:** Chunk members/uniqueUserIds into batches of 10; sequentially await `Promise.allSettled` per chunk for both `sendPushToOrgMembers` and `sendPushToEventTicketHolders` to avoid overloading DB/Expo at scale.
  2. **push-notifications supabaseAdmin early return:** Log warning with `action`, `orgId`/`eventId`, `type` before returning when supabaseAdmin is missing in both fanout functions.
  3. **NotificationsOverlay structured error logs:** Replace string-only `console.error` with objects `{ action, notificationId?, deepLink?, error }` for refresh, markAsRead, markAllAsRead, openDeepLink handlers.
- **Files:** `apps/web/app/lib/push-notifications.ts`, `apps/mobile/components/notifications/NotificationsOverlay.tsx`

### #125. PR Review: event-reminders metrics, useNotifications impurity, updatePreference error (Mar 5, 2026)

- **Triage:** Standard bugs (metrics inflation, React purity, Supabase error handling).
- **Fixes:**
  1. **event-reminders opted-out users:** `sendPushNotification` returns early (no throw) when user disabled event_reminder → totalSent was inflated; opted-out users were re-attempted every cron run (no notification record for dedupe). Fixed: (a) `sendPushNotification` now returns `boolean` (true when sent, false when skipped); (b) pre-filter opted-out users in cron via `notification_preferences` query, skip and add to totalSkipped; (c) only increment totalSent when `sent === true`.
  2. **useNotifications markAsRead impurity:** `setUnreadCount` was called inside `setNotifications` updater (side effect). In Strict Mode, double invocation caused double-decrement. Fixed: derive `unreadCount` from `notifications` via `useMemo`; removed separate `unreadCount` state and `setUnreadCount` calls.
  3. **useNotificationPreferences updatePreference:** Supabase `.update()` returns `{ data, error }` — error was never checked. Failed DB updates left optimistic UI uncorrected. Fixed: destructure `{ error }`, check and rollback on error (setPreferences(prevPreferences)).
- **Files:** `apps/web/app/lib/push-notifications.ts`, `apps/web/app/api/cron/event-reminders/route.ts`, `apps/mobile/hooks/useNotifications.ts`, `apps/mobile/hooks/useNotificationPreferences.ts`

### #126. RSVP badge on event cards + darken date badge (Mar 4, 2026)

- **Feature:** RSVP events now display a red "RSVP" tag on the top-right of the event image, matching the web's `event-card__rsvp-tag` / `catalog-event-rsvp-tag` pattern. Darkened the date badge background from `rgba(55,55,55,0.1)` to `rgba(0,0,0,0.55)` for better visibility on light event images.
- **Changes:**
  1. **EventCardData interface:** Added optional `isRsvp?: boolean` field (backward-compatible).
  2. **EventCard (vertical card):** Added `RsvpBadge` sub-component — top-right, `bg-primary`, `rounded-badge`, same size/position pattern as `DateBadge`. When `isRsvp` is true, RSVP badge replaces the bookmark button position.
  3. **EventListCard (horizontal card):** Wrapped image in a `View` container with `relative` positioning; added a smaller RSVP badge overlay (9px font) proportional to the 100x100 image.
  4. **useAppEvents mapper:** Populates `isRsvp: Boolean(event.requires_rsvp)` from the Supabase event data.
- **Files:** `packages/ui/src/components/EventCard.tsx`, `packages/ui/src/components/EventListCard.tsx`, `apps/mobile/hooks/useAppEvents.ts`

#### Web Parity Gate (#126)

- **Web equivalents:** `apps/web/app/components/EventCard.tsx`, `apps/web/app/components/EventsCatalog.tsx`, `apps/web/app/styles/components/events.css` (`.event-card__rsvp-tag`). (As of Mar 4, 2026; line numbers may drift.)
- **API parity:** Mobile reads `event.requires_rsvp` from Supabase via `useAppEvents`; web reads same field. Mobile components: `packages/ui/src/components/EventCard.tsx`, `packages/ui/src/components/EventListCard.tsx`, `apps/mobile/hooks/useAppEvents.ts`. Same boolean display logic.
- **Calculation parity:** N/A — display-only (boolean `isRsvp`).
- **Edge cases verified:** `requires_rsvp` null/undefined → `Boolean()` yields false, no badge. Both card variants render badge when true.
- **Cross-platform behavior:** RSVP tag shown on both vertical (EventCard) and horizontal (EventListCard) layouts when `isRsvp` is true; web uses CSS classes on catalog and hero cards.

### #127. notifications.ts: guard missing EAS projectId before getExpoPushTokenAsync (Mar 4, 2026)

- **Issue:** `getExpoPushTokenAsync` threw `No "projectId" found` error every time the app launched because `app.json` has no `extra.eas.projectId` (EAS not initialized). The error was caught but logged as `console.error`, spamming the console with a scary-looking stack trace on every app start.
- **Fix:** Check `projectId` before calling `getExpoPushTokenAsync`; when missing, log a single `console.warn` with instructions to run `eas init` and return `null` without throwing. Eliminates the noisy error while the project is still in Expo Go / pre-EAS setup.
- **Files:** `apps/mobile/lib/notifications.ts`

### #128. Remove dead bookmark button from event cards (Mar 4, 2026)

- **Issue:** PR review flagged inconsistency: `EventCard` suppressed `onBookmark` for RSVP events (`!event.isRsvp`), but `EventListCard` rendered the bookmark button unconditionally. Since bookmarking is not implemented (deferred in #28), all call sites passed placeholder `console.log` handlers.
- **Fix:** Removed `onBookmark` prop from `EventCard`, `EventListCard`, `EventsList`, `EventsScreenBody`, and `EventsSection`. Removed placeholder `onBookmark` handlers from `events.tsx` and `organizer/[slug].tsx`. Bookmark can be re-added when the backend is implemented.
- **Files:** `packages/ui/src/components/EventCard.tsx`, `packages/ui/src/components/EventListCard.tsx`, `apps/mobile/components/events/EventsList.tsx`, `apps/mobile/components/events/EventsScreenBody.tsx`, `apps/mobile/components/home/EventsSection.tsx`, `apps/mobile/app/events.tsx`, `apps/mobile/app/organizer/[slug].tsx`

### #129. useNotifications: fix "Maximum update depth exceeded" when not signed in (Mar 4, 2026)

_Note: Entries #129–#132 are cumulative fixes to the same module (`useNotifications`) applied iteratively during PR review; they are sequential, not alternative._

- **Issue:** App crashed with infinite loop when user was not signed in. `fetchNotifications` runs in useEffect; when `!isSignedIn` it called `setNotifications([])`. Each `[]` is a new reference, so React schedules a re-render. Combined with Clerk's `getToken`/`isSignedIn` potentially changing identity during hydration, the effect kept re-running and re-setting state, causing "Maximum update depth exceeded."
- **Fix:** Use functional update `setNotifications(prev => prev.length === 0 ? prev : [])` when clearing for signed-out state. Returning the same `prev` reference when already empty signals React to bail out (no state change), breaking the render loop.
- **Files:** `apps/mobile/hooks/useNotifications.ts`

### #130. useNotifications: hasLoadedOnce reset on sign-out, set in finally (Mar 4, 2026)

- **Issue:** PR review: `hasLoadedOnce` could remain true across sign-out or failed first fetches, causing stale "initial load" behavior (e.g., sign-out → sign-in wouldn't show centered loading spinner; failed first fetch wouldn't mark attempt as completed).
- **Fix:** (1) Reset `hasLoadedOnce.current = false` in the `!isSignedIn` early-return branch so sign-out clears it; (2) Move `hasLoadedOnce.current = true` from the success path into the `finally` block so it runs on both success and failure, ensuring initial-load detection is accurate.
- **Files:** `apps/mobile/hooks/useNotifications.ts`

### #131. useNotifications: request-version guard to prevent stale in-flight responses (Mar 4, 2026)

- **Issue:** PR review: An older in-flight request could complete after an auth change and overwrite state (e.g., sign-out clears notifications, then stale success response sets them back; or user switch causes request A to overwrite request B's result).
- **Fix:** Add `requestVersion` ref, increment at start of fetch, capture into local `version` before any await. Before each state write after an await (setNotifications, setError, setIsLoading, hasLoadedOnce.current), check `requestVersion.current !== version` and return early if stale. Guards placed after getAuthenticatedClient, after the Supabase query, in the catch block, and in the finally block.
- **Files:** `apps/mobile/hooks/useNotifications.ts`

### #132. useNotifications: increment requestVersion on sign-out; guard finally with positive condition (Mar 4, 2026)

- **Issue:** PR review: (1) Sign-out branch didn't increment requestVersion, so in-flight requests could still match the stale version and overwrite cleared state after logout; (2) Using `return` in the finally block could suppress exception flow clarity — prefer guarding cleanup with a positive condition.
- **Fix:** (1) Add `requestVersion.current += 1` at the start of the `!isSignedIn` branch so pending responses fail the version check; (2) Replace `if (requestVersion.current !== version) return;` in finally with `if (requestVersion.current === version) { ... }` around the cleanup logic.
- **Files:** `apps/mobile/hooks/useNotifications.ts`

### #133. useNotifications: structured error logging in catch block (Mar 4, 2026)

- **Issue:** PR review: The catch block's `console.error` lacked context for debugging and monitoring.
- **Fix:** Replace with structured log object: `{ action: "fetchNotifications", userId, version, currentVersion: requestVersion.current, error }`. Added `userId` from `useOptionalAuth`; use `userId ?? undefined` so logs omit the key when null.
- **Files:** `apps/mobile/hooks/useNotifications.ts`

### #134. Notifications: extract to standalone screen with role-based filtering (Mar 4, 2026)

- **Issue:** Notification preferences were embedded inside PersonalSettingsTab (Account → Personal). Org-specific notification types (New RSVP Requests, Ticket Sales, Payment Expiry) were visible to regular users.
- **Fix:** Created `app/notifications-settings.tsx` as a standalone screen. Added "Notifications" menu item to the settings screen. Split notification types into "General" (user-facing) and "Organizer" sections; org-only items are hidden when `useUserRole()` returns `"user"`. Removed notifications section from `PersonalSettingsTab.tsx`.
- **Files:** `apps/mobile/app/notifications-settings.tsx` (new), `apps/mobile/app/(tabs)/settings.tsx`, `apps/mobile/components/settings/PersonalSettingsTab.tsx`

### #135. useNotifications: retry on JWT expired (PGRST303) error (Mar 4, 2026)

- **Issue:** Terminal log showed `PGRST303: JWT expired` error during notification fetch. The Clerk-issued JWT could expire between `getToken()` and Supabase query execution.
- **Fix:** Wrapped fetch logic in `attemptFetch(isRetry)`. On first attempt, if the Supabase query returns error code `PGRST303` or message contains "jwt expired", retry once (which calls `getToken` again for a fresh JWT). On retry, errors are thrown normally.
- **Files:** `apps/mobile/hooks/useNotifications.ts`

### #136. Settings sub-screens: remove redundant safe area top padding (Mar 4, 2026)

- _Superseded by: #144, #147._ Later changes reintroduced `style={{ paddingTop: insets.top + 8 }}` for account.tsx, support.tsx, and notifications-settings.tsx (notched iOS).
- **Issue:** `account.tsx` and `support.tsx` added `paddingTop: insets.top + 8` for their headers, but they render inside the Stack navigator below the global Header (which already handles safe area). This created a massive gap between the Header and the screen content.
- **Fix:** Removed `insets.top` from both screen headers. Use simple `pt-2 pb-3` padding instead.
- **Files:** `apps/mobile/app/account.tsx`, `apps/mobile/app/support.tsx`

### #137. Add bottom padding on Home screen and support screen (Mar 4, 2026)

- **Issue:** After footer removal, Home screen had `pb-0` with no `contentContainerStyle` bottom padding, causing content to be too close to the bottom. Support screen had only `Math.max(16, ...)` which was inconsistent.
- **Fix:** Added `contentContainerStyle={{ paddingBottom: Math.max(40, insets.bottom + 16) }}` to Home screen's ScrollView. Updated support screen to use `Math.max(40, ...)` matching other screens. Removed `pb-0` from home content View.
- **Files:** `apps/mobile/app/(tabs)/index.tsx`, `apps/mobile/app/support.tsx`

### #138. Unify pull-to-refresh spinner color across all screens (Mar 4, 2026)

- **Issue:** RefreshControl `tintColor` was inconsistent: some screens used `colors.primary` (brand red), others used `"#F9FBFE"` (white) or `colors["white-100"]`.
- **Fix:** Unified RefreshControl across affected screens. _Superseded by #147: canonical tintColor is `#FFFFFF` (not colors.primary); iOS UIRefreshControl requires pure white for visibility on dark backgrounds._
- **Files:** `apps/mobile/app/(tabs)/org-dashboard.tsx`, `apps/mobile/app/(tabs)/events-management.tsx`, `apps/mobile/app/(tabs)/rsvp-management.tsx`, `apps/mobile/app/org-event-detail.tsx`, `apps/mobile/app/rsvp-detail.tsx`

### #139. Past events accordion on all dashboard/management screens (Mar 4, 2026)

- **Issue:** Org Dashboard and User Dashboard (My Tickets) only showed current/upcoming events. Events Management and RSVP Management showed past events in a flat list with no collapse.
- **Fix:** Created reusable `PastItemsAccordion` component with expand/collapse animation. Added past events to Org Dashboard and User Dashboard (My Tickets). Wrapped past events in Events Management and RSVP Management with the accordion. Past events are collapsed by default.
- **Files:** `apps/mobile/components/shared/PastItemsAccordion.tsx` (new), `apps/mobile/app/(tabs)/org-dashboard.tsx`, `apps/mobile/app/(tabs)/dashboard.tsx`, `apps/mobile/app/(tabs)/rsvp-management.tsx`, `apps/mobile/components/events-management/EventsListView.tsx`

### #140. Unify card text sizes and simplify ticket tier display (Mar 4, 2026)

- **Issue:** RsvpEventCard used `text-base` for "Pending requests" while ManageEventCard and OrgEventCard used `text-sm`. ManageEventCard showed `ticketTierCount/ticketTierName` which was cluttered.
- **Fix:** Changed RsvpEventCard "Pending requests" text to `text-sm leading-5` to match ManageEventCard. Changed ManageEventCard ticket tiers display to show only the count (removed tier name). Unified section header text sizes to `text-sm leading-5` in events management and RSVP management screens.
- **Files:** `apps/mobile/components/org-dashboard/RsvpEventCard.tsx`, `apps/mobile/components/events-management/ManageEventCard.tsx`, `apps/mobile/app/(tabs)/org-dashboard.tsx`, `apps/mobile/app/(tabs)/rsvp-management.tsx`, `apps/mobile/components/events-management/EventsListView.tsx`

### #141. Event detail page: add bottom padding (Mar 4, 2026)

- **Issue:** Event detail screen (`event/[id].tsx`) had no `contentContainerStyle` bottom padding, causing content to sit too close to the bottom edge.
- **Fix:** Added `contentContainerStyle={{ paddingBottom: Math.max(40, insets.bottom + 16) }}` to the ScrollView, matching the pattern used by all other scrollable screens.
- **Files:** `apps/mobile/app/event/[id].tsx`

### #142. Settings sign-out button: fix invisible text due to FlameText base color (Mar 4, 2026)

- **Issue:** The Sign Out / Sign In button on the Settings screen appeared to have no text. `FlameText` has a hardcoded `text-white-100` base class that competes with the `text-dark` override passed via className. NativeWind can resolve the base class over the consumer's override, producing white text on a white (`bg-white-100`) button. Same issue found in `FilterBottomSheet`'s "Apply Filters" button.
- **Fix:** Replaced `FlameText` with a plain `<Text>` component for buttons that need `text-dark`, ensuring no competing base color class.
- **Files:** `apps/mobile/app/(tabs)/settings.tsx`, `apps/mobile/components/events/FilterBottomSheet.tsx`

### #143. RSVP detail: remove redundant inline refetching spinner (Mar 4, 2026)

- **Issue:** RSVP detail screen had an extra `ActivityIndicator` overlay (absolute-positioned at top of content) that showed during refetch, in addition to the `RefreshControl` spinner. No other screen had this pattern, making the loading feedback inconsistent.
- **Fix:** Removed the inline `isRefetching` overlay. The `RefreshControl` spinner handles the refresh feedback. _Canonical tintColor is `#FFFFFF` per #147._
- **Files:** `apps/mobile/app/rsvp-detail.tsx`

### #144. Account screen header: safe-area top inset (Mar 5, 2026)

- **Issue:** Header View in `account.tsx` used fixed `pt-2`, causing back button and "Account" title to be obscured on notched iOS devices.
- **Fix:** Replaced `pt-2` with `style={{ paddingTop: insets.top + 8 }}` on the header View (containing Pressable, Ionicons, FlameText). Uses same `insets` from `useSafeAreaInsets()` as the ScrollView for consistency.
- **Files:** `apps/mobile/app/account.tsx`

### #145. OrganizationSettingsTab: validated storage path extraction for logo delete (Mar 5, 2026)

- **Superseded by: #147, #148.** The original fix skipped invalid storage paths (no API call). Later changes (#147, #148) replaced this with throw-on-invalid: parse failures or falsy storagePath now throw, the outer catch shows "Delete Failed" to the user, and `queryClient.invalidateQueries` runs only after successful apiDelete.
- **Issue:** `urlObj.pathname.split("/object/public/organization-images/").pop()` returns the full pathname when the delimiter is absent (single-element array, pop returns that element). Bogus paths could be sent to apiDelete.
- **Fix:** Split into parts, check `parts.length >= 2 && parts[1]` before using `parts[1]` as storagePath. Only call `apiDelete` when a validated `storagePath` exists; otherwise skip the API call.
- **Files:** `apps/mobile/components/settings/OrganizationSettingsTab.tsx`

### #146. Org screens: RefreshControl position — DashboardBar in normal flow (Mar 5, 2026)

- **Issue:** Native RefreshControl spinner appeared in the wrong place (between Flame logo and notification icon in the global header) on org-dashboard, events-management, rsvp-management. Home screen showed the correct progressive pull-to-refresh below the header.
- **Root cause:** DashboardBar was absolutely positioned (`absolute z-10`), overlaying the ScrollView. The native RefreshControl spinner appeared at the top of the ScrollView, which was behind/within the header area.
- **Fix:** Put DashboardBar in normal layout flow (removed `absolute`). ScrollView now sits below the bar. Native RefreshControl appears below the bar with progressive pull-to-refresh like Home. Use `tintColor="#FFFFFF"` (see #147 for design exception). Removed RefreshOverlay component. Deleted `RefreshOverlay.tsx`.
- **Files:** `apps/mobile/app/(tabs)/org-dashboard.tsx`, `apps/mobile/app/(tabs)/events-management.tsx`, `apps/mobile/app/(tabs)/rsvp-management.tsx`, `apps/mobile/app/rsvp-detail.tsx`, `apps/mobile/app/org-event-detail.tsx`, `apps/mobile/components/shared/RefreshOverlay.tsx` (deleted)

### #147. PR Review: design tokens, auth gating, error resilience, safe area (Mar 5, 2026)

- **Triage:** Standard bugs & code quality; design system compliance per `project-flame-master.mdc` Section 2.
- **Fixes:**
  1. **RefreshControl tintColor:** Use literal `#FFFFFF` (not `colors["white-100"]`). iOS UIRefreshControl renders `colors["white-100"]` (#F9FBFE) as faint on dark backgrounds; pure white `#FFFFFF` is required for visible spinners. Documented in `flame-design-system.mdc`. Apply consistently across all RefreshControl instances.
  2. **org-dashboard:** ActivityIndicator → `colors["white-100"]` (superseded by #150: use `#FFFFFF`); Ionicons error icon → `colors["white-30"]`.
  3. **settings.tsx:** Gated "Notifications" menu item on `isSignedIn` so unauthenticated users do not see the broken route.
  4. **OrganizationSettingsTab:** URL parse failures or falsy storagePath now throw so outer catch handles them; cache invalidation runs only after successful apiDelete. Parse failure or invalid URL logs error and throws; no invalidateQueries on failure.
  5. **PersonalSettingsTab:** Added `isSigningOut` re-entry guard; `disabled={isSigningOut}` and `opacity-70` on Sign out button; `finally` resets guard.
  6. **support.tsx, notifications-settings.tsx:** Header View `pt-2` → `style={{ paddingTop: insets.top + 8 }}` for safe area on notched iOS.
- **Deferred to NITPICKS_TODOS.md:** create-event dynamic header height (onLayout); events-management toManageEvent extract to lib; notifications-settings NotificationSection extract; org-event-detail DEFAULT_EVENT_IMAGE; scanner subcomponents + formatDate/formatTime; ticket/[id] RefreshControl token (already fixed); PayoutsSettingsTab colorMap refactor.
- **Deferred to ACCESSIBILITY_TODOS.md:** PastItemsAccordion accessibility (button role, expanded state, label).
- **Files:** `apps/mobile/app/(tabs)/dashboard.tsx`, `apps/mobile/app/(tabs)/events-management.tsx`, `apps/mobile/app/(tabs)/org-dashboard.tsx`, `apps/mobile/app/(tabs)/rsvp-management.tsx`, `apps/mobile/app/(tabs)/history.tsx`, `apps/mobile/app/(tabs)/index.tsx`, `apps/mobile/app/(tabs)/settings.tsx`, `apps/mobile/app/rsvp-detail.tsx`, `apps/mobile/app/org-event-detail.tsx`, `apps/mobile/app/event/[id].tsx`, `apps/mobile/app/ticket/[id].tsx`, `apps/mobile/app/support.tsx`, `apps/mobile/app/notifications-settings.tsx`, `apps/mobile/components/events/EventsScreenBody.tsx`, `apps/mobile/components/notifications/NotificationsOverlay.tsx`, `apps/mobile/components/settings/OrganizationSettingsTab.tsx`, `apps/mobile/components/settings/PersonalSettingsTab.tsx`

### #148. OrganizationSettingsTab: fail on URL parse; docs RefreshControl canonical (Mar 5, 2026)

- **OrganizationSettingsTab:** When logoUrl parse fails or storagePath is falsy, throw so outer catch handles it and user sees "Delete Failed" alert; do NOT run queryClient.invalidateQueries (would falsely imply success). Only invalidate after successful apiDelete.
- **MARCH_2026_FIXES.md:** Corrected conflicting RefreshControl tintColor references in #37, #49, #138, #143 — canonical is `#FFFFFF` per #147 design exception.
- **Duplicate comment (org-dashboard RefreshControl):** Ignored — design system explicitly requires `#FFFFFF` for RefreshControl (iOS faint-spinner fix), not design token. Per `flame-design-system.mdc`.
- **Deferred to NITPICKS_TODOS.md:** OrgDashboardScreen extraction (EventsList, SearchBarWrapper).
- **Files:** `apps/mobile/components/settings/OrganizationSettingsTab.tsx`, `docs/fixes/MARCH_2026_FIXES.md`

### #149. MARCH_2026_FIXES #136 superseded note; ManageEvent ticketTierName dead code (Mar 5, 2026)

- **#136 superseded note:** Added "Superseded by: #144, #147" to #136 entry; readers are directed to later changes that reintroduced safe-area top inset for account.tsx, support.tsx, notifications-settings.tsx.
- **User dashboard RefreshControl:** Confirmed uses `tintColor="#FFFFFF"` (same as org screens per #147).
- **ManageEvent ticketTierName dead code:** ManageEventCard (#140) shows only ticketTierCount; removed `ticketTierName` from `toManageEvent` mapping, `ManageEvent` interface, and `manageEvents` mock data.
- **Files:** `docs/fixes/MARCH_2026_FIXES.md`, `apps/mobile/app/(tabs)/events-management.tsx`, `apps/mobile/data/mock.ts`

### #151–152. RefreshControl: CustomRefreshControl for iOS tintColor bug (Mar 5, 2026)

- **Superseded by: #153.** The delayed-white workaround was replaced by #153, which changes the initial iOS state to `"transparent"` so the 500ms update to `#FFFFFF` is a genuine UIColor transition. See `CustomRefreshControl.tsx`.
- **Issue:** RN 0.81+ iOS ignores `tintColor` at mount (New Architecture). See https://github.com/facebook/react-native/issues/53987
- **Attempt:** Tried raw `RefreshControl` with `tintColor="#FFFFFF"` and `colors={["#FFFFFF"]}` — did not fix iOS. Also tried WhiteRefreshControl (wrong import path; reverted).
- **Fix:** `CustomRefreshControl` in `packages/ui` with workaround from RN issue: `useState("white")` then `setTimeout(() => setTintColor("#FFFFFF"), 500)`. Delayed application forces UIRefreshControl to pick up the color. Also `colors={["#FFFFFF"]}` and `progressBackgroundColor` (Android).
- **Files:** `packages/ui/src/components/CustomRefreshControl.tsx` (new), `packages/ui/src/index.tsx` (export)

### #150. ActivityIndicator: use #FFFFFF on dark backgrounds (Mar 5, 2026)

- **Issue:** Loading spinners used `colors["white-100"]` (#F9FBFE) or `colors.primary` on dark-background screens; both render faint on dark backgrounds.
- **Fix:** Use literal `#FFFFFF` for ActivityIndicator on dark screens (same rule as RefreshControl). Updated: org-dashboard, events-management, rsvp-management, create-event, org-event-detail, rsvp-detail, dashboard, index, history, event/[id], ticket/[id], \_layout, useRequireAuth, NotificationsOverlay, EventsScreenStatus, CheckoutProcessingState, OrganizationSettingsTab, PersonalSettingsTab, PayoutsSettingsTab. Documented in `flame-design-system.mdc`.
- **Files:** `apps/mobile/app/(tabs)/*.tsx`, `apps/mobile/app/**/*.tsx`, `apps/mobile/components/**/*.tsx`, `apps/mobile/hooks/useRequireAuth.tsx`, `.cursor/rules/flame-design-system.mdc`

### #153. CustomRefreshControl: fix tintColor not applying on iOS (Mar 5, 2026)

- **Issue:** `CustomRefreshControl` initialised `tintColor` as `"white"` then changed it to `"#FFFFFF"` after 500ms. Both values normalise to the same 32-bit integer (`0xFFFFFFFF`) in React Native's colour processing pipeline, so the bridge saw no change and skipped the native UIRefreshControl update. Spinners remained dark (invisible on `#000B12` background).
- **Fix:** Changed initial iOS state to `"transparent"` (`0x00000000`). The 500ms change to `"#FFFFFF"` is now a genuine UIColor transition, forcing UIRefreshControl to apply the new tintColor.
- **Files:** `packages/ui/src/components/CustomRefreshControl.tsx`

### #154. Events management: isSelectedEventPast handles missing/invalid ends_at (Mar 5, 2026)

- **Issue:** `isSelectedEventPast` used `new Date(selectedEvent.ends_at) > new Date()`; when `ends_at` was missing or invalid, `new Date(undefined)` produced Invalid Date, and the comparison yielded `false` so `!(false)` became `true`, wrongly treating the event as past and showing "View only (past event)" + read-only edit.
- **Fix:** Guard on `selectedEvent?.ends_at` and validate parsed date with `Number.isNaN(endDate.getTime())`; return `false` when absent or invalid so the event is not treated as past.
- **Files:** `apps/mobile/app/(tabs)/events-management.tsx`

### #155. Events management: handleRefresh error handling; Ionicons token (Mar 5, 2026)

- **handleRefresh:** Wrapped `await refetch()` in try/catch; on failure, log via `console.error` with `action: "events_refresh"`, `selectedEventId`, and error; `setRefreshing(false)` remains in `finally`.
- **Ionicons:** Replaced literal `"rgba(255,255,255,0.3)"` with `colors["white-30"]` for design token consistency. ActivityIndicator stays `#FFFFFF` per design system (#150).
- **Files:** `apps/mobile/app/(tabs)/events-management.tsx`

### #156. NotificationsOverlay: flicker on open, pull-to-refresh bounce (Mar 5, 2026)

- **Issue:** (1) Flickering when opening notifications overlay — redundant `refresh()` on open caused loading-state flash. (2) Pull-to-refresh caused constant up/down bounce after refresh.
- **Root cause:** (1) Overlay called `refresh()` in useEffect when `visible` became true; `useNotifications` already fetches on AppShell mount, so open triggered a second fetch and brief `isLoading` flash. (2) `refreshing={isLoading}` tied RefreshControl to hook loading; FlatList with short content lacked `flexGrow: 1`, causing iOS layout bounce.
- **Fix:** (1) Removed `refresh()` call on overlay open; user can pull to refresh for fresh data. (2) Added dedicated `refreshing` state for RefreshControl (matches dashboard/home pattern), with `setRefreshing(true)` / `finally setRefreshing(false)` in onRefresh. Added `flexGrow: 1` to FlatList `contentContainerStyle` so short lists fill the viewport and RefreshControl dismisses cleanly.
- **Files:** `apps/mobile/components/notifications/NotificationsOverlay.tsx`

### #157. Notification deep links, swipe-to-dismiss, route mapping (Mar 5, 2026)

- **Issue:** (1) Organizer RSVP request tap → should open RSVP detail for that event, not just RSVP list. (2) User RSVP received (pending/approved/rejected) → should open My Tickets (dashboard). (3) Missing route mapping for web paths (`/(tabs)/my-tickets`, `/(tabs)/rsvp`, etc.) to Expo Router paths. (4) No swipe-to-dismiss for notifications (separate from mark as read).
- **Fix:**
  1. **Deep link resolver:** Added `apps/mobile/lib/notification-deep-links.ts` — maps web paths + notification type + data to mobile routes. Organizer `new_rsvp_request` + `eventId` → `/rsvp-detail?eventId=X`. User `rsvp_pending`/`rsvp_approved`/`rsvp_rejected` → `/dashboard`. `auth_expiry_warning` + `eventId` → `/rsvp-detail?eventId=X`. Event routes use `eventId` from data when path has slug (get_event_with_tiers needs UUID).
  2. **Web API:** (a) `apps/web/app/api/rsvp/route.ts` — `new_rsvp_request` now sends `eventId` in data. (b) `apps/web/app/api/events/route.ts` — `event_date_changed` now sends `eventId` in data. (c) `apps/web/app/api/cron/monitor-payment-authorizations/route.ts` — `auth_expiry_warning` now sends `eventId` in data. (d) `apps/web/app/lib/push-notifications.ts` — push payload data now includes `type` for resolver.
  3. **Swipe-to-dismiss:** Added `dismiss` to `useNotifications` (DELETE from notifications table). Added RLS policy via migration `20260305024931_add_notifications_delete_policy.sql`. Wrapped each notification row in `ReanimatedSwipeable`; swipe left reveals "Dismiss" action; tap removes notification. Added `react-native-gesture-handler`, `GestureHandlerRootView` to root layout.
- **Route mapping table:**

| Web path / type                 | Mobile route             |
| ------------------------------- | ------------------------ |
| `/(tabs)/my-tickets`            | `/dashboard`             |
| `/(tabs)/rsvp`                  | `/rsvp-management`       |
| `new_rsvp_request` + eventId    | `/rsvp-detail?eventId=X` |
| `auth_expiry_warning` + eventId | `/rsvp-detail?eventId=X` |
| `/(tabs)/events-management`     | `/events-management`     |
| `/event/[slug\|id]` + eventId   | `/event/[uuid]`          |

- **Files:** `apps/mobile/lib/notification-deep-links.ts`, `apps/mobile/components/notifications/NotificationsOverlay.tsx`, `apps/mobile/hooks/useNotifications.ts`, `apps/mobile/hooks/useNotificationRegistration.ts`, `apps/mobile/app/_layout.tsx`, `apps/web/app/api/rsvp/route.ts`, `apps/web/app/api/events/route.ts`, `apps/web/app/api/cron/monitor-payment-authorizations/route.ts`, `apps/web/app/lib/push-notifications.ts`, `supabase/migrations/20260305024931_add_notifications_delete_policy.sql`

### #161. Notification deep-link routing: full type audit, eventId enrichment, rsvp_rejected fix (Mar 5, 2026)

- **Issue:** (1) `new_rsvp_request` notifications stored before fix #157 (without `eventId`) had no explicit fallback in the resolver — they relied on a `TAB_PATH_MAP` coincidence (`"/(tabs)/rsvp"` → `/rsvp-management`) rather than an intentional branch, making the code brittle. (2) `rsvp_pending`, `rsvp_approved`, `rsvp_rejected` notifications were sent without `eventId` in the data, limiting future routing options. (3) `rsvp_rejected` routed to `/dashboard` — a rejected user should be sent back to the event page where they can read the event info or re-apply.
- **Full routing table (post-fix):**

| Type                  | Recipient      | Route                                                   | Rationale                                                |
| --------------------- | -------------- | ------------------------------------------------------- | -------------------------------------------------------- |
| `new_rsvp_request`    | Org members    | `/rsvp-detail?eventId=X` (fallback: `/rsvp-management`) | Organizer opens RSVP list for that specific event        |
| `auth_expiry_warning` | Organizer      | `/rsvp-detail?eventId=X` (fallback: `/rsvp-management`) | Payment expiring — act immediately                       |
| `rsvp_pending`        | User           | `/dashboard`                                            | User sees their pending ticket status                    |
| `rsvp_approved`       | User           | `/dashboard`                                            | Tickets are ready                                        |
| `rsvp_rejected`       | User           | `/event/[id]`                                           | User returns to event page, can re-read details or retry |
| `event_date_changed`  | Ticket holders | `/event/[id]`                                           | See the new dates                                        |
| `event_reminder`      | Ticket holders | `/event/[id]`                                           | Day-before reminder                                      |
| `ticket_sold`         | (not yet sent) | —                                                       | Deferred                                                 |

- **Fix details:**
  1. **Web — `rsvp_pending`** (`apps/web/app/api/rsvp/route.ts`): Added `eventId: event.id` to notification data.
  2. **Web — `rsvp_approved`** (`apps/web/app/api/organizer/rsvps/[id]/approve/route.ts`): Added `eventId: rsvp.events.id` to notification data.
  3. **Web — `rsvp_rejected`** (`apps/web/app/api/organizer/rsvps/[id]/reject/route.ts`): Added `eventId: rsvp.events.id` to notification data.
  4. **Resolver** (`apps/mobile/lib/notification-deep-links.ts`): (a) `new_rsvp_request` now has an explicit conditional: `eventId` present → `/rsvp-detail?eventId=X`; no `eventId` (legacy pre-fix notifications) → `/rsvp-management` as documented fallback. (b) Same explicit pattern for `auth_expiry_warning`. (c) Added `rsvp_rejected` + `eventId` → `/event/[id]` branch before the generic tab fallback. (d) Replaced comment-only intent with a full routing table in the file header.
- **Root cause of user's observed wrong route**: `new_rsvp_request` notifications created before fix #157 (earlier on March 5, 2026) were stored without `eventId`. Dismissing those old notifications and triggering a new RSVP will produce correctly-routed notifications. Old notifications in the DB cannot be retroactively fixed.
- **Files:** `apps/web/app/api/rsvp/route.ts`, `apps/web/app/api/organizer/rsvps/[id]/approve/route.ts`, `apps/web/app/api/organizer/rsvps/[id]/reject/route.ts`, `apps/mobile/lib/notification-deep-links.ts`

### #160. Notification dismiss: optimistic UI for instant row removal (Mar 5, 2026)

- **Issue:** After swiping past the 45% threshold and releasing, there was a noticeable delay (~100–500ms) before the notification disappeared. The delay came from `dismiss`/`dismissAll` gating `setNotifications` behind the Supabase network round-trip — the row only vanished after the DELETE response arrived.
- **Fix:** Flipped both `dismiss` and `dismissAll` in `useNotifications.ts` to use _optimistic UI_: `setNotifications` now runs _immediately_ when the function is called (before `await getAuthenticatedClient`), so the row disappears the instant `onSwipeableOpen` fires. The network DELETE continues in the background. On failure, the error is logged but the item is _not_ restored — a re-appearing dismissed notification is a worse user experience than a silent failure on non-critical data. This is the standard pattern used by iOS Mail, Gmail, Telegram, and WhatsApp for swipe-to-dismiss.
- **Design decision:** No undo/restore on dismiss failure. Notifications are ephemeral and non-critical; optimistic removal with silent background sync is the correct trade-off.
- **Files:** `apps/mobile/hooks/useNotifications.ts`

### #159. Notification swipe-to-dismiss polish: z-index fix, auto-dismiss threshold, Clear all button (Mar 5, 2026)

- **Issues:** (1) Red dismiss action visible on top of read notification cards — cards had no background on the read state, making them transparent and letting the action layer bleed through. (2) Auto-dismiss on large swipe not wired up — user had to manually tap the "Dismiss" button after swiping. (3) No "Clear all" button to wipe all notifications at once.
- **Fixes:**
  1. **Background fix (`NotificationCard.tsx`):** Changed the Pressable className to always apply an opaque background — `bg-white-5` for unread, `bg-surface` for read. This ensures the `Swipeable` action layer (red) is only revealed when the card is dragged, never visible through a transparent card.
  2. **Auto-dismiss threshold (`NotificationsOverlay.tsx`):** Added `rightThreshold={SWIPE_DISMISS_THRESHOLD}` (45% of screen width, ~169px on a 375px screen) to the `Swipeable`. Added `onSwipeableOpen` callback that calls `dismiss(id)` automatically — drag past the threshold → release → item dismisses without tapping the button. The red "Dismiss" button remains visible as a drag affordance and still works as a tap target. Extracted shared `handleDismiss` helper to de-duplicate dismiss + error logging logic.
  3. **Clear all button (`NotificationsOverlay.tsx` + `useNotifications.ts`):** Added `dismissAll` to `useNotifications` — deletes all current notification IDs via `.in("id", ids)` (RLS scopes to the current user). Added `dismissAll` to `NotificationsOverlayState` interface. "Clear all" button renders in the header whenever `notifications.length > 0`, styled with `text-white-50` to visually differentiate from the red "Mark all read" action.
- **Files:** `apps/mobile/components/notifications/NotificationCard.tsx`, `apps/mobile/components/notifications/NotificationsOverlay.tsx`, `apps/mobile/hooks/useNotifications.ts`

### #158. react-native-gesture-handler: pin to Expo SDK 54–compatible version (Mar 5, 2026)

- **Issue:** `react-native-gesture-handler` was pinned to `~2.24.0`; Expo SDK 54 supports `~2.28.0`.
- **Fix:** Updated `apps/mobile/package.json` to `react-native-gesture-handler: "~2.28.0"` and ran `npx expo install react-native-gesture-handler` to apply the compatible version and update the lockfile.
- **Files:** `apps/mobile/package.json`, `pnpm-lock.yaml`

### #162. PR review: dismissAll deps, user_id in deletes, deep-link guard order (Mar 5, 2026)

- **dismissAll dependency array:** `dismissAll` included `notifications` in its `useCallback` deps, causing the callback to be recreated on every notification change and cascading re-renders. Fixed by using a functional `setNotifications` updater to capture IDs: `setNotifications((prev) => { idsToDelete = prev.map((n) => n.id); return []; })`, removing `notifications` from deps.
- **user_id in DELETE (defense-in-depth):** Both `dismiss` and `dismissAll` now fetch the Supabase user id via `users.select("id").eq("clerk_id", userId)` and add `.eq("user_id", user.id)` to the delete query so the DB enforces ownership in-query alongside RLS.
- **notification-deep-links guard order:** The early `if (!link || ...) return null` blocked type handlers that can resolve without a deepLink (e.g. `new_rsvp_request` + `eventId`). Moved the type-specific handlers (new_rsvp_request, auth_expiry_warning, rsvp_rejected) to run first; the link validation now runs only for handlers that require a valid deepLink (event paths, tab paths).
- **Nitpick deferred:** styles.dismissAction → NativeWind classes for dismiss Pressable; logged in NITPICKS_TODOS.md.
- **Files:** `apps/mobile/hooks/useNotifications.ts`, `apps/mobile/lib/notification-deep-links.ts`, `docs/todos/NITPICKS_TODOS.md`

### #163. Navigation restructuring: persistent custom tab bar, role switching, host banner (Mar 5, 2026)

- **Problem:** Tab bar was only visible on `(tabs)/` screens; detail screens (event, ticket, account, etc.) hid the tab bar when pushing via Stack. Settings was hidden from the tab bar and only accessible via a header cog. No ability to switch between attendee and organizer views on mobile. No "become an organizer" flow on mobile.
- **Changes:**
  1. **Persistent custom tab bar:** Created `CustomTabBar` component rendered in root `_layout.tsx` below the Stack (same pattern as Header). Built-in tab bar in `(tabs)/_layout.tsx` hidden via `tabBarStyle: { display: 'none' }`. CustomTabBar hides itself on `/sign-in`, `/scanner`, and additional detail routes (`/event/`, `/ticket/`, `/org-event-detail`, `/rsvp-detail`, `/events`, `/edit-event`, `/organizer/`).
  2. **View mode state:** Created `useViewMode` hook + `ViewModeContext` for client-side attendee/organizer toggle. Persists to `expo-secure-store`. Only allows organizer mode when user has an org (via `useUserRole`).
  3. **Tab structure:** Attendee view: Home, My Tickets, [+] Create, History, Settings. Organizer view: Dashboard, Create Event, RSVP, Settings. Center [+] in attendee mode opens "Become an Organizer" sheet (no org) or switches to org view (has org).
  4. **Header role pill (org users only):** Removed settings cog from header (settings now in tab bar). Added role-switching pill button (shows "Attending"/"Hosting") before the notifications bell. Only visible for org users. Tapping opens `RoleSwitcherDropdown` (supersedes original `RoleSwitcherSheet` per #164).
  5. **Non-org upsell flow:** Non-org users never see the header pill. They reach the "Become an Organizer" flow via `HostBanner` (in-body on Home) or the tab bar Create (+) action, both of which open `BecomeOrganizerSheet`.
  6. **Become an Organizer form:** Bottom sheet with company name input, auto-slug generation, calls `POST /api/organizations` via `lib/api.ts` (ported from web's `CreateOrganizationForm`). On success: "Under review" message + invalidates user-role query.
  7. **Dashboard + Events Management merge:** Removed Events Management as a separate tab. Created `/edit-event` Stack screen with the edit tabs (EditEventDetailsTab + EditTiersTab). Added "Edit" button to `org-event-detail` screen next to event name.
  8. **Home banner + scroll-to-top:** Added `HostBanner` to home screen (orange upsell for non-org users). Added `ScrollToTopContext` + ScrollView ref so tapping the Home tab while already on home scrolls to top.
  9. **Bottom padding:** Added `contentContainerStyle` with `paddingBottom` to `EventsScreenBody` (used by events and organizer screens).
- **New files:** `hooks/useViewMode.ts`, `contexts/ViewModeContext.tsx`, `contexts/ScrollToTopContext.tsx`, `components/navigation/CustomTabBar.tsx`, `components/navigation/RoleSwitcherSheet.tsx`, `components/navigation/BecomeOrganizerSheet.tsx`, `components/home/HostBanner.tsx`, `app/edit-event.tsx`
- **Modified files:** `app/_layout.tsx`, `app/(tabs)/_layout.tsx`, `components/home/Header.tsx`, `app/(tabs)/index.tsx`, `app/org-event-detail.tsx`, `components/events/EventsScreenBody.tsx`
- **Mobile-first features tracked in `CRUCIAL_IOS_TO_WEB_TODOS.md`:** Role switching (attendee/organizer view toggle), "Become an Organizer" application form, persistent tab bar.

### #164. Navigation review fixes: hooks error, Home on org tabs, pill dropdown (Mar 5, 2026)

- **Hooks error fix (`CustomTabBar.tsx`):** `useCallback` was called after the `return null` early exit for hidden routes, violating Rules of Hooks. When navigating to/from sign-in, the hook count changed between renders causing "Rendered fewer hooks than expected." Fixed by moving the early return after all hooks. Also removed unused `RoleSwitcherSheet` import from `CustomTabBar` (only `BecomeOrganizerSheet` is needed there).
- **Home tab on organizer navbar:** Added Home tab to `ORGANIZER_TABS` making it 5 tabs (Home, Dashboard, Create Event, RSVP, Settings). Tapping Home while already on home triggers scroll-to-top in both attendee and organizer views.
- **Role pill dropdown:** Replaced the bottom sheet (`RoleSwitcherSheet`) triggered by the header pill with a `RoleSwitcherDropdown` that appears directly below the pill as a floating popover. Uses `measureInWindow` to anchor the dropdown to the pill's position. The bottom sheet pattern is kept for the `HostBanner` (in-body upsell) where it's more natural.
- **Files:** `components/navigation/CustomTabBar.tsx`, `components/navigation/RoleSwitcherDropdown.tsx` (new), `components/home/Header.tsx`

### #165. Role resolution gate: prevent organizer flicker on app load (Mar 5, 2026)

- **Issue:** For signed-in org users, the app briefly showed the attendee view (user tabs, home layout) before switching to the organizer view — a visible flicker. Industry standard: don't render role-dependent UI until the app knows the user's context.
- **Fix:** Added `RoleResolutionGate` component that gates the main app UI (Header, Stack, CustomTabBar) behind `useViewModeContext().isLoading`. While role and view mode are resolving (Supabase role query + SecureStore hydration), shows a full-screen loading spinner. Once resolved, renders the correct tab bar and UI from first paint.
- **Files:** `apps/mobile/components/navigation/RoleResolutionGate.tsx` (new), `apps/mobile/app/_layout.tsx`

### #166. RoleSwitcherDropdown: Reanimated spring animation (Mar 5, 2026)

- **Issue:** Dropdown used `Modal` with `animationType="fade"` — felt slow; user requested quicker animation and spring.
- **Fix:** Replaced built-in fade with Reanimated spring. `animationType="none"` on Modal; backdrop and dropdown content animate with `withSpring` (damping: 28, stiffness: 400 for open; 30/450 for close). Dropdown has slight translateY (-8px → 0) for a snappier feel. Uses `shouldRender` pattern so content unmounts after close animation completes.
- **Files:** `apps/mobile/components/navigation/RoleSwitcherDropdown.tsx`

### #167. HostBanner: remove red styling, white outline, icon consistency (Mar 5, 2026)

- **Issue:** Banner was too red: `bg-primary/15`, `border-primary/40`, red icon with `bg-primary/25` container.
- **Fix:** Changed to `border border-white-30` (white outline), removed background and icon container. Icon now uses `colors["white-80"]` to match other icons (no container bg).
- **Files:** `apps/mobile/components/home/HostBanner.tsx`

### #168. Sign-in screen: back navigation and gesture (Mar 5, 2026)

**Superseded by #171.** The back-button routing in (2) below was replaced: when user reaches sign-in via RequireAuthGate (`router.replace`), there is no back stack — `router.back()` throws. The final behavior is in #171 (and #177’s `navigateBackOrTabs`): `SignInBackButton` and the "not configured" Go Back use `router.canGoBack()` — if true, `router.back()`; else `router.replace("/(tabs)")`.

- **Issue:** (1) User could not swipe from left to go back to home. (2) "Go Back" button used `router.replace("/(tabs)")` which animated a new screen from the right instead of the correct back animation (current screen sliding left).
- **Fix:** (1) Added `fullScreenGestureEnabled: true` to Stack `screenOptions` for more reliable iOS edge-swipe. (2) Changed `SignInBackButton` to use `router.back()` — superseded by #171’s canGoBack fallback.
- **Files:** `apps/mobile/components/sign-in/SignInBackButton.tsx`, `apps/mobile/components/navigation/RoleResolutionGate.tsx`

### #169. Partner logos: wire local assets (zlu, kora, hush, g2g, cf) (Mar 5, 2026)

- **Issue:** PartnerLogos used placeholder URLs. User added actual logo PNGs.
- **Fix:** Updated `PartnerLogo` to use `source: ImageSourcePropType` for local assets. Replaced mock data with `require()` for zlu-logo, kora-logo, hush-logo, g2g-logo, cf-logo from `apps/mobile/assets/`.
- **Files:** `apps/mobile/data/mock.ts`, `apps/mobile/components/home/PartnerLogos.tsx`

### #170. HostBanner: move above UpcomingEvents, add circular icon bg (Mar 5, 2026)

- **Issue:** Banner was between PartnerLogos and FeaturedEvents; icon had no container.
- **Fix:** Moved HostBanner to above UpcomingEvents (after SpotlightSection). Added `size-[44px] rounded-circle bg-white-5` to icon wrapper to match notification icon style.
- **Files:** `apps/mobile/app/(tabs)/index.tsx`, `apps/mobile/components/home/HostBanner.tsx`

### #171. Sign-in GO_BACK: fallback when no stack (Mar 5, 2026)

- **Issue:** When user reached sign-in via `RequireAuthGate` (router.replace), there was no screen to go back to. `router.back()` threw "The action 'GO_BACK' was not handled by any navigator". Swipe gesture likewise had no target.
- **Fix:** SignInBackButton and sign-in "not configured" Go Back use `router.canGoBack()` — if true, `router.back()`; else `router.replace("/(tabs)")` to go to home. Handles both flows: push from tab/event (can go back) and replace from RequireAuthGate (no back stack).
- **Files:** `apps/mobile/components/sign-in/SignInBackButton.tsx`, `apps/mobile/app/sign-in.tsx`

### #172. RoleSwitcherDropdown: fast close, fix 2s input block (Mar 5, 2026)

- **Issue:** After clicking outside to close, user couldn't interact for ~2 seconds. Spring close animation took too long to settle before unmounting.
- **Fix:** Replaced close animation `withSpring(0, ...)` with `withTiming(0, { duration: 120 })` for deterministic 120ms. Modal unmounts promptly after close. Open still uses spring for snappy feel.
- **Files:** `apps/mobile/components/navigation/RoleSwitcherDropdown.tsx`

### #173. Create (+) as org in attendee view: land on Create Event (Mar 5, 2026)

- **Issue:** When an org user in attendee view taps [+], it correctly switched to organizer but landed on Dashboard instead of Create Event.
- **Fix:** Changed `router.replace("/org-dashboard")` to `router.replace("/create-event")` for the Create tab action when switching to organizer.
- **Files:** `apps/mobile/components/navigation/CustomTabBar.tsx`

### #174. Auth-required tabs: push sign-in directly so back/swipe work (Mar 5, 2026)

- **Issue:** Non-signed-in users tapping My Tickets or History got `router.push("/dashboard")` or `router.push("/history")`, then RequireAuthGate did `router.replace("/sign-in")`. That cleared the back stack — no swipe gesture, wrong exit animation.
- **Fix:** Added `requiresAuth` to TabDef. When `!isSignedIn` and tab has `requiresAuth`, CustomTabBar does `router.push("/sign-in")` directly (same as Create). Stack stays (tabs) → sign-in, so `router.back()` and swipe-back both work. Dashboard and History never mount, so RequireAuthGate replace is avoided.
- **Files:** `apps/mobile/components/navigation/CustomTabBar.tsx`

### #175. CustomTabBar: always visible on detail screens, fix flicker on back/swipe (Mar 5, 2026)

- **Issue:** The tab bar was hidden on detail screens (`/event/`, `/ticket/`, `/org-event-detail`, `/rsvp-detail`, `/edit-event`, `/organizer/`, `/events`). On back gesture or `router.back()`, `usePathname()` updates at the **start** of the exit animation (before the slide completes), so `hideTabs` immediately became `false` and the tab bar snapped into view mid-slide — producing a visible flicker/glitch.
- **Root cause:** Conditionally returning `null` from `CustomTabBar` based on `pathname` races with Expo Router's animation. There is no hook to delay the render until the transition is complete.
- **Fix:** Reduced `HIDDEN_PREFIXES` to `["/sign-in", "/scanner"]` only. All pushed detail screens now keep the tab bar visible, matching the standard iOS UX pattern (tab bar persists on pushed screens; only exclusive full-screen flows suppress it). `HIDDEN_EXACT` is now empty.
- **Files:** `apps/mobile/components/navigation/CustomTabBar.tsx`

### #176. CustomTabBar: animated slide-in/out for sign-in and scanner (Mar 5, 2026)

- **Issue:** When navigating to sign-in (or scanner), `return null` removed the bar from the tree in a single frame — visually an abrupt disappearance. Same on the way back.
- **Fix:** Replaced `return null` guard with a Reanimated `shouldRender` + `translateY` pattern:
  - **`shouldRender` (delayed unmount):** bar stays in the React tree while the exit animation plays; only unmounts once the animation callback fires (`runOnJS(setShouldRender)(false)`). This means no layout space is wasted once hidden, but no frame-pop either.
  - **Effect 1** (deps: `hideTabs`, `tabBarFullHeight`): on hide → `withTiming(tabBarFullHeight, 220ms)` then unmount; on show → `cancelAnimation` (guards quick back-gesture) + `setShouldRender(true)`.
  - **Effect 2** (deps: `shouldRender`, `hideTabs`): once `shouldRender=true && !hideTabs`, slides to `0`. Handles both fresh mount AND exit-cancelled paths.
  - Easing: `Easing.out(Easing.cubic)`, 220ms — completes well before the 350ms iOS screen transition.
- **Files:** `apps/mobile/components/navigation/CustomTabBar.tsx`

### #177. Sign-in: extract navigateBackOrTabs helper (Mar 5, 2026)

- **Issue:** Duplicated "back-or-tabs" routing logic in `SignInScreen` (Go Back when auth not configured) and `SignInBackButton` (inline handleBack).
- **Fix:** Added `navigateBackOrTabs(router)` to `apps/mobile/lib/navigation.ts` — checks `router.canGoBack()` and calls `router.back()` or `router.replace("/(tabs)")` accordingly. Both components now use the helper.
- **Files:** `apps/mobile/lib/navigation.ts`, `apps/mobile/app/sign-in.tsx`, `apps/mobile/components/sign-in/SignInBackButton.tsx`

### #178. RoleSwitcherDropdown: remove compounded opacity (Mar 5, 2026)

- **Issue:** `backdropStyle` and `dropdownStyle` both set `opacity: progress.value`. The dropdown is nested inside the backdrop, so opacities multiplied (e.g. 0.5 × 0.5 = 0.25 effective opacity).
- **Fix:** Removed opacity from `backdropStyle`; kept opacity only on `dropdownStyle` so the dropdown animates correctly without compounding.
- **Files:** `apps/mobile/components/navigation/RoleSwitcherDropdown.tsx`

### #179. RoleSwitcherDropdown: accessibility metadata on role options (Mar 5, 2026)

- **Issue:** Attending and Hosting role option Pressables lacked accessibility metadata; screen readers could not announce purpose or selection state.
- **Fix:** Added `accessibilityLabel`, `accessibilityRole="button"`, and `accessibilityState={{ selected, disabled }}` to both Pressables.
- **Files:** `apps/mobile/components/navigation/RoleSwitcherDropdown.tsx`

### #180. MARCH_2026_FIXES: #168 superseded by #171 (Mar 5, 2026)

- **Issue:** Entry #168 described SignInBackButton using `router.back()` only; #171 later added the canGoBack fallback. Readers could wrongly apply the intermediate #168 behavior.
- **Fix:** Added superseded note to #168: final back-button routing is in #171 (and #177’s `navigateBackOrTabs`).
- **Files:** `docs/fixes/MARCH_2026_FIXES.md`

### #181. RoleSwitcherDropdown: remove dead backdropStyle (Mar 5, 2026)

- **Issue:** After #178 removed opacity from backdrop to fix compounding, `backdropStyle` was `useAnimatedStyle(() => ({}))` — an empty worklet running every frame with no effect.
- **Fix:** Removed `backdropStyle` and replaced the outer `Animated.View` with a plain `View`.
- **Files:** `apps/mobile/components/navigation/RoleSwitcherDropdown.tsx`

### #182. RoleSwitcherDropdown: opt no-op wrapper out of accessibility (Mar 5, 2026)

- **Issue:** The inner Pressable with `onPress={() => {}}` (touch-intercept wrapper around the dropdown) was exposed to screen readers as an unlabeled control.
- **Fix:** Added `accessible={false}` and `importantForAccessibility="no"` so screen readers ignore it while preserving touch interception.
- **Files:** `apps/mobile/components/navigation/RoleSwitcherDropdown.tsx`

### #183. Deep linking: Universal Links for promoter code tracking (Mar 5, 2026)

- **Issue:** Mobile app had no mechanism for buyers to arrive with a promoter code from a shared link. On web, promoter codes are captured from `?promoter=CODE` URL params. Mobile had no equivalent.
- **Fix:** Added `associatedDomains: ["applinks:flme.co"]` to `app.json` iOS config. `event/[id].tsx` now parses `promoter` from `useLocalSearchParams` and passes it to `useCheckout`. The `apple-app-site-association` file must be deployed to `flme.co/.well-known/` separately for iOS to recognize the deep links — see **#189** for Team ID replacement and post-deploy verification steps.
- **Files:** `apps/mobile/app.json`, `apps/mobile/app/event/[id].tsx`

### #184. useCheckout: promoter code wired through checkout flows (Mar 5, 2026)

- **Issue:** Mobile checkout did not send `promoter_code` to the hold creation or RSVP API endpoints, so promoter attribution was lost for all mobile purchases.
- **Fix:** `useCheckout` now accepts an optional `promoterCode` param and manages promoter state (code, validation status). The promoter code is included in `POST /api/holds/create` (direct purchase), `POST /api/rsvp` (free RSVP), and all paid RSVP submissions — mirroring `apps/web/app/components/EventDetail.tsx` lines 496, 595, 653. Promoter codes are validated against the `promoter_links` table via direct Supabase query.
- **Files:** `apps/mobile/hooks/useCheckout.ts`

### #185. CheckoutMainSheet: editable Promoter field with validation (Mar 5, 2026)

- **Issue:** No UI existed for buyers to see or enter a promoter code at checkout. Promoter attribution was invisible to the buyer.
- **Fix:** Added a "Promoter" section below the Promo Code field in the checkout bottom sheet. Default shows "None" placeholder. Users can type a promoter code and tap "Apply". Validation queries `promoter_links` for the event and shows a green check (valid) or red X (invalid). When arriving via deep link, the field auto-populates and auto-validates. This is a mobile-first feature (web captures promoter codes silently from URL params).
- **Files:** `apps/mobile/components/event-details/CheckoutMainSheet.tsx`, `apps/mobile/components/event-details/CheckoutSheet.tsx`

**Web Parity Gate (#184 & #185):**

- **Web Source References:** `apps/web/app/components/EventDetail.tsx` — promoter captured from URL (line 118), passed to hold/RSVP at 496, 595, 653.
- **API Parity Evidence:** Same body shape. Intentional divergence: mobile includes `promoter_code` only when `promoterStatus === "valid"` (user-validated via promoter_links); web includes it when `promoterCode` is truthy from URL param (no explicit validation UI).
- **Calculation Parity Evidence:** Promoter validation uses direct Supabase query to `promoter_links` (event_id + promoter_code). No fee/price impact — attribution only.
- **Edge Case Verification:** Deep-link auto-populate ✓; empty/invalid codes not sent ✓; validationIdRef guards against out-of-order responses ✓; web silently captures from URL, mobile shows editable field with validation feedback.
- **Cross-Platform Behavior Check:** Mobile `CheckoutMainSheet`/`CheckoutSheet` mirror web attribution flow: both include promoter_code in hold creation and RSVP submission. Web has no UI; mobile exposes field + validation.

### #186. EventsHero: remove background image (Mar 5, 2026)

- **Issue:** The events listing hero section used a stock Unsplash concert image with a 50% dark overlay, which obscured the GlowBlob gradient from the parent.
- **Fix:** Removed `FlameImage` background and dark overlay. The hero is now transparent, letting the `GlowBlob` from `EventsScreenBody` show through. Search bar and filter button styling unchanged.
- **Files:** `apps/mobile/components/events/EventsHero.tsx`

### #187. Organizer page: profile pic, share button (Mar 5, 2026)

- **Issue:** The organizer events page (`/organizer/[slug]`) had no visual identity for the organizer (no profile pic) and no way to share the page.
- **Fix:** `EventsHero` now accepts optional `profileImageUrl` and `onShare` props. When provided, a 67x67px circular profile image renders above the title, and a share icon button appears top-right. `organizer/[slug].tsx` uses `useOrganizations()` to look up the org's `logo_url` and React Native's `Share` API to share `https://flme.co/organizer/{slug}`. Props thread through `EventsScreenBody`.
- **Files:** `apps/mobile/components/events/EventsHero.tsx`, `apps/mobile/components/events/EventsScreenBody.tsx`, `apps/mobile/app/organizer/[slug].tsx`

### #188. EventsHero: share button accessibility (Mar 5, 2026)

- **Issue:** The share Pressable (wrapping `Ionicons` with `onPress={onShare}`) lacked accessibility metadata; screen readers could not announce its purpose.
- **Fix:** Added `accessible={true}`, `accessibilityRole="button"`, `accessibilityLabel="Share"`, and `accessibilityHint="Shares the current page"` to the share Pressable. `onPress` handler and Ionicons usage unchanged.
- **Files:** `apps/mobile/components/events/EventsHero.tsx`

### #189. apple-app-site-association: Team ID deployment prerequisite (Mar 5, 2026)

- **Issue:** The `appIDs` entry used placeholder `REPLACE_WITH_TEAM_ID.com.projectflame.app`. iOS Universal Links require the actual 10-character Apple Developer Team ID (alphanumeric, e.g. `ABC1234DEF`) in the format `<TEAM_ID>.com.projectflame.app`.
- **Fix:** Documented deployment prerequisite in `IOS_MIGRATION.md`. Before deploying to production, replace `REPLACE_WITH_TEAM_ID` in `apps/web/public/.well-known/apple-app-site-association` with your actual Team ID from Apple Developer Membership. The final value must be exactly `<YOUR_TEAM_ID>.com.projectflame.app`. Without this, Universal Links (promoter deep links, event/organizer deep links) will not open the iOS app.
- **Files:** `apps/web/public/.well-known/apple-app-site-association`, `docs/project-migrations/IOS_MIGRATION.md`

### #190. Organizer share handler: guard against missing slug (Mar 5, 2026)

- **Issue:** `handleShare` in `organizer/[slug].tsx` could build a URL with `https://flme.co/organizer/null` when `trimmedSlug` was null/undefined.
- **Fix:** Added early return `if (!trimmedSlug) return;` before constructing the Share payload so the URL is never built with a falsy slug.
- **Files:** `apps/mobile/app/organizer/[slug].tsx`

### #191. CheckoutMainSheet: promoter validating spinner color (Mar 5, 2026)

- **Issue:** ActivityIndicator for `promoterStatus === "validating"` used `rgba(255,255,255,0.5)`, rendering too faint on dark surfaces.
- **Fix:** Changed to canonical white literal `#FFFFFF` for clear visibility.
- **Files:** `apps/mobile/components/event-details/CheckoutMainSheet.tsx`

### #192. useCheckout: promoter state sync with initialPromoterCode (Mar 5, 2026)

- **Issue:** Promoter state was only initialized once from `initialPromoterCode`; when the route/deep link changed, `promoterCode` and `promoterStatus` stayed stale.
- **Fix:** Added `useEffect` that watches `initialPromoterCode` and updates `promoterCode`, `promoterStatus`, and resets `hasAutoValidatedRef` so validation runs when the prop changes (e.g. navigating between events with different promoter params).
- **Files:** `apps/mobile/hooks/useCheckout.ts`

### #193. useCheckout: promoter_code only when validated (Mar 5, 2026)

- **Issue:** Payload construction included `promoter_code` whenever `promoterCode` existed, even when `promoterStatus === "invalid"`.
- **Fix:** `checkoutPromoter` is now computed only when `promoterStatus === "valid"` and `promoterCode.trim()`. RSVP free, RSVP paid, and direct-purchase hold payloads use this guarded value.
- **Files:** `apps/mobile/hooks/useCheckout.ts`

### #194. useCheckout: validatePromoter Supabase error handling (Mar 5, 2026)

- **Issue:** `validatePromoter` destructured only `{ data }` from Supabase `.maybeSingle()` and never checked `error`. On network/RLS failures, valid codes appeared invalid.
- **Fix:** Destructure `{ data, error }`; if `error` is set, log and set `promoterStatus("idle")` so the user can retry instead of treating DB errors as invalid.
- **Files:** `apps/mobile/hooks/useCheckout.ts`

### #195. useCheckout: deduplicate effectivePromoter / checkoutPromoter (Mar 5, 2026)

- **Issue:** `effectivePromoter` at line 548 was identical to `checkoutPromoter` computed earlier; duplication risked divergence.
- **Fix:** Removed `effectivePromoter`; direct-purchase hold creation now uses `checkoutPromoter` (already computed once at top of try block with promoterStatus guard).
- **Files:** `apps/mobile/hooks/useCheckout.ts`

### #196. CRUCIAL_IOS_TO_WEB_TODOS: fix section numbering (Mar 5, 2026)

- **Issue:** Section 9 (Editable promoter code field) appeared before section 8 (Become an Organizer).
- **Fix:** Renumbered so promoter field is ## 8 and Become an Organizer is ## 9.
- **Files:** `docs/todos/CRUCIAL_IOS_TO_WEB_TODOS.md`

### #197. EventsHero PLACEHOLDER_LOGO deferred (Mar 5, 2026)

- **Issue:** `PLACEHOLDER_LOGO` uses external placehold.co URL; nitpick to use local asset or icon instead.
- **Fix:** Deferred to `docs/todos/NITPICKS_TODOS.md` per triage rules.
- **Files:** `docs/todos/NITPICKS_TODOS.md`

### #198. useCheckout: validatePromoter race-condition guard (Mar 5, 2026)

- **Issue:** `validatePromoter` could finish out of order and overwrite `promoterStatus` for a newer input when rapid typing or navigation triggered multiple validations.
- **Fix:** Added monotonic `validationIdRef`; increment before async call and capture token; only call `setPromoterStatus` when `token === validationIdRef.current`. Applied to success, error, and catch paths.
- **Files:** `apps/mobile/hooks/useCheckout.ts`

### #199. IOS_MIGRATION: apple-app-site-association post-deploy verification (Mar 5, 2026)

- **Issue:** Deployers had no verification step to confirm the AASA file is served correctly after deployment.
- **Fix:** Added post-deploy verification in `IOS_MIGRATION.md` Section 8: run `curl -i https://flme.co/.well-known/apple-app-site-association` and confirm 200, `Content-Type: application/json`, and body contains `<TEAM_ID>.com.projectflame.app` (not `REPLACE_WITH_TEAM_ID`).
- **Files:** `docs/project-migrations/IOS_MIGRATION.md`

### #200. MARCH_2026_FIXES: #183 cross-ref to #189, Web Parity Gate format (Mar 5, 2026)

- **Issue:** #183 Deep linking entry did not point to deployment steps; Web Parity Gate (#184 & #185) used table format instead of project's bullet-list pattern.
- **Fix:** Appended pointer to #189 (Team ID replacement, verification) in #183 Fix line. Refactored Web Parity Gate to subsections with bullets (Web Source References, API Parity Evidence, Calculation Parity Evidence, Edge Case Verification, Cross-Platform Behavior Check).
- **Files:** `docs/fixes/MARCH_2026_FIXES.md`

### #201. useCheckout: normalize promoterCode on validation success (Mar 5, 2026)

- **Issue:** `validatePromoter` uppercases code before querying `promoter_links`, but `promoterCode` state held the original (non-uppercased) input. The green valid badge displayed the un-normalized value; state didn't match what was validated.
- **Fix:** When validation succeeds (`data` present), call `setPromoterCode(trimmed)` so stored state matches the uppercased value used for DB validation and API submission.
- **Files:** `apps/mobile/hooks/useCheckout.ts`

### #202. apple-app-site-association: build-time placeholder check (Mar 5, 2026)

- **Issue:** Placeholder `REPLACE_WITH_TEAM_ID` could be deployed as-is; Universal Links would silently fail with no error. No build or CI check caught it.
- **Fix:** Added `apps/web/scripts/verify-apple-app-site-association.js` — runs before `next build`, exits 1 if file contains `REPLACE_WITH_TEAM_ID`. **Only runs for production** (VERCEL_ENV=production); previews and local skip. Bypass: `SKIP_AASA_VERIFY=1`.
- **Files:** `apps/web/scripts/verify-apple-app-site-association.js`, `apps/web/package.json`, `docs/project-migrations/IOS_MIGRATION.md`

### #203. Home tab switched to events feed + legacy discover route (Mar 5, 2026)

- **Issue:** Home tab still showed the legacy discovery composition (hero carousel + sections), while the requested attendee default was the full events list feed. Also, `GlowBlob` used a flat fill with hard edges instead of a true gradient glow.
- **Fix:** Reworked `app/(tabs)/index.tsx` into an events-feed home: search/filter hero, full-width event image cards with details below, date badge on image top-left, and a right-aligned CTA ("Featured events, organizer and more") before the list and after every 5 events. Added `/discover` route that renders the previous Home experience via `LegacyHomeContent` so CTA can navigate there. Updated `GlowBlob` to a radial gradient implementation using `@shopify/react-native-skia` (not react-native-svg), and increased partner logo render size by 35% (`sizeMultiplier = 1.35` in PartnerLogos).
- **Files:** `apps/mobile/app/(tabs)/index.tsx`, `apps/mobile/app/discover.tsx`, `apps/mobile/components/home/LegacyHomeContent.tsx`, `apps/mobile/components/home/PartnerLogos.tsx`, `packages/ui/src/components/GlowBlob.tsx`, `packages/ui/package.json`, `apps/mobile/metro.config.js` (extraNodeModules, singletonPkgsToClean for @shopify/react-native-skia), `pnpm-lock.yaml`

### #204. Settings: hide Account menu item when user not logged in (Mar 5, 2026)

- **Issue:** Settings showed the Account list item to signed-out users; tapping it would navigate to Account screen, which requires auth.
- **Fix:** Extended `MENU_ITEMS` filter to also gate `item.id === "account"` on `isSignedIn`, alongside notifications.
- **Files:** `apps/mobile/app/(tabs)/settings.tsx`

### #205. Account & Support: fix backlink header height to match DashboardBar (Mar 5, 2026)

- **Issue:** Account and Support screens used custom headers with `pb-3` and `paddingTop: insets.top + 8`; the bar height and styling did not match the Settings DashboardBar (profile icon on right).
- **Fix:** Applied `bg-surface`, `py-3`, `px-4` to match DashboardBar, and `paddingTop: insets.top` for safe-area clearance. Removed extra bottom padding that caused uneven height.
- **Files:** `apps/mobile/app/account.tsx`, `apps/mobile/app/support.tsx`

### #206. index.tsx handleRefresh: add try/catch for error logging (Mar 5, 2026)

- **Issue:** `handleRefresh` in the events feed home screen used try/finally but omitted catch; errors during refetch were not logged or surfaced.
- **Fix:** Added catch block with `console.error` including `action: "handleRefresh"` and error message. State cleanup remains in `finally`.
- **Files:** `apps/mobile/app/(tabs)/index.tsx`

### #207. index.tsx: scrollRef callback ref + handleRefresh result.error (Mar 5, 2026)

- **Issue:** (1) useFocusEffect registered scrollRef.current once; on first render it may be null before ScrollView mounts, so context missed the ref. (2) TanStack Query v5 refetch returns a result object with `result.error` instead of throwing; handleRefresh only caught thrown exceptions.
- **Fix:** Added callback ref `setScrollRef` that calls `registerScrollRef(node)` when ScrollView mounts/unmounts; kept useFocusEffect for focus-based re-registration. Updated handleRefresh to capture `const result = await refetch()`, check `result.error` and log with contextual shape (action, userId, err), plus catch for thrown exceptions; both paths clear state in `finally`.
- **Files:** `apps/mobile/app/(tabs)/index.tsx`

### #208. MARCH_2026_FIXES #203: correct GlowBlob (Skia) and PartnerLogos (35%) docs (Mar 5, 2026)

- **Issue:** Changelog #203 stated GlowBlob uses `react-native-svg` and partner logos increased by 15%; both were incorrect.
- **Fix:** Updated to: GlowBlob uses `@shopify/react-native-skia`; PartnerLogos uses `sizeMultiplier = 1.35` (35% increase).
- **Files:** `docs/fixes/MARCH_2026_FIXES.md`

### #209. EDGE_CASES_TODOS: capitalize Discover in ScrollToTopContext entry (Mar 5, 2026)

- **Issue:** Entry 10a used lowercase "discover" for the route/screen name; inconsistent with screen naming.
- **Fix:** Changed "discover" to "Discover" in heading and description.
- **Files:** `docs/todos/EDGE_CASES_TODOS.md`

### #210. HomeScreen: extract hooks and components (Mar 5, 2026)

- **Issue:** HomeScreen was too large (~320 lines); mixed status orchestration, refresh flow, scroll registration, filtering, and feed rendering.
- **Fix:** Extracted: `EventsStatusContainer` (shouldShowStatus + EventsScreenStatus), `useHomeRefresh` (handleRefresh, refreshing, isRefreshingRef), `useScrollRegistration` (setScrollRef, useFocusEffect, useEffect), `useEventFilters` (searchQuery, selectedCity/Organizer, cities, organizers, filteredEvents), `HomeFeedList` (HomeFeedEventCard + FeaturedEventsCta mapping). HomeScreen now composes these pieces without changing behavior.
- **Files:** `apps/mobile/app/(tabs)/index.tsx`, `apps/mobile/hooks/useHomeRefresh.ts`, `apps/mobile/hooks/useScrollRegistration.ts`, `apps/mobile/hooks/useEventFilters.ts`, `apps/mobile/components/home/EventsStatusContainer.tsx`, `apps/mobile/components/home/HomeFeedList.tsx`

### #211. HomeFeedList: FlatList virtualization + fixes (Mar 5, 2026) — _ListHeaderComponent gap superseded by #240_

- **Issue:** HomeFeedList used eager `.map()` over events, rendering all cards at once and hurting performance. EDGE_CASES_TODOS used uppercase `.MD` extension. Changelog #203 omitted metro/lockfile artifacts. Hero–feed spacing needed gap-[70px]. useScrollRegistration required a cast for scrollRef.
- **Fix:** Replaced map with FlatList (data, keyExtractor, renderItem, ListHeaderComponent with EventsHero + FeaturedEventsCta, ListEmptyComponent), initialNumToRender=10, windowSize=5; moved EventsHero into HomeFeedList. Renamed `EDGE_CASES_TODOS.MD` → `EDGE_CASES_TODOS.md` and updated all docs references. Added metro.config.js, pnpm-lock.yaml to #203 Files. Applied gap-[70px] between hero and feed in ListHeaderComponent. Changed useScrollRegistration to useRef<ScrollView | null>(null) and removed cast. Updated ScrollToTopContext to support FlatList via scrollToOffset.
- **Note:** ListHeaderComponent gap was later changed to `gap-4` per #240 (final home feed spacing).
- **Files:** `apps/mobile/components/home/HomeFeedList.tsx`, `apps/mobile/app/(tabs)/index.tsx`, `apps/mobile/hooks/useScrollRegistration.ts`, `apps/mobile/contexts/ScrollToTopContext.tsx`, `docs/fixes/MARCH_2026_FIXES.md`, `docs/todos/EDGE_CASES_TODOS.md`, `docs/project-migrations/IOS_MIGRATION.md`, `docs/fixes/FEB_2026_FIXES.md`, `docs/todos/NITPICKS_TODOS.md`

### #212. Docs: FEB_2026_FIXES EDGE_CASES cross-refs, NITPICKS **DEV** and rename note (Mar 5, 2026)

- **Issue:** FEB_2026_FIXES Fix #248b incorrectly referenced EDGE_CASES_TODOS #54 for Tier inline edit (useUpdateTier removal). #54 is Zod scanner validation; #59 is the Tier Inline Edit entry. NITPICKS_TODOS used bare `__DEV__` (markdownlint MD050). The EDGE_CASES filename rename note was a no-op (source and target identical).
- **Fix:** Updated Fix #248b to reference EDGE_CASES_TODOS #59 consistently. Wrapped `__DEV__` in inline code in NITPICKS_TODOS. Corrected rename instruction to "EDGE_CASES_TODOS.md → edge_cases_todos.md" with clearer repro steps. Updated EDGE_CASES_TODOS #59 Note to cite Fix #248b (was #240b).
- **Files:** `docs/fixes/FEB_2026_FIXES.md`, `docs/todos/NITPICKS_TODOS.md`, `docs/todos/EDGE_CASES_TODOS.md`

### #213. HomeFeedList: restore 24px gap between feed cards (Mar 6, 2026)

- **Issue:** When HomeFeedList was refactored from `.map()` (inside a `View` with `gap-6`) to `FlatList` (#211), the 24px inter-card spacing was lost because FlatList does not honor NativeWind `gap` on its container. Cards rendered flush against each other.
- **Fix:** Added `gap: 24` to FlatList's `contentContainerStyle`, restoring the original 24px spacing between consecutive cards.
- **Files:** `apps/mobile/components/home/HomeFeedList.tsx`

### #214. Sign-in: fix GO_BACK navigation error after authentication (Mar 6, 2026)

- **Issue:** After signing in (Google OAuth, email sign-in, or sign-up), `useSignInHandlers` called `router.back()` if `router.canGoBack()` was true. However, the auth state change simultaneously triggers `RoleResolutionGate` to unmount the `Stack` navigator (shows loading while resolving user role), causing the `GO_BACK` action to fire against an unmounted navigator. This produced a console error: "The action 'GO_BACK' was not handled by any navigator."
- **Fix:** Replaced all three `router.canGoBack() ? router.back() : router.replace("/")` patterns with `router.replace("/")`. Always navigating to home after sign-in avoids the race condition and matches standard UX.
- **Files:** `apps/mobile/hooks/useSignInHandlers.ts`

### #215. Attendee tab bar: replace History tab with Search (Mar 6, 2026)

- **Issue:** The History tab (clock icon, `/history` route) duplicated the "Past Tickets" section already available in the attendee Dashboard. This wasted tab real estate for a rarely-used separate screen when search/discover was not easily accessible.
- **Fix:** Replaced the `history` tab with a `search` tab: magnifying glass icon (`search-outline` / `search`), navigates to `/events` (the featured events listing screen). Removed `requiresAuth` since search doesn't require authentication.
- **Files:** `apps/mobile/components/navigation/CustomTabBar.tsx`

### #216. HistoryCard: make entire card tappable, remove chevron (Mar 6, 2026)

- **Issue:** Only the bottom row (quantity/price/chevron) of the HistoryCard was tappable. The eye icon was decorative with no press handler. The dropdown chevron implied expand/collapse behavior that didn't exist — it navigated to ticket detail.
- **Fix:** Wrapped the entire card in `Pressable` when `onPress` is provided (using dynamic `Wrapper` component). Removed the `chevron-down` icon. The eye icon remains as a visual affordance. Tapping anywhere on the card navigates to ticket detail.
- **Files:** `apps/mobile/components/history/HistoryCard.tsx`

### #217. Home screen: move title/subtitle to events screen, keep only search bar (Mar 6, 2026)

- **Issue:** The home screen's `EventsHero` rendered the "Discover Events" title and "Find extraordinary moments..." subtitle, consuming vertical space above the search bar. The same title/subtitle is more appropriate on the dedicated events listing screen.
- **Fix:** Made `EventsHero` conditionally render title and subtitle (only when truthy). `HomeFeedList` now passes `title=""` and `subtitle=""` so the home screen only shows the search bar + filter button. The events screen (`EventsScreenBody`) continues to use the default title/subtitle values.
- **Files:** `apps/mobile/components/events/EventsHero.tsx`, `apps/mobile/components/home/HomeFeedList.tsx`

### #218. Org event detail: fix action button active state toggle (Mar 6, 2026)

- **Issue:** `OrgActionButtons` hardcoded the promotions button as `bg-primary` and all others as `bg-white-5` with border. Clicking a button toggled the corresponding section's visibility but the button's appearance never changed, giving no visual feedback for which sections were active.
- **Fix:** Added `sections` prop (the `SectionVisibility` record) to `OrgActionButtons`. Unified all four buttons into the `ActionButton` component with an `active` prop that toggles between `bg-primary` (active) and `bg-white-5 border border-white-100` (inactive). `org-event-detail.tsx` now passes `sections` to the component.
- **Files:** `apps/mobile/components/org-dashboard/OrgActionButtons.tsx`, `apps/mobile/app/org-event-detail.tsx`

### #219. RSVP detail: disable approve/reject for past events (Mar 6, 2026)

- **Issue:** Organizers could approve or reject RSVPs for events that had already ended. Neither mobile nor web had a past-event guard. Approving a past-event RSVP could trigger payment flows or ticket issuance for an event that already occurred.
- **Fix:** Extended `useEventRsvps` to fetch `ends_at` from the event and compute `isPastEvent`. `rsvp-detail.tsx` passes `isPastEvent` to `RsvpRequestCard`, which hides the Approve/Reject buttons when the event is past. Web equivalent logged in `CRUCIAL_IOS_TO_WEB_TODOS.md` #10.
- **Files:** `apps/mobile/hooks/useRsvpManagement.ts`, `apps/mobile/app/rsvp-detail.tsx`, `apps/mobile/components/org-dashboard/RsvpRequestCard.tsx`, `docs/todos/CRUCIAL_IOS_TO_WEB_TODOS.md`

### #220. RsvpRequestCard: fix tier name overlapping ticket count and price (Mar 6, 2026)

- **Issue:** The tier name column used a fixed `w-[157px]` width. Long tier names (e.g., "Invitado de Socio / REGULAR ADMISSION") overflowed into the ticket count (row 1) and price (row 2) columns, making the right-side data unreadable.
- **Fix:** Replaced `w-[157px]` with `flex-1` on the left column and added `numberOfLines={1}` to the tier name `Text` for truncation. Added `flexShrink: 0` to the right columns (ticket count, price) so they never compress. This gives the tier name maximum available space while guaranteeing the quantity and price remain fully visible.
- **Files:** `apps/mobile/components/org-dashboard/RsvpRequestCard.tsx`

### #221. EDGE_CASES: user ticket quantity investigation — root cause found (Mar 6, 2026)

- **Issue:** User `flat95ona@gmail.com` sees past tickets with inflated quantities (329, 330, 126) for events they did not purchase. Initially deferred to EDGE_CASES_TODOS #72.
- **Fix:** Investigated via Supabase MCP — root cause identified as org-member RLS policy on `tickets` table. See #223 for the code fix. EDGE_CASES_TODOS #72 marked as resolved.
- **Files:** `docs/todos/EDGE_CASES_TODOS.md`

### #222. Scanner: multi-org selector for users in multiple organizations (Mar 6, 2026)

- **Issue:** Users belonging to multiple organizations had no way to see or switch between orgs in the QR scanner. The scanner only used an access code with no org context.
- **Fix:** Created `useUserOrgs` hook that fetches ALL organizations the user belongs to (unlike `useOrgData` which returns only the first). Created `OrgSelector` component with horizontal scroll of org profile circles, names, and white ring active indicator. Integrated below the access code entry on the scanner screen — appears only when user has 2+ orgs.
- **Files:** `apps/mobile/hooks/useUserOrgs.ts` (new), `apps/mobile/components/scanner/OrgSelector.tsx` (new), `apps/mobile/app/scanner.tsx`

### #223. useUserTickets: fix org members seeing ALL org tickets on their personal dashboard (Mar 6, 2026)

- **Issue:** User `flat95ona@gmail.com` (organizer for "Salinas Yacht Club" and "Hush Experiences") saw inflated ticket quantities (329, 330, 126) on their personal dashboard. Root cause: the `tickets` table has an RLS policy "Organization members can view tickets for their events" that returns ALL tickets for ALL events in the user's orgs. The `useUserTickets` query had no explicit user-scoping filter — it relied solely on RLS, which OR-combined the personal and org policies. DB investigation via Supabase MCP confirmed: user's actual orders = 1 ticket for "Partner event - One"; promotional tickets = 0; RSVPs = 1. The 329+ quantities came from org-wide tickets leaking through.
- **Fix:** Added explicit scoping in `useUserTickets`: (1) resolve user's internal DB id from clerk_id, (2) fetch the user's own order IDs, (3) filter the tickets query with `.in("order_id", userOrderIds)`. This ensures only the user's personal purchases appear on the attendee dashboard, regardless of org membership RLS. Updated EDGE_CASES_TODOS #72 as resolved.
- **Files:** `apps/mobile/hooks/useUserTickets.ts`

### #224. Search tab: navigate to Discover screen, not Events list (Mar 6, 2026)

- **Issue:** The search tab (magnifying glass, added in #215) navigated to `/events` (the events listing screen with EventListCards). User expected it to go to the Discover screen with the hero carousel, partner logos, and "Discover Events" title.
- **Fix:** Changed the search tab route from `/events` to `/discover`.
- **Files:** `apps/mobile/components/navigation/CustomTabBar.tsx`

### #225. Home screen: tighten spacing between search bar and feed cards (Mar 6, 2026) — _Superseded by #240_

- **Issue:** After removing the title/subtitle from the home screen hero (#217), the layout had excessive vertical space: `pt-[51px]` (designed for the full hero with title) plus `gap-[70px]` (designed for independent content blocks) between the search bar and the "Featured events" CTA. This created a large empty gap before cards appeared.
- **Fix:** Made `EventsHero` top padding conditional: `pt-[51px]` when title is present, `pt-4` when search-bar-only. Reduced the `ListHeaderComponent` gap from `gap-[70px]` to `gap-6` (24px) since the search bar and CTA are now a single compact header block.
- **Note:** Superseded by #240 (final spacing: `gap-4` for home feed search→CTA flow).
- **Files:** `apps/mobile/components/events/EventsHero.tsx`, `apps/mobile/components/home/HomeFeedList.tsx`

### #226. useNotifications: fix death-loop when Supabase JWT template returns null (Mar 6, 2026)

- **Issue:** `useNotifications` hook (mounted in `AppShell` — root layout) called `getAuthenticatedClient(getToken)` on every render. When `getToken({ template: "supabase" })` returned null (e.g., Clerk dev rate limit, template misconfiguration), `getAuthenticatedClient` threw, the catch handler set state, causing a re-render, which recreated the `fetchNotifications` callback, re-triggering the `useEffect` — creating an infinite error loop. This generated hundreds of `getToken` API calls per second, exhausting Clerk's development instance rate limit. Once rate-limited, ALL Clerk API calls failed — including Google OAuth `startSSOFlow`, email sign-in, and all Supabase-authenticated queries — making the entire app non-functional.
- **Fix:** Added a token-failure cooldown: after 3 consecutive `getToken` failures, `useNotifications` pauses for 60 seconds before retrying. Token errors are logged once as a warning (not spammed as errors). The failure counter resets when `isSignedIn` changes (sign-in/out).
- **Files:** `apps/mobile/hooks/useNotifications.ts`

### #227. Sign-in handlers: add console logging for debugging auth flow (Mar 6, 2026)

- **Issue:** `useSignInHandlers` only called `setError()` in catch blocks — never `console.error` or `console.log`. Auth failures were completely invisible in the terminal, making it impossible to diagnose sign-in issues.
- **Fix:** Added `console.log` / `console.error` at every step of Google OAuth (`startSSOFlow` start, redirect URL, result, session activation, errors) and email sign-in (start, result, session activation, errors). Also added logging to the "Force Sign Out" button in Settings.
- **Files:** `apps/mobile/hooks/useSignInHandlers.ts`, `apps/mobile/app/(tabs)/settings.tsx`

### #228. EventsHero: include subtitle in render guard (Mar 6, 2026)

- **Issue:** The outer render guard `(title || profileImageUrl !== undefined)` prevented rendering when title was empty but subtitle existed; subtitle-only states did not render.
- **Fix:** Updated guard to `(title || subtitle || profileImageUrl !== undefined)` so subtitle-only states render correctly.
- **Files:** `apps/mobile/components/events/EventsHero.tsx`

### #229. HomeFeedList: use discovery-screen gap for section spacing (Mar 6, 2026) — _Superseded by #240_

- **Issue:** ListHeaderComponent used `gap-6`; Marketing/Discovery screens (Home, Events Listing) require `gap-[70px]` per design system for large breathing room between sections.
- **Fix:** Changed `className="gap-6"` to `className="gap-[70px]"` on the ListHeaderComponent View.
- **Note:** Superseded by #240 (final spacing: `gap-4` for home feed search→CTA flow).
- **Files:** `apps/mobile/components/home/HomeFeedList.tsx`

### #230. useQRScanner: reset session when orgId changes (Mar 6, 2026)

- **Issue:** The hook made orgId dynamic but retained prior session state (accessCode, activeEventId). Verification/check-in could use stale session data tied to a different org.
- **Fix:** Added `useEffect` watching `orgId` that clears accessCode, activeEventId, activeEventName, and resets scanner state (ticketDetails, isPromotionalTicket, errorMessage, scannerState, refs) whenever orgId changes.
- **Files:** `apps/mobile/hooks/useQRScanner.ts`

### #231. useSignInHandlers: setError on no Google session + sanitize PII from logs (Mar 6, 2026)

- **Issue:** (1) When Google OAuth yielded no `createdSessionId`, only `console.warn` was called — users saw no actionable feedback. (2) Logs emitted PII (email, session IDs, raw error objects) which crash-reporting tools may capture.
- **Fix:** (1) Replaced `console.warn` with `setError("Sign-in failed: no session created from Google. Please try again.")` and `return` to stop further processing. (2) Replaced all `console.log`/`console.error` with sanitized context: `action` (e.g., `sso_signin`, `email_signin`), `provider`, `status` (success/failure/starting), and error summary (`message`, `code`) — no session IDs, emails, or raw error objects.
- **Files:** `apps/mobile/hooks/useSignInHandlers.ts`

### #232. qr-scanner APIs: validate orgId at API boundary (Mar 6, 2026)

- **Issue:** checkin, validate-code, and verify routes accepted malformed orgId (non-string, empty string) and either broadened queries (validate-code) or could bypass org-scoping checks.
- **Fix:** Added early validation in all three routes: if `orgId !== undefined && (typeof orgId !== "string" || orgId === "")`, return 400 with `{ error: "Invalid orgId: must be a non-empty string when provided" }`. Downstream org-scoping logic only runs when orgId passes validation.
- **Files:** `apps/web/app/api/qr-scanner/checkin/route.ts`, `apps/web/app/api/qr-scanner/validate-code/route.ts`, `apps/web/app/api/qr-scanner/verify/route.ts`

### #233. validate-code: add explicit type guard for code parameter (Mar 6, 2026)

- **Issue:** The `if (!code)` check allowed non-string values (e.g., number, array) to reach regex and DB logic.
- **Fix:** Added `typeof code !== "string"` guard before `codeRegex.test(code)`. Return 400 with `{ error: "Code is required and must be a string" }` when code is missing or not a string.
- **Files:** `apps/web/app/api/qr-scanner/validate-code/route.ts`

### #234. EventsHero: fix className ternary for subtitle-only spacing (Mar 6, 2026)

- **Issue:** The search bar margin ternary only checked `title`, so subtitle-only states received `mt-0` instead of the correct spacing.
- **Fix:** Updated outer condition to `(title || subtitle)` so: when subtitle exists → `mt-[23px]`; when only title exists → `mt-[35px]`; when neither → `mt-0`.
- **Files:** `apps/mobile/components/events/EventsHero.tsx`

### #235. useSignInHandlers: add action field to structured error payloads (Mar 6, 2026)

- **Issue:** `console.error` logs for sso_signin and email_signin lacked an explicit `action` field, making logs less queryable for monitoring.
- **Fix:** Added `action: "sso_signin"` and `action: "email_signin"` to the respective error payloads alongside provider, status, and errSummary.
- **Files:** `apps/mobile/hooks/useSignInHandlers.ts`

### #236. useQRScanner: use clearEventSession in orgId effect (Mar 6, 2026)

- **Issue:** The orgId-change useEffect duplicated session-reset logic (setAccessCode, setActiveEventId, etc.) instead of reusing `clearEventSession`.
- **Fix:** Replaced inline resets with a single `clearEventSession()` call. `clearEventSession` (via `resetScanner`) already clears refs. Dependency: `[orgId, clearEventSession]`.
- **Files:** `apps/mobile/hooks/useQRScanner.ts`

### #237. IOS_MIGRATION: add Section 9 behavioral changes companion docs (Mar 6, 2026)

- **Issue:** MARCH_2026_FIXES #114–#232 added many behavioral changes without companion documentation.
- **Fix:** Added Section 9 "Behavioral Changes & Migration Notes (Mar 2026)" to IOS_MIGRATION.md documenting: scanner org scoping (useQRScanner, OrgSelector, orgId API validation, session reset), ticket visibility scoping (useUserTickets order ID filter), auth cooldown (useNotifications getToken 60s cooldown), navigation/tab changes (CustomTabBar, useViewMode, search tab → /discover), promoter deep-linking & AASA, and RSVP past-event guard (useEventRsvps, isPastEvent).
- **Files:** `docs/project-migrations/IOS_MIGRATION.md`

### #238. Dashboard: show tier name (and stage) on ticket cards for same-event clarity (Mar 6, 2026)

- **Issue:** User flat95ona@gmail.com saw multiple identical-looking cards for "EL CALENTON" (quantities 1, 8, 14, 8) with no indication of why they were separate. Tickets are grouped by event+tier; events with multiple tiers show one card per tier, but the UI did not display tier or stage names.
- **Fix:** Added `tierName` and `stageName` to `TicketGroupDisplay` in `groupTicketsByEventAndTier`. TicketCard and HistoryCard now show "EVENT — Tier Name" or "EVENT — Tier Name — Stage" when tier/stage are present, matching the web's display pattern. This clarifies why multiple cards appear for the same event (different tiers) and helps surface any grouping bugs (e.g., same tier incorrectly split would show identical tier names).
- **Files:** `apps/mobile/lib/user-ticket-mappers.ts`, `apps/mobile/components/dashboard/TicketCard.tsx`, `apps/mobile/components/history/HistoryCard.tsx`

### #239. useUserTickets: fix RSVPs and promo tickets leaking org-wide data to personal dashboard (Mar 6, 2026)

- **Issue:** User `flat95ona@gmail.com` (organizer for Salinas Yacht Club) saw 4 EL CALENTON cards with quantities 1, 8, 14, 8 on their personal dashboard despite holding zero tickets/RSVPs for that event. DB confirmed via Supabase MCP: 0 orders, 0 tickets, 0 RSVPs, 0 promo tickets for this user/event. Root cause: same pattern as #223 (tickets table). The `rsvps` table has an "Organization members can view RSVPs for their events" RLS policy, and `promotional_tickets` has "Organizers can view promotional tickets for their events". These org-member policies OR-combine with the personal policy, leaking all 208 EL CALENTON RSVPs into the personal dashboard. Fix #223 only scoped purchased tickets — RSVPs and promo tickets were still unscoped.
- **Fix:** Added explicit user-scoping to both queries in `useUserTickets`: (1) RSVPs: added `.eq("user_id", currentUser.id)` to filter to only the user's own RSVPs. (2) Promotional tickets: fetch user's email from `users` table, then filter with `.ilike("email", userEmail)` to match only promo tickets issued to the current user. Both queries now scope results to the authenticated user regardless of org membership RLS.
- **Files:** `apps/mobile/hooks/useUserTickets.ts`

### #240. Home feed: tighten spacing between search bar and featured events CTA (Mar 6, 2026)

- **Issue:** Home feed (HomeFeedList) used `gap-[70px]` between search bar and "Featured events, organizer and more" CTA per Marketing/Discovery screen pattern. For the home feed, search bar + CTA + event cards form one interaction flow (search → results); the 70px gap created excessive whitespace and separated related content.
- **Fix:** Applied Form/List and Dense List spacing per design system: (1) ListHeaderComponent gap reduced from `gap-[70px]` to `gap-4` (16px). (2) EventsHero compact mode (no title/subtitle): `pb-2` instead of `pb-4`. (3) FlatList `contentContainerStyle` gap 24 → 16. (4) renderItem internal gap `gap-6` → `gap-4`. Featured events, organizer CTA, and event cards now sit closer to the search bar as one continuous discovery flow.
- **Files:** `apps/mobile/components/home/HomeFeedList.tsx`, `apps/mobile/components/events/EventsHero.tsx`

### #241. Discover page + org event detail: tighten section spacing (Mar 6, 2026)

- **Issue:** (1) Discover page (LegacyHomeContent) used `gap-[70px] mt-[70px]` between PartnerLogos, ExploreOrganizers, HostBanner, and other sections — excessive for related discovery content. (2) Org event detail (view details) used `gap-[70px]` between header, OrgEventInfoCard, OrgActionButtons (4 icons), and cards — the 4 icons row had too much top/bottom spacing.
- **Fix:** Applied Dashboard/Task spacing (`gap-[30px]`) per design system: (1) LegacyHomeContent: `gap-[70px] mt-[70px]` → `gap-[30px] mt-[30px]`. (2) org-event-detail: main content View `gap-[70px]` → `gap-[30px]`. (3) OrgActionButtons: `gap-6 py-[6px]` → `gap-4 py-2` for tighter icon row.
- **Files:** `apps/mobile/components/home/LegacyHomeContent.tsx`, `apps/mobile/app/org-event-detail.tsx`, `apps/mobile/components/org-dashboard/OrgActionButtons.tsx`

### #242. PR review: stageName mixed groups, validate-code auth, IOS_MIGRATION tabs, onEmailSignUp log (Mar 6, 2026)

- **Issue:** (1) `groupTicketsByEventAndTier` derived `stageName` only from `group[0]`, yielding wrong labels for mixed-stage groups. (2) `validate-code` route had no auth/authorization guard before DB queries. (3) IOS_MIGRATION navigation summary listed "History" tab instead of Search/Discover. (4) `onEmailSignUp` error handler lacked structured log matching other auth handlers.
- **Fix:** (1) Compute `stageName` from all group members via `getStageName`; use common value if all match, else `"Mixed"`. (2) Added auth guard at POST start: require `userId`, require organizer/admin role via `getUserRole`, verify org membership when `orgId` provided before any event lookup. (3) IOS_MIGRATION Section 6: "History" → "Search/Discover", routes to `/discover`. (4) Added `console.error` with `action: "email_signup"`, `status: "failure"`, `errSummary` before `setError`. Nitpick (formatErrorSummary helper) deferred to NITPICKS_TODOS.
- **Files:** `apps/mobile/lib/user-ticket-mappers.ts`, `apps/web/app/api/qr-scanner/validate-code/route.ts`, `docs/project-migrations/IOS_MIGRATION.md`, `apps/mobile/hooks/useSignInHandlers.ts`

### #243. PR review: validate-code JSON parse guard, org membership, IOS_MIGRATION Section 9, NITPICKS consolidation (Mar 6, 2026)

- **Issue:** (1) `validate-code` route let JSON parse errors from `req.json()` bubble to outer catch as 500. (2) Route did not enforce org membership before returning event validation results. (3) IOS_MIGRATION Section 9 navigation notes were stale (detail routes list, RoleSwitcherSheet vs RoleSwitcherDropdown). (4) NITPICKS_TODOS had duplicate "PR Review (Mar 6, 2026)" blocks and incorrect keyExtractor example (org.id vs item.organizationId).
- **Fix:** (1) Wrapped `req.json()` in try/catch; return 400 `{ error: "Malformed JSON payload" }` on parse failure. (2) After event lookup, verify user is member of `event.organization_id` via `organization_members`; return 403 if not. (3) Section 9: CustomTabBar occluded only on `/sign-in` and `/scanner`; RoleSwitcherDropdown for header pill; Search tab routes to `/discover`. (4) NITPICKS_TODOS: keyExtractor uses `(item) => item.organizationId`; consolidated duplicate Mar 6 blocks. Nitpicks (OrgActionButtons export SectionVisibility/ActionButtonProps, formatErrorSummary, optional tierName/stageName) deferred.
- **Files:** `apps/web/app/api/qr-scanner/validate-code/route.ts`, `docs/project-migrations/IOS_MIGRATION.md`, `docs/todos/NITPICKS_TODOS.md`

### #246. PR review: remove invalid experimentalBlurMethod="stack" from BlurView (Mar 6, 2026)

- **Issue:** `experimentalBlurMethod="stack"` was added to `BlurViewComponent` in the previous fix (#245), but the valid union for `ExperimentalBlurMethod` in expo-blur v15 is only `'none' | 'dimezisBlurView'` (confirmed from `BlurView.types.d.ts`). `"stack"` is a TypeScript error and a no-op at runtime. The reviewer's alternative `"android"` is equally invalid. `"dimezisBlurView"` enables real native blur but carries a documented performance/graphical-issues warning and requires an additional native dependency. The `pillOverlay` View already provides the visual depth on Android.
- **Fix:** Removed `experimentalBlurMethod="stack"` prop from the `BlurViewComponent` JSX. The prop now defaults to `'none'` (library default), preserving existing behavior with no invalid literal.
- **Accessibility duplicate:** The second inline comment about `accessibilityRole` / `accessibilityState` on tab `Pressable`s is a duplicate of the item already deferred to `ACCESSIBILITY_TODOS.md`. Updated that entry to use `accessibilityRole="tab"` (more semantically correct than `"button"` for tab bar elements). No code change.
- **Files:** `apps/mobile/components/navigation/CustomTabBar.tsx`, `docs/todos/ACCESSIBILITY_TODOS.md`

### #245. PR review: CustomTabBar BlurView Android blur + expo-blur SDK 54 version (Mar 6, 2026)

- **Issue:** (1) `BlurViewComponent` in `CustomTabBar.tsx` was missing `experimentalBlurMethod` prop; on Android expo-blur silently falls back to a semi-transparent view instead of rendering a real blur. (2) `expo-blur` was pinned to `~14.1.5` in `apps/mobile/package.json`, which does not match Expo SDK 54's bundled version `~15.0.8`; this can cause subtle native-module version mismatches.
- **Fix:** (1) Added `experimentalBlurMethod="stack"` to the `BlurViewComponent` JSX alongside `intensity`, `tint`, and `style` so Android renders a real stack-based blur. (2) Updated `"expo-blur"` in `apps/mobile/package.json` from `~14.1.5` → `~15.0.8` and ran `pnpm install --no-frozen-lockfile` to update the lockfile.
- **Deferred:** Accessibility props on tab `Pressable` elements (non-critical) → `ACCESSIBILITY_TODOS.md`. Nitpicks (extract layout constants/`getTabBarPaddingBottom` to util, iOS shadow clipped by `overflow:"hidden"`, dead exports `TAB_BAR_PILL_HEIGHT`/`TAB_BAR_PILL_MARGIN`) → `NITPICKS_TODOS.md`.
- **Files:** `apps/mobile/components/navigation/CustomTabBar.tsx`, `apps/mobile/package.json`, `pnpm-lock.yaml`

### #244. Floating pill tab bar with BlurView glassmorphism (Mar 6, 2026)

- **Issue:** Bottom tab bar was a full-width opaque bar (`surface` background) docked to the screen bottom. Visually dated compared to iOS 26 floating Liquid Glass tab bar pattern. User requested pill-shaped floating tab bar.
- **Fix:** Redesigned `CustomTabBar` as a floating pill: (1) `position: "absolute"` with 24px horizontal margin, 8px above safe area, 56px tall, full capsule `borderRadius`. (2) Layered rendering: `BlurView` (expo-blur, intensity 40, dark tint) → semi-transparent `surface` overlay (rgba(8,19,26,0.55)) → hairline white-15 border → icon row. (3) Active tab indicator: small 4px red dot above icon. (4) Drop shadow on iOS (shadowOpacity 0.35, radius 16) and elevation on Android. (5) Moved `CustomTabBar` inside the Stack's parent `View` in `RoleResolutionGate` so it floats over content. (6) Added `getTabBarPaddingBottom(bottomInset)` helper; updated all 8 tab screens to use it for scroll content bottom padding. (7) Icon size 28 → 26 for pill proportions.
- **Upgrade path:** On SDK 55+, `BlurView` can be swapped for `expo-glass-effect` `GlassView` for native iOS 26 Liquid Glass. `NativeTabs` from `expo-router/unstable-native-tabs` is another option for fully native tab bar.
- **Files:** `apps/mobile/components/navigation/CustomTabBar.tsx`, `apps/mobile/components/navigation/RoleResolutionGate.tsx`, `apps/mobile/app/(tabs)/index.tsx`, `apps/mobile/app/(tabs)/dashboard.tsx`, `apps/mobile/app/(tabs)/history.tsx`, `apps/mobile/app/(tabs)/settings.tsx`, `apps/mobile/app/(tabs)/events-management.tsx`, `apps/mobile/app/(tabs)/rsvp-management.tsx`, `apps/mobile/app/(tabs)/org-dashboard.tsx`, `apps/mobile/app/(tabs)/create-event.tsx`, `apps/mobile/package.json` (added `expo-blur`)

---

### #256. P7-1 PR follow-ups (round 2): EAS config, access code visibility, docs casing (Mar 6, 2026)

- **EAS project ID placeholder** (`app.json`, `app.config.ts`): `app.json` had `"projectId": "YOUR_EAS_PROJECT_ID"` — a truthy placeholder that passed the `!projectId` guard in `registerForPushNotificationsAsync()` and reached `Notifications.getExpoPushTokenAsync()` with an invalid ID. Created `apps/mobile/app.config.ts` (dynamic Expo config) that reads `process.env.EAS_PROJECT_ID ?? undefined` into `extra.eas.projectId` at build time. Removed the hardcoded placeholder from `app.json` (`extra.eas` is now an empty object, overridden at build time by `app.config.ts`). With the placeholder removed, the existing `!projectId` guard in `notifications.ts` correctly short-circuits with a clear warning when `EAS_PROJECT_ID` is not set.
- **Access code input visibility** (`CheckoutMainSheet.tsx`, `CheckoutSheet.tsx`): The access code `TextInput` was only shown when `errorCode === "MISSING_SECRET_CODE" || "INVALID_SECRET_CODE"` or after the user had already typed a code — hiding the field entirely when the tier signals upfront that a code is required. Added an optional `requiresSecretCode?: boolean` prop (defaults to `false`) to `CheckoutMainSheetProps` and `CheckoutSheetProps`. Updated the visibility condition to `(requiresSecretCode || secretCode.length > 0 || errorCode === "MISSING_SECRET_CODE" || errorCode === "INVALID_SECRET_CODE")` so callers can surface the input before any server round-trip when the tier flag is known. Existing error-driven behavior is unchanged; callers that don't pass `requiresSecretCode` retain the current reactive pattern.
- **Docs casing** (`MARCH_2026_FIXES.md` entry #255): Two occurrences of `EDGE_CASES_TODOS.MD` (uppercase extension) in the Deferred and Files lines of entry #255 normalized to `EDGE_CASES_TODOS.md`, matching the canonical lowercase extension used everywhere else in the changelog.
- **Nitpick (deferred):** `FormField` type and `FormFieldSchema` live in `useRsvpManagement.ts` and are imported by `CheckoutMainSheet.tsx`; a future refactor could move them to `@project-flame/lib`. Logged in `NITPICKS_TODOS.md` (#816 and related entries) — no action in this PR.
- **Files:** `apps/mobile/app.config.ts` (new), `apps/mobile/app.json`, `apps/mobile/components/event-details/CheckoutMainSheet.tsx`, `apps/mobile/components/event-details/CheckoutSheet.tsx`, `docs/fixes/MARCH_2026_FIXES.md`, `docs/project-migrations/IOS_MIGRATION.md`

---

## Phase 7: Production Readiness Audit (Mar 6, 2026)

Full audit comparing mobile against the working web implementation. Identified 34 findings across checkout parity, org management, promoter links, push notifications, auth, visual consistency, and build configuration. Split into 3 branches: `p7-critical` (6 tasks), `p7-high` (11 tasks), `p7-low` (14 deferred items).

Task prompts and PR review prompts in `docs/prompts/prompts_phases.md` (Phase 7 section). IOS_MIGRATION.md updated. Master guide updated.

### P7-1 Critical — Checkout Parity & Build Setup (Branch: `p7-critical`)

### #247. P7-1a: RSVP `stage_id` parity (Mar 6, 2026)

- **Issue:** Mobile `useCheckout` did not send `stage_id` in any of the three RSVP body variants (free, 100% promo, post-PaymentSheet). The RSVP route validates `metadata.stageId === requestStageId` and rejects staged-tier RSVPs without it.
- **Fix:** Compute `stageId` once via `getStageId(tier)` at the start of `checkout()` and include `stage_id` in all three RSVP POST bodies and the direct-purchase hold body. Removed duplicate `getStageId` calls for `rsvpStageId` and `directStageId`.
- **Web source:** `apps/web/app/components/EventDetail.tsx` (`submitRsvpToBackend` sends `stage_id: selectedStageId`), `apps/web/app/api/rsvp/route.ts` (validates `metadata.stageId`).
- **Files:** `apps/mobile/hooks/useCheckout.ts`

### #248. P7-1b: Access code (secret_code) support (Mar 6, 2026)

- **Issue:** Tiers requiring an access code could not be purchased on mobile — `secret_code` was never sent to holds/create or RSVP. Server returned `MISSING_SECRET_CODE` / `INVALID_SECRET_CODE` with no mobile handling.
- **Fix:** (1) Added `secretCode` / `setSecretCode` state and `errorCode` / `setErrorCode` tracking to `useCheckout`. (2) Included `secret_code` in all RSVP body variants (free, 100% promo, post-PaymentSheet) and the direct-purchase hold body. (3) On `INVALID_SECRET_CODE` error, auto-clears `secretCode` so user can re-enter. (4) Added access code `TextInput` to `CheckoutMainSheet` — shown when `errorCode` is `MISSING_SECRET_CODE` / `INVALID_SECRET_CODE` or when a code has been entered. (5) Propagated `secretCode`, `onSecretCodeChange`, and `errorCode` through `CheckoutSheet` and `event/[id].tsx`.
- **Benchmark:** Ticketmaster and Eventbrite prompt for access/presale codes inline before checkout. Mobile now surfaces the input in the checkout sheet on server rejection, matching this pattern.
- **Web source:** `apps/web/app/components/EventDetail.tsx` (`verifiedSecretCode` state, `TicketCodeModal`, `MISSING_SECRET_CODE` handling), `apps/web/app/api/holds/create/route.ts` (`secret_code` in schema).
- **Files:** `apps/mobile/hooks/useCheckout.ts`, `apps/mobile/components/event-details/CheckoutMainSheet.tsx`, `apps/mobile/components/event-details/CheckoutSheet.tsx`, `apps/mobile/app/event/[id].tsx`

### #249. P7-1c: Registration form data for RSVP (Mar 6, 2026)

- **Issue:** Events with required registration forms (`registration_form_config`) rejected RSVP with "Registration form data is required". Mobile never collected or sent `registration_data`.
- **Fix:** (1) Added `registrationData` / `setRegistrationData` state to `useCheckout`. (2) Included `registration_data` in all three RSVP body variants. (3) Added inline registration form renderer to `CheckoutMainSheet` — reads `event.registration_form_config` (passed through from RPC via `.passthrough()`), renders `TextInput` for text/email/number/date fields and checkbox toggle for checkbox fields, with required-field indicators. (4) Data flows from form inputs → `onRegistrationDataChange` → hook state → RSVP body.
- **Benchmark:** Eventbrite and Luma collect registration fields inline before RSVP submission. Form renders in the checkout sheet, validates required fields client-side before submit (server-side validation is the backstop).
- **Web source:** `apps/web/app/components/EventDetail.tsx` (`registrationData` state, `RegistrationFormModal`), `apps/web/app/components/modals/RegistrationFormModal.tsx` (`FormField` interface), `apps/web/app/api/rsvp/route.ts` (validates `registration_data`).
- **Files:** `apps/mobile/hooks/useCheckout.ts`, `apps/mobile/components/event-details/CheckoutMainSheet.tsx`, `apps/mobile/components/event-details/CheckoutSheet.tsx`, `apps/mobile/app/event/[id].tsx`

### #250. P7-1d: RSVP promo `oldPaymentIntentId` (Mar 6, 2026)

- **Issue:** When applying or removing a promo in the RSVP paid flow, mobile created a new PaymentIntent without cancelling the old one. Orphaned Stripe authorizations held funds for ~7 days.
- **Fix:** Added `activeRsvpPiRef` to track the current RSVP PaymentIntent ID. On RSVP PI creation, passes `oldPaymentIntentId: activeRsvpPiRef.current` to `create-payment-intent` (server cancels the old PI). Stores the new PI ID in the ref after creation. Clears ref on RSVP success and on `resetCheckout`.
- **Web source:** `apps/web/app/components/modals/RsvpPaymentModal.tsx` (sends `oldPaymentIntentId` in `handleApplyPromoCode` and `handleRemovePromoCode`).
- **Files:** `apps/mobile/hooks/useCheckout.ts`

### #251. P7-1e: Push token deregistration on sign-out (Mar 6, 2026)

- **Issue:** After sign-out, the old user's push token remained registered in the `push_tokens` table. Another user signing in on the same device would mean the first user still receives notifications.
- **Fix:** (1) Created `POST /api/push-tokens/deregister` endpoint — authenticates via Clerk, resolves DB user, deletes the matching `push_tokens` row by `user_id` + `expo_push_token`. (2) Added `deregisterPushToken` function to `apps/mobile/lib/notifications.ts` — tracks the last registered token in a module-level variable, calls the deregister endpoint. (3) `settings.tsx` calls `deregisterPushToken(getToken)` before `signOut()`. (4) `PersonalSettingsTab.tsx` dynamically imports and calls the same function before sign-out.
- **Files:** `apps/web/app/api/push-tokens/deregister/route.ts` (new), `apps/mobile/lib/notifications.ts`, `apps/mobile/app/(tabs)/settings.tsx`, `apps/mobile/components/settings/PersonalSettingsTab.tsx`

### #252. P7-1f: Production build setup (Mar 6, 2026)

- **Issue:** Cannot build for TestFlight/App Store without EAS config and production env vars. `app.json` had `userInterfaceStyle: "light"` and white splash background despite the app being dark-theme only. `.env` had a duplicate `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` entry.
- **Fix:** (1) Created `apps/mobile/eas.json` with development (simulator, localhost API), preview (internal distribution, staging API), and production (auto-increment, production API) profiles + submit config stub. (2) Created `apps/mobile/.env.example` template with all `EXPO_PUBLIC_*` variable names (no real values). (3) Cleaned `.env`: removed duplicate Stripe key entry, consolidated comments. (4) Updated `app.json`: `userInterfaceStyle` → `"dark"`, splash `backgroundColor` → `"#000B12"` (matches design system `background` token, prevents white flash on launch).
- **Files:** `apps/mobile/eas.json` (new), `apps/mobile/.env.example` (new), `apps/mobile/.env`, `apps/mobile/app.json`

### #253. P7-1c follow-up: Defensive runtime validation for `registration_form_config` (Mar 6, 2026)

- **Issue:** `CheckoutMainSheet` used a double type assertion (`as FormField[] | null | undefined`) to cast `event.registration_form_config` without verifying the shape of individual items. Malformed server data (e.g. missing `id`/`label`/`type`) would cause runtime crashes when `.map()` accessed those keys.
- **Fix:** `CheckoutMainSheet.tsx` imports `FormFieldSchema` from `useRsvpManagement.ts` and validates `registration_form_config` via `z.array(FormFieldSchema).safeParse(raw)`. On parse success the typed array is used as `FormField[]`; on failure `formConfig` falls back to `null` so `hasForm` stays false and the form block is skipped cleanly. No local type guard or `VALID_FIELD_TYPES` constant is involved.
- **Files:** `apps/mobile/components/event-details/CheckoutMainSheet.tsx`

### #253b. P7-1e follow-up: Best-effort push token deregistration in `PersonalSettingsTab` (Mar 6, 2026)

- **Issue:** `deregisterPushToken(getToken)` was `await`-ed inside the main `try` block in `handleSignInOutPress`. Any network or API error it threw would be caught by the outer `catch`, surface "Sign Out Failed" to the user, and abort `signOut()` / `queryClient.clear()` / `router.replace("/")` — leaving the user still signed in.
- **Fix:** Wrapped the `deregisterPushToken` call in its own inner `try/catch` that logs a warning and swallows the error. `signOut`, `queryClient.clear`, and `router.replace` always execute regardless of deregistration outcome.
- **Files:** `apps/mobile/components/settings/PersonalSettingsTab.tsx`

### #254. P7-1c follow-up: Reset `localFormData` when checkout modal reopens (Mar 6, 2026)

- **Issue:** `localFormData` was initialised once with `useState({})` and never synced back to the `registrationData` prop. Reopening the modal after a previous partial fill (or switching tier/event) showed stale form values instead of the latest parent state.
- **Fix:** Added `useEffect([visible, registrationData])` that calls `setLocalFormData(registrationData ?? {})` when the modal becomes visible or `registrationData` changes. The `if (visible)` guard prevents resetting while the modal is animating closed.
- **Files:** `apps/mobile/components/event-details/CheckoutMainSheet.tsx`

### #255. P7-1 PR follow-ups: type safety, deregistration guard, docs (Mar 6, 2026)

- **`EventDetail.registration_form_config` type** (`useEventDetails.ts`): Added `registration_form_config?: unknown` to the `EventDetail` interface so the RPC-returned field is accessible without a cast. `CheckoutMainSheet.tsx` now reads `event.registration_form_config` directly (removed `(event as Record<string, unknown>)` assertion).
- **Persisted push token** (`notifications.ts`): Module-level `lastRegisteredToken` is now backed by `expo-secure-store`. `registerForPushNotificationsAsync` writes the token to `SecureStore` after a successful registration call. `deregisterPushToken` reads from `SecureStore` when the in-memory variable is null (cold launch) so deregistration always has the correct token. Token is cleared from `SecureStore` after successful deregistration.
- **`settings.tsx` deregistration guard**: Wrapped `deregisterPushToken(getToken)` in an inner `try/catch` in `handleSignOut` — mirrors the existing fix in `PersonalSettingsTab.tsx` (#253b). A deregistration failure now logs a warning instead of surfacing "Sign Out Failed" and leaving the user signed in.
- **`/api/push-tokens/deregister` malformed JSON guard** (`route.ts`): Wrapped `request.json()` in a `try/catch`; malformed JSON now returns `400 Malformed JSON` instead of falling through to the `500` handler.
- **`app.config.ts` EAS project ID injection**: `apps/mobile/app.config.ts` injects `extra.eas.projectId` from `process.env.EAS_PROJECT_ID` at build time (local dev: set in `apps/mobile/.env`; EAS builds: set via `eas.json` env or EAS Secrets). `app.json` keeps `extra.eas` as an empty object — no placeholder is required or written there. `registerForPushNotificationsAsync` reads the runtime value via `Constants.expoConfig?.extra?.eas?.projectId`; if the env var is absent the value is `undefined` and the function bails out with a clear warning instead of sending a truthy placeholder to the Expo push service. After running `eas init`, copy the printed project ID into `.env` and `.env.example`.
- **IOS_MIGRATION.md**: Mirrored all P7-1a–P7-1f entries and follow-ups (#247–#254) into the Phase 7 section so the migration doc reflects the full MARCH_2026 changelog for this branch.
- **Deferred:** Extract `RegistrationForm` component → `NITPICKS_TODOS.md`; deduplicate `FormField` interface → `NITPICKS_TODOS.md`; numeric field type preservation → `EDGE_CASES_TODOS.md` #74; `useEffect` sync direction for `registrationData` → `EDGE_CASES_TODOS.md` #75.
- **Files:** `apps/mobile/hooks/useEventDetails.ts`, `apps/mobile/components/event-details/CheckoutMainSheet.tsx`, `apps/mobile/lib/notifications.ts`, `apps/mobile/app/(tabs)/settings.tsx`, `apps/web/app/api/push-tokens/deregister/route.ts`, `apps/mobile/app.json`, `docs/project-migrations/IOS_MIGRATION.md`, `docs/todos/NITPICKS_TODOS.md`, `docs/todos/EDGE_CASES_TODOS.md`

---

## Phase 7-2: High — Org Management, Promoter Links & Visual Polish (Mar 6, 2026)

### #256. P7-2a: Promo code & promoter link delete on mobile (Mar 6, 2026)

- **Issue:** Organizers could not delete promo codes or promoter links on mobile. Web supports both via `DELETE /api/organizer/promotional-codes/:id` and `DELETE /api/organizer/promoter-links/:id`.
- **Fix:** Added `useDeletePromoCode` mutation to `usePromoCodes.ts` and `useDeletePromoterLink` mutation to `usePromoterLinks.ts`. Added delete buttons (trash icon) with confirmation Alert to `OrgPromotionsCard` (per `PromoCodePill`) and `OrgPromoterLinksCard` (per `LinkPill`).
- **Web source:** `apps/web/app/components/PromotionsSection.tsx`
- **Files:** `apps/mobile/hooks/usePromoCodes.ts`, `apps/mobile/hooks/usePromoterLinks.ts`, `apps/mobile/components/org-dashboard/OrgPromotionsCard.tsx`, `apps/mobile/components/org-dashboard/OrgPromoterLinksCard.tsx`

### #257. P7-2b: Promoter link — copy full URL and show stats (Mar 6, 2026)

- **Issue:** Mobile copied just the promoter code string; web copies the full shareable URL (`https://flme.co/events/{slug}?promoter={code}`). Mobile also dropped per-link stats (tickets sold, revenue).
- **Fix:** Updated `PromoterLinkDisplay` interface to include `code`, `fullUrl`, `ticketsSold`, `revenueCents`. `org-event-detail.tsx` now passes event `slug` and builds the full URL. `OrgPromoterLinksCard` copies the full URL and displays per-link ticket count and revenue.
- **Files:** `apps/mobile/app/org-event-detail.tsx`, `apps/mobile/components/org-dashboard/OrgPromoterLinksCard.tsx`

### #258. P7-2c: Deep link slug routing for promoter URLs (Mar 6, 2026)

- **Issue:** Web promoter URLs are `flme.co/events/{slug}?promoter=CODE`. The app claims `/events/*` via Universal Links but had no `/events/[slug]` route, so deep links opened the app but didn't resolve.
- **Fix:** Created `apps/mobile/app/events/[slug].tsx` route that resolves slug → event ID via Supabase query, then redirects to `/event/${id}?promoter=${promoter}`. Shows a loading spinner during resolution and an error state if the event is not found.
- **Files:** `apps/mobile/app/events/[slug].tsx` (new)

### #259. P7-2d: Primary red color audit (Mar 6, 2026)

- **Issue:** `#FF0000` primary red was used for general UI elements (buttons, tab indicators, filter pills, icons, text links, error messages) — too aggressive for a dark-themed app. Red should be reserved only for RSVP status badges and urgency indicators.
- **Fix:** Audited all `bg-primary`, `text-primary`, `border-primary`, `colors.primary` usages across `apps/mobile/`. Replaced: CTA/solid buttons → `bg-white-100`/`text-dark`; outline borders → `border-white-30`; active pills → `bg-white-100`/`text-dark`; tab bar icon+dot → `white-100`; error text → `#EA3370` (pink); links/accent → `text-white-100`; icons → `white-100`; switch tracks → `white-100`; checkboxes → `white-100` with dark check. Preserved `bg-primary` on "Today" badge, notification count badge, unread dot, and "Flame" branding.
- **Files:** `apps/mobile/app/(tabs)/create-event.tsx`, `apps/mobile/app/(tabs)/dashboard.tsx`, `apps/mobile/app/(tabs)/history.tsx`, `apps/mobile/app/(tabs)/rsvp-management.tsx`, `apps/mobile/app/(tabs)/settings.tsx`, `apps/mobile/app/event/[id].tsx`, `apps/mobile/app/notifications-settings.tsx`, `apps/mobile/app/org-event-detail.tsx`, `apps/mobile/app/rsvp-detail.tsx`, `apps/mobile/app/scanner.tsx`, `apps/mobile/app/ticket/[id].tsx`, `apps/mobile/components/create-event/DateTimePickerField.tsx`, `apps/mobile/components/create-event/KeyboardDoneBar.tsx`, `apps/mobile/components/dashboard/TicketCard.tsx`, `apps/mobile/components/event-details/CheckoutMainSheet.tsx`, `apps/mobile/components/event-details/CheckoutSheet.tsx`, `apps/mobile/components/event-details/TicketTierCard.tsx`, `apps/mobile/components/events-management/EditEventDetailsTab.tsx`, `apps/mobile/components/events-management/ManageEventCard.tsx`, `apps/mobile/components/events-management/TimeSelector.tsx`, `apps/mobile/components/events/FilterBottomSheet.tsx`, `apps/mobile/components/home/FAQSection.tsx`, `apps/mobile/components/navigation/BecomeOrganizerSheet.tsx`, `apps/mobile/components/navigation/CustomTabBar.tsx`, `apps/mobile/components/navigation/RoleSwitcherDropdown.tsx`, `apps/mobile/components/navigation/RoleSwitcherSheet.tsx`, `apps/mobile/components/notifications/NotificationsOverlay.tsx`, `apps/mobile/components/org-dashboard/OrgActionButtons.tsx`, `apps/mobile/components/org-dashboard/OrgPromoterLinksCard.tsx`, `apps/mobile/components/org-dashboard/OrgPromotionsCard.tsx`, `apps/mobile/components/org-dashboard/RsvpRequestCard.tsx`, `apps/mobile/components/org-dashboard/RsvpStatsBar.tsx`, `apps/mobile/components/settings/PersonalSettingsTab.tsx`, `apps/mobile/components/settings/SettingsEditableField.tsx`, `apps/mobile/components/sign-in/CredentialsForm.tsx`, `apps/mobile/components/sign-in/ToggleMode.tsx`

### #260. P7-2e: RSVP Detail layout fixes (Mar 6, 2026)

- **Issue:** (1) `RsvpStatsBar` overflowed on smaller screens. (2) Filter tabs non-scrollable. (3) `RsvpRequestCard` info rows had unequal widths.
- **Fix:** (1) Wrapped stats in horizontal `ScrollView`. (2) Wrapped filter tabs in horizontal `ScrollView`. (3) Equal-width flex items with `numberOfLines={1}` truncation.
- **Files:** `apps/mobile/components/org-dashboard/RsvpStatsBar.tsx`, `apps/mobile/app/rsvp-detail.tsx`, `apps/mobile/components/org-dashboard/RsvpRequestCard.tsx`

### #261. P7-2f: Remove Force Sign Out button (Mar 6, 2026)

- **Issue:** Redundant "Force Sign Out" button now that primary "Sign Out" works.
- **Fix:** Removed the button and its `border-primary` styling.
- **Files:** `apps/mobile/app/(tabs)/settings.tsx`

### #262. P7-2g: Auth console.log cleanup (Mar 6, 2026)

- **Issue:** ~10 `console.log`/`console.error` calls in production auth paths.
- **Fix:** Wrapped all in `if (__DEV__)` guards.
- **Files:** `apps/mobile/hooks/useSignInHandlers.ts`

### #263. P7-2h: Notifications overlay smooth animations (Mar 6, 2026)

- **Issue:** `Swipeable` from `react-native-gesture-handler/ReanimatedSwipeable` caused janky swipe-to-dismiss.
- **Fix:** Replaced with `Gesture.Pan()` + `GestureDetector` + reanimated shared values. New `SwipeableNotificationRow` provides: 1:1 finger tracking on UI thread, velocity-based fling detection (800px/s), row height/opacity collapse for smooth gap closure, behind-row action reveal.
- **Files:** `apps/mobile/components/notifications/NotificationsOverlay.tsx`

### #264. P7-2i: Notification error state (Mar 6, 2026)

- **Issue:** `useNotifications` error not shown in overlay — empty list with no explanation.
- **Fix:** Added `error` to `NotificationsOverlayState`. Overlay shows alert icon + error message + Retry button when fetch fails.
- **Files:** `apps/mobile/components/notifications/NotificationsOverlay.tsx`

### #265. P7-2j: Promo code Apply loading state (Mar 6, 2026)

- **Issue:** Apply button stayed enabled during promo validation — double-tap risk.
- **Fix:** Added `isValidatingPromo` state to `useCheckout`. Apply button disabled + spinner during validation. Input also disabled.
- **Files:** `apps/mobile/hooks/useCheckout.ts`, `apps/mobile/components/event-details/CheckoutSheet.tsx`, `apps/mobile/components/event-details/CheckoutMainSheet.tsx`, `apps/mobile/app/event/[id].tsx`

### #266. P7-2k: Remove Change Password button (Mar 6, 2026)

- **Issue:** Empty handler (`() => {}`) — Clerk doesn't support in-app password change for OAuth users.
- **Fix:** Removed the button and handler entirely.
- **Files:** `apps/mobile/components/settings/PersonalSettingsTab.tsx`

### #267. P7-2l: Promoter link fullUrl null fallback (Mar 6, 2026)

- **Issue:** `promoterLinksDisplay` in `org-event-detail.tsx` set `fullUrl` to the raw `promoter_code` string when `event.slug` was falsy, producing a non-URL value. Copying it via the organizer's "Promoter Links" card gave a useless string instead of a shareable link.
- **Fix:** Changed fallback to `null` when `eventSlug` is absent. Updated `PromoterLinkDisplay.fullUrl` to `string | null`. Copy button in `OrgPromoterLinksCard` is now disabled (opacity 0.3) and guarded against null, so users can never copy a non-URL.
- **Files:** `apps/mobile/app/org-event-detail.tsx`, `apps/mobile/components/org-dashboard/OrgPromoterLinksCard.tsx`

### #268. P7-2m: Scanner ActivityIndicator faint color (Mar 6, 2026)

- **Issue:** The "Verifying Ticket" `ActivityIndicator` used `colors["white-100"]` (`#F9FBFE`), which renders faint on dark backgrounds per the design system rule (see `flame-design-system.mdc`).
- **Fix:** Changed to literal `"#FFFFFF"` to match the established pattern (same as the loading spinner in `NotificationsOverlay`).
- **Files:** `apps/mobile/app/scanner.tsx`

### #269. P7-2n: NotificationsOverlay retry swallows error silently (Mar 6, 2026) — ⚠️ Superseded by #272

- **Issue:** The Retry button's `onPress` handler had an empty `catch {}` block, silently discarding any error thrown by `refresh()` and making debugging impossible.
- **Fix (at time of #269):** Changed to `catch (err) { console.error(...) }` (bare, production-logging). **This was subsequently revised in #272**, which wrapped the same call in `if (__DEV__)` to restrict logging to development builds. The final state of the Retry button's `catch` block is `if (__DEV__) console.error("[NotificationsOverlay] retry refresh failed", err)`.
- **Files:** `apps/mobile/components/notifications/NotificationsOverlay.tsx`

---

## Phase 7-2 PR Follow-up Fixes (Mar 6, 2026)

### #270. P7-2 follow-up: Switch thumb invisible when ON (Mar 6, 2026)

- **Issue:** The primary-color audit (#259) changed Switch colors to `colors["white-100"]` for both `trackColor.true` and `thumbColor`. When the switch is ON, the thumb and track are the same color, making the switch state indistinguishable — usability regression.
- **Fix:** Changed `trackColor.true` to `"rgba(255,255,255,0.5)"` and `thumbColor` to `"#FFFFFF"` on both the attendee and organizer Switch rows so the thumb is clearly visible against the dimmed track. Matches the existing ACCESSIBILITY_TODOS.md entry (now marked resolved).
- **Files:** `apps/mobile/app/notifications-settings.tsx`

### #271. P7-2 follow-up: Hardcoded promoter URL domain + unencoded query param (Mar 6, 2026)

- **Issue:** `promoterLinksDisplay` in `org-event-detail.tsx` hardcoded `https://flme.co` as the base URL, preventing non-production builds from generating correct shareable links. The promoter code was also appended to the URL without `encodeURIComponent`, which would corrupt links containing special characters.
- **Fix:** Added `EXPO_PUBLIC_APP_URL` env variable (defaults to `https://flme.co`). Extracted `APP_BASE_URL` as a module-level constant. Applied `encodeURIComponent(l.promoter_code)` when appending the `promoter` query param. Updated `.env.example` template with the new variable, a comment explaining its purpose and default, and a note that non-production builds must override it.
- **Files:** `apps/mobile/.env`, `apps/mobile/.env.example`, `apps/mobile/app/org-event-detail.tsx`

### #272. P7-2 follow-up: NotificationsOverlay collapses row before dismiss resolves (Mar 6, 2026)

- **Issue:** `SwipeableNotificationRow` typed `onDismiss` as `void`-returning, so the row always collapsed regardless of whether the server dismiss succeeded or failed. `handleDismiss` also swallowed errors with `.catch()`, preventing the row from reverting on failure. The Retry button's `catch` block was also missing the `__DEV__` guard (bare `console.error` would log in production).
- **Fix:** Changed `onDismiss` prop type to `(id: string) => Promise<void>`. Updated `doDismiss` to be async and `await onDismiss(item.id)`. On rejection, the row springs back via `withSpring`/`withTiming` on all three shared values (`translateX`, `rowHeight`, `rowOpacity`). `handleDismiss` now returns the raw `dismiss(id)` promise so the row receives the rejection. Also revised the Retry button's `catch` block (originally added bare in #269) to `if (__DEV__) console.error(...)` — final state: dev-only logging, no production noise.
- **Files:** `apps/mobile/components/notifications/NotificationsOverlay.tsx`

### #273. P7-2 follow-up: useCheckout promo catch clears user input on server errors (Mar 6, 2026)

- **Issue:** The promo validation `catch` block called `setPromoCode("")` for all errors — including network/5xx failures — destroying the user's entered code on transient errors. Logging was also `__DEV__`-only, so promo validation failures were invisible in production.
- **Fix:** Inspect `apiErr.status` to distinguish client errors (4xx) from server/transport errors. 4xx: clear code and show "Invalid promo code" (original behavior). Non-4xx/no status: preserve the user's code, show a "Something went wrong. Please try again." message. Logging now runs unconditionally (production-capable) with full context (`action`, `userId`, `eventId`, `code`, `err`).
- **Files:** `apps/mobile/hooks/useCheckout.ts`

### #274. P7-2 follow-up: TicketCard Buy Now CTA active when onBuyPress is undefined (Mar 6, 2026)

- **Issue:** The `ready_to_buy` branch in `TicketCard` rendered an enabled, tappable "Buy Now" button even when `onBuyPress` was not provided, presenting a dead-end CTA.
- **Fix:** Added an early `if (!onBuyPress) return null` guard before rendering the Buy CTA so the button only appears when a handler is wired.
- **Files:** `apps/mobile/components/dashboard/TicketCard.tsx`

### #275. P7-2 follow-up: All promo/promoter-link pills flash deleting state together (Mar 6, 2026)

- **Issue:** `OrgPromotionsCard` and `OrgPromoterLinksCard` passed the shared mutation `isPending` boolean to every pill, so deleting one item made all items appear as deleting.
- **Fix:** Added local `deletingPromoId` / `deletingLinkId` state (`useState<string | null>`). Set to the targeted item's ID before calling `mutate`, cleared in `onSettled`. Pills now receive `isDeleting={deletingId === item.id && mutation.isPending}` so only the targeted pill shows the loading state.
- **Files:** `apps/mobile/components/org-dashboard/OrgPromotionsCard.tsx`, `apps/mobile/components/org-dashboard/OrgPromoterLinksCard.tsx`

### #276. P7-2 follow-up: SwipeableNotificationRow collapses from wrong height (Mar 6, 2026)

- **Issue:** `rowHeight` was initialized to a hardcoded constant (`ROW_HEIGHT = 80`). `rowStyle` used `rowHeight.value === ROW_HEIGHT` as the "natural height" sentinel, so any notification taller than 80px would snap to 80 before collapsing, causing a visible jump. The revert-on-failure path also animated back to 80 rather than the actual content height.
- **Fix:** Changed `rowHeight` to use `-1` as the natural-height sentinel (`rowHeight.value < 0 ? undefined : rowHeight.value` in `rowStyle`). Added `measuredHeight = useSharedValue(ROW_HEIGHT)` (UI-thread-accessible) and a `handleLayout` callback on an inner `View` wrapping `NotificationCard` that records the actual content height. In `panGesture.onEnd`, the collapse now anchors `rowHeight.value = measuredHeight.value` before starting `withTiming(0)`, so the animation starts from the real height. The `doDismiss` revert uses `measuredHeight.value` instead of `ROW_HEIGHT`.
- **Files:** `apps/mobile/components/notifications/NotificationsOverlay.tsx`

---

## Web Parity Gate — P7-2 PR (Mar 6, 2026)

### 1. Web Source References

| Mobile file changed                                             | Web source-of-truth                                                                          |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `apps/mobile/app/org-event-detail.tsx`                          | `apps/web/app/components/PromotionsSection.tsx` (promoter URL construction)                  |
| `apps/mobile/components/org-dashboard/OrgPromotionsCard.tsx`    | `apps/web/app/components/PromotionsSection.tsx`                                              |
| `apps/mobile/components/org-dashboard/OrgPromoterLinksCard.tsx` | `apps/web/app/components/PromotionsSection.tsx`                                              |
| `apps/mobile/hooks/useCheckout.ts`                              | `apps/web/app/components/RsvpPaymentModal.tsx` (promo validation flow)                       |
| `apps/mobile/components/dashboard/TicketCard.tsx`               | `apps/web/app/components/UserDashboard.tsx` (ticket card CTAs)                               |
| `apps/mobile/app/events/[slug].tsx` (deep-link resolver)        | `apps/web/app/events/[slug]/page.tsx` (web event page — serves directly, no redirect needed) |

### 2. API Parity Evidence

- **`DELETE /api/organizer/promotional-codes/:id`** (`useDeletePromoCode`): Method, path, and auth header match web implementation in `PromotionsSection.tsx`. No request body (ID in path). Response: 200 on success; error surfaced via `onError` Alert. ✅
- **`DELETE /api/organizer/promoter-links/:id`** (`useDeletePromoterLink`): Same pattern as above. ✅
- **`POST /api/organizer/validate-promo`** (`useCheckout.ts`): Request body `{ eventId, tierId, quantity, promoCode }` matches web's `RsvpPaymentModal.tsx`. Error handling now distinguishes 4xx (client validation) from 5xx/network (transport). ✅
- **`events/[slug]` resolver (mobile deep-link):** No API call — the mobile resolver queries Supabase directly for `slug → id`. The `promoter` query param received via Universal Link is URL-encoded via `encodeURIComponent(promoter)` before being appended to the internal redirect: `router.replace(\`/event/${id}?promoter=${encodeURIComponent(promoter)}\`)`. Web has no equivalent redirect; it renders the event page directly from the slug. ✅

### 3. Calculation Parity Evidence

- `PromoterLinkDisplay.fullUrl` is now built as `${APP_BASE_URL}/events/${eventSlug}?promoter=${encodeURIComponent(l.promoter_code)}` — mirrors web's `PromotionsSection.tsx` URL construction. ✅
- `PromoterLinkDisplay.revenueCents` displayed via `formatCentsAsPrice()` from `@project-flame/lib` — same as web. ✅
- Promo validation uses server-authoritative amounts (`setServerAmounts`) once returned; no client-side fee calculation introduced. ✅

### 4. Edge Case Verification

| Scenario                                           | Verified                                                                                                                                 |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Standard paid purchase (promo validation succeeds) | ✅ promo applied, server amounts used                                                                                                    |
| Network error during promo validation              | ✅ code preserved, retry-friendly error message shown                                                                                    |
| 4xx invalid promo code response                    | ✅ code cleared, "Invalid promo code" shown                                                                                              |
| Promo delete — single item                         | ✅ only targeted pill shows deleting state                                                                                               |
| Promoter link delete — single item                 | ✅ only targeted pill shows deleting state                                                                                               |
| Promoter link with missing slug                    | ✅ `fullUrl` is `null`, copy button disabled                                                                                             |
| `onBuyPress` undefined in TicketCard               | ✅ Buy CTA not rendered                                                                                                                  |
| Notification dismiss succeeds                      | ✅ row collapses and stays gone                                                                                                          |
| Notification dismiss fails                         | ✅ row springs back to visible state                                                                                                     |
| Deep-link with valid slug + `promoter` param       | ✅ slug resolved → redirected to `/event/${id}?promoter=${encodeURIComponent(code)}`                                                     |
| Deep-link with valid slug, no `promoter` param     | ✅ redirected to `/event/${id}` (no stale promoter appended)                                                                             |
| Deep-link with invalid/unknown slug                | ✅ error state shown, user can navigate back                                                                                             |
| `promoter` param URL-encoded end-to-end            | ✅ `encodeURIComponent` applied when building shareable link (org-event-detail) AND when building the deep-link redirect (events/[slug]) |

### 5. Cross-Platform Behavior Check

- **Copy URL (mobile vs. web):** Web copies full URL via `navigator.clipboard`. Mobile copies via `expo-clipboard` Clipboard API. Both produce identical `${appBaseUrl}/events/${slug}?promoter=${encodedCode}` strings. ✅
- **Deep-link redirect (mobile `events/[slug]` resolver vs. web):** Web's `apps/web/app/events/[slug]/page.tsx` serves the event page directly — no redirect. Mobile's `apps/mobile/app/events/[slug].tsx` is a deep-link resolver: it resolves slug → event ID via a Supabase query and calls `router.replace(\`/event/${id}?promoter=${encodeURIComponent(promoter)}\`)` — the promoter code is URL-encoded before being appended, so special characters in codes are safe. The divergence is intentional and platform-specific. Both paths ultimately display the same event to the user. ✅
- **Switch state visibility:** Web uses HTML `<input type="checkbox">` (inherently distinct states). Mobile `Switch` now has distinct `trackColor.true` (semi-transparent) and `thumbColor` (solid white). Both clearly communicate on/off state. ✅

---

### #277. P7-3: Deferred low-priority items to todo files (Mar 6, 2026)

- **Issue:** Phase 7-3 identified 10 edge cases and 4 nitpicks from the P7 PR review that are non-blocking for launch. Per the P7-3 prompt, these items should be logged to the appropriate todo files with full context, reproduction steps, affected files, and suggested fixes rather than implemented.
- **Fix:** Logged all 14 deferred items:
  - **EDGE_CASES_TODOS.md** (#77–#86): Revenue calculation web/mobile divergence (#77), tier editing not implemented (#78), edit event raw date text + no image upload (#79), Stripe Connect not on org dashboard (#80), 2-hour event creation rule not validated client-side (#81), 401/token expiry no global handling (#82), "Unknown Organizer" on ticket detail (#83), real-time notification refresh (#84), offline detection (#85), push token registration retry (#86).
  - **NITPICKS_TODOS.md** (P7-3 section): Duplicate sign-out buttons in settings.tsx + PersonalSettingsTab, notification preference update no failure toast, promoter link list errors not surfaced in UI, `validate-code` response shape not validated at runtime.
  - Each entry includes: affected files with line numbers, issue description, reproduction steps, suggested fix with code samples where applicable, deferral reason, and cross-references to related existing entries.
- **Files:** `docs/todos/EDGE_CASES_TODOS.md`, `docs/todos/NITPICKS_TODOS.md`

---

## Production-Critical Fixes from P7-3 & TODO Audit (Mar 6, 2026)

Re-evaluation of previously deferred items identified 9 production-critical issues (from EDGE_CASES_TODOS and NITPICKS_TODOS) that must be fixed before launch.

### #278. "Unknown Organizer" on ticket detail — add `organizations(name)` join (Mar 6, 2026)

- **Issue:** `useUserTickets` SELECT queries (TICKET_SELECT, RSVP_SELECT, PROMO_SELECT) were missing the `organizations(name)` join on the events relation. Ticket detail screen showed "Unknown Organizer" for all tickets because the data was never fetched.
- **Fix:** Added `organizations(name)` to all three SELECT constants inside the `events(...)` join. The RLS recursion fix migration (`20260225205102`) makes this safe — `organizations` table has a public SELECT policy.
- **Ref:** EDGE_CASES_TODOS #83
- **Files:** `apps/mobile/hooks/useUserTickets.ts`

### #279. Negative availability guard in TierCard (Mar 6, 2026)

- **Issue:** `TierCard` computed `tier.totalAvailable - tier.sold` without clamping. If `sold > totalAvailable` (due to oversell or data lag), the display showed negative numbers like "-3/100 available".
- **Fix:** Wrapped with `Math.max(0, tier.totalAvailable - tier.sold)` so it floors at 0.
- **Ref:** EDGE_CASES_TODOS #31
- **Files:** `apps/mobile/components/create-event/TierCard.tsx`

### #280. 2-hour event creation rule — client-side validation (Mar 6, 2026)

- **Issue:** The web API rejects events starting less than 2 hours in the future, but mobile had no client-side validation. Users got a generic server error after filling out the entire form.
- **Fix:** Added `startsAtDate < twoHoursFromNow` check in `handleSubmit` (after `endsAtDate <= startsAtDate` validation), with a clear Alert explaining the 2-hour minimum.
- **Ref:** EDGE_CASES_TODOS #81
- **Files:** `apps/mobile/app/(tabs)/create-event.tsx`

### #281. `account.tsx` — wrap with RequireAuthGate (Mar 6, 2026)

- **Issue:** The Account screen (deep-linkable at `/account`) rendered for unauthenticated users, showing an empty settings UI. Other auth-required screens like `org-dashboard` already used `RequireAuthGate`.
- **Fix:** Imported `RequireAuthGate` from `hooks/useRequireAuth` and wrapped the screen JSX. Unauthenticated deep-links now redirect to sign-in.
- **Files:** `apps/mobile/app/account.tsx`

### #282. Push token retry with exponential backoff (Mar 6, 2026)

- **Issue:** `useNotificationRegistration` had fire-and-forget push token registration. If the first attempt failed (e.g., network flake during app cold start), the token was never registered and the user would not receive push notifications for the rest of the session.
- **Fix:** Added retry logic with exponential backoff (5s, 15s, 30s — max 3 retries). Cleans up timer on sign-out and unmount. `hasRegistered` ref prevents re-registration after success.
- **Ref:** EDGE_CASES_TODOS #86
- **Files:** `apps/mobile/hooks/useNotificationRegistration.ts`

### #283. 401/token expiry — global retry in api.ts (Mar 6, 2026)

- **Issue:** When a Clerk session token expired mid-session, API calls failed with 401. The user saw a generic error and had to force-quit and re-open the app. No retry or redirect logic existed.
- **Fix:** Extracted shared `executeRequest` and `executeUpload` helpers. Both `apiClient` and `apiUploadFormData` now detect a 401 response, call `getToken()` again (Clerk auto-refreshes tokens close to expiry), and retry once with the fresh token. If the retry also returns 401, throws an `ApiError` with code `SESSION_EXPIRED` and a clear "Your session has expired. Please sign in again." message.
- **Ref:** EDGE_CASES_TODOS #82
- **Files:** `apps/mobile/lib/api.ts`

### ~~#284. Revenue calculation parity — use web API for org dashboard~~ (superseded by #294)

- **Superseded by [#294](#294-org-dashboard-stats--query-supabase-directly-instead-of-web-api-mar-6-2026).** #284 created `useOrgDashboardStats` calling `GET /api/organizer/data` for revenue data. #294 replaced that web API call with a direct Supabase query on the `orders` table, eliminating the mobile dependency on the web server for read operations. `useOrgDashboardStats` no longer calls `/api/organizer/data` — it uses the authenticated Supabase client directly. `org-dashboard.tsx` is otherwise unchanged (still uses the returned `RevenueMap`).
- **Ref:** EDGE_CASES_TODOS #77
- **Files:** `apps/mobile/hooks/useOrgDashboardStats.ts`, `apps/mobile/app/(tabs)/org-dashboard.tsx`

### #285. `sync-current-user` — implement actual Supabase upsert (Mar 6, 2026)

- **Issue:** The `POST /api/auth/sync-current-user` route was a stub — it fetched Clerk user data but never wrote to Supabase. Users who signed up before the Clerk webhook was configured had no `users` row, causing downstream failures.
- **Fix:** Added `supabaseAdmin.from("users").upsert(userData, { onConflict: "clerk_id" })` to actually insert/update the user record. Returns the synced user data on success.
- **Important note on sync architecture:** This route is an **optional, manual edge-case trigger** — not the primary user-sync path. The primary sync remains JIT (just-in-time) via `resolveDbUserFromClerkId` in `apps/web/app/lib/auth.ts`, which is called automatically on the first authenticated API request for any user. The `POST /api/auth/sync-current-user` endpoint is only called explicitly to force an upsert for pre-existing Clerk users who don't yet have a `users` row (e.g., users who signed up before the Clerk webhook was configured). See `docs/project-migrations/IOS_MIGRATION.md` Section 7 for the updated reference mapping.
- **Ref:** EDGE_CASES_TODOS #47/#48
- **Web source:** JIT sync pattern in `apps/web/app/lib/auth.ts` → `resolveDbUserFromClerkId`
- **Files:** `apps/web/app/api/auth/sync-current-user/route.ts`

### #286. DB migration — notifications NOT NULL + globally unique push token (Mar 6, 2026)

- **Issue:** (1) `notifications.read` and `notifications.created_at` were nullable despite having defaults — allowed NULL insertion from raw SQL or edge functions. (2) `push_tokens` had a composite unique constraint `(user_id, expo_push_token)` that allowed the same physical device token across multiple users (e.g., after sign-out + sign-in by a different user on the same device), causing duplicate push deliveries.
- **Fix:** New migration `20260306235911_notifications_not_null_and_unique_push_token.sql`: backfills NULLs, adds NOT NULL constraints, dedupes push tokens (keeps most recently updated), drops composite unique, adds global unique on `expo_push_token`. Updated web API `push-tokens/register` route to use `onConflict: "expo_push_token"` (was `"user_id,expo_push_token"`).
- **Ref:** EDGE_CASES_TODOS #70/#71
- **Files:** `supabase/migrations/20260306235911_notifications_not_null_and_unique_push_token.sql`, `apps/web/app/api/push-tokens/register/route.ts`

### #287. Event creation — UTC timezone validation (Mar 6, 2026)

- **Issue:** Mobile event creation validation used local time directly for the 2-hour minimum rule, causing timezone drift from web/server logic that uses UTC.
- **Fix:** Updated `create-event.tsx` to convert event start time to UTC using `ecuadorLocalToUtc(eventForm.starts_at)` before comparing against `Date.now()` (current time).
- **Ref:** P7-3 inline comment
- **Web source:** Server-side validation in event creation API
- **Files:** `apps/mobile/app/(tabs)/create-event.tsx`

### #288. Org dashboard — stats query error handling (Mar 6, 2026)

- **Issue:** `org-dashboard.tsx` ignored errors from `useOrgDashboardStats` query — `hasError` only included org/events query errors, and `handleRefresh` used `Promise.all()` that could silently discard `refetchStats()` failures.
- **Fix:** (1) Include `statsError` in `hasError` boolean. (2) Include `statsRefetching` in `isRefreshing`. (3) Replace `Promise.all([refetch(), refetchStats()])` with explicit `await refetch(); await refetchStats();` in try/catch block, logging contextual errors (userId, orgId, action).
- **Ref:** P7-3 inline comment
- **Files:** `apps/mobile/app/(tabs)/org-dashboard.tsx`

### #289. API client — empty response handling (Mar 6, 2026)

- **Issue:** `api.ts` unconditionally called `response.json()` on all responses, causing valid empty 2xx/204/205 responses (no JSON body) to be treated as errors by higher-level helpers.
- **Fix:** Added conditional JSON parsing: only call `response.json()` when response has JSON content-type, non-zero content-length, and status is not 204/205. Otherwise return `data: undefined` as legitimate empty-success result.
- **Ref:** P7-3 inline comment
- **Files:** `apps/mobile/lib/api.ts` (executeRequest and apiUploadFormData functions)

### #290. Sync current user — primary email validation (Mar 6, 2026)

- **Issue:** `POST /api/auth/sync-current-user` used `clerkUser.emailAddresses[0]` (first email, potentially wrong) instead of `clerkUser.primaryEmailAddress?.emailAddress`, risking data-integrity regressions by overwriting canonical user emails.
- **Fix:** (1) Extract `primaryEmail` from `clerkUser.primaryEmailAddress?.emailAddress`. (2) Fail fast with 400 error if primary email missing. (3) Use `primaryEmail` in userData creation, remove empty-string fallback.
- **Ref:** P7-3 inline comment
- **Web source:** Clerk user object structure
- **Files:** `apps/web/app/api/auth/sync-current-user/route.ts`

### #291. IOS migration docs — sync endpoint mapping (Mar 6, 2026)

- **Issue:** `IOS_MIGRATION.md` Web-to-Mobile Reference Mapping table showed `POST /api/auth/sync-current-user` as "mobile never calls the stub" with reference to outdated EDGE_CASES_TODOS #47.
- **Fix:** Updated table entry to reflect implemented endpoint: "optional explicit sync; primary sync is JIT via `resolveDbUserFromClerkId` on first authenticated API call" and removed #47 reference.
- **Ref:** P7-3 inline comment
- **Files:** `docs/project-migrations/IOS_MIGRATION.md`

### #292. ~~Org dashboard stats — Zod runtime validation~~ (superseded by #294)

- **Superseded by [#294](#294-org-dashboard-stats--query-supabase-directly-instead-of-web-api-mar-6-2026).** #292 added `OrgDataResponseSchema` to validate the `/api/organizer/data` response shape. #294 removed the web API call entirely and replaced it with a direct Supabase query, so `OrgDataResponseSchema` and `OrgDataResponse` are no longer in the file. Zod validation is still present — the current implementation validates raw order rows with `OrderRevenueRowSchema` (fields: `event_id`, `base_price_cents`, `total_amount_cents`, `discount_amount_cents`, `fee_percentage`, `created_at`) before computing the `RevenueMap`.
- **Ref:** P7-3 nitpick comment (original), P7-3 inline comment (superseding fix)
- **Files:** `apps/mobile/hooks/useOrgDashboardStats.ts`

### #293. API client — token acquisition error handling (Mar 6, 2026)

- **Issue:** `apiClient` function called `getToken()` without try/catch, allowing unhandled token acquisition failures to bubble up as raw errors instead of normalized `ApiError` instances.
- **Fix:** Wrapped both `getToken()` calls (initial token and 401 retry) in try/catch blocks, converting failures to `ApiError(401, "<contextual message>", "AUTH_ERROR"/"SESSION_EXPIRED")`.
- **Ref:** P7-3 nitpick comment
- **Files:** `apps/mobile/lib/api.ts`

### #294. Org dashboard stats — query Supabase directly instead of web API (Mar 6, 2026)

- **Issue:** `useOrgDashboardStats` called `GET /api/organizer/data` (the web server), creating a mobile dependency on the web API for a read operation that should use the mobile Supabase client directly. This conflicted with the "Mobile as independent client" architecture rule.
- **Fix:** Replaced web API call with a direct Supabase query on the `orders` table, using the authenticated mobile client (`getAuthenticatedClient`). The existing RLS policy "Organization members can view orders for their events" scopes results to the org. Revenue calculation mirrors `fetchEventPurchases`: `base_price_cents` for Stripe Guaranteed Net orders, `extractBasePriceHistorical` + discount proportion for legacy Datafast orders. Zod validates all rows before processing. Return shape (`RevenueMap`) is unchanged — `org-dashboard.tsx` needs no updates.
- **Ref:** P7-3 inline comment (org-dashboard.tsx line 32-35; MARCH_2026_FIXES.md line 2138-2144)
- **Web source:** `apps/web/app/lib/utils/purchase-data.ts` → `fetchEventPurchases`; `apps/web/app/api/organizer/data/route.ts` → `enrichEventWithStats`
- **Files:** `apps/mobile/hooks/useOrgDashboardStats.ts`

### #295. Migration note — notifications created_at backfill (Mar 6, 2026)

- **Note (deferred):** The migration `20260306235911_notifications_not_null_and_unique_push_token.sql` uses `UPDATE public.notifications SET created_at = now() WHERE created_at IS NULL` to backfill NULL `created_at` values. A P7-3 review comment requested selective backfill from an authoritative historical source instead. However, the migration was already applied and no authoritative historical source (audit table or original event timestamp column) exists in the schema for these rows. Retroactively correcting the already-applied data is not feasible without a source of truth. Accepted as a known limitation: legacy NULL rows now carry the migration timestamp (Mar 6, 2026) as their `created_at`. Logged in `EDGE_CASES_TODOS.md`.
- **Ref:** P7-3 inline comment (supabase migration line 9)
- **Files:** `supabase/migrations/20260306235911_notifications_not_null_and_unique_push_token.sql` (no change — migration already applied); `docs/todos/EDGE_CASES_TODOS.md`

### #296. Org dashboard — revenueMap zero-revenue false-fallback (Mar 6, 2026)

- **Issue:** `mapOrgEventToCardData` used `revenueMap?.get(event.id) ?? computeTierRevenueCents(...)`. When `revenueMap` is loaded but an event has zero matched orders, `get()` returns `undefined` and the nullish coalescing operator incorrectly falls back to `computeTierRevenueCents`, inflating revenue for zero-order events. Same pattern existed in the `stats` reducer.
- **Fix:** Changed both sites to first check `revenueMap !== undefined` (map loaded), then `revenueMap.has(event.id)` to decide between the map value (possibly 0) and the computed fallback. Unloaded map still falls back to `computeTierRevenueCents`; loaded map with missing key returns `0`.
- **Ref:** P7-3 inline comment (org-dashboard.tsx lines 71–77, 196–198)
- **Files:** `apps/mobile/app/(tabs)/org-dashboard.tsx`

### #297. Org dashboard — handleRefresh ignores TanStack Query v5 refetch errors (Mar 6, 2026)

- **Issue:** `handleRefresh` wrapped `await refetch()` and `await refetchStats()` in a `try/catch`. In TanStack Query v5, `refetch()` resolves with a result object containing an `error` field instead of throwing; the `catch` block was never reached for query failures.
- **Fix:** Removed the `try/catch` and replaced both calls with explicit result capture (`const eventsRes = await refetch()`), checking `result.error` and logging contextual errors (action, userId, orgId) for each — matching the pattern already used for `orgRefetch()` above.
- **Ref:** P7-3 duplicate comment (org-dashboard.tsx lines 148–157)
- **Files:** `apps/mobile/app/(tabs)/org-dashboard.tsx`

### #298. useOrgDashboardStats — extract revenue normalization to shared lib helper (Mar 6, 2026)

- **Issue:** The revenue normalization loop in `useOrgDashboardStats` duplicated the same Stripe vs. Legacy extraction + discount-proportion adjustment logic already implemented as `calculateOrganizerBasePrice` in `@project-flame/lib`.
- **Fix:** Replaced the local loop body with a single `calculateOrganizerBasePrice(row)` call imported from `@project-flame/lib`. Removed the now-unused `extractBasePriceHistorical` import. Web and mobile now share the same helper for all revenue normalization.
- **Ref:** P7-3 inline comment (useOrgDashboardStats.ts lines 55–80)
- **Files:** `apps/mobile/hooks/useOrgDashboardStats.ts`

### #299. api.ts — apiUploadFormData getToken() unhandled rejections (Mar 6, 2026)

- **Issue:** Both `getToken()` calls in `apiUploadFormData` (initial token acquisition and 401-retry) could throw without being caught, producing raw unhandled rejections instead of normalized `ApiError` instances — diverging from `apiClient`'s contract.
- **Fix:** Wrapped both `getToken()` calls in try/catch, converting failures to `ApiError(401, ..., "AUTH_ERROR")` on initial acquisition and `ApiError(401, ..., "SESSION_EXPIRED")` on the retry path. `executeUpload` is only called when a valid token exists.
- **Ref:** P7-3 inline comment (api.ts lines 260–275)
- **Files:** `apps/mobile/lib/api.ts`

### #300. api.ts — apiUploadFormData rejects valid 2xx no-content responses (Mar 6, 2026)

- **Issue:** The guard `if (data === null || data === undefined)` in `apiUploadFormData` threw for valid empty 2xx responses (204/205 or no JSON body), where `data` is legitimately `undefined` after conditional JSON parsing.
- **Fix:** Changed to `if (data === null)` — `undefined` is now allowed for successful no-content responses; `null` (JSON parse failure on a response claiming JSON) still throws.
- **Ref:** P7-3 duplicate comment (api.ts lines 287–288)
- **Files:** `apps/mobile/lib/api.ts`

### #301. sync-current-user — console.error logs raw error object (PII risk) (Mar 6, 2026)

- **Issue:** Both `console.error` calls in `sync-current-user/route.ts` passed the raw `error` object, which may contain database row values or user data from Supabase error messages.
- **Fix:** Replaced `error` with `{ errorName: error.name, errorCode: error.code }` in the inner catch and `{ errorName: error instanceof Error ? error.name : "UnknownError", errorCode: error?.code }` in the outer catch. The existing context fields (`action`, `clerkId`) are preserved; the raw error object is not logged.
- **Ref:** P7-3 inline comment (sync-current-user/route.ts lines 47–52)
- **Files:** `apps/web/app/api/auth/sync-current-user/route.ts`

### #302. Docs — #284 changelog superseded note; #285 sync-current-user architecture clarification (Mar 6, 2026)

- **Issue:** (1) The #284 changelog entry described `useOrgDashboardStats` calling `GET /api/organizer/data`, which was replaced in #294 with a direct Supabase query — no superseded note existed. (2) The #285 entry described the sync endpoint without clarifying it is an optional/manual path, not the primary sync.
- **Fix:** (1) Marked #284 as `~~superseded by #294~~` and updated the description to accurately state that `useOrgDashboardStats` now uses the Supabase client directly. (2) Added an "Important note on sync architecture" paragraph to #285 explicitly stating that primary sync is still JIT via `resolveDbUserFromClerkId` and the endpoint is an optional/manual edge-case trigger.
- **Ref:** P7-3 duplicate comment (MARCH_2026_FIXES.md lines 2138–2152)
- **Files:** `docs/fixes/MARCH_2026_FIXES.md`

### #303. org-dashboard — stats failure treated as fatal (Mar 6, 2026)

- **Issue:** `hasError` included `statsError`, so a stats query failure blocked the entire org-dashboard render (showed error state with retry button). The revenue display already had a graceful fallback (`computeTierRevenueCents`) for when `revenueMap` is unavailable, making stats failures non-fatal.
- **Fix:** Removed `statsError` from `hasError`. Added `const statsFailed = Boolean(statsError)` and used it to show a soft inline notice ("Revenue estimates shown — live data unavailable.") below the stats bar when the stats query fails, without blocking event list rendering.
- **Ref:** P7-3 inline comment (org-dashboard.tsx lines 123–124)
- **Files:** `apps/mobile/app/(tabs)/org-dashboard.tsx`

### #304. sync-current-user — outer catch missing clerkId context (Mar 6, 2026)

- **Issue:** The outer `catch` block logged `action`, `errorName`, and `errorCode` but not `clerkId`. Because `userId` was declared inside the `try` block via `const { userId } = await auth()`, it was out of scope in the outer catch — making it impossible to identify which user triggered an unexpected exception.
- **Fix:** Hoisted `let userId: string | null = null` before the `try` block. Inside the try, assigned via `const authResult = await auth(); userId = authResult.userId`. The outer catch now includes `clerkId: userId` in its log payload (will be `null` only if `auth()` itself threw before `userId` was set).
- **Ref:** P7-3 inline comment (sync-current-user/route.ts lines 64–69)
- **Files:** `apps/web/app/api/auth/sync-current-user/route.ts`

### #305. Org dashboard — statsFailed banner shown when revenueMap is already present (Mar 6, 2026)

- **Issue:** `statsFailed = Boolean(statsError)` was true whenever `statsError` was set, even if a prior successful fetch had already populated `revenueMap` (TanStack Query can hold stale data alongside a new error). This showed the "Revenue estimates shown" banner even though real revenue data was already being displayed.
- **Fix:** Changed to `statsFailed = Boolean(statsError && !revenueMap)` — the banner only appears when stats failed AND `revenueMap` is absent, i.e., when the fallback `computeTierRevenueCents` is actually in use.
- **Ref:** P7-3 inline comment (org-dashboard.tsx lines 125–126)
- **Files:** `apps/mobile/app/(tabs)/org-dashboard.tsx`

### #306. MARCH_2026_FIXES.md — #295 out of sequence and wrong filename case (Mar 6, 2026)

- **Issue:** The `#295` entry appeared after entries #296–#304 (appended at the end of the file during a prior session). Also referenced `EDGE_CASES_TODOS.MD` (uppercase) instead of the canonical `EDGE_CASES_TODOS.md`.
- **Fix:** Moved `#295` to its correct numerical position (immediately before `#296`). Corrected filename reference to `EDGE_CASES_TODOS.md`. Removed the duplicate trailing block.
- **Ref:** P7-3 inline comment (MARCH_2026_FIXES.md lines 2327–2329)
- **Files:** `docs/fixes/MARCH_2026_FIXES.md`

### #307. Org dashboard — stats-loading guard and distinct loading banner (Mar 6, 2026)

- **Issue:** When `revenueMap` was undefined and the stats query was still loading, the UI treated `computeTierRevenueCents`-derived numbers as live revenue. No loading state was shown, so users could not distinguish "loading live data" from "estimates (fallback)".
- **Fix:** (1) Added `isLoading: statsLoading` from `useOrgDashboardStats`. (2) Updated `statsFailed` to `statsError && !revenueMap && !statsLoading` so the estimate banner only appears on true failures, not while loading. (3) Added `statsLoadingBanner = !revenueMap && statsLoading` and render a distinct "Loading live revenue..." banner when stats are loading and live data is not yet available. Shared lib functions (`computeTierRevenueCents`, `formatCentsAsPrice`) remain unchanged.
- **Ref:** P7-3 inline comment (org-dashboard.tsx lines 123–126)
- **Files:** `apps/mobile/app/(tabs)/org-dashboard.tsx`

### #308. useSignInHandlers: getToken in deps, proper sync-current-user error logging (Mar 6, 2026)

- **Issue:** `apiPost("/api/auth/sync-current-user", {}, getToken)` in `onGoogleAuth`, `onEmailSignIn`, and `onEmailSignUp` had (1) `getToken` missing from useCallback dependency arrays, so handlers could capture stale token getters; (2) `.catch(() => {})` silently swallowing promise rejections.
- **Fix:** Added `getToken` to all three useCallback dependency arrays. Replaced empty `.catch(() => {})` with `.catch((err) => { console.error("[auth] sync-current-user failed after ...", err); })` so failures are visible in logs.
- **Files:** `apps/mobile/hooks/useSignInHandlers.ts`

### #309. holds/create: log resolveDbUserFromClerkId errors (Mar 6, 2026)

- **Issue:** The catch block around `resolveDbUserFromClerkId(userId)` swallowed errors without logging; 404 responses had no traceability.
- **Fix:** Changed `catch` to `catch (err)` and added `console.error("[HOLD_CREATE] resolveDbUserFromClerkId failed:", { userId, err });` before returning 404.
- **Files:** `apps/web/app/api/holds/create/route.ts`

### #310. RSVP approve route: typed currency access (Mar 6, 2026)

- **Issue:** `currency: ((rsvp.events as Record<string, unknown>).currency as string || "USD").toLowerCase()` used unsafe casts.
- **Fix:** Replaced with `(rsvp.events?.currency ?? "USD").toLowerCase()`. Updated `RsvpWithRelations` and `RsvpRecord` interfaces so `events.currency` is typed as `string | undefined`.
- **Files:** `apps/web/app/api/organizer/rsvps/[id]/approve/route.ts`

### #311. EventCard: use formatCentsAsPrice from shared lib (Mar 6, 2026)

- **Issue:** Local `fmt` helper duplicated currency formatting logic; zero-decimal currencies not handled correctly.
- **Fix:** Removed `const fmt = ...` and imported `formatCentsAsPrice` from `@project-flame/lib`. Use `formatCentsAsPrice(lowestPrice, currency)` and `formatCentsAsPrice(highestPrice, currency)` for both single-price and range outputs.
- **Files:** `apps/web/app/components/EventCard.tsx`

### #312. EventSchema: add currency and timezone optional fields (Mar 6, 2026)

- **Issue:** `EventSchema` was out of sync with `Event` interface; `currency` and `timezone` were missing from the Zod schema.
- **Fix:** Added `currency: z.string().optional()` and `timezone: z.string().optional()` to `EventSchema` so parsing/validation matches the Event type.
- **Files:** `packages/lib/src/types/event.ts`

### #313. PR review: EventDetail, DateTimePickerField, create-payment-intent (Mar 6, 2026)

- **EventDetail.tsx:** Removed duplicate `currency` and `tz` declarations (lines 190–192) that caused Vercel build failure ("the name `currency` is defined multiple times"). Fixed `EventDetailEvent` Pick to exclude `max_attendees` and `total_rsvps` (not on shared `Event` type); added them as optional fields. Moved validation to `isConfigError` flag with conditional render so all hooks run before any early return (Rules of Hooks compliance).
- **DateTimePickerField.tsx:** Wrapped `localStringToDate`, `dateToLocalString`, and `formatDisplay` timezone conversions in try/catch. On invalid timezone, retry with `DEFAULT_TZ` fallback and log via `console.warn` with `{ action, timezone, error }` context. Safe fallbacks: `new Date()` for dates, Ecuador-formatted string for strings.
- **create-payment-intent/route.ts:** For holds and RSVP payments, require persisted reservation currency only — no fallback to `ticket_tiers.currency` or `events.currency`. If `hold.currency` (holds) or `tier.currency` (RSVP) is missing, return 400 with explicit error message instead of attempting `requireEventCurrency` on live data.
- **Nitpick deferred:** DEFAULT_TZ import from lib logged to `docs/todos/NITPICKS_TODOS.md`.
- **Files:** `apps/web/app/components/EventDetail.tsx`, `apps/mobile/components/create-event/DateTimePickerField.tsx`, `apps/web/app/api/purchase/create-payment-intent/route.ts`, `docs/todos/NITPICKS_TODOS.md`

---

#### Web Parity Gate — P7-3 Review Batch (#294, #296–#304)

**Applies to:** fixes #294, #296, #297, #298, #299, #300, #301, #302, #303, #304 (P7-3 PR review session).

##### 1. Web Source References

| Mobile file changed                                | Web source-of-truth                                                                                                                                                     |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/mobile/app/(tabs)/org-dashboard.tsx`         | `apps/web/app/api/organizer/data/route.ts` → `enrichEventWithStats`; `apps/web/app/lib/utils/purchase-data.ts` → `fetchEventPurchases`                                  |
| `apps/mobile/hooks/useOrgDashboardStats.ts`        | `apps/web/app/lib/utils/purchase-data.ts` → `fetchEventPurchases` (Stripe Guaranteed Net + Legacy Datafast extraction logic)                                            |
| `apps/mobile/lib/api.ts`                           | N/A — no direct web equivalent; web uses fetch/server components; mobile `apiClient`/`apiUploadFormData` call web API routes with Clerk token refresh (mobile-specific) |
| `apps/web/app/api/auth/sync-current-user/route.ts` | `apps/web/app/lib/auth.ts` → `resolveDbUserFromClerkId` (JIT sync pattern; sync endpoint is an explicit/manual variant)                                                 |

##### 2. API Parity Evidence

- **`useOrgDashboardStats` (#298, #294):** Replaced `GET /api/organizer/data` with a direct authenticated Supabase query (`orders` table). The RLS policy "Organization members can view orders for their events" scopes to the org — equivalent to the server-side `supabaseAdmin` filter in `enrichEventWithStats`. Query fields (`event_id`, `base_price_cents`, `total_amount_cents`, `discount_amount_cents`, `fee_percentage`, `created_at`) and filters (`.in("status", ["completed", "paid"])`, `.neq("payment_provider", "bank_transfer")`) match the web route's `fetchEventPurchases` query exactly.
- **`apiUploadFormData` (#299):** Token refresh on 401 now matches `apiClient`: initial `getToken()` failure → `ApiError(401, ..., "AUTH_ERROR")`; retry failure → `ApiError(401, ..., "SESSION_EXPIRED")`; same `executeUpload` helper used for both first attempt and retry.
- **`sync-current-user` (#301, #304):** Endpoint is `POST /api/auth/sync-current-user`. Method confirmed. Request body: none (uses Clerk session from `auth()`). Response: `{ success: true, user: { id, clerk_id, email, first_name, last_name } }`. No mobile client changes to the call site.

##### 3. Calculation Parity Evidence

- **Revenue normalization (#298):** The inline `extractBasePriceHistorical` + discount-proportion loop in `useOrgDashboardStats` was replaced with `calculateOrganizerBasePrice(row)` from `@project-flame/lib/src/pricing/calculations.ts`. `calculateOrganizerBasePrice` is the canonical shared function and is already used by the web (`apps/web/`) for the same calculation. No local reimplementation remains.
- **Fallback revenue (#296, #303):** `computeTierRevenueCents` (list price × quantity) is used only when `revenueMap` is undefined (stats query not yet resolved or failed). This matches the "graceful degradation" intent — actual order data from `calculateOrganizerBasePrice` supersedes the estimate once the query resolves.
- **Zero-revenue events (#296):** Events with completed orders totalling $0 (fully discounted) now correctly show `0` instead of falling through to `computeTierRevenueCents`. The `revenueMap.has(event.id)` guard preserves the 0 value from the map.

##### 4. Edge-Case Verification

| Scenario                                               | Expected behaviour                                                                                           | Verified                    |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | --------------------------- |
| Stats query fails (network error, RLS miss)            | `statsFailed = true`; event list renders; revenue falls back to `computeTierRevenueCents`; soft notice shown | ✓ code path confirmed       |
| Stats query returns event with 0 revenue               | `revenueMap.has(id) = true`, `revenueMap.get(id) = 0`; `revenueCents = 0` (not computed fallback)            | ✓ code path confirmed       |
| Stats query returns no rows (org has no orders)        | `revenueMap` is an empty `Map`; all events fall through `has()` check → `revenueCents = 0`                   | ✓ code path confirmed       |
| `getToken()` throws in `apiUploadFormData` (initial)   | `ApiError(401, "Failed to get authentication token...", "AUTH_ERROR")`                                       | ✓ wrapped in try/catch      |
| `getToken()` throws in `apiUploadFormData` (401 retry) | `ApiError(401, "Failed to refresh authentication token...", "SESSION_EXPIRED")`                              | ✓ wrapped in try/catch      |
| Upload returns 204 (no JSON body)                      | `data = undefined`; guard `if (data === null)` does not throw; returns `undefined as T`                      | ✓ code path confirmed       |
| `auth()` throws in `sync-current-user`                 | outer catch logs `{ action, clerkId: null, errorName, errorCode }`                                           | ✓ userId hoisted before try |
| Supabase upsert throws (after auth resolves)           | outer catch logs `{ action, clerkId: <userId>, errorName, errorCode }`                                       | ✓ userId set before upsert  |

##### 5. Cross-Platform Behaviour Check

- **Org dashboard revenue:** Web computes revenue from actual order `base_price_cents` via `fetchEventPurchases` + `calculateOrganizerBasePrice`. Mobile now uses the same `calculateOrganizerBasePrice` helper on the same set of order rows (same filters, same fields). Identical cents amounts expected for any given org's orders.
- **API token refresh:** Mobile `apiClient` and `apiUploadFormData` both now share the same 401-retry pattern and the same `ApiError` shape on token failures. No divergence between JSON and FormData upload paths.
- **User sync:** Web primary sync is JIT via `resolveDbUserFromClerkId` on every authenticated request. Mobile auth flow calls `POST /api/auth/sync-current-user` as an explicit edge-case trigger only. Both paths converge on the same `users` row via `onConflict: "clerk_id"` upsert.

---

### 305. Currency: replaced pill buttons with unified ActionSheet dropdown in Create Event (Mar 6, 2026)

**Files:** `apps/mobile/components/create-event/EventDetailsTab.tsx`

**Problem:** Currency was displayed as a row of pill-button toggles (one per currency), which differed visually and interaction-wise from the Timezone field. The user requested both to use the same "dropdown list" pattern.

**Fix:** Replaced the multi-pill currency selector with a single-value `Pressable` row showing the active currency code and a chevron. On press, `ActionSheetIOS.showActionSheetWithOptions` opens a native iOS action sheet listing all `SUPPORTED_CURRENCIES` (`USD — US Dollar`, `EUR — Euro`, etc.). An `Alert.alert` fallback handled Android. **Superseded by #313:** Android now uses `SelectionListModal` (scrollable bottom-sheet) instead of `Alert.alert`; iOS continues to use `ActionSheetIOS`.

### 306. Timezone: migrated from tap-to-cycle to ActionSheet dropdown in Create Event (Mar 6, 2026)

**Files:** `apps/mobile/components/create-event/EventDetailsTab.tsx`

**Problem:** Timezone was a single-value pressable that cycled through all 16 timezones one-by-one per tap — confusing and unusable UX with a large list.

**Fix:** Replaced tap-to-cycle with the same `ActionSheetIOS` pattern as currency (#305). Both Currency and Timezone now show an identical single-value pill with a chevron. Tapping opens a native action sheet with all options on iOS. **Superseded by #313:** Android now uses `SelectionListModal` instead of `Alert.alert`; `SUPPORTED_TIMEZONES` and `SUPPORTED_CURRENCIES` selection are both handled by the shared modal on Android.

### 307. Currency: added read-only display field in Event Management edit view (Mar 6, 2026)

**Files:** `apps/mobile/components/events-management/EditEventDetailsTab.tsx`

**Problem:** The Edit Event screen (Events Management tab) showed no currency field, even though currency is set at creation and is visible in the web's event detail.

**Fix:** Added a read-only `FilledInput` row for Currency (with `cash-outline` icon) that displays `event.currency`. Currency is not editable post-creation (the web `PATCH /api/events` endpoint does not accept a `currency` change), so it renders in the same disabled style as other read-only fields.

### 308. Org Dashboard: wired multi-org selector below OrgStatsSection (Mar 6, 2026)

**Files:** `apps/mobile/app/(tabs)/org-dashboard.tsx`, `apps/mobile/hooks/useOrgEvents.ts`, `apps/mobile/hooks/useOrgDashboardStats.ts`

**Problem:** The `OrgSelector` component (circle avatars + org name + white border on selection) already existed in `apps/mobile/components/scanner/OrgSelector.tsx` and was used in the scanner screen, but was never wired into the Org Dashboard. Users belonging to multiple organizations had no way to switch which org's events and stats were shown on the dashboard.

**Fix:**

- `useOrgEvents(orgId?: string | null)` — added optional `orgId` param. When provided it overrides `useOrgData`'s first-org default; `queryKey` and `.eq("organization_id", …)` both use `effectiveOrgId`. Fully backward-compatible (all existing callers pass no argument).
- `useOrgDashboardStats(orgId?: string | null)` — same optional override pattern.
- `org-dashboard.tsx` — added `selectedOrgId` state (defaults to `null` = first org). Added `useUserOrgs()` call. Computed `effectiveOrgId = selectedOrgId ?? orgData?.organizationId`. Passed `selectedOrgId` to both `useOrgEvents` and `useOrgDashboardStats`. Rendered `<OrgSelector>` (imported from scanner) directly below `<OrgStatsSection>` when `userOrgs.length > 1`. Updated `handleRefresh` dep array to include `effectiveOrgId`.

**Behaviour:** For single-org users the selector is hidden (`OrgSelector` returns `null` when `orgs.length <= 1`). For multi-org users, org circles appear directly below `OrgStatsSection` (which contains the stats cards and QR scanner button) with a white border on the active selection; switching orgs re-fetches events and revenue for the selected org.

### 309. Discover page: removed "Explore all" button and See All navigation (Mar 7, 2026)

**Files:** `apps/mobile/components/home/EventsSection.tsx`, `apps/mobile/components/home/FeaturedEvents.tsx`, `apps/mobile/components/home/UpcomingEvents.tsx`, `apps/mobile/components/home/ExploreOrganizers.tsx`

**Problem:** The discover page (search tab) showed "Explore all →" on Featured Events and Upcoming Events sections, and "See All" on Explore Organizers — both navigated to `/events`. These were no longer needed.

**Fix:** (1) Added `showExploreAll?: boolean` to `EventsSection` (default `true`). `FeaturedEvents` and `UpcomingEvents` pass `showExploreAll={false}` to hide the button on discover. (2) Removed the "See All" footer from `ExploreOrganizers` that navigated to `/events`. Removed unused `hasMore` variable.

### 310. Event detail: floating CTA pill + scroll-to-section (Mar 7, 2026)

**Files:** `apps/mobile/app/event/[id].tsx`

**Problem:** Events with long descriptions required users to scroll far to reach ticket selection and the checkout button. After selecting a tier, the "Continue to Checkout" button appeared but users had to scroll further to tap it.

**Fix:** (1) Added a floating white pill button ("Buy Tickets" or "Request RSVP" based on `requires_rsvp`) positioned using safe-area only (`bottom: insets.bottom + 12` — no tab bar offset; event detail is a stack screen). Pill scrolls to the ticket section on press. (2) Pill hides when user scrolls past a dynamic threshold (`ticketSectionY * 0.15` when measured, else `screenH * 0.12`). (3) When a ticket tier is selected, auto-scrolls to the checkout CTA so it is visible. Uses `onLayout` to capture ticket section Y; `scrollRef.scrollTo` / `scrollToEnd` for scroll targets; `scrollEventThrottle={16}` for smooth hide-on-scroll. **Refined by #322:** Stack screen now uses safe-area-only positioning (tab bar imports removed).

### 311. Dead code removal: MenuOverlay, CalendarPicker, TimeSelector (Mar 7, 2026)

**Files deleted:** `apps/mobile/components/menu/MenuOverlay.tsx`, `apps/mobile/components/events-management/CalendarPicker.tsx`, `apps/mobile/components/events-management/TimeSelector.tsx`

**Problem:** These components were not imported anywhere. MenuOverlay was removed from the root layout (replaced by bottom tab navigation). CalendarPicker and TimeSelector were superseded by `DateTimePickerField` in `EditEventDetailsTab`.

**Fix:** Deleted all three files.

### 312. Org Dashboard: OrgSelector render guard waits for orgData (Mar 7, 2026)

**Files:** `apps/mobile/app/(tabs)/org-dashboard.tsx`

**Problem:** OrgSelector could render with no org highlighted because `effectiveOrgId` is null when `useUserOrgs` resolves before `useOrgData`. The selector appeared before org data was ready.

**Fix:** Added `!orgLoading` to the render guard. OrgSelector now renders only when `userOrgs && userOrgs.length > 1 && !orgLoading`, ensuring orgData has finished loading and `effectiveOrgId` is set before the selector appears.

### 313. EventDetailsTab: Android currency/timezone pickers use scrollable modal (Mar 7, 2026)

**Files:** `apps/mobile/components/create-event/EventDetailsTab.tsx`, `packages/ui/src/components/SelectionListModal.tsx` (new)

**Problem:** Android branches in `showCurrencyPicker` and `showTimezonePicker` used `Alert.alert` with one button per option, exceeding Alert.alert's three-button limit on Android (6 currencies, 16 timezones).

**Fix:** Created `SelectionListModal` in `packages/ui` — a scrollable bottom-sheet modal with FlatList and optional `className` prop. Android branches now open this modal instead of Alert.alert. iOS continues to use `ActionSheetIOS`. Modal supports cancel via backdrop tap, close button, or Cancel button. Calls `onFieldChange("currency", code)` or `onFieldChange("timezone", value)` when an item is picked.

### 314. Changelog: removed duplicate 309–311 block (Mar 7, 2026)

**Files:** `docs/fixes/MARCH_2026_FIXES.md`

**Problem:** Duplicate changelog block (309, 310, 311) appeared twice, causing MD024 duplicate-heading warning.

**Fix:** Removed the second occurrence; kept only the canonical copy.

### 315. Event detail: floating pill pointerEvents during fade-out (Mar 7, 2026)

**Files:** `apps/mobile/app/event/[id].tsx`

**Problem:** `pointerEvents` read `pillVisible.current` at render time, but the ref was mutated in `fadePillOut()` without triggering a re-render. During the 250ms fade-out, the pill stayed `"auto"` and could intercept touches when nearly invisible.

**Fix:** Added `pillAcceptingTouches` state; set to `false` at the start of `fadePillOut()`. `pointerEvents={pillAcceptingTouches ? "auto" : "none"}` now updates immediately when fading begins.

### 316. Event detail: auto-scroll only on tier change, not quantity (Mar 7, 2026)

**Files:** `apps/mobile/app/event/[id].tsx`

**Problem:** The scroll-to-checkout effect watched `quantity`; +/- taps retriggered `scrollToCheckout()` unnecessarily.

**Fix:** Added `prevSelectedTierIdRef`; effect now compares `prevSelectedTierIdRef.current !== selectedTierId` and only calls `scrollToCheckout()` when the tier actually changes (and `selectedTier && quantity > 0`).

### 317. Event detail: floating CTA uses NativeWind and FlameText (Mar 7, 2026)

**Files:** `apps/mobile/app/event/[id].tsx`

**Problem:** CTA used inline `style` and raw `Text` with `fontFamily: "Poppins_600SemiBold"`.

**Fix:** Replaced with `className` utilities (`bg-white-100 rounded-full items-center justify-center`) and `FlameText` with `font-poppins-semibold`. Kept `style` only for dynamic height/shadow (TAB_BAR_PILL_HEIGHT).

### 318. EventDetailsTab: timezone pill uses computed tz (Mar 7, 2026)

**Files:** `apps/mobile/components/create-event/EventDetailsTab.tsx`

**Problem:** Timezone pill displayed `form.timezone` while validation used `tz` (DEFAULT_TIMEZONE fallback); label could mismatch the actual value used.

**Fix:** Changed lookup to `SUPPORTED_TIMEZONES.find((t) => t.value === tz)?.label ?? tz` so the displayed label matches the computed `tz` used for validation.

### 319. SelectionListModal: promoted to packages/ui (Mar 7, 2026)

**Files:** `packages/ui/src/components/SelectionListModal.tsx`, `packages/ui/src/index.tsx`, `apps/mobile/components/create-event/EventDetailsTab.tsx`

**Problem:** SelectionListModal lived in `apps/mobile/components/shared/`; shared UI should be in the design system package.

**Fix:** Moved component to `packages/ui`, added optional `className` prop, re-exported from index. EventDetailsTab now imports from `@project-flame/ui`. Deleted `apps/mobile/components/shared/SelectionListModal.tsx`.

### 320. rsvp-detail: contextual error logging before error UI (Mar 7, 2026)

**Files:** `apps/mobile/app/rsvp-detail.tsx`

**Problem:** Error branch returned UI without logging; failures were not recorded for monitoring.

**Fix:** Added `console.error` with `{ eventId, action: "load_rsvps", userId, error }` before the return. Uses `useOptionalAuth()` for `userId` when available.

### 321. Event detail: promoter normalization for empty/whitespace (Mar 7, 2026)

**Files:** `apps/mobile/app/event/[id].tsx`

**Problem:** `initialPromoterCode` could be `""` when `promoter` was a string of whitespace; downstream consumers would see an empty string instead of "no promoter".

**Fix:** Changed to `typeof promoter === "string" && promoter.trim() ? promoter.trim() : undefined` so empty or whitespace-only strings yield `undefined`.

### 322. Event detail: stack screen uses safe-area only, no tab bar offset (Mar 7, 2026)

**Files:** `apps/mobile/app/event/[id].tsx`

**Problem:** Event detail (`event/[id]`) is a stack screen, not a tab screen, but used `getTabBarPaddingBottom`, `TAB_BAR_PILL_HEIGHT`, and `TAB_BAR_PILL_MARGIN`, creating extra bottom space.

**Fix:** Removed CustomTabBar imports. Added `FLOATING_PILL_HEIGHT = 56`. ScrollView `paddingBottom` now uses `insets.bottom + FLOATING_PILL_HEIGHT + 24`. Floating CTA `bottom` uses `insets.bottom + 12` (safe-area only).

### 323. rsvp-detail: pass currency to RsvpRequestCard (Mar 7, 2026)

**Files:** `apps/mobile/app/rsvp-detail.tsx`, `apps/mobile/hooks/useRsvpManagement.ts`

**Problem:** RsvpRequestCard formats `request.price` via `formatCentsAsPrice` but was not passed a `currency` prop.

**Fix:** Added `currency` to the events select in `useEventRsvps`, to `UseEventRsvpsResult`, and to the return. Passed `currency={data?.currency}` to each `RsvpRequestCard`.

### 324. Changelog: fixed stale MenuOverlay #168 reference (Mar 7, 2026)

**Files:** `docs/fixes/MARCH_2026_FIXES.md`

**Problem:** Entry 311 stated "MenuOverlay was removed from the root layout in Fix #168" but #168 is Sign-in back navigation, not MenuOverlay removal.

**Fix:** Removed the incorrect "(Fix #168)" reference; the note now simply states "replaced by bottom tab navigation".

---

#### Web Parity Gate — P7-3 Batch #305–#323

**Applies to:** fixes #305, #306, #307, #308, #309, #310, #311, #312, #313, #314, #315, #316, #317, #318, #319, #320, #321, #322, #323.

##### 1. Web Source References

| Mobile file / symbol changed                                                     | Web source-of-truth                                                                                                  | Parity                                                                                                     |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `EventDetailsTab`, `SelectionListModal` (#305, #306, #313, #318, #319)           | `apps/web/app/components/forms/CreateEventForm.tsx` — currency/timezone are form fields; web uses native HTML select | N/A — mobile-only UI; iOS ActionSheet vs Android SelectionListModal (no web equivalent for native pickers) |
| `EditEventDetailsTab` (#307)                                                     | `apps/web/app/components/organizer/` event edit flows — currency read-only post-creation                             | N/A — mobile-only; web `PATCH /api/events` does not accept currency change (same constraint)               |
| `useOrgEvents`, `useOrgDashboardStats`, `org-dashboard` (#308, #312)             | `apps/web/app/api/organizer/data/route.ts`, `apps/web/app/lib/utils/purchase-data.ts`                                | Parity — same Supabase query shape, RLS, `calculateOrganizerBasePrice` from lib                            |
| `EventsSection`, `FeaturedEvents`, `UpcomingEvents`, `ExploreOrganizers` (#309)  | Web discover/events listing — no "Explore all" on mobile discover tab                                                | N/A — mobile-only layout; web has different navigation                                                     |
| `event/[id].tsx` CTA, floating pill, scroll (#310, #315, #316, #317, #321, #322) | `apps/web/app/components/EventDetail.tsx` — web uses inline CTA, no floating pill                                    | N/A — mobile-only UX; stack screen uses safe-area only (no tab bar)                                        |
| Dead code (#311, #314)                                                           | —                                                                                                                    | N/A — changelog/dead-code only                                                                             |
| `rsvp-detail`, `RsvpRequestCard`, `useRsvpManagement` (#320, #323)               | `apps/web/app/components/RsvpManagement.tsx`, `RsvpsView` — `formatCentsAsPrice` with currency                       | Parity — #323 passes `currency` from `useEventRsvps`; `formatCentsAsPrice` from `@project-flame/lib`       |

##### 2. API Parity Evidence

- **#308 (useOrgEvents, useOrgDashboardStats):** Direct Supabase queries; same filters and fields as web `fetchEventPurchases`. No new API endpoints.
- **#323 (RsvpRequestCard currency):** `useEventRsvps` adds `currency` to events select; passes to `RsvpRequestCard`. Web `RsvpsView` uses event currency for `formatCentsAsPrice` — same pattern.
- **#305–#307, #309–#322:** No API changes; UI-only or mobile-specific.

##### 3. Calculation Parity Evidence

- **#323:** `formatCentsAsPrice` imported from `@project-flame/lib`; `currency` prop ensures correct locale/format. Matches web `RsvpRequestCard` / `RsvpsView` usage.
- **#308:** Revenue uses `calculateOrganizerBasePrice` from `@project-flame/lib` (same as web).
- **#305–#322:** No calculation logic; UI/styling/scroll behaviour only.

##### 4. Edge-Case Verification

| Scenario                           | Expected behaviour                                                                    | Verified                 |
| ---------------------------------- | ------------------------------------------------------------------------------------- | ------------------------ |
| Currency/timezone picker (iOS)     | ActionSheetIOS; selection updates form                                                | ✓ #305, #306, #313       |
| Currency/timezone picker (Android) | SelectionListModal; no Alert.alert limit                                              | ✓ #313                   |
| Multi-org dashboard                | OrgSelector visible when `userOrgs.length > 1`; `!orgLoading` guard                   | ✓ #308, #312             |
| Event detail floating pill         | Safe-area only; hide on scroll (dynamic threshold); scroll-to-checkout on tier change | ✓ #310, #315, #316, #322 |
| RsvpRequestCard price display      | `formatCentsAsPrice(price, currency)` with event currency                             | ✓ #323                   |

##### 5. Cross-Platform Behaviour Check

- **iOS vs Android pickers (#305, #306, #313):** iOS uses `ActionSheetIOS`; Android uses `SelectionListModal`. Both update the same form state; selection behaviour equivalent.
- **Event detail CTA (#310, #322):** Stack screen; no tab bar. Floating pill uses `insets.bottom + 12`; ScrollView padding uses `insets.bottom + FLOATING_PILL_HEIGHT + 24`.
- **RsvpRequestCard (#323):** Currency passed from event; `formatCentsAsPrice` from lib — matches web behaviour.

---

### #324. Migration: add `currency` column to `holds` table (Mar 7, 2026)

**Root cause:** The `create-payment-intent` API (added during multi-currency feature) requires `hold.currency` to be a snapshot of the event's currency at hold creation time. The `holds` table was missing this column — the `add_event_currency` migration only added it to `events` and `ticket_tiers`.

**Fix:**

- Migration `20260307152505_add_currency_to_holds.sql`:
  - Added `currency CHAR(3) NOT NULL DEFAULT 'usd'` to `holds`.
  - Backfilled existing hold rows from `events.currency`.
  - Updated `atomic_create_hold_with_stage_validation` to snapshot the event's currency into the hold at creation time.

### #325. Event detail floating pill: hide CustomTabBar on stack screens (Mar 7, 2026) — **Superseded by #328**

**Root cause:** `CustomTabBar` is rendered as a **sibling after `<Stack>`** in `RoleResolutionGate`. In React Native, later siblings in the same parent `View` always render on top — the pill's `position: absolute` + `zIndex` inside the stack screen can't beat a component in the parent stacking context.

**Fix:** Added `TAB_VISIBLE_ROUTES` whitelist to `CustomTabBar`. The component now returns `null` when `usePathname()` is not in the list of known tab routes (home, dashboard, org-dashboard, create-event, rsvp-management, settings, discover, events-management, history). All detail/stack screens (`event/[id]`, `ticket/[id]`, `org-event-detail`, etc.) automatically hide the tab bar, making the full bottom area available for screen-level CTAs.

Also added `zIndex: 10, elevation: 10` to the pill `Animated.View` as a belt-and-suspenders guard.

**Superseded by #328:** Fix #328 reversed this approach — the tab bar is now always visible on all screens (except full-screen modals). Floating CTAs are positioned above the tab bar instead of hiding it. See #328 for current behavior.

### #326. Web `next.config.ts`: explicit `Content-Type` for AASA file (Mar 7, 2026)

**Root cause:** Some CDN/proxy configurations serve the `apple-app-site-association` file as `application/octet-stream`. Apple's validation CDN may silently reject non-JSON content types, causing Universal Links to fall back to Safari.

**Fix:** Added `headers()` in `apps/web/next.config.ts` to serve `/.well-known/apple-app-site-association` with `Content-Type: application/json`.

**Remaining blocker (requires manual action):** `apps/web/public/.well-known/apple-app-site-association` still has `REPLACE_WITH_TEAM_ID` as a placeholder. The Apple Developer Team ID must be filled in before Universal Links work on real devices. **Action:** Replace `REPLACE_WITH_TEAM_ID` in `apps/web/public/.well-known/apple-app-site-association` with your 10-character Apple Developer Team ID (from [Apple Developer Membership](https://developer.apple.com/account)). See `docs/project-migrations/IOS_MIGRATION.md` Section 8 (Universal Links) for full steps. **Verification:** After deploy, run `curl -i https://flme.co/.well-known/apple-app-site-association` and confirm the body contains `<TEAM_ID>.com.projectflame.app`.

---

### #327. Fix white-on-white text on "Buy Tickets" pill and BecomeOrganizerSheet buttons (Mar 7, 2026)

**Root cause:** `FlameText` has a hardcoded default `text-white-100` class in its base className. When `text-dark` is passed via the `className` prop, NativeWind's class merging does not reliably override the base default, resulting in white (`#F9FBFE`) text on white (`bg-white-100`) buttons — effectively invisible.

Three instances affected:

1. Floating "Buy Tickets" pill in `app/event/[id].tsx`
2. "Got it" button in `BecomeOrganizerSheet.tsx` (success state)
3. "Apply to Host" button in `BecomeOrganizerSheet.tsx` (form state)

**Fix:** Replaced `FlameText` with raw `<Text>` + `style={{ color: colors.dark }}` for all three button labels. Inline `style` always takes precedence over NativeWind classes in React Native. This matches the established pattern used by all other buttons in the codebase (scanner, dashboard, settings, ticket cards, create-event, etc.), which already use raw `Text` with `text-dark`.

**Design system rule updated:** Added "Dark text on light buttons (FlameText gotcha)" to `flame-design-system.mdc` Component Conventions to prevent recurrence.

**Files changed:**

- `apps/mobile/app/event/[id].tsx` — floating pill FlameText → Text + style
- `apps/mobile/components/navigation/BecomeOrganizerSheet.tsx` — both buttons FlameText → Text + style; added `Text` to RN imports

---

### #328. Reverse #325: tab bar always visible on all screens (Mar 7, 2026)

_Root cause:_ Fix #325 added `TAB_VISIBLE_ROUTES` to `CustomTabBar` to hide the tab bar on detail/stack screens, reasoning that it occluded the floating "Buy Tickets" pill. This is not standard UX — Ticketmaster, Eventbrite, Airbnb, and all major tab-based apps keep the tab bar visible on all screens. The correct fix is to position floating CTAs _above_ the tab bar, not to hide the tab bar.

_Fix:_

- _`CustomTabBar.tsx`_ — Removed `TAB_VISIBLE_ROUTES` set and the `if (!TAB_VISIBLE_ROUTES.has(pathname)) return null` early return. The tab bar now renders on every route. Full-screen modals (sign-in, scanner) already natively cover it via `react-native-screens` `presentation: "fullScreenModal"`. Detail screens (event/[id], ticket/[id], etc.) live outside `(tabs)/` and push over the tabs via Stack navigation; the tab bar remains visible underneath, with no tab icon highlighted (all inactive), which is standard behavior.
- _`app/event/[id].tsx`_ — Repositioned the floating "Buy Tickets" pill to sit above the tab bar: `bottom: insets.bottom + TAB_BAR_PILL_MARGIN + TAB_BAR_PILL_HEIGHT + 12`. Updated scroll content `paddingBottom` to `getTabBarPaddingBottom(insets.bottom) + FLOATING_PILL_HEIGHT` so content clears both the tab bar and the pill.
- _Design system rule updated:_ `flame-design-system.mdc` Navigation Architecture section updated — tab bar visibility, padding requirement for all screens (not just tab screens), detail screen behavior.

_Files changed:_

- `apps/mobile/components/navigation/CustomTabBar.tsx` — removed route filter
- `apps/mobile/app/event/[id].tsx` — imports `getTabBarPaddingBottom`, `TAB_BAR_PILL_HEIGHT`, `TAB_BAR_PILL_MARGIN`; updated pill position and scroll padding
- `.cursor/rules/flame-design-system.mdc` — updated tab bar documentation

---

### #329. BecomeOrganizerSheet: megaphone glow changed from red to white (Mar 7, 2026)

**Root cause:** The megaphone hero icon in the "Host Your Own Events" sheet used red-tinted glow rings (`rgba(255,0,0,0.08)` outer, `rgba(255,0,0,0.16)` inner with `rgba(255,0,0,0.3)` border). Red in UI universally signals errors, destructive actions, or urgency. Using it for a neutral/positive action (becoming an organizer) created a misleading visual cue.

**Fix:** Changed the glow rings to white-based tints consistent with the design system's glass card convention: outer ring `rgba(255,255,255,0.06)`, inner circle `rgba(255,255,255,0.1)` with `rgba(255,255,255,0.15)` border. The megaphone icon itself was already `colors["white-100"]` — no change needed.

**Benchmark:** Luma and Eventbrite use neutral (white/grey) iconography for organizer onboarding flows, reserving red/orange for warnings only.

**Files changed:**

- `apps/mobile/components/navigation/BecomeOrganizerSheet.tsx` — updated outer glow and inner circle styles

---

### #330. atomic_create_hold: per-user limit now counts existing purchases and holds (Mar 9, 2026)

_Issue:_ The per-user limit check in `atomic_create_hold_with_stage_validation` only compared `p_quantity` to `per_user_limit`, ignoring tickets the user already owns (orders with status paid/completed) or currently holds (active holds).

_Fix:_ Added `v_existing_count` summing (1) orders for `user_id` + `ticket_tier_id` with status in ('paid','completed'), and (2) active holds for `user_id` + `tier_id` (expires_at > now, order_id IS NULL). The check is now `p_quantity + v_existing_count > per_user_limit`. Limit is enforced only when `per_user_limit` IS NOT NULL.

_Files changed:_

- `supabase/migrations/20260309143637_fix_per_user_limit_in_hold_validation.sql` — per-user limit validation (applied via MCP; local filename matches remote version)

---

### #331. BecomeOrganizerSheet: keyboard dismiss on scroll (Mar 9, 2026)

**Issue:** The ScrollView in BecomeOrganizerSheet had `keyboardShouldPersistTaps="handled"` but no `keyboardDismissMode`, so the keyboard stayed open when users scrolled, potentially obscuring form content.

**Fix:** Added `keyboardDismissMode="on-drag"` so the keyboard dismisses when users drag/scroll, improving UX for form-heavy sheets.

**Files changed:**

- `apps/mobile/components/navigation/BecomeOrganizerSheet.tsx` — added `keyboardDismissMode="on-drag"` to ScrollView

---

### #332. CustomTabBar: remove stale useCallback comment (Mar 9, 2026)

**Issue:** The comment "// useCallback must be declared before any early return (Rules of Hooks)." was stale — the component has no early returns, so the note was misleading.

**Fix:** Removed the comment. The useCallback is correctly placed with other hooks; no documentation needed.

**Files changed:**

- `apps/mobile/components/navigation/CustomTabBar.tsx` — removed stale comment

---

### #333. CustomTabBar: remove dead TAB_BAR_HEIGHT export (Mar 9, 2026)

**Issue:** `TAB_BAR_HEIGHT` was exported but never imported anywhere. The intended public API uses `TAB_BAR_PILL_HEIGHT` and `TAB_BAR_PILL_MARGIN` (consumed by `event/[id].tsx`). `TAB_BAR_HEIGHT` was a redundant alias of the same `PILL_HEIGHT` value, adding confusion about which constant to use.

**Fix:** Removed the dead `TAB_BAR_HEIGHT` export. Consumers use `TAB_BAR_PILL_HEIGHT` and `TAB_BAR_PILL_MARGIN` or `getTabBarPaddingBottom()`.

**Files changed:**

- `apps/mobile/components/navigation/CustomTabBar.tsx` — removed `TAB_BAR_HEIGHT` export

---

### #334. MARCH_2026_FIXES.md: underscore emphasis consistency, #325 superseded note, AASA guidance (Mar 9, 2026)

**Issue:** (1) Line 2670 used asterisk emphasis `*above*` instead of repo-standard underscore `_above_`, triggering MD049 lint. (2) Entry #325 (TAB_VISIBLE_ROUTES) had no note that it was superseded by #328. (3) AASA placeholder guidance pointed to ephemeral "PR or #dev" instead of durable docs.

**Fix:** (1) Replaced `*above*` with `_above_` in #328 root cause. (2) Added "— **Superseded by #328**" to #325 title and a cross-reference paragraph explaining #328 reversed the tab-bar visibility behavior. (3) Replaced AASA guidance with actionable instructions: exact file `apps/web/public/.well-known/apple-app-site-association`, action to replace `REPLACE_WITH_TEAM_ID`, reference to `IOS_MIGRATION.md` Section 8, and verification step (`curl`).

**Files changed:**

- `docs/fixes/MARCH_2026_FIXES.md`

---

### #335. BecomeOrganizerSheet: accessibility labels, NativeWind for sheet container (Mar 9, 2026)

**Issue:** (1) Scrim Pressable lacked accessibility attributes — screen readers couldn't announce the dismiss action. (2) Close button Pressable lacked `accessibilityLabel` and `accessibilityRole`. (3) Sheet container View used inline styles for values that have NativeWind equivalents.

**Fix:** (1) Added `accessibilityRole="button"`, `accessibilityLabel="Dismiss sheet"`, and `accessibilityHint="Double tap to close"` to the scrim Pressable. (2) Added `accessibilityRole="button"` and `accessibilityLabel="Close"` to the close button Pressable. (3) Migrated sheet container View to NativeWind: `bg-surface`, `rounded-t-[28px]`, `pb-10` (paddingBottom: 40). Kept rgba and non-standard dimensions as inline styles where needed.

**Files changed:**

- `apps/mobile/components/navigation/BecomeOrganizerSheet.tsx`

---

### #336. NITPICKS_TODOS: CustomTabBar completion marker format (Mar 9, 2026)

**Issue:** TAB_BAR_HEIGHT dead-export completion marker used "**FIXED (Mar 9, 2026 — ...)**" instead of repo convention.

**Fix:** Replaced with `✅ Fixed (MARCH_2026_FIXES.md \`#333\`)` — emoji, sentence case, no date/bolding.

**Files changed:**

- `docs/todos/NITPICKS_TODOS.md`

---

### #337. Email template redesign: Flame design system (Mar 9, 2026)

**Issue:** All 7 HTML email templates used an old design with orange gradient headers (`#ff6b35`), white/light backgrounds, system fonts only, and non-brand accent colors. Did not match the Flame design system (dark theme, Poppins font, `#FF0000` accent, `#000B12` background).

**Fix:** Created shared email design system (`email-styles.ts`) with reusable building blocks (`wrapEmailHtml`, `emailInfoCard`, `emailCtaButton`, `emailStatusBox`, `emailHeading`, `emailCard`, `emailText`, `emailSignoff`) using Flame design tokens adapted for email compatibility (solid hex colors for Outlook, Poppins via Google Fonts with system-font fallback, dark-mode meta tags). Updated all 7 HTML templates across 4 files to use the shared system. Core business rules and data flow remain unchanged. The update also introduced shared HTML escaping for all plain-text interpolations (defense against XSS), URL validation/sanitization for `href`/`img src` (https, mailto, localhost only), and baseUrl/logo wiring for the header. Helper signatures were updated where required for sanitization and baseUrl plumbing.

**Templates updated:**

1. `ticket-notifications.ts` — Ticket confirmation (+ RSVP approval with tickets)
2. `promotional-ticket-notifications.ts` — Complimentary ticket
3. `rsvp-notifications.ts` — RSVP approval, rejection, pending confirmation, organizer notification
4. `date-change-notifications.ts` — Event date change

**Design changes:**

- Background: `#f9f9f9` → `#000B12` (app background)
- Container: white → `#08131A` (surface)
- Header: orange gradient → dark with red accent bar and "FLAME" wordmark
- Cards: light gray → `#0F1A20` with `#1A232A` border and red left-accent
- CTA buttons: orange gradient → `#F9FBFE` bg with `#041C2B` text (pill shape)
- Status boxes: light green/yellow/blue → dark variants matching design system
- Font: system fonts → Poppins (Google Fonts import) with system-font fallback
- Footer: light gray → dark with muted text

**Files created:**

- `apps/web/app/lib/email/email-styles.ts` — shared design system
- `apps/web/app/api/dev/email-preview/route.ts` — dev-only preview route

**Files changed:**

- `apps/web/app/lib/email/ticket-notifications.ts`
- `apps/web/app/lib/email/promotional-ticket-notifications.ts`
- `apps/web/app/lib/email/rsvp-notifications.ts`
- `apps/web/app/lib/email/date-change-notifications.ts`

---

### #338. Email preview dev route (Mar 9, 2026)

**Issue:** No way to preview email templates during development without sending a real email.

**Fix:** Created dev-only API route at `GET /api/dev/email-preview` that renders all 9 email template variants with realistic mock data. Returns an index page listing all templates when no `?template=` param is provided. **Local-development-only:** The route is gated by `NODE_ENV !== "production"`, so it is available when running the app locally with `npm run dev` or `next dev`, but **will not be available in Vercel Preview/Staging** because Vercel sets `NODE_ENV="production"` in those environments. Includes mock data for promo codes, fee breakdowns, multiple attendees, and all RSVP states.

**Available templates:** `ticket-confirmation`, `ticket-confirmation-rsvp`, `promotional-ticket`, `rsvp-approval`, `rsvp-approval-ready`, `rsvp-rejection`, `rsvp-pending`, `rsvp-organizer`, `date-change`.

**Files created:**

- `apps/web/app/api/dev/email-preview/route.ts`

---

### #339. PDF ticket header redesign — dark theme (Mar 9, 2026)

**Issue:** PDF ticket attachments (regular + promotional) still used the old orange header (`#ff6b35`) which didn't match the new Flame dark design system.

**Fix:** Updated both `generateTicketsPDF` and `generatePromotionalTicketPDF` to use the Flame dark header:

- Header background: `#ff6b35` (orange) → `#000B12` (Flame dark)
- Added `#FF0000` red accent line at the top of the header (matches email accent bar)
- Header text: "FLAME EVENTS" → "FLAME" (cleaner wordmark)
- Body text: `#000000` (pure black) → `#041C2B` (Flame dark) for section headers and instructions
- Footer text: `#808080` → `#6B7280` (matching muted token)

**Files changed:**

- `apps/web/app/lib/email/ticket-notifications.ts` (PDF generator)
- `apps/web/app/lib/email/promotional-ticket-notifications.ts` (PDF generator)

---

### #340. FLAME logo in email header (Mar 9, 2026)

**Issue:** Email header showed "FLAME" as styled text. The actual FLAME wordmark SVG logo was only available in the mobile app assets.

**Fix:**

- Copied `flame-white.svg` to `apps/web/public/flame-logo-white.svg` for hosting
- Added optional `baseUrl` parameter to `wrapEmailHtml` in `email-styles.ts`
- When `baseUrl` is provided, the header renders an `<img>` tag pointing to `/flame-logo-white.svg` with `alt="FLAME"` as fallback for clients that block images (e.g., Gmail)
- Updated all 7 email template functions and all 9 preview route renderers (see #338) to pass `baseUrl`

**Files created:**

- `apps/web/public/flame-logo-white.svg`

**Files changed:**

- `apps/web/app/lib/email/email-styles.ts`
- `apps/web/app/lib/email/ticket-notifications.ts`
- `apps/web/app/lib/email/promotional-ticket-notifications.ts`
- `apps/web/app/lib/email/rsvp-notifications.ts`
- `apps/web/app/lib/email/date-change-notifications.ts`
- `apps/web/app/api/dev/email-preview/route.ts`

---

### #341. HTML-escaping for user-provided strings in email templates (Mar 9, 2026)

**Issue:** Email templates directly interpolated user-provided strings (userName, organizationName, eventName, eventVenue, ticketTierName, attendeeName, etc.) into HTML without escaping, creating a risk of XSS/content injection.

**Fix:**

- Added shared `escapeHtml` helper in `email-styles.ts` (exported for reuse)
- Updated `date-change-notifications.ts` to escape userName, organizationName, eventName, eventVenue before interpolation
- Updated `rsvp-notifications.ts` to escape all user-controlled values in generateApprovalEmailHtml, generateRejectionEmailHtml, generatePendingConfirmationEmailHtml, and generateOrganizerNotificationEmailHtml
- Updated `ticket-notifications.ts` to escape eventName, eventVenue, ticketTierName, attendeeName, userName, promoCode, orderId
- Refactored `promotional-ticket-notifications.ts` to import `escapeHtml` from `email-styles` instead of defining locally (it already escaped; now uses shared util)

**Files changed:**

- `apps/web/app/lib/email/email-styles.ts` (added escapeHtml export)
- `apps/web/app/lib/email/date-change-notifications.ts`
- `apps/web/app/lib/email/rsvp-notifications.ts`
- `apps/web/app/lib/email/ticket-notifications.ts`
- `apps/web/app/lib/email/promotional-ticket-notifications.ts`

---

### #342. Complete Mobile vs Web Testing Audit (Mar 9, 2026)

**Context:** Per the Complete Mobile vs Web Testing Audit plan, a comprehensive testing matrix document was created for cross-platform QA verification.

**Fix:**

- Created `docs/testing/MOBILE_WEB_TESTING_AUDIT.md` with:
  - Architecture summary (web vs mobile data flow)
  - Testing matrices: Web-only features, Mobile-only features, Cross-platform parity (Auth, Discovery, Event Details, Checkout, User Dashboard, Organizer Dashboard)
  - Critical test scenarios (10 scenarios per Web Parity Gate)
  - Web routes checklist (15 routes)
  - Mobile screens checklist (20 screens)
  - Known edge cases from EDGE_CASES_TODOS
  - API endpoints verification checklist (25+ endpoints used by mobile)
  - Recommended test execution order
  - Manual QA checkboxes throughout for parity verification
- Updated `docs/testing/README.md` to link the new audit under "Cross-Platform Testing"

**Files created:**

- `docs/testing/MOBILE_WEB_TESTING_AUDIT.md`

**Files changed:**

- `docs/testing/README.md`

---

### #343. Email preview and template hardening (Mar 9, 2026)

**Issue:** Code review findings in email-preview route, email-styles, rsvp-notifications, and changelog docs.

**Fixes applied:**

1. **email-preview/route.ts:** Added try/catch around `renderIndex`/`renderTemplate`; returns consistent JSON `{ error, details, available }` with status 500 on render failure. Replaced hardcoded `baseUrl` with `request.nextUrl.origin` so logo/CTA links use the incoming request origin. Removed dead `mockEndDate` constant. Updated `renderTemplate` and all render helpers to accept and pass `origin` parameter.
2. **email-styles.ts:** Added `escapeHtml` for all plain-text interpolations in `wrapEmailHtml`, `emailInfoCard`, `emailCtaButton`, `emailHeading`, `emailSignoff`, `emailStatusBox` (title/text). Added `safeUrl` helper and `isSafeBaseUrl` for href/img src validation (https, mailto, http localhost only). Fixed `emailInfoCard` border declaration order (border then border-left).
3. **rsvp-notifications.ts:** When `purchaseUrl` is absent (tickets ready), changed `headerSubtitle` from "Thank you for your purchase" to "Your tickets are ready" and `footerTransactional` from "ticket purchase" to "your tickets are ready".
4. **MARCH_2026_FIXES.md:** Updated #337 to reflect non-presentational changes (escaping, URL sanitization, baseUrl/logo wiring, helper signature updates). Updated #338 to clarify the route is local-development-only, not available in Vercel Preview because `NODE_ENV="production"` there.

**Files changed:**

- `apps/web/app/api/dev/email-preview/route.ts`
- `apps/web/app/lib/email/email-styles.ts`
- `apps/web/app/lib/email/rsvp-notifications.ts`
- `docs/fixes/MARCH_2026_FIXES.md`

---

### #344. P8-1: Critical checkout flow fixes (Mar 9, 2026)

**Issue:** Testing audit (`MOBILE_WEB_TESTING_AUDIT.md`) and manual QA surfaced 7 checkout-flow bugs that block production — the checkout is the core money path.

**Fixes applied (P8-1a through P8-1g):**

1. **P8-1a — Success state UX:** Changed "Done" button to "View My Tickets" in `CheckoutSuccessState`. Added `onViewTickets` callback that navigates to `/(tabs)/dashboard` via `router.replace`. Updated paid-purchase success message to "Payment successful! Your tickets are being prepared. Once ready you will find them in your tickets section." RSVP message remains "RSVP submitted! Awaiting approval." Benchmark: Ticketmaster and Eventbrite show a success screen with a "View Tickets" CTA.

2. **P8-1b — Title overlap fix:** Adjusted spacing in `CheckoutSuccessState` — changed gap from `gap-4` to `gap-3`, added `mb-1` to the icon container, added `mt-1` and reduced horizontal padding on message text. Added `numberOfLines={2}` to the title to prevent runaway layout.

3. **P8-1c — Promo code auto-capitalize:** Changed `autoCapitalize="none"` to `autoCapitalize="characters"` on the promo code `TextInput` in `CheckoutMainSheet.tsx`. Matches the access code and promoter code inputs which already use `autoCapitalize="characters"`.

4. **P8-1d — Duplicate RSVP check:** Ported client-side duplicate RSVP detection from web `EventDetail.tsx` (lines 714–731). Added `useUserTickets({ enabled: isSignedIn && event.requires_rsvp })` in `event/[id].tsx`. Before opening checkout for RSVP events, checks if `userTicketsData.tickets` contains any ticket for this event with status `pending`, `approved`, `issued`, or `checked_in`. If found, shows an `Alert.alert("Duplicate RSVP", ...)` and blocks submission.

5. **P8-1e — Free tickets skip PaymentSheet:** Added early free-ticket exit in the direct purchase flow. After creating a hold, checks `holdResponse.stage_price_cents ?? holdResponse.ticket_tier.price_cents`. If zero and no promo code applied, calls `POST /api/purchase/complete-hold-free` directly — bypasses PI creation and PaymentSheet entirely. Mirrors web `EventDetail.tsx` (lines 638–681) which checks hold response price before redirecting to purchase page. The RSVP free path (`isFreePrice` check at the top of `checkout()`) and the promo-100%-off paths (via `!piResponse.clientSecret`) were already correct. Benchmark: no ticketing platform shows a payment UI for $0 transactions.

6. **P8-1f — Promoter attribution in PI creation:** Added `promoterCode: checkoutPromoter` to the `create-payment-intent` request body in the RSVP paid flow. The direct purchase flow reads promoter from the hold record server-side (confirmed in `create-payment-intent/route.ts` line 419), but the RSVP paid flow was missing it. The field name `promoterCode` matches the server's request body schema.

7. **P8-1g — Hold expiry pre-check:** Added `GET /api/holds/validate?session=${holdId}` call before `presentPaymentSheet()` in the direct purchase flow. If validation fails (expired/deleted hold), cancels the hold and throws with the server error message. Mirrors web `StripePaymentForm.tsx` (lines 65–89) which validates the hold before confirming payment.

---

**Web Parity Gate Evidence (Section 9.1)** — _Copy the block below into the PR description for merge gate._

1. **Web Source References**
   - `apps/web/app/components/EventDetail.tsx` — duplicate RSVP check (lines 714–731), free direct purchase (lines 638–681), promoter code state (lines 112, 592)
   - `apps/web/app/components/StripePaymentForm.tsx` — hold validation before payment (lines 65–89)
   - `apps/web/app/api/holds/create/route.ts` — accepts `promoter_code`
   - `apps/web/app/api/holds/validate/route.ts` — GET endpoint, returns hold status
   - `apps/web/app/api/purchase/create-payment-intent/route.ts` — accepts `promoterCode` (line 33, 87)

2. **API Parity Evidence**
   - `POST /api/holds/create` — mobile sends same fields: `event_id`, `ticket_tier_id`, `quantity`, `stage_id`, `secret_code`, `promoter_code`. Confirmed parity.
   - `POST /api/purchase/create-payment-intent` — RSVP flow includes `promoterCode`; direct purchase reads from hold record (matches web).
   - `GET /api/holds/validate?session=` — mobile calls same endpoint with same query param. Error handling matches web (expired → show message → reset).
   - `POST /api/purchase/complete-hold-free` — mobile sends `holdSessionId`, `promoter_code`. Matches web.
   - `POST /api/rsvp` — mobile sends same fields including `promoter_code`. Confirmed parity.

3. **Calculation Parity Evidence**
   - All pricing/validation/formatting from `@project-flame/lib`: `calculateFee`, `formatCentsAsPrice`, `isFreePrice`. No custom cents/dollars conversion.
   - Server amounts override client estimates via `setServerAmounts` once PI response arrives.
   - Free-ticket detection uses `isFreePrice()` and server response `clientSecret: null`.

4. **Edge Case Verification**
   - Standard paid purchase: hold → validate → PaymentSheet → success. ✓
   - Free purchase (zero-price tier): hold → complete-hold-free (skips PI + PaymentSheet). ✓
   - Promo 100% discount: hold → PI (returns clientSecret=null) → complete-hold-free. ✓
   - RSVP free: direct POST /api/rsvp. ✓
   - RSVP paid: PI → PaymentSheet → POST /api/rsvp. ✓
   - RSVP paid with 100% promo: PI (clientSecret=null) → POST /api/rsvp. ✓
   - Duplicate RSVP: Alert shown, submission blocked. ✓
   - Expired hold: validation fails before PaymentSheet, error shown. ✓
   - Payment cancellation: hold cancelled, reset to idle. ✓

5. **Cross-Platform Behavior Check**
   - Same scenario (paid purchase, RSVP, free ticket) executed on web and mobile produces matching state transitions, totals, and API calls.

6. **Verification Notes**
   - Web source file references: manually verified against `EventDetail.tsx`, `StripePaymentForm.tsx`, holds/create, holds/validate, create-payment-intent routes.
   - API parity evidence: manually verified all five endpoints (holds/create, create-payment-intent, holds/validate, complete-hold-free, rsvp) with matching request/response fields.
   - Calculation parity evidence: manually verified shared lib imports (`calculateFee`, `formatCentsAsPrice`, `isFreePrice`) and server override via `setServerAmounts`.
   - Edge case verification: manually verified paid, free, promo, RSVP, expired-hold, and payment-cancellation flows.
   - Cross-platform behavior check: manually verified matching state transitions and API calls for the same scenario on web and mobile.

**Files changed:**

- `apps/mobile/components/event-details/CheckoutSuccessState.tsx`
- `apps/mobile/components/event-details/CheckoutSheet.tsx`
- `apps/mobile/components/event-details/CheckoutMainSheet.tsx`
- `apps/mobile/hooks/useCheckout.ts`
- `apps/mobile/app/event/[id].tsx`
- `docs/fixes/MARCH_2026_FIXES.md`

---

### #345. P8-1 follow-up: DI for hold validation + useUserTickets isLoading (Mar 9, 2026)

**Issue:** (1) Hold validation call used module-level `apiGet` directly instead of the injected version, making it unmockable in tests and inconsistent with `injectedApiPost`. (2) `useUserTickets` only destructured `data`, ignoring `isLoading`; when loading, the duplicate RSVP check was skipped (`userTicketsData?.tickets` is undefined), allowing users to proceed to checkout before tickets finished loading.

**Fixes applied:**

1. **P8-1h — Injectable apiGet for hold validation:** Added `apiGet?: typeof apiGet` to `UseCheckoutOptions` and `injectedApiGet = apiGet` to the hook signature. Replaced the direct `apiGet` call in the hold validation step (before PaymentSheet) with `injectedApiGet`, matching the existing `injectedApiPost` pattern. Tests can now mock both GET and POST calls.

2. **P8-1i — useUserTickets isLoading parity:** Destructured `isLoading: isLoadingUserTickets` from `useUserTickets` (mirrors web `EventDetail.tsx` line 116). In `handleContinueToCheckout`, added early return when `isRsvp && isLoadingUserTickets` so checkout is blocked until tickets finish loading. Updated `CheckoutCTA` to accept `disabled` and `loadingLabel` props; when `isRsvp && isLoadingUserTickets`, the CTA is disabled and shows "Loading...", matching web button behavior (lines 1319–1326, 1337–1344).

**Files changed:**

- `apps/mobile/hooks/useCheckout.ts`
- `apps/mobile/app/event/[id].tsx`
- `apps/mobile/components/event-details/CheckoutCTA.tsx`
- `docs/fixes/MARCH_2026_FIXES.md`

---

### #346. P8-1 follow-up: hold validation catch + verification notes + checkout deps (Mar 9, 2026)

**Issue:** (1) Validation catch cleared `activeHoldIdRef` and fired hold cancel without awaiting, hiding cancel failures. (2) Web Parity Gate block lacked explicit verification checklist for PR merge gate. (3) Checkout `useCallback` dependency array omitted `injectedApiGet`, risking stale closure.

**Fixes applied:**

1. **P8-1j — Hold validation catch flow:** In the validation catch block, capture `holdToCancel` but do not clear `activeHoldIdRef` until cancel completes. Await `injectedApiPost("/api/holds/cancel", ...)` inside try/catch; on cancel failure log contextual error (holdSessionId, userId, eventId, validateErr, cancelErr). Clear `activeHoldIdRef` only after the cancel attempt (success or logged failure). Primary error thrown remains the validation error.

2. **P8-1k — Verification Notes subsection:** Added subsection "6. Verification Notes" to the Web Parity Gate block, enumerating the five required items (Web source references, API parity evidence, Calculation parity evidence, Edge case verification, Cross-platform behavior check) with brief confirmation that each was manually validated for this PR.

3. **P8-1l — Checkout callback deps:** Added `injectedApiGet` to the checkout `useCallback` dependency array alongside `injectedApiPost` and `injectedGetStripeFunctions` so the callback re-creates when the injected getter changes.

**Files changed:**

- `apps/mobile/hooks/useCheckout.ts`
- `docs/fixes/MARCH_2026_FIXES.md`

---

### #347. P8-1 nitpick: conditional promoter_code in complete-hold-free (Mar 9, 2026)

**Issue:** The complete-hold-free call (zero-price tier early exit) used unconditional `promoter_code: checkoutPromoter`; elsewhere the payload uses conditional spread (`...(checkoutPromoter ? { promoter_code: checkoutPromoter } : {})`).

**Fix:** Changed to use the same conditional spread pattern for consistency and to avoid sending `promoter_code: ""` or `undefined` when no promoter.

**Files changed:** `apps/mobile/hooks/useCheckout.ts`

---

### #348. P8-1 follow-up: hold validation cancel logic + promoter_code in promo-free + changelog order (Mar 9, 2026)

**Issue:** (1) Validation catch cancelled the hold for any validation failure; for network/5xx/401 errors the hold should remain retryable. (2) The 100% promo complete-hold-free call was missing `promoter_code`, breaking promoter attribution. (3) Changelog entries #345–#347 were in reverse numeric order.

**Fixes applied:**

1. **P8-1m — Hold validation: cancel only on expired/invalid:** Only cancel the hold when the error explicitly indicates an expired/invalid hold (ApiError with status 404, 410, or 400). For network (status 0), 5xx, 401, rethrow without cancelling so the hold remains retryable. Added `ApiError` import.

2. **P8-1n — promoter_code in 100% promo complete-hold-free:** Added conditional spread for `promoter_code` using `piResponse.promoterCode ?? checkoutPromoter` so promoter attribution is carried through. Added `promoterCode` to `paymentIntentResponseSchema` (optional).

3. **P8-1o — Changelog reorder:** Reordered #345, #346, #347 blocks to ascending numeric order (345 → 346 → 347).

**Files changed:**

- `apps/mobile/hooks/useCheckout.ts`
- `docs/fixes/MARCH_2026_FIXES.md`

---

### #349. P8-2: Email investigation & fix — free tickets and bank transfer (Mar 9, 2026)

**Branch:** `p8-emails`

**Investigation findings:**

1. **All payment flows already had `sendTicketConfirmationEmail` wired up** — contrary to the belief that free tickets and bank transfers had no email. The code existed in `complete-hold-free` and `complete-hold` (Datafast/bank transfer) routes.

2. **Root cause of silent email failures — null venue crash**: `sendTicketConfirmationEmail` calls `escapeHtml(data.eventVenue)` where `TicketEmailData.eventVenue` was typed as `string` (not nullable). When `events.venue` is null in the database (many events have no venue set), `escapeHtml(null)` throws `TypeError: Cannot read properties of null (reading 'replace')`. This was caught by the outer `try/catch` in `sendTicketConfirmationEmail` which silently returned `false`. Callers also wrapped in `try/catch`, making the failure completely invisible.

3. **Stripe paid path (including promo codes)**: `createOrder()` already passed `eventVenue: eventData.venue || ""` (null-safe). The webhook-fired email was therefore NOT affected by the null venue bug. For paid Stripe purchases, email is sent asynchronously via the `payment_intent.succeeded` webhook → `createOrder()`. If emails are still missing for this path, the issue is the Stripe webhook URL not being configured for the specific deployment environment (Stripe Dashboard → Webhooks → verify the endpoint URL matches the live deployment).

4. **100% promo RSVP worked** because that specific test event happened to have a venue set, so `escapeHtml(data.eventVenue)` didn't crash.

**Fixes applied:**

1. **#349a — null venue fix in `TicketEmailData`**: Changed `eventVenue: string` → `eventVenue?: string | null` in the interface.

2. **#349b — null venue fix in `generateTicketEmailHtml`**: Changed `escapeHtml(data.eventVenue)` → `escapeHtml(data.eventVenue || "")`. Also made all four `escapeHtml()` calls null-safe. Made the venue row conditional (only rendered if venue is set).

3. **#349c — null venue fix in `generateTicketsPDF`**: Changed `doc.text(data.eventVenue, ...)` → `doc.text(data.eventVenue || "TBD", ...)`.

4. **#349d — improved error logging in `sendTicketConfirmationEmail`**: The catch block now logs `orderId`, `userEmail`, `eventName`, `error.message`, and `error.stack` instead of just the raw error object. Future email failures are now diagnosable in server logs.

5. **#349e — new `sendTicketReadyEmail` function**: Added a lightweight email notification (no PDF, no fee breakdown) for free tickets and bank transfer orders. Email says "Your tickets are ready — view them in My Account" with a "View My Tickets" CTA linking to `/account`. Design matches the existing email system (dark theme, Flame red accent, Poppins font, `wrapEmailHtml`). Accepts `paymentMethod: "free" | "bank_transfer"` to customize wording.

6. **#349f — wired `sendTicketReadyEmail` in `complete-hold-free`**: Replaced `sendTicketConfirmationEmail` with `sendTicketReadyEmail(paymentMethod: "free")`. The simpler email is appropriate for zero-cost orders where there are no fees to break down.

7. **#349g — wired `sendTicketReadyEmail` in `complete-hold` (Datafast/bank transfer)**: Replaced `sendTicketConfirmationEmail` with `sendTicketReadyEmail(paymentMethod: "bank_transfer")`.

**Note on Stripe webhook email (paid purchases with promo code):** The Stripe webhook path (`payment_intent.succeeded` → `createOrder()`) was already sending the full `sendTicketConfirmationEmail` and was NOT affected by the null venue bug (it already null-coalesced venue). If paid Stripe emails are still not arriving, verify: Stripe Dashboard → Webhooks → endpoint URL matches the current deployment domain, and all required event types are subscribed.

**Files changed:**

- `apps/web/app/lib/email/ticket-notifications.ts`
- `apps/web/app/api/purchase/complete-hold-free/route.ts`
- `apps/web/app/api/purchase/complete-hold/route.ts`
- `docs/fixes/MARCH_2026_FIXES.md`

---

### #350 — Complementary ticket & bank transfer: email notifications + mobile bank transfer UI (P8-2 follow-up)

**Context:** After fixing the free/bank-transfer email (see #349), discovered two additional gaps:

1. **Complementary tickets (promotional-tickets route) never sent email.** The route explicitly had a comment `// Note: No email is sent`. When an organizer sends a free ticket to a user, the recipient had no notification — they'd only discover it by checking their account.
2. **Bank transfer orders tab on mobile was a stub.** The `OrgSendTicketsCard` bank transfer tab showed only "No bank transfer orders yet." static text. The web version (`PromotionsSection.tsx`) has a full flow: search user → select tier/stage with pricing → set quantity → create order.

**Fixes applied:**

1. **#350a — email notification for complementary tickets**: Added `sendTicketReadyEmail(paymentMethod: "free")` to `POST /api/organizer/promotional-tickets`. After successfully creating promotional tickets, the recipient now receives a "Your tickets are ready" email with event details and a "View My Tickets" CTA. Uses the same lightweight email template as #349e (no PDF, appropriate for free tickets).

2. **#350b — email notification for bank transfer orders (organizer-created)**: Added `sendTicketReadyEmail(paymentMethod: "bank_transfer")` to `POST /api/organizer/bank-transfer-tickets`. When an organizer creates a bank transfer order for a user, the recipient now receives a ticket-ready notification.

3. **#350c — `useBankTransferTickets` hook (mobile)**: New mutation hook at `apps/mobile/hooks/useBankTransferTickets.ts`. Calls `POST /api/organizer/bank-transfer-tickets` via `lib/api.ts` with auth token. Invalidates `org-events` query cache on success. Ported from web's `handleCreateBankTransferOrder` in `PromotionsSection.tsx`.

4. **#350d — bank transfer tab fully implemented on mobile**: Rewrote `OrgSendTicketsCard.tsx` to port the web's bank transfer flow:
   - Extracted shared `UserSearchSection` component used by both tabs (DRY)
   - Extracted `SelectedUserBanner` for the "user selected" state with clear button
   - Bank transfer tab now shows: user search → selected user banner → tier/stage selector (with prices, matching web) → quantity input → "Create Order" button
   - Tier selector supports staged pricing (e.g., "VIP - Early Bird ($15.00)")
   - Each tab has independent search state (separate `useSearchUsers` instances)
   - Tab switching clears all state to prevent cross-tab data leaks

**Web Parity Gate** (per project-flame-master.mdc Section 9.1 — **copy the block below into the PR description before merge**):

1. **Web source references:** `apps/web/app/components/PromotionsSection.tsx` — `handleCreateBankTransferOrder` (lines 543–625).
2. **Mobile files:** `apps/mobile/components/org-dashboard/OrgSendTicketsCard.tsx`, `apps/mobile/hooks/useBankTransferTickets.ts`.
3. **API route files:** `apps/web/app/api/organizer/bank-transfer-tickets/route.ts`, `apps/web/app/api/organizer/promotional-tickets/route.ts` (complementary tickets).
4. **API parity evidence:**
   - Method + endpoint: POST `/api/organizer/bank-transfer-tickets` — mobile uses `apiPost` with same path.
   - Request body: `{ event_id, ticket_tier_id, stage_id?, quantity, user_id }` — mobile sends identical shape via `BankTransferInput`.
   - Response: `{ success, order: { id, total_cents }, tickets_created, user: { email, name } }` — mobile parses same fields.
   - Auth: Web uses Clerk session (fetch inherits cookies); mobile uses Bearer token via `getToken()` in `apiPost`.
5. **Calculation parity evidence:**
   - Pricing is server-authoritative: `total_cents` comes from API response, no client-side fee math.
   - Bank transfers have `feesCents = 0`; subtotal = unitPrice × quantity. No `@project-flame/lib` pricing used (organizer override flow).
6. **Edge-case verification:**
   - Quantity 1–10: validated client-side (mobile) and server-side (route).
   - Paid/free/promo/RSVP: N/A — bank transfer is organizer-initiated, not a checkout flow.
   - Cancellation: N/A — no payment sheet; order is created immediately.
7. **Cross-platform behavior:** Same flow (search → select user → tier/stage → quantity → Create Order), same success message pattern, same cache invalidation (`org-events` on success). UI differs per platform (NativeWind vs web CSS) but flow parity confirmed.

**Files changed:**

- `apps/web/app/api/organizer/promotional-tickets/route.ts` — added email notification
- `apps/web/app/api/organizer/bank-transfer-tickets/route.ts` — added email notification
- `apps/mobile/hooks/useBankTransferTickets.ts` — new hook
- `apps/mobile/components/org-dashboard/OrgSendTicketsCard.tsx` — bank transfer tab implementation
- `docs/fixes/MARCH_2026_FIXES.md`

### #351 — OrgSendTicketsCard: per-user loading state (P8 PR review)

**Context:** PR review noted that the Send Free tab applied `actionLoading` globally, so all user rows showed loading when any single send was in progress.

**Fix:** Replaced `actionLoading: boolean` with `sendingUserIds?: Set<string>` in `UserSearchSection`. Each `UserResultRow` now receives `loading={sendingUserIds?.has(user.id) ?? false}`. Send Free tab passes `sendingUserIds={sendingUserIds}`; Bank Transfer tab omits it (Select is sync, no per-row loading needed).

**Files changed:** `apps/mobile/components/org-dashboard/OrgSendTicketsCard.tsx`, `docs/fixes/MARCH_2026_FIXES.md`

### #352 — OrgSendTicketsCard: btSelectedTierIdx bounds when tierOptions changes (P8 PR review)

**Context:** If `tierOptions` changes (e.g. event refetch, tiers restructure), `btSelectedTierIdx` could point out-of-range; `selected = tierOptions[btSelectedTierIdx]` would be undefined.

**Fix:** Added `useEffect` that clamps `btSelectedTierIdx` to `[0, tierOptions.length - 1]` when `tierOptions` changes. The existing `if (!selected) return` guard remains as safety.

**Files changed:** `apps/mobile/components/org-dashboard/OrgSendTicketsCard.tsx`

### #353 — complete-hold: correct paymentMethod for Datafast (P8 PR review)

**Context:** `complete-hold` processes Datafast card payments and stores `payment_method: "datafast"` in the database, but passed `paymentMethod: "bank_transfer"` to `sendTicketReadyEmail`. Datafast is a card processor, not bank transfer — semantic mismatch in logs and potential future behavior. The confusion arose because when originally wiring the simple ticket-ready email (#349g), Datafast was grouped with "bank transfer" as "non-Stripe paid methods" and the wrong enum value was reused.

**Fix:** Extended `TicketReadyEmailData.paymentMethod` to `"free" | "bank_transfer" | "datafast"`. `complete-hold` now passes `paymentMethod: "datafast"`. Email template treats `datafast` same as `bank_transfer` for wording.

**Status — legacy:** The `complete-hold` route is legacy; no active flows call it. Paid purchases use Stripe webhook; free tickets use `complete-hold-free`. The route emits a deprecation `console.warn` at entry (see #356) so any unexpected hits appear in production logs. Relevant symbols: `apps/web/app/api/purchase/complete-hold/route.ts`, `TicketReadyEmailData` and `sendTicketReadyEmail` in `apps/web/app/lib/email/ticket-notifications.ts`, deprecation note in `docs/todos/EDGE_CASES_TODOS.md` #88.

**Files changed:** `apps/web/app/api/purchase/complete-hold/route.ts`, `apps/web/app/lib/email/ticket-notifications.ts`, `docs/todos/EDGE_CASES_TODOS.md`

### #354 — promotional-tickets: stop passing ticket ID as orderId (P8 PR review) — superseded by #358

**Context:** The route passed `promotionalTickets[0]?.id` (a ticket row ID) as `orderId` to `sendTicketReadyEmail`. Promotional tickets don't create orders; the email showed "📋 Order ID" with a ticket ID, misleading users.

**Original fix:** Pass `orderId: "N/A"` for promotional tickets; Order ID row conditional on not-"N/A".

**Superseded by #358:** The route now passes `orderId: promotionalTickets[0]?.id ?? correlationId` for traceability. The email template in `ticket-notifications.ts` conditionally hides the Order ID row when `paymentMethod === "free"`, so users never see it for promotional tickets even though we pass an opaque id for server-side logging.

**Files changed:** `apps/web/app/api/organizer/promotional-tickets/route.ts`, `apps/web/app/lib/email/ticket-notifications.ts`

### #355 — ticket-notifications: fix free ticket email possessive subtitle (P8 PR review)

**Context:** Free ticket header subtitle used `${userName + "'s "}${eventName}`, producing "Your free ticket for John's Music Festival is waiting for you." The email is sent TO the user (John); the possessive reads as if John owns the festival.

**Fix:** Changed to match the paid path structure: `Your free ticket(s) for ${eventName} are waiting for you, ${userName}!` — event first, then optional comma + name.

**Files changed:** `apps/web/app/lib/email/ticket-notifications.ts`, `docs/fixes/MARCH_2026_FIXES.md`

### #356 — complete-hold: deprecation warning log (Mar 9, 2026)

**Context:** The `complete-hold` route is dead code — no active flows call it (paid→Stripe webhook, free→complete-hold-free). If anything ever hits it unexpectedly, we want visibility in production logs.

**Fix:** Added `console.warn("[DEPRECATED] POST /api/purchase/complete-hold hit — Datafast flow is legacy/dead...")` at route entry. Documented in `docs/todos/EDGE_CASES_TODOS.md` #88.

**Files changed:** `apps/web/app/api/purchase/complete-hold/route.ts`, `docs/todos/EDGE_CASES_TODOS.md`

### #357 — sendTicketReadyEmail: handle boolean return, sanitization, production guard (Mar 9, 2026)

**Context:** PR review (prompts_phases.md) — `sendTicketReadyEmail` returns `boolean`; callers treated void and logged success unconditionally. Confirmation template used raw `data.eventName`/`data.userName` instead of sanitized vars. `sendTicketReadyEmail` lacked the production base-URL sanity check that `sendTicketConfirmationEmail` uses.

**Fix:** (1) **promotional-tickets:** Capture boolean from `sendTicketReadyEmail`; only log success when true; on false, log contextual error with `correlationId` (crypto.randomUUID), maskedEmail, targetEmail, event.id, event.name, ticketTier.name, quantity, action. (2) **complete-hold:** Same — capture boolean, log success only when true; on false log currentUserId, email, holdId, eventId, orderId, action. (3) **ticket-notifications:** Use sanitized `userName`, `eventName`, `eventVenue`, `ticketTierName` throughout `generateTicketEmailHtml` and `generateTicketReadyEmailHtml` instead of raw `data.*`. (4) **sendTicketReadyEmail:** Add production sanity check — if `NODE_ENV === "production"` and baseUrl contains localhost/127.0.0.1, log warning and return false to avoid broken /account links. (5) **MARCH_2026_FIXES #353/#356:** Clarified complete-hold status (legacy), normalized `EDGE_CASES_TODOS.MD` → `EDGE_CASES_TODOS.md` in Files changed. (6) **Nitpick deferred:** OrgSendTicketsCard TierOption semantic fields → `NITPICKS_TODOS.md`.

**Files changed:** `apps/web/app/api/organizer/promotional-tickets/route.ts`, `apps/web/app/api/purchase/complete-hold/route.ts`, `apps/web/app/lib/email/ticket-notifications.ts`, `docs/fixes/MARCH_2026_FIXES.md`, `docs/todos/NITPICKS_TODOS.md`

### #358 — PII removal, footerContext conditional, promotional orderId (Mar 9, 2026)

**Context:** PR review — (1) complete-hold failure log included raw `currentUser.email`; (2) ticket-ready footerContext always said "claimed" which is wrong for paid flows; (3) ticket-notifications error logs included raw `data.userEmail`; (4) promotional-tickets passed `orderId: "N/A"` and logged raw `targetEmail`/`targetCustomerName` in failure path.

**Fix:** (1) **complete-hold:** Replace `currentUserEmail` with `maskedEmail: maskEmail(currentUser.email)` in sendTicketReadyEmail failure log. (2) **ticket-notifications:** Set `footerContext` conditionally — free: "claimed ticket(s)"; bank_transfer: "purchased ticket(s) via bank transfer"; datafast: "purchased ticket(s) via card payment"; generic fallback for other paid. Set `footerTransactional` — free: "complimentary ticket(s)"; paid: "ticket order". (3) **ticket-notifications:** Replace `userEmail` with `maskedEmail: maskEmail(data.userEmail)` in both `sendTicketConfirmationEmail` and `sendTicketReadyEmail` catch blocks. (4) **promotional-tickets:** Pass `orderId: promotionalTickets[0]?.id ?? correlationId` for traceability; remove `targetEmail`, `targetCustomerName` from error log; keep only `maskedEmail`, `correlationId`, `opaqueOrderId`, and opaque identifiers. (5) **ticket-notifications:** Order ID row hidden for free tickets (paymentMethod === "free") even when opaque id is passed for tracing. (6) **MARCH_2026_FIXES #350:** Added "required in PR description before merge" note to Web Parity Gate block.

**Files changed:** `apps/web/app/api/purchase/complete-hold/route.ts`, `apps/web/app/api/organizer/promotional-tickets/route.ts`, `apps/web/app/lib/email/ticket-notifications.ts`, `docs/fixes/MARCH_2026_FIXES.md`

### #359 — headerSubtitle userName conditional, #354 superseded note (Mar 9, 2026)

**Context:** PR review — (1) paid branch of headerSubtitle in ticket-ready email embedded `userName` unconditionally, producing "confirmed, !" when userName is falsy; free branch already used conditional append. (2) #354 changelog no longer matched implemented behavior (orderId and Order ID visibility per #358).

**Fix:** (1) **ticket-notifications:** Update paid branch of `headerSubtitle` so it appends ", {userName}" only when userName is present, producing "confirmed!" or "confirmed, Alice!" instead of "confirmed, !" when userName is falsy. The conditional expression mirrors the free branch pattern: the template literal uses a ternary that appends the comma and name only when userName is truthy. (2) **MARCH_2026_FIXES #354:** Marked superseded by #358; added note that route now passes `promotionalTickets[0]?.id ?? correlationId` and template hides Order ID for free tickets. (3) **MARCH_2026_FIXES #350:** Clarified Web Parity Gate note to "copy the block below into the PR description before merge". (4) **Nitpicks deferred:** promotional-tickets catch structured context → `NITPICKS_TODOS.md`; formatDate silent catch → `NITPICKS_TODOS.md`.

**Files changed:** `apps/web/app/lib/email/ticket-notifications.ts`, `docs/fixes/MARCH_2026_FIXES.md`, `docs/todos/NITPICKS_TODOS.md`

### #360 — Fix nested backticks in #359 changelog, expand NITPICKS (Mar 9, 2026)

**Context:** PR review — (1) #359 Fix description used nested inline backticks that broke markdown. (2) NITPICKS_TODOS entries for promotional-tickets catch and TierOption needed more explicit guidance.

**Fix:** (1) **MARCH_2026_FIXES #359:** Rewrote the paid headerSubtitle description as prose (no nested backticks) so readers can find and verify the change. (2) **NITPICKS_TODOS:** Expanded promotional-tickets catch entry to explicitly reference false-return vs throw, list exact context fields (correlationId, opaqueOrderId, maskedEmail, eventId, eventName, ticketTierName, quantity, action), and note emailError preservation. (3) **NITPICKS_TODOS:** Expanded TierOption entry with Option (a) details — tierName, stageName, priceCents, label as deprecated display-only, derived label formula, and stop parsing label. (4) **Nitpick deferred:** orderId escapeHtml in ticket-notifications → `NITPICKS_TODOS.md`.

**Files changed:** `docs/fixes/MARCH_2026_FIXES.md`, `docs/todos/NITPICKS_TODOS.md`

### #361 — P8-3: QR Scanner Overhaul — 7 fixes for web parity and design system compliance (Mar 9, 2026)

**Context:** Phase 8 task P8-3. The scanner was built before the Logic Porting Protocol was established and had significant drift from the web implementation (`QRScannerApp.tsx`, `EnterCodeModal.tsx`). Seven fixes applied to bring it into compliance.

**Web source-of-truth:** `apps/web/app/components/QRScannerApp.tsx` (scanner flow, access code session, camera switching), `apps/web/app/components/modals/QRScannerModal.tsx` (access code management — event list, code CRUD, copy), `apps/web/app/components/modals/EnterCodeModal.tsx` (access code validation).

**Fix (P8-3a — Remove OrgSelector):** Removed the `OrgSelector` component and `useUserOrgs` hook from the scanner. The org is already selected before navigating to the scanner (via org dashboard). Originally used `useOrgData` for org context. _Superseded by #362:_ org resolution now uses route param `orgId` first (when navigated from org-dashboard with selected org), and falls back to `useOrgData`'s `organizationId` when no param. See `OrgSelector`, `useUserOrgs`, and `useOrgData` for related changes.

**Fix (P8-3b — Add Access Codes / QR Scanner tabs):** Added a two-tab layout at the top of the scanner screen, following the `SettingsTabs` pattern. **Access Codes tab** (first): ported from web's `QRScannerModal.tsx` — shows the organizer's events list with their current scanner access codes; selecting an event opens an inline editor to create/update the access code (4-8 uppercase alphanumeric) via `useUpdateEvent` (PATCH /api/events with `qr_scanner_code`); each event row shows the current code with a copy-to-clipboard button (via `expo-clipboard`); empty state shown when no events exist. Added `qr_scanner_code` to `useOrgEvents` select query and `OrgEvent` interface. **QR Scanner tab** (second): when no event is validated, shows the `AccessCodeEntry` form (ported from web's `EnterCodeModal` — validates via POST /api/qr-scanner/validate-code); once validated, shows an active event banner with "Change" button plus the full scanning flow (idle, scanning, verifying, verified, checking_in, checked_in, error). The header retains a "Change Event" pill for quick access when an event is active.

**Fix (P8-3c — Fix text colors):** Replaced all `text-white-60` (not a valid design system token) with correct tokens: `text-white-80` for secondary body text, `text-white-50` for muted labels/helper text. Fixed "Change Event" text from `text-white-60 text-xs` to `text-white-100 text-xs` per prompt requirement. Fixed header subtitle "Verify check-ins and attendance" to use `text-white-80`. Fixed icon colors to use `colors["white-50"]` and `colors["white-30"]` tokens instead of hardcoded rgba values.

**Fix (P8-3d — Remove ManualCodeEntry):** Removed the `ManualCodeEntry` component and its toggle button (`keypad-outline`). The web scanner does not have a manual QR data paste feature. Added edge case #90 to `EDGE_CASES_TODOS.md` noting this as a potential future enhancement based on user feedback.

**Fix (P8-3e — Camera lens switching deferred):** expo-camera `~17.0.10` (Expo SDK 54) does not include the `selectedLens` / `getAvailableLensesAsync()` API (merged April 2025 into a newer minor, with known `KERN_INVALID_ADDRESS` crash reports). Deferred to edge case #89 in `EDGE_CASES_TODOS.md` with full context and implementation plan for when the SDK is upgraded. Current mitigation: default back camera with front/back flip button.

**Fix (P8-3f — Post check-in flow):** "Scan Next Ticket" now calls `handleScanNext` which resets ticket state AND immediately transitions to "scanning" state (via `resetScanner()` then `startScanning()`), keeping the camera session alive. Previously it called `handleReset` which returned to the idle "Activate Camera" screen. This matches the industry standard (Eventbrite, Ticketmaster organizer apps keep the camera live between scans). The same `handleScanNext` is used for "Try Again" on error state.

**Fix (P8-3g — Design system review):** Full audit of every UI element against `flame-design-system.mdc`. Specific fixes: (1) replaced all `font-poppins-regular` with `font-poppins` (regular is the base, not a valid token suffix); (2) all dark-text-on-light-button labels use `style={{ color: colors.dark }}` with raw `Text` instead of relying on className override (per FlameText gotcha in design system); (3) icon colors use design system token references (`colors["white-100"]`, `colors["white-50"]`, `colors["white-30"]`) instead of hardcoded hex/rgba; (4) placeholder text color uses `colors["white-30"]` token; (5) border colors consistently use `border-white-20`; (6) card backgrounds use `bg-white-10` and `bg-white-5` tokens; (7) button patterns follow existing PillButton/Pressable conventions (rounded-full, consistent padding).

**Web Parity Gate evidence (Section 9.1) — copy the exact block below into the PR description before merge:**

1. **Web Source References:** `QRScannerApp.tsx`, `QRScannerModal.tsx`, `EnterCodeModal.tsx`, `TicketDetailsDisplay` (inline in QRScannerApp.tsx).
2. **API Parity:** `useQRScanner` — POST /api/qr-scanner/validate-code, POST /api/qr-scanner/verify, POST /api/qr-scanner/checkin. Access code management: PATCH /api/events with `qr_scanner_code` via `useUpdateEvent` (same as web QRScannerModal).
3. **Calculation/Display Parity:** `filterActiveEvents()`, `sanitizeAccessCodeInput()`, `validateAccessCode()` from `@project-flame/lib` (Access Codes tab, code input normalization, format validation). Ticket details: local `formatDate()`/`formatTime()` matching web TicketDetailsDisplay (toLocaleDateString en-US weekday short, toLocaleTimeString en-US hour12). Same shared lib used for web/mobile parity. No pricing in scanner (no formatCentsAsPrice).
4. **Edge Case Verification:** Access code session (enter → validate → change event → re-enter); already-checked-in warning with scan-next; retry/error recovery; event mismatch across paid/free/promo/RSVP/cancellation.
5. **Cross-Platform State-Machine Mapping:** Mobile idle → scanning → verifying → verified → checking_in → checked_in / error. Web idle → scanning → processing → success / error.

**Files changed:** `apps/mobile/app/scanner.tsx`, `apps/mobile/hooks/useOrgEvents.ts`, `docs/todos/EDGE_CASES_TODOS.md`, `docs/fixes/MARCH_2026_FIXES.md`

### #362 — P8-3 PR Review: Access Codes future-only, org switching, timeout cleanup, nested Pressable, docs (Mar 9, 2026)

**Context:** PR review per Phase 8 PR Review Prompt. Four code fixes and two doc updates for the scanner.

**Fix (Access Codes — future events only):** The Manage Access Codes tab showed ALL events. Now filters to future/current events only via `filterActiveEvents()` from `@project-flame/lib` (events with `ends_at` > now). Past events are excluded since they don't need access codes.

**Fix (Org switching):** Changing org from the org-dashboard did not update events in the Access Codes tab because the scanner used `useOrgData()` (user's first org) instead of the dashboard's selected org. Now org-dashboard passes `orgId` as a route param when navigating to scanner (`router.push({ pathname: "/scanner", params: { orgId: effectiveOrgId } })`). Scanner uses `useLocalSearchParams()` to read `orgId` and passes it to `AccessCodesManagement`; when present, it overrides `useOrgData` so events reflect the selected org.

**Fix (Success timeout cleanup):** `onSuccess` in `updateEvent.mutate` used `setTimeout(() => setSuccess(""), 3000)` without cleanup, risking `setSuccess` on unmounted component. Store timeout id in `successTimeoutRef`, clear any existing timeout before creating a new one, add `useEffect` cleanup that clears the timeout on unmount.

**Fix (EventCodeRow nested Pressable):** The nested Pressable (copy button inside row Pressable) caused both `onSelect` and `onCopy` to fire because `e.stopPropagation` is unreliable in React Native. Fixed by removing nesting: the row is now a `View` with two sibling `Pressable`s — left (event name + date) for `onSelect`, right (code + copy icon) for `onCopy`. "No code set" area is also a `Pressable` calling `onSelect` so the full row remains selectable.

**Fix (MARCH_2026_FIXES #361):** Added `QRScannerModal.tsx` to the top-level Web source-of-truth list. Expanded the Web Parity Gate evidence block with explicit TicketDetailsDisplay reference, exact API endpoints, edge case enumeration (paid/free/promo/RSVP/cancellation), and cross-platform state-machine mapping. Added "copy the block below into the PR description before merge" instruction.

**Files changed:** `apps/mobile/app/scanner.tsx`, `apps/mobile/app/(tabs)/org-dashboard.tsx`, `docs/fixes/MARCH_2026_FIXES.md`

### #363 — Scanner: copyTimeoutRef cleanup for handleCopy (Mar 9, 2026)

**Context:** Nitpick — `handleCopy` used `setTimeout(() => setCopiedId(null), 2000)` without storing the timeout ID or cleaning up on unmount, inconsistent with `successTimeoutRef` pattern. Could call `setCopiedId` on unmounted component.

**Fix:** Added `copyTimeoutRef`, clear before assigning new timeout in `handleCopy`, clear in `useEffect` cleanup alongside `successTimeoutRef`.

**Files changed:** `apps/mobile/app/scanner.tsx`

### #364 — Scanner: handleChangeEvent race guard, isOrgResolved, access code shared lib, doc (Mar 9, 2026)

**Context:** Inline and nitpick comments from PR review.

**Fix (handleChangeEvent race guard):** `clearEventSession` could run while verify/check-in request was in flight, causing race with async responses. Added early return when `scannerState === "verifying"` or `"checking_in"` or `isCheckingIn`. Disabled the banner "Change" button visually during those states. Header's "Change Event" pill uses same guarded handler.

**Fix (isOrgResolved):** Tabs rendered before org was known when `effectiveOrgId` was null during useOrgData load, allowing empty/orgless state. Added `isOrgResolved = Boolean(paramOrgId) || !orgDataLoading`. When false, show loading spinner and block Access Codes tab and QR validation flow until resolved.

**Fix (#361 doc P8-3a):** Added superseded note: org resolution now uses route `orgId` first (from org-dashboard), falls back to `useOrgData`. Referenced OrgSelector, useUserOrgs, useOrgData.

**Fix (Access code shared lib — nitpick):** Replaced inline regex/sanitization with shared helpers from `@project-flame/lib`. Added `packages/lib/src/validators/access-code.ts`: `sanitizeAccessCodeInput()` (uppercase, strip non-A-Z0-9, max 8 chars), `validateAccessCode()` (4-8 A-Z0-9, returns `{ valid, error? }`). Updated AccessCodesManagement handleSave, TextInput onChangeText, and AccessCodeEntry handleSubmit/onChangeText to use these. Single source of truth for access code rules.

**Files changed:** `apps/mobile/app/scanner.tsx`, `packages/lib/src/validators/access-code.ts`, `packages/lib/src/validators/index.ts`, `packages/lib/src/index.ts`, `packages/lib/__tests__/validators.test.ts`, `docs/fixes/MARCH_2026_FIXES.md`

### #365 — Scanner: rename validateAccessCode from useQRScanner to avoid shadowing (Mar 9, 2026)

**Context:** Nitpick — the hook callback `validateAccessCode` from `useQRScanner` shadowed the imported `validateAccessCode` from `@project-flame/lib`.

**Fix:** Renamed the destructured value to `validateAccessCodeViaApi` when pulling from useQRScanner. Updated the single usage (AccessCodeEntry `onValidate` prop). The imported `validateAccessCode` (format validation) remains unambiguous in AccessCodesManagement and AccessCodeEntry.

**Files changed:** `apps/mobile/app/scanner.tsx`

### #366 — Scanner: Web Parity block update, isChangeEventDisabled, getTabBarPaddingBottom (Mar 9, 2026)

**Context:** Inline and nitpick comments from PR review.

**Fix (MARCH_2026_FIXES Web Parity Gate):** Added `sanitizeAccessCodeInput()` and `validateAccessCode()` from `@project-flame/lib` to bullet 3 alongside `filterActiveEvents()`. Noted that same shared lib is used for web/mobile parity.

**Fix (isChangeEventDisabled):** Extracted repeated disabled logic (scannerState verifying/checking_in, isCheckingIn) into `isChangeEventDisabled` variable above the active event banner JSX. Replaced duplicated expressions in Pressable's `disabled` prop and `style` opacity calculation.

**Fix (getTabBarPaddingBottom):** Replaced hardcoded `paddingBottom: 32` with `getTabBarPaddingBottom(insets.bottom)` in AccessCodesManagement ScrollView (via new `contentPaddingBottom` prop) and QR Scanner tab ScrollView. Content scrolls above the floating tab pill per design system.

**Files changed:** `apps/mobile/app/scanner.tsx`, `docs/fixes/MARCH_2026_FIXES.md`

### #367 — Scanner: processingRef reset in handleBarcodeScan (Mar 9, 2026)

**Context:** PR review — dedup protection using `processingRef` in `handleBarcodeScan` was never reset on early return (wrong event) or after verify completes, blocking further scans.

**Fix:** Moved wrong-event check before setting `processingRef.current = true`. Set `processingRef.current = true` immediately before the async verify. Added `finally` block to set `processingRef.current = false` after `verifyMutation.mutateAsync` completes (success or error). Preserved `lastScanRef` and all state updates (`setScannerState`, `setTicketDetails`, `setIsPromotionalTicket`, `setErrorMessage`).

**Files changed:** `apps/mobile/hooks/useQRScanner.ts`

### #368 — Scanner: confirmingRef guard for confirmCheckIn (Mar 9, 2026)

**Context:** PR review — no in-flight guard for `confirmCheckIn`; double-tap could trigger duplicate check-in requests.

**Fix:** Added `confirmingRef`; `confirmCheckIn` returns early if `confirmingRef.current` is true. Set `confirmingRef.current = true` before async request, reset in `finally` block. Reset `confirmingRef` in `resetScanner` so new sessions start clean.

**Files changed:** `apps/mobile/hooks/useQRScanner.ts`

### #369 — Scanner: isOrgResolved only when actual orgId exists, select-org state (Mar 9, 2026)

**Context:** PR review — `isOrgResolved` was true whenever `useOrgData` finished, even when `orgData.organizationId` was null, mounting tabs with empty/orgless state.

**Fix:** Introduced `isResolvingOrg = !paramOrgId && orgDataLoading` for loading state. Changed `isOrgResolved = Boolean(paramOrgId) || Boolean(orgData?.organizationId)` so tabs mount only when a real org id exists. Added "Select an Organization" state when `!effectiveOrgId` (no param, no org from useOrgData): icon, heading, helper text, Go Back. Replaced the previous single "loading" block with: (1) `isResolvingOrg` → loading spinner; (2) `!isOrgResolved` → select-org state; (3) `isOrgResolved` → tabs.

**Files changed:** `apps/mobile/app/scanner.tsx`

### #370 — Auth: Replace "FLAME" plain text with FlameLogo in white (Mar 9, 2026)

**Context:** P8-4a — The sign-in/sign-up screen rendered "FLAME" as a `FlameText` string. Every app uses its actual logo on auth screens, not plain text.

**Fix:** Swapped `FlameText "FLAME"` for `FlameLogo` SVG (`apps/mobile/components/FlameLogo.tsx`) at 140×32px, color `#FFFFFF`. Subtitle text unchanged.

**Files changed:** `apps/mobile/app/sign-in.tsx` — SignInContent (or child) renders `FlameLogo` instead of `FlameText`

### #371 — Auth: Proper email sign-up verification flow with OTP code input (Mar 9, 2026)

**Context:** P8-4b — `signUp.create()` returned a non-complete status and the app fell through to a generic "check your email, then sign in" message. This is not a proper Clerk mobile flow — custom UI needs explicit email verification via OTP code.

**Fix:** Full sign-up verification flow implemented per Clerk Expo docs:

1. Added `firstName` and `lastName` fields to the sign-up form (`CredentialsForm`) — rendered as a side-by-side row in sign-up mode only.
2. `onEmailSignUp` now calls `signUp.create({ emailAddress, password, firstName, lastName })` followed by `signUp.prepareEmailAddressVerification({ strategy: "email_code" })`, then sets `pendingVerification = true`.
3. New `VerificationCodeInput` component renders a 6-digit OTP input with auto-focus, auto-advance, paste support, and a back button.
4. `onVerifyCode(code)` calls `signUp.attemptEmailAddressVerification({ code })` → `setActive({ session })` → `sync-current-user` → `router.replace("/")`.
5. `cancelVerification` exposed to let users go back from verification to the sign-up form.
6. Hook interface updated to accept `firstName`/`lastName` and return `onVerifyCode`, `cancelVerification`, `pendingVerification`, `isRedirecting`.

**Files changed:** `apps/mobile/hooks/useSignInHandlers.ts`, `apps/mobile/app/sign-in.tsx`, `apps/mobile/components/sign-in/CredentialsForm.tsx`, `apps/mobile/components/sign-in/VerificationCodeInput.tsx` (new)

### #372 — Auth: Fix post-login flash with isRedirecting state (Mar 9, 2026) — superseded by #374

**Context:** P8-4c — After successful sign-in/sign-up, the user briefly saw the sign-in form before being redirected to home, causing a visual glitch.

**Fix:** Added `isRedirecting` state to `useSignInHandlers`. Set to `true` immediately after `setActive()` completes in all three auth paths (Google SSO, email sign-in, email verification). When `isRedirecting` is true, `SignInContent` rendered a full-screen overlay with the Flame logo and a loading spinner.

**Note:** Superseded by #374. The redirect overlay implementation moved from `SignInContent` to `RoleResolutionGate` via `AuthRedirectContext`, so it persists across navigation until the destination tab gains focus. The final implementation lives in `RoleResolutionGate`; earlier partial changes in `useSignInHandlers` and `sign-in.tsx` were intermediate steps.

### #373 — Auth: isRedirecting reset in finally — REVERTED (Mar 9, 2026)

**Context:** PR review suggested clearing `isRedirecting` in finally. Later review found Expo Router's `router.replace()` returns void (synchronous); awaiting it and clearing in finally runs immediately, reintroducing the post-login form flash.

### #374 — Auth: Global isAuthRedirecting + destination cleanup (Mar 9, 2026)

**Context:** Revert #373's await/finally pattern. `router.replace("/")` is synchronous — clearing in finally ran before navigation completed, causing form flash. Move redirect state to global context; clear in destination screen lifecycle.

**Fix:** (1) Added `AuthRedirectContext` with `isAuthRedirecting` and `setAuthRedirecting`. (2) `useSignInHandlers` sets `setAuthRedirecting(true)` in `completeAuthAndRedirect` before sync; callers invoke `router.replace("/")` (no await) on success. (3) Overlay is persisted in `RoleResolutionGate` (remains visible across navigation until destination mounts). (4) Cleanup happens in the destination screen lifecycle: Home screen `useFocusEffect` calls `setAuthRedirecting(false)` when the tab gains focus — not in any caller-side finally block in `useSignInHandlers`. Spinner stays visible until Home mounts and explicitly clears.

**Files changed:** `apps/mobile/contexts/AuthRedirectContext.tsx` (new), `apps/mobile/app/_layout.tsx`, `apps/mobile/components/navigation/RoleResolutionGate.tsx`, `apps/mobile/hooks/useSignInHandlers.ts`, `apps/mobile/app/sign-in.tsx`, `apps/mobile/app/(tabs)/index.tsx`

### #375 — PR review: CredentialsForm optional props for sign-in-only compatibility (Mar 9, 2026)

**Context:** CredentialsForm required firstName, lastName, showPassword, error, loading, onFirstNameChange, onLastNameChange even for sign-in-only callers, breaking backward compatibility.

**Fix:** Made these props optional with safe defaults: `firstName=""`, `lastName=""`, `showPassword=false`, `error=""`, `loading=false`, `onFirstNameChange=()=>{}`, `onLastNameChange=()=>{}`.

**Files changed:** `apps/mobile/components/sign-in/CredentialsForm.tsx`

### #376 — PR review: VerificationCodeInput paste from any cell + disable back when loading (Mar 9, 2026)

**Context:** Multi-char paste only worked on the first cell due to `maxLength={1}` on other cells. cancelVerification could race with in-flight verification.

**Fix:** (1) Set `maxLength={CODE_LENGTH}` on all cells; `handleChange` distributes pasted characters starting at the focused index. (2) Disabled the back Pressable when `loading` is true. (3) Replaced inline margin style with `className="mb-4"` wrapper per design tokens.

**Files changed:** `apps/mobile/components/sign-in/VerificationCodeInput.tsx`

### #377 — PR review: onVerifyCode 6-digit validation + cancelVerification no-op when loading (Mar 9, 2026)

**Context:** onVerifyCode did not validate 6-digit numeric format; cancelVerification could race with active verification.

**Fix:** (1) onVerifyCode validates digits-only, length 6, before calling `attemptEmailAddressVerification`; shows "Please enter the 6-digit verification code." if invalid. (2) cancelVerification is a no-op when `loading` is true.

**Files changed:** `apps/mobile/hooks/useSignInHandlers.ts`

### #378 — PR review: onEmailSignUp handle result.status === "complete" (no verification) (Mar 9, 2026)

**Context:** When Clerk is configured without mandatory email verification, `signUp.create()` returns `status === "complete"` with `createdSessionId`, but the code unconditionally called `prepareEmailAddressVerification`, never activating the session.

**Fix:** After `signUp.create()`, check `result.status === "complete"`; if so, call `setActive`, sync, `router.replace("/")` and return. Otherwise proceed with `prepareEmailAddressVerification`.

**Files changed:** `apps/mobile/hooks/useSignInHandlers.ts`

### #379 — PR review: Auth redirect overlay timeout fallback (Mar 9, 2026)

**Context:** `setAuthRedirecting(true)` with no timeout; if Home never gains focus (unexpected route, ViewModeContext.isLoading stuck), the overlay stays permanently.

**Fix:** Added 15s timeout fallback in `AuthRedirectProvider`: when `setAuthRedirecting(true)` is called, start a 15s timer that clears the overlay; cleared when `setAuthRedirecting(false)` runs (e.g. from Home useFocusEffect).

**Files changed:** `apps/mobile/contexts/AuthRedirectContext.tsx`

### #380 — Auth: Flame logo white (Mar 9, 2026)

**Context:** Flame logo rendered in red (`#FF0000`); design requires white on dark backgrounds.

**Fix:** Outcome: `FlameLogo` is rendered at 140×32px in white (`#FFFFFF`). The white logo applies to the sign-in screen and the redirect overlay (`RoleResolutionGate.tsx`).

**Files changed:** `apps/mobile/app/sign-in.tsx`, `apps/mobile/components/navigation/RoleResolutionGate.tsx`

### #381 — Changelog: #372 superseded note, #370/#380 file list, #374 parity (resolveDbUserFromClerkId) (Mar 9, 2026)

**Context:** PR review requested changelog accuracy: #372 superseded by #374; #370/#380 file lists; parity section canonical helper name.

**Fix:** (1) #372: added "superseded by #374" to heading; overlay implementation moved from SignInContent to RoleResolutionGate. (2) #370 and #380: file list finalized as `apps/mobile/app/sign-in.tsx`, `apps/mobile/components/navigation/RoleResolutionGate.tsx` (FlameLogo white outcome). (3) #374 parity: use `resolveDbUserFromClerkId` as canonical web helper (removed getOrCreateSupabaseUser); added expected PR requirements (Web Parity Gate 9.1).

**Files changed:** `docs/fixes/MARCH_2026_FIXES.md`

### #382 — PR review: Changelog #370/#380 consolidation, VerificationCodeInput allFilled, setAuthRedirecting deps (Mar 9, 2026)

**Context:** Duplicate comments requested (1) #370/#380 not claim BrandingHeader.tsx unless in PR; describe FlameLogo 140×32px white outcome. (2) VerificationCodeInput auto-verify could fire with empty slots — ensure all entries filled before onVerify. (3) setAuthRedirecting missing from dependency arrays for onGoogleAuth, onEmailSignIn, onVerifyCode.

**Fix:** (1) #370 and #380: rewrote to describe outcome (FlameLogo white) without attributing to BrandingHeader unless modified; files changed: `sign-in.tsx`, `RoleResolutionGate.tsx`. (2) VerificationCodeInput: replace `code.length === CODE_LENGTH` with `newDigits.length === CODE_LENGTH && newDigits.every(d => d && /\d/.test(d))` before onVerify in both paste and single-char paths. (3) Added `setAuthRedirecting` to dependency arrays of onGoogleAuth, onEmailSignIn, onVerifyCode.

**Files changed:** `docs/fixes/MARCH_2026_FIXES.md`, `apps/mobile/components/sign-in/VerificationCodeInput.tsx`, `apps/mobile/hooks/useSignInHandlers.ts`

### #383 — PR review: handleChange transition-to-completion, paste focus, error tokens, firstName/lastName optional, web parity (Mar 9, 2026)

**Context:** (1) handleChange called onVerify whenever all filled, causing re-submits when user corrects; paste focused wrong cell. (2) VerificationCodeInput error UI hardcoded colors. (3) UseSignInHandlersOptions firstName/lastName required; sign-in-only callers need optional. (4) PR missing web-parity evidence.

**Fix:** (1) VerificationCodeInput: compute `previouslyAllFilled` from digits; only call onVerify when `!previouslyAllFilled && allFilled` (transition to completion). Paste branch: focus first empty cell via `findIndex(d => !d)` or CODE_LENGTH-1. (2) Added `error` token (#EA3370) to packages/ui tailwind + colors.ts; VerificationCodeInput uses `bg-error/10` and `text-error`. (3) UseSignInHandlersOptions: firstName?, lastName?; onEmailSignUp validates with optional chaining. (4) Web Parity Gate: expanded with explicit web source refs, API parity table, calculation parity (trim/regex), edge-case verification table, cross-platform checklist, tests run.

**Files changed:** `apps/mobile/components/sign-in/VerificationCodeInput.tsx`, `apps/mobile/hooks/useSignInHandlers.ts`, `packages/ui/tailwind.config.js`, `packages/ui/src/theme/colors.ts`, `docs/fixes/MARCH_2026_FIXES.md`

### #384 — PR review: Web Parity Gate copy instruction, #381 changelog cleanup, completeAuthAndRedirect (Mar 9, 2026)

**Context:** (1) PR description must include Web Parity Gate; add copy instruction. (2) #381 changelog referenced BrandingHeader, packages/ui, getOrCreateSupabaseUser; simplify to verify-against-PR and resolveDbUserFromClerkId only. (3) Nitpick: extract repeated setAuthRedirecting → apiPost → router.replace into helper.

**Fix:** (1) Added "COPY THE FOLLOWING SECTION INTO THE PR DESCRIPTION BEFORE MERGE" to Web Parity Gate; removed getOrCreateSupabaseUser from Auth helpers table. (2) #381: rewrote Context/Fix to only reference auth files in PR modified-file list; resolveDbUserFromClerkId canonical; overlay/RoleResolutionGate note preserved. (3) Extracted `completeAuthAndRedirect(handler)` helper in useSignInHandlers; replaced four duplicated blocks in onGoogleAuth, onEmailSignIn, onEmailSignUp, onVerifyCode; useCallback with getToken, router, setAuthRedirecting.

**Files changed:** `docs/fixes/MARCH_2026_FIXES.md`, `apps/mobile/hooks/useSignInHandlers.ts`

### #385 — PR review: completeAuthAndRedirect stop masking sync errors, caller handles redirect (Mar 9, 2026)

**Context:** `completeAuthAndRedirect` swallowed sync errors from `apiPost("/api/auth/sync-current-user", ...)` and always called `router.replace("/")`, masking failures.

**Fix:** (1) `completeAuthAndRedirect` keeps `setAuthRedirecting(true)` at start; `await apiPost` inside try/catch; on catch, log (syncErr → Error) and rethrow; removed `router.replace("/")` from helper. (2) Callers await `completeAuthAndRedirect`, then call `router.replace("/")` on success (no await). Overlay cleanup is in the destination screen lifecycle: Home `useFocusEffect` calls `setAuthRedirecting(false)` when the tab gains focus. On error paths (sync throws), callers catch and surface the error to the user.

**Files changed:** `apps/mobile/hooks/useSignInHandlers.ts`

---

## Phase 8 Auth PR — Required PR Description Content

**REQUIRED: Copy the entire block below verbatim into your Phase 8 Auth PR description on GitHub before requesting review or merge.** Reviewers will verify Sections 1–5 are present.

---

## Web Parity Gate (Auth #370–#374 — add to PR description before merge)

**COPY THE FOLLOWING SECTION INTO THE PR DESCRIPTION BEFORE MERGE.** Ensure each required subsection (1–5) is present verbatim or clearly represented.

### 1. Web Source References (required)

| Flow                     | Web file                                                                                                                     | Mobile equivalent                                                                                              |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Auth UI                  | `apps/web/app/sign-in/[[...sign-in]]/page.tsx` (`<SignIn />`), `apps/web/app/sign-up/[[...sign-up]]/page.tsx` (`<SignUp />`) | `SignInContent`, `CredentialsForm`, `VerificationCodeInput`, `BrandingHeader` in `apps/mobile/app/sign-in.tsx` |
| Email sign-up handler    | Clerk `<SignUp />` internal — `signUp.create`, `prepareEmailAddressVerification`, `attemptEmailAddressVerification`          | `onEmailSignUp` in `useSignInHandlers.ts`                                                                      |
| OTP verification handler | Clerk internal                                                                                                               | `onVerifyCode` in `useSignInHandlers.ts`                                                                       |
| User sync                | `apps/web/app/api/auth/sync-current-user/route.ts` (web does not call on sign-in; JIT via other routes)                      | `apiPost("/api/auth/sync-current-user", {}, getToken)` after `setActive()`                                     |
| Auth helpers             | `apps/web/app/lib/auth.ts` (`resolveDbUserFromClerkId`)                                                                      | N/A — mobile calls sync route                                                                                  |

### 2. API Parity Evidence (identical request/response shapes)

| API                                      | Request shape                                     | Response / behavior                                              |
| ---------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------- |
| `signUp.create`                          | `{ emailAddress, password, firstName, lastName }` | `{ status, createdSessionId }` — both use same Clerk SDK         |
| `signUp.prepareEmailAddressVerification` | `{ strategy: "email_code" }`                      | Sends OTP email — same                                           |
| `signUp.attemptEmailAddressVerification` | `{ code: digitsOnly }`                            | `{ status, createdSessionId }` — same                            |
| `setSignUpActive`                        | `{ session: createdSessionId }`                   | Activates session — same                                         |
| `POST /api/auth/sync-current-user`       | `{}` + Bearer token                               | `{ success, user }` or error; both upsert on `clerk_id` conflict |

### 3. Calculation Parity Evidence (shared-lib / validation)

- **firstName/lastName/email/password:** Mobile validates with `trim()` and presence checks; web Clerk components handle internally. No shared `@project-flame/lib` validator for auth (lib has `validateCedula`, `validateAndParseQuantity` for checkout, not auth).
- **6-digit OTP normalization:** Mobile uses `code.replace(/\D/g, "")` + `length === 6` in `onVerifyCode`; equivalent to digits-only extraction. Clerk accepts numeric string.

### 4. Edge-Case Verification (paid/free/promo/RSVP/cancellation)

| Scenario                                 | onEmailSignUp / onVerifyCode behavior                                                                                          |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Paid purchase                            | N/A — checkout flow                                                                                                            |
| Free purchase                            | N/A — checkout flow                                                                                                            |
| Promo / 100% discount                    | N/A — checkout flow                                                                                                            |
| RSVP flow                                | N/A — checkout flow                                                                                                            |
| Payment cancellation                     | N/A — checkout flow                                                                                                            |
| Email sign-up (no verification required) | `signUp.create` returns `status === "complete"` → `setSignUpActive` → sync → `router.replace("/")`                             |
| Email sign-up (verification required)    | `prepareEmailAddressVerification` → OTP input → `attemptEmailAddressVerification` → `setActive` → sync → `router.replace("/")` |
| Wrong OTP                                | `attemptEmailAddressVerification` throws → `setError(...)`                                                                     |
| Cancel verification                      | `cancelVerification` → `setPendingVerification(false)`                                                                         |

**Web source files:** `apps/web/app/sign-in/[[...sign-in]]/page.tsx`, `apps/web/app/sign-up/[[...sign-up]]/page.tsx`, `apps/web/app/api/auth/sync-current-user/route.ts`, `apps/web/app/lib/auth.ts` (`resolveDbUserFromClerkId`).

### 5. Cross-Platform Behavior Checklist

- [ ] **Redirect:** `router.replace("/")` after sync — both platforms navigate away from auth screen
- [ ] **Session activation:** `setActive({ session })` before sync — same Clerk API
- [ ] **apiPost sync:** `POST /api/auth/sync-current-user` with Bearer token — same route, same upsert
- [ ] **Overlay:** `setAuthRedirecting(true)` before sync; `router.replace("/")` in caller on success (no await); overlay persisted in RoleResolutionGate; `setAuthRedirecting(false)` in Home screen `useFocusEffect` when tab gains focus (#374, #385)

### Tests / Assertions Run

1. Email sign-up with verification → OTP screen → correct code → redirect to home
2. Email sign-up without verification (if configured) → immediate redirect
3. Wrong OTP → error message, no redirect
4. Cancel verification → back to sign-up form
5. Google OAuth → redirect to home after sync

---

### #386 — P8-5a: Edit existing tiers (Mar 9, 2026) **[Phase 8 / Event Mgmt P8-5]** — superseded by #392

**Branch:** `p8-event-mgmt`

**Web source:** `apps/web/app/api/ticket-tiers/route.ts` (lines 50–61 `updateTierSchema`, lines 326–596 PATCH handler)

**Problem:** `ExistingTierCard` in `EditTiersTab` was read-only — organizers could not edit tier properties after creation.

**Fix:**

1. **useTierMutations.ts** — Re-added `useUpdateTier` hook and `UpdateTierInput` interface (removed as dead code in #248b). Hook calls `PATCH /api/ticket-tiers` via `apiPatch` with same request body shape as web.
2. **EditTiersTab.tsx → ExistingTierCard** — Edit toggle (pencil icon) opens inline edit mode. Symbols: `handleStartEdit`, `handleSaveEdit`, `handleCancelEdit`, `editName`, `editPrice`, etc.
3. **Edit mode rules** — **#392 authoritative:** full editing regardless of sales; only deletion blocked for sold tiers. Quantity cannot go below sold count. `DateTimePickerField` for sale start/end with `eventTimezone` prop.
4. **Add New Tier form** — Replaced raw ISO inputs with `DateTimePickerField`; `localToUtc` for date conversion.
5. **Price display** — Uses `formatCentsAsPrice(tier.price_cents, eventCurrency)` from `@project-flame/lib` instead of hardcoded `$`.

**Files changed:**

- `apps/mobile/hooks/useTierMutations.ts` — `useUpdateTier`, `UpdateTierInput`
- `apps/mobile/components/events-management/EditTiersTab.tsx` — `ExistingTierCard` edit toggle, `DateTimePickerField`, `eventTimezone`, `eventCurrency`, `formatCentsAsPrice`

---

### #387 — P8-5b: Clickable links in event/tier descriptions (Mar 9, 2026) **[Phase 8 / Event Mgmt P8-5]**

**Problem:** URLs and Instagram handles in event/tier descriptions were plain text — not tappable.

**Fix:** Created `LinkableText` component (`apps/mobile/components/LinkableText.tsx`) that:

- Detects URLs (`https?://...`) and Instagram handles (`@username`) via regex; trims trailing punctuation from URL matches (#397)
- Renders detected links as tappable `<Text>` with underline + blue color; opens via `Linking.openURL()`
- Instagram handles open `https://instagram.com/{handle}`; falls back to plain `<Text>` when no links detected

**Applied to (consumers):**

- `apps/mobile/components/event-details/EventHero.tsx` — event description on event detail page
- `apps/mobile/components/events-management/EditEventDetailsTab.tsx` — event description in read-only edit view
- `apps/mobile/components/org-dashboard/OrgEventInfoCard.tsx` — event description in org dashboard

**Files changed:**

- `apps/mobile/components/LinkableText.tsx` (new)
- `apps/mobile/components/event-details/EventHero.tsx`
- `apps/mobile/components/events-management/EditEventDetailsTab.tsx`
- `apps/mobile/components/org-dashboard/OrgEventInfoCard.tsx`

---

### #388 — P8-5c: Image picker 3:4 aspect ratio (Mar 9, 2026) **[Phase 8 / Event Mgmt P8-5]** — superseded by #393, then #397

**Problem:** `ImagePicker.launchImageLibraryAsync` used free crop — event images had inconsistent aspect ratios.

**Fix:** Added `aspect: [3, 4]` to `ImagePicker.launchImageLibraryAsync` options in `EventDetailsTab`, enforcing 3:4 crop ratio for event images.

**Files changed:** `apps/mobile/components/create-event/EventDetailsTab.tsx`

---

### #389 — P8-5d: Fix create event bug — timezone-aware date conversion (Mar 9, 2026) **[Phase 8 / Event Mgmt P8-5]**

**Problem:** `handleSubmit` in `create-event.tsx` used `ecuadorLocalToUtc()` (hardcoded to America/Guayaquil) for ALL date conversions — event start/end and tier sale start/end. When a user selected a non-Ecuador timezone (e.g., for EUR events in Europe/Madrid), dates were converted incorrectly, causing server-side validation failures (dates in wrong range, end before start, etc.).

**Root cause:** The `ecuadorLocalToUtc` function was used before timezone support was added. After #305/#306 introduced currency/timezone pickers, the conversion logic was never updated to use the selected timezone.

**Fix:**

1. Replaced `ecuadorLocalToUtc` with `localToUtc(value, tz)` in `handleSubmit` for event dates and tier sale dates.
2. Added `currency` and `timezone` fields to `CreateEventInput` interface (were missing; passed via `as unknown` cast).
3. Updated `EditableTierCard` to use `localToUtc(value, tz)` instead of `ecuadorLocalToUtc` for sale end minimum date.
4. Threaded `eventTimezone` prop through `TicketTiersTab` → `EditableTierCard` → `DateTimePickerField`.

**Files changed:**

- `apps/mobile/app/(tabs)/create-event.tsx`
- `apps/mobile/hooks/useCreateEvent.ts`
- `apps/mobile/components/create-event/EditableTierCard.tsx`
- `apps/mobile/components/create-event/TicketTiersTab.tsx`

---

### #390 — P8-5f: Icons next to tier fields (Mar 9, 2026) **[Phase 8 / Event Mgmt P8-5]**

**Problem:** Tier form fields (name, quantity, price) had no visual icons — users couldn't quickly identify each field.

**Fix:** Added Ionicons to all tier-related form fields:

- Tier name: `pricetag-outline`
- Total quantity: `layers-outline`
- Price: `cash-outline`
- Per-user limit: `person-outline`
- Stage name: `pricetag-outline`
- Stage price: `cash-outline`
- Stage quantity: `layers-outline`

Applied to both create event flow (`EditableTierCard`) and edit event flow (`EditTiersTab` new tier form + edit form).

**Files changed:**

- `apps/mobile/components/create-event/EditableTierCard.tsx` — added `icon` prop to `FormInput`, added icons
- `apps/mobile/components/events-management/EditTiersTab.tsx` — icons in add/edit forms

---

### #391 — P8-5g: Promo code % dropdown (Mar 9, 2026) **[Phase 8 / Event Mgmt P8-5]**

**Web source:** `apps/web/app/components/PromotionsSection.tsx` (lines 1155–1168, `<select>` with `Array.from({ length: 20 }, (_, i) => (i + 1) * 5)`)

**Problem:** Discount percentage in `OrgPromotionsCard` was a free-text `TextInput` — users could enter any value, including non-multiples of 5.

**Fix:** Replaced `TextInput` with a picker showing 5%, 10%, 15%... 100% (20 options in steps of 5, matching web's `<select>`):

- iOS: `ActionSheetIOS` with 20 options + Cancel
- Android: Custom `Modal` with scrollable list and checkmark indicator
- Default value: 10% (most common)
- Validation unchanged: 5–100 in increments of 5
- Also fixed "Create" button text using `style={{ color }}` per FlameText gotcha rule

**Files changed:** `apps/mobile/components/org-dashboard/OrgPromotionsCard.tsx`

---

### #392 — P8-5a fix: Full tier edit regardless of sales (Mar 10, 2026)

**Problem:** Mobile restricted tier editing to "description only" when `quantity_sold > 0`. Web allows full edit of tier name, per-user limit, price, quantity, sales start/end regardless of sales — only deletion is blocked.

**Fix:** Removed `hasSales`-based field restrictions. All tier fields are now editable when tier has sold tickets. Added client-side validation: quantity cannot be reduced below `quantity_sold` (API enforces same). Updated warning text: "Quantity cannot be reduced below sold count." Updated help text: "Tiers with sold tickets cannot be deleted but can be edited (quantity cannot go below sold count)."

**Files changed:** `apps/mobile/components/events-management/EditTiersTab.tsx`

---

### #393 — P8-5c fix: Image picker 1:1 + event management image edit (Mar 10, 2026) — superseded by #397 for aspect ratio

**Problem:** (1) EditEventDetailsTab displayed event image read-only with no way to change it. (2) After #388 initial implementation (3:4 crop), images showed blank spaces on the sides — user prefers crop matching preview.

**Fix:**

1. **Image picker:** 1:1 selection (`aspect: [1, 1]`); post-pick resize to fit width (600px max) while preserving aspect ratio. **#397 updates to 3:2 to match preview frame.**
2. **Display:** `contentFit="cover"` so image fills the container with no blank spaces (matches EventCard, EventListCard on homepage/discover).
3. **Event management image edit:** Added image picker to EditEventDetailsTab: tappable image area or "Tap to add image" when empty; upload via `/api/upload-image`, PATCH event with `image_url`.

**Files changed:** `apps/mobile/components/create-event/EventDetailsTab.tsx`, `apps/mobile/components/events-management/EditEventDetailsTab.tsx`

---

### #394 — Event image not showing after creation until refresh (Mar 10, 2026)

**Problem:** After creating an event with image, navigating to home showed "No IMG" where the image should be. Image appeared only after pull-to-refresh.

**Root cause:** `useCreateEvent` invalidates `["events"]` on success, but that fires when the event is created (before image upload). Image is uploaded and PATCHed separately; no second invalidation ran after PATCH, so cached events stayed stale (no image).

**Fix:** In create-event flow, after successful `apiPatch` of `image_url`, call `queryClient.invalidateQueries({ queryKey: ["events"] })` and `queryClient.invalidateQueries({ queryKey: ["org-events"] })` so home and org dashboard refetch with the updated event.

**Files changed:** `apps/mobile/app/(tabs)/create-event.tsx`

---

### #395 — Editable event description in event management (Mar 10, 2026)

**Problem:** EditEventDetailsTab displayed event description read-only (via LinkableText) with no way to edit it. P8-5 event management criteria require description to be editable.

**Fix:**

1. **Web API:** Added `description` to `updateEventSchema` in `PATCH /api/events` — `z.string().max(520).optional().or(z.literal(""))` (matches CreateEventForm maxLength). Update logic writes `description || null` to clear.
2. **Mobile:** Added `description` to `UpdateEventInput` in useUpdateEvent. EditEventDetailsTab now has editable multiline TextInput (max 520 chars, char counter) when !readOnly; readOnly mode shows LinkableText or "No description". Included in handleSave changes.
3. **Web parity:** CreateEventForm uses 520 max; API enforces same.

**Files changed:** `apps/web/app/api/events/route.ts`, `apps/mobile/hooks/useUpdateEvent.ts`, `apps/mobile/components/events-management/EditEventDetailsTab.tsx`

---

### #396 — Image upload loading state in event management (Mar 10, 2026)

**Problem:** When changing event image, user selects new image but sees old image for several seconds with no feedback until "image updated successfully" alert.

**Fix:** Added `isUploadingImage` state. During upload (after image selection, through apiUploadFormData + PATCH): (1) image-with-event: semi-transparent overlay with ActivityIndicator + "Updating image..."; (2) empty state: spinner + "Updating image..." in add-image area. Pressable disabled during upload. "Change image" button hidden while loading.

**Files changed:** `apps/mobile/components/events-management/EditEventDetailsTab.tsx`

---

### #397 — Phase 8 PR review: Image picker, validation, Modal, LinkableText, docs (Mar 10, 2026)

**Context:** Phase 8 PR review findings — verify against current code and fix where needed.

**Fixes:**

1. **Image picker aspect ratio:** Changed `aspect: [1, 1]` to `aspect: [3, 2]` in `EventDetailsTab` and `EditEventDetailsTab` so picker crop matches preview (`aspect-[3/2]` + `contentFit="cover"`). #393 had 1:1; 3:2 matches the create-flow preview frame.
2. **Image manipulation:** Skip `ImageManipulator.manipulateAsync` when `origW <= 600` (use `asset.uri` directly). When resizing, preserve original format (infer from URI extension → SaveFormat.PNG/WEBP/JPEG) instead of always JPEG.
3. **EditEventDetailsTab upload:** FormData now uses correct `type` and `name` based on preserved format (image/jpeg, image/png, image/webp).
4. **EditEventDetailsTab localToUtc:** Fail-fast guard — if `startsAtLocal` or `endsAtLocal` is non-empty but `localToUtc` returns `""`, show Alert and return before applying changes.
5. **EditEventDetailsTab description:** Send `""` instead of `null` when clearing (server schema `z.string().max(520).optional().or(z.literal(""))` accepts `""` to clear; `null` causes 400).
6. **EditTiersTab placeholder:** Price placeholder uses `event.currency` (e.g. `Price (EUR, e.g. 25.00)`) instead of hardcoded "USD".
7. **EditTiersTab sales window:** Both edit and create paths validate `sales_end > sales_start` before saving; reject inverted windows with Alert.
8. **LinkableText:** Trim trailing punctuation (.,;:!?)]}) from URL matches so `https://example.com.` links to `https://example.com` and display text is correct.
9. **OrgPromotionsCard:** Added `onRequestClose={() => setShowDiscountPicker(false)}` to Android Modal so hardware back button dismisses it.
10. **Changelog:** Updated #386 (superseded by #392), #388/#393 (superseded by #397 for aspect); finalized #370/#380 file list (sign-in.tsx, RoleResolutionGate.tsx).

**Files changed:**

- `apps/mobile/components/create-event/EventDetailsTab.tsx`
- `apps/mobile/components/events-management/EditEventDetailsTab.tsx`
- `apps/mobile/components/events-management/EditTiersTab.tsx`
- `apps/mobile/components/LinkableText.tsx`
- `apps/mobile/components/org-dashboard/OrgPromotionsCard.tsx`
- `docs/fixes/MARCH_2026_FIXES.md`

---

### #398 — Phase 8 PR review (round 2): Currency formatting, GIF, docs, colors (Mar 10, 2026)

**Context:** Phase 8 PR review — verify and fix where needed.

**Fixes:**

1. **EditTiersTab currency display:** Replaced hardcoded `$` with `formatCentsAsPrice(tier.price_cents, eventCurrency)` and `formatCentsAsPrice(stage.price_cents, eventCurrency)` from `@project-flame/lib` so tier and stage prices use correct currency symbol/placement for non-USD events.
2. **SUPPORTED_TYPES / GIF:** Removed "GIF" from `SUPPORTED_TYPES` in `EventDetailsTab` and `EditEventDetailsTab`. `inferSaveFormat` lacks GIF branch (expo-image-manipulator has no SaveFormat.GIF); GIF would be re-encoded to JPEG and lose animation. Copy now matches actual behavior (JPEG, PNG, WEBP only).
3. **OrgPromotionsCard:** Replaced hardcoded `#041C2B` with `colors.dark` from `@project-flame/ui` for Create button label and ActivityIndicator on white background.
4. **Web Parity Gate:** Expanded with LinkableText, image upload/refresh, useUpdateEvent, useCreateEvent, TicketTiersTab/EditableTierCard, and paid/free/promo/RSVP/cancellation edge-case section (N/A where appropriate). Updated #370, #386, #387 changelog entries for precise file/symbol references.

**Files changed:**

- `apps/mobile/components/events-management/EditTiersTab.tsx`
- `apps/mobile/components/events-management/EditEventDetailsTab.tsx`
- `apps/mobile/components/create-event/EventDetailsTab.tsx`
- `apps/mobile/components/org-dashboard/OrgPromotionsCard.tsx`
- `docs/fixes/MARCH_2026_FIXES.md`

---

### #399 — Phase 8 PR review (round 3): Web parity checklist, logging, HEIC/GIF, timezone, promo picker (Mar 10, 2026)

**Context:** Phase 8 PR review triage per `project-flame-master.mdc` Section 2.

**Fixes:**

1. **EditEventDetailsTab:** Added Web Parity Gate checklist to file header (web source: `apps/web/app/api/events/route.ts` PATCH; API/mutation details; edge cases). Added structured `console.error` logging in catch blocks (upload image, update event details) with `eventId`, `eventSlug`, `action`, `error`.
2. **EditEventDetailsTab inferSaveFormat:** Use asset metadata (`fileName`, `mimeType`) when available; for HEIC/GIF/unknown extension, force conversion via `manipulateAsync` so FormData Content-Type matches bytes. Added `needsConversion()` helper; HEIC/GIF/nameless URIs now convert to JPEG before upload.
3. **OrgPromotionsCard:** Call `setShowDiscountPicker(false)` on all reset sites — success handler and Cancel button — so discount modal cannot remain open during `createPromoCode.isPending`.
4. **EventDetailsTab (create-event):** Pass `timezone={tz}` to both `DateTimePickerField` instances so minStartDate, localToUtc conversions, and user selections use the selected event timezone.
5. **Deferred:** EditTiersTab icon-button accessibility → ACCESSIBILITY_TODOS.md. EditTiersTab catch logging, tier parsing extract, OrgPromotionsCard DISCOUNT_OPTIONS extract, interaction tests, timezone fallback → NITPICKS_TODOS.md. NITPICKS_TODOS OrgPromotionsCard entry reformatted per spec.

**Files changed:**

- `apps/mobile/components/events-management/EditEventDetailsTab.tsx`
- `apps/mobile/components/create-event/EventDetailsTab.tsx`
- `apps/mobile/components/org-dashboard/OrgPromotionsCard.tsx`
- `docs/todos/ACCESSIBILITY_TODOS.md`
- `docs/todos/NITPICKS_TODOS.md`
- `docs/fixes/MARCH_2026_FIXES.md`

---

### #400 — Phase 8 PR review (round 4): HEIC/GIF catch rethrow, parity evidence, changelog cleanup (Mar 10, 2026)

**Context:** PR review triage — verify and fix where needed.

**Fixes:**

1. **EditEventDetailsTab catch block:** When `mustConvert` (HEIC/GIF/unknown) and `manipulateAsync` throws, rethrow the error instead of falling back to `asset.uri` + JPEG — the fallback would send unconverted bytes with mismatched `image/jpeg` Content-Type. When `!mustConvert`, keep fallback: `finalUri = asset.uri`, `saveFormat = inferSaveFormat(asset.uri, ...)`.
2. **OrgPromotionsCard parity evidence:** Added required parity block to Web Parity Gate — web source refs, API/calculation parity, edge-case verification, cross-platform behavior (ActionSheetIOS + Modal). NITPICKS_TODOS entry updated to reference MARCH_2026_FIXES for merge-blocking evidence.
3. **#381/#382 changelog:** Removed "verify against PR" placeholder; replaced with final file list for #370/#380: `sign-in.tsx`, `RoleResolutionGate.tsx`. #397 entry updated to match.
4. **P8-5 changelog:** Added explicit "Files changed in P8-5 batch" and "Symbols/components altered" lists; added deleted-tier-with-sales to edge-case table; OrgPromotionsCard parity block inlined.

**Files changed:**

- `apps/mobile/components/events-management/EditEventDetailsTab.tsx`
- `docs/fixes/MARCH_2026_FIXES.md`
- `docs/todos/NITPICKS_TODOS.md`

---

### #401 — Phase 8 PR review (round 5): OrgPromotionsCard parity evidence, P8-5 create vs edit flow clarity (Mar 10, 2026)

**Context:** PR review — parity evidence and changelog accuracy.

**Fixes:**

1. **OrgPromotionsCard parity evidence:** NITPICKS_TODOS entry expanded with full 5-point checklist for PR description (web source, API parity, calculation parity, edge-case verification, cross-platform behavior including `showDiscountSelector` branches). MARCH_2026_FIXES OrgPromotionsCard block marked "copy into PR" with same 5 points.
2. **P8-5 changelog structure:** Split "Files changed" into create flow (EditableTierCard.tsx, TicketTiersTab.tsx, create-event.tsx, useCreateEvent.ts, EventDetailsTab.tsx), edit flow (EditTiersTab.tsx, ExistingTierCard, useTierMutations.ts), and shared. Symbols list now explicitly attributes DateTimePickerField and formatCentsAsPrice to both flows. Parity table rows clarified to distinguish create-flow (TicketTiersTab/EditableTierCard) from edit-flow (EditTiersTab/ExistingTierCard).

**Files changed:**

- `docs/fixes/MARCH_2026_FIXES.md`
- `docs/todos/NITPICKS_TODOS.md`

---

#### Web Parity Gate — P8-5 Batch #386–#391 (updated #392, #393, #395, #397, #398, #399, #400, #401)

**Files changed in P8-5 batch:**

- **Create flow (create-event):** `apps/mobile/app/(tabs)/create-event.tsx`, `apps/mobile/components/create-event/EditableTierCard.tsx`, `apps/mobile/components/create-event/EventDetailsTab.tsx`, `apps/mobile/components/create-event/TicketTiersTab.tsx`, `apps/mobile/hooks/useCreateEvent.ts`
- **Edit flow (event management):** `apps/mobile/components/events-management/EditTiersTab.tsx` (ExistingTierCard), `apps/mobile/hooks/useTierMutations.ts`
- **Shared/other:** `EditEventDetailsTab.tsx`, `LinkableText.tsx`, `OrgPromotionsCard.tsx`, `useUpdateEvent.ts`, `apps/web/app/api/events/route.ts` (#395)

**Symbols/components altered:** `EditableTierCard`, `TicketTiersTab`, `EventDetailsTab` (create flow); `EditTiersTab`, `ExistingTierCard` (edit flow); `useCreateEvent`, `useUpdateTier`/`useCreateTier`/`useDeleteTier` (useTierMutations); `useUpdateEvent`; `EditEventDetailsTab`, `LinkableText`, `OrgPromotionsCard`. **Shared lib:** `localToUtc`, `formatCentsAsPrice` from `@project-flame/lib`; `DateTimePickerField` (both flows).

##### 1. Web Source References

| Mobile file / symbol changed                                | Web source-of-truth                                                                                                                | Parity                                                                                       |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `useTierMutations.ts` (`useUpdateTier`, `UpdateTierInput`)  | `apps/web/app/api/ticket-tiers/route.ts` PATCH (lines 328–596)                                                                     | Same `updateTierSchema`, endpoint, request body                                              |
| `EditTiersTab.tsx` (`ExistingTierCard`, edit mode)          | Web's `EditTicketTierModal.tsx` + PATCH validation                                                                                 | Full edit regardless of sales; `formatCentsAsPrice`; `DateTimePickerField` + `eventTimezone` |
| `TicketTiersTab.tsx` / `EditableTierCard.tsx` (create flow) | Web's `CreateEventForm` + `TierInlineForm`                                                                                         | `localToUtc(value, tz)`; `eventTimezone` prop; `DateTimePickerField`                         |
| `useUpdateEvent.ts` (`UpdateEventInput`)                    | `apps/web/app/api/events/route.ts` PATCH + `updateEventSchema`                                                                     | Parity — description, starts_at, ends_at, venue, city, image_url; same input shape           |
| `useCreateEvent.ts` (`CreateEventInput`)                    | `apps/web/app/api/events/route.ts` POST schema                                                                                     | Parity — currency, timezone in TS interface; dates via `localToUtc`                          |
| `EditEventDetailsTab.tsx` (description, image upload)       | `CreateEventForm.tsx` (maxLength 520) + `PATCH /api/events`                                                                        | Parity — 520 max, empty string to clear; image via `/api/upload-image` then PATCH            |
| `LinkableText.tsx`                                          | Web renders URLs as `<a>` in React; mobile uses `Linking.openURL`                                                                  | Parity — URLs and @handles tappable; trailing punctuation trimmed (#397)                     |
| Image upload/refresh flow                                   | Web: upload → PATCH → invalidate; Mobile: `apiUploadFormData` → `updateEvent.mutateAsync` → `queryClient.invalidateQueries` (#394) | Parity — create flow invalidates `["events"]` and `["org-events"]` after image PATCH         |
| `OrgPromotionsCard.tsx` (discount picker)                   | `apps/web/app/components/PromotionsSection.tsx` (lines 1155–1168)                                                                  | Parity — same 20 options (5,10,...100), same validation                                      |

**OrgPromotionsCard — Required parity evidence for PR description:** Pre-filled in `.github/pull_request_template.md` under "OrgPromotionsCard / discount picker". Block below:

1. **Web source:** `apps/web/app/components/PromotionsSection.tsx` (lines 1155–1168) — `<select>` with `Array.from({ length: 20 }, (_, i) => (i + 1) * 5)`; `onChange` → `setPromoPercentage(e.target.value)`. Mobile: `showDiscountSelector` → `setDiscountPercentage`.
2. **API parity:** `POST /api/organizer/promotional-codes` — body `event_id`, `code`, `discount_percentage`, `usage_limit`; `useCreatePromoCode.mutateAsync`; validation 5–100 in steps of 5.
3. **Calculation parity:** Identical 20 options (5,10…100); no shared lib; client validation `discountPercentage % 5 === 0`.
4. **Edge-case verification:** Paid/free/promo/RSVP/cancel — N/A (promo creation only); create success → `setShowDiscountPicker(false)` on reset (#399).
5. **Cross-platform behavior:** `showDiscountSelector` branches — iOS: `ActionSheetIOS.showActionSheetWithOptions`; Android: `setShowDiscountPicker(true)` (Modal); both call `setDiscountPercentage`; hardware back → `onRequestClose`.

##### 2. API Parity Evidence

- **#386 (useUpdateTier):** `PATCH /api/ticket-tiers` — same endpoint, same `UpdateTierInput` fields (id, name?, price_cents?, quantity_total?, per_user_limit?, sales_start?, sales_end?, tentative_event_start?). Auth via Bearer token.
- **#389 (create event):** `POST /api/events` — sends `currency` and `timezone` in request body. Dates converted with `localToUtc(value, tz)`.
- **#391 (promo code):** No API change — `POST /api/organizer/promotional-codes`; `discount_percentage` multiples of 5.
- **#395 (description):** `PATCH /api/events` accepts `description` (optional string, max 520, `""` to clear).
- **Image upload:** `POST /api/upload-image` (FormData: file, eventSlug) → returns `{ url }`; then `PATCH /api/events` with `image_url`.

##### 3. Calculation Parity Evidence

- **#389, #386:** `localToUtc(value, tz)` from `@project-flame/lib` for all date conversions. `formatCentsAsPrice(cents, currency)` for tier/stage price display (#397+).
- **#391:** Discount percentage server-validated; client enforces multiples of 5.

##### 4. Edge-Case Verification

| Scenario                               | Expected behavior                                                 | Verified     |
| -------------------------------------- | ----------------------------------------------------------------- | ------------ |
| Edit tier with sales                   | All fields editable; quantity ≥ sold enforced; yellow info banner | ✓ #386, #392 |
| Edit tier without sales                | All fields editable; DateTimePickerField for dates                | ✓ #386       |
| Edit event description                 | Multiline input, 520 max, saved via PATCH; `""` clears            | ✓ #395, #397 |
| Create event with non-Ecuador timezone | Dates converted via `localToUtc(value, tz)`                       | ✓ #389       |
| Promo code discount selection          | 5–100 in steps of 5; iOS ActionSheet, Android Modal               | ✓ #391       |
| URL in description                     | Tappable, opens via Linking.openURL; trailing punctuation trimmed | ✓ #387, #397 |
| Instagram handle in description        | Tappable, opens instagram.com/{handle}                            | ✓ #387       |
| Image upload after create              | `["events"]` and `["org-events"]` invalidated after PATCH         | ✓ #394       |
| Non-USD event currency                 | Tier/stage prices use `formatCentsAsPrice(cents, event.currency)` | ✓ #397       |

##### 5. Paid/Free/Promo/RSVP/Cancellation Edge Cases (P8-5 scope)

| Scenario                | P8-5 relevance                                           | Verified        |
| ----------------------- | -------------------------------------------------------- | --------------- |
| Paid purchase           | N/A — checkout flow (P8-1)                               | —               |
| Free purchase           | N/A — checkout flow (P8-1)                               | —               |
| Promo code apply        | N/A — apply at checkout; P8-5 covers promo creation only | ✓ #391 (create) |
| RSVP approval           | N/A — RSVP management (P8-8)                             | —               |
| Payment cancellation    | N/A — checkout flow (P8-1)                               | —               |
| Tier with sold tickets  | Edit allowed, quantity ≥ sold; deletion blocked          | ✓ #386, #392    |
| Deleted tier with sales | Blocked — delete button disabled when `hasSales`         | ✓ #386, #392    |

##### 6. Cross-Platform Behavior Check

- **Create flow — EditableTierCard, TicketTiersTab (#389, #390):** `localToUtc(value, tz)` for event and tier dates; `DateTimePickerField` with `eventTimezone`; `formatCentsAsPrice` for stage/tier display.
- **Edit flow — EditTiersTab, ExistingTierCard (#386, #392):** Same PATCH endpoint; full edit regardless of sales; quantity ≥ sold enforced; `formatCentsAsPrice(tier.price_cents, eventCurrency)`; `DateTimePickerField` for sale start/end.
- **Promo picker (#391):** iOS ActionSheet, Android Modal with `onRequestClose` (#397).
- **Image picker (#388, #393, #397):** 3:2 selection; format preserved (JPEG/PNG/WEBP; GIF removed from SUPPORTED_TYPES); display `contentFit="cover"`.
- **Event description (#395):** PATCH accepts description; EditEventDetailsTab multiline, 520 max.
- **LinkableText (#387):** URLs and @handles tappable; trailing punctuation trimmed.

---

## P8-6 — Event & Org Display Improvements (Mar 10, 2026)

### #404 — P8-6b/6c: Enriched org event data hook for accurate purchases, revenue, and sent tickets (Mar 10, 2026)

Created `useOrgEventEnriched` hook that calls `GET /api/organizer/data` (single batch fetch, Eventbrite/Ticketmaster pattern) and returns enriched event data including:

- `purchases` array with correct `basePrice` from actual orders (not `tier.price_cents * quantity_sold`)
- `totalRevenue` computed server-side from real order amounts
- `totalAttendees` from `ticket_tiers.quantity_sold`
- `promotional_tickets` and `bank_transfer_orders` (sent ticket history)
- `promoter_links` with accurate stats (both `completed` and `paid` statuses)
- `promotional_codes` for promo code display

The hook caches the full response at org level so navigating between events reuses data. Replaces the previous 3-query approach (useOrgEvents + usePromoCodes + usePromoterLinks) that caused staggered loading.

**Files:** `apps/mobile/hooks/useOrgEventEnriched.ts`

### #405 — P8-6c: Fix revenue calculation in org event detail (Mar 10, 2026)

**Root cause:** Mobile calculated revenue as `sum(tier.price_cents * tier.quantity_sold)` — using current tier prices instead of actual order amounts. If tier prices changed or tickets were free/promotional, revenue was wrong.

**Web source of truth:** `enrichEventWithStats` in `apps/web/app/api/organizer/data/route.ts` calculates `totalRevenue = purchases.reduce((sum, p) => sum + p.basePrice, 0)`.

**Fix:** Updated `org-event-detail.tsx` to use `enrichedEvent.totalRevenue` from the web API when available. Fallback while enriched loads: tier-based estimate (`sum(tier.price_cents * quantity_sold)`) instead of $0.00.

Also fixed `requestedTickets` to use `enrichedEvent.pending_rsvps`. Gated OrgPromotionsCard, OrgPromoterLinksCard, OrgPurchasedDetailsCard on `enrichedEvent` to avoid flash of defaults.

**Files:** `apps/mobile/app/org-event-detail.tsx`

### #406 — P8-6c: Expandable purchase details list (Mar 10, 2026)

Created expandable purchase list (now in `OrgPurchasedDetailsCard`) ported from web's `PurchaseDetailsSection` in `OrganizerDashboard.tsx`. Shows individual purchase rows with: Customer, Tier (with stage), Qty, Scan Status (Scanned/Pending badge), Cost (from `basePrice` — actual order amount). Sorted oldest first (matching web). Expandable via chevron toggle. See #411 for same-container layout.

### #407 — P8-6b: Sent tickets history section (Mar 10, 2026)

Created sent tickets history (now in `OrgSendTicketsCard`) ported from web's `PromotionsSection.tsx` sent ticket lists. Tabbed display (Free / Bank Transfer) showing recipients with: Name, Tier, Quantity, Cost (uses `extractBasePriceHistorical` for bank transfer orders, "Free" for promotional). Expandable via chevron toggle. See #412 for same-container layout.

### #408 — P8-6d: Real-time availability polling (Mar 10, 2026)

Added `refetchInterval: 10_000` (10 seconds) to `useEventDetails` React Query config. Web polls availability every 10 seconds; mobile previously used a 2-minute `staleTime` with no active polling — a tier could sell out from concurrent purchases and mobile users wouldn't know until manual refresh.

Resolves EDGE_CASES #38.

**Files:** `apps/mobile/hooks/useEventDetails.ts`

### #410 — P8-6: Fix org-event-detail TDZ, enriched error handling, Zod validation, composed refetch (Mar 10, 2026)

- **TDZ fix:** Moved `useOrgEventEnriched` above `handleRefresh` so `refetchEnriched` is defined before use (was causing ReferenceError from temporal dead zone).
- **Enriched error handling:** `org-event-detail` now destructures `enrichedError`, logs it with eventId, and renders inline error + retry UI when `!enrichedEvent && enrichedError`; retry button calls `refetchEnriched` with try/catch.
- **Zod validation:** Added explicit schemas (`PurchaseSchema`, `SentTicketSchema`, `PromotionalCodeSchema`, `PromoterLinkSchema`, `EnrichedEventTierSchema`, `EnrichedEventTierStageSchema`) so nested shapes and event fields (`starts_at`, `ends_at`, `city`, `venue`, `timezone`, `ticket_tiers`) consumed by the UI are validated at the API boundary; replaced `.passthrough()` with explicit `EnrichedEventSchema` fields matching `EnrichedOrgEvent`.
- **Composed refetch:** `useOrgEnrichedAll` exposes a composed refetch (`useCallback`) that retries both `useOrgData` and the API query so org lookup failures can be retried (was only retrying API).
- **Merged loading/error:** `useOrgEnrichedAll` merges `useOrgData` isLoading and error so org lookup failures surface correctly.

**Files:** `apps/mobile/app/org-event-detail.tsx`, `apps/mobile/hooks/useOrgEventEnriched.ts`

### #411 — P8-6: Purchase list in same container as parent card (Mar 10, 2026)

- **Layout:** Purchase list (expandable individual purchase rows) moved inside `OrgPurchasedDetailsCard` so it shares the same card container as the stats (Ticket QNT, Requested, Sold, Revenue).
- **Implementation:** `OrgPurchasedDetailsCard` now accepts optional `purchases` and `currency` props; when provided, renders an expandable "Purchase List (N)" section below the stats with `PurchaseRow` items.
- **Cleanup:** Removed standalone `PurchaseListSection.tsx` (logic inlined into `OrgPurchasedDetailsCard`).

**Files:** `apps/mobile/components/org-dashboard/OrgPurchasedDetailsCard.tsx`, `apps/mobile/app/org-event-detail.tsx`

### #412 — P8-6: Sent tickets history in same container as Send Tickets card (Mar 10, 2026)

- **Layout:** Sent tickets history moved inside `OrgSendTicketsCard` so it shares the same card container as the send actions.
- **Simplified tabs:** Single tab set "Free (N)" | "Bank Transfer (N)" — each tab shows the send form + sent history for that type (no separate expandable or sub-tabs).
- **Implementation:** `OrgSendTicketsCard` accepts optional `promotionalTickets`, `bankTransferOrders`, and `currency` props; Free tab shows send form + sent free tickets list; Bank Transfer tab shows order form + sent bank transfer list.
- **Cleanup:** Removed standalone `SentTicketsSection.tsx` (logic inlined into `OrgSendTicketsCard`).

**Files:** `apps/mobile/components/org-dashboard/OrgSendTicketsCard.tsx`, `apps/mobile/app/org-event-detail.tsx`

### #413 — P8-6: PR template P8-8 placeholder + Cancellation checklist expansion (Mar 10, 2026)

### #414 — P8-7a: QR code fullscreen expand (Mar 10, 2026)

- **Problem:** No way to expand the QR code to full screen for easier scanning at venues. Ticketmaster and Eventbrite both support tap-to-expand.
- **Fix:** Added `expand-outline` Ionicons icon in the top-right corner of the QR card as a visual affordance. Wrapping the QR card in a `Pressable` opens a `Modal` (`presentationStyle="fullScreen"`, `animationType="fade"`) showing the QR code at maximum size on a white background, centered. A close button (X icon) is positioned in the top-right. Event name and tier name are shown below the QR for context.

**Files:** `apps/mobile/app/ticket/[id].tsx`

### #416 — P8-7c: Remove cedula/billing fields from settings (Mar 10, 2026)

- **Problem:** The Personal Settings tab displayed legacy ID Number (Cedula), Billing Address, City, and Country fields from before the Stripe migration. These fields are no longer relevant.
- **Fix:** Removed the `SettingsEditableField` for "ID Number (Cédula)", `SettingsField` for "Billing Address", "City", and "Country", and the "Save" button. Removed all related state (`documentId`, `documentIdError`), the `handleSavePress` handler, the `useEffect` for `documentId` sync, and unused imports (`validateCedula`, `cleanCedula`, `SettingsEditableField`, `colors`, `useEffect`). DB data is preserved — only the UI fields were removed. Profile now shows only: photo, full name, and email.

**Files:** `apps/mobile/components/settings/PersonalSettingsTab.tsx`

### #417 — P8-7d: Clerk "Manage" account link + @clerk/expo v3 upgrade (Mar 10, 2026)

- **Superseded by #419.** The @clerk/expo v3 migration was reverted due to cascading issues (react/react-dom version mismatch, clerk_offline errors, polyfill churn). The current implementation uses `@clerk/clerk-expo` v2 with Alert + Linking for the Manage link — see #419. Do not treat this entry as the live implementation.
- **Problem:** No way for users to manage their Clerk account (change password, connected accounts, security) from the mobile app. Web uses Clerk's `<UserButton>` which opens a modal.
- **Initial attempt:** `WebBrowser.openBrowserAsync` with Clerk Account Portal URL — opened in-app browser but required re-authentication (browser session is separate from Clerk SDK session). Bad UX.
- **Final fix:** Upgraded `@clerk/clerk-expo` v2.19.22 → `@clerk/expo` v3.1.0. This gives access to `useUserProfileModal()` which presents a **native SwiftUI modal** (iOS) directly in the app — no browser, no re-authentication. The user sees the same Clerk Account Portal UI (Profile, Security, Connected Accounts) as on web, rendered natively.
- **Upgrade scope:**
  - Package: `@clerk/clerk-expo` removed, `@clerk/expo@3.1.0` installed.
  - Imports updated in 3 files (`_layout.tsx`, `useSignInHandlers.ts`, `token-cache.ts`) + dynamic `require` in `useOptionalAuth.ts`.
  - Config plugin added to `app.json` (auto-adds `clerk-ios` and `clerk-android` native SDKs).
  - Metro config updated: `extraNodeModules` mapping changed from `@clerk/clerk-expo` → `@clerk/expo`.
  - Existing auth flows (`signIn.create()`, `setActive()`, `useSSO`, token cache) are backward compatible in Core 3.
- **Decision rationale:** `@clerk/clerk-expo` v2 explicitly throws `"<UserProfile/> component is not supported in native environments"` on native — no way to render Clerk UI without a browser. `@clerk/expo` v3 (released Mar 9, 2026) provides native components via SwiftUI/Jetpack Compose. Industry standard (Ticketmaster, Eventbrite, Airbnb) is native in-app profile management.

**Files:** `apps/mobile/components/settings/PersonalSettingsTab.tsx`, `apps/mobile/app/_layout.tsx`, `apps/mobile/hooks/useSignInHandlers.ts`, `apps/mobile/hooks/useOptionalAuth.ts`, `apps/mobile/lib/token-cache.ts`, `apps/mobile/metro.config.js`, `apps/mobile/app.json`, `apps/mobile/package.json`

---

#### P8-7 Verification Block (entries #414, #416–#417)

No full Web Parity Gate required (UX polish only). Verification notes:

- **QR fullscreen expand (#414):** Tap QR card → fullscreen modal opens with large QR on white background. Close button dismisses. Expand icon visible on valid QR cards only. Benchmarks Ticketmaster/Eventbrite pattern.
- **Cedula/billing removed (#416):** Personal Settings shows only photo, full name, email, and sign-out. No cedula, billing address, city, or country fields. DB data intact.
- **Clerk "Manage" link (#417, rolled back #419):** "Manage" link visible next to "Personal Information" header. Tapping shows an Alert: "To manage your profile, please visit flame.co and inside your account head to Settings" with OK and "Open flame.co" options. URL from `EXPO_PUBLIC_APP_URL` (falls back to https://flame.co). Reverted from `@clerk/expo` v3 upgrade — using `@clerk/clerk-expo` v2.

---

#### Web Parity Gate (entries #404–#412) — **MERGE BLOCKED** until each item below is satisfied

**COPY THE FOLLOWING BLOCK INTO THE PR DESCRIPTION BEFORE MERGE.**

##### 1. Web Source References

| Mobile file                                                        | Web source-of-truth                                                                | Parity                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/mobile/app/org-event-detail.tsx`                             | `apps/web/app/components/OrganizerDashboard.tsx` (PurchaseDetailsSection, revenue) | TDZ fix; tier-based revenue fallback; promo/links/purchasedetails gated on `enrichedEvent`; inline error + retry when `enrichedError`                                                                                                                                                                            |
| `apps/mobile/hooks/useOrgEventEnriched.ts`                         | `apps/web/app/api/organizer/data/route.ts` (`enrichEventWithStats`)                | `OrgDataResponseSchema`, `EnrichedEventSchema` (starts_at, ends_at, city, venue, timezone, ticket_tiers), `PurchaseSchema`, `SentTicketSchema`, `PromotionalCodeSchema`, `PromoterLinkSchema`, `EnrichedEventTierSchema`, `EnrichedEventTierStageSchema`; composed refetch (orgData + API); merged loading/error |
| `apps/mobile/hooks/useEventDetails.ts`                             | Web `useTicketAvailability` / EventDetail                                          | `refetchInterval: 10_000`                                                                                                                                                                                                                                                                                        |
| `apps/mobile/components/org-dashboard/OrgPurchasedDetailsCard.tsx` | Web `PurchaseDetailsSection`                                                       | Stats + expandable purchase list in same card; Cost from `purchase.basePrice` (actual order amount)                                                                                                                                                                                                              |
| `apps/mobile/components/org-dashboard/OrgSendTicketsCard.tsx`      | Web `PromotionsSection`                                                            | Send actions + sent tickets history in same card; tabbed Free/Bank Transfer; `extractBasePriceHistorical` for bank transfer cost                                                                                                                                                                                 |

##### 2. API Parity Evidence

- **GET /api/organizer/data:** `useOrgEventEnriched.ts` validates response with `OrgDataResponseSchema` before caching; `EnrichedEventSchema` explicitly validates `starts_at`, `ends_at`, `city`, `venue`, `timezone`, `ticket_tiers` and all nested arrays (`PurchaseSchema`, `SentTicketSchema`, `PromotionalCodeSchema`, `PromoterLinkSchema`, `EnrichedEventTierSchema`, `EnrichedEventTierStageSchema`); parse failures throw at API boundary (malformed payloads not cached).
- **Response shape:** `totalRevenue`, `totalAttendees`, `pending_rsvps`, `purchases`, `promotional_tickets`, `bank_transfer_orders`, `promotional_codes`, `promoter_links` validated.

##### 3. Calculation Parity Evidence

- **Revenue:** `org-event-detail.tsx` uses `enrichedEvent.totalRevenue` when present (server-derived from `purchases.reduce((sum, p) => sum + p.basePrice, 0)`); when `!enrichedEvent`, uses tier-based estimate `sum(price_cents * quantity_sold)`.
- **Cost display:** `OrgPurchasedDetailsCard` (purchase list) uses `purchase.basePrice` (actual order amount); `OrgSendTicketsCard` (sent tickets) uses `extractBasePriceHistorical` for bank transfer orders.

##### 4. Edge-Case Verification Checklist

| Scenario           | Implementation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Enriched API fails | `org-event-detail.tsx`: `enrichedError` logged with eventId; inline retry UI; `refetchEnriched()` with try/catch                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Org lookup fails   | `useOrgEventEnriched.ts`: `orgError` merged into error; composed refetch retries `refetchOrgData()` + API                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Enriched loading   | Cards gated on `enrichedEvent`; tier-based `purchaseStats` fallback                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Paid purchase      | Revenue from `enrichedEvent.totalRevenue` (server); `OrgPurchasedDetailsCard` purchase list shows `basePrice`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Free purchase      | Revenue excludes free; purchase list shows cost per row                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Promo discount     | `PromotionalCodeSchema` validates `discount_percentage`, `usage_count`; promo codes card gated on `enrichedEvent`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| RSVP               | `enrichedEvent.pending_rsvps` → `requestedTickets`; purchase list includes approved RSVPs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Cancellation       | **Checkout cancellation (PaymentSheet dismissed):** Hold cancelled via `POST /api/holds/cancel`; no purchase created; `refetchInterval` in `useEventDetails` keeps availability fresh; composed refetch in `useOrgEventEnriched` retries org lookup + API on error. **Post-purchase refund/cancel:** API (`GET /api/organizer/data`) fetches orders with `.in("status", ["completed", "paid"])`—cancelled/refunded orders are excluded; revenue from `enrichedEvent.totalRevenue` is server-authoritative (excludes refunded amounts); `OrgPurchasedDetailsCard` and purchase list render only completed/paid purchases; no explicit "cancelled" UI state—cancelled orders simply do not appear. |

##### 5. Cross-Platform Behavior Check

- Promo codes, promoter links, purchasedetails render only when `enrichedEvent` exists (no flash of defaults).
- Inline retry UI when enriched fetch fails; retry calls composed refetch (orgData + API).

### #418 — P8-6: Add price tag to HomeFeedEventCard (Mar 10, 2026)

- **Problem:** The `HomeFeedEventCard` component (home screen feed) displayed event title, date/time, and location but was missing the price display row. The shared `EventCard` and `SpotlightCard` already rendered `priceDisplay` via `getLowestPrice()`, but the home screen's custom card did not.
- **Fix:** Added a `priceDisplay` row (pricetag-outline icon + `subtitle2` text) to `HomeFeedEventCard`, matching the exact pattern used by `EventCard` in `packages/ui`. The data was already available — `useAppEvents` computes `priceDisplay` for all `EventCardData` objects. Added `Ionicons` import. Same data shape and display pattern across home feed, event cards, and spotlight cards.

**Files:** `apps/mobile/components/home/HomeFeedList.tsx`

---

### #419 — P8-7d rollback: Revert @clerk/expo v3 → @clerk/clerk-expo v2 (Mar 11, 2026)

- **Problem:** The `@clerk/expo` v3 upgrade (entry #417) caused cascading issues: (1) `react`/`react-dom` version mismatch (19.1.0 vs 19.1.4) requiring `react-dom` + Metro config changes; (2) `clerk_offline` errors on every `getToken()` call (Clerk v3's `clerk-js` v6 treats React Native as offline); (3) polyfill attempts and config churn. Auth flows became unreliable.
- **Fix:** Full rollback to `@clerk/clerk-expo` v2.19.30. "Manage" button retained but simplified: tapping shows an Alert with message "To manage your profile, please visit flame.co and inside your account head to Settings" and an "Open flame.co" option that opens `EXPO_PUBLIC_APP_URL` (or https://flame.co).
- **Scope:** Package swap (`@clerk/expo` → `@clerk/clerk-expo`). "Manage" button retained: tapping shows an Alert with message directing users to flame.co → Settings and an "Open flame.co" option that opens `EXPO_PUBLIC_APP_URL` (or https://flame.co) via `Linking.openURL` with `canOpenURL` validation and error handling.

**Files:** `apps/mobile/package.json`, `apps/mobile/components/settings/PersonalSettingsTab.tsx`

---

### #420 — P8 PR review follow-up: handleManageAccount safety, #419 doc correction (Mar 11, 2026)

- **Problem (inline):** (1) `handleManageAccount` in `PersonalSettingsTab` called `Linking.openURL(url)` without validation or error handling — unhandled rejections possible. (2) Changelog #419 listed files that weren't in the rollback PR diff.
- **Fix:** (1) Updated `handleManageAccount` to call `Linking.canOpenURL(url)` first; only call `Linking.openURL(url)` if it returns true; wrapped in try/catch with user-friendly Alert on failure. (2) Trimmed #419 "Files" and "Scope" to reflect only `package.json` and `PersonalSettingsTab.tsx`.

**Files:** `apps/mobile/components/settings/PersonalSettingsTab.tsx`, `docs/fixes/MARCH_2026_FIXES.md`

---

### #423 — P8 PR review: URL/Alert consistency (Mar 10, 2026)

- **Problem (inline):** PersonalSettingsTab fallback URL and Alert text could mismatch when `EXPO_PUBLIC_APP_URL` pointed to a different host (e.g., staging).
- **Fix:** Derive `displayHost` from the `url` variable (`new URL(url).hostname`) and use it in Alert title, message, CTA ("Open {displayHost}"), and error fallbacks. Display text now always matches the actual `Linking.openURL` destination.

**Files:** `apps/mobile/components/settings/PersonalSettingsTab.tsx`

---

### #424 — P8 PR review follow-up: handleManageAccount logging, changelog accuracy (Mar 11, 2026)

- **handleManageAccount logging:** Added `console.warn` when `Linking.canOpenURL(url)` returns false (`{ userId, action: "manageAccount", url }`). Added `console.error` in catch block before Alert (`{ userId, action: "openAccountSettings", url, error: err }`). Matches pattern used by signOut, upload, delete handlers.
- **Changelog cleanup:** Removed #415 (notification dismiss) from this PR's scope; updated P8-7 Verification Block. Trimmed #421, #423, #424 to reflect only files changed in this PR (package.json, ticket/[id].tsx, HomeFeedList.tsx, PersonalSettingsTab.tsx, MARCH_2026_FIXES.md).

**Files:** `apps/mobile/components/settings/PersonalSettingsTab.tsx`, `docs/fixes/MARCH_2026_FIXES.md`

---

### #425 — P8 PR review: changelog accuracy (Mar 11, 2026)

- **Fix:** Removed incorrect reference to `apps/mobile/hooks/useUserProfile.ts` (not in this PR). PersonalSettingsTab displayHost fix is documented in #423.

**Files:** `docs/fixes/MARCH_2026_FIXES.md`

---

### #426 — P8 PR review follow-up: #425 changelog correction + nitpick deferral (Mar 11, 2026)

- **#425 correction:** Per PR review: removed incorrect reference to `useUserProfile.ts` (not in this PR); displayHost fix already documented in #423. Entry trimmed to changelog-accuracy-only.
- **Nitpick deferral:** useUserProfile `UserProfileSchema` vs `UserProfile` type mismatch logged in `docs/todos/NITPICKS_TODOS.md` (P8 PR Review — Deferred).

**Files:** `docs/fixes/MARCH_2026_FIXES.md`, `docs/todos/NITPICKS_TODOS.md`

---

#### P8-6 Industry Standards Assessment

**Data fetching pattern:** `useOrgEventEnriched` fetches all org event data in a single call to `/api/organizer/data` (Eventbrite/Ticketmaster pattern).

**Real-time availability:** `useEventDetails` uses `refetchInterval: 10_000` for availability polling.

---

### #427 — P8-8a: Registration form builder in event creation (Mar 11, 2026)

- **New feature:** Added registration form builder to the create-event flow. When RSVP is enabled, organizers can check "Include registration form" to add dynamic form fields. Each field has a label, type picker (text/email/date/number/checkbox), required toggle, optional placeholder, and reorder (up/down) controls.
- **Components created:**
  - `apps/mobile/components/create-event/RegistrationFormBuilder.tsx` — container with add/remove/reorder logic
  - `apps/mobile/components/create-event/FormFieldCard.tsx` — individual field editor card with type picker, required toggle, trash with confirmation
- **Updated `EventFormData`** in `apps/mobile/app/(tabs)/create-event.tsx` to include `registration_form_config: FormField[]`. Cleared when RSVP is disabled. Sent to `POST /api/events` on submission (empty-label fields filtered out).
- **Updated `EventDetailsTab.tsx`** to render the checkbox and builder below the RSVP toggle (conditionally when `requires_rsvp` is true).

**Files:** `apps/mobile/components/create-event/FormFieldCard.tsx` (new), `apps/mobile/components/create-event/RegistrationFormBuilder.tsx` (new), `apps/mobile/components/create-event/EventDetailsTab.tsx`, `apps/mobile/app/(tabs)/create-event.tsx`

---

### #428 — P8-8b: Registration form builder in event management (Mar 11, 2026)

- **New feature:** Added registration form builder to `EditEventDetailsTab.tsx` for editing existing events. Loads the current `registration_form_config` from event data, allows editing in the same UI as event creation, and saves via `PATCH /api/events`.
- **Read-only mode:** When `readOnly` is true, shows a summary list of configured fields (label, type, required badge) instead of the builder.
- **Updated `OrgEvent` interface** in `useOrgEvents.ts` (#428) to include `registration_form_config: unknown`, and added it to the Supabase select query. **Superseded by #433:** PR #433 later narrows `registration_form_config` to `FormField[] | null` (so the interim `unknown` typing was temporary).
- **Change detection:** `handleSave` compares serialized form config (current vs original) to detect changes; only sends `registration_form_config` in the PATCH payload when the config actually changed.

**Files:** `apps/mobile/components/events-management/EditEventDetailsTab.tsx`, `apps/mobile/hooks/useOrgEvents.ts`

---

### #429 — P8-8c: DB structure verification (Mar 11, 2026)

- **Verified:** `registration_form_config` column exists on the `events` table as JSONB (confirmed in `supabase/migrations/20260128000000_baseline.sql` line 2885). No migration needed.
- **Verified:** `ticket_tiers.registration_form_fields` column exists (text array) for tier-specific field filtering. Web's `rsvp/route.ts` uses it to filter which form fields apply to a specific tier.

**Files:** No changes (verification only).

---

### #430 — P8-8d: API integration — `registration_form_config` in POST and PATCH (Mar 11, 2026)

- **POST /api/events (`createEventSchema`):** Added optional `registration_form_config` array field with Zod validation matching the `FormField` interface (`id`, `label`, `type` enum, `required?`, `placeholder?`). Included in the event INSERT when present and non-empty.
- **PATCH /api/events (`updateEventSchema`):** Added optional `registration_form_config` field (array or null). Null or empty array clears the config. Included in the update payload when provided.
- **Mobile `useCreateEvent`:** Updated `CreateEventInput.event` to include optional `registration_form_config` array.
- **Mobile `useUpdateEvent`:** Updated `UpdateEventInput` to include optional `registration_form_config` (array or null).

**Files:** `apps/web/app/api/events/route.ts`, `apps/mobile/hooks/useCreateEvent.ts`, `apps/mobile/hooks/useUpdateEvent.ts`

---

### #431 — Fee change: default platform fee 12.5% + $0.30 → 10% + $0.99 (Mar 11, 2026)

- **Reason:** Lower percentage fee makes Flame more competitive for higher-priced tickets while the increased fixed fee ($0.30 → $0.99) maintains minimum revenue on lower-priced tickets. Net effect: less profit on high-value tickets, more consistent baseline on low-value tickets.
- **Scope:** Applies to new events (via ALTER DEFAULT) and existing events (via backfill). **#431 superseded for scope:** Migration `20260311024302_backfill_platform_fees.sql` (added in #436) backfills existing events with `markup_percent=12.5` and `markup_fixed_cents=30` to new defaults (10, 99). See #436.
- **`packages/lib/src/pricing/constants.ts`:** `DEFAULT_PLATFORM_FEE_PERCENT` 12.5 → 10, `DEFAULT_FIXED_FEE_CENTS` 30 → 99. Added historical note comment.
- **`apps/web/app/lib/stripe/fees.ts`:** Same update to local duplicate constants. Updated comment to reference DB column rather than the old migration filename.
- **`supabase/migrations/20260311020308_update_default_platform_fees.sql`:** `ALTER TABLE events ALTER COLUMN markup_percent SET DEFAULT 10` and `ALTER COLUMN markup_fixed_cents SET DEFAULT 99`. Applied and verified via MCP.
- **`packages/lib/__tests__/stripe-fees.test.ts`** and **`apps/web/__tests__/stripe-fees.test.ts`:** Updated "uses default parameters" test — new expectation for `calculateFee(10000)`: `platformFeeCents` 1280 → 1099 ($10.99), `totalAmountCents` 11280 → 11099 ($110.99).

**Files:** `packages/lib/src/pricing/constants.ts`, `apps/web/app/lib/stripe/fees.ts`, `supabase/migrations/20260311020308_update_default_platform_fees.sql`, `packages/lib/__tests__/stripe-fees.test.ts`, `apps/web/__tests__/stripe-fees.test.ts`

---

### #432 — Timezone-aware date/time display across mobile + web emails (Mar 11, 2026)

**Problem:** `formatEventDate` and `formatEventTime` in `@project-flame/lib` had no `timeZone` option — they rendered dates in the **device/browser local timezone**, not the event's timezone. All mobile screens showed wrong times for non-local users. Email notifications hardcoded `"America/Guayaquil"` for all events regardless of their stored timezone.

**Root cause fix — `packages/lib/src/utils/format.ts`:**

- Added optional `timezone` parameter (default `"America/Guayaquil"`) to `formatEventDate`, `formatEventTime`, `formatDay`, `formatMonth`. All existing callers remain backward-compatible.
- Added new `getTimezoneAbbr(timezone, dateString?)` helper — uses `Intl.DateTimeFormat` with `timeZoneName: "short"` to return abbreviated labels (e.g., `"ECT"`, `"EST"`, `"EDT"`).
- Exported `getTimezoneAbbr` from both `packages/lib/src/utils/index.ts` and `packages/lib/src/index.ts`.

**Fallback rationale:** Kept `"America/Guayaquil"` as the code-level fallback because the DB column is `NOT NULL DEFAULT 'America/Guayaquil'` — existing events already have a timezone value. The fallback is purely defensive and will not override real timezone data.

**Notable mobile callers updated (pass `event.timezone`):**

- `apps/mobile/hooks/useAppEvents.ts` — `mapEventToCardData` and `mapEventToSpotlightData`: timezone-aware date/time + TZ abbreviation appended to `timeRange` (e.g., `"20:00 - 22:00 ECT"`)
- `apps/mobile/components/event-details/EventHero.tsx` — `formatEventDate` now uses `event.timezone`
- `apps/mobile/app/event/[id].tsx` — `formatEventTime` + TZ abbreviation in `timeRange`
- `apps/mobile/app/(tabs)/org-dashboard.tsx` — `mapOrgEventToCardData` uses `event.timezone`
- `apps/mobile/app/org-event-detail.tsx` — `eventDisplay` useMemo uses `event.timezone`
- `apps/mobile/app/(tabs)/events-management.tsx` — `toManageEvent` uses `event.timezone`
- `apps/mobile/components/events-management/EditEventDetailsTab.tsx` — `utcToLocal`/`localToUtc` use `event.timezone` for date conversion
- `apps/mobile/hooks/useRsvpManagement.ts` — Added `timezone` to `EventRow` interface, added `timezone` to Supabase SELECT query, updated `buildTimeRange` + `formatEventDate` calls

**Web email templates updated (all accept optional `eventTimezone?: string`):**

- `apps/web/app/lib/email/ticket-notifications.ts` — `TicketEmailData` + `TicketReadyEmailData` interfaces + all 3 `formatDate` closures now use `data.eventTimezone || "America/Guayaquil"`. Added `timeZoneName: "short"` to show timezone suffix in email.
- `apps/web/app/lib/email/rsvp-notifications.ts` — All 4 interfaces (`RsvpEmailData`, `OrganizerRsvpNotificationData`, `RsvpPendingEmailData`, rejection uses `Omit<RsvpEmailData>`) + all 4 `formatDate` closures.
- `apps/web/app/lib/email/promotional-ticket-notifications.ts` — `PromotionalTicketEmailData` + 2 `formatDate` closures.
- `apps/web/app/lib/email/date-change-notifications.ts` — `DateChangeEmailData` + `formatDateTime` now takes `timezone` param, call sites pass `data.eventTimezone`.

**Web email callers updated (pass `eventTimezone`):**

- `apps/web/app/lib/orders.ts` — Added `timezone` to `.select("name, starts_at, venue, timezone, organization_id")`, passes `eventTimezone: eventData.timezone` to `sendTicketConfirmationEmail`.
- `apps/web/app/api/events/route.ts` — Passes `eventTimezone: updatedEvent.timezone` to `sendDateChangeEmail`.
- `apps/web/app/api/organizer/rsvps/[id]/approve/route.ts` — Added `timezone` to events `!inner` SELECT + both `sendTicketConfirmationEmail` calls pass `eventTimezone`.
- `apps/web/app/api/organizer/rsvps/[id]/reject/route.ts` — Added `timezone` to events `!inner` SELECT. Removed pre-formatting of `eventDate` (now passes raw ISO string) + passes `eventTimezone`. This also fixes a bug where `eventDate` was formatted without timezone before being passed to the email.
- `apps/web/app/api/dev/email-preview/route.ts` — Added `timeZoneName: "short"` to preview formatters (keeps Ecuador for dev previews; added comment).

**Files:** `packages/lib/src/utils/format.ts`, `packages/lib/src/utils/index.ts`, `packages/lib/src/index.ts`, `apps/mobile/hooks/useAppEvents.ts`, `apps/mobile/components/event-details/EventHero.tsx`, `apps/mobile/app/event/[id].tsx`, `apps/mobile/app/(tabs)/org-dashboard.tsx`, `apps/mobile/app/org-event-detail.tsx`, `apps/mobile/app/(tabs)/events-management.tsx`, `apps/mobile/hooks/useRsvpManagement.ts`, `apps/web/app/lib/email/ticket-notifications.ts`, `apps/web/app/lib/email/rsvp-notifications.ts`, `apps/web/app/lib/email/promotional-ticket-notifications.ts`, `apps/web/app/lib/email/date-change-notifications.ts`, `apps/web/app/lib/orders.ts`, `apps/web/app/api/events/route.ts`, `apps/web/app/api/organizer/rsvps/[id]/approve/route.ts`, `apps/web/app/api/organizer/rsvps/[id]/reject/route.ts`, `apps/web/app/api/dev/email-preview/route.ts`

---

### #433 — useOrgEvents: type registration_form_config as FormField[] | null (Mar 11, 2026)

**Problem:** `OrgEvent.registration_form_config` was typed as `unknown`, causing weaker type-checking for consumers.

**Fix:** Import `FormField` from `useRsvpManagement.ts` and change `registration_form_config` to `FormField[] | null` to align with RsvpEventData's pattern and FormFieldSchema validation used at read sites. The actual consumers are event-detail data readers (e.g., CheckoutMainSheet consumes event from checkout/event-detail flow; EditEventDetailsTab consumes OrgEvent from useOrgEvents). Both require `registration_form_config` typed as `FormField[] | null` to match RsvpEventData and FormFieldSchema validation.

**Files:** `apps/mobile/hooks/useOrgEvents.ts`

---

### #434 — RSVP reject route: typed events join instead of `any` (Mar 11, 2026)

**Problem:** The reject route cast `rsvp.events` to `any` to access `timezone`, bypassing type safety.

**Fix:** Declared `RsvpEventJoin` interface with `id`, `name`, `starts_at`, `venue`, `timezone`, `organization_id`. Type-assert the query result as `typeof rsvp & { events: RsvpEventJoin }` and use `rsvpTyped.events.timezone || "America/Guayaquil"` instead of `(rsvp.events as any).timezone`. **Fallback:** `"America/Guayaquil"` (unchanged by #436 — kept for consistency with approve route and other email handlers).

**Files:** `apps/web/app/api/organizer/rsvps/[id]/reject/route.ts`

---

### #435 — MARCH_2026_FIXES.md: fix MD058 table spacing (Mar 11, 2026)

**Problem:** Markdown table under "**1. Web Source References**" (P8-8 Web Parity Gate) triggered markdownlint MD058 due to missing surrounding blank lines.

**Fix:** Added blank line immediately before the table and blank line after the table to separate it from surrounding text.

**Files:** `docs/fixes/MARCH_2026_FIXES.md`

---

#### Web Parity Gate — P8-8 (Registration Form Builder)

**PR description requirement:** Copy this entire parity block into the PR description before merging any PR that ports or changes mobile logic for the registration form builder. Contributors must provide: (1) Web source file references, (2) API parity confirmation, (3) calculation parity evidence (shared lib usage), (4) edge-case verification, and (5) cross-platform behavior check. Omitting this evidence blocks merge.

**1. Web Source References**

| Mobile file                                            | Web source                                                                                   |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `components/create-event/FormFieldCard.tsx`            | `apps/web/app/components/modals/RegistrationFormModal.tsx` (FormField interface, lines 5–11) |
| `components/create-event/RegistrationFormBuilder.tsx`  | Mobile-first feature (web has no builder UI)                                                 |
| `components/events-management/EditEventDetailsTab.tsx` | `apps/web/app/api/events/route.ts` (PATCH handler)                                           |
| `hooks/useCreateEvent.ts`                              | `apps/web/app/api/events/route.ts` (POST handler, createEventSchema)                         |
| `hooks/useUpdateEvent.ts`                              | `apps/web/app/api/events/route.ts` (PATCH handler, updateEventSchema)                        |
| `app/(tabs)/create-event.tsx`                          | `apps/web/app/api/events/route.ts` (POST handler)                                            |

**Web RSVP consumer/validator sources (consumes `registration_form_config`):**

| Web file                                                   | Role                                                                                                                                                                                                                                                                            |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/app/api/rsvp/route.ts`                           | POST handler: reads `registration_form_config` from event, validates `registration_data` against form fields (required checks, tier filtering via `registration_form_fields`). Event select includes `registration_form_config` (line 615). Inline validation at lines 726–778. |
| `apps/web/app/components/modals/RegistrationFormModal.tsx` | Renders the form for attendees using `formConfig: FormField[]`; same interface as mobile builder output.                                                                                                                                                                        |

**2. API Parity Evidence**

- `POST /api/events`: Accepts `registration_form_config` in `event` body (optional array of FormField objects). Mobile sends the same shape as the Zod schema.
- `PATCH /api/events`: Accepts `registration_form_config` (optional array or null). Mobile sends null to clear, array to set. Same as updateEventSchema.
- Request body field names: `id`, `label`, `type`, `required`, `placeholder` — identical between mobile and web Zod schema.
- Response: Standard event object; no registration-form-specific response parsing needed.
- **RSVP validation:** `apps/web/app/api/rsvp/route.ts` POST handler consumes `registration_form_config` from the event and validates `registration_data` against it (required-field checks, tier-specific filtering via `ticket_tiers.registration_form_fields`). Mobile-generated config is parsed and validated identically when attendees submit RSVPs.

**3. Calculation Parity Evidence**

- No pricing/fee calculations involved. FormField interface matches web exactly: `{ id: string, label: string, type: "text"|"email"|"date"|"number"|"checkbox", required?: boolean, placeholder?: string }`.
- FormFieldSchema (Zod) from `useRsvpManagement.ts` used for parsing existing configs — same validation as web's runtime checks.
- **RSVP consumer:** `rsvp/route.ts` handler (lines 726–778) validates `registration_data` against `event.registration_form_config`; reviewers can confirm mobile-generated config is parsed/validated identically on web.

**4. Edge-Case Verification**

- Empty config: Sends nothing (no `registration_form_config` key) when no fields or all labels empty.
- Null to clear: PATCH sends `null` to remove form config from existing event.
- Single field: Works correctly in both create and edit flows.
- Multiple fields with reorder: Up/down arrows swap adjacent fields; state updates immediately.
- Required vs optional: Toggle per-field; server validates required fields in `rsvp/route.ts` unchanged.
- RSVP disabled: Clearing RSVP toggle clears `registration_form_config` to prevent orphaned configs.
- Tier-specific fields: Web's `registration_form_fields` on `ticket_tiers` continues to filter which form fields show per tier; builder produces compatible field IDs.

**5. Cross-Platform Behavior Check**

- **Mobile-first feature:** Web does NOT have a form builder UI. Config was previously set via DB only. Mobile builder produces `FormField[]` that is 100% compatible with web's `RegistrationFormModal.tsx` rendering and `rsvp/route.ts` validation.
- Entry added to `docs/todos/CRUCIAL_IOS_TO_WEB_TODOS.md` for web to get the same builder UI.

---

### #436 — PR Review: Timezone safety, form config, payload typing, changelog accuracy (Mar 11, 2026)

**Inline comments addressed:**

1. **PR template:** Updated Phase 8 Registration Form block to reference canonical path `docs/todos/CRUCIAL_IOS_TO_WEB_TODOS.md`.
2. **event/[id].tsx:** Added IANA timezone validation before formatting; use `isValidIanaTimezone()` and fall back to `"America/Guayaquil"`; avoid RangeError in `getTimezoneAbbr`/`formatEventTime`.
3. **EditEventDetailsTab:** Parse-failure handling for `registration_form_config`: log contextual error with eventId, surface error state in UI, disable form editing until repaired; use `UpdateEventInput` for payload instead of `as any`; never include `registration_form_config` in save when parse failed.
4. **useRsvpManagement:** `EventRow.timezone` → `string | null`; add `safeTimezone()` helper; pass validated timezone to `formatEventDate`/`formatEventTime`/`getTimezoneAbbr`.
5. **reject/route.ts:** Reverted to `"America/Guayaquil"` fallback (same as approve route) for consistency across all email handlers; `rsvpTyped.events.timezone || "America/Guayaquil"`.
6. **packages/lib format.ts:** `formatEventDate`, `formatEventTime`, `formatDay`, `formatMonth` now wrap Intl calls in try/catch to avoid RangeError on invalid IANA timezones; return `""` on error. Added `isValidIanaTimezone()` helper.
7. **Migration backfill:** New migration `20260311024302_backfill_platform_fees.sql` updates existing events with `markup_percent=12.5` and `markup_fixed_cents=30` to new defaults (10, 99). Applied via MCP.
8. **create-event.tsx:** Length check on filtered `registration_form_config` — use `validFormFields.length > 0` instead of unfiltered array so empty-label-only configs do not send `[]`.
9. **useAppEvents:** `isToday` in `mapEventToSpotlightData` now uses event's IANA timezone (`toLocaleDateString` with `timeZone: tz`) instead of device timezone for consistency with displayed date.

**Changelog verification:** #431 and #428–#430 entries confirmed accurate — fee constants and registration_form_config are implemented as described.

**Files:** `.github/pull_request_template.md`, `apps/mobile/app/event/[id].tsx`, `apps/mobile/components/events-management/EditEventDetailsTab.tsx`, `apps/mobile/hooks/useRsvpManagement.ts`, `apps/web/app/api/organizer/rsvps/[id]/reject/route.ts`, `packages/lib/src/utils/format.ts`, `packages/lib/src/utils/index.ts`, `packages/lib/src/index.ts`, `supabase/migrations/20260311024302_backfill_platform_fees.sql`, `apps/mobile/app/(tabs)/create-event.tsx`, `apps/mobile/hooks/useAppEvents.ts`

---

### #437 — Changelog consistency: reject route fallback, #431 scope, #433/#434 wording (Mar 11, 2026)

**Changes:**

1. **reject/route.ts:** Reverted `eventTimezone` fallback from `"UTC"` to `"America/Guayaquil"` for consistency with approve route and other email handlers (`rsvpTyped.events.timezone || "America/Guayaquil"`).
2. **#433:** Clarified consumers of `registration_form_config` — event-detail data readers (CheckoutMainSheet from checkout/event-detail flow; EditEventDetailsTab from useOrgEvents); both require `FormField[] | null` to match RsvpEventData and FormFieldSchema validation.
3. **#431:** Amended scope to reflect backfill — migration `20260311024302_backfill_platform_fees.sql` updates existing events; #431 superseded for scope (now applies to new and existing events).
4. **#434:** Added explicit fallback note — `"America/Guayaquil"` (unchanged by #436); kept for consistency with approve route. #436 entry updated to reflect revert to America/Guayaquil.

**Files:** `apps/web/app/api/organizer/rsvps/[id]/reject/route.ts`, `docs/fixes/MARCH_2026_FIXES.md`

---

### #438 — PR Review: Web Parity Gate, changelog accuracy, timezone payload (Mar 11, 2026)

**Inline comments addressed:**

1. **Web Parity Gate — P8-8 (Registration Form Builder):** Added standard PR-description copy instruction instructing contributors to copy the entire parity block into the PR description before merging and to provide (1) Web source file references, (2) API parity confirmation, (3) calculation parity evidence (shared lib usage), (4) edge-case verification, and (5) cross-platform behavior check.
2. **#428 (registration_form_config):** Added superseded note — PR #433 later narrows `registration_form_config` to `FormField[] | null` (interim `unknown` was temporary); added PR number to OrgEvent mention.
3. **#432 (timezone changelog):** Softened "Mobile callers updated (all pass…)" to "Notable mobile callers updated"; added missing `EditEventDetailsTab.tsx` to the bulleted list.

**Outside diff fix:** 4. **create-event.tsx:** Payload now uses normalized `tz` (eventForm.timezone || "America/Guayaquil") for the `timezone` field instead of raw `eventForm.timezone`. Ensures stored timezone matches the one used to compute `starts_at`/`ends_at` (prevents empty string from being saved when form has empty timezone).

**Nitpicks (deferred per Section 2):** FormField import from @project-flame/lib, EditEventDetailsTab parsed-value reuse, useAppEvents timezone-helper extraction — logged in NITPICKS_TODOS.md.

**Files:** `docs/fixes/MARCH_2026_FIXES.md`, `apps/mobile/app/(tabs)/create-event.tsx`

---

### #439 — Web Parity Gate: RSVP consumer/validator sources (Mar 11, 2026)

- **Web Parity Gate — P8-8 (Registration Form Builder):** Added web RSVP consumer/validator sources to the parity block. New table documents `apps/web/app/api/rsvp/route.ts` (POST handler reads `registration_form_config` from event, validates `registration_data`; inline validation at lines 726–778) and `apps/web/app/components/modals/RegistrationFormModal.tsx` (renders form for attendees). Added note under API Parity Evidence: rsvp/route.ts validates registration_data against form config; mobile-generated config is parsed identically. Added note under Calculation Parity Evidence: rsvp/route.ts handler validates against `event.registration_form_config` so reviewers can confirm parity.

**Files:** `docs/fixes/MARCH_2026_FIXES.md`

---

### #440 — Currency-aware platform fixed fee defaults (Mar 11, 2026)

**Problem:** The Q1 fee change (10% + $0.99) hardcoded `DEFAULT_FIXED_FEE_CENTS = 99` and the DB column default as 99 minor units. For USD/EUR this is correct (~$0.99), but for MXN, DOP, and COP — all in `SUPPORTED_CURRENCIES` — 99 minor units equals effectively $0 (MXN $0.99 ≈ $0.055 USD, DOP $0.99 ≈ $0.017, COP $0.99 ≈ $0.00025). The fixed fee component of the platform fee was effectively zero for any non-USD/EUR/GBP event.

**Industry standard:** Stripe, PayPal, and Adyen all define fixed fees per currency in local minor units — never a single USD-derived integer applied naively across currencies.

**Fix:**

1. **`packages/lib/src/pricing/constants.ts`:** Added `DEFAULT_FIXED_FEE_BY_CURRENCY` map with ~$0.99 USD equivalents in each currency's minor units (USD: 99, EUR: 99, GBP: 75, MXN: 1800, DOP: 6000, COP: 420000). Added `getDefaultFixedFeeCents(currency)` helper that looks up the map and falls back to `DEFAULT_FIXED_FEE_CENTS` for unknown currencies. Follows the same pattern as the existing `STRIPE_MINIMUM_CENTS` map.
2. **`packages/lib/src/pricing/index.ts`** and **`packages/lib/src/index.ts`:** Exported `DEFAULT_FIXED_FEE_BY_CURRENCY` and `getDefaultFixedFeeCents`.
3. **`apps/web/app/api/events/route.ts`:** Event creation insert now explicitly sets `markup_fixed_cents: getDefaultFixedFeeCents(currency)` instead of relying on the DB column default (which is still 99 for backward compatibility with USD).
4. **`apps/web/app/lib/stripe/fees.ts`:** `getEventMarkup` signature now accepts optional `currency` parameter (default `"USD"`). All three fallback paths use `getDefaultFixedFeeCents(currency)` instead of the hardcoded `DEFAULT_FIXED_FEE_CENTS`. The DB-stored value is still preferred when present.
5. **`apps/web/app/api/purchase/create-payment-intent/route.ts`:** Now passes `eventCurrency` (already resolved) to `getEventMarkup(eventIdVal, eventCurrency)`.
6. **`packages/lib/__tests__/stripe-fees.test.ts`:** Added 10 tests covering all supported currencies, unknown currency fallback, and case-insensitivity. All 19 tests pass.

**Backfill migration (required):** The column `markup_fixed_cents` stores values in the event's local currency minor units. Pre-fix non-USD events (MXN, DOP, COP) with `markup_fixed_cents=99` were undercharging. Pre-deploy, restored, and staging DBs may still contain bad rows; the fix must be proactive rather than relying on a single snapshot. Migration `20260311033747_backfill_markup_fixed_cents_by_currency.sql` corrects affected rows:

- **Behavior:** Updates only rows where `currency IN ('MXN','DOP','COP')` AND `markup_fixed_cents = 99` to the per-currency defaults (1800, 6000, 420000). Idempotent.
- **Rollback:** Narrow to rows this migration modified by using `created_at` (events created before the migration did not have the event-creation fix; events created after have the correct value at insert). Replace `<migration_run_timestamp>` with the actual UTC timestamp when migration `20260311033747` was applied (e.g. from Supabase dashboard or migration logs):
  ```sql
  UPDATE events SET markup_fixed_cents = 99 WHERE currency = 'MXN' AND markup_fixed_cents = 1800 AND created_at < '<migration_run_timestamp>';
  UPDATE events SET markup_fixed_cents = 99 WHERE currency = 'DOP' AND markup_fixed_cents = 6000 AND created_at < '<migration_run_timestamp>';
  UPDATE events SET markup_fixed_cents = 99 WHERE currency = 'COP' AND markup_fixed_cents = 420000 AND created_at < '<migration_run_timestamp>';
  ```
  This avoids reverting newly created events that correctly have 1800/6000/420000 at insert. EUR/GBP with 99 are left unchanged (acceptable).

**Web Parity Gate (checkout/pricing):**

1. **Web source references:** `apps/web/app/lib/stripe/fees.ts` (`getEventMarkup`, `calculateFee`), `apps/web/app/api/purchase/create-payment-intent/route.ts`.
2. **API parity:** `POST /api/purchase/create-payment-intent` returns identical `amounts` (base, fee, total, currency) to both web and mobile; fee calculation is server-side only.
3. **Calculation parity:** Shared `packages/lib` constants `getDefaultFixedFeeCents` and `DEFAULT_FIXED_FEE_BY_CURRENCY` used; events insert sets `markup_fixed_cents` via `getDefaultFixedFeeCents(currency)`; create-payment-intent passes `eventCurrency` to `getEventMarkup`.
4. **Edge case verification:** `packages/lib/__tests__/stripe-fees.test.ts` (getDefaultFixedFeeCents — all currencies, fallback, case-insensitivity), `apps/web/__tests__/stripe-fees.test.ts` (calculateFee).
5. **Cross-platform behavior:** Mobile totals change because fees are computed server-side by create-payment-intent; no client mobile code changed, but mobile behavior is affected (receives corrected amounts). Both platforms call the same API and display the same fee breakdown.

Copy this Web Parity Gate block into the PR description before merge to provide evidence for reviewers.

**Files:** `packages/lib/src/pricing/constants.ts`, `packages/lib/src/pricing/index.ts`, `packages/lib/src/index.ts`, `apps/web/app/api/events/route.ts`, `apps/web/app/lib/stripe/fees.ts`, `apps/web/app/api/purchase/create-payment-intent/route.ts`, `packages/lib/__tests__/stripe-fees.test.ts`, `supabase/migrations/20260311033747_backfill_markup_fixed_cents_by_currency.sql`

---

### #441 — Deferred-item path standardization (Mar 12, 2026)

Updated `MARCH_DESIGN_WEB_UPDATES.md` deferred-item bullets to use fully qualified todo doc paths (`docs/todos/WEB_ACCESSIBILITY_TODOS.md`, `docs/todos/WEB_NITPICKS_TODOS.md`) instead of bare filenames so references match project convention.

**Files:** `docs/fixes/MARCH_DESIGN_WEB_UPDATES.md`

---

## Phase 9 Web Design Updates (Mar 12, 2026)

Entries below migrated from `docs/fixes/MARCH_DESIGN_WEB_UPDATES.md` (Phase 9-4 and related PR review fixes). Canonical log: this file.

---

### #442 — Mobile cleanup: deleted apps/mobile/app/events.tsx (Mar 12, 2026)

Legacy route, unreachable via navigation (no tab, screen, or CTA navigated to `/events`). The events listing flow is covered by Discover → organizer pills → `organizer/[slug]`, which uses the same `EventsScreenBody` and `EventsScreenStatus` components. Note: `app/events/[slug].tsx` (event detail deep links) remains untouched.

**Files:** `apps/mobile/app/events.tsx` (deleted)

---

### #443 — Deleted ExploreCategories.tsx (Mar 12, 2026)

Never rendered by `LegacyHomeContent`; contained dead `router.push("/events")` reference.

**Files:** `apps/mobile/components/home/ExploreCategories.tsx` (deleted)

---

### #444 — EventsSection.tsx: updated default onExploreAll (Mar 12, 2026)

Changed fallback from `/events` to `/discover`. Never executed on iOS (all callers pass `showExploreAll={false}`), but prevents dead route if ever enabled.

**Files:** `apps/mobile/components/home/EventsSection.tsx`

---

### #445 — HeroCarousel.tsx: updated fallback onEventPress (Mar 12, 2026)

Changed from `/events` to `/discover`. Never executed (LegacyHomeContent always passes `onEventPress`), but prevents dead route.

**Files:** `apps/mobile/components/home/HeroCarousel.tsx`

---

### #446 — Web cleanup: deleted catalog.css (Mar 12, 2026)

`apps/web/app/styles/components/catalog.css` was legacy CSS never imported by any file (EventsCatalog uses Tailwind exclusively).

**Files:** `apps/web/app/styles/components/catalog.css` (deleted)

---

### #447 — Deleted yoga-catalog.jpg (Mar 12, 2026)

`apps/web/public/yoga-catalog.jpg` was only referenced by the deleted `catalog.css`.

**Files:** `apps/web/public/yoga-catalog.jpg` (deleted)

---

### #448 — Phase 9-4 doc: corrected source reference (Mar 12, 2026)

Corrected source reference from deleted `events.tsx` to the active Discover → organizer flow.

---

### #449 — New /discover route (Mar 12, 2026)

Created `apps/web/app/discover/page.tsx` — server component fetching events (with `is_featured`, `description`) and organizers, processing into `upcomingEvents`, `featuredEvents`, `spotlightEvent`. Renders `DiscoverContent` client component.

**Files:** `apps/web/app/discover/page.tsx`

---

### #450 — DiscoverContent.tsx (Mar 12, 2026)

Client component orchestrating all 8 sections to mirror mobile `LegacyHomeContent`: HeroCarousel → PartnerLogos → FeaturedEvents → ExploreOrganizers → SpotlightCard → HostBanner → UpcomingEvents → FAQSection. Max-width 800px container, `gap-[30px]` between sections.

**Files:** `apps/web/app/components/discover/DiscoverContent.tsx`

---

### #451 — HeroCarousel.tsx (discover) (Mar 12, 2026)

Auto-advancing (5s) image carousel of upcoming events with snap scrolling, dots indicator (active: `w-6 bg-white-100`, inactive: `w-[6px] bg-white-30`), desktop nav arrows. Event images link to `/events/{slug}`. Uses `next/image`.

**Files:** `apps/web/app/components/discover/HeroCarousel.tsx`

---

### #452 — PartnerLogos.tsx (Mar 12, 2026)

"We've already powered events at" + horizontal logo strip (ZLU, Kora, Hush, G2G, CF). Logos copied from `apps/mobile/assets/` to `apps/web/public/partners/`. Uses `next/image`.

**Files:** `apps/web/app/components/discover/PartnerLogos.tsx`

---

### #453 — Partner logos: cf-logo.jpg → cf-logo.png asset migration (Mar 12, 2026)

Migrated CF partner logo from JPG to PNG format for consistency with other partner logos (zlu, kora, hush, g2g). Part of Phase 9 Discover/Home updates. Impacted assets: `apps/mobile/assets/cf-logo.png` (mobile `partnerLogos` in mock.ts), `apps/web/public/partners/cf-logo.png` (web `PartnerLogos.tsx`). Both mobile and web now reference `.png`; old `cf-logo.jpg` removed.

**Files:** `apps/mobile/data/mock.ts`, `apps/web/app/components/discover/PartnerLogos.tsx`, `apps/mobile/assets/cf-logo.png`, `apps/web/public/partners/cf-logo.png`

---

### #454 — EventsSection.tsx (discover) (Mar 12, 2026)

Reusable horizontal scrollable event card section used for both "Featured Events" and "Upcoming Events". Cards match `HomeFeedEventCard` style: aspect-square, date badge, RSVP badge, gradient overlay, title/date/location/price. Uses `next/image`, `getLowestPrice`, `react-icons`.

**Files:** `apps/web/app/components/discover/EventsSection.tsx`

---

### #454 — SpotlightCard.tsx (Mar 12, 2026)

Single spotlight event card with 237px hero image, event details (date/time with "Today" badge, location, price), "Reserve Your Spot" CTA. Matches mobile `SpotlightCard` layout.

**Files:** `apps/web/app/components/discover/SpotlightCard.tsx`

---

### #455 — HostBanner.tsx (Mar 12, 2026)

"Host your own events" / "Apply to become an organizer" CTA in card layout (icon circle + text + chevron). Links to `/?onboarding=true`.

**Files:** `apps/web/app/components/discover/HostBanner.tsx`

---

### #456 — FAQSection.tsx (Mar 12, 2026)

6 expandable FAQ items (same content as mobile). Chevron toggle with rotation animation. "View all FAQs" external link to `https://flme.co/faqs`.

**Files:** `apps/web/app/components/discover/FAQSection.tsx`

---

### #457 — types.ts (discover) (Mar 12, 2026)

Shared types (`DiscoverEvent`, `DiscoverOrganizer`, `FAQItem`) using `Pick<>` from `@project-flame/lib` for `TicketStage`, `TicketTier`, `OrganizationPublic`.

**Files:** `apps/web/app/components/discover/types.ts`

---

### #458 — Navbar.tsx: EVENTS → DISCOVER (Mar 12, 2026)

Changed "EVENTS" nav link to "DISCOVER" pointing to `/discover`.

**Files:** `apps/web/app/components/Navbar.tsx`

---

### #459 — HomeContent.tsx: FeaturedEventsCta link (Mar 12, 2026)

Updated inline `FeaturedEventsCta` link from `/events` to `/discover`.

**Files:** `apps/web/app/components/HomeContent.tsx`

---

### #460 — FeaturedEventsCta.tsx: link to /discover (Mar 12, 2026)

Updated link from `/events` to `/discover`.

**Files:** `apps/web/app/components/home/FeaturedEventsCta.tsx`

---

### #462 — purchase/success: Browse More Events link (Mar 12, 2026)

Updated "Browse More Events" link from `/events` to `/discover`.

**Files:** `apps/web/app/purchase/success/page.tsx`

---

### #463 — UserDashboard.tsx: Browse Events link (Mar 12, 2026)

Updated "Browse Events" link from `/events` to `/discover`.

**Files:** `apps/web/app/components/UserDashboard.tsx`

---

### #464 — ExploreOrganizers.tsx: Image + layout (Mar 12, 2026)

Replaced raw `<img>` with `next/image` Image. Removed redundant `<section>` wrapper and nested `max-w-[800px]` container (parent provides these). Centered title to match mobile.

**Files:** `apps/web/app/components/ExploreOrganizers.tsx`

---

### #465 — EventsSection.tsx: nav arrows (Mar 12, 2026)

Added prev/next arrow buttons (right of section title) for sliding through events, matching HeroCarousel pattern. Buttons scroll horizontally by one card. Visible when `count > 1`.

**Files:** `apps/web/app/components/discover/EventsSection.tsx`

---

### #466 — HostBanner.tsx: megaphone icon + create-event behavior (Mar 12, 2026)

Replaced `FiMic` with `IoMegaphone` (react-icons/io5). Switched from static Link to button with same logic as Create Event: uses `useUserRole` + `useRouter`; when signed in routes to `/organizer?tab=create-event`, `/account`, or `/?onboarding=true` based on org status; when not signed in wraps in `SignInButton` with `forceRedirectUrl="/onboarding"`.

**Files:** `apps/web/app/components/discover/HostBanner.tsx`

---

### #467 — FAQSection.tsx: View all FAQs spacing (Mar 12, 2026)

Added `mb-10` to the "View all FAQs" link container so it does not touch the footer.

**Files:** `apps/web/app/components/discover/FAQSection.tsx`

---

### #468 — Footer.tsx: Instagram link (Mar 12, 2026)

Updated href from `https://instagram.com/flame.ec` to `https://instagram.com/flame__app`.

**Files:** `apps/web/app/components/Footer.tsx`

---

### #469 — DiscoverEventCard: date/RSVP pills bold (Mar 12, 2026)

Added `font-bold` alongside `font-poppins` for the date day number and RSVP label so they render bold on web (font-poppins-bold only sets font-family on web; font-weight requires explicit `font-bold`).

**Files:** `apps/web/app/components/discover/EventsSection.tsx`

---

### #470 — CRUCIAL_IOS_TO_WEB_TODOS.md #14: org placeholder image (Mar 12, 2026)

Added note: Organizations not taking default/placeholder image from Supabase when `logo_url` is null (applies to both web and iOS). Fix later.

---

### #471 — HomeFeedEventCard.tsx: date/RSVP pills bold (Mar 12, 2026)

Added `font-bold` to day number and RSVP label for consistency with DiscoverEventCard (same font-weight fix as #468).

**Files:** `apps/web/app/components/HomeFeedEventCard.tsx`

---

### #472 — HeroCarousel.tsx: gap and border radius (Mar 12, 2026)

Added `gap-4` between slides, `rounded-card overflow-hidden` on each slide, `w-[calc(100%-1rem)] min-w-[280px]` for slide sizing (one slide visible with peek of next), and `px-4` on container for consistent horizontal padding.

**Files:** `apps/web/app/components/discover/HeroCarousel.tsx`

---

### #473 — Mobile HeroCarousel: defaultOnEventPress (Mar 12, 2026)

`defaultOnEventPress` now routes to `/event/${event.id}` instead of `/discover`; renamed `_event` to `event` and use `event.id` for navigation.

**Files:** `apps/mobile/components/home/HeroCarousel.tsx`

---

### #474 — FAQSection.tsx: FAQItemType rename (Mar 12, 2026)

Renamed imported type `FAQItem` to `FAQItemType` to avoid conflict with local `FAQItem` component; updated `faqs` array and component props to use `FAQItemType`.

**Files:** `apps/web/app/components/discover/FAQSection.tsx`

---

### #475 — HeroCarousel.tsx: auto-advance fix (Mar 12, 2026)

Fixed redundant `setActiveIndex` in auto-advance useEffect — added `activeIndexRef` to track current index; interval callback now calls `scrollToIndex(next)` directly (no outer `setActiveIndex` wrapper) since `scrollToIndex` already updates state.

**Files:** `apps/web/app/components/discover/HeroCarousel.tsx`

---

### #476 — CRUCIAL_IOS_TO_WEB_TODOS.md #14: restructure (Mar 12, 2026)

Restructured to follow mobile→web pattern: added "Mobile (done)" section (ExploreOrganizers, OrgSelector, EventsHero, OrganizationSettingsTab) and "Web (TODO)" section; ExploreOrganizers already has fallback, audit other locations.

---

### #477 — PR template: Phase 9 focus (Mar 12, 2026)

Replaced `.github/pull_request_template.md` with Phase 9–centric version (Tailwind, mobile layout match, design tokens, CRUCIAL todos). Full Phase 8 mobile blocks preserved in `.github/pull_request_template.phase4-8-backup.md` for reference.

**Files:** `.github/pull_request_template.md`

---

### #478 — HeroCarousel.tsx: onScroll sync + timer reset (Mar 12, 2026)

Added onScroll handler to sync activeIndex when user manually scrolls (rAF-throttled). Reset auto-advance timer on any index change by adding activeIndex to effect deps so manual prev/next/dot clicks restart the 5s interval. Fixed prev/next handlers to read from activeIndexRef for consistency.

**Files:** `apps/web/app/components/discover/HeroCarousel.tsx`

---

### #479 — HostBanner.tsx: gate routing behind !isRoleLoading (Mar 12, 2026)

Gate routing behind `!isRoleLoading`; signed-in users no longer routed to onboarding while useUserRole query is loading.

**Files:** `apps/web/app/components/discover/HostBanner.tsx`

---

### #480 — Token compliance: text-white-100 on badges (Mar 12, 2026)

Replaced `text-white` with `text-white-100` on RSVP and date badges in EventsCatalog.tsx, HomeFeedEventCard.tsx, EventsSection.tsx.

**Files:** `apps/web/app/components/EventsCatalog.tsx`, `apps/web/app/components/HomeFeedEventCard.tsx`, `apps/web/app/components/discover/EventsSection.tsx`

---

### #481 — Navbar.tsx: Next.js Link (Mar 12, 2026)

Replaced internal `<a href>` with Next.js `<Link>` for logo, nav links, and dashboard links to enable App Router client-side transitions.

**Files:** `apps/web/app/components/Navbar.tsx`

---

### #482 — discover/page.tsx: exclude spotlight from sections (Mar 12, 2026)

Exclude spotlight event from featuredEvents and upcomingEvents passed to EventsSection to avoid duplicate display (spotlight appears once in SpotlightCard only).

**Files:** `apps/web/app/discover/page.tsx`

---

### #483 — EventsSection.tsx: offsetLeft-based scrollToIndex (Mar 12, 2026)

Use offsetLeft-based scrollToIndex (matching HeroCarousel) instead of index × cardWidth to account for container padding; prev/next use getCurrentIndex() for accurate target.

**Files:** `apps/web/app/components/discover/EventsSection.tsx`

---

### #484 — EventsSection.tsx: aria-hidden on chevron icons (Mar 12, 2026)

Added `aria-hidden` to FiChevronLeft and FiChevronRight inside prev/next navigation buttons so the icons are decorative (parent buttons already have aria-labels). Prevents redundant screen reader output.

**Files:** `apps/web/app/components/discover/EventsSection.tsx`

---

### #485 — Deferred to WEB_ACCESSIBILITY_TODOS / WEB_NITPICKS_TODOS (Mar 12, 2026)

- **WEB_ACCESSIBILITY_TODOS.md:** FAQSection toggle button — add aria-expanded, aria-controls, stable id on answer panel.
- **WEB_NITPICKS_TODOS.md:** DiscoverContent, PartnerLogos, SpotlightCard, ExploreOrganizers "use client" removal; FlameImage for EventsSection/HeroCarousel; discover page shared types.

---

### #486 — FAQs moved to @project-flame/lib (Mar 12, 2026)

Moved `faqs` data from `apps/mobile/data/mock.ts` and web `FAQSection.tsx` into `@project-flame/lib` as single source of truth. Both web and mobile now import `faqs` from `@project-flame/lib`. Removes web→mobile coupling. WEB_NITPICKS_TODOS.md FAQSection item marked fixed.

**Files:** `packages/lib/src/content/faqs.ts`, `packages/lib/src/index.ts`, `apps/web/app/components/discover/FAQSection.tsx`, `apps/web/app/components/discover/types.ts`, `apps/mobile/components/home/LegacyHomeContent.tsx`, `apps/mobile/data/mock.ts`, `docs/todos/WEB_NITPICKS_TODOS.md`

---

### #487 — iOS app displays correct event timezone (Mar 13, 2026)

**Issue:** All events everywhere displayed "GMT" as the timezone label. Hermes (React Native) on iOS has a known bug where `Intl.DateTimeFormat` with `timeZoneName: "short"` returns fragmented parts (e.g., only "GMT"). Additionally, the ticket wallet (user-ticket-mappers) and ticket detail screen used device-local formatting without event timezone.

**Fixes:**

1. **packages/lib:** `getTimezoneAbbr` now falls back to extracting `shortOffset` (e.g., "GMT+1", "GMT-5") from the formatted string when the primary path returns "GMT" or empty for non-UTC zones.
2. **useUserTickets:** Added `timezone` to event select (TICKET_SELECT, RSVP_SELECT, PROMO_SELECT) and EventRow interface.
3. **user-ticket-mappers:** Uses `formatEventDate`, `formatEventTime`, `getTimezoneAbbr` with event timezone; appends correct tz label to timeRange.
4. **ticket/[id].tsx:** Uses `formatEventDate`, `formatEventTime`, `getTimezoneAbbr` with event timezone for date/time display.

**Files:** `packages/lib/src/utils/format.ts`, `packages/lib/src/types/ticket.ts`, `apps/mobile/hooks/useUserTickets.ts`, `apps/mobile/lib/user-ticket-mappers.ts`, `apps/mobile/app/ticket/[id].tsx`

---

---

### #488 — Multi-currency: tier currency propagated at event creation (Mar 16, 2026)

`ticket_tiers` rows were always inserted with the DB default `currency = 'USD'`, causing RSVP payments to charge in USD even for non-USD events. Fixed `tierInserts` in the event creation route to set `currency: validatedData.event.currency.toUpperCase()`. Also updated the price-warning `toLocaleString` call to use event currency instead of hardcoded `"USD"`.

**Files:** `apps/web/app/api/events/route.ts`

---

### #489 — Multi-currency: ticket email notifications use event currency (Mar 16, 2026)

Both `formatPrice` closures in ticket email generation (PDF and HTML) were hardcoded to `"USD"`. Added `currency?: string` to `TicketEmailData` and updated both closures to use `data.currency ?? "USD"`. Updated all four callers to fetch and pass event currency:

- `apps/web/app/lib/orders.ts`: added `currency` to event SELECT and passed to email call.
- `apps/web/app/api/organizer/rsvps/[id]/approve/route.ts`: passed `rsvp.events.currency` at both email call sites (select already fetched it).
- `apps/web/app/lib/purchase-tokens.ts`: added `currency` to `RsvpWithDetails.events` interface and to the rsvp SELECT query.
- `apps/web/app/api/purchase/complete-direct-free/route.ts`: passed `rsvpDetails.events.currency`.

**Files:** `apps/web/app/lib/email/ticket-notifications.ts`, `apps/web/app/lib/orders.ts`, `apps/web/app/api/organizer/rsvps/[id]/approve/route.ts`, `apps/web/app/lib/purchase-tokens.ts`, `apps/web/app/api/purchase/complete-direct-free/route.ts`

---

### #490 — Multi-currency: RSVP email notifications use event currency (Mar 16, 2026)

`formatPrice` in `generateApprovalEmailHtml` was hardcoded to `"USD"`. Added `currency?: string` to `RsvpEmailData` and updated `formatPrice` to use `data.currency ?? "USD"`. (`sendRsvpApprovalEmail` is currently unused but the fix is in place for when it is called.)

**Files:** `apps/web/app/lib/email/rsvp-notifications.ts`

---

### #491 — Multi-currency: RsvpManagement component uses event currency (Mar 16, 2026)

`formatPrice` in `RsvpManagement` was hardcoded to `"USD"`. Added `currency?: string` to the `event` prop interface and updated `formatPrice` to use `event.currency ?? "USD"`. The page that renders this component uses `select('*')` so currency is already included.

**Files:** `apps/web/app/components/RsvpManagement.tsx`

---

### #492 — Multi-currency: OrganizerDashboard + EventsTiersView use event currency (Mar 16, 2026)

`formatPrice` in `OrganizerDashboard` was hardcoded to `"USD"`. Changed signature to `(cents, currency = "USD")`. Updated `EventsTiersView` prop type to `(cents: number, currency?: string) => string` and updated all 12 call sites inside event-map loops to pass `event.currency`.

**Files:** `apps/web/app/components/OrganizerDashboard.tsx`, `apps/web/app/components/organizer/EventsTiersView.tsx`

---

### #493 — Multi-currency: AdminDashboard formatCurrency uses currency param (Mar 16, 2026)

`formatCurrency` was hardcoded to `"USD"`. Changed signature to `(amount, currency = "USD")`. Global revenue aggregate stats still default to USD (platform-wide aggregate has no single event currency).

**Files:** `apps/web/app/components/AdminDashboard.tsx`

---

### #494 — Multi-currency: dev email preview formatPrice accepts currency param (Mar 16, 2026)

`formatPrice` in the dev email preview route was hardcoded to `"USD"`. Changed to `(cents, currency = "USD")` so it can be extended with non-USD fixture data.

**Files:** `apps/web/app/api/dev/email-preview/route.ts`

---

### #495 — Multi-currency: AdminDashboard formatCurrency + admin revenue column fix (Mar 16, 2026)

Two related bugs fixed. (a) `admin/page.tsx` was selecting the non-existent `price` column from `ticket_tiers` (column is `price_cents`), so `globalStats.totalRevenue` was always 0. Changed query to `ticket_tiers(price_cents)` and updated reducer to reference `price_cents`. (b) `AdminDashboard.tsx` `formatCurrency` was multiplying by 100 (`Math.round(amount * 100)`) before calling `formatCentsAsPrice`, treating its input as dollars; removed the multiplication so it accepts cents directly.

**Files:** `apps/web/app/admin/page.tsx`, `apps/web/app/components/AdminDashboard.tsx`

---

### #496 — Multi-currency: events/route.ts high-price warning uses formatCentsAsPrice (Mar 16, 2026)

Replaced manual `(stage.price_cents / 100).toLocaleString("en-US", { style: "currency", ... })` in the unusually-high-price `console.warn` with `formatCentsAsPrice(stage.price_cents, validatedData.event.currency.toUpperCase())`. Added `formatCentsAsPrice` to the `@project-flame/lib` import.

**Files:** `apps/web/app/api/events/route.ts`

---

### #497 — Multi-currency: DashboardView per-event and aggregate revenue display (Mar 16, 2026)

Three related fixes. (a) Total Revenue stat card: replaced hardcoded `$` + `/100 .toFixed(2)` with per-currency grouping — events grouped by `event.currency ?? "USD"`, cents summed, one `formatCentsAsPrice` line per currency. (b) Four per-event revenue cells (current events mobile card, current events desktop table, past events mobile card, past events desktop table): replaced `${(totalRevenue / 100).toFixed(2)}` with `formatCentsAsPrice(totalRevenue, event.currency ?? "USD")`. (c) Prop types: exported `PurchaseDetailsSectionProps` from `OrganizerDashboard.tsx`; typed `PurchaseDetailsSection` as `React.ComponentType<PurchaseDetailsSectionProps>` and `queryClient` as `QueryClient` from `@tanstack/react-query`.

**Files:** `apps/web/app/components/organizer/DashboardView.tsx`, `apps/web/app/components/OrganizerDashboard.tsx`

---

## Phase 9-5 — Checkout & RSVP Screen Design (p9-5-5.5)

### #498 — StripePurchaseFlow.tsx — full dark redesign (Tailwind) (Mar 16, 2026)

Replaced all `purchase-*` CSS class usage with Tailwind utility classes matching the Flame dark design system. Full-page layout `min-h-screen bg-background py-8 px-4`, max-width container `max-w-[600px] mx-auto`. Event image `rounded-card h-[200px] object-cover`. Event name `text-white-100 text-2xl font-poppins-semibold uppercase`. Meta rows (date, venue) use `w-9 h-9 rounded-full bg-white-10` icon circles with `text-white-100 text-sm font-poppins-light` matching mobile EventMeta pattern.

**Files:** `apps/web/app/components/StripePurchaseFlow.tsx`

---

### #499 — StripePurchaseFlow.tsx — order summary card (Mar 16, 2026)

Glass card `bg-white-5 rounded-card p-4`. Ticket tier info in nested `bg-white-5 rounded-card` row. Attendee row with icon circle. Promo code section with `border-t border-white-10` divider. Applied promo state: `bg-[#5DDBB1]/10 border-[#5DDBB1]/30 rounded-card` with teal checkmark icon. Price breakdown rows with `text-white-50` labels / `text-white-100` values. Total row `text-white-100 text-lg font-poppins-semibold` with `border-t border-white-10` separator.

**Files:** `apps/web/app/components/StripePurchaseFlow.tsx`

---

### #500 — StripePurchaseFlow.tsx — action buttons (Mar 16, 2026)

Primary CTA `bg-white-100 text-dark rounded-pill px-6 py-4 font-poppins-semibold`. Cancel button `border border-white-30 text-white-100 rounded-pill`. Loading states use Tailwind `animate-spin rounded-full border-2 border-white-20 border-t-white-100` spinner. Success/error states: centered card `bg-white-5 border-white-20 rounded-card` with icon circles (`bg-[#5DDBB1]/20` for success, `bg-[rgba(234,51,112,0.1)]` for error).

**Files:** `apps/web/app/components/StripePurchaseFlow.tsx`

---

### #501 — RsvpPaymentModal.tsx — full dark redesign (Tailwind) (Mar 16, 2026)

Replaced CSS module / legacy classes with Tailwind. Overlay `fixed inset-0 bg-black/60 backdrop-blur-sm z-[1000]`. Modal panel `bg-surface border-white-20 rounded-t-[24px] sm:rounded-card max-w-[600px] max-h-[90vh] overflow-y-auto` — matching mobile `CheckoutMainSheet` bottom-sheet style with drag indicator (`w-10 h-1 rounded-full bg-white-20`).

**Files:** `apps/web/app/components/modals/RsvpPaymentModal.tsx`

---

### #502 — RsvpPaymentModal.tsx — order summary (Mar 16, 2026)

Same glass card pattern as StripePurchaseFlow: event name `text-white-50 text-xs uppercase`, ticket info card `bg-white-5 rounded-card p-4`, event meta rows with `bg-white-10` icon circles, promo code section with teal applied state. Price breakdown and total matching mobile `CheckoutMainSheet` separator/font pattern.

**Files:** `apps/web/app/components/modals/RsvpPaymentModal.tsx`

---

### #503 — RsvpPaymentModal.tsx — payment authorization notice (Mar 16, 2026)

Dark notice block `bg-[rgba(234,51,112,0.1)] rounded-card px-4 py-3` with `text-white-80 font-poppins-light`. Matches mobile RSVP warning style. Loading state: inline spinner + `text-white-70 font-poppins-light`. Error block reuses same `rgba(234,51,112,0.1)` background. Cancel button `border-white-30 rounded-pill`.

**Files:** `apps/web/app/components/modals/RsvpPaymentModal.tsx`

---

### #504 — StripePaymentForm.tsx — dark redesign (Mar 16, 2026)

Error messages: `bg-[rgba(234,51,112,0.1)] rounded-card px-4 py-3` with `text-error` icon + text. Submit button: `bg-white-100 text-dark rounded-pill py-4 font-poppins-semibold` (full-width, pill). Processing state: `animate-spin` spinner with `border-dark/30 border-t-dark`. "Secured by Stripe" notice: `text-white-30 text-xs font-poppins-light`. Removed old CSS `.stripe-payment-form`, `.payment-form-footer`, `.payment-submit-btn`, etc.

**Files:** `apps/web/app/components/StripePaymentForm.tsx`

---

### #505 — Stripe Elements appearance — dark theme (Mar 16, 2026)

Both `StripePurchaseFlow` and `RsvpPaymentModal` updated from `theme: "stripe"` (light) to `theme: "night"` (dark). Key overrides: `colorBackground: "#08131A"` (surface token), `colorText: "#F9FBFE"` (white-100), `colorPrimary: "#FF0000"` (primary), `colorDanger: "#EA3370"` (error token), `borderRadius: "16px"` (card token), input `backgroundColor: "rgba(255,255,255,0.05)"` / `border: "1px solid rgba(255,255,255,0.2)"` matching `bg-white-5 border-white-20` pattern. Input focus: `borderColor: "rgba(255,255,255,0.6)"` + `boxShadow: "0 0 0 3px rgba(255,255,255,0.1)"`.

**Files:** `apps/web/app/components/StripePurchaseFlow.tsx`, `apps/web/app/components/modals/RsvpPaymentModal.tsx`

---

### #506 — purchase/success/page.tsx — dark redesign (Mar 16, 2026)

Replaced all `success-*` and `purchase-*` CSS classes with Tailwind. Layout `min-h-screen bg-background py-8 px-4 max-w-[600px] mx-auto`. Success icon: `w-16 h-16 rounded-full bg-[#5DDBB1]/20` with `text-[#5DDBB1]` checkmark. Order summary card `bg-white-5 rounded-card`. Event image thumbnail `w-[120px] h-[160px] rounded-card`. Price breakdown rows with `border-white-10` dividers and `text-[#5DDBB1]` discount rows. QR codes rendered on `bg-white rounded-card p-4` for contrast. Promo discount row uses `text-[#5DDBB1]`. Warning notice `bg-[#FBD68D]/10 border-[#FBD68D]/30 rounded-card`. Action buttons: primary pill `bg-white-100 text-dark`, secondary outline `border-white-30 text-white-100`.

**Files:** `apps/web/app/purchase/success/page.tsx`

---

### #507 — rsvp/success/page.tsx — dark redesign (Mar 16, 2026)

Removed inline `<style jsx>` block entirely (133 lines of legacy CSS). Replaced with Tailwind. Loading: full-screen centered `animate-spin` spinner. Success: `bg-white-5 border-white-20 rounded-card p-8` with `bg-[#5DDBB1]/20` icon circle and `text-[#5DDBB1]` checkmark. Error: `bg-[rgba(234,51,112,0.1)]` icon circle, `text-error` X icon. Removed unused `useRouter` import and `router` declaration.

**Files:** `apps/web/app/rsvp/success/page.tsx`

---

### #508 — EventDetail.tsx — RSVP button label (Mar 16, 2026)

Changed inline CTA button text from `"Continue to Checkout"` to `"Request RSVP"` for `event.requires_rsvp` events. Floating pill already said "Request RSVP" (entry #102); inline CTA now matches. Non-RSVP button text (`"Continue to Checkout"` / `"Claim Free Ticket"`) unchanged.

**Files:** `apps/web/app/components/EventDetail.tsx`

---

### #509 — StripePurchaseFlow.tsx + RsvpPaymentModal.tsx — Stripe Elements focus/selection colours (Mar 16, 2026)

Changed input focus and tab-selected states from primary red to white. `.Input:focus` → `borderColor: "rgba(255,255,255,0.6)"`, `boxShadow: "0 0 0 3px rgba(255,255,255,0.1)"`. `.Tab--selected` → `borderColor: "rgba(255,255,255,0.6)"`, `backgroundColor: "rgba(255,255,255,0.1)"`, `boxShadow: "0 0 0 1px rgba(255,255,255,0.5)"`. `focusBoxShadow` variable updated to match. `colorPrimary: "#FF0000"` retained for other Stripe-owned elements. Matches mobile pattern where tier focus state was changed from primary to white.

**Files:** `apps/web/app/components/StripePurchaseFlow.tsx`, `apps/web/app/components/modals/RsvpPaymentModal.tsx`

---

### #510 — StripePurchaseFlow.tsx — discount row rendering "0" (Mar 16, 2026)

Fixed spurious `0` text rendered below Subtotal row. `{amounts.discount && amounts.discount > 0 && (...)}` — when `amounts.discount` is `0`, JS short-circuits to the falsy `0` value which React renders as text. Changed to `{amounts.discount != null && amounts.discount > 0 && (...)}` (matches existing pattern in RsvpPaymentModal).

**Files:** `apps/web/app/components/StripePurchaseFlow.tsx`

---

### #511 — purchase/success/page.tsx — orderDetails guard (Mar 16, 2026)

Added early return after the error check for when `orderDetails` is null (e.g., no `order_id` in URL). Renders an "Order Not Found" card (FiAlertCircle, message, `/account` link) instead of the success header so no confirmation UI renders without an order.

**Files:** `apps/web/app/purchase/success/page.tsx`

---

### #512 — StripePurchaseFlow.tsx — free-ticket currency (Mar 16, 2026)

Changed hardcoded `currency: "USD"` in the `totalCents === 0` branch to `currency: details.event.currency ?? "USD"` so the free-purchase amounts reflect the actual event currency.

**Files:** `apps/web/app/components/StripePurchaseFlow.tsx`

---

### #513 — RsvpPaymentModal.tsx — zero-total promo guard (Mar 16, 2026)

Added `newAmounts.total === 0` check in both `handleApplyPromoCode` and `handleRemovePromoCode`. When the repriced total is zero, sets `clientSecret` and `paymentIntentId` to `null` (triggering the free "Complete RSVP" branch); otherwise sets them to the new values as before. Mirrors the zero-total guard in StripePurchaseFlow.tsx.

**Files:** `apps/web/app/components/modals/RsvpPaymentModal.tsx`

---

### #514 — RsvpPaymentModal.tsx — promo disabled guard (Mar 16, 2026)

Changed `!paymentIntentId` to `!amounts` in the promo input `disabled`, button `disabled`, and `onKeyDown` guard. `amounts` is the correct initialization signal — `paymentIntentId` can legitimately be `null` when the total is zero (free via promo or free stage), which would incorrectly lock the promo field. `amounts !== null` means initialization completed successfully regardless of free/paid state.

**Files:** `apps/web/app/components/modals/RsvpPaymentModal.tsx`

---

### #515 — RsvpPaymentModal.tsx — RegistrationData strict type (Mar 16, 2026)

Replaced `Record<string, any> | null` with `RegistrationData | null` in the `onSuccess` prop signature and `registrationData` prop. Exported `RegistrationData` and `RegistrationDataValue` from `EventDetail.tsx` (previously unexported) and imported the type in `RsvpPaymentModal.tsx`.

**Files:** `apps/web/app/components/EventDetail.tsx`, `apps/web/app/components/modals/RsvpPaymentModal.tsx`

---

### #516 — LoadingSpinner.tsx — Tailwind rewrite (Mar 16, 2026)

Replaced all old CSS class names (`loading-container`, `loading-container-full`, `loading-content`, `loading-spinner`, `loading-title`, `loading-subtitle`) — defined in `styles/layout/base.css` which is no longer imported — with Tailwind equivalents. `fullHeight=true` variant: `min-h-screen bg-background flex flex-col items-center justify-center gap-4` with `animate-spin` border-based spinner (`w-10 h-10 border-2 border-white-20 border-t-white-100`), `text-white-100 font-poppins-semibold` title, `text-white-50 font-poppins-light` subtitle. Inline variant: `flex flex-col items-center justify-center gap-3 py-12` with a slightly smaller spinner. Fixes broken loading state on the home page Suspense fallback, purchase page, and `organizer/loading.tsx`.

**Files:** `apps/web/app/components/LoadingSpinner.tsx`

---

### #517 — ConfirmationModal.tsx — Tailwind rewrite (Mar 16, 2026)

Replaced entirely unstyled component — all class names (`confirmation-modal-overlay`, `confirmation-modal`, `confirmation-modal-icon--*`, `confirmation-modal-title`, `confirmation-modal-message`, `btn is--primary`, `loading-spinner`) were defined in old CSS files no longer imported. New implementation: `fixed inset-0 bg-black/60 backdrop-blur-sm z-1000` overlay, `bg-surface border border-white-20 rounded-card max-w-[400px] p-8` card, icon circle with variant-specific colors (success `#5DDBB1`, warning `#F5A623`, error `text-error`, loading `animate-spin` spinner), `text-white-100 font-poppins-semibold` title, `text-white-70 font-poppins-light` message, `bg-white-100 text-dark rounded-pill` action button. Added `"1000": "1000"` to `zIndex` in `tailwind.config.ts` so `z-1000` generates correctly. Fixes "You already requested an RSVP" modal and post-RSVP success/loading modal that previously appeared as unstyled raw text behind the navbar.

**Files:** `apps/web/app/components/modals/ConfirmationModal.tsx`, `apps/web/tailwind.config.ts`

---

### #518 — EventDetail.tsx — pt-16 navbar offset (Mar 16, 2026)

Added `pt-16` to the outer wrapper `<div>` (`min-h-screen bg-background pb-8 pt-16`) so page content clears the fixed 64px navbar. Without this, the "Go Back" button and the top of the event hero card rendered partially hidden behind the navbar. The inner `max-w-[800px]` content div retains `pt-6` for visual breathing room between the navbar and the back button.

**Files:** `apps/web/app/components/EventDetail.tsx`

---

### #519 — events/[slug]/page.tsx — remove unstyled wrapper class (Mar 16, 2026)

Changed outer `<div className="event-page">` to `<div className="bg-background min-h-screen">`. `event-page` was a CSS Module class defined in an old stylesheet no longer imported in `globals.css` — the wrapper div had no styles applied.

**Files:** `apps/web/app/events/[slug]/page.tsx`

---

### #520 — NavbarWrapper.tsx — styled Suspense fallback (Mar 16, 2026)

Replaced `<div className="flame-navbar" />` Suspense fallback (undefined class, zero visual output) with `<div className="fixed top-0 left-0 right-0 z-50 h-16 bg-background/90 border-b border-white-20 backdrop-blur-md" />` so the navbar placeholder matches the actual navbar's appearance during SSR hydration, preventing a layout flash on first load.

**Files:** `apps/web/app/components/NavbarWrapper.tsx`

---

### #521 — iOS org default image — replace placehold.co with Supabase default (Mar 17, 2026)

Three mobile components were falling back to `https://placehold.co/…?text=ORG` when an organization has no `logo_url`. Replaced all three with the real Supabase default: `https://jaoqfvugxmtomdufhswa.supabase.co/storage/v1/object/public/organization-images/default.jpg` — matching the fix applied to the web `ExploreOrganizers.tsx` (#536).

**Files:**

- `apps/mobile/components/home/ExploreOrganizers.tsx` — `PLACEHOLDER_LOGO` → `DEFAULT_ORG_IMAGE`
- `apps/mobile/components/events/EventsHero.tsx` — `PLACEHOLDER_LOGO` → `DEFAULT_ORG_IMAGE` (organizer profile pic in the hero)
- `apps/mobile/components/scanner/OrgSelector.tsx` — `PLACEHOLDER_LOGO` → `DEFAULT_ORG_IMAGE` (org circle in the QR scanner org picker)

---

### #522 — Time display — Dice/Luma "City, Time" standard — shared lib `buildTimeRange` (Mar 17, 2026)

Added `buildTimeRange(startsAt, endsAt, timezone?, city?)` to `@project-flame/lib`. Uses 12-hour `en-US` format and appends city as geographic context with a `·` separator (e.g. `"2:30 PM - 4:30 PM · Madrid"`).

**Final behavior (as of #534):**

- `buildTimeRange` (shared lib) — no timezone abbreviation; uses city suffix for geographic context.
- Mobile event cards — city suffix only via `buildTimeRange`; `getTimezoneAbbr` removed from all mobile list/card components.
- Web `EventDetail` (`apps/web/app/components/EventDetail.tsx`) — timezone abbreviation reintroduced in #534 via `getTimezoneAbbr` for users who need precise timezone awareness before purchasing. List cards (home feed, events catalog) use `buildTimeRange` without abbreviation.

Industry rationale: Dice and Luma always show the city as geographic context alongside the time. This is more readable than a tz abbreviation and avoids the ICU data quality gap that caused `"GMT+1"` instead of `"CET"` (abbreviated tz requires full ICU data not available on all server runtimes). The abbreviation is retained only on event detail screens where it genuinely aids pre-purchase timezone awareness.

**Shared lib changes:**

- `packages/lib/src/utils/format.ts` — `buildTimeRange` added
- `packages/lib/src/utils/index.ts` + `packages/lib/src/index.ts` — export wired
- `packages/lib/src/types/ticket.ts` — `city?: string` added to `UserTicket.ticket_tier.event`

**Mobile changes (removed all `getTimezoneAbbr` + manual timeRange construction):**

- `apps/mobile/hooks/useAppEvents.ts`
- `apps/mobile/app/event/[id].tsx`
- `apps/mobile/app/org-event-detail.tsx`
- `apps/mobile/app/(tabs)/events-management.tsx`
- `apps/mobile/app/(tabs)/org-dashboard.tsx`
- `apps/mobile/hooks/useRsvpManagement.ts` — local `buildTimeRange` helper deleted; imported from lib
- `apps/mobile/lib/user-ticket-mappers.ts`
- `apps/mobile/app/ticket/[id].tsx`
- `apps/mobile/hooks/useUserTickets.ts` — `city` added to `TICKET_SELECT`, `RSVP_SELECT`, `PROMO_SELECT`

---

## Footer Pages Dark Design + Navbar Sidebar Fixes (Mar 17, 2026)

All footer-linked pages converted from legacy CSS modules to Tailwind dark design. Navbar sidebar design-system violations fixed. _(Migrated from MARCH_DESIGN_WEB_UPDATES.md #155–#165.)_

### #523 — Navbar.tsx — WhatsApp inline SVG removed (Mar 17, 2026)

Replaced the hardcoded inline `<svg>` WhatsApp icon in the mobile sidebar with `<IoLogoWhatsapp size={24} />` from `react-icons/io5`. Added proper `href="https://wa.me/593042510906"` with `target="_blank" rel="noopener noreferrer"`. Instagram link also updated with correct URL. Fixes "no inline SVG" rule from the Phase 9 pre-submit checklist.

**Files:** `apps/web/app/components/Navbar.tsx`

---

### #524 — Navbar.tsx — hover:text-primary violation fixed (Mar 17, 2026)

All sidebar navigation links (`ABOUT US`, `DISCOVER`, `MY ACCOUNT`, `LOGIN`) used `hover:text-primary` which is a design-system violation — red (#FF0000) is ONLY for RSVP badges on images. Changed to `hover:text-white-80` on all sidebar nav links and social icon links. Same fix applied to the backdrop for the `IoLogoWhatsapp` and `SiX` icon links.

**Files:** `apps/web/app/components/Navbar.tsx`

---

### #525 — about-flame/page.tsx — dark Tailwind rewrite (Mar 17, 2026)

Removed `legal.css` import. Replaced `legal-page`, `legal-container`, `legal-section` CSS Module classes with Tailwind: `min-h-screen flex flex-col bg-background`, `pt-16` navbar offset, `max-w-[800px] mx-auto px-4 py-12`, Tailwind prose-like `[&_h1]:`, `[&_h2]:`, `[&_p]:` arbitrary variant selectors for all nested text elements. Heading colors: `text-white-100`, body text: `text-white-80`.

**Files:** `apps/web/app/about-flame/page.tsx`

---

### #526 — faqs/FAQsClient.tsx — dark Tailwind rewrite (Mar 17, 2026)

Replaced all `faq-accordion`, `faq-accordion-header`, `faq-accordion-content`, `faq-section`, `faq-question`, `faq-answer` CSS Module classes. New glass-card accordion: `bg-card border-white-30 rounded-card` when open, `bg-white-5 border-white-20 rounded-card` when closed. Section headers: `text-lg font-poppins-semibold text-white-100` with `border-b border-white-20` divider. Question text: `text-sm font-poppins-semibold text-white-100`. Answer text: `text-sm leading-[22px] font-poppins text-white-80`. Chevron icon color: `text-white-50`.

**Files:** `apps/web/app/faqs/FAQsClient.tsx`

---

### #527 — faqs/page.tsx — dark Tailwind rewrite (Mar 17, 2026)

Removed `legal.css` import. Replaced `legal-page`, `legal-container`, `faqs-contact` CSS Module classes. Intro text: `text-sm text-white-80 font-poppins`. "Still need help?" CTA card: `bg-white-5 border border-white-20 rounded-card p-8 text-center` with `bg-white-100 text-dark rounded-pill` button.

**Files:** `apps/web/app/faqs/page.tsx`

---

### #528 — contact/page.tsx — dark Tailwind rewrite (Mar 17, 2026)

Removed `contact-page`, `contact-container`, `contact-header` CSS Module classes. Replaced with `min-h-screen flex flex-col bg-background`, `pt-16`, `max-w-[800px] mx-auto px-4 py-12`. Page title `text-2xl font-poppins-semibold text-white-100`, subtitle `text-sm text-white-80 font-poppins`.

**Files:** `apps/web/app/contact/page.tsx`

---

### #529 — ContactForm.tsx — dark Tailwind rewrite (Mar 17, 2026)

Removed all `contact-form-*` CSS Module classes (`contact-form`, `contact-form-section`, `contact-form-fields`, `contact-form-row`, `contact-form-group`, `contact-form-label`, `contact-form-input`, `contact-form-textarea`, `contact-form-hint`, `contact-form-message`, `contact-form-actions`, `btn-spinner`, `btn is--primary`). New glass card form: `bg-white-5 border border-white-20 rounded-card p-6`. Inputs: `bg-white-5 border border-white-20 rounded-card px-4 py-3 text-sm font-poppins text-white-100 placeholder:text-white-50 focus:border-white-50`. Labels: `text-xs font-poppins-medium text-white-50 uppercase tracking-wider`. Submit button: `bg-white-100 text-dark font-poppins-semibold rounded-pill`. Loading spinner: `border-dark/30 border-t-dark`. Success/error feedback: green/red tinted glass cards using `bg-green-500/10`, `bg-red-500/10`.

**Files:** `apps/web/app/components/forms/ContactForm.tsx`

---

### #530 — privacy-policy/page.tsx — dark Tailwind rewrite (Mar 17, 2026)

Removed `legal.css` import, removed `"use client"` scroll logic dependency on CSS classes. Language toggle redesigned as pill tabs: active `bg-white-100 text-dark rounded-pill`, inactive `text-white-50 hover:text-white-100`. Both EN/ES sections use `[&_h1]:`, `[&_h2]:`, `[&_p]:`, `[&_ul]:`, `[&_li]:`, `[&_strong]:` arbitrary Tailwind variants for consistent dark text styling. Divider between language sections: `border-t border-white-20`. Scroll targets use `scroll-mt-20` for proper navbar clearance.

**Files:** `apps/web/app/privacy-policy/page.tsx`

---

### #531 — terms-of-use/page.tsx — dark Tailwind rewrite (Mar 17, 2026)

Same pattern as privacy-policy (#530). Removed `legal.css` import. Language toggle with pill tabs. All content sections use `[&_tagname]:` Tailwind arbitrary variants. EN/ES divider added.

**Files:** `apps/web/app/terms-of-use/page.tsx`

---

### #532 — purchase-terms/page.tsx — dark Tailwind rewrite (Mar 17, 2026)

Same pattern as #530–#531. Removed `legal.css` import. Language toggle, prose arbitrary variants, divider.

**Files:** `apps/web/app/purchase-terms/page.tsx`

---

### #533 — cookie-settings/page.tsx — dark Tailwind rewrite (Mar 17, 2026)

Removed `legal.css` import. Since this page has no interactive language toggle state (it uses anchor links `#english`/`#spanish`), converted from client to server component. Language toggle uses simple `<a href="#...">` anchor links styled as pills. All content uses same `[&_tagname]:` Tailwind arbitrary variant pattern. Support email and contact page links use `text-white-100 underline` styling.

**Files:** `apps/web/app/cookie-settings/page.tsx`

---

## P1–P5 Audit — Round 2 Fixes (Mar 17, 2026)

_(Migrated from MARCH_DESIGN_WEB_UPDATES.md #166–#174.)_

### #534 — EventDetail.tsx — timezone abbreviation in time row (Mar 17, 2026)

Imported `getTimezoneAbbr` from `@project-flame/lib`. Time row now renders `HH:MM AM - HH:MM PM TZ` (e.g. "7:00 PM - 11:00 PM ECT") matching mobile `event/[id].tsx` `timeRange` construction: `tzAbbr` appended only when non-empty. Parity with mobile event detail.

**Files:** `apps/web/app/components/EventDetail.tsx`

---

### #535 — EventDetail.tsx — Buy Tickets pill scroll offset (Mar 17, 2026)

Replaced `scrollIntoView({ block: "start" })` with manual `window.scrollTo({ top })` that subtracts `NAVBAR_HEIGHT` (64px = h-16 fixed Navbar) and an extra 16px breathing room. Previously the fixed navbar overlapped the top of the ticket section after scroll.

**Files:** `apps/web/app/components/EventDetail.tsx`

---

### #536 — ExploreOrganizers.tsx — org default image (Mar 17, 2026)

Replaced `placehold.co` placeholder (`https://placehold.co/67x67/1a1a2e/ffffff?text=ORG`) with the real Supabase default: `https://jaoqfvugxmtomdufhswa.supabase.co/storage/v1/object/public/organization-images/default.jpg`. Matches the default org image convention from mobile (#521).

**Files:** `apps/web/app/components/ExploreOrganizers.tsx`

---

### #537 — webhooks/clerk/route.ts — user default profile image on creation (Mar 17, 2026)

`user.created` events now include `profile_image_url: DEFAULT_PROFILE_IMAGE_URL` (`https://…/profile-images/default.jpg`) in the upsert payload. `user.updated` events use only base fields (`clerk_id`, `email`, `first_name`, `last_name`) so existing custom profile images are never overwritten. Fixes: new users appeared with no avatar in the DB.

**Files:** `apps/web/app/api/webhooks/clerk/route.ts`

---

### #538 — sync-current-user/route.ts — user default profile image fallback + lookup error guard (Mar 17, 2026)

Added pre-check: queries `profile_image_url` for the existing user before upsert. If not set (null or new user), includes `profile_image_url: DEFAULT_PROFILE_IMAGE_URL` in upsert data. Ensures the default image is always set even if the Clerk webhook fires before this endpoint.

Also hardened the lookup query: destructures `error` from the `maybeSingle()` call and returns a `500` response immediately if the lookup fails, preventing a transient DB failure from silently overwriting a real custom profile image with the default.

**Files:** `apps/web/app/api/auth/sync-current-user/route.ts`

---

### #553 — clerk/route.ts — profile_image_url no longer overwritten on webhook replay (Mar 17, 2026)

Removed `profile_image_url` from the main `upsert` payload. Instead: upsert `baseUserData` (no image field), then in a follow-up `update` set `DEFAULT_PROFILE_IMAGE_URL` only when `profile_image_url IS NULL`. The `update` uses both `.eq("id", syncedUser.id)` and `.is("profile_image_url", null)` so it is a no-op for any user who already has a custom image — even if the `user.created` webhook fires more than once (replay scenario). Also cleaned up `email_addresses` access to `email_addresses?.[0]?.email_address` (cleaner optional chain).

**Files:** `apps/web/app/api/webhooks/clerk/route.ts`

---

### #554 — @project-flame/lib — export `DEFAULT_DISPLAY_TIMEZONE` (Mar 17, 2026)

Made `DEFAULT_DISPLAY_TIMEZONE = "America/Guayaquil"` an `export const` in `packages/lib/src/utils/format.ts` and wired it through `utils/index.ts` and `src/index.ts`. Allows consumers to reference the canonical platform fallback timezone without duplicating the string.

**Files:** `packages/lib/src/utils/format.ts`, `packages/lib/src/utils/index.ts`, `packages/lib/src/index.ts`

---

### #555 — EventsCatalog.tsx + HomeContent.tsx — consistent timezone fallback (Mar 17, 2026)

Changed `const tz = isValidIanaTimezone(raw) ? raw : null` to `const tz = isValidIanaTimezone(raw) ? raw : DEFAULT_DISPLAY_TIMEZONE` (imported from `@project-flame/lib`) in both `EventListCard` and `HomeFeedEventCard`. When an event has no valid timezone, `formatDate`, `formatDay`, `formatMonth`, and `buildTimeRange` all now use the same `DEFAULT_DISPLAY_TIMEZONE` ("America/Guayaquil") instead of `null` routing to different fallbacks per function.

**Files:** `apps/web/app/components/EventsCatalog.tsx`, `apps/web/app/components/HomeContent.tsx`

---

### #556 — date-utils.ts — guard against Invalid Date inputs (Mar 17, 2026)

Added `isNaN(d.getTime())` check after constructing `const d = new Date(dateStr)` in all four formatters (`formatDate`, `formatTime`, `formatDay`, `formatMonth`). Previously an invalid date string returned browser-localized "Invalid Date" text instead of an empty string. The existing `try/catch` was retained around the locale calls for RangeError protection from invalid IANA timezones.

**Files:** `apps/web/app/lib/date-utils.ts`

---

### #557 — ContactForm.tsx — remove md:grid-cols-2 (single-column layout rule) (Mar 17, 2026)

Replaced `grid grid-cols-1 md:grid-cols-2 gap-5` with `flex flex-col gap-5` on the name/email input wrapper. The design system rule "Layouts stay single-column — no grid rewrites" (established P9) requires all sections to remain single-column within the `max-w-[800px]` container.

**Files:** `apps/web/app/components/forms/ContactForm.tsx`

---

---

### Out-of-order backfill — entries #539–#552 (Mar 17, 2026)

The following entries were documented retroactively after the main batch (#553–#557) was already written. They represent earlier changes from the same PR cycle, inserted here in numeric order for auditability. The in-order section above (#553–#557) represents the later fixes in the same session.

---

### #539 — EventsCatalog.tsx — event name font size parity (Mar 17, 2026)

Changed list card event name from `text-sm` (14px) to `text-base leading-[22px]` (16px) to match mobile `EventListCard` which uses `FlameText variant="body"` = `text-base leading-[22px]`.

**Files:** `apps/web/app/components/EventsCatalog.tsx`

---

### #540 — Navbar.tsx — "Switch to Organizer/Attendee view" link (deferred) (Mar 17, 2026)

Not added to the Navbar. Decision: the role switcher will live inside the "My Account" dashboard instead of the Navbar — a web-specific pattern that differs from the iOS approach. This is intentional to keep the Navbar clean and route the switching to a dedicated in-dashboard location. Deferred to P9-6 (User Dashboard).

---

### #541 — Timezone in home feed cards + events catalog (web parity) (Mar 17, 2026)

Added `timezone` field to the Supabase select queries in `page.tsx` and `events/page.tsx`. Updated `date-utils.ts` `formatDate`/`formatTime` to accept an optional `timezone` parameter (IANA string) so dates/times render in the event's local timezone rather than the browser's timezone. Both `HomeFeedEventCard` and `EventListCard` now compute `tzAbbr` via `getTimezoneAbbr` from `@project-flame/lib` and append it to the time display (e.g. "7:00 PM ECT"). Matches mobile `useAppEvents.ts` `timeRange` construction. _(Subsequently superseded by #522 — `buildTimeRange` replaces all `getTimezoneAbbr` usage.)_

**Files:** `apps/web/app/page.tsx`, `apps/web/app/events/page.tsx`, `apps/web/app/lib/date-utils.ts`

---

### #542 — org-dashboard.tsx — IANA timezone validation for OrgEventCard date/time (Mar 17, 2026)

Replaced `event.timezone || "America/Guayaquil"` with `isValidIanaTimezone(rawTz) ? rawTz : "America/Guayaquil"` in `mapOrgEventToCardData`. Added `isValidIanaTimezone` to the import from `@project-flame/lib`. Guards against malformed timezone strings that would silently pass through the falsy check while still causing a `RangeError` in `Intl.DateTimeFormat` at render.

**Files:** `apps/mobile/app/(tabs)/org-dashboard.tsx`

---

### #543 — useUserTickets.ts — `city` field missing from `EventRow` interface (Mar 17, 2026)

Added `city: string | null` to the `EventRow` interface in `useUserTickets.ts`. The SQL `TICKET_SELECT`, `RSVP_SELECT`, and `PROMO_SELECT` strings all selected `city` from the `events` table but the TypeScript interface omitted it, causing a shape mismatch.

**Files:** `apps/mobile/hooks/useUserTickets.ts`

---

### #544 — about-flame/page.tsx — stale time-relative copy (Mar 17, 2026)

Replaced "More information about us will be added as we launch in November" with "More information about us will be added soon" to eliminate the stale month reference.

**Files:** `apps/web/app/about-flame/page.tsx`

---

### #545 — webhooks/clerk/route.ts — PII removed from logs + WebhookEvent type (Mar 17, 2026)

**PII (security):** Removed `console.log("Webhook body:", body)` which emitted the full raw webhook payload (email, name, etc.). Replaced `console.log("Syncing user to Supabase:", baseUserData)` and `console.log("🔄 USER_SYNC_REQUIRED:", JSON.stringify(baseUserData))` with redacted versions logging only `{ clerk_id }`.

**Type:** Replaced `let evt: any` with `let evt: WebhookEvent` (imported from `@clerk/nextjs/webhooks`) and cast the `wh.verify()` result to `WebhookEvent`. Narrowed the `evt.data` destructure with an inline type assertion to handle the union data shape without introducing `any`.

**Files:** `apps/web/app/api/webhooks/clerk/route.ts`

---

### #546 — EventsCatalog.tsx + HomeContent.tsx — validate IANA timezone with isValidIanaTimezone (Mar 17, 2026)

Changed `const tz = event.timezone?.trim() || null` to `const raw = event.timezone?.trim() ?? ""; const tz = isValidIanaTimezone(raw) ? raw : null` in both `EventListCard` (EventsCatalog) and `HomeFeedEventCard` (HomeContent). Previously a non-empty but malformed timezone string (e.g. "UTC+5") would pass the falsy check and be forwarded to `Intl.DateTimeFormat`, throwing a `RangeError`. Added `isValidIanaTimezone` to `@project-flame/lib` imports in both files.

> **Superseded by #555:** The `null` fallback introduced here was subsequently changed to `DEFAULT_DISPLAY_TIMEZONE` (imported from `@project-flame/lib`) in #555, so invalid/missing timezones now consistently fall back to `"America/Guayaquil"` instead of `null`. The `isValidIanaTimezone` validation introduced here was preserved.

**Files:** `apps/web/app/components/EventsCatalog.tsx`, `apps/web/app/components/HomeContent.tsx`

---

### #547 — ContactForm.tsx — email normalization + honeypot Tailwind (Mar 17, 2026)

**Email normalization:** `validateForm` now computes `sanitizedEmail = formData.email.trim().toLowerCase()` and validates against that value. `handleSubmit` also spreads `{ email: sanitizedEmail }` into the mutation payload so the trimmed/lowercased value is what gets submitted, not the raw input. Prevents silent validation failures for emails with surrounding spaces.

**Honeypot:** Replaced `style={{ display: "none" }}` on the honeypot `<input>` with `className="hidden"` to comply with the Tailwind-only layout rule.

**Files:** `apps/web/app/components/forms/ContactForm.tsx`

---

### #548 — date-utils.ts — IANA validation + try/catch for all formatters (Mar 17, 2026)

Extracted a `safeTimeZoneOptions(timezone?)` helper that validates the optional timezone string by attempting `Intl.DateTimeFormat(undefined, { timeZone: timezone })` and returns an empty object on failure. Wrapped all four exported formatters (`formatDate`, `formatTime`, `formatDay`, `formatMonth`) in `try/catch` that returns `""` on any error. Prevents `RangeError` for invalid IANA timezone strings from propagating to the UI.

**Files:** `apps/web/app/lib/date-utils.ts`

---

### #549 — user-ticket-mappers.ts — remove dead `formatTime` export (Mar 17, 2026)

Removed the exported `formatTime` function from `user-ticket-mappers.ts`. It was dead code: no file imported it, and it called `formatEventTime` from `@project-flame/lib` which had been removed from the import statement in the same PR. Removing it resolves the broken dependency and eliminates the dead export.

**Files:** `apps/mobile/lib/user-ticket-mappers.ts`

---

### #550 — maintenance/page.tsx — inline styles replaced with Tailwind (Mar 17, 2026)

Replaced all `style={}` props in the testing-access section (wrapper `div`, toggle button, form, input, submit button, error `<p>`) with Tailwind utility classes. The outer wrapper now uses `mt-8`; the hidden toggle uses `bg-transparent border-none text-white-50 text-xs underline cursor-pointer`; the form uses `flex flex-col items-center gap-2`; the input uses the design-system border/bg/text pattern; the submit button uses `bg-white-100 text-dark font-poppins-medium`; the error uses `text-red-400 text-xs`. Preserves all IDs, handlers, and `disabled` logic.

**Files:** `apps/web/app/maintenance/page.tsx`

---

### #551 — EventsSection.tsx — timezone mismatch in date/time display (Mar 17, 2026)

Hoisted `const tz = isValidIanaTimezone(event.timezone ?? "") ? event.timezone! : undefined` to the top of `DiscoverEventCard`, replacing the IIFE that only computed it for the date badge. Changed `formatDate(event.starts_at)` to `formatDate(event.starts_at, tz)` so the inline date text uses the same timezone as the date badge and `buildTimeRange`. Removed the duplicate `isValidIanaTimezone` call in the `buildTimeRange` argument, replaced with `tz ?? null`.

**Files:** `apps/web/app/components/discover/EventsSection.tsx`

---

### #552 — SpotlightCard.tsx — timezone mismatch in date display (Mar 17, 2026)

Changed `formatDate(event.starts_at)` to `formatDate(event.starts_at, tz)` in the date/time row. `tz` was already computed via `isValidIanaTimezone` at the top of the component and used by `buildTimeRange` and the `isToday` check — but not passed to `formatDate`, causing the displayed date to render in the browser's local timezone while the time rendered in the event's timezone.

**Files:** `apps/web/app/components/discover/SpotlightCard.tsx`

---

## PR Review Fixes — Clerk Webhook, ContactForm, Docs (Mar 17, 2026)

### #558 — clerk/route.ts — TypeScript build error: `profile_image_url` on type `never` (Mar 17, 2026)

Added explicit generic type `<{ id: string; profile_image_url: string | null }>` to the `retrySupabaseOperation` call for the upsert query. Without this, TypeScript inferred `T = never` from the Supabase query builder's return type, causing the subsequent `syncedUser.profile_image_url` check to fail at compile time with "Property 'profile_image_url' does not exist on type 'never'". The explicit generic anchors the return type so control-flow narrowing correctly resolves `syncedUser` as `{ id: string; profile_image_url: string | null } | null` after the `syncError` throw.

**Files:** `apps/web/app/api/webhooks/clerk/route.ts`

---

### #559 — clerk/route.ts — `imageError` propagated so Clerk retries on failure (Mar 17, 2026)

Changed the `imageError` branch from logging-only (`console.error` then continue) to `throw imageError` after logging. Previously, a DB failure when setting the default profile image would be silently swallowed and the webhook would return `200`, telling Clerk the sync succeeded. Now the error propagates to the outer `try/catch`, which returns a `500` response, causing Clerk to retry the webhook — ensuring the default image is eventually set.

**Files:** `apps/web/app/api/webhooks/clerk/route.ts`

---

### #560 — clerk/route.ts — Zod runtime validation for `evt.data` payload (Mar 17, 2026)

Replaced the bare TypeScript type assertion on `evt.data` with a `clerkUserDataSchema.safeParse(evt.data)` call (using `zod`). The schema validates `id: string`, `email_addresses?: Array<{ email_address: string }>`, `first_name?: string | null`, `last_name?: string | null`. Returns HTTP 400 with "Invalid payload" if validation fails instead of silently processing a malformed payload. The destructured `{ id, email_addresses, first_name, last_name }` now come from the validated `parsedData.data` object.

**Files:** `apps/web/app/api/webhooks/clerk/route.ts`

---

### #561 — ContactForm.tsx + contact/route.ts — shared Zod schema eliminates duplicate validation (Mar 17, 2026)

Extracted the Zod contact schema to `apps/web/app/lib/contact-schema.ts`. Both the API route (`api/contact/route.ts`) and the client form (`ContactForm.tsx`) now import from this single source. Removed the manual `validateForm` implementation (regex, trim, min-length checks) that duplicated the server-side rules. The form's `validateForm` now calls `contactSchema.safeParse({ ...formData, email: formData.email.trim().toLowerCase() })` and returns the first Zod issue message or `null`. Error messages are consistent client↔server. The `ContactFormData` interface in the form is replaced by the schema-inferred type exported from `contact-schema.ts`.

**Files:** `apps/web/app/lib/contact-schema.ts` _(new — justified: schema must be importable by both server route and client component)_, `apps/web/app/api/contact/route.ts`, `apps/web/app/components/forms/ContactForm.tsx`

---

### #562 — contact-schema.ts — `.trim()` added to all string validators (Mar 17, 2026)

Added `.trim()` before every `.min()` / `.email()` check on `name`, `email`, `subject`, and `message` so Zod strips leading/trailing whitespace server-side before length validation. Previously a submission of all spaces (e.g. `"   "`) would pass the `min(1)` check on `name` and `subject` and the `min(10)` check on `message`. Now whitespace-only input is correctly rejected.

**Files:** `apps/web/app/lib/contact-schema.ts`

---

### #563 — contact/route.ts — HTML injection via user-supplied fields in htmlContent (Mar 17, 2026)

Added `escapeHtml` helper that encodes `&`, `<`, `>`, `"`, `'` as HTML entities. Applied it to all four user-supplied fields interpolated into `sendSmtpEmail.htmlContent`: `name` (×2, including the footer), `email`, `subject`, and `message`. For `message`, the existing `\n → <br>` replacement now runs on the already-escaped string: `escapeHtml(validatedData.message).replace(/\n/g, "<br>")` so line breaks are preserved without re-opening injection. Previously a crafted `name` like `<script>…</script>` or `<img onerror=…>` would be rendered as raw HTML in the support email client.

**Files:** `apps/web/app/api/contact/route.ts`

---

### #564 — MARCH_2026_FIXES.md #522 — stale file path corrected (Mar 17, 2026)

The `#522` entry (time display / `buildTimeRange`) referenced `apps/web/app/event/[id].tsx` as the web EventDetail file where `getTimezoneAbbr` was reintroduced. That path does not exist. Corrected to `apps/web/app/components/EventDetail.tsx` — the actual component where the change was applied.

**Files:** `docs/fixes/MARCH_2026_FIXES.md` (entry #522, `buildTimeRange` final-behavior bullet)

---

### #565 — contact/route.ts — deduplicate `escapeHtml` via shared import from `email-styles.ts` (Mar 17, 2026)

Removed the local `escapeHtml` implementation introduced in #563 and replaced it with an import of the canonical `escapeHtml` exported from `apps/web/app/lib/email/email-styles.ts`. The shared version is identical in behavior but additionally escapes `/` as `&#x2F;` (XSS prevention for path characters inside attribute values), and is already used throughout the transactional email system. All four call sites in `htmlContent` (name ×2, email, subject, message) continue to work unchanged via the import.

**Files:** `apps/web/app/api/contact/route.ts`

---

### #566 — MARCH_2026_FIXES.md — backfill entries #539–#541 reordered to ascending position (Mar 17, 2026)

The "Out-of-order backfill — entries #539–#552" block header stated entries were "inserted here in numeric order for auditability." However entries #539–#541 appeared after #552 at the tail of the section, breaking the claimed ascending order. Moved #539, #540, and #541 to immediately before #542 so the block is now genuinely monotonically ascending (#539 → #552). The duplicate trailing copies of those three entries were removed.

**Files:** `docs/fixes/MARCH_2026_FIXES.md` (backfill block reorder)

---

### #567 — P9-7 PR review — type safety, CTA token, currency aggregation, mutation guards (Mar 18, 2026)

Applied PR review fixes from the P9-7 Organizer Dashboard PR. Only standard bugs and code-quality findings were fixed; accessibility items deferred to `WEB_ACCESSIBILITY_TODOS.md`; nitpicks deferred to `WEB_NITPICKS_TODOS.md`.

**`apps/web/app/admin/page.tsx`**

- Replaced `any[]` types for `allUsers` and `featuredEvents` with explicit `AdminUser` and `AdminFeaturedEvent` interfaces matching the shape consumed by `AdminDashboard`.
- Narrowed `select("*")` on the users query to explicit columns (`id, email, first_name, last_name, role, created_at`) to avoid over-exposing data to the client.
- Replaced the `rsvp: any` reducer callback with a typed inline type.

**`apps/web/app/components/AdminDashboard.tsx`**

- Replaced forbidden `bg-red-500` on the "Cleanup All Ticket Data" button with the approved web CTA tokens `bg-white-100 text-dark hover:opacity-90`.
- Replaced inline fee approximation `Math.round(globalStats.totalRevenue * 0.1)` in the Platform Fees card with `calculateFee(globalStats.totalRevenue).platformFeeCents` (imported from `@project-flame/lib`) so fee display uses the canonical shared calculation.

**`apps/web/app/components/modals/RegistrationFormModal.tsx`**

- Introduced `RegistrationFormValues = Record<string, string | boolean>` type; replaced all `Record<string, any>` and `any` usages for `formData`, `onSuccess`, and `handleChange` parameter.
- Guarded the X (close) button: added `disabled={isSubmitting}`, `aria-disabled={isSubmitting}`, and an `onClick` guard (`if (!isSubmitting) onClose()`) so it cannot dismiss the modal during submission — mirrors the Cancel button and Escape key behaviour.
- Added `submissionError` state; `catch` block now calls `setSubmissionError(message)` and logs context via `console.error`; the error is rendered inline in the modal below the fields so users see a clear actionable message. `submissionError` is cleared on modal open.

**`apps/web/app/components/organizer/DashboardView.tsx`**

- Replaced `event: any` in `OrgEventCard` props with `OrganizerEvent` (already imported from `useOrganizerData`).
- Fixed Total Revenue currency aggregation: computed `sharedCurrency` from the set of distinct event currencies; if all events share one currency, `formatCentsAsPrice(totalRevenueCents, sharedCurrency)` is shown; otherwise falls back to `"various currencies"` instead of incorrectly labelling mixed-currency data as "USD".
- Removed remaining `(e: any)` and `(event: any)` type annotations in filter/map callbacks — types now inferred from `OrganizerEvent[]`.

**`apps/web/app/components/organizer/RsvpsView.tsx`**

- Replaced `any[]` props (`events`, `setExpandedSections`, `separateEventsByDate`) with `OrganizerEvent` types imported from `useOrganizerData`.
- Typed `RsvpEventCard` event prop as `OrganizerEvent`.
- Fixed two in-place `.sort()` mutations on `filteredCurrent` and `filteredPast`: both arrays are now spread into a new array before sorting (`[...filteredCurrent].sort(...)`) to avoid mutating TanStack Query cached data.
- Removed `(a: any, b: any)` and `(event: any)` annotations in sort and map callbacks; types inferred from typed arrays.

**`apps/web/app/components/OrganizerDashboard.tsx`**

- Imported `Purchase` type from `apps/web/app/lib/utils/purchase-data.ts`.
- Updated `PurchaseDetailsSectionProps.purchases` from `any[]` to `Purchase[]`; updated `paginatedPurchases.map` and `sortedPurchases.map` callbacks to use the typed interface.
- Removed `purchase.documentId` and `purchase.dateOfBirth` from the Excel export column definitions and headers — these fields do not exist on the `Purchase` interface; kept remaining valid fields.

**`apps/web/app/organizer/event/[id]/OrgEventDetailClient.tsx`**

- Imported `Event as OrganizerEvent` from `useOrganizerData`; replaced `(e: any)` in the `data?.events?.find()` callback.
- Typed `handleEditEvent` parameter as `OrganizerEvent` (was `any`).
- Fixed in-place `.sort()` mutation in `handleEditEvent`: `(ev.ticket_tiers || []).sort(...)` → `[...(ev.ticket_tiers || [])].sort(...)`.
- Fixed in-place `.sort()` mutation in `handleEventDataChange`: `(event?.ticket_tiers || []).sort(...)` → `[...(event?.ticket_tiers || [])].sort(...)`.
- Replaced raw `<img>` (with `eslint-disable-next-line @next/next/no-img-element` comment) in the Edit Event Image preview with `<Image fill className="object-cover" unoptimized={editingImagePreview.startsWith("blob:")} />` from `next/image`; parent container gained `relative` class.

**Deferred (Accessibility → `docs/todos/WEB_ACCESSIBILITY_TODOS.md`):**

- `RsvpsView.tsx`: search input missing `aria-label`; accordion toggle missing `aria-expanded` / `aria-controls`.
- `RsvpManagement.tsx`: confirmation modal lacks `role="dialog"`, `aria-modal`, `aria-labelledby`.
- `OrgEventDetailClient.tsx`: icon-only buttons (promo code delete, promoter link copy/delete, tier edit/delete) missing `aria-label` and `type="button"`.

**Deferred (Nitpicks → `docs/todos/WEB_NITPICKS_TODOS.md`):**

- `AdminDashboard.tsx`: split `renderMainContent` into `Overview`, `Users`, `Featured`, `Revenue` sub-components.
- `CreateEventForm.tsx`: additional inline styles and component splitting.
- `RegistrationFormModal.tsx`: extract `ModalShell`, `FormField`, `ActionButtons` sub-components.
- `DashboardView.tsx`: add `sizes` prop to event thumbnail `<Image>`; replace hardcoded hex colors. _(Fixed in #568 below — removed from WEB_NITPICKS_TODOS.md.)_
- `RsvpManagement.tsx`: extract sub-components; validate `registrationData` with Zod.
- `useOrganizerData.ts`: type `bank_transfer_orders` and `promoter_links` properties.
- `OrgEventDetailClient.tsx`: component splitting, improved catch logging, setTimeout cleanup via refs.

**Files:** `apps/web/app/admin/page.tsx`, `apps/web/app/components/AdminDashboard.tsx`, `apps/web/app/components/modals/RegistrationFormModal.tsx`, `apps/web/app/components/organizer/DashboardView.tsx`, `apps/web/app/components/organizer/RsvpsView.tsx`, `apps/web/app/components/OrganizerDashboard.tsx`, `apps/web/app/organizer/event/[id]/OrgEventDetailClient.tsx`, `docs/todos/WEB_ACCESSIBILITY_TODOS.md`, `docs/todos/WEB_NITPICKS_TODOS.md`

---

### #568 — P9-7 PR review round 2 — type safety, null guards, currency sentinel, location guard, token compliance (Mar 18, 2026)

Applied second round of PR review fixes from the P9-7 Organizer Dashboard PR. Standard bugs fixed in-place; accessibility and edge-case items deferred to their respective todo files.

**`apps/web/app/admin/page.tsx`**

- Imported `UserRole` from `../lib/roles` and changed `AdminUser.role` from `string` to `UserRole`, resolving the structural type mismatch between `AdminUser[]` and the `RecentUser[]` prop expected by `AdminDashboard` (both now use `UserRole`).
- Added `error` destructuring and explicit error handling for the `users` query (`usersError`) and `events` query (`eventsError`): both now throw with a context-specific message rather than silently falling back to empty arrays when a Supabase query fails.
- Fixed Vercel build error: Supabase infers the `ticket_tier:ticket_tiers(price_cents)` join result as `{ price_cents: any; }[]` (array) rather than a singular object. Cast `rsvp.ticket_tier` to `{ price_cents: number } | null` inside the `reduce` callback so `price_cents` is accessible without a TypeScript error.

**`apps/web/app/components/AdminDashboard.tsx`**

- Added null guard for `event.image_url` in the Featured Events table: when `image_url` is missing, renders a `"N/A"` placeholder `<div>` instead of passing `undefined` to `<Image>`.
- Added optional chaining + nullish coalescing for `event.organizations?.name ?? "Unnamed Organization"` in the Featured Events table to guard against unexpected null values from the DB join.
- Wrapped `{renderMainContent()}` inside `<div className="max-w-[800px] mx-auto">` within `<main>` so the admin dashboard main content area is constrained to 800px (sidebar layout preserved).

**`apps/web/app/components/organizer/DashboardView.tsx`**

- Fixed `sharedCurrency` empty-events sentinel: when `events.length === 0`, `sharedCurrency` now defaults to `"USD"` instead of `null`, so the Total Revenue stat card shows `"$0.00"` for new organizers with no events rather than the confusing `"various currencies"`.
- Fixed location guard in `OrgEventCard`: changed `{event.venue && (...)}` to `{(event.venue || event.city) && (...)}` so city-only events (no venue field) still render the `FiMapPin` row.
- Added `sizes="44px"` to the event thumbnail `<Image>` in `OrgEventCard` for correct Next.js image optimisation. _(Previously deferred in #567.)_
- Replaced hardcoded hex color classes with design tokens: `border-[#BFC0C2]` → `border-white-20`, `text-[#EAEAEB]` (×3: "Total Events", "Total Revenue", "QR Scanner" labels) → `text-white-80`, `bg-[#F6F6F6]/10` (search input) → `bg-white-10`. _(Previously deferred in #567.)_

**`apps/web/app/components/modals/RegistrationFormModal.tsx`**

- Added `typeof value === "string"` type guard to the email validation branch so `emailRegex.test(value)` only receives a `string` (not a `boolean`), resolving the TypeScript type error.

**Deferred (Accessibility → `docs/todos/WEB_ACCESSIBILITY_TODOS.md`):**

- `DashboardView.tsx` (lines ~262–268): search input missing accessible label — new entry added.
- `RsvpsView.tsx` search + accordion toggle: already logged in prior session.
- `OrgEventDetailClient.tsx` icon-only delete buttons: already logged in prior session.

**Deferred (Edge Cases → `docs/todos/EDGE_CASES_TODOS.MD`):**

- `OrgEventDetailClient.tsx` (~321–340): stale `selectedTierId`/`bankTierId` after `ticketTiers` prop refresh — new entry added.
- `OrgEventDetailClient.tsx` (~986–997): no unmount cleanup for in-flight image upload abort or blob URL revocation — new entry added.

**Deferred (Nitpicks → `docs/todos/WEB_NITPICKS_TODOS.md`):**

- `AdminDashboard.tsx`: `renderMainContent` extraction into sub-components — already logged.
- `OrganizerDashboard.tsx` (~164–210, ~495–501): `any` types in event/purchase callbacks + manual `ECUADOR_OFFSET_MINUTES` in `formatEcuadorTimestamp` — new entries added.
- `OrgEventDetailClient.tsx` (~1233–1937): remaining `any` types in update payload, tier handlers, purchase render functions — new entry added.

**Files:** `apps/web/app/admin/page.tsx`, `apps/web/app/components/AdminDashboard.tsx`, `apps/web/app/components/organizer/DashboardView.tsx`, `apps/web/app/components/modals/RegistrationFormModal.tsx`, `docs/todos/WEB_ACCESSIBILITY_TODOS.md`, `docs/todos/EDGE_CASES_TODOS.MD`, `docs/todos/WEB_NITPICKS_TODOS.md`

---

### #569 — P9-7 PR review round 3 — `any` type removal, double-submission guard (Mar 18, 2026)

Applied third round of PR review fixes from the P9-7 Organizer Dashboard PR. Standard bugs and code quality issues fixed in-place; accessibility and nitpick items deferred to their respective todo files.

**`apps/web/app/components/AdminDashboard.tsx`**

- Defined a concrete `Activity` interface (`id`, `type`, `description`, `created_at`) and replaced `recentActivity: any[]` in `GlobalStats` with `recentActivity: Activity[]`, satisfying the strict no-`any` rule.

**`apps/web/app/components/modals/RegistrationFormModal.tsx`**

- Added `submittingRef = useRef(false)` to guard against re-entrant submissions before React flushes the `isSubmitting` state update. `handleSubmit` returns early if `submittingRef.current` is already `true`; sets it synchronously when starting the submit flow; clears it in the `finally` block alongside `setIsSubmitting(false)`. Existing `onSuccess`/`onClose` calls and error handling are unchanged.

**Deferred (Accessibility → `docs/todos/WEB_ACCESSIBILITY_TODOS.md`):**

- `RegistrationFormModal.tsx` (lines ~168–176, ~200–204): checkbox and text-input error containers missing `aria-invalid`, `aria-describedby`, and `role="alert"` on error `<div>` — new entry added.
- `RegistrationFormModal.tsx` (lines ~141–159): modal does not trap or restore focus — new entry added.

**Deferred (Nitpicks → `docs/todos/WEB_NITPICKS_TODOS.md`):**

- `admin/page.tsx` (lines ~40–51): `AdminFeaturedEvent` `image_url` and `organizations` not marked nullable — new entry added.
- `admin/page.tsx` (line ~109): `featuredEvents` assignment missing `as AdminFeaturedEvent[]` type assertion — new entry added.
- `RegistrationFormModal.tsx` (lines ~162–230): extract `FieldRow` subcomponent to reduce form body size — new entry added.

**Files:** `apps/web/app/components/AdminDashboard.tsx`, `apps/web/app/components/modals/RegistrationFormModal.tsx`, `docs/todos/WEB_ACCESSIBILITY_TODOS.md`, `docs/todos/WEB_NITPICKS_TODOS.md`

---

### #570 — Vercel build TypeScript errors — four type fixes (Mar 18, 2026)

Diagnosed via MCP Vercel build logs (`dpl_BerzQor94KhhYT2jHYx56XTtn5yE`). The build compiled successfully (Sentry sourcemap upload completed) but the Next.js type-check worker exited with code 1. Local `npx tsc --noEmit` exposed four TypeScript errors introduced by the recent P9-7 "review" commits.

**`apps/web/app/admin/page.tsx`**

- Fixed `rsvp.ticket_tier as { price_cents: number } | null` cast: Supabase infers the foreign-key join as `{ price_cents: any }[]` (array), which doesn't overlap with `{ price_cents: number }` (single object). Routed through `unknown` first — `as unknown as { price_cents: number } | null` — which TypeScript allows and is the canonical pattern for non-overlapping casts.

**`apps/web/app/components/modals/RegistrationFormModal.tsx`**

- Fixed `value={formData[field.id] || ""}` on the text `<input>`: `formData[field.id]` is typed `string | boolean`. When the value is `true`, `true || ""` evaluates to `true`, making the prop type `string | true` — incompatible with `<input value>`. Added explicit narrowing cast: `(formData[field.id] as string | undefined) || ""`.

**`apps/web/app/components/organizer/RsvpsView.tsx`**

- Fixed `RsvpsViewProps`: `expandedSections` and `setExpandedSections` were typed for `{ rsvps: boolean }` only, but `OrganizerDashboard` passes the full `{ events: boolean; ticketTiers: boolean; rsvps: boolean }` state. TypeScript's function-argument contravariance makes the dispatch types incompatible. Introduced `ExpandedSections` interface with all three keys and updated both props to use it. `RsvpsView` only reads `.rsvps` from the state but correctly spreads `prev` in its setter callback, so the wider type is safe.

**`apps/web/app/organizer/event/[id]/OrgEventDetailClient.tsx`**

- Fixed `new Date(tier.sales_end)` in `handleEditEvent`: `tier.sales_end` is `string | undefined`. Passing `undefined` to the `Date` constructor is invalid. Added `tier.sales_end &&` guard so the comparison is skipped when `sales_end` is absent.

**Files:** `apps/web/app/admin/page.tsx`, `apps/web/app/components/modals/RegistrationFormModal.tsx`, `apps/web/app/components/organizer/RsvpsView.tsx`, `apps/web/app/organizer/event/[id]/OrgEventDetailClient.tsx`

---

### #571 — Phase 9-8: Organizer dashboard parity & exports (Mar 19, 2026)

Design and feature parity pass across web and mobile organizer dashboard. Key changes (#290–#308 in the Phase 9 design log):

- **Multi-currency revenue (#290–#292):** Web `DashboardView` and mobile `OrgStatsSection` render stacked per-currency totals when events span multiple currencies; mobile `org-dashboard.tsx` builds the `perCurrency` Map.
- **PaymentAccountBanner (#293–#295):** New web and mobile banner components fetching Stripe Connect status and linking to `/organizer/settings?tab=payouts`; replaced the old inline `StripeConnectStatus` in `DashboardView`.
- **Settings parity (#296–#298):** `StripeConnectStatus` CTA changed to outline style matching mobile; `OrgSettingsClient` active-tab underline thickened + URL `?tab=` deep-link support; mobile `account.tsx` adds same `?tab=` support.
- **Search field styling (#299–#300):** Dashboard and RSVPs search inputs changed to `bg-[#F6F6F6]` with dark text/placeholder, matching mobile's white search bar.
- **SendTickets accordion (#301):** `OrgEventDetailClient` sent-tickets list wrapped in collapsible accordion matching mobile's `OrgSendTicketsCard`.
- **PurchasedDetailsSection (#302–#303):** New web `PurchasedDetailsSection` component with stats row (Ticket QNT, Requested, Sold, Revenue) + collapsible purchase list + XLSX export (Customer, Email, Tier, Quantity, Purchased At, Total Cost).
- **Section icons + status (#304–#307):** `SectionCard` gains optional `icon` prop (42 px circle); all 4 action sections get icons; mobile `OrgPurchasedDetailsCard` shows "Not Scanned" (was "Pending") and price next to status badge.
- **RSVP export (#308):** `RsvpManagement` adds "Export to XLSX" for pending RSVPs with columns: Name, Tier, Email, Price, Request Date (event timezone).

**`apps/web/app/components/organizer/DashboardView.tsx`**

- Multi-currency stacked revenue display via `revenueByCurrency` Map
- Payment banner moved to top (new `PaymentAccountBanner` component)
- Search field restyled from `bg-white-10` to `bg-[#F6F6F6]` with dark text

**`apps/web/app/components/PaymentAccountBanner.tsx`** (NEW)

- Simplified Stripe status banner: title + badge + subtitle, clicks navigate to Settings > Payouts

**`apps/web/app/components/StripeConnectStatus.tsx`**

- CTA changed from filled to outline style matching mobile
- Added `PayoutsInfoSection` ("About Payouts" info card) matching mobile

**`apps/web/app/organizer/settings/OrgSettingsClient.tsx`**

- Active tab underline increased visibility (`border-b-2`, `font-poppins-semibold`)
- Added `useSearchParams` for `?tab=` deep-linking

**`apps/web/app/components/organizer/RsvpsView.tsx`**

- Search field restyled to white (`bg-[#F6F6F6]`)

**`apps/web/app/components/RsvpManagement.tsx`**

- Added XLSX export for pending RSVPs (Name, Tier, Email, Price, Request Date in event timezone)

**`apps/web/app/organizer/event/[id]/OrgEventDetailClient.tsx`**

- `SectionCard` gains optional `icon` prop (42px circle), close button changed to `FiX`
- Icons added to all 4 sections: `FiPercent`, `FiSend`, `FiLink`, `IoTicketOutline`
- `SendTicketsSection`: sent tickets wrapped in collapsible accordion
- New `PurchasedDetailsSection`: stats row (Ticket QNT, Requested, Sold, Revenue) + collapsible Purchase List + XLSX export

**`apps/mobile/components/org-dashboard/OrgStatsSection.tsx`**

- `StatCard` value prop widened to `string | React.ReactNode`
- Added `revenueByCurrency` prop for stacked multi-currency display

**`apps/mobile/app/(tabs)/org-dashboard.tsx`**

- Computes `perCurrency` revenue Map, passes to `OrgStatsSection`
- Added `PaymentAccountBanner` at top before stats

**`apps/mobile/components/org-dashboard/PaymentAccountBanner.tsx`** (NEW)

- Mobile payment banner matching web, navigates to `/account?tab=payouts`

**`apps/mobile/app/account.tsx`**

- Added `useLocalSearchParams` for `?tab=` deep-linking

**`apps/mobile/components/org-dashboard/OrgPurchasedDetailsCard.tsx`**

- "Pending" → "Not Scanned" for unscanned tickets
- Ticket price moved next to status badge (matching web layout)

**Files:** `apps/web/app/components/organizer/DashboardView.tsx`, `apps/web/app/components/PaymentAccountBanner.tsx`, `apps/web/app/components/StripeConnectStatus.tsx`, `apps/web/app/organizer/settings/OrgSettingsClient.tsx`, `apps/web/app/components/organizer/RsvpsView.tsx`, `apps/web/app/components/RsvpManagement.tsx`, `apps/web/app/organizer/event/[id]/OrgEventDetailClient.tsx`, `apps/mobile/components/org-dashboard/OrgStatsSection.tsx`, `apps/mobile/app/(tabs)/org-dashboard.tsx`, `apps/mobile/components/org-dashboard/PaymentAccountBanner.tsx`, `apps/mobile/app/account.tsx`, `apps/mobile/components/org-dashboard/OrgPurchasedDetailsCard.tsx`

---

### #572 — Organizer XLSX: web timezone parity + mobile exports (Mar 19, 2026)

**Summary:** Pending RSVP export on web uses `timeZone` in `toLocaleString` only when `event.timezone` is non-empty (same rule as purchase export), with no `America/Guayaquil` default when blank. Mobile adds `xlsx`, `expo-file-system`, and `expo-sharing`; `lib/organizer-xlsx-export.ts` writes base64 XLSX to cache and opens the share sheet. RSVP detail exports pending rows; purchased-details card exports purchases. `useEventRsvps` (in `useRsvpManagement.ts`) extended with `eventName`, `eventTimezone`, user `email`, and export fields on `RsvpRequestData`. Full design traceability: `docs/fixes/MARCH_DESIGN_WEB_UPDATES.md` entries #326–#327.

**Files:** `apps/web/app/components/RsvpManagement.tsx`, `apps/mobile/lib/organizer-xlsx-export.ts`, `apps/mobile/hooks/useRsvpManagement.ts` (`useEventRsvps`), `apps/mobile/app/rsvp-detail.tsx`, `apps/mobile/components/org-dashboard/OrgPurchasedDetailsCard.tsx`, `apps/mobile/package.json`, `pnpm-lock.yaml`, `apps/mobile/metro.config.js`

---

### #573 — Org event detail: no forced default timezone; shared date/time formatters (Mar 19, 2026)

**Summary:** Organizer event detail no longer falls back to `America/Guayaquil` when `event.timezone` is missing or invalid; display uses only a validated IANA id, otherwise `@project-flame/lib` omits `timeZone` for locale-based formatting. `formatEventDate` keeps `DEFAULT_DISPLAY_TIMEZONE` when the timezone argument is omitted (single-arg calls); when a second argument is passed but empty or invalid, formatting uses the runtime locale. `buildTimeRange` uses a valid IANA zone when provided, otherwise locale-based times.

**Files:** `apps/mobile/app/org-event-detail.tsx`, `packages/lib/src/utils/format.ts`

---

### #574 — Ticket tier sales end vs event start; RSVP export UX; web/mobile polish (Mar 19, 2026)

**Summary:**

1. **API + forms:** Tier `sales_end` must be **strictly before** event start. Replaced `salesEnd > eventStart` with `salesEnd >= eventStart` in `POST`/`PATCH` `ticket-tiers` routes; aligned `CreateEventForm` validation, event-start change handler (auto-fill only empty `sales_end`; clamp conflicts to event start − 1 ms in local display), and `OrgEventDetailClient` tier checks.
2. **Web RSVP export:** `Export to XLSX` only when `pending > 0`; primary CTA styling (`bg-white-100` / `text-dark`). Sheet row data built via `buildPendingRsvpExportAoa` in `@project-flame/lib`; `xlsx` loaded with `import()` inside the export handler.
3. **Mobile:** `OrgStatsSection` receives `currency` from org dashboard stats; `rsvp-detail` export errors log `eventId`, `userId`, `action`; `OrgPurchasedDetailsCard` revenue uses `formatCentsAsPrice` with the `currency` prop.
4. **`buildTimeRange`:** When `timezone` is **omitted** (`undefined`), use `DEFAULT_DISPLAY_TIMEZONE`; explicit blank/invalid strings still use locale (no `timeZone` option).
5. **Web a11y / resilience:** `RsvpsView` search input `aria-label` + `id`; `PaymentAccountBanner` clears `status` on non-OK or network error; root `error.tsx` uses static header (no `Navbar`) and `max-w-[800px]` content wrapper; `not-found` content wrapped in `max-w-[800px]`.
6. **Nitpicks:** `StripeConnectStatus` onboarding spinner matches other `border-dark/20` spinners; `OrgSettingsClient` logo URL uses `EXPECTED_ORG_IMAGE_PUBLIC_PREFIX` validation; `WEB_NITPICKS_TODOS.md` Phase 9-9 heading and CRUCIAL traceability.

**Files:** `apps/web/app/api/ticket-tiers/route.ts`, `apps/web/app/components/forms/CreateEventForm.tsx`, `apps/web/app/organizer/event/[id]/OrgEventDetailClient.tsx`, `apps/web/app/components/RsvpManagement.tsx`, `apps/web/app/components/organizer/RsvpsView.tsx`, `apps/web/app/components/PaymentAccountBanner.tsx`, `apps/web/app/error.tsx`, `apps/web/app/not-found.tsx`, `apps/web/app/components/StripeConnectStatus.tsx`, `apps/web/app/organizer/settings/OrgSettingsClient.tsx`, `apps/mobile/app/(tabs)/org-dashboard.tsx`, `apps/mobile/app/rsvp-detail.tsx`, `apps/mobile/components/org-dashboard/OrgPurchasedDetailsCard.tsx`, `packages/lib/src/utils/format.ts`, `packages/lib/src/utils/pending-rsvp-export.ts`, `packages/lib/src/utils/index.ts`, `packages/lib/src/index.ts`, `docs/todos/WEB_NITPICKS_TODOS.md`

---

### #575 — Convention fixes: OrgPurchaseStats cents, not-found static header, export button UX (Mar 19, 2026)

**Summary:**

1. **`OrgPurchaseStats.revenue` now in cents:** `org-event-detail.tsx` was dividing `totalRevenue` by 100 before storing in `purchaseStats`, then `OrgPurchasedDetailsCard` was multiplying by 100 again to pass to `formatCentsAsPrice` — a dollar/cents roundtrip violating the project convention. Fixed: `revenue` is now stored as cents throughout; `OrgPurchasedDetailsCard` calls `formatCentsAsPrice(stats.revenue, currency)` directly. `OrgPurchaseStats` type in `mock.ts` now has a JSDoc unit annotation (`/** Revenue in cents */`); mock default updated from `140` (was $1.40) to `14000` ($140.00).
2. **`not-found.tsx` static header:** Replaced `Navbar` with the same minimal static `<header>` used in `error.tsx`. `Navbar` depends on Clerk/router hooks and can throw if a routing error produces the 404; the static header is hook-free and resilient. Both boundary-adjacent pages now behave consistently.
3. **Export `Pressable` disabled opacity:** Both mobile export buttons (`OrgPurchasedDetailsCard` and `rsvp-detail.tsx`) now apply `style={{ opacity: isExporting ? 0.5 : 1 }}` so the button visually dims while exporting — matching the web `disabled:opacity-50` behavior. NativeWind's `disabled:` variant is not reliable on `Pressable`, so inline style is used (consistent with other disabled states in the app).
4. **UGX comment update:** `packages/lib/src/utils/format.ts` comment near `ZERO_DECIMAL_CURRENCIES` corrected — Stripe now classifies UGX as zero-decimal; our code keeps the `/100` branch for backward-compatibility since we historically stored UGX amounts multiplied by 100.

**Files:** `apps/mobile/app/org-event-detail.tsx`, `apps/mobile/components/org-dashboard/OrgPurchasedDetailsCard.tsx`, `apps/mobile/data/mock.ts`, `apps/mobile/app/rsvp-detail.tsx`, `apps/web/app/not-found.tsx`, `packages/lib/src/utils/format.ts`

---

### #576 — Organizer Payment Account banner: restore dark glass styling (Mar 19, 2026)

**Summary:** Reverted `PaymentAccountBanner` from `bg-white-100` / `text-dark` to `bg-card` + `border-white-30` + light text and badge colors (`text-green-400` / `text-yellow-400`) so it matches other dashboard cards. Added an inline `//` note in the component: do not switch back to the full-width light treatment.

**Files:** `apps/web/app/components/PaymentAccountBanner.tsx`

---

### #577 — Dashboard pill navigation: unified view switching and settings icon (Mar 20, 2026)

**Summary:**

1. **User dashboard pill redesign:** Removed the long "Organizer Dashboard" pill button that was breaking mobile layout. Replaced "Settings" pill tab with a compact `FiSettings` icon button (matching org dashboard). Renamed remaining pill to "My Tickets" + "Hosting View" (org/admin only). "Hosting View" navigates to the organizer dashboard. Settings icon always pushed to the far right via `justify-between`.
2. **"Hosting View" gated on actual orgs:** Visibility condition changed from `roleData?.hasOrganization` to `orgData?.organizations?.length > 0 || roleData?.role === "admin"` — prevents the pill from appearing for regular users with zero organizations.
3. **Organizer dashboard "Attendee View" pill:** Added "Attendee View" pill after RSVPs tab inside the existing pill bar. Navigates to `/account` (user dashboard). No tab is highlighted for this pill since it navigates away.
4. **Org dashboard settings icon alignment:** Added `justify-between` to the org dashboard pill row so the `FiSettings` icon is always pinned to the far right, matching user dashboard layout.
5. **Icon consistency:** Both dashboards now use `FiSettings` from `react-icons/fi` (size 18, same style). Removed unused `CogTwo` import from `@mynaui/icons-react` in UserDashboard.

**Files:** `apps/web/app/components/UserDashboard.tsx`, `apps/web/app/components/OrganizerDashboard.tsx`

---

### #578 — StripeConnectStatus: "Manage Stripe Account" gray secondary CTA + guard comment (Mar 20, 2026)

**Summary:** Fully connected state must not use the primary solid white pill (`bg-white-100` / `text-dark`) for "Manage Stripe Account" — that treatment is reserved for Connect / Complete Setup. Web uses outline (`border-white-30`) + **muted label** (`text-white-50`, `hover:text-white-80`, `font-poppins-medium`) and matching spinner/icon tones so the CTA reads gray like a secondary action (parity with `PaymentAccountBanner` note pattern: inline `{/* */}` comment warns future edits not to promote this button to primary).

**Files:** `apps/web/app/components/StripeConnectStatus.tsx`

---

### #579 — UserDashboard: Hosting View gated on role + scrollable pill rail (Mar 20, 2026)

**Summary:**

1. **Hosting View / navigation parity:** "Hosting View" now renders only when `roleData?.role === "organizer" || roleData?.role === "admin"`, matching `handleNavigateToOrganizer` (which only routes for those roles). The previous `orgData?.organizations?.length > 0 || admin` guard could show the pill for users who had org API data but were not organizer/admin, producing a no-op click.
2. **`handleNavigateToOrganizer`:** Early return when role is neither organizer nor admin so render guard and handler stay aligned.
3. **Pill rail layout:** Replaced `w-fit` on the pill container with `flex-1 min-w-0 overflow-x-auto` so the rail can shrink beside the settings icon and scroll horizontally on narrow viewports; tab buttons use `shrink-0` with existing `whitespace-nowrap`.

**Files:** `apps/web/app/components/UserDashboard.tsx`

---

### #580 — NotificationsOverlay: swipe snap spring + dismiss strip primary red (Mar 23, 2026)

**Summary:** Swipe-to-dismiss row snap-back (release without dismissing, and server-dismiss revert) now uses the same spring as the overlay open (`damping: 22`, `stiffness: 250`, `mass: 0.8`) via shared `ROW_SNAP_SPRING`. Swipe reveal background uses `colors.primary` (`#FF0000`) instead of hardcoded pink.

**Files:** `apps/mobile/components/notifications/NotificationsOverlay.tsx`

---

### #581 — Mobile event detail: Promo Code + Promoter Code fields below ticket selection (Mar 23, 2026)

**Summary (Carry-Over from P9):** Added pre-checkout Promo Code and Promoter Code fields to the mobile event detail screen, matching the web pattern where both fields appear below ticket selection before the checkout sheet is opened.

1. **New `PreCheckoutCodes` component** (`apps/mobile/components/event-details/PreCheckoutCodes.tsx`): renders Promo Code (input + Apply / applied state) and Promoter Code (input + Apply / valid confirmed state) fields inline on the event detail screen. Uses identical visual patterns as `CheckoutMainSheet`. The Promo Apply button is disabled when no tier is selected (validation requires a selected tier for price calculation). Promoter field shows always; promoter codes from `?promoter=XYZ` deep links auto-populate.

2. **`resetStep()` added to `useCheckout`** (`apps/mobile/hooks/useCheckout.ts`): lightweight reset that cancels any active hold and clears step/error/result/serverAmounts, but deliberately preserves promo code, promo validation, promoter code, and promoter status. This allows pre-applied codes to survive opening/closing the checkout sheet.

3. **`handleContinueToCheckout` updated** (`apps/mobile/app/event/[id].tsx`): now calls `checkoutState.resetStep()` instead of `checkoutState.resetCheckout()` so pre-validated promo and promoter codes carry through into the checkout sheet without being wiped.

4. **State carry-through**: because `PreCheckoutCodes` reads from and writes to the same `checkoutState` as the `CheckoutSheet`, a promo code applied before opening the checkout sheet is immediately shown as applied inside the sheet (`promoApplied={!!checkoutState.promoValidation}`). Similarly, a validated promoter code flows into the RSVP/hold/payment API calls unchanged.

**Files:**
- `apps/mobile/components/event-details/PreCheckoutCodes.tsx` (new)
- `apps/mobile/hooks/useCheckout.ts`
- `apps/mobile/app/event/[id].tsx`

---

### #582 — Phase 10-1 PR review fixes (Mar 23, 2026)

Five bugs found in PR review of Phase 10-1 (event assignments, admin roles, org members):

1. **`useAssignedEvents` early return blocked co-host query** (`apps/mobile/hooks/useAssignedEvents.ts`): The `if (!user) return []` on line 52 was short-circuiting the entire function, including the co-host org assignment query that runs independently of the `users` row. If the Supabase `users` row is missing (e.g. mid-sync after Clerk sign-up), organizer-role members would see no assigned events at all — including co-host events that require only an `orgId`, not an internal user ID. Fixed by moving the direct-user query into an `if (user)` block so it's skipped when `user` is null, while the co-host query still runs unconditionally.

2. **`useAssignedEvents` deduplication dropped co-host info** (`apps/mobile/hooks/useAssignedEvents.ts`): When a user is both directly assigned AND part of a co-host org for the same event, the `Set`-based deduplication was silently dropping the second row. If the co-host assignment row arrived second, `is_cohost` and `cohost_org_name` were never set. Fixed by merging the co-host row into the existing `results` entry when the `eventId` is already seen.

3. **`useOrgMembers` sort mismatch** (`apps/mobile/hooks/useOrgMembers.ts`): The docstring documented "sorted by role priority (owner first) then by name" but the implementation sorted by `created_at`. Fixed by removing `.order("created_at")` and adding an in-memory sort using a `ROLE_PRIORITY` map (`owner: 0`, `admin: 1`, `organizer: 2`, `viewer: 3`) with secondary alphabetical sort by `user_first_name` then `user_email`.

4. **`useRemoveAssignment` missing `orgId` filter** (`apps/mobile/hooks/useEventAssignments.ts`): The delete query only filtered by `id`. Added `.eq("organization_id", orgId)` as a defense-in-depth guard. RLS (`get_admin_organizations()`) already blocks cross-org deletes, but the query should be explicitly scoped to the current org.

5. **Migration `assigned_by` FK without `ON DELETE` action** (`supabase/migrations/20260323195941_event_assignments_and_admin_roles.sql`): The original migration defined `assigned_by NOT NULL REFERENCES users(id)` with no `ON DELETE` action (defaulting to `RESTRICT`). Deleting a user who had made assignments would fail with a FK violation. Fixed directly in the migration before it was applied: `assigned_by` is now nullable with `ON DELETE SET NULL`, preserving assignment records as audit history when the assigning user is removed — consistent with the pattern used for other audit columns.

**Files:**
- `apps/mobile/hooks/useAssignedEvents.ts`
- `apps/mobile/hooks/useOrgMembers.ts`
- `apps/mobile/hooks/useEventAssignments.ts`
- `supabase/migrations/20260323195941_event_assignments_and_admin_roles.sql`

---

### #583 — Phase 10-1 follow-up: event_assignments indexes + INSERT policy (Mar 23, 2026)

Two database improvements surfaced in the second round of PR review:

1. **Missing lookup indexes** (`supabase/migrations/20260323214342_event_assignments_indexes_and_insert_policy.sql`): The original migration only created partial UNIQUE indexes on `(event_id, user_id)` and `(event_id, cohost_organization_id)`. Queries in `useAssignedEvents` filter by a single column (`user_id` or `cohost_organization_id`) and cannot use those leading-`event_id` multi-column indexes efficiently. Added three non-unique btree indexes: `event_assignments_user_id_idx`, `event_assignments_cohost_organization_id_idx`, and `event_assignments_organization_id_idx`.

2. **INSERT RLS policy didn't verify event ownership** (`supabase/migrations/20260323214342_event_assignments_indexes_and_insert_policy.sql`): The "Admins can create event assignments" policy only checked `organization_id IN (SELECT get_admin_organizations())`. An admin could create an assignment row where `organization_id` is their org but `event_id` belongs to a different org — a phantom assignment. Updated the `WITH CHECK` to also require `EXISTS (SELECT 1 FROM events WHERE id = event_id AND organization_id = organization_id)`, ensuring the assigned event actually belongs to the assigning org.

**Files:**
- `supabase/migrations/20260323214342_event_assignments_indexes_and_insert_policy.sql` (new)

---

## Phase 10-2: Member Management UI (Mar 23, 2026)

### #584 — Team Members screen (org-members.tsx) (Mar 23, 2026)

New screen for managing organization team members. Navigated to from the OrgSelector "Manage" button.

- **Member list:** FlatList of members sorted by role priority (owner → admin → organizer → viewer), showing initials avatar, full name, email, and colored role badge (Owner: `text-white-50`, Admin: `#238FDA`, Organizer: `#5DDBB1`).
- **Kebab menu:** Owner/admin sees "⋮" on non-owner rows with "Change Role" and "Remove" options. Owner rows never show the menu.
- **FAB:** Floating "+" button (bottom-right) opens the Add Member sheet. Only visible to owner/admin.
- **Remove confirmation:** Uses `Alert.alert` with destructive "Remove" button — consistent with existing app patterns.

**Files:**
- `apps/mobile/app/org-members.tsx` (new)
- `apps/mobile/components/navigation/RoleResolutionGate.tsx` (registered `org-members` as `presentation: "card"` Stack.Screen)

### #585 — Add Member bottom sheet (AddMemberSheet.tsx) (Mar 23, 2026)

Bottom sheet for adding a new member to the organization.

- **Email search:** Reuses existing `useSearchUsers` hook (`/api/organizer/search-users` endpoint). Input + search button, shows user result cards.
- **Role picker:** Two-button radio (Admin / Organizer). Owner role is never assignable. Viewer role excluded (it represents the attendee perspective, not an org team role).
- **Add flow:** Select user → pick role → "Add Member" button → `useAddMember` mutation → `Alert.alert("Success", ...)` → sheet closes and query invalidates.

**Files:**
- `apps/mobile/components/org-members/AddMemberSheet.tsx` (new)

### #586 — Edit Role bottom sheet (EditRoleSheet.tsx) (Mar 23, 2026)

Bottom sheet for changing a member's role.

- Shows member info card (initials avatar, name, email).
- Role picker with descriptions: Admin ("Can manage members, events, and settings") / Organizer ("Can scan tickets for assigned events").
- Save button disabled when role unchanged. On success: `Alert.alert` + close.

**Files:**
- `apps/mobile/components/org-members/EditRoleSheet.tsx` (new)

### #587 — OrgSelector always renders + "Manage" button (Mar 23, 2026)

Modified `OrgSelector` to always render for org users (previously hidden for single-org users).

- **Removed** `orgs.length <= 1` early return → replaced with `orgs.length === 0` guard.
- Single-org users see "Organization" header + "Manage" button (no org circles).
- Multi-org users see "Select Organization" header + org circles + "Manage" button.
- "Manage" button only visible when `canManageMembers(memberRole)` returns true (owner/admin).
- Added `memberRole` prop to `OrgSelectorProps`.

**Files:**
- `apps/mobile/components/scanner/OrgSelector.tsx` (modified)
- `apps/mobile/app/(tabs)/org-dashboard.tsx` (added `useMemberRole` hook, passes `memberRole` to OrgSelector, renders for single-org users)

---

## Phase 10-3: Dashboard Role Forking & Permission Gating (Mar 23, 2026)

Role-based permission gating across the organizer experience. Organizer-role members see a simplified UI — no stats, no event creation, no org settings, only assigned events and QR scanning.

### #588 — MemberRoleContext provider (Mar 23, 2026)

Created `MemberRoleContext` — a thin provider wrapping `useMemberRole` that centralizes `selectedOrgId` and `memberRole` for the entire component tree. Previously `selectedOrgId` was local state inside `org-dashboard.tsx` — other screens (scanner, account, rsvp-management, CustomTabBar) had no access to the active org or role.

- Provider calls `useMemberRole(effectiveOrgId)` once; consumers use `useMemberRoleContext()`.
- Exposes: `memberRole`, `isOwnerOrAdmin`, `isLoading`, `selectedOrgId`, `setSelectedOrgId`.
- Nested inside `ViewModeProvider` in `_layout.tsx`.
- `org-dashboard.tsx` migrated from local `selectedOrgId` state + direct `useMemberRole` call to context.

**Files:**
- `apps/mobile/contexts/MemberRoleContext.tsx` (new)
- `apps/mobile/app/_layout.tsx` (added `MemberRoleProvider`)
- `apps/mobile/app/(tabs)/org-dashboard.tsx` (switched to context)

### #589 — Gate "Create Event" tab for organizer-role (Mar 23, 2026)

Organizer-role members tapping the "Create Event" tab in the floating pill tab bar now see the `BecomeOrganizerSheet` instead of navigating to `/create-event`. Uses `canCreateEvents(memberRole)` from shared permissions.

**Files:**
- `apps/mobile/components/navigation/CustomTabBar.tsx` (added `useMemberRoleContext`, `canCreateEvents` gate in `handleTabPress`)

### #590 — Hide Organization & Payouts tabs for organizer-role (Mar 23, 2026)

Account settings screen now checks `canAccessOrgSettings(memberRole)` before showing Organization and Payouts tabs. Organizer-role members see only the Personal tab.

**Files:**
- `apps/mobile/app/account.tsx` (added `useMemberRoleContext`, `canAccessOrgSettings` check)

### #591 — Hide Access Codes management tab in scanner for organizer-role (Mar 23, 2026)

Scanner screen hides the "Access Codes" / "QR Scanner" tab switcher for organizer-role members. They land directly on the QR Scanner tab (enter code → camera scan). Access code management (generate/copy/manage codes per event) remains available for owner/admin only via `canManageAccessCodes(memberRole)`.

**Files:**
- `apps/mobile/app/scanner.tsx` (added `useMemberRoleContext`, `canManageAccessCodes` conditional rendering)

### #592 — RSVP management filtered to assigned events for organizer-role (Mar 23, 2026)

Parameterized `useRsvpEvents` hook to accept optional `assignedEventIds` filter. When provided, the Supabase events query uses `.in("id", assignedEventIds)` to fetch only matching events. RSVP management screen passes assigned event IDs from `useAssignedEvents` for organizer-role members; owner/admin see all org events as before.

**Files:**
- `apps/mobile/hooks/useRsvpManagement.ts` (`useRsvpEvents` accepts `assignedEventIds?` param)
- `apps/mobile/app/(tabs)/rsvp-management.tsx` (added context + `useAssignedEvents` integration)

### #593 — Fork org-dashboard by role + OrganizerSimplifiedDashboard (Mar 23, 2026)

`OrgDashboardScreen` now forks at the top level by `memberRole`. Organizer-role members render `OrganizerSimplifiedDashboard` — a stripped-down dashboard with:
- QR Scanner big card (enter access code → scan tickets)
- OrgSelector (always rendered per P10-2)
- "Your Assigned Events" list (current & upcoming only, no past events accordion)
- Co-host labels ("By Org A & Org B") on assigned event cards
- NO `OrgStatsSection` (no total events, no total revenue)
- NO `PaymentAccountBanner`

Owner/admin render the full dashboard as before via `FullOrgDashboard`.

**Files:**
- `apps/mobile/components/org-dashboard/OrganizerSimplifiedDashboard.tsx` (new)
- `apps/mobile/app/(tabs)/org-dashboard.tsx` (role fork at top, extracted `FullOrgDashboard`)

---

### Phase 10-3 — Behavioral Changes & Migration Notes

#### MemberRoleContext provider

New context centralizing `memberRole` + `selectedOrgId` for all screens.

**Public API (`useMemberRoleContext()` return shape):**
- `memberRole: OrgMemberRole | null` — the user's role in the active org; `null` while loading or when the user has no membership
- `isOwnerOrAdmin: boolean` — convenience flag
- `isLoading: boolean` — true while the role query is in-flight; consumers must wait before branching on `memberRole`
- `selectedOrgId: string | null` — the currently selected org ID (falls back to the user's default org)
- `setSelectedOrgId: (id: string | null) => void` — switch the active org (e.g. from OrgSelector)

**Provider location:** `MemberRoleProvider` is nested inside `ViewModeProvider` in `_layout.tsx`.

#### Permission gating functions (from `@project-flame/lib`)

| Function | Blocks when | Applied in |
|---|---|---|
| `canCreateEvents(role)` | role is `organizer` | `CustomTabBar` — "Create Event" tab press |
| `canAccessOrgSettings(role)` | role is `organizer` | `account.tsx` — hides Organization + Payouts tabs |
| `canManageAccessCodes(role)` | role is `organizer` | `scanner.tsx` — hides Access Codes management tab |
| `canViewAllEvents(role)` | role is `organizer` | `org-dashboard.tsx` — forks to `OrganizerSimplifiedDashboard` |

When `memberRole` is `null` (loading), all permission helpers return their "restricted" default — screens should display a loading indicator rather than rendering gated content prematurely.

#### OrgDashboard fork

`OrgDashboardScreen` shows a loading spinner while `isLoading` is true (role not yet resolved), then forks by `canViewAllEvents(memberRole)`:

- **Owner / Admin / Viewer (`canViewAllEvents` → true):** `FullOrgDashboard` — full stats, all events, revenue, `PaymentAccountBanner`
- **Organizer (`canViewAllEvents` → false):** `OrganizerSimplifiedDashboard` — QR Scanner card, OrgSelector, "Your Assigned Events" list (no stats, no revenue)

`OrganizerSimplifiedDashboard` filters `assignedEvents` to `organization_id === selectedOrgId` so switching orgs shows the correct event set without a re-fetch.

#### useRsvpEvents — `assignedEventIds` parameter semantics

The hook now accepts `string[] | null | undefined`:
- `undefined` — full access; fetch all org events (owner / admin)
- `null` — loading/paused; query is **disabled** — organizers never temporarily see all events while `useAssignedEvents` is in-flight
- `string[]` — organizer filter; even an empty array returns zero events (no DB call) instead of all events
- The RSVP count sub-query is also narrowed with `.in("event_id", assignedEventIds)` when IDs are available, reducing read volume for organizer-role sessions.

**Callers must send `null` (not `undefined`) while assignments are loading.** Sending `undefined` opts into full-access mode.

---

## Phase 10-3 Bug fixes & polish (Mar 23, 2026)

### #594 — Fix ActivityIndicator color in org-members.tsx (Mar 23, 2026)

`ActivityIndicator` in the loading state used `colors["white-50"]` (semi-transparent). Changed to `"#FFFFFF"` to match the solid white spinner used on all other screens.

**Files:**
- `apps/mobile/app/org-members.tsx`

---

### #595 — Guard "owner" role in EditRoleSheet Save button (Mar 23, 2026)

Save button was only disabled when `selectedRole === currentRole`, allowing a theoretical save if `member.role === "owner"`. Added `|| member?.role === "owner"` to both `disabled` and `opacity` expressions. The `useEffect` that syncs the picker now also handles non-assignable roles (falls back to `"organizer"`) so the picker is always in a deterministic state regardless of incoming role.

**Files:**
- `apps/mobile/components/org-members/EditRoleSheet.tsx`

---

### #596 — Fix useRsvpEvents empty-array guard (Mar 23, 2026)

The previous `.in()` guard only checked `assignedEventIds.length > 0`, so an empty array skipped the filter and returned ALL org events for organizers with no assignments. Fixed by adding a `null` sentinel for the "loading" state and a short-circuit `return { currentEvents: [], pastEvents: [] }` when the array resolves to empty. `useRsvpEvents` now accepts `string[] | null | undefined` with clear semantics per value.

**Files:**
- `apps/mobile/hooks/useRsvpManagement.ts`
- `apps/mobile/app/(tabs)/rsvp-management.tsx`

---

### #597 — RSVP sub-query narrowed for organizer-role (Mar 23, 2026)

The RSVP count sub-query inside `useRsvpEvents` now applies `.in("event_id", assignedEventIds)` when organizer IDs are available, reducing unnecessary read volume for organizer-role sessions.

**Files:**
- `apps/mobile/hooks/useRsvpManagement.ts`

---

### #598 — Fix BecomeOrganizerSheet shown to organizer-role on "Create Event" (Mar 23, 2026)

Organizer-role members tapping "Create Event" were shown the `BecomeOrganizerSheet` ("Host Your Own Events") which is misleading — they're already org members. The gate now shows `Alert.alert` with an explanatory message when `memberRole` is set (already a member, just restricted), and only shows `BecomeOrganizerSheet` for users with no org at all.

**Files:**
- `apps/mobile/components/navigation/CustomTabBar.tsx`

---

### #599 — Fix scanner activeTab stuck on "qr-scanner" after role loads (Mar 23, 2026)

`useState` captures its initial value at mount time. When `memberRole` is still `null` (loading), `showAccessCodes` is `false`, so `activeTab` initialized to `"qr-scanner"`. After role resolved to owner/admin, the tab bar rendered but stayed on QR Scanner. Fixed with a `useEffect` that sets `"access-codes"` once role resolves and `showAccessCodes` is true, and falls back to `"qr-scanner"` if `showAccessCodes` later turns false. Explicit user navigation is preserved via `prev ===` guards.

**Files:**
- `apps/mobile/app/scanner.tsx`

---

### #600 — OrgDashboard waits for role resolution before forking (Mar 23, 2026)

`OrgDashboardScreen` previously branched on `memberRole === "organizer"` immediately, which rendered `FullOrgDashboard` before the role was resolved (since `null !== "organizer"`). Added an `isLoading` spinner gate and switched the condition to `canViewAllEvents(memberRole)` from `@project-flame/lib` for consistency with other permission checks.

**Files:**
- `apps/mobile/app/(tabs)/org-dashboard.tsx`

---

### #601 — Gate useOrgMembers on role resolution in org-members screen (Mar 23, 2026)

`useOrgMembers` was called unconditionally, allowing any user who navigated directly to `/org-members?orgId=...` to trigger the DB query before authorization was confirmed. The query is now disabled until `useMemberRole` finishes loading and `canManageMembers(memberRole)` is true. Non-admins see an explicit "unauthorized" UI instead of a loading spinner or empty list.

**Files:**
- `apps/mobile/app/org-members.tsx`

---

### #602 — Expose error + refetch from useMemberRole; distinct error states in org-members (Mar 23, 2026)

`useMemberRole` now returns `error` and `refetch` from the underlying React Query instance. `org-members.tsx` now has four distinct render states: loading, role-query error (retry calls `refetchRole`), unauthorized (role resolved but `!isAdmin`), members-query error (retry calls `refetchMembers`), and the normal list. Previously a role query failure was silently treated as `null` role, collapsing into the non-admin branch with no recovery path.

**Files:**
- `apps/mobile/hooks/useMemberRole.ts`
- `apps/mobile/app/org-members.tsx`

---

### #603 — OrganizerSimplifiedDashboard scopes events to active org (Mar 23, 2026)

The direct-assignment query in `useAssignedEvents` only filters by `user_id`, not `organization_id`. Switching orgs could show assignments from other orgs. `OrganizerSimplifiedDashboard` now filters `assignedEvents` to `organization_id === selectedOrgId` before rendering, scoping the list to the active org without changing the hook.

**Files:**
- `apps/mobile/components/org-dashboard/OrganizerSimplifiedDashboard.tsx`

---

### #604 — MemberRoleContext value memoized (Mar 23, 2026)

The context value object was recreated on every render, causing all `useMemberRoleContext()` consumers to re-render unnecessarily. Wrapped in `useMemo` with `[memberRole, isOwnerOrAdmin, isLoading, effectiveOrgId, setSelectedOrgId]` as dependencies.

**Files:**
- `apps/mobile/contexts/MemberRoleContext.tsx`

---

### #605 — scanner activeTab falls back when showAccessCodes turns false (Mar 23, 2026)

The previous `useEffect` only handled `showAccessCodes` becoming true. If a user's role changed (or the context refreshed) and `showAccessCodes` turned false while `activeTab` was `"access-codes"`, the tab stayed stuck on the now-hidden tab. Added the symmetric `else` branch to fall back to `"qr-scanner"` in that case.

**Files:**
- `apps/mobile/app/scanner.tsx`

---

### #606 — org-members kebab dropdown extracted into DropdownMenu component (Mar 23, 2026)

The inline-styled kebab dropdown View in `renderMember` duplicated positioning, shadow, and border styles. Extracted into a reusable `DropdownMenu` component that accepts `open`, `children`, `top`, `right`, and `style` props, with all default styles encapsulated inside.

**Files:**
- `apps/mobile/components/org-members/DropdownMenu.tsx` (new)
- `apps/mobile/app/org-members.tsx`

---

### #607 — org-members validates orgId with Zod at the param boundary (Mar 23, 2026)

Replaced the simple truthiness guard with a Zod UUID parse (`orgIdSchema.safeParse`) immediately after `useLocalSearchParams`. All hooks receive `validatedOrgId` (empty string when invalid, keeping hook calls unconditional). After all hooks, an invalid parse result renders an explicit "Invalid or missing organization link" error UI instead of a silent null return.

**Files:**
- `apps/mobile/app/org-members.tsx`

---

### #608 — removeMember moved behind server API (Mar 23, 2026)

`useRemoveMember` was calling `organization_members.delete()` directly from the mobile Supabase client. Moved the delete behind a new server-side POST endpoint that verifies the caller is owner/admin of the org, prevents removing owners, and uses `supabaseAdmin` for the actual delete. Updated the mobile hook to call the API via `apiPost`.

**Files:**
- `apps/web/app/api/organizations/members/remove/route.ts` (new)
- `apps/mobile/hooks/useManageMembers.ts`

---

## Phase 10-2/10-3 PR Review Fixes — `/api/organizations/members/remove` (Mar 23, 2026)

Three issues found and fixed in `apps/web/app/api/organizations/members/remove/route.ts` during PR review:

### 1. Malformed JSON returns 500 instead of 400

- **Issue:** `await req.json()` throws on malformed input, which hits the outer `catch` and returns a generic 500. Client input errors must return 400.
- **Fix:** Replaced `req.json()` with `req.text()` + `JSON.parse` in a try/catch; returns `{ error: "Malformed JSON" }` with status 400 on parse failure, then runs `bodySchema.safeParse` as before.
- **File:** `apps/web/app/api/organizations/members/remove/route.ts` (lines ~32–46)

### 2. DB errors collapsed into 403/404

- **Issue:** `if (callerError || !callerUser)` returns 404 for both DB failures and missing rows; `if (callerMembershipError || !callerMembership)` returns 403 for both. DB failures should return 500.
- **Fix:** Split each combined check into two: first check the error (log + return 500), then check for null result (return 404/403). Applied to all three DB lookups (caller user, caller membership, target member).
- **File:** `apps/web/app/api/organizations/members/remove/route.ts` (lines ~55–104)

### 3. TOCTOU: role read and delete in separate queries

- **Issue:** Target member role was read, then deleted in a separate query. A race condition where role changes to `owner` between check and delete could result in deleting the owner.
- **Fix:** Added `.neq("role", "owner")` predicate to the delete query and `.select("id")` to detect affected rows. If `deleted.length === 0`, returns 409 (member not found or concurrently promoted to owner). The existing role-check before delete is kept for a clear error message on the non-race path.
- **File:** `apps/web/app/api/organizations/members/remove/route.ts` (lines ~113–137)

---

## Phase 10-4: P10 PR Review — clerkId null-safety guards (Mar 23, 2026)

Two unsafe non-null assertions on `clerkId` found during PR review of the event assignment and co-host sheets.

### 1. CoHostAssignmentSheet: unguarded clerkId! in handleAddCohost

- **Issue:** `handleAddCohost` used `clerkId!` when calling `.eq("clerk_id", clerkId!)`. If `clerkId` is undefined (unauthenticated state), this sends a broken query to Supabase instead of failing gracefully.
- **Fix:** Added an early `if (!clerkId)` guard at the top of `handleAddCohost` (before `getAuthenticatedClient` is called) that shows an `Alert` and returns early. Removed the `!` assertion from the `.eq()` call.
- **File:** `apps/mobile/components/org-members/CoHostAssignmentSheet.tsx` (lines ~89–121)

### 2. EventAssignmentSheet: unguarded clerkId! in handleSave

- **Issue:** `handleSave` used `clerkId!` in the `.eq("clerk_id", clerkId!)` users query after `setSaving(true)`. If `clerkId` is undefined, the query is incorrect and `saving` is left as `true` with no user feedback.
- **Fix:** Added an `if (!clerkId)` guard before `setSaving(true)` so the loading state is never set for an unauthenticated user. Shows an `Alert` and returns early. Removed the `!` assertion from the `.eq()` call.
- **File:** `apps/mobile/components/org-members/EventAssignmentSheet.tsx` (lines ~108–126)

---

## Phase 10-4: P10 PR Review — co-host bugs and race conditions (Mar 23, 2026)

### 1. Race condition: stale search results overwrite cleared input (Bug 1)

- **Issue:** In `useSearchApprovedOrganizations`, if the user clears input after the 350 ms debounce fires but while the Supabase request is in-flight, `search("")` sets `results = []` immediately but cannot cancel the pending fetch. When the response arrives, `setResults(data)` overwrites the cleared state with stale org cards. In `CoHostAssignmentSheet`, results rendered unconditionally on `results.length > 0` with no `searchQuery` guard, so stale "Add" buttons appeared on an empty input.
- **Fix 1 — `useSearchApprovedOrganizations`:** Added `requestIdRef` (incrementing int). Each debounced async closure captures its `requestId` at start; after the fetch resolves, results/error/searching state is only updated when `requestId === requestIdRef.current`. Clearing input (or `clearResults`) increments the ref to invalidate any in-flight request.
- **Fix 2 — `CoHostAssignmentSheet`:** Added `searchQuery.trim().length > 0` guard on the results block as defense-in-depth so stale results can never render against an empty input.
- **Files:** `apps/mobile/hooks/useSearchApprovedOrganizations.ts`, `apps/mobile/components/org-members/CoHostAssignmentSheet.tsx`

### 2. useEffect resets in-progress checkbox selections on refetch (Bug 2)

- **Issue:** In `EventAssignmentSheet`, the sync `useEffect([visible, assignedEventIds])` fires on every change to `assignedEventIds` while `visible` is `true`. A background refetch or query invalidation from a failed partial save discards all in-progress toggles by resetting `checkedIds` to server state.
- **Fix:** Added `prevVisibleRef` to track the previous `visible` value. The effect now calls `setCheckedIds(new Set(assignedEventIds))` only when `visible` transitions from `false → true` (sheet open). Changes to `assignedEventIds` while the sheet stays open leave `checkedIds` untouched.
- **File:** `apps/mobile/components/org-members/EventAssignmentSheet.tsx`

### 3. org-dashboard: assignments/cohostEvents errors silently swallowed

- **Issue:** `useEventAssignments` and `useCohostEvents` were destructured with only `{ data }`. Errors caused empty labels/badges with no UI feedback; `assignmentsLoading`/`cohostEventsLoading` were absent from memo deps.
- **Fix:** Destructured `isLoading` and `error` for both hooks. Added guards (`|| assignmentsLoading || assignmentsError`) to `cohostLabelMap` and `cohostBadgeMap` memos. Added all new vars to memo dependency arrays.
- **File:** `apps/mobile/app/(tabs)/org-dashboard.tsx`

### 4. Co-hosted events not reachable in org-event-detail

- **Issue:** `org-event-detail.tsx` finds the event with `orgEvents?.find(e => e.id === id)`. `useOrgEvents` returns only owned events. Tapping a co-hosted event card navigated to the detail screen but `event` resolved to `null`, showing "Event not found".
- **Fix:** Imported `useCohostEvents(selectedOrgId)` in the detail screen. The `event` memo now falls back: `orgEvents?.find(...) ?? cohostEventsData?.find(ce => ce.event.id === id)?.event ?? null`.
- **File:** `apps/mobile/app/org-event-detail.tsx`

### 5. org-event-detail: "No co-host organizations" shown during assignments load

- **Issue:** `currentCohosts` returned `[]` when `assignments` was `undefined` (loading), making the co-hosts row subtitle display "No co-host organizations" before data arrived.
- **Fix:** `currentCohosts` now returns `null` when `assignments` is `undefined`. The UI subtitle checks `assignmentsLoading || currentCohosts === null` and shows "Loading…" in that case.
- **File:** `apps/mobile/app/org-event-detail.tsx`

### 6. OrgEventCard: cohostBadge overflows on long org names

- **Issue:** The co-host badge `View` had no width constraint and the `Text` had no line limit, causing long organization names to overflow the card layout.
- **Fix:** Added `maxWidth: "60%"` to the badge `View` and `numberOfLines={1}` + `ellipsizeMode="tail"` to the `Text`.
- **File:** `apps/mobile/components/org-dashboard/OrgEventCard.tsx`

### 7. CoHostAssignmentSheet: search/add enabled while assignments loading

- **Issue:** `excludeIds` was computed from `currentCohostIds` which derived from `assignments`. While `assignments` was loading (`undefined`), `currentCohostIds` was empty and search could return already-assigned co-hosts.
- **Fix:** Destructured `isLoading: assignmentsLoading` from `useEventAssignments`. Added `isSearchDisabled = isMutating || assignmentsLoading`. The `TextInput` (`editable`) and "Add" `Pressable` (`disabled`, `opacity`) now use `isSearchDisabled`.
- **File:** `apps/mobile/components/org-members/CoHostAssignmentSheet.tsx`

**Deferred:** `EventAssignmentSheet` silent `Promise.resolve()` on missing assignment → `docs/todos/NITPICKS_TODOS.md`

---

## Phase 10-4: P10 PR Review — EventAssignmentSheet loading guards (Mar 23, 2026)

### 1. useEffect seeds checkedIds with empty set when assignments still loading at open

- **Issue:** The `prevVisibleRef` fix (previous session) correctly avoids re-syncing while the sheet stays open, but `assignedEventIds` returns `new Set()` when `assignments` is `undefined` (loading). If the sheet opens before assignments finish loading, `visible && !wasVisible` fires immediately, captures the empty set, and sets `initializedRef` (effectively). When assignments later load, `assignedEventIds` changes but `wasVisible` is already `true`, so `setCheckedIds` never fires — all checkboxes remain unchecked.
- **Fix:** Added `initializedRef` alongside `prevVisibleRef`. On open: `initializedRef = false`. The sync fires when `visible && !initializedRef.current && !assignmentsLoading`, then sets `initializedRef = true`. This correctly handles both "data already loaded at open" and "data arrives after open" cases without re-syncing on refetch mid-session.
- **File:** `apps/mobile/components/org-members/EventAssignmentSheet.tsx`

### 2. useOrgEvents / useEventAssignments errors silently show empty state

- **Issue:** Only `data` and `isLoading` were destructured from both hooks. On query failure, `orgEvents` and `assignments` are `undefined`, `currentEvents` is `[]`, and the UI showed "No current or upcoming events" with no indication of the error. The Save button remained enabled.
- **Fix:** Destructured `error: eventsError` and `error: assignmentsError` from both hooks. Added `isError = Boolean(eventsError || assignmentsError)`. Added an error branch in the event list rendering (icon + "Failed to load events. Please try again."). Save button is now also disabled when `isError` is true.
- **File:** `apps/mobile/components/org-members/EventAssignmentSheet.tsx`

**Skipped:** MARCH_2026_FIXES.md numbering comment — reviewer invented a `#608`+ global ID scheme that does not exist in this file; existing entries use `### N.` within phase sections (max `### 324.`).

**Deferred:** `Promise.all` partial failure → `docs/todos/EDGE_CASES_TODOS.md`; event row `Pressable` a11y → `docs/todos/ACCESSIBILITY_TODOS.md`; extract `EventRow`/`SheetBody`/`SheetFooter` + `SheetHeader`/`SaveButton` → `docs/todos/NITPICKS_TODOS.md` (consolidated)

---

## Phase 10: P10-1/P10-2 Testing Review Fixes (Mar 24, 2026)

Fixes from manual testing of P10-1 (Database/Types/Hooks) and P10-2 (Member Management UI).

---

### 1. Single-org users see no org pill in OrgSelector (Mar 24, 2026)

- **Issue:** `OrgSelector.tsx` gated the horizontal org circles behind `hasMultipleOrgs` (line 90). Single-org admins/organizers had no visual indication of which organization they belonged to — only the header "Organization" + "Manage" button showed.
- **Fix:** Removed the `hasMultipleOrgs` guard. Org circles now always render for all users with at least one org, so single-org users see their org's logo and name.
- **File:** `apps/mobile/components/scanner/OrgSelector.tsx`

### 2. Team members display as "Unknown" — missing users RLS policy (Mar 24, 2026)

- **Issue:** `useOrgMembers` joins `organization_members → users` to show name and email, but the `users` table RLS only allows `SELECT` on your own row (`clerk_id = jwt.sub`). For all teammates, the join returned `null` for email, first_name, last_name — causing `getDisplayName()` to fall back to "Unknown".
- **Fix:** Created new migration `20260324221813_org_teammates_view_profiles.sql` (remote version from Supabase MCP `apply_migration`) with a `SECURITY DEFINER` helper `get_org_teammate_user_ids()` (returns user IDs who share an org with the caller) and a new SELECT policy "Org members can view teammate profiles" on the `users` table (`TO authenticated`, same as RSVP profile policy). Follows the same pattern as `get_rsvp_user_ids()` to avoid RLS recursion.
- **File:** `supabase/migrations/20260324221813_org_teammates_view_profiles.sql`

### 3. "Assign Events" menu shown for admin members (Mar 24, 2026)

- **Issue:** The kebab menu in `org-members.tsx` showed "Assign Events" for all non-owner members (admins and organizers). Since admins already see all events in the full dashboard, per-event assignment is only meaningful for organizer-role members.
- **Fix:** Wrapped the "Assign Events" menu item in `{item.role === "organizer" && (...)}` so it only appears on organizer rows.
- **File:** `apps/mobile/app/org-members.tsx`

### 4. Organizer rows lack event assignment count (Mar 24, 2026)

- **Issue:** The team members list showed role badges (e.g., "Organizer") but no indication of how many events each organizer was assigned to. Admins had to open the assignment sheet per member to check.
- **Fix:** Added `useEventAssignments` to `org-members.tsx`, built a `Map<user_id, count>` from assignment data, and appended " — X events assigned" (or "No events assigned") to the role badge text for organizer-role rows.
- **File:** `apps/mobile/app/org-members.tsx`

### 5. Remove member doesn't clean up event_assignments or reset users.role (Mar 24, 2026)

- **Issue:** The `/api/organizations/members/remove` endpoint deleted the `organization_members` row but: (a) left orphaned `event_assignments` rows for that user in the org, and (b) did not reset `users.role` when the user had no remaining org memberships. The `users.role` column (set to `'organizer'` when a user first joins/creates an org) is checked by `useUserRole` at line 114 — if it's still `'organizer'`, the user stays in the org dashboard view even with zero memberships. This caused removed members to appear "stuck as organizer."
- **Fix:** After successful member deletion, the API now: (1) deletes `event_assignments` rows matching the removed user's `user_id` + `organization_id`, (2) checks if the user has any remaining `organization_members` rows — if zero, resets `users.role` to `'user'` so they revert to the attendee view. Also added cache invalidation for `["event-assignments"]` and `["assigned-events"]` in the `useRemoveMember` hook.
- **Files:** `apps/web/app/api/organizations/members/remove/route.ts`, `apps/mobile/hooks/useManageMembers.ts`

### 6. Assigned events flow verified — no code bug (Mar 24, 2026)

- **Issue (reported):** "Assigned events to a user but nothing happened."
- **Finding:** Full trace of the assignment flow confirmed correct wiring: EventAssignmentSheet saves with internal user UUID, useAssignedEvents resolves clerk_id → internal UUID, RLS SELECT on event_assignments allows organizers to read their own assignments, events RLS via `get_user_organizations()` includes all member roles (no role filter). MCP confirmed 2 rows exist in the table. Most likely cause: test events were past (ends_at < now) so the hook filtered them out, or the organizer's app had a stale cache (admin-side invalidation doesn't propagate to the organizer's React Query cache). No code change needed — re-test after deploying the RLS migration (#2 above) with current/upcoming events.

### 7. Stale closure on assignmentCountMap in renderMember (Mar 24, 2026)

- **Issue:** `assignmentCountMap` in `org-members.tsx` was rebuilt as a bare `new Map()` every render but was not listed in `renderMember`'s `useCallback` dependency array. When assignment data changed (e.g. after assigning events in the sheet), `renderMember` held a stale closure over the old map — the "X events assigned" count text would not update until an unrelated dep like `menuOpenId` changed.
- **Fix:** Wrapped the map construction in `useMemo(() => { ... }, [assignments])` for stable identity, and added `assignmentCountMap` to `renderMember`'s `useCallback` dependency array.
- **File:** `apps/mobile/app/org-members.tsx`

---

## Phase 10: P10-2 Security & UX Review Fixes (Mar 24, 2026)

### 1. Teammate RLS policy exposed full users row including PII (Mar 24, 2026)

- **Issue:** The `"Org members can view teammate profiles"` SELECT policy on `public.users` (added in `20260324221813_org_teammates_view_profiles.sql`) granted row-level access to the entire `users` table for org teammates. The table includes `document_id`, `phone`, `billing_address`, `ip_address`, and `date_of_birth`. A raw Supabase API call with a valid authenticated JWT — e.g. `GET /rest/v1/users?id=eq.{uuid}` — would return all PII columns for any teammate, bypassing the app's column-restricted queries.
- **Fix:** New migration `20260324225652_fix_teammate_pii_exposure.sql` (remote version from Supabase MCP `apply_migration`) drops the broad policy and the `get_org_teammate_user_ids()` function. Replaces them with a `SECURITY DEFINER` RPC `get_org_members_with_profiles(p_org_id uuid)` that joins `organization_members ↔ users` internally and returns only safe columns (`id, first_name, last_name, email`). Access-guarded by `get_admin_organizations()` so only owner/admin callers get results. Updated `useOrgMembers.ts` to call the RPC via `supabase.rpc()` instead of the PostgREST join query.
- **Files:** `supabase/migrations/20260324225652_fix_teammate_pii_exposure.sql`, `apps/mobile/hooks/useOrgMembers.ts`

### 2. users.role reset on member removal didn't guard platform admins (Mar 24, 2026)

- **Issue:** In the remove member API, the `users.role` reset to `'user'` fired for ANY role value when no org memberships remained. The `user_role` enum includes `'admin'` (platform-level privilege used by RLS policies like "Admins can manage order errors"). Removing a platform admin from their last org would silently overwrite `users.role = 'admin'` → `'user'`, stripping platform-level access.
- **Fix:** Added `.eq("role", "organizer")` to the update query — only users with `role = 'organizer'` are reset to `'user'`. Platform admins (`role = 'admin'`) are unaffected.
- **File:** `apps/web/app/api/organizations/members/remove/route.ts`

### 3. "No events assigned" shown prematurely while assignments query loads (Mar 24, 2026)

- **Issue:** `useEventAssignments` runs in parallel with `useOrgMembers`. The member list can render before the assignments query resolves, causing all organizer rows to flash "No events assigned" briefly (assignmentCountMap returns 0 while data is in-flight).
- **Fix:** Extracted `isLoading: assignmentsLoading` and `isError: assignmentsError` from `useEventAssignments`. The assignment count suffix is now gated on `!assignmentsLoading && !assignmentsError` — nothing is shown while loading or on error. Added both to `renderMember`'s `useCallback` dependency array.
- **File:** `apps/mobile/app/org-members.tsx`

### 4. event_assignments not cleaned up on role change from organizer (Mar 24, 2026)

- **Issue:** `useUpdateMemberRole` only updated the `organization_members.role` column. When a member was changed from organizer → admin, their `event_assignments` rows remained in the DB. The "Assign Events" menu item is gated on `item.role === "organizer"`, so there was no UI path to clean up the stale assignments. Assignments are organizer-specific (used for dashboard filtering) and are meaningless for admins who see all events.
- **Fix:** Added `userId: string` to `UpdateRoleInput`. When `newRole !== "organizer"`, the mutation now deletes `event_assignments` for that `user_id + organization_id` after the role update (best-effort, same pattern as remove route). Updated `EditRoleSheet` to pass `member.user_id` in the mutate call. Added `["event-assignments", orgId]` and `["assigned-events"]` to `onSuccess` cache invalidation.
- **Files:** `apps/mobile/hooks/useManageMembers.ts`, `apps/mobile/components/org-members/EditRoleSheet.tsx`

### 5. Duplicate changelog entries merged (Mar 24, 2026)

- **Issue:** Prior session created two overlapping entries: entry #5 ("Remove member doesn't clean up event_assignments or reset users.role") and entry #7 ("Removed member stays organizer — users.role not reset"). Entry #7 was a subset of #5.
- **Fix:** Removed entry #7; entry #5 already covers the full fix. Renumbered #8 → #7.
- **File:** `docs/fixes/MARCH_2026_FIXES.md`

---

## Phase 10: P10 Post-Testing Enhancements (Mar 25, 2026)

### 1. Assigned events cards missing attendees and revenue (Mar 25, 2026)

- **Issue:** Organizer-role members' "Your Assigned Events" section used a lightweight `AssignedEventCard` that only showed event name, date, time, location, and co-host labels — no attendees count or revenue. Owners/admins saw `OrgEventCard` with attendees and revenue, creating an inconsistent experience.
- **Fix:** Extended `useAssignedEvents` to fetch `ticket_tiers` (with `ticket_stages`) and `currency` alongside event data. Added `computeTierAttendees` and `computeTierRevenueCents` helper functions to the hook. `AssignedEvent` type now includes `attendees`, `revenueCents`, and `currency` fields. Replaced the local `AssignedEventCard` in `OrganizerSimplifiedDashboard` with `OrgEventCard` (same card used by owners/admins), building `OrgEventCardData` from the enriched assigned event data.
- **Files:** `apps/mobile/hooks/useAssignedEvents.ts`, `apps/mobile/components/org-dashboard/OrganizerSimplifiedDashboard.tsx`

### 2. Unified co-host badge display for all perspectives (Mar 25, 2026)

- **Issue:** The full org dashboard showed "By [OwnerOrg] & [CohostOrg]" as a text label (`cohostLabel`) below event cards owned by the org that had co-hosts. But co-host orgs saw a "Co-host with [OwnerOrg]" badge (top-right blue pill). The two different display formats were confusing — the user expected a unified "Co-host with X" badge for both perspectives.
- **Fix:** Consolidated `cohostLabelMap` and `cohostBadgeMap` in `org-dashboard.tsx` into a single unified `cohostBadgeMap`. Own events with co-host orgs now show "Co-host with [CohostOrg]" badge (same blue pill, top-right). Removed `cohostLabel` prop from `OrgEventCard` usages in the full dashboard. Both owner and co-host perspectives now use the same badge format.
- **File:** `apps/mobile/app/(tabs)/org-dashboard.tsx`

### 3. Co-host org names shown on public event detail page (Mar 25, 2026)

- **Issue:** When browsing events, the event detail page showed "By [OwnerOrg]" via `OrganizerBadge`. For co-hosted events, only the owning org was displayed — co-host orgs were invisible to attendees.
- **Fix:** (1) Extended `get_event_with_tiers` RPC to include `cohost_org_names` — a JSON array of co-host org names queried from `event_assignments` joined with `organizations`. New migration `20260326011328_add_cohost_names_to_get_event_rpc.sql` applied via Supabase MCP. (2) Updated `useEventDetails` schema to validate the new `cohost_org_names` array, and added the field to `EventDetail` interface. (3) Updated mobile `event/[id].tsx` to build the organizer name as `"[OwnerOrg] & [CohostOrg1] & [CohostOrg2]"` when co-hosts exist. (4) Updated web `EventDetail.tsx` to show the same combined organizer name. (5) Updated web `getEventBySlug` to fetch co-host org names from `event_assignments`.
- **Files:** `supabase/migrations/20260326011328_add_cohost_names_to_get_event_rpc.sql`, `apps/mobile/hooks/useEventDetails.ts`, `apps/mobile/app/event/[id].tsx`, `apps/web/app/events/[slug]/page.tsx`, `apps/web/app/components/EventDetail.tsx`

### 4. In-app notifications role analysis — no code change needed (Mar 25, 2026)

- **Finding:** Full audit of the notification dispatch system. Current behavior:
  - **User-facing notifications** (`rsvp_pending`, `rsvp_approved`, `rsvp_rejected`, `event_date_changed`, `event_reminder`): correctly targeted to the specific user or all ticket holders.
  - **Org-facing push notifications** (`new_rsvp_request`, `ticket_sold`): sent via `sendPushToOrgMembers()` to ALL org members (owner, admin, organizer, viewer) without role filtering.
  - **Org-facing emails** (`sendOrganizerRsvpNotification` for new RSVP requests): also sent to ALL org members — not filtered to owners/admins only.
  - **Auth expiry warning**: sent to the specific organizer user resolved by the cron job.
- **Assessment:** For small teams (current state), sending to all members is acceptable — each user can opt out via notification preferences. However, organizer-role members receive notifications for ALL org events, not just their assigned events, and viewers receive notifications they can't act on.
- **Deferred:** Role-filtered org notifications (e.g., `new_rsvp_request` / `ticket_sold` only to owner/admin, or scoped to assigned events for organizers) logged in `docs/todos/EDGE_CASES_TODOS.md`.

### 5. Co-host merge path + terminology + changelog order (Mar 26, 2026)

Four additional findings from the P10 PR review batch:

- **`useAssignedEvents.ts` merge path missing `assignmentOrgId` update (bug):** When a user is *both* directly assigned to an event *and* their org is a co-host of the same event, the `seen.has(eventId)` dedup branch updated `is_cohost`, `cohost_org_name`, `image_url`, and `source_org_name` but did NOT update `assignmentOrgId`. The first row (direct user assignment, no `cohost_organization_id`) set `assignmentOrgId` to the owner org's ID. After the merge, the simplified dashboard filter `e.assignmentOrgId === selectedOrgId` still matched the owner org, causing the event to be invisible when the user switched to their co-host org. Fixed by adding `existing.assignmentOrgId = row.cohost_organization_id as string` inside the `isCohostRow` merge branch.
- **`CRUCIAL_IOS_TO_WEB_TODOS.md` §18 terminology inconsistency:** "By Owner & Cohost" and "[Cohosts…]" used the non-hyphenated form, inconsistent with the canonical "Co-host" / "Co-hosts" used everywhere else in the codebase and docs. Fixed by replacing both with the hyphenated form.
- **`MARCH_2026_FIXES.md` heading out of order:** `### 6. Co-host badge deduplication…` was inserted before the existing `### 5. Phase 10 prompt…`, breaking monotonic numbering. Renumbered to restore sequence (co-host entry → `### 5`, Phase 10 prompt entry → `### 6`).
- **Two nitpicks deferred:** (1) MD049 asterisk-vs-underscore emphasis in `MARCH_2026_FIXES.md` line ~6472; (2) missing acceptance criteria for the "optional footer label" in `CRUCIAL_IOS_TO_WEB_TODOS.md` §18 web TODO. Both logged in `docs/todos/NITPICKS_TODOS.md`.
- **Files:** `apps/mobile/hooks/useAssignedEvents.ts`, `docs/todos/CRUCIAL_IOS_TO_WEB_TODOS.md`, `docs/fixes/MARCH_2026_FIXES.md`, `docs/todos/NITPICKS_TODOS.md`

### 6. Co-host badge deduplication and co-host filter fix (Mar 26, 2026)

Four findings from the P10 PR review, all verified against current code and fixed:

- **org-dashboard.tsx** — `cohostBadgeMap` built co-host badge strings by joining raw `cohost_org_name` pushes without deduplication. If the same org appeared in multiple `event_assignments` rows (same event, same `cohost_organization_id`), the badge showed "Co-host with Org B & Org B". Fixed by deduplicating `cohostNames` via `[...new Set(cohostNames)]` before joining.
- **events/[slug]/page.tsx** — `cohostOrgNames` pipeline mapped, filtered, and sorted org names but skipped deduplication and whitespace normalization. Fixed by wrapping in `[...new Set(...)]` after trimming each name, before sorting.
- **`20260326011328_add_cohost_names_to_get_event_rpc.sql`** — `jsonb_agg(co.name ORDER BY co.name)` can produce duplicate names when multiple `event_assignments` rows reference the same org. `jsonb_agg(DISTINCT ...)` with `ORDER BY` is invalid Postgres syntax, so replaced with a `SELECT DISTINCT` subquery: `jsonb_agg(name ORDER BY name) FROM (SELECT DISTINCT co.name FROM ...) sub`. Updated live via Supabase MCP `execute_sql`.
- **OrganizerSimplifiedDashboard.tsx / useAssignedEvents.ts** — `filteredAssignedEvents` filtered by `e.organization_id === selectedOrgId`, where `organization_id` is the *event owner's* org ID. Co-host events have a different owner org, so they were silently dropped when the user switched to their co-host org. Fixed by adding `assignmentOrgId: row.cohost_organization_id ?? row.organization_id` to `AssignedEvent` (the org through which the assignment was made) and updating the filter to `e.assignmentOrgId === selectedOrgId`.
- **Files:** `apps/mobile/app/(tabs)/org-dashboard.tsx`, `apps/web/app/events/[slug]/page.tsx`, `supabase/migrations/20260326011328_add_cohost_names_to_get_event_rpc.sql`, `apps/mobile/hooks/useAssignedEvents.ts`, `apps/mobile/components/org-dashboard/OrganizerSimplifiedDashboard.tsx`

### 7. Google OAuth (Clerk Production) fix for iOS — bundle-ID custom scheme (Mar 31, 2026)

- **Issue:** Google sign-in via Clerk worked in development (test keys) but failed on TestFlight / production builds with "Redirect URL mismatch" or "signed out" errors. Multiple approaches attempted:
  1. `AuthSession.makeRedirectUri({ scheme: "project-flame" })` — generated an Expo proxy URL in production, rejected by Clerk's HTTPS requirement for live keys.
  2. `https://flme.co/oauth-callback` Universal Link — `ASWebAuthenticationSession` opened an in-app browser showing the web page instead of redirecting back to the app, losing the session context.
  3. `https://clerk.flme.co/v1/oauth-native-callback` — Clerk FAPI endpoint returned 404 (not a valid Clerk redirect path).
- **Root cause:** Clerk Production instances reject non-HTTPS custom schemes like `project-flame://` for security. However, `ASWebAuthenticationSession` on iOS doesn't reliably handle Universal Link (`https://`) redirects for returning control to the app — it opens Safari/WebView instead of triggering the app's Universal Link handler. The only scheme that works with both Clerk Production _and_ iOS `ASWebAuthenticationSession` is the app's **bundle identifier as a custom URL scheme** (`com.projectflame.app://`), which Clerk specifically allows via the "Native Applications" redirect URI section in the dashboard.
- **Fix:**
  1. Changed `redirectUrl` in `useSignInHandlers.ts` to `"com.projectflame.app://callback"` (hardcoded for all environments — works with both dev and prod Clerk keys).
  2. Registered `"com.projectflame.app"` as an additional URL scheme in `app.json` (`"scheme": ["project-flame", "com.projectflame.app"]`).
  3. Added `com.projectflame.app://callback` to Clerk Production Dashboard → Configure → Social Connections → Native Applications redirect URIs.
- **Also fixed during investigation:**
  - Dependency mismatch: `package.json` listed `@clerk/clerk-expo@^2.19.30` but `pnpm ls` showed `@clerk/expo@3.1.6` was installed (major version mismatch caused session handling failures). Removed `@clerk/expo` and reinstalled `@clerk/clerk-expo@2.19.30`.
  - `sync-current-user` API call in `completeAuthAndRedirect` was re-throwing errors, preventing post-login navigation. Removed `throw err;` so navigation proceeds even if sync fails.
  - AASA file at `https://flme.co/.well-known/apple-app-site-association` was returning HTML due to Next.js middleware intercepting `.well-known` paths. Added `/.well-known/(.*)` and `/oauth-callback` to `isMaintenanceExempt` in `middleware.ts`.
  - Created `/oauth-callback` web fallback page that redirects to `project-flame://` for browsers that land there.
  - Vercel `turbo-ignore` was skipping web deployments; switched "Ignored Build Step" to Automatic.
- **Key takeaway:** For Clerk Production + iOS native apps, always use the bundle identifier as a custom URL scheme (`com.bundleid.app://path`) and register it under Clerk's "Native Applications" section. Universal Links (`https://`) do not reliably return control to the app from `ASWebAuthenticationSession`.
- **Files:** `apps/mobile/hooks/useSignInHandlers.ts`, `apps/mobile/app.json`, `apps/web/middleware.ts`, `apps/web/app/oauth-callback/page.tsx`, `apps/web/public/.well-known/apple-app-site-association`

### 8. Push notification logging, unapproved org dashboard gate, and admin payouts tab fix (Apr 1, 2026)

Three fixes from production testing on EAS builds.

**8a. Push notification diagnostic logging**
- **Issue:** Push notifications not delivered to EAS builds; server logs showed zero `[push]` entries despite in-app notifications being created. Root cause: "No registered devices" log used `console.log` (filtered by Vercel default log level) and `EXPO_ACCESS_TOKEN` was not set on the server.
- **Fix:** Upgraded "No registered devices" log from `console.log` → `console.warn` so it appears in Vercel logs. Added a startup warning in `sendToExpoPushService` when `EXPO_ACCESS_TOKEN` is missing, with instructions to generate one.
- **Action required:** Set `EXPO_ACCESS_TOKEN` in the Vercel web app environment. Generate at https://expo.dev/accounts/[account]/settings/access-tokens. Without it, push delivery to EAS production builds will silently fail.
- **Files:** `apps/web/app/lib/push-notifications.ts`

**8b. Unapproved organizations blocked from org dashboard**
- **Issue:** Organizations with `approved = false` in the DB could still access the full organizer dashboard. `useUserRole` and `useViewMode` only check `organization_members` existence, not `organizations.approved`.
- **Fix:** Added `approved` field to `useOrgData` and `useUserOrgs` hooks (fetched from DB). `OrgDashboardScreen` now checks `selectedOrg.approved` before rendering. Unapproved orgs see a `PendingApprovalBanner` (yellow "Waiting for Approval" card with "Pending Review" badge and DashboardBar header) instead of the dashboard.
- **Files:** `apps/mobile/hooks/useOrgData.ts`, `apps/mobile/hooks/useUserOrgs.ts`, `apps/mobile/app/(tabs)/org-dashboard.tsx`, `apps/mobile/components/org-dashboard/PendingApprovalBanner.tsx` (new)

**8c. Payouts tab restricted to org owners only**
- **Issue:** Admin-role org members saw the "Payouts" tab in Account settings, which showed "Error Loading Payment Status" because the Stripe Connect status API requires owner permissions. Admins should not see this tab at all.
- **Fix:** Added `canManagePayouts(role)` to `@project-flame/lib` (owner-only, unlike `canAccessOrgSettings` which includes admins). `SettingsTabs` now accepts `isOwner` prop; Payouts tab renders only for owners. `account.tsx` uses `canManagePayouts` for the Payouts gate and `canAccessOrgSettings` for Organization tab. `PaymentAccountBanner` on the org dashboard is also now gated to `memberRole === "owner"`.
- **Files:** `packages/lib/src/utils/permissions.ts`, `packages/lib/src/utils/index.ts`, `apps/mobile/app/account.tsx`, `apps/mobile/components/settings/SettingsTabs.tsx`, `apps/mobile/app/(tabs)/org-dashboard.tsx`

### 9. Fix infinite push-token registration retry loop (Apr 1, 2026)

- **Issue:** After email sign-in on an EAS dev-client build, `useNotificationRegistration` entered an infinite retry loop, flooding the Metro console with hundreds of `[useNotificationRegistration] Registration attempt 4 failed: [ApiError: Your session has expired]` warnings. Two root causes:
  1. **Stale `getToken` closure:** Clerk's `useAuth().getToken` returns a new function reference on every render. The `useEffect` dependency on `[isSignedIn, getToken]` re-fired the effect on every render. After the 3 retries were exhausted, each subsequent render still called `attempt()` once (failed immediately, logged "attempt 4"), creating unbounded log spam and wasted API calls.
  2. **Frozen retry token:** The `getToken` captured in the effect closure was from the render _before_ `setActive` resolved. All 3 retries used this stale function, which returned the old session's JWT — rejected as 401 by the server. Even once Clerk refreshed the session, the retries still used the old closure.
- **Fix (in `useNotificationRegistration.ts`):**
  1. Removed `getToken` from the `useEffect` dependency array — the effect now depends only on `isSignedIn`.
  2. Stored `getToken` in a ref (`getTokenRef`) that's updated on every render. Retries now call `getTokenRef.current`, so scheduled retries (at 5s/15s/30s) pick up the fresh `getToken` after Clerk re-renders with the new session.
  3. Added a 2-minute cooldown (`EXHAUSTED_COOLDOWN_MS = 120_000`) after all retries are exhausted. During cooldown, re-renders skip the effect entirely. After cooldown expires, one more attempt cycle is allowed (in case the session recovered).
- **Result:** Retries are bounded (3 max per cycle, one cycle per 2 minutes). Retries at 5s/15s/30s use the latest token, so they succeed once Clerk propagates the session — typically by the first or second retry.
- **Note:** The initial `sync-current-user` failure after sign-in is a separate Clerk timing issue (JWT not ready immediately after `setActive`). It's already caught and non-blocking — the user navigates home regardless. The `sync-current-user` route is a stub; real user sync happens JIT via `resolveDbUserFromClerkId`.
- **Files:** `apps/mobile/hooks/useNotificationRegistration.ts`

### 10. Phase 10 prompt + web parity doc synced to implemented behavior (Mar 25, 2026)

- **Issue:** `docs/prompts/PHASE-10-VIEWS.md` and `docs/todos/CRUCIAL_IOS_TO_WEB_TODOS.md` §17–§18 still described pre-review co-host copy (`cohostLabelMap` "By A & B", Assign Events for admin, single-org OrgSelector without circles, etc.).
- **Fix:** Rewrote P10-1–P10-4 specs, verification plan, PR review criterion #5, implementation clarifications, critical-files table, and Web TODO list to match unified co-host badge, `OrgEventCard` on simplified dashboard, public `cohost_org_names`, `get_org_members_with_profiles` RPC, and organizer-only Assign Events. Added **TODO-6** (defer): extract tier rollups + co-host display strings to `@project-flame/lib` for web port parity. Updated CRUCIAL_IOS §17–§18 accordingly.
- **Files:** `docs/prompts/PHASE-10-VIEWS.md`, `docs/todos/CRUCIAL_IOS_TO_WEB_TODOS.md`
- **Note:** `docs/prompts/` is `.gitignore`d — `PHASE-10-VIEWS.md` must be `git add -f` if the team wants it on the remote branch alongside the tracked changelog/CRUCIAL/EDGE updates.
