# June 2026 Fixes

Continuing from `MAY_2026_FIXES.md`. All entries follow the same format.

---

## Entries

### 1. Access-code flow redesign — unlock hidden tiers in-page (W4-C3, Jun 2, 2026)

**Context.** Until this PR, `secret_code` on a tier surfaced a pre-checkout modal: after the attendee tapped "Continue to Checkout" (or "Request RSVP"), a `TicketCodeModal` (web) / `TicketAccessCodeModal` (mobile) popped open and demanded the code before the hold/RSVP request was sent. The flow was workable but unusual — most ticketing platforms (Eventbrite, Dice, Ticketmaster) treat access codes as an *unlock* mechanism: enter the code on the event page to reveal a previously-hidden tier.

**Decision (with the user, Jun 2):**

- Combine `secret_code` with `is_hidden` (shipped W4-C1, May 26) — codes only unlock hidden tiers. Tiers with a code but not hidden lose their gate and become publicly visible (acceptable since access codes were barely used in practice).
- Add an "Access Code" input on the event page, below the "Select your Ticket" header and next to the existing promoter input. On valid input, the hidden tier appears in the list with auto-selection (current selection replaced).
- Server-side verification only — raw `secret_code` is never returned to the client; the unlock endpoint returns the matching tier in the same RPC shape attendees normally see.
- Defense in depth: hold/create + RSVP routes still re-verify `secret_code` against the tier at submission time, but only when `is_hidden=true`.

#### What shipped

**New endpoint — [`POST /api/ticket-tiers/unlock`](apps/web/app/api/ticket-tiers/unlock/route.ts):**

- Body: `{ event_id: uuid, code: string }`. Clerk-authed.
- Lookup: `ticket_tiers WHERE event_id = ? AND is_hidden = true`, then match `secret_code` in app code via `normalizeTicketTierSecretCode` (trim + uppercase — same normalizer used by the legacy `/validate-code` route).
- Returns: the first match by `order_index`, shaped to match `get_event_with_tiers` output — `secret_code` stripped, `has_secret_code: true`, tier-level + per-stage `quantity_reserved` computed inline (holds + pending/approved RSVPs).
- 404 + `{ code: "INVALID_ACCESS_CODE" }` on no match.

