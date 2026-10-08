# Web Accessibility TODO List — Phase 9 Design (Mar 12, 2026)

Deferred accessibility items from **Phase 9 Web Design** PR reviews only. For other web or mobile accessibility, see `ACCESSIBILITY_TODOS.md`.

---

## PR Review — Phase 9 Web Design (Mar 12, 2026)

### `apps/web/app/components/HomeContent.tsx` — SearchHero search input (lines ~277–283)

The search input currently relies on placeholder text for identification. Add a persistent accessible name: either assign `id="search-input"` and a visible or visually-hidden `<label htmlFor="search-input">Search events</label>`, or add `aria-label="Search events"` directly on the input. Update the SearchHero component's input element so screen readers can announce the field.

**Context:** Same pattern as `apps/mobile/components/events/EventsHero.tsx` (see ACCESSIBILITY_TODOS.md).

### `apps/web/app/components/HomeContent.tsx` (lines ~338–362) — Add aria-pressed to city filter buttons

Add `aria-pressed={selectedCity === null}` to the "All" button and `aria-pressed={selectedCity === city}` to each mapped city button so screen readers announce the toggle state.

### `apps/web/app/components/discover/FAQSection.tsx` (lines 51–73) — FAQ toggle accessibility

The FAQ expand/collapse button lacks accessibility attributes. Add `aria-expanded={isOpen}` and `aria-controls` pointing to a stable id for the answer region. Give the answer container a stable id (e.g. `faq-answer-${item.id}` or sanitized `item.question`). Ensure id is unique per FAQ item and use the same id in `aria-controls` on the button so assistive tech can associate the button with the panel.

---

## PR Review — P1–P5 Audit Fixes (Mar 16, 2026)

### `apps/web/app/components/modals/ConfirmationModal.tsx` (lines 52–77) — Dialog ARIA semantics

The modal overlay `<div>` and inner card `<div>` are missing dialog semantics. Add `role="dialog"` and `aria-modal="true"` to the outer overlay container. Give the `<h2>` title a stable `id="confirm-modal-title"` and the `<p>` message a stable `id="confirm-modal-desc"`, then add `aria-labelledby="confirm-modal-title"` and `aria-describedby="confirm-modal-desc"` to the same outer container so screen readers can announce the dialog label and description on open.

**Context:** Modal is used in `EventDetail.tsx` for RSVP success/loading/error and "duplicate RSVP" states. Deferred — modal is visually functional; this is a screen-reader enhancement only.

---

## PR Review — P9 Fixes Batch (Mar 17, 2026)

### `apps/web/app/privacy-policy/page.tsx` (lines 31–53) — Language toggle `aria-pressed`

The two buttons calling `scrollToSection("en")` and `scrollToSection("es")` do not expose their selected state. Add `aria-pressed={language === "en"}` to the English button and `aria-pressed={language === "es"}` to the Spanish button. Optionally add `aria-controls` pointing to the respective section IDs (`"english"`, `"spanish"`) used by `scrollToSection` to link controls to content.

**Context:** Toggle is purely cosmetic to assistive tech right now — users navigating by keyboard cannot tell which language section is active. Deferred — visual indication exists; this is a screen-reader enhancement.

---

## PR Review — P9-6 iOS/Web Parity & QR Fixes (Mar 17, 2026)

### `apps/web/app/components/UserDashboard.tsx` (lines ~271–279) — Search input missing accessible name

The ticket search `<input>` in `UserDashboardInner` relies solely on `placeholder="Search by event name"` for identification. Add `aria-label="Search by event name"` directly on the input so screen readers can announce the field's purpose without relying on placeholder text (which is not reliably announced by all screen readers). Keep existing `placeholder`, `value`, `onChange`, and `className` props unchanged.

**Context:** Input is wrapped in a `bg-white-10 rounded-pill` container with a `FiSearch` icon. Deferred — input is fully functional for sighted users; this is a screen-reader enhancement.

---

## PR Review — P9-7 Organizer Dashboard (Mar 18, 2026)

