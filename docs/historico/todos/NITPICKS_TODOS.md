# Nitpicks & Optional Refactors

These items were surfaced in PR reviews but are deferred as nitpicks, optional refactors, or minor styling tweaks per the `project-flame-master.mdc` guidelines.

**Web app (Phase 9 design only):** See `WEB_NITPICKS_TODOS.md` for deferred nitpicks from Phase 9 Web Design PR reviews (Mar 12, 2026). Other `apps/web` nitpicks remain in this file.

## May 2026 PR Review — W3-B2 Google Maps city autocomplete on web (May 20, 2026)

### `apps/web/app/api/places/autocomplete/route.ts` — Swap in-memory rate limiter for shared store (Upstash) + add periodic Map sweeper when traffic warrants

Reviewer flagged the in-memory `requestsByIp` Map (lines 3–19) as (a) ineffective across multiple Vercel function instances and (b) potentially leaky over a long-lived instance (single-visit IPs leave stale `[timestamp]` entries that aren't evicted until that IP returns).

**Authentication model (for accurate risk assessment):** The route is **not auth-gated** at the request level — there is no Clerk / `auth()` check inside the handler. It is *practically* consumed only by the organizer-side forms (`CreateEventForm`, `OrgEventDetailClient`, `EventsTiersView`) that mount `CityAutocompleteField`, but the URL itself is reachable by any client. The in-process limiter is the only first-line defense in front of the Google Places billing surface.

**Deferral reason:** Even given the public surface, swapping in `@upstash/ratelimit` is disproportionate today: the real cost ceiling is GCP-side ($20/month budget alert + Places daily quota), not the in-process limiter — that's defense-in-depth. Multi-instance bypass is bounded by Vercel function lifecycle, and Map memory growth is bounded by instance lifetime (minutes to hours on serverless). Adding `@upstash/ratelimit` introduces a new paid dependency, env vars, and failure mode for a layer that isn't load-bearing today.

**Trigger to revisit:** sustained > 30 req/min/IP measured over a 10-minute sliding window in production logs (i.e., legitimate traffic actually starts hitting the throttle), the GCP budget alert fires, OR we wire any other unauthenticated public endpoint behind the same `requestsByIp` pattern. At that point migrate to Upstash with the same `RATE_LIMIT_WINDOW_MS`/`RATE_LIMIT_MAX` constants, and add a periodic sweep (or rely on Upstash TTL) to evict stale IP keys.

## May 2026 PR Review — Stage 3 Web Parity (May 11, 2026)

### `apps/web/app/components/OrganizerDashboard.tsx` — Drop pre-existing `any` types (lines 164, 173, 488)

Reviewer flagged three `(e: any)` / `(a: any, b: any)` callbacks in this file:
- Line 164: `data.events?.find((e: any) => e.id === eventId)`
- Line 173: `freshPurchases.sort((a: any, b: any) => ...)`
- Line 488: `data?.events?.map((e: any) => ({...}))` inside the refetch console.log

**Deferral reason:** All three are pre-existing code that the Stage 3 web-parity PR did not introduce or touch. The PR's diff only swapped `DashboardView` → `OrganizerAdminView` and removed the tab pill UI; the `any` callbacks above sit inside unrelated event-data refetch / purchase-export logic. Typing them requires importing/defining `Purchase` and an `OrganizerDashboardEvent` shape and propagating them through the React Query types — non-trivial. Sweep this whole file's any-types in a dedicated typing PR.

### `apps/web/app/components/UserDashboard.tsx` — STATUS_COLORS hex literals → design tokens

Reviewer asked to replace the `STATUS_COLORS` constant (`"#30C680"`, `"#238FDA"`, `var(--color-white-50)`) with a `flameColors` import from `@project-flame/lib`.

**Deferral reason:** Pre-existing constant the Stage 3 PR did not modify. The `flameColors` export the reviewer mentioned does not yet exist in `@project-flame/lib` — creating it (and an `info` / `success` / `neutral` mapping) is its own piece of design-system work. Pair this with the equivalent mobile sweep when `flameColors` ships.

### `apps/web/app/components/OrganizerDashboard.tsx` — URL→state sync `useEffect` deps array

Reviewer flagged the `useEffect(() => { ... }, [tabParam])` that reads `getInitialView()` and `activeView` but omits `activeView` from the deps array.

**Deferral reason:** Pre-existing intentional one-way sync. Including `activeView` would create a state→URL→state loop. The fix the reviewer suggests (add `eslint-disable-next-line react-hooks/exhaustive-deps`) is acceptable but cosmetic. Bundle into the OrganizerDashboard typing sweep above.

### Duplicated `PastEventsAccordion` in `OrganizerAdminView.tsx` + `OrganizerPublicView.tsx`

Both files define a near-identical inline `PastEventsAccordion` (only `gap-2` vs `gap-3` differs).

**Deferral reason:** Per the starter PR review prompt — 2 usages do not justify extracting a shared component. The markup also already diverges (different gap, different parent wrappers). Revisit if a 3rd consumer appears.

### `apps/web/app/components/Navbar.tsx` — `<img>` → `next/image` for SVG logos (desktop + mobile menu)

Reviewer asked to swap the two `<img src="/flame-logo-white.svg">` instances for `next/image`.

**Deferral reason:** Next.js does not optimize SVGs by default (treats them as raw bytes; the docs explicitly recommend `unoptimized: true` for SVG). Converting buys zero performance and forces an `unoptimized` workaround. The next/image rule is meaningful for raster assets — SVG-logo `<img>` is the pragmatic exception in our codebase. If we want to standardize, do it as a single sweep across the codebase (footer, favicons, marketing pages all carry SVG `<img>`).

### `apps/web/app/components/UserDashboard.tsx` — `Suspense fallback={null}` → skeleton

Reviewer asked to replace the `<Suspense fallback={null}>` wrapping `UserDashboardInner` with a skeleton.

**Deferral reason:** The suspension only happens because of `useSearchParams` — it's a single render boundary, not a perceptible flash. The page also already has a loading state for `ticketsLoading` immediately below. A skeleton here is ornamentation, not a fix.

### `apps/web/app/api/organizations/[id]/event-assignments/route.ts` — Atomic DELETE+INSERT via Postgres RPC

Reviewer flagged that the PUT handler does a `.delete()` then `.insert()` in sequence; if the insert fails the user is left with zero assignments while the previous set is gone.

**Deferral reason:** Real reliability concern, but mobile's `useEventAssignments` uses the exact same DELETE+INSERT pattern via `getAuthenticatedClient` — fixing only web creates parity drift. The proper fix is a shared `replace_event_assignments(p_org_id, p_user_id, p_event_ids, p_assigned_by)` Postgres function that runs both inside a transaction, then update both web's PUT route and mobile's `useEventAssignments` hook to call it. Track as a single cross-platform migration PR.

### `apps/web/app/api/organizations/[id]/members/[memberId]/route.ts` — Surface cleanup errors to caller

Reviewer asked to return a `warnings` array (or non-2xx status) when the post-role-change `event_assignments` cleanup fails, instead of only `console.error`.

**Deferral reason:** No client currently consumes a `warnings` field. Returning non-2xx mis-represents the operation — the main role change succeeded. Cleanup failures leave orphan rows that are benign (cleaned up on next role change or member removal). Logging is already in place for diagnostics. Worth revisiting once we add a structured error/warning channel on the client.

### `apps/web/app/api/organizations/[id]/members/route.ts` — Zod runtime validator for Supabase row shape

Reviewer asked to replace the `data as unknown as Row[]` cast with a runtime zod schema.

**Deferral reason:** Premature defense. The SELECT projects explicit columns (no `*`) so the returned shape is deterministic from the query string. Zod overhead at every page load for a result we control. Revisit only if Supabase types start drifting from runtime.

### `apps/web/app/api/organizations/[id]/members/route.ts` — Drop `as unknown as Row[]` via generated Supabase types

Reviewer flagged the unsafe cast + the `users` field's array-or-object-or-null union, suggesting either generated Supabase types or `from<RowType>()` generics, or the inner-join `users!user_id(...)` form for guaranteed single-object shape.

**Deferral reason:** The runtime guard (`Array.isArray(row.users) ? row.users[0] : row.users`) is correct and defensive. Real fixes require either (a) generated Supabase types — infra work that should be a project-wide setup — or (b) the inner-join syntax, which only narrows the TS shape if the client knows the FK cardinality at compile time. Pair this with the broader "generated Supabase types" tooling decision; until then, the explicit Row type alias + the array-or-object guard is the pragmatic middle ground.

### `apps/web/app/api/organizations/**` — Extract `requireAdmin` / `requireOrgMember` into `app/lib/orgAuth.ts`

Reviewer asked to consolidate the 4 near-duplicate auth gates across `[id]/route.ts`, `[id]/members/route.ts`, `[id]/members/[memberId]/route.ts`, and `[id]/event-assignments/route.ts` into a shared module exposing `requireOrgMember` (returns `{ callerUserId, role }`) and `requireOrgAdmin` (calls `requireOrgMember` and enforces `owner|admin`).

**Deferral reason:** 4 instances IS over the extraction threshold, but the refactor is mechanical with zero behavior change. Better as a focused follow-up PR after Stage 3 lands so any regression is easier to attribute. The existing `/api/organizations/members/remove/route.ts` would be the 5th consumer — it already implements the same gate inline, so the cleanup PR should sweep that too.

### `apps/web/app/components/organizer/OrganizerTeamView.tsx` — Role hex colors → design tokens

Reviewer asked to replace `text-[#238FDA]` (admin), `text-[#5DDBB1]` (organizer), and `text-[#FF4444]` (remove action) with semantic tokens.

**Deferral reason:** Mobile [apps/mobile/app/org-members.tsx](apps/mobile/app/org-members.tsx) uses the **same** raw hex literals for the role badge colors. Same blocker as the UserDashboard `STATUS_COLORS` nitpick from the previous review round: `flameColors` doesn't yet exist in `@project-flame/lib`. When the lib token export ships, sweep both platforms in one go.

### `apps/web/app/profile/page.tsx` — Split `ProfileContent` into `ProfileHeaderSection` + `OrganizersSection`

Reviewer suggested extracting `ProfileContent` (~140 lines) into two new sub-components: `ProfileHeaderSection` (avatar + name + email + Edit pill) and `OrganizersSection` (org list + empty/loading/error/retry + Create-new CTA), leaving only modal state and composition in `ProfileContent`.

**Deferral reason:**
1. Single consumer — `ProfileContent` is used in exactly one place (`/profile`). Per the starter-prompt extraction rule ("2 is not enough to justify abstraction"), this isn't at threshold.
2. No bug — purely a "keep components small" guideline call, not a correctness issue. Current file (~250 lines incl. imports + 3 sub-components + JSX) is within normal single-file scope.
3. Mobile parity — [apps/mobile/app/(tabs)/profile.tsx](apps/mobile/app/(tabs)/profile.tsx) is structured the same way (one `ProfileContent` with header + org list inline). Stage 3 plan: "web replicates mobile exactly." Splitting only web creates a parity gap.
4. Prop-threading cost — would require threading ~9 props across two new components to replace what was previously local-variable access. The closures move in lockstep, a classic sign the abstraction isn't paying for itself.

Revisit if a 2nd consumer appears (e.g. a settings page that wants to render the same header), or if mobile's `ProfileContent` is split first.

## May 2026 PR Review — Send Tickets / bank-transfer pricing (May 6, 2026)

### `apps/mobile/components/org-dashboard/OrgSendTicketsCard.tsx` — Replace hardcoded color literals with Flame tokens

Reviewer flagged the new tier picker and Send button blocks (lines ~573-637) for using raw hex literals (`"#041C2B"`, `"#F9FBFE"`) on `Ionicons` `color` props and `ActivityIndicator` `color` props instead of importing `flameColors` / `flameColorWhite` from `@project-flame/lib` (per `flame-design-system.mdc`'s "Raw CSS strings" rule).

**Deferral reason:** Pure design-system token alignment — no behavior change, no bug. The same hex literals already appear ≥6 other places in this same file (pre-existing, unrelated to this PR). Fixing only the new code creates an inconsistent pattern; doing the whole sweep here is scope creep beyond a parity-fix PR. Defer to a single dedicated sweep across `apps/mobile/components/org-dashboard/*` that converts every raw color prop in the directory to `flameColors`/`flameColorWhite`. When that sweep happens, also audit the rest of `apps/mobile/components/` for the same pattern — it's likely systemic.



## April 2026 PR Review — Image Pipeline (Apr 20, 2026)

### `apps/mobile/lib/event-image.ts` — Split `manipulateAsync` into per-step calls (crop / resize / encode) for finer error attribution

**Context:** `processEventImageTo4x5` still uses `expo-image-manipulator` — it is *not* removed. What the helper consolidates is the duplicated inline resize/format-inference logic that used to live in both `EventDetailsTab.tsx` (create) and `EditEventDetailsTab.tsx` (edit): those two files previously had their own copies of `inferSaveFormat`, `needsConversion`, `formatToMime`, and a branching resize path. `processEventImageTo4x5` now calls `ImageManipulator.manipulateAsync(asset.uri, actions, { compress: 0.8, format: JPEG })` once with an actions array (crop if needed, resize if needed, encode as JPEG) so both tabs share the same pipeline.

**What was done (Apr 20, 2026):** The single `manipulateAsync` call is now wrapped in a try/catch that re-throws an `Error` containing the step summary (`"crop+resize+jpeg-encode"`, etc.), the source `asset.uri`, and the original error message/stack. Logs from `EventDetailsTab.handlePickImage` / `EditEventDetailsTab.handlePickImage` now reach triage with enough context to reproduce.

**What is still deferred:** Splitting the single `manipulateAsync` call into three separate calls (one for crop, one for resize, one for JPEG encode) so each step has its own try/catch. The original reviewer suggestion implied three calls existed today — they don't; all actions are fused into one native-bridge call by design. Splitting them would:

- Triple the native-bridge round-trips and URI decodes per upload (measurable on low-end devices).
- Require writing the intermediate file to disk between steps (the returned `uri` is a temp path).
- Add no real value for a failure mode that has ≈0 production occurrences.

Revisit only if production logs show a class of `manipulateAsync` failures where the wrapped step-summary context is insufficient to attribute the root cause.

---

## Phase 10-2 PR Review — Deferred (Mar 23, 2026)

### `apps/mobile/hooks/useManageMembers.ts` — Move `useAddMember`/`useUpdateMemberRole` behind server API

`useAddMember` and `useUpdateMemberRole` write directly to `organization_members` via the Supabase client with RLS protection. The reviewer suggested routing these through server-side API endpoints (matching the pattern of `useRemoveMember`).

**Deferral reason:** Intentional design — documented in the file header ("addMember and updateRole use Supabase directly (RLS-protected)"). The RLS policies enforce authorization including owner-role guard. No corresponding server endpoints exist; creating them is a scope expansion beyond a review fix. Defer until a server-authority audit of all org mutation paths is done.

---

## Email Fix PR Review — Deferred (Mar 23, 2026)

### `apps/web/app/lib/orders.ts` (line 129) — Replace `Record<string, any>` in `logOrderError`
The `errorDetails` parameter uses `Record<string, any>`. Replace with `Record<string, unknown>` or a specific `OrderErrorDetails` interface and add type guards/`JSON.stringify` inside the function for safe serialization. Update all callers to conform.

### `apps/web/app/lib/orders.ts` (lines 1107-1113) — Structured logging for `sendPushToOrgMembers` catch
The `.catch(err => console.error(...))` on the `sendPushToOrgMembers` call only logs the error string. Add structured context fields (`userId`, `eventId`, `organizationId`, `orderId`, `action: "ticket_sold"`) to the error log for better triage.

---

## Q2 Currency-Aware Fees PR Review — Deferred (Mar 11, 2026)

### `apps/web/app/lib/stripe/fees.ts` (lines 4–7) — Consolidate pricing constants to single source of truth
The module defines local `DEFAULT_PLATFORM_FEE_PERCENT` and `DEFAULT_FIXED_FEE_CENTS` while also importing `getDefaultFixedFeeCents` from `@project-flame/lib`, creating two sources of truth. Replace the local constants by importing `DEFAULT_PLATFORM_FEE_PERCENT` and `DEFAULT_FIXED_FEE_CENTS` from `@project-flame/lib`, remove the local definitions, and update usages in this file so all pricing values come from the shared source.

### `docs/historico/features/MULTI_CURRENCY_PLAN.md` (around lines 20–21) — Clarify per-currency fixed fees as approximate USD equivalents
Update the docs to state explicitly that values in `DEFAULT_FIXED_FEE_BY_CURRENCY` (and the stored `markup_fixed_cents`) are approximate point-in-time USD equivalents: calculated at a specific date, exchange rates fluctuate so values should be periodically reviewed/updated, and the tilde (~) denotes approximation. Add a note pointing to MARCH_2026_FIXES.md #440 for provenance. Keep references to `getDefaultFixedFeeCents` and `getEventMarkup`.

### `events.markup_fixed_cents` — Add DB column comment for schema inspection
Create a follow-up migration that sets `COMMENT ON COLUMN events.markup_fixed_cents` to clarify that the stored value is in the event's local currency minor units (not USD) and to reference `DEFAULT_FIXED_FEE_BY_CURRENCY` / `getDefaultFixedFeeCents` for default logic. Enables schema inspection tools and raw SQL readers to understand the local-currency semantics despite the USD-centric column name.

### `packages/lib/__tests__/stripe-fees.test.ts` (lines 89–124) — Refactor getDefaultFixedFeeCents tests to table-driven
Replace repetitive asserts with a table-driven loop: iterate over `DEFAULT_FIXED_FEE_BY_CURRENCY` entries and assert `getDefaultFixedFeeCents(currency)` equals the mapped value for each; include case-insensitivity checks (e.g., `currency.toLowerCase()`, `currency.toUpperCase()` return same value); keep a separate small test for fallbacks (`getDefaultFixedFeeCents("unknown") === DEFAULT_FIXED_FEE_CENTS`). Reference `getDefaultFixedFeeCents`, `DEFAULT_FIXED_FEE_BY_CURRENCY`, and `DEFAULT_FIXED_FEE_CENTS`.

### `packages/lib/src/pricing/constants.ts` (lines 37–48) — Exhaustive typing for DEFAULT_FIXED_FEE_BY_CURRENCY
Change `Record<string, number>` to an exhaustive type (e.g., `Record<CurrencyCode, number>` derived from `SUPPORTED_CURRENCIES`) so that newly added supported currencies must be explicitly added to `DEFAULT_FIXED_FEE_BY_CURRENCY` instead of silently falling back to `DEFAULT_FIXED_FEE_CENTS`. Update `getDefaultFixedFeeCents` to accept/validate `CurrencyCode` (or map input string to CurrencyCode before lookup).

---

## P8 PR Review — Deferred (Mar 10, 2026)

### `apps/mobile/hooks/useOrgEventEnriched.ts` (lines 267–270) — composedRefetch stability
The `composedRefetch` useCallback currently depends on `query.refetch`, which is unstable because `query` is recreated each render. Destructure `refetch` from `query` (e.g., `const { refetch } = query`) and use `refetch` and `refetchOrgData` in the dependency array of useCallback (replace `query.refetch` with `refetch`), so `composedRefetch` is stable across renders. Adjust the dependency array to `[refetchOrgData, refetch]`.

### `apps/mobile/components/events-management/EditEventDetailsTab.tsx` (lines 316–324) — Use maxLength instead of manual slice
Replace manual truncation in `onChangeText` (`setDescription(v.slice(0, 520))`) with `maxLength={520}` on the TextInput and `onChangeText={setDescription}` (or pass setDescription directly). Rely on input-level enforcement; remove double-truncation logic.

### `apps/mobile/components/events-management/EditTiersTab.tsx` (line 366) — Timezone fallback
Change hardcoded `"America/Guayaquil"` to a generic fallback: `event?.timezone ?? (typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined) ?? "UTC"`. Add a one-line comment explaining precedence: event timezone → system Intl timezone → UTC. Use `typeof Intl !== "undefined"` guard for defensiveness in older environments.

### `apps/mobile/components/events-management/EditTiersTab.tsx` (lines 167–174) — Catch block logging
In the catch blocks around `updateTier.mutateAsync` (and similar blocks for create/delete), log the error with structured context before alerting: `console.error("[EditTiersTab] ...", { eventId, tierId, action, timezone, error })`. Preserve the existing `Alert.alert` and `setEditing` behavior.

### `apps/mobile/components/events-management/EditTiersTab.tsx` (lines 95–159) — Extract tier parsing to lib
Extract tier parsing/validation into a shared helper in `@project-flame/lib` (e.g., `buildTierPayload` or `validateAndBuildTierPayload`). Have `handleSaveEdit` and the create handler call that helper; handle returned validation errors with `Alert.alert`; apply returned updates. Enforce same rules (name non-empty, price ≥0, qty ≥1 and not below quantity_sold when hasSales, perUser 1–50, sales_end > sales_start).

### `apps/mobile/components/org-dashboard/OrgPromotionsCard.tsx` (line 71) — Extract DISCOUNT_OPTIONS to lib
Extract discount rules into a single exported source in `@project-flame/lib` (e.g., `discountSchema` and `DISCOUNT_OPTIONS_FROM_SCHEMA`). Replace local `DISCOUNT_OPTIONS` with an import; derive submit validation from the imported schema so picker and validator cannot drift.

### `apps/mobile/components/org-dashboard/OrgPromotionsCard.tsx` (lines 87–97) — showDiscountSelector interaction tests (backlog)
**Parity evidence (not deferred):** The five required parity items are in `.github/pull_request_template.md` under "OrgPromotionsCard / discount picker". That template populates the PR description when creating a PR, so the evidence is in the PR description — merge gate satisfied. Do not defer parity evidence to this file.
**Deferred (interaction tests only):** Mock `ActionSheetIOS.showActionSheetWithOptions`; render with `Platform.OS="android"` for modal path; assert select, cancel, dismiss, and `setDiscountPercentage`/show-hide state updates.

### `apps/mobile/app/ticket/[id].tsx` (lines 198–213) — Extract timezone fallback and range assembly to lib

Extract into `@project-flame/lib` a shared helper (e.g. `getEventTimeRange` or `formatEventTimezoneRange`) that accepts `{ starts_at, ends_at, timezone }` and returns `{ tz, dateStr, timeRange, tzAbbr }` using `isValidIanaTimezone`, `formatEventDate`, `formatEventTime`, `getTimezoneAbbr`; default timezone to "America/Guayaquil". Replace inline logic in `apps/mobile/app/ticket/[id].tsx` and `apps/mobile/lib/user-ticket-mappers.ts` to import and call this helper so both use the same fallback and range construction.

### `apps/mobile/components/events-management/EditTiersTab.tsx` (lines 188–190) — Warning banner design tokens
The sold-tier warning banner uses raw hex (`bg-[#EAB308]/10`, `text-[#EAB308]`). Replace with design tokens such as `bg-warning-background` and `text-warning-foreground` if they exist in the design system, or add them to `packages/ui` theme and tailwind config so theme consistency and maintainability are improved. **Note:** Design system currently has no warning tokens; add them first.

### `apps/mobile/components/org-dashboard/OrgPromotionsCard.tsx` (lines 213–237) — Tokenize inline styles
- **Completed (`#398`):** Create button label and ActivityIndicator now use `colors.dark` from `@project-flame/ui` instead of `#041C2B`.
- **FlameText gotcha:** On white/light backgrounds (`bg-white-100`), `FlameText` with `className="text-dark"` may not reliably override its default `text-white-100` — NativeWind can ignore the override. Prefer raw `<Text style={{ color: colors.dark }}>` for button labels on white backgrounds when `className="text-dark"` is ignored. Tokenized `className` is preferred when it works (see `flame-design-system.mdc` MARCH_2026_FIXES #327).
- **Remaining:** Replace `ScrollView style={{ maxHeight: 300 }}` with `max-h-[300px]` or a design token.

### `apps/mobile/app/ticket/[id].tsx` (lines 24–25) — SCREEN_WIDTH / FULLSCREEN_QR_SIZE recompute on layout change
`SCREEN_WIDTH` and `FULLSCREEN_QR_SIZE` are computed at module load via `Dimensions.get`, so they won't update on rotation or window resize. Replace with `useWindowDimensions()` (or Dimensions change subscription) inside the component and derive `FULLSCREEN_QR_SIZE` from the current width so the QR size recalculates on layout changes.

### `apps/mobile/hooks/useUserProfile.ts` (lines 24–31) — UserProfileSchema narrower than UserProfile type
`UserProfileSchema` defines a narrower shape than the canonical `UserProfile` from `@project-flame/lib`, but the code asserts `parsed.data` to `UserProfile` (via `useQuery<UserProfile | null>`), risking type mismatches. Update the hook to return a matching narrower type: declare `MobileUserProfile = z.infer<typeof UserProfileSchema>` and use that as the return type, or explicitly change the type assertion to that narrower type. Add a brief clarifying comment near `UserProfileSchema` explaining this intentional subset for the mobile read-only flow.

### ~~`apps/mobile/lib/supabase-auth.ts` (line 53) — console.log → console.error in getToken catch~~ ✅ Fixed (P8 PR review)

---

## P8 PR Review — Deferred (Mar 9, 2026)

### `apps/mobile/hooks/useSignInHandlers.ts` (lines 157–175, 205–220) — Auth input Zod schema + strict typing
Create a small Zod schema and TypeScript interface for the auth input (e.g., `AuthSignUpInput`) inside `useSignInHandlers` and use it to parse/normalize `firstName`, `lastName`, `email`, `password` and OTP rules before any inline checks; replace the inline validation branches around `firstName`/`lastName`/`email`/`password` and the OTP checks with `schema.parse` or `safeParse` and use the parsed values when calling `signUp.create` and `attemptEmailAddressVerification` to remove the non-null assertions (`firstName!`/`lastName!`) and adhere to strict typing — update both the block around `signUp.create` and the similar block at lines ~205–220 to reuse the same Zod parser and parsed result.

### `apps/web/app/api/organizer/promotional-tickets/route.ts` (lines 254–291) — Catch block structured context
The catch block for the `sendTicketReadyEmail` call should log the thrown error with the same structured context used when `sendTicketReadyEmail` returns `false` (the false-return branch). When it returns false, the code logs a structured object; when it throws, the current catch only logs the raw error. Both failure paths should produce consistent metadata. Include: `correlationId`, `opaqueOrderId`, `maskedEmail`, `eventId` (event.id), `eventName` (event.name), `ticketTierName` (ticketTier.name), `quantity` (quantityNum), and `action` ("sendTicketReadyEmail"). Preserve the original error (`emailError`) as the first argument to `console.error` or include it in the context object so the stack trace is retained for debugging.

### `apps/web/app/lib/email/ticket-notifications.ts` (lines 845–850) — orderId escapeHtml
The Order ID value (`data.orderId`) is inserted raw into the event rows while other user-facing fields use `escapeHtml`. Update the array construction that adds the Order ID row (`{ label: "📋 Order ID", value: data.orderId }`) to pass `data.orderId` through `escapeHtml` for defensive consistency. Condition: only when `data.orderId` is present, not "N/A", and `!isFree`.

### `apps/web/app/lib/email/ticket-notifications.ts` (lines 812–826) — formatDate silent catch
The `formatDate` function in `generateTicketReadyEmailHtml` silently swallows parsing errors. Update its catch block to log the parse failure (including the caught error and the input `dateString`) before returning the raw string so upstream data issues can be diagnosed. Use `console.error` with a clear message including the function name, offending `dateString`, and error details.

### `apps/mobile/components/org-dashboard/OrgSendTicketsCard.tsx` (lines 223–228) — TierOption semantic fields
**Option (a) — keep `label` as computed display-only:** Add semantic fields to `TierOption`: `tierName: string`, `stageName?: string`, retain `priceCents: number`, and mark `label` as deprecated/display-only. All constructors/builders of `TierOption` (including where OrgSendTicketsCard creates tier options) must populate `tierName`, `stageName`, and `priceCents`, then compute `label` as a derived field (e.g. tierName + (stageName ? " - " + stageName : "") + " (" + formatCentsAsPrice(priceCents) + ")"). Replace consumers that parse `label` (notably the success alert using `split(" ($")`) to instead use `tierName`/`stageName` for names and `formatCentsAsPrice(priceCents)` from `@project-flame/lib` for prices. Display components may continue using `label` for UI rendering, but stop programmatic parsing of `label`.

### `apps/mobile/components/org-dashboard/OrgSendTicketsCard.tsx` (lines 256–267) — Locale-aware currency formatter
Replace the hardcoded dollar sign and `.toFixed(2)` formatting in the tier option label construction with a locale-aware formatter. Use `Intl.NumberFormat` or the shared currency formatter from `@project-flame/lib` (`formatCentsAsPrice`) to format `(stage.price_cents / 100)` into a currency string. Update both the staged pricing label (`${tier.name} - ${stage.name} ($${(stage.price_cents / 100).toFixed(2)})`) and the base tier label (`${tier.name} ($${(tier.price_cents / 100).toFixed(2)})`) to use the formatter instead of interpolating `$` and `toFixed(2)`.

### `apps/mobile/app/event/[id].tsx` (lines 178–187) — Unstable `resetCheckout` in useEffect dependency array
The dependency array includes `checkoutState.resetCheckout` which can be unstable and cause extra re-renders. Extract a stable reference outside the effect (e.g., create a memoized/stable function like `const resetCheckout = useCallback(() => checkoutState.resetCheckout(), [checkoutState.resetCheckout])` or store the method in a ref) and replace `checkoutState.resetCheckout` in the useEffect dependency array with that stable reference so the effect only reruns when the actual behavior changes.

### `apps/mobile/components/event-details/CheckoutSuccessState.tsx` (lines 37–55) — Replace hardcoded success hex with design token
Replace the hardcoded success hex in the circular icon background with a design token class: update the View that uses `className="size-[64px] rounded-full bg-[#5DDBB1]/20 items-center justify-center mb-1"` to use a design token (e.g., `bg-success/20` if a `success` token exists). Replace the Feather icon color `"#5DDBB1"` with the corresponding token (e.g., `text-success` or mapped color variable) so FlameText/Feather and the container use consistent tokenized colors. **Note:** Verify the design system defines a `success` token; if not, add it to the theme or use the nearest existing token.

### ~~`apps/mobile/hooks/useCheckout.ts` (lines 699–702) — Injectable wrapper for GET calls~~ ✅ Fixed (MARCH_2026_FIXES #345)
- ~~Add injectable wrapper for GET calls mirroring injectedApiPost.~~ Added `injectedApiGet` to `useCheckout`; hold validation now uses it.

### `apps/mobile/app/scanner.tsx` (lines 640–1018) — ScannerContent extraction
ScannerContent has grown too large and mixes concerns (org resolution, camera permission, tab routing, and the QR scanner state machine). Split responsibilities by extracting: (1) **ScannerTabsContainer** (or separate components) that keeps ScannerTabs + org resolution and permission gating; (2) move the access-codes view into AccessCodesManagement (already present), ensure it only receives orgId and padding props; (3) **QRScannerScreen** component that encapsulates scannerState, ticketDetails, errorMessage and all rendering branches (IdleState, CameraView + controls, VerifiedState, CheckedIn, Error), using a useQRScanner hook for logic; (4) lift small handlers (handleBarcodeScanned, handleConfirmCheckIn, handleReset) into that new component; (5) update ScannerContent to wire these smaller components (passing effectiveOrgId, permission/requestPermission, deviceIdRef) so ScannerContent becomes a thin coordinator.

---

## P7-3 PR Review — Deferred (Mar 7, 2026)

### `apps/mobile/hooks/useRsvpManagement.ts` (lines 417–418) — Simplify currency assignment
In `useEventRsvps` queryFn, the line `const currency = (eventResult.data as { currency?: string })?.currency ?? undefined` is redundant — optional chaining already yields `undefined` when the property is absent. Simplify to `const currency = (eventResult.data as { currency?: string })?.currency` and update the return `(rsvps, stats, registrationFormConfig, isPastEvent, currency)` accordingly. No behavioural change.

---

## PR Review (Mar 6, 2026) — DateTimePickerField DEFAULT_TZ

### `apps/mobile/components/create-event/DateTimePickerField.tsx` (lines 8–15)
`DEFAULT_TZ` is hardcoded in DateTimePickerField.tsx, duplicating timezone logic now present in `@project-flame/lib`. Remove the hardcoded const and import the shared default timezone from the library instead. Replace the local `DEFAULT_TZ` declaration with an imported symbol (e.g., `DEFAULT_TIMEZONE` or whatever export name the lib exposes) and update any usages in this file (functions like `ecuadorLocalToUtc`, `utcToEcuadorLocal`, `localToUtc`, `utcToLocal`) to reference that imported default so mobile and web share the same fallback. **Note:** The lib does not currently export a default timezone constant; add it to `packages/lib/src/utils/timezone.ts` and export from the lib index if implementing.

---

## PR Review (Mar 6, 2026) — DateTimePickerField & EventCard

### `apps/web/app/components/EventCard.tsx` (lines 12–28)
Replace the local duplicate interfaces `EventCardTicketStage` and `EventCardTicketTier` with the shared ticket tier type from `@project-flame/lib` (or a narrow `Pick` of it) so the component uses the single source of truth. Import the shared type at the top of EventCard.tsx and update any usages (e.g., props, variables, ticket_stages) to reference that imported type instead of the locally declared `EventCardTicketTier`/`EventCardTicketStage`.

### `apps/mobile/components/create-event/DateTimePickerField.tsx` (lines 8–15) — Import DEFAULT_TZ from lib
DEFAULT_TZ is hardcoded as `"America/Guayaquil"`, duplicating timezone logic now present in `@project-flame/lib`. Remove the hardcoded const and import the shared default timezone from the library instead (e.g., add `DEFAULT_TIMEZONE` or similar export to packages/lib if not present). Replace the local DEFAULT_TZ declaration with the imported symbol and update all usages so mobile and web share the same fallback.

### `apps/mobile/components/events-management/EditEventDetailsTab.tsx` (lines 174–188)
The FilledInput fields render raw `startsAtLocal` and `endsAtLocal` strings in readOnly mode, causing inconsistent UX with DateTimePickerField. Update the read-only rendering to format these values using the same display logic as DateTimePickerField (extract or reuse its `formatDisplay` helper) so FilledInput receives the human-friendly string. Replace the raw values with formatted values produced by the shared formatDisplay function (or inline equivalent) so both editable and readOnly modes show identical formatted dates.

---

## P7-2 PR Follow-up Review Round 3 — Deferred (Mar 6, 2026)

### `docs/historico/fixes/MARCH_2026_FIXES.md` (Web Parity Gate, lines ~2032–2041) — Convert "Web Source References" table to bullet format
The Web Source References block uses a Markdown table. The canonical format used elsewhere in the changelog (e.g., around entry #200) is a bullet-per-item subsection. Convert each table row to a bullet of the form `- \`mobile/file\` — \`web/file\` (note)`, preserving all existing mappings and inline notes. Apply the same transformation to other affected table blocks in the parity gate (lines ~2056–2073) for consistency.

---

## P7-2 PR Follow-up Review Round 2 — Deferred (Mar 6, 2026)

### `apps/mobile/.env.example` (line ~15–19) — `EXPO_PUBLIC_APP_URL` default points to production
The example value is `https://flme.co`. A developer who copies `.env.example` to `.env` as-is will generate production-facing promoter links during local development. Change the example value to a clearly local/dev placeholder (e.g., `http://localhost:3000` or `YOUR_APP_URL`) so developers must explicitly choose a value for production. Update the accompanying comment to reference `APP_BASE_URL` in `org-event-detail.tsx` and make explicit that the code falls back to `https://flme.co` only when the variable is unset (not when it is set to the wrong value).

---

## P7-2 PR Follow-up Review — Deferred (Mar 6, 2026)

### `apps/mobile/components/notifications/NotificationsOverlay.tsx` (~line 320–324) — Extract `handleRetryRefresh` named callback
The Retry button's `onPress` is a dense inline async IIFE. Extract to a named `handleRetryRefresh` callback (`useCallback`) that calls `setRefreshing(true)`, `await refresh()` in a `try/catch` (log with `if (__DEV__)`), and `setRefreshing(false)` in `finally`. Pass it as `onPress={handleRetryRefresh}`.

### `apps/mobile/components/notifications/NotificationsOverlay.tsx` (~line 93–116) — Add `failOffsetY` to `panGesture`
The horizontal `Gesture.Pan()` can interfere with `FlatList` vertical scrolling if the user begins a slightly diagonal swipe. Append `.failOffsetY([-5, 5])` after `.activeOffsetX([-10, 10])` to cancel the horizontal gesture when the vertical movement exceeds 5px, preserving natural scrolling. The existing `onUpdate`/`onEnd` handlers require no changes.

### `docs/historico/fixes/MARCH_2026_FIXES.md` (line ~1899–1900) — Reword #256 Fix description
The current "Fix:" line doesn't distinguish new mobile delete UI from new API routes (there are none — web routes already existed). Reword to: "Added mobile delete UI for promo codes and promoter links; created `useDeletePromoCode` and `useDeletePromoterLink` mutations (which call the existing `DELETE /api/organizer/promotional-codes/:id` and `DELETE /api/organizer/promoter-links/:id` endpoints used by web). Added delete buttons (trash icon) with confirmation Alert to `OrgPromotionsCard` (per `PromoCodePill`) and `OrgPromoterLinksCard` (per `LinkPill`)."

### `docs/historico/todos/CRUCIAL_IOS_TO_WEB_TODOS.md` — Add cross-reference for `events/[slug]` deep-link route (#258)
The `apps/mobile/app/events/[slug].tsx` route is mobile-only — it resolves slug → event ID and redirects to `/event/${id}?promoter=${promoter}`. Web renders `/events/[slug]` directly as a server route, so no web redirect is required. Add an entry to `CRUCIAL_IOS_TO_WEB_TODOS.md` citing MARCH_2026_FIXES #258, linking to the Universal Links note (#183), and confirming this is a mobile-only routing concern (no web parity change needed). Include a one-line note that the web parity gate for this feature is satisfied: web serves the event page; mobile simply resolves the slug and redirects natively.

---

## P7-2 PR Review — Deferred (Mar 6, 2026)

### `apps/mobile/app/events/[slug].tsx` (line 46) — `as never` cast comment
Add a brief inline comment next to `router.replace(\`/event/${data.id}${params}\` as never)` explaining that the `as never` cast is an intentional Expo Router typing workaround to satisfy strict route typings and prevent TypeScript errors when programmatically replacing routes; note it may be removed when Expo Router typings improve.

### `apps/mobile/components/navigation/RoleSwitcherSheet.tsx` (line 124) — Check icon contrast
Check icon instances use `colors["white-100"]` for the active selection indicator, reducing visual prominence on the dark surface. **Do not use primary/accent color tokens** (red is reserved for RSVP/urgency per the P7-2d audit). Instead use a higher-contrast neutral — e.g., pure `"#FFFFFF"` or a `white-120`/`white-90` equivalent if added to the design system. If no suitable neutral token exists, flag the component for an explicit design decision rather than defaulting to primary. Apply to both `Check` usages for consistency.

### `apps/mobile/components/navigation/RoleSwitcherSheet.tsx` (lines 167–173) — Upsell card tokens
The upsell card (`bg-white-10`, `border-white-30`, icon bg `bg-white-20`) is visually too similar to the mode-switcher rows (`bg-white-5`). **Do not reintroduce primary/accent tokens** (red is reserved per P7-2d). Instead increase the white opacity — e.g., `bg-white-20`, `border-white-50`, `bg-white-30` — to lift the card visually without using brand color. If no suitable neutral token produces enough contrast, add a note in the component flagging it as an intentional exception rather than switching to `bg-primary/*`.

### `apps/mobile/components/org-dashboard/OrgActionButtons.tsx` (lines 41–53) — Hoist hex color constants
The hardcoded hex colors `"#041C2B"` (dark) and `"#F9FBFE"` (white-100) are duplicated across multiple `ActionButton` usages. Hoist them into module-level constants (e.g., `ACTIVE_ICON_COLOR` and `INACTIVE_ICON_COLOR`) — or, if the tokens are available in `colors`, reference `colors["dark"]` and `colors["white-100"]` directly — so all buttons use a single source.

### `apps/mobile/components/settings/SettingsEditableField.tsx` (line 34) — Error color token
The error text class `text-[#EA3370]` hardcodes the pink error color. Add an `"error"` token under `theme.colors` in `tailwind.config.js` set to `#EA3370`, then replace the hardcoded class with `text-error` to share the token across mobile and web.

### `apps/mobile/components/sign-in/CredentialsForm.tsx` (lines 100–103) — ActivityIndicator color token
The `ActivityIndicator` color prop is hardcoded as `"#041C2B"`. Replace with `colors.dark` (from the design system) and add the `colors` import if not already present, consistent with other components.

---

## PR Review (Mar 6, 2026) — Auth, Scanner, Settings, Components

### `apps/mobile/app/(tabs)/settings.tsx` (lines 193-212)
- **Force Sign Out duplicate:** The "Force Sign Out" button calls `handleSignOut` — the same function as "Sign Out" (via `handleSignInOut`). Both buttons have identical behavior. Either replace with a distinct `handleForceSignOut` that performs a forced/session-clear sign-out flow, or remove the duplicate UI if no distinct behavior is required. Preserve `isSignedIn` and `isSigningOut` for enabled/disabled and visibility logic.

### `apps/mobile/components/history/HistoryCard.tsx` (lines 12-17)
- **Accessibility metadata when pressable:** The Wrapper toggles between Pressable and View based on `onPress` but doesn't provide accessibility metadata when pressable. Add `accessibilityRole: 'button'` (and optionally `accessibilityLabel`/`accessibilityHint`) to `wrapperProps` when `onPress` is truthy.

### `apps/mobile/components/org-dashboard/OrgActionButtons.tsx` (lines 7-12, 14-22)
- **Export SectionVisibility type:** Change `type SectionVisibility` to `export type SectionVisibility` so other modules can import it instead of re-declaring. Update any locations that re-declare `SectionVisibility` to import from this module.
- **ActionButtonProps interface:** Extract the inline prop typing for ActionButton into a named interface `ActionButtonProps { onPress: () => void; active: boolean; children: ReactNode }` and use it in the component signature.

### `apps/mobile/components/scanner/OrgSelector.tsx` (lines 55-59)
- **ScrollView → FlatList:** Replace horizontal ScrollView with FlatList: `horizontal`, `showsHorizontalScrollIndicator={false}`, `contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}`, `data={orgs}`, `renderItem`, `keyExtractor={(item) => item.organizationId}`. Import FlatList from 'react-native'.

### `apps/mobile/hooks/useUserOrgs.ts` (lines 34-35)
- **Wrap errors with context before rethrowing:** Replace raw `throw userError`/`throw orgsError` with errors augmented with action and identifiers (e.g., `action: "fetchUser"`/`"fetchUserOrgs"`, `userId`). Rethrow a new Error that concatenates original details and context.

### `apps/mobile/hooks/useUserTickets.ts` (lines 163-197)
- **Replace userId! non-null assertion:** Add explicit guard: `if (!userId) return { tickets: [] }` (or throw clear error) before calling `client.from("users").select(...).maybeSingle()`. Update control flow so `currentUser` resolution only runs when `userId` is present.

### `apps/mobile/hooks/useSignInHandlers.ts` (lines 75–77, 114–116, 152–154)
- **getAuthErrorSummary / formatErrorSummary helper:** Extract duplicated error-summary logic into a small helper (e.g., `formatErrorSummary(err): { message?: string; code?: string }`) and replace the inline errSummary creation in each catch (sso_signin, email_signin, email_signup) with a call to that helper. Helper returns `{ message: err.message, code: (err as { code?: string }).code }` when `err instanceof Error` and `{}` otherwise.

### `apps/mobile/lib/user-ticket-mappers.ts` (lines 19-20)
- **Optional tierName/stageName:** Make `tierName` and `stageName` optional on `TicketGroupDisplay` (e.g., `tierName?: string`, `stageName?: string | null`) so older constructors remain compatible during rollout.

### `useSignInHandlers redirectUrl` (verified, no change)
- **Finding:** PR comment stated `redirectUrl: AuthSession.makeRedirectUri()` was removed. **Verified:** Both the parameter and `expo-auth-session` import are present in the current code. No fix needed.

---

## `apps/web/app/api/upload-profile-image/route.ts` (PR Mar 5, 2026)

- **Structured error logs:** The error logs (e.g., `console.error("Error uploading personal profile image:", uploadError)` near the upload flow, and similar in company upload, delete, and catch blocks) only print a message and the error object. Update to emit structured context: `{ userId, organizationSlug: organizationSlug || path, action: "uploadProfileImage" | "deleteProfileImage" | etc., error }`. Apply consistently across all error log sites in the route so production logs are queryable for triage.
- **Shared image-upload utilities:** `MIME_TO_EXT`, `ALLOWED_MIME_TYPES`, `getExtensionFromMimeType`, `MAX_FILE_SIZE`, `VALID_SLUG_PATTERN`, and `verifyOrgMembership` are duplicated across `upload-profile-image/route.ts`, `upload-org-image/route.ts`, and partially `upload-image/route.ts`. The codebase has `apps/web/app/lib/utils/image-upload.server.ts` (currently for event-images bucket). Extract shared constants and helpers (MIME mapping, validation, org membership) into a common module (e.g., `image-upload.server.ts` or a new `profile-image-upload.server.ts`) to avoid divergent bug fixes across three files.
- **IMAGE_SIGNATURES and detectMimeFromBuffer duplication:** The magic-byte image detection logic (`IMAGE_SIGNATURES` array and `detectMimeFromBuffer` function) is duplicated in `upload-profile-image/route.ts` and `upload-org-image/route.ts`, risking security drift. Extract into a shared utility module under the API utilities (e.g., `apps/web/app/lib/utils/image-mime-detection.ts`) and import in both routes.

---

## Push Notifications — Deferred (Mar 5, 2026)

### `apps/web/app/api/cron/event-reminders/route.ts`
- **Bounded parallelism:** The loop over `uniqueUserIds` awaits `sendPushNotification` sequentially; for large events this can timeout. Refactor to use bounded parallelism (e.g., chunk into batches, `Promise.allSettled` per batch) while preserving alreadyNotified/totalSent/totalSkipped logic.

### `apps/web/app/api/rsvp/route.ts`
- **Avoid extra currentUser() fetch:** Use the existing Clerk user object to compute `pushUserName`; fall back to "Someone" if not present. Remove the extra `currentUser()` call around lines 1294–1297.

### `apps/mobile/hooks/useNotificationPreferences.ts`
- ~~**NotificationType extraction:** Extract the duplicated `NotificationType` union into `@project-flame/lib`~~ ✅ Fixed (MARCH_2026_FIXES.md #123)
- **updatePreference stale closure:** Use functional state update in `updatePreference` so it no longer closes over `preferences`; remove preferences from dependency list, use `setPreferences(prev => { ... })` and perform async Supabase update with derived value; on error rollback via `setPreferences(() => prevPreferences)`. _(Note: Supabase `{ error }` check and rollback fixed in MARCH_2026_FIXES #125.)_

### `supabase/migrations/20260304155846_add_push_tokens_and_notifications.sql`
- **Composite index:** Add `CREATE INDEX idx_notifications_user_created_at ON public.notifications(user_id, created_at DESC)` for the common "my notifications newest first" query pattern.

### `apps/mobile/components/notifications/NotificationsOverlay.tsx` (Mar 5, 2026)
- **Extract subcomponents:** NotificationsOverlay does too much. Extract: `NotificationHeader` (title, Mark all read, close; uses unreadCount, markAllAsRead, onClose), `NotificationList` (loading/empty states, FlatList, refresh, handleNotificationPress prop), animation wrapper (progress, animatedStyle, shouldRender, useEffect open/close) that renders `<Animated.View>` around subcomponents. Keep handleNotificationPress in NotificationsOverlay, pass to NotificationList.
- **Dismiss action styling:** The Pressable using `styles.dismissAction` (lines ~163-165, 296-303) should use NativeWind classes instead: remove `styles.dismissAction` and StyleSheet.create, replace with `className` (e.g. `w-20 bg-primary justify-center items-center`) so the dismiss action follows mobile styling conventions.

---

## `docs/historico/fixes/MARCH_2026_FIXES.md` (PR Mar 5, 2026)
- **Changelog entry order:** Tracked in PR review comment on MARCH_2026_FIXES.md — reorder headings to monotonic sequence or add backfill note at top.

## `apps/mobile/hooks/useOrganizations.ts` (PR Mar 4, 2026)
- **Structured error log:** The `console.error` in the organizations query block logs a plain string. Update to log an object with an `action` field for consistency (e.g., `console.error({ action: "useOrganizations.query", message: "[useOrganizations] query failed", error })`), then rethrow.

## `apps/mobile/components/events/EventsScreenBody.tsx` & `FilterBottomSheet.tsx` (PR Mar 4, 2026)
- **OrgOption type duplication:** The `OrgOption` interface (`{ name: string; slug: string }`) is independently defined in both `FilterBottomSheet.tsx` and `EventsScreenBody.tsx`. Extract to `@project-flame/lib` (or a shared types file) and import in both files to avoid drift. Suggested fix: add `OrganizerOption` type to `packages/lib`, export it, and replace local `OrgOption` in both components.

## `apps/mobile/components/settings/OrganizationSettingsTab.tsx` (PR Mar 4, 2026)
- **Structured error logs:** The catch blocks (upload, delete, sign-out) use `console.error` with a message string and error. Update to emit a single object: `{ action: "upload-image" | "delete-image" | "sign-out", organizationSlug?, userId?, error }` so production logs are queryable. Locate: handleEditOrgPhoto catch (~line 65), handleDeleteOrgPhoto catch (~line 97), handleSignInOutPress catch (~line 121).

## `apps/mobile/hooks/useUserTickets.ts`
- **Parallel DB reads in queryFn:** The three independent Supabase queries for `rawTickets`, `rawRsvps`, and `rawPromo` (lines ~163-209) are executed sequentially. Change to `Promise.all` / `Promise.allSettled` so all three execute concurrently, then await results and handle errors per-query (throw on tickets/rsvps errors; preserve the existing `try/catch` fallback for `promotional_tickets` so it degrades gracefully on RLS failures). This reduces initial load latency by ~2× on slow connections.

## `apps/mobile/hooks/useAppEvents.ts`
- **Injected Supabase Client:** The hook currently imports a module-level supabase singleton. Refactor `useAppEvents` to accept a Supabase client via an optional function parameter (e.g., `client`), defaulting to the imported singleton for backward compatibility. Update caller/tests so the hook is fully testable.

## `apps/mobile/app/event/[id].tsx`
- **EventDetailScreen Refactoring:** `EventDetailScreen` is over 100 lines and should be split into smaller components. Extract logical sections (header/back navigation, ticket selection state/handlers, loading/error/not-found views, and bottom-sheet checkout wiring) into focused subcomponents (e.g., `EventDetailHeader`, `EventDetailBody`, `EventCheckoutWrapper`) to improve readability.

## `apps/mobile/hooks/useCheckout.ts`
- **Stripe Load Error Logging:** The catch block around loading Stripe (the `try/catch` in `useCheckout`) swallows errors. Update it to log the caught error (e.g., using `console.debug`/`console.error` guarded by `__DEV__`) while still returning `null` for graceful degradation.
- **Dead Code: `promoValidationInvalidSchema` and Discriminated Union:** The `promoValidationInvalidSchema` (lines 69-83) and the `promoValidationResponseSchema` discriminated union (lines 85-88) include an `invalid` branch (`valid: false`) that can never match actual API responses. The `/api/purchase/validate-promo-code` endpoint returns HTTP 400/404 for invalid codes (caught by `apiClient` as thrown exceptions), never a `200` with `valid: false`. This means the invalid schema and the `else` branch at lines 275-280 are dead code. Consider removing the invalid schema, simplifying `promoValidationResponseSchema` to just the valid schema, and removing the `else` branch in `validatePromo`.

## `packages/ui/src/index.tsx`
- **Export FilterPill Component:** Export the `FilterPill` component alongside its props type (`FilterPillProps`) to avoid deep imports. Alternatively, if it should remain internal, remove the exported `FilterPillProps` to keep the API consistent.

---

## PR Review (Mar 5, 2026)

### `apps/mobile/app/(tabs)/index.tsx` — HomeFeedEventCard reimplementation

- **Issue:** `HomeFeedEventCard` reimplements the date badge, RSVP badge, calendar/location metadata rows, and card layout already present in `EventCard` and `EventListCard` in `packages/ui`. The duplicated patterns increase maintenance burden and risk divergent fixes.
- **Context:** Lines 44–123 in index.tsx. The full-width layout differs from fixed-width `EventCard`; consider extracting a shared variant or composing from existing components.

### `apps/mobile/app/(tabs)/index.tsx` — FlatList virtualization

- **Issue:** The feed maps `filteredEvents` into a ScrollView which mounts all `HomeFeedEventCard` items at once; no virtualization.
- **Fix:** Replace with a virtualized `FlatList` using `filteredEvents` as `data`, `keyExtractor={(item) => item.id}`, `renderItem` for `HomeFeedEventCard` (and conditionally `FeaturedEventsCta` every 5 items). Configure `initialNumToRender`, `windowSize`, `onEndReached`/`onEndReachedThreshold` for pagination if needed. Use `ListHeaderComponent`/`ListFooterComponent` for header/footer instead of mounting everything in JSX.

### `apps/mobile/components/events/EventsHero.tsx` (line 5, ~49-53)
- **PLACEHOLDER_LOGO external URL:** Replace the `PLACEHOLDER_LOGO` constant (currently `https://placehold.co/67x67/1a1a2e/ffffff?text=ORG`) with a bundled image import or local fallback. Use a local asset or inline Icon component for the org avatar fallback when `profileImageUrl` is null so no external network requests to placehold.co are made.

### `apps/mobile/app/organizer/[slug].tsx` (lines 44-53)
- **Configurable share base URL:** Replace hardcoded `https://flme.co/organizer/...` with a configurable base (e.g. `NEXT_PUBLIC_BASE_URL` or runtime config). Construct the full link with that base and `trimmedSlug`; use env-derived base with sensible fallback for local/dev; URL-encode `trimmedSlug` before concatenation.
- **Structured share error log:** Update the share handler catch to log structured context: `{ action: "share", slug, error }` (and userId/eventId if available) to match the `handleRefresh` pattern.

### `apps/mobile/components/event-details/CheckoutMainSheet.tsx` (lines 245-252)
- **Promoter Apply button during validation:** Disable the "Apply" Pressable while `promoterStatus === "validating"` and when the promoter input is empty. Add early-return in `handlePromoterSubmit` for those cases to prevent duplicate calls and race conditions. Update visual style (e.g. opacity) when disabled.

### `apps/mobile/hooks/useCheckout.ts` (lines 14-15)
- **Inject Supabase client:** Add `supabaseClient` as an optional dependency (like `apiPost` and `getStripeFunctions`). Remove direct import of `supabase`; replace all internal uses with the injected client (default to module singleton for backward compatibility). Update callers (`app/event/[id].tsx`) and tests to pass the client.

### ~~`apps/mobile/app/(tabs)/index.tsx` (lines 32-209)~~ ✅ Fixed (MARCH_2026_FIXES.md #210)
- **HomeScreen extraction:** HomeScreen was too large. Extracted: `EventsStatusContainer`, `useHomeRefresh`, `useScrollRegistration`, `useEventFilters`, `HomeFeedList`. HomeScreen now composes these pieces.

### `apps/mobile/app/edit-event.tsx` (line 64)
- **Spacing token:** Replace `gap-[14px]` with project standard `gap-6` (24px) on the View wrapping the form/list sections so section spacing follows Form/List screens guideline.

### `apps/mobile/components/navigation/BecomeOrganizerSheet.tsx` (lines 51-245, 92-97)
- **Structured log in catch:** Add a structured log/telemetry call in the catch block (both ApiError and generic branches) that records `{ action: "become_organizer_submit", userId?, error }` before calling `setError`.
- **Split into subcomponents:** Extract `OrganizerApplicationForm` (form UI) and `OrganizerApplicationSuccess` (success UI) from BecomeOrganizerSheet. Keep orchestration (state, handleSubmit, handleClose) in the parent; pass props to the extracted components.

### `apps/mobile/components/navigation/RoleSwitcherDropdown.tsx` (lines 39-242)
- **Extract OptionRow subcomponent:** Extract the Attending/Hosting option row pattern into an `OptionRow` component (props: iconName, title, subtitle, onPress, selected?, disabled?) to reduce inline JSX complexity.
- **Extract useRoleSwitcher hook:** The component is too large. Create `RoleOptionRow` (props: label, subtitle, iconName, selected, disabled, onPress, accessibilityLabel) and `useRoleSwitcher` hook that exports `switchToAttendeeHandler` and `switchToOrganizerHandler` — internally use switchToAttendee/switchToOrganizer, setIsSwitching, router.replace, onClose; show Alert/console.error on error. Keep animation and modal layout in RoleSwitcherDropdown; import RoleOptionRow and useRoleSwitcher for rows and handlers.

### `apps/mobile/contexts/ViewModeContext.tsx` (lines 18-33)
- **Undefined-initialized context with guard:** Change `ViewModeCtx = createContext<ViewModeContextValue | undefined>(undefined)` and update `useViewModeContext()` to throw a clear error if the result is undefined (e.g., "useViewModeContext must be used within a ViewModeProvider") so missing provider fails fast.

### `apps/mobile/app/(tabs)/org-dashboard.tsx` (lines 85-302)
- **OrgDashboardScreen extraction:** Screen is large; extract EventsList (or OrgEventsPanel) for loading/error/empty/current+past rendering; extract SearchBarWrapper for searchQuery state; move mapping logic into hook or new component props. Keep orchestration in OrgDashboardScreen.

### `apps/mobile/app/(tabs)/create-event.tsx` (lines 452-462)
- **Dynamic header height:** ScrollView uses hardcoded `DASHBOARD_BAR_HEIGHT + TABS_HEIGHT`; measure actual rendered height via `onLayout` on the container wrapping DashboardBar and CreateEventTabs, store in state, use for `paddingTop`.

### `apps/mobile/app/(tabs)/events-management.tsx` (lines 32-53)
- **toManageEvent extraction:** Move mapping logic into `@project-flame/lib` as `mapOrgEventToManageView`; include formatEventDate, formatEventTime, image fallback, location join, attendee/capacity, ticketTierName/Count.

### `apps/mobile/app/notifications-settings.tsx` (lines 72-123)
- **NotificationSection component:** Extract duplicated user/org UI into reusable `NotificationSection` (and optionally `NotificationRow`); accept title, items, preferences, updatePreference, colors; replace both blocks with component usage.

### `apps/mobile/app/org-event-detail.tsx` (lines 103-105)
- **DEFAULT_EVENT_IMAGE constant:** Extract placeholder URL into shared constant; replace inline `"https://placehold.co/600x400/1a1a2e/ffffff?text=No+Image"` across files.

### `apps/mobile/app/scanner.tsx` (lines 301-608, 92-99)
- **ScannerContent subcomponents:** Extract PermissionDeniedView, NoEventView, ScanningView, VerifyingView, VerifiedView, CheckingInView, CheckedInView, ErrorView.
- **formatDate/formatTime:** Import shared formatter from user-ticket-mappers; replace local helpers.

### `apps/mobile/components/settings/PayoutsSettingsTab.tsx` (lines 41-54)
- **colorMap refactor:** Store hex/rgb in colorMap; reference for text className and Ionicons color instead of ternary.

---

## Phase 5B Auth — RequireAuthGate JSX indentation (Mar 3, 2026)

### `apps/mobile/app/(tabs)/create-event.tsx`
- **RequireAuthGate JSX indentation (lines ~358-396) (trace: TBD):** Indent the JSX children inside the RequireAuthGate block to match the project's style (as in org-dashboard.tsx) so nested elements are visually one level deeper than the opening `<RequireAuthGate>`. Adjust indentation for the `<View className="flex-1 bg-background">` and all its nested JSX (absolute View, DashboardBar, CreateEventTabs, ScrollView, EventDetailsTab, TicketTiersTab, etc.) to be consistently indented inside `<RequireAuthGate>` for improved readability.

### `apps/mobile/app/(tabs)/events-management.tsx`
- **RequireAuthGate JSX nesting (lines ~69-70) (trace: TBD):** JSX inside RequireAuthGate is mis-indented. Either nest the `<View>` element properly inside the `<RequireAuthGate>` block, or follow the pattern used in dashboard.tsx and ticket/[id].tsx by extracting the screen markup into an internal component (e.g., `EventsManagementContent`) and rendering that inside RequireAuthGate.

### `apps/mobile/app/(tabs)/history.tsx`
- **HistoryContent hooks (lines ~21-38) (trace: TBD):** HistoryContent currently receives `router` and `insets` as props from HistoryScreen. Change to call the hooks internally for consistency: remove `router` and `insets` from HistoryContent's props and instead call `useRouter()` and `useSafeAreaInsets()` at the top of HistoryContent; update the type signature to remove the props, and update HistoryScreen to simply render `<HistoryContent />` (keeping RequireAuthGate as-is). Ensure you only touch HistoryContent and HistoryScreen and keep existing imports.

### `apps/mobile/app/(tabs)/org-dashboard.tsx`
- **RequireAuthGate children indentation (lines ~170-254) (trace: TBD):** The JSX children of the RequireAuthGate wrapper are not consistently indented. Update the block so all elements between `<RequireAuthGate>` and `</RequireAuthGate>` are indented one level (including View, DashboardBar, ScrollView and its nested children like OrgStatsSection, TicketSearchBar, conditional blocks, and closing tags) to match project JSX indentation style and improve readability, ensuring the closing `</RequireAuthGate>` aligns with the opening tag.

### `apps/mobile/app/(tabs)/settings.tsx`
- **RequireAuthGate View nesting (lines ~33-34) (trace: TBD):** The `<View>` element should be indented to reflect that it is a child of `<RequireAuthGate>`. Fix the indentation so that the `<View className="flex-1 bg-background">` line (and its closing tag/block) is visually nested inside the `<RequireAuthGate>` element, matching the style used in events-management.tsx and preserving existing children/layout structure.

---

## Phase 4 Dashboard/Ticket/Notifications — Deferred (Feb 23, 2026)

### `apps/mobile/app/_layout.tsx`
- ~~**Menu and Notifications Overlays Mutual Exclusion:** Make `menuOpen` and `notificationsOpen` mutually exclusive so opening one closes the other.~~ **Obsolete (Feb 23, 2026):** MenuOverlay removed; only NotificationsOverlay remains (Fix #168).

### `apps/mobile/app/settings.tsx`
- **Extract SettingsField to Shared UI:** Move `SettingsField` (and its props: `label`, `value`, `showDropdown?`) into `packages/ui` so both mobile and web can consume it. Preserve styling and Ionicons usage. Currently works fine locally and is settings-screen-specific.

### `apps/mobile/app/ticket/[id].tsx`
- **Extract Subcomponents:** `TicketDetailScreen` is over 100 lines. Extract QR block into `TicketQRCode` and event info block into `EventInfo`, accepting ticket (or relevant fields) as props; import and render inside the screen.

### `apps/mobile/components/dashboard/DashboardBar.tsx`
- **Accept avatarUrl via Props:** Change `DashboardBar` to accept `avatarUrl?: string` (or required with default) via props instead of importing `dashboardUser`; update callers to pass the URL.

### `apps/mobile/components/dashboard/StatsGrid.tsx`
- **Accept stats via Props:** Add `stats: StatType[]` (or equivalent) prop to `StatsGrid`; remove direct import of `dashboardStats`; inject data from parent.

### `apps/mobile/components/dashboard/TicketCard.tsx`
- **Use formatCurrency for Prices:** Import `formatCurrency` or `formatCentsAsPrice` from `@project-flame/lib`; replace inline `${ticket.price}` interpolation with the shared formatter.

### `apps/mobile/components/history/HistoryCard.tsx`
- **Use formatCurrency for Prices:** Import `formatCentsAsPrice` from `@project-flame/lib`; replace `${ticket.price}` with `formatCentsAsPrice(ticket.price)`.

### `apps/mobile/components/menu/MenuOverlay.tsx`
- ~~**useEffect Dependency Array:** Add `translateY` to the animation `useEffect` dependency array to satisfy exhaustive-deps.~~ **Obsolete (Feb 23, 2026):** MenuOverlay no longer triggered (Fix #168).

### `apps/mobile/components/notifications/NotificationCard.tsx`
- **Extract Subcomponents:** Component is over 100 lines. Extract `NotificationHeader` and `NotificationDetails` (or `DetailRow` components) to reduce file size and improve readability.

### `apps/mobile/components/notifications/NotificationsOverlay.tsx`
- ~~**Extract useSlideAnimation Hook:** The animation logic (translateY, setShouldRender, Animated.timing) is duplicated with `MenuOverlay`.~~ **Partially obsolete (Feb 23, 2026):** MenuOverlay no longer triggered (Fix #168). If NotificationsOverlay still uses the pattern, extraction is lower priority since there's no duplication.
- **Hardcoded Background Color:** The View uses `className="flex-1 bg-[#292D32]"` (or similar); replace with design token `bg-surface` or define a new token if intentionally different.

### `apps/mobile/data/mock.ts`
- **Build ticketDetailsById Programmatically:** `ticketDetailsById` is hard-coded and duplicates data from `dashboardTickets`/`historyTickets`. Build it via a reduce/map over those arrays, spreading `ticketDetailBase` and deriving `eventBannerUrl` from each item's `eventImageUrl.replace("w=100", "w=600")`. Low ROI — mock data is replaced in Phase 5.
- **Split mock.ts into static-content.ts and shared types module:** For production the file is still required (partner logos, FAQs, footer, categories, menu items, types). A later cleanup could split it into `static-content.ts` (production static content) and a shared types module, improving clarity and separation of concerns.

### `docs/historico/fixes/FEB_2026_FIXES.md`
- **Split Changelog Entry #153:** Entry #153 combines the currency unit fix and the icon name fix. Consider splitting into two separate entries for independent tracking.

---

## Phase 4 Create-Event / Org Dashboard — Deferred (Feb 23, 2026)

### `apps/mobile/components/create-event/EventDetailsTab.tsx` & `TicketTiersTab.tsx`
- **FormInput Duplication:** `FormInput` is identically defined in both files. Extract into a shared file within `create-event/` (e.g., `FormInput.tsx`) to avoid dual maintenance and inconsistency risk on bug fixes or styling changes.

### `apps/mobile/components/create-event/StageCard.tsx` & `TierCard.tsx`
- **IconBubble Duplication:** `IconBubble` is identically defined in both files. Extract into a shared utility component within `create-event/` to avoid visual inconsistency if one copy is updated without the other.

### `apps/mobile/components/settings/SettingsTabs.tsx`, `create-event/CreateEventTabs.tsx`, `org-dashboard/OrgSendTicketsCard.tsx`
- **TabBar Duplication:** All three contain identical tab-button rendering logic (same classes, same active/inactive styling, same structure). Extract a single generic `TabBar<T>` component accepting `tabs`, `activeTab`, and `onTabChange` to eliminate three-way duplication and ensure consistent future styling updates.

---

## Phase 4 Org Dashboard — Deferred (Feb 23, 2026, Round 2)

### `apps/mobile/components/home/Header.tsx`
- **useRouter() Breaks DI Pattern:** ~~All other interactions (onNotificationPress, onMenuPress) are injected as props.~~ After Fix #168, `onMenuPress` was removed and only `onNotificationPress` remains as a prop. `useRouter()` is still used internally for logo press. Add optional `onLogoPress` prop for testability.

### `apps/mobile/components/menu/MenuOverlay.tsx`
- ~~**Inject Menu Items via Props:** Importing organizerMenuItems from mock hard-couples the component. Pass menu items as props so the parent can inject organizer data.~~ **Obsolete (Feb 23, 2026):** MenuOverlay no longer triggered (Fix #168).

### `apps/mobile/components/org-dashboard/OrgStatsSection.tsx`
- **Pass Stats via Props:** Define explicit prop interface and accept stats from parent instead of importing orgDashboardStats from mock. Aligns with DI + data-shape guidelines.

### `apps/mobile/components/org-dashboard/OrgActionButtons.tsx`
- **Extract ActionButton Props:** Inline prop typing violates "define interfaces for all data shapes". Extract a named `ActionButtonProps` interface.

### `apps/mobile/components/create-event/EventDetailsTab.tsx`
- **Extract FormInput Props:** Inline prop typing violates the guideline. Extract a named interface for FormInput props.

### `apps/mobile/app/org-event-detail.tsx` (PR Feb 23, 2026)
- **TanStack Query for Event Load:** Replace synchronous `getOrgEventDetail(id)` during render with `useQuery` so data is loaded/cached and loading/error states are handled.

### `apps/mobile/app/rsvp-detail.tsx` (PR Feb 23, 2026)
- **FlatList Instead of .map():** Replace the mapped list inside ScrollView with FlatList (renderItem for RsvpRequestCard, ListHeaderComponent for RsvpStatsBar, keyExtractor by request.id) for virtualization.

### `apps/mobile/components/menu/MenuOverlay.tsx` (PR Feb 23, 2026)
- ~~**menuItems as Prop:** Accept `menuItems` prop instead of importing organizerMenuItems; decouple from mock data so parent injects items.~~ **Obsolete (Feb 23, 2026):** MenuOverlay no longer triggered (Fix #168).

### `apps/mobile/components/org-dashboard/RsvpRequestCard.tsx` (PR Feb 23, 2026)
- **Destructure tierName.split Once:** `const [mainTier, subTier] = request.tierName.split("/")` once in body, use in JSX instead of calling split twice.
- **Extract Subcomponents:** Extract Info Rows block into `RsvpInfoRows` and action buttons into `RsvpActionButtons` to bring main component under 100 lines.

### `apps/mobile/components/settings/OrganizationSettingsTab.tsx` (PR Feb 23, 2026)
- **profile as Prop:** Accept `profile: OrgSettingsProfile` prop instead of importing orgSettingsProfile; use prop throughout for DI.

### `apps/mobile/components/settings/PersonalSettingsTab.tsx` (PR Feb 23, 2026)
- **profile as Prop:** Accept `profile: ProfileType` prop instead of importing settingsProfile; use prop for all fields for DI.

### `apps/mobile/components/org-dashboard/OrgPurchasedDetailsCard.tsx`
- **Device Locale for Revenue:** Hardcoded "en-US" in toLocaleString — use `undefined` to default to the runtime locale or a shared formatting helper.

### `apps/mobile/components/settings/PersonalSettingsTab.tsx`
- **Inject settingsProfile as Prop:** Importing from mock hard-couples the component. Pass profile as required prop per DI guideline.

### `apps/mobile/app/org-event-detail.tsx`
- **Extract Sections:** Screen exceeds 100 lines. Extract header + expandable section block into subcomponents for readability.

### `apps/mobile/components/org-dashboard/OrgPromoterLinksCard.tsx`
- **Copy Button Non-Functional:** The Pressable with copy icon has no onPress. Phase 4 is UI only; implement clipboard copy in Phase 5 using expo-clipboard.

### `apps/mobile/components/org-dashboard/OrgSendTicketsCard.tsx`
- **Non-Functional Search UI:** TextInput is editable={false} with hardcoded value; search and Send buttons have no handlers. Phase 4 is UI only; wire state and handlers in Phase 5.

---

## Phase 4 Create-Event / Settings — Deferred (Feb 23, 2026, Round 3)

### `apps/mobile/components/create-event/TicketTiersTab.tsx`
- **Inject Tiers and Stages via Props:** `createEventTiers` and `createEventStages` are imported as module-level globals, making the component untestable and coupled to static fixtures. Change signature to accept `tiers: CreateEventTier[]` and `stages: CreateEventStage[]` as props (or inject via TanStack Query at screen level). Per DI guideline: "Use dependency injection through function parameters, not global imports where possible."

---

## Phase 4 Bottom Tab Navigation / Event Management — Deferred (Feb 24, 2026)

### `apps/mobile/app/(tabs)/_layout.tsx`
- **role constant:** Replace `const [role] = useState<UserRole>("org")` with `const role: UserRole = "org"` and remove unused `useState` import.

### `apps/mobile/app/(tabs)/settings.tsx`
- **Dynamic header/tabs height:** Replace hardcoded DASHBOARD_BAR_HEIGHT and TABS_HEIGHT with onLayout-captured heights.
- **'use client' directive:** Add at top if applicable (Expo/React Native may not use this; verify project convention).

### `apps/mobile/app/(tabs)/events-management.tsx`
- (Placeholder for deferred nitpicks.)

### `apps/mobile/app/(tabs)/history.tsx`
- (Placeholder for deferred nitpicks.)

### `apps/mobile/app/(tabs)/org-dashboard.tsx`
- (Placeholder for deferred nitpicks.)

### `apps/mobile/components/create-event/CreateEventTabs.tsx`
- **Extract TabRow:** Extract reusable TabRow component into packages/ui; refactor CreateEventTabs and SettingsTabs to use it.

### `apps/mobile/components/events-management/CalendarPicker.tsx`
- **Month navigation state:** Add useState for currentMonth/currentYear; implement onPress handlers for chevron-back/forward with year rollover logic.

### `apps/mobile/components/events-management/EditEventDetailsTab.tsx`
- **Handler props:** Add stub onEditImage, onDeleteImage, onSave, onDeleteEvent props for Phase 5 wiring.
- **Split subcomponents:** Extract EventImageWithOverlay, DateTimeSection, RsvpSaveDeleteSection.
- **FilledInput extraction:** Move FilledInput to packages/ui; use in EditEventDetailsTab and TicketTiersTab.

### `apps/mobile/components/events-management/ManageEventCard.tsx`
- (Placeholder for deferred nitpicks.)

### `apps/mobile/components/events-management/EventsListView.tsx`
- **events prop:** Add optional `events?: EventType[]` prop; default to manageEvents; allow consumers to inject data.

### `apps/mobile/components/events-management/TimeSelector.tsx`
- **Sync activePeriod with period:** Add useEffect to setActivePeriod(period) when period prop changes (or document key-based remount at call site).

### `apps/mobile/components/home/Header.tsx`
- (Placeholder for deferred nitpicks.)

### `apps/mobile/hooks/useCheckout.ts`
- **`err` shadowing in hold-cancel catch callbacks:** The `.catch((err: unknown) => { ... })` callbacks inside the hold-cancel fire-and-forget calls (one in the direct-purchase `Canceled` path, one in the error `catch` block) shadow the outer `err` variable from the surrounding `catch (err: unknown)`. While the inner callback correctly references its own `err` (the cancel error), the naming is confusing to readers. Rename the inner parameter to `cancelErr` and update its usage in the `console.error` call so the distinction is explicit. Filed from PR review (Feb 24, 2026).
- **Fire-and-forget hold-cancel style: `.catch()` → async IIFE:** All three hold-cancel fire-and-forget call sites (`resetCheckout`, direct-purchase `Canceled` path, error `catch` block) use `.catch((cancelErr) => { ... })`. PR comment requests changing each to `(async () => { try { await injectedApiPost(...) } catch (cancelErr) { console.error(...) } })()` to match the repo's async/await convention. Functionally identical — both are fire-and-forget with identical error handling. Apply consistently to all three sites when actioned. Filed from PR review (Feb 24, 2026).

---

## Phase 5A Audit — `packages/lib` Event Filters (Feb 24, 2026)

### `packages/lib/src/utils/event-filters.ts` — `isEventActive` Semantics

**PR comment:** Change `isEventActive` semantics from "not-ended" (`ends_at > now`) to "currently running" (`starts_at <= now AND now < ends_at`) and update the JSDoc comment to say "active means currently running, not merely not-ended".

**Why deferred:** The existing "not-ended" semantics (`ends_at > now`) are **intentional and correct per the web source-of-truth**. The web's original `event-filters.ts` (now re-exported) uses this exact logic. All web consumers (`separateEventsByDate` in `OrganizerDashboard`, `DashboardView`, `EventsTiersView`, `UserDashboard`) treat "current" as "not yet ended" — which correctly includes upcoming events that haven't started yet. Changing to "currently running" would misclassify future published events as "past", breaking the organizer dashboard and user ticket history views. If a "currently running" predicate is needed for a future feature (e.g., live event indicators), add a separate `isEventRunning` export rather than changing the semantics of the existing function.

### `apps/web/app/lib/utils/event-filters.ts` — Barrel Re-export Bundle Risk

**PR comment:** The web shim re-exports from `@project-flame/lib` root barrel, which also exports `supabase` and `stripe` modules. This risks pulling unrelated code into `"use client"` component bundles via tree-shaking boundaries.

**Why deferred:** No measurable regression has been observed. Next.js with Turbopack/webpack applies module-level tree-shaking, so unused exports from `@project-flame/lib` are not included unless directly referenced. The `supabase` factory in `packages/lib` is a browser-compatible client (not the admin client), so bundling it is not a security risk. If a bundle-analysis run (e.g., `@next/bundle-analyzer`) shows a regression, the fix is to create a sub-path export in `packages/lib/package.json` (e.g., `@project-flame/lib/event-filters`) and update the web shim to import from that path instead of the root barrel.

---

## Phase 5A Auth Audit — Deferred (Feb 24, 2026)

### `docs/historico/project-migrations/IOS_MIGRATION.md` — Hyphenate "expo-secure-store backed TokenCache"

**PR comment:** Line 95 (Auth Audit Checklist, token-cache bullet): change "expo-secure-store backed `TokenCache`" to "A `TokenCache` backed by `expo-secure-store`" to satisfy QB_NEW_EN_HYPHEN compound-modifier rule. No behavior change — wording only.

### `docs/historico/todos/EDGE_CASES_TODOS.md` — Restore Numerical Sequence (#36 between #35 and #37)

**PR comment:** Item #36 (`rsvp-management.tsx` route param) was appended after item #46 and #47 rather than between #35 and #37. Reorder the file so items appear in ascending numerical sequence (#35 → #36 → #37 → … → #47). No behavior change — ordering only.

---

---

## Phase 5B User Dashboard Logic — Deferred (Feb 24, 2026)

### `apps/mobile/lib/user-ticket-mappers.ts` — `getOrganizerName` dual-field handling

The function handles both `organization` and `organizations` field names via type assertions. Add a comment explaining _why_ both are checked (Supabase join returns singular for single-row, plural for multi-row depending on the query shape) so future readers understand the defensive coding isn't accidental.

### `apps/mobile/components/settings/SettingsEditableField.tsx` — `placeholderTextColor` not a design token

Uses `placeholderTextColor="rgba(255,255,255,0.4)"` which is not an existing design token (closest is `white-50` at 0.5 opacity). Consider aligning to an existing token or defining a new one if 0.4 opacity is intentional per Figma.

### `apps/mobile/components/dashboard/TicketCard.tsx` — `disabled:opacity-50` NativeWind support

The Save button uses `disabled:opacity-50` Tailwind variant. NativeWind may not support the `disabled:` pseudo-class variant natively on React Native `Pressable`. Verify this works at runtime; if not, use a conditional `opacity` style prop instead.

---

## Phase 5B User Dashboard Logic — PR Review Deferred (Feb 24, 2026)

### `apps/mobile/components/history/HistoryCard.tsx` — redundant `priceDisplay` intersection (resolved)

`HistoryCardTicket` was `TicketGroupDisplay & { priceDisplay: string }` even though `TicketGroupDisplay` already declares `priceDisplay`. Fixed in the same PR (type simplified to `TicketGroupDisplay`); noting here for traceability.

### `apps/mobile/lib/user-ticket-mappers.ts` — `getOrganizerName` API shape normalization

The function defensively handles both `organization` and `organizations` Supabase join field names. `getOrganizerName` now correctly handles both forms (fixed in #204). A cleaner long-term approach would be to normalize the API response once in `useUserTickets` (set `event.organization = event.organization ?? event.organizations`) so callers never need to handle both keys. Deferred because normalization requires changes to the API response type and both web/mobile consumers.

**File:** `apps/mobile/lib/user-ticket-mappers.ts` ~line 39  
**Suggested fix:** Normalize `organization`/`organizations` in `useUserTickets` query response handler.

### `apps/mobile/app/ticket/[id].tsx` — inline date/time formatting should use shared helpers

Date and time strings (`dateStr`, `timeStr`, `timeEndStr`, `timeRange`, `organizerName`) are built inline with `new Date(...).toLocale...` instead of using `formatDate`, `formatTime`, and `getOrganizerName` from `user-ticket-mappers.ts`. This duplicates logic. `getOrganizerName` now correctly handles the array shape (fixed in #204) — safe to use as a replacement for the inline logic.

**File:** `apps/mobile/app/ticket/[id].tsx` ~line 113–140  
**Suggested fix:** Export `formatDate(dateString, { includeWeekday?: boolean })` and use `getOrganizerName` from `user-ticket-mappers.ts` in the ticket detail screen.

---

## Phase 5B User Dashboard Logic — PR Review Round 2 Deferred (Feb 24, 2026)

### `apps/mobile/hooks/useUserRole.ts` — `UserRoleResponse` interface not exported

`UserRoleResponse` is declared as a non-exported interface in `useUserRole.ts`. Exporting it would allow downstream modules to reuse the type without re-declaring it.

**File:** `apps/mobile/hooks/useUserRole.ts` ~line 13  
**Suggested fix:** Change `interface UserRoleResponse` to `export interface UserRoleResponse`. No behavior changes required.

### `packages/lib/src/types/ticket.ts` — `stage_id`/`stage_name`/`stage_price_cents` duplicated at top-level and inside `metadata`

`UserTicket` declares `stage_id`, `stage_name`, and `stage_price_cents` both inside the `metadata` object and as top-level optional fields, creating ambiguity about which to read. A clear canonical source should be established with a JSDoc comment or by removing one set of duplicates.

**File:** `packages/lib/src/types/ticket.ts` ~line 27–38  
**Suggested fix:** Either (a) remove the top-level `stage_*` fields and reference `metadata.stage_*` only, or (b) keep both but add a JSDoc stating "Top-level `stage_*` fields override `metadata.stage_*` when present" and update all consumers to prefer the canonical path consistently.

---

## Phase 5B User Dashboard Logic — PR Review Round 3 Deferred (Feb 24, 2026)

### `apps/mobile/app/(tabs)/_layout.tsx` — user tabs `isLoading` guard is opinionated

The current `href: isLoading ? null : isOrg ? null : "/dashboard"` guard hides user tabs while the role query is in flight to prevent the 1→3 tab flash for org users. The reviewer's alternative is to drop the `isLoading` guard and render user tabs optimistically (`href: isOrg ? null : "/dashboard"`), accepting a brief flash for org users in exchange for a more immediate tab bar for regular users. Both approaches are valid — this is an opinionated UX trade-off, not a correctness issue.

**File:** `apps/mobile/app/(tabs)/_layout.tsx` ~line 54, 68  
**Suggested fix:** Replace `isLoading ? null : isOrg ? null : '/dashboard'` with `isOrg ? null : '/dashboard'` (and same for `/history`) to render user tabs optimistically. Consider whether the org-user flash is acceptable for the target user mix.

### `apps/mobile/hooks/useUserTickets.ts` — missing Zod runtime validation in `queryFn`

`useUserTickets.queryFn` returns the raw `apiGet` response without validating it against a schema, unlike `useUserProfile` which uses `UserProfileSchema.safeParse`. Adding a `UserTicketsResponseSchema` would catch unexpected API response shapes at runtime.

**File:** `apps/mobile/hooks/useUserTickets.ts` ~line 25–31  
**Suggested fix:** Import `z` from `zod`, create `UserTicketsResponseSchema = z.object({ tickets: z.array(...) })`, call `safeParse(data)` after `apiGet`, and throw on parse failure — mirroring the `useUserProfile` pattern.

---

## Phase 5B User Dashboard Logic — PR Review Round 4 Deferred (Feb 24, 2026)

### `apps/mobile/app/ticket/[id].tsx` — structured error logging before fallback UI

The error branch renders the "Failed to load ticket" fallback without emitting a structured log. A `console.error` (or app logger call) with `{ action: "loadTicket", ticketId: id, eventId, error }` would aid debugging.

**File:** `apps/mobile/app/ticket/[id].tsx` ~line 110  
**Suggested fix:** Inside the `if (error && !isNotFound)` block, before the `return`, add `console.error("[ticket/[id]] loadTicket failed", { action: "loadTicket", ticketId: id, error })`. Replace with the app's structured logger if one is introduced.

### `apps/mobile/app/ticket/[id].tsx` — custom `useMemo` grouping could use shared mapper

The `useMemo` block in `TicketDetailScreen` reimplements ticket grouping (filtering by `eventId + tierId`, `isQRViewable` predicate, `siblings`, `ticketsInGroup`) independently of the `groupTicketsByEventAndTier` mapper in `user-ticket-mappers.ts`. The reviewer suggests replacing this with the shared mapper to keep grouping logic in one place.

Note: the two usages have different purposes — `groupTicketsByEventAndTier` produces display groups for the wallet/history cards, while the detail screen's grouping navigates between individual sibling tickets. Any refactor would need to expose a lower-level API from `user-ticket-mappers.ts` (or `@project-flame/lib`) that returns `{ ticketsInGroup, currentTicket, currentIndex }` for a given `ticketId`. Defer until the mapper's scope is clearer.

**File:** `apps/mobile/app/ticket/[id].tsx` ~line 27–60  
**Suggested fix:** Extract a `getTicketDetailGroup(allTickets, ticketId)` helper to `user-ticket-mappers.ts` (or `@project-flame/lib`) that encapsulates the `isQRViewable` filter, sibling resolution, and index computation, then call it in the `useMemo`.

---

## Phase 5B Organizer Dashboard Logic — PR Review Round 3 Deferred (Feb 25, 2026)

### `apps/mobile/components/org-dashboard/RsvpRequestCard.tsx` — redundant `split("/")` calls in tier name IIFE

The IIFE inside the tier name row calls `request.tierName.split("/")` twice. Destructure the result once: `const [tierBase, stageRaw] = request.tierName.split("/"); const stageName = stageRaw?.trim();` and use `tierBase`/`stageName` in the conditional render.

**File:** `apps/mobile/components/org-dashboard/RsvpRequestCard.tsx` ~lines 84–97

---

### `apps/mobile/components/org-dashboard/RsvpRequestCard.tsx` — "View Details" Pressable missing disabled guard

The "View Details" `Pressable` is not guarded like the Approve/Reject buttons. Apply `disabled={isProcessing || !onViewDetails}` and `style={(isProcessing || !onViewDetails) ? { opacity: 0.5 } : undefined}` so taps are suppressed and the UI reflects the disabled state when the handler is absent or an action is in flight.

**File:** `apps/mobile/components/org-dashboard/RsvpRequestCard.tsx` ~lines 140–148

---

## Phase 5B Organizer Dashboard Logic — PR Review Round 2 Deferred (Feb 25, 2026)

### `apps/mobile/app/rsvp-detail.tsx` — extract `RegistrationModal` into its own file

`RegistrationModal` (lines 41–145, including inner `renderValue` helper and its prop types: `visible`, `onClose`, `userName`, `registrationData`, `formConfig`) is defined inline inside `rsvp-detail.tsx`. Extract it to a new file (e.g. `apps/mobile/components/org-dashboard/RegistrationModal.tsx`), export it as default, and update the original file to import and use `<RegistrationModal />`. Copy required imports (`Modal`, `View`, `Text`, `Pressable`, `ScrollView`, `Ionicons`, `FormField` type) and preserve all prop types and behavior so `RsvpDetailScreen` only orchestrates state/props.

**File:** `apps/mobile/app/rsvp-detail.tsx` ~lines 41–145

---

### `apps/mobile/components/dashboard/TicketSearchBar.tsx` — replace hardcoded visual values with design tokens

`TicketSearchBar` uses hardcoded values (`bg-[#F6F6F6]`, `rounded-[90px]`, `placeholderTextColor="#5D5D5D"`, text color `#292D32`) that do not match the app's dark-theme design tokens. Replace with the corresponding NativeWind token classes (e.g. `bg-surface`/`bg-card`, `rounded-full`/`rounded-pill`, and the appropriate `text-white-*` muted token for placeholder and input text).

**File:** `apps/mobile/components/dashboard/TicketSearchBar.tsx` ~lines 17–23

---

### `apps/mobile/components/settings/PersonalSettingsTab.tsx` + `OrganizationSettingsTab.tsx` — extract shared sign-in/out logic

Both tabs duplicate the sign-in/out handler (sign out → clear cache → redirect; or navigate to sign-in on the else branch). Extract to a shared hook or helper (e.g. `useSignInOutHandler`) that accepts `signOut`, `queryClient.clear`, and `router.push`/`router.replace` as dependencies and centralizes error handling, logging, and redirect behaviour.

**Files:** `apps/mobile/components/settings/PersonalSettingsTab.tsx` ~lines 25–33, `apps/mobile/components/settings/OrganizationSettingsTab.tsx` ~lines 20–33

---

### `apps/mobile/hooks/useRsvpManagement.ts` — add structured error logging to mutation `onError` handlers

In both `approveMutation.onError` and `rejectMutation.onError`, insert a `console.error` call before the existing restore-and-`showError` logic. Log a contextual object: `{ action: "approve" | "reject", eventId, rsvpId, error: err }`.

**File:** `apps/mobile/hooks/useRsvpManagement.ts` ~lines 454–485

---

## Phase 5B Organizer Dashboard Logic — PR Review Round 1 Deferred (Feb 25, 2026)

### `supabase/migrations/20260225171000_explicit_manage_memberships_rls.sql` — double `get_owned_organizations()` evaluation in UPDATE policy

The `"Organization owners can update memberships"` policy calls `get_owned_organizations()` twice — once in `USING` and once in `WITH CHECK` — causing double evaluation per updated row.

**File:** `supabase/migrations/20260225171000_explicit_manage_memberships_rls.sql` ~lines 19–23  
**Suggested fix:** Create a helper function `get_owned_organization_ids()` that returns `uuid[]` (a stable array), or use a lateral CTE/subquery to materialize the result once and reference it in both predicates. For example:
```sql
CREATE POLICY "Organization owners can update memberships"
ON public.organization_members
FOR UPDATE
USING  (organization_id = ANY(ARRAY(SELECT get_owned_organizations())))
WITH CHECK (organization_id = ANY(ARRAY(SELECT get_owned_organizations())));
```
Or add a `get_owned_organization_ids() RETURNS uuid[]` helper and use `= ANY(get_owned_organization_ids())` in both clauses, calling the function only once.

---

### `apps/mobile/app/scanner.tsx` — Ionicons use hardcoded `"#F9FBFE"` instead of design token

The three `Ionicons` in the camera-control row (camera-reverse, flashlight, keypad — around lines 422–438) and the back arrow in `ScannerHeader` (around line 559) pass `color="#F9FBFE"` directly. `colors["white-100"]` from `@project-flame/ui` (already imported) resolves to the same value but keeps icon colors centralized. Replace all occurrences with `color={colors["white-100"]}`.

**File:** `apps/mobile/app/scanner.tsx` ~lines 422–438, ~559
**Deferral reason:** Functionally identical — same hex value. No bug.

---

### `apps/mobile/app/scanner.tsx` — Local `formatDate`/`formatTime` helpers not using shared lib

`formatDate` and `formatTime` defined locally in `scanner.tsx` use `"en-US"` locale (e.g., "Jan 6" / "1:30 PM"). `@project-flame/lib` exports `formatEventDate` and `formatEventTime` but with `"en-GB"` locale and different output formats (e.g., "Monday, 06 Jan 2025" / "13:30"). These are not drop-in replacements. To align, the scanner helpers should adopt the shared lib's output format, or `@project-flame/lib` should expose locale-configurable variants. Either way, coordinate with the design/product decision on desired locale before migrating.

**File:** `apps/mobile/app/scanner.tsx` lines 43–57
**Deferral reason:** Shared lib exports use a different locale and output format (`en-GB` 24h vs `en-US` 12h). Not a drop-in swap; requires product/design decision.

---

### `apps/mobile/app/scanner.tsx` — Split `ScannerScreen` into state-branch subcomponents

`ScannerScreen` (~270 lines) handles hooks, state, and renders six `scannerState` branches inline. Consider extracting each branch into a view-only component (`IdleView`, `ScanningView`, `VerifyingView`, `VerifiedView`, `CheckingInView`, `CheckedInView`, `ErrorView`) and keeping `ScannerScreen` as a lean coordinator that owns hooks, state, and callbacks only. This would improve testability and keep each component under ~100 lines.

**File:** `apps/mobile/app/scanner.tsx` ~lines 270–547
**Deferral reason:** Opinionated refactor with no functional change. No bug; existing structure is readable. Defer until a dedicated component-cleanup pass.

---

### `apps/mobile/lib/supabase-auth.ts` — non-null assertions on env vars

`SUPABASE_URL` and `SUPABASE_ANON_KEY` are set with `!` non-null assertions, which silently passes `undefined` into `createClient` if the env vars are missing, producing cryptic downstream errors.

**File:** `apps/mobile/lib/supabase-auth.ts` ~line 17–18  
**Suggested fix:** Add a fail-fast guard before the `createClient` calls:
```ts
if (!process.env.EXPO_PUBLIC_SUPABASE_URL || !process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY) {
  throw new Error(
    "Missing Supabase env vars: EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY must be set."
  );
}
```
Then use the validated values (without `!`) when calling `createClient`.

---

## Phase 5B Organizer Dashboard PR — Deferred Nitpicks (Feb 26, 2026)

### `apps/mobile/app/(tabs)/events-management.tsx`
- **Replace external placeholder URL with local asset:** `eventImageUrl` falls back to `"https://placehold.co/..."` when `e.image_url` is missing. Set to `null` instead and update `EventsListView` / `ManageEventCard` to render a bundled local asset or styled placeholder View so the app does not depend on an external service.
- **Error UI retry control:** When `useOrgEvents()` returns an error, the error view has no retry button. Destructure `refetch` (and optionally `isFetching`) from `useOrgEvents()`, add a Retry button wired to `refetch()`, and optionally disable/show loading when `isFetching` is true.

### `apps/mobile/app/org-event-detail.tsx`
- **`purchaseStats.requestedTickets` hardcoded to `0`:** The `useMemo` block hardcodes `requestedTickets: 0`. Once RSVP data (e.g., `event.rsvps` or `event.rsvp_requests`) is available on the event object, compute this as the sum of requested counts across all RSVP entries.

### `apps/mobile/components/events-management/EditTiersTab.tsx`
- **ISO date validation on submit:** The validation for `salesStart` / `salesEnd` in `handleCreateTier` checks only presence (`!salesStart || !salesEnd`). Extend to reject non-ISO-8601 values by testing `isNaN(Date.parse(salesStart))` / `isNaN(Date.parse(salesEnd))` and showing `Alert.alert("Validation", "Sale start/end must be valid ISO 8601 dates.")` before submitting.
- **`handleCreateTier` wrapped in `useCallback`:** Add `useCallback` memoization with `[tierName, tierQuantity, tierPrice, tierPerUserLimit, salesStart, salesEnd, createTier, event?.id, resetForm]` as dependencies to avoid stale closures on re-render.

### `apps/mobile/components/events-management/EventsListView.tsx`
- **`ManageEvent` type imported from `data/mock`:** The `ManageEvent` type is imported from `../../data/mock`. Move to a shared canonical type (e.g., from `useOrgEvents` or `@project-flame/lib`) so the component's contract is backed by the real API shape.

### `apps/mobile/components/org-dashboard/OrgPromotionsCard.tsx`
- **Duplicate `PromoCodeDisplay` interface:** `PromoCodeDisplay` is defined locally in `OrgPromotionsCard.tsx` and is also consumed by `org-event-detail.tsx`. Move the interface to a single shared location (e.g., export from `usePromoCodes.ts`) and import it in both files.

### `apps/mobile/components/org-dashboard/OrgSendTicketsCard.tsx`
- **`handleSendTicket` always uses `tiers[0]`:** For events with multiple tiers, organizers have no way to choose which tier to send. The web counterpart uses a `selectedTierId` with a dropdown selector. Add tier selection UI (e.g., a `Picker` or sheet) and pass the chosen tier's ID to `sendTickets.mutateAsync` instead of always using `firstTier.id`.

### `apps/mobile/hooks/useCreateEvent.ts`
- **`apiPost` generic body type:** The `input as unknown as Record<string, unknown>` cast is a workaround for `apiPost`'s `body: Record<string, unknown>` signature. Widen the generic: `apiPost<T, B = Record<string, unknown>>(endpoint, body: B, getToken)` so callers can pass typed inputs directly without casts.

### `apps/mobile/hooks/usePromoterLinks.ts`
- **Untyped mutation response (`unknown`):** `useCreatePromoterLink` uses `useMutation<unknown, ...>`. Define a concrete `CreatePromoterLinkResponse` interface and apply it as the generic to align with other typed mutations like `useCreatePromoCode`.

### `apps/mobile/hooks/useStripeConnect.ts`
- **Onboarding error lacks org context:** The `console.error("[useStripeConnect] onboarding error:", err)` line does not include `organizationId` or action context. Change to `console.error("[useStripeConnect] onboarding error", { organizationId, action: "stripe_onboarding", error: err })` so failures are traceable to the specific organization without exposing detail to users.
- **Simplify duplicate error branches in `catch` block:** Both `if (err instanceof ApiError)` and `else if (err instanceof Error)` branches set `message = err.message`. Collapse to a single guard: `if (err instanceof Error) { message = err.message; }` (since `ApiError extends Error`, this covers both). The default `"Failed to start onboarding"` remains for non-Error throws.

### `apps/mobile/app/(tabs)/create-event.tsx`
- **Zod schema validation in `handleSubmit`:** Replace the manual field-by-field checks in `handleSubmit` with `EventFormDataSchema.safeParse(eventForm)` and `z.array(CreateEventTierInputSchema).safeParse(tiers)`. Define schemas in `useCreateEvent.ts` matching the exact field shapes. This is a non-trivial refactor; the manual checks are functionally complete after Fix #238.

---

## Phase 5B Organizer Dashboard PR — Deferred Nitpicks Round 2 (Feb 26, 2026)

### `apps/mobile/components/create-event/TicketTiersTab.tsx`
- **Prefer stable IDs for list keys:** `stages.map` uses `stage-${index}` and `tiers.map` uses `tier-${index}`. In creation flows these are fine, but edit flows should prefer a stable backend ID (e.g., `stage.id` or `tier.id`) when available and fall back to index only when no ID exists.
- **Rename `tierPriceCents` state to `tierPriceDollars`:** The variable name is misleading — the state holds a dollar string (e.g., `"25.00"`) entered by the user, not an integer cents value. Rename `tierPriceCents` → `tierPriceDollars` (and `setTierPriceCents` → `setTierPriceDollars`) in the `useState` declaration, all JSX bindings, and the `handleSaveTier` read site. The conversion to cents (`Math.round(parseFloat(tierPriceDollars || "0") * 100)`) stays inside `handleSaveTier`.

### `apps/mobile/components/create-event/TierCard.tsx`
- **Guard `onDelete` button:** `onDelete` is optional but the delete `Pressable` always renders. Add the same conditional guard used for `onEdit` (`{onDelete && <Pressable ...>}`) so the trash button is hidden when no delete handler is provided.

### `apps/mobile/components/org-dashboard/OrgSendTicketsCard.tsx`
- **Catch-block context logging:** The `catch` block shows an `Alert.alert` but does not log context. Add `console.error("[OrgSendTicketsCard] failed to send ticket", { eventId, userId: user.id, error: err })` before the alert so failures are traceable without user-visible detail.
- **Design token classes:** Replace `rounded-full` (avatar container, search button) with `rounded-circle` and `rounded-[20px]` (send button) with `rounded-pill` to use the project's shared NativeWind tokens.

### `apps/mobile/app` — `useOrgData` consumer error states
- **Add `isError` handling to org screens:** `create-event.tsx`, `org-event-detail.tsx`, and `PayoutsSettingsTab.tsx` use `useOrgData()` but only check `orgData === null`. Since `useOrgData` now throws on real query errors (Fix #238g), add `isError` / `error` destructuring and render an error message + retry button following the pattern in `apps/mobile/app/(tabs)/dashboard.tsx`. An error boundary wrapping the org screens is also advisable.

---

## Phase 5B Create-Event PR — Deferred Nitpicks (Feb 26, 2026)

### `apps/web/app/api/stripe/connect/onboard/route.ts`
- **Use `getAccountStatus` helper:** The route directly calls `stripe.accounts.retrieve(accountId)` and reads `charges_enabled`/`payouts_enabled`. Replace with `getAccountStatus(accountId)` from `app/lib/stripe/connect.ts` to avoid duplicating the status-retrieval logic.

### `apps/mobile/app/(tabs)/create-event.tsx`
- **Structured error logging in image upload catch:** The catch block for `uploadErr` (lines ~188–190) does `console.warn("Image upload failed:", uploadErr)`. Change to log a structured message including `userId` and `eventId` (or `eventSlug`) so failures are actionable, e.g. `console.error("[create-event] image upload failed", { userId, eventId: data?.event?.id, error: uploadErr })`. Ensure identifiers are in scope or passed in. Keep the original error attached for debugging. Filed from PR review (Feb 26, 2026).
- **Slug sanitization inconsistency:** The local `sanitizedSlug` (lines 92–96) uses `/[^a-z0-9-_]/g`, which allows underscores and replaces each invalid char with a hyphen. `generateSlug` from `@project-flame/lib` uses `/[^a-z0-9]+/g` (no underscores, collapses sequences to single hyphen). Align behavior: either pass the computed slug through `generateSlug(slug)` or change `sanitizedSlug` regex to match `generateSlug` (e.g. `/[^a-z0-9]+/g` with same trim rules). Filed from PR review (Feb 26, 2026).

---

## Phase 5B Organizer Dashboard PR — Deferred Nitpicks Round 3 (Feb 26, 2026)

### `apps/mobile/components/org-dashboard/OrgSendTicketsCard.tsx`
- **Remove unused `Image` import:** The `Image` symbol is imported from `react-native` but never referenced in the component. Remove it from the import list (`View, Text, Pressable, TextInput, Image, Alert, ActivityIndicator, Platform` → omit `Image`) to eliminate the unused-import warning.
- **Sort tiers by `order_index` before selecting `chosenTier`:** `tiers.find(t => t.quantity_sold < t.quantity_total)` picks the first matching tier in the array order returned from Supabase, which may not be deterministic. Sort first: `const sortedTiers = [...tiers].sort((a, b) => a.order_index - b.order_index)` then `sortedTiers.find(...)` to always send to the lowest-`order_index` available tier.

---

## Phase 5B Organizer Dashboard PR — Deferred Nitpicks Round 4 (Feb 27, 2026)

### `apps/mobile/app/(tabs)/` — fallback image URL constant

Extract duplicated fallback URL into a shared constant (e.g., `FALLBACK_EVENT_IMAGE_URL`) and replace inline literal usages in `events-management.tsx`, `org-dashboard.tsx`, and similar spots. Add to `@project-flame/lib` or a local constants file so the fallback value is centralized.

**Files:** `apps/mobile/app/(tabs)/events-management.tsx`, `apps/mobile/app/(tabs)/org-dashboard.tsx`

---

### ~~`apps/mobile/app/(tabs)/org-dashboard.tsx` — tier revenue helper~~ (Resolved)

_Resolved:_ `computeTierRevenueCents` already exists in `org-dashboard.tsx` (lines 36–48) and is used by `mapOrgEventToCardData` and the stats memo. No extraction needed.

---

### `apps/mobile/components/events-management/EventsListView.tsx` — TicketSearchBar wiring

EventsListView renders `TicketSearchBar` without wiring search state. Add local `searchQuery` state, pass as value/onChangeText to TicketSearchBar, and filter the displayed list by searchQuery. Alternatively, remove TicketSearchBar if no filtering is desired to avoid a non-functional UI element.

**File:** `apps/mobile/components/events-management/EventsListView.tsx` ~lines 20–21

---

### `apps/mobile/hooks/useRsvpManagement.ts` — redundant requires_rsvp in SELECT

The SELECT list includes `requires_rsvp` redundantly since the query already filters with `.eq("requires_rsvp", true)`. Remove from select string: use `"id, name, image_url, starts_at, ends_at, venue, city, registration_form_config"`.

**File:** `apps/mobile/hooks/useRsvpManagement.ts` ~line 243

---

### `apps/mobile/app/(tabs)/org-dashboard.tsx` & `events-management.tsx` — shared OrgEvent-to-display mapper

`mapOrgEventToCardData` and `toManageEvent` duplicate the same core mapping logic (attendees from `ticket_tiers.reduce(quantity_sold)`, `timeRange`, `location` with `filter(Boolean).join`). Extract to a single helper alongside `useOrgEvents` to reduce maintenance burden.

**Files:** `apps/mobile/app/(tabs)/org-dashboard.tsx` ~lines 33–65, `apps/mobile/app/(tabs)/events-management.tsx` ~lines 20–38

---

### `apps/mobile/app/(tabs)/org-dashboard.tsx` — stats variable typing

The `stats` variable is typed as `OrgStatsSectionProps`, which conflates a data-holding variable with a UI component's prop contract. Use a dedicated `{ totalEvents: number; totalRevenueCents: number }` inline type or named interface to reflect the variable's purpose.

**File:** `apps/mobile/app/(tabs)/org-dashboard.tsx` ~lines 92–104

---

### `.cursor/rules/project-flame-master.mdc` — verification step wording

Update the verification step to clarify scope: replace "Verify with `ls supabase/migrations/*.sql | sort`" with a clearer instruction such as "Verify by comparing `ls supabase/migrations/*.sql | sort` output with the `list_migrations` result to confirm all local filenames match remote versions" or "Sanity-check with `ls supabase/migrations/*.sql | sort` that local files are properly named."

**File:** `.cursor/rules/project-flame-master.mdc` ~line 109

---

### ~~`apps/mobile/app/(tabs)/org-dashboard.tsx` — Pressable onPress use onRefresh~~ (Resolved)

_Resolved:_ The Retry Pressable uses `onPress={() => handleRefresh("retry_button")}`, which delegates to the shared `handleRefresh` handler (refetches both orgData and orgEvents, logs errors). The pull-to-refresh uses memoized `onRefresh` = `() => handleRefresh("pull_to_refresh")`. No change needed.

---

### `apps/mobile/app/(tabs)/rsvp-management.tsx` — tintColor design token

The `tintColor="#F9FBFE"` in RefreshControl does not map to a design token. Confirm with Figma spec and either replace with the appropriate token or add a one-line comment noting the Figma source (screen/component name and token/value).

**File:** `apps/mobile/app/(tabs)/rsvp-management.tsx` ~line 96

---

### `supabase/migrations/20260227202927_ticket_stages_policy_for_clause.sql` — policy name

Rename the SELECT policy "Organization members can manage ticket stages" to "Organization members can view ticket stages" to match that it is declared FOR SELECT (read-only).

**File:** `supabase/migrations/20260227202927_ticket_stages_policy_for_clause.sql` ~lines 5–16

---

### Phase 6 PR review — deferred nitpicks (Mar 3, 2026)

### `packages/ui/src/components/EventCard.tsx` (Mar 4, 2026)
- **RSVP badge text color:** The RSVP badge inside `RsvpBadge` (lines 57–63) uses `text-white` on the FlameText element. Update to use design token `text-white-100` instead of `text-white` so the label aligns with the shared UI palette and Figma-mapped tokens.

- **SettingsPhotoSection design tokens:** Replace hardcoded `#F9FBFE` (Ionicons color) with `colors["white-100"]` from `@project-flame/ui` if the design token matches. For `rounded-[30px]` (Pressable), use the closest existing NativeWind token (e.g., `rounded-pill` at 40px); if no existing token matches the exact Figma 30px intent, keep the exact Figma value hardcoded (`rounded-[30px]`) rather than introducing a new token. **File:** `apps/mobile/components/settings/SettingsPhotoSection.tsx` ~lines 28–38.

- **handleRefresh error logging:** Add explicit try/catch and contextual logging (userId, eventId, action) in handleRefresh for dashboard, history, event/[id]. Deferred — index, org-event-detail, events now have catch blocks (MARCH_2026_FIXES #43). **Repro:** (1) Env: Home/Dashboard/History/Event Detail screen with data loaded. (2) Force refetch failure (e.g., disable network, mock refetch to throw). (3) Pull to refresh. (4) Observed: spinner clears, no log. Expected: console.error with action, userId, eventId, err for debugging.

- **index.tsx hasEvents:** Coerce `spotlightEvent` with `!!` so `hasEvents` is always boolean. Deferred — truthy check works for conditionals. **Repro:** (1) Env: Home screen, `data` has `spotlightEvent: { id: "x", ... }`. (2) Inspect `hasEvents` (e.g., add debug log). (3) Observed: `hasEvents` is object. Expected: strict boolean for clarity.

- **CalendarPicker chevrons/accessibility:** Disable prev/next chevrons when `onMonthChange` is falsy; add accessibilityLabel and accessibilityState. Deferred. **Repro:** (1) Env: Events Management, CalendarPicker with `onMonthChange` undefined. (2) Tap prev/next chevrons. (3) Observed: buttons look tappable but no-op. Expected: disabled state, reduced opacity, screen reader announces disabled.

- **PersonalSettingsTab Retry:** Show loading spinner/disabled state on Retry button while refetch in progress. Deferred. **Repro:** (1) Env: Settings > Personal, profile load failed (error state). (2) Tap Retry. (3) Observed: no visual feedback during refetch. Expected: spinner or disabled button until refetch completes.

- **MenuOverlay sign-out logging:** Replace bare `console.error` with structured log (action, userId, err). Deferred. **Repro:** (1) Env: Org user, MenuOverlay visible. (2) Force signOut to throw (e.g., mock). (3) Tap Log Out. (4) Observed: `console.error("[MenuOverlay] signOut failed", err)`. Expected: `{ action, userId, err }` for monitoring.

- **useRefreshControl hook:** Extract shared `useRefreshControl(refetch)` to eliminate duplicate pattern across 8 screens. Deferred — refactor. **Repro:** (1) Env: any data-fetching screen. (2) Compare handleRefresh implementations. (3) Observed: identical useState+useCallback pattern in 8 files. Expected: single shared hook.

- **EDGE_CASES_TODOS filename:** Rename `EDGE_CASES_TODOS.md` to `edge_cases_todos.md` for lowercase convention; update all references accordingly. Deferred. **Repro:** (1) Env: case-sensitive filesystem. (2) grep for `EDGE_CASES_TODOS.md`. (3) Observed: 15+ references. Expected: consistent filename and references updated to `edge_cases_todos.md`.

- **EDGE_CASES_TODOS #64–65 reproduction steps:** Add explicit reproduction steps for Bookmark placeholder and ExploreCategories deep-link entries. Deferred. **Repro:** See EDGE_CASES_TODOS.md #64 (Events bookmark: tap bookmark on events list; expected API call, actual `__DEV__` log) and #65 (ExploreCategories: tap category pill → /events; expected category query param, actual missing filter).

- **index.tsx SpotlightSection inline navigation:** ~~Replace inline `() => router.push(...)` with `handleEventPress(spotlightEvent)` for consistency.~~ ✅ Fixed (MARCH_2026_FIXES #50): Extracted `navigateToEvent(id)`; both handleEventPress and SpotlightSection use it.

---

## PR Template & IOS_MIGRATION — Deferred (Mar 3, 2026)

### `.github/pull_request_template.md` (lines 12–18)
- **Phase 5 checklist ambiguity:** The "Phase 5: Logic Integration (Mobile)" block is ambiguous — contributors may not know whether to check it for active logic-port PRs. Update to either: (a) a non-interactive note, or (b) add a directive: "Do not check — for historical reference only; use Phase 7 for active logic ports." Add a short sentence directing contributors to follow the Web-to-Mobile Logic Porting Protocol (Section 9) and complete the Web Parity Gate (Section 9.1) when doing an active port. Modify the checkbox block to reference Phase 7 as the correct active selection.

### `.github/pull_request_template.md` (line 13)
- **Historical checklist readability:** The sentence repeats "I" and reduces scanability. Rephrase to remove repetition: convert clauses into a concise list or streamlined sentence (e.g., combine "ported logic" and "read corresponding web source files" into one clause; group protocol compliance and parity gate completion into another). Keep references to `apps/web`, Web-to-Mobile Logic Porting Protocol (Section 9), and Web Parity Gate (Section 9.1).

### `docs/historico/project-migrations/IOS_MIGRATION.md` (lines 114–117)
- **Phase 7 evidence checklist:** The "Phase 7: Extra Features (Current)" section references the Logic Porting Protocol but does not explicitly list required PR evidence fields. Add a bulletized checklist mirroring Phase 5: PRs changing mobile logic must include "Web Source References", "API Parity Evidence", "Calculation Parity Evidence", "Edge Case Verification", and "Cross-Platform Behavior Check". Mention that for mobile-only features a TODO entry in `CRUCIAL_IOS_TO_WEB_TODOS.md` is still required. Ensure wording matches the Phase 5 evidence format for clarity and enforcement.

### `apps/mobile/app/(tabs)/settings.tsx` (line 11)
- **BASE_URL from env:** Replace hardcoded `const BASE_URL = "https://flme.co"` with a value from Expo env (e.g., `process.env.EXPO_PUBLIC_BASE_URL` or `Constants.manifest.extra.BASE_URL`). Add BASE_URL to Expo app config (`app.json` / `app.config.js` or EAS config) under the appropriate env/extra key for staging/prod. Update all references in settings.tsx so builds pick up different URLs per environment.

---

## Phase 5B Settings/Account/Support Restructure — Deferred (Mar 3, 2026)

### ~~`apps/mobile/app/support.tsx` (lines 70–139) — ScrollView for small screens~~ ✅ Fixed (MARCH_2026_FIXES #65)
- ~~The screen currently renders a static top-level View causing content to be clipped on small screens.~~ Root View replaced with ScrollView; content is scrollable on small devices.

### ~~`apps/mobile/app/(tabs)/settings.tsx` (lines 111–178) — RequireAuthGate + dead Sign In branch~~ ✅ Fixed (MARCH_2026_FIXES #64)
- ~~RequireAuthGate wrapped entire Settings; public content unreachable for logged-out users.~~ RequireAuthGate removed; public menu (Account, Support, legal links, Sign In) now renders for all users.

### `apps/mobile/app/account.tsx` (lines 15–16, 30–87)
- **TABS_HEIGHT unused:** `TABS_HEIGHT` is defined as `42` but never referenced. Leftover from old settings screen's `contentContainerStyle` padding calculation. Remove if no longer needed.
- **account.tsx without RequireAuthGate:** `PersonalSettingsTab`, `OrganizationSettingsTab`, and `PayoutsSettingsTab` are exposed without any `RequireAuthGate` or equivalent auth check. In the old code these tabs were inside the settings screen's `RequireAuthGate`. Now they're in a standalone route accessible via deep link at `/account` without authentication. Consider wrapping `account.tsx` with `RequireAuthGate` if account data should only be shown when authenticated.

---

## CustomTabBar Floating Pill — Deferred (Mar 6, 2026)

### `apps/mobile/components/navigation/CustomTabBar.tsx` — Extract `getTabBarPaddingBottom` and layout constants to a util module
Move `TAB_BAR_PILL_HEIGHT`, `TAB_BAR_PILL_MARGIN`, `TAB_BAR_HEIGHT`, and `getTabBarPaddingBottom(bottomInset)` out of `CustomTabBar.tsx` into a new side-effect-free module (e.g., `apps/mobile/lib/tabBarLayout.ts` or `apps/mobile/components/navigation/tabBarLayout.ts`). Update all callers (tab screens currently importing `getTabBarPaddingBottom` from `CustomTabBar`) to import from the new module so they no longer transitively pull in `expo-blur` or `BecomeOrganizerSheet`. Keep `CustomTabBar.tsx` importing from the same new module. Function signature and behavior must remain identical.
- **Files affected:** `CustomTabBar.tsx` (export site), all tab screens importing `getTabBarPaddingBottom` (e.g., `org-dashboard.tsx`, `dashboard.tsx`, `settings.tsx`, etc.)
- **Deferral reason:** Pure organisational refactor with no behavioral change; not worth the churn in the current PR.

### `apps/mobile/components/navigation/CustomTabBar.tsx` (lines 252–270) — `overflow: "hidden"` clips iOS drop shadow
`pillContainer` combines `overflow: "hidden"` (needed to clip `BlurView` to the pill shape) with iOS `shadowColor/Offset/Opacity/Radius`. On iOS, `overflow: "hidden"` sets `clipsToBounds = true`, which silently clips the drop shadow. Android `elevation` is unaffected. Standard fix: split into two `View`s — an outer wrapper carrying shadow + `borderRadius` (no `overflow`), and an inner `View` with `overflow: "hidden"` that contains `BlurView`, overlay, and border.
- **File:** `apps/mobile/components/navigation/CustomTabBar.tsx` ~lines 252–270
- **Deferral reason:** Visual-only; the pill renders and functions correctly. Worth fixing when polishing shadow rendering in a dedicated pass.

### ~~`apps/mobile/components/navigation/CustomTabBar.tsx` (lines 43–47) — Dead export `TAB_BAR_HEIGHT`~~ ✅ Fixed (MARCH_2026_FIXES.md `#333`)
`TAB_BAR_HEIGHT` was a redundant alias of `PILL_HEIGHT` and was never imported. Removed. Note: `TAB_BAR_PILL_HEIGHT` and `TAB_BAR_PILL_MARGIN` are in active use by `event/[id].tsx` and should remain exported.

---

## P7-1 Critical PR Review — Deferred (Mar 6, 2026)

### `apps/mobile/components/event-details/CheckoutMainSheet.tsx` (lines 214–274) — Extract registration form into dedicated component
The JSX IIFE that renders the registration form is hard to read. Extract into a dedicated memoized component (e.g., `RegistrationForm`) or compute nodes with `useMemo`. Move `formConfig`/`hasForm` computation and the field-type mapping into `RegistrationForm`. Props: `event` (or `formConfig`), `isRsvp`, `localFormData`, `setLocalFormData`, `onRegistrationDataChange`. Preserve checkbox toggle and text input handlers (`localFormData`, `setLocalFormData`, `onRegistrationDataChange`, `isValidFormField`, `formConfig`, `isRsvp`).
- **Deferral reason:** Readability/testability refactor; no behavioral change.

### `apps/mobile/hooks/useRsvpManagement.ts` — Move `FormField` / `FormFieldSchema` to `@project-flame/lib`
`FormField` is now `z.infer<typeof FormFieldSchema>` (derived type, no duplicate definition). `CheckoutMainSheet.tsx`, `create-event.tsx`, `EditEventDetailsTab.tsx`, and `FormFieldCard.tsx` import from `useRsvpManagement.ts`. A future refactor could move `FormFieldSchema` and `FormField` to `@project-flame/lib` so they are available to web and any future consumers without a cross-app import.
- **File:** `apps/mobile/hooks/useRsvpManagement.ts`
- **Deferral reason:** Type hygiene; the current placement works and does not cause any runtime issue.

### `apps/mobile/components/events-management/EditEventDetailsTab.tsx` (lines 582–610) — Reuse parsed registration_form_config
The render path re-parses `event.registration_form_config` using `z.array(FormFieldSchema).safeParse` in the JSX IIFE, duplicating the parsing already done in the useEffect. Extract and reuse a single parsed value — move parsing into a hook-level value (e.g., `useMemo` or component state populated in the existing useEffect) so the JSX for `readOnly` merely reads that parsed array instead of re-running `safeParse`.
- **Deferral reason:** Minor optimization; same runtime result; avoids redundant parse per render.

### `apps/mobile/hooks/useAppEvents.ts` (lines 22–33, 58–68) — Extract timezone/time-range helper
The timezone and time-range logic is duplicated in `mapEventToCardData` and `mapEventToSpotlightData`. Extract into a single pure helper (e.g., `deriveEventTimeDisplay` or `buildTimezoneDisplay`) that takes the event (or `{starts_at, ends_at, timezone}`) and returns derived values: `tz`, `dateStr`, `dayStr`, `monthStr`, `startTime`, `endTime`, `tzAbbr`, `timeRange`. Both mappers would call this helper so card and spotlight use the same fallback (`"America/Guayaquil"`), abbreviation concatenation, and `baseRange` logic in one place.
- **Deferral reason:** DRY refactor; no behavioral change.

### `apps/mobile/hooks/useRsvpManagement.ts` (line 96) — `type` field: replace redundant `z.literal` list with `z.union([z.enum([...]), z.string()])`
`FormFieldSchema.type` currently uses `z.union([z.literal("checkbox"), z.literal("email"), z.literal("number"), z.literal("date"), z.literal("text"), z.string()])`. Because `z.string()` catches everything, the individual literals are redundant and the TypeScript type collapses to `string`. Replace with `z.union([z.enum(["checkbox", "email", "number", "date", "text"]), z.string()])` to make the intent explicit: known types are enumerated, unknown backend types fall through to `string` without crashing.
- **File:** `apps/mobile/hooks/useRsvpManagement.ts` line 96
- **Deferral reason:** Nitpick — no behavioral change; TypeScript type is `string` either way. Worth cleaning up in a dedicated type-hygiene pass.

---

## P7-3 Low — Deferred Nitpicks (Mar 6, 2026)

### `apps/mobile/app/(tabs)/settings.tsx` + `PersonalSettingsTab.tsx` — Duplicate sign-out buttons

Both `settings.tsx` and `PersonalSettingsTab.tsx` implement independent sign-out buttons with identical behavior: deregister push token → `signOut()` → clear query client → `router.replace("/")`.

- **`settings.tsx` (lines 132–157, 198–207):** `handleSignOut` + `handleSignInOut` + Sign Out `Pressable` at the bottom of the settings screen.
- **`PersonalSettingsTab.tsx` (lines 32–59, 316–324):** `handleSignInOutPress` + Sign Out `Pressable` at the bottom of the personal settings tab.

`PersonalSettingsTab` is rendered inside `apps/mobile/app/account.tsx` (line 21), which is navigated to from the main Settings screen. A signed-in user sees a sign-out button on both screens.

**Suggested fix:** Remove the sign-out button from one location. The `settings.tsx` button is more discoverable (top-level settings screen), so remove the duplicate from `PersonalSettingsTab.tsx` (lines 316–324) and the associated `handleSignInOutPress` handler (lines 32–59). Alternatively, extract a shared `useSignOut` hook that encapsulates the deregister → sign-out → clear → redirect flow, and use it in whichever location retains the button.

**Deferral reason:** Cosmetic duplication — both buttons work correctly. No functional bug. The duplicate is slightly confusing but doesn't break anything.

### `apps/mobile/hooks/useNotificationPreferences.ts` — No failure toast on preference update

The `updatePreference` callback (lines 55–78) performs an optimistic update (`setPreferences(updated)`) and then calls Supabase to persist. On error (Supabase `.error` or thrown exception), it logs via `console.error` and reverts state (`setPreferences(prevPreferences)`) but shows **no user-facing feedback**. The toggle silently flips back, which may look like a UI glitch to the user.

**Reproduction:** (1) Navigate to Notification Settings. (2) Toggle any notification preference. (3) Force the Supabase update to fail (e.g., disconnect network, revoke RLS permission). (4) Observe: toggle flips on, then silently reverts. No toast, alert, or error message.

**Suggested fix:** After `setPreferences(prevPreferences)` in both the `if (error)` and `catch` branches, add a user-visible notification: `Alert.alert("Error", "Failed to update notification preference. Please try again.")` or, if a toast system is available, show a brief toast. This makes the revert intentional from the user's perspective.

**Deferral reason:** Silent failure is rare in practice (requires network issue during a single toggle). The state reverts correctly, so no data inconsistency. Nice-to-have UX improvement.

### `apps/mobile/hooks/usePromoterLinks.ts` + `OrgPromoterLinksCard.tsx` — Promoter link list errors not surfaced in UI

`usePromoterLinks` returns a TanStack Query result with `data`, `error`, `isError`, `isLoading`, etc. The consumer in `org-event-detail.tsx` (line 83) destructures only `data`: `const { data: promoterLinks } = usePromoterLinks(id || undefined)`. On query failure, `data` is `undefined`, which is mapped to `[]` via `(promoterLinks ?? []).map(...)` (lines 128–139). `OrgPromoterLinksCard` (props: `eventId`, `links`, `onClose` — lines 96–100) receives an empty array and renders "No promoter links yet." — identical to the zero-links success state.

**Reproduction:** (1) Navigate to org event detail for an event with promoter links. (2) Force the Supabase query to fail (e.g., revoke RLS or disconnect). (3) Observe: "No promoter links yet." is shown. No error message, no retry button. (4) Reconnect — user must navigate away and back to trigger a refetch.

**Suggested fix:** (A) In `org-event-detail.tsx`, destructure `isError` and `isLoading` from `usePromoterLinks` and pass them to `OrgPromoterLinksCard`. (B) In `OrgPromoterLinksCard`, add `isError?: boolean` and `isLoading?: boolean` props. When `isError`, render "Failed to load promoter links" with a retry button (pass `refetch` from the query). When `isLoading`, render a spinner.

**Deferral reason:** Promoter links are a secondary feature. The query rarely fails, and the fallback (empty list) is non-destructive. No data loss or corruption.

### `apps/mobile/hooks/useQRScanner.ts` — `validate-code` response shape not validated at runtime

The `ValidateCodeResponse` interface (lines 72–76) types the API response as `{ valid: boolean; eventId: string; eventName: string }`, but validation is compile-time only. The mutation (lines 117–127) calls `apiPost<ValidateCodeResponse>("/api/qr-scanner/validate-code", ...)` and the result is used directly in `validateAccessCode` (lines 130–137) to access `data.valid`, `data.eventId`, `data.eventName`. If the API returns an unexpected shape (missing field, wrong type, extra fields), the code fails silently or behaves incorrectly — e.g., `data.eventId` could be `undefined`, causing downstream scanner state to be inconsistent.

**Reproduction:** (1) Open scanner and enter an access code. (2) If the API response shape changes (e.g., a backend refactor renames `eventId` to `event_id`), mobile will set `eventId: undefined` in scanner state without any error. (3) Subsequent scan verification calls will fail with confusing errors because `eventId` is `undefined`.

**Suggested fix:** Add Zod schemas for scanner API responses:
```typescript
const ValidateCodeResponseSchema = z.object({
  valid: z.boolean(),
  eventId: z.string(),
  eventName: z.string(),
});
```
Parse inside the `mutationFn`: `const parsed = ValidateCodeResponseSchema.parse(data)`. This is consistent with EDGE_CASES_TODOS #54 which tracks the same pattern for all three scanner response types (`ValidateCodeResponse`, `TicketVerificationResponse`, `TicketCheckInResponse`).

**Deferral reason:** The API is internal and types are manually verified to match. No functional bug today — TypeScript provides compile-time safety. Defensive runtime validation is a hardening measure, not a correctness fix.

### `apps/mobile/lib/api.ts` — `data` payload typed as `any` instead of `unknown`

In `executeRequest` (line ~74) and `executeUpload` (line ~243), the `data` variable is declared as `let data: any = undefined`. It should be `let data: unknown = undefined` to keep strict typing. The downstream narrowing casts (callers that do `data as T` or `(data as Record<string, string> | null)`) are intentional and can remain as-is.

**Affected lines:** `executeRequest` (~74), `executeUpload` (~243) in `apps/mobile/lib/api.ts`.

**Suggested fix:** Replace `let data: any = undefined` with `let data: unknown = undefined` in both functions. Leave all downstream usages (casts, narrowing checks) unchanged.

**Deferral reason:** Purely a strictness improvement with no runtime impact. No existing bug or behavior difference — `any` and `unknown` both accept `undefined`. Deferred to avoid scope creep on a working implementation.

### `apps/mobile/app/(tabs)/org-dashboard.tsx` — `handleRefresh` awaits refetch and refetchStats serially

`handleRefresh` awaits `refetch()` and then `refetchStats()` sequentially after the `orgId` guard. Both are independent queries that can run in parallel. The serial pattern adds unnecessary latency on pull-to-refresh.

**Affected code:** `handleRefresh` callback in `org-dashboard.tsx` (~lines 154–178).

**Suggested fix:** Run both calls concurrently via `Promise.all` and destructure the results:
```typescript
const [eventsRes, statsRes] = await Promise.all([refetch(), refetchStats()]);
```
Preserve existing `eventsRes.error` / `statsRes.error` logging with the same context fields (`action`, `userId`, `orgId`).

**Deferral reason:** Pure latency optimisation with no correctness impact. Serial behaviour is not a bug. Deferred to avoid scope creep.

### `apps/mobile/app/(tabs)/org-dashboard.tsx` — revenue-resolution logic duplicated between `mapOrgEventToCardData` and the `stats` reducer

The three-branch logic (`revenueMap !== undefined ? revenueMap.has(id) ? map.get(id)! : 0 : computeTierRevenueCents(tiers)`) is copy-pasted in both `mapOrgEventToCardData` and the `stats` `useMemo`. If the fallback semantics ever change (e.g., the "map present but missing key" case), both sites need updating.

**Affected code:** `mapOrgEventToCardData` (~lines 76–81) and the `stats` reducer (~lines 218–224) in `org-dashboard.tsx`.

**Suggested fix:** Extract a module-level helper before `mapOrgEventToCardData`:
```typescript
function getRevenueCents(event: OrgEvent, revenueMap?: RevenueMap): number {
  if (revenueMap !== undefined) {
    return revenueMap.has(event.id) ? revenueMap.get(event.id)! : 0;
  }
  return computeTierRevenueCents(event.ticket_tiers);
}
```
Use `getRevenueCents(event, revenueMap)` in both call sites.

**Deferral reason:** Refactoring only — no behaviour change, no bug fixed. Deferred to keep the current PR focused.

---

### `apps/web/app/api/contact/route.ts` — Raw `console.error` calls leak full error objects (Mar 17, 2026)

Two `console.error` calls log raw error objects:
- `console.error("❌ Error sending contact email:", brevoError)` (Brevo catch, ~line 185)
- `console.error("Contact form error:", error)` (outer catch, ~line 203)

These can expose full stack traces or internal Brevo error objects in production logs, and don't include structured context (action, request ID) for searchability.

**Suggested fix:** Replace both with a structured log shape:
```ts
console.error(JSON.stringify({
  action: "send_contact_email", // or "contact_form_submission"
  message: error instanceof Error ? error.message : "Unknown error",
  severity: "error",
}));
```
Remove raw error object from log output. Response behavior (`NextResponse.json(...)`) must remain unchanged.

**Deferral reason:** No shared logger helper exists yet; adding one is out of scope for the contact-form PR. No PII is currently exposed from these logs (Brevo errors don't contain user data). Purely a code-quality improvement.

---

### `apps/web/app/api/auth/sync-current-user/route.ts` — manual `userData` + `supabaseAdmin.upsert` instead of `resolveDbUserFromClerkId`

The route builds a `userData` object and calls `supabaseAdmin.from("users").upsert(...)` directly, duplicating logic that the `resolveDbUserFromClerkId` helper in `apps/web/app/lib/auth.ts` already encapsulates.

**Important caveat:** `resolveDbUserFromClerkId` only does a SELECT (with JIT INSERT if the user is missing). It does **not** update existing users' `email`, `first_name`, or `last_name`. The current `upsert` with `onConflict: "clerk_id"` does update these fields for existing users, which is the explicit purpose of this sync endpoint. Any refactor that replaces the upsert with `resolveDbUserFromClerkId` must add an explicit UPDATE step to preserve the update-existing-user behaviour, otherwise the sync endpoint silently stops updating stale user data.

**Suggested fix (if pursued):** Call `resolveDbUserFromClerkId(userId)` first. If the user is found, issue a separate `supabaseAdmin.from("users").update({ email, first_name, last_name }).eq("clerk_id", userId)` to sync Clerk data. If not found, `resolveDbUserFromClerkId` will JIT-insert via Clerk. This avoids duplicating the insert logic while preserving update semantics.

**Deferral reason:** Behavioural difference (upsert vs select + conditional update). Not a simple cleanup — requires a follow-up UPDATE call to maintain parity. Deferred to avoid introducing a regression.

---

### Phase 10-1 Nitpicks (Mar 23, 2026)

**`PreCheckoutCodes` — placeholder copy + Apply button disabled state**
`apps/mobile/components/event-details/PreCheckoutCodes.tsx` (lines 68–93)

Placeholder text reads "None" which is confusing for an input field. Should be "Enter promoter code". Additionally, the Apply `Pressable` could be visually disabled (`opacity-40` + `disabled` prop) when `localPromoter.trim().length === 0`. The existing `handlePromoterSubmit` already guards against empty submission (`if (trimmed)`) so there is no functional bug, only cosmetic/UX.

**Deferral reason:** No functional bug; guard already exists. Copy and disabled state are polish-level.

---

**`useCheckout` — extract shared `cancelActiveHold` helper**
`apps/mobile/hooks/useCheckout.ts` (lines ~320–356, ~363–390)

`resetCheckout` and `resetStep` both inline the same hold-cancellation block (read `activeHoldIdRef`, null it, call `/api/holds/cancel`, catch and log). Could be extracted into a `cancelActiveHold` closure. The two callers differ in what state they subsequently reset (promo codes preserved in `resetStep`, cleared in `resetCheckout`), so only the hold-cancel portion is extractable.

**Deferral reason:** Two callsites, slightly different surrounding logic. No divergence bugs currently. Premature abstraction.

---

**`useManageMembers.useAddMember` — missing `member-role` cache invalidation**
`apps/mobile/hooks/useManageMembers.ts` (lines 41–43)

`useAddMember.onSuccess` invalidates `["org-members", orgId]` but not `["member-role"]`. `useUpdateMemberRole` and `useRemoveMember` both invalidate `["member-role"]`. Adding a new member doesn't change an _existing_ user's role, so there is no observable staleness bug. But for consistency, `queryClient.invalidateQueries({ queryKey: ["member-role"] })` could be added.

**Deferral reason:** No observable staleness. New members have no prior cached role entry. Consistency improvement only.

---

**`useMemberRole` — two sequential Supabase queries could be one join**
`apps/mobile/hooks/useMemberRole.ts` (lines 22–37)

Currently resolves `users` then `organization_members` in two sequential queries. Could be combined into a single query joining `organization_members` with embedded `users` filtering by `clerk_id`. Minor performance improvement (one fewer round-trip).

**Deferral reason:** Performance optimization only; two sequential queries are functionally correct. Refactor adds complexity without fixing a bug.

---

**`useOrgMembers` — use generated Supabase types instead of `Record<string, unknown>`**
`apps/mobile/hooks/useOrgMembers.ts` (lines 42–55)

The mapper casts `data` rows as `Record<string, unknown>`. Supabase TypeScript types (`Database["public"]["Tables"]["organization_members"]["Row"]` plus the joined users shape) could be used for compile-time property safety.

**Deferral reason:** Generated types are not yet wired into the mobile app's Supabase client. Type safety improvement only; runtime behavior is identical.

---

**`permissions.ts` — extract `isElevatedRole` helper**
`packages/lib/src/utils/permissions.ts` (lines 3–21)

All five permission functions repeat `role === "owner" || role === "admin"`. A shared `isElevatedRole(role)` helper would centralize the logic.

**Deferral reason:** Five one-liners all in one file. Changing the elevated-role definition requires updating one file regardless. Premature abstraction at this scale.

---

**`useAssignedEvents` — contextual error logging on DB query failures**
`apps/mobile/hooks/useAssignedEvents.ts`

The current `if (userError) throw userError` / `if (userAssignError) throw userAssignError` pattern surfaces the raw Supabase error to React Query without any stage context. Wrapping each query in a contextual error throw (e.g. `throw new Error("useAssignedEvents - fetching user: " + userError.message, { cause: userError })`) would make Sentry/log traces easier to diagnose by including the stage name and `{ userId, orgId }` in the error context.

**Deferral reason:** Supabase JS client never throws — it returns `{ data, error }`. Adding `try/catch` around these calls provides no extra protection. The improvement is purely logging ergonomics, not a bug fix. A shared error-wrapping utility would be a better approach when pursued.

---

## Phase 10-4 PR Review — Deferred (Mar 23, 2026)

**`EventAssignmentSheet` — log warning when assignment not found during remove batch**
`apps/mobile/components/org-members/EventAssignmentSheet.tsx` (lines ~139–148)

The `toRemove.map` callback returns `Promise.resolve()` silently when the matching assignment row isn't found in local state. Adding a `console.warn` (including `eventId`, `memberId`, and assignment count) before the early return would make stale-state situations visible in development without changing runtime behaviour.

**Deferral reason:** Silent early return is intentional — a missing row means there is nothing to delete and the operation is effectively a no-op. Adding a warn is logging ergonomics only, not a bug fix.

---

**`useAssignedEvents.ts` — extract `computeTierAttendees` / `computeTierRevenueCents` to `@project-flame/lib`**
`apps/mobile/hooks/useAssignedEvents.ts` (lines ~16–34)

`computeTierAttendees`, `computeTierRevenueCents`, and the local `AssignedEventTier` / `AssignedEventTierStage` interfaces are defined inline in the hook file. The same rollup logic will be needed when porting the organizer dashboard to web (tracked in `CRUCIAL_IOS_TO_WEB_TODOS.md` §18 Shared lib note and `PHASE-10-VIEWS.md` TODO-6). Move them to `packages/lib` as exported utilities, update the hook to import from `@project-flame/lib`, and ensure the library's `index.ts` re-exports them.

**Deferral reason:** Already tracked as a web-parity prerequisite in `CRUCIAL_IOS_TO_WEB_TODOS.md` §18. No functional change; pure co-location refactor that should happen once before the web port begins, not mid-PR.

---

**`MARCH_2026_FIXES.md` — use underscore emphasis for MD049 lint rule**
`docs/historico/fixes/MARCH_2026_FIXES.md` (line ~6472)

The inline emphasis `*event owner's*` inside the co-host filter fix entry uses asterisks. MD049 (emphasis style) prefers underscores (`_event owner's_`) for consistency with the rest of the file.

**Deferral reason:** Purely cosmetic markdown style; renders identically in all viewers. No functional or semantic difference.

---

**`CRUCIAL_IOS_TO_WEB_TODOS.md` §18 — add concrete acceptance criteria for co-host footer label**
`docs/historico/todos/CRUCIAL_IOS_TO_WEB_TODOS.md` (line ~296)

The web TODO for "Org dashboard cards" notes "optional footer label only if product wants parity with simplified organizer list" without specifying when the footer should appear, what the acceptance criteria are, or who owns the parity decision. Concretely: list conditions (e.g. space constraints, product toggle), provide one or two UI examples, specify the approver, and reference `FullOrgDashboard` and the `Co-host with …` badge.

**Deferral reason:** Product decision, not a code bug. Criteria should be agreed before implementation begins; premature detail locks in a choice that may change.

---

**`EventAssignmentSheet` — extract presentational sub-components**
`apps/mobile/components/org-members/EventAssignmentSheet.tsx`

Two separate PR comments propose splitting the sheet (now 443 lines) into smaller components:
1. Extract `SheetHeader` (drag handle, close button, title/subtitle) and `SaveButton` (CTA block) — state and logic stay in `EventAssignmentSheet`, sub-components receive only props.
2. Extract `EventRow` (from `renderEvent`), `SheetBody` (spinner / empty state / `FlatList`), and `SheetFooter` (Save button).

**Deferral reason:** Single consumer, single file. 443 lines is manageable in context. Prop-threading into multiple small wrappers adds churn without reducing real complexity. If the file continues growing past ~600 lines, revisit.

---

**`sendPushToOrgMembersByRole` — use `OrgMemberRole[]` type and rename `options.eventId`**
`apps/web/app/lib/push-notifications.ts` (`sendPushToOrgMembersByRole`, ~line 212)

Two related type-safety improvements:
1. Change `roles: string[]` to `roles: OrgMemberRole[]` (from `packages/lib/src/types/organization.ts`) to catch invalid role strings at compile time (e.g. `"owner"` vs. `"Owner"` typo). Update call sites in `orders.ts` and `rsvp/route.ts`.
2. Rename `options.eventId` to `options.assignmentEventId` so the intent — "widen delivery to organizers assigned to this specific event" — is self-documenting and distinct from a generic event ID filter. Update all internal references and call sites.

**Deferral reason:** Purely additive type/naming improvement; no runtime behaviour change. Both call sites are small and easy to update when prioritised.

---

**`org-dashboard.tsx` — replace inline `memberRole === "owner"` with `canManagePayouts` helper**
`apps/mobile/app/(tabs)/org-dashboard.tsx` — `FullOrgDashboard`, `PaymentAccountBanner` guard (~line 416)

`{memberRole === "owner" && <PaymentAccountBanner .../>}` uses a raw string comparison. `account.tsx` already uses `canManagePayouts(memberRole)` from `@project-flame/lib` for the same permission check. Consistency: replace the raw string with `canManagePayouts(memberRole)` and import `canManagePayouts` from `@project-flame/lib`.

**Deferral reason:** Behavior is identical (`canManagePayouts` returns `true` only for `"owner"`). Pure consistency improvement.

---

**`useNotifications.ts` — remove unnecessary pre-delete mark-as-read in `dismissAll`**
`apps/mobile/hooks/useNotifications.ts` — `dismissAll`, mark-as-read block (~lines 228–240)

The `update({ read: true })` call before `delete()` was added defensively to handle a hypothetical RLS policy that restricts deletion to already-read notifications. The `notifications` table DELETE policy has been verified against migration evidence — it checks only `user_id`, not the `read` flag. The pre-delete update and its error logging (`markReadError` block) are therefore unnecessary and add an extra DB round-trip on every "clear all" action.

**Cleanup decision:** Remove the `supabase.from("notifications").update({ read: true })...` block and its associated `markReadError` handling from `dismissAll` in `useNotifications.ts`. The `delete()` call below it is sufficient — RLS will allow deletion for any notification owned by the current user regardless of read state.

---

**`MARCH_2026_FIXES.md` — add cross-references to reference docs for approval/payout behavior changes**
`docs/historico/fixes/MARCH_2026_FIXES.md` — entry #8 (unapproved org gate, payouts tab, canManagePayouts)

Entry #8 documents runtime behavior changes but doesn't link to any feature/guide docs that describe the permission model (`canManagePayouts` vs `canAccessOrgSettings`) or the org approval flow (`organizations.approved`, `PendingApprovalBanner`).

**Deferral reason:** The changelog lists all changed files. Adding cross-references is informational. Address when the feature/guide docs for permissions and org approval flows are written.

---

**`rsvp/route.ts` — replace `as any` cast on `member.users` / `assignment.users`**
`apps/web/app/api/rsvp/route.ts` (organizer notification block, ~line 1269 and ~line 1275)

Two `as any` casts are used when reading the Supabase join result for `member.users` and `assignment.users`. The selected shape is known at call-time (`first_name`, `last_name`, `email`), so a small local interface (e.g. `interface OrganizerUser { first_name: string | null; last_name: string | null; email: string }`) should replace the casts. Downstream usages (null guards, string building) already handle nullable fields correctly and need no logic change.

**Deferral reason:** Runtime behaviour is identical; the `as any` casts don't cause incorrect data to flow through — they're just type-unsafe. A small refactor with no urgency.

---

**`dashboard.tsx` `handleRefresh` — add explicit catch to `Promise.all`**
`apps/mobile/app/(tabs)/dashboard.tsx` — `handleRefresh` (~line 51)

`handleRefresh` uses `try { await Promise.all([refetch(), refetchUserOrgs()]); } finally { setRefreshing(false); }` without a `catch`. The concern is that failures are silent.

**Why deferred:** React Query's `refetch()` always resolves — it captures query errors inside the query state and never rejects the returned Promise. `Promise.all` cannot throw from these calls. The `finally` block already guarantees `setRefreshing(false)` runs. The suggested catch would never fire in practice.

---

**`useUserRole` `queryFn` — remove unused `role: dbRole` from return payload**
`apps/mobile/hooks/useUserRole.ts` — `queryFn` return (~line 146), `dbRole` computation (~line 92)

The queryFn returns `{ role: dbRole, hasOrganization, hasUnapprovedOrg, memberRole }`. `data?.role` is never read by any consumer — the hook derives the final `UserRole` from `data?.hasOrganization` alone. `dbRole` and the `normalizeDbRole(user.role)` call are dead code that unnecessarily inflate the React Query cache payload.

**Suggested fix:** Remove `role: dbRole` from the queryFn return value and delete the `const dbRole = normalizeDbRole(user.role)` line. Also update the `QueryFn` inferred return type (TypeScript will narrow it automatically).

**Deferral reason:** Zero functional impact. Pure cleanup.

---

**`useUserRole` `orgs` — coerce to `orgs ?? []` before `.some()` calls**
`apps/mobile/hooks/useUserRole.ts` — `approvedMembership` and `hasUnapprovedOrg` derivation (~lines 122–133)

After `if (orgsError) throw orgsError`, the code calls `orgs.some(...)` directly. Supabase types `data` as `T[] | null` for multi-row selects. If the TypeScript strict-null configuration changes (or a future Supabase version tightens types), `orgs.some()` would be a compile error. The safe pattern is `const orgsList = orgs ?? []` then use `orgsList.some(...)`.

**Deferral reason:** The linter currently reports no errors — the Supabase client types in this project return `T[]` (not `T[] | null`) for `.select().in()` without `.single()`. The `??` guard would be defensive against a hypothetical type change, not a current bug.

---

## Mobile forgot-password flow — Clerk follow-ups (**IMPORTANT**) (Apr 8, 2026)

Shipped in `APRIL_2026_FIXES.md` #16: `forgot-password.tsx`, `reset-password.tsx`, `CredentialsForm` link, `RoleResolutionGate` full-screen modals. Flow uses legacy `reset_password_email_code` + `attemptFirstFactor` + `resetPassword` (appropriate for `@clerk/clerk-expo` v2). The following gaps are deferred but **important** for completeness and future SDK alignment.

### `apps/mobile/app/reset-password.tsx` — Handle `needs_second_factor` after password reset (**IMPORTANT**)

Clerk’s [legacy forgot-password guide](https://clerk.com/docs/guides/development/custom-flows/account-updates/legacy/forgot-password) notes that `attemptFirstFactor` / completion may return `needs_second_factor`. The current screen only handles `needs_new_password`, `complete`, and generic errors. Users with 2FA enabled on the relevant path may hit a dead end.

**Suggested fix:** Branch on `result.status === 'needs_second_factor'` (and any follow-up factors Clerk returns) and route to the same or a dedicated 2FA UI pattern used elsewhere in the app (parity with `useSignInHandlers` / email verification flows).

---

### `apps/mobile/app/reset-password.tsx` — Session tasks after `setActive` (**IMPORTANT**)

`setActive({ session: resetResult.createdSessionId })` does not pass a `navigate` callback or handle `session?.currentTask` (e.g. pending reset-password or choose-organization tasks). If Clerk session tasks are enabled for the instance, users could land in a `pending` session without UI to complete tasks.

**Suggested fix:** Align with Clerk docs: after successful reset, use `setActive` with optional `navigate` / check `session.currentTask` and wire `taskUrls` or in-app handling (see [session tasks](https://clerk.com/docs/guides/development/custom-flows/authentication/session-tasks)). Verify against Clerk Dashboard settings before prioritizing.

---

### `apps/mobile/app/forgot-password.tsx` / `reset-password.tsx` — Resend reset code (**IMPORTANT** UX)

There is no “Resend code” action if the email is delayed or mistyped. Users must go back and re-submit from forgot-password.

**Suggested fix:** On `reset-password.tsx`, add a secondary control that calls `signIn.create({ strategy: 'reset_password_email_code', identifier: email })` again (with rate-limit aware copy / disabled state), or expose Clerk’s equivalent if the SDK adds a dedicated resend API.

---

### Migrate forgot-password to `@clerk/expo` v3+ custom-flow API (**IMPORTANT** upgrade debt)

Current implementation uses the **legacy** `@clerk/clerk-expo` v2 API (`create({ strategy: 'reset_password_email_code' })` + `attemptFirstFactor()` + `resetPassword()`) which is correct for v2. Clerk’s primary [custom forgot-password doc](https://clerk.com/docs/custom-flows/forgot-password) now targets **`@clerk/expo` v3+** — note this is a **renamed package** (`@clerk/expo`, not `@clerk/clerk-expo`) and uses `signIn.resetPasswordEmailCode.sendCode()` / `.verifyCode()` / `.submitPassword()` / `.finalize()`.

**Suggested fix:** When upgrading `apps/mobile` from `@clerk/clerk-expo` to `@clerk/expo` v3+, refactor `apps/mobile/app/forgot-password.tsx` and `apps/mobile/app/reset-password.tsx` to the documented v3 API and re-test the full flow (including session `finalize` and the `navigateToTabs` post-auth navigation pattern).



---

### `org-event-detail.tsx` — remove redundant `useCohostEvents` safety-net call

**File:** `apps/mobile/app/org-event-detail.tsx`

`useOrgEvents` now includes both owned and co-hosted events via a two-step query. The `useCohostEvents` call and `cohostEventsData` fallback in the `event` useMemo are therefore redundant and generate an extra network request. The code comment explicitly marks this as an intentional "safety-net while cache is still warming."

**Suggested fix:** Delete the `useCohostEvents` call, `cohostEventsData` variable, and its import. Update the `event` useMemo to `orgEvents?.find(e => e.id === id) ?? null`.

**Deferred because:** The safety net is intentional — on first mount the `useOrgEvents` cache may not yet be settled (especially when navigating directly to an org event detail link). Removing it risks a flash of "event not found" on first load. Revisit once `useOrgEvents` is confirmed to always be pre-warmed before the detail screen mounts.

---

### `CityAutocompleteField` — validate Google Places HTTP + API status before using predictions

**File:** `apps/mobile/components/create-event/CityAutocompleteField.tsx`

After parsing the JSON response, the code immediately uses `json.predictions ?? []` without checking `res.ok` or `json.status === "OK"`. A failed request (e.g., invalid key, quota exceeded) returns `{ status: "REQUEST_DENIED", error_message: "..." }` — the `?? []` handles it gracefully today but silently swallows the API error message.

**Suggested fix:** Check `res.ok && json.status === "OK"` before assigning predictions. Log `json.error_message` if present.

**Deferred because:** `json.predictions ?? []` already degrades gracefully. The logged error from the outer catch already captures network failures. Adding explicit status checks is a hardening improvement, not a bug fix.

---

### `CityAutocompleteField` — `autoCapitalize="words"` for natural city name casing

**File:** `apps/mobile/components/create-event/CityAutocompleteField.tsx` (line 107)

The `TextInput` uses `autoCapitalize="none"`. Changing to `"words"` would capitalize each word of the city name naturally (e.g., "new york" → "New York").

**Suggested fix:** Change `autoCapitalize="none"` to `autoCapitalize="words"`.

**Deferred because:** `"none"` is intentional — prevents iOS autocorrect from mangling partially-typed city names mid-typing before a dropdown suggestion is selected. The autocomplete suggestions are already properly cased from the Google Places API.

---

### `APRIL_2026_FIXES.md` — "co-host" vs "cohost" spelling consistency

**File:** `docs/historico/fixes/APRIL_2026_FIXES.md` (around lines 244–245)

The changelog prose uses "co-host" and "Co-hosted" (hyphenated), while the reviewer prefers "cohost" without a hyphen for all human-readable text (leaving the SQL identifier `cohost_organization_id` unchanged).

**Deferred because:** "co-host" (hyphenated) is the standard English spelling per major dictionaries. Changing to "cohost" is a pure style preference with no correctness impact. Not worth a doc churn.

---

### `usePastOrgEvents` — structured try/catch logging in queryFn

**File:** `apps/mobile/hooks/usePastOrgEvents.ts`

The `queryFn` throws Supabase errors directly via `if (error) throw error` and Zod errors via `throw new Error("Failed to validate...")` with a `console.error`. The reviewer suggested wrapping the entire body in try/catch and logging a structured object `{ action: "fetchPastOrgEvents", orgId, err }` before rethrowing.

**Suggested fix:** Wrap the queryFn in try/catch, log `{ action, orgId, error }` on catch, then rethrow. Consistent with the logging pattern in `useOrgEvents` and `useOrgData`.

**Deferred because:** Errors are already surfaced (Supabase errors thrown; Zod errors logged + thrown). This is a style/consistency preference, not a functional gap.

---

### `useEventDetails` — enrich `getAuthenticatedClient` fallback log with `userId` and `eventId`

**File:** `apps/mobile/hooks/useEventDetails.ts` (around line 173)

The `catch` block for `getAuthenticatedClient(getToken)` currently logs:
```ts
console.error("[useEventDetails] getAuthenticatedClient failed, falling back to anon client", tokenError);
```
Reviewer suggested adding `userId` and `eventId` to the log object so the fallback can be correlated to a specific user/event in production:
```ts
console.error("[useEventDetails] getAuthenticatedClient failed — falling back to anon client", {
  userId,
  eventId,
  err: tokenError,
});
```
Both values are in scope (`userId` from `useOptionalAuth()`, `eventId` from the hook parameter).

**Deferred because:** The existing message already captures the action context and the raw error. Adding structured context is a useful improvement for production debugging but not a functional gap.

---

### `APRIL_2026_FIXES.md` entry #26 — three consecutive "Updated" sentence openers in Fix items 2–4

**File:** `docs/historico/fixes/APRIL_2026_FIXES.md` (entry #26, fix items 2–4)

Items 2, 3, and 4 of the fix list all open with "Updated …", making the prose repetitive. Reviewer suggested combining them into smoother sentences that vary sentence openings while preserving all technical details (`handleSaveEdit`, the empty-string-to-null mapping, the "Unlimited" read-only display, and the updated placeholder text).

**Deferred because:** The content is technically accurate and unambiguous. This is a prose style preference with no correctness impact.

---

### Make `useOrgEvents`, `useRsvpEvents`, `useOrgDashboardStats` purely parameter-driven (remove internal context deps)

**Files:**
- `apps/mobile/hooks/useOrgEvents.ts`
- `apps/mobile/hooks/useRsvpManagement.ts` (`useRsvpEvents`)
- `apps/mobile/hooks/useOrgDashboardStats.ts`

All three hooks currently call `useMemberRoleContext()` and `useOrgData(selectedOrgId)` internally to resolve `effectiveOrgId` when no explicit `orgId` argument is passed. A reviewer flagged this as an implicit coupling concern — parameter-driven hooks are more composable and easier to test in isolation.

**Suggested refactors:**
- `useOrgEvents(orgId?)`: remove internal `useMemberRoleContext`/`useOrgData` calls; require callers to pass `orgId` explicitly. The one call site that currently passes no arg (`events-management.tsx`) already has `selectedOrgId` in scope and would just need `useOrgEvents(selectedOrgId)`.
- `useRsvpEvents(assignedEventIds?, orgId?)`: accept `organizationId` as a second parameter; remove internal `useMemberRoleContext`/`useOrgData`; update the single caller (`rsvp-management.tsx`) to pass `selectedOrgId`.
- `useOrgDashboardStats(orgId?)`: when `orgId` is already provided, the internal `useOrgData(selectedOrgId)` call is a no-op (result is ignored via `effectiveOrgId = orgId ?? ...`). Note: the reviewer's suggestion to conditionally skip hook calls is blocked by React's Rules of Hooks. A valid partial fix would be passing `null` to `useOrgData` when `orgId` is already known (`useOrgData(orgId ? null : selectedOrgId)`) to avoid an unnecessary cache lookup, but this only matters if `useOrgData(null)` is a confirmed no-op.

**Deferred because:** All three hooks are functionally correct. The "extra fetch" concern is a TanStack Query cache hit (not a network call) since `useOrgData(selectedOrgId)` is always warm from the parent screen. The refactoring is valid long-term but has no correctness impact today.

---

### `generateApprovalEmailHtml` calls `getBaseUrl()` internally instead of accepting `baseUrl` as a parameter

**File:** `apps/web/app/lib/email/rsvp-notifications.ts` — `generateApprovalEmailHtml`

The function calls `getBaseUrl()` internally at line ~143 to build the `${baseUrl}/account` CTA URL. This couples the generator to global config, makes it untestable in isolation, and blocks adding a proper production localhost guard in `sendRsvpApprovalEmail` (see EDGE_CASES). The pattern is inconsistent with `generateTicketReadyEmailHtml`, which already receives `baseUrl` as a second argument.

Note: only `generateApprovalEmailHtml` is affected. `generateRejectionEmailHtml`, `generatePendingConfirmationEmailHtml`, and `generateOrganizerNotificationEmailHtml` do not use any `baseUrl`-dependent URLs.

**Suggested fix:** Change the signature to `generateApprovalEmailHtml(data: RsvpEmailData, baseUrl: string)`, remove the internal `getBaseUrl()` call, and update the two call sites:
- `sendRsvpApprovalEmail`: pass `getBaseUrl()`
- `/api/dev/email-preview/route.ts`: pass `origin`

**Deferred because:** The function works correctly in production. The inconsistency is stylistic and is a prerequisite for the EDGE_CASES localhost-guard fix, not a standalone correctness issue.

---

### `generateDateChangeEmailHtml` calls `getBaseUrl()` internally instead of accepting `baseUrl` as a parameter

**File:** `apps/web/app/lib/email/date-change-notifications.ts` — `generateDateChangeEmailHtml`

The function calls `getBaseUrl()` at line 42 internally to build `eventUrl`. This couples the generator to global config, making it harder to test in isolation and inconsistent with `generateTicketReadyEmailHtml` which receives `baseUrl` as a parameter.

**Suggested fix:** Change the signature to `generateDateChangeEmailHtml(data: DateChangeEmailData, baseUrl: string)`, replace `getBaseUrl()` with the injected value, and update all call sites (email preview route + `sendDateChangeEmail`) to pass the URL.

**Deferred because:** The function works correctly. The inconsistency is stylistic — a DI preference, not a bug.

---

### `accountParams` typed as `any` in `createExpressAccount`

**File:** `apps/web/app/lib/stripe/connect.ts` — `createExpressAccount`, line ~17

`const accountParams: any = { ... }` suppresses type-checking on the object passed to `stripe.accounts.create`. The Stripe Node.js SDK exports `Stripe.AccountCreateParams` (or the narrower `Stripe.AccountCreateParams` subtype) which would enforce the correct shape at compile time.

**Suggested fix:** Replace `accountParams: any` with `accountParams: Stripe.AccountCreateParams`. Import `Stripe` from `stripe` (the Stripe Node SDK already used in the file) and use `Stripe.AccountCreateParams` as the type annotation. If `type: "express"` creates a discriminated-union narrowing issue, use `as const` on the `type` field or cast to the express subtype.

**Deferred because:** The function is correct at runtime. The `any` only affects compile-time validation of the Stripe API params shape.

---

### Add "Web Parity Gate" checklist to `WEB_MULTI_ORG_PARITY_AUDIT.md`

**File:** `docs/historico/todos/WEB_MULTI_ORG_PARITY_AUDIT.md`

Add a repeatable verification checklist section (similar to `project-flame-master.mdc` Section 9.1) specifically for PRs that fix the web multi-org bugs tracked in this file. The section should include:

1. **Web source parity** — identify the equivalent web pages/hooks (`useOrganizerData`, `selectOrganization`) and confirm each changed file maps to a web counterpart.
2. **API parity** — confirm `/api/organizer/data` and any dedicated endpoints behave identically for primary and non-primary orgs (same `?org=` threading, same query key invalidation).
3. **Calculation parity** — verify event/co-host merging and org-scoping logic matches mobile (same deduplication order, same `cohost_organization_id` join, same response shape).
4. **Edge-case parity** — non-primary org events, co-hosted events, deep-links without `?org=`, manual URL navigation, and cache invalidation on org switch.
5. **Cross-platform behavior** — confirm client-side (`useOrganizerData`), server-side (`selectOrganization`), and dashboard-level (`OrganizerDashboard` `?org=` threading) all scope to the correct org.

PRs that fix any bug in this doc must include this checklist in the PR description and reference the affected symbols (`useOrganizerData`, `selectOrganization`, `/api/organizer/data`, `OrgEventDetailClient`) with proof that callers/tests cover org-scoped behavior.

**Deferred because:** `WEB_MULTI_ORG_PARITY_AUDIT.md` is a new tracking doc; adding the gate now before any fix PRs exist is premature — the checklist is most useful at the point of implementing the fixes.

---

### Wrap `supabaseAdmin.from("events").single()` in try/catch in `OrgEventDetailPage`

**File:** `apps/web/app/organizer/event/[id]/page.tsx` (lines ~25–34)

The `supabaseAdmin` query that looks up the event's org slug for the multi-org canonical redirect is not wrapped in try/catch. The Supabase JS client returns `{ data, error }` and does not throw, so in practice this code cannot crash. However, for defensive coding alignment with the project's error-handling standard, consider wrapping in try/catch and redirecting to `/organizer` on unexpected exceptions.

**Deferred because:** The Supabase JS SDK's `.single()` call returns `{ data, error }` — it does not throw. The `if (supabaseAdmin)` guard already handles the null case. A crash is essentially impossible under normal conditions.

---

### Validate `initialOrganizer` slug against fetched organizers in `EventsPage`

**File:** `apps/web/app/events/page.tsx` (line ~103), `apps/web/app/components/EventsCatalog.tsx`

If `?org=nonexistent-slug` is in the URL (manual URL craft or deleted org), `EventsCatalog` initializes `selectedOrganizer` to the unknown slug and the filter returns 0 events — showing the empty state with no indication the organizer wasn't found. Suggested fix: validate `initialOrganizer` in `EventsPage` against the fetched `organizers` list and pass `null` (or an `initialOrganizerNotFound` flag) if no match.

**Deferred because:** The empty state is a valid and non-confusing response for this edge case. The scenario (user manually crafts URL or an org is deleted) is uncommon. Validation adds server-side complexity and a new prop contract for an UX polish improvement that is not critical.

---

### Replace `as OrgMemberRole | null` cast with a runtime type-guard in `DashboardView`

**File:** `apps/web/app/components/organizer/DashboardView.tsx` (line ~140)

`organizations[].role` is typed as `string | undefined` in `DashboardViewProps`. The expression `(organizations.find(...)?.role ?? null) as OrgMemberRole | null` is a TypeScript assertion that bypasses the type system. The suggestion is to replace the cast with a narrow runtime mapper that returns `OrgMemberRole | null` and maps unknown strings to `null`.

**Deferred because:** `canManagePayouts` explicitly checks `role === "owner" || role === "admin"` — any unrecognized string safely returns `false`. Roles originate from the server-validated DB schema, making a rogue value effectively impossible. This is a TypeScript hygiene antipattern, not a functional bug.

---

### Tighten `memberRole` prop type in `OrgSettingsClient` from `string | null` to `OrgMemberRole | null`

**File:** `apps/web/app/organizer/settings/OrgSettingsClient.tsx` (line ~38), `apps/web/app/organizer/settings/page.tsx`

`OrgSettingsClientProps.memberRole` is typed as `string | null` and consumed via `canManagePayouts(memberRole as OrgMemberRole | null)`. The cast bypasses TypeScript's union validation. Proper fix: change the prop type to `OrgMemberRole | null`, remove the cast, and update `settings/page.tsx` to produce `OrgMemberRole | null` (requires a guard or assertion at the derivation site since `OrganizationMembership.role` is typed as `string`).

**Deferred because:** Same runtime safety argument — `canManagePayouts` handles any string correctly. Fix cascades into `settings/page.tsx`. Pure TypeScript hygiene, no functional impact.

---

## Apr 14, 2026 — Deferred from Stripe/Hold RPC PR review

### `atomic_create_hold_with_stage_validation` — `v_cancelled_holds` variable unused

**File:** `supabase/migrations/20260414220707_harden_hold_rpc_search_path_and_auth.sql`

`v_cancelled_holds` is declared and assigned via `GET DIAGNOSTICS v_cancelled_holds = ROW_COUNT` after the `DELETE FROM holds` but is never read or returned. Dead code in a plpgsql function — Postgres does not warn on unused DECLARE variables. No correctness or security issue.

**Suggested fix:** Remove the `v_cancelled_holds DECLARE` line and the `GET DIAGNOSTICS v_cancelled_holds = ROW_COUNT;` line. The `DELETE` itself is still required and correct; only the diagnostic capture is dead.

**Deferred because:** Purely cosmetic. No functional impact.

### `useSignInHandlers` — normalize `signIn.supportedSecondFactors` before use

**File:** `apps/mobile/hooks/useSignInHandlers.ts` — `onEmailSignIn`, around the `needs_client_trust` branch

The block reads `const factors = signIn.supportedSecondFactors` and then calls `.find()` on it without a null guard. Suggested defensive form: `const factors = signIn.supportedSecondFactors ?? []` and update the `console.warn` to use the normalized array.

**Deferred because:** In practice, Clerk only returns `needs_client_trust` when at least one second factor is configured, so `supportedSecondFactors` will be a non-empty array in all reachable cases. No crash risk. Pure defensive hygiene.

---

### `atomic_create_hold_with_stage_validation` — validate `p_expires_minutes` is positive

**File:** `supabase/migrations/20260414220707_harden_hold_rpc_search_path_and_auth.sql`

Suggestion: add a guard `IF p_expires_minutes IS NULL OR p_expires_minutes <= 0` before computing `v_expires_at` to prevent a hold expiration in the past.

**Skipped:** `p_expires_minutes` is hardcoded to `30` at the only two call sites in `apps/web/app/api/holds/create/route.ts` (lines 237 and the legacy-retry path). It is never derived from user input or the request body, so a null or non-positive value cannot occur in practice. The function also has `DEFAULT 30` in its signature. Adding the guard would be permanently unreachable dead code.

---

## Apr 16, 2026 — Deferred from stages-fixes PR review

### `initManagedStages` — remove unnecessary type assertion on `order_index` sort

**File:** `apps/mobile/components/events-management/EditTiersTab.tsx` — line 97

The sort callback casts `a` and `b` to `{ order_index?: number }` before reading `order_index`. `OrgEventTierStage` already declares `order_index: number` as a required field, so the cast is unnecessary and misleadingly implies the property might be absent. Replace with `a.order_index` / `b.order_index` directly (and drop the `?? 0` fallback, which is also unreachable for the same reason).

**Deferred because:** Pure cosmetic — the cast produces the same runtime value and TypeScript still infers the correct type. No correctness impact.

### `useEventDetails` catch block — add structured context to `getAuthenticatedClient` error log

**File:** `apps/mobile/hooks/useEventDetails.ts` — line 204

The `catch (tokenError)` log currently logs only the error object. Could include `{ userId, eventId, action: "fetchEventWithTiers" }` alongside `tokenError` to match the structured format used in the nearby RPC error log (line 213–218) and aid downstream log parsing.

**Deferred because:** Observability improvement only — the catch is a fallback path that gracefully continues with the anon client. No behavioral impact.

---

## Apr 14, 2026 — Deferred from FLAME internal content gating PR review

### `useSearchApprovedOrganizations` — wrap `effectiveExcludeIds` in `useMemo`

**File:** `apps/mobile/hooks/useSearchApprovedOrganizations.ts` — lines 26–28

`effectiveExcludeIds` is computed inline on every render. Both `isProductionBuild` (a module-level const evaluated once at startup) and `INTERNAL_ORG_IDS` (a static array) never change at runtime, so the only dynamic input is `excludeIds`. Wrapping in `useMemo` with `[excludeIds]` as the dependency would avoid recreating the merged array on renders where `excludeIds` is stable.

**Deferred because:** The result is immediately written to `excludeRef.current` (a ref), so it is never used as a hook dependency and cannot cause stale closures or re-renders. The `Set` spread is O(n) over a handful of UUIDs and is effectively free. Pure micro-optimization with no observable correctness or performance impact in context.

### Web pages — guard `INTERNAL_ORG_IDS.length > 0` before `.not()` Supabase calls

**Files:** `apps/web/app/page.tsx` (line 68–74), `apps/web/app/events/page.tsx` (lines 76–87), `apps/web/app/discover/page.tsx` (lines 119–130), `apps/web/app/sitemap.ts` (lines 84–90)

Suggestion: add `&& INTERNAL_ORG_IDS.length > 0` to each `isProduction()` guard before calling `.not("organization_id", "in", ...)` to avoid constructing an invalid `"in ()"` Supabase filter if the array is ever empty.

**Deferred because:** `INTERNAL_ORG_IDS` is a hardcoded `const` in `packages/lib/src/utils/internal.ts` with exactly one UUID. It cannot be empty without an explicit code change. The `.not("id", "in", "()")` case is physically unreachable in the current codebase. The guard adds defensive value only if future contributors empty the array without updating call sites — a scenario that warrants a code review anyway. Add the guard when/if `INTERNAL_ORG_IDS` becomes dynamic or caller-supplied.

---

## Apr 17, 2026 — Deferred from App Store compliance PR (v1.0.12)

### Add `destructive` design token and replace hardcoded destructive UI colors

**Files:**

- `packages/ui/tailwind.config.js` — add new `destructive` color token.
- `packages/lib/src/design-tokens/flame-colors.ts` — add matching `destructive` key for raw-string consumers.
- `apps/mobile/components/settings/PersonalSettingsTab.tsx` — lines 388, 390, 391: replace `border-[rgba(255,0,0,0.5)]`, `color="#FF4444"` on `ActivityIndicator`, and `text-[#FF4444]` with token-based classes/values.
- `apps/web/app/components/UserDashboard.tsx` — line 485: replace `border-[rgba(255,0,0,0.5)]`, `text-[#FF4444]`, and `hover:bg-[rgba(255,0,0,0.05)]` with token-based classes.

The "Delete Account" buttons on both platforms use the same ad-hoc destructive palette (soft red `#FF4444` with translucent border/hover). These values are hardcoded and technically violate the design system's "no hardcoded hex" rule (see `flame-design-system.mdc`). The existing `primary: #FF0000` token is explicitly reserved for RSVP/status badges on event images — do **not** reuse it for destructive buttons.

Suggested token: `destructive: "#FF4444"` (opaque), with Tailwind opacity modifiers (`border-destructive/50`, `hover:bg-destructive/10`) handling the translucent variants.

**Deferred because:** Introducing a new color token is cross-cutting (two packages + two app files) and scope-creeps the compliance-deadline PR (App Store Guideline 5.1.1(v) response). The hardcoded colors render correctly today and do not block users or compliance. Clean up in a follow-up design-system pass alongside any other token additions.

**Originally surfaced by:** Automated PR review of app-store-compliance-1.0.12 PR (Apr 17, 2026).

---

## Apr 17, 2026 — Deferred from T&C acceptance PR (W2-3)

### Consolidate client-side image upload validation into shared `validateImageFile`

**Files:**

- `apps/web/app/lib/utils/image-upload.client.ts` — extend `validateImageFile` to surface the offending file's size in its error message (or accept a custom formatter) so consumers don't have to duplicate logic to get rich error copy.
- `apps/web/app/components/forms/CreateEventForm.tsx` — lines 446-462: replace inline type-check + size-check with a single `validateImageFile(file)` call, pass the returned error to `setImageError`.
- `apps/web/app/organizer/event/[id]/OrgEventDetailClient.tsx` — lines 1203-1210: replace the inline `handleEditingImageUpload` checks with the same shared validator (also collapse the bare `alert()` calls into the component's existing error UI pattern).

Today there are three copies of the same "image MIME must start with `image/`, size must be < 4.5MB" logic: the shared `validateImageFile` in `image-upload.client.ts` (exported but unused by both callers), plus inline duplicates in CreateEventForm and OrgEventDetailClient. The shared util's error string is less helpful than the inline copies (`"Image size must be less than 4.5MB"` vs `"Image size must be less than 4.5MB. Your file is 7.23MB."`), which is why the duplicates exist — they wanted the file-size info.

**Deferred because:** A straight swap to the existing shared validator would regress UX (lose the "Your file is X MB" detail). A correct consolidation needs a two-step change — (1) update the shared validator to return the file size or accept a message formatter, (2) migrate both call sites — which is out of scope for a PR-review cleanup pass. The current duplication is cosmetic; all three copies enforce the same 4.5MB limit correctly.

**Originally surfaced by:** Automated PR review of W2-3 (T&C acceptance) PR.

---

## Apr 20, 2026 — Declined from T&C acceptance PR (W2-3) follow-up review

### Move `TERMS_URL` / `PRIVACY_URL` in `TermsCheckbox.tsx` to `app.config.ts` `extra`

**File:** `apps/mobile/components/sign-in/TermsCheckbox.tsx` (lines 6-7).

The reviewer suggested moving the two legal-URL constants out of the component and into Expo-managed runtime config (`Constants.expoConfig?.extra?.TERMS_URL` via `app.config.ts`), with the stated rationale that this would keep "mobile/web legal links aligned without code changes."

**Decision: declined, not deferred.**

**Verification (Apr 20):**

1. The claim that this keeps web/mobile aligned is **incorrect**. Web uses its own hardcoded Next.js routes in `apps/web/app/components/Footer.tsx:17-18` (`/privacy-policy`, `/terms-of-use`), and the pages themselves live at `apps/web/app/privacy-policy/page.tsx` and `apps/web/app/terms-of-use/page.tsx`. Moving the mobile URLs to an Expo `extra` does nothing for web — no shared config source exists that both sides read from. To actually deliver the claimed "no code changes" benefit you'd need to introduce a shared config package consumed by both `apps/web` AND `apps/mobile`, which is a substantially larger change than what the comment proposed and delivers essentially zero benefit (see point 2).
2. Legal URLs are effectively immutable for the lifetime of the app. A domain change (the only realistic trigger) requires an App Store metadata update (Apple has its own "Privacy Policy URL" field in App Store Connect that users see on the product page) AND a new app build/submission anyway. An OTA swap via `extra` would create a state where App Store Connect metadata points at the old URL while the running app opens the new one — strictly worse than a rebuild.
3. Industry convention: Expo, React Native, and native iOS apps universally hardcode legal URLs at the usage site. `app.config.ts extra` is reserved for values that vary per build channel (EAS project ID, API base URL, analytics keys, environment-specific feature flags) — not for legal constants that are identical across dev, staging, production, and TestFlight.
4. Moving to `extra` adds an indirection cost: URLs become un-greppable from the repo root, every consumer needs a defensive `Constants.expoConfig?.extra?.TERMS_URL ?? FALLBACK_URL` read (because `extra` is typed as `Record<string, any>` and could be missing), and the `app.config.ts` file grows for a value that isn't configuration.

**If we ever do need runtime-configurable legal URLs** (e.g., per-region terms for a future EU rollout with a different Privacy Policy under GDPR), the right abstraction at that point will be a region-aware helper in `@project-flame/lib` consumed by both web and mobile — not an Expo `extra`. Revisit then; don't pre-build for it now.

**Originally surfaced by:** Automated PR review of W2-3 (T&C acceptance) follow-up PR, Apr 20, 2026.

---

## Event-image aspect-ratio drift across display surfaces (Apr 20, 2026)

**Context:** `APRIL_2026_FIXES.md` #114 canonicalized the event-poster ratio at **4:5** end-to-end (upload canvas, mobile ImagePicker crop UI, display containers). Several display surfaces, however, still render event images at fixed pixel heights or with `aspect-square` — so the same poster is shown at inconsistent ratios across the app.

**Locations still drifting from 4:5:**

| File | Current | Notes |
| --- | --- | --- |
| `apps/mobile/components/home/HomeFeedList.tsx` | `aspect-square` | Home feed vertical cards |
| `apps/web/app/components/home/HomeFeedEventCard.tsx` | `aspect-square` | Web home feed cards |
| `apps/web/app/components/discover/EventsSection.tsx` | `aspect-square` | Discover horizontal carousel |
| `apps/mobile/components/org-dashboard/OrgEventInfoCard.tsx` | `h-[254px]` | Organizer dashboard event list |
| `apps/mobile/app/ticket/[id].tsx` | `h-[254px]` | User ticket detail |
| `apps/web/app/account/ticket/[id]/page.tsx` | `h-[254px]` | Web ticket detail |
| `apps/mobile/components/settings/SettingsPhotoSection.tsx` | `h-[254px]` | Settings photo preview |
| `apps/web/app/organizer/event/[id]/OrgEventDetailClient.tsx` (line 2045 area) | `h-[254px]` | Legacy organizer surface |
| `packages/ui/src/components/EventCard.tsx` | `h-[130px] w-[218px]` (≈ 5:3 landscape) | Shared horizontal event card |

**Why deferred (design decision — not a bug):**

`APRIL_2026_FIXES.md` #581–595 (ratio unification pass, Apr 4) migrated these surfaces to `aspect-[3/4]` once, then #1810/#2029 migrated the *hero/upload* surfaces to `aspect-[4/5]` while **intentionally leaving list/thumbnail surfaces on their current compact shapes**. The remaining drift in the table above is therefore the expected outcome of a **two-shape strategy**, not accidental regression:

- **Hero / upload / detail surfaces → 4:5** (`aspect-[4/5]`). Full Instagram-portrait framing. Applies to: event detail page (`EventDetail.tsx`, mobile `EventHero.tsx`), event create/edit previews (`EventDetailsTab.tsx`, `EditEventDetailsTab.tsx`), featured event card (`FeaturedEvent.tsx`), organizer event info card (`OrgEventInfoCard.tsx`).
- **List / thumbnail surfaces → compact shape** (`aspect-square` or fixed height). Denser scanning, more events visible per scroll. Applies to surfaces in the table above.

**Action required before treating any of these as bugs:** Loop in design and record their explicit ruling — intentional two-shape strategy vs. oversight — in this entry. If intentional (expected answer based on how #2029 was resolved), the table becomes reference documentation, not a fix list. If oversight, migrate the listed surfaces to 4:5 in one pass.

**Questions a design pass would need to answer:**

1. Is the two-shape strategy official? (Hero = 4:5, thumbnail = compact.)
2. Under the two-shape strategy, is `object-cover` with center focus acceptable for the 4:5 source → square/landscape crop? Some surfaces (e.g. `HomeFeedList` square cards, the shared `packages/ui/EventCard.tsx` `h-[130px] w-[218px]` ≈ 5:3 landscape) may center-crop a 4:5 poster in a way that clips the title or date block on the source artwork.
3. Specifically for `packages/ui/src/components/EventCard.tsx`: should the fixed `h-[130px] w-[218px]` become a proper ratio (e.g. `w-[218px] aspect-[4/5]` → `h-[273px]`) to preserve the 4:5 source, or is the 5:3 landscape shape deliberate for horizontal carousel density?
4. Where should the "canonical shape per surface" live — a comment in `flame-design-system.mdc`, a token, or a shared wrapper component? Currently each file picks its own shape, which is what led to drift in the first place.

**Not a functional bug** — the upload pipeline stores images correctly at 4:5 (1080×1350), all containers apply `object-fit: cover`, and users see cropped-but-valid images everywhere. Log here until design confirms the two-shape strategy and the questions above are answered.

**Originally surfaced by:** Audit during #114 (3:4 → 4:5 migration).


## April 2026 PR Review — Registration Form Builder & Organizer Views (Apr 22, 2026)

### `apps/web/app/components/forms/RegistrationFormBuilder.tsx` (lines 42–177) — Extract `RegistrationFieldRow` subcomponent

`RegistrationFormBuilder` mixes list rendering, per-row UI, and per-row action handlers in one component. Extract a `RegistrationFieldRow` subcomponent that receives `field`, `index`, and callbacks (`onUpdate`, `onToggleArchive`, `onRemove`) and encapsulates the label input, type select, required checkbox, archive toggle, and remove button. Keep `addField` and list rendering in the parent. Replace the `fields.map` body with `<RegistrationFieldRow ... />`.

### `apps/web/app/components/forms/RegistrationFormBuilder.tsx` (line 20) & `apps/web/app/lib/hooks/useOrganizerData.ts` (line 3) — Move `FormField` type to `@project-flame/lib`

Both files import `FormField` from `../../components/modals/RegistrationFormModal`, coupling the builder and the organizer data hook to a UI modal. Move the `FormField` interface into `packages/lib` (e.g. `packages/lib/src/types/registration.ts`), export it from `@project-flame/lib`, and update all import sites (`RegistrationFormBuilder.tsx`, `RegistrationFormModal.tsx`, `useOrganizerData.ts`, `FormFieldCard.tsx`) to use the shared type.

### `apps/web/app/organizer/event/[id]/OrgEventDetailClient.tsx` (lines ~1909–1917) — `disabled:text-gray-400` missing on Add Tier button

The Add Tier button (guarded by `ticket_tiers.length >= MAX_TICKET_TIERS_PER_EVENT`) uses `disabled:opacity-50 disabled:cursor-not-allowed` but is missing `disabled:text-gray-400`. Both Add Tier instances in the file should have consistent disabled text color. Compare to other disabled buttons in the organizer dashboard.

### `apps/web/app/organizer/event/[id]/OrgEventDetailClient.tsx` (lines 1733–1803) — Extract `RegistrationFormSection` subcomponent

The registration form toggle + `RegistrationFormBuilder` block inside `OrgEventDetailClient` is ~70 lines of state-coupled JSX. Extract a `RegistrationFormSection` component that accepts `editingEventData`, `setEditingEventData`, and `createEmptyField`, encapsulates the `registrationFormEnabled` checkbox toggle and the conditional `RegistrationFormBuilder` render, and replace the block with `<RegistrationFormSection ... />`.

### `apps/web/app/organizer/page.tsx` (lines 176–271), `apps/web/app/api/organizer/data/route.ts`, `apps/mobile/hooks/useOrgEvents.ts` — Extract `computeReservedByTier` to `@project-flame/lib`

The `reservedByTier` aggregation (count active holds + pending/approved RSVPs per tier) is duplicated across three files. Extract to a shared `computeReservedByTier(holds, rsvps) => Record<string, number>` utility in `@project-flame/lib` and replace local copies with an import.

### Web: mirror mobile's pre-submit warning banner for `sold + pending` floor in tier edit form

**Files:** `apps/web/app/organizer/event/[id]/OrgEventDetailClient.tsx` (inline tier edit form) / any shared tier edit form

**Context:** Mobile's `EditTiersTab.tsx` shows a yellow banner when editing a tier that already has `quantity_sold > 0` or `quantity_reserved > 0`, telling the organizer the minimum allowed `quantity_total` before they submit (#139, #137). Web has no equivalent — the organizer only sees the error after POSTing (the `PUT /api/ticket-tiers` guard we added in #138). Functionally correct, but worse UX.

**Why deferred:** Not a bug, it's a net-new feature on web (web never had a banner for the pre-existing sold-only floor either). Out of scope for the April parity PR. Small (~15 lines) — port mobile's banner string template and conditional to the web form, sourcing `quantity_sold` and `quantity_reserved` from the tier object already rendered.

**Reference implementation:** `apps/mobile/components/events-management/EditTiersTab.tsx`, search for `hasSales || pending > 0`.

---

### Dead variable `v_requested_stage_record` in `create_rsvp_atomic`

**File:** `supabase/migrations/20260429153551_fix_create_rsvp_atomic_pending_only.sql` (line 37)

`v_requested_stage_record RECORD` is declared in the DECLARE block but never referenced anywhere in the function body. Inherited from the original baseline function. Zero functional impact — Postgres ignores unused DECLARE variables. Can be removed in a future SQL tidy-up pass.

---

### Zod-validate `/api/organizer/data` responses on the web (parity with mobile)

**Files:**
- `apps/web/app/lib/hooks/useOrganizerData.ts` — currently does `response.json()` with no runtime validation.
- `apps/web/app/organizer/event/[id]/OrgEventDetailClient.tsx` `handleExportPurchases` — same pattern: refetches `/api/organizer/data?org=…` and accesses `events[].purchases` directly.

**Context:** Surfaced by PR review on APRIL_2026_FIXES.md #144. Mobile (`apps/mobile/hooks/useOrgEventEnriched.ts`) already validates the response via `OrgDataResponseSchema` (Zod). Web doesn't, including the new export refetch path. Schema drift between server and either client would surface as runtime errors instead of a single validation point.

**Why deferred:** Adding Zod parsing only to the export refetch is asymmetric — `useOrganizerData` itself is the canonical consumer and should validate first. Either extract a shared `OrganizerResponseSchema` to `packages/lib` and apply it on web + mobile, or do nothing here. Out of scope for the export-feature audit (#143 / #144). Note: master guide §3 says "Don't add error handling, fallbacks, or validation for scenarios that can't happen … Only validate at system boundaries." Internal Next.js API → Next.js client is debatably an internal call, but cross-cutting validation has real value when API and client are deployed separately.

---

### Dead `PurchaseDetailsSection` + `handleExportToExcel` in `OrganizerDashboard.tsx`

**File:** `apps/web/app/components/OrganizerDashboard.tsx` (~lines 62–379)

`PurchaseDetailsSection` (and its `handleExportToExcel` with hard-coded UTC-5 / Ecuador timezone) is exported and defined but never rendered anywhere in the codebase — confirmed via repo-wide grep on April 29, 2026. The active per-event purchase export lives in `apps/web/app/organizer/event/[id]/OrgEventDetailClient.tsx`'s `PurchasedDetailsSection`.

**Why deferred:** Discovered while doing the export-feature audit (APRIL_2026_FIXES.md #143). Removing dead code is unrelated to the audit's goal (adding registration form columns to the active export). Safe to delete in a separate cleanup PR — no behaviour change, no callers. When deleting, also drop the `formatEcuadorTimestamp` helper and the now-unused `* as XLSX` import if they end up orphaned.

---

### [INTENTIONAL] `quantity_reserved` labeled "pending" in organizer tier displays — keep as-is

**Files:** `apps/web/app/components/organizer/EventsTiersView.tsx`, `apps/web/app/organizer/event/[id]/OrgEventDetailClient.tsx`, `apps/mobile/components/events-management/EditTiersTab.tsx`

PR reviewers have flagged that `quantity_reserved` (which includes both active holds and pending/approved RSVPs) is displayed as "pending" rather than "reserved". The label is technically imprecise but **intentionally kept as "pending"** because:

- Organizers understand "pending" as "not yet confirmed/sold" — it communicates actionability (these slots may free up or convert).
- "Reserved" implies a deliberate allocation, which may confuse organizers who don't know what "holds" are.
- Product decision: "pending" is the user-facing label. Do not change unless product explicitly revisits this.

---

### `apps/mobile/app/organizer/[slug].tsx` (line 372) — date badge overlay uses raw `text-white`

The date-badge overlay on event grid cards uses `bg-[rgba(0,0,0,0.55)]` (no token equivalent — this is a translucent black overlay intentionally sitting over event photography) and `text-white` on the two inner `FlameText` elements rendering `event.day` / `event.month`.

**Suggested fix:** Swap the inner `text-white` for the token class `text-white-100`. The `rgba(0,0,0,0.55)` overlay has no matching token and stays as-is.

**Deferral reason:** Purely cosmetic — `text-white` and `text-white-100` differ by ~3% on white. Bundle with the next design-token sweep.

---

### `apps/mobile/app/organizer/[slug].tsx` (line 411) — 2-col event grid uses `style={{ width: "48.5%" }}`

The `EventGrid` lays out cards with `flex-row flex-wrap` + `gap: 8` and each card wrapper at `style={{ width: "48.5%" }}`. This renders correctly on every iPhone form factor because `gap: 8` (~1.5% of screen width) reliably fills the remaining space, but the magic-percentage pattern is brittle if spacing tokens change.

**Suggested fix:** Replace with either (a) `flexBasis: "48.5%"` for semantic correctness, or (b) `useWindowDimensions()` + computed width `= (width - padding - gap) / 2`. Option (a) is the minimal change; option (b) eliminates the magic number entirely.

**Deferral reason:** Works correctly across all tested devices. Refactor when a third column or a breakpoint requirement appears — until then `48.5%` is a well-known React Native idiom, not a bug.

---

## April 2026 PR Review — Discover Page Featured/Spotlight Split (Apr 29, 2026)

### Extract Discover/Explore listing caps into a single shared constant in `@project-flame/lib`

**Files (current call sites):**
- `apps/web/app/discover/page.tsx` — `FEATURED_EVENTS_LIMIT = 10`, organizers `.limit(30)`.
- `apps/mobile/hooks/useAppEvents.ts` — `FEATURED_EVENTS_LIMIT = 10`.
- `apps/mobile/components/home/ExploreOrganizers.tsx` — `MAX_VISIBLE = 30`.

**Context:** Surfaced by PR review on APRIL_2026_FIXES.md #145. Reviewer flagged that the featured-events cap and the organizers cap are now duplicated across web and mobile, with both files explicitly cross-referencing each other in comments to prevent drift. Suggested extracting `DISCOVER_FEATURED_CAP`, `DISCOVER_ORGANIZER_LIMIT`, and `EXPLORE_ORGANIZERS_MAX_VISIBLE` (or a single `DISCOVER_LIMITS` object) into `@project-flame/lib` so a single edit propagates to both apps.

**Why deferred:** Premature abstraction at the current scale — only two call sites per constant, both already documenting the cross-reference inline. Master guide §3 prefers concrete duplication over speculative shared infrastructure. Worth doing once a third consumer appears (a third surface that lists featured events or organizers), or if the values actively drift between web and mobile in a future PR. Until then the inline comments are sufficient.

---

## Public API Hardening (Apr 29, 2026)

### Rate-limit `/api/qr-scanner/**` (and other public-credential endpoints) at the path level

**Scope (current state — none of these have any rate limiting):**
- `apps/web/app/api/qr-scanner/validate-code/route.ts` — accepts a 4–8 char `[A-Z0-9]` access code, anonymous-callable.
- `apps/web/app/api/qr-scanner/verify/route.ts` — same access code is the credential.
- `apps/web/app/api/qr-scanner/checkin/route.ts` — same access code marks tickets used.
- (Future audit: any anonymous endpoint that triggers email/SMS sends or hits Stripe per call — same threat shape.)

**Context:** Surfaced by PR review on APRIL_2026_FIXES.md #147 (which made `validate-code` properly anonymous-callable). Reviewer correctly noted that 4-char codes (~1.6M combinations) are theoretically brute-forceable at scale. Per-endpoint analysis:

| Endpoint | Brute-force outcome | Cost amplification |
|---|---|---|
| `validate-code` | Leaks event names (already public, `status = published`) | Cheap Supabase query |
| `verify` | Returns ticket validity for a guessed (code, qrPayload) pair | Cheap Supabase query |
| `checkin` | Marks a guessed ticket used — DOES require a valid ticket QR payload, not just a code | Cheap Supabase update |

The realistic damage from a brute-force run is small (the QR payload itself is the second factor on `verify`/`checkin`), but defense-in-depth is still warranted.

**Why deferred:**
1. **No rate-limiting infrastructure exists in the codebase** — no `@upstash/ratelimit`, no Vercel KV setup, no in-memory limiter, no shared utility. Adding one to one route would be a fork in convention.
2. **Right shape is path-level, not per-route.** A limiter on just `validate-code` doesn't help — an attacker pivots to `verify` directly with the same code-space enumeration.
3. **Provider decision needs alignment.** Options: Upstash Ratelimit + Upstash Redis (most common Vercel pattern), Vercel KV Ratelimit (native), or Cloudflare WAF rules at the edge. Each has tradeoffs given the Stripe/Clerk/Supabase stack already in place.
4. **Vercel edge already provides coarse DDoS protection** at the platform level; the real gap is application-aware per-IP throttling, which is what Upstash/KV solves.

**Trigger to revisit:**
- If we add a second class of public-credential endpoint (e.g. anonymous code redemption, anonymous waitlist join with email send).
- If logs ever show suspicious enumeration patterns on `qr-scanner/*`.
- Bundled with the structured-logging entry below — same logical security/observability batch.

### Replace `console.error` with a structured request-context logger across `apps/web/app/api/**`

**Scope (current state):**
- `apps/web/app/api` has 100+ `console.error` call sites with ad-hoc string formats.
- No logger module, no shared request-context helper, no Sentry/Datadog/Logtail wiring.
- All three `qr-scanner` routes (`validate-code`, `verify`, `checkin`) follow the same `console.error("...", error)` pattern.

**Context:** Surfaced by PR review on APRIL_2026_FIXES.md #147. Reviewer suggested adding structured logs (client IP, user-agent, eventId, outcome) to `validate-code` for abuse detection. Verified: doing it only on `validate-code` would create a logging fork — every other API route in the app uses bare `console.error`, and Vercel's request log already captures IP/UA/path automatically.

**Why deferred:**
1. **Cross-cutting concern, not per-route.** Adding a logger to one route while 100+ other routes use `console.error` is the worst of both worlds — inconsistent log shape AND no actual observability uplift.
2. **No downstream consumer.** Without Sentry/Datadog/Logtail wired up, structured fields don't unlock alerting or queryability — they just produce verbose strings in Vercel's log stream.
3. **Pairs naturally with the rate-limiting work above.** If we ever add abuse detection, we'd want both at once: structured logs to detect abuse patterns, rate limiting to mitigate them.

**Trigger to revisit:**
- When picking an observability provider (Sentry already partially in place via Clerk/Stripe? — verify before greenfielding).
- When abuse patterns or post-incident triage make the logging gap painful.
- Migrate all `console.error` sites in one pass alongside the logger introduction.

---

## Mobile Org Rework — Post-Stage 2 Follow-ups (Apr 30, 2026)

### `apps/mobile/app/(tabs)/dashboard.tsx` — My Tickets uses `ActivityIndicator` while every other top-level tab uses skeletons

**Files:**
- `apps/mobile/app/(tabs)/dashboard.tsx:91-98` — full-screen `ActivityIndicator` + "Loading your tickets..." text on cold load.

**Context:** Surfaced by the loading-state audit at the end of the org-rework session. Profile (Screen 1), Organizer Admin (Screen 3), and the new Skeleton component cover every other top-level surface. My Tickets is the one bottom-tab destination still using a centered spinner. Functional behavior is correct — this is purely a visual consistency item.

**Suggested fix:** Wire `Skeleton` from `@project-flame/ui` into `dashboard.tsx`. Three local skeletons: stat-card skeleton (3×, matches `StatsGrid` shape), ticket-card skeleton (matches `TicketCard` shape), and the past-tickets accordion. Same pattern as `OrgRowSkeleton` / `EventCardSkeleton` already in the codebase.

**Why deferred:** Scope creep — My Tickets has been on the existing `ActivityIndicator` pattern for many releases without complaints, and the org rework is scoped to the new screens introduced by it (Profile, Org Admin, Org Public). Bundle with a future "loading-state pass on remaining tabs" PR that also covers `history.tsx` (Past tickets) for parity.

---

### `apps/mobile/app/(tabs)/events-management.tsx` — likely dead code after the org rework

**Scope:**
- File still exists at `apps/mobile/app/(tabs)/events-management.tsx`
- Registered as a stack screen in `app/(tabs)/_layout.tsx` (`<Tabs.Screen name="events-management" />`)
- NOT in the bottom tab bar (the new `CustomTabBar` shows only `home / discover / dashboard / profile`)
- NOT linked from Screen 3 (organizer-admin) or anywhere else found in a grep

**Context:** Surfaced by the same audit. Pre-rework, `events-management` was a top-level organizer tab. Post-rework, the events list lives inside Screen 3 (organizer-admin's "Current & upcoming events" section), so this file is unreachable except via direct route navigation (which nothing in-app does). Imports `OrgEventCard`, `useOrgEvents`, `useOrgData` — all still in use elsewhere, so removing the file shouldn't break anything.

**Suggested fix:** 
1. Confirm zero call sites: `grep -rn "events-management" apps/mobile/` and `grep -rn "/events-management" apps/mobile/`.
2. Delete `apps/mobile/app/(tabs)/events-management.tsx`.
3. Remove the `<Tabs.Screen name="events-management" />` line from `app/(tabs)/_layout.tsx`.
4. If anything else in the codebase imports types/components from it, fail loudly during typecheck — fix those then.

**Why deferred:** Cleanup is safer as its own PR after the org-rework PR ships, so the diff is purely a deletion and easy to review. Doing it inside the org-rework PR would mix scope (UI restructure + dead code removal). Schedule for the start of Stage 3 — clears the file before web parity work starts referencing the wrong source.

---

### Mobile org rework — manual QA pass before merging

**Scope:** The skeleton + role-sync gate work in this session is theoretically correct, but loading-state UX is the kind of thing only device testing reveals (timing-sensitive, depends on network speed, depends on TanStack cache state).

**Manual QA checklist:**

1. **Cold launch → Profile tab.** Should show skeleton avatar + skeleton org rows immediately, then real content fades in once `useUserProfile` and `useUserOrgs` settle.
2. **Profile → tap an organizer row → Organizer Admin (first visit, cold cache).** Should show skeleton header + skeleton stats + skeleton 4-tile action row + skeleton event cards. Real content appears once each respective query resolves.
3. **Profile → tap an org → back to Profile → tap the SAME org again (cache warm).** Should show real content nearly immediately (within ~50ms). Critically: the action tile row must NOT stay stuck on skeleton (this was the ref-vs-state bug we fixed). The Stripe pill must NOT pop in late and shift the header layout.
4. **Profile → tap Org A → back → tap Org B (different org).** Should show skeleton briefly while role re-resolves for Org B. Action tiles should appear together once Org B's role is confirmed (not "QR Scanner first, then the rest" — also a bug we fixed).
5. **Push notification → `/organizer-admin?orgId=X` deep link.** Should land directly on Screen 3 with skeleton, then the correct org's data + role-derived tiles appear.
6. **Total Revenue card on Screen 3.** Must NOT flash through "$0" before the real value (the multi-source gate fix). If the org has 0 sold tickets, the card should still show "$0" cleanly without a flash through skeleton → 0.
7. **Pull-to-refresh on Screen 3.** Should not regress to skeletons (skeletons are for initial load, not refetch). Real content stays visible during refetch; spinner is the `RefreshControl` pull indicator only.

**Why log:** So it doesn't get forgotten between merging Stage 1+2 and starting Stage 3. Skip if you've already done a full pass on a real device.

---

## May 2026 PR Review — App version gating (May 11, 2026)

### Convert inline `style={}` objects to NativeWind classes in version-gating screens

**Files:**
- `apps/mobile/components/system/ForceUpdateScreen.tsx` (lines ~96-193) — outer container Views, logo glyph nested circles, `Image` sizing
- `apps/mobile/components/system/OtaRestartSheet.tsx` (lines ~70-150) — outer wrapper, scrim Pressable, sheet container, drag handle, hero icon double-circle, text container
- `apps/mobile/components/system/UpdateAvailableBanner.tsx` (lines ~85-100) — the 28×28 rounded icon circle (`{ width: 28, height: 28, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.1)", alignItems, justifyContent }`) + the `flex: 1` text wrapper

**Scope:** The three new system screens already pull their colors from the shared `colors` import (`@project-flame/ui`) — no raw hex literals leak in — but the layout primitives (`width`, `height`, `borderRadius`, `padding`, `gap`, `alignItems`, `justifyContent`) are still expressed as inline `style={}` objects. The reviewer wants everything reduced to `className` utilities (e.g. `className="size-7 rounded-full bg-white-10 items-center justify-center"` for the icon circle in `UpdateAvailableBanner`). The remaining `rgba(255,255,255,0.1)` literal in `UpdateAvailableBanner` should swap to the existing `colors["white-10"]` token (or its className equivalent `bg-white-10`) so the color reference is centralized.

**Why deferred:** (1) Other components shipped in this repo deliberately mix `style={}` + `className` (e.g., `BecomeOrganizerSheet`, `CheckoutCTA`, `RsvpPaymentModal`) — there is no consistent project-wide rule that says "no inline styles, ever". (2) The plan accepted the current shape during the second-pass review. (3) The visible behavior is identical; this is pure code-style polish. Sweep all three files in a single follow-up PR (10-15 minutes) rather than churning a critical PR. Make sure to preserve dynamic `pressed` / `disabled` opacities — those stay in the `style` callback per the project's `Pressable` pattern.

**Re-confirmed deferred (May 12, 2026):** Reviewer flagged the `UpdateAvailableBanner` icon-circle block again specifically. Same rationale stands — this is the same sweep, doing one block in isolation splits the work.

### Replace manual `typeof` validation in `readSuppression` with Zod

**File:** `apps/mobile/hooks/useOtaUpdatePrompt.ts` (lines ~44-59).

**Scope:** `readSuppression` parses a SecureStore JSON blob with two fields (`updateId: string`, `suppressedAt: number`) using manual `typeof` checks. Reviewer suggests defining a Zod schema (`z.object({ updateId: z.string(), suppressedAt: z.number() })`) and using `safeParse`.

**Why deferred:** 2-field schemas are the canonical case where Zod adds zero correctness — the existing `typeof` check covers exactly the same surface, is explicit, and adds zero bundle cost. Worth doing if/when we add more fields (e.g., once we add reason tracking or per-user dismissal), but not now. Codebase has many similar 2-3 field SecureStore guards that use plain `typeof` for the same reason.

### Replace `withDefaults` + manual type guard in app-config API route with Zod

**File:** `apps/web/app/api/mobile/app-config/route.ts` (lines ~103-125).

**Scope:** The route currently uses `isRawPlatformConfig` (a structural type guard) plus a `withDefaults` helper to coerce a raw DB JSON column into the `PlatformConfig` shape. Reviewer wants the whole pair replaced with a Zod schema (`PlatformConfigSchema`) using `safeParse`, deriving the TypeScript types via `z.infer`.

**Why deferred:** The current code is correct, type-safe, and the 5-field guard reads cleanly. Zod would not catch any additional cases here — the route already has explicit fallback behavior (return safe-default on parse failure) and the clamping step that runs AFTER validation. Worth doing once we add another platform (web app remote config, partner-key gating, etc.) or once the schema crosses ~8 fields. Until then, the manual guard + `withDefaults` is exactly the right tool for the job.

## May 2026 PR Review — Cohost/Admin blue color centralization (May 20, 2026)

### Promote `#238FDA` to a `cohost` (or `adminBlue`) design token in `flame-colors.ts`

**Files (15+ literal usages across web + mobile):**
- Web: `OrgEventCard` (mobile), `CoHostAssignmentModal.tsx` (3 occurrences), `OrganizerAdminView.tsx`, `OrganizerTeamView.tsx` (2 occurrences), `UserDashboard.tsx` (pending state)
- Mobile: `org-members.tsx`, `org-event-detail.tsx` (2 occurrences), `OrgEventCard.tsx`, `dashboard/TicketCard.tsx` (pending state), `scanner/OrgSelector.tsx`, `org-members/AddMemberSheet.tsx`, `org-members/EditRoleSheet.tsx`, `org-members/CoHostAssignmentSheet.tsx` (3 occurrences)

**Scope:** PR reviewers flagged the literal `#238FDA` in three separate files (`OrgEventCard`, `CoHostAssignmentModal`, `OrganizerTeamView`) during the W2-A1/W3-B1 cohost work. The hex represents a semantic concept ("cohost / admin role / pending tickets" blue) and exceeds the 3-usage abstraction threshold. Add `cohost: "#238FDA"` (or `adminBlue`) to `flameColors` in `packages/lib/src/design-tokens/flame-colors.ts`, and optionally mirror as a Tailwind token in `packages/ui/tailwind.config.js` so existing `text-[#238FDA]` / `style={{ backgroundColor: "#238FDA" }}` sites can use the named token.

**Why deferred:** Pure refactor — no functional change. Fixing one file in isolation (as the auto-reviewer asked) makes the codebase *less* consistent because 12+ other sites still use the literal. Worth a single follow-up sweep that converts all 15+ call sites together. Also touches both apps — mobile-side conversions should align with the existing `colors` import pattern from `@project-flame/ui`, not flameColors directly.


## June 2026 PR Review — Warning amber color centralization (W4-C3, Jun 3, 2026)

### Promote `#FBD68D` to a `warning` design token in `flameColors` + Tailwind config

**Files (6+ literal usages across web + mobile):**
- Web: `apps/web/app/components/EventDetail.tsx` (the `text-[#FBD68D]` for "Not available yet" / stage status copy, multiple occurrences), `apps/web/app/components/forms/CreateEventForm.tsx` (new: access-code hint), `apps/web/app/components/organizer/TierInlineForm.tsx` (new: access-code hint)
- Mobile: `apps/mobile/components/events-management/EditTiersTab.tsx` (new: access-code hint, two locations — edit-existing + add-new), `apps/mobile/components/create-event/EditableTierCard.tsx` (new: access-code hint)

**Scope:** PR reviewers flagged the literal `#FBD68D` ("warning amber") in the W4-C3 access-code hints. The hex is the established warning color used project-wide (see `EventDetail.tsx` for the canonical "Not available yet" status pattern that predates this PR). Add `warning: "#FBD68D"` (or `amber`) to `flameColors` in `packages/lib/src/design-tokens/flame-colors.ts`, mirror as a Tailwind token in `packages/ui/tailwind.config.js`, then migrate all existing `text-[#FBD68D]` and `bg-[#FBD68D]/*` sites in one sweep.

**Why deferred:** Pure refactor — no functional change. Fixing only the W4-C3 hint sites in isolation makes the codebase *less* consistent because the older "Not available yet" sites in `EventDetail.tsx` still use the hex literal. Single follow-up sweep is the right move. Token name should align with the existing `text-error` / `text-primary` semantic naming convention.

### Promote `#5DDBB1` to a `success` design token in `flameColors` + Tailwind config

**Files (15+ literal usages across 9 web files — `#5DDBB1` is the project-wide green "applied / success" color):**
- `apps/web/app/components/modals/RsvpPaymentModal.tsx` (Promo + Promoter "applied" blocks, and the new W4-C3 Access Code block — `bg-[#5DDBB1]/10`, `border-[#5DDBB1]/30`, `text-[#5DDBB1]`)
- `apps/web/app/components/StripePurchaseFlow.tsx`, `apps/web/app/components/EventDetail.tsx`, `apps/web/app/components/modals/ConfirmationModal.tsx`, `apps/web/app/rsvp/success/page.tsx`, `apps/web/app/purchase/success/page.tsx`, `apps/web/app/components/RsvpManagement.tsx`, `apps/web/app/components/modals/QRScannerModal.tsx`, `apps/web/app/components/organizer/OrganizerTeamView.tsx`
- Mobile equivalent: `apps/mobile/components/event-details/PreCheckoutCodes.tsx` + `CheckoutMainSheet.tsx` use the same `#5DDBB1` literal for the green "applied" states.

**Scope:** PR reviewer flagged the literal `#5DDBB1` in `RsvpPaymentModal.tsx`'s W4-C3 Access Code block and suggested `bg-success/10` etc. **There is no `success` token today** — the closest token is `accent: "#59B2FF"` (blue, semantically wrong). Add `success: "#5DDBB1"` to `flameColors` in `packages/lib/src/design-tokens/flame-colors.ts`, mirror as a Tailwind token in `packages/ui/tailwind.config.js`, then migrate all existing `text-[#5DDBB1]` / `bg-[#5DDBB1]/*` / `border-[#5DDBB1]/*` sites in one sweep.

**Why deferred:** Pure refactor — no functional change. The new W4-C3 Access Code block intentionally matches the adjacent Promo + Promoter "applied" blocks in the same file (identical `#5DDBB1` literals). Fixing only the new 3 lines would (a) break — the suggested token doesn't exist — or (b) make the file *less* consistent than leaving it. Same class of deferral as the warning-amber entry above; ideally both colors get tokenized in a single design-token sweep. Token name should align with the existing `text-error` / `text-primary` semantic naming convention.

---

## Type the paginated `orders` accumulator in `organizer/page.tsx` (Jun 2026, W0 review)

**File:** `apps/web/app/organizer/page.tsx` (~line 330) — `const all: any[] = []` in the paginated orders IIFE.

**Reviewer suggestion:** define a concrete `OrderRow` type matching the `.from("orders").select(...)` shape and type the accumulator + downstream consumers.

**Why deferred:** `page.tsx` is pervasively `any` — every downstream consumer immediately casts (`(order: any) =>`, `reduce((acc: Record<string, any[]>, order: any)`, etc.), and `calculateOrganizerBasePrice` takes a loose shape. Typing this one accumulator enforces nothing past the IIFE boundary while requiring a hand-written nested-select type (orders + joined `users`/`ticket_tiers`/`tickets[]`) that's easy to get subtly wrong and would then need casts anyway. The correct fix is a dedicated typing pass over `page.tsx` (or adopting generated Supabase row types) — out of scope for a Wave 0 quick-win PR. Do it as one sweep alongside the other `any` sites in this file.

## June 2026 PR Review — Stripe Connect country-aware onboarding (Jun 19, 2026)

### `POST /api/stripe/connect/onboard` — consolidate body validation into a Zod schema

**File:** `apps/web/app/api/stripe/connect/onboard/route.ts` (~lines 29–53).

**Reviewer suggestion:** replace the two manual checks (`!organizationId` 400, and the `country` type + `isSupportedConnectCountry` + uppercase block) with a single Zod schema (`organizationId: z.string()`, `country` optional + `.refine(isSupportedConnectCountry)` + `.transform(toUpperCase)`) parsed via `safeParse`.

**Why deferred:** The current manual validation is correct, minimal, and explicitly handles the three cases that matter — missing `organizationId`, absent/`null` country (treated as "not provided" for backward-compat with older clients), and uppercase normalization. Zod is the project convention at boundaries, so this is a reasonable future cleanup, but it's a style refactor with **no behavioral bug**: replicating the exact lenient null-handling (`country: null` → treated as absent, not a 400) and preserving the current error-message strings in a schema is fiddly and risks subtly changing responses. Bundle it with a broader "Zod-ify the Stripe routes" pass rather than touching one route in isolation.

### `ConnectCountrySelector` / `useStripeConnect` — type `country` as a shared country-code union instead of `string`

**Files:** `apps/mobile/components/settings/ConnectCountrySelector.tsx` (props `value`/`onChange`, ~lines 14–20); `apps/mobile/hooks/useStripeConnect.ts` (`handleConnect(country?: string)`, ~lines 54/63).

**Reviewer suggestion:** import a shared country-code type derived from `STRIPE_CONNECT_COUNTRIES` so only valid codes can be passed.

**Why deferred:** No such literal-union type exists today — `StripeConnectCountry.code` is declared `string`, and `STRIPE_CONNECT_COUNTRIES` is annotated `readonly StripeConnectCountry[]`, so `typeof STRIPE_CONNECT_COUNTRIES[number]["code"]` collapses to `string`, not a union. Producing a real union requires dropping the interface annotation in favour of `as const` inference (losing the explicit `StripeConnectCountry` shape check) or maintaining a parallel `ConnectCountryCode` union by hand. Both are non-trivial and there is no concrete bug: every value flows from the same constant (selector options, default, server-side `isSupportedConnectCountry` guard). If/when we add a shared `ConnectCountryCode` to `@project-flame/lib`, thread it through both files plus `selectedCountry` state on web + mobile in one pass.

---

**`AdminOrgRow` component size — web + mobile (W7-H1, Jun 22, 2026)**

**Files:** `apps/web/app/profile/SupportAdminSection.tsx`, `apps/mobile/components/profile/SupportAdminSection.tsx`

**Reviewer suggestion:** `AdminOrgRow` exceeds ~100 lines by combining the org header, the reject form, mutation/alert orchestration, action buttons, and error display; extract `OrgMeta` / `RejectEditor` / `RowActions` / `RowError` (web) and `AdminOrgHeader` / `AdminOrgRejectForm` / `AdminOrgActions` (mobile).

**Why deferred:** Single-use, cohesive component (one consumer each). Splitting into 3–4 sub-components purely for line count adds prop-threading and indirection without any reuse — premature abstraction. Revisit only if a second consumer appears or the row genuinely diverges between states.

---

**Structured error logs (userId + action) across admin routes (W7-H1, Jun 22, 2026)**

**Files:** `apps/web/app/api/admin/organizations/[id]/route.ts` (and the sibling `approve`/`reject`/`status` + `api/admin/organizations/route.ts`).

**Reviewer suggestion:** Include `userId` and an explicit `action` field (e.g. `"delete_organization"`) in the `console.error` payloads for incident triage/traceability.

**Why deferred:** Today every admin route (and the reference routes like `organizations/[id]/members/route.ts`) logs `[ROUTE-prefix] message, { orgId, error }` — the prefix already conveys the action and `orgId` identifies the resource; `userId` is logged nowhere in these routes. Adding it to a single flagged line would be inconsistent, and threading it through every admin log is a systemic logging-style decision, not part of this feature. Revisit as one focused observability pass across the admin (and ideally all API) routes — pick a structured shape (`{ userId, action, orgId, error }`) and apply uniformly.

---

**Extract cohost revenue/card derivation out of `organizer-admin.tsx` into a hook (W8-M1, Jul 1, 2026)**

**File:** `apps/mobile/app/organizer-admin.tsx` (`revenueMapForEvent`, `hasCohostCards`, `cohostStatsFailed`, `cohostStatsLoading`, `currentCardData`, `pastCardData` — the block added in JULY_2026_FIXES.md #8).

**Reviewer suggestion:** move the ownership checks, banner state, and card-mapping logic into a dedicated reusable hook/helper so the screen stays smaller and easier to test; leave the component responsible only for composing + rendering.

**Why deferred:** Pure structural refactor with no behavioral change. The derivation is single-use (only this screen renders the org dashboard cards) and reads several screen-local values (`effectiveOrgId`, `revenueMap`, `cohostRevenueMap`, `currentEvents`/`pastEvents`, `cohostCurrentEvents`/`cohostPastEvents`), so extracting it means threading all of those into a hook's args — indirection without reuse. Revisit if a second consumer of this cohost-card logic appears, or as part of a broader `organizer-admin.tsx` decomposition (the screen is large); at that point extract a `useOrgDashboardCards(...)` that returns `{ currentCardData, pastCardData, hasCohostCards, cohostStatsFailed, cohostStatsLoading }`.

---

**`any` casts in the SSR cohost enrichment block (W8-M1, Jul 1, 2026)**

**File:** `apps/web/app/organizer/page.tsx` ≈265–298 (`(entry.event as any).ticket_tiers`, `...(entry.event as any)` in the cohost `totalAttendees`/`totalRevenue` enrichment).

**Reviewer suggestion:** replace the `as any` casts with a small local interface for the event/tier fields used, so the block stays type-safe (no `any`).

**Why deferred:** The casts are **pre-existing** (the original `for` loop already had them; JULY_2026_FIXES.md #9 only converted the loop to `Promise.all` and preserved them). The entire `organizer/page.tsx` SSR file is pervasively `any` — the owned-event enrichment right below uses `.map((event: any) => …)`, `.reduce((acc, order: any) => …)`, `(tier: any)`, etc. Typing one small block in isolation would be inconsistent with the file and is a pure style change with zero behavioral impact. Revisit as one focused "type the organizer SSR page" pass (define shared `SsrOrgEvent`/`SsrTier`/`SsrOrder` shapes and apply uniformly to the owned + cohost enrichment), not a single-block island.
