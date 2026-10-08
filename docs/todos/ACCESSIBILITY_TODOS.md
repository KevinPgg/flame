# Accessibility TODO List

These items were surfaced in a PR review but are deferred as non-blocking.
Each item references the file + line range and a description of the work needed.

**Phase 9 Web Design (Mar 12 only):** See `WEB_ACCESSIBILITY_TODOS.md` for deferred a11y items from Phase 9 Web Design PR reviews. Other web items remain here.

---

## apps/mobile

### `apps/mobile/components/shared/PastItemsAccordion.tsx` (lines 26-38)
Add `accessibilityRole="button"`, `accessible={true}`, `accessibilityState={{ expanded }}`, and `accessibilityLabel` including label and count (e.g. `"${label}, ${count} items"`) to the Pressable acting as the accordion toggle so screen readers convey the control and its expanded state.

---

## packages/ui

### `packages/ui/src/components/CategoryPill.tsx` (lines 22–35)
Add `accessibilityRole="button"` and `accessibilityState={{ disabled: !onPress }}` to the
`Pressable` so assistive tech knows this is a button and reflects when it's non-interactive
(i.e., when `onPress` is `undefined`). The visible label (`category.name`) already provides the
accessible name, so no separate `accessibilityLabel` is needed.

### `packages/ui/src/components/FAQItem.tsx` (lines 35–55)
Add `accessible={true}`, `accessibilityRole="button"`, `accessibilityState={{ expanded }}`, and an
`accessibilityLabel` that combines the question text and state (e.g., `"${item.question}, expanded"`)
to the toggle `Pressable`. Follow the pattern in `SectionHeader.tsx`.

### `packages/ui/src/components/PillButton.tsx` (lines 5–9)
Document (or expose) optional accessibility props on the shared `PillButtonProps` interface so
consumers can pass `accessibilityLabel` without extra casting.

---

## apps/mobile

### `apps/mobile/components/home/Footer.tsx` (lines 33–42, 80–89)
Add `accessibilityRole="link"` (or `"button"`) and a descriptive `accessibilityLabel` to each
`Pressable` navigation link in the footer sections and legal row (e.g., `accessibilityLabel="About Us"`).

