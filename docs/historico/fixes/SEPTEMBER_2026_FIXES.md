# September 2026 Fixes

Continuing from `AUGUST_2026_FIXES.md`. All entries follow the same format.

---

## Entries

### 1. W7-H5 — Client/server timeouts collided, and a retry destroyed the buyer's payment (backend, Sep 6, 2026)

**Symptom.** Two errors during live sales on CLOUD 10 events (BRUNCH EN LA QUINTA, then EUPHORIA):

- Buyers, on `POST /api/rsvp`: *"Request timed out for /api/rsvp. Check that EXPO_PUBLIC_API_URL (https://www.flme.co) is reachable."*
- Organizers, on approve: the same timeout, and separately *"Cannot approve: Payment authorization status is canceled."*

The `EXPO_PUBLIC_API_URL` wording is a red herring — it is the mobile client's generic abort message ([`apps/mobile/lib/api.ts`](../../apps/mobile/lib/api.ts) ≈ 81). The URL was never unreachable.

**Root cause — three findings that compound.**

1. **The two timeouts were identical.** The mobile client aborts at `DEFAULT_TIMEOUT_MS = 15_000` ([`api.ts`](../../apps/mobile/lib/api.ts) ≈ 12). **No `maxDuration` was declared anywhere in the web app**, so route handlers ran on Vercel's ~15s default. Under load both sides gave up at the same moment.

2. **`/api/rsvp` did far too much inside the request.** 1,413 lines: Stripe retrieves, ~12 sequential Supabase round-trips, the `create_rsvp_atomic` RPC, then **two awaited email sends** — the second of which loops **one email per organizer, sequentially**, so latency scaled with the size of the organizer team.

3. **The damaging part: a duplicate submission cancelled the payment.** When the client aborted, *the server kept going and the RSVP was created*. The buyer, seeing an error, resubmitted with the same PaymentIntent. `create_rsvp_atomic` then raised `23505` (duplicate pending) — and the `23505` branch called `cancelPaymentIntentSafely(...)`, cancelling **the PaymentIntent belonging to the RSVP that had just succeeded**.

That is the full chain: **timeout → retry → the retry cancels the first attempt's money → the organizer can never capture it.** It matches the BRUNCH EN LA QUINTA incident exactly, where 16 pending RSVPs (20 tickets, $640) were left holding dead authorizations and had to be re-sold through hidden recovery tiers.

**Changes — [`apps/web/app/api/rsvp/route.ts`](../../apps/web/app/api/rsvp/route.ts):**

- **`export const maxDuration = 60`** — the server no longer dies at the same instant as the client.
- **`23505` no longer cancels the PaymentIntent.** A duplicate means an earlier request *succeeded*; the correct response is a no-op 400, not a rollback of good state. This is the single change that stops payments being destroyed.
- **Both email blocks moved off the response path** using Next 15's `after()` (Next 15.5.9). The RSVP is already committed by that point, so email latency must not sit between the buyer and their response. Failure handling is unchanged — still logged, still non-fatal. A `if (!supabaseAdmin) return;` guard was added inside the organizer closure because the outer null-check does not narrow through it.

**Change — [`apps/web/app/api/organizer/rsvps/[id]/approve/route.ts`](../../apps/web/app/api/organizer/rsvps/%5Bid%5D/approve/route.ts):**

- **`export const maxDuration = 60`.** Emails were deliberately left alone here: for **paid** RSVPs the ticket email is sent by the Stripe webhook via `createOrder()`, not inline — the inline send is free-RSVP only, so it was never the bottleneck on the paid path. The cost there is the Stripe retrieve/capture chain, which `maxDuration` covers.

**Industry standard.** All three align with normal practice. Stripe's own guidance is that a duplicate/idempotent replay returns the original outcome rather than undoing it; side effects with no bearing on the response (email, notifications) belong outside the request; and serverless functions should declare an explicit timeout rather than inherit a platform default that happens to match the client's.

**Changes — mobile (OTA-deliverable, JS only).** Raising `maxDuration` to 60s on the server while the client still aborted at 15s would have *widened* the phantom-failure window from ~0s to ~45s — every request finishing between 15s and 60s would succeed on the server and be reported as failed to the user, which is the precise condition that produced this incident. The client must therefore outlast the server on these calls:

