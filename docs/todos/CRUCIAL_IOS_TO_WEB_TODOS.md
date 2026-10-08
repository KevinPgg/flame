# CRUCIAL iOS → Web Change Todos

Items where the mobile/iOS implementation intentionally differs from web and the **web must be updated** to match. These are not mobile bugs — they are planned improvements made on mobile first that need to be ported back to web.

---

## [CRUCIAL — PARITY] Loading spinner alignment with mobile (Apr 29, 2026)

### Adopt the iOS-style `FiLoader` + `animate-spin` pattern as web's standard loading indicator

**Context:** APRIL_2026_FIXES.md #144 introduced `<FiLoader className="animate-spin" />` + "Loading..." on the four organizer XLSX export buttons (web purchase + web pending RSVP + mobile equivalents). The pattern visually matches mobile's iOS-style `ActivityIndicator`, giving real cross-platform parity for the first time. The rest of web still uses the older `LoadingSpinner.tsx` style, which now looks visibly different from mobile (and from the new export buttons on web itself). Marked **crucial parity** — the inconsistency is now visible to organizers who use both platforms.

**Mobile (done):** `apps/mobile/components/org-dashboard/OrgPurchasedDetailsCard.tsx` and `apps/mobile/app/rsvp-detail.tsx` use `ActivityIndicator` (small, inline) on export buttons. This is the visual target.

**Web (TODO):**
1. Decide between:
   - **(a) Replace `apps/web/app/components/LoadingSpinner.tsx`'s rendering** with the `FiLoader` + `animate-spin` pattern, keeping its API the same → full visual parity in one shot.
   - **(b) Leave page-level `LoadingSpinner` alone** and only converge inline button spinners on the new pattern → safer, lower blast radius, but partial parity.
2. Sweep all inline export / submit / refresh button spinners (currently a mix of `"..."`, `"Loading..."`, custom CSS spinners) to use the `FiLoader` + "Loading..." pattern. Non-exhaustive list of surfaces:
   - `apps/web/app/organizer/event/[id]/OrgEventDetailClient.tsx`
   - `apps/web/app/components/OrganizerDashboard.tsx`
   - `apps/web/app/components/RsvpManagement.tsx` (export button done — sweep the rest)
   - Payment / checkout flows
   - Admin views
3. Verify behaviour matches mobile's `ActivityIndicator` sizing convention: small inline spinner for inline buttons, larger one for full-screen loads.
4. a11y: ensure `aria-busy`, `disabled`, and button label transitions stay correct on every converted button.

**Why crucial:** Cross-platform visual parity is now a project-wide goal (per master guide §3 — Industry Standards Benchmarking). With the export buttons converted, web is in a half-done state where some loading states match mobile and some don't. Closing the gap prevents drift from re-emerging.