### `apps/mobile/components/home/Header.tsx`
- ~~Add `accessibilityRole="button"` and `accessibilityLabel="Open menu"` to the hamburger/menu button.~~ **Obsolete (Feb 23, 2026):** Hamburger menu removed in favour of bottom tab navigation (Fix #168).
- Add `accessibilityRole="image"` and `accessibilityLabel="Flame logo"` to the logo `Image`.

### `apps/mobile/components/events/EventsHero.tsx` (lines 59–67)
Add `accessibilityLabel="Search events"` to the `TextInput` so screen readers can announce
the field's purpose.

### `apps/mobile/components/events/EventsHero.tsx` (lines 71–76)
Add `accessibilityRole="button"` and `accessibilityLabel="Filter events"` to the filter icon button.

### `apps/mobile/components/events/CategoryFilterPills.tsx` (lines 73–81)
Add `accessibilityRole="radio"` (or `"button"`) and
`accessibilityState={{ selected: item.id === activeId }}` to the filter pill `Pressable` so assistive
tech can announce the currently selected filter.

### `apps/mobile/components/event-details/TicketTierCard.tsx` (lines 78–82)
Add `accessibilityRole="button"` and a descriptive `accessibilityLabel` (e.g.,
`"Select ${tier.name} ticket"`) to the tier selection `Pressable`.

### `apps/mobile/components/event-details/TicketTierCard.tsx` (lines 164–196)
Add `accessibilityRole="button"` and `accessibilityLabel="Decrease quantity"` /
`"Increase quantity"` to the quantity increment/decrement buttons.

---

## PR Review — Feb 18, 2026 (Round 3)

### `apps/mobile/components/sign-in/OAuthButton.tsx` (lines 12–22)
The Pressable rendering the Google button lacks accessibility attributes. Add
`accessibilityRole="button"`, `accessibilityLabel="Continue with Google"`, and
`accessibilityState={{ disabled: true }}` when `disabled` is true so screen
readers can identify and announce the control correctly.

### `apps/mobile/components/event-details/CheckoutMainSheet.tsx` (lines 94–96)
The close button Pressable (wrapping the Feather "x" icon with `onPress={onClose}`)
is missing accessibility metadata. Add `accessibilityLabel="Close"` or
`"Close checkout"`, `accessibilityRole="button"`, and optionally
`accessibilityHint="Closes the checkout sheet"`.

### `apps/mobile/components/event-details/CheckoutMainSheet.tsx` (lines 141–143)
The Pressable that clears the promo code (`onClearPromo`) is missing an
`accessibilityLabel`. Add `accessibilityLabel="Clear promo code"` and
`accessibilityRole="button"`.

### `apps/mobile/components/sign-in/CredentialsForm.tsx` (lines 78–87)
The Pressable used to toggle password visibility lacks an `accessibilityLabel`.
Add a descriptive label: "Show password" when `showPassword` is false and
"Hide password" when `showPassword` is true.

---

## PR Review — Feb 18, 2026 (Round 4)

### `apps/mobile/components/home/CarouselCard.tsx` (lines 23–27)
The `Image` using `source={{ uri: item.imageUrl }}` is missing accessibility props. Add
`accessibilityLabel` derived from event data (e.g., `item.title` or `item.name` plus a short
descriptor), `accessibilityRole="image"`, and `accessible={true}`. Fall back to a generic
description when `item` lacks a title.

### `apps/mobile/components/home/DotsIndicator.tsx` (lines 9–19)
The `DotsIndicator` component lacks accessibility attributes. Update the container `View` with
`accessibilityRole="tablist"` (or `"pager"`) and an `accessibilityLabel` describing the control.
Make each dot `View` accessible with `accessible={true}`, `accessibilityRole="tab"` (or
`"button"`), `accessibilityState={{ selected: index === activeIndex }}`, and
`accessibilityLabel` like `Slide ${index + 1} of ${count}`. Preserve existing styling and `key`.

---

## PR Review — Mar 10, 2026 (Phase 8)

### `apps/mobile/components/events-management/EditTiersTab.tsx` (lines 272–290)
The icon-only Pressable buttons (edit using `handleStartEdit`, delete using `onDelete` with `deleting` and `hasSales` state) lack accessibility metadata. Add `accessibilityLabel` and `accessibilityHint` describing their actions (e.g., "Edit tier" / hint describing what edit does, "Delete tier" / hint and when disabled why), `accessibilityRole="button"`, and `accessibilityState={{ disabled: hasSales || deleting }}`. Ensure the ActivityIndicator case preserves the same labels so screen readers can identify the controls.

---

## PR Review — Feb 23, 2026 (Org Dashboard Screens)

### `apps/mobile/components/settings/SettingsTabs.tsx` (lines 21–35)
The Pressable tab elements lack accessibility attributes. Add `accessibilityRole="tab"` and
`accessibilityState={{ selected: isActive }}` (and optionally `accessibilityLabel={tab.label}`)
to the Pressable using `key={tab.id}` and `onPress={() => onTabChange(tab.id)}` so screen
readers recognise each item as a tab and can announce its selected state.

### `apps/mobile/components/home/Header.tsx` (lines 22–24)
The logo Pressable lacks `accessibilityLabel`, `accessibilityRole`, and `accessibilityHint`.
VoiceOver/TalkBack users won't know this element is actionable or that it navigates home.
**Fix:** Add `accessibilityRole="button"`, `accessibilityLabel="Go to home"` (or similar), and optional `accessibilityHint="Returns to the home screen"`.

### `apps/mobile/components/settings/SettingsPhotoSection.tsx` (lines 22–34)
The edit and delete icon-only Pressables lack accessibility labels and roles.
**Fix:** Add `accessibilityLabel="Edit profile photo"` / `"Delete profile photo"`, `accessibilityRole="button"`, and optionally `accessibilityHint` to each Pressable.

### `apps/mobile/components/org-dashboard/OrgActionButtons.tsx` (PR Feb 23, 2026)
Icon-only buttons (promotions, send tickets, promoter links, purchased details) need `accessibilityLabel` so screen readers can announce their purpose (e.g., "Open promotions", "Send tickets", "Open promoter links", "View purchased details").

### `apps/mobile/components/org-dashboard/OrgPromotionsCard.tsx` (PR Feb 23, 2026)
PromoCodePill close icon wrapped in non-interactive View — replace with Pressable (or add accessibilityRole="button") and provide onPress. "Add Code" Pressable needs explicit onPress handler.

---

## PR Review — Feb 24, 2026 (Phase 4 Events Management / Bottom Tab)

### `apps/mobile/components/events-management/ManageEventCard.tsx` (lines 30-34)
The Pressable wrapping the "Manage" Text lacks accessibility attributes. Add `accessibilityRole="button"`,
`accessibilityLabel="Manage event"`, and optionally `accessibilityHint="Opens event management options"`.

### `apps/mobile/components/events-management/TimeSelector.tsx` (lines 38-66)
The PM and AM Pressable toggles lack accessibility props. Use `accessibilityRole="radio"` (not "button")
to match mutually-exclusive semantics (consistent with CategoryFilterPills). Add
`accessibilityLabel="PM"` / `accessibilityLabel="AM"` and
`accessibilityState={{ selected: activePeriod === "PM" }}` / `{{ selected: activePeriod === "AM" }}`.

### `apps/mobile/components/events-management/CalendarPicker.tsx`
Day cells, prev/next navigation arrows, and month/year header lack accessibility. Add
`accessibilityLabel`, `accessibilityRole` (e.g., "button" for arrows and day cells, "header" for
month/year), and `accessibilityState` (e.g., `{ disabled: true }` for out-of-range days,
`{ selected: true }` for chosen date). Ensure screen readers can announce the current month, navigate
between months, and identify selectable dates.

### Bottom tab bar (Expo Router Tabs / `app/(tabs)/_layout.tsx`)
Icon-only tab items lack `accessibilityLabel`. Add descriptive `accessibilityLabel` for each tab
(e.g., "Home", "My Tickets", "History", "Dashboard", "Events", "Create Event", "RSVP", "Settings")
and `accessibilityRole="tab"` with `accessibilityState={{ selected }}` so assistive tech can
announce the active tab.

### `apps/mobile/app/ticket/[id].tsx` — Prev/Next ticket navigation (Phase 5B, Feb 24, 2026)
The prev/next `Pressable` buttons for multi-ticket groups lack `accessibilityLabel` (e.g.,
"Previous ticket", "Next ticket") and `accessibilityRole="button"`. The "Ticket X of Y" text
should use `accessibilityRole="text"` or `accessibilityLiveRegion="polite"` so screen readers
announce changes when navigating between tickets.

### `apps/mobile/app/(tabs)/dashboard.tsx` and `history.tsx` — Empty state text (Phase 5B, Feb 24, 2026)
The "No tickets yet" and "No past purchases" empty state blocks should include
`accessibilityRole="text"` so screen readers announce them when the list is empty.

### `apps/mobile/components/settings/SettingsEditableField.tsx` — TextInput (Phase 5B, Feb 24, 2026)
The `TextInput` for ID Number (Cédula) lacks `accessibilityLabel`. Add
`accessibilityLabel={label}` to the input so screen readers announce the field purpose.

### `apps/mobile/components/home/AnimatedFAQItem.tsx` (lines 57–98) — Accordion accessibility (Mar 3, 2026)
Add proper accessibility semantics to the accordion: mark the Pressable trigger with `accessibilityRole="button"`,
`accessibilityState={{ expanded }}`, and `accessibilityLabel` if appropriate; ensure any offscreen/measuring Views
are hidden from accessibility (e.g., `accessibilityElementsHidden` and `importantForAccessibility` set to hide
descendants); toggle the rendered answer content’s accessibility visibility when collapsed vs expanded; keep
decorative icons/chevrons non-focusable.

### `apps/mobile/app/scanner.tsx` — Icon-only camera control buttons lack accessibility attributes (Feb 26, 2026)
The three icon-only `Pressable` controls in the scanning view (camera flip, torch toggle, manual entry toggle — lines ~423–445) have no `accessibilityRole` or `accessibilityLabel`. Screen readers cannot identify their purpose. Add:
- Camera flip: `accessibilityRole="button"` `accessibilityLabel="Switch camera"` `accessibilityHint="Toggles between front and back camera"`
- Torch toggle: `accessibilityRole="button"` `accessibilityLabel="Toggle flashlight"` `accessibilityHint="Turns the flashlight on or off"`
- Manual entry toggle: `accessibilityRole="button"` `accessibilityLabel="Open manual entry"` `accessibilityHint="Opens a text field to enter ticket QR code data manually"`

**File:** `apps/mobile/app/scanner.tsx` ~lines 423–445
**Deferral reason:** Non-critical accessibility; core scanning flow is unaffected.

### `apps/mobile/components/navigation/CustomTabBar.tsx` — Icon-only tab Pressable elements lack accessibility metadata (Mar 6, 2026)
The floating pill tab bar renders icon-only `Pressable` elements (lines ~227–239) with no accessibility props. Screen readers cannot identify the tab purpose or current selection state. For each tab `Pressable`:
- Add `accessibilityRole="tab"` (semantically correct for tab bar items; `"button"` would work but `"tab"` is preferred)
- Add `accessibilityLabel` derived from the tab key (e.g., `"Home"`, `"My Tickets"`, `"Search"`, `"Settings"`, `"Organizer Dashboard"`)
- Add `accessibilityState={{ selected: active }}`
- Add `accessible={true}` if VoiceOver/TalkBack requires it
- For the action tab (`tab.isAction`), use a descriptive label like `"Create event"` or `"Become an organizer"` and add `accessibilityHint="Opens the event creation flow"` since the side-effect (sheet or navigation switch) is not obvious from the icon alone.

**File:** `apps/mobile/components/navigation/CustomTabBar.tsx` ~lines 227–239
**Deferral reason:** Non-critical accessibility; core tab navigation is unaffected without these props.

### ~~`apps/mobile/app/notifications-settings.tsx` (lines 88–93) — Switch thumb/track contrast (Mar 6, 2026)~~ ✅ Fixed (MARCH_2026_FIXES.md #270)

~~The `Switch` component renders both `trackColor.true` and `thumbColor` as `colors["white-100"]`, making the thumb invisible when ON.~~ Fixed: `trackColor.true` set to `"rgba(255,255,255,0.5)"`, `thumbColor` set to `"#FFFFFF"` so the thumb is distinct and visible in both sections.

---

## P7-2 PR Review — Deferred (Mar 6, 2026)

### `apps/mobile/components/notifications/NotificationsOverlay.tsx` (lines 111–129) — Per-notification dismiss button for keyboard/assistive users

The overlay only allows per-notification dismissal via swipe gesture, leaving keyboard and assistive-technology users unable to remove a single notification. Add a visible, focusable dismiss affordance inside the `Animated.View` that wraps `NotificationCard` — e.g., a `Pressable`/`TouchableOpacity` with a trash icon placed adjacent to `NotificationCard`. Wire it to the same dismiss handler used by the swipe action. Add `accessibilityRole="button"`, `accessibilityLabel="Dismiss notification"`, and ensure it is reachable by VoiceOver/TalkBack. Keep the control visually consistent with `rowStyle`/`actionStyle` and ensure it does not interfere with `panGesture`/`GestureDetector`.

**File:** `apps/mobile/components/notifications/NotificationsOverlay.tsx` ~lines 111–129
**Deferral reason:** Non-critical accessibility; swipe-to-dismiss is the primary interaction. Revisit in accessibility polish pass.

### `apps/mobile/app/scanner.tsx` (lines 506–515) — Torch toggle missing accessibility metadata

The `Pressable` that toggles the torch (`onPress={() => setTorchEnabled(t => !t)}`) is icon-only and lacks accessibility metadata. Add `accessibilityRole="button"`, `accessibilityLabel="Toggle flashlight"` (or `"Flashlight"` with a dynamic hint), and `accessibilityState={{ selected: torchEnabled }}` so VoiceOver/TalkBack users can perceive and control the torch.

**File:** `apps/mobile/app/scanner.tsx` lines 506–515
**Deferral reason:** Non-critical accessibility; core scanning is unaffected.

### `apps/mobile/components/org-dashboard/OrgActionButtons.tsx` (lines 24–29) — ActionButton missing accessibility metadata

The `Pressable` icon-only toggle is missing `accessibilityLabel`, `accessibilityRole="button"`, and `accessibilityState={{ selected: !!active }}`. Add these so screen readers announce the button's purpose and current state.

**File:** `apps/mobile/components/org-dashboard/OrgActionButtons.tsx` lines 24–29
**Deferral reason:** Non-critical accessibility; organizer flow is functional without these props.

### `apps/mobile/components/org-dashboard/OrgPromoterLinksCard.tsx` (lines 67–82) — Copy/Delete Pressables missing accessibility metadata and undersized touch targets

The copy (`copy-outline`) and delete (`trash-outline`) `Pressable` controls in `LinkPill` have:
- No `accessibilityRole`, `accessibilityLabel`, or `accessibilityHint`.
- `accessibilityState={{ disabled: true }}` missing when `disabled` prop is true.
- `hitSlop={4}` — effective touch area ~24×24pt, well below the 44×44pt iOS/Android minimum.

Fix:
- Add `accessibilityRole="button"`, `accessibilityLabel="Copy link"` / `"Delete link"`, and an `accessibilityHint` describing the side-effect (copy to clipboard / delete with confirmation) to each Pressable.
- Add `accessibilityState={{ disabled: !link.fullUrl }}` / `accessibilityState={{ disabled: isDeleting }}`.
- Increase `hitSlop` to at least `{ top: 12, bottom: 12, left: 12, right: 12 }` (or add `padding: 12` to the Pressable style) so both controls meet minimum tap-target guidelines.

**File:** `apps/mobile/components/org-dashboard/OrgPromoterLinksCard.tsx` lines 67–82
**Deferral reason:** Non-critical accessibility; organizer flow is functional without these props.


## Phase 10-4 PR Review — Deferred (Mar 23, 2026)

### `EventAssignmentSheet` — event row `Pressable` missing checkbox accessibility semantics

`apps/mobile/components/org-members/EventAssignmentSheet.tsx` (lines ~199–210)

The `Pressable` used to toggle event assignments has no `accessibilityRole`, `accessibilityState`, `accessibilityLabel`, or `accessibilityHint`. Screen readers (VoiceOver/TalkBack) cannot announce the checkbox state or the event name.

**Suggested fix:** Add `accessibilityRole="checkbox"`, `accessibilityState={{ checked }}`, `accessibilityLabel={item.name}`, and `accessibilityHint="Double-tap to toggle assignment"` to the `Pressable` in `renderEvent`.

**Deferral reason:** Non-critical accessibility; organizer flow is functional without these props.

## April 2026 PR Review — Registration Form Builder (Apr 22, 2026)

### `apps/mobile/components/create-event/FormFieldCard.tsx` (lines 113–122) — Archive/unarchive Pressable missing accessibility metadata

The `Pressable` wrapping the archive toggle icon (`archive-outline` / `refresh-outline`) has no accessibility metadata. Screen readers cannot announce its purpose or current archive state.

**Suggested fix:** Add `accessible={true}`, `accessibilityRole="button"`, and a dynamic `accessibilityLabel` (e.g. `"Unarchive field"` when `isArchived`, `"Archive field"` otherwise). Optionally add `accessibilityHint` describing the action (e.g. `"Hides this field from new registrants"`) and `accessibilityState={{ selected: isArchived }}` to convey the current state. Keep the `onPress` behavior (`onChange({ ...field, archived: !isArchived })`) unchanged.

**Deferral reason:** Non-critical accessibility; organizer-only flow. Field is still usable without screen-reader metadata.

### `apps/mobile/components/home/Header.tsx` (lines 22–45) — icon-only Pressables missing accessibility metadata

The three `Pressable` elements in the persistent Header — the Flame logo (routes to `/`), the settings cog (`router.push("/settings")`), and the notification bell (`onNotificationPress`) — are icon-only with no `accessibilityRole` or `accessibilityLabel`. Screen readers announce them generically without their purpose.

**Suggested fix:** Add `accessibilityRole="button"` + `accessibilityLabel` to each: `"Home"` (logo), `"Open settings"` (cog), `"Open notifications"` (bell).

**Deferral reason:** Non-critical; surfaces are fully functional. Add in a follow-up a11y pass.

## May 2026 PR Review — W3-B2 Google Maps city autocomplete on web (May 20, 2026)

### `apps/web/app/components/organizer/CityAutocompleteField.tsx` — Missing combobox ARIA + keyboard navigation

The dropdown of city predictions is mouse-only. The input lacks `role="combobox"`, `aria-expanded`, `aria-controls`, and `aria-activedescendant`; the prediction `<button>`s have no stable ids or `aria-selected`; and there is no keyboard handler for ArrowUp / ArrowDown / Enter / Escape. Selection only fires from `onMouseDown` (lines 126–129).

**Suggested fix:** Introduce a `focusedIndex: number | null` state, give each prediction button a stable id (`${id}-option-${index}`), set `aria-activedescendant` on the input to the focused option's id, set `aria-selected` on the highlighted option, set `role="combobox"` + `aria-expanded={showDropdown}` + `aria-controls={listboxId}` on the input, render the list with `role="listbox"`, and add an `onKeyDown` handler: ArrowDown / ArrowUp move `focusedIndex`, Enter calls `handleSelect(predictions[focusedIndex])`, Escape sets `setShowDropdown(false)` and `setFocusedIndex(null)`. Reset `focusedIndex` whenever `predictions` change or on focus/blur. Keep existing mouse handlers, debounce, and AbortController logic intact.

**Deferral reason:** Non-critical. The underlying form remains fully keyboard-operable — users can type the city as free text and submit via Tab + Enter; the dropdown is an *enhancement* layer. Adding the full combobox state machine + ARIA bookkeeping is ~50 LOC and warrants a focused a11y pass rather than being bundled into a feature-port PR. Mobile counterpart at `apps/mobile/components/create-event/CityAutocompleteField.tsx` has the same gap and should be addressed in the same pass.

---

**ConfirmModal — dialog semantics + keyboard dismiss (W7-H1, Jun 22, 2026)**

**File:** `apps/web/app/components/ConfirmModal.tsx`

**Gap:** The modal lacks `role="dialog"` + `aria-modal="true"` on the content container, an `id` on the `<h3>` title paired with `aria-labelledby`, and an Escape-to-dismiss key handler (only overlay-click closes it).

**Suggested fix:** Add `role="dialog"` + `aria-modal="true"` + `aria-labelledby={titleId}` to the `bg-surface` container, give the `<h3>` that `id`, and add an `onKeyDown` on the overlay that calls `onCancel()` on Escape (with `tabIndex={-1}` / focus management as needed).

**Deferral reason:** Non-critical a11y per `project-flame-master.mdc` (defer to this file). The codebase's existing confirmation modals (e.g. the RSVP approve/reject modal in `RsvpManagement.tsx`, which this one is modeled on) don't implement these either — worth a focused modal-a11y pass across all of them rather than one-off here. The modal is operable today (Cancel button + overlay click).
