# October 2026 Fixes

Continuing from `SEPTEMBER_2026_FIXES.md`. All entries follow the same format.

---

## Entries

### 1. Spain / EUR end-to-end test — "country not listed" onboarding, order currency, tier price input (Oct 15, 2026)

**Context.** Ran a full EUR purchase in the iOS simulator against a new hidden test org, **Flame Test Spain** (`760fe7d7-9ea8-4a66-b8fb-eded2daad62b`, added to `INTERNAL_ORG_IDS` in [`internal.ts`](../../packages/lib/src/utils/internal.ts)). Dev builds share the production Supabase DB with Stripe in test mode, so the org was approved with one-off SQL and hidden from production listings the same way as FLAME / MXFT.

**Fixes.**

- **Stripe Connect: "My country isn't listed".** Spain (and any non-LATAM/US/CA market) was missing from `STRIPE_CONNECT_COUNTRIES`, and the onboard route rejects unlisted codes. Added a `CONNECT_COUNTRY_NOT_LISTED` picker option on web ([`StripeConnectStatus.tsx`](../../apps/web/app/components/StripeConnectStatus.tsx)) and mobile ([`ConnectCountrySelector.tsx`](../../apps/mobile/components/settings/ConnectCountrySelector.tsx)). `toConnectOnboardCountry()` maps it to "omit `country`", so the account is created without one and the organizer picks it in Stripe-hosted onboarding (the same path older clients already used). Verified: test account finished as `ES` / `eur` / recipient / `transfers: active`.
- **Orders were stored as USD regardless of currency.** `createOrder` ([`orders.ts`](../../apps/web/app/lib/orders.ts)) and the four `requires_manual_review` ghost-order inserts in the Stripe webhook never set `orders.currency`, so the DB default `'USD'` applied. Now set from the PaymentIntent currency (event currency fallback). Backfilled **28** production orders (19 MXN, 9 EUR) after confirming each against `stripe_payment_audit.currency`; 0 mismatches remain.
- **Create-event tier price input.** Placeholder was hardcoded "Price (USD …)" — now uses the event currency ([`EditableTierCard.tsx`](../../apps/mobile/components/create-event/EditableTierCard.tsx)). Price/quantity only committed on blur, so tapping **Create Event** with the field still focused saved `price_cents = 0`; values now commit on change (blur still normalizes).

**Notes.** A €15 destination charge transfers to the ES account as USD (≈ $16.83) because the platform balance settles in USD; Stripe converts again on the connected account's EUR payout. Expected Stripe behaviour, not a bug.

**PR review (CodeRabbit triage, Oct 15, 2026).** Verified each comment against the code (per `starter-pr-prompt.md`):

- **Fixed — `paths` frontmatter for Claude Code.** `.claude/rules/*.md` are symlinks to `.cursor/rules/*.mdc`; Claude Code reads `paths`, Cursor reads `globs`. Added `paths` mirroring `globs` in `nextjs-typescript.mdc` so the rule is scoped to TS files in both tools instead of always loading in Claude.
- **Fixed — empty quantity kept the previous value.** Clearing the quantity field now commits `0`, so create-event's existing `< 1` validation disables Create instead of silently submitting the stale quantity. Blur still normalizes to 1.
- **Fixed — invalid/negative price kept the previous value.** Now normalized to `0` on change; the text-sync effect treats unparsable text (e.g. a lone `.` while typing `.50`) as `0` so it isn't wiped mid-keystroke.
- **Fixed — confirmation email currency.** Uses the stored `orderCurrency` instead of re-reading `events.currency`, so the receipt always matches the order row.
- **Deferred ([`EDGE_CASES_TODOS.MD`](../todos/EDGE_CASES_TODOS.MD)) — fail `createOrder` when the events currency lookup errors.** Unreachable today: all three callers (webhook hold + RSVP paths, RSVP approve) pass `paymentInfo.currency`.
- **Skipped — resolve "not listed" to a concrete country before `accounts.create`.** Contradicts the intended design (country chosen inside Stripe onboarding, which lists every supported country and its terms). Verified end-to-end with the Spain test account above.

**PR review round 2 (CodeRabbit triage, Oct 15, 2026).**

- **Fixed (docs) — deferred-item retry claim.** The `EDGE_CASES_TODOS.MD` note said a `createOrder` failure would be retried by Stripe. It isn't: the webhook hold/RSVP callers log `order_errors` and return normally (200), so the state needs manual resolution. Note corrected.
- **Skipped — reject non-digit quantity input (e.g. `12.5`).** `parseInt` taking the integer prefix is pre-existing behaviour (the blur handler did the same before this PR); blur immediately shows the normalized `12`, and a fractional ticket count is a typo, not a data-integrity risk.

### 2. `is_manually_sold_out` not enforced on the paid/hold purchase path (backend, Oct 16, 2026)