**Why deferred (not done in #144):** Out of scope for the export-feature audit. Touches many files with their own a11y considerations. Worth its own PR + design review.

---

## Create Event — Ticket Sales

### Remove 30-minute-before-event validation for ticket sales end (Feb 26, 2026)

**Context:** Mobile removed the validation that "ticket sales must end at least 30 minutes before the event starts" to simplify organizer UX. Organizers can now set sale end to match the event start (or any time they prefer).

**Mobile (done):** `apps/mobile/components/create-event/TicketTiersTab.tsx` — validation removed; event start date is copied to sale end when user selects it (convenience default).

**Web (TODO):** Update `apps/web/app/components/forms/CreateEventForm.tsx`:
1. Remove the validation in `validateFormData` that enforces sales end at least 30 minutes before event start (around lines 695–699).
2. Update any helper text/notes that mention the 30-minute requirement.
3. Optionally: Copy event start to tier sale end default when organizer selects event dates (UX parity with mobile).

**API (done):** Removed 30-minute validation from `apps/web/app/api/events/route.ts` (fix #254).

---

## 3. expo-image: FlameImage component with transition + caching (Mar 3, 2026)

**Mobile (done):** Created `packages/ui/src/components/FlameImage.tsx` wrapping `expo-image` with 300ms cross-fade transition, `memory-disk` caching, and optional `blurhash` placeholder support. Replaced RN `Image` in all 19 event poster components. See MARCH_2026_FIXES.md #52.

**Web (TODO):** Web currently uses plain `<img>` or Next.js `<Image>` for event posters. When Phase 6 migrates web components to `packages/ui`, the shared `FlameImage` component can be used (expo-image has web support). Alternatively, web can use Next.js `Image` with `placeholder="blur"` and `blurDataURL` for equivalent behavior. If per-image blurhash strings are added to the `events` table, both platforms can use them.

---

## 4. Footer "Get Help" link: consolidate with Contact Us (Mar 3, 2026)

**Context:** Mobile Settings > Support page lists "FAQs" and "Contact Us" (linking to `flme.co/faqs` and `flme.co/contact`). The web footer has a separate "Get Help" link that points to the same `/contact` page — redundant with "Contact Us".

**Mobile (done):** Removed "Get Help" from the mobile Support screen since it's identical to Contact Us. See MARCH_2026_FIXES.md #60.

**Web (TODO):** Update `apps/web/app/components/Footer.tsx`:
1. Remove the "Get Help" link from the "Fan Support" section of the footer.
2. Keep "FAQs" and "Contact Us" (or rename one to avoid ambiguity).
3. Alternatively, redirect `/help` to `/contact` if external links point to it.

---

## 5. Explore Organizers: organizer page + events filters (Mar 4, 2026)

**Context:** Mobile replaced "Explore Categories" with "Explore Organizers" on the home screen, added a `/organizer/[slug]` page showing an organizer's events, and redesigned the Discover Events filters (removed category pills, added a filter bottom sheet with city + organizer dropdowns). Shared filter functions (`filterEventsByCity`, `filterEventsByOrganizer`, `extractUniqueCities`, `extractUniqueOrganizers`) were extracted to `@project-flame/lib`.

**Mobile (done):**
- `apps/mobile/components/home/ExploreOrganizers.tsx` — horizontal organizer pills
- `apps/mobile/app/organizer/[slug].tsx` — organizer events page with city filter
- `apps/mobile/components/events/FilterBottomSheet.tsx` — filter sheet with city + organizer
- `apps/mobile/app/events.tsx` — uses shared lib filter functions instead of category heuristic

**Web (TODO):**
1. **Organizer page:** Create `apps/web/app/organizer/[slug]/page.tsx` — SSR page fetching events where `organizations.slug = slug`. Use shared lib `filterEventsByCity` for city dropdown. Display organizer name as page title.
2. **Events catalog filters:** Update `apps/web/app/components/EventsCatalog.tsx`:
   - Add organizer dropdown (in addition to existing city dropdown). Use `extractUniqueOrganizers` from `@project-flame/lib`.
   - Replace inline city filter logic with `filterEventsByCity` from `@project-flame/lib`.
3. **Home page organizers section:** If the web home page has a categories section, replace it with organizers. Otherwise, consider adding an "Explore Organizers" section linking to `/organizer/[slug]`.
4. **Org image upload in web dashboard:** Add logo/cover upload UI to web's organizer settings. The API route (`/api/upload-org-image`) is already built.

**Shared (already done):**
- `@project-flame/lib`: `OrganizationPublic` type, `OrgFilterableEvent`, `filterEventsByCity`, `filterEventsByOrganizer`, `extractUniqueCities`, `extractUniqueOrganizers`
- DB: `organizations.logo_url`, `organizations.cover_image_url` columns
- Storage: `organization-images` bucket
- API: `POST /api/upload-org-image`, `DELETE /api/upload-org-image`

---

## ~~6. Profile image management: personal + company photos~~ ✅ Done (Mar 17, 2026 — P9-6)

**Context:** Mobile now supports uploading/deleting personal profile photos and company (org) profile photos via a new `profile-images` Supabase storage bucket (subfolders: `personal/{clerk_id}/` and `company/{org_slug}/`). Web currently relies on Clerk for user profile images and has no self-managed profile photo upload.

**Mobile (done):**
- `apps/mobile/components/settings/PersonalSettingsTab.tsx` — wired edit/delete photo buttons with expo-image-picker + `/api/upload-profile-image`
- `apps/mobile/components/settings/OrganizationSettingsTab.tsx` — org logo upload already working via `/api/upload-org-image`
- `apps/mobile/hooks/useUserProfile.ts` — now fetches `profile_image_url` from users table

**Web (done — P9-6, Mar 17, 2026):**
1. ~~**User profile image:**~~ ✅ Click-to-upload avatar in `UserDashboard.tsx` Settings tab. Calls `POST /api/upload-profile-image` (`type=personal`). Displays `users.profile_image_url` when set, falls back to Clerk avatar. Delete calls `DELETE /api/upload-profile-image`. See MARCH_DESIGN_WEB_UPDATES.md #176.
2. **Org profile image:** Web organizer dashboard should allow org logo upload (API route `/api/upload-org-image` already exists; wire UI). _Deferred to P9-7._
3. **Default stock images:** When `profile_image_url` is null, display a default stock image (to be uploaded later). Same for org logos. _Deferred._

**Shared (already done):**
- DB: `users.profile_image_url` column (nullable text)
- Storage: `profile-images` bucket (public, 1MB, image MIME types, `personal/` + `company/` folders)
- API: `POST /api/upload-profile-image` (personal + company types), `DELETE /api/upload-profile-image`
- `@project-flame/lib`: `UserProfile.profile_image_url` field added

## 7. Role switching: attendee/organizer view toggle (Mar 5, 2026)

**Context:** Mobile now supports switching between "Attending" and "Hosting" views via a header pill button + bottom sheet. Org users can toggle between attendee tabs (Home, My Tickets, History, Settings) and organizer tabs (Dashboard, Create Event, RSVP, Settings). View mode persists via `expo-secure-store`. Web has no equivalent — the web app shows different dashboards based on URL (`/account` vs `/organizer` vs `/admin`) with no in-page toggle.

**Mobile (done):**
- `apps/mobile/hooks/useViewMode.ts` — client-side view mode state with SecureStore persistence
- `apps/mobile/contexts/ViewModeContext.tsx` — context provider wrapping the app
- `apps/mobile/components/navigation/CustomTabBar.tsx` — persistent tab bar with role-conditional tabs
- `apps/mobile/components/navigation/RoleSwitcherSheet.tsx` — bottom sheet for switching roles
- `apps/mobile/components/home/Header.tsx` — role pill button before notifications

**Web (TODO):**
1. Add a role switcher in the web navbar (or a toggle/dropdown) that lets org users switch between attendee and organizer views without navigating to a different URL.
2. The attendee view should show the event browsing / ticket management UI. The organizer view should show the dashboard / event management UI.
3. Currently web uses URL routing (`/account` vs `/organizer`). Consider whether to keep URL-based routing or add an in-page toggle. The mobile pattern (header pill + bottom sheet) could be adapted as a navbar dropdown.

## 8. Editable promoter code field at checkout (Mar 5, 2026)

**Context:** Mobile now lets buyers see and manually enter a promoter code at checkout, with live validation against the `promoter_links` table. On web, promoter codes are captured silently from `?promoter=CODE` URL params and the buyer has no visibility or control over them.

**Mobile (done):**
- `apps/mobile/components/event-details/CheckoutMainSheet.tsx` — "Promoter" field with text input, validation (green check / red X), auto-populated from deep link
- `apps/mobile/hooks/useCheckout.ts` — `promoterCode` state, `validatePromoter()` queries `promoter_links`, `clearPromoter()`

**Web (TODO):**
1. Add a "Promoter" field to the checkout UI (either in `EventDetail.tsx` purchase flow or `RsvpPaymentModal.tsx`) that shows the current promoter code from the URL param.
2. Allow the buyer to manually type a promoter code if they don't have one from a URL.
3. Validate against `promoter_links` table (can use the existing `promoter-links` API or add a lightweight public validation endpoint).
4. Show validation feedback (check/X) matching the mobile pattern.

## 9. "Become an Organizer" application form (Mar 5, 2026)

**Context:** Mobile now has a bottom sheet form for non-org users to apply to become an organizer. The form collects a company name, auto-generates a slug, and calls `POST /api/organizations`. The web equivalent is `CreateOrganizationForm` + `OnboardingModal` triggered by `?onboarding=true`. Both mobile and web call the same API.

**Mobile (done):**
- `apps/mobile/components/navigation/BecomeOrganizerSheet.tsx` — form UI, calls `/api/organizations`
- `apps/mobile/components/home/HostBanner.tsx` — orange upsell banner on home screen

**Web (already has equivalent):**
- `apps/web/app/components/forms/CreateOrganizationForm.tsx` — web form
- `apps/web/app/components/OnboardingModal.tsx` — modal wrapper
- No web changes needed — both platforms share the same API route.

## 10. RSVP past-event read-only: disable approve/reject for past events (Mar 6, 2026)

Mobile now hides Approve/Reject buttons for past-event RSVPs (MARCH_2026_FIXES.md #218). Web `RsvpManagement.tsx` still allows approving/rejecting RSVPs for past events. Add the same guard.

**Mobile (done):**
- `apps/mobile/components/org-dashboard/RsvpRequestCard.tsx` — `isPastEvent` prop hides actions
- `apps/mobile/hooks/useRsvpManagement.ts` — `useEventRsvps` returns `isPastEvent`
- `apps/mobile/app/rsvp-detail.tsx` — passes `isPastEvent` to cards

**Web (needs change):**
- `apps/web/app/components/RsvpManagement.tsx` — add past-event check, disable approve/reject buttons

## 11. Editable event description in event management (Mar 10, 2026)

**Context:** Mobile now allows organizers to edit the event description when managing an existing event (EditEventDetailsTab). The web OrganizerDashboard event edit form does not include a description field — only venue, city, dates, and image.

**API (done):** `PATCH /api/events` now accepts `description` — `z.string().max(520).optional().or(z.literal(""))`. See MARCH_2026_FIXES.md #395.

**Mobile (done):**
- `apps/mobile/components/events-management/EditEventDetailsTab.tsx` — multiline TextInput, 520 max, char counter; read-only shows LinkableText

**Web (TODO):**
1. Add `description` to `editingEventData` state in `apps/web/app/components/OrganizerDashboard.tsx` (or `EventsTiersView.tsx` if that's where edit state lives).
2. Add a textarea/input for description in the event edit form (matches CreateEventForm: maxLength 520, placeholder "Tell people about your event...").
3. Include `description` in the `updatePayload` sent to `PATCH /api/events` when saving event changes.
4. When displaying in edit mode, show existing description; when clearing, send empty string or null.

## 12. Consolidated organizer data fetching — single batch API call (Mar 10, 2026)

**Context:** Mobile now uses a single `GET /api/organizer/data` call (via `useOrgEventEnriched` hook) to fetch all enriched event data for the org event detail screen — purchases, revenue, promotional tickets, bank transfer orders, promoter links, promo codes — in one request. This matches how Eventbrite and Ticketmaster load organizer dashboards.

The web `OrganizerDashboard.tsx` already uses `/api/organizer/data` as its primary data source, so the backend is the same. However, the web dashboard still makes some supplementary calls for promoter-specific data. Consider consolidating all org detail data into the single `/api/organizer/data` response so both platforms share an identical data flow.

**Industry standard (Eventbrite/Ticketmaster pattern):** Load all event management data in a single batch call per org/event. Eliminates staggered loading where some cards appear before others, which looks unpolished and confuses users.

**Mobile (done):**
- `apps/mobile/hooks/useOrgEventEnriched.ts` — single call to `/api/organizer/data`, caches at org level, `useMemo` extracts per-event
- `apps/mobile/app/org-event-detail.tsx` — uses `enrichedEvent` for revenue, purchases, sent tickets, promoter links

**Web (consider):**
1. Review `apps/web/app/components/OrganizerDashboard.tsx` data flow — confirm all event detail data comes from `/api/organizer/data` without supplementary calls.
2. If supplementary calls exist (e.g., separate promo code or promoter link fetches), consolidate into the single response.
3. Ensure price display on event cards uses `getLowestPrice` from `@project-flame/lib` (already done — #402).

## 13. Promoter links API: include "paid" status orders (Mar 10, 2026)

**Context:** `GET /api/organizer/promoter-links` only counted orders with `status: "completed"`, missing Stripe orders that use `status: "paid"`. This caused promoter sales to show as 0 on mobile. Fixed in MARCH_2026_FIXES.md #403.

**Web API (fixed):**
- `apps/web/app/api/organizer/promoter-links/route.ts` — changed `.eq("status", "completed")` to `.in("status", ["completed", "paid"])`

**Note:** This fix benefits any client calling the dedicated promoter-links endpoint. The main `/api/organizer/data` route already uses the correct filter. No additional mobile or web UI changes needed.

## 14. Organizations: default/placeholder image when logo_url is null (Mar 12, 2026)

**Context:** Organizations with `logo_url` null should show a fallback placeholder instead of broken or empty images.

**Mobile (done):**
- `apps/mobile/components/home/ExploreOrganizers.tsx` — `org.logo_url ?? PLACEHOLDER_LOGO` (placehold.co/67x67)
- `apps/mobile/components/scanner/OrgSelector.tsx` — `org.logoUrl || PLACEHOLDER_LOGO`
- `apps/mobile/components/events/EventsHero.tsx` — `profileImageUrl || PLACEHOLDER_LOGO` (used by organizer profile page)
- `apps/mobile/components/settings/OrganizationSettingsTab.tsx` — shows camera icon on `bg-white-5` when no logo (intentional for editable profile)

**Web (TODO):**
- `apps/web/app/components/ExploreOrganizers.tsx` — already has `org.logo_url || PLACEHOLDER_LOGO`
- Audit any other org logo display locations (organizer dashboard, event cards, etc.) and add fallback where missing. Consider storing a default in Supabase storage or public assets for consistency.

---

## 15. Registration form builder UI for organizers (Mar 11, 2026)

**Context:** Mobile now has a registration form builder that allows organizers to create and edit `registration_form_config` (JSONB array of FormField objects) directly in the event creation and event management flows. Previously, this config could only be set via direct DB edits. Web's `RegistrationFormModal.tsx` renders the form for attendees, but web has no builder UI for organizers to create/edit the form config.

**Mobile (done):**
- `apps/mobile/components/create-event/RegistrationFormBuilder.tsx` — form builder container (add/remove/reorder fields)
- `apps/mobile/components/create-event/FormFieldCard.tsx` — individual field editor (label, type picker, required toggle, placeholder)
- `apps/mobile/components/create-event/EventDetailsTab.tsx` — "Include registration form" checkbox below RSVP toggle in create flow
- `apps/mobile/components/events-management/EditEventDetailsTab.tsx` — same builder for editing existing events; read-only summary in view mode

**API (done):**
- `POST /api/events` (`createEventSchema`) — now accepts optional `registration_form_config` array
- `PATCH /api/events` (`updateEventSchema`) — now accepts optional `registration_form_config` (array or null to clear)

**Web (TODO):**
1. Create a form builder component (equivalent to mobile's `RegistrationFormBuilder` + `FormFieldCard`) — inline in the event creation form or as a separate section.
2. Add to `apps/web/app/components/forms/CreateEventForm.tsx` — conditionally render below the RSVP toggle when `requires_rsvp` is true.
3. Add to the event edit/management UI — load existing `registration_form_config`, allow editing, save via `PATCH /api/events`.
4. The `FormField` interface is already defined in `apps/web/app/components/modals/RegistrationFormModal.tsx` — reuse it.
5. The API already accepts the config (see `createEventSchema` and `updateEventSchema` in `apps/web/app/api/events/route.ts`).

**Shared (already done):**
- DB: `events.registration_form_config` JSONB column (existing)
- API: POST + PATCH `/api/events` accept `registration_form_config`
- Web consumption: `RegistrationFormModal.tsx` renders forms; `rsvp/route.ts` validates `registration_data` against config

---

## 16. Organization Members management page (Mar 23, 2026 — Phase 10-2)

**Context:** Mobile now has a full Team Members management screen (`org-members.tsx`) with add/edit/remove member flows, role badges, and permission-gated access (owner/admin only). Web has no equivalent member management UI.

**Mobile (done):**
- `apps/mobile/app/org-members.tsx` — member list with role badges, kebab menu (Change Role / Remove)
- `apps/mobile/components/org-members/AddMemberSheet.tsx` — email search → role picker → add member
- `apps/mobile/components/org-members/EditRoleSheet.tsx` — change member role (Admin/Organizer)
- `apps/mobile/components/scanner/OrgSelector.tsx` — always renders for org users + "Manage" button for owner/admin

**Web (TODO):**
1. Create a Team Members page in the web organizer dashboard (mirror `org-members.tsx`).
2. Member list with role badges (Owner: subtle, Admin: `#238FDA`, Organizer: `#5DDBB1`).
3. Add member flow: search by email (reuse `/api/organizer/search-users`), pick role (Admin/Organizer), add.
4. Edit role: change between Admin and Organizer. Owner role cannot be assigned or changed.
5. Remove member: confirmation dialog, destructive action.
6. Permission gating: only owner/admin can see the member management UI. Use shared `canManageMembers()` from `@project-flame/lib`.

**Shared (already done):**
- DB: `organization_members` table with RLS (owner/admin can CRUD, guards against modifying owner rows)
- DB: `get_admin_organizations()` SECURITY DEFINER function
- Types: `OrgMemberRole`, `OrganizationMember` in `@project-flame/lib`
- Permissions: `canManageMembers()` in `@project-flame/lib`
- API: `/api/organizer/search-users` endpoint

---

## 17. Dashboard Role Forking & Permission Gating (Mar 23, 2026 — Phase 10-3)

Mobile organizer-role members now see a simplified, permission-gated experience. Web needs the same treatment.

**Mobile (done):**
1. `MemberRoleContext` centralizes `selectedOrgId` + `memberRole` for all screens.
2. Org dashboard forks by role: organizers get `OrganizerSimplifiedDashboard` (QR scan card, assigned events only, **no org-level stats strip**). Assigned events use **`OrgEventCard`** with **per-event attendees + revenue** (from enriched `useAssignedEvents` + tier rollups).
3. "Create Event" tab gated — organizers see `BecomeOrganizerSheet`.
4. Account settings hides Organization + Payouts tabs for organizers.
5. Scanner hides Access Codes management tab for organizers (they land on QR Scanner directly).
6. RSVP management filters to assigned events for organizers (parameterized `useRsvpEvents`).

**Web (TODO):**
1. Fork the web organizer dashboard by role: organizers see assigned events only, no stats/revenue.
2. Gate "Create Event" button/nav for organizer-role members.
3. Hide Organization settings and Payouts sections for organizer-role members.
4. Hide Access Codes management in scanner for organizer-role members.
5. Filter RSVP management to assigned events for organizer-role members.
6. Use shared permission helpers from `@project-flame/lib` (`canCreateEvents`, `canAccessOrgSettings`, `canManageAccessCodes`, `canViewAllEvents`).

---

## 18. Event Assignment & Co-Host System (Mar 23, 2026 — Phase 10-4; updated Mar 26, 2026)

**Context:** Mobile supports per-organizer event assignment and co-host orgs. **Full org dashboard** uses a **unified `Co-host with …` badge** (top-right pill) for both owning org (with co-hosts) and co-host org (viewing owner's event) — no separate "By Owner & Co-host" footer on full-dashboard cards. **Public** event pages (mobile + web) show **By [Owner] & [Co-hosts…]** for ticket purchase. Web organizer tools still need porting.

**Mobile (done):**
- `EventAssignmentSheet`, `CoHostAssignmentSheet`, `useSearchApprovedOrganizations`, `useCohostEvents`
- `OrgEventCard` — optional `cohostBadge` + `cohostLabel` (label used mainly on **OrganizerSimplifiedDashboard** for assignment context)
- `OrganizerSimplifiedDashboard` — **`OrgEventCard`** + enriched **`useAssignedEvents`** (tiers → attendees + revenue)
- `org-dashboard.tsx` — single **`cohostBadgeMap`** from assignments + co-host events; merged co-hosted event lists
- `org-event-detail.tsx` — "Co-hosts" row (admin/owner)
- `org-members.tsx` — **"Assign Events" only on `organizer` rows** (not admin); assignment count on role line
- **Public detail:** `get_event_with_tiers` returns `cohost_org_names`; mobile `event/[id].tsx` combines names for `OrganizerBadge`

**Web (TODO — match mobile rules):**
1. **Event assignment UI** (owner/admin assign organizers to events).
2. **Co-host assignment UI** on event management (mirror `CoHostAssignmentSheet`).
3. **Org dashboard cards:** unified **`Co-host with …` badge** only (same semantics as mobile `FullOrgDashboard`); optional footer label only if product wants parity with simplified organizer list.
4. **Co-hosted events in dashboard** merged with owned events (dedupe).
5. **Permission gating:** `canManageMembers()` for assignment + co-host management.
6. **Public event page:** `getEventBySlug` + `EventDetail` already attach **`cohost_org_names`** and combined **By** line — keep in sync when adding organizer dashboard.

**Shared lib (defer post–PR review):** Extract tier rollups + co-host display strings to `@project-flame/lib` so web dashboard does not re-implement (`docs/prompts/PHASE-10-VIEWS.md` TODO-6).

**Shared (already done):**
- DB: `event_assignments` + RLS; `get_admin_organizations()`; migration **`20260326011328_add_cohost_names_to_get_event_rpc`** (`cohost_org_names` on `get_event_with_tiers`)
- Types: `EventAssignment` in `@project-flame/lib`
- Mobile hooks: `useEventAssignments`, `useAssignedEvents` (with co-host dedup + tier data)

---

## 19. City filter pill on home screen + Google Places autocomplete for create event (Apr 8, 2026)

**Context:** Mobile home screen now shows an "All cities" / selected city pill next to the search bar (replacing the old sliders filter icon). Create event and edit event city fields now use Google Places autocomplete for city selection. Default timezone for new events uses the device's timezone (`Intl.DateTimeFormat().resolvedOptions().timeZone`) instead of hardcoded "America/Guayaquil".

**Mobile (done):**
- `apps/mobile/components/events/EventsHero.tsx` — replaced sliders Pressable with labeled city pill (`selectedCity ?? "All cities"`); active state: `bg-white-100 text-dark`, inactive: `bg-white-10 text-white-80`
- `apps/mobile/components/home/HomeFeedList.tsx` — added `selectedCity` prop, passed through to `EventsHero`
- `apps/mobile/app/(tabs)/index.tsx` — wires `selectedCity` from `useEventFilters` to `HomeFeedList`
- `apps/mobile/components/create-event/CityAutocompleteField.tsx` — new component wrapping `react-native-google-places-autocomplete` with Flame dark theme styling, `types: '(cities)'`
- `apps/mobile/components/create-event/EventDetailsTab.tsx` — replaced city `FormInput` with `CityAutocompleteField`; DEFAULT_TIMEZONE now uses device timezone
- `apps/mobile/components/events-management/EditEventDetailsTab.tsx` — replaced city `FilledInput` with `CityAutocompleteField` in edit mode
- `apps/mobile/app/(tabs)/create-event.tsx` — `INITIAL_EVENT_FORM.timezone` uses device timezone

**Web (TODO):**
1. **City filter pill:** Add a city pill next to the search bar on `apps/web/app/events/page.tsx` (or `EventsCatalog.tsx`) matching mobile's design. Use `extractUniqueCities` from `@project-flame/lib`.
2. **Google Places autocomplete for create event:** Replace the city text input in `apps/web/app/components/forms/CreateEventForm.tsx` with a Google Places autocomplete field (`@react-google-maps/api` or `react-google-autocomplete`). Restrict to `types: ['(cities)']`.
3. **Device timezone default:** Update `CreateEventForm.tsx` to default timezone to `Intl.DateTimeFormat().resolvedOptions().timeZone` instead of hardcoded "America/Guayaquil".
