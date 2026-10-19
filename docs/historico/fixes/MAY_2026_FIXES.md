# May 2026 Fixes

Continuing from `APRIL_2026_FIXES.md`. All entries follow the same format.

---

## Entries

### 1. Send Tickets parity (web ↔ mobile) and bank-transfer price display in My Tickets (May 6, 2026)

Three related discrepancies surfaced during a parity audit of the organizer "Send Tickets" surface and the user "My Tickets" surface. All three are addressed in one PR because they touch the same data paths and the same shared mapper.

#### 1.1 Mobile "Send Free Ticket" had no tier picker

**Symptom:** On mobile, organizers sending a complimentary ticket could not choose which tier to send. The handler auto-picked `tiers.find(t => t.quantity_sold < t.quantity_total)` (the first non-sold-out tier) with no UI surface for the choice. Web has had a tier select since the surface was built.

**Root cause:** When the Free flow was first ported (Phase 5B), the mobile UI was simplified to "tap Send next to a search result" instead of mirroring the web's Step 1 → Step 2 (find user → configure ticket) pattern. The bank-transfer tab on the same screen already had the correct pattern; only the Free tab diverged.

**Fix:**

- Refactored `apps/mobile/components/org-dashboard/OrgSendTicketsCard.tsx` Free tab to mirror the bank-transfer tab and the web flow: `UserSearchSection` → `SelectedUserBanner` → tier picker (`freeTierOptions`, tier-only, no stage breakdown — matches web) → quantity input (1–10) → "Send Free Ticket" button.
- Added `freeSelectedUser`, `freeSelectedTierIdx`, `freeQuantity` state. Existing `sendingUserIds` set still gates re-submission per user. Quantity (1–10) now matches the web's Free flow which always supported quantity > 1.
- Cleared all three pieces of state on success and on tab switch.

**Files:** `apps/mobile/components/org-dashboard/OrgSendTicketsCard.tsx`.

#### 1.2 Inconsistent free-ticket label across surfaces ("Free" vs. "Complementary") and a spelling fix

**Symptom:** Web's organizer Sent list showed "Complementary" next to a sent free ticket; mobile showed "Free". Web's user-side Ticket Detail also showed "Complementary" for promotional tickets, while the user My Tickets dashboard showed `$0.00` regardless. Across the codebase the word was misspelled — "complementary" means "things that go together", "complimentary" means "given without charge".

**Root cause:** Three independent code paths each rendered their own free-ticket label:

- `apps/web/app/organizer/event/[id]/OrgEventDetailClient.tsx` — hardcoded `"Complementary"`.
- `apps/mobile/components/org-dashboard/OrgSendTicketsCard.tsx` — hardcoded `"Free"`.
- `apps/web/app/account/ticket/[id]/page.tsx` and `apps/mobile/app/ticket/[id].tsx` — `getTicketPriceLabel` returned `"Complementary"` for `ticket.type === "promotional"`, but the dashboard mapper (`formatCostDisplay`) had no equivalent branch and fell through to `formatCentsAsPrice(0)`.

**Fix:**

- Aligned all surfaces to **"Complimentary"** (correct spelling, single source-of-truth string).
- Added a `ticket.type === "promotional"` branch to `formatCostDisplay` in both `apps/web/app/lib/utils/user-ticket-mappers.ts` and `apps/mobile/lib/user-ticket-mappers.ts` — returns `"Complimentary"` instead of falling through to `$0.00`. Now the dashboard, the detail page, and the organizer's Sent list all show the same word for the same ticket.

**Files:** `apps/web/app/organizer/event/[id]/OrgEventDetailClient.tsx`, `apps/mobile/components/org-dashboard/OrgSendTicketsCard.tsx`, `apps/web/app/account/ticket/[id]/page.tsx`, `apps/mobile/app/ticket/[id].tsx`, `apps/web/app/lib/utils/user-ticket-mappers.ts`, `apps/mobile/lib/user-ticket-mappers.ts`.

#### 1.3 Bank-transfer tickets displayed full price including platform fees

**Symptom:** Sent bank-transfer tickets in the user's My Tickets / ticket detail view rendered the full amount including the platform service fee (10% + $0.99). Bank transfers are organizer-issued, off-platform payments — the platform fee does not apply, and the user should see only the base ticket price (which is what they actually owe the organizer).

**Root cause:** The shared `formatCostDisplay` and `getTicketPriceLabel` paths displayed `order.total_cents` directly without branching on `payment_provider`. The `UserTicket.order` type already exposes `payment_provider` and `subtotal_cents`, and the API at `apps/web/app/api/user/tickets/route.ts` already selects both, but no caller used them. For new bank-transfer orders this happened to display correctly because `create_bank_transfer_order_atomic` stores `total_cents = subtotal_cents` (no fees baked in), but for legacy bank-transfer rows where fees were rolled into `total_cents` the display was wrong. The paths were also fragile: any future migration that conflated the fields would silently start showing fees.

**Fix:**

- Added a shared helper `getOrderDisplayCents(order)` in `packages/lib/src/pricing/calculations.ts` (exported from `@project-flame/lib`). For `payment_provider === "bank_transfer"` it returns the base price using a fallback chain: `subtotal_cents` → `unit_price_cents × quantity` → `extractBasePriceHistorical(total_cents, created_at)`. For all other payment providers (Stripe, etc.) it returns `total_cents` — what the user actually paid.
- Wired the helper into the per-order amount used by `formatCostDisplay` (web + mobile mappers) and into `getTicketPriceLabel` (web + mobile ticket detail).
- Industry-standard pattern: server-authoritative pricing. Display amounts come from the actual stored order record, not client-side fee math (matches Stripe Dashboard / StubHub conventions per `project-flame-master.mdc` Section 3).
- Added 7 unit tests in `packages/lib/__tests__/pricing.test.ts` covering: null order, stripe order (returns total), bank-transfer order (returns subtotal), missing-subtotal fallback to `unit_price × qty`, legacy fallback to `extractBasePriceHistorical`, free bank-transfer order, and orders with no `payment_provider`.

**Files:** `packages/lib/src/pricing/calculations.ts`, `packages/lib/src/pricing/index.ts`, `packages/lib/src/index.ts`, `packages/lib/__tests__/pricing.test.ts`, `apps/web/app/lib/utils/user-ticket-mappers.ts`, `apps/mobile/lib/user-ticket-mappers.ts`, `apps/web/app/account/ticket/[id]/page.tsx`, `apps/mobile/app/ticket/[id].tsx`.

#### 1.4 Mobile bank-transfer tier dropdown hardcoded `$` and decimals

**Symptom:** The bank-transfer tier dropdown labels were generated with `$${(price/100).toFixed(2)}`, ignoring the event's currency. Non-USD events (EUR, MXN, etc.) showed a misleading `$` prefix.

**Fix:** Replaced the manual format with `formatCentsAsPrice(price, currency)` from `@project-flame/lib` so the displayed currency matches the event's currency. Same change applied to the success-toast amount in `handleCreateBankTransfer`. Stripped the trailing `(price)` suffix from the option label before printing it in the toast so the amount isn't doubled.

**Files:** `apps/mobile/components/org-dashboard/OrgSendTicketsCard.tsx`.

#### 1.5 Mobile Sent list — accessibility label parity

**Symptom:** Mobile rendered the Sent list toggle with no `accessibilityLabel`, while web has explicit `aria-label="Sent complimentary tickets"` / `"Sent bank transfer tickets"` per mode.

**Fix:** Added `accessibilityRole="button"` and `accessibilityLabel` matching the web wording on both Sent list `<Pressable>` toggles in mobile `OrgSendTicketsCard.tsx`.

**Files:** `apps/mobile/components/org-dashboard/OrgSendTicketsCard.tsx`.

---

**Test plan:**

- `pnpm test` in `packages/lib` — 143 tests pass (was 136; added 7 for `getOrderDisplayCents`).
- Manual on web: organizer Send Tickets card → Free mode shows tier select + qty + "Send Free Ticket"; sent rows show "Complimentary"; user My Tickets card shows "Complimentary" for a promotional ticket; bank-transfer ticket shows base price (no 10% + $0.99); ticket detail page same.
- Manual on mobile: organizer Send Tickets card Free tab → search user → select → tier picker visible → qty 1–10 → Send works; sent row shows "Complimentary"; bank-transfer tier dropdown formats with the event currency; user My Tickets card shows "Complimentary" for a promotional ticket; bank-transfer ticket shows base price.

**Web Parity Gate evidence (per master rule §9.1):**

- Web source: `apps/web/app/organizer/event/[id]/OrgEventDetailClient.tsx` (Send Tickets card), `apps/web/app/lib/utils/user-ticket-mappers.ts` (My Tickets mapper), `apps/web/app/account/ticket/[id]/page.tsx` (Ticket Detail).
- Mobile parity: `apps/mobile/components/org-dashboard/OrgSendTicketsCard.tsx`, `apps/mobile/lib/user-ticket-mappers.ts`, `apps/mobile/app/ticket/[id].tsx`.
- API parity: no API changes — both already returned `payment_provider` and `subtotal_cents`. All shared logic now goes through `@project-flame/lib`.
- Calculation parity: confirmed both platforms call `getOrderDisplayCents` from `@project-flame/lib`; no client-side fee math; price display uses the helper's server-authoritative result.
- Edge cases verified: free promotional ticket, free RSVP, paid Stripe ticket (with and without discount), paid bank-transfer ticket (new format with `subtotal_cents`), legacy bank-transfer ticket (fees baked into `total_cents` — falls through to `extractBasePriceHistorical`), 100% promo Stripe ticket.

---

### 2. Org Sent list bank-transfer cost showed phantom-extracted base, and Sent / My Tickets lists weren't sorted (May 6, 2026)

Follow-up to #1.3. The shared `getOrderDisplayCents` helper landed in #1.3 was wired into the user-side My Tickets card and Ticket Detail surfaces, but the **organizer-side Sent list** rendered prices through a different code path that still called `extractBasePriceHistorical(order.total_cents, order.created_at)` directly. That helper assumes the input has fees rolled in and reverse-divides by `1.0805` (legacy 7% + IVA divisor). For modern bank-transfer orders that store `total_cents = subtotal_cents = unit_price × qty` with **zero fees baked in** (per `create_bank_transfer_order_atomic` constraints, see #1.3), this produced a phantom "base" that's actually `total_cents / 1.0805`.

**Symptom:** A $25 base ticket created via the modern bank-transfer flow (`total_cents = 2500`) rendered in the org Sent list as **"$23.14"** (`2500 / 1.0805 ≈ 2314`). A $20 ticket × 10 qty (`total_cents = 20000`) rendered as **"$185.10"** (`20000 / 1.0805 ≈ 18510`). All quantities of every modern bank-transfer order on the surface were off by the legacy markup ratio.

**Root cause:** Two locations called `extractBasePriceHistorical` directly on `order_total_cents` without consulting the migration date:

- `apps/web/app/organizer/event/[id]/OrgEventDetailClient.tsx` (the web Sent list).
- `apps/mobile/components/org-dashboard/OrgSendTicketsCard.tsx` (mobile `SentTicketRow`).

Both pre-date #1.3 and weren't migrated when `getOrderDisplayCents` was added.

**Fix:**

- Replaced both call sites with `getBasePriceFromTicket(order_total_cents, order.created_at)` from `@project-flame/lib`. That helper returns the price as-is when `created_at >= STRIPE_CONNECT_MIGRATION_DATE` (2026-01-15) — the date after which `unit_price_cents`/`total_cents` for bank transfers store the BASE price directly — and only falls back to `extractBasePriceHistorical` for genuinely pre-Connect rows where fees were rolled into `total_cents`.
- Verified against actual DB rows: a $25 modern bank-transfer order (`{total_cents: 2500, subtotal_cents: 2500, unit_price_cents: 2500, fees_cents: 0, quantity: 1, created_at: 2026-05-03}`) now renders correctly as "$25.00".

**Sort order — purchase date, newest first:**

The `bank_transfer_orders` and `promotional_tickets` arrays returned by `/api/organizer/data` have no explicit `.order()` clause on the Postgres subqueries, and the user's My Tickets dashboard groups in `separateTicketGroupsByDate` weren't sorted at all (insertion-order from `Object.entries` happened to match the API's `created_at DESC` for tickets, but RSVPs and the org-side lists didn't have that guarantee). User confirmed they want **purchase date, newest first** across the surfaces.

- `apps/web/app/organizer/event/[id]/OrgEventDetailClient.tsx`: extended the `filteredTickets` `useMemo` with a `sort((a, b) => new Date(b.created_at) - new Date(a.created_at))`.
- `apps/mobile/components/org-dashboard/OrgSendTicketsCard.tsx`: added `sortedPromotionalTickets` and `sortedBankTransferOrders` `useMemo` blocks with the same sort, wired through to the Sent list rendering and the count chips.
- `apps/web/app/lib/utils/user-ticket-mappers.ts` and `apps/mobile/lib/user-ticket-mappers.ts`: added `getGroupPurchaseTime(group)` (max of each ticket's `created_at`, falling back to `requested_at` for RSVP-only groups) and applied it as the comparator on both `currentGroups` and `pastGroups` inside `separateTicketGroupsByDate`. This guarantees the most recently purchased event-group surfaces at the top regardless of API ordering or `Object.entries` insertion order.

Industry-standard pattern: matches Eventbrite / Ticketmaster / Stripe Dashboard order-history conventions where the most recent activity is always at the top. See `project-flame-master.mdc` Section 3 — Industry Standards Benchmarking.

**Files:** `apps/web/app/organizer/event/[id]/OrgEventDetailClient.tsx`, `apps/mobile/components/org-dashboard/OrgSendTicketsCard.tsx`, `apps/web/app/lib/utils/user-ticket-mappers.ts`, `apps/mobile/lib/user-ticket-mappers.ts`.

**Test plan:**

- `pnpm --filter @project-flame/lib test` — 143 tests pass (no test changes needed; `getBasePriceFromTicket` is already covered by the existing `STRIPE_CONNECT_MIGRATION_DATE` test cases).
- Manual on web: organizer event detail → Send Tickets card → Bank Transfer tab → Sent panel. Confirm the $25 row created May 3 renders as "$25.00", not "$23.14". Confirm rows are ordered newest-first.
- Manual on mobile: same surface, same checks. Confirm the org dashboard Sent list (the screen the user reported in the bug) shows correct base prices and newest-first ordering for both Complimentary and Bank Transfer tabs.
- Manual on both platforms: My Tickets dashboard → confirm event-groups appear newest-purchase-first in both Upcoming and Past sections.

**Web Parity Gate evidence (per master rule §9.1):**

- Web source: `OrgEventDetailClient.tsx` Sent list (the canonical implementation now using `getBasePriceFromTicket`), `apps/web/app/lib/utils/user-ticket-mappers.ts` for the My Tickets sort.
- Mobile parity: `OrgSendTicketsCard.tsx` `SentTicketRow` and the two memoized sorted lists, `apps/mobile/lib/user-ticket-mappers.ts` mirroring the same `getGroupPurchaseTime` comparator.
- API parity: no API changes — `created_at` was already on every relevant payload.
- Calculation parity: both platforms call `getBasePriceFromTicket` from `@project-flame/lib`; no client-side fee math; date-based legacy detection happens inside the shared helper.
- Edge cases verified: modern bank-transfer order (correctly returns `total_cents` as-is), legacy bank-transfer order (correctly delegates to `extractBasePriceHistorical`), RSVP-only group (`requested_at` fallback in `getGroupPurchaseTime`), tickets with missing/invalid `created_at` (skipped, group sinks to bottom rather than crashing).

---

#### Pattern note — when to use which pricing helper (lessons from #1.3 and #2)

This bug class — "the displayed price doesn't match what the customer actually paid / what the organizer actually charged" — has surfaced repeatedly. The root cause is always the same: **someone called `extractBasePriceHistorical` (or hand-rolled fee math) on data that already has the right shape, or vice versa.** Before adding new pricing UI, decide which of the four shared helpers in `@project-flame/lib` you need. Picking wrong silently corrupts every number on the screen.

**Decision tree — match your data shape, then pick the helper:**

| You have... | Helper | Why |
| --- | --- | --- |
| An `orders` row with `payment_provider` field, want the user-facing per-order amount | `getOrderDisplayCents(order)` | Branches on `payment_provider`: bank-transfer → base (subtotal/unit×qty/historical extract); Stripe → `total_cents` (what the user paid). Use this for **My Tickets / Ticket Detail**. |
| A flat amount (`order.total_cents`, `unit_price_cents`, RSVP `total_amount_cents`) plus its `created_at`, want the **organizer's** base price | `getBasePriceFromTicket(amount, createdAt, fee_percentage?)` | Returns the amount as-is for rows created on/after `STRIPE_CONNECT_MIGRATION_DATE` (2026-01-15) — modern rows already store base. Falls through to `extractBasePriceHistorical` for genuinely pre-Connect rows. Use this for **org Sent lists, RSVP management, anywhere the organizer's revenue per ticket is needed**. |
| An `orders` row from the organizer's revenue dashboard (with discounts, varied schemas) | `calculateOrganizerBasePrice(order)` | Handles `base_price_cents` fast-path, then discount-proportion math, then date-aware extraction. Use this for **revenue aggregation** (org dashboard stats, exports). |
| A genuinely fee-inclusive total from a known pre-Connect / Datafast era | `extractBasePriceHistorical(total, createdAt, fee_percentage?)` | Reverse-divides by `1.0805` (legacy 7% + IVA) or the explicit `fee_percentage`. **Almost never the right answer for new code** — you nearly always want one of the helpers above instead. |

**Rule:** if you're typing `extractBasePriceHistorical` into a new feature, stop. The post-Stripe-Connect data shape (Jan 15, 2026 onward) already stores base price. Calling `extractBasePriceHistorical` on a modern row invents a phantom markup that was never there — exactly the $25 → $23.14 bug from this entry. Use `getBasePriceFromTicket` (or `getOrderDisplayCents` for user-facing per-order display) — both have the migration-date guard built in.

**Why the migration date matters:** `STRIPE_CONNECT_MIGRATION_DATE = 2026-01-15` (`packages/lib/src/pricing/constants.ts`). Before that date Project Flame stored `total_cents` with fees rolled in (Datafast era — fee was 7% + 15% IVA). After that date, all new rows store `total_cents` as the base subtotal and fees are tracked separately on Stripe / off-platform for bank transfers. Any helper that touches historical pricing must consult this date.

**Related prior fixes:** This pattern keeps recurring in different surfaces — when you find a new instance, fix it the same way and link back here:

- `APRIL_2026_FIXES.md #441` — `ticket-tiers/route.ts` was passing the legacy 7% to `create_ticket_tier_with_stages` instead of the active 10%. Same family of bug: legacy constant used in modern code.
- `APRIL_2026_FIXES.md #151` — Mobile checkout sheet hardcoded `DEFAULT_PLATFORM_FEE_PERCENT` instead of reading `events.markup_percent` per-event. Resulted in silent overcharge whenever an event used custom markup. Master rule §5 now mandates "clients must mirror the same per-event markup".
- `MARCH_2026_FIXES.md #298` — Inline `extractBasePriceHistorical` + discount-proportion loop in `useOrgDashboardStats` replaced with shared `calculateOrganizerBasePrice`. Same class: hand-rolled date-blind extraction.
- `FEB_2026_FIXES.md #2173` — `useRsvpManagement.getDisplayPrice` reimplemented unit pricing from scratch; ported to use shared `getBasePriceFromTicket × requested_quantity`.

**If you find a fifth instance of this bug pattern**, log it as a new sub-entry referencing this note rather than starting fresh. Then check whether the helper itself needs to grow a new branch — the helpers in `@project-flame/lib` are the single source of truth and should absorb new edge cases instead of being routed around.

---

#### 2.1 Review-loop fix — `getOrderDisplayCents` itself was calling `extractBasePriceHistorical` directly

**Symptom:** PR review on entry #2 surfaced that the very helper we built to enforce the Pattern note (`getOrderDisplayCents` in `packages/lib/src/pricing/calculations.ts`) had a sparse-bank-transfer fallback branch that called `extractBasePriceHistorical(order.total_cents, order.created_at)` directly — exactly the anti-pattern the note warned against. Reachable scenario: a bank-transfer order with `payment_provider: "bank_transfer"`, `total_cents` populated, but `subtotal_cents` and `unit_price_cents` both missing AND `created_at` post-migration. For such a row the helper would reverse-divide by 1.0805 and produce a phantom-extracted base, recreating the original bug class inside the very abstraction designed to prevent it.

**Root cause:** Self-eating dogfood — the Pattern note was added to the changelog and the master mdc rule, but the helper itself was written before the note and not back-checked against its own guidance.

**Fix:**

- Replaced the direct `extractBasePriceHistorical` call inside `getOrderDisplayCents` with `getBasePriceFromTicket(order.total_cents, order.created_at)` so the migration-date guard is now centralized inside the canonical helper rather than duplicated at the call site.
- Wrapped in try/catch to preserve the existing safety: `getBasePriceFromTicket` throws on invalid date strings, whereas `extractBasePriceHistorical` did not — falling through to `total_cents` default keeps behavior identical for malformed dates.
- Added regression test `"returns total_cents as-is for post-migration sparse bank-transfer rows (no phantom markup extraction)"` in `packages/lib/__tests__/pricing.test.ts` — asserts a `{total_cents: 10805, created_at: "2026-06-01"}` order returns `10805` (not `10000` from the legacy 1.0805 divide). 144 tests pass.
- Updated the JSDoc on `getOrderDisplayCents` to point at this entry's Pattern note, so the helper's own documentation closes the loop.

**Deferred:** Reviewer also flagged hardcoded `"#041C2B"` / `"#F9FBFE"` color literals in the new mobile Send Tickets tier picker — logged in `docs/historico/todos/NITPICKS_TODOS.md` under "May 2026 PR Review". Pure design-token alignment, no behavior change, batch with a directory-wide sweep when other token cleanups are done.

**Skipped (with reason):** Reviewer suggested treating mixed promo+paid groups in `formatCostDisplay` by checking `group.every(t => t.type === "promotional")` instead of `ticket.type === "promotional"` on `group[0]`. Verified not reachable: the `/api/user/tickets` route concatenates `[...enrichedTickets, ...formattedPromotionalTickets, ...rsvps]` so paid tickets always precede promos in input order; in any mixed group `group[0]` is always a paid ticket and falls into the paid-totalCost branch. The `"promotional"` branch is only reached when the entire group is promo — which is the desired "Complimentary" label case. The reviewer's suggested change does not alter observable behavior under current code.

**Files:** `packages/lib/src/pricing/calculations.ts`, `packages/lib/__tests__/pricing.test.ts`, `docs/historico/todos/NITPICKS_TODOS.md`.

#### 2.2 Second review pass — defensive-code coverage

Same PR, second auto-reviewer round:

- **Fixed:** Added regression test `"does not throw on malformed created_at — falls through to total_cents (locks in defensive try/catch)"` in `packages/lib/__tests__/pricing.test.ts`. Asserts `getOrderDisplayCents({total_cents: 10805, payment_provider: "bank_transfer", created_at: "invalid-date"})` does not throw and returns `10805`. Locks in the try/catch added in #2.1 against future refactors that might drop the defensive wrapper. 145 tests pass.
- **Skipped (with reason):** Reviewer flagged MD037 (spaces inside emphasis markers) on line 97 of this file. Hex-dumped the line — `**Symptom:**` and `**"$23.14"**` both have zero internal whitespace. No `.markdownlint*` config exists in the repo to even enforce the rule. The finding is factually wrong; no change.

**Files:** `packages/lib/__tests__/pricing.test.ts`.

---

### 3. Stage 3 Web Parity — PR review round 2 (May 11, 2026)

Second round of PR-review fixes on the Stage 3 web-parity PR (Personal Profile / Organizer Admin / Public Organizer / Navbar restructure).

**Fixed:**
- **`apps/web/app/components/organizer/OrganizerAdminView.tsx`** — Event row date/time was using `new Date(starts_at).toLocaleDateString/toLocaleTimeString` which formats in the viewer's local timezone. Cross-tz events (e.g. an Ecuador event viewed from LA) could shift the displayed day. Switched to `formatEventDate(starts_at, event.timezone)` + `formatEventTime(starts_at, event.timezone ?? undefined)` from `@project-flame/lib` so the formatted date/time always reflect the event's own timezone. This also matches mobile (which already uses these helpers) and removes a duplicate formatting path per the "shared lib, no reimplementation" rule.
- **`apps/web/app/components/organizer/OrganizerAdminView.tsx`** — Removed dead `loading={!events}` prop on `RevenueCard`. `events: OrganizerEvent[]` is a required array prop so `!events` was always `false` — the skeleton branch was unreachable. SSR also guarantees `events` is defined on first render. Existing `revenueByCurrency.size === 0 → "—"` path covers the empty-data case.
- **`apps/web/app/components/organizer/OrganizerPublicView.tsx`** — Replaced `style={{ backgroundColor: "rgba(0, 0, 0, 0.55)" }}` on the event-card date overlay with arbitrary Tailwind class `bg-[rgba(0,0,0,0.55)]` per the "no inline `style={}`" web rule.
- **`apps/web/app/components/organizer/OrganizerPublicView.tsx`** — `handleShare` was hardcoding `https://flme.co/organizer/${org.slug}`. Now builds the share URL from `process.env.NEXT_PUBLIC_BASE_URL` with `window.location.origin` fallback (client-only component so `window` is always available), `https://flme.co` as final fallback. Same string when the env var is set in prod; correct when running in preview / dev.
- **`apps/web/app/components/organizer/StripeStatusPill.tsx`** — Loading gate was `(isLoading || !status)` which masked fetch errors as a perpetual skeleton. Split into `isLoading → Skeleton` and `!status → return null` (post-load with no data = error or unauthenticated; hide rather than show a misleading "Not Connected" state). Also replaced two `style={{ backgroundColor: "rgba(...)" }}` props with `bg-[rgba(...)]` arbitrary Tailwind classes.
- **`apps/web/app/profile/page.tsx`** — Retry button was calling `router.refresh()` which re-runs the whole RSC tree but doesn't always trigger TanStack Query refetches. Now calls `refetchProfile()` + `refetchOrgs()` directly (both already returned from their respective hooks; we just weren't destructuring them). Dropped now-unused `useRouter` import.
- **`apps/web/app/lib/hooks/useOrganizations.ts`** — `UserOrganization.role` was typed as plain `string`. Tightened to `OrgMemberRole` (the canonical union `"owner" | "admin" | "organizer" | "viewer"` already exported from `@project-flame/lib` and used by `MemberRoleContext`). Consumers now get autocomplete + exhaustiveness on role checks.
- **`apps/web/app/lib/hooks/useStripeConnectStatus.ts`** — Dropped the `orgId!` non-null assertion in favor of an explicit runtime check (`if (!orgId) throw ...`). Wrapped fetch + zod parse in try/catch and rethrew with contextual info (orgId, HTTP status, original error via `cause`) so triage logs surface enough context to reproduce.
- **`apps/web/app/components/organizer/DashboardView.tsx`** — Deleted. Replaced by `OrganizerAdminView` in the original Stage 3 PR; verified zero remaining imports.
- **`apps/web/app/components/PaymentAccountBanner.tsx`** — Deleted. Its only consumer was `DashboardView` (above); replaced by `StripeStatusPill` in the new admin layout.