**Server gating — [`apps/web/app/api/holds/create/route.ts:113`](apps/web/app/api/holds/create/route.ts#L113) and [`apps/web/app/api/rsvp/route.ts:797`](apps/web/app/api/rsvp/route.ts#L797):**

- Both routes now SELECT `is_hidden` on the tier and gate the secret-code check behind `if (ticketTier.is_hidden && ticketTier.secret_code)`. Tiers with a code but not hidden no longer require the code in the payload.

**Web UI — [`apps/web/app/components/EventDetail.tsx`](apps/web/app/components/EventDetail.tsx):**

- Removed `TicketCodeModal` import + render + the `if (selectedTierData?.has_secret_code) { setShowCodeModal(true); ... }` gate in `handlePurchaseClick`. The `handleCodeSuccess` helper went with it.
- Promoter section moved out from after the tier list into a combined block right under the "Select Your Ticket" `<h2>`. Added a sibling "Access Code" input with the same visual treatment (idle / validating / valid / invalid states, inline error copy).
- New state: `accessCodeInput`, `accessCodeStatus`, `accessCodeError`, `unlockedTiers`. New helpers: `validateAccessCode` (POSTs to the new endpoint, on success appends to `unlockedTiers`, sets `verifiedSecretCode` so the existing checkout-payload wiring stays unchanged, and auto-selects the unlocked tier — defaulting to the first stage if staged), `clearAccessCode`.
- `allTiers = [...event.ticket_tiers, ...unlockedTiers]` replaces every `event.ticket_tiers` reference used for rendering, selection, pricing, or empty-state checks.
- Server-side error paths for `MISSING_SECRET_CODE` / `INVALID_SECRET_CODE` (mid-checkout) now `clearAccessCode()` + surface an inline message instead of re-opening a modal.

**Mobile UI — [`apps/mobile/components/event-details/PreCheckoutCodes.tsx`](apps/mobile/components/event-details/PreCheckoutCodes.tsx), [`TicketSelection.tsx`](apps/mobile/components/event-details/TicketSelection.tsx), [`app/event/[id].tsx`](apps/mobile/app/event/%5Bid%5D.tsx), [`hooks/useEventDetails.ts`](apps/mobile/hooks/useEventDetails.ts):**

- `PreCheckoutCodes` gained an "Access Code" input below the existing "Promoter" input, with matching status/error states.
- `TicketSelection` gained a `belowTitle?: ReactNode` slot so the codes render between the "Select Your Ticket" header and the tier list (mirroring web layout).
- `useEventDetails`: extracted the inline tier-enrichment logic into an exported `enrichTier(rawTier)` function. The hook delegates to it via `.flatMap(enrichTier)`. Also exported `UnlockedTierSchema` (alias of `TicketTierSchema`) so the screen can validate the unlock response before enrichment.
- Screen-level state added: `accessCodeInput`, `accessCodeStatus`, `accessCodeError`, `unlockedTiers`. Handlers: `validateAccessCode` (calls `apiPost("/api/ticket-tiers/unlock", ...)`, parses with `UnlockedTierSchema`, enriches via `enrichTier`, picks the first available stage-expanded entry, mirrors the typed code into `checkoutState.setSecretCode` so the existing payload wiring stays unchanged), `clearAccessCode`, `handleAccessCodeChange`.
- `displayedTiers = [...event.ticket_tiers, ...unlockedTiers]` replaces `event.ticket_tiers` in selection + display.
- Removed: `TicketAccessCodeModal` import + render, the `if (selectedTier.has_secret_code && !checkoutState.secretCode) requestAccessCodeModal()` gate.

**Organizer hints — [`apps/web/.../TierInlineForm.tsx:721`](apps/web/app/components/organizer/TierInlineForm.tsx#L721) and [`apps/mobile/.../EditTiersTab.tsx`](apps/mobile/components/events-management/EditTiersTab.tsx):**

- Updated the existing helper text under the access-code field to describe the new behavior ("Attendees enter this code on the event page to unlock and select this tier").
- Added a conditional warning when `secret_code` is set but `is_hidden=false`: *"Access codes only work on hidden tiers. Enable 'Hide tier' to require this code for unlock."* Rendered in `#FBD68D` (warning amber, same color as W4-C1's "Not available yet" status). Same hint on the mobile new-tier form, worded for the no-Hide-toggle context ("After creating, edit the tier and enable…").

#### Edge case decisions

- **Multiple hidden tiers with the same code.** Endpoint returns the first match by `order_index` — pragmatic; in practice organizers should use distinct codes per tier.
- **Existing tiers with `secret_code` but `is_hidden=false`.** Become publicly visible. Acceptable since access codes were barely used pre-redesign.
- **`has_secret_code` on shared `TicketTier` type.** Still flagged in W6-E1 baseline drift — not added in this PR to keep scope tight. The field is still computed server-side and consumed via `.passthrough()` Zod or local type augmentations as before.

#### Verification

- Web `tsc --noEmit` clean.
- Mobile `tsc --noEmit` unchanged from baseline (109 errors, all pre-existing — `has_secret_code` × 2, `supabase-js` version mismatch × 1, `sales_start: string | null` × 2, FlameTextProps `numberOfLines` ×~100, etc. None on files this PR touched.) See W6-E1 in `issue_list_triage_&_fix_plan_e8840c56.plan.md` for the cleanup wave that will clear these.
- `pnpm --filter @project-flame/lib test` → 167/167 passing.

#### Follow-ups shipped Jun 3, 2026 (third QA round — PR auto-review triage)

Triaged 4 bugs + 3 inline comments + 3 nitpicks. Fixed 7, skipped 1, deferred 2.

**1.8 Dead `setShowAccessCodeModal(true)` path in useCheckout.**
Server-side rejection on hidden-tier hold/RSVP with `MISSING_SECRET_CODE` / `INVALID_SECRET_CODE` was still trying to open `TicketAccessCodeModal` — which we deleted in 1.6 / the original W4-C3 PR. Result: error silently swallowed, user stuck staring at the checkout sheet. Fix in [apps/mobile/hooks/useCheckout.ts](apps/mobile/hooks/useCheckout.ts) lines 901-936: clear the stale code, surface an inline error ("Access code was rejected. Close this sheet and re-enter the access code on the event page.") via the existing `error` state, and let the existing CheckoutMainSheet error banner display it.

**1.9 Tier-switch wipes secret code while green "applied" UI stays.**
Reachable race that chained into 1.8. Sequence: user unlocks tier B → `accessCodeStatus="valid"`, `secretCode="FLAME"` → user taps tier A → `prevTierIdRef` effect (mobile) / tier-card onClick (web) clears the secret code, BUT `accessCodeStatus` and `unlockedTiers` are untouched → user taps tier B again → green "Access Code applied" container still shows, but `secretCode` is empty → checkout sends no code → 403. Fix on both platforms in the tier-select handler: if the new tier is in `unlockedTiers` AND `accessCodeInput` is non-empty, re-apply the normalized code (and on mobile, pre-update `prevTierIdRef` to suppress the resetCheckout effect).
- Mobile: [apps/mobile/app/event/[id].tsx](apps/mobile/app/event/%5Bid%5D.tsx) `handleSelectTier`.
- Web: [apps/web/app/components/EventDetail.tsx](apps/web/app/components/EventDetail.tsx) — both the staged-tier and non-staged-tier `onClick` handlers.

**1.10 Web unlock picked first stage by `order_index`, not first-available.**
For staged hidden tiers, my unlock handler set `selectedStageId` to `sortedStages[0]?.id`. If stage 1 was sold out, checkout targeted the wrong stage and hit the availability check at hold-create time. Mobile already handled this via `enriched.find(t => t.status === "available") ?? enriched[0]`; web now mirrors with `sortedStages.find(s => (s.sold_quantity ?? 0) + (s.quantity_reserved ?? 0) < s.quantity) ?? sortedStages[0]`. Falls back to first when every stage is full so checkout still fails predictably (rather than silently picking a sold-out one). Fix in [apps/web/app/components/EventDetail.tsx](apps/web/app/components/EventDetail.tsx) `validateAccessCode`.

**1.11 Mobile `validateAccessCode` had no in-flight token guard.**
Apply button + input are both disabled during validation, so the race window for double-tap is narrow — but with no token guard, an out-of-order response could still apply stale results. Added `latestUnlockTokenRef` with the same `if (token !== latestUnlockTokenRef.current) return` pattern web uses, in both the success and error branches. Also bumped in `clearAccessCode` so cleared sessions ignore any pending response.

**1.12 Mobile + web create-event flows: access-code normalization parity with edit flow.**
Edit flow normalizes secret codes via `normalizeTicketTierSecretCode` (trim + uppercase) and stores `null` on empty. Create flows (mobile `EditableTierCard`, web `CreateEventForm`) were uppercasing only — letting `""` and untrimmed whitespace into the tier payload. Both now apply `t.trim().toUpperCase()` and store `null` when empty. **Skipped** the reviewer's suggested on-keystroke 3-char minimum check: the input is controlled, so setting `secret_code` to `null` mid-type would erase the user's typed value at the 1st and 2nd characters. Min-length belongs on submit/server (already enforced via Zod `secretCodeSchema`).

**1.13 PreCheckoutCodes used `text-red-400` instead of Flame token.**
One-character fix to match the project rule (mobile: design tokens, no Tailwind defaults). Same file's inline `x-circle` icon was already using `colors.primary` — color now matches. [apps/mobile/components/event-details/PreCheckoutCodes.tsx](apps/mobile/components/event-details/PreCheckoutCodes.tsx).

**1.14 Removed dead access-code modal state + helpers from useCheckout.**
After 1.8 cut the last `setShowAccessCodeModal(true)` call site, the `TicketAccessCodeModal` plumbing in [apps/mobile/hooks/useCheckout.ts](apps/mobile/hooks/useCheckout.ts) had zero consumers. Deleted: the `showAccessCodeModal` state, the `dismissAccessCodeModal` / `requestAccessCodeModal` / `applyVerifiedAccessCode` helpers, the `pendingSecretOverrideRef` ref, and all four from the hook's returned object. `checkout()`'s opening lines now read `secretCode` directly (`const effectiveSecretCode = normalizeTicketTierSecretCode(secretCode)`) instead of the `pendingSecretOverrideRef.current ?? secretCode` fallback — the override path only existed to feed the deleted modal's verified code. **Kept `activeRsvpPiRef`:** the reviewer bundled it with the dead symbols, but it's live — it's the paid-RSVP PaymentIntent-reuse mechanism (reads/writes during `submitting_rsvp` retries) and removing it would re-introduce double-authorization risk on RSVP retry. Repo-wide grep confirms no remaining references to any deleted symbol; no tests referenced them. Mobile `tsc --noEmit` shows no new errors on this file.

**1.15 Web inline paid-RSVP modal was missing the access-code "applied" container (1.7 follow-up).**
1.7 added the green Access Code block to [StripePurchaseFlow.tsx](apps/web/app/components/StripePurchaseFlow.tsx) — the direct-purchase (`/purchase?session=`) and legacy RSVP-token checkout surface. But the **active** web paid-RSVP checkout is the inline [RsvpPaymentModal.tsx](apps/web/app/components/modals/RsvpPaymentModal.tsx) (opened by `EventDetail.handleRsvpSubmit` → `setShowRsvpPaymentModal(true)`), which 1.7 didn't touch. It already received `secretCode` as a prop and forwarded it to the server (`handleBeforePayment` → `/api/rsvp/pending`, and `onSuccess`), but never rendered it — so Promo + Promoter showed green "applied" pills while Access Code showed nothing. This surfaced specifically on **RSVP + registration-form** events because those are the hidden-tier configs being tested, but the gap applied to *all* paid web RSVP. Confirmed `verifiedSecretCode` survives the reg-form detour: the registration modal's `onSuccess` calls `handleRsvpSubmit(undefined, data)`, and the `if (secretCode !== undefined)` guard skips overwriting the code already set on tier-select (`EventDetail.tsx:1414`), so the prop arrives populated. Fix: added the read-only green Access Code section to `RsvpPaymentModal` above the Promo Code section, gated on `secretCode`, mirroring `StripePurchaseFlow` lines 695-707 and the modal's own Promo/Promoter treatment (check icon + value, no × — clearing here would orphan the upstream hidden-tier state). Web `tsc --noEmit` clean on this file.

#### Triaged but not fixed

- **Skipped: `displayedTiers` deduplication on mobile.** Hidden tiers are filtered out of `event.ticket_tiers` in [useEventDetails.ts:286-288](apps/mobile/hooks/useEventDetails.ts#L286) so a tier can only ever be in one of `event.ticket_tiers` or `unlockedTiers`. Duplicates not reachable.
- **Deferred: `#FBD68D` warning-color literal → design token.** Same hex is used project-wide for warning amber (canonical site: "Not available yet" status in `EventDetail.tsx`). Fixing only the W4-C3 hint sites in isolation would create a different inconsistency. Real fix is a project-wide migration sweep + adding a `warning` token to `flameColors` + Tailwind config. Logged in [docs/todos/NITPICKS_TODOS.md](docs/todos/NITPICKS_TODOS.md) under "June 2026 PR Review — Warning amber color centralization".

#### Follow-ups shipped Jun 3, 2026 (second QA round)

**1.4 Mobile unlocked tier appended at end of list, not sorted by price.**
`displayedTiers` did `[...event, ...unlocked]` with no sort, so an unlocked tier always rendered after every visible tier. Now memoized with a sort matching the hook's criteria (`displayPrice → order_index → id`) so the unlocked tier slots into its natural position. Web already sorted inline at render time. Fix in [apps/mobile/app/event/[id].tsx](apps/mobile/app/event/%5Bid%5D.tsx).

**1.5 Mobile pre-select glitch — secret code wiped immediately after unlock.**
When a tier was pre-selected and the buyer entered an access code, the unlocked tier was selected but the access-code state never went to "valid" and the code didn't carry into checkout. Root cause: a stale `prevTierIdRef` useEffect (left over from the deleted modal flow) called `checkoutState.resetCheckout()` on every `selectedTierId` change, and `resetCheckout` clears `secretCode` (useCheckout.ts:363). My unlock handler's `checkoutState.setSecretCode(trimmed)` ran first, then the effect immediately wiped it. Fix: pre-update `prevTierIdRef.current = target.id` before `setSelectedTierId(target.id)` in the unlock handler so the effect sees `prev === current` and skips the reset.

**1.6 Mobile checkout sheet access-code field was an editable input, not a green applied container.**
Promo and Promoter both rendered as green "applied" pills with check + × inside the checkout sheet. Access Code kept the legacy editable TextInput. With W4-C3 the code is always verified upstream at unlock time, so the input is redundant — converted to a read-only green container matching promo/promoter (no × since clearing it server-side would orphan a hidden-tier hold). Fix in [apps/mobile/components/event-details/CheckoutMainSheet.tsx](apps/mobile/components/event-details/CheckoutMainSheet.tsx) (lines 268-289).

**1.7 Web checkout page had no access-code container at all.**
Promoter + Promo both rendered green-applied indicators on the web checkout; Access Code section didn't exist. Three-part fix:

- Server (first pass, broken): tried `secret_code: hold.secret_code` — but the `holds` table has no `secret_code` column. The create endpoint validates the code but never persists it, so the field was always undefined. Same for `rsvps`.
- Server (working): select `is_hidden, secret_code` from the joined `ticket_tiers` in both [holds/details/route.ts](apps/web/app/api/holds/details/route.ts) and [rsvp/details/route.ts](apps/web/app/api/rsvp/details/route.ts), then echo `tier.secret_code` back only when `tier.is_hidden === true`. The buyer demonstrated knowledge of the code by getting the hold/RSVP created (server validated upstream), so returning it to the same user (endpoint gated by `user_id === owner`) is safe. Also strips `is_hidden` + `secret_code` from the `ticket_tier` sub-object before sending so the raw fields don't leak into the public-facing payload shape.
- Client: added the green "Access Code" section to [StripePurchaseFlow.tsx](apps/web/app/components/StripePurchaseFlow.tsx), conditional on `purchaseDetails.secret_code`, rendered above Promo Code + Promoter to match mobile checkout order. Mirrors the promo/promoter visual treatment (check icon + value, no × — same reasoning as mobile: clearing here would orphan a hidden-tier hold).

#### Follow-ups shipped same day (post-QA — Jun 2, 2026)

**1.1 Unlock endpoint 500 — `ticket_stages.starts_at` doesn't exist.**
First QA pass surfaced `column ticket_stages_1.starts_at does not exist`. The SELECT pulled `starts_at, ends_at` from `ticket_stages` — those are tier-level fields (`sales_start` / `sales_end`), not stage-level. Switched the stages select to `ticket_stages (*)` so the shape matches what mobile's Zod `TicketTierSchema` expects (passthrough). Fix in [apps/web/app/api/ticket-tiers/unlock/route.ts](apps/web/app/api/ticket-tiers/unlock/route.ts).

**1.2 Misleading "Invalid access code" on server errors.**
Both clients showed "Invalid access code" for any non-OK response, masking the 500 above. Now web differentiates 404 (`INVALID_ACCESS_CODE` → "Invalid access code") from non-404 / non-401 ("Something went wrong. Try again." with the actual server message surfaced when present). Mobile mirrors: `err.code === "INVALID_ACCESS_CODE" || err.status === 404` → invalid; 401 → sign-in prompt; everything else → surfaces `err.message`.

**1.3 Full create-time parity for `secret_code` / `is_hidden` / `is_manually_sold_out`.**
Previously these three fields existed only on the edit forms (web `TierInlineForm`, mobile `EditTiersTab` edit-existing). Now also wired into:

- **Mobile `EditTiersTab` "add new tier" form** ([apps/mobile/components/events-management/EditTiersTab.tsx](apps/mobile/components/events-management/EditTiersTab.tsx)) — `newIsHidden` / `newIsManuallySoldOut` state, toggle UI mirroring the edit form, both forwarded in the `createTier.mutateAsync` payload (staged + non-staged branches).
- **Mobile create-event `EditableTierCard`** ([apps/mobile/components/create-event/EditableTierCard.tsx](apps/mobile/components/create-event/EditableTierCard.tsx)) — added `requireAccessCode` local state, code input bound to `tier.secret_code`, both visibility toggles bound to `tier.is_manually_sold_out` / `tier.is_hidden` via `updateTier`. Extended `CreateEventTierInput` in [useCreateEvent.ts](apps/mobile/hooks/useCreateEvent.ts) with the three optional fields.
- **Web create-event `CreateEventForm`** ([apps/web/app/components/forms/CreateEventForm.tsx](apps/web/app/components/forms/CreateEventForm.tsx)) — extended `TicketTier` interface, added access-code input + visibility toggles in the same position the edit form uses, hint copy renders when `secret_code` set but `is_hidden=false`. Payload required no change — the existing `...tier` spread forwards the new optional fields.

Server-side: no changes needed. `POST /api/events` already accepts `is_manually_sold_out`, `is_hidden`, `secret_code` on nested tier creation ([apps/web/app/api/events/route.ts:104-105, 678-681](apps/web/app/api/events/route.ts#L104)).

#### Followups / not in scope

- The legacy `POST /api/ticket-tiers/validate-code` endpoint is now unused (only the modal flow called it). Left in place for now; safe to delete in a cleanup pass once we're confident no historical client builds still hit it.
- `TicketCodeModal.tsx` (web) and `TicketAccessCodeModal.tsx` (mobile) component files are also now unused. Same — leave for cleanup.
- Rate limiting on `/api/ticket-tiers/unlock` is not implemented — the auth gate + the fact that hidden-tier codes are organizer-set + the very low blast radius (just revealing a tier, not making a charge) made it not worth wiring in this PR. If brute-force becomes a concern, add a per-user throttle.

---

### 2. Wave 0 — Quick Wins bundle (W0-Q1…Q6, Jun 8, 2026)

**Context.** Six small, low-risk, OTA-safe fixes from the Rev. 3 backlog (`issue-list.md`), shipped together in one branch (`Wave-0-quick-wins`). No migrations, no new packages, no new native modules — mobile ships via `eas update` after the web deploy. Each maps to a row in the Jun 3 triage table (issues 20, 21, 25, 26, 28, 32).

**Verification (whole bundle).** `apps/web` `tsc --noEmit` clean; `apps/mobile` `tsc --noEmit` error set byte-identical to `main` (no new errors — pre-existing baseline drift unchanged, tracked under W6-E1); `pnpm --filter @project-flame/lib test` 167/167.

#### W0-Q1 — Promo-code pill overlap (mobile only, issue 20)

`flex-1` on multiple `PromoCodePill` siblings inside a `flex-row flex-wrap` wrapper made the pills fight for width on one row and visually pile up. Switched [`OrgPromotionsCard.tsx`](apps/mobile/components/org-dashboard/OrgPromotionsCard.tsx) to a vertical `gap-2` column of full-width pills (removed `flex-1` from the pill root + the list wrapper's `flex-row flex-wrap`), matching the sibling [`OrgPromoterLinksCard.tsx`](apps/mobile/components/org-dashboard/OrgPromoterLinksCard.tsx) pattern. Web pills are content-sized and already wrap — unchanged.

#### W0-Q2 — Send-tickets configure block stranded below the fold (both, issue 21)

The "configure ticket/order" block is conditionally rendered only after a recipient is selected; with only the Send Tickets section open at the bottom of a long page, the newly-revealed block (and, on mobile, the keyboard) pushed content below the fold with nothing scrolling it into view.

- **Web** [`OrgEventDetailClient.tsx`](apps/web/app/organizer/event/[id]/OrgEventDetailClient.tsx) `SendTicketsSection`: added a `configureRef` on the "Step 2: Configure" block + a `useEffect` on `selectedUser` that calls `scrollIntoView({ behavior: "smooth", block: "center" })`.
- **Mobile** [`OrgSendTicketsCard.tsx`](apps/mobile/components/org-dashboard/OrgSendTicketsCard.tsx): the parent [`org-event-detail.tsx`](apps/mobile/app/org-event-detail.tsx) passes its `scrollViewRef` down; on recipient-select a per-tab "pending scroll" flag is set and consumed in the configure block's `onLayout` (the block only mounts after selection), which `measureLayout`s the block against the ScrollView and `scrollTo`s it into view. For the keyboard, the parent ScrollView uses `automaticallyAdjustKeyboardInsets` (iOS) so a focused email/qty field at the very bottom of the page rides above the keyboard. **QA note (Jun 8):** the first cut wrapped the ScrollView in a `KeyboardAvoidingView` (iOS `padding`), but with the form deep inside a long ScrollView the input was still clipped behind the keyboard — `automaticallyAdjustKeyboardInsets` grows the scroll inset instead and fixes it.

#### W0-Q3 — Default city filter to "Quito" on app open (both, issue 25)

`selectedCity` initialized to `null` (all cities) everywhere. Now defaults to `"Quito"` on first load **only if** Quito has events (`cities.includes("Quito")`), via a one-shot effect that fires once events load and the user hasn't touched the filter. Touching the filter (or Reset) broadens to all cities — no "return to Quito" (decision Jun 3). Implemented in mobile [`useEventFilters.ts`](apps/mobile/hooks/useEventFilters.ts) and web [`HomeContent.tsx`](apps/web/app/components/HomeContent.tsx) + [`EventsCatalog.tsx`](apps/web/app/components/EventsCatalog.tsx) — each wraps `setSelectedCity` to mark user interaction so the default never fights an explicit choice.

**QA follow-up (Jun 8):** on web the filter panel is collapsed by default, so the applied Quito filter was invisible — the user saw only the sliders/filter icon. The filter button next to the search bar now mirrors mobile [`EventsHero`](apps/mobile/components/events/EventsHero.tsx) exactly: a location-pin pill that reads "📍 {city}" (white, dark text) when a city is selected and "📍 All cities" (translucent `bg-white-10`, `white-80`) otherwise; same `h-11 px-4 gap-1`, `text-xs leading-4 font-poppins-medium`. Tapping it opens the filter panel, where "All cities" clears the selection — the same tap-to-open-then-pick model as mobile's `FilterBottomSheet`. Applied to both `HomeContent` (`SearchHero`) and `EventsCatalog`. (Earlier iterations used a separate chip below the search bar, then a sliders-icon fallback — both replaced per request so web matches mobile's inline pill 1:1; only the icon glyph differs by library, `FiMapPin` vs Ionicons `location-outline`.) Mobile was unchanged.

#### W0-Q4 — Default tier `sales_end` to the event end in add/edit paths (both, issue 26)

Create-event flows already auto-fill an empty tier `sales_end` to the event end; the manage-event add/edit-tier paths did not. Threaded the event end through:

- **Web** [`TierInlineForm.tsx`](apps/web/app/components/organizer/TierInlineForm.tsx): new `tentativeEventEnd` prop; a blank `sales_end` defaults to it. Passed from all six mount sites in [`OrgEventDetailClient.tsx`](apps/web/app/organizer/event/[id]/OrgEventDetailClient.tsx) and [`EventsTiersView.tsx`](apps/web/app/components/organizer/EventsTiersView.tsx).
- **Mobile** [`EditTiersTab.tsx`](apps/mobile/components/events-management/EditTiersTab.tsx): the add-new form lazy-inits `salesEnd` to `utcToLocal(event.ends_at)` and a ref-guarded one-shot effect seeds it once the event loads; `ExistingTierCard` gets an `eventEndsAt` prop and defaults a null `sales_end` to the event end.

An explicit organizer-set `sales_end` is always preserved; only blank/null values are pre-filled.

#### W0-Q5 — My Tickets not refreshing after purchase/RSVP (mobile only, issue 28)

`["user-tickets", userId]` has a 5m `staleTime` and the dashboard mounts from cache, so a new ticket was missing until pull-to-refresh. [`useCheckout.ts`](apps/mobile/hooks/useCheckout.ts) now imports `useQueryClient` and invalidates `["user-tickets"]` (prefix match) via an effect on the `step === "success"` transition — covering all six success paths (direct paid/free, RSVP free/paid/100%-promo). Mirrors the existing invalidation in [`useRsvpManagement.ts`](apps/mobile/hooks/useRsvpManagement.ts).

#### W0-Q6 — "X/Y left" vs "sold" web/mobile parity (both, issue 32)

Unified all organizer tier/stage count strings to the **remaining-led** convention (matches Eventbrite/Ticketmaster organizer views): tier → `{available}/{total} available` (+ ` · {n} reserved` when reserved > 0), stage → `{remaining}/{qty} left`, with `Math.max(0, …)` and `quantity_reserved` subtracted consistently.

- **Web** [`EventsTiersView.tsx`](apps/web/app/components/organizer/EventsTiersView.tsx): the two **past-event** blocks were the only divergence (`{quantity_sold}/{quantity_total} sold`) — converted to the available/reserved format. Current-event blocks and [`OrgEventDetailClient.tsx`](apps/web/app/organizer/event/[id]/OrgEventDetailClient.tsx) already used the convention.
- **Mobile** [`EditTiersTab.tsx`](apps/mobile/components/events-management/EditTiersTab.tsx): the stage line said `{sold_quantity}/{quantity} sold` — switched to `{remaining}/{quantity} left · {n} reserved`. The tier line already read `{available}/{total} available · {n} reserved`. The standalone "{n} sold" stat chip (distinct cart-icon metric, not the inventory string) was left in place.

---

### 3. Org dashboard revenue under-counted high-volume events — PostgREST 1000-row cap (mobile + web, Jun 9, 2026)

**Symptom (mobile).** On the organizer-admin screen, an owned event's card ("Current & Upcoming Events") showed a lower revenue than the same event's detail page — e.g. HUSH WHITE PARTY card read **$8,390** while the detail page (and the actual paid-Stripe order sum) read **$10,060**. The card's **Attendees** count was correct/current, and the gap survived a full `--clear` server restart (ruling out client cache staleness).

**Symptom (web).** The org dashboard rendered the wrong **$8,390** on first paint, then "flipped" to the correct **$10,060** a couple seconds later — a visible flash from the truncated SSR value to the correct client-fetched value.

**Root cause — PostgREST's default 1000-row response cap, not staleness or a calc bug.** Both clients had a place that fetched **all of the organization's orders in a single un-paged org-wide query** (`.in(...)` / `.eq("organization_id", …)`) and summed per `event_id` in JS (shared `calculateOrganizerBasePrice`). PostgREST silently caps every response at 1000 rows. Hush Experiences has **1,045** qualifying orders org-wide (`status IN (completed, paid)`, not bank_transfer), so the overflow was dropped. With no `.order()`, the dropped rows were whichever sorted last — and HUSH WHITE PARTY is the newest event, so its newest orders (≈ $1,670) were truncated: $10,060 − $1,670 = **$8,390**, matching the bug exactly.

- **Mobile:** [`useOrgDashboardStats`](apps/mobile/hooks/useOrgDashboardStats.ts) does the org-wide query → card under-counts, full-stop.
- **Web:** the truncation lives in the **SSR initial fetch** in [`organizer/page.tsx`](apps/web/app/organizer/page.tsx) (`allPurchasesResult`, org-wide `.in("event_id", eventIds)`). The client's React Query poll of `/api/organizer/data` then fetches **per event** (`enrichEventWithStats` → `fetchEventPurchases` → `.eq("event_id", …)`, each under the cap) and overwrites the SSR value with the correct one — hence the flash, not a permanent wrong value.

**Fix (both).** Paginate the org-wide orders query — loop `.range(from, from + 999)` in 1000-row pages until a short page is returned, ordered by the unique primary key `id` so pagination is stable (no rows skipped/duplicated across page boundaries). Every order is summed; revenue still computed per-row with `calculateOrganizerBasePrice` so legacy Datafast orders (null `base_price_cents`) keep their historical extraction.
- Mobile: [`useOrgDashboardStats.ts`](apps/mobile/hooks/useOrgDashboardStats.ts).
- Web: the `allPurchasesResult` element of the `Promise.all` in [`organizer/page.tsx`](apps/web/app/organizer/page.tsx) is now a paginated async IIFE returning the same `{ data, error }` shape. The sibling RSVP (27) and active-holds (0) queries stay single-shot — both are far under the cap for this org; only order volume crosses it.

**Note on discarded first attempts (mobile).** Before the root cause was identified, two speculative changes were tried under a (wrong) cache-staleness hypothesis and have since been **fully reverted** so the final mobile diff is the pagination fix only: (1) a `useFocusEffect` refetch-on-focus + spinner-gate tweak in `organizer-admin.tsx`, and (2) `refetchOnMount: "always"` on the query. Neither was the cause; the `--clear` restart still reproduced the gap, which pointed to a server-side row cap rather than client cache.

**Latent edge case (not yet hit, deferred).** The web's *per-event* purchase query (`fetchEventPurchases`, used by `/api/organizer/data` and the event-detail page) is itself uncapped — a single event exceeding 1000 orders would undercount the same way. No event is near that yet; logged under `EDGE_CASES_TODOS.MD` to paginate `fetchEventPurchases` before any single event crosses ~1000 orders.

---

### 4. Wave 0 — post-review fixes (Jun 9, 2026)

Three auto-reviewer findings verified against the code and fixed (others on the run were skipped as no-ops):

1. **`EditTiersTab` sales_end re-seed after clear.** The one-shot seed effect only set `salesEndSeededRef` when it *wrote* the default, so on the event-loaded-at-mount path (where `salesEnd` is lazy-inited from `event.ends_at`) the ref stayed `false` and a later user **clear** re-seeded the field — violating the effect's own documented "never re-seed after the organizer edits or clears" invariant. Now the ref is marked the first time the field is already populated *or* we seed it: `if (!seeded && (salesEnd || defaultSalesEnd)) { seeded = true; if (!salesEnd && defaultSalesEnd) setSalesEnd(defaultSalesEnd); }`. ([`EditTiersTab.tsx`](apps/mobile/components/events-management/EditTiersTab.tsx))
2. **Filter-button hover parity (W0-Q3).** `HomeContent`'s city pill used `transition-opacity hover:opacity-90` for both states (the translucent "All cities" pill *faded* on hover); aligned it to `EventsCatalog`'s `transition-colors` + conditional `hover:bg-white-20` (unselected) / `hover:opacity-90` (selected). ([`HomeContent.tsx`](apps/web/app/components/HomeContent.tsx))
3. **Organizer revenue: fail-fast on pagination error.** The paginated orders IIFE in [`organizer/page.tsx`](apps/web/app/organizer/page.tsx) returned the partial `all` accumulated so far on a mid-loop `error`, and the downstream check only `console.error`ed it — so a page-2+ failure silently under-counted revenue (the exact bug pagination was added to prevent). Now `throw error`, mirroring the mobile twin [`useOrgDashboardStats.ts`](apps/mobile/hooks/useOrgDashboardStats.ts) (`if (error) throw error`) so the page surfaces an error instead of a wrong total.

**Validation:** `apps/web` `tsc --noEmit` clean; `apps/mobile` `tsc --noEmit` error set byte-identical to `main` (no new errors).

---

### 5. Wave 0 — second review round (Jun 10, 2026)

Triaged 1 bug + 2 inline + 5 nitpick comments against the actual code; fixed 4, skipped 2, deferred 1.

**Fixed**

1. **Bug: editing a null-`sales_end` tier silently persisted the prefill.** W0-Q4 pre-fills `editSalesEnd` to the event end for display when `tier.sales_end` is null, but `handleSaveEdit`'s diff (`endUtc !== tier.sales_end`) treated that prefill as an edit — so saving an unrelated field (e.g. name) wrote `sales_end = event end`. Now skipped when the field still equals the prefilled default on a null-end tier (`isUntouchedPrefill`); a real edit still persists. ([`EditTiersTab.tsx`](apps/mobile/components/events-management/EditTiersTab.tsx))
2. **`DEFAULT_CATALOG_CITY` extracted to shared lib (master rule §7.2).** The `"Quito"` catalog default was duplicated across the mobile hook + both web catalog components. Added `export const DEFAULT_CATALOG_CITY = "Quito"` in [`packages/lib/src/utils/event-filters.ts`](packages/lib/src/utils/event-filters.ts) (re-exported through `utils/index` + root index) and imported it in [`useEventFilters.ts`](apps/mobile/hooks/useEventFilters.ts), [`HomeContent.tsx`](apps/web/app/components/HomeContent.tsx), [`EventsCatalog.tsx`](apps/web/app/components/EventsCatalog.tsx).
3. **Documented the one-shot default's "stuck city" edge.** Added an inline note in `useEventFilters` that the default is applied once and is *not* auto-cleared if the selected city later drops out of `cities` (filtered list can be empty until the user changes the filter) — intentional for this PR.
4. **`measureLayout` failure now logs in dev.** The empty error callback in `OrgSendTicketsCard.scrollConfigIntoView` swallowed failures; it now `console.error`s under `__DEV__` (RN types the callback as `() => void`, so no error arg is available).

**Skipped (verified not worth changing)**

- **Remove `findNodeHandle`, pass the ScrollView ref to `measureLayout` directly.** `findNodeHandle` is still supported (incl. New Architecture) and the scroll works; passing a *composite* `ScrollView` ref to `measureLayout` is not a guaranteed equivalent (the node handle is taken precisely because the ref isn't a host node), so the change risks breaking working code for a hypothetical-compat concern.
- **`scrollIntoView` `block: "center"` → `"nearest"`.** `"center"` was the spec'd behavior and passed the Q2 web QA ("smooth-scrolls into center"); changing it contradicts the validated UX.

**Deferred**

- **Type the `any[]` orders accumulator in `organizer/page.tsx`.** Disproportionate in isolation — the file is pervasively `any` and every downstream consumer re-casts, so typing one accumulator enforces nothing while requiring a fragile hand-written nested-select type. Logged in `NITPICKS_TODOS.md` for a dedicated `page.tsx` typing pass.

**Validation:** `apps/web` `tsc --noEmit` clean; `apps/mobile` `tsc --noEmit` byte-identical to `main`; `pnpm --filter @project-flame/lib test` 167/167.

---

### 6. W7-H3 — Bank-transfer order custom price (Jun 10, 2026)

**Context.** When an organizer creates a manual **bank-transfer** order (Send Tickets → Bank Transfer Orders), the per-ticket price was always derived from the tier — or, for staged tiers, the active/selected stage. There was no way to charge a one-off amount (a negotiated price, a partial-payment record, a bundle rate). The atomic RPC `create_bank_transfer_order_atomic` **already accepted** `p_unit_price_cents` and validates `subtotal = unit × qty` and `total = subtotal + fees`, so this is an API-field + UI change only — **no migration, no RPC change**.

**What changed.**

1. **API — optional `unit_price_cents` override.** [`bank-transfer-tickets/route.ts`](apps/web/app/api/organizer/bank-transfer-tickets/route.ts) now accepts an optional `unit_price_cents`. Validated server-side: must be a positive integer ≤ $10,000 (≤ 0 is rejected with a message pointing to the free/comp flow; non-integer/oversized values 400). When present it **replaces** the tier/stage-derived unit price after derivation (the stage association is still recorded); `subtotal`/`total` recompute from it and pass straight to the RPC. The override is recorded in ticket `metadata` (`custom_price: true`, `custom_unit_price_cents`, `catalog_unit_price_cents`) for auditing, alongside the existing `stage_*` keys.
2. **Web UI.** [`OrgEventDetailClient.tsx`](apps/web/app/organizer/event/[id]/OrgEventDetailClient.tsx) `SendTicketsSection` (bank mode) gained a **"Set custom price"** toggle (off by default). Toggling on reveals a `$` dollar input pre-filled with the selected tier/stage price and a live **Total** line (`unit × qty`). The order POSTs `unit_price_cents` only when the toggle is on; the submit is blocked (with an inline message) while the entered price is ≤ $0.
3. **Mobile UI.** [`OrgSendTicketsCard.tsx`](apps/mobile/components/org-dashboard/OrgSendTicketsCard.tsx) bank tab gained the same toggle (checkbox row), pre-filled dollar input, live Total, and ≤ $0 guard. [`useBankTransferTickets.ts`](apps/mobile/hooks/useBankTransferTickets.ts) `BankTransferInput` gained `unit_price_cents?: number`.

**Edge cases (per spec).** `$0` → blocked on both client and server (use Send Free Tickets). Below/above tier price → allowed (manual override). Per-stage tiers → the override replaces the stage price for that send; the stage is still recorded in metadata.

**Scope note.** This makes the **stored order + Sent-list price** reflect the custom amount immediately (the Sent list reads `order_total_cents`). Surfacing the amount in an attached **PDF/email** is **W7-H2**'s job (bank-transfer email is still the link-only `sendTicketReadyEmail`) and is not part of this change.

**Web Parity (master §9.1).** Mobile mirrors the web write exactly — same endpoint, same `unit_price_cents` field name and **cents** unit, same positive-integer validation, server-authoritative price returned in `order.total_cents`. Dollars→cents conversion is `Math.round(parseFloat(input) * 100)` on both clients; no custom fee math (`formatCentsAsPrice` from `@project-flame/lib` for all displayed totals).

**Validation:** `apps/web` `tsc --noEmit` clean; `apps/mobile` `tsc --noEmit` error set byte-identical to `main` (no new errors in the two touched files).

---

### 7. W0-Q2 follow-up — `measureLayout` New-Architecture warning (Jun 10, 2026)

**Context.** Surfaced as a runtime log on mobile when selecting a bank-transfer recipient: `Warning: ref.measureLayout must be called with a ref to a native component.` (in `OrgSendTicketsCard.scrollConfigIntoView`). The code is from W0-Q2 (#2, scroll-the-configure-block-into-view); the W7-H3 custom-price block merely renders inside the same `btConfigRef` View, so it made the existing warning easy to hit — it did not introduce it.

**Root cause.** RN 0.81.5 runs on the **New Architecture (Fabric)**. Fabric's `measureLayout` requires its relative-node argument to be a **host-component ref**, not a numeric `findNodeHandle(...)` node handle. The W0-Q2 code passed `findNodeHandle(scroll)` (a number), which Fabric rejects with that warning and then **no-ops** — so the auto-scroll silently did nothing on New Arch. This is the same change #5 had **skipped** ("pass the ScrollView ref to `measureLayout` directly") on a hypothetical-compat concern; the runtime warning supersedes that skip.

**Fix.** [`OrgSendTicketsCard.tsx`](apps/mobile/components/org-dashboard/OrgSendTicketsCard.tsx) now passes `scroll.getNativeScrollRef()` — the ScrollView's underlying **host view** instance — as the relative node, and `findNodeHandle` is dropped from the import. This is the Fabric-correct relative node, clears the warning, and restores the auto-scroll. The `measureLayout` failure callback (dev-only `console.error`) is unchanged.

**Validation:** `apps/mobile` `tsc --noEmit` — `OrgSendTicketsCard.tsx` clean (no new errors vs. `main`).

---

### 8. W7-H2 (partial) — PDF on comp + bank-transfer emails; comp send to non-Flame email (Jun 10, 2026)

**Scope shipped:** Part A (PDF/email on comp **and** bank-transfer) + **3a** (send a comp ticket to a non-Flame email). **3b** (bank-transfer to a non-Flame account) was deferred here and **shipped in #9 below** (Jun 11, 2026).

**Context.** Comp and bank-transfer orders sent a link-only "View My Tickets" email (`sendTicketReadyEmail`) — no PDF — while paid orders attach a per-ticket QR PDF. A working comp-PDF sender (`sendPromotionalTicketEmail`) existed but was **dormant** (never imported). Comp sends also required the recipient to already have a Flame account.

**Pre-work audits (two parallel Explore passes).**
- **Scanner compatibility:** [`qr-scanner/verify/route.ts`](apps/web/app/api/qr-scanner/verify/route.ts) resolves paid/bank tickets by `orderId`+`ticketNumber` and **falls back to a `qr_token` lookup in `promotional_tickets`**. So the comp PDF QR (`{qrToken, type:"promotional"}`) and the bank-transfer `tickets.qr_code` (JSON with `qrToken`) both scan as-is — **no QR/payload changes needed**.
- **Null-user safety (for the deferred 3b):** confirmed `orders.user_id` is `NOT NULL`, no `customer_email`/`customer_name` columns, and the RPC `RAISE EXCEPTION`s on null user. Web revenue ([`purchase-data.ts`](apps/web/app/lib/utils/purchase-data.ts)) and mobile stats ([`useOrgDashboardStats.ts`](apps/mobile/hooks/useOrgDashboardStats.ts)) already exclude `payment_provider='bank_transfer'`, so a null-user order can't corrupt revenue. The one real null-user hotspot is the dashboard bank-transfer transform ([`organizer/data/route.ts`](apps/web/app/api/organizer/data/route.ts)); no bank-transfer refund flow exists. (All this is 3b's concern — recorded for that PR.)

**Part A — PDF on comp + bank-transfer emails.**
1. **Comp:** [`promotional-ticket-notifications.ts`](apps/web/app/lib/email/promotional-ticket-notifications.ts) generalized from single-ticket to **multi-ticket** — one email, an N-page PDF (a QR per ticket), mirroring the paid `generateTicketsPDF`. Wired into [`promotional-tickets/route.ts`](apps/web/app/api/organizer/promotional-tickets/route.ts) (replaces `sendTicketReadyEmail`).
2. **Bank transfer:** [`bank-transfer-tickets/route.ts`](apps/web/app/api/organizer/bank-transfer-tickets/route.ts) now sends via the paid `sendTicketConfirmationEmail` with an **explicit flat fee breakdown** (`basePriceCents = total, serviceFee = 0, IVA = 0`). Bank transfers carry no platform fee, so this shows the actual (possibly custom, W7-H3) price as a flat amount **without** the paid path's `calculateFeeBreakdownFromTotal` inventing a base/IVA split — and reuses the proven jsPDF layout instead of duplicating it. The route already generates the per-ticket QR data-URLs; they're fed straight into the PDF.

**Part B (3a) — comp send to a non-Flame email.**
- **API** ([`promotional-tickets/route.ts`](apps/web/app/api/organizer/promotional-tickets/route.ts)): `user_id` is now optional; accepts `recipient_email` + optional `recipient_name`. Resolves the recipient two ways — existing account (look up email/name; push-eligible) or email-only (validate email, derive name from `recipient_name` or the email local-part). `promotional_tickets` is email-keyed (no `user_id`), so the insert is unchanged. **Push is skipped** when there's no account.
- **Web UI** ([`OrgEventDetailClient.tsx`](apps/web/app/organizer/event/[id]/OrgEventDetailClient.tsx) `SendTicketsSection`, free mode): when search returns no Flame user, a card offers "Send without a Flame account" (with copy noting they scan the PDF QR at the door but won't see it in "My Tickets" unless they sign up with that email). A confirmed no-account recipient shows its own Step-1 banner and flows through Configure → send via `recipient_email`.
- **Mobile UI** ([`OrgSendTicketsCard.tsx`](apps/mobile/components/org-dashboard/OrgSendTicketsCard.tsx) free tab + [`useSendTickets.ts`](apps/mobile/hooks/useSendTickets.ts)): same no-account offer + confirmed-recipient banner; `SendTicketsInput` gained optional `recipient_email`/`recipient_name`. No-account sends rely on `sendTickets.isPending` for the button spinner (no per-row `sendingUserIds` key).
- Both no-account flows are **free/comp only**; the bank tab still requires a selected Flame user (3b deferred).

**Web Parity (master §9.1).** Mobile mirrors the web write — same `/api/organizer/promotional-tickets` endpoint, same optional `recipient_email`/`recipient_name` fields, same "no account → no push, scan the PDF" behavior.

**Validation:** `apps/web` `tsc --noEmit` clean; `apps/mobile` `tsc --noEmit` error set byte-identical to `main` (204, no new errors in touched files).

### 9. W7-H2 (3b) — Bank-transfer order to a non-Flame account (Jun 11, 2026)

**Scope shipped:** an organizer can now create a **bank-transfer order for an email that has no Flame account**. The recipient gets the same PDF/email as a paid order (from #8 Part A) and scans the PDF QR at the door; they only see it in "My Tickets" if they later sign up with that email. This completes W7-H2 (Part A + 3a shipped in #8).

**DB migration** ([`20260611162335_bank_transfer_no_account_recipient.sql`](supabase/migrations/20260611162335_bank_transfer_no_account_recipient.sql), applied via MCP):
- `orders.user_id` → **nullable** (was `NOT NULL`); added `customer_email text` + `customer_name text`; added `CHECK (user_id IS NOT NULL OR customer_email IS NOT NULL)` (`orders_recipient_present_check`) so every order still carries a recipient identity.
- Replaced `create_bank_transfer_order_atomic` — dropped the hard `user_id IS NULL` rejection, added `p_customer_email`/`p_customer_name` params (require **either** a user or a customer email), persist them on the order, and `COALESCE` the ticket `attendee_name`/`attendee_email` from the ticket JSON → customer fields. All other logic (capacity auto-expand, stage updates, money-consistency checks, W7-H3 custom price) unchanged.

**App code.**
- **API** ([`bank-transfer-tickets/route.ts`](apps/web/app/api/organizer/bank-transfer-tickets/route.ts)): `user_id` optional; accepts `recipient_email`/`recipient_name`. Resolves the recipient two ways — existing account (look up email/name; push-eligible) or email-only (validate, derive name). Passes `p_customer_email`/`p_customer_name` + a null `p_user_id` to the RPC for no-account orders. **Push is skipped** when there's no account; the PDF email still sends.
- **Dashboard transform** (the one null-user hotspot flagged in #8): [`bank-transfer-data.ts`](apps/web/app/lib/utils/bank-transfer-data.ts) now falls back to `order.customer_name`/`customer_email` when the `users` join is null, and [`organizer/data/route.ts`](apps/web/app/api/organizer/data/route.ts) selects the two new columns. The Zod schema on mobile (`email`/`customer_name` non-null strings) keeps validating because the transform always emits strings.
- **Mobile UI** ([`OrgSendTicketsCard.tsx`](apps/mobile/components/org-dashboard/OrgSendTicketsCard.tsx) **bank tab** + [`useBankTransferTickets.ts`](apps/mobile/hooks/useBankTransferTickets.ts)): un-deferred the no-account offer + confirmed-recipient banner on the bank tab (mirrors the free tab from #8); `BankTransferInput` gained optional `recipient_email`/`recipient_name` and `user_id` is now optional.

**Null-user audit follow-through (from #8).** Revenue stays correct — web ([`purchase-data.ts`](apps/web/app/lib/utils/purchase-data.ts)) and mobile ([`useOrgDashboardStats.ts`](apps/mobile/hooks/useOrgDashboardStats.ts)) exclude `payment_provider='bank_transfer'`, so a null-user order can't corrupt revenue; no bank-transfer refund flow exists; the dashboard transform (the only real hotspot) is fixed above.

**Web Parity (master §9.1).** Mobile mirrors the web write — same `/api/organizer/bank-transfer-tickets` endpoint, same optional `recipient_email`/`recipient_name`, same "no account → no push, scan the PDF" behavior.

**Validation:** `apps/web` `tsc --noEmit` clean; `apps/mobile` `tsc --noEmit` error set **byte-identical to `main`** (109 ↔ 109, diff empty, zero errors in touched files); `@project-flame/lib` 167/167 tests pass. Post-migration schema check confirmed `user_id`/`customer_email`/`customer_name` all nullable.

---

### 10. W7-H3 follow-up — clear the custom-price input on toggle-off (Jun 11, 2026)

PR-review triage of 4 auto-reviewer findings against the shipped W7-H2/W7-H3 code; **fixed 1, skipped 3** (verification-first per `docs/prompts/starter-pr-prompt.md`).

**Fixed**

- **Stale custom price across off → tier-change → on.** In [`OrgSendTicketsCard.tsx`](apps/mobile/components/org-dashboard/OrgSendTicketsCard.tsx) `handleToggleBtCustomPrice`, the pre-fill guard (`cur ? cur : tierDefault`) kept the previous tier's value when the toggle was turned off, the tier changed, then toggled back on — so the new tier got the old default. Now the input is **cleared on turn-off**, so a later toggle-on pre-fills fresh from the then-current tier. (The toggle-on-while-changing-tiers case is intentionally left as-is — auto-overwriting a typed custom price would be wrong, and the live Total surfaces it.)

**Skipped (verified against code)**

- **XOR validation for `user_id` vs `recipient_email`** ([`bank-transfer-tickets/route.ts`](apps/web/app/api/organizer/bank-transfer-tickets/route.ts)). The *neither* case is already a 400; the *both* case has safe, defined precedence (`if (user_id) … else …` → account wins, same as the comp route); the UI never sends both. No corruption — disproportionate hardening for an unreachable case.
- **`await sendPushNotification`** (same route). Fire-and-forget `.catch()` is the established project convention (comp route + original bank route) — push is best-effort and the email is already awaited; awaiting only here adds latency and is inconsistent. The serverless drop-after-response caveat is systemic, not a 3b bug (a project-wide `waitUntil`/queue would be the real fix).
- **Empty-`tickets` guard in `sendPromotionalTicketEmail`** ([`promotional-ticket-notifications.ts`](apps/web/app/lib/email/promotional-ticket-notifications.ts)). Not reproducible — the sole caller builds `tickets` from rows it just inserted after validating quantity 1–10 and 500-ing on an empty insert, so `tickets` is always ≥1.

**Validation:** `apps/mobile` `tsc --noEmit` error set byte-identical to `main` (204, `OrgSendTicketsCard.tsx` clean).

---

### 11. W7-H2/H3 follow-up — web bank no-account parity + stale-CTA fixes (Jun 13, 2026)

PR-review triage of 10 findings against the shipped W7-H2/H3 code; **fixed 4 (incl. mobile parity), skipped 6** (verification-first per `docs/prompts/starter-pr-prompt.md`).

**Fixed**

1. **Web couldn't create no-account bank-transfer orders (parity gap).** The API and mobile both shipped no-account bank orders (3b), but the web `SendTicketsSection` bank branch still hard-required a selected Flame user and gated the "send without account" offer to `mode === "free"` ([`OrgEventDetailClient.tsx`](apps/web/app/organizer/event/[id]/OrgEventDetailClient.tsx)). Extended the no-account offer to **both** modes and `handleSend`'s bank branch to post `recipient_email` (vs `user_id`) for no-account, mirroring the comp path and mobile. Completes the web half of 3b (Web Parity Gate §9.1).
2. **Web custom-price toggle kept a stale value on off → tier-change → on.** `handleToggleCustomPrice` now **clears `bankCustomPriceInput` on turn-off** (web mirror of #10's mobile fix).
3. **No-account CTA used the live input, not the searched email (web + mobile).** Editing the email field after a "not found" result (without re-searching) made the offer capture the **unsearched** address — could send a no-account ticket to someone who actually has an account. Now keyed off a `lastSearchedEmail` / `freeLastSearched` / `btLastSearched` captured at search time, used for the offer copy **and** the confirmed recipient, on web ([`OrgEventDetailClient.tsx`](apps/web/app/organizer/event/[id]/OrgEventDetailClient.tsx)) and mobile ([`OrgSendTicketsCard.tsx`](apps/mobile/components/org-dashboard/OrgSendTicketsCard.tsx)) — both free and bank offers.
4. **Email preview didn't exercise the multi-ticket branch.** The `promotional-ticket` fixture in [`email-preview/route.ts`](apps/web/app/api/dev/email-preview/route.ts) now passes 2 tickets so the pluralized copy / multi-page summary render in preview.

**Skipped (verified against code)**

- **XOR validation (`user_id` vs `recipient_email`) on the bank route** — *neither* already 400s; *both* has safe defined precedence (`user_id` wins, same as the comp route); the UI never sends both. Unreachable state, no corruption.
- **`attendeeName || recipientName` in the comp email HTML** — no mixed-attendee caller exists (the comp route assigns every ticket the same recipient name); the HTML is a single summary line by design, and the **PDF already** uses per-ticket names.
- **Fail-closed on `doc.addImage` (QR embed)** — the log-and-embed-error-text pattern is a **consistent convention across both PDF generators**; `addImage` failing right after a successful `toDataURL` is near-impossible. Fail-closing only here is inconsistent (would be a cross-cutting decision).
- **Currency-aware money parsing on the web bank custom price** — bank-transfer orders are **USD-only** (the RPC hard-codes `currency 'USD'`), so `parseFloat×100` / `toFixed(2)` is correct and displayed totals already use `formatCentsAsPrice(…, currency)`. No `parseMoneyToCents` helper exists.
- **Stricter migration CHECK (XOR + non-empty `customer_email`)** — the route (`customer_email = NULL` for account orders, validated non-empty for no-account) and the RPC (rejects null-user + empty email) already guarantee exactly-one + non-empty; re-constraining live money records for an unreachable state isn't warranted.
- **issue-list "stray `> ` blockquote"** — factually wrong; the referenced line is a plain blank line separating two intentional blockquotes.

**Validation:** `apps/web` `tsc --noEmit` clean; `apps/mobile` `tsc --noEmit` error set byte-identical to `main` (204, `OrgSendTicketsCard.tsx` clean).

---

### 12. W7-H2 follow-up — no-account banner future-tense copy (Jun 13, 2026)

One copy nit from the same review round. The confirmed-recipient banner is shown **before** the organizer hits send, so present-tense "ticket sent by email" was slightly off — changed to **"ticket will be sent by email"** on web ([`OrgEventDetailClient.tsx`](apps/web/app/organizer/event/[id]/OrgEventDetailClient.tsx)) and "will be sent by email" on both mobile banners ([`OrgSendTicketsCard.tsx`](apps/mobile/components/org-dashboard/OrgSendTicketsCard.tsx)). **Skipped** the paired suggestion to differentiate comp vs bank delivery copy — it was factually wrong (bank-transfer orders issue the ticket + PDF immediately, not "once payment is completed", and no-account recipients have no "My Tickets"). Copy-only; `tsc` web clean, mobile byte-identical to `main`.

---

### 13. W7-H2 QA fixes — comp PDF QR didn't scan; Sent list didn't auto-refresh (Jun 13, 2026)

Two issues found in device QA of the comp/bank send flow.

**1. Complimentary-ticket PDF QR would not scan (both platforms).** The scanner ([`useQRScanner.ts`](apps/mobile/hooks/useQRScanner.ts) `validateQRData`) identifies a promotional ticket by `!orderId && qrToken` and then **requires `eventId`** before it will call `/api/qr-scanner/verify` (which looks the ticket up in `promotional_tickets` by `qr_token`). The in-app "My Tickets" QR ([`ticket/[id].tsx`](apps/mobile/app/ticket/%5Bid%5D.tsx)) encodes the full canonical `QRCodeData` shape (`orderId: ""`, `eventId`, `ticketNumber`, `qrToken`, …) and scans fine. Our comp **PDF** QR ([`promotional-ticket-notifications.ts`](apps/web/app/lib/email/promotional-ticket-notifications.ts)) encoded a different `{qrToken, ticketId, type:"promotional", …}` shape with **no `eventId`/`orderId`/`ticketNumber`**, so it failed the scanner's client-side validation. Bank-transfer PDFs were unaffected (they embed the route-generated paid-shape QR). **Fix:** the comp PDF QR now encodes the canonical `QRCodeData` shape (`orderId: ""`, `eventId`, `userId: recipientEmail`, `tierName`, `eventName`, `ticketNumber`, `qrToken`, `timestamp`) — identical to the in-app QR, so it scans on both the mobile and web scanners. Added `eventId` to `PromotionalTicketEmailData` and passed `event.id` from [`promotional-tickets/route.ts`](apps/web/app/api/organizer/promotional-tickets/route.ts) (+ the dev preview fixture). Affects comp sends to both account and no-account recipients.

**2. Mobile "Sent" list didn't refresh after a send (comp + bank).** The send mutations invalidated `["org-events"]`, but the Sent accordion is fed by `useOrgEventEnriched` (key `["org-enriched-data"]`), so the list stayed empty/stale until a manual pull-to-refresh. **Fix:** [`useSendTickets.ts`](apps/mobile/hooks/useSendTickets.ts) and [`useBankTransferTickets.ts`](apps/mobile/hooks/useBankTransferTickets.ts) now also `invalidateQueries({ queryKey: ["org-enriched-data"] })` on success, so the Sent list updates immediately.

**Validation:** `apps/web` `tsc --noEmit` clean; `apps/mobile` `tsc --noEmit` byte-identical to `main` (204). **Re-QA needed:** rescan a freshly-sent comp PDF on both scanners; confirm the mobile Sent list updates without pull-to-refresh.

---

### 14. Web QR scanner — "Scan Next Ticket" returns to the live camera (Jun 13, 2026)

QA nit (web scanner). On a scan hit the scanner calls `stopScanning()`, and "Scan Next Ticket" / the post-result Cancel ran `resetScanner()` → `scannerState: "idle"`, dropping the operator back to the **"Activate Camera"** screen (an extra tap per ticket); mobile reopens the camera directly. Added `handleScanNext` (`resetScanner()` + `startScanning()`) in [`QRScannerApp.tsx`](apps/web/app/components/QRScannerApp.tsx) and pointed the two "Scan Next Ticket" buttons + the post-result Cancel at it, so they return **straight to the live scanner**. Left the genuine idle paths untouched (event change, in-scan Cancel, error "Try Again"). `tsc` web clean.

---

### 15. Stripe Connect — country-aware onboarding so Mexico organizers can connect (web + mobile, Jun 18, 2026)

> **⚠️ Superseded (Jul 1, 2026 — see [`JULY_2026_FIXES.md`](./JULY_2026_FIXES.md) #1).** The full-service-agreement workaround for Mexico (requesting `card_payments` + `transfers`) was **reverted**. Stripe enabled the **recipient** service agreement for our platform's MX accounts on the V1 Accounts API, so Mexico is now created as recipient/transfers-only like Ecuador. `FULL_SERVICE_AGREEMENT_COUNTRIES` and `requiresFullServiceAgreement()` were removed. The reason the workaround was abandoned: MX full-service accounts onboarded fine but **failed at checkout** with `Stripe doesn't currently support application fees for platforms in US with connected accounts in MX` — US→MX destination-charge application fees are blocked, whereas the recipient model (as with EC) is not. The country selector + `default_currency` logic from this entry is **retained**.

**Context.** Connecting a Mexican organizer failed with `You cannot request the 'recipient' service agreement for v2 Accounts.` Our `createExpressAccount` (`apps/web/app/lib/stripe/connect.ts`) creates Express accounts with capabilities omitted, so they fall through to the platform's default **recipient** (transfers-only) service agreement. That works for Ecuador/US, but Stripe routes Mexico through its v2 Accounts API, which does **not** support the recipient agreement — so onboarding aborts the moment the organizer picks Mexico in Stripe-hosted country selection. Confirmed with Stripe support (Jun 2026): the fix is to request `card_payments` + `transfers` per-account for those countries (full service agreement), which requires knowing the country **before** `accounts.create` (the agreement is locked at creation and can't change once hosted onboarding begins). We still operate as merchant of record via destination charges; the `card_payments` capability is required for Mexican onboarding but unused by our payment flow.

**Shared logic — [`packages/lib/src/stripe/connect-countries.ts`](packages/lib/src/stripe/connect-countries.ts)** (new, exported from `@project-flame/lib`):

- `STRIPE_CONNECT_COUNTRIES` — curated onboarding list (LATAM + US/CA) that drives the new selector.
- `DEFAULT_CONNECT_COUNTRY = "EC"` (platform's primary market, pre-selected).
- `FULL_SERVICE_AGREEMENT_COUNTRIES = ["MX"]` + `requiresFullServiceAgreement(code)` — countries needing card_payments + transfers instead of the recipient default.
- `isSupportedConnectCountry(code)` — case-insensitive membership check for server-side validation.
- 9 unit tests in [`packages/lib/__tests__/connect-countries.test.ts`](packages/lib/__tests__/connect-countries.test.ts) (176 lib tests pass).

**Backend — [`createExpressAccount`](apps/web/app/lib/stripe/connect.ts) + [`POST /api/stripe/connect/onboard`](apps/web/app/api/stripe/connect/onboard/route.ts):**

- `createExpressAccount(email, { country, businessName })` now sets `country` when provided and, for full-service-agreement countries, explicitly requests `capabilities: { card_payments: { requested: true }, transfers: { requested: true } }`. Non-MX countries keep capabilities omitted (recipient default unchanged). Typed `accountParams` as `Stripe.AccountCreateParams` (was `any`).
- Onboard route reads `country` from the body, validates it via `isSupportedConnectCountry` (400 on unsupported), normalizes to uppercase, and forwards it on the **creation path only**. `country` is **optional** for backward compatibility — older mobile clients that don't send it fall back to today's behavior (Stripe-hosted selection / recipient default). Existing accounts (Complete Setup / Manage) skip creation, so country is ignored there — no regression for already-connected EC/US organizers.

**Web UI — [`StripeConnectStatus.tsx`](apps/web/app/components/StripeConnectStatus.tsx):**

- Added a "Country of operation" `<select>` (styled `bg-white-5 border border-white-10` per design system) in the **not-connected** state only, defaulting to `DEFAULT_CONNECT_COUNTRY`. The "Connect with Stripe" button passes the selection; "Complete Setup" / "Manage" call `handleConnect()` with no country.
- When a full-service country is selected, an inline heads-up note warns that Stripe will request additional business details (website, refund policy, product description) during setup.
- `handleConnect(country?)` only includes `country` in the POST body when present.

**Mobile UI — [`PayoutsSettingsTab.tsx`](apps/mobile/components/settings/PayoutsSettingsTab.tsx) + [`ConnectCountrySelector.tsx`](apps/mobile/components/settings/ConnectCountrySelector.tsx) (new) + [`useStripeConnect.ts`](apps/mobile/hooks/useStripeConnect.ts):**

- New `ConnectCountrySelector` — a tappable field + native Modal bottom-sheet picker (mirrors the `EditRoleSheet` pattern), listing `STRIPE_CONNECT_COUNTRIES`.
- Wired into the not-connected card with the same Mexico heads-up note. `handleConnect(country?)` mirrors web (country only sent on new-account creation; existing-account buttons call `handleConnect()`).
- Fixed a latent bug while here: the existing-account `ConnectButton`s passed `onPress={handleConnect}`, which would now forward the gesture event as `country` — changed to `() => handleConnect()`.

**Parity.** Same endpoint/body (`{ organizationId, country? }`), same shared `@project-flame/lib` helpers, same default country and Mexico heads-up copy on web and mobile. `tsc` web clean; mobile adds no new type errors (pre-existing FlameText `style`/`numberOfLines` noise unchanged).

**Before going live (user action).** Stripe flagged a platform-level caveat: confirm there's no separate restriction on creating Express `card_payments` accounts in Mexico. Validate in **test mode** first with a `country: "MX"` account requesting both capabilities before onboarding a real Mexican organizer.

**Follow-up (QA, Jun 19, 2026) — `default_currency` required once `country` is set.** Test 1A (Mexico) passed (org "MXF" → `acct_…`, charges + payouts enabled — and since a recipient/transfers-only account can never be `charges_enabled`, that flag alone proves the full-service path fired). Test 1B (Ecuador) then surfaced `You must provide a value for 'default_currency'.` from `accounts.create`. Root cause: the pre-change flow never sent `country`, so Stripe-hosted onboarding collected both country and currency; now that we send `country`, Stripe requires `default_currency` explicitly. Mexico happened to infer MXN, but Ecuador (a USD-using country) did not. Fix: added a `currency` field to each `STRIPE_CONNECT_COUNTRIES` entry (EC→`usd`, MX→`mxn`, US→`usd`, plus the other LATAM/CA locals) and a `getConnectCountryDefaultCurrency(code)` helper; `createExpressAccount` now sets `accountParams.default_currency` (local settlement currency) whenever `country` is provided. 3 added unit tests (12 in the connect-countries suite).

**Follow-up (PR review, Jun 19, 2026) — `ConnectCountrySelector` inline styles → NativeWind.** Converted all `style={{…}}` objects in the new [`ConnectCountrySelector.tsx`](apps/mobile/components/settings/ConnectCountrySelector.tsx) modal to className per the mobile design system (Project Rule 5): scrim `bg-black/55` (matches the existing bottom-sheet scrim pattern in `OrgPromotionsCard`/`DateTimePickerField`), drag handle `w-10 h-1 rounded-sm bg-white-20`, content padding `px-6 pt-2 gap-4`, scroll list `max-h-[360px]` + `gap-2`, and the country rows `py-[14px] px-4 rounded-badge border-[1.5px]` with conditional `border-white-60 bg-white-10` (selected) / `border-white-10 bg-white-5`. No `style={` remains; `colors` import kept (still required for the two `Ionicons` `color` props, which can't take className). No behavior change.

**Follow-up (PR review, Jun 19, 2026) — stale country on org switch + icon color token.** Two more review items fixed:

- **Stale `selectedCountry` on org change (web + mobile).** [`StripeConnectStatus.tsx`](apps/web/app/components/StripeConnectStatus.tsx) and [`PayoutsSettingsTab.tsx`](apps/mobile/components/settings/PayoutsSettingsTab.tsx) initialized `selectedCountry` once with `useState(DEFAULT_CONNECT_COUNTRY)`. Both components stay mounted across org switches (web: `organizationId` prop changes via `?orgId=`; mobile: `selectedOrgId` from `MemberRoleContext`), so a new not-yet-connected org would inherit the previous org's market selection — and could lock its Stripe account under the wrong country. Added a `useEffect` in each that resets `selectedCountry` to `DEFAULT_CONNECT_COUNTRY` whenever the org id changes. (Only matters pre-creation; existing-account paths don't send country.)
- **Icon color token.** The Mexico heads-up `information-circle` icon in `PayoutsSettingsTab` used the raw literal `rgba(255,255,255,0.8)`; swapped to `colors["white-80"]` from `@project-flame/ui` (same value), matching `ConnectCountrySelector`'s icon-color pattern.

**Deferred (logged in [`NITPICKS_TODOS.md`](docs/todos/NITPICKS_TODOS.md), Jun 19, 2026):** (1) Zod-ify the onboard route body validation — current manual checks are correct/minimal; pure style refactor, bundle with a broader Stripe-routes pass. (2) Type `country` as a shared `ConnectCountryCode` union in `ConnectCountrySelector`/`useStripeConnect` — no such literal union exists yet (`StripeConnectCountry.code` is `string`); non-trivial type refactor, no concrete bug. **Skipped:** validating/normalizing `country` inside `createExpressAccount` — its single caller (the onboard route) already validates via `isSupportedConnectCountry` + uppercases, and the `getConnectCountryDefaultCurrency`/`requiresFullServiceAgreement` helpers already return safe defaults for unknown codes (redundant).

---

### 16. W7-H1 — Org-approval admin surface: support-only pending/rejected queue with approve, reject, delete (web + mobile, Jun 22, 2026)

**Context.** `organizations.approved boolean NOT NULL DEFAULT false` gates everything (event creation 403s for unapproved orgs, the discover filter, the organizer dashboard), but **nothing in the app ever flipped it to `true`** — approval was manual DB ops, with **18 pending orgs live**. There was also **no admin role in use** (0 users with `role='admin'`, no `users` row for `support@flme.co`). This adds a support-only surface on the profile screen to triage the queue: **approve** (unlocks event creation + emails the owner), **reject** (new third state) with a **rejected list**, and **delete** any unapproved org. Per the user's scope, reject/rejected-list/delete were added on top of the original approve-only item.

**Decisions (confirmed with the user):** (1) **additive** audit columns — keep `approved boolean` untouched and add `rejected_at/by` + `approved_at/by` + `rejection_reason`, so none of the existing `approved` reads change (state model: `approved=true`→Approved, `approved=false AND rejected_at IS NULL`→Pending, `rejected_at IS NOT NULL`→Rejected); (2) email owner on **approve only**; (3) **hard delete, guarded**.

**Migration (applied separately via Supabase MCP) — `add_org_approval_audit_columns`:** `ALTER TABLE organizations ADD COLUMN approved_at/approved_by/rejected_at/rejected_by (FKs → users(id) ON DELETE SET NULL)/rejection_reason`, all nullable (no backfill — existing approved orgs simply have `approved_at = NULL`), plus an optional partial `idx_organizations_rejected_at`. No RLS change — the admin routes use `supabaseAdmin` (service role), and the pending/rejected lists must NOT be reachable via member RLS.

**Config (env, not a migration):** new server-only `SUPPORT_ADMIN_EMAILS` (comma-separated, lowercased; seed `support@flme.co`). Never exposed to the client; never trusted from the request body.

**Backend — new admin-gated routes under [`apps/web/app/api/admin/`](apps/web/app/api/admin/)** (all `supabaseAdmin`, all follow the existing try/catch + `z.ZodError` + `[ROUTE]`-prefixed-log conventions; gate mirrors the `requireAdmin` helper in `organizations/[id]/members/route.ts`):

- **[`_lib.ts`](apps/web/app/api/admin/_lib.ts) — `requireSupportAdmin(clerkUserId)`:** resolves the caller's `users` row, checks the email against `SUPPORT_ADMIN_EMAILS` (403 if not matched), and **promotes a matched account to `users.role='admin'` on first hit** (non-fatal if the promotion write fails — the allowlist is the real boundary). Returns the discriminated `{ error, status } | { callerUserId, email }`.
- **`GET /api/admin/status`** → `{ isAdmin }` (always 200; runs the gate incl. the promotion side-effect). The **bootstrap** the client uses to decide whether to render the sections, without learning the allowlist.
- **`GET /api/admin/organizations?status=pending|rejected`** → all matching orgs (not membership-scoped) joined to owner `email`/`first_name`/`last_name`, oldest first (triage queue). `status` zod-validated, default `pending`.
- **`POST .../[id]/approve`** → idempotent (already-approved = no-op no-email); sets `approved=true` + audit cols and **clears any prior rejection** (`rejected_* = NULL`); fire-and-forget owner email (failure never blocks the response).
- **`POST .../[id]/reject`** → optional `reason` (zod, ≤500); sets `rejected_at/by` + reason, keeps `approved=false`; 409 if the org is already approved; idempotent re-reject. No email.
- **`DELETE .../[id]`** → **guarded hard delete**: 409 if approved, and 409 if the org has any events or orders (defensive — unapproved orgs can't create events, so both should be 0); FK `ON DELETE CASCADE` then removes the `organization_members` row(s). The org `PATCH` route still cannot accept `approved`/`rejected_*` from a client (unchanged) — approval state changes only through these admin routes.

**Email — [`org-notifications.ts`](apps/web/app/lib/email/org-notifications.ts) (new):** `sendOrgApprovalEmail` modeled exactly on `sendRsvpApprovalEmail` (dynamic `@getbrevo/brevo` import, `sender: { email, name: "FLAME Events" }`) using the shared `email-styles.ts` design helpers (`wrapEmailHtml`/`emailInfoCard`/`emailCtaButton`/`emailStatusBox` — no hand-rolled hex). Copy: org approved + "start creating events", CTA deep-links to `/organizer?org=<slug>`.

**Web UI — [`profile/page.tsx`](apps/web/app/profile/page.tsx) + [`profile/SupportAdminSection.tsx`](apps/web/app/profile/SupportAdminSection.tsx) (new) + [`lib/hooks/useAdminOrganizations.ts`](apps/web/app/lib/hooks/useAdminOrganizations.ts) (new):** below "Create new organizer", a `<SupportAdminSection />` that renders nothing for non-admins (`useIsSupportAdmin`) and otherwise shows two lists — **Pending approvals** (Approve / Reject / Delete) and **Rejected** (Approve-anyway / Delete with the reason shown). Reject reveals an inline reason textarea; Delete uses a confirm. Mutations invalidate both admin lists + `["organizations"]` so the owner's own inline pending row updates too. Org owners keep seeing their own pending org inline (unchanged) — the new list is the global support queue.

**Mobile UI (OTA) — [`(tabs)/profile.tsx`](apps/mobile/app/(tabs)/profile.tsx) + [`components/profile/SupportAdminSection.tsx`](apps/mobile/components/profile/SupportAdminSection.tsx) (new) + [`hooks/useAdminOrganizations.ts`](apps/mobile/hooks/useAdminOrganizations.ts) (new):** mirrors the web sections, calling the same admin web APIs via `lib/api.ts` (Bearer token). These reads are the documented exception to "mobile reads go direct to Supabase" — the lists are service-role-only and must not be reachable via member RLS. Reject uses an inline `TextInput`; Delete uses `Alert.alert`. Invalidates `["user-orgs"]` + the admin keys on success.

**List UX — collapsible sections + search (Jun 22, 2026).** All three profile org lists are now collapsible accordions: **My Organizers** defaults **open**, **Pending approvals** and **Rejected** default **closed**. Each list shows a search bar once it reaches **8+ orgs** (filters by org name, plus owner email/name for the admin lists). Reused existing patterns rather than new ones: mobile uses the shared [`PastItemsAccordion`](apps/mobile/components/shared/PastItemsAccordion.tsx) (extended with an optional `defaultExpanded` prop) + [`TicketSearchBar`](apps/mobile/components/dashboard/TicketSearchBar.tsx); web adds a small [`CollapsibleSection`](apps/web/app/components/CollapsibleSection.tsx) (mirrors the inline "Past events" accordion in `OrganizerPublicView`) + [`SearchInput`](apps/web/app/components/SearchInput.tsx) (extracted from the `OrganizerPublicView`/`EventsCatalog` pill-search pattern), both used by `profile/page.tsx` and `SupportAdminSection`.

**Validation.** Web `tsc` clean; mobile `tsc` byte-identical to the `main` baseline (additive files + import/render lines in `profile.tsx`, zero new errors); lib 179/179. No `any`. Edge cases handled: approve idempotent; reject blocked on approved orgs; delete guarded against events/orders + cannot delete approved; approving a rejected org clears the rejection. Note: an org owner's `users.role` stays `organizer` after their only org is deleted (harmless).

**QA round 2 (Jun 22, 2026).** Four follow-ups from device/web QA:

- **Approve now grants support team access.** On approval, the approving support admin is added to `organization_members` as `role='admin'` (idempotent `upsert` with `ignoreDuplicates` on the `(organization_id, user_id)` unique key — never demotes an existing owner). Non-fatal if it fails (the approval already committed). So every approved org has support as an admin team member, alongside `approved=true`.
- **Rejected orgs vanish from "My Organizers".** A rejected org was still showing inline as "Pending approval" in the owner's own list. Both sources now select `rejected_at` and drop rejected orgs: web [`api/organizations/route.ts`](apps/web/app/api/organizations/route.ts) (the `GET` map returns `null` when `rejected_at` is set) and mobile [`useUserOrgs.ts`](apps/mobile/hooks/useUserOrgs.ts). They simply disappear from My Organizers (still visible in the support **Rejected** queue).
- **Approve confirmation.** Approving now asks for confirmation, matching the RSVP approve dialog — web via a new reusable [`ConfirmModal`](apps/web/app/components/ConfirmModal.tsx) (also now used for Delete, replacing the native `window.confirm`); mobile via `Alert.alert` (matching the existing Delete confirm). Reject keeps its inline reason flow.
- **Action buttons right-aligned.** The Approve / Reject / Delete row (and the reject Cancel/Confirm row) are now `justify-end` on both platforms.

**PR review (CodeRabbit triage, Jun 22, 2026).** Verified each comment against the code (per `starter-pr-prompt.md`):

- **Fixed — design tokens over raw classes.** Replaced every raw `text-red-400` with the Flame `text-error` (#EA3370) token in both `SupportAdminSection` files (error messages *and* the danger-button text). Kept red on the destructive buttons (not white) so Delete stays visually distinct from the neutral ghost buttons — matching existing admin destructive patterns (`OrgEventDetailClient`).
- **Fixed — `ConfirmModal` CTA color.** Dropped the `bg-red-500` "danger" tone; the confirm button is now `bg-white-100 text-dark` for all actions, matching the RSVP confirmation modal it's modeled on. Removed the now-unused `tone` prop + its call-site usage.
- **Fixed — `requireSupportAdmin` user lookup.** `.single()` → `.maybeSingle()` so a not-yet-synced user returns `null` (reaching the intended 404) instead of erroring into a 500.
- **Skipped — add `"use client"` to `useAdminOrganizations.ts`.** The sibling `useOrganizations.ts` and 9 other web hooks omit it; the consuming components carry the client boundary. Adding it would break the established convention.
- **Deferred ([`EDGE_CASES_TODOS.MD`](docs/todos/EDGE_CASES_TODOS.MD)) — promoted `admin` role persists after allowlist removal.** Hypothetical (single permanent support account today; bypass still requires org membership); the suggested fix wrongly couples the general `admin` role to the support allowlist. Logged with a proper admin-offboarding fix for when it's needed.

**PR review round 2 (CodeRabbit triage, Jun 22, 2026).**

- **Fixed — account-switch cache leak (Bug 1).** Scoped the admin React Query keys to the signed-in user so a prior account's admin status / org lists can't surface from cache after a same-browser account switch (5-min `staleTime`): `["admin","status",userId]` and `["admin","organizations",status,userId]` on web ([`useAdminOrganizations.ts`](apps/web/app/lib/hooks/useAdminOrganizations.ts)) and the mobile list hook. `userId` is appended **last** so the prefix-based invalidation in `useAdminInvalidate` still matches. Mirrors the existing `useUserRole` keying.
- **Fixed — atomic approve/reject/delete.** Each write is now conditional on `.eq("approved", false)` with `.select()` and acts on the affected-row count: approve sends the email + adds the support member **only** on the real `false→true` transition (no duplicate emails under concurrent requests); reject and delete return **409** if the org was approved concurrently (no lost approval / no deleting an approved org). TOCTOU windows closed at the DB level.
- **Fixed — hidden-filter guard + empty state.** The org-name filter now only applies when the search input is actually shown (list at/above the 8-org threshold), so a list shrinking below the threshold with a stale query can't silently hide orgs. Added a "No matches." empty state to **My Organizers** on both platforms (the admin lists already had it).
- **Fixed — `SearchInput` accessible name.** Added `aria-label` (matches the existing `EventsCatalog` search convention).
- **Deferred ([`ACCESSIBILITY_TODOS.md`](docs/todos/ACCESSIBILITY_TODOS.md)) — `ConfirmModal` dialog semantics** (`role="dialog"`/`aria-modal`/`aria-labelledby`/Escape). Non-critical a11y; the codebase's existing modals (RSVP) lack these too — warrants a focused modal-a11y pass.
- **Skipped — localhost guard in `org-notifications.ts`.** `getBaseUrl` only returns localhost in dev; **every** email sender uses it identically with no guard. Singling out this one is inconsistent; it's an env/ops concern, not feature-specific.
- **Deferred ([`NITPICKS_TODOS.md`](docs/todos/NITPICKS_TODOS.md)) — split `AdminOrgRow`.** Single-use cohesive component; extracting 3–4 sub-components for line count alone is premature abstraction.

**PR review round 3 (CodeRabbit triage, Jun 22, 2026).**

- **Deferred ([`NITPICKS_TODOS.md`](docs/todos/NITPICKS_TODOS.md)) — structured error logs (`userId` + `action`) in the DELETE route.** Skipped for now: every admin/reference route logs `[ROUTE-prefix] message, { orgId, error }` — the prefix already conveys the action and `orgId` the resource; `userId` is logged nowhere in these routes. One-line addition would be inconsistent; threading it everywhere is a systemic logging-style pass, logged for a future focused observability sweep.

**QA round 4 (Jun 22, 2026) — "approval doesn't add support@flme.co" was an env artifact, not a bug.** QA on web showed the approved org didn't get `support@flme.co` as a team member, while mobile did. Root cause: the web `.env.local` was set to `SUPPORT_ADMIN_EMAILS=wol@artquitec.studio` (a throwaway test account), so the approver — and thus the member added — was `wol`, not `support@flme.co`. The approve route **intentionally adds the approving admin** (`gate.callerUserId`) as the org `admin` member, which in production (`SUPPORT_ADMIN_EMAILS=support@flme.co`) is exactly support@flme.co. A brief experiment to add *every* allowlisted account was tried and **reverted** — it was unnecessary (the env was the issue) and over-broad (it would add all support admins to every approved org). No code change retained; to verify locally, set `SUPPORT_ADMIN_EMAILS=support@flme.co` and approve while signed in as that account.