### `apps/web/app/components/modals/OnboardingModal.tsx` (lines ~63–75) — Missing dialog semantics and accessible close label

Give the modal root `div` `role="dialog"` and `aria-modal="true"`, wire `aria-labelledby` to the `<h2>` (add `id="onboarding-modal-title"` to it). Add `aria-label="Close onboarding modal"` and `type="button"` to the close `<button>` (FiX icon). This is a screen-reader enhancement; the modal works correctly for mouse/keyboard users today.

### `apps/web/app/components/modals/EditTicketTierModal.tsx` (lines ~136–142) — Icon-only close button missing accessible name

The close button (FiX, `onClick={onClose}`, `disabled={isLoading}`) has no accessible name. Add `aria-label="Close"` (or `"Close edit ticket tier modal"`) and optionally `title="Close"`. Keep `disabled={isLoading}` and `onClick={onClose}` unchanged.

### `apps/web/app/organizer/event/[id]/OrgEventDetailClient.tsx` (`ActionButton`) — Icon-only action buttons missing aria-label

`ActionButton` accepts a `label` prop but only exposes it via `title`. Add `aria-label={label}` to the `<button>` so screen readers announce the purpose of Promotions / Send Tickets / Promoter Links / Purchases buttons. `type="button"` already added in P9-7 PR.

### `apps/web/app/components/AdminDashboard.tsx` (lines ~465–479) — Featured toggle button missing aria-label and aria-pressed

The icon-only featured toggle (`setFeaturedEvent`, `featuredEventId`, `loadingEventId`) relies only on `title`. Add `aria-label` mirroring the `title` text and `aria-pressed={featuredEventId === event.id}` so screen readers announce both the descriptive name and the active/pressed state.

### `apps/web/app/components/RsvpLoadingPage.tsx` (lines ~40–45) — Loading spinner not announced by assistive tech

Wrap the spinner and text in a container with `role="status"` and `aria-live="polite"` (optionally `aria-atomic="true"`). Mark the visual spinner `div` with `aria-hidden="true"`. Keep the heading and subtitle as the announced text.

### `apps/web/app/components/UserDashboard.tsx` (lines ~373–416) — Profile image upload/delete not fully keyboard-accessible

