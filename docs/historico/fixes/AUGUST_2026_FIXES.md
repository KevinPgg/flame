# August 2026 Fixes

Continuing from `JULY_2026_FIXES.md`. All entries follow the same format.

---

## Entries

### 1. W7-H4 — `is_manually_sold_out` never enforced server-side; RSVPs accepted on sold-out tiers (backend, Aug 27, 2026)

**Symptom.** A Nativa host marked a tier "sold out" in the organizer UI and kept receiving RSVP requests for it.

**Root cause (verified via Supabase MCP + code read).** The organizer toggle `ticket_tiers.is_manually_sold_out` (shipped W4-C1, `MAY_2026_FIXES.md` #20) was honoured **only on the client**. Three layers, one gap:

- **Client — [`packages/lib/src/utils/availability.ts`](../../packages/lib/src/utils/availability.ts):** `isTierAvailable()` correctly short-circuits to `false` on the flag, so the tier renders "Sold Out" and is not selectable. This is the *only* place the flag was ever checked.
- **Web API — [`apps/web/app/api/rsvp/route.ts`](../../apps/web/app/api/rsvp/route.ts):** the tier `SELECT` (≈ 645) does not fetch `is_manually_sold_out` at all. Its validation block (≈ 822–871) covers the sales window and `per_user_limit`, then explicitly hands availability to the RPC — *"Availability validation is now done atomically in the database function to prevent race conditions."*
- **RPC — `create_rsvp_atomic`:** loads the tier with `SELECT * INTO v_tier_record … FOR UPDATE`, so the flag **was** in scope, but never reads it. It validates capacity only (`quantity_total − quantity_sold − reserved`) plus per-stage counts. This was true of **all three overloads** (5-arg, 7-arg with promoter, 9-arg with promotional code — the one the app calls).

Mobile calls the **same** `/api/rsvp` endpoint ([`useCheckout.ts`](../../apps/mobile/hooks/useCheckout.ts) ≈ 536/588/652), so web and mobile were equally exposed. Net effect: the UI hides the tier, but any stale or cached client, back-button, held-open page, direct link, or scripted call was accepted.

**Why it was rare rather than constant.** The UI genuinely does hide the tier, so the bug only fires when a client's view of the tier is out of date. Only **2 provable instances exist in the entire history** of the database.

**Evidence.** Because there is no audit trail for the flag (see #2), cases were identified with the inference *"if a tier has not been modified since an RSVP was created, its current state was its state at RSVP time"* — i.e. `rsvps.created_at > ticket_tiers.updated_at AND is_manually_sold_out = true`:

| Event | Tier | Capacity | RSVP created after flag | Outcome |
|---|---|---|---|---|
| SONORA 4.0 | Tier 1 | 57/150 | 13.7 h | rejected by organizer |
| DESPECHÁ | General Admission | 197/500 | 4.9 h | still pending (Jun 7) |

**Nativa — the reported case — probably WAS the bug.** An initial pass wrote this off as a false alarm on the grounds that the reported buyer's RSVP was on *Pre Sale*, which reads 15/15 on capacity. **That reasoning was wrong** and is corrected here: Pre Sale only *reached* 15/15 with the Aug 27 purchase, so it was **13/15 when that buyer bought on Aug 24** — capacity never blocked any of the late arrivals. Tier-by-tier against the host's "closed them around Aug 9–12" account:

| Tier | Last modified | Purchases after that | Reading |
|---|---|---|---|
| Ladies Promo 2x20 | **Aug 11, 12:42** | **0** (last was Aug 11, 06:52) | ✅ closed cleanly; corroborates the host's dates |
| Tier I | Aug 24, 12:18 | 0 (last was Aug 24, 07:30) | ✅ clean — and it was *created* Aug 11 12:43, one minute after Ladies Promo closed |
| **Pre Sale** | Aug 27, 22:49 | **3** — Aug 19 06:02, **Aug 24 13:35 (the reported buyer)**, Aug 27 22:16 | ⚠️ 12 purchases ran to Aug 11 01:24, then an 8-day gap, then these three |

If Pre Sale was closed alongside Ladies Promo around Aug 11 — which the 8-day gap and the sibling tier both support — those three purchases are exactly this bug. It cannot be *proven*, because Pre Sale's `updated_at` was overwritten on Aug 27 22:49 (something touched the row 33 min after the last of the three). That unprovability is the whole argument for #3 below.

**Change — migration [`20260827211353_rsvp_respect_manual_sold_out.sql`](../../supabase/migrations/20260827211353_rsvp_respect_manual_sold_out.sql).** `CREATE OR REPLACE` on all three `create_rsvp_atomic` overloads, adding the guard immediately after the tier row lock and before every other check:

```sql
IF v_tier_record.is_manually_sold_out = true THEN
  RAISE EXCEPTION 'This ticket tier is sold out'
    USING ERRCODE = '23514', HINT = 'SOLD_OUT';
END IF;
```

Placement matters on two counts: inside the `FOR UPDATE` lock it cannot race a concurrent toggle, and ahead of the capacity/stage logic it short-circuits cleanly. The error reuses `ERRCODE 23514` + `HINT = 'SOLD_OUT'`, which `rsvp/route.ts` (≈ 940–950) already maps to a friendly sold-out response — **so no application code changed, and no app release or OTA is required**. Capacity-based sell-out behaviour is untouched.

**Verification (Aug 27, 2026).** Executed as a single `DO` block that calls the 9-arg overload twice and then `RAISE`s to force a full rollback, so no rows were created (re-checked afterwards: unchanged RSVP counts):

- **Sold-out tier** — Nativa `Tier I`, flagged sold out but only **30/100** sold, so capacity alone could not block it → **rejected**, `23514` / "This ticket tier is sold out". ✅
- **Available tier** — Nativa `Tier II`, 52/100, not flagged → **RSVP created normally**. ✅ (happy path unregressed)

**Parity.** Backend-only. Web and mobile share the endpoint and therefore the fix; nothing to ship to either client.

**Deliberately out of scope.** Also selecting the flag in `rsvp/route.ts` for a faster/clearer rejection (defence in depth, no correctness impact) — left out to keep this a single backend change with no deploy. Revisit if we want a more specific error string than the shared "sold out" copy.

---

### 2. W9-L5 — `ticket_tiers.sold_out_changed_at`: dating the sold-out toggle (backend, Aug 27, 2026)

**Surfaced while investigating #1**, where the host's timing claim could not be settled from data:

- `ticket_tiers` exposed only `updated_at`, the **last write to any column** — editing a price or `sales_end` overwrites it, so it cannot date an `is_manually_sold_out` flip.
- There are **no triggers** on `ticket_tiers` (confirmed via `pg_trigger`); `updated_at` is written by application code.
- The only audit tables in the database are `payout_logs` and `stripe_payment_audit`, both payment-scoped.

This is not theoretical: on Nativa it is the difference between *Ladies Promo 2x20* (untouched since Aug 11 12:42, so its evidence survived and matched the host) and *Pre Sale* (touched again on Aug 27, evidence destroyed).

**Change — migration [`20260827213547_ticket_tier_sold_out_changed_at.sql`](../../supabase/migrations/20260827213547_ticket_tier_sold_out_changed_at.sql):**

- `ticket_tiers.sold_out_changed_at timestamptz NULL` — a purpose-built timestamp that only moves with the flag, plus a `COMMENT ON COLUMN` recording the backfill caveat.
- Partial index `idx_ticket_tiers_sold_out_changed_at … WHERE is_manually_sold_out = true` — every query against this column is "when was this closed" over closed tiers only.
- Rows where the tier is **not** manually sold out are left `NULL`: the column means "when was it marked sold out", so "not marked" must read as `NULL`, not as a date.

**Backfill — seeded from `updated_at`, then re-seeded to the review date (owner decision).** 37 tiers were flagged sold out (26 of them flag-only, i.e. not full on capacity), `updated_at` spanning Jun 2 → Aug 27. The first pass seeded from `updated_at` as the tightest *true* bound ("closed at or before this"). The owner then chose the **review date** instead — these tiers were audited and confirmed sold out on Aug 27, and the column is being adopted from that date forward — applied by follow-up migration [`20260827215115_sold_out_changed_at_reseed_to_review_date.sql`](../../supabase/migrations/20260827215115_sold_out_changed_at_reseed_to_review_date.sql).

For pre-existing rows the column therefore reads **"confirmed sold out as of the W9-L5 review"**, *not* the moment the flag flipped; the `COMMENT ON COLUMN` says so explicitly and points readers at `updated_at`. **Crucially, `updated_at` is NOT written by the re-seed**, so per-row evidence survives — Nativa `Ladies Promo 2x20` still carries `updated_at = Aug 11 12:42`, the timestamp that independently corroborated the host (#1). Only rows toggled *after* Aug 27 carry exact times.

**Verification.** 37/37 flagged tiers seeded, 0 left `NULL`, 0 values leaked onto non-sold-out tiers. Post-re-seed spot check on Nativa: all three flagged tiers read `sold_out_changed_at = Aug 27 23:32` while `updated_at` still reads Aug 27 22:49 / **Aug 11 12:42** / Aug 24 12:18 respectively — i.e. the historical signal is intact.

**API write (shipped in the same batch).** [`apps/web/app/api/ticket-tiers/route.ts`](../../apps/web/app/api/ticket-tiers/route.ts) now maintains the column, +27 lines across both write paths:

- **PATCH (edit):** `is_manually_sold_out` added to the existing pre-update tier fetch (and to the `TierWithEvent` type) so the *current* value is known; `sold_out_changed_at` is written **only when the flag actually flips** (`soldOutFlagChanged`). Stamping on every save would collapse the column back into a duplicate of `updated_at` — a price edit must not look like a re-close.
- **POST (create):** a tier created already closed is stamped immediately; one created open stays `NULL`.
- **Second creation path — [`apps/web/app/api/events/route.ts`](../../apps/web/app/api/events/route.ts) (added Aug 28).** Tiers are also inserted *alongside a new event*, and that path passed `is_manually_sold_out` straight through with no timestamp. The original write covered only `api/ticket-tiers` POST, so a tier created already closed via the create-event flow would have read `NULL` forever. Same stamp applied there. **Both** creation paths must write the column or the invariant "flagged ⇒ has a date" does not hold.
- **Reopening clears it to `NULL`**, since the column means "when it was marked sold out" — an open tier must not carry a stale date.

Needs a **web deploy**; no OTA, no migration beyond the two above.

**Deploy verification (Aug 27, 2026, 23:46-23:51 UTC) — PASSED on live production.**

A first attempt failed instructively: a tier was toggled ~100 s after the code reached `origin/main`, i.e. inside the Vercel build window, so it hit the previous bundle and recorded `NULL`. Not a defect — the deploy simply was not live yet. Worth remembering when testing a freshly pushed change.

Re-tested once the build landed, on the `New test event for marked as sold out` event:

| Case | Tier | Result |
|---|---|---|
| Toggle **to** sold out | `Check` (was `NULL` from the pre-deploy attempt) | stamped `23:46:54.045`, exactly equal to `updated_at` |
| Toggle on an **existing backfilled** row | `General Admission` (sat at the `21:32:00` reseed marker) | moved to a genuine `23:46:49.049`, overwriting the placeholder |
| **Edit price only**, flag untouched | `Check` 5000 → 2500 | `updated_at` → `23:51:07` (+253 s); `sold_out_changed_at` **held at `23:46:54.045`** |
| **Edit price only**, flag untouched | `General Admission` 2500 → 12500 | `updated_at` → `23:51:17` (+268 s); `sold_out_changed_at` **held at `23:46:49.049`** |

The price-edit rows are the load-bearing result: they prove the column tracks the *flag*, not the row. Had it moved, `sold_out_changed_at` would have collapsed into a duplicate of `updated_at` and the whole item would have been pointless — which is precisely the failure mode that made `updated_at` unable to answer the Nativa timing question in #1.

Table-wide invariants after the test: **0** tiers flagged-but-`NULL`, **0** open tiers carrying a date, 2 rows recorded since the reseed, 36 still at the marker (37 minus `General Admission`, which moved to a real timestamp). The arithmetic reconciles exactly — no stray writes.

**Not yet exercised:** reopen → `NULL`. Both test tiers are still flagged, and the 36 open tiers were never flagged post-deploy, so the table-wide `0 open-but-dated` count is not evidence for the clear path. The code is symmetric with the stamp path (same `soldOutFlagChanged` branch, `null` instead of a timestamp), so risk is low, but it is untested. Also untested end-to-end: the create-already-closed case on **both** creation paths.

---

### 3. Stranded `pending` RSVPs — expiry crons are not clearing past-event requests (audit, Aug 27, 2026)

**Found while closing out #1.** The DESPECHÁ RSVP identified there was still `pending` **82 days** after the event, which prompted a check of the expiry path generally.

**Finding.** **13 `pending` RSVPs sit on events that have already happened**, across 6 events spanning **Jan 1 → Jun 15, 2026** (3 carry a Stripe PaymentIntent, 10 do not). Two crons are configured in `vercel.json` and should cover this:

- `monitor-payment-authorizations` (every 6 h) — only looks at pending RSVPs whose PI was created **3–7 days ago**, so anything older than 7 days is permanently out of its window. Cannot recover these.
- `cleanup-past-event-rsvps` (daily 02:00) — selects events with `ends_at < now()` and flips their pending RSVPs to `expired`. **This should have caught all 13.**

**Not a filter bug.** All 6 events have a non-NULL `ends_at` and all are in the past, so the query would match them. The stranded rows also stop cleanly at **Jun 15** with nothing newer, which is more consistent with the job failing or not executing than with a predicate defect. **Confirming this requires the Vercel cron execution logs** — not determinable from the database alone.

**Action taken.** Only the DESPECHÁ row was actioned (owner instruction): RSVP `44659e07-2911-49b6-948f-5f260b699558` (4 tickets, requested Jun 7 04:17 — *after* the event's 00:00 start) set to `rejected`. Its PaymentIntent `pi_3TfWFb1CwyzKTQCT15nDIwMc` is 82 days old and will long since have expired on Stripe's side, but that was not verified here. **The other 12 remain pending.**

**Follow-up.** Folded into the existing **W9-L4** ("Confirm 7-day pending-RSVP expiry cancels Stripe AND DB"), which already flags the 3–7 day window and the free-RSVP gap. This audit adds concrete evidence: check the Vercel logs for `cleanup-past-event-rsvps`, then sweep the remaining 12.

---

### 4. PR-review round on the W7-H4 / W9-L5 batch (docs + migration hygiene, Aug 28, 2026)

Ten automated review findings, triaged against live code per [`docs/prompts/starter-pr-prompt.md`](../prompts/starter-pr-prompt.md). Two were skipped with reason; the other eight were applied immediately.

The tenth — a confirmed user-facing defect in `create_rsvp_atomic` — was written but **held**, because it replaces a function on the live checkout path. It has since **shipped**: the owner approved it the same day and it went out as migration `20260827223725` at 22:37 UTC, together with the round-2 price fix. So the final state is **nine applied, one skipped in round 1**; the section below is kept in its original held-then-shipped order because the reasoning for holding is the useful part of the record.

**Applied — this changelog.** Entry #3 named the DESPECHA attendee's email address, and `docs/fixes/` is tracked in git. Removed; the RSVP UUID, ticket count, request time, status and PaymentIntent id remain, so the record is still actionable without carrying PII. (A second pass in round 2 below removed the last remaining named individual, so **no attendee name or email appears anywhere in this file**.)

**Applied — [`docs/guides/VERSIONING_AND_UPDATE_GATING.md`](../guides/VERSIONING_AND_UPDATE_GATING.md), six corrections.** Each verified against the repo rather than taken on trust:

| Finding | What was actually wrong | Fix |
|---|---|---|
| MD040 | Exactly 2 of 24 fences had no language (ASCII surface diagram; client caching-policy block) | both `text` |
| `app_config` model | Guide said "one row, JSONB, **per-platform**" while its own SQL filtered `platform_key='mobile'`. Real schema (`20260512021503`) is **one `'mobile'` row** holding `ios` *and* `android` | schema, seed, lookup and every `UPDATE` now describe one model |
| **Force gate self-cancelled** | §4.3 clamps `minimum` down to `latest` when `minimum > latest`, and cannot tell a deliberate force from a typo. §5's force row bumped `minimum` alone → silently undone whenever `latest` still trailed | writes both atomically + a note on why |
| OTA rule of thumb | Cited `ios/` / `android/`, which `apps/mobile/.gitignore:9-10` ignores — they are `expo prebuild` output and can be untouched in a diff while about to change | narrowed to JS-only; native `app.json` config, Expo SDK, native deps called out |
| **testflight ≠ preview** | `eas.json` sets `channel: "testflight"`, but the channel table lumped it into `preview` — following the guide (`--branch preview`) would never reach TestFlight testers | table split, mapping stated, `--branch testflight` command added |
| `--platform` rationale | "Otherwise it bundles for web" was not the useful truth | iOS-only is deliberate (no Android binary ships); omitting exports every resolved platform; use `--platform all` when Android ships |

**Applied — replay safety on [`20260827215115`](../../supabase/migrations/20260827215115_sold_out_changed_at_reseed_to_review_date.sql).** The re-seed updated every flagged tier unconditionally, so a manual re-run would overwrite genuine post-adoption flip times (written by the API per #2) with the review-date marker. Now bounded to `sold_out_changed_at IS NULL OR <= marker`, which is idempotent. Verified a no-op against current data: 37 flagged, all exactly at the marker, 0 after, 0 `NULL`, 0 leaked onto open tiers.

**Held for approval, then shipped — a real, confirmed, user-facing defect.** Nine `RAISE EXCEPTION` messages across the three `create_rsvp_atomic` overloads escape their double quotes as `\"`. PostgreSQL does not interpret that escape — `standard_conforming_strings` is `on` (verified against production) — so the backslash is part of the literal, and [`apps/web/app/api/rsvp/route.ts`](../../apps/web/app/api/rsvp/route.ts) returns `rsvpError.message` **verbatim** in the JSON `error` field on the `23514` / `P0002` branch. Buyers on web and mobile alike see:

```text
The \"Tier I\" stage is sold out. Please select another ticket option.
```

The fix is written as `supabase/migrations/PENDING_rsvp_atomic_unescape_error_messages.sql`: `CREATE OR REPLACE` on all three overloads with the backslashes removed, carrying the W7-H4 guard through unchanged — identical control flow, identical `ERRCODE`/`HINT` values, and message text otherwise byte-identical so the route's hint-missing regex fallbacks (`/\bsold out\b/`, `/\bavailable\b/`) still match. **Shipped** as migration [`20260827223725_rsvp_atomic_unescape_error_messages.sql`](../../supabase/migrations/20260827223725_rsvp_atomic_unescape_error_messages.sql) (Aug 27, 2026, 22:37 UTC). Two earlier apply attempts were denied by the local permission classifier — first a compact form using a dynamic `EXECUTE`, then the explicit `CREATE OR REPLACE`; the owner approved the call on the third. The round-2 price fix below shipped in the same migration. See **Verification** at the end of this entry.

**Follow-up logged — the deeper issue.** Fixing the backslashes fixes the symptom. The design problem is that raw database error text reaches buyers at all: the route already derives a stable machine code from the DB `HINT` (`SOLD_OUT`, `INSUFFICIENT_QUANTITY`, `AVAILABILITY_ERROR`) but returns `rsvpError.message` alongside it, and the clients render the message. That makes checkout copy English-only inside Postgres `RAISE` statements — a real problem for Spanish-speaking buyers — lets any future DB phrasing reach customers unreviewed, and makes changing copy a migration on the live checkout path. Industry standard (Stripe, Eventbrite, Ticketmaster) is the opposite split: the server returns a stable code, the client owns the human string. Tracked as **W9-L7** in the issue list.

**Skipped, with reason.**

- *"Add Android publishing commands."* No Android binary ships — corroborated by the `app_config` seed comment ("App is iOS-only; gate can't fire on Android because there is no Android binary in the field"). Documented the `--platform all` path for when it does, rather than adding commands that cannot be run today.
- *"Split `--environment` guidance by SDK 55 vs SDK 54."* This repo is `expo ~54.0.33`; the SDK 55 semantics asserted in the finding could not be verified, and putting an unverified version claim in a portable playbook is worse than the status quo. Instead pinned the observed toolchain (SDK 54 / `eas-cli >= 14`) and made the standing advice version-independent: always pass the flag, and trust the env-load line in the output over your memory of the rules.

#### Round 2 (Aug 28, 2026)

Three further findings on the same batch. Two applied, one skipped.

**Applied — last named attendee removed from this file.** Entry #1 named the Nativa buyer three times (prose ×2, purchase table ×1). Replaced with "the reported buyer"; the **Aug 24 13:35** timestamp, event, tier and purchase sequence are unchanged, and that timestamp is unique within Pre Sale, so the row is still identifiable internally. A UUID was deliberately *not* substituted: the timestamps in that table do not line up with the `orders` rows (Aug 19 09:23 / Aug 24 13:43 / Aug 27 20:20 UTC), so they come from a different source table or timezone, and asserting a mapping that has not been verified would be worse than a neutral label. *(The same name remains in `_local-notes/ai-working-docs/issue-list.md`, which is gitignored and never leaves the machine.)*

**Applied — a second display defect in the same messages, found by this round.** The "insufficient quantity at the current price" message interpolates `(v_current_stage_price / 100.0)`. `v_current_stage_price` is `integer` and `100.0` is `numeric`, so the division yields `numeric` at scale 16, and the buyer sees:

```text
Only 3 ticket(s) available at the current "Tier II" price ($30.0000000000000000).
```

Verified against production. Wrapped in `to_char(…, 'FM999999990.00')` at all three call sites → `$30.00`, `$12.50`, `$0.00`. `FM` suppresses padding; the leading `0` in the mask keeps sub-dollar prices as `$0.50` rather than `$.50`. Shipped in the same migration as the backslash fix.

**Verification (Aug 27, 2026, 22:38 UTC).** Static check across all three live overloads: **0** stray backslashes, **1** `to_char` site each, W7-H4 guard still present in each. Behavioural check ran as a single `DO` block that calls the 9-arg overload three times and then `RAISE`s to force a full rollback:

| Test | Target | Result |
|---|---|---|
| Manual sold-out guard | Nativa `Tier I` — flagged, **30/100**, so capacity could not block | **rejected** `23514` "This ticket tier is sold out" |
| Price formatting | FLAME Demo `GA — phased release` (3 stages), qty 9999 | **rejected** `23514` `Only 31 ticket(s) available at the current "Early Bird" price ($18.00).` — clean quotes, clean price |
| Happy path | Nativa `Tier II` — open, 54/100 | **RSVP created**, `status=pending` |

**Nothing persisted.** All three tests ran as the same harness user, and that user has **0** RSVPs in the table — which is conclusive for the whole harness, including the `Tier II` insert that TEST3 made and the `RAISE` rolled back.

Note the check is deliberately scoped to the harness user rather than to the test tiers: Nativa `Tier II` picked up **two genuine buyer RSVPs during the test window** (22:35 UTC onward), so a per-tier row count there proves nothing either way. Those two are real traffic on an *open* tier — correct behaviour, and incidental live confirmation the W7-H4 guard is not over-blocking. Nativa `Tier I` and the demo tier took **0** rows in the same window.

**Skipped — `p_quantity IS NULL or < 1` guard in the three overloads.** Already handled by the database on every path: `rsvps.requested_quantity` is **`NOT NULL`** and carries **`CHECK (requested_quantity > 0)`**. The path that would have made this a genuine boundary was checked specifically — `create_rsvp_atomic` is `SECURITY INVOKER` with `anon` and `authenticated` holding `EXECUTE`, so it *is* callable directly over PostgREST, bypassing the route's `z.number().int().min(1).max(100)`; and the `rsvps` INSERT policy lets a signed-in user insert for themselves. The constraint still rejects `0`, negatives and `NULL` there, so the "negative reservation inflates availability and enables an oversell" scenario is closed. Adding the guard would buy no coverage and would reclassify this migration from display-only to behavioural — the wrong trade for one already waiting on approval.

---