**Skipped (with reason):**
- Reviewer asked to swap the two `<img src="/flame-logo-white.svg">` instances in `Navbar.tsx` for `next/image`. Next.js doesn't optimize SVGs by default and the docs explicitly recommend `unoptimized` for SVG — converting buys zero perf and adds an `unoptimized` workaround. Defensible SVG-asset exception to the next/image rule; deferred to a single codebase-wide SVG sweep.
- Reviewer asked to replace `<Suspense fallback={null}>` in `UserDashboard.tsx` with a skeleton. The suspension is a single render boundary because of `useSearchParams` — not a perceptible flash. Skeleton here is ornamentation.
- Reviewer asked to add a comment / `eslint-disable-next-line` to the URL→state sync `useEffect` in `OrganizerDashboard.tsx`. Pre-existing intentional one-way sync; pre-existing PR scope.

**Deferred to `docs/historico/todos/NITPICKS_TODOS.md`:**
- Three pre-existing `(e: any)` / `(a: any, b: any)` callbacks in `OrganizerDashboard.tsx` (lines 164, 173, 488). Needs a dedicated typing PR for this file.
- `STATUS_COLORS` hex literals in `UserDashboard.tsx` — the suggested `flameColors` export doesn't yet exist in `@project-flame/lib`.
- Duplicated inline `PastEventsAccordion` across `OrganizerAdminView` / `OrganizerPublicView` — 2 usages, markup also differs (`gap-2` vs `gap-3`), not enough to abstract per the project's extraction threshold.

**Files:**
- `apps/web/app/components/organizer/OrganizerAdminView.tsx`
- `apps/web/app/components/organizer/OrganizerPublicView.tsx`
- `apps/web/app/components/organizer/StripeStatusPill.tsx`
- `apps/web/app/profile/page.tsx`
- `apps/web/app/lib/hooks/useOrganizations.ts`
- `apps/web/app/lib/hooks/useStripeConnectStatus.ts`
- `apps/web/app/components/organizer/DashboardView.tsx` (deleted)
- `apps/web/app/components/PaymentAccountBanner.tsx` (deleted)
- `docs/historico/todos/NITPICKS_TODOS.md`

---

### 4. Stage 3 Web Parity — final round (May 11, 2026)

Closing-out fixes that landed after the round-3 entry. Stage 3 is now complete and marked landed in the plan file.

**Org settings — owner/admin can edit org details on web**
- New `PATCH /api/organizations/[id]` endpoint (`apps/web/app/api/organizations/[id]/route.ts`). Updates `instagram_handle`, `city`, `description`. Auth + owner/admin role gate + zod validation. Wraps `req.json()` in try/catch so malformed bodies return 400 instead of 500. Both supabase lookups now check `error` before treating `data` as missing (was silently mis-attributing transient DB errors as 404/403).
- `OrgSettingsClient.tsx` Organization tab is editable for owner/admin: `EditableField` (Instagram, City) + `EditableTextArea` (Description with 500-char counter) + Save button. Non-admin members get read-only `SettingsField` fallback. Logo upload + delete controls also gated on `canEditOrg` — viewer/organizer members see a static logo. `useId()` + `htmlFor` on label/input pairs for a11y. "Saved" badge clears on subsequent edits (`wrapFieldSetter` helper). Save catch block now logs structured context: `{ action, orgId, orgSlug, userId, error, stack }`.

**Team page — full mobile parity, replacing the "coming soon" stub**
- Three new endpoints: `GET/POST /api/organizations/[id]/members`, `PATCH /api/organizations/[id]/members/[memberId]`, `GET/PUT /api/organizations/[id]/event-assignments`. All wrap `req.json()` in try/catch and zod-validate the body.
- `GET /api/organizations/[id]/members` deliberately bypasses the `get_org_members_with_profiles` RPC. The RPC's gate (`WHERE p_org_id IN (SELECT get_admin_organizations())`) resolves the caller via `auth.jwt() ->> 'sub'` — `supabaseAdmin` uses the service role with no JWT, so the gate returned zero rows even for legitimate admins. The route now does a direct join on `organization_members ↔ users` selecting only the same safe columns (`email`, `first_name`, `last_name`) the RPC returned. Security parity preserved via `requireAdmin()` guard above the query.
- Assignable roles narrowed to `["admin", "organizer"]` on POST and PATCH (matches mobile `AssignableRole = "admin" | "organizer"`). Viewer dropped from the picker; existing viewer-role rows still render with correct label.
- `OrganizerTeamView.tsx` (new) — member list with role badges, kebab menu (Change Role / Assign Events for organizers / Remove), inline `AddMemberModal` (email search via existing `/api/organizer/search-users`), `EditRoleModal`, `AssignEventsModal`. Skeletons during load. Modals share a `ModalShell` wrapper.
- `organizer/team/page.tsx` — server-resolves org by slug **or** UUID. Fixed UUID-cast bug where `.or("slug.eq.X,id.eq.X")` was throwing when `X` was a slug (Postgres tried casting to uuid). Now branches on a UUID regex.

**Middleware — public org page no longer behind sign-in**
- `apps/web/middleware.ts` protected matcher was `/organizer(.*)` which caught the public `/organizer/[slug]` page too. Narrowed to explicit admin subpaths (`/organizer`, `/organizer/settings(.*)`, `/organizer/event/(.*)`, `/organizer/rsvps/(.*)`, `/organizer/team(.*)`). Anonymous users can now view organization profiles.

**Discover chip → public org page; dead `/events?org=` filter cleaned up**
- `ExploreOrganizers.tsx` chip now links to `/organizer/<slug>` instead of `/events?org=<slug>` (mobile parity — discover chip is the single entry point to the public org page for now).
- Event detail "By X" badge intentionally non-clickable; reverted the earlier hyperlink.
- `events/page.tsx` no longer reads `searchParams.org`; `EventsCatalog.tsx` dropped the `initialOrganizer` prop. The in-page organizer filter pills inside `EventsCatalog` still work for direct catalog filtering.

**Organizer-role event scoping — fixed regression on both platforms**
- New helper `canManageAssignedEvents(role)` in `packages/lib/src/utils/permissions.ts` — true for `owner | admin | organizer`. Gates the RSVPs tile.
- **Mobile** `organizer-admin.tsx`: imported `useAssignedEvents`, computed `assignedEventIds` (tri-state: `null` paused, `undefined` full-access, `string[]` filter set), filtered `orgEvents` through it before `separateEventsByDate`. Stats block now gated on `canViewAllEvents(memberRole)` so organizers don't see org-wide revenue. RSVPs tile gate switched from `canViewAllEvents` → `canManageAssignedEvents`.
- **Web** `OrganizerAdminView.tsx` + `RsvpsView.tsx`: same pattern via a new `?mine=true` query param on `GET /api/organizations/[id]/event-assignments` (filters server-side by `caller.user_id`). Stats hidden for organizer. Manage pill also gated on `canManagePayouts` (was unconditional; matches mobile).
- Bug reported as: "organizer sees all org events instead of just assigned; only sees QR Scanner tile." Mobile worked correctly in v1.0.12 before the dashboard rework merged the simplified dashboard into Screen 3 — the role-conditional behavior got lost during the merge.

**Dark search bars + outline icons sweep on web**
- `UserDashboard.tsx`, `EventsHero.tsx`, `EventsCatalog.tsx`, `RsvpsView.tsx` — all search inputs normalized to `bg-white-5 border border-white-10 rounded-pill` with `text-white-100` placeholder + `text-white-50` icons. White-filled `bg-[#F6F6F6]` containers gone.
- `StripeStatusPill.tsx` — filled `IoCheckmarkCircle` + `IoTime` swapped for outline variants. Two inline `style={{ backgroundColor }}` props replaced with tailwind arbitrary `bg-[rgba(...)]` classes.

**Cog moved right of UserButton avatar in Navbar** — per user preference.

**Skipped (with reason):**
- Reviewer asked to restore `searchParams.org` to `/events/page.tsx`. Contradicts the user's explicit prior instruction ("should we remove `/events?org=XXX` public facing? as it is dead code?" — answered yes).
- Reviewer asked to add a skeleton fallback to the `Suspense` boundary around `UserDashboardInner`. Single render boundary, not a perceptible flash.
- Reviewer asked to add comment/eslint-disable to the URL→state sync `useEffect` in `OrganizerDashboard.tsx`. Pre-existing intentional one-way sync.
- Reviewer asked to swap `<img src="/flame-logo-white.svg">` in `Navbar.tsx` for `next/image`. Next.js doesn't optimize SVGs by default; conversion would add `unoptimized` for zero benefit.

**Deferred to `docs/historico/todos/NITPICKS_TODOS.md`:**
- Atomic DELETE+INSERT for event-assignments via shared Postgres RPC (cross-platform — mobile has same pattern).
- Surface event-assignment cleanup errors as warnings (no client surface for them today).
- Replace `data as unknown as Row[]` cast in members GET with generated Supabase types.
- Extract `requireAdmin` / `requireOrgMember` into shared `app/lib/orgAuth.ts` (5 consumers now).
- Duplicated inline `PastEventsAccordion` between OrganizerAdminView + OrganizerPublicView.
- Hardcoded role hex colors → design tokens once `flameColors` lib export ships.
- Split `ProfileContent` into smaller subcomponents (single consumer; mobile keeps it monolithic).
- Pre-existing `(e: any)` callbacks in `OrganizerDashboard.tsx` lines 164/173/488.
- `STATUS_COLORS` hex literals in `UserDashboard.tsx` (pre-existing).
- URL→state sync `useEffect` exhaustive-deps in OrganizerDashboard (pre-existing intentional).
- SVG `<img>` in Navbar.

**Files (new):**
- `apps/web/app/api/organizations/[id]/route.ts`
- `apps/web/app/api/organizations/[id]/members/route.ts`
- `apps/web/app/api/organizations/[id]/members/[memberId]/route.ts`
- `apps/web/app/api/organizations/[id]/event-assignments/route.ts`
- `apps/web/app/components/organizer/OrganizerTeamView.tsx`
- `packages/lib/src/utils/permissions.ts` — added `canManageAssignedEvents`

**Files (modified):**
- `apps/web/middleware.ts`
- `apps/web/app/components/Navbar.tsx`
- `apps/web/app/components/UserDashboard.tsx`
- `apps/web/app/components/EventDetail.tsx`
- `apps/web/app/components/EventsCatalog.tsx`
- `apps/web/app/components/ExploreOrganizers.tsx`
- `apps/web/app/components/home/EventsHero.tsx`
- `apps/web/app/components/organizer/OrganizerAdminView.tsx`
- `apps/web/app/components/organizer/OrganizerPublicView.tsx`
- `apps/web/app/components/organizer/RsvpsView.tsx`
- `apps/web/app/components/organizer/StripeStatusPill.tsx`
- `apps/web/app/events/page.tsx`
- `apps/web/app/organizer/settings/OrgSettingsClient.tsx`
- `apps/web/app/organizer/team/page.tsx`
- `apps/mobile/app/organizer-admin.tsx`
- `packages/lib/src/index.ts`, `packages/lib/src/utils/index.ts` — re-export the new helper

**Validation:**
- `tsc --noEmit` clean on `apps/web`, `apps/mobile` organizer-admin, and `packages/lib`.
- `pnpm --filter @project-flame/web build` clean — all Stage 3 routes (`/profile`, `/organizer/[slug]`, `/organizer/team`, `/organizer/settings`, new API endpoints) built without SSR errors.

---

### 5. Stage 3 Web Parity — pre-merge polish (May 11, 2026)

Two small follow-ups after entry #4 from a final PR review pass.

**Fixed:**
- **`apps/web/app/components/organizer/RsvpsView.tsx` — role-sync gate now verifies org match.** The gate was `!roleLoading && Boolean(selectedOrgId)`, which only confirmed *some* org was selected. `OrganizerAdminView` uses the stricter `selectedOrgId === organization.id && !roleLoading`. Without the org-match check, switching from Org A's RSVPs view to Org B's would briefly let the assignments query fire with Org B's URL but Org A's cached role + key, applying the wrong scope for a render or two. `RsvpsView` now takes a `currentOrgId` prop (passed as `organization.id` from `OrganizerDashboard.tsx`) and gates on the same dual-signal pattern. The TanStack Query key + fetch URL both bind to `currentOrgId`, not the context's `selectedOrgId`.
- **`apps/web/app/components/organizer/OrganizerAdminView.tsx` — stats now derive from the scoped events list.** `revenueByCurrency` and `totalEvents` were iterating over the unscoped `events` prop while the events list was filtered via `assignedEventIds`. Stats are gated by `isFullEventAccess` so organizer-role members never see them today, but the math diverged from the list. Introduced a single `scopedEvents` memo that handles all three `assignedEventIds` states (`null` = paused, `undefined` = full access, `string[]` = filter set); `separateEventsByDate`, `revenueByCurrency`, and `totalEvents` all flow from it. Defense-in-depth against future gate changes or new consumers.

**Deferred (already logged in `docs/historico/todos/NITPICKS_TODOS.md` from prior rounds — not duplicating):**
- Reviewer re-flagged DELETE+INSERT atomicity on event-assignments PUT — already in NITPICKS as "Atomic DELETE+INSERT via Postgres RPC" (cross-platform fix, mobile has the same pattern).
- Reviewer re-flagged duplicated `PastEventsAccordion` between OrganizerAdminView + OrganizerPublicView — already in NITPICKS as "Duplicated PastEventsAccordion" (2 consumers with divergent markup, below abstraction threshold).

**Files:**
- `apps/web/app/components/organizer/RsvpsView.tsx`
- `apps/web/app/components/OrganizerDashboard.tsx` (passes `currentOrgId={organization.id}`)
- `apps/web/app/components/organizer/OrganizerAdminView.tsx`

**Validation:** `tsc --noEmit` clean.

---

### 6. App version gating — hard block + soft banner + OTA restart prompt (May 11, 2026)

Added the banking-app version-gating layer Flame needed before we can confidently ship breaking changes (API shape changes, paid-tier changes, security fixes) in a new binary. Three gates layered on top of `expo-updates`:

1. **Hard block** (`<ForceUpdateScreen />`, non-dismissible) when `Application.nativeApplicationVersion < minimum_version` from remote config. Single CTA opens the App Store via `itms-apps://`.
2. **Soft banner** (`<UpdateAvailableBanner />`, dismissible per-version) when `minimum_version <= native_version < latest_version`. Persisted dismissal in SecureStore keyed by `latest_version`.
3. **OTA restart prompt** (`<OtaRestartSheet />`) layered on top of (1) and (2) whenever `expo-updates` has silently downloaded a new bundle. "Later" suppresses for 24h keyed by `Updates.updateId` so a second OTA within 24h re-prompts.

**Why this was the right shape:**

- **Remote source-of-truth in Supabase** (`app_config` table, single row keyed by `'mobile'`, JSONB per-platform). Flipping the gate is a one-line `UPDATE` via SQL/MCP — no web redeploy required. Public-read RLS, service-role writes only.
- **Public unauthenticated endpoint** at `/api/mobile/app-config` so the gate works for signed-out users (registration flow, password reset, etc.) and runs before Clerk has hydrated.
- **`Cache-Control: public, s-maxage=30, stale-while-revalidate=120`** caps incident recovery at ~30s. Lower than the typical 60s after second-pass review specifically so an accidental misconfig flip + immediate rollback is invisible to ~all users.
- **Fail-open everywhere** — DB error, network error, malformed response, missing row, unparseable semver: all return `min = latest = "0.0.0"` which never gates. Safer to leave the app open than to brick everyone because of a 5xx.
- **`isProductionBuild` short-circuit** — gate is OFF in dev/preview channels by default (TestFlight testers never get force-updated mid-test).

**Tier-1 hardening baked in (from second-pass plan review):**

- **`ForceUpdateScreen` accessibility**: `accessibilityRole="button"` + `accessibilityLabel="Update Flame on the App Store"` + `accessibilityHint`, `accessibilityState={{ disabled, busy }}`, `accessibilityViewIsModal` on iOS to trap VoiceOver focus, fixed 56pt CTA hit target (well above 44pt iOS minimum).
- **OTA suppression by `updateId`, not by timestamp**. Previously the natural pattern was "remember user tapped Later for 24h" — but that means a second OTA within 24h is silently swallowed. Now stored as `{ updateId, suppressedAt }`: a new updateId defeats suppression immediately.
- **1-hour cache TTL with safe-default fallback (the offline-lockout fix).** Cached config payloads carry `fetchedAt`. On read, if `now - fetchedAt > 1h` AND current network fetch fails, return safe-default instead of the stale value. Bounds the offline-lockout window — without this, a rolled-back misconfig could still gate offline devices indefinitely. Trade-off documented: a user can briefly extend their grace period by going offline for <1h, but cannot bypass the next online launch.
- **Server-side sanity guard.** API clamps `minimum_version` down to `latest_version` if a typo would otherwise lock out every user. Clamping is logged structured-style (`[app-config] minimum_version > latest_version`) so we see it in Vercel logs.

**Tier-2 hardening:**

- **Soft-banner dismissal persists per-`latest_version`** in SecureStore. Once the operator bumps `latest_version`, the banner reappears even on devices that previously dismissed.

**Tier-3 niceties:**

- **`store_url` uses `itms-apps://` scheme** for instant native handoff (avoids the Safari → App Store hop). Linking falls back to `https://` if the scheme can't be opened.
- **`minimum_os_version` field added to schema** (nullable, unread by client today). Reserved for future "your iOS is too old" handling — avoids a schema migration when we need it.
- **`semver.coerce` warning** in `version-check.ts` logs malformed input. We control `app.json` versions so coercion firing in production means a typo we want to see.

**Local testing harness — three `__DEV__`-gated env flags, zero production cost:**

- `EXPO_PUBLIC_DEV_VERSION_OVERRIDE=1.0.11` overrides the native version (no rebuild needed).
- `EXPO_PUBLIC_DEV_FORCE_GATE=1` force-enables the gate in dev (default-off).
- `EXPO_PUBLIC_DEV_FORCE_OTA_PROMPT=1` (+ optional `EXPO_PUBLIC_DEV_FAKE_UPDATE_ID`) surfaces the OTA sheet with a fake updateId. Lets us verify the suppression-by-updateId behavior locally without two real OTA publishes.

Full 10-scenario test matrix and operator runbook in `docs/guias/EAS_OTA_UPDATES.md` "Version Gating" section.

**Deferred** to `docs/historico/todos/VERSION_GATE_TODOS.md`: analytics event taxonomy, grace-period / countdown state, % staged rollout of the gate flip itself, deep-link preservation across the hard block, admin UI (SQL is sufficient at current scale), i18n, dedicated `/revalidate` endpoint (the 30s `s-maxage` makes it unnecessary today), client-side `minimum_os_version` enforcement (schema-ready).

**Files:**

- `supabase/migrations/20260512021503_add_app_config_for_version_gating.sql` (new)
- `apps/web/app/api/mobile/app-config/route.ts` (new)
- `apps/web/package.json` — `semver`, `@types/semver`
- `apps/mobile/lib/version-check.ts` (new) — semver compare, fetch with TTL'd SecureStore cache, safe defaults, dev override
- `apps/mobile/hooks/useAppVersionGate.ts` (new) — TanStack Query + AppState refetch + `isProductionBuild` short-circuit, soft-banner dismissal hook
- `apps/mobile/hooks/useOtaUpdatePrompt.ts` (new) — `expo-updates` check/fetch flow + updateId-keyed suppression
- `apps/mobile/components/system/ForceUpdateScreen.tsx`, `UpdateAvailableBanner.tsx`, `OtaRestartSheet.tsx`, `VersionGate.tsx` (new)
- `apps/mobile/app/_layout.tsx` — wrap `AppShell` in `<VersionGate>` (above ClerkProvider, inside QueryClient + SafeAreaProvider)
- `apps/mobile/metro.config.js` — `extraNodeModules` entries for `expo-application` + `semver`
- `apps/mobile/package.json` — `expo-application@~7.0.8` (SDK 54 bundled version), `semver`, `@types/semver`
- `docs/guias/EAS_OTA_UPDATES.md` — new "Version Gating" section
- `docs/historico/todos/VERSION_GATE_TODOS.md` (new) — deferred items

**Operator action (completed):** The real App Store ID `6761443120` is wired into both the migration seed and the live `app_config.config.ios.store_url` row (`itms-apps://apps.apple.com/app/flame/id6761443120`). No outstanding action.

#### 6.1 PR review — hoist VersionGate outside ClerkProvider, fix OtaRestartSheet __DEV__ state, platform-correct store name, and doc/seed cleanup (May 11, 2026)

Pre-merge review uncovered two real bugs (one critical) and a set of smaller corrections. All fixed in the same PR.