**Problem.** W7-H4 (`AUGUST_2026_FIXES.md` #1) enforced the organizer "mark as sold out" toggle server-side for RSVPs only. Events with `requires_rsvp = false` buy through `POST /api/holds/create` → `atomic_create_hold_with_stage_validation`, and neither read the flag: the route's tier `SELECT` omitted it, and the RPC's explicit column list did too (capacity checks only). Web and mobile share this endpoint, so a stale client, direct link or scripted call could hold — and then pay for — a closed tier.

**Fix.**

- **Route — [`holds/create/route.ts`](../../apps/web/app/api/holds/create/route.ts):** selects `is_manually_sold_out` and rejects with `400 { code: "SOLD_OUT" }` before creating the hold (after the hidden-tier access-code gate, so a closed hidden tier doesn't reveal itself without a code). Web's `EventDetail` already resets selections and refreshes availability on `SOLD_OUT`.
- **RPC — migration [`20261017014559_hold_respect_manual_sold_out.sql`](../../supabase/migrations/20261017014559_hold_respect_manual_sold_out.sql):** selects the flag and rejects immediately after the `FOR UPDATE` tier lock (race-free vs a concurrent toggle) and **before** the `DELETE` of the user's other holds. Built from the live definition; the rest of the body was verified byte-identical (md5 of `prosrc` minus the two additions).

**Deliberate deviations from the W7-H4 pattern.**

- **No `RAISE … ERRCODE 23514`.** This RPC reports every failure by *returning* `{success: false, error}`; the route only maps that `error` text (`/\bsold out\b/` → `SOLD_OUT`). A `RAISE` would surface as the route's generic `500 "Failed to create reservation"`. The message keeps "sold out".
- **One overload, not two.** Only the 7-arg (promoter) overload exists live; `p_promoter_code` has a `DEFAULT`, so the route's legacy retry without it resolves to the same function.

**Product decision — active holds are honored.** Closing a tier blocks *new* holds only; a hold created before the close can still be paid (≤30 min). Matches Ticketmaster/Eventbrite cart behaviour. `complete_hold_purchase` and the `create-payment-intent` hold branch intentionally do **not** re-check. If this ever changes, re-check at PaymentIntent creation (before money moves) and in `complete_hold_purchase` for free holds — never in the webhook, where the payment is already captured.

**Audit of other paths.**

| Path | Result |
|---|---|
| `create-payment-intent` — RSVP branch | Covered downstream: creates a manual-capture authorization only; `create_rsvp_atomic` (W7-H4) rejects closed tiers and the RSVP route cancels the authorization. |
| `create-payment-intent` — hold branch | Hold already gated at creation; not re-checked (decision above). |
| `complete-direct-free` | Completes an RSVP already gated by W7-H4 at creation. No change. |
| `complete-hold-free` → `complete_hold_purchase` | Hold already gated at creation; not re-checked (decision above). |
| `datafast/create-checkout` | `@legacy` dead code since Jan 2026, no callers. No change. |
| Organizer bank-transfer / promotional tickets | Out of scope by design — organizers may issue tickets on closed tiers. |

**Verification.**

- Rollback-scoped probe on the Flame Test Spain tier (`DO` block ending in `RAISE` to force rollback): closed → `{"success": false, "error": "This ticket tier is sold out"}` with 0 holds created/deleted; reopened control → `success: true`. Post-check: flag `false`, 0 holds, guard present in live `prosrc`.
- **Mobile (iOS simulator, Spain test event):** selected General Admission while open, closed the tier from the DB (simulating the organizer on another device), then tapped **Pay €17.49** on the stale summary → API `This ticket tier is sold out`, no PaymentSheet, **0 holds** created, order count unchanged; the event screen refreshed to **Sold Out**. Tier reopened afterwards (`sold_out_changed_at` reset to `NULL`).
- **Web (local dev, signed in, Spain test event):** selected General Admission while open, closed the tier from the DB, then clicked **Continue to Checkout** on the stale page → `POST /api/holds/create` **400**, inline banner "This ticket tier is sold out", selection cleared, card flipped to **Sold Out** after the 2 s availability refresh; **0 holds**, order count unchanged. Tier reopened afterwards.
- New route tests [`__tests__/api/holds/create.test.ts`](../../apps/web/__tests__/api/holds/create.test.ts): closed tier → `SOLD_OUT` with no RPC call (fails without the fix); RPC sold-out rejection → `SOLD_OUT`; open tier → hold created.
- **Pre-fix exposure logged:** 13 hold-path orders on 5 closed tiers (Atrio, BLOOM EXP ×2, ZULU, SONORA 5.0) need an organizer honor-or-refund decision — see [`EDGE_CASES_TODOS.MD`](../todos/EDGE_CASES_TODOS.MD) "Orders sold on manually-closed tiers". Nothing refunded.
- **Stale doc updated:** [`TICKET_VALIDATION_REFERENCE.md`](../guides/TICKET_VALIDATION_REFERENCE.md) now documents the manual sold-out rule on both paths, and the hold expiry (30 min, not 15).