- [`apps/mobile/lib/api.ts`](../../apps/mobile/lib/api.ts): new exported **`LONG_MUTATION_TIMEOUT_MS = 75_000`**; `apiClient` accepts an optional `timeoutMs` (defaulting to `DEFAULT_TIMEOUT_MS`) and threads it to **both** `executeRequest` call sites, including the 401-refresh retry; `apiPost` / `apiPatch` gained an optional `opts.timeoutMs`.
  - **This value must exceed the server's `maxDuration`, not merely beat the old 15s default.** It first shipped as `45_000`, which was self-defeating: 45s < the 60s server ceiling, so any request finishing in that 15s band would still have produced the exact phantom failure the constant exists to prevent — while the doc comment claimed the client "outlasts the server". Corrected to **75s = 60s server ceiling + 15s margin** for wall-clock the server budget does not cover (DNS, TLS, cold-start queueing, response transfer). Caught in review. The constant now carries a keep-in-sync note: if `maxDuration` rises on either route, raise this first.
- Applied at exactly four call sites — the three `/api/rsvp` posts in [`useCheckout.ts`](../../apps/mobile/hooks/useCheckout.ts) and the approve `PATCH` in [`useRsvpManagement.ts`](../../apps/mobile/hooks/useRsvpManagement.ts).
- **Reads deliberately keep the 15s default.** Timeouts are scoped per operation: a list fetch on a dead network should fail fast; a payment mutation should not.

**Approve-route retries were never the destructive ones.** Worth recording, since organizers hit the same timeout: the capture at ≈ 593 carries `idempotencyKey: rsvp_approve_capture_<rsvpId>`, and the rollback branch is guarded by `else if (paymentIntent.status !== "succeeded")` (≈ 607). So a retry after a timed-out-but-successful approval finds `succeeded` and falls through harmlessly — no double capture, no rollback, no cancel. The cancelled PaymentIntents came exclusively from the **buyer**-side `23505` loop above.

**Review round 2 — an unbounded phase inside the timeout fix itself.** `clearTimeout(timeoutId)` sat in the `finally` of the fetch block, i.e. **before** `response.json()`. `fetch` resolves as soon as headers arrive, so a response whose body then stalled had **no timeout at all** — the promise never settled, the spinner never resolved, and the user was stuck mid-checkout with no error to react to. Strictly worse than a timeout, and in the same function whose entire purpose is bounding these calls. The timer now stays armed through parsing and is cleared in a `finally` around it; an `AbortError` raised during parsing is converted into the existing timeout `ApiError`, while every other parse failure still resolves to `null` so the caller contract is unchanged. **The identical bug existed in `executeUpload`** (same tail, copy-pasted) and was fixed there too with the "Upload timed out" wording.

Also from review: `apiPost` / `apiPatch` now share an exported **`ApiRequestOptions`** interface instead of repeating an inline `{ timeoutMs?: number }`.

**Deliberately out of scope.** Raising `DEFAULT_TIMEOUT_MS` globally — it would make every read hang 75s on a dead network for no benefit. A bounded regression test for the stalled-body path: `apps/mobile` has **no test runner, no `__tests__` directory and zero `.test.ts` files**, so this needs a harness stood up first — logged to `docs/todos/EDGE_CASES_TODOS.md`.

**Verification.** `tsc --noEmit` clean on both web routes. On mobile, the only reported error (`useRsvpManagement.ts:266` `assignedEventIds` possibly null) was confirmed **pre-existing at HEAD** by stashing the change and re-running — it is the known W6-E1 baseline drift, untouched by this work. Behaviour to confirm after deploy — see the QA list in the W7-H5 issue-list entry.

**Ship order matters: web deploy first, then OTA.** The web deploy carries the `23505` fix, which is what actually stops payments being destroyed, and it protects buyers still on old bundles who keep the 15s timeout. The OTA then closes the phantom-failure window for everyone who updates. OTA-first would only make users wait longer for the same broken outcome. No migration.

---

### 3. W7-H6 — Editing a tier price during a live sale stranded buyers and destroyed their authorizations (backend, Sep 6, 2026)

**Symptom.** During the EUPHORIA sale: `StripeIdempotencyError` 400s on `POST /api/purchase/create-payment-intent`, plus buyers reporting *"I paid, Stripe says incomplete, and there is no pending RSVP."*