Two issues:
1. **Upload trigger is a `<div>`** (lines ~374–399): The avatar container `<div>` calls `handleUploadClick` on click but has no `role`, `tabIndex`, or `onKeyDown` handler. Replace with a `<button type="button">` (or add `role="button"`, `tabIndex={0}`, and an `onKeyDown` that calls `handleUploadClick` on Enter/Space) so keyboard users can trigger the file picker. Ensure visible focus ring is retained (`focus-visible:ring-2` or similar).
2. **Delete button missing accessible name** (lines ~401–408): The delete `<button>` contains only an `FiTrash2` icon with no accessible text. Add `aria-label="Delete profile photo"` so screen readers announce its purpose.
3. **Hidden file input**: The `<input type="file" className="hidden">` should not be `aria-hidden` (it isn't currently) — keep it accessible to assistive tech as-is. Optionally add `aria-controls` from the upload button pointing to the file input's `id`.

**Context:** Avatar upload is functional for mouse users. Deferred — keyboard and screen-reader enhancement only.

### `apps/web/app/components/organizer/DashboardView.tsx` (lines ~262–268) — Search input missing accessible label

The search `<input>` in `DashboardView` (bound to `searchQuery`) has no `<label>`, `aria-label`, or `aria-labelledby`. Add `aria-label="Search events"` (or an associated `<label htmlFor="dashboard-event-search">` plus `id="dashboard-event-search"` on the input) so assistive tech always has a stable announced name, even after the user types (placeholder text disappears).

---

### `apps/web/app/components/organizer/RsvpsView.tsx` (lines ~126–134) — Search input and accordion toggle missing ARIA attributes

Two issues:
1. **Search input missing accessible label** (line ~128): The search `<input>` has no `<label>`, `aria-label`, or `aria-labelledby`. Add `aria-label="Search events"` so screen readers announce the input's purpose.
2. **Past-events accordion toggle missing expanded state and panel linkage** (lines ~172–187): The `<button>` that shows/hides past events does not expose `aria-expanded={expandedSections.rsvps}` or `aria-controls`. Add `aria-expanded={expandedSections.rsvps}` to the button, assign a stable `id` (e.g. `id="past-rsvp-events-panel"`) to the collapsible `<div>`, and add `aria-controls="past-rsvp-events-panel"` to the button and `role="region"` to the panel so screen readers can announce the relationship.

### `apps/web/app/components/RsvpManagement.tsx` (lines ~539–541) — Confirmation modal missing dialog semantics

The confirmation modal uses nested `<div>` elements without semantic dialog markup. Add `role="dialog"`, `aria-modal="true"`, and `aria-labelledby` referencing a unique `id` on the modal title heading to the interactive container. Ensure keyboard focus is trapped inside the modal while it is open.

### `apps/web/app/organizer/event/[id]/OrgEventDetailClient.tsx` (lines ~172–178, ~553–560, ~888–907, ~1688–1703) — Icon-only buttons missing accessible names and type attribute

Multiple icon-only `<button>` elements (delete promo code `FiX`, copy/delete promoter links, edit/delete ticket tier) have no accessible name (`aria-label`) and are missing `type="button"`. Add `type="button"` and a descriptive `aria-label` (e.g. `aria-label="Delete promo code SAVE20"`, `aria-label="Copy promoter link"`, `aria-label="Edit ticket tier"`) to each icon-only button so screen readers can announce the action and the target item.

---

## PR Review — P9-7 round 3 (Mar 18, 2026)

### `apps/web/app/components/modals/RegistrationFormModal.tsx` (lines ~168–176, ~200–204) — Checkbox and text-input error containers missing ARIA error wiring

Both field variants (checkbox and text input) render a per-field error `<div>` when `errors[field.id]` is set but the inputs do not reference it via ARIA, so screen readers do not announce validation failures.

**Two-part fix:**
1. **Input attributes:** On the checkbox `<input>` (lines ~168–176) and the text/email/date `<input>` (lines ~189–197), add:
   - `aria-invalid={!!errors[field.id]}` — signals invalid state to assistive tech
   - `aria-describedby={`${field.id}-error`}` — links the input to its error container
2. **Error container:** Change the error `<div>` (lines ~200–204) to render with `id={`${field.id}-error`}` and either `role="alert"` or `aria-live="assertive"` so screen readers announce the message when it appears.

Apply identically to both the checkbox branch (first `{field.type === "checkbox" ? ...}` block) and the text-input branch.

### `apps/web/app/components/modals/RegistrationFormModal.tsx` (lines ~141–159) — Modal does not trap or restore focus

The modal opens without moving keyboard focus inside the dialog and does not prevent Tab from escaping to the page behind, violating WCAG 2.1 SC 2.1.2.

**Four-step fix:**
1. **Capture previous focus:** Store `document.activeElement` in a `useRef<Element | null>(null)` before mounting the dialog (in the `isOpen` effect or at `useEffect` mount time).
2. **Move focus in:** When the dialog mounts (or `isOpen` becomes `true`), focus the first focusable child inside the modal container — or the close button (`FiX` button identified by its `aria-label="Close modal"`) — using `modalRef.current?.querySelector<HTMLElement>(focusableSelector)?.focus()`.
3. **Trap Tab/Shift+Tab:** In the keydown handler (already wired for Escape), also intercept `Tab`: build the list of focusable elements inside the modal (`button, input, [tabindex]`), and on `Tab` forward-cycle to the first when focus is on the last, on `Shift+Tab` backward-cycle to the last when focus is on the first.
4. **Restore focus on close:** In the cleanup of the `isOpen` effect (and/or when `onClose` is called), call `(storedElement as HTMLElement)?.focus()` to return focus to the element that was active before the modal opened.