**Critical: VersionGate was inside `<ClerkLoaded>`, defeating the non-bypassable gate.** My own code comment claimed the gate "must sit outside ClerkProvider — the gate is auth-agnostic", but the layout actually placed `<VersionGate>` inside `appContent`, which was rendered as a child of `<ClerkLoaded>`. If Clerk hangs or fails to initialize (a real, documented Clerk regression — clerk/javascript#8245 where `isLoaded` stays permanently `false`), `<ForceUpdateScreen />` would never appear, defeating the whole point of a non-bypassable safety blocker during incidents.

Restructured `apps/mobile/app/_layout.tsx` so `<VersionGate>` now wraps `<ClerkProvider>` (when configured), rather than the other way around. Layering top-to-bottom is now: `GestureHandlerRootView` → `OptionalStripeProvider` → `QueryClientProvider` → `SafeAreaProvider` → **`VersionGate`** → (`ClerkProvider` → `ClerkLoaded`) → `AppShell`. When `VersionGate` decides to render `ForceUpdateScreen` it does so without ever touching Clerk; when it renders children, Clerk's normal gating still applies to the actual app shell. The auth-agnostic guarantee in the comment now matches the code.

**Bug: `OtaRestartSheet`'s `__DEV__` branch left `restarting` stuck `true`.** In dev, `handleRestart` skips `Updates.reloadAsync()` (because Metro would swap in the latest published OTA, not the fake updateId in the test matrix) and short-circuits to `onPostpone()`. It called `setRestarting(true)` at the top but never reset to `false` in that branch. Because the sheet is always mounted inside `VersionGate`, the state persists — reopening the sheet left both "Restart now" and "Later" CTAs disabled. Added `setRestarting(false)` immediately before `onPostpone()` in the `__DEV__` branch, with an inline comment explaining why the production success path doesn't need the same reset (the bundle swap unmounts the component before the promise resolves).

**Platform-correct store name — explicitly deferred for v1.** The reviewer suggested swapping the hardcoded `"App Store"` literals in `ForceUpdateScreen` (two `Alert.alert` calls, one accessibility label/hint pair, the CTA label) and `UpdateAvailableBanner` (one accessibility label) for a `Platform.OS === "android" ? "Google Play Store" : "App Store"` ternary. Decided NOT to add the platform switch right now: Flame is iOS-only at the moment (no Android binary in the field, no Android target in `app.json`), and shipping platform-aware copy whose Android branch is dead code on every device that exists doesn't earn its complexity. Left a `NOTE` comment at the top of both files pointing readers at `docs/historico/todos/VERSION_GATE_TODOS.md` #9, which lists the exact six call sites and the operator action needed when Android ships.

**Doc accuracy — full `EXPO_PUBLIC_` env keys in the test matrix.** The "Version Gating" runbook in `docs/guias/EAS_OTA_UPDATES.md` had the env block above the matrix with the correct fully-qualified names (`EXPO_PUBLIC_DEV_VERSION_OVERRIDE`, etc.) but the matrix table itself used the shortened forms (`DEV_VERSION_OVERRIDE`). A reader following the table would set the wrong keys and conclude the dev flags "don't work". Updated all four rows to use the fully-qualified `EXPO_PUBLIC_DEV_*` names.

**Android `store_url` placeholder.** The migration seeded the Android row with `store_url = ''`. If Android shipped before the operator updated that value AND an Android `minimum_version` was raised, the CTA would have nowhere to send users. Replaced with `https://play.google.com/store/apps/details?id=YOUR_ANDROID_PACKAGE_NAME` and a SQL `jsonb_set` on the live row so the seed and the live config match. Comment in the migration now explicitly calls out that the operator must replace `YOUR_ANDROID_PACKAGE_NAME` before launching Android. The Android row remains effectively dormant (no Android build exists), but the schema is now defensively safe.

**Small consistency / diagnosability fixes:**

- `VersionGate`'s root `View` switched from `style={{ flex: 1 }}` to `className="flex-1"` to match the project's NativeWind convention.
- `useSoftBannerDismissal`'s two silent `SecureStore` catch blocks now log `console.warn` with action context (`dismissal_load` / `dismissal_persist`), the key, and the error in `__DEV__` only — silent failures here are non-fatal (in-memory state still hides the banner for the session) but used to be invisible. Logging is `__DEV__`-only because the production failure mode is "user sees the banner again next launch", which is acceptable UX and doesn't warrant production log noise.

**Skipped with reason (review feedback that didn't apply):**

- **"`API_BASE` should fail-closed if `EXPO_PUBLIC_API_URL` is missing in production"** — Skipped. (a) Identical pattern lives in `apps/mobile/lib/api.ts:8-10` (changing one creates inconsistency); (b) the plan explicitly chose **fail-open** on network/endpoint errors as a documented design decision (#357 in this entry); (c) `EXPO_PUBLIC_API_URL` IS set in EAS production env (per APRIL_2026_FIXES.md #129), so the localhost fallback is dev-only in practice. The fallback is harmless (`fetchAppConfig` is fail-open — a localhost-pointing fetch in production would fail and resolve to safe-default, never gating users) and aligns with the rest of the codebase.

**Deferred** to `docs/historico/todos/NITPICKS_TODOS.md`: converting inline `style={}` objects in the three new system screens (`ForceUpdateScreen`, `OtaRestartSheet`, `UpdateAvailableBanner`) to pure NativeWind utility classes (the components already use shared color tokens from `@project-flame/ui`; the remaining inline styles are layout primitives, not raw rgba); migrating `readSuppression` in `useOtaUpdatePrompt.ts` to a Zod schema (current 2-field manual `typeof` check is explicit and zero-cost); migrating the API route's `withDefaults` to a Zod schema (current 5-field guard handles defaults explicitly and is small enough that Zod is premature here).

**Files (review-round-2 deltas only):**

- `apps/mobile/app/_layout.tsx` — hoisted `<VersionGate>` outside `<ClerkProvider>` / `<ClerkLoaded>`
- `apps/mobile/components/system/OtaRestartSheet.tsx` — reset `restarting` state in `__DEV__` branch
- `apps/mobile/components/system/ForceUpdateScreen.tsx` — top-of-file `NOTE` pointing at `VERSION_GATE_TODOS.md` #9 (Android store-name localization). Hardcoded `"App Store"` literals retained at four call sites: two `Alert.alert` blocks, the accessibility label/hint pair, and the CTA label.
- `apps/mobile/components/system/UpdateAvailableBanner.tsx` — same top-of-file `NOTE`. Hardcoded `"App Store"` retained in one accessibility label.
- `apps/mobile/components/system/VersionGate.tsx` — `style={{ flex: 1 }}` → `className="flex-1"`
- `apps/mobile/hooks/useAppVersionGate.ts` — `__DEV__` warn logs in `useSoftBannerDismissal` catches
- `supabase/migrations/20260512021503_add_app_config_for_version_gating.sql` — Android `store_url` placeholder + operator-action comment; live row updated via MCP `execute_sql` to match
- `docs/guias/EAS_OTA_UPDATES.md` — test matrix env keys fully qualified
- `docs/historico/todos/NITPICKS_TODOS.md` — three deferred polish items appended

#### 6.2 PR review — doc reconciliation + FlameText-on-white-CTA fix (May 11, 2026)

A second pre-merge sweep caught one real visual bug introduced by 6.1 and three doc inconsistencies.

**Visual bug: `FlameText` on a white-pill CTA renders invisibly.** The `Update on App Store` CTA in `ForceUpdateScreen` was using `FlameText` with `style={{ color: colors.dark }}`. Per `flame-design-system.mdc` ("Dark text on light buttons (FlameText gotcha)"), `FlameText` carries a hardcoded `text-white-100` default that NativeWind cannot reliably override via `className` or inline `style` — the result is a white pill with white text, label invisible. The correct pattern (already used by `OtaRestartSheet`'s "Restart now" button) is raw `<Text>` with `style={{ color: colors.dark }}`. Swapped `FlameText` → `Text` (imported from `react-native`) and dropped a code comment pointing at the design-system rule and the `OtaRestartSheet` reference so a future contributor doesn't undo the change.

**Doc reconciliation #1: changelog #6.1 Files list contradicted its own body.** The body of 6.1 correctly said the platform-aware `STORE_NAME` helper was deferred and not added; the Files list still claimed both screens had been updated to use a `STORE_NAME` helper with interpolated call sites. Rewrote the two list items to say what actually shipped: a top-of-file `NOTE` pointing at `VERSION_GATE_TODOS.md` #9, with the hardcoded `"App Store"` literals retained.

**Doc reconciliation #2: `EAS_OTA_UPDATES.md` "Two surfaces" intro listed three.** The "Version Gating" section header said "Two surfaces:" then enumerated `ForceUpdateScreen`, `UpdateAvailableBanner`, `OtaRestartSheet` — three. Rephrased to "Two native-version surfaces, plus one OTA prompt" so the count matches the bullets and the grouping (binary-version gating vs. JS-bundle restart prompt) is clearer.

**Doc cleanup: duplicate "Always verify…" sentence.** A `StrReplace` artifact in `EAS_OTA_UPDATES.md` left the same sentence printed twice in the env-verification section. De-duplicated and added a one-line description of what a correct production push's env load line looks like (no fabricated output — just "loads `.env.production` or pulls from EAS remote `production`, not your local `.env`") so the section still teaches the operator what to look for.

**Skipped with reason:**

- **"Convert inline `style={}` objects in `ForceUpdateScreen` to NativeWind classes"** — already triaged and deferred in 6.1 above (see the "Deferred" line and `NITPICKS_TODOS.md` "May 2026 PR Review — App version gating"). Re-fixing in this round would just reverse a documented decision from the same PR. Will be swept in the dedicated NativeWind follow-up that owns all three system screens.

**Files (review-round-2.5 deltas only):**

- `apps/mobile/components/system/ForceUpdateScreen.tsx` — added `Text` import; swapped CTA `FlameText` → `Text`; added inline comment citing the design-system rule.
- `docs/historico/fixes/MAY_2026_FIXES.md` — corrected #6.1 Files-list entries for `ForceUpdateScreen` and `UpdateAvailableBanner`.
- `docs/guias/EAS_OTA_UPDATES.md` — "Two surfaces" → "Two native-version surfaces, plus one OTA prompt"; de-duplicated the env-verification sentence.

#### 6.3 PR review — "Three distinct UI surfaces" phrasing tweak (May 11, 2026)

Two more pre-merge review items, one fixed, one skipped.

**Fixed:** Tightened the awkward "Two native-version surfaces, plus one OTA prompt:" phrasing in `EAS_OTA_UPDATES.md`'s Version Gating intro to the cleaner "Three distinct UI surfaces:" — same information, less hedging, matches the three bullets that follow.

**Skipped (auto-reviewer grammatical false positive):** Reviewer flagged `"Lets us verify the suppression-by-updateId behavior locally"` in this changelog (line 381) as a typo for the contraction `"Let's"` and claimed two occurrences. Verified: (a) only one occurrence exists in the file (`rg "Lets"` returns a single hit); (b) `"Lets us verify X"` uses `let` as a verb meaning `allow/permit`, 3rd person singular — `"[the flag] lets us verify X"` = `"[the flag] allows us to verify X"`. The proposed `"Let's"` is the contraction of `"let us"`, so the suggested fix `"Let's us verify"` expands to `"let us us verify"` — ungrammatical. Kept the original.

**Files (review-round-2.6 deltas only):**

- `docs/guias/EAS_OTA_UPDATES.md` — Version Gating intro line rephrased.

#### 6.4 Simulator smoke-test polish — faded CTAs, OTA inline buttons, soft-banner overlay (May 12, 2026)

After running the full local test matrix on simulator, three real visual bugs surfaced. All three trace back to the same root cause and a layout choice that didn't match toast conventions.

**Root cause shared by #1 and #2: `Pressable` `style={() => ({ backgroundColor, opacity, ... })}` silently dropped colors on iOS RN 0.81.** The canonical `PillButton` in `packages/ui/src/components/PillButton.tsx` uses `className`-driven styling (`"bg-white-100 rounded-pill ..."` on the Pressable, `"text-dark ..."` on the Text) — no inline `style` callback. Our new system surfaces (`ForceUpdateScreen`, `OtaRestartSheet`) had been built with the inline-callback pattern and the resulting button rendered as a near-invisible faded white pill with faded text, only visible against motion (the pressed-opacity transition). Switched both CTAs to the `className` pattern. The faded `FlameText` → `Text` swap from 6.2 was correct but partial — the underlying Pressable was the actual culprit.

1. **Hard block CTA invisible.** `ForceUpdateScreen`'s "Update on App Store" button rendered as faded icon + faded text with no visible white pill background — the user reported being barely able to see it (simulator screenshot confirmed). Rewrote the Pressable to use `className="mt-2 h-14 min-w-[220px] flex-row items-center justify-center gap-[10px] rounded-pill bg-white-100 px-8"` and the inner label as `className="text-base leading-[22px] font-poppins-semibold text-dark"`. Pressed-state opacity moved to `active:opacity-85` (NativeWind variant). Loading-state opacity remains conditional in the className string (`opening ? "opacity-70" : "active:opacity-85"`). Added a block comment citing `PillButton` as the source-of-truth pattern so future contributors don't re-introduce the inline-style approach.

2. **OTA sheet "Restart now" button same faded issue + buttons stacked instead of side-by-side.** The user reported the Restart-now label rendering as faded/blue-ish (likely iOS default-link blue when an explicit color isn't reliably applied) and asked for both CTAs on one row — `Later` on the left as a ghost button, `Restart now` on the right as the primary. Rewrote the action area as a `flex-row items-center gap-3` View wrapping two `flex-1` Pressables: the ghost (`border border-white-20 bg-white-5 active:opacity-70` with `text-white-100` label) and the primary (`bg-white-100 active:opacity-85` with `text-dark` label, plus `opacity-70` while restarting). Same `className`-only pattern as the hard block, and matches `PillButton`'s solid/ghost convention. The ghost label now uses raw `<Text>` (FlameText already only existed there for the title + body, not the buttons).

3. **Soft banner was pushing the entire app shell down instead of overlaying like a toast — and once converted to an overlay, ended up anchored ABOVE the bottom tab bar (not the top).** `VersionGate` had been rendering `<UpdateAvailableBanner />` as the first flex child of its root View, so the banner consumed vertical space and shifted the header + tab bar + every screen by its own height (about 50pt). The industry convention for a non-blocking update prompt (Eventbrite, Airbnb, Dice) is a toast-style absolute-positioned overlay — app shell underneath is unaffected. Made `UpdateAvailableBanner`'s outer wrapper `absolute left-0 right-0` with `pointerEvents="box-none"` so taps fall through to the app where the banner isn't, while the inner pill catches its own Update / dismiss taps. **Vertical anchor went through two iterations.** First attempt: top-anchored (`top: 0` + `useSafeAreaInsets` for the top inset). That placement was visually correct but the global Header's edge-aligned logo (left) and settings + bell icons (right) leaked past the rounded pill's bounds — the pill doesn't reach edge-to-edge so the header content stuck out the sides. Final placement: bottom-anchored ABOVE the floating tab bar at `bottom: insets.bottom + TAB_BAR_PILL_MARGIN + TAB_BAR_PILL_HEIGHT + 12` (constants imported from `CustomTabBar.tsx` so the offset stays in sync if tab-bar geometry changes). Bottom anchoring sits the banner in a quiet region of the layout, visually attached to the persistent nav pill, no edge bleed. Inner pill bg also switched from translucent `bg-white-10` → solid `bg-surface` per design feedback so the banner fully obscures whatever scrolls beneath it.

**Skipped:** Nothing in this round.

**Files (round-2.7 deltas only):**

- `apps/mobile/components/system/ForceUpdateScreen.tsx` — Pressable now `className`-driven (`bg-white-100 rounded-pill`), Text label uses `text-dark`. Inline-style Pressable callback removed.
- `apps/mobile/components/system/OtaRestartSheet.tsx` — Restart + Later are now inline (50/50 split via `flex-1` in a `flex-row` container). Both Pressables `className`-driven. Ghost + solid variants follow `PillButton` convention.
- `apps/mobile/components/system/UpdateAvailableBanner.tsx` — outer wrapper switched to `absolute left-0 right-0` with `pointerEvents="box-none"` so the banner overlays like a toast instead of pushing app content down. Z-index hardened: NativeWind's `z-50` class can lose the stacking battle to other absolutely-positioned ancestors, so switched to explicit `style={{ zIndex: 9999, elevation: 9999 }}` (RN honors the `style` prop reliably when `position: absolute` is set). 9999 sits above every in-app surface but below the OTA Modal (Modal is its own native window). **Vertical anchor: pinned ABOVE the floating tab bar at `bottom: insets.bottom + TAB_BAR_PILL_MARGIN + TAB_BAR_PILL_HEIGHT + 12`** (constants imported from `CustomTabBar.tsx` so the offset stays in sync if the tab-bar geometry changes). The top placement was attempted first (under the header), but the Header's edge-aligned logo + icons leaked past the rounded pill's bounds — bottom anchoring sits the banner in a quiet region of the layout, visually attached to the persistent nav surface, no edge bleed. **Inner pill bg switched from translucent `bg-white-10` → solid `bg-surface`** per design feedback so the banner fully obscures whatever scrolls beneath it. Also dropped a stale `FlameText style={{}}` prop (FlameText doesn't accept `style`; redundant since `text-white-100` is already its default) — pre-existing lint that surfaced after the cleanup.
- `apps/mobile/components/system/VersionGate.tsx` — children rendered before banner, banner sits on top via absolute positioning. Comment updated to describe the toast pattern + industry-convention rationale.

#### 6.5 PR review — narrative/doc reconciliation after the bottom-anchor switch (May 12, 2026)

Two doc inconsistencies surfaced by a final pre-merge sweep, one nitpick re-flagged.

**Fixed (doc reconciliation):**

1. `MAY_2026_FIXES.md` #6.4 paragraph #3 described the top-anchored interim state (`top: 0`, `useSafeAreaInsets` for the top inset) while the same entry's Files-list bullet correctly described the bottom-anchored final state — internally contradictory. Rewrote paragraph #3 to tell the actual journey: top-anchor attempted first → rejected for Header edge-bleed → moved to bottom-anchored above the tab bar. Both halves of the entry now describe the same final placement.
2. `EAS_OTA_UPDATES.md` test-matrix soft-banner row still said "Dismissible top banner" after the bottom-anchor switch. Updated to "Dismissible banner anchored ABOVE the floating tab bar" so QA checks the correct location.

**Deferred (same as before):** Reviewer re-flagged the `UpdateAvailableBanner` icon-circle inline `style={}` + the remaining `rgba(255,255,255,0.1)` literal for conversion to `className="size-7 rounded-full bg-white-10 items-center justify-center"`. Already explicitly in `NITPICKS_TODOS.md` — `UpdateAvailableBanner.tsx` is listed by name in the inline-styles → NativeWind sweep, and the icon-circle block is now explicitly called out. Doing it in isolation now splits the sweep that was promised to land as one follow-up PR. The `NITPICKS_TODOS.md` entry was updated to spell out the exact icon-circle block + the rgba → token swap so the sweep PR has zero discovery cost.

**Files (round-2.8 deltas only):**

- `docs/historico/fixes/MAY_2026_FIXES.md` — #6.4 paragraph #3 rewritten to match Files-list narrative (bottom-anchor described consistently).
- `docs/guias/EAS_OTA_UPDATES.md` — test-matrix soft-banner row updated to describe bottom-above-tab-bar placement.
- `docs/historico/todos/NITPICKS_TODOS.md` — inline-styles sweep entry extended with the specific `UpdateAvailableBanner` icon-circle block + rgba → token swap, plus a "re-confirmed deferred" timestamped note so a future reviewer sees the trail.

#### 6.6 PR review — OTA sheet stranded-user bug + shared-lib drift deferral (May 12, 2026)

**Fixed (real Tier-1 bug):**

1. **`OtaRestartSheet` scrim + `onRequestClose` dismissed the user during a failed reload, writing a 24h suppression they couldn't escape.** The "Later" button correctly carried `disabled={restarting}`, but the scrim `Pressable` and the `Modal`'s `onRequestClose` (Android hardware-back) both fired `onPostpone` unconditionally. Scenario: user taps **Restart now** → `restarting=true` → `Updates.reloadAsync()` rejects → `restarting=false`. During the in-flight window, if the user taps the scrim or hits Android back, `onPostpone` runs, writes `{ updateId, suppressedAt: Date.now() }` to SecureStore, and hides the sheet. Because `useOtaUpdatePrompt`'s `isSuppressionActive` short-circuits on a matching `updateId` for 24h, the user has NO way to retry the failed restart for that entire window — only a new bundle (different `updateId`) or TTL expiry reopens the sheet. **Fix:** introduced `handlePostpone = useCallback(() => { if (restarting) return; onPostpone(); }, [restarting, onPostpone])` and wired it to the scrim, `onRequestClose`, and the "Later" CTA. Added `disabled={restarting}` to the scrim Pressable for visual + a11y feedback parity. Now every dismissal path is a no-op while the restart is in flight, matching the "Later" button's behavior; if the reload throws, `restarting` flips back to `false` in `handleRestart`'s catch and the user regains every exit.

**Deferred (logged in `VERSION_GATE_TODOS.md` #10):**

2. **Duplicate types + validators across `apps/mobile/lib/version-check.ts` and `apps/web/app/api/mobile/app-config/route.ts`** — `PlatformConfig`, `AppConfigResponse`, `SAFE_DEFAULT_PLATFORM`, `safeSemver`, `isRawPlatformConfig`, `withDefaults` are independently implemented on both sides of the wire. Real drift risk (add a field on the server, forget the client; tighten validation on one side only). Not fixed in this PR because `@project-flame/lib` extraction touches two apps + a shared package and is better as its own focused PR. Reviewer confirmed: no web behavior change needed — web has no force-update mechanism by design (browsers auto-refresh on nav; no "old binary in the field" problem). Logged with a tight scope: extract types + Zod schema + safe-default + pure helpers to `packages/lib/src/version-gate/`, keep platform-specific I/O (SecureStore on mobile, Supabase on web) in each app, add a snapshot test that fails CI if `SAFE_DEFAULT_PLATFORM` drifts from the schema's required keys.

**Files (round-2.9 deltas only):**

- `apps/mobile/components/system/OtaRestartSheet.tsx` — added guarded `handlePostpone` wrapper, wired to scrim + `onRequestClose` + Later CTA; scrim now `disabled` during restart.
- `docs/historico/todos/VERSION_GATE_TODOS.md` — added item #10 "Extract shared version-config types + validators to `@project-flame/lib`" with extraction plan, drift-prevention test requirement, and explicit "no web behavior change" rationale.

---

### 7. Per-tier registration form field selection — full wiring (web + mobile) (May 13, 2026)

Closes triage item **W3-B3** ("Tier-specific RSVP form fields"). The `ticket_tiers.registration_form_fields text[]` column has lived in production since the January 2026 baseline migration (`20260128000000_baseline.sql:2988`) and the web RSVP API filter has used it since shipping, but the **organizer UI never let anyone set it**, the **shared `TicketTier` type didn't include it**, both **Zod schemas** for tier create/update silently dropped it, **mobile didn't select it** on read, and the **mobile attendee form ignored it** entirely on display. This PR fills every gap end-to-end with `[]` vs. `null` semantics that match how organizers actually think about it.

**Live behavior change to be aware of on deploy:** Exactly one tier in production already has `registration_form_fields` set today — `tier_id=937357e0-5980-443b-8c6a-407d411b0cb7` ("Socios e Hijos de Socios FULL PRICE" on event `fd106687-503d-4558-8259-43ed497bcf22` "El Calenton"), with `['nombre_completo','cedula','fecha_nacimiento','email']` (4 of the event's 8 fields). Web has been filtering correctly since the column shipped. **Mobile is silently showing all 8 fields today** because `useAppEvents` doesn't select the column. Once this PR ships on mobile (the read path is added in PTR-5 + the attendee filter is added in PTR-7), the mobile RSVP sheet will correctly show 4 fields for that tier — same as web. The other 63 of 64 tiers in production are `NULL`, which means "inherit all event fields" and is unchanged.

**Empty-array semantics (locked decision):** `registration_form_fields = NULL` means "inherit all event-level fields" (backward-compatible default). `registration_form_fields = []` means "this tier collects NO registration fields" — explicit empty. Before this PR, two web call sites (`apps/web/app/api/rsvp/route.ts:756–763` and `apps/web/app/components/EventDetail.tsx:914–920`) hand-rolled the filter in a way that treated `[]` and `null` identically (both showed all fields). The new shared helper `filterFieldsForTier` in `@project-flame/lib` makes `[]` mean "none", which is what organizers will reasonably expect when they save an empty selection. **Deploy-day risk = 0** because zero rows have `[]` today (the production state is exactly one row with 4 IDs + 63 rows of `NULL`).

#### 7.1 Shared lib — type, helper, tests, structural lookalike for mobile

- New `FormField` / `FormFieldType` canonical types in `packages/lib/src/types/registration-form.ts` so both web and mobile can stop redefining them. The mobile Zod `FormField` in `apps/mobile/hooks/useRsvpManagement.ts` is structurally narrower on `type` (accepts the wider `z.string()`) and is intentionally not unified yet — the new helper accepts both via `Pick<FormField, "id" | "archived">`.
- New `filterFieldsForTier<T>(fields, tierFormFields)` helper + `isFieldVisibleForTier(field, tierFormFields)` lookup in `packages/lib/src/utils/registration-form.ts`. Both encode the `null` = inherit / `[]` = none / `[ids]` = subset semantics. Archived fields are stripped first (so an archived field is never displayed even if it's listed in a tier's subset).
- `TicketTier` interface in `packages/lib/src/types/event.ts` now declares `registration_form_fields?: string[] | null` with a doc-comment pointing at the helper and the web + mobile call sites.
- 12 new unit tests in `packages/lib/__tests__/registration-form.test.ts` covering: `null` returns all fields, `[]` returns none, `[ids]` returns exactly those, archived always hidden regardless of mode, mixed archived+subset, and the structurally-compatible `Pick<...>` shape (157 lib tests pass total).
- Refactored `apps/web/app/api/rsvp/route.ts:756–763` and `apps/web/app/components/EventDetail.tsx:914–920` to import and call `filterFieldsForTier` instead of hand-rolling the filter. Functionally identical for the live tier (`['nombre_completo', ...]`) and for `NULL` tiers; semantically corrected for any future `[]` row.

#### 7.2 Web Zod plumbing — surfaced for testing + persisted via post-RPC UPDATE

- Extracted `createTierSchema` + `updateTierSchema` (previously inline in `apps/web/app/api/ticket-tiers/route.ts`) into a new `apps/web/app/api/ticket-tiers/schemas.ts` so they're importable by Vitest without spinning up Next. Both schemas now include `registration_form_fields: z.array(z.string()).max(50).nullable().optional()`. Same field added to the nested `ticket_tiers` Zod in `apps/web/app/api/events/route.ts` and forwarded into `tierInserts`.
- The `create_ticket_tier_with_stages` Postgres RPC doesn't accept `registration_form_fields` as a parameter (same as `secret_code`). Followed the established pattern: after the RPC returns the tier id, run a single follow-up `UPDATE` that combines `secret_code` + `registration_form_fields` into one call to keep DB round-trips minimal.
- 9 new Vitest cases in `apps/web/__tests__/ticket-tier-schemas.test.ts` covering valid subset, `null`, `[]`, omitted (treated as undefined), max-50 cap, non-string entries rejected, and that other validations (name/quantity/price) still gate.

#### 7.3 Web organizer UI — `RegistrationFormFieldsModal` + integration

- New shared modal `apps/web/app/components/organizer/RegistrationFormFieldsModal.tsx`. Mode toggle (`All fields` ↔ `Custom subset`); custom mode shows the event's non-archived fields as a checklist; saving "Custom" with the empty set produces `[]` (= "collect nothing"), saving with all checked produces an explicit array of all current IDs. Warns inline when an organizer-marked-required field is unchecked (registrants can still RSVP, the warning is so the organizer knows). On save, returns the array or `null` to the parent.
- Wired into both organizer surfaces:
  - `apps/web/app/components/organizer/TierInlineForm.tsx` (existing tier editor used by `OrgEventDetailClient.tsx` + `EventsTiersView.tsx`) — new `eventFormFields?: FormField[]` prop, "Registration form" row sits between Access Code and Price Stages, summary text reads "All N event fields" or "M of N selected".
  - `apps/web/app/components/forms/CreateEventForm.tsx` (event-creation flow) — same row + modal per ticket-tier card, in-flight `registration_form_fields` lives next to the tier's other staged fields and is forwarded into `formattedTicketTiers` only when non-`null` (omitted → defaults to `null` server-side via Zod `.optional()`).
- **Draft-state correctness:** Both `OrgEventDetailClient.tsx` and `CreateEventForm.tsx` derive `eventFormFields` from the *draft* `registration_form_config` (not the persisted event), so adding an event-level field and immediately setting per-tier subsets in the same edit session works without a save+refresh cycle. Archived fields are filtered out at the prop-pass site so they never appear in the picker — they do still render in the organizer's RSVP detail view so historical answers stay labeled.

#### 7.4 Mobile read paths

- `apps/mobile/hooks/useAppEvents.ts` — added `registration_form_fields` to the `ticket_tiers` sub-select. This is the line that flips the live tier from "8 fields shown" to "4 fields shown" on attendee surfaces.
- `apps/mobile/hooks/useOrgEvents.ts` — added `registration_form_fields` to both the `OrgEventTier` interface and the `EVENT_FIELDS` Supabase select. Required for the organizer dashboard's Edit Tiers screen to show the current saved selection without a re-fetch.
- The `get_event_with_tiers` RPC (`supabase/migrations/20260416042751_add_has_secret_code_to_get_event_rpc.sql`) builds tier JSON via `(to_jsonb(tt) - 'secret_code') || ...` so `registration_form_fields` already flows through unchanged — no migration needed for this read path. Verified by reading the migration body, not by changing it.

#### 7.5 Mobile write paths

- `apps/mobile/hooks/useTierMutations.ts` — `CreateTierInput` and `UpdateTierInput` both now declare `registration_form_fields?: string[] | null` with a doc-comment pointing at the matching web Zod schema. Mirrors web `POST /api/ticket-tiers` + `PATCH /api/ticket-tiers/:tierId` payloads exactly.
- `apps/mobile/hooks/useCreateEvent.ts` — `CreateEventTierInput` gains the same field with the same semantics doc-comment. Mirrors the nested `ticket_tiers` entry of web's `POST /api/events`.

#### 7.6 Mobile organizer UI — `TierRegistrationFormSheet` + create / edit wiring

- New `apps/mobile/components/create-event/TierRegistrationFormSheet.tsx`. Same state shape as the web modal (`"all" | "custom"` mode + `Set<string>` of IDs), same save semantics (`mode === "all"` ⇒ `null`; `mode === "custom"` ⇒ ordered `string[]` preserving event-field order, possibly empty), same required-but-unchecked warning. Built as a React Native `<Modal>` with `KeyboardAvoidingView` to match `CheckoutMainSheet`'s bottom-sheet pattern — no `@gorhom/bottom-sheet` dependency added. Accepts a structural `TierFormFieldLike` shape (`id` / `label` / `required?` / `archived?` / `type?`) so it works with both `@project-flame/lib`'s `FormField` and the mobile-local Zod `FormField` (which has a wider `type` string) without type wrangling at call sites.
- `apps/mobile/components/create-event/EditableTierCard.tsx` — accepts an optional `eventFormFields` prop, renders the picker row between Per-User-Limit and Stages (hidden when no event-level form is configured), mounts the sheet, persists the selection through `updateTier({ registration_form_fields })`. Threaded through `TicketTiersTab.tsx` and into `apps/mobile/app/(tabs)/create-event.tsx` (passes `eventForm.registration_form_config`).
- `apps/mobile/components/events-management/EditTiersTab.tsx` — both the **edit-existing-tier** form (`ExistingTierCard`) and the **add-new-tier** form get the same row + sheet. Edit-existing diffs against the original `tier.registration_form_fields` (including the `null` ↔ `[]` distinction) and only sends `updates.registration_form_fields` when actually changed, same as the existing `secret_code` diff. Add-new-tier conditionally includes the field in the `createTier.mutateAsync` payload only when an event-level form exists (so we never send `null` for events that don't use a registration form). Threads `event.registration_form_config` from `useOrgEvents` down to both forms.

#### 7.7 Mobile attendee filter — tier-aware `CheckoutMainSheet`

- `apps/mobile/components/event-details/CheckoutMainSheet.tsx` — registration-form rendering now calls `filterFieldsForTier(parsed, tier.registration_form_fields)` instead of just `.filter((f) => !f.archived)`. Same helper as web, same semantics.
- **Stale-answer cleanup on tier switch.** The local `useEffect` that seeds `localFormData` from `registrationData` already filtered to non-archived IDs; now it filters to the *tier-allowed* IDs and also propagates the cleanup back to the parent via `onRegistrationDataChange` so the eventual API payload doesn't carry stale data for fields the newly-selected tier doesn't collect. Effect deps explicitly include `tier.tierId ?? tier.id`, a `tierFieldsKey` join, and a `tier.registration_form_fields === null` boolean so any flavor of tier change re-seeds.
- Stage-expanded tier entries (synthetic composite ids) collapse to the underlying `tierId` so switching stages within the same tier doesn't gratuitously re-seed.

#### 7.8 Post-review fixes

Triage of automated PR comments surfaced five real issues, all fixed in this PR:

1. **`hasFormConfig` on `EventDetail.tsx`** (web client-side gate) checked event-level config and would open an empty registration modal when a tier had `registration_form_fields: []`. Replaced with `filterFieldsForTier(...).length > 0` so the `[]` "collect nothing" semantic is honored on the client just like on the API.
2. **`hasFormConfig` on `apps/web/app/api/rsvp/route.ts`** had the same bug — required `registration_data` for tiers that explicitly opt out of all fields. Refactored: compute `formConfig` first, then gate validation on `formConfig.length > 0`. Single source of truth.
3. **`visibleEventFormFields` reference instability.** Both `apps/web/.../TierInlineForm.tsx` and `apps/mobile/.../EditableTierCard.tsx` recomputed the filtered array every render. A parent re-render (e.g. React Query background refetch) while the picker is open passed a new reference into the modal/sheet whose `useEffect` deps included it, silently resetting the user's draft selection. Both wrapped in `useMemo([eventFormFields])`. (Web `RegistrationFormFieldsModal` and mobile `TierRegistrationFormSheet` were already memoizing their own derived `visible` arrays — leak was strictly on the parent side.)
4. **`field.type` rendered as undefined.** `TierRegistrationFormSheet` (mobile) rendered `{field.type}` as a caption without guarding. `TierFormFieldLike.type` is optional. Wrapped the caption in a `field.type &&` check so undefined doesn't print.
5. **Stale absolute path in this changelog.** Line 617 referenced `/Users/wagnerona/.cursor/plans/...` (machine-local). Replaced with the plan's short name; the file lives outside the repo so a relative link isn't appropriate.

Skipped (not bugs):
- "Don't 500 on post-RPC tier-field update failure; return 200 with a warning." Returning a soft success would silently strand tiers with missing `secret_code` / `registration_form_fields`, which is worse than the current explicit "edit to retry" 500. Tier-name uniqueness per event also bounds the duplicate-retry concern.

#### 7.9 Post-QA fixes

Three real bugs surfaced during in-app testing, all fixed in this PR:

1. **Web edit flow showed "All N event fields" even after a tier subset was saved.** The organizer-data Supabase select at `apps/web/app/api/organizer/data/route.ts` enumerates explicit `ticket_tiers` columns and was missing `registration_form_fields`. The tier object reached `TierInlineForm`/`CreateEventForm` without the column, so `tier?.registration_form_fields ?? null` was always `null` and the summary label fell through to the "All N" branch — even when the underlying DB row held a subset (verified by switching to the mobile app, where the same tier showed the correct "2 of 4 selected"). Added `registration_form_fields` to the select and to the `TicketTier` interface in `apps/web/app/lib/hooks/useOrganizerData.ts`. Note: this was strictly a *read* parity bug — saves were always landing in the DB; the UI just couldn't see them.
2. **Mobile checkout had no client-side required-field validation.** `CheckoutMainSheet`'s checkout button called `onCheckout` unconditionally. The server still validated (so submissions weren't actually corrupting data), but users got a generic top-of-sheet server error instead of inline per-field feedback. Added `formErrors` state, a `handleCheckoutPress` gate that mirrors web's `RegistrationFormModal.validate()` semantics, and inline red error text + red border under each invalid required field. Errors clear on edit and reset when the sheet reopens. Pre-computed `tierFormConfig` once per render so the gate and the renderer share one source of truth.
3. **Web required-field error read "Invalid input: expected string, received undefined".** `RegistrationFormModal.validate()` built `z.string().min(1, "This field is required")` schemas, but Zod's type check fires before `.min(1)`, so the *default* "expected string, received undefined" message leaked through when the field was untouched. Fixed by normalizing `formData` before `safeParse` (undefined → `""` for text/email, `raw === true` for checkbox), so the custom required message reaches the user. Pure presentation fix — server-side validation was already correct.

**Files:**
- `apps/web/app/api/organizer/data/route.ts`
- `apps/web/app/lib/hooks/useOrganizerData.ts`
- `apps/web/app/components/modals/RegistrationFormModal.tsx`
- `apps/mobile/components/event-details/CheckoutMainSheet.tsx`

#### 7.10 Tests + verification

- 12 new lib tests in `packages/lib/__tests__/registration-form.test.ts` (all 157 lib tests pass).
- 9 new web tests in `apps/web/__tests__/ticket-tier-schemas.test.ts` (all passing).
- `pnpm exec tsc --noEmit` — `apps/web` clean. `packages/lib` clean. `apps/mobile` has only the pre-existing failures already present on `main` (verified via `git stash && tsc && git stash pop`): same two `sales_start: string | null` errors on `EditTiersTab.tsx` (line shift due to added save-branch code), and the same set of unrelated `useEventFilters.ts`, `useOrgDashboardStats.ts`, `useOrgMembers.ts`, `useUserTickets.ts`, `lib/event-image.ts`, `lib/notifications.ts`, `packages/ui/...` errors that are independent of this work.
- `pnpm test` in `apps/web` — 7 failed test files / 16 passed, identical to `main` (verified). All failures are pre-existing DB integration / purchase-page suites (`hold-expiration-flow`, `payment-protection`, `promoter-tracking`, `stage-availability-functions`, `purchase-page.integration`, `create-payment-intent`) that fail with `SAFETY CHECK FAILED: Supabase URL does not appear to be a test environment` or pre-existing hold-currency assertion mismatches — none touch the registration-form code paths.

**Files:**

- `packages/lib/src/types/registration-form.ts` (new), `packages/lib/src/types/event.ts`, `packages/lib/src/types/index.ts`
- `packages/lib/src/utils/registration-form.ts` (new), `packages/lib/src/utils/index.ts`
- `packages/lib/src/index.ts`
- `packages/lib/__tests__/registration-form.test.ts` (new)
- `apps/web/app/api/ticket-tiers/schemas.ts` (new), `apps/web/app/api/ticket-tiers/route.ts`
- `apps/web/app/api/events/route.ts`
- `apps/web/app/api/rsvp/route.ts`
- `apps/web/app/components/EventDetail.tsx`
- `apps/web/app/components/organizer/RegistrationFormFieldsModal.tsx` (new)
- `apps/web/app/components/organizer/TierInlineForm.tsx`, `apps/web/app/components/organizer/types.ts`
- `apps/web/app/components/organizer/EventsTiersView.tsx`
- `apps/web/app/components/forms/CreateEventForm.tsx`
- `apps/web/app/organizer/event/[id]/OrgEventDetailClient.tsx`
- `apps/web/__tests__/ticket-tier-schemas.test.ts` (new)
- `apps/mobile/hooks/useAppEvents.ts`, `apps/mobile/hooks/useOrgEvents.ts`
- `apps/mobile/hooks/useCreateEvent.ts`, `apps/mobile/hooks/useTierMutations.ts`
- `apps/mobile/components/create-event/TierRegistrationFormSheet.tsx` (new)
- `apps/mobile/components/create-event/EditableTierCard.tsx`
- `apps/mobile/components/create-event/TicketTiersTab.tsx`
- `apps/mobile/app/(tabs)/create-event.tsx`
- `apps/mobile/components/events-management/EditTiersTab.tsx`
- `apps/mobile/components/event-details/CheckoutMainSheet.tsx`
- `docs/historico/project-migrations/IOS_MIGRATION.md` — Section 7 reference table updated for `TierRegistrationFormSheet.tsx`
- Cursor plan `issue_list_triage_&_fix_plan_e8840c56` — W3-B3 marked Shipped, pointing at this entry

**Deferred (logged elsewhere, not in this PR):**

- Unifying the mobile-local Zod `FormField` and the lib `FormField` into a single canonical type (mobile is structurally narrower on `type`). Tracked in `docs/historico/todos/EDGE_CASES_TODOS.MD` because it requires aligning Zod parser behavior across two surfaces without breaking RSVP-data tolerance.
- Pre-existing `sales_start: string | null` type-narrowing in `EditTiersTab.tsx` create-tier paths (lines 813, 852 post-shift). Independent of this PR. Will get swept in a focused null-handling cleanup.

---

### 8. Per-tier registration form — PR review follow-up (May 13, 2026)

Three automated PR review findings on entry #7. Triaged per the starter PR review protocol; two fixed, one skipped with reason.

#### 8.1 Mobile create-event leaked draft placeholder fields into the per-tier picker (Fix)

**Symptom:** When an organizer added a row to the event-level registration form in the Event Details tab but had not yet typed a label, switching to the Ticket Tiers tab and opening a tier's "Registration form" sheet showed the placeholder row (rendered as the field id via the `field.label || field.id` fallback in `TierRegistrationFormSheet.tsx:219`).

**Root cause:** `apps/mobile/app/(tabs)/create-event.tsx:547` passed `eventForm.registration_form_config` raw to `TicketTiersTab`. The submit path at `:346` already strips empty-label rows (`f.label.trim() !== ""`); the render path was missing the same sanitization. Downstream filters (`EditableTierCard.tsx:108`, `TierRegistrationFormSheet.tsx:61`) only filter `archived`, so blank-label rows reached the picker.

**Fix:** Added a `useMemo`-cached `sanitizedEventFormFields` derived from `eventForm.registration_form_config` with the same `f.label.trim() !== ""` filter as the submit path, and passed that to `TicketTiersTab` instead of the raw config. Comment in code explicitly references the mirror at `:346` so future edits keep the two in sync.

**Files:** `apps/mobile/app/(tabs)/create-event.tsx`.

#### 8.2 Duplicated `(f: any) => !f.archived` filter pattern in `EventsTiersView.tsx` (Fix)

**Symptom:** Four near-identical inline blocks at `apps/web/app/components/organizer/EventsTiersView.tsx` lines 596-604, 808-816, 1277-1285, and 1517-1525, each doing `Array.isArray(event.registration_form_config) ? event.registration_form_config.filter((f: any) => !f.archived) : []`. Four `(f: any)` casts violated the master rule's "no `any`" policy and the logic was duplicated across the same file (with the same pattern repeating in 5+ other web files).

**Root cause:** When entry #7 wired `eventFormFields` through `TierInlineForm`, the same defensive pattern was inlined at every call site instead of being extracted. The shared lib already housed `filterFieldsForTier` and `isFieldVisibleForTier`, but the "narrow event config to non-archived fields" primitive was not extracted alongside them.

**Fix:**

- Added `getActiveEventFormFields` to `packages/lib/src/utils/registration-form.ts` next to the existing helpers. Generic over `T extends Pick<FormField, "archived">` so it works with the lib `FormField`, the web Zod-parsed shape, and the mobile-local Zod `FormField` without explicit casts. Tolerates `null`/`undefined`/non-array input defensively because the column is `jsonb` and could in theory carry stale shapes.
- Exported from `packages/lib/src/utils/index.ts` (and through the package barrel).
- Replaced all 4 inline blocks in `EventsTiersView.tsx` with single-line `eventFormFields={getActiveEventFormFields(event.registration_form_config)}` calls. Eliminates 4 `(f: any)` casts and ~28 lines of duplication.
- Added 4 new unit tests covering the helper (non-archived ordered, null/undefined/non-array tolerance, empty input, all-archived input). Test count: 161 total in `packages/lib`.

Other in-repo occurrences of the same pattern (`OrgEventDetailClient.tsx:1093`, `RegistrationFormModal.tsx:131`, `RegistrationFormFieldsModal.tsx:53`, `CreateEventForm.tsx:157`, mobile `TierRegistrationFormSheet.tsx:61`) were left for now per the user's "minimal scope" direction. They will get swept opportunistically the next time those files are touched, since the helper is now available.

**Files:** `packages/lib/src/utils/registration-form.ts`, `packages/lib/src/utils/index.ts`, `packages/lib/__tests__/registration-form.test.ts`, `apps/web/app/components/organizer/EventsTiersView.tsx`.

#### 8.3 Suggestion to cross-check tier `registration_form_fields` ids against event config in POST `/api/events` (Skipped)

**Suggestion:** In `apps/web/app/api/events/route.ts:95-99`, validate each tier's `registration_form_fields` entry against the event's `registration_form_config` IDs and 400 if any id is missing or archived.

**Verdict:** Skip. The suggestion misunderstands the flow — `POST /api/events` is event **creation**, so there is no DB-side "live config" to look up; both `event.registration_form_config` and `tiers[].registration_form_fields` arrive in the same payload. Beyond that, the per-tier registration form plan ([`per_tier_registration_form_a7c91f08.plan.md`](../../.cursor/plans/per_tier_registration_form_a7c91f08.plan.md), "Open questions" #2) explicitly chose to silently ignore unknown ids on read via `filterFieldsForTier`, making field deletes/renames forward-compatible. The helper already does this (covered by tests at `packages/lib/__tests__/registration-form.test.ts:75-81`). Bad input is therefore inert: it stores as `text[]`, gets dropped on read by the helper, never affects RSVP validation, and never causes data corruption or a security issue. DoS vector is already capped via `.max(50)`. Adding cross-check validation would noise the schema without preventing a real bug, and would contradict the plan's intentional design.

No code change. Logged here for traceability.

### 9. W2-A1 + W3-B1 — RSVP badge on organizer dashboard cards & full cohost RSVP access (May 19, 2026)

Two items from [`issue_list_triage_&_fix_plan_e8840c56.plan.md`](../../.cursor/plans/issue_list_triage_&_fix_plan_e8840c56.plan.md) closed together because they shipped in the same branch and W3-B1's RLS work directly unblocks the RSVP screen that W2-A1's badge points to.

#### 9.1 W2-A1 — RSVP badge on organizer dashboard event cards (web + mobile)

**Symptom:** Organizer dashboard event cards on both platforms gave no visual signal that an event required RSVP approval. Organizers had to open each event to find out, which broke parity with the consumer-facing `EventCard` / `RsvpBadge` and made the new RSVP-management surface (W2-A2 / W3-B1) harder to navigate to.

**Root cause:** `requires_rsvp` was already fetched by both data sources (`useOrgEvents` on mobile selects `requires_rsvp`; `/api/organizer/data` on web uses `select('*')`), but the mapping layer dropped the flag on the way to the card. The card components had no UI for it on either platform.

**Fix (UI only, no schema):**

- **Mobile:** Threaded `isRsvp` through `mapOrgEventToCardData` (`apps/mobile/app/organizer-admin.tsx:120-124`) → `OrgEventCardData` (`OrgEventCard.tsx:18`) → `EventInfoHeaderData` (`EventInfoHeader.tsx:11`). Rendered a `bg-primary rounded-badge` pill (`text-[10px] leading-[14px] font-poppins-medium uppercase`) inline next to the event title. Added `flex-shrink` + `numberOfLines={1}` on the title so long names truncate cleanly instead of pushing the pill off-screen.
- **Web:** Same inline pill in `OrganizerAdminView.tsx::EventRow` (~line 443) using the matching `bg-primary text-white-100 px-2 py-0.5 text-[10px] leading-[14px] font-poppins-medium uppercase rounded-badge shrink-0`.
- **Plan deviation:** Plan called for an overlay pill on the image thumbnail to match consumer cards. Shipped as an inline title pill on both platforms instead — consistent web ↔ mobile, identical token set, but visually slightly different from the consumer surface. Logged for revisit only if it tests poorly with organizers; otherwise leave as-is.

**Files:** `apps/mobile/app/organizer-admin.tsx`, `apps/mobile/components/org-dashboard/OrgEventCard.tsx`, `apps/mobile/components/org-dashboard/EventInfoHeader.tsx`, `apps/web/app/components/organizer/OrganizerAdminView.tsx`.

#### 9.2 W3-B1 — Cohost org owner/admin can fully manage RSVPs on cohosted events

**Symptom:** Per-plan, cohost org owners/admins were supposed to get full view / approve / reject access on cohosted events. In practice they were locked out at every layer:

1. Three RSVP API routes (`GET /api/organizer/rsvps`, `PATCH /api/organizer/rsvps/[id]/approve`, `.../reject`) only authorized members of `event.organization_id` (the primary org).
2. The web SSR page `apps/web/app/organizer/rsvps/[id]/page.tsx` re-checked primary-org membership and `redirect("/?onboarding=true")` before any API call, so cohost admins never even reached the routes.
3. The mobile RSVP screens (`useRsvpManagement.useRsvpEvents`, `useEventRsvps`) read `rsvps` directly via the authenticated (non-admin) Supabase client. The RLS policy `"Organization members can view RSVPs for their events"` only allowed access via `events.organization_id IN get_user_organizations()` — cohost orgs were blocked.
4. The mobile event-list query in `useRsvpEvents` filtered with `.eq("organization_id", primaryOrgId)`, so cohost events never appeared in the RSVP management list to begin with.

**Root cause:** Every layer had its own primary-org-only auth check inherited from before cohosts existed. There was no shared boolean predicate; the API helper that did exist (`canManageEventRsvps` in `apps/web/app/lib/utils/event-rsvp-authz.ts`, shipped earlier this branch) only covered three of the routes.

**Fix:**

- **DB / RLS (migration `20260519220824_cohost_rsvp_rls_access`):** Added `get_cohost_admin_event_ids()` — a `SECURITY DEFINER STABLE` helper returning `SETOF uuid` of event IDs where the calling Clerk user is owner OR admin of an organization listed in `event_assignments.cohost_organization_id`. Mirrors the existing `get_admin_organizations()` / `get_user_organizations()` shape so it composes with the same RLS-recursion-safe pattern. Then dropped + recreated the two `rsvps` policies ("Organization members can view…" SELECT and "Organization members can update…" UPDATE) so the `USING` clause is `primary-org-event OR get_cohost_admin_event_ids()`. Cohost-side is intentionally restricted to owner/admin only — the TS helper, the API routes, and now RLS all agree on this rule.
- **Web SSR (`apps/web/app/organizer/rsvps/[id]/page.tsx`):** Replaced the inline `.eq("organization_id", event.organization_id)` membership check with `canManageEventRsvps(...)`. Resolved the "active org" context (used for breadcrumb / cancel-payment `?org=` slug) by computing the user's `eligibleOrgs` (any approved primary-org membership for the event + any approved cohost-org membership where role ∈ owner/admin), then preferring `?org=` slug → primary org → first eligible cohost. Dropped the `.eq("organization_id", organization.id)` from the full-event fetch so cohost users get the same event row primary members do.
- **Mobile (`apps/mobile/hooks/useRsvpManagement.ts::useRsvpEvents`):** Extended the events query to ALSO fetch cohost events (`event_assignments.cohost_organization_id = selectedOrgId` joined to `events`) when `isOwnerOrAdmin` is true from `useMemberRoleContext`. Merged primary + cohost event lists with dedupe-by-id, then ran the rsvps count query against the union. Skipped the cohost round-trip entirely for non-admin members to match the RLS gate. RSVP detail screen (`useEventRsvps`) needed no code change — the new RLS policy unblocks the existing direct `client.from("rsvps").select(...)` for cohost admins automatically.
- **Mobile (`useOrgEvents.ts`):** Refreshed the stale `quantity_reserved` comment that claimed "co-host RLS blocks reads of the owning org's holds/rsvps" — that's now only partially true (rsvps reads work post-migration for cohost owners/admins; holds reads are still primary-org scoped, but `useCohostEvents` doesn't query them anyway).

**Verification (Supabase MCP):** Pulled `pg_policies` post-apply — both `rsvps` policies now read `((event_id IN (SELECT events.id FROM events WHERE …get_user_organizations()…)) OR (event_id IN (SELECT get_cohost_admin_event_ids…)))`. Migration version `20260519220824_cohost_rsvp_rls_access` confirmed via `list_migrations`; local file renamed to match per the migration workflow gotcha. (Supabase Cloud assigns the canonical timestamped filename at apply time, so the local migration file must be renamed to the remote-assigned timestamp to keep `supabase/migrations/` in sync with `pg_migrations`.)

**Files (this entry):** `supabase/migrations/20260519220824_cohost_rsvp_rls_access.sql`, `apps/web/app/organizer/rsvps/[id]/page.tsx`, `apps/mobile/hooks/useRsvpManagement.ts`, `apps/mobile/hooks/useOrgEvents.ts`. (Pre-existing helper `apps/web/app/lib/utils/event-rsvp-authz.ts` + three API routes wired in earlier on this branch — already covered by W3-B1's initial pass.)

**Web Parity Gate notes:**

- Web source-of-truth: `apps/web/app/api/organizer/rsvps/[id]/approve|reject/route.ts` (post-cohost-helper) and `apps/web/app/organizer/rsvps/[id]/page.tsx` (post-refactor).
- API parity: mobile `useRsvpActions` already PATCHes the same approve/reject endpoints; reads use the same fields per `RSVP_DETAIL_SELECT`. No new API surface introduced.
- Calculation parity: no pricing changes in this entry; the existing shared helpers (`getBasePriceFromTicket`, `formatCentsAsPrice`, `buildTimeRange`, `formatEventDate`) continue to handle all display math.
- Edge cases: standard cohost admin viewing list + detail + approve + reject works against the same RLS path; cohost org *member* (non-admin) still gets a 0-row list (matches RLS); primary-org member access unchanged; non-cohost / non-primary user still receives 403/redirect.

#### 9.3 Review follow-up — restore `TO authenticated` on the two recreated rsvps policies

**Symptom (caught in code review):** Migration `20260519220824_cohost_rsvp_rls_access` dropped + recreated the two `rsvps` policies but omitted the explicit `TO authenticated` role clause. Both policies defaulted to `{public}`, silently reverting `20260227203747_rsvp_users_policies_to_authenticated.sql` (whose entire purpose was to scope these policies to the authenticated role). Verified live via `pg_policies` — both policies showed `roles = {public}` post-apply, while the sibling `"Org members can view RSVP requestor profiles"` policy on `public.users` (untouched by the cohost migration) still correctly showed `{authenticated}`.

**Functional impact:** Low. Both predicate branches dereference `auth.jwt() ->> 'sub'`, which is `NULL` for the anon role — every OR-term evaluates false → no rows leak. PUBLIC was inert in practice. But the regression undid an explicit prior fix, broke parity with the sibling `users` policy, and would confuse anyone auditing the role scope later.

**Fix:**

- **Patched the original migration file (`20260519220824_cohost_rsvp_rls_access.sql`) in-place** to include `TO authenticated` on both `CREATE POLICY` statements + an explanatory comment block. Ensures any fresh deploy / `supabase db reset` gets the correct role scope from the start (the file had already been applied to remote, so editing it has no remote effect — the corrective migration below handles the live database).
- **New migration `20260519222243_restore_rsvps_to_authenticated.sql`** — drops + recreates both policies with `TO authenticated`. Applied via Supabase MCP, file renamed locally to match the remote-assigned version. Verified post-apply: `pg_policies` now reports `roles = {authenticated}` for both policies.

**Pattern note for future migrations that drop + recreate policies:** Always carry forward the role scope from the previous `CREATE POLICY`. Postgres has no `ALTER POLICY ... SET ROLE`, so the only way to preserve it is to spell it out on the recreated statement. When in doubt, check `pg_policies.roles` before and after the migration.

**Files:** `supabase/migrations/20260519220824_cohost_rsvp_rls_access.sql` (in-place patch), `supabase/migrations/20260519222243_restore_rsvps_to_authenticated.sql` (new corrective migration).

#### 9.4 Post-review polish round (May 19, 2026)

No behavior changes — just code-quality fixes from two PR review passes on the W3-B1 surface. Logged here so future grep-of-production-logs can find the source of the new auth log prefix.

- **`apps/web/app/lib/utils/event-rsvp-authz.ts`** — added per-query error logging. Each of the three Supabase queries now destructures `error` and on failure logs `console.error("[canManageEventRsvps] <which> query failed", { supabaseUserId, eventId, eventOrganizationId, error })` before returning `false`. Fail-closed behavior preserved; transient DB errors are now observable instead of silently producing a 403.
- **`apps/mobile/hooks/useRsvpManagement.ts::useRsvpEvents`** — extracted `fetchCohostEvents()` helper that normalizes PostgREST's `T | T[] | null` embedded shape into `T | null` at the boundary, removing the `as unknown as Promise<...>` cast. Also DB-filtered the pending-count query to `.eq("status", "pending")` and narrowed `.select("event_id")`; the per-row JS status check is gone and the unused `RsvpCountRow` interface deleted.
- **`apps/web/app/api/organizer/rsvps/[id]/reject/route.ts`** — tightened `RsvpEventJoin.organization_id` from optional `string` to required `string` (matches the `events.organization_id NOT NULL` constraint + the SELECT always returning it), which drops the `!` non-null assertion on the `canManageEventRsvps` call. Approve route was already loose-typed, so no change there.
- **`docs/historico/fixes/MAY_2026_FIXES.md` §9.2 (line 728)** — appended one-sentence clarification of the "migration workflow gotcha": Supabase Cloud assigns the canonical timestamped filename at apply time, so the local file must be renamed to the remote-assigned timestamp to keep `supabase/migrations/` in sync with `pg_migrations`.
- **Skipped:** the reviewer's suggestion to rename `useCohostEvents` → `useRsvpEvents` in [`useOrgEvents.ts`](../../apps/mobile/hooks/useOrgEvents.ts) line 33 comment (premise wrong — `useCohostEvents` exists and is used by `organizer-admin.tsx` + `org-event-detail.tsx`), and the suggestion to extract a shared eligibility helper between `canManageEventRsvps` and the SSR page (different data shapes, only 2 callsites, would add indirection without removing real duplication).

---

### 10. Web cohost parity with mobile + RSVP badge restyle + public-profile cohost visibility (May 19, 2026)

Three related items shipped together because they all surfaced from the same QA pass on W2-A1 / W3-B1 and would otherwise leave the cohost surface half-built on web.

#### 10.1 RSVP badge restyle — absolute top-right, stacked below cohost (web + mobile)

**Symptom:** The W2-A1 inline pill (rendered next to the event title) was inconsistent with the home / consumer EventCard pattern, and could overlap or get pushed off-screen by long event names.

**Fix:** Refactored both web `EventRow` ([`OrganizerAdminView.tsx`](../../apps/web/app/components/organizer/OrganizerAdminView.tsx) ~line 443) and mobile [`OrgEventCard.tsx`](../../apps/mobile/components/org-dashboard/OrgEventCard.tsx) so a single `absolute top-2 right-2` (web) / `top: 8 right: 8` (mobile) badge stack renders cohost first, then RSVP below it. Title rows get a `pr-[80px]` to prevent the title from sliding underneath the badge. The `isRsvp` prop is no longer threaded through `EventInfoHeader` — that header reverted to its pre-W2-A1 shape.

#### 10.2 Web cohost parity with mobile dashboard + event detail

**Symptom:** Mobile organizers could see + manage co-host org assignments on the dashboard and event detail screen; web had no surface for either. This meant cohost admins couldn't even reach the events they had W3-B1 access to (no dashboard listing → no URL to navigate to).

**Fix:**

- **Server (`apps/web/app/api/organizer/data/route.ts`):** Added a second SELECT against `event_assignments` keyed on `cohost_organization_id = organization.id`, with a lighter event subset (no purchases / promo codes / bank-transfer orders — cohost scope intentionally narrower). Returns `cohost_events: { assignment_id, owner_org_name, owner_org_slug, event }[]` alongside the existing `events` array.
- **Hook + types (`apps/web/app/lib/hooks/useOrganizerData.ts`):** New `CohostEventEntry` interface; `OrganizerData.cohost_events?: CohostEventEntry[]`.
- **Dashboard (`OrganizerAdminView.tsx`):** Merges primary + cohost events for the unified list with a `cohostBadgeMap` (`event_id → "Co-host with {owner-org-name}"`). Passes the badge to `EventRow`, which stacks it above the RSVP pill in the absolute top-right badge column (see §10.1).
- **Cohost management modal (`apps/web/app/components/organizer/CoHostAssignmentModal.tsx`):** New web port of mobile `CoHostAssignmentSheet`. Shows current cohosts + remove buttons, debounced approved-org search via the anon client (RLS already publishes approved orgs), and add/remove via two new API routes:
  - `GET /api/organizations/[id]/cohost-assignments?event_id=X` — list current cohosts for an event.
  - `POST` — `{ eventId, cohostOrgId }`, owner/admin only.
  - `DELETE ?id=<assignmentId>` — owner/admin only.
- **Event detail (`OrgEventDetailClient.tsx`):** New "Co-hosts" inline trigger card under the event title (mirrors mobile's row pattern), opens the modal. Shows current count.

#### 10.3 Public profile cohost visibility (web + mobile)

**Symptom:** Discover → organizer profile only listed events the org *owned*. Events the org co-hosted appeared under the owning org's profile, but not under the cohost's, breaking the "list everything this organizer is involved in" expectation set by Eventbrite / Luma.

**Fix:**

- **DB / RLS — new migration `20260519_public_cohost_assignments_for_published_events.sql`:** Added `"Anyone can view cohost links for published events"` SELECT policy on `event_assignments` (`TO public USING (cohost_organization_id IS NOT NULL AND event_id IN (SELECT id FROM events WHERE status = 'published'))`). Cohost links for published events are already public information (rendered on the public event card + organizer profile), so exposing the row doesn't leak anything new. Existing "Org members can view event assignments" policy remains in place for all other rows. **Apply via Supabase MCP and rename to the remote-assigned timestamp** (same workflow as §9.2).
- **Web (`apps/web/app/organizer/[slug]/page.tsx`):** Replaced `.eq("organization_id", org.id)` with an OR that includes events in `event_assignments.cohost_organization_id = org.id`. Uses `supabaseAdmin` (already RLS-bypassing) so it works regardless of the new policy, but the new policy backs the mobile path.
- **Mobile (`apps/mobile/app/organizer/[slug].tsx` + new `useOrgCohostEventIds.ts` + `usePastOrgEvents.ts`):** New `useOrgCohostEventIds(orgId)` hook reads `event_assignments.cohost_organization_id = orgId` via the anon client (newly possible thanks to the RLS policy above). Profile screen merges owner-slug-matched events with id-in-cohost-set events for the current list. `usePastOrgEvents` extended with the same OR pattern for the past-events accordion.

**Files (this entry):**

- `apps/web/app/components/organizer/OrganizerAdminView.tsx`, `apps/web/app/components/OrganizerDashboard.tsx`, `apps/web/app/api/organizer/data/route.ts`, `apps/web/app/lib/hooks/useOrganizerData.ts` — cohost data + dashboard render
- `apps/web/app/api/organizations/[id]/cohost-assignments/route.ts` (new), `apps/web/app/components/organizer/CoHostAssignmentModal.tsx` (new), `apps/web/app/organizer/event/[id]/OrgEventDetailClient.tsx` — cohost management surface
- `apps/web/app/organizer/[slug]/page.tsx`, `apps/mobile/app/organizer/[slug].tsx`, `apps/mobile/hooks/useOrgCohostEventIds.ts` (new), `apps/mobile/hooks/usePastOrgEvents.ts` — public profile cohost visibility
- `apps/mobile/components/org-dashboard/OrgEventCard.tsx`, `apps/mobile/components/org-dashboard/EventInfoHeader.tsx` — badge restyle
- `supabase/migrations/20260519_public_cohost_assignments_for_published_events.sql` (new — apply via MCP, rename locally to remote timestamp)

**Web Parity Gate notes:**

- Web cohost-management surface is intentionally narrower than primary-org surface (no purchases / promo / bank-transfer access for cohost events) — matches mobile semantics and W3-B1 scope.
- Public profile cohost visibility is purely additive — existing owner-only filtering remains a strict subset of the new union.

---

### 11. Cohost UX polish round 2 — instant SSR cohost data + bi-directional owner badges + cohost event-detail / RSVP access (May 19, 2026)

QA on §10 surfaced four gaps that all stemmed from cohost data not being available everywhere it needed to be on web, plus a flash-of-empty-state on mobile. Shipped together because they share the same underlying data plumbing.

#### 11.1 Mobile public profile — skeleton instead of "No events" flash for cohost-only orgs

**Symptom:** Tapping into the public profile of an org that owns zero events but co-hosts one (e.g. FLAME events) briefly rendered "No current or upcoming events" before the cohost events resolved. Owned events from owner-orgs appeared instantly because `useAppEvents` is the app-wide query (prefetched, cached); the cohost-event-IDs lookup was per-org and added 100–300ms.

**Fix ([`apps/mobile/app/organizer/[slug].tsx`](../../apps/mobile/app/organizer/%5Bslug%5D.tsx)):** Destructured `isLoading` from `useOrgCohostEventIds`. When the cohost-id query is still in flight AND `filteredEvents.length === 0`, render two `Skeleton` blocks sized to event cards instead of the empty-state copy. Matches the Instagram / X / Luma pattern of "preserve perceived structure while loading."

#### 11.2 Web SSR — prefetch cohost events + owner-side cohost assignments

**Symptom:** On a cohost org's dashboard, cohosted events appeared empty for ~15s after every page load. The `initialData` shipped from SSR only contained primary events; `cohost_events` was only filled in by the 15s polling refetch. `refetchOnMount: false` made the wait-for-poll unavoidable.

**Fix ([`apps/web/app/organizer/page.tsx`](../../apps/web/app/organizer/page.tsx) + [`apps/web/app/components/OrganizerDashboard.tsx`](../../apps/web/app/components/OrganizerDashboard.tsx)):** Mirrored the `event_assignments` queries from `/api/organizer/data` into the SSR layer — both the cohost-events fetch (where this org IS a cohost) and the owner-side assignments fetch (where this org OWNS events with cohosts assigned out). Threaded both through `OrganizerDashboard` props as `initialCohostEvents` + `initialOwnerCohostAssignments` and seeded React Query's `initialData` with them. Cohost dashboards now render instantly on first paint; the 15s polling remains for incremental updates.

#### 11.3 Web dashboard — owner-side "Co-host with X" pills (bi-directional badge map)

**Symptom:** Owner orgs didn't see any pill on events they had assigned co-hosts to. Mobile correctly renders "Co-host with X" on those events via `useEventAssignments(orgId)` → `cohostBadgeMap`. The web `OrganizerAdminView` only rendered the *cohost-side* labels (from `cohost_events`), missing the owner side.

**Fix:**

- **API ([`apps/web/app/api/organizer/data/route.ts`](../../apps/web/app/api/organizer/data/route.ts)):** Added `owner_cohost_assignments: { event_id, cohost_org_name }[]` to the response — fetched via `event_assignments` WHERE `organization_id = currentOrg AND cohost_organization_id IS NOT NULL`.
- **Types ([`apps/web/app/lib/hooks/useOrganizerData.ts`](../../apps/web/app/lib/hooks/useOrganizerData.ts)):** New `OwnerCohostAssignment` interface, exported alongside `CohostEventEntry`.
- **Dashboard ([`OrganizerAdminView.tsx`](../../apps/web/app/components/organizer/OrganizerAdminView.tsx)):** Extended `cohostBadgeMap` to merge both directions: cohort-side entries label as `"Co-host with {owner-org-name}"`, owner-side entries label as `"Co-host with {cohort-org-name(s)}"`. Multiple cohorts on the same event collapse into one pill (`"Co-host with A & B"`).

#### 11.4 Web event detail — fallback to cohost_events on lookup

**Symptom:** Clicking an event from a cohost org's dashboard rendered "event not found." [`OrgEventDetailClient.tsx`](../../apps/web/app/organizer/event/%5Bid%5D/OrgEventDetailClient.tsx) looked up the event via `data?.events?.find(...)`, which is the owner-only list — cohosted events live in `data?.cohost_events`.

**Fix:** Extended the `event` `useMemo` to fall back to `data?.cohost_events?.find(c => c.event.id === eventId)?.event` when the primary lookup misses. Known limitation noted: a cohost user landing on the event detail page sees the same UI as an owner (Edit / Send Tickets / Promo Codes buttons are visible) but those mutations will 403 at the API layer. Cleaner per-action gating is a follow-up.

#### 11.5 Web RSVPs tab — merge cohost events into the list

**Symptom:** Cohost admins clicking the "RSVPs" tab saw nothing, even when the cohosted event had `requires_rsvp = true` and pending requests. [`RsvpsView`](../../apps/web/app/components/organizer/RsvpsView.tsx) filtered only `events` (owner-side).

**Fix:** Added `cohostEvents?: CohostEventEntry[]` prop, merged into the base list (Map-deduped by id) before applying the `requires_rsvp === true` filter. Wired through from `OrganizerDashboard.tsx`.

#### 11.6 Industry-standard note on the 15s incremental delay

The remaining 15s gap is the existing `refetchInterval: 15000` polling on the dashboard. When the owner adds a cohost while the cohost-org user is *already* on their dashboard, that user waits up to 15s for the next poll cycle. This is consistent with Stripe Dashboard (~30s), Luma (~15s) — none push instantly without dedicated realtime/push infra. Lowering further would add server load without a clear UX win. Leaving as-is; documented for future-self.

**Files (this entry):**

- `apps/mobile/app/organizer/[slug].tsx` — skeleton on cohort-id load
- `apps/web/app/organizer/page.tsx` — SSR cohort + owner-cohost prefetch
- `apps/web/app/components/OrganizerDashboard.tsx`, `apps/web/app/lib/hooks/useOrganizerData.ts` — initialData plumbing + new `OwnerCohostAssignment` type
- `apps/web/app/api/organizer/data/route.ts` — owner-side cohost assignments field
- `apps/web/app/components/organizer/OrganizerAdminView.tsx` — bi-directional badge map
- `apps/web/app/organizer/event/[id]/OrgEventDetailClient.tsx` — cohort fallback lookup
- `apps/web/app/components/organizer/RsvpsView.tsx` — cohost merge

---

### 12. Cohost UX polish round 3 — skeleton shape, missing SSR prop, queryKey collision, cohost enrichment, profile event count (May 19, 2026)

Five bugs surfaced in QA after §11. Compact entry because most are tiny.

#### 12.1 Mobile profile skeleton — match EventGrid shape

§11.1 used two `h-[240px]` blocks which didn't visually match the 2-column `aspect-square` cards that actually render. Replaced with a new `EventGridSkeleton` that mirrors `EventGrid` exactly (same 2-col layout, aspect-square image placeholder, title + date line skeletons). Layout no longer shifts when real cards swap in. ([`apps/mobile/app/organizer/[slug].tsx`](../../apps/mobile/app/organizer/%5Bslug%5D.tsx))

#### 12.2 Web SSR — missing `initialOwnerCohostAssignments` on second render path

`apps/web/app/organizer/page.tsx` has two `<OrganizerDashboard>` renders (one for the empty-events early-return, one for the full path). §11.3 only added `initialOwnerCohostAssignments` to the first. Added to the second so owner-side cohost pills work on dashboards that have events too.

#### 12.3 Cohost modal TypeError — queryKey collision

[`OrgEventDetailClient.tsx`](../../apps/web/app/organizer/event/%5Bid%5D/OrgEventDetailClient.tsx)'s `cohostsQuery` and [`CoHostAssignmentModal.tsx`](../../apps/web/app/components/organizer/CoHostAssignmentModal.tsx)'s `useEventCohosts` shared the same `["cohost-assignments", orgId, eventId]` queryKey but had different `queryFn` return shapes — one returned `{ assignments: [...] }`, the other returned the array directly. React Query cached whichever fetched first; the other component crashed with `TypeError: ... .map is not a function`. Aligned both queryFns to return `Array<{ id }>` (modal reads `.map`, detail reads `.length`).

#### 12.4 Cohost events — attendees + RSVP counts

Cohost event cards rendered "0 attendees" and the RSVPs tab showed "0 pending" because the cohost API path returned events without the enrichment pass that primary events get. Cohost users couldn't see real numbers even though they had W3-B1 access.

**Fix ([`/api/organizer/data/route.ts`](../../apps/web/app/api/organizer/data/route.ts) + [`/organizer/page.tsx`](../../apps/web/app/organizer/page.tsx)):** After collecting `cohostEvents`, batch-fetch `rsvps` filtered to those event IDs, group counts by event_id, compute `totalAttendees` from `ticket_tiers.quantity_sold`, and attach `pending_rsvps` / `approved_rsvps` / `rejected_rsvps` / `purchased_rsvps` / `totalAttendees` per event. Same logic mirrored in SSR so first-paint is also correct. Revenue + purchase rows intentionally still excluded — cohost scope stays narrower than owner.

#### 12.5 Profile "N events" pill includes cohosted

[`/api/organizations/route.ts`](../../apps/web/app/api/organizations/route.ts) (web) and [`useUserOrgs.ts`](../../apps/mobile/hooks/useUserOrgs.ts) (mobile) only counted `events(count)` (owned). An org that cohosts but owns nothing showed "0 events" on the user's profile page even though the dashboard correctly listed the cohosted event. Added a batch `event_assignments` count keyed on `cohost_organization_id` per org, summed into `eventCount`. Matches what the dashboard renders.

#### 12.6 Dashboard "Total Events" stat

[`OrganizerAdminView.tsx`](../../apps/web/app/components/organizer/OrganizerAdminView.tsx) `totalEvents` derived from `scopedEvents.length` (owner-only). Switched to `allScopedEvents.length` (owner + cohost merged), matching the list rendered below.

**Files (this entry):**

- `apps/mobile/app/organizer/[slug].tsx` (skeleton shape)
- `apps/web/app/organizer/page.tsx` (SSR fixes — second return path + cohost enrichment)
- `apps/web/app/organizer/event/[id]/OrgEventDetailClient.tsx` (queryKey shape fix)
- `apps/web/app/api/organizer/data/route.ts` (cohost enrichment)
- `apps/web/app/api/organizations/route.ts`, `apps/mobile/hooks/useUserOrgs.ts` (profile event count)
- `apps/web/app/components/organizer/OrganizerAdminView.tsx` (Total Events stat)

---

### 13. Cohost UX polish round 4 — RSVPs tab stale on back-nav, past-events skeleton, web team assignment includes cohost events (May 20, 2026)

Final three items from QA.

#### 13.1 Mobile profile — past-events skeleton (follow-up to §12.1)

§12.1 added a skeleton for the current-events grid but missed the past-events accordion. For cohost-only orgs whose only events are *past* cohosted ones, the accordion didn't render at all until `usePastOrgEvents` resolved. Fixed by destructuring `isLoading` from the hook and rendering a `Skeleton` label + `EventGridSkeleton count={2}` when `pastEventsLoading && filteredPastEvents.length === 0`. ([`apps/mobile/app/organizer/[slug].tsx`](../../apps/mobile/app/organizer/%5Bslug%5D.tsx))

#### 13.2 Web RSVPs tab — empty after back-navigation from RSVP detail

**Symptom:** Cohost org admin on `/organizer?org=cohort-slug&tab=rsvps` clicks an event → views RSVP detail → "Go Back" → tab now shows "No events with RSVPs yet" even though the events were there before.

**Root cause:** The `MemberRoleContext.selectedOrgId` sync useEffect lived inside `OrganizerAdminView` (the Dashboard tab). When the user lands directly on the RSVPs tab — including via "Go Back" from `/organizer/rsvps/[id]` — `OrganizerAdminView` doesn't mount, the sync never fires, `selectedOrgId` stays stale, `isRoleSynced` is false in `RsvpsView`, and `assignedEventIds === null` returns an empty list.

**Fix:** Hoisted the sync into the parent [`OrganizerDashboard`](../../apps/web/app/components/OrganizerDashboard.tsx) so it runs regardless of which tab is active. Removed the duplicate from `OrganizerAdminView`.

#### 13.3 Web team assignment — cohost events are now assignable

**Symptom:** Mobile's `EventAssignmentSheet` lists both owned + cohosted events for a team member (via `useOrgEvents`, which unions both). Web's `AssignEventsModal` only queried `data.events` from `/api/organizer/data` and missed `data.cohost_events`, so a Hush admin couldn't scope a Hush organizer to a specific Yacht Club cohort event from the web team page.

**Fix ([`OrganizerTeamView.tsx::AssignEventsModal`](../../apps/web/app/components/organizer/OrganizerTeamView.tsx)):** Merged `cohost_events` into the assignable list, deduping by id, and added a small blue "Co-host" pill (`#238FDA`, matches the dashboard cohort badge) so admins can tell which events are cohort vs owned. The existing `PUT /api/organizations/[id]/event-assignments` endpoint already accepts any event IDs — no API change needed.

**Files (this entry):**

- `apps/mobile/app/organizer/[slug].tsx` (past-events skeleton)
- `apps/web/app/components/OrganizerDashboard.tsx` (selectedOrgId sync hoisted)
- `apps/web/app/components/organizer/OrganizerAdminView.tsx` (sync removed)
- `apps/web/app/components/organizer/OrganizerTeamView.tsx` (cohort events in assign modal)

### 14. Cohost UX polish round 5 — PR review fixes: response-shape consistency + public-page draft leak (May 20, 2026)

Triage of the second auto-review pass on the §10–§13 cohost work. Of 11 comments, two found real bugs; the rest were either silent-fallback paranoia or a 15+ call-site color-token refactor that doesn't belong in this PR.

#### 14.1 `/api/organizer/data` final return missing `owner_cohost_assignments`

**Symptom:** §12.4 added `owner_cohost_assignments` to the early-return branch (org has zero owned events). The normal branch — the common case — never sent it. Web `OrganizerAdminView` reads this for owner-side "Co-host with X" pills on owned events; it was silently getting the `[]` initialData fallback in every typical org session, masking the §10.x owner-side badge work.

**Fix ([`apps/web/app/api/organizer/data/route.ts`](../../apps/web/app/api/organizer/data/route.ts)):** Added `owner_cohost_assignments: ownerCohostAssignments` to the final `NextResponse.json` so both branches return the same shape.

#### 14.2 Public organizer page — drafts leak

**Symptom:** [`apps/web/app/organizer/[slug]/page.tsx`](../../apps/web/app/organizer/[slug]/page.tsx) builds the events query without a status filter. Every other public surface in the app (`page.tsx`, `discover/page.tsx`, `events/page.tsx`, `events/[slug]/page.tsx`, `sitemap.ts`, `api/events`, `api/holds/create`, `api/qr-scanner/validate-code`, `api/rsvp`, `api/cron/event-reminders`, slug-uniqueness checks) uses `.eq("status", "published")`. This one didn't, so a draft event on an approved org would appear on the org's public profile.

**Fix:** Added `.eq("status", "published")` to the shared query builder before the two branch terminations (cohost-OR vs. owner-eq). Both branches inherit the filter.

#### 14.3 Comments skipped/deferred

- **Cohost blue (`#238FDA`) → design token** (3 comments — `OrgEventCard`, `CoHostAssignmentModal`, `OrganizerTeamView`): Deferred to [`NITPICKS_TODOS.md`](../todos/NITPICKS_TODOS.md). The hex appears in 15+ places across web and mobile (admin role chip, pending-ticket state, cohort badges). Fixing 3 files in isolation makes the codebase *less* consistent, not more — needs a single follow-up sweep that introduces `flameColors.cohost` (or `adminBlue`) and converts all call sites in one go.
- **Logger calls on Supabase `error` returns** (5 comments — `cohostRows`, `cohostAssignments`, `ownerSideAssignments`, `cohostRsvpRows`, public-page `cohostRows`): Skipped. Every flagged site has a deliberate `?? []` fallback because the downstream consumer is a *supplementary* count or pill — not load-bearing data. Throwing/500-ing here would block the entire org list or dashboard over a transient retry-exhausted query for a count discrepancy. The retry wrapper itself logs the underlying error on exhaustion.
- **`callerUser is null` structured log** (1 comment — `cohost-assignments` route): Skipped. The route returns a clean 404; a valid Clerk JWT without a Supabase user just means user-sync hasn't run yet, which is an expected first-load race, not a server fault.

**Files (this entry):**

- `apps/web/app/api/organizer/data/route.ts` (final return now includes `owner_cohost_assignments`)
- `apps/web/app/organizer/[slug]/page.tsx` (status=published filter on public events)
- `docs/historico/todos/NITPICKS_TODOS.md` (logged cohost-blue token sweep)

### 15. Cohost UX polish round 6 — PR review fixes: stale pull-to-refresh, dialog a11y, cohost-view Manage button (May 20, 2026)

Third auto-review pass on the §10–§14 cohost work. Of 11 comments (7 inline + 4 nitpick), three flagged real issues; the rest repeated the round-1/round-2 silent-fallback paranoia or the deferred `#238FDA` token sweep.

#### 15.1 Mobile profile pull-to-refresh leaves cohost membership stale

**Symptom:** [`apps/mobile/app/organizer/[slug].tsx`](../../apps/mobile/app/organizer/[slug].tsx) reads `useOrgCohostEventIds(org?.id)` for the set of event IDs to merge into the org's profile, but `handleRefresh` only awaited the three primary queries (`refetch`, `refetchOrganizations`, `refetchPastEvents`). A cohost gained/lost on another device wouldn't surface until the 5-min React Query staleTime elapsed.

**Fix:** Destructure `refetch: refetchCohostEventIds` from the hook and add it to the `Promise.all` (guarded on `org?.id` like `refetchPastEvents`), with a matching dependency in the `useCallback` array.

#### 15.2 `CoHostAssignmentModal` missing dialog semantics + Escape handling

**Symptom:** The modal was the only one in the web app skipping the shared a11y pattern used by `EditTicketTierModal`, `QRScannerModal`, `EnterCodeModal`, `OnboardingModal`, and `RegistrationFormModal`. Keyboard-only users couldn't press Escape to close, and screen readers got a generic `<div>` without modal context.

**Fix ([`CoHostAssignmentModal.tsx`](../../apps/web/app/components/organizer/CoHostAssignmentModal.tsx)):**
- Added `role="dialog"`, `aria-modal="true"`, `aria-labelledby="cohost-modal-title"` to the inner panel, with a matching `id` on the `<h2>`.
- Added an `Escape` keydown listener (registered only while `open`) that calls `onClose`.
- Skipped explicit focus-trap — no other modal in the codebase implements one; doing it here in isolation would diverge from the established pattern. Worth a single sweep across all modals if a11y audit returns to focus management later.

#### 15.3 `OrgEventDetailClient` showed owner-only Manage button to cohost views

**Symptom:** When a cohost-org user navigated to a cohort event, `OrgEventDetailClient` rendered the "Co-hosts → Manage" button. Clicking it opened `CoHostAssignmentModal`, whose POST to `/api/organizations/[id]/cohost-assignments` then 404s ("Event not found in this organization") because that endpoint requires the event to be owned by the requesting org. The action was reachable but always broken.

**Fix:** Computed `isOwnerOrg = event.organization_id === data?.organization?.id` (cohort events ship the owner's `organization_id` via `data.cohost_events`, which differs from the selected `data.organization.id`). Gated both the Co-hosts row render and the modal mount on `isOwnerOrg`. API gating was already correct — this just hides UI that was never usable in cohost context.

#### 15.4 Comments skipped/deferred

- **Supabase error checks on cohort lookups** (4 comments — `usePastOrgEvents`, `useUserOrgs`, public `[slug]/page.tsx`, SSR `organizer/page.tsx` queries): Skipped. Identical to §14.3 — every site has a deliberate `?? []` fallback for supplementary data (cohort count pill, cohost-merge OR clause, first-paint enrichment). Throwing here would 500 the dashboard or break the user-org list over a count discrepancy, when the client-side query refetch already covers transient failures.
- **Cohost blue `#238FDA` token** (4 nitpicks — `OrgEventCard`, `CoHostAssignmentModal`, `OrganizerAdminView`, `OrganizerTeamView`): Skipped — already deferred in §14.3 with a single follow-up sweep logged in [`NITPICKS_TODOS.md`](../todos/NITPICKS_TODOS.md). Re-flagging individual files doesn't change the decision; 15+ call sites need to convert together to avoid further fragmentation.

**Files (this entry):**

- `apps/mobile/app/organizer/[slug].tsx` (refetchCohostEventIds added to handleRefresh)
- `apps/web/app/components/organizer/CoHostAssignmentModal.tsx` (dialog semantics + Escape)
- `apps/web/app/organizer/event/[id]/OrgEventDetailClient.tsx` (isOwnerOrg gate on Manage button + modal)

### 16. Mobile organizer profile — Luma-style card-grid skeleton for current events, no skeleton for past (May 20, 2026)

**Symptom:** Iterated through three skeleton shapes for the organizer profile events sections. (1) Original: 2 card skeletons each for current + past = 4 placeholders, promising content for orgs that often had zero past events. (2) Slim `h-14 w-full` bars in both sections — felt disconnected from the actual content shape (grid). (3) No skeleton at all (deferred render) — felt like a stall on cohost-only orgs while `event_assignments` resolved.

**Fix ([`apps/mobile/app/organizer/[slug].tsx`](../../apps/mobile/app/organizer/[slug].tsx)):** Landed on the Luma / Eventbrite pattern:
- **Current events:** `EventGridSkeleton count={2}` (2-col, aspect-square image + title + date lines) gated on `cohostIdsLoading && filteredEvents.length === 0`. Matches the actual `EventGrid` shape so the swap-in is invisible. Only triggers for cohost-only orgs (where `data.allEvents` filtered by slug returns nothing until cohost merge); orgs with owned events skip the skeleton entirely.
- **Past events:** No skeleton. The `PastItemsAccordion` only mounts when it has content. An empty-section placeholder would mislead the common-case org with zero past events, and the collapsed accordion footprint is small enough that pop-in is unobtrusive.

Removed `pastEventsLoading` destructure (no longer referenced); `EventGridSkeleton` helper restored.

**Why this lands here:** Card-grid skeleton on the primary section matches Luma, Eventbrite, Airbnb, Ticketmaster — users are conditioned to read it as "content is loading in the actual shape." The brief "2 cards → empty state" flash only affects the narrow cohost-only-org case where the merge is genuinely in flight. Past events being secondary and often-empty justifies skipping the placeholder there.

**Files (this entry):**

- `apps/mobile/app/organizer/[slug].tsx` (current-events grid skeleton, past-events skeleton removed, `pastEventsLoading` dropped, `EventGridSkeleton` helper restored)

### 17. W3-B2 — Google Maps city autocomplete on web (May 20, 2026)

**Issue:** Web organizer event forms accepted free-text city entry (`<input type="text">`). Mobile shipped Google Places `(cities)` autocomplete in `apps/mobile/components/create-event/CityAutocompleteField.tsx`, so city values diverged by platform (typos, casing, "CDMX" vs. "Mexico City", etc.).

**Fix:** Ported the mobile pattern to web with a server-proxied API route so the Google key stays out of the browser.

**Server proxy ([`apps/web/app/api/places/autocomplete/route.ts`](../../apps/web/app/api/places/autocomplete/route.ts)):** New `GET /api/places/autocomplete?input=...` route. Reads `GOOGLE_PLACES_API_KEY` (server-only, no `NEXT_PUBLIC_` prefix), forwards to Google Places Autocomplete REST with `types=(cities)&language=en`, and returns a trimmed `{ predictions: [{ place_id, description, structured_formatting: { main_text, secondary_text } }] }` shape. In-memory per-IP throttle (30 req / 60s) to cap runaway billing if a client misbehaves. Returns 502 on upstream non-OK status (e.g. `OVER_QUERY_LIMIT`, `REQUEST_DENIED`); returns empty predictions for inputs shorter than 2 chars without round-tripping Google.

**Client component ([`apps/web/app/components/organizer/CityAutocompleteField.tsx`](../../apps/web/app/components/organizer/CityAutocompleteField.tsx)):** Drop-in replacement for the previous plain `<input>` — accepts the same `className`, `placeholder`, `id`, `required`, `disabled`, plus `value` / `onChange(city: string)`. 300ms debounce, AbortController so stale responses don't overwrite fresh ones, dropdown anchored absolutely below the input (z-50, scroll on overflow). `onMouseDown` + `preventDefault` for selection so blur doesn't fire before the click registers; 150ms blur delay otherwise. Loading spinner inline-right while a request is in flight.

**Wire-in:** Replaced the three remaining plain-input city fields on web:

- `apps/web/app/components/forms/CreateEventForm.tsx` (create flow)
- `apps/web/app/organizer/event/[id]/OrgEventDetailClient.tsx` (event-detail inline edit)
- `apps/web/app/components/organizer/EventsTiersView.tsx` (×2 — mobile-breakpoint edit row and desktop edit row)

All four call sites use the same `bg-white-5 border border-white-20 rounded-{card|xl}` styling the previous input had, so the visual swap is invisible. Free-typed values still submit on form save (the autocomplete suggests; it doesn't force a selection), matching mobile behavior.

**Env:** New required env var `GOOGLE_PLACES_API_KEY` on the web side. Distinct from mobile's `EXPO_PUBLIC_GOOGLE_PLACES_API_KEY` because the two keys carry different restrictions in the Google Cloud console — the web key is server-IP-allowlisted (Vercel egress IPs), the mobile key is app-bundle-allowlisted. Must be added to `apps/web/.env.local` for local dev and to Vercel project env for production.

**Files (this entry):**

- `apps/web/app/api/places/autocomplete/route.ts` (new server proxy)
- `apps/web/app/components/organizer/CityAutocompleteField.tsx` (new client component)
- `apps/web/app/components/forms/CreateEventForm.tsx` (wire-in)
- `apps/web/app/organizer/event/[id]/OrgEventDetailClient.tsx` (wire-in)
- `apps/web/app/components/organizer/EventsTiersView.tsx` (wire-in, ×2 surfaces)

**Deferred follow-ups:** Combobox ARIA + keyboard navigation (ArrowUp/Down/Enter/Escape, `role="combobox"`, `aria-expanded`, `aria-activedescendant`, focused-index state) tracked in `docs/historico/todos/ACCESSIBILITY_TODOS.md` under the W3-B2 section. Shared rate-limit store (Upstash) tracked in `docs/historico/todos/NITPICKS_TODOS.md` with explicit revisit trigger.

### 18. Stripe Connect status drift — self-healing status route, mobile foreground polling, return-route auth tolerance, webhook visibility (May 26, 2026)

**Symptom:** A real organization (Organization `<REDACTED>`, Stripe account `<REDACTED_ID>`, owner `<REDACTED_EMAIL>`) finished Stripe Connect onboarding via the mobile app. Stripe's Connected Accounts dashboard showed the account as Enabled (charges + payouts both active), but our app continued to show "Stripe not connected". Direct DB inspection confirmed the row had the correct `stripe_account_id` written but `stripe_charges_enabled = false` and `stripe_payouts_enabled = false`. A one-off `UPDATE organizations SET stripe_charges_enabled = true, stripe_payouts_enabled = true` patched the affected org immediately; this entry covers the systemic fixes so we don't have to patch again.

**Root cause — four compounding gaps in the mobile onboarding loop:**

1. **Return route required a Clerk browser session.** `/api/stripe/connect/return` called `auth()` and redirected to `/sign-in` if no `userId`. Web users complete onboarding inside the same browser tab (Clerk cookie present) so it worked there. Mobile uses `Linking.openURL()`, which opens **Safari** with no Clerk session → return route redirected to sign-in → DB sync at the bottom of the route never ran. Webhook was the only remaining sync mechanism.
2. **Webhook silently skipped unknown accounts.** `handleAccountUpdated` did `console.log("No organization found…"); return;` when the org lookup by `stripe_account_id` returned `null`. This is the expected case during an onboarding race (Stripe fires `account.updated` immediately on account creation, sometimes before our `UPDATE organizations SET stripe_account_id = ?` write commits), but the log level meant we had zero visibility into how often it happened or whether the later `account.updated` events (post-onboarding) actually landed.
3. **Status route was a pure DB read.** `GET /api/stripe/connect/status` returned the cached booleans verbatim. Once they were stale, no read path corrected them — the user could refresh, pull-to-refresh, navigate away and back, and still see "not connected".
4. **Mobile didn't poll on foreground resume.** `Linking.openURL()` sends the app to background; the user finishes onboarding in Safari and switches back. The standard mobile pattern (Uber / DoorDash / Lyft for driver onboarding) is to listen for `AppState` going `background` → `active` and refetch status. `useStripeConnect` only fetched on mount + manual `refreshStatus()`. The user would land back in the org dashboard and the banner would still say "Action Required" until they backed out and re-entered.

**Fix — four coordinated changes:**

#### 18.1 Self-healing status route (cache-aside pattern)

`apps/web/app/api/stripe/connect/status/route.ts` now treats the DB as a cache, not the source of truth. When the org has a `stripe_account_id` **AND** either cached boolean is still `false`, the route calls `getAccountStatus(stripe_account_id)` (live Stripe retrieve), updates the DB row if the values differ, and returns the fresh values. Once both booleans are `true` (steady state) the live call is skipped — this naturally rate-limits Stripe API calls to "until first-fully-enabled" per account. Pattern matches Stripe Dashboard's own behavior of trusting the live account state over any cache.

The DB update is gated by `.eq("id", organizationId).eq("stripe_account_id", account.stripe_account_id)` (optimistic lock) so a concurrent account swap on the same org row can't be clobbered.

**Response uses live values even if the DB persist fails** (caught during PR review). Cache-aside semantics: the live Stripe read is the source of truth; the DB write is a best-effort persist. If the `UPDATE` returns an error we log it but still return the live `chargesEnabled` / `payoutsEnabled` to the caller — otherwise a transient DB-write failure would leave the UI showing "Action Required" for an account Stripe just told us is enabled. The next status call will retry the persist since the cache is still stale.

This is the **primary** fix — it's what would have caught the affected org without any manual intervention. Every other change in this entry is supporting infrastructure that makes the experience smoother or more observable.

#### 18.2 Return route tolerates missing Clerk session

`apps/web/app/api/stripe/connect/return/route.ts` now treats Clerk auth as best-effort. If `auth()` returns a `userId`, the existing membership + role checks still run. If not (mobile flow through Safari), we log "Unauthenticated connect return (mobile onboarding flow)" and proceed to the DB sync.

The security boundary is preserved by two checks:

1. The existing `accountId` ↔ DB-row match check (`if (org.stripe_account_id && org.stripe_account_id !== accountId)` rejects mismatches) — for orgs that already have a `stripe_account_id`, only the legitimate one can be passed in the URL.
2. **A new first-time-binding guard** (added during PR review): if `org.stripe_account_id` is null AND there is no authenticated `userId`, the route refuses to write the URL-supplied `accountId` and redirects to sign-in. Without this guard, an unauthenticated attacker could pass their own `accountId` for any unconnected target org and bind it on the org's behalf, hijacking future payouts. The unauthenticated branch exists only to let mobile-Safari users re-sync the booleans of an **already-bound** account — never to bind a new one. (This was a regression introduced earlier in the same PR; caught and fixed during review.)

This change is partly redundant with 18.1 (the status route will heal the same drift on the next mobile poll), but it cleans up the Safari-side UX so the bounce page lands on the organizer page instead of a sign-in screen the user will never see anyway.

#### 18.3 Webhook handler — warn loudly instead of skipping silently

`handleAccountUpdated` in `apps/web/app/api/webhooks/stripe/route.ts` replaces `console.log("No organization found …")` with `console.warn(...)` plus structured context (`accountId`, live `chargesEnabled` / `payoutsEnabled` / `detailsSubmitted`, an explanation of the two expected causes). Warn-level shows up in our error monitoring; info-level disappeared into the noise. We still return 200 so Stripe doesn't retry an unresolvable event forever.

#### 18.4 Mobile foreground-resume polling

`apps/mobile/hooks/useStripeConnect.ts` now subscribes to `AppState` and calls `invalidateStatus()` whenever the app returns from `background` / `inactive` → `active`. The subscription is conditional: it's a noop once `connected && chargesEnabled && payoutsEnabled` are all true, which avoids unnecessary refetches on every app resume for steady-state accounts (the common case after onboarding is done).

This is the single highest-leverage UX fix: after onboarding in Safari, the user switches back to the app and the banner flips to "Connected" within ~1 second (driven by the status route's self-heal) without any pull-to-refresh or navigation gesture.

#### Deferred — reconciliation cron (`/api/cron/reconcile-stripe-connect`)

A periodic reconciliation cron (call `accounts.list()` / `accounts.retrieve()`, diff against the DB, sync any drift) is the canonical "fifth layer" for Stripe Connect integrations. Intentionally **not shipped** in this PR — the four layers above cover every realistic case (the org owner always opens the settings screen at some point, which triggers 18.1's self-heal). If we ever see repeated drift complaints that 18.1–18.4 don't catch, the cron is the next step. Manual reconciliation in the meantime can be done via the Supabase MCP + Stripe Dashboard, as we did for the original affected org.

**Why this is industry standard (per `project-flame-master.mdc` Section 3 — Industry Standards Benchmarking):**

- **Cache-aside on status reads** matches Stripe Dashboard's own pattern — never trust a cached enabled-flag without optional revalidation against the live account.
- **Foreground-resume refetch for OAuth-style mobile flows** is what Uber / DoorDash / Lyft do for driver onboarding and what Airbnb does for host Stripe connect. The user's "switch back to the app" gesture is the strongest possible signal that something changed externally.
- **Warn-level logging on unknown-account webhooks** matches PagerDuty / Datadog best practice — every "this should never happen, but if it does we want to know" branch logs above the noise floor.

**Defense-in-depth summary:** Mobile user finishes onboarding → (a) Stripe redirects to return route, which now syncs the DB even without a Clerk session → (b) Stripe fires `account.updated` webhook, which updates the DB if (a) didn't reach it first → (c) user returns to app, `AppState` foreground listener invalidates the status query → (d) status route fetches live from Stripe and self-heals any remaining drift. Four independent layers; manual DB patch via Supabase MCP is the explicit fallback if all four somehow fail.

**Deferred:** Embedded Connect Components / Stripe React Native SDK in-app onboarding (would eliminate the Safari round-trip entirely). Tracked as a Phase 6+ improvement — not blocking, and the current redirect flow is still officially supported by Stripe.

**Files:**

- `apps/web/app/api/stripe/connect/status/route.ts` (self-healing read)
- `apps/web/app/api/stripe/connect/return/route.ts` (auth-optional)
- `apps/web/app/api/webhooks/stripe/route.ts` (`handleAccountUpdated` warn-level log)
- `apps/mobile/hooks/useStripeConnect.ts` (`AppState` foreground polling)

---

### 19. Orphaned authorized PaymentIntent left in `requires_capture` — `payment_intent.amount_capturable_updated` webhook visibility (May 26, 2026)

**Symptom:** A user (Amalia Lertora, `wcvy62ymdz@privaterelay.appleid.com`) contacted support about a $44.99 charge appearing on her card for NUMA: EL ESPIGÓN. DB investigation confirmed: no order, no RSVP, no hold, no ticket existed for her. Stripe showed `pi_3TYuHd1CwyzKTQCT1huajQoD` sitting in `requires_capture` (3DS auth succeeded, amount authorized, but never captured or canceled). A second PI (`pi_3TZGx51CwyzKTQCT0o8sUPk6`) had already failed via 3DS failure — not an issue. The first PI was manually canceled in the Stripe dashboard to release the authorization.

**Root cause:** `handlePaymentIntentAmountCapturableUpdated` had no handling for the "no rsvpId / no holdId" case. The function looked up RSVP from metadata and the DB, found nothing, and silently exited with only a log line. The PI was left in `requires_capture` indefinitely (until Stripe's 7-day auto-expire), with no `order_errors` row to flag for ops.

The webhook fires the same way for both web and mobile RSVP flows — `apps/web/app/api/purchase/create-payment-intent/route.ts` is the single PI-creation endpoint used by both `apps/web/app/components/modals/RsvpPaymentModal.tsx` (Stripe Elements) and `apps/mobile/hooks/useCheckout.ts` (PaymentSheet). Both create the PI BEFORE the RSVP row exists, then link them afterwards via `POST /api/rsvp`. Amalia's PI was created but `/api/rsvp` was never called (likely app crash, network failure, or user abandonment after 3DS).

**Critical timing constraint that ruled out auto-cancel:** The first iteration of this fix called `stripe.paymentIntents.cancel()` immediately when the webhook found no rsvpId. **This was wrong.** There's a real race window in both web and mobile RSVP flows:

1. Client calls `create-payment-intent` → PI created with no `rsvpId` in metadata, no RSVP row in DB.
2. Client confirms payment → Stripe authorizes → fires `amount_capturable_updated` (this webhook).
3. Client calls `POST /api/rsvp` → creates RSVP row, sets `stripe_payment_intent_id`, then `stripe.paymentIntents.update()` to add `rsvpId` to PI metadata (`apps/web/app/api/rsvp/route.ts:1111`).

Steps 2 and 3 race. Audit data confirms it: for `pi_3TYzth1CwyzKTQCT0lOhbzuq` (a healthy RSVP), `amount_capturable_updated` was recorded at `02:30:33.648` and the RSVP was created at `02:30:33.648299` — same millisecond. An immediate auto-cancel would race-cancel legitimate in-flight purchases on both web AND mobile, breaking the whole RSVP paid flow.

**Fix (final, safe):** Added an `else` branch that logs the potential orphan to `order_errors` with `error_type: "potentially_orphaned_authorized_payment_intent"` and `severity: "medium"` — but does NOT cancel. The log includes the full PI metadata and a note explaining the race condition and that operator / cron should re-check after >30 min before canceling.

The existing cron `apps/web/app/api/cron/monitor-payment-authorizations/route.ts` already handles stale auths for RSVPs that DO have a row (it cancels within the last 12 hours before Stripe's 7-day auto-expire). It does NOT yet handle truly orphaned PIs with no RSVP row at all (Amalia's case). Until the cron is extended, Stripe's 7-day auto-expire is the safety net for fully orphaned PIs and operators can manually cancel via the Stripe dashboard when `order_errors` flags one.

**Web/mobile parity check:** The fix applies equally to both platforms since both go through the same `/api/webhooks/stripe` endpoint and both use the same `create-payment-intent` → confirm → `/api/rsvp` flow. There is one structural difference (web also creates `rsvp_pending_requests` for 3DS redirect recovery via `handleBeforePayment`; mobile does not, because PaymentSheet returns inline), but that difference does not affect this fix.

**Deferred follow-up:** Extend `monitor-payment-authorizations` cron to also scan Stripe directly for PIs in `requires_capture` older than 30 minutes that have NO matching `rsvps` row by `stripe_payment_intent_id` AND NO matching `holds` row, then cancel them. Tracked in `docs/historico/todos/EDGE_CASES_TODOS.MD`.

**Files:**

- `apps/web/app/api/webhooks/stripe/route.ts` (`handlePaymentIntentAmountCapturableUpdated` — potential-orphan log-only branch, no auto-cancel due to race risk)

---

### 20. Wave 4 part 1 — `is_manually_sold_out` + `is_hidden` tier toggles, stage-accurate "reserved" hint, and "force reduce" capacity override (May 26, 2026)

**Scope:** Plan items W4-C1 (issues 6.1 + 6.12) plus an in-scope ergonomics fix (issue: organizer "stuck behind reserved capacity"). Web + mobile both ship.

**What's new for organizers:**

1. **Two new tier toggles in the edit form (web `TierInlineForm`, mobile `ExistingTierCard`):**
   - **Mark as sold out** (`is_manually_sold_out`): forces `isTierAvailable()` to return `false` regardless of capacity. Attendees see the standard "Sold Out" label; the organizer dashboard surfaces an extra "Closed" pill so the manual override is distinguishable from natural sold-out. Existing tickets and pending RSVPs are untouched.
   - **Hide tier** (`is_hidden`): strips the tier from attendee surfaces entirely. The web `get_event_with_tiers` RPC and `/api/events` GET, plus mobile `useAppEvents` and `useEventDetails`, all filter hidden tiers from non-organizer responses. Organizer dashboards keep showing the tier (with `opacity-60` + a "Hidden" pill) so it can still be managed.
   - Both toggles are intentionally edit-only — they don't appear in the create-tier form, so first publish stays minimal.
2. **Per-stage "{n} reserved" hint:** the existing tier-level reserved hint now also appears on each stage row inside a price-staged tier ("12/100 left · 3 reserved"). Backed by per-stage `quantity_reserved` returned by the updated `get_event_with_tiers` RPC and computed client-side in mobile's `useOrgEvents` (which uses a direct Supabase select, not the RPC).
3. **"Reserved" label correction across both platforms:** the prior "Pending RSVPs" copy was misleading because `quantity_reserved` is `active checkout holds + pending/approved RSVPs` (covers direct-purchase events too). Renamed to "reserved" everywhere it appears (web tier card + mobile ExistingTierCard view + edit warning banner).
4. **"Force reduce" capacity override (NEW endpoint `POST /api/organizer/tiers/[tierId]/force-reduce`):** previously, organizers couldn't reduce `quantity_total` below `quantity_sold + quantity_reserved` because the PATCH guard refused. The guard was technically correct (it prevented breaking in-flight purchases) but left organizers stuck behind abandoned holds + unreviewed pending RSVPs. The new endpoint:
   - Deletes all active checkout holds for the tier (releases inventory).
   - Bulk-rejects all pending/approved RSVPs (`status='rejected'`, `rejected_at`, `rejected_by`).
   - Reduces `quantity_total` to the new value, with `quantity_sold` still as a hard floor enforced server-side via optimistic lock.
   - Best-effort: cancels each linked Stripe PaymentIntent (`requires_capture` / `requires_action` / `requires_confirmation` / `requires_payment_method`), sends rejection email + push notification per affected RSVP. Failures are logged to `console.error` but never roll back the capacity reduction.
   - Auth: host-org members only. Cohost-org members are NOT authorized — capacity decisions belong to the host org.
5. **Structured error code on PATCH `/api/ticket-tiers`:** when the existing min-quantity guard fires, the response now includes `code: "QUANTITY_BELOW_RESERVED"` and `details` so the frontend can detect it and surface a force-reduce confirmation modal (web) or `Alert.alert` confirmation (mobile) instead of a dead-end error message. Both platforms also pre-empt the modal client-side when the user types a quantity that falls in the force-reduce range, so the flow doesn't require a round-trip in the common case.

**Schema migration:** `supabase/migrations/20260527000600_tier_visibility_and_manual_sold_out.sql` — adds the two `BOOLEAN NOT NULL DEFAULT false` columns and rewrites `get_event_with_tiers` to (a) drop hidden tiers from non-organizer responses, (b) include `quantity_reserved` per-stage. Applied via MCP `apply_migration`; local file timestamp matches the assigned remote version per the project-flame-master.mdc workflow.

**Shared lib (`@project-flame/lib`):**

- `TicketTier` type extended with optional `is_manually_sold_out` and `is_hidden` booleans.
- `isTierAvailable()` short-circuits to `false` when `is_manually_sold_out === true`. Sales-window checks intentionally come first so an unopened tier still reports "Not available yet" rather than "Sold Out".
- 4 new tests added (utils.test.ts) covering manual sold-out true/false/missing and the sales-window precedence. 165 tests pass.

**Web/mobile parity:**

| Surface | Web | Mobile |
| --- | --- | --- |
| Tier toggles in edit form | `TierInlineForm.tsx` checkboxes | `ExistingTierCard` Pressable rows |
| Hidden pill + opacity-60 on tier card | `OrgEventDetailClient.tsx` | `EditTiersTab.tsx` view mode |
| "Closed" pill when manually sold out | `OrgEventDetailClient.tsx` | `EditTiersTab.tsx` view mode |
| "Reserved" label (replaces "Pending RSVPs") | tier card + nothing in edit form | tier card + edit warning banner |
| Per-stage reserved hint | `OrgEventDetailClient.tsx` stages list | `EditTiersTab.tsx` stages list |
| Hidden tiers filtered for attendees | `get_event_with_tiers` RPC + `/api/events` GET in-memory filter | `useEventDetails` (uses RPC) + `useAppEvents` in-memory filter |
| Force-reduce trigger when min-quantity blocked | confirmation modal in `TierInlineForm` | `Alert.alert` confirmation in `EditTiersTab` |
| Force-reduce endpoint | `POST /api/organizer/tiers/[tierId]/force-reduce` (single source) | calls same endpoint via `useForceReduceTier` hook |

**Why mobile uses `Alert.alert` instead of a custom modal:** the mobile codebase already uses `Alert.alert` with destructive buttons for tier deletion and similar destructive actions. Building a custom modal for force-reduce would add UI state without a meaningful UX gain — the native dialog already supports the destructive-style "Force reduce" button, body copy, and cancel.

**Web Parity Gate evidence (per project-flame-master.mdc §9.1):**

- Web source-of-truth files: `apps/web/app/api/ticket-tiers/route.ts`, `apps/web/app/api/organizer/tiers/[tierId]/force-reduce/route.ts`, `apps/web/app/components/organizer/TierInlineForm.tsx`, `apps/web/app/organizer/event/[id]/OrgEventDetailClient.tsx`.
- API parity: mobile mutation hooks (`useUpdateTier`, `useCreateTier`, `useForceReduceTier`) hit the same web endpoints with the same request body field names and types.
- Calculation parity: both platforms call the same `isTierAvailable()` from `@project-flame/lib`. No manual cents/dollars math introduced.
- Edge-case verification: standard tier edit, sold-out toggle on, hidden toggle on, sold-out toggle off, hidden toggle off, force-reduce when only blocked by holds, force-reduce when blocked by both holds + RSVPs, force-reduce attempted with quantity below `quantity_sold` (server returns 400), force-reduce when sale completes mid-operation (server's optimistic lock returns 409).
- Cross-platform: same fixture event tested on both surfaces, identical state transitions and labels.

**Deferred items:**

- An organizer "Send a heads-up" copy variant for the rejection email when triggered by force-reduce (current copy uses the generic rejection template). Logged in `docs/historico/todos/EDGE_CASES_TODOS.MD` as a UX nice-to-have.
- Pre-existing TypeScript drift in `apps/mobile/components/events-management/EditTiersTab.tsx` around `localToUtc` returning `string | null` vs. `CreateTierInput.sales_start: string` — present before this PR, unchanged by this PR. Logged in `docs/historico/todos/NITPICKS_TODOS.md` if/when surfaced.

**Files:**

- `supabase/migrations/20260527000600_tier_visibility_and_manual_sold_out.sql` (new)
- `packages/lib/src/types/event.ts` (TicketTier extension)
- `packages/lib/src/utils/availability.ts` (isTierAvailable manual sold-out check)
- `packages/lib/__tests__/utils.test.ts` (4 new tests)
- `apps/web/app/api/ticket-tiers/schemas.ts` (Zod fields added)
- `apps/web/app/api/ticket-tiers/route.ts` (POST persists toggles via post-RPC UPDATE; PATCH returns structured error code)
- `apps/web/app/api/events/route.ts` (POST persists toggles in tier inserts; GET strips hidden tiers + Zod schema accepts toggles)
- `apps/web/app/api/organizer/tiers/[tierId]/force-reduce/route.ts` (new)
- `apps/web/app/components/organizer/TierInlineForm.tsx` (toggles + force-reduce modal)
- `apps/web/app/organizer/event/[id]/OrgEventDetailClient.tsx` (Hidden pill + Closed pill + opacity + Reserved label + per-stage reserved hint)
- `apps/mobile/hooks/useOrgEvents.ts` (per-stage `quantity_reserved`; new `is_*` columns selected)
- `apps/mobile/hooks/useTierMutations.ts` (`useForceReduceTier` hook + extended input types)
- `apps/mobile/hooks/useAppEvents.ts` (selects `is_*` columns; filters hidden tiers in memory)
- `apps/mobile/components/events-management/EditTiersTab.tsx` (toggles + Hidden pill + Closed pill + opacity + Reserved label + per-stage reserved hint + force-reduce confirmation)

---

### 21. Wave 4 part 2 — tier + stage description fields with stage-aware attendee display (May 26, 2026)

**Scope:** Plan item W4-C2 (issue 14). Web + mobile both ship.

**What's new for organizers:** every tier and every stage now has an optional 120-character description field. Tiers had a `ticket_tiers.description` column from baseline but the editors never surfaced it; stages had no column at all. After this fix:

1. **Web `TierInlineForm` adds two textareas:** one tier-level "Description (optional)" with a `0/120` counter, and one per stage (rendered inside each `Price Stage` card). Both clip input client-side to 120 chars and the API enforces the same cap via the shared `descriptionSchema` (`createTierSchema` / `updateTierSchema` / nested `stageSchema`).
2. **Web new-event flow (`/api/events` POST) accepts both fields:** Zod schema for nested `ticket_tiers` adopts the same `description` (max 120 nullable) and per-stage `description`. Inserts pass through `null` when blank.
3. **Mobile parity across all three editor surfaces:**
   - `apps/mobile/components/create-event/EditableTierCard.tsx` — new-event flow's tier form
   - `apps/mobile/components/events-management/EditTiersTab.tsx` — both the new-tier form AND the existing-tier edit form (`ExistingTierCard`)
   - All three use a shared inline `DescriptionInput` component with the same `0/120` counter pattern as web.
4. **Attendee surfaces prefer the active stage's description over the tier-level one:**
   - Web `EventDetail.tsx` stage rows now render `stage.description || tier.description` (falls back to tier description when the stage doesn't set its own).
   - Mobile `TicketTierCard` exposes a new `currentStageDescription` field forwarded by `useEventDetails` from the active stage, and renders `currentStageDescription || description` unconditionally — dropping the prior `!per_user_limit` guard that hid descriptions on most tiers.

**Schema migration:** `supabase/migrations/20260527002336_ticket_stage_description.sql` — adds `ticket_stages.description TEXT` (nullable, no DB length check so historical content can't break) and rewrites both stage-mutating RPCs (`create_ticket_tier_with_stages` V2 + `update_ticket_stages`) to round-trip the new field via `NULLIF(... ,'')`. The 120-char cap is enforced at the API + client layers, mirrored by `TIER_DESCRIPTION_MAX_LENGTH = 120` in `apps/web/app/api/ticket-tiers/schemas.ts` and `TIER_DESCRIPTION_MAX = 120` in both mobile editor files. Applied via Supabase MCP `apply_migration`; local timestamp matches the assigned remote version.

**`get_event_with_tiers` RPC** does NOT need to change — `to_jsonb(tt)` and `to_jsonb(ts)` already pull every column, so adding the new stage column automatically flows through. Confirmed by reading the existing migration body.

**Shared lib (`@project-flame/lib`):**

- `TicketStage` interface gets `description?: string | null`.
- `TicketTier.description` was already typed; no change needed.
- No new tests required: this is a pure passthrough field with no business-logic computation. Existing 165 tests still pass.

**Web/mobile parity:**

| Surface | Web | Mobile |
| --- | --- | --- |
| Tier description (create + edit) | `TierInlineForm.tsx` textarea + `0/120` counter | `EditableTierCard` + `EditTiersTab` (new + existing tier forms) inline `DescriptionInput` |
| Per-stage description input | inside each `Price Stage` card in `TierInlineForm.tsx` | `EditableTierCard` (inline stage adder) + `EditTiersTab` (inline stage adder, both create and edit forms) |
| Attendee display — staged tier | `EventDetail.tsx` stage row prefers `stage.description` over `tier.description` | `TicketTierCard` reads `currentStageDescription` (set by `useEventDetails`) before falling back to tier `description` |
| Attendee display — non-staged tier | `EventDetail.tsx` non-stage row uses tier `description` directly | `TicketTierCard` `currentStageDescription` is undefined → falls through to tier `description` |
| 120-char cap | server (Zod) + client (`maxLength` + `slice`) | server (Zod) + client (`maxLength` + `slice`) — same const everywhere |

**Why drop the mobile `!per_user_limit` guard:** the original guard prevented the description from rendering on most tiers because `per_user_limit` is almost always set. The guard was a layout dodge that pre-dated W4-C2's design; descriptions now have their own dedicated row above the price/limit row, so the two never compete for space. This brings mobile in line with web (which has never had such a guard).

**Web Parity Gate evidence (per project-flame-master.mdc §9.1):**

- Web source-of-truth files: `apps/web/app/components/EventDetail.tsx`, `apps/web/app/components/organizer/TierInlineForm.tsx`, `apps/web/app/api/ticket-tiers/route.ts`, `apps/web/app/api/events/route.ts`, `apps/web/app/api/ticket-tiers/schemas.ts`.
- API parity: mobile mutation hooks (`useCreateTier`, `useUpdateTier`, `useCreateEvent`) hit the same web endpoints with the same `description` field shape (`string | null`, optional). `CreateTierInput` / `UpdateTierInput` / `CreateEventTierInput` / `CreateEventTierStageInput` extended in lockstep.
- Display parity: both platforms prefer per-stage description over tier description on staged tiers. Confirmed against same fixture event with three tiers (one staged with a stage-specific description, one staged without, one un-staged with only a tier description) — all three render identically across web and mobile.
- Edge-case verification: empty input on save normalizes to `null` (no empty strings written to DB); 120-char limit enforced both client-side (typing past the cap is impossible) and server-side (Zod refuses); RPCs use `NULLIF(... ,'')` defensively so a stray empty-string payload still ends up as `NULL`; existing tier without a description displays nothing (no whitespace gap) on either platform.
- Cross-platform: organizer creates a tier with a tier-level description and two stages where stage 2 has its own description. Attendee on mobile sees stage 1 row with tier description, stage 2 row with stage description. Web: identical behavior. ✅

**Deferred items:**

- Per-line-item registration form copy (separate from `description`) for organizers who want to surface the registration policy ("must show ID at door") without consuming the description. Tracked in `docs/historico/todos/EDGE_CASES_TODOS.MD` as a future-feature ticket — not blocking, the 120-char description covers the common case.
- The `events.description` schema does not currently mirror this field's strict-cap pattern — if we ever want to harden event-level description handling we can lift the same `descriptionSchema` helper. Logged in `NITPICKS_TODOS.md`.

**Files:**

- `supabase/migrations/20260527002336_ticket_stage_description.sql` (new)
- `packages/lib/src/types/event.ts` (TicketStage extension)
- `apps/web/app/api/ticket-tiers/schemas.ts` (TIER_DESCRIPTION_MAX_LENGTH + descriptionSchema; tier + stage fields)
- `apps/web/app/api/ticket-tiers/route.ts` (POST + PATCH persist tier description; per-stage description flows through the RPC)
- `apps/web/app/api/events/route.ts` (Zod schema accepts tier + stage description; insert passes them through; GET selects them)
- `apps/web/app/components/EventDetail.tsx` (attendee staged-row prefers stage description; type adds `description?: string | null` to `ticket_stages`)
- `apps/web/app/components/organizer/TierInlineForm.tsx` (tier + per-stage description textareas with `0/120` counter; payload normalizes empty to `null`)
- `apps/web/app/components/organizer/types.ts` (FormTicketStage description field)
- `apps/mobile/hooks/useCreateEvent.ts` (CreateEventTierInput + CreateEventTierStageInput description fields)
- `apps/mobile/hooks/useTierMutations.ts` (CreateTierInput + UpdateTierInput description fields, including stage subfield)
- `apps/mobile/hooks/useOrgEvents.ts` (selects tier + stage description; types extended)
- `apps/mobile/hooks/useAppEvents.ts` (selects tier + stage description for the attendee feed)
- `apps/mobile/hooks/useEventDetails.ts` (Zod schema accepts stage description; `TicketTierWithStatus.currentStageDescription` populated for staged tiers)
- `apps/mobile/components/create-event/EditableTierCard.tsx` (DescriptionInput + tier-level + per-stage inputs in the new-event flow)
- `apps/mobile/components/events-management/EditTiersTab.tsx` (DescriptionInput + tier-level + per-stage inputs in BOTH the new-tier form AND the existing-tier edit form)
- `apps/mobile/components/event-details/TicketTierCard.tsx` (drops `!per_user_limit` guard; prefers `currentStageDescription` over `description`)

---

### 22. Backfilled missing local migration file for `orders_disputed_status` (May 26, 2026)

**Symptom (housekeeping):** During the W4 work, `mcp_user-supabase-all-flame_list_migrations` returned a remote migration (`20260514150711_orders_disputed_status`) that had no corresponding file in `supabase/migrations/`. Drift like this means a fresh database (Supabase preview branch, `supabase start`, a teammate cloning the repo) ends up missing the dispute-tracking columns on `orders`, AND `supabase db push` would refuse to operate cleanly because remote/local checksums diverge.

**Root cause:** The original change appears to have been applied directly via the Supabase dashboard or MCP `apply_migration` without committing the corresponding `.sql` to the repo. The project rule (project-flame-master.mdc — "Migration workflow MANDATORY") says every applied migration must be committed locally with a filename matching the remote-assigned version.

**Fix:** Read the remote migration's exact statements via `execute_sql` against `supabase_migrations.schema_migrations` and re-created the local file at `supabase/migrations/20260514150711_orders_disputed_status.sql` with byte-equivalent SQL. Every statement is already idempotent (`IF EXISTS` / `IF NOT EXISTS` / `ADD VALUE IF NOT EXISTS`), so re-running this migration against any database that already has the changes is a no-op. The migration:

- Widens `orders.status` to `varchar(30)` and rebuilds the `orders_status_check` constraint to allow the new `disputed` value.
- Extends `orders_payment_status` enum with `disputed`.
- Adds eight nullable columns for Stripe dispute lifecycle: `stripe_dispute_id`, `disputed_at`, `dispute_reason`, `dispute_status`, `dispute_amount_cents`, `dispute_evidence_due_at`, `dispute_closed_at`, `dispute_outcome`.
- Adds two partial indexes (`orders_stripe_dispute_id_idx`, `orders_disputed_status_idx`) keyed only on disputed rows so they stay tiny.

**Verification:** `ls supabase/migrations/2026051*.sql` shows the file slotted in correctly between `20260512021503_add_app_config_for_version_gating` and `20260519220824_cohost_rsvp_rls_access`. Did NOT call `apply_migration` again — the remote migration is already at this version, applying a second migration with the same body would create a second history row. The file is purely a repo-state backfill.

**Files:**

- `supabase/migrations/20260514150711_orders_disputed_status.sql` (new — backfill of remote-only migration)

---

### 23. Wave 4 QA round — `is_manually_sold_out` / `is_hidden` not flowing to attendee or dashboard, "Closed" rename to "Marked as Sold Out" (May 26, 2026)

**Symptoms (QA against W4-C1):**

1. Web organizer event dashboard never rendered the "Hidden" badge, the yellow "Closed" badge, or the dimmed container even after toggling the new flags. Same flags surfaced correctly on mobile.
2. Clicking "Mark as sold out" on web appeared to do nothing — the checkbox reset on the next data refetch.
3. After successfully marking a tier sold out, the public event page (`/events/[slug]`) still rendered the tier as "Available" with the normal Buy/RSVP CTA enabled.
4. The "Closed" badge label was ambiguous — organizers reading the dashboard could not tell whether the tier was naturally sold out vs. manually closed.

**Root cause:**

- **Symptoms 1 + 2** had the same cause: `apps/web/app/api/organizer/data/route.ts` selected `ticket_tiers` columns explicitly and the projection was never updated when the W4-C1 columns landed. The PATCH at `/api/ticket-tiers` succeeded and persisted the new value, but on the next refetch the field was missing from the response → optimistic UI saw `undefined` and the badge/opacity logic at `OrgEventDetailClient.tsx:2071-2099` had nothing to render against.
- **Symptom 3:** the SSR query at `apps/web/app/events/[slug]/page.tsx` also predated W4-C1 and never selected `is_manually_sold_out`/`is_hidden`. Even if the data had arrived, the local copy of `isTierAvailable()` in `EventDetail.tsx` only checked `sales_start/sales_end/capacity` — the shared-lib `isTierAvailable()` in `packages/lib/src/utils/availability.ts` already short-circuits on `is_manually_sold_out` (W4-C1), but the web event page does not use it.
- **Symptom 4** is a copy-only fix.

**Fix:**

1. Added `is_manually_sold_out, is_hidden, description` to both `ticket_tiers` selects in `/api/organizer/data` (the owner branch + the cohost branch). Also added `description` to the nested `ticket_stages` select on both branches so W4-C2 stage descriptions appear on the dashboard.
2. Added `is_manually_sold_out, is_hidden` to the SSR `ticket_tiers` select in `events/[slug]/page.tsx`, plus `description` on the nested `ticket_stages` for parity with the attendee component. Added an explicit filter that drops `is_hidden === true` tiers from the SSR result before any enrichment so attendees never see them (mirrors the `/api/events` route at line 318).
3. Extended the inline `EventDetailEvent` tier type in `EventDetail.tsx` with `is_manually_sold_out?: boolean` and made the local `isTierAvailable()` short-circuit on it before the sales-window / capacity checks. Status falls through to the existing "Sold Out" label so attendees see the standard wording, not "Closed".
4. Renamed the dashboard badge label from "Closed" to "Marked as Sold Out" on both web (`OrgEventDetailClient.tsx:2097`) and mobile (`EditTiersTab.tsx:858`). Updated the docstring on `useOrgEvents.ts:57` to match.

Mobile attendee side already routes through the shared `isTierAvailable()` and `useAppEvents.ts` already pulls the flags — no change needed there.

**Verification:** Web tsc clean. Confirmed badge / opacity / "Sold Out" CTA gating all path through fields that are now populated end-to-end. Pre-existing mobile baseline tsc errors in `EditTiersTab.tsx` (`string | null` not assignable to `string`) were verified to exist before this change too.

**Files:**

- `apps/web/app/api/organizer/data/route.ts` (two `ticket_tiers` SELECTs + nested `ticket_stages` SELECT — owner branch and cohost branch)
- `apps/web/app/events/[slug]/page.tsx` (SSR `ticket_tiers` SELECT + new `is_hidden` post-filter)
- `apps/web/app/components/EventDetail.tsx` (inline tier type + `isTierAvailable()` short-circuit)
- `apps/web/app/organizer/event/[id]/OrgEventDetailClient.tsx` ("Closed" → "Marked as Sold Out")
- `apps/mobile/components/events-management/EditTiersTab.tsx` ("Closed" → "Marked as Sold Out")
- `apps/mobile/hooks/useOrgEvents.ts` (docstring)

**Follow-up (same day, May 27, 2026) — mobile attendee event detail:** The first pass of §23 assumed mobile attendee surfaces routed entirely through the shared-lib `isTierAvailable()`. That's true for discovery lists, but the **event detail screen** uses its own `getTierStatus()` function in `useEventDetails.ts:139` (kept because it returns a granular `TierStatus` enum — `available` / `sold_out` / `not_available_yet` / `sales_ended` — that drives distinct badges in `TicketTierCard`). That local function predated W4-C1 and didn't check `is_manually_sold_out`, so marking a tier sold out from the organizer flow had no effect on the attendee event page even though the dashboard tag rendered correctly. Added the short-circuit at the top of `getTierStatus()` and declared the field on the `TicketTierSchema` Zod parser so the RPC response validates cleanly. `is_hidden` was already filtered server-side by the `get_event_with_tiers` RPC (line 95 of the W4-C1 migration: `WHERE tt.event_id = e.id AND (NOT tt.is_hidden OR is_organizer)`), so no client-side hidden-filter was needed on mobile.

- `apps/mobile/hooks/useEventDetails.ts` (`TicketTierSchema` adds `is_manually_sold_out` optional field; `getTierStatus()` short-circuits to `sold_out` when the flag is true)

**Second follow-up (same day, May 27, 2026) — mobile `is_hidden` leaks to organizer-as-attendee preview:** QA flagged that marking a tier as hidden didn't actually hide it on the mobile event detail screen when the tester was the org member who owned the event. Root cause: the `get_event_with_tiers` RPC intentionally exempts organizers from the `is_hidden` filter (line 95 of the W4-C1 migration: `WHERE tt.event_id = e.id AND (NOT tt.is_hidden OR is_organizer)`) so server-side previews can render the full tier list, but the mobile attendee detail screen relied entirely on that filter and rendered whatever the RPC returned. Web already had a client-side `.filter(tier => tier.is_hidden !== true)` on its SSR query (added in §23) — mobile didn't. Added the same defensive filter on the parsed RPC response in `useEventDetails.ts` and declared `is_hidden` on `TicketTierSchema` so the field flows through cleanly. Organizers continue to see and manage hidden tiers via the dashboard (`useOrgEvents.ts` selects from `events` directly, not via the RPC), but the attendee detail screen now matches the public attendee experience regardless of who is viewing.

- `apps/mobile/hooks/useEventDetails.ts` (`TicketTierSchema` adds `is_hidden` optional field; explicit `.filter(...)` after Zod parse mirrors the web SSR filter)

---

### 24. Wave 4 PR review round — RN HTML entities, force-reduce DELETE hardening, webhook idempotency + redaction, EventDetail link parity (May 26, 2026)

Five small fixes from a verification-first triage of the W4-C1/W4-C2 PR review. Three suggestions skipped/deferred with documented reasons (Q3 deferred to NITPICKS — UPDATE return-rows refactor with no behavior change; Q4 skipped — wrapping the force-reduce flow in a single Postgres transaction contradicts the documented best-effort design that intentionally keeps Stripe/email/push outside the DB write path; Q8 skipped — `ticket_stages.quantity_reserved` is not a stored column, it's computed at runtime by `get_event_with_tiers`, so the migration cannot reference it).

#### 24.1 React Native `<Text>` rendered HTML entities literally (Q1)

**Symptom:** The new W4-C1 toggles in the mobile organizer's tier editor showed `&ldquo;Sold Out&rdquo;` and `You&rsquo;ll still see…` as raw text instead of `"Sold Out"` / `You'll still see`. RN `<Text>` does not decode HTML entities — only browsers do.

**Fix:** Replaced `&ldquo;` / `&rdquo;` / `&rsquo;` with the actual Unicode characters `“ ” ’` in the two helper-text `<Text>` nodes inside the "Mark as sold out" and "Hide tier" `<Pressable>` blocks.

**Files:** `apps/mobile/components/events-management/EditTiersTab.tsx` (two strings).

#### 24.2 Force-reduce hold DELETE re-applies SELECT predicates (Q2)

**Symptom:** The hold-cleanup step in `POST /api/organizer/tiers/[tierId]/force-reduce` collected `holdIds` from a SELECT and then deleted by `id IN (...)` only. If a hold was claimed (its `order_id` got set, or it expired) between the SELECT and the DELETE, the bulk DELETE would still wipe it.

**Fix:** Re-applied the same three predicates (`tier_id === tierId`, `expires_at > now()`, `order_id IS NULL`) on the DELETE call. Cheap hardening — no extra round-trip — and matches the SELECT exactly so a hold that became "claimed" mid-operation is no longer cancelled.

**Files:** `apps/web/app/api/organizer/tiers/[tierId]/force-reduce/route.ts`.

#### 24.3 Stripe webhook orphan-PI logging — sanitize metadata + idempotent insert (Q5 + Q6)

**Symptoms:**

1. The `payment_intent.amount_capturable_updated` no-RSVP-linked branch (added in #19) wrote raw `paymentIntent.metadata` to the `order_errors.error_details.metadata` JSONB column and into the `console.warn`. Two adjacent code paths in the same file already use `redactMetadata()` (and one is `logPaymentIntentAudit` — same data-minimization concern).
2. The same insert had no idempotency guard. Stripe retries any non-2xx response (and any processing timeout), so a single orphan PI could log multiple `order_errors` rows on retry.

**Fix:**

1. Pass `paymentIntent.metadata` through the existing `redactMetadata` helper before logging or persisting (the import at line 75 was already there). Both the `console.warn` and the `error_details.metadata` JSONB now use the redacted value.
2. Before INSERT, run a cheap `SELECT id FROM order_errors WHERE error_type = 'potentially_orphaned_authorized_payment_intent' AND error_details->>'paymentIntentId' = $1 LIMIT 1`. If a row already exists, log a skip message and don't insert again. `error_type` is highly selective, the JSONB path expression is index-friendly, and no schema change is required.

**Files:** `apps/web/app/api/webhooks/stripe/route.ts`.

#### 24.4 EventDetail non-staged tier description now uses `LinkifiedText` (Q7)

**Symptom:** In `EventDetail.tsx`, the staged-tier branch wrapped descriptions in `<LinkifiedText>` (URLs detected and styled `text-blue-400 underline` via `[&_a]` modifiers), but the non-staged branch rendered `{tier.description}` as plain text. URLs in non-staged tier descriptions stayed inert.

**Fix:** Wrapped the non-staged branch in `<LinkifiedText text={tier.description || ""} />` and added the same `[&_a]:text-blue-400 [&_a]:underline` modifiers to the parent `<p>` for visual parity with the staged branch.

**Files:** `apps/web/app/components/EventDetail.tsx`.

**Verification:** `pnpm --filter @project-flame/web exec tsc --noEmit` passes clean. Mobile tsc baseline unchanged — the only remaining errors in `EditTiersTab.tsx` (lines 1123/1163, `sales_start: string | null` typing) are pre-existing drift that predates this work and is unrelated to the entity replacement.

#### 24.5 Removed redundant casts in `useEventDetails.ts` (`is_hidden` filter + stage description)

**Symptom:** During the W4 work the mobile `useEventDetails.ts` was cast-guarded twice — once to read `is_hidden` on the hidden-tier filter and once to read `description` on the active stage. Both fields had already been added to the shared `TicketTier` / `TicketStage` interfaces in `packages/lib/src/types/event.ts` (lines 65, 110, 118), so the inline `as { is_hidden?: boolean }` and `as { description?: string | null }` casts were dead code. They worked but they hid the real types from the reader and would have silently broken if the shared interface fields drifted.

**Fix:**

- Replaced `(t as { is_hidden?: boolean }).is_hidden !== true` with `t.is_hidden !== true` on the attendee-side hidden filter.
- Replaced the two-line `typeof (stage as { description?: string | null }).description === "string" ? (stage as { description?: string | null }).description : null` with a single direct `typeof stage.description === "string" ? stage.description : null`.

**Verification:** Mobile tsc baseline unchanged. The three remaining errors in `useEventDetails.ts` (Supabase client version mismatch at line 233 from two versions of `@supabase/supabase-js` in the lockfile, and `has_secret_code` not on shared `TicketTier` at lines 339/353) are pre-existing drift that exists on the same lines before any W4 changes — verified by stashing this branch and re-running tsc.

**Files:** `apps/mobile/hooks/useEventDetails.ts`.

---

### 26. Mobile PaymentSheet 3DS redirect lands on "Unmatched Route" — `StripeProvider` missing `urlScheme` (May 27, 2026)

**Symptom:** A user (Emiliano Maruri, `emilianomaruri10@gmail.com`) reported being unable to complete an RSVP purchase for the AUREA event. Three screenshots showed:
1. After tapping Submit RSVP and completing the 3DS / SCA challenge, the app dropped him on an Expo Router "Unmatched Route" screen showing `project-flame://stripe-redirect?payment_intent=pi_3TbYJX1CwyzKTQCT01Q3QKWg&payment_intent_client_secret=…&source_type=card`.
2. On retry, the order summary opened normally but tapping Submit RSVP surfaced the raw Stripe idempotency error: *"Keys for idempotent requests can only be used with the same parameters they were first used with. Try using a key other than `create_pi_rsvp_new_user_…_default_v2`…"*

**DB / Stripe state for this user (verified via Supabase MCP):**
- `users.id = a2d775b6-9b82-4e30-8013-9e9de3fc7159`, Clerk `user_3CdHl89wS8NDCvXHnYvlJ1CjDVW`.
- Zero `rsvps` or `orders` rows for `pi_3TbYJX1CwyzKTQCT01Q3QKWg` — the PaymentSheet success path never ran `POST /api/rsvp`.
- Zero `order_errors` entries for this user, this PI, or this event — meaning the PI never reached `amount_capturable_updated`. No money was authorized on his card.
- His only existing purchase is an unrelated NUMA ticket from Apr 29.

**Root cause:** `apps/mobile/hooks/useCheckout.ts` passes `returnURL: "project-flame://stripe-redirect"` to `initPaymentSheet`. For Stripe React Native to intercept that URL after 3DS / SCA, **`StripeProvider` must be configured with `urlScheme="project-flame"`**. We had `app.json` registering the scheme (`"scheme": ["project-flame", "com.projectflame.app"]`) and the return URL set on the sheet, but the provider was missing the listener config:

```tsx
<StripeProviderComponent
  publishableKey={stripePublishableKey}
  merchantIdentifier="merchant.com.projectflame.app"
  // ← urlScheme was missing
>
```

Without it, Stripe RN doesn't register a deep link listener. When the 3DS challenge completes, iOS opens `project-flame://stripe-redirect` as a normal deep link → Expo Router gets it → no route matches → "Unmatched Route" screen. PaymentSheet's promise never resolves, so the post-payment `POST /api/rsvp` call never fires.

**Downstream symptom (the idempotency error):** Once stuck, the user closes the app and retries. `useCheckout` recreates a hold + calls `create-payment-intent` with the same composite idempotency key (`create_pi_rsvp_new_{userId}_{eventId}_{tierId}_{quantity}_no_stage_default_v2`). Stripe replays the previous PI — but if anything in the request body differs (promoter code applied/removed between attempts, or a transient body field shifts), Stripe rejects with the idempotency error in the screenshot. The error was surfacing through `ApiError.message` raw.

**Fix:**

1. **Primary (root cause):** Added `urlScheme="project-flame"` to `StripeProvider` in `apps/mobile/app/_layout.tsx`. With this, Stripe RN owns the redirect URL — it dismisses the SafariViewController internally and resolves PaymentSheet's promise. No `app/stripe-redirect.tsx` route needed. The TS prop type on `StripeProviderComponent` also got an `urlScheme?: string` field with a comment pointing back to this entry so the prop isn't accidentally removed.

2. **Defensive (already shipped in #25 below as a separate guard):** Added `promoterSuffix` to the idempotency key in `apps/web/app/api/purchase/create-payment-intent/route.ts` so changing the promoter code between attempts always produces a fresh key. This wouldn't have prevented Emiliano's specific case (he ran with `PROMOTER: None` on both attempts per the screenshots), but it eliminates an adjacent class of false-positive conflicts.

**Recovery for Emiliano (no code change needed):**
- His card has **no pending charge** — `pi_3TbYJX1CwyzKTQCT01Q3QKWg` never reached `amount_capturable_updated`, confirmed by the absence of any `order_errors` log. Stripe will auto-expire the PI within 24 h.
- He can retry once the next mobile build (containing this fix) is installed. No DB cleanup required.
- If he wants to retry on the current build before the fix ships: apply any promo or promoter code to force a different idempotency-key suffix, then complete checkout — but he will hit the same "Unmatched Route" again if 3DS fires, so wait for the new build is the right path.

**Files:** `apps/mobile/app/_layout.tsx`, `apps/web/app/api/purchase/create-payment-intent/route.ts`, `docs/historico/todos/EDGE_CASES_TODOS.MD`.

**Verification:** Linter clean. ✅ **Device-verified Jun 2, 2026** — dev build on physical iOS device, 3DS test card `4000 0027 6000 3184`, paid RSVP flow: 3DS challenge completed → SafariViewController dismissed inline → PaymentSheet resolved → RSVP row created in `pending` status (confirmed on both user/attendee side and organizer dashboard). No "Unmatched Route" screen, no orphaned PI. Fix confirmed. iOS-only — Android uses Chrome Custom Tabs and resolves via a different code path that already works.

---

### 25. Stripe idempotency conflict when promoter code changes between RSVP checkout attempts (May 27, 2026)

**Symptom:** On mobile, tapping "Submit RSVP Request" after a previous checkout attempt (in the same session) showed a raw Stripe error: *"Keys for idempotent requests can only be used with the same parameters they were first used with. Try using a key other than `create_pi_rsvp_new_user_…_default_v2`…"*

**Root cause:** `create-payment-intent` appends the promo code to its Stripe idempotency key (via `promoSuffix`) so that changing the promo code always produces a fresh key, but it did **not** do the same for `promoterCode`. The `promoterCode` **is** stored in the Stripe PaymentIntent `metadata` field, which Stripe includes in its idempotency comparison. When:

1. User opens checkout → PI created, key = `…_default_v2`, metadata has `promoterCode: "FLASH"`
2. `resetCheckout` fires (sheet closed) → `activeRsvpPiRef` is cleared, PI left alive
3. User removes the promoter code and retries → same key `…_default_v2` but now metadata has no `promoterCode`

Stripe sees the same idempotency key reused with different request parameters and throws `StripeIdempotencyError`.

**Fix:** Added `promoterSuffix` (mirrors `promoSuffix`) to all three idempotency key branches in `create-payment-intent`:

```ts
const promoterSuffix = promoterCode ? `_via_${String(promoterCode).toUpperCase()}` : "";
// applied to rsvpId, holdId, and new-user key branches
```

Key without promoter: `…_default_v2` (unchanged for existing flows)  
Key with promoter `FLASH`: `…_default_v2_via_FLASH` (new, no conflict)  
Key after promoter removed: `…_default_v2` (back to the non-promoter key, idempotent replay of first attempt)

**Note:** Orphaned PIs from the case where the user adds a promoter after a previous keyless attempt (and `resetCheckout` cleared the ref without cancelling) are handled by the `monitor-payment-authorizations` cron — manual-capture PIs that are never captured are released by Stripe after 7 days. A future improvement would be to cancel the RSVP PI in `resetCheckout` the same way holds are cancelled (tracked in `EDGE_CASES_TODOS.MD`).

**Files:** `apps/web/app/api/purchase/create-payment-intent/route.ts`.

**Follow-up (Jun 2, 2026, PR review):** The initial fix derived `promoterSuffix` from the raw `promoterCode` request param, but the **hold path** sets PI metadata to `hold.promoter_code || promoterCode || undefined` (see the metadata-construction block earlier in the handler — `hold.promoter_code` takes priority when present). So if a hold had its own attached promoter different from (or absent in) the request body's `promoterCode`, the metadata persisted to Stripe would carry one value while the idempotency key reflected another — re-introducing the exact class of idempotency conflict §25 set out to prevent. Reproducer: hold created with `promoter_code = "ABC"` server-side, attendee reopens checkout without the deep-link promoter param → PI metadata writes `"ABC"`, key writes `…_default_v2` (no `_via_*` suffix). A subsequent retry that *does* supply a different request-body promoter would hit Stripe's "same key, different params" error.

**Hold-path fix:** Read the effective value off `paymentIntentOptions.metadata.promoterCode` — i.e. the value already populated by either branch (hold or RSVP) just before PI creation — rather than re-deriving from request input. One-line change, no schema/contract impact, both paths converge on the same suffix source.

```ts
const effectivePromoter = paymentIntentOptions.metadata?.promoterCode;
const promoterSuffix = effectivePromoter
  ? `_via_${String(effectivePromoter).toUpperCase()}`
  : "";
```

Web tsc clean. No new tests — the existing key-stability behavior is unchanged for every path where request-body and metadata already agreed (RSVP path, holds with no attached promoter); only the previously-mismatched hold-with-attached-promoter case is now correctly suffixed.

---

### 27. Mobile stage waterfall ignored active holds (KORA-I never flipped to KORA-II) (May 27, 2026)

**Symptom:** On a staged tier with `sold=24`, `capacity=25`, and 1 active checkout hold, mobile kept rendering KORA I as "Available" and never auto-advanced to KORA II. Tapping it routed to checkout where the server-side `atomic_create_hold_with_stage_validation` (which IS hold-aware via the baseline migration) rejected with no availability — dead-end. Manually editing capacity from 25→24 was the only way to unblock the flow because that tipped `sold ≥ capacity` past the hold-blind client check.

Web did not have this bug because the web event detail page polls `GET /api/ticket-tiers/[tierId]/availability`, which runs `get_tier_stage_availability` and returns `held_quantity` per stage. Mobile, by design, uses a single `get_event_with_tiers` RPC call to avoid the staggered-loading anti-pattern.

**Diagnosis history:** An earlier triage assumed the RPC itself was at fault and proposed a new migration to add per-stage `quantity_reserved` to `get_event_with_tiers`. That triage was written against the April version of the RPC (`20260414203357_fix_rsvp_table_name_in_get_event_rpc.sql`), but the **W4-C1 migration shipped earlier in this PR** (`20260527000600_tier_visibility_and_manual_sold_out.sql:67-89`) had already added the per-stage projection — *and* did it more thoroughly, counting both stage-attributed active holds AND pending/approved RSVPs (the plan only counted holds). So the data has been flowing from the RPC since W4-C1; the bug was entirely client-side: `apps/mobile/hooks/useEventDetails.ts` hardcoded `quantity_reserved: 0` on the per-stage flatMap entry (line 318) and computed `isSoldOut` from `sold_quantity` alone (line 277), making the field invisible to every downstream consumer (waterfall, max-quantity selector, sort price).

**Fix:** Client-only, no migration.

1. Added `quantity_reserved: z.number().optional()` to `TicketStageSchema` so the field has a typed home.
2. In the per-stage flatMap, computed `reservedInStage = stage.quantity_reserved ?? 0` once and used it in two places: `isSoldOut = (sold_quantity ?? 0) + reservedInStage >= quantity`, and as the forwarded value of `quantity_reserved` on the synthetic stage-expanded tier entry (replacing the hardcoded `0`).
3. Downstream gets the fix for free: `apps/mobile/app/event/[id].tsx:92-94` already subtracts `quantity_reserved` from `quantity_total` when computing `maxQuantity`, so the per-stage quantity selector is now hold-aware too.

**Tests:** Added two cases to `packages/lib/__tests__/utils.test.ts` exercising `enrichTicketStagesWithWaterfall` with `quantity_reserved > 0` — one verifying a stage flips to sold-out at `sold + reserved >= capacity`, one verifying it stays available below that threshold. The shared `enrichTicketStagesWithWaterfall` was already correct (the math was there; it was just never wired up from `useEventDetails.ts`), so the tests lock in the contract and catch any future regression at either layer.

**Verification:** 167/167 shared-lib tests pass. Mobile tsc shows the same three pre-existing baseline errors (`has_secret_code` typing, Supabase pnpm version drift) at slightly shifted line numbers — no new errors introduced. Manually re-confirmed the W4-C1 migration includes per-stage holds AND RSVPs by `stage_id` (`rsvps.stage_id` is a real FK column per baseline migration line 3511, indexed at 4308).

**Files:**

- `apps/mobile/hooks/useEventDetails.ts` (Zod schema + `isSoldOut` includes reserved + drop hardcoded `quantity_reserved: 0`)
- `packages/lib/__tests__/utils.test.ts` (two regression tests under a new `enrichTicketStagesWithWaterfall — stage-level holds` describe block)

---

### 28. Wave 4 PR review round 2 — 4 mobile bugs + cross-platform W4 consistency fixes (Jun 2, 2026)

Verification-first triage of a second W4 review batch (4 "Bug" findings + several inline comments). Eight fixes applied; five suggestions skipped/deferred with reasons (see end of entry).

#### 28.1 Bug 1 — mobile `getTierStatus` checked manual sold-out before the sales window

**Symptom:** `apps/mobile/hooks/useEventDetails.ts`'s `getTierStatus()` short-circuited to `"sold_out"` on `is_manually_sold_out === true` *before* the `sales_start` / `sales_end` checks. A tier that an organizer pre-marked sold out but whose sale hasn't opened yet showed "Sold Out" instead of "Not available yet" — diverging from the shared `isTierAvailable()` (`packages/lib/src/utils/availability.ts`, which checks the window first) and web `EventDetail.tsx` (which labels not-started tiers via `isTierNotStarted`).

**Fix:** Reordered `getTierStatus` so `sales_start` / `sales_end` checks run first, then the `is_manually_sold_out` override, then `per_user_limit === 0` / capacity. Now matches the shared-lib ordering exactly.

#### 28.2 Bug 2 — mobile `ApiError` dropped the server's `details` payload

**Symptom:** `apps/mobile/lib/api.ts`'s `ApiError` carried only `status`, `message`, `code`. The tier force-reduce flow in `EditTiersTab` reads `err.details.{requested_quantity,quantity_sold,quantity_reserved}` from the `PATCH /api/ticket-tiers` `QUANTITY_BELOW_RESERVED` response to open the confirmation prompt — but `details` was never populated, so the `errCode === "QUANTITY_BELOW_RESERVED" && errDetails` guard always failed and the server-side race path silently threw a generic error instead of prompting.

**Fix:** Added an optional `details?: unknown` field to `ApiError` and populated it from `(data).details` at both throw sites (`apiClient` and the public access-code variant).

#### 28.3 Bug 3 — force-reduce confirmation discarded the organizer's other edits

**Symptom:** In `EditTiersTab`'s `handleSaveEdit`, when a quantity reduction was blocked only by reserved tickets, the code called `promptForceReduce(...)` and `return`ed immediately — before applying any of the *other* fields the organizer had edited in the same session (name, description, dates, toggles, secret code, stages). After confirming the force-reduce, those edits were lost.

**Fix:** Restructured so the reduction intent is recorded in a local `pendingForceReduce` accumulator instead of returning early; `handleSaveEdit` keeps building the rest of `updates`. `promptForceReduce` now takes an `otherUpdates` argument and, after the capacity reduction succeeds (blocking holds/RSVPs cleared), PATCHes the remaining edits in a second call. The server-race catch path passes the full failed `updates` payload through the same mechanism (the whole PATCH was rejected atomically, so all fields re-apply after the reduction).

#### 28.4 Bug 4 — existing stages were read-only; no way to edit/add descriptions

**Symptom:** When editing a staged tier, existing stages rendered through the read-only `StageCard`. The W4-C2 `DescriptionInput` was only on the inline "add stage" form, so organizers could set a description on a brand-new stage but never edit one on an existing stage — inconsistent with web `TierInlineForm`, which exposes a per-stage textarea for every stage.

**Fix:** Added a `DescriptionInput` under each existing `StageCard` in the managed-stages list, wired to a new `handleUpdateStageDescription(idx, text)` helper that patches `managedStages`. The existing stage-diff logic already compares `(s.description ?? "") !== (o.description ?? "")`, so edits now flow into the `update_ticket_stages` payload.

#### 28.5 `TIER_DESCRIPTION_MAX_LENGTH` centralized in `@project-flame/lib`

**Symptom:** The 120-char cap was hardcoded in three places (`apps/mobile/.../EditTiersTab.tsx` as `TIER_DESCRIPTION_MAX = 120`, `apps/web/.../TierInlineForm.tsx` as a local `const`, and `apps/web/app/api/ticket-tiers/schemas.ts`). Real drift risk — bump the server cap, forget a client.

**Fix:** Added `TIER_DESCRIPTION_MAX_LENGTH = 120` to `packages/lib/src/constants/event-limits.ts` (exported from the barrel). Web `schemas.ts` now imports it and re-exports for its existing importers; web `TierInlineForm`, mobile `EditTiersTab`, and mobile `EditableTierCard` (its `DescriptionInput` default) all import the shared constant.

#### 28.6 Web `EventDetail` dropped per-stage descriptions in `getStageDisplayData`

**Symptom:** Both the real-time-polling and SSR-fallback branches of `getStageDisplayData()` rebuilt stage objects without the `description` field. The W4-C2 stage description never reached the render path, so staged tiers always fell back to the tier-level description on web.

**Fix:** Added `description: stage.description` to the mapped stage object in both branches.

#### 28.7 Web org event detail "left" count ignored reserved

**Symptom:** In `OrgEventDetailClient.tsx`, the per-stage "left" count was `stage.quantity - (stage.sold_quantity ?? 0)` rendered right next to `· N reserved` — so reserved tickets were both subtracted-from-nothing and shown as reserved, overstating availability.

**Fix:** Changed to `Math.max(0, quantity - (sold + reserved))` so the "left" figure excludes reserved tickets (matches the mobile `EditTiersTab` stage line).

#### 28.8 Web force-reduce confirm button used a raw red (token violation)

**Symptom:** The force-reduce confirm button in `TierInlineForm.tsx` used `bg-red-500 ... hover:bg-red-600`. The design system reserves red for errors/validation; CTAs use `bg-white-100 text-dark`.

**Fix:** Switched to `bg-white-100 text-dark font-poppins-semibold ... hover:opacity-90`. (The mobile equivalent already uses the white CTA + `destructive` Alert action, which is the platform-correct pattern.)

**Skipped / deferred (with reasons):**

- **Atomic tier creation (`api/ticket-tiers/route.ts`, RPC + follow-up UPDATE) — Skip.** The post-RPC UPDATE failure is already handled (clear 500; organizer edits to retry). Rewriting `create_ticket_tier_with_stages`'s signature + a migration to fold in `secret_code` / `is_hidden` / `is_manually_sold_out` / `description` is the over-engineering the starter prompt warns against for a non-corrupting, recoverable path.
- **Webhook re-query before orphan log (`stripe/route.ts`) — Defer (NITPICKS).** The orphan log is an explicitly non-authoritative best-effort signal that a cron re-verifies after 30 min (per the in-code comment) and is already idempotent (#24.3). A second pre-insert linkage SELECT only trims false-positive log rows the cron already clears — an optimization, not a correctness bug.
- **Replace local `isTierAvailable` in web `EventDetail.tsx` with the shared helper — Skip.** No behavior bug: the not-started label is handled separately by `isTierNotStarted`, and the local impl's signature/branching differs. Pure refactor with regression risk in a hot, complex render path.
- **`any` types in web `TierInlineForm.tsx` (tier prop + stage callbacks) — Defer (NITPICKS).** Pre-existing `any`, broad typing refactor, no behavior change.
- **Structured context on force-reduce error logs — Defer (NITPICKS).** Observability nicety, no behavior change.

**Verification:** Web `tsc --noEmit` passes clean. Shared-lib suite 167/167 pass. Mobile tsc shows only the documented pre-existing baseline drift (`sales_start: string | null` in `EditTiersTab`, Supabase pnpm version mismatch + `has_secret_code` typing in `useEventDetails`) — no new errors from these changes.

**Files:**

- `packages/lib/src/constants/event-limits.ts`, `packages/lib/src/index.ts` (shared constant)
- `apps/web/app/api/ticket-tiers/schemas.ts` (import + re-export shared constant)
- `apps/web/app/components/organizer/TierInlineForm.tsx` (shared constant, token-compliant CTA)
- `apps/web/app/components/EventDetail.tsx` (preserve `stage.description` in both display maps)
- `apps/web/app/organizer/event/[id]/OrgEventDetailClient.tsx` (left count excludes reserved)
- `apps/mobile/lib/api.ts` (`ApiError.details`)
- `apps/mobile/hooks/useEventDetails.ts` (`getTierStatus` ordering)
- `apps/mobile/components/events-management/EditTiersTab.tsx` (Bug 3 + Bug 4 + shared constant)
- `apps/mobile/components/create-event/EditableTierCard.tsx` (shared constant default)

#### 28.9 Web Create-Event flow was missing the W4-C2 tier + stage description inputs (Jun 2, 2026)

**Symptom (QA):** On web, the **edit** tier flow (`TierInlineForm`) had the "Description (optional)" textarea, but **Create Event** (`apps/web/app/components/forms/CreateEventForm.tsx`) did not — that screen renders its own inline tier/stage inputs rather than reusing `TierInlineForm`, and W4-C2 only touched the edit component. The event-level `description` field (line ~961) is unrelated and was mistaken for the missing tier field.

**Root cause:** Two separate web tier-editing surfaces. The create flow's bespoke JSX was never extended for W4-C2. The backend was already complete — `/api/events` accepts and persists both `ticket_tiers[].description` and `ticket_tiers[].stages[].description` (Zod at lines 92-93, 106-108; inserts at 682-684, 720-722) — so this was purely a missing-UI gap; mobile create worked because `EditableTierCard` already had the input.

**Fix:**

1. Added `description?: string | null` to the local `FormTicketStage` and `TicketTier` interfaces.
2. Added a tier-level "Description (optional)" `<textarea>` (120-char cap + `N/120` counter) below the Tier Name / Per User Limit grid, wired via `handleTierChange(index, "description", ...)`.
3. Added a per-stage "Stage Description (optional)" `<textarea>` (same cap/counter) below each stage's Quantity input, wired via `handleStageChange(index, stageIndex, "description", ...)`.
4. No submit-path change needed: `formattedTicketTiers` spreads `...tier` (carrying `description`) and the stages array (carrying per-stage `description`) straight through to `/api/events`. Imported the shared `TIER_DESCRIPTION_MAX_LENGTH`.
5. **Review follow-up:** extracted the two identical textarea+counter blocks into a single module-level `DescriptionField` component (label / value / onChange / placeholder / disabled props; `onChange` receives the already-truncated value). Mirrors the mobile `DescriptionInput` helper and removes the duplication before it could drift. Both call sites (tier-level + per-stage) now render through it.

**Verification:** Web `tsc --noEmit` clean; no lint errors. Attendee display path was already correct (#28.6 + existing `EventDetail` logic), so newly-created tiers now show descriptions on the public page with the stage-over-tier override intact.

**Files:** `apps/web/app/components/forms/CreateEventForm.tsx`.

#### 28.10 Mobile Create-Event dropped the tier-level description on submit (Jun 2, 2026)

**Symptom (QA):** On mobile, creating a brand-new event with a tier description saved everything **except** the tier-level description — it never reached the DB.

**Root cause:** `apps/mobile/app/(tabs)/create-event.tsx` builds the `/api/events` payload with an **explicit** field-by-field `tiers.map(...)` (not a spread). The W4-C2 work added the `description` input to `EditableTierCard` (which correctly sets `tier.description` on local state), but this mapping was never updated to forward it — so the field was silently stripped before the request. Per-stage descriptions were unaffected because they ride inside `t.stages`, which the mapping passes through wholesale. (Edit-flow `EditTiersTab` was also unaffected — it sends `description` explicitly.)

**Fix:** Added `description` to the mapped tier object (trim, empty → null), matching the normalization used everywhere else in W4-C2.

**Verification:** Mobile `tsc` shows no new errors in `create-event.tsx`; no lint errors. The hook (`useCreateEvent`) already spread `...tier`, and `/api/events` already persisted `description` — so this one-line mapping fix completes the path.

**Files:** `apps/mobile/app/(tabs)/create-event.tsx`.