**How we got here.** The organizer said nobody was editing tiers. `ticket_tiers.updated_at` is not evidence either way — it moves on every `quantity_sold` increment. The RSVP rows settled it: `stage_price_cents` on tier `4c457563…` (EUPHORIA `EARLY BIRDS`) recorded **two** price changes during the sale.

| Window (Ecuador) | Price recorded on RSVPs |
|---|---|
| 18:46:03 – 18:46:23 | $35 |
| **18:46:35 – 18:49:22** | **$30** (28 RSVPs) |
| 19:47:07 – 19:49:40 | $35 |

The $30 window is exactly the window that produced 11 stuck pending RSVPs and 9 rejections interleaved with purchases.

**Three independent defects, all triggered by a mid-sale price edit.**

**1 — The idempotency key omitted the amount.** The key was built from user + event + tier + quantity + stage + promoter + promo, but not the price. A buyer who opened checkout at one price and submitted after an edit reused the same key with a different `amount`; Stripe rejects that by definition, returning 400. No new PaymentIntent was created — **and the first one kept holding their money with no RSVP attached.** That is the orphan buyers were describing. Fixed by adding `totalAmountCents` to the key, so a changed price mints a fresh one.

**2 — Approval validated against the tier's *current* price.** `expectedAmountCents` came from `rsvp.stage_price_cents`, which `create_rsvp_atomic` reads from the tier at RSVP-creation time. Trace of a price rise mid-checkout: buyer authorizes $33.99 at $30 → organizer raises to $35 → approval expects 3500, sees 3399 → **fails**. Every in-flight checkout breaks the instant a price moves up.

Fixed by validating against the **quote**: `paymentIntent.metadata.basePriceCents`, written server-side at PaymentIntent creation from the tier price at that moment, already × quantity and already net of discount. It is the price the buyer saw and authorized. Falls back to the tier price when that metadata is absent (older PaymentIntents), and the discount deduction now applies only to that fallback, since the quote already includes it.

This is the industry-standard model — Eventbrite, Dice and Ticketmaster all honour the price captured when checkout began; edits apply to **new** checkouts only.

**3 — The mismatch branch cancelled the authorization.** On failing the check above, the route called `stripe.paymentIntents.cancel(...)`. Irreversible, and in practice aimed at our own bug rather than fraud — the organizer was left with an RSVP that could never be captured and the buyer had to re-purchase. Removed. Rolling the approval back to `pending` is sufficient: the authorization survives and can be captured once the mismatch is understood, or expires by itself within 7 days. Genuine manipulation attempts are still refused; they are simply no longer punished by burning a real customer's money.

**Relationship to #1.** Distinct from the timeout incident. #1 was client/server timeouts colliding and a retry cancelling a good PaymentIntent via the `23505` branch. This is a *price-edit* class, on a different route, still live after that deploy — which is why the errors continued.

**Review follow-up — strict parsing of the quote.** The first cut read the quote with `Number.parseInt(metadata.basePriceCents ?? "", 10)` and accepted it on `Number.isFinite(...) && >= 0`. Two defects, both on the check that gates capturing money:

- `parseInt` is lenient — `"100abc"` parses to `100`, `"12.9"` to `12` — and `Number.isFinite` admits values past `Number.MAX_SAFE_INTEGER`.
- Worse, a **present but malformed** value fell through to the legacy branch, silently validating against the tier's *current* price. That is precisely the behaviour this entry replaced, restored without a trace in the logs.

**Fixed as a shared validator, not inline.** The first attempt put a one-off Zod schema in the approve route. That failed our own rule §394 — *"if you find business logic in `apps/web` that should be shared but isn't in `@project-flame/lib` yet, STOP. Extract it to `packages/lib` first, add a test... NEVER copy-paste raw business logic"* — and the reason became obvious immediately: **the same lenient parse existed in four other places**, including `api/rsvp/route.ts` where it writes `base_price_cents` and `total_amount_cents`, the figures the revenue dashboards read. Silently persisting a wrong number there is worse than rejecting an approval.

New module `packages/lib/src/validators/stripe-metadata.ts`, exported through `validators/index.ts` and the package root:

- `parseMetadataCents(value)` — digits only, safe-integer range, returns `null` otherwise.
- `isPresentMetadataValue(value)` — lets callers separate **absent** (legacy record, fallback is fine) from **present-but-invalid** (corrupt money data, must be surfaced). That distinction is the actual defect; without it, malformed input silently reverted to tier-price validation.

Covered by 6 new cases in `packages/lib/__tests__/validators.test.ts` — accepts `"3000"`, `"0"`; rejects `"100abc"`, `"12.9"`, `"-5"`, `"+5"`, `"3e3"`, `"  3000"`, `""`, `" "`, `undefined`, `null`, and `"999999999999999999999"`. Full suite: **182 passed**.

Applied at every money-metadata call site in both routes — `basePriceCents`, `platformFeeCents`, `discountAmountCents`, `markupFixedCents`. `markupPercent` deliberately keeps `parseFloat`: it is a percentage, not cents, and needs a different validator.

In the approve route the legacy fallback now applies **only when the key is absent**; present-but-invalid logs a `SECURITY:` line, rolls the approval back and returns 400 for manual review — it does not cancel, matching the reasoning above.

**Second review round.** Three further findings:

- **Fixed — `discountAmountCents` was still coerced to 0.** `discount_amount_cents` initialises to `0`, so a present-but-invalid value logged an error and then silently passed `0` into `create_rsvp_atomic` — recording "no discount" on an RSVP whose PaymentIntent was created *with* one. The same silently-wrong-number class this entry removed from `basePriceCents`, missed on the first pass. Now flagged and refused **before** the RPC runs, with a `code: "INVALID_PAYMENT_METADATA"` response. The authorization is **not** cancelled: it is valid, the fault is ours, and it stays capturable for manual review (expiring by itself within 7 days).

- **Deferred — the superseded PaymentIntent is not cancelled** when a price edit mints a new idempotency key. Real, but **pre-existing**: before this entry the same orphan occurred, the request merely 400'd on top of it. Closing it needs the payment modal on **web and mobile** to pass `oldPaymentIntentId`, plus an OTA; the server already has the cancel machinery (≈ 934–961) but cannot discover the prior intent on the `create_pi_rsvp_new_*` path, which has no `rsvpId` and no DB row yet. Shipping the server half alone would break checkout for clients that do not send it. Logged in `docs/todos/EDGE_CASES_TODOS.md`.

- **Skipped — "rewrite the validator with Zod."** None of the sibling validators in `packages/lib/src/validators/` (`cedula`, `quantity`, `access-code`, `ticket-tier-secret-code`) use Zod; they are plain predicate functions. Adopting Zod for this one alone would make it the odd module out. Zod is applied at the route boundary, where it already is.

**Third review round.** Two further findings, both fixed:

- **The refusal message claimed the card was not charged.** The status gate above accepts **both** `requires_capture` and `succeeded`, so at that point the payment may be a hold *or* already captured — the claim was wrong for half the cases. It also invited exactly the confusion behind tonight's "I paid but it says incomplete" reports: a buyer told "not charged" while a pending line sits on their statement opens a ticket, or a dispute. Replaced with status-neutral copy that asserts nothing about the charge.

- **A failed metadata read continued silently.** The route retrieved the *same* PaymentIntent a second time purely to read `metadata`, and its `catch` only warned — leaving `paymentMetadata` undefined, so the discount extraction was skipped (`discount_amount_cents` staying `0`) and `base_price_cents` / `total_amount_cents` were never set on the order. The same silently-wrong-number class as the rest of this entry, arriving through a failed *read* rather than a bad *value*. The first retrieve is now hoisted and reused; a genuine failure sets `invalidMoneyMetadataField = "metadata_unavailable"` and is refused before the RPC, alongside the invalid-value path. Removes one Stripe round-trip from the checkout path as a side effect.

**Verification.** `tsc --noEmit` clean on all three routes; `packages/lib` suite 182 passing. `isCancellableStatus` remains in use by other branches, so no dead import.

**Needs a web deploy.** No migration, no OTA.

**Follow-up not taken.** `rsvps.stage_price_cents` still records the tier price at RSVP-creation rather than the quoted price, so it can disagree with what the buyer actually paid (reporting only — approval no longer reads it when a quote exists). Correcting it means passing the quoted price into `create_rsvp_atomic`, i.e. a signature change to all three overloads; deliberately not attempted mid-incident.

---
